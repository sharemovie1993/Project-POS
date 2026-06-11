const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { RouterOSClient } = require('routeros-client');
const { getMikroTikConfig, queryMikroTik, extractUsernameFromCode, normalizeVoucherCode } = require('../utils/mikrotik');
const { logger } = require('../utils/logger');

// Ambil konfigurasi MikroTik (password disensor)
router.get('/api/mikrotik/config', (req, res) => {
  const config = getMikroTikConfig();
  res.json({
    host: config.host || '',
    port: config.port || 8728,
    user: config.user || '',
    has_password: !!config.password,
    owner: config.owner || 'Organisasi'
  });
});

// Simpan konfigurasi MikroTik
router.post('/api/mikrotik/config', (req, res) => {
  const { host, port, user, password, owner } = req.body;
  if (!host || !user) {
    return res.status(400).json({ error: 'IP Address dan Username wajib diisi' });
  }

  const configPath = path.join(__dirname, '..', 'config-mikrotik.json');
  const currentConfig = getMikroTikConfig();

  // Gunakan password lama jika input password kosong/tidak diubah
  const finalPassword = (password === undefined || password === '') ? currentConfig.password : password;

  const newConfig = {
    host: host.trim(),
    port: parseInt(port) || 8728,
    user: user.trim(),
    password: finalPassword,
    owner: owner || 'Organisasi'
  };

  try {
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf8');
    res.json({ message: 'Konfigurasi MikroTik berhasil disimpan' });
  } catch (e) {
    res.status(500).json({ error: 'Gagal menulis berkas konfigurasi: ' + e.message });
  }
});

// Tes koneksi MikroTik menggunakan input dari form
router.post('/api/mikrotik/test', async (req, res) => {
  if (!global.isMikrotikEnabled) {
    return res.status(400).json({ error: 'Integrasi MikroTik dinonaktifkan di Pengaturan Sistem.' });
  }
  const { host, port, user, password } = req.body;
  if (!host || !user) {
    return res.status(400).json({ error: 'IP Address dan Username wajib diisi' });
  }

  const currentConfig = getMikroTikConfig();
  const finalPassword = (password === undefined || password === '') ? currentConfig.password : password;

  const client = new RouterOSClient({
    host: host.trim(),
    port: parseInt(port) || 8728,
    user: user.trim(),
    password: finalPassword,
    timeout: 4000
  });

  try {
    const connectPromise = client.connect();
    // Hindari unhandled rejection jika koneksi baru terputus setelah timeout terlewati
    connectPromise.catch(() => {});

    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Timeout koneksi ke MikroTik (4 detik)')), 4000);
    });

    const safeConnectPromise = connectPromise.then((conn) => {
      clearTimeout(timer);
      return conn;
    });

    const connection = await Promise.race([safeConnectPromise, timeoutPromise]);
    client.close();
    res.json({ success: true, message: 'Koneksi ke MikroTik berhasil!' });
  } catch (error) {
    try { client.close(); } catch (e) {}
    res.status(400).json({ error: 'Koneksi gagal: ' + error.message });
  }
});

// Validasi voucher & ambil harga dari script on-login
router.get('/api/mikrotik/voucher/:code', async (req, res) => {
  if (!global.isMikrotikEnabled) {
    return res.status(400).json({ error: 'Integrasi MikroTik dinonaktifkan di Pengaturan Sistem.' });
  }
  const { code } = req.params;
  try {
    const rawUsername = extractUsernameFromCode(code);
    const result = await queryMikroTik(async (conn) => {
      // 1. Cari user secara direct (case-sensitive)
      let users = await conn.menu('/ip hotspot user').where('name', rawUsername).get();
      
      // 2. Jika tidak ditemukan, coba cari case-insensitive
      if (users.length === 0) {
        const allUsers = await conn.menu('/ip hotspot user').get();
        const foundCaseInsensitive = allUsers.find(u => u.name && typeof u.name === 'string' && u.name.toLowerCase() === rawUsername.toLowerCase());
        if (foundCaseInsensitive) {
          users = [foundCaseInsensitive];
        } else {
          // 3. Jika masih tidak ditemukan, coba cari secara visually normalized
          const normalizedSearch = normalizeVoucherCode(rawUsername);
          const foundNormalized = allUsers.find(u => u.name && typeof u.name === 'string' && normalizeVoucherCode(u.name) === normalizedSearch);
          if (foundNormalized) {
            users = [foundNormalized];
          }
        }
      }

      if (users.length === 0) {
        return { error: 'Voucher tidak terdaftar di MikroTik', status: 404 };
      }
      const user = users[0];

      // Cek apakah sudah terjual
      if (user.comment && user.comment.includes('TERJUAL')) {
        return { error: 'Voucher sudah pernah terjual sebelumnya!', status: 400 };
      }

      // Ambil profile
      const profileName = user.profile;
      const profiles = await conn.menu('/ip hotspot user profile').where('name', profileName).get();
      if (profiles.length === 0) {
        return { error: 'Profil voucher tidak ditemukan di MikroTik', status: 404 };
      }
      const profile = profiles[0];

      // Ambil harga dari script on-login (meniru pembacaan mikhmon)
      let price = 0;
      const onLogin = profile['on-login'] || '';
      const parts = onLogin.split(',');
      if (parts.length > 2) {
        const getprice = parseFloat(parts[2]) || 0;
        const getsprice = parseFloat(parts[4]) || 0;
        price = getsprice !== 0 ? getsprice : getprice;
      }
      if (price === 0) {
        const match = profileName.match(/(\d+)[kK]/);
        if (match) {
          price = parseInt(match[1]) * 1000;
        }
      }

      return {
        success: true,
        username: user.name,
        profile: profileName,
        price: price
      };
    });

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    res.json(result);
  } catch (error) {
    console.error('Gagal memproses voucher dari MikroTik:', error);
    res.status(500).json({ error: 'Gagal terhubung ke router MikroTik: ' + error.message });
  }
});

module.exports = router;
