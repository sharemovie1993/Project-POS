const express = require('express');
const router = express.Router();
const { dbAll, dbGet, dbRun } = require('../db/connection');
const { logger } = require('../utils/logger');

// ==================== ENDPOINT API PRODUK (CRUD) ====================

// Ambil semua produk atau cari berdasarkan barcode/nama (Mendukung filter owner)
router.get('/api/products', async (req, res) => {
  try {
    const { search, barcode, owner } = req.query;
    let sql = 'SELECT * FROM products';
    let params = [];
    let conditions = [];

    if (barcode) {
      conditions.push('barcode = ?');
      params.push(barcode);
    } else if (search) {
      conditions.push('(name LIKE ? OR barcode LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    if (owner && owner !== 'All' && owner !== 'undefined' && owner !== 'null') {
      conditions.push('owner = ?');
      params.push(owner);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY name ASC';
    const products = await dbAll(sql, params);
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Tambah produk baru (Menyimpan owner)
router.post('/api/products', async (req, res) => {
  const { barcode, name, price_buy, price_sell, stock, category, is_service, owner } = req.body;
  if (!name || price_sell === undefined) {
    return res.status(400).json({ error: 'Nama dan Harga Jual wajib diisi' });
  }

  try {
    // Cek duplikasi barcode jika diisi
    if (barcode) {
      const existing = await dbGet('SELECT id FROM products WHERE barcode = ?', [barcode]);
      if (existing) {
        return res.status(400).json({ error: 'Kode Barcode sudah digunakan oleh produk lain' });
      }
    }

    const isService = is_service ? 1 : 0;
    const stockVal = isService ? 0 : (stock || 0); // Jasa tidak perlu stok
    const productOwner = owner || 'Organisasi';
    const sql = `INSERT INTO products (barcode, name, price_buy, price_sell, stock, category, is_service, owner) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    const result = await dbRun(sql, [barcode || null, name, price_buy || 0, price_sell, stockVal, category || '', isService, productOwner]);
    
    const newProduct = await dbGet('SELECT * FROM products WHERE id = ?', [result.lastID]);
    res.status(201).json(newProduct);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update data produk (Menyimpan owner)
router.put('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  const { barcode, name, price_buy, price_sell, stock, category, is_service, owner } = req.body;

  if (!name || price_sell === undefined) {
    return res.status(400).json({ error: 'Nama dan Harga Jual wajib diisi' });
  }

  try {
    // Cek duplikasi barcode
    if (barcode) {
      const existing = await dbGet('SELECT id FROM products WHERE barcode = ? AND id != ?', [barcode, id]);
      if (existing) {
        return res.status(400).json({ error: 'Kode Barcode sudah digunakan oleh produk lain' });
      }
    }

    const isService = is_service ? 1 : 0;
    const stockVal = isService ? 0 : (stock || 0);
    const productOwner = owner || 'Organisasi';
    const sql = `UPDATE products SET barcode = ?, name = ?, price_buy = ?, price_sell = ?, stock = ?, category = ?, is_service = ?, owner = ? WHERE id = ?`;
    await dbRun(sql, [barcode || null, name, price_buy || 0, price_sell, stockVal, category || '', isService, productOwner, id]);
    
    const updated = await dbGet('SELECT * FROM products WHERE id = ?', [id]);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Hapus produk (Validasi kepemilikan owner)
router.delete('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  const { owner } = req.query;
  try {
    if (owner && owner !== 'All' && owner !== 'undefined' && owner !== 'null') {
      const product = await dbGet('SELECT owner FROM products WHERE id = ?', [id]);
      if (product && product.owner !== owner) {
        return res.status(403).json({ error: 'Anda tidak berhak menghapus produk milik owner lain' });
      }
    }
    await dbRun('DELETE FROM products WHERE id = ?', [id]);
    res.json({ message: 'Produk berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
