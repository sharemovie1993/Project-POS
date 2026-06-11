const express = require('express');
const router = express.Router();
const { dbAll, dbGet, dbRun } = require('../db/connection');
const { logger } = require('../utils/logger');

// ==================== ENDPOINT API KATEGORI (CRUD) ====================

// Ambil semua kategori
router.get('/api/categories', async (req, res) => {
  try {
    const categories = await dbAll('SELECT * FROM categories ORDER BY name ASC');
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Tambah kategori baru
router.post('/api/categories', async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nama kategori wajib diisi' });
  }
  try {
    const existing = await dbGet('SELECT id FROM categories WHERE name = ?', [name.trim()]);
    if (existing) {
      return res.status(400).json({ error: 'Nama kategori sudah ada' });
    }
    const result = await dbRun('INSERT INTO categories (name) VALUES (?)', [name.trim()]);
    const newCat = await dbGet('SELECT * FROM categories WHERE id = ?', [result.lastID]);
    res.status(201).json(newCat);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update kategori
router.put('/api/categories/:id', async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nama kategori wajib diisi' });
  }
  try {
    // Cek duplikasi nama
    const existing = await dbGet('SELECT id FROM categories WHERE name = ? AND id != ?', [name.trim(), id]);
    if (existing) {
      return res.status(400).json({ error: 'Nama kategori sudah digunakan' });
    }
    // Update nama kategori di tabel products juga agar sinkron
    const oldCat = await dbGet('SELECT name FROM categories WHERE id = ?', [id]);
    if (oldCat) {
      await dbRun('UPDATE products SET category = ? WHERE category = ?', [name.trim(), oldCat.name]);
    }
    await dbRun('UPDATE categories SET name = ? WHERE id = ?', [name.trim(), id]);
    const updated = await dbGet('SELECT * FROM categories WHERE id = ?', [id]);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Hapus kategori
router.delete('/api/categories/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const cat = await dbGet('SELECT * FROM categories WHERE id = ?', [id]);
    if (!cat) {
      return res.status(404).json({ error: 'Kategori tidak ditemukan' });
    }
    // Cek apakah kategori ini masih digunakan oleh produk
    const usedBy = await dbGet('SELECT COUNT(*) as count FROM products WHERE category = ?', [cat.name]);
    if (usedBy.count > 0) {
      return res.status(400).json({ error: `Kategori "${cat.name}" tidak dapat dihapus karena masih digunakan oleh ${usedBy.count} produk` });
    }
    await dbRun('DELETE FROM categories WHERE id = ?', [id]);
    res.json({ message: `Kategori "${cat.name}" berhasil dihapus` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
