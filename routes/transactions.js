const express = require('express');
const router = express.Router();
const { db, dbAll, dbGet, dbRun } = require('../db/connection');
const { getLocalTodayDate } = require('../utils/helpers');
const { getMikroTikConfig, queryMikroTik, extractUsernameFromCode, normalizeVoucherCode } = require('../utils/mikrotik');
const { logger } = require('../utils/logger');

// ==================== ENDPOINT API TRANSAKSI ====================

// Simpan transaksi baru (Atomic dengan Transaction Rollback)
router.post('/api/transactions', (req, res) => {
  const { cashier_name, payment_method, total_amount, discount, tax, payment_amount, change_amount, items, customer_name, customer_id, payment_details } = req.body;

  if (!cashier_name || !items || items.length === 0) {
    return res.status(400).json({ error: 'Data transaksi tidak lengkap' });
  }

  // Generate Invoice Number: TRX-YYYYMMDD-XXXX
  const todayStr = getLocalTodayDate().replace(/-/g, '');
  
  // Gunakan serialize untuk menjamin proses berjalan terurut dalam transaction
  db.serialize(async () => {
    try {
      // Mulai transaksi database
      await dbRun('BEGIN TRANSACTION');

      // Ambil nomor urut hari ini
      const dateWildcard = `TRX-${todayStr}-%`;
      const countRow = await dbGet(`SELECT COUNT(*) as count FROM transactions WHERE invoice_number LIKE ?`, [dateWildcard]);
      const nextSeq = String(countRow.count + 1).padStart(4, '0');
      const invoiceNumber = `TRX-${todayStr}-${nextSeq}`;

      // Insert ke tabel transactions
      const txSql = `
        INSERT INTO transactions (invoice_number, cashier_name, payment_method, total_amount, discount, tax, payment_amount, change_amount, customer_name, customer_id, payment_details)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const txResult = await dbRun(txSql, [
        invoiceNumber,
        cashier_name,
        payment_method || 'TUNAI',
        total_amount,
        discount || 0,
        tax || 0,
        payment_amount,
        change_amount,
        customer_name || null,
        customer_id || null,
        payment_details ? (typeof payment_details === 'string' ? payment_details : JSON.stringify(payment_details)) : null
      ]);
      const transactionId = txResult.lastID;

      // Loop keranjang belanja untuk kurangi stok & masukkan ke items
      const mtConfig = getMikroTikConfig();
      const voucherOwner = mtConfig.owner || 'Organisasi';

      for (const item of items) {
        const isVoucher = item.is_voucher || (typeof item.product_id === 'string' && item.product_id.startsWith('voucher-'));

        if (isVoucher) {
          // Virtual Voucher: bypass stock checks, use configured owner
          const itemSql = `
            INSERT INTO transaction_items (transaction_id, product_id, product_name, quantity, price_sell, subtotal, product_owner, discount)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `;
          await dbRun(itemSql, [
            transactionId,
            null,
            item.product_name,
            item.quantity,
            item.price_sell,
            item.subtotal,
            voucherOwner,
            item.discount || 0
          ]);
        } else {
          // Query data produk terlebih dahulu dari database
          const product = await dbGet('SELECT id, name, stock, owner, is_service FROM products WHERE id = ?', [item.product_id]);
          if (!product) {
            throw new Error(`Produk dengan ID ${item.product_id} tidak ditemukan`);
          }

          const isService = (product.is_service === 1) || item.is_service || false;
          const productOwner = product.owner || 'Organisasi';

          if (isService) {
            // Produk Jasa: tidak kurangi stok, langsung catat ke items
            const itemSql = `
              INSERT INTO transaction_items (transaction_id, product_id, product_name, quantity, price_sell, subtotal, product_owner, discount)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
            await dbRun(itemSql, [
              transactionId,
              item.product_id,
              item.product_name,
              item.quantity,
              item.price_sell,
              item.subtotal,
              productOwner,
              item.discount || 0
            ]);
          } else {
            // Barang Fisik: cek & kurangi stok
            // Cek kecukupan stok
            if (product.stock < item.quantity) {
              throw new Error(`Stok produk "${product.name}" tidak mencukupi. Sisa stok: ${product.stock}`);
            }

            // Kurangi stok
            await dbRun('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.product_id]);

            // Catat di transaction_items
            const itemSql = `
              INSERT INTO transaction_items (transaction_id, product_id, product_name, quantity, price_sell, subtotal, product_owner, discount)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
            await dbRun(itemSql, [
              transactionId,
              item.product_id,
              item.product_name,
              item.quantity,
              item.price_sell,
              item.subtotal,
              productOwner,
              item.discount || 0
            ]);
          }
        }
      }

      // Update kas laci jika pembayaran TUNAI atau bagian cash dari SPLIT
      let cashReceived = 0;
      if (payment_method === 'SPLIT' && payment_details) {
        let details = typeof payment_details === 'string' ? JSON.parse(payment_details) : payment_details;
        cashReceived = parseFloat(details.cash) || 0;
      } else if ((payment_method || 'TUNAI').toUpperCase() === 'TUNAI') {
        cashReceived = total_amount;
      }

      if (cashReceived > 0) {
        const activeSession = await dbGet("SELECT id FROM cash_sessions WHERE status = 'OPEN'");
        if (activeSession) {
          await dbRun(`
            UPDATE cash_sessions 
            SET expected_cash = expected_cash + ?, total_cash_sales = total_cash_sales + ?
            WHERE id = ?
          `, [cashReceived, cashReceived, activeSession.id]);
        }
      }

      // Commit jika semua sukses
      await dbRun('COMMIT');
      
      const savedTx = await dbGet('SELECT * FROM transactions WHERE id = ?', [transactionId]);

      // Update MikroTik comments in background for voucher items
      const voucherItems = items.filter(item => item.is_voucher || (item.category === 'Voucher Wifi') || (typeof item.product_id === 'string' && item.product_id.startsWith('voucher-')));
      if (global.isMikrotikEnabled && voucherItems.length > 0) {
        (async () => {
          try {
            await queryMikroTik(async (conn) => {
              const today = getLocalTodayDate();
              for (const item of voucherItems) {
                const code = item.barcode;
                if (code) {
                  const rawUsername = extractUsernameFromCode(code);
                  let users = await conn.menu('/ip hotspot user').where('name', rawUsername).get();
                  if (users.length === 0) {
                    const allUsers = await conn.menu('/ip hotspot user').get();
                    const foundCaseInsensitive = allUsers.find(u => u.name && typeof u.name === 'string' && u.name.toLowerCase() === rawUsername.toLowerCase());
                    if (foundCaseInsensitive) {
                      users = [foundCaseInsensitive];
                    } else {
                      const normalizedSearch = normalizeVoucherCode(rawUsername);
                      const foundNormalized = allUsers.find(u => u.name && typeof u.name === 'string' && normalizeVoucherCode(u.name) === normalizedSearch);
                      if (foundNormalized) {
                        users = [foundNormalized];
                      }
                    }
                  }
                  if (users.length > 0) {
                    await conn.model(users[0]).update({
                      comment: `TERJUAL - ${invoiceNumber} - ${today}`
                    });
                    console.log(`MikroTik: Berhasil memperbarui status TERJUAL untuk user ${users[0].name}`);
                  }
                }
              }
            });
          } catch (e) {
            console.error('Background MikroTik voucher update failed:', e.message);
          }
        })();
      }

      res.status(201).json({
        message: 'Transaksi berhasil disimpan',
        transaction: savedTx,
        invoice_number: invoiceNumber
      });

    } catch (error) {
      // Rollback jika ada yang error
      await dbRun('ROLLBACK');
      console.error('Transaksi dibatalkan:', error.message);
      res.status(400).json({ error: error.message });
    }
  });
});

// Ambil riwayat transaksi (mendukung filter tanggal, rentang tanggal, nama kasir, dan owner)
router.get('/api/transactions', async (req, res) => {
  try {
    const { date, cashier, startDate, endDate, owner } = req.query;
    console.log('[DEBUG] GET /api/transactions query:', { date, cashier, startDate, endDate, owner });
    const hasOwner = owner && owner !== 'All' && owner !== 'undefined' && owner !== 'null' && owner !== '';
    
    let sql;
    let params = [];
    let conditions = [];

    if (hasOwner) {
      sql = `
        SELECT t.id, t.invoice_number, t.cashier_name, t.payment_method, 
               t.discount, t.tax, t.payment_amount, t.change_amount, 
               t.customer_name, t.customer_id, t.payment_details, t.created_at,
               SUM(ti.subtotal) AS total_amount
        FROM transactions t
        INNER JOIN transaction_items ti ON t.id = ti.transaction_id
      `;
      conditions.push('ti.product_owner = ?');
      params.push(owner);
      
      if (date) {
        conditions.push("date(t.created_at, 'localtime') = ?");
        params.push(date);
      } else {
        if (startDate) {
          conditions.push("date(t.created_at, 'localtime') >= ?");
          params.push(startDate);
        }
        if (endDate) {
          conditions.push("date(t.created_at, 'localtime') <= ?");
          params.push(endDate);
        }
      }
      if (cashier) {
        conditions.push('t.cashier_name = ?');
        params.push(cashier);
      }
      
      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }
      sql += ' GROUP BY t.id ORDER BY t.created_at DESC LIMIT 100';
    } else {
      sql = 'SELECT * FROM transactions';
      if (date) {
        conditions.push("date(created_at, 'localtime') = ?");
        params.push(date);
      } else {
        if (startDate) {
          conditions.push("date(created_at, 'localtime') >= ?");
          params.push(startDate);
        }
        if (endDate) {
          conditions.push("date(created_at, 'localtime') <= ?");
          params.push(endDate);
        }
      }
      if (cashier) {
        conditions.push('cashier_name = ?');
        params.push(cashier);
      }
      
      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }
      sql += ' ORDER BY created_at DESC LIMIT 100';
    }

    const transactions = await dbAll(sql, params);
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ambil detail item dari suatu transaksi (Mendukung filter owner)
router.get('/api/transactions/:id', async (req, res) => {
  const { id } = req.params;
  const { owner } = req.query;
  const hasOwner = owner && owner !== 'All' && owner !== 'undefined' && owner !== 'null';
  try {
    const tx = await dbGet('SELECT * FROM transactions WHERE id = ?', [id]);
    if (!tx) {
      return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
    }
    let items;
    if (hasOwner) {
      items = await dbAll('SELECT * FROM transaction_items WHERE transaction_id = ? AND product_owner = ?', [id, owner]);
      // Adjust totals based only on the items belonging to this owner
      const totalSum = items.reduce((sum, item) => sum + item.subtotal, 0);
      tx.total_amount = totalSum;
      tx.discount = 0;
      tx.tax = 0;
      tx.payment_amount = totalSum;
      tx.change_amount = 0;
    } else {
      items = await dbAll('SELECT * FROM transaction_items WHERE transaction_id = ?', [id]);
    }
    res.json({ ...tx, items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
