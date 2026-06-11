const express = require('express');
const router = express.Router();
const { dbAll, dbGet, dbRun } = require('../db/connection');
const { hashPassword } = require('../utils/helpers');
const { logger } = require('../utils/logger');

// Ambil daftar kasir (Hanya akses Admin)
router.get('/api/users', async (req, res) => {
  try {
    const users = await dbAll('SELECT id, username, name, role, owner, created_at FROM users ORDER BY role ASC, name ASC');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Tambah kasir baru (Hanya akses Admin)
router.post('/api/users', async (req, res) => {
  const { username, name, password, role, owner } = req.body;
  if (!username || !name || !password || !role) {
    return res.status(400).json({ error: 'Semua field wajib diisi' });
  }

  try {
    const existing = await dbGet('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) {
      return res.status(400).json({ error: 'Username sudah terdaftar' });
    }

    const hashedPassword = hashPassword(password);
    const result = await dbRun('INSERT INTO users (username, name, password, role, owner) VALUES (?, ?, ?, ?, ?)', [
      username,
      name,
      hashedPassword,
      role,
      owner || null
    ]);
    const newUser = await dbGet('SELECT id, username, name, role, owner, created_at FROM users WHERE id = ?', [result.lastID]);
    res.status(201).json(newUser);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update data kasir (Hanya akses Admin)
router.put('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const { username, name, password, role, owner } = req.body;
  if (!username || !name || !role) {
    return res.status(400).json({ error: 'Username, Nama, dan Role wajib diisi' });
  }

  try {
    // Cek duplikasi username
    const existing = await dbGet('SELECT id FROM users WHERE username = ? AND id != ?', [username, id]);
    if (existing) {
      return res.status(400).json({ error: 'Username sudah digunakan oleh akun lain' });
    }

    let sql = 'UPDATE users SET username = ?, name = ?, role = ?, owner = ?';
    let params = [username, name, role, owner || null];

    // Ganti password jika dikirim dan tidak kosong
    if (password && password.trim() !== '') {
      sql += ', password = ?';
      params.push(hashPassword(password));
    }

    sql += ' WHERE id = ?';
    params.push(id);

    await dbRun(sql, params);
    const updatedUser = await dbGet('SELECT id, username, name, role, owner, created_at FROM users WHERE id = ?', [id]);
    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Hapus akun kasir (Hanya akses Admin)
router.delete('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // Cegah admin utama dihapus
    const user = await dbGet('SELECT username FROM users WHERE id = ?', [id]);
    if (user && user.username === 'admin') {
      return res.status(400).json({ error: 'Akun admin utama tidak dapat dihapus' });
    }

    await dbRun('DELETE FROM users WHERE id = ?', [id]);
    res.json({ message: 'Akun kasir berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
