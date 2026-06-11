const express = require('express');
const router = express.Router();
const { db, dbAll, dbGet, dbRun } = require('../db/connection');
const { logger } = require('../utils/logger');

// ==================== ENDPOINT API USERS (CASHIER CRUD) ====================

// Ambil daftar owner lengkap (Mendukung CRUD Owner)
router.get('/api/owners', async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM owners ORDER BY name ASC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Tambah owner baru (Hanya akses Admin)
router.post('/api/owners', async (req, res) => {
  const { name, description } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Nama owner wajib diisi' });
  }
  const cleanName = name.trim();
  if (cleanName === 'All' || cleanName === 'undefined' || cleanName === 'null') {
    return res.status(400).json({ error: 'Nama owner ini tidak diperbolehkan' });
  }

  try {
    // Cek apakah owner sudah ada
    const existing = await dbGet('SELECT * FROM owners WHERE name = ?', [cleanName]);
    if (existing) {
      return res.status(400).json({ error: 'Nama owner sudah terdaftar' });
    }

    const result = await dbRun('INSERT INTO owners (name, description) VALUES (?, ?)', [cleanName, description || '']);
    const newOwner = await dbGet('SELECT * FROM owners WHERE id = ?', [result.lastID]);
    res.status(201).json(newOwner);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Edit owner & lakukan cascading update (Hanya akses Admin)
router.put('/api/owners/:id', async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;
  if (!name || name.trim() === '') {
    return res.status(400).json({ error: 'Nama owner wajib diisi' });
  }
  const cleanName = name.trim();
  if (cleanName === 'All' || cleanName === 'undefined' || cleanName === 'null') {
    return res.status(400).json({ error: 'Nama owner ini tidak diperbolehkan' });
  }

  try {
    const oldOwner = await dbGet('SELECT * FROM owners WHERE id = ?', [id]);
    if (!oldOwner) {
      return res.status(404).json({ error: 'Owner tidak ditemukan' });
    }

    // Cek apakah nama baru bentrok dengan owner lain
    const duplicate = await dbGet('SELECT * FROM owners WHERE name = ? AND id != ?', [cleanName, id]);
    if (duplicate) {
      return res.status(400).json({ error: 'Nama owner sudah terdaftar' });
    }

    const oldName = oldOwner.name;

    // Jalankan database transaction untuk cascade update jika nama berubah
    db.serialize(async () => {
      try {
        await dbRun('BEGIN TRANSACTION');

        // Update data owner utama
        await dbRun('UPDATE owners SET name = ?, description = ? WHERE id = ?', [cleanName, description || '', id]);

        if (oldName !== cleanName) {
          // 1. Update di tabel products
          await dbRun('UPDATE products SET owner = ? WHERE owner = ?', [cleanName, oldName]);
          // 2. Update di tabel users
          await dbRun('UPDATE users SET owner = ? WHERE owner = ?', [cleanName, oldName]);
          // 3. Update di tabel transaction_items
          await dbRun('UPDATE transaction_items SET product_owner = ? WHERE product_owner = ?', [cleanName, oldName]);
          // 4. Update di tabel void_logs
          await dbRun('UPDATE void_logs SET owner = ? WHERE owner = ?', [cleanName, oldName]);
        }

        await dbRun('COMMIT');
        
        const updatedOwner = await dbGet('SELECT * FROM owners WHERE id = ?', [id]);
        res.json(updatedOwner);
      } catch (err) {
        await dbRun('ROLLBACK');
        res.status(500).json({ error: 'Gagal memperbarui data owner: ' + err.message });
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Hapus owner dengan validasi integrasi data (Hanya akses Admin)
router.delete('/api/owners/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const owner = await dbGet('SELECT * FROM owners WHERE id = ?', [id]);
    if (!owner) {
      return res.status(404).json({ error: 'Owner tidak ditemukan' });
    }

    const ownerName = owner.name;

    // Pengecekan keamanan: Jangan hapus jika ada produk terkait
    const productCount = await dbGet('SELECT COUNT(*) as count FROM products WHERE owner = ?', [ownerName]);
    if (productCount.count > 0) {
      return res.status(400).json({ 
        error: `Owner "${ownerName}" tidak dapat dihapus karena masih memiliki ${productCount.count} produk aktif.` 
      });
    }

    // Pengecekan keamanan: Jangan hapus jika ada akun kasir terkait
    const userCount = await dbGet('SELECT COUNT(*) as count FROM users WHERE owner = ?', [ownerName]);
    if (userCount.count > 0) {
      return res.status(400).json({ 
        error: `Owner "${ownerName}" tidak dapat dihapus karena masih memiliki ${userCount.count} akun kasir/admin owner.` 
      });
    }

    // Jalankan hapus jika lolos validasi
    await dbRun('DELETE FROM owners WHERE id = ?', [id]);
    res.json({ message: `Owner "${ownerName}" berhasil dihapus.` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
