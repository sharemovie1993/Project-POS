const express = require('express');
const router = express.Router();
const { db, dbAll, dbGet, dbRun } = require('../db/connection');
const { queryMikroTik } = require('../utils/mikrotik');
const { logger } = require('../utils/logger');

// Pembatalan Transaksi (Void) dengan Log Audit
router.post('/api/transactions/:id/void', (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason || reason.trim() === '') {
    return res.status(400).json({ error: 'Alasan pembatalan (void reason) wajib diisi.' });
  }

  db.serialize(async () => {
    try {
      await dbRun('BEGIN TRANSACTION');

      // Ambil data transaksi
      const tx = await dbGet('SELECT * FROM transactions WHERE id = ?', [id]);
      if (!tx) {
        throw new Error('Transaksi tidak ditemukan');
      }

      // Ambil data items
      const items = await dbAll('SELECT * FROM transaction_items WHERE transaction_id = ?', [id]);

      // Catat ke void_logs (split per owner yang terlibat)
      const uniqueOwners = [...new Set(items.map(item => item.product_owner || 'Organisasi'))];
      for (const owner of uniqueOwners) {
        const ownerItems = items.filter(item => (item.product_owner || 'Organisasi') === owner);
        const itemsSummary = ownerItems.map(item => `${item.quantity}x ${item.product_name}`).join(', ');
        const ownerTotal = ownerItems.reduce((sum, item) => sum + item.subtotal, 0);

        const insertLogSql = `
          INSERT INTO void_logs (invoice_number, cashier_name, total_amount, items_summary, reason, owner)
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        await dbRun(insertLogSql, [
          tx.invoice_number,
          tx.cashier_name,
          ownerTotal,
          itemsSummary,
          reason.trim(),
          owner
        ]);
      }

      // Kembalikan stok HANYA untuk barang fisik (bukan jasa/voucher)
      for (const item of items) {
        if (item.product_id) {
          const product = await dbGet('SELECT id, is_service FROM products WHERE id = ?', [item.product_id]);
          // Hanya kembalikan stok jika produk ada dan bukan jasa
          if (product && !product.is_service) {
            await dbRun('UPDATE products SET stock = stock + ? WHERE id = ?', [item.quantity, item.product_id]);
          }
        }
      }

      // Hapus transaksi (cascade akan menghapus transaction_items secara otomatis)
      await dbRun('DELETE FROM transactions WHERE id = ?', [id]);

      // Kurangi kas laci jika transaksi TUNAI di-void
      if ((tx.payment_method || 'TUNAI').toUpperCase() === 'TUNAI') {
        const activeSession = await dbGet("SELECT id FROM cash_sessions WHERE status = 'OPEN'");
        if (activeSession) {
          await dbRun(`
            UPDATE cash_sessions 
            SET expected_cash = expected_cash - ?, total_cash_sales = total_cash_sales - ?
            WHERE id = ?
          `, [tx.total_amount, tx.total_amount, activeSession.id]);
        }
      }

      await dbRun('COMMIT');

      // Update MikroTik: Cari voucher yang terjual pada invoice ini, kembalikan statusnya (comment dikosongkan)
      const invoiceNumber = tx.invoice_number;
      if (global.isMikrotikEnabled) {
        (async () => {
          try {
            await queryMikroTik(async (conn) => {
              const allUsers = await conn.menu('/ip hotspot user').get();
              const matchingUsers = allUsers.filter(u => u.comment && u.comment.includes(invoiceNumber));
              for (const user of matchingUsers) {
                await conn.model(user).update({
                  comment: ''
                });
                console.log(`MikroTik: Berhasil mengosongkan status voucher ${user.name} karena transaksi ${invoiceNumber} di-void`);
              }
            });
          } catch (e) {
            console.error('Gagal mereset status voucher MikroTik di latar belakang:', e.message);
          }
        })();
      }

      res.json({ message: 'Transaksi berhasil dibatalkan dan stok dikembalikan.' });

    } catch (error) {
      await dbRun('ROLLBACK');
      console.error('Void transaksi dibatalkan:', error.message);
      res.status(400).json({ error: error.message });
    }
  });
});

// Ambil riwayat log audit void (pembatalan)
router.get('/api/void-logs', async (req, res) => {
  try {
    const { owner } = req.query;
    let sql = 'SELECT * FROM void_logs';
    let params = [];
    
    if (owner && owner !== 'All' && owner !== 'undefined' && owner !== 'null') {
      sql += ' WHERE owner = ?';
      params.push(owner);
    }
    
    sql += ' ORDER BY void_at DESC LIMIT 100';
    const logs = await dbAll(sql, params);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
