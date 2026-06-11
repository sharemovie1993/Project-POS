const fs = require('fs');
const path = require('path');
const { RouterOSClient } = require('routeros-client');

// Helper to get MikroTik Config
function getMikroTikConfig() {
  const configPath = path.join(__dirname, '..', 'config-mikrotik.json');
  if (fs.existsSync(configPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (!parsed.owner) parsed.owner = 'Organisasi';
      return parsed;
    } catch (e) {
      console.error('Error reading config-mikrotik.json:', e);
    }
  }
  return { host: '', port: 8728, user: '', password: '', owner: 'Organisasi' };
}

// Helper to extract username from scanned code (supports URLs from QR codes)
function extractUsernameFromCode(code) {
  if (!code) return '';
  const decoded = decodeURIComponent(code).trim();
  if (decoded.startsWith('http://') || decoded.startsWith('https://') || decoded.includes('?')) {
    try {
      const urlString = (decoded.startsWith('http://') || decoded.startsWith('https://')) ? decoded : `http://${decoded}`;
      const parsedUrl = new URL(urlString);
      const username = parsedUrl.searchParams.get('username');
      if (username) return username.trim();
    } catch (e) {
      const match = decoded.match(/[?&]username=([^&]+)/);
      if (match) return decodeURIComponent(match[1]).trim();
    }
  }
  return decoded;
}

// Helper to normalize voucher codes for case-insensitive and visually similar comparison
function normalizeVoucherCode(code) {
  if (!code) return '';
  return code.toLowerCase()
    .replace(/[1liI|]/g, 'l')
    .replace(/[0oO]/g, 'o')
    .replace(/[5sS]/g, 's')
    .replace(/[8bB]/g, 'b');
}

// Helper to query MikroTik via routeros-client
async function queryMikroTik(action) {
  const config = getMikroTikConfig();
  if (!config.host || !config.user) {
    throw new Error('Konfigurasi MikroTik belum diisi dengan lengkap.');
  }
  const client = new RouterOSClient({
    host: config.host,
    port: parseInt(config.port) || 8728,
    user: config.user,
    password: config.password,
    timeout: 5000
  });

  let connection;
  try {
    const connectPromise = client.connect();
    // Hindari unhandled rejection jika koneksi baru terputus setelah timeout terlewati
    connectPromise.catch(() => {});

    let timer;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Timeout koneksi ke MikroTik (5 detik)')), 5000);
    });

    const safeConnectPromise = connectPromise.then((conn) => {
      clearTimeout(timer);
      return conn;
    });

    connection = await Promise.race([safeConnectPromise, timeoutPromise]);
  } catch (err) {
    try { client.close(); } catch (e) {}
    throw err;
  }

  try {
    return await action(connection);
  } finally {
    client.close();
  }
}

module.exports = { getMikroTikConfig, extractUsernameFromCode, normalizeVoucherCode, queryMikroTik };
