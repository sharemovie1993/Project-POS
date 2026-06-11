const express = require('express');
const router = express.Router();
const { dbAll, dbRun } = require('../db/connection');
const { logger } = require('../utils/logger');

// ==================== ENDPOINT API PENGATURAN SISTEM ====================

// Ambil semua pengaturan
router.get('/api/settings', async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM settings');
    const settings = {};
    rows.forEach(r => {
      settings[r.key] = r.value;
    });
    if (settings.mikrotik_enabled === undefined) {
      settings.mikrotik_enabled = '1';
    }
    if (settings.store_name === undefined) settings.store_name = 'KASIRKU POS';
    if (settings.store_address === undefined) settings.store_address = 'Jl. Raya Toko Kasir No. 123';
    if (settings.store_phone === undefined) settings.store_phone = '0812-3456-7890';
    if (settings.store_logo === undefined) settings.store_logo = '';
    if (settings.store_footer === undefined) {
      settings.store_footer = 'Terima Kasih atas Kunjungan Anda\nBarang yang sudah dibeli\ntidak dapat ditukar/dikembalikan';
    }
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update pengaturan
router.post('/api/settings', async (req, res) => {
  const {
    mikrotik_enabled,
    store_name,
    store_address,
    store_phone,
    store_logo,
    store_footer
  } = req.body;

  try {
    await dbRun('BEGIN TRANSACTION');

    if (mikrotik_enabled !== undefined) {
      const enabledVal = (mikrotik_enabled === '1' || mikrotik_enabled === true || mikrotik_enabled === 1) ? '1' : '0';
      await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('mikrotik_enabled', ?)", [enabledVal]);
      global.isMikrotikEnabled = (enabledVal === '1');
      logger.info('Status Integrasi MikroTik diubah menjadi:', global.isMikrotikEnabled ? 'AKTIF' : 'NONAKTIF');
    }

    if (store_name !== undefined) {
      await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('store_name', ?)", [store_name.trim()]);
    }
    if (store_address !== undefined) {
      await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('store_address', ?)", [store_address.trim()]);
    }
    if (store_phone !== undefined) {
      await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('store_phone', ?)", [store_phone.trim()]);
    }
    if (store_logo !== undefined) {
      await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('store_logo', ?)", [store_logo]);
    }
    if (store_footer !== undefined) {
      await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('store_footer', ?)", [store_footer]);
    }

    await dbRun('COMMIT');

    const rows = await dbAll('SELECT * FROM settings');
    const updatedSettings = {};
    rows.forEach(r => {
      updatedSettings[r.key] = r.value;
    });

    res.json({ success: true, message: 'Pengaturan sistem berhasil disimpan', settings: updatedSettings });
  } catch (error) {
    try { await dbRun('ROLLBACK'); } catch (e) {}
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
