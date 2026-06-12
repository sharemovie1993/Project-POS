const express = require('express');
const router = express.Router();
const { dbAll, dbRun, dbGet } = require('../db/connection');
const { logger } = require('../utils/logger');

// ==================== ENDPOINT API CUSTOMERS (MEMBER) ====================

// 1. Ambil semua pelanggan/member
router.get('/api/customers', async (req, res) => {
  try {
    const customers = await dbAll('SELECT * FROM customers ORDER BY name ASC');
    res.json(customers);
  } catch (error) {
    logger.error('Gagal mengambil data pelanggan:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 2. Daftarkan pelanggan/member baru
router.post('/api/customers', async (req, res) => {
  const { name, phone, discount_percent } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Nama pelanggan wajib diisi' });
  }

  try {
    const existing = await dbGet('SELECT id FROM customers WHERE name = ?', [name]);
    if (existing) {
      return res.status(400).json({ error: 'Nama pelanggan sudah terdaftar' });
    }

    const discount = parseFloat(discount_percent) || 0;
    const result = await dbRun(
      'INSERT INTO customers (name, phone, discount_percent) VALUES (?, ?, ?)',
      [name, phone || null, discount]
    );

    const newCustomer = await dbGet('SELECT * FROM customers WHERE id = ?', [result.lastID]);
    res.status(201).json({
      message: 'Pelanggan berhasil ditambahkan',
      customer: newCustomer
    });
  } catch (error) {
    logger.error('Gagal menambahkan pelanggan:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// 3. Hapus pelanggan/member
router.delete('/api/customers/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await dbGet('SELECT id FROM customers WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Pelanggan tidak ditemukan' });
    }

    await dbRun('DELETE FROM customers WHERE id = ?', [id]);
    res.json({ message: 'Pelanggan berhasil dihapus' });
  } catch (error) {
    logger.error('Gagal menghapus pelanggan:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
