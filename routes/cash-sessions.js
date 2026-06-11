const express = require('express');
const router = express.Router();
const { dbAll, dbGet, dbRun } = require('../db/connection');
const { logger } = require('../utils/logger');

// ==================== ENDPOINT API PETTY CASH & SHIFT KASIR ====================

// Ambil shift aktif (jika ada)
router.get('/api/cash-sessions/active', async (req, res) => {
  try {
    const session = await dbGet("SELECT * FROM cash_sessions WHERE status = 'OPEN'");
    if (session) {
      res.json(session);
    } else {
      res.json(null);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Buka shift baru
router.post('/api/cash-sessions/open', async (req, res) => {
  const { cashier_name, initial_cash } = req.body;

  if (!cashier_name || initial_cash === undefined) {
    return res.status(400).json({ error: 'Kasir dan nominal modal awal wajib diisi' });
  }

  try {
    // Pastikan tidak ada shift OPEN ganda
    const existing = await dbGet("SELECT id FROM cash_sessions WHERE status = 'OPEN'");
    if (existing) {
      return res.status(400).json({ error: 'Ada shift kasir yang masih terbuka. Silakan tutup shift tersebut terlebih dahulu.' });
    }

    const sql = `
      INSERT INTO cash_sessions (cashier_name, initial_cash, expected_cash, status)
      VALUES (?, ?, ?, 'OPEN')
    `;
    const result = await dbRun(sql, [cashier_name, initial_cash, initial_cash]);
    res.json({ id: result.lastID, message: 'Shift kasir berhasil dibuka' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Tutup shift kasir
router.post('/api/cash-sessions/close', async (req, res) => {
  const { actual_cash, notes } = req.body;

  if (actual_cash === undefined) {
    return res.status(400).json({ error: 'Jumlah uang fisik aktual wajib diisi' });
  }

  try {
    const session = await dbGet("SELECT * FROM cash_sessions WHERE status = 'OPEN'");
    if (!session) {
      return res.status(404).json({ error: 'Tidak ada shift aktif yang terbuka' });
    }

    const difference = actual_cash - session.expected_cash;
    const closedAt = new Date().toISOString();

    const sql = `
      UPDATE cash_sessions 
      SET closed_at = ?, actual_cash = ?, difference = ?, notes = ?, status = 'CLOSED'
      WHERE id = ?
    `;
    await dbRun(sql, [closedAt, actual_cash, difference, notes || '', session.id]);
    
    // Dapatkan data ter-update
    const closedSession = await dbGet("SELECT * FROM cash_sessions WHERE id = ?", [session.id]);
    res.json({ success: true, message: 'Shift kasir berhasil ditutup', session: closedSession });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ambil riwayat shift kasir
router.get('/api/cash-sessions', async (req, res) => {
  try {
    const rows = await dbAll("SELECT * FROM cash_sessions ORDER BY id DESC LIMIT 50");
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
