const express = require('express');
const router = express.Router();
const { dbAll, dbGet, dbRun } = require('../db/connection');
const { logger } = require('../utils/logger');

// ==================== ENDPOINT API BEBAN & PENGELUARAN ====================

// Ambil list pengeluaran berdasarkan filter tanggal dan owner
router.get('/api/expenses', async (req, res) => {
  const { startDate, endDate, owner } = req.query;
  const hasOwner = owner && owner !== 'All' && owner !== 'undefined' && owner !== 'null';

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Parameter startDate dan endDate wajib disertakan (Format: YYYY-MM-DD)' });
  }

  try {
    let rows;
    if (hasOwner) {
      rows = await dbAll(`
        SELECT * FROM expenses 
        WHERE expense_date BETWEEN ? AND ? AND owner = ?
        ORDER BY expense_date DESC, id DESC
      `, [startDate, endDate, owner]);
    } else {
      rows = await dbAll(`
        SELECT * FROM expenses 
        WHERE expense_date BETWEEN ? AND ? 
        ORDER BY expense_date DESC, id DESC
      `, [startDate, endDate]);
    }
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Simpan pengeluaran baru
router.post('/api/expenses', async (req, res) => {
  const { description, amount, category, expense_date, owner } = req.body;

  if (!description || !amount || !category || !expense_date) {
    return res.status(400).json({ error: 'Data pengeluaran tidak lengkap' });
  }

  try {
    const sql = `
      INSERT INTO expenses (description, amount, category, expense_date, owner)
      VALUES (?, ?, ?, ?, ?)
    `;
    const result = await dbRun(sql, [
      description,
      amount,
      category,
      expense_date,
      owner || 'Organisasi'
    ]);
    
    // Jika ada shift laci kasir aktif dan pengeluaran dibayarkan dengan kas tunai,
    // kita kurangi expected_cash dan tambah total_cash_expenses di active session secara otomatis.
    const activeSession = await dbGet("SELECT id FROM cash_sessions WHERE status = 'OPEN'");
    if (activeSession) {
      await dbRun(`
        UPDATE cash_sessions 
        SET expected_cash = expected_cash - ?, total_cash_expenses = total_cash_expenses + ?
        WHERE id = ?
      `, [amount, amount, activeSession.id]);
    }

    res.json({ id: result.lastID, message: 'Pengeluaran berhasil disimpan' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Hapus pengeluaran
router.delete('/api/expenses/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // Kembalikan kas laci jika pengeluaran dihapus
    const expense = await dbGet("SELECT amount FROM expenses WHERE id = ?", [id]);
    if (expense) {
      const activeSession = await dbGet("SELECT id FROM cash_sessions WHERE status = 'OPEN'");
      if (activeSession) {
        await dbRun(`
          UPDATE cash_sessions 
          SET expected_cash = expected_cash + ?, total_cash_expenses = total_cash_expenses - ?
          WHERE id = ?
        `, [expense.amount, expense.amount, activeSession.id]);
      }
    }

    await dbRun('DELETE FROM expenses WHERE id = ?', [id]);
    res.json({ message: 'Pengeluaran berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
