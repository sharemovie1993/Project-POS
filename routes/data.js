const express = require('express');
const router = express.Router();
const { db, dbAll, dbRun } = require('../db/connection');
const { hashPassword } = require('../utils/helpers');
const { logger } = require('../utils/logger');

// ==================== ENDPOINT BACKUP & RESTORE (JSON) ====================

// Ekspor seluruh data
router.get('/api/data/export', async (req, res) => {
  try {
    const products = await dbAll('SELECT * FROM products');
    const transactions = await dbAll('SELECT * FROM transactions');
    const transactionItems = await dbAll('SELECT * FROM transaction_items');
    const stockEntries = await dbAll('SELECT * FROM stock_entries');
    const stockOpnames = await dbAll('SELECT * FROM stock_opnames');
    const stockOpnameItems = await dbAll('SELECT * FROM stock_opname_items');
    const voidLogs = await dbAll('SELECT * FROM void_logs');
    const categories = await dbAll('SELECT * FROM categories');
    const expenses = await dbAll('SELECT * FROM expenses');
    const cashSessions = await dbAll('SELECT * FROM cash_sessions');

    res.json({
      exported_at: new Date().toISOString(),
      products,
      transactions,
      transaction_items: transactionItems,
      stock_entries: stockEntries,
      stock_opnames: stockOpnames,
      stock_opname_items: stockOpnameItems,
      void_logs: voidLogs,
      categories,
      expenses,
      cash_sessions: cashSessions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Impor data
router.post('/api/data/import', (req, res) => {
  const { 
    products, 
    transactions, 
    transaction_items, 
    stock_entries, 
    stock_opnames, 
    stock_opname_items, 
    void_logs, 
    categories,
    expenses,
    cash_sessions
  } = req.body;

  if (!products || !transactions || !transaction_items) {
    return res.status(400).json({ error: 'Format data impor salah. Wajib mencakup products, transactions, dan transaction_items' });
  }

  db.serialize(async () => {
    try {
      await dbRun('BEGIN TRANSACTION');

      // Hapus tabel lama
      await dbRun('DELETE FROM transaction_items');
      await dbRun('DELETE FROM transactions');
      await dbRun('DELETE FROM products');
      await dbRun('DELETE FROM stock_entries');
      await dbRun('DELETE FROM stock_opname_items');
      await dbRun('DELETE FROM stock_opnames');
      await dbRun('DELETE FROM void_logs');
      await dbRun('DELETE FROM categories');
      await dbRun('DELETE FROM expenses');
      await dbRun('DELETE FROM cash_sessions');

      // Masukkan produk (mendukung is_service dan owner)
      if (products.length > 0) {
        const prodStmt = db.prepare(`
          INSERT INTO products (id, barcode, name, price_buy, price_sell, stock, category, is_service, owner, created_at) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        products.forEach((p) => {
          prodStmt.run(p.id, p.barcode, p.name, p.price_buy, p.price_sell, p.stock, p.category, p.is_service !== undefined ? p.is_service : 0, p.owner || 'Organisasi', p.created_at);
        });
        prodStmt.finalize();
      }

      // Masukkan transaksi
      if (transactions.length > 0) {
        const txStmt = db.prepare('INSERT INTO transactions (id, invoice_number, cashier_name, payment_method, total_amount, discount, tax, payment_amount, change_amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        transactions.forEach((t) => {
          txStmt.run(t.id, t.invoice_number, t.cashier_name, t.payment_method, t.total_amount, t.discount || 0, t.tax || 0, t.payment_amount, t.change_amount, t.created_at);
        });
        txStmt.finalize();
      }

      // Masukkan item transaksi (mendukung product_owner dan discount)
      if (transaction_items.length > 0) {
        const itemStmt = db.prepare(`
          INSERT INTO transaction_items (id, transaction_id, product_id, product_name, quantity, price_sell, subtotal, product_owner, discount) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        transaction_items.forEach((item) => {
          itemStmt.run(item.id, item.transaction_id, item.product_id, item.product_name, item.quantity, item.price_sell, item.subtotal, item.product_owner || 'Organisasi', item.discount || 0);
        });
        itemStmt.finalize();
      }

      // Masukkan stock entries (jika ada di berkas ekspor)
      if (stock_entries && stock_entries.length > 0) {
        const entryStmt = db.prepare('INSERT INTO stock_entries (id, product_id, product_name, barcode, quantity, supplier, notes, entry_date, recorded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        stock_entries.forEach((e) => {
          entryStmt.run(e.id, e.product_id, e.product_name, e.barcode, e.quantity, e.supplier, e.notes, e.entry_date, e.recorded_by, e.created_at);
        });
        entryStmt.finalize();
      }

      // Masukkan stock opnames (jika ada)
      if (stock_opnames && stock_opnames.length > 0) {
        const opnameStmt = db.prepare('INSERT INTO stock_opnames (id, opname_number, recorded_by, created_at) VALUES (?, ?, ?, ?)');
        stock_opnames.forEach((o) => {
          opnameStmt.run(o.id, o.opname_number, o.recorded_by, o.created_at);
        });
        opnameStmt.finalize();
      }

      // Masukkan stock opname items (jika ada)
      if (stock_opname_items && stock_opname_items.length > 0) {
        const opnameItemStmt = db.prepare('INSERT INTO stock_opname_items (id, opname_id, product_id, product_name, barcode, system_stock, physical_stock, difference) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        stock_opname_items.forEach((item) => {
          opnameItemStmt.run(item.id, item.opname_id, item.product_id, item.product_name, item.barcode, item.system_stock, item.physical_stock, item.difference);
        });
        opnameItemStmt.finalize();
      }

      // Masukkan void logs (mendukung owner)
      if (void_logs && void_logs.length > 0) {
        const voidStmt = db.prepare('INSERT INTO void_logs (id, invoice_number, cashier_name, total_amount, items_summary, reason, owner, void_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        void_logs.forEach((vl) => {
          voidStmt.run(vl.id, vl.invoice_number, vl.cashier_name, vl.total_amount, vl.items_summary, vl.reason, vl.owner || 'Organisasi', vl.void_at);
        });
        voidStmt.finalize();
      }

      // Masukkan categories (jika ada)
      if (categories && categories.length > 0) {
        const catStmt = db.prepare('INSERT OR IGNORE INTO categories (id, name, created_at) VALUES (?, ?, ?)');
        categories.forEach((c) => {
          catStmt.run(c.id, c.name, c.created_at);
        });
        catStmt.finalize();
      }

      // Masukkan expenses (jika ada)
      if (expenses && expenses.length > 0) {
        const expStmt = db.prepare('INSERT INTO expenses (id, description, amount, category, expense_date, owner, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
        expenses.forEach((e) => {
          expStmt.run(e.id, e.description, e.amount, e.category, e.expense_date, e.owner || 'Organisasi', e.created_at);
        });
        expStmt.finalize();
      }

      // Masukkan cash sessions (jika ada)
      if (cash_sessions && cash_sessions.length > 0) {
        const sessStmt = db.prepare('INSERT INTO cash_sessions (id, cashier_name, opened_at, closed_at, initial_cash, expected_cash, actual_cash, difference, total_cash_sales, total_cash_expenses, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        cash_sessions.forEach((s) => {
          sessStmt.run(s.id, s.cashier_name, s.opened_at, s.closed_at, s.initial_cash, s.expected_cash, s.actual_cash, s.difference, s.total_cash_sales, s.total_cash_expenses, s.notes, s.status);
        });
        sessStmt.finalize();
      }

      await dbRun('COMMIT');
      res.json({ message: 'Data berhasil diimpor. Database kasir dipulihkan.' });
    } catch (error) {
      await dbRun('ROLLBACK');
      res.status(500).json({ error: error.message });
    }
  });
});

// Kosongkan database (seluruh data atau riwayat transaksi saja)
router.post('/api/data/clear', (req, res) => {
  const { mode } = req.body;

  if (mode !== 'all' && mode !== 'transactions') {
    return res.status(400).json({ error: 'Mode pengosongan tidak valid' });
  }

  db.serialize(async () => {
    try {
      await dbRun('BEGIN TRANSACTION');

      if (mode === 'all') {
        await dbRun('DELETE FROM transaction_items');
        await dbRun('DELETE FROM transactions');
        await dbRun('DELETE FROM products');
        await dbRun('DELETE FROM stock_entries');
        await dbRun('DELETE FROM stock_opname_items');
        await dbRun('DELETE FROM stock_opnames');
        await dbRun('DELETE FROM void_logs');
        await dbRun('DELETE FROM categories');
      } else {
        await dbRun('DELETE FROM transaction_items');
        await dbRun('DELETE FROM transactions');
      }

      await dbRun('COMMIT');
      res.json({ message: mode === 'all' ? 'Database kasir berhasil dikosongkan total' : 'Riwayat penjualan kasir berhasil dibersihkan' });
    } catch (error) {
      await dbRun('ROLLBACK');
      res.status(500).json({ error: error.message });
    }
  });
});

module.exports = router;
