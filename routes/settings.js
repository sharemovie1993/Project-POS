const express = require('express');
const router = express.Router();
const { dbAll, dbRun } = require('../db/connection');
const { logger } = require('../utils/logger');
const { exec } = require('child_process');

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
    if (settings.default_tax_rate === undefined) settings.default_tax_rate = '0';
    if (settings.default_discount === undefined) settings.default_discount = '0';
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
    store_footer,
    default_tax_rate,
    default_discount
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
    if (default_tax_rate !== undefined) {
      await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('default_tax_rate', ?)", [default_tax_rate.trim()]);
    }
    if (default_discount !== undefined) {
      await dbRun("INSERT OR REPLACE INTO settings (key, value) VALUES ('default_discount', ?)", [default_discount.trim()]);
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

// Check update via Git
router.get('/api/settings/update-check', async (req, res) => {
  try {
    // 1. Jalankan git fetch untuk sinkronisasi dengan remote origin
    exec('git fetch origin', { timeout: 10000 }, (fetchErr) => {
      if (fetchErr) {
        logger.error('Gagal melakukan git fetch:', fetchErr.message);
        return res.status(500).json({ error: 'Gagal sinkronisasi ke GitHub. Pastikan internet terhubung.' });
      }

      // 2. Dapatkan hash local HEAD
      exec('git rev-parse --short HEAD', (localErr, localStdout) => {
        if (localErr) {
          logger.error('Gagal mendapatkan local commit SHA:', localErr.message);
          return res.status(500).json({ error: 'Gagal membaca versi lokal.' });
        }
        const localSha = localStdout.trim();

        // 3. Dapatkan hash remote origin/main
        // Catatan: Proyek ini menggunakan branch utama 'main'
        exec('git rev-parse --short origin/main', (remoteErr, remoteStdout) => {
          if (remoteErr) {
            logger.error('Gagal mendapatkan remote commit SHA:', remoteErr.message);
            return res.status(500).json({ error: 'Gagal membaca versi terbaru di remote server.' });
          }
          const remoteSha = remoteStdout.trim();
          const upToDate = (localSha === remoteSha);

          if (upToDate) {
            return res.json({
              upToDate: true,
              localSha,
              remoteSha,
              changelog: []
            });
          }

          // 4. Dapatkan daftar perubahan komit (changelog)
          exec('git log HEAD..origin/main --oneline', (logErr, logStdout) => {
            const changelog = logErr ? [] : logStdout.trim().split('\n').filter(Boolean);
            res.json({
              upToDate: false,
              localSha,
              remoteSha,
              changelog
            });
          });
        });
      });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Terapkan update (git pull + process exit untuk restart otomatis)
router.post('/api/settings/update-apply', async (req, res) => {
  try {
    logger.info('Menerima permintaan pembaruan sistem. Memulai git pull...');
    
    exec('git pull origin main', { timeout: 15000 }, (pullErr, pullStdout) => {
      if (pullErr) {
        logger.error('Gagal melakukan git pull:', pullErr.message);
        return res.status(500).json({ error: 'Gagal mengunduh pembaruan dari remote: ' + pullErr.message });
      }

      logger.info('Git pull sukses. Output:', pullStdout.trim());
      
      res.json({
        success: true,
        message: 'Pembaruan berhasil diunduh. Server sedang me-restart untuk menerapkan perubahan...'
      });

      // Restart server secara otomatis setelah 1.5 detik
      setTimeout(() => {
        logger.info('Menghentikan server untuk memicu restart otomatis (PM2 / Nodemon)...');
        process.exit(0);
      }, 1500);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
