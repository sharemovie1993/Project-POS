const express = require('express');
const router = express.Router();
const { db, dbAll, dbGet, dbRun } = require('../db/connection');
const { getLocalTodayDate } = require('../utils/helpers');
const { logger } = require('../utils/logger');

// ==================== ENDPOINT API BARANG MASUK (STOCK IN/RESTOCK) ====================

// Ambil semua riwayat barang masuk (Restok) (Mendukung filter owner)
router.get('/api/stock/entries', async (req, res) => {
  try {
    const { owner } = req.query;
    let sql = 'SELECT se.* FROM stock_entries se';
    let params = [];
    
    if (owner && owner !== 'All' && owner !== 'undefined' && owner !== 'null') {
      sql += ' JOIN products p ON se.product_id = p.id WHERE p.owner = ?';
      params.push(owner);
    }
    
    sql += ' ORDER BY se.entry_date DESC, se.id DESC';
    const entries = await dbAll(sql, params);
    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Catat barang masuk baru dan update stok produk (Atomic)
router.post('/api/stock/entries', (req, res) => {
  const { product_id, quantity, supplier, notes, entry_date, recorded_by } = req.body;

  if (!product_id || !quantity || quantity <= 0 || !entry_date || !recorded_by) {
    return res.status(400).json({ error: 'Data barang masuk tidak lengkap atau kuantitas tidak valid' });
  }

  db.serialize(async () => {
    try {
      await dbRun('BEGIN TRANSACTION');

      // Ambil info produk eksisting
      const product = await dbGet('SELECT name, barcode FROM products WHERE id = ?', [product_id]);
      if (!product) {
        throw new Error('Produk tidak ditemukan');
      }

      // Insert ke stock_entries
      const sqlInsert = `
        INSERT INTO stock_entries (product_id, product_name, barcode, quantity, supplier, notes, entry_date, recorded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await dbRun(sqlInsert, [
        product_id,
        product.name,
        product.barcode || null,
        parseInt(quantity),
        supplier || '',
        notes || '',
        entry_date,
        recorded_by
      ]);

      // Update stok produk
      await dbRun('UPDATE products SET stock = stock + ? WHERE id = ?', [parseInt(quantity), product_id]);

      await dbRun('COMMIT');
      res.status(201).json({ message: 'Stok barang berhasil ditambahkan dan dicatat' });
    } catch (error) {
      await dbRun('ROLLBACK');
      res.status(400).json({ error: error.message });
    }
  });
});

// ==================== ENDPOINT API AUDIT STOCK OPNAME ====================

// Ambil semua riwayat stock opname (audit) (Mendukung filter owner)
router.get('/api/stock/opnames', async (req, res) => {
  try {
    const { owner } = req.query;
    let sql = 'SELECT * FROM stock_opnames';
    let params = [];
    
    if (owner && owner !== 'All' && owner !== 'undefined' && owner !== 'null') {
      sql = `
        SELECT DISTINCT so.* FROM stock_opnames so
        JOIN stock_opname_items soi ON soi.opname_id = so.id
        JOIN products p ON soi.product_id = p.id
        WHERE p.owner = ?
      `;
      params.push(owner);
    }
    
    sql += ' ORDER BY created_at DESC';
    const opnames = await dbAll(sql, params);
    res.json(opnames);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ambil rincian detail item dari suatu sesi stock opname (Mendukung filter owner)
router.get('/api/stock/opnames/:id', async (req, res) => {
  const { id } = req.params;
  const { owner } = req.query;
  try {
    const opname = await dbGet('SELECT * FROM stock_opnames WHERE id = ?', [id]);
    if (!opname) {
      return res.status(404).json({ error: 'Data stock opname tidak ditemukan' });
    }
    
    let sql = 'SELECT soi.* FROM stock_opname_items soi';
    let params = [id];
    
    if (owner && owner !== 'All' && owner !== 'undefined' && owner !== 'null') {
      sql += ' JOIN products p ON soi.product_id = p.id WHERE soi.opname_id = ? AND p.owner = ?';
      params.push(owner);
    } else {
      sql += ' WHERE soi.opname_id = ?';
    }
    
    const items = await dbAll(sql, params);
    res.json({ ...opname, items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Simpan hasil audit stock opname baru dan sesuaikan stok produk (Atomic)
router.post('/api/stock/opnames', (req, res) => {
  const { recorded_by, items } = req.body;

  if (!recorded_by || !items || items.length === 0) {
    return res.status(400).json({ error: 'Data stock opname tidak lengkap atau kosong' });
  }

  const todayStr = getLocalTodayDate().replace(/-/g, '');

  db.serialize(async () => {
    try {
      await dbRun('BEGIN TRANSACTION');

      // Generate nomor opname OP-YYYYMMDD-XXXX
      const dateWildcard = `OP-${todayStr}-%`;
      const countRow = await dbGet('SELECT COUNT(*) as count FROM stock_opnames WHERE opname_number LIKE ?', [dateWildcard]);
      const nextSeq = String(countRow.count + 1).padStart(4, '0');
      const opnameNumber = `OP-${todayStr}-${nextSeq}`;

      // Insert ke stock_opnames
      const opnameSql = 'INSERT INTO stock_opnames (opname_number, recorded_by) VALUES (?, ?)';
      const opnameResult = await dbRun(opnameSql, [opnameNumber, recorded_by]);
      const opnameId = opnameResult.lastID;

      // Loop items untuk disesuaikan stoknya & disimpan detail auditnya
      for (const item of items) {
        // Ambil stok sistem saat ini untuk audit log
        const product = await dbGet('SELECT stock, name, barcode FROM products WHERE id = ?', [item.product_id]);
        if (!product) {
          throw new Error(`Produk dengan ID ${item.product_id} tidak ditemukan`);
        }

        const systemStock = product.stock;
        const physicalStock = parseInt(item.physical_stock);
        const difference = physicalStock - systemStock;

        // Catat di stock_opname_items
        const itemSql = `
          INSERT INTO stock_opname_items (opname_id, product_id, product_name, barcode, system_stock, physical_stock, difference)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        await dbRun(itemSql, [
          opnameId,
          item.product_id,
          product.name,
          product.barcode || null,
          systemStock,
          physicalStock,
          difference
        ]);

        // Perbarui stok produk agar bernilai persis sama dengan stok fisik
        await dbRun('UPDATE products SET stock = ? WHERE id = ?', [physicalStock, item.product_id]);
      }

      await dbRun('COMMIT');
      res.status(201).json({
        message: 'Hasil stock opname berhasil disimpan dan stok produk telah disesuaikan',
        opname_number: opnameNumber
      });
    } catch (error) {
      await dbRun('ROLLBACK');
      console.error('Stock opname dibatalkan:', error.message);
      res.status(400).json({ error: error.message });
    }
  });
});

module.exports = router;
