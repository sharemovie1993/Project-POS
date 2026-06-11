const express = require('express');
const router = express.Router();
const { dbGet } = require('../db/connection');
const { hashPassword } = require('../utils/helpers');

// ==================== ENDPOINT API AUTHENTICATION & LOGIN ====================

// Login Endpoint
router.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan Password wajib diisi' });
  }

  try {
    const hashedPassword = hashPassword(password);
    const user = await dbGet('SELECT id, username, name, role, owner FROM users WHERE username = ? AND password = ?', [username, hashedPassword]);
    if (user) {
      res.json({ message: 'Login berhasil', user });
    } else {
      res.status(401).json({ error: 'Username atau Password salah' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
