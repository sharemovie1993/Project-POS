// Load environment variables PERTAMA sebelum apapun
const path = require('path');
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
require('dotenv').config({ path: path.join(__dirname, envFile) });

const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const crypto = require('crypto');
const { RouterOSClient } = require('routeros-client');

// ==================== KONFIGURASI ENVIRONMENT ====================
const NODE_ENV      = process.env.NODE_ENV      || 'development';
const PORT          = process.env.PORT          || 3000;
const DB_NAME       = process.env.DB_NAME       || 'kasir.db';
const LOG_LEVEL     = process.env.LOG_LEVEL     || 'verbose';

// Logger: verbose = tampilkan semua, error = hanya error saja
const logger = {
  info:  (...args) => { if (LOG_LEVEL === 'verbose') console.log('[INFO] ', ...args); },
  warn:  (...args) => { if (LOG_LEVEL === 'verbose') console.warn('[WARN] ', ...args); },
  error: (...args) => console.error('[ERROR]', ...args),
  debug: (...args) => { if (LOG_LEVEL === 'verbose') console.log('[DEBUG]', ...args); },
};

// Banner startup
console.log('='.repeat(55));
console.log(`  🚀 Kasirku POS - Mode: ${NODE_ENV.toUpperCase()}`);
console.log(`  📦 Database   : ${DB_NAME}`);
console.log(`  🌐 Port       : ${PORT}`);
console.log(`  📋 Log Level  : ${LOG_LEVEL}`);
console.log('='.repeat(55));

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

global.isMikrotikEnabled = true;

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database setup - menggunakan DB_NAME dari env
const dbPath = path.join(__dirname, DB_NAME);
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    logger.error('Koneksi database gagal:', err.message);
  } else {
    logger.info('Database SQLite terhubung di:', dbPath);
    initializeDatabase();
  }
});

// Helper to run query as promise
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

// Helper to get local date YYYY-MM-DD
function getLocalTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Inisialisasi Database
async function initializeDatabase() {
  try {
    // Tabel Users
    await dbRun(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabel Products
    await dbRun(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        barcode TEXT UNIQUE,
        name TEXT NOT NULL,
        price_buy REAL DEFAULT 0,
        price_sell REAL NOT NULL,
        stock INTEGER DEFAULT 0,
        category TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabel Transactions
    await dbRun(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number TEXT UNIQUE NOT NULL,
        cashier_name TEXT NOT NULL,
        payment_method TEXT DEFAULT 'TUNAI',
        total_amount REAL NOT NULL,
        discount REAL DEFAULT 0,
        tax REAL DEFAULT 0,
        payment_amount REAL NOT NULL,
        change_amount REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabel Transaction Items
    await dbRun(`
      CREATE TABLE IF NOT EXISTS transaction_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id INTEGER NOT NULL,
        product_id INTEGER,
        product_name TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        price_sell REAL NOT NULL,
        subtotal REAL NOT NULL,
        FOREIGN KEY (transaction_id) REFERENCES transactions (id) ON DELETE CASCADE
      )
    `);

    // Tabel Stock Entries (Riwayat Restok)
    await dbRun(`
      CREATE TABLE IF NOT EXISTS stock_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        product_name TEXT NOT NULL,
        barcode TEXT,
        quantity INTEGER NOT NULL,
        supplier TEXT,
        notes TEXT,
        entry_date DATE NOT NULL,
        recorded_by TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
      )
    `);

    // Tabel Stock Opnames
    await dbRun(`
      CREATE TABLE IF NOT EXISTS stock_opnames (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        opname_number TEXT UNIQUE NOT NULL,
        recorded_by TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabel Stock Opname Items
    await dbRun(`
      CREATE TABLE IF NOT EXISTS stock_opname_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        opname_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        product_name TEXT NOT NULL,
        barcode TEXT,
        system_stock INTEGER NOT NULL,
        physical_stock INTEGER NOT NULL,
        difference INTEGER NOT NULL,
        FOREIGN KEY (opname_id) REFERENCES stock_opnames (id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE
      )
    `);

    // Tabel Void Logs (Audit Log Pembatalan)
    await dbRun(`
      CREATE TABLE IF NOT EXISTS void_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number TEXT NOT NULL,
        cashier_name TEXT NOT NULL,
        total_amount REAL NOT NULL,
        items_summary TEXT NOT NULL,
        reason TEXT NOT NULL,
        void_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabel Kategori Produk (Dinamis)
    await dbRun(`
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    logger.info('Tabel database berhasil diinisialisasi.');

    // Jalankan migrasi schema (ALTER TABLE, dll)
    await runMigrations();

    // Seed data awal jika database kosong
    await seedDummyProducts();
    await seedDummyUsers();
    await seedDummyCategories();

    // Muat cache settings
    try {
      const row = await dbGet("SELECT value FROM settings WHERE key = 'mikrotik_enabled'");
      global.isMikrotikEnabled = row ? row.value === '1' : true;
      logger.info('Status Integrasi MikroTik dimuat dari database:', global.isMikrotikEnabled ? 'AKTIF' : 'NONAKTIF');
    } catch (e) {
      global.isMikrotikEnabled = true;
      logger.error('Gagal memuat status MikroTik dari settings:', e.message);
    }
  } catch (error) {
    logger.error('Inisialisasi tabel gagal:', error.message);
  }
}

// ===========================================================================
// MIGRATION SYSTEM
// ---------------------------------------------------------------------------
// PANDUAN MENAMBAH MIGRASI BARU:
//
// 1. Tambahkan entry baru di array MIGRATIONS di bawah
// 2. Isi field:
//    - version : nomor urut unik (selalu naik, tidak boleh diubah)
//    - date    : tanggal migrasi dibuat (YYYY-MM-DD)
//    - desc    : penjelasan singkat apa yang berubah
//    - up      : async function yang menjalankan perubahan schema
//
// 3. ATURAN PENTING:
//    ✅ Selalu gunakan try/catch di dalam up() untuk ALTER TABLE
//    ✅ Gunakan CREATE TABLE IF NOT EXISTS untuk tabel baru
//    ✅ Migrasi harus IDEMPOTENT (aman dijalankan berkali-kali)
//    ❌ Jangan hapus atau ubah migrasi yang sudah ada
//    ❌ Jangan ubah version yang sudah ada
//
// CONTOH TEMPLATE MIGRASI BARU:
// {
//   version: 3,
//   date: '2026-06-10',
//   desc: 'Tambah kolom harga_grosir di tabel products',
//   up: async () => {
//     try {
//       await dbRun('ALTER TABLE products ADD COLUMN harga_grosir REAL DEFAULT 0');
//       logger.info('Migrasi v3: kolom harga_grosir ditambahkan');
//     } catch (e) { /* kolom sudah ada, skip */ }
//   }
// },
// ===========================================================================

const MIGRATIONS = [

  // -------------------------------------------------------------------
  // v1 | 2026-06-05 | Tambah kolom is_service di tabel products
  //    | Untuk membedakan produk fisik vs jasa (print, fotokopi, dll)
  //    | Produk jasa tidak mengurangi stok saat terjual
  // -------------------------------------------------------------------
  {
    version: 1,
    date: '2026-06-05',
    desc: 'Tambah kolom is_service di tabel products',
    up: async () => {
      try {
        await dbRun('ALTER TABLE products ADD COLUMN is_service INTEGER DEFAULT 0');
        logger.info('Migrasi v1: kolom is_service ditambahkan ke tabel products');
      } catch (e) { /* kolom sudah ada, skip */ }
    }
  },
  
  // -------------------------------------------------------------------
  // v2 | 2026-06-05 | Tambah kolom owner/product_owner ke tabel
  //    | Untuk mendukung sistem multi-owner (multi-tenant)
  // -------------------------------------------------------------------
  {
    version: 2,
    date: '2026-06-05',
    desc: 'Tambah kolom owner di tabel products, users, void_logs, dan transaction_items',
    up: async () => {
      try {
        await dbRun("ALTER TABLE products ADD COLUMN owner TEXT DEFAULT 'Organisasi'");
        logger.info('Migrasi v2: kolom owner ditambahkan ke tabel products');
      } catch (e) { /* skip */ }

      try {
        await dbRun("ALTER TABLE users ADD COLUMN owner TEXT");
        logger.info('Migrasi v2: kolom owner ditambahkan ke tabel users');
      } catch (e) { /* skip */ }

      try {
        await dbRun("ALTER TABLE transaction_items ADD COLUMN product_owner TEXT");
        logger.info('Migrasi v2: kolom product_owner ditambahkan ke tabel transaction_items');
      } catch (e) { /* skip */ }

      try {
        await dbRun("ALTER TABLE void_logs ADD COLUMN owner TEXT");
        logger.info('Migrasi v2: kolom owner ditambahkan ke tabel void_logs');
      } catch (e) { /* skip */ }

      try {
        await dbRun("UPDATE transaction_items SET product_owner = 'Organisasi' WHERE product_owner IS NULL");
      } catch (e) { /* skip */ }
    }
  },

  // -------------------------------------------------------------------
  // v3 | 2026-06-05 | Pembuatan tabel owners untuk data owner terpusat (CRUD)
  // -------------------------------------------------------------------
  {
    version: 3,
    date: '2026-06-05',
    desc: 'Pembuatan tabel owners untuk data owner terpusat',
    up: async () => {
      // 1. Buat tabel owners jika belum ada
      await dbRun(`
        CREATE TABLE IF NOT EXISTS owners (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      logger.info('Migrasi v3: tabel owners berhasil dibuat');

      // 2. Seeding awal data owner default jika kosong
      const countRow = await dbGet('SELECT COUNT(*) as count FROM owners');
      if (countRow.count === 0) {
        const defaultOwners = [
          { name: 'Organisasi', desc: 'Organisasi Toko / Penjualan Bersama (Minuman & Kebutuhan Harian)' },
          { name: 'Pak Nandang', desc: 'Pemilik Usaha Makanan (Indomie, Oreo, Kopi, dll)' },
          { name: 'Pak Asep', desc: 'Pemilik Layanan Jasa (Print, Fotokopi, dll)' }
        ];
        for (const owner of defaultOwners) {
          await dbRun('INSERT INTO owners (name, description) VALUES (?, ?)', [owner.name, owner.desc]);
        }
        logger.info('Migrasi v3: seeding data owner default selesai');
      }
    }
  },
  {
    version: 4,
    date: '2026-06-11',
    desc: 'Pembuatan tabel settings untuk konfigurasi sistem',
    up: async () => {
      // 1. Buat tabel settings jika belum ada
      await dbRun(`
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT
        )
      `);
      logger.info('Migrasi v4: tabel settings berhasil dibuat');

      // 2. Seeding awal status active mikrotik (default '1' - aktif)
      await dbRun("INSERT OR IGNORE INTO settings (key, value) VALUES ('mikrotik_enabled', '1')");
      logger.info('Migrasi v4: seeding default settings selesai');
    }
  },
  {
    version: 5,
    date: '2026-06-11',
    desc: 'Seeding default settings untuk branding toko',
    up: async () => {
      await dbRun("INSERT OR IGNORE INTO settings (key, value) VALUES ('store_name', 'KASIRKU POS')");
      await dbRun("INSERT OR IGNORE INTO settings (key, value) VALUES ('store_address', 'Jl. Raya Toko Kasir No. 123')");
      await dbRun("INSERT OR IGNORE INTO settings (key, value) VALUES ('store_phone', '0812-3456-7890')");
      await dbRun("INSERT OR IGNORE INTO settings (key, value) VALUES ('store_logo', '')");
      await dbRun("INSERT OR IGNORE INTO settings (key, value) VALUES ('store_footer', 'Terima Kasih atas Kunjungan Anda\nBarang yang sudah dibeli\ntidak dapat ditukar/dikembalikan')");
      logger.info('Migrasi v5: seeding default settings branding selesai');
    }
  },
  {
    version: 6,
    date: '2026-06-11',
    desc: 'Implementasi tabel expenses, cash_sessions, dan kolom discount di transaction_items',
    up: async () => {
      // 1. Buat tabel expenses
      await dbRun(`
        CREATE TABLE IF NOT EXISTS expenses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          description TEXT NOT NULL,
          amount REAL NOT NULL,
          category TEXT NOT NULL,
          expense_date DATE NOT NULL,
          owner TEXT DEFAULT 'Organisasi',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 2. Buat tabel cash_sessions
      await dbRun(`
        CREATE TABLE IF NOT EXISTS cash_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          cashier_name TEXT NOT NULL,
          opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          closed_at DATETIME,
          initial_cash REAL NOT NULL,
          expected_cash REAL DEFAULT 0,
          actual_cash REAL,
          difference REAL,
          total_cash_sales REAL DEFAULT 0,
          total_cash_expenses REAL DEFAULT 0,
          notes TEXT,
          status TEXT DEFAULT 'OPEN'
        )
      `);

      // 3. Tambahkan kolom discount pada tabel transaction_items secara aman
      try {
        await dbRun('ALTER TABLE transaction_items ADD COLUMN discount REAL DEFAULT 0');
        logger.info('Migrasi v6: kolom discount ditambahkan ke tabel transaction_items');
      } catch (e) {
        // Abaikan jika kolom sudah ada
      }
    }
  }
];

async function runMigrations() {
  // Buat tabel pencatat versi migrasi jika belum ada
  await dbRun(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version   INTEGER PRIMARY KEY,
      desc      TEXT NOT NULL,
      run_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  let applied = 0;
  for (const migration of MIGRATIONS) {
    const already = await dbGet('SELECT version FROM schema_migrations WHERE version = ?', [migration.version]);
    if (!already) {
      logger.info(`Menjalankan migrasi v${migration.version}: ${migration.desc}`);
      await migration.up();
      await dbRun('INSERT INTO schema_migrations (version, desc) VALUES (?, ?)', [migration.version, migration.desc]);
      applied++;
    }
  }

  if (applied === 0) {
    logger.info('Semua migrasi sudah up-to-date. Tidak ada yang perlu dijalankan.');
  } else {
    logger.info(`${applied} migrasi berhasil dijalankan.`);
  }
}

// Seed Dummy Products if empty
async function seedDummyProducts() {
  const count = await dbGet('SELECT COUNT(*) as count FROM products');
  if (count.count === 0) {
    const dummyProducts = [
      { barcode: '8998866200559', name: 'Indomie Goreng Spesial', price_buy: 2500, price_sell: 3500, stock: 150, category: 'Makanan', is_service: 0, owner: 'Pak Nandang' },
      { barcode: '8992696404406', name: 'Air Mineral Aqua 600ml', price_buy: 1500, price_sell: 2500, stock: 200, category: 'Minuman', is_service: 0, owner: 'Organisasi' },
      { barcode: '8992695801206', name: 'Kopi Kapal Api Mix', price_buy: 1200, price_sell: 2000, stock: 120, category: 'Minuman', is_service: 0, owner: 'Pak Nandang' },
      { barcode: '8999999052026', name: 'Sabun Mandi Lifebuoy 85g', price_buy: 3000, price_sell: 4500, stock: 75, category: 'Kebutuhan Harian', is_service: 0, owner: 'Organisasi' },
      { barcode: '8999999042225', name: 'Pasta Gigi Pepsodent 120g', price_buy: 8000, price_sell: 11000, stock: 40, category: 'Kebutuhan Harian', is_service: 0, owner: 'Organisasi' },
      { barcode: '7622300744675', name: 'Biskuit Oreo Original 137g', price_buy: 6000, price_sell: 8500, stock: 50, category: 'Makanan', is_service: 0, owner: 'Pak Nandang' },
      { barcode: '8992741914126', name: 'Teh Botol Sosro Kotak 250ml', price_buy: 2000, price_sell: 3000, stock: 100, category: 'Minuman', is_service: 0, owner: 'Organisasi' },
      { barcode: '8992745124019', name: 'Snack Taro Net 40g', price_buy: 3500, price_sell: 5000, stock: 60, category: 'Makanan', is_service: 0, owner: 'Pak Nandang' },
      { barcode: null, name: 'Jasa Print A4 Hitam Putih', price_buy: 200, price_sell: 500, stock: 0, category: 'Lainnya', is_service: 1, owner: 'Pak Asep' }
    ];

    const stmt = db.prepare('INSERT INTO products (barcode, name, price_buy, price_sell, stock, category, is_service, owner) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    dummyProducts.forEach((p) => {
      stmt.run(p.barcode, p.name, p.price_buy, p.price_sell, p.stock, p.category, p.is_service, p.owner);
    });
    stmt.finalize();
    console.log('Dummy data produk berhasil dimasukkan.');
  } else {
    // Pastikan data lama memiliki asosiasi owner untuk pengujian
    const hasNandang = await dbGet("SELECT COUNT(*) as count FROM products WHERE owner = 'Pak Nandang'");
    if (hasNandang.count === 0) {
      await dbRun("UPDATE products SET owner = 'Pak Nandang' WHERE barcode = '8998866200559'"); // Indomie
      await dbRun("UPDATE products SET owner = 'Pak Nandang' WHERE barcode = '8992695801206'"); // Kopi
      await dbRun("UPDATE products SET owner = 'Pak Nandang' WHERE barcode = '7622300744675'"); // Oreo
      await dbRun("UPDATE products SET owner = 'Pak Nandang' WHERE barcode = '8992745124019'"); // Taro
      await dbRun("UPDATE products SET owner = 'Pak Asep' WHERE barcode IS NULL OR barcode = ''"); // Jasa
      console.log('Dummy data owner berhasil diasosiasikan untuk data produk lama.');
    }
  }
}

// Seed Dummy Users if empty
async function seedDummyUsers() {
  const count = await dbGet('SELECT COUNT(*) as count FROM users');
  if (count.count === 0) {
    const dummyUsers = [
      { username: 'admin', name: 'Administrator', password: hashPassword('admin123'), role: 'admin', owner: null },
      { username: 'nandang', name: 'Pak Nandang', password: hashPassword('nandang123'), role: 'admin', owner: 'Pak Nandang' },
      { username: 'asep', name: 'Pak Asep', password: hashPassword('asep123'), role: 'admin', owner: 'Pak Asep' },
      { username: 'organisasi', name: 'Organisasi Toko', password: hashPassword('organisasi123'), role: 'admin', owner: 'Organisasi' },
      { username: 'kasir1', name: 'Siti Aminah', password: hashPassword('kasir123'), role: 'cashier', owner: null },
      { username: 'kasir2', name: 'Budi Santoso', password: hashPassword('kasir234'), role: 'cashier', owner: null }
    ];
    
    const stmt = db.prepare('INSERT INTO users (username, name, password, role, owner) VALUES (?, ?, ?, ?, ?)');
    dummyUsers.forEach((u) => {
      stmt.run(u.username, u.name, u.password, u.role, u.owner);
    });
    stmt.finalize();
    console.log('Dummy data user kasir berhasil dimasukkan.');
  }
}

// Seed Dummy Categories if empty
async function seedDummyCategories() {
  const count = await dbGet('SELECT COUNT(*) as count FROM categories');
  if (count.count === 0) {
    const defaultCategories = [
      'Makanan', 'Minuman', 'Kebutuhan Harian',
      'Alat Tulis', 'Elektronik', 'Voucher Wifi', 'Lainnya'
    ];
    const stmt = db.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)');
    defaultCategories.forEach(name => stmt.run(name));
    stmt.finalize();
    console.log('Dummy data kategori berhasil dimasukkan.');
  }
}

// ==================== ENDPOINT API KATEGORI (CRUD) ====================

// Ambil semua kategori
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await dbAll('SELECT * FROM categories ORDER BY name ASC');
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Tambah kategori baru
app.post('/api/categories', async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nama kategori wajib diisi' });
  }
  try {
    const existing = await dbGet('SELECT id FROM categories WHERE name = ?', [name.trim()]);
    if (existing) {
      return res.status(400).json({ error: 'Nama kategori sudah ada' });
    }
    const result = await dbRun('INSERT INTO categories (name) VALUES (?)', [name.trim()]);
    const newCat = await dbGet('SELECT * FROM categories WHERE id = ?', [result.lastID]);
    res.status(201).json(newCat);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update kategori
app.put('/api/categories/:id', async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nama kategori wajib diisi' });
  }
  try {
    // Cek duplikasi nama
    const existing = await dbGet('SELECT id FROM categories WHERE name = ? AND id != ?', [name.trim(), id]);
    if (existing) {
      return res.status(400).json({ error: 'Nama kategori sudah digunakan' });
    }
    // Update nama kategori di tabel products juga agar sinkron
    const oldCat = await dbGet('SELECT name FROM categories WHERE id = ?', [id]);
    if (oldCat) {
      await dbRun('UPDATE products SET category = ? WHERE category = ?', [name.trim(), oldCat.name]);
    }
    await dbRun('UPDATE categories SET name = ? WHERE id = ?', [name.trim(), id]);
    const updated = await dbGet('SELECT * FROM categories WHERE id = ?', [id]);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Hapus kategori
app.delete('/api/categories/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const cat = await dbGet('SELECT * FROM categories WHERE id = ?', [id]);
    if (!cat) {
      return res.status(404).json({ error: 'Kategori tidak ditemukan' });
    }
    // Cek apakah kategori ini masih digunakan oleh produk
    const usedBy = await dbGet('SELECT COUNT(*) as count FROM products WHERE category = ?', [cat.name]);
    if (usedBy.count > 0) {
      return res.status(400).json({ error: `Kategori "${cat.name}" tidak dapat dihapus karena masih digunakan oleh ${usedBy.count} produk` });
    }
    await dbRun('DELETE FROM categories WHERE id = ?', [id]);
    res.json({ message: `Kategori "${cat.name}" berhasil dihapus` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ENDPOINT API PRODUK (CRUD) ====================

// Ambil semua produk atau cari berdasarkan barcode/nama (Mendukung filter owner)
app.get('/api/products', async (req, res) => {
  try {
    const { search, barcode, owner } = req.query;
    let sql = 'SELECT * FROM products';
    let params = [];
    let conditions = [];

    if (barcode) {
      conditions.push('barcode = ?');
      params.push(barcode);
    } else if (search) {
      conditions.push('(name LIKE ? OR barcode LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    if (owner && owner !== 'All' && owner !== 'undefined' && owner !== 'null') {
      conditions.push('owner = ?');
      params.push(owner);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY name ASC';
    const products = await dbAll(sql, params);
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Tambah produk baru (Menyimpan owner)
app.post('/api/products', async (req, res) => {
  const { barcode, name, price_buy, price_sell, stock, category, is_service, owner } = req.body;
  if (!name || price_sell === undefined) {
    return res.status(400).json({ error: 'Nama dan Harga Jual wajib diisi' });
  }

  try {
    // Cek duplikasi barcode jika diisi
    if (barcode) {
      const existing = await dbGet('SELECT id FROM products WHERE barcode = ?', [barcode]);
      if (existing) {
        return res.status(400).json({ error: 'Kode Barcode sudah digunakan oleh produk lain' });
      }
    }

    const isService = is_service ? 1 : 0;
    const stockVal = isService ? 0 : (stock || 0); // Jasa tidak perlu stok
    const productOwner = owner || 'Organisasi';
    const sql = `INSERT INTO products (barcode, name, price_buy, price_sell, stock, category, is_service, owner) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    const result = await dbRun(sql, [barcode || null, name, price_buy || 0, price_sell, stockVal, category || '', isService, productOwner]);
    
    const newProduct = await dbGet('SELECT * FROM products WHERE id = ?', [result.lastID]);
    res.status(201).json(newProduct);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update data produk (Menyimpan owner)
app.put('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  const { barcode, name, price_buy, price_sell, stock, category, is_service, owner } = req.body;

  if (!name || price_sell === undefined) {
    return res.status(400).json({ error: 'Nama dan Harga Jual wajib diisi' });
  }

  try {
    // Cek duplikasi barcode
    if (barcode) {
      const existing = await dbGet('SELECT id FROM products WHERE barcode = ? AND id != ?', [barcode, id]);
      if (existing) {
        return res.status(400).json({ error: 'Kode Barcode sudah digunakan oleh produk lain' });
      }
    }

    const isService = is_service ? 1 : 0;
    const stockVal = isService ? 0 : (stock || 0);
    const productOwner = owner || 'Organisasi';
    const sql = `UPDATE products SET barcode = ?, name = ?, price_buy = ?, price_sell = ?, stock = ?, category = ?, is_service = ?, owner = ? WHERE id = ?`;
    await dbRun(sql, [barcode || null, name, price_buy || 0, price_sell, stockVal, category || '', isService, productOwner, id]);
    
    const updated = await dbGet('SELECT * FROM products WHERE id = ?', [id]);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Hapus produk (Validasi kepemilikan owner)
app.delete('/api/products/:id', async (req, res) => {
  const { id } = req.params;
  const { owner } = req.query;
  try {
    if (owner && owner !== 'All' && owner !== 'undefined' && owner !== 'null') {
      const product = await dbGet('SELECT owner FROM products WHERE id = ?', [id]);
      if (product && product.owner !== owner) {
        return res.status(403).json({ error: 'Anda tidak berhak menghapus produk milik owner lain' });
      }
    }
    await dbRun('DELETE FROM products WHERE id = ?', [id]);
    res.json({ message: 'Produk berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ==================== ENDPOINT API TRANSAKSI ====================

// Simpan transaksi baru (Atomic dengan Transaction Rollback)
app.post('/api/transactions', (req, res) => {
  const { cashier_name, payment_method, total_amount, discount, tax, payment_amount, change_amount, items } = req.body;

  if (!cashier_name || !items || items.length === 0) {
    return res.status(400).json({ error: 'Data transaksi tidak lengkap' });
  }

  // Generate Invoice Number: TRX-YYYYMMDD-XXXX
  const todayStr = getLocalTodayDate().replace(/-/g, '');
  
  // Gunakan serialize untuk menjamin proses berjalan terurut dalam transaction
  db.serialize(async () => {
    try {
      // Mulai transaksi database
      await dbRun('BEGIN TRANSACTION');

      // Ambil nomor urut hari ini
      const dateWildcard = `TRX-${todayStr}-%`;
      const countRow = await dbGet(`SELECT COUNT(*) as count FROM transactions WHERE invoice_number LIKE ?`, [dateWildcard]);
      const nextSeq = String(countRow.count + 1).padStart(4, '0');
      const invoiceNumber = `TRX-${todayStr}-${nextSeq}`;

      // Insert ke tabel transactions
      const txSql = `
        INSERT INTO transactions (invoice_number, cashier_name, payment_method, total_amount, discount, tax, payment_amount, change_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      const txResult = await dbRun(txSql, [
        invoiceNumber,
        cashier_name,
        payment_method || 'TUNAI',
        total_amount,
        discount || 0,
        tax || 0,
        payment_amount,
        change_amount
      ]);
      const transactionId = txResult.lastID;

      // Loop keranjang belanja untuk kurangi stok & masukkan ke items
      const mtConfig = getMikroTikConfig();
      const voucherOwner = mtConfig.owner || 'Organisasi';

      for (const item of items) {
        const isVoucher = item.is_voucher || (typeof item.product_id === 'string' && item.product_id.startsWith('voucher-'));

        if (isVoucher) {
          // Virtual Voucher: bypass stock checks, use configured owner
          const itemSql = `
            INSERT INTO transaction_items (transaction_id, product_id, product_name, quantity, price_sell, subtotal, product_owner, discount)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `;
          await dbRun(itemSql, [
            transactionId,
            null,
            item.product_name,
            item.quantity,
            item.price_sell,
            item.subtotal,
            voucherOwner,
            item.discount || 0
          ]);
        } else {
          // Query data produk terlebih dahulu dari database
          const product = await dbGet('SELECT id, name, stock, owner, is_service FROM products WHERE id = ?', [item.product_id]);
          if (!product) {
            throw new Error(`Produk dengan ID ${item.product_id} tidak ditemukan`);
          }

          const isService = (product.is_service === 1) || item.is_service || false;
          const productOwner = product.owner || 'Organisasi';

          if (isService) {
            // Produk Jasa: tidak kurangi stok, langsung catat ke items
            const itemSql = `
              INSERT INTO transaction_items (transaction_id, product_id, product_name, quantity, price_sell, subtotal, product_owner, discount)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
            await dbRun(itemSql, [
              transactionId,
              item.product_id,
              item.product_name,
              item.quantity,
              item.price_sell,
              item.subtotal,
              productOwner,
              item.discount || 0
            ]);
          } else {
            // Barang Fisik: cek & kurangi stok
            // Cek kecukupan stok
            if (product.stock < item.quantity) {
              throw new Error(`Stok produk "${product.name}" tidak mencukupi. Sisa stok: ${product.stock}`);
            }

            // Kurangi stok
            await dbRun('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.product_id]);

            // Catat di transaction_items
            const itemSql = `
              INSERT INTO transaction_items (transaction_id, product_id, product_name, quantity, price_sell, subtotal, product_owner, discount)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
            await dbRun(itemSql, [
              transactionId,
              item.product_id,
              item.product_name,
              item.quantity,
              item.price_sell,
              item.subtotal,
              productOwner,
              item.discount || 0
            ]);
          }
        }
      }

      // Update kas laci jika pembayaran TUNAI
      if ((payment_method || 'TUNAI').toUpperCase() === 'TUNAI') {
        const activeSession = await dbGet("SELECT id FROM cash_sessions WHERE status = 'OPEN'");
        if (activeSession) {
          await dbRun(`
            UPDATE cash_sessions 
            SET expected_cash = expected_cash + ?, total_cash_sales = total_cash_sales + ?
            WHERE id = ?
          `, [total_amount, total_amount, activeSession.id]);
        }
      }

      // Commit jika semua sukses
      await dbRun('COMMIT');
      
      const savedTx = await dbGet('SELECT * FROM transactions WHERE id = ?', [transactionId]);

      // Update MikroTik comments in background for voucher items
      const voucherItems = items.filter(item => item.is_voucher || (item.category === 'Voucher Wifi') || (typeof item.product_id === 'string' && item.product_id.startsWith('voucher-')));
      if (global.isMikrotikEnabled && voucherItems.length > 0) {
        (async () => {
          try {
            await queryMikroTik(async (conn) => {
              const today = getLocalTodayDate();
              for (const item of voucherItems) {
                const code = item.barcode;
                if (code) {
                  const rawUsername = extractUsernameFromCode(code);
                  let users = await conn.menu('/ip hotspot user').where('name', rawUsername).get();
                  if (users.length === 0) {
                    const allUsers = await conn.menu('/ip hotspot user').get();
                    const foundCaseInsensitive = allUsers.find(u => u.name && typeof u.name === 'string' && u.name.toLowerCase() === rawUsername.toLowerCase());
                    if (foundCaseInsensitive) {
                      users = [foundCaseInsensitive];
                    } else {
                      const normalizedSearch = normalizeVoucherCode(rawUsername);
                      const foundNormalized = allUsers.find(u => u.name && typeof u.name === 'string' && normalizeVoucherCode(u.name) === normalizedSearch);
                      if (foundNormalized) {
                        users = [foundNormalized];
                      }
                    }
                  }
                  if (users.length > 0) {
                    await conn.model(users[0]).update({
                      comment: `TERJUAL - ${invoiceNumber} - ${today}`
                    });
                    console.log(`MikroTik: Berhasil memperbarui status TERJUAL untuk user ${users[0].name}`);
                  }
                }
              }
            });
          } catch (e) {
            console.error('Background MikroTik voucher update failed:', e.message);
          }
        })();
      }

      res.status(201).json({
        message: 'Transaksi berhasil disimpan',
        transaction: savedTx,
        invoice_number: invoiceNumber
      });

    } catch (error) {
      // Rollback jika ada yang error
      await dbRun('ROLLBACK');
      console.error('Transaksi dibatalkan:', error.message);
      res.status(400).json({ error: error.message });
    }
  });
});

// Ambil riwayat transaksi (mendukung filter tanggal dan nama kasir)
app.get('/api/transactions', async (req, res) => {
  try {
    const { date, cashier } = req.query;
    let sql = 'SELECT * FROM transactions';
    let params = [];
    let conditions = [];

    if (date) {
      conditions.push("date(created_at, 'localtime') = ?");
      params.push(date);
    }
    if (cashier) {
      conditions.push('cashier_name = ?');
      params.push(cashier);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY created_at DESC LIMIT 100';
    const transactions = await dbAll(sql, params);
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ambil detail item dari suatu transaksi (Mendukung filter owner)
app.get('/api/transactions/:id', async (req, res) => {
  const { id } = req.params;
  const { owner } = req.query;
  const hasOwner = owner && owner !== 'All' && owner !== 'undefined' && owner !== 'null';
  try {
    const tx = await dbGet('SELECT * FROM transactions WHERE id = ?', [id]);
    if (!tx) {
      return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
    }
    let items;
    if (hasOwner) {
      items = await dbAll('SELECT * FROM transaction_items WHERE transaction_id = ? AND product_owner = ?', [id, owner]);
      // Adjust totals based only on the items belonging to this owner
      const totalSum = items.reduce((sum, item) => sum + item.subtotal, 0);
      tx.total_amount = totalSum;
      tx.discount = 0;
      tx.tax = 0;
      tx.payment_amount = totalSum;
      tx.change_amount = 0;
    } else {
      items = await dbAll('SELECT * FROM transaction_items WHERE transaction_id = ?', [id]);
    }
    res.json({ ...tx, items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Pembatalan Transaksi (Void) dengan Log Audit
app.post('/api/transactions/:id/void', (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason || reason.trim() === '') {
    return res.status(400).json({ error: 'Alasan pembatalan (void reason) wajib diisi.' });
  }

  db.serialize(async () => {
    try {
      await dbRun('BEGIN TRANSACTION');

      // Ambil data transaksi
      const tx = await dbGet('SELECT * FROM transactions WHERE id = ?', [id]);
      if (!tx) {
        throw new Error('Transaksi tidak ditemukan');
      }

      // Ambil data items
      const items = await dbAll('SELECT * FROM transaction_items WHERE transaction_id = ?', [id]);

      // Catat ke void_logs (split per owner yang terlibat)
      const uniqueOwners = [...new Set(items.map(item => item.product_owner || 'Organisasi'))];
      for (const owner of uniqueOwners) {
        const ownerItems = items.filter(item => (item.product_owner || 'Organisasi') === owner);
        const itemsSummary = ownerItems.map(item => `${item.quantity}x ${item.product_name}`).join(', ');
        const ownerTotal = ownerItems.reduce((sum, item) => sum + item.subtotal, 0);

        const insertLogSql = `
          INSERT INTO void_logs (invoice_number, cashier_name, total_amount, items_summary, reason, owner)
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        await dbRun(insertLogSql, [
          tx.invoice_number,
          tx.cashier_name,
          ownerTotal,
          itemsSummary,
          reason.trim(),
          owner
        ]);
      }

      // Kembalikan stok HANYA untuk barang fisik (bukan jasa/voucher)
      for (const item of items) {
        if (item.product_id) {
          const product = await dbGet('SELECT id, is_service FROM products WHERE id = ?', [item.product_id]);
          // Hanya kembalikan stok jika produk ada dan bukan jasa
          if (product && !product.is_service) {
            await dbRun('UPDATE products SET stock = stock + ? WHERE id = ?', [item.quantity, item.product_id]);
          }
        }
      }

      // Hapus transaksi (cascade akan menghapus transaction_items secara otomatis)
      await dbRun('DELETE FROM transactions WHERE id = ?', [id]);

      // Kurangi kas laci jika transaksi TUNAI di-void
      if ((tx.payment_method || 'TUNAI').toUpperCase() === 'TUNAI') {
        const activeSession = await dbGet("SELECT id FROM cash_sessions WHERE status = 'OPEN'");
        if (activeSession) {
          await dbRun(`
            UPDATE cash_sessions 
            SET expected_cash = expected_cash - ?, total_cash_sales = total_cash_sales - ?
            WHERE id = ?
          `, [tx.total_amount, tx.total_amount, activeSession.id]);
        }
      }

      await dbRun('COMMIT');

      // Update MikroTik: Cari voucher yang terjual pada invoice ini, kembalikan statusnya (comment dikosongkan)
      const invoiceNumber = tx.invoice_number;
      if (global.isMikrotikEnabled) {
        (async () => {
          try {
            await queryMikroTik(async (conn) => {
              const allUsers = await conn.menu('/ip hotspot user').get();
              const matchingUsers = allUsers.filter(u => u.comment && u.comment.includes(invoiceNumber));
              for (const user of matchingUsers) {
                await conn.model(user).update({
                  comment: ''
                });
                console.log(`MikroTik: Berhasil mengosongkan status voucher ${user.name} karena transaksi ${invoiceNumber} di-void`);
              }
            });
          } catch (e) {
            console.error('Gagal mereset status voucher MikroTik di latar belakang:', e.message);
          }
        })();
      }

      res.json({ message: 'Transaksi berhasil dibatalkan dan stok dikembalikan.' });

    } catch (error) {
      await dbRun('ROLLBACK');
      console.error('Void transaksi dibatalkan:', error.message);
      res.status(400).json({ error: error.message });
    }
  });
});

// Ambil riwayat log audit void (pembatalan)
app.get('/api/void-logs', async (req, res) => {
  try {
    const { owner } = req.query;
    let sql = 'SELECT * FROM void_logs';
    let params = [];
    
    if (owner && owner !== 'All' && owner !== 'undefined' && owner !== 'null') {
      sql += ' WHERE owner = ?';
      params.push(owner);
    }
    
    sql += ' ORDER BY void_at DESC LIMIT 100';
    const logs = await dbAll(sql, params);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ==================== ENDPOINT API LAPORAN & STATISTIK ====================

// Ringkasan Dashboard (Halaman utama)
app.get('/api/dashboard/summary', async (req, res) => {
  try {
    const { owner } = req.query;
    const hasOwner = owner && owner !== 'All' && owner !== 'undefined' && owner !== 'null';
    const today = getLocalTodayDate();

    let todayOmset, todayProfit, topProducts, lowStockCount;

    if (hasOwner) {
      todayOmset = await dbGet(`
        SELECT SUM(ti.subtotal) as total, COUNT(DISTINCT ti.transaction_id) as count 
        FROM transaction_items ti
        JOIN transactions t ON ti.transaction_id = t.id
        WHERE date(t.created_at, 'localtime') = ? AND ti.product_owner = ?
      `, [today, owner]);

      todayProfit = await dbGet(`
        SELECT SUM((ti.price_sell - p.price_buy) * ti.quantity) as profit
        FROM transaction_items ti
        JOIN transactions t ON ti.transaction_id = t.id
        LEFT JOIN products p ON ti.product_id = p.id
        WHERE date(t.created_at, 'localtime') = ? AND ti.product_owner = ?
      `, [today, owner]);

      topProducts = await dbAll(`
        SELECT product_name, SUM(quantity) as total_sold
        FROM transaction_items
        WHERE product_owner = ?
        GROUP BY product_id, product_name
        ORDER BY total_sold DESC
        LIMIT 5
      `, [owner]);

      lowStockCount = await dbGet(`
        SELECT COUNT(*) as count FROM products WHERE stock < 5 AND (is_service = 0 OR is_service IS NULL) AND owner = ?
      `, [owner]);
    } else {
      todayOmset = await dbGet(`
        SELECT SUM(total_amount) as total, COUNT(*) as count 
        FROM transactions 
        WHERE date(created_at, 'localtime') = ?
      `, [today]);

      todayProfit = await dbGet(`
        SELECT SUM((ti.price_sell - p.price_buy) * ti.quantity) as profit
        FROM transaction_items ti
        JOIN transactions t ON ti.transaction_id = t.id
        LEFT JOIN products p ON ti.product_id = p.id
        WHERE date(t.created_at, 'localtime') = ?
      `, [today]);

      topProducts = await dbAll(`
        SELECT product_name, SUM(quantity) as total_sold
        FROM transaction_items
        GROUP BY product_id, product_name
        ORDER BY total_sold DESC
        LIMIT 5
      `);

      lowStockCount = await dbGet(`
        SELECT COUNT(*) as count FROM products WHERE stock < 5 AND (is_service = 0 OR is_service IS NULL)
      `);
    }

    res.json({
      today_revenue: todayOmset.total || 0,
      today_transactions: todayOmset.count || 0,
      today_profit: todayProfit.profit || 0,
      low_stock_alerts: lowStockCount.count || 0,
      top_products: topProducts
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Laporan Penjualan Hari Ini
app.get('/api/reports/today', async (req, res) => {
  try {
    const { owner } = req.query;
    const hasOwner = owner && owner !== 'All' && owner !== 'undefined' && owner !== 'null';
    const today = getLocalTodayDate();
    
    let summary, profitData, soldItems, transactions;

    if (hasOwner) {
      summary = await dbGet(`
        SELECT 
          SUM(ti.subtotal) as total_revenue,
          COUNT(DISTINCT ti.transaction_id) as total_transactions,
          0 as total_discount,
          0 as total_tax
        FROM transaction_items ti
        JOIN transactions t ON ti.transaction_id = t.id
        WHERE date(t.created_at, 'localtime') = ? AND ti.product_owner = ?
      `, [today, owner]);

      profitData = await dbGet(`
        SELECT SUM((ti.price_sell - COALESCE(p.price_buy, ti.price_sell * 0.7)) * ti.quantity) as total_profit
        FROM transaction_items ti
        JOIN transactions t ON ti.transaction_id = t.id
        LEFT JOIN products p ON ti.product_id = p.id
        WHERE date(t.created_at, 'localtime') = ? AND ti.product_owner = ?
      `, [today, owner]);

      soldItems = await dbAll(`
        SELECT 
          ti.product_name,
          SUM(ti.quantity) as qty_sold,
          ti.price_sell,
          SUM(ti.subtotal) as total_sales
        FROM transaction_items ti
        JOIN transactions t ON ti.transaction_id = t.id
        WHERE date(t.created_at, 'localtime') = ? AND ti.product_owner = ?
        GROUP BY ti.product_id, ti.product_name
        ORDER BY qty_sold DESC
      `, [today, owner]);

      transactions = await dbAll(`
        SELECT t.id, t.invoice_number, t.cashier_name, t.payment_method, 
               SUM(ti.subtotal) as total_amount, 0 as discount, 0 as tax, 
               SUM(ti.subtotal) as payment_amount, 0 as change_amount, t.created_at
        FROM transactions t
        JOIN transaction_items ti ON ti.transaction_id = t.id
        WHERE date(t.created_at, 'localtime') = ? AND ti.product_owner = ?
        GROUP BY t.id
        ORDER BY t.created_at DESC
      `, [today, owner]);
    } else {
      summary = await dbGet(`
        SELECT 
          SUM(total_amount) as total_revenue,
          COUNT(*) as total_transactions,
          SUM(discount) as total_discount,
          SUM(tax) as total_tax
        FROM transactions
        WHERE date(created_at, 'localtime') = ?
      `, [today]);

      profitData = await dbGet(`
        SELECT SUM((ti.price_sell - COALESCE(p.price_buy, ti.price_sell * 0.7)) * ti.quantity) as total_profit
        FROM transaction_items ti
        JOIN transactions t ON ti.transaction_id = t.id
        LEFT JOIN products p ON ti.product_id = p.id
        WHERE date(t.created_at, 'localtime') = ?
      `, [today]);

      soldItems = await dbAll(`
        SELECT 
          product_name,
          SUM(quantity) as qty_sold,
          price_sell,
          SUM(subtotal) as total_sales
        FROM transaction_items ti
        JOIN transactions t ON ti.transaction_id = t.id
        WHERE date(t.created_at, 'localtime') = ?
        GROUP BY product_id, product_name
        ORDER BY qty_sold DESC
      `, [today]);

      transactions = await dbAll(`
        SELECT * FROM transactions 
        WHERE date(created_at, 'localtime') = ?
        ORDER BY created_at DESC
      `, [today]);
    }

    res.json({
      date: today,
      revenue: summary.total_revenue || 0,
      transactions_count: summary.total_transactions || 0,
      discount: summary.total_discount || 0,
      tax: summary.total_tax || 0,
      profit: profitData.total_profit || 0,
      sold_items: soldItems,
      transactions: transactions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Laporan Stok Barang
app.get('/api/reports/products', async (req, res) => {
  try {
    const { owner } = req.query;
    const hasOwner = owner && owner !== 'All' && owner !== 'undefined' && owner !== 'null';

    let stats, lowStockList, allProducts;

    if (hasOwner) {
      stats = await dbGet(`
        SELECT 
          COUNT(*) as total_skus,
          SUM(stock) as total_stock,
          SUM(stock * price_buy) as total_asset_buy,
          SUM(stock * price_sell) as total_asset_sell
        FROM products
        WHERE owner = ?
      `, [owner]);

      lowStockList = await dbAll(`
        SELECT * FROM products WHERE stock < 5 AND (is_service = 0 OR is_service IS NULL) AND owner = ? ORDER BY stock ASC
      `, [owner]);

      allProducts = await dbAll(`
        SELECT *, (stock * price_buy) as asset_value_buy, (stock * price_sell) as asset_value_sell
        FROM products
        WHERE owner = ?
        ORDER BY stock ASC, name ASC
      `, [owner]);
    } else {
      stats = await dbGet(`
        SELECT 
          COUNT(*) as total_skus,
          SUM(stock) as total_stock,
          SUM(stock * price_buy) as total_asset_buy,
          SUM(stock * price_sell) as total_asset_sell
        FROM products
      `);

      lowStockList = await dbAll(`
        SELECT * FROM products WHERE stock < 5 AND (is_service = 0 OR is_service IS NULL) ORDER BY stock ASC
      `);

      allProducts = await dbAll(`
        SELECT *, (stock * price_buy) as asset_value_buy, (stock * price_sell) as asset_value_sell
        FROM products
        ORDER BY stock ASC, name ASC
      `);
    }

    res.json({
      total_skus: stats.total_skus || 0,
      total_items: stats.total_stock || 0,
      asset_value_cost: stats.total_asset_buy || 0,
      asset_value_retail: stats.total_asset_sell || 0,
      low_stock_products: lowStockList,
      products: allProducts
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Laporan Keuangan berbasis Rentang Tanggal
app.get('/api/reports/finance', async (req, res) => {
  const { startDate, endDate, owner } = req.query;
  const hasOwner = owner && owner !== 'All' && owner !== 'undefined' && owner !== 'null';

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Parameter startDate dan endDate wajib disertakan (Format: YYYY-MM-DD)' });
  }

  try {
    let summary, profitData, dailyData, paymentBreakdown, cashierBreakdown, categoryBreakdown, totalExpenses;

    if (hasOwner) {
      summary = await dbGet(`
        SELECT 
          SUM(ti.subtotal) as total_revenue,
          0 as total_discount,
          0 as total_tax,
          COUNT(DISTINCT ti.transaction_id) as total_transactions
        FROM transaction_items ti
        JOIN transactions t ON ti.transaction_id = t.id
        WHERE date(t.created_at, 'localtime') BETWEEN ? AND ? AND ti.product_owner = ?
      `, [startDate, endDate, owner]);

      profitData = await dbGet(`
        SELECT 
          SUM((ti.price_sell - COALESCE(p.price_buy, ti.price_sell * 0.7)) * ti.quantity) as total_profit,
          SUM(COALESCE(p.price_buy, 0) * ti.quantity) as total_hpp
        FROM transaction_items ti
        JOIN transactions t ON ti.transaction_id = t.id
        LEFT JOIN products p ON ti.product_id = p.id
        WHERE date(t.created_at, 'localtime') BETWEEN ? AND ? AND ti.product_owner = ?
      `, [startDate, endDate, owner]);

      dailyData = await dbAll(`
        SELECT 
          date(t.created_at, 'localtime') as trans_date,
          COUNT(DISTINCT t.id) as trans_count,
          SUM(ti.subtotal) as revenue,
          SUM((ti.price_sell - COALESCE(p.price_buy, ti.price_sell * 0.7)) * ti.quantity) as profit,
          SUM(COALESCE(p.price_buy, 0) * ti.quantity) as hpp
        FROM transactions t
        JOIN transaction_items ti ON ti.transaction_id = t.id
        LEFT JOIN products p ON ti.product_id = p.id
        WHERE date(t.created_at, 'localtime') BETWEEN ? AND ? AND ti.product_owner = ?
        GROUP BY trans_date
        ORDER BY trans_date ASC
      `, [startDate, endDate, owner]);

      paymentBreakdown = await dbAll(`
        SELECT t.payment_method, SUM(ti.subtotal) as amount, COUNT(DISTINCT t.id) as count
        FROM transactions t
        JOIN transaction_items ti ON ti.transaction_id = t.id
        WHERE date(t.created_at, 'localtime') BETWEEN ? AND ? AND ti.product_owner = ?
        GROUP BY t.payment_method
      `, [startDate, endDate, owner]);

      cashierBreakdown = await dbAll(`
        SELECT t.cashier_name, SUM(ti.subtotal) as amount, COUNT(DISTINCT t.id) as count
        FROM transactions t
        JOIN transaction_items ti ON ti.transaction_id = t.id
        WHERE date(t.created_at, 'localtime') BETWEEN ? AND ? AND ti.product_owner = ?
        GROUP BY t.cashier_name
      `, [startDate, endDate, owner]);

      const expenseRow = await dbGet(`
        SELECT SUM(amount) as total FROM expenses
        WHERE expense_date BETWEEN ? AND ? AND owner = ?
      `, [startDate, endDate, owner]);
      totalExpenses = expenseRow.total || 0;

      categoryBreakdown = await dbAll(`
        SELECT 
          COALESCE(p.category, 'Lainnya') as category,
          SUM(ti.subtotal) as amount,
          SUM(ti.quantity) as quantity
        FROM transaction_items ti
        JOIN transactions t ON ti.transaction_id = t.id
        LEFT JOIN products p ON ti.product_id = p.id
        WHERE date(t.created_at, 'localtime') BETWEEN ? AND ? AND ti.product_owner = ?
        GROUP BY category
        ORDER BY amount DESC
      `, [startDate, endDate, owner]);

    } else {
      summary = await dbGet(`
        SELECT 
          SUM(total_amount) as total_revenue,
          SUM(discount) as total_discount,
          SUM(tax) as total_tax,
          COUNT(*) as total_transactions
        FROM transactions
        WHERE date(created_at, 'localtime') BETWEEN ? AND ?
      `, [startDate, endDate]);

      profitData = await dbGet(`
        SELECT 
          SUM((ti.price_sell - COALESCE(p.price_buy, ti.price_sell * 0.7)) * ti.quantity) as total_profit,
          SUM(COALESCE(p.price_buy, 0) * ti.quantity) as total_hpp
        FROM transaction_items ti
        JOIN transactions t ON ti.transaction_id = t.id
        LEFT JOIN products p ON ti.product_id = p.id
        WHERE date(t.created_at, 'localtime') BETWEEN ? AND ?
      `, [startDate, endDate]);

      dailyData = await dbAll(`
        SELECT 
          date(t.created_at, 'localtime') as trans_date,
          COUNT(DISTINCT t.id) as trans_count,
          SUM(t.total_amount) as revenue,
          SUM((ti.price_sell - COALESCE(p.price_buy, ti.price_sell * 0.7)) * ti.quantity) as profit,
          SUM(COALESCE(p.price_buy, 0) * ti.quantity) as hpp
        FROM transactions t
        JOIN transaction_items ti ON ti.transaction_id = t.id
        LEFT JOIN products p ON ti.product_id = p.id
        WHERE date(t.created_at, 'localtime') BETWEEN ? AND ?
        GROUP BY trans_date
        ORDER BY trans_date ASC
      `, [startDate, endDate]);

      paymentBreakdown = await dbAll(`
        SELECT payment_method, SUM(total_amount) as amount, COUNT(*) as count
        FROM transactions
        WHERE date(created_at, 'localtime') BETWEEN ? AND ?
        GROUP BY payment_method
      `, [startDate, endDate]);

      cashierBreakdown = await dbAll(`
        SELECT cashier_name, SUM(total_amount) as amount, COUNT(*) as count
        FROM transactions
        WHERE date(created_at, 'localtime') BETWEEN ? AND ?
        GROUP BY cashier_name
      `, [startDate, endDate]);

      const expenseRow = await dbGet(`
        SELECT SUM(amount) as total FROM expenses
        WHERE expense_date BETWEEN ? AND ?
      `, [startDate, endDate]);
      totalExpenses = expenseRow.total || 0;

      categoryBreakdown = await dbAll(`
        SELECT 
          COALESCE(p.category, 'Lainnya') as category,
          SUM(ti.subtotal) as amount,
          SUM(ti.quantity) as quantity
        FROM transaction_items ti
        JOIN transactions t ON ti.transaction_id = t.id
        LEFT JOIN products p ON ti.product_id = p.id
        WHERE date(t.created_at, 'localtime') BETWEEN ? AND ?
        GROUP BY category
        ORDER BY amount DESC
      `, [startDate, endDate]);
    }

    const grossProfit = (summary.total_revenue || 0) - (profitData.total_hpp || 0) - (summary.total_discount || 0);

    res.json({
      summary: {
        revenue: summary.total_revenue || 0,
        discount: summary.total_discount || 0,
        tax: summary.total_tax || 0,
        transactions_count: summary.total_transactions || 0,
        hpp: profitData.total_hpp || 0,
        profit: grossProfit,
        expenses: totalExpenses,
        net_profit: grossProfit - totalExpenses
      },
      daily: dailyData,
      payment_breakdown: paymentBreakdown,
      cashier_breakdown: cashierBreakdown,
      category_breakdown: categoryBreakdown
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// ==================== ENDPOINT BACKUP & RESTORE (JSON) ====================

// Ekspor seluruh data
app.get('/api/data/export', async (req, res) => {
  try {
    const products = await dbAll('SELECT * FROM products');
    const transactions = await dbAll('SELECT * FROM transactions');
    const transactionItems = await dbAll('SELECT * FROM transaction_items');
    const stockEntries = await dbAll('SELECT * FROM stock_entries');
    const stockOpnames = await dbAll('SELECT * FROM stock_opnames');
    const stockOpnameItems = await dbAll('SELECT * FROM stock_opname_items');
    const voidLogs = await dbAll('SELECT * FROM void_logs');
    const categories = await dbAll('SELECT * FROM categories');
    const expenses = await dbAll('SELECT * FROM expenses');
    const cashSessions = await dbAll('SELECT * FROM cash_sessions');

    res.json({
      exported_at: new Date().toISOString(),
      products,
      transactions,
      transaction_items: transactionItems,
      stock_entries: stockEntries,
      stock_opnames: stockOpnames,
      stock_opname_items: stockOpnameItems,
      void_logs: voidLogs,
      categories,
      expenses,
      cash_sessions: cashSessions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Impor data
app.post('/api/data/import', (req, res) => {
  const { 
    products, 
    transactions, 
    transaction_items, 
    stock_entries, 
    stock_opnames, 
    stock_opname_items, 
    void_logs, 
    categories,
    expenses,
    cash_sessions
  } = req.body;

  if (!products || !transactions || !transaction_items) {
    return res.status(400).json({ error: 'Format data impor salah. Wajib mencakup products, transactions, dan transaction_items' });
  }

  db.serialize(async () => {
    try {
      await dbRun('BEGIN TRANSACTION');

      // Hapus tabel lama
      await dbRun('DELETE FROM transaction_items');
      await dbRun('DELETE FROM transactions');
      await dbRun('DELETE FROM products');
      await dbRun('DELETE FROM stock_entries');
      await dbRun('DELETE FROM stock_opname_items');
      await dbRun('DELETE FROM stock_opnames');
      await dbRun('DELETE FROM void_logs');
      await dbRun('DELETE FROM categories');
      await dbRun('DELETE FROM expenses');
      await dbRun('DELETE FROM cash_sessions');

      // Masukkan produk (mendukung is_service dan owner)
      if (products.length > 0) {
        const prodStmt = db.prepare(`
          INSERT INTO products (id, barcode, name, price_buy, price_sell, stock, category, is_service, owner, created_at) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        products.forEach((p) => {
          prodStmt.run(p.id, p.barcode, p.name, p.price_buy, p.price_sell, p.stock, p.category, p.is_service !== undefined ? p.is_service : 0, p.owner || 'Organisasi', p.created_at);
        });
        prodStmt.finalize();
      }

      // Masukkan transaksi
      if (transactions.length > 0) {
        const txStmt = db.prepare('INSERT INTO transactions (id, invoice_number, cashier_name, payment_method, total_amount, discount, tax, payment_amount, change_amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        transactions.forEach((t) => {
          txStmt.run(t.id, t.invoice_number, t.cashier_name, t.payment_method, t.total_amount, t.discount || 0, t.tax || 0, t.payment_amount, t.change_amount, t.created_at);
        });
        txStmt.finalize();
      }

      // Masukkan item transaksi (mendukung product_owner dan discount)
      if (transaction_items.length > 0) {
        const itemStmt = db.prepare(`
          INSERT INTO transaction_items (id, transaction_id, product_id, product_name, quantity, price_sell, subtotal, product_owner, discount) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        transaction_items.forEach((item) => {
          itemStmt.run(item.id, item.transaction_id, item.product_id, item.product_name, item.quantity, item.price_sell, item.subtotal, item.product_owner || 'Organisasi', item.discount || 0);
        });
        itemStmt.finalize();
      }

      // Masukkan stock entries (jika ada di berkas ekspor)
      if (stock_entries && stock_entries.length > 0) {
        const entryStmt = db.prepare('INSERT INTO stock_entries (id, product_id, product_name, barcode, quantity, supplier, notes, entry_date, recorded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        stock_entries.forEach((e) => {
          entryStmt.run(e.id, e.product_id, e.product_name, e.barcode, e.quantity, e.supplier, e.notes, e.entry_date, e.recorded_by, e.created_at);
        });
        entryStmt.finalize();
      }

      // Masukkan stock opnames (jika ada)
      if (stock_opnames && stock_opnames.length > 0) {
        const opnameStmt = db.prepare('INSERT INTO stock_opnames (id, opname_number, recorded_by, created_at) VALUES (?, ?, ?, ?)');
        stock_opnames.forEach((o) => {
          opnameStmt.run(o.id, o.opname_number, o.recorded_by, o.created_at);
        });
        opnameStmt.finalize();
      }

      // Masukkan stock opname items (jika ada)
      if (stock_opname_items && stock_opname_items.length > 0) {
        const opnameItemStmt = db.prepare('INSERT INTO stock_opname_items (id, opname_id, product_id, product_name, barcode, system_stock, physical_stock, difference) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        stock_opname_items.forEach((item) => {
          opnameItemStmt.run(item.id, item.opname_id, item.product_id, item.product_name, item.barcode, item.system_stock, item.physical_stock, item.difference);
        });
        opnameItemStmt.finalize();
      }

      // Masukkan void logs (mendukung owner)
      if (void_logs && void_logs.length > 0) {
        const voidStmt = db.prepare('INSERT INTO void_logs (id, invoice_number, cashier_name, total_amount, items_summary, reason, owner, void_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        void_logs.forEach((vl) => {
          voidStmt.run(vl.id, vl.invoice_number, vl.cashier_name, vl.total_amount, vl.items_summary, vl.reason, vl.owner || 'Organisasi', vl.void_at);
        });
        voidStmt.finalize();
      }

      // Masukkan categories (jika ada)
      if (categories && categories.length > 0) {
        const catStmt = db.prepare('INSERT OR IGNORE INTO categories (id, name, created_at) VALUES (?, ?, ?)');
        categories.forEach((c) => {
          catStmt.run(c.id, c.name, c.created_at);
        });
        catStmt.finalize();
      }

      // Masukkan expenses (jika ada)
      if (expenses && expenses.length > 0) {
        const expStmt = db.prepare('INSERT INTO expenses (id, description, amount, category, expense_date, owner, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
        expenses.forEach((e) => {
          expStmt.run(e.id, e.description, e.amount, e.category, e.expense_date, e.owner || 'Organisasi', e.created_at);
        });
        expStmt.finalize();
      }

      // Masukkan cash sessions (jika ada)
      if (cash_sessions && cash_sessions.length > 0) {
        const sessStmt = db.prepare('INSERT INTO cash_sessions (id, cashier_name, opened_at, closed_at, initial_cash, expected_cash, actual_cash, difference, total_cash_sales, total_cash_expenses, notes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        cash_sessions.forEach((s) => {
          sessStmt.run(s.id, s.cashier_name, s.opened_at, s.closed_at, s.initial_cash, s.expected_cash, s.actual_cash, s.difference, s.total_cash_sales, s.total_cash_expenses, s.notes, s.status);
        });
        sessStmt.finalize();
      }

      await dbRun('COMMIT');
      res.json({ message: 'Data berhasil diimpor. Database kasir dipulihkan.' });
    } catch (error) {
      await dbRun('ROLLBACK');
      res.status(500).json({ error: error.message });
    }
  });
});

// Kosongkan database (seluruh data atau riwayat transaksi saja)
app.post('/api/data/clear', (req, res) => {
  const { mode } = req.body;

  if (mode !== 'all' && mode !== 'transactions') {
    return res.status(400).json({ error: 'Mode pengosongan tidak valid' });
  }

  db.serialize(async () => {
    try {
      await dbRun('BEGIN TRANSACTION');

      if (mode === 'all') {
        await dbRun('DELETE FROM transaction_items');
        await dbRun('DELETE FROM transactions');
        await dbRun('DELETE FROM products');
        await dbRun('DELETE FROM stock_entries');
        await dbRun('DELETE FROM stock_opname_items');
        await dbRun('DELETE FROM stock_opnames');
        await dbRun('DELETE FROM void_logs');
        await dbRun('DELETE FROM categories');
      } else {
        await dbRun('DELETE FROM transaction_items');
        await dbRun('DELETE FROM transactions');
      }

      await dbRun('COMMIT');
      res.json({ message: mode === 'all' ? 'Database kasir berhasil dikosongkan total' : 'Riwayat penjualan kasir berhasil dibersihkan' });
    } catch (error) {
      await dbRun('ROLLBACK');
      res.status(500).json({ error: error.message });
    }
  });
});

// ==================== ENDPOINT API AUTHENTICATION & LOGIN ====================

// Login Endpoint
app.post('/api/auth/login', async (req, res) => {
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

// ==================== ENDPOINT API USERS (CASHIER CRUD) ====================

// Ambil daftar owner lengkap (Mendukung CRUD Owner)
app.get('/api/owners', async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM owners ORDER BY name ASC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Tambah owner baru (Hanya akses Admin)
app.post('/api/owners', async (req, res) => {
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
app.put('/api/owners/:id', async (req, res) => {
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
app.delete('/api/owners/:id', async (req, res) => {
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

// Ambil daftar kasir (Hanya akses Admin)
app.get('/api/users', async (req, res) => {
  try {
    const users = await dbAll('SELECT id, username, name, role, owner, created_at FROM users ORDER BY role ASC, name ASC');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Tambah kasir baru (Hanya akses Admin)
app.post('/api/users', async (req, res) => {
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
app.put('/api/users/:id', async (req, res) => {
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
app.delete('/api/users/:id', async (req, res) => {
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

// ==================== ENDPOINT API BARANG MASUK (STOCK IN/RESTOCK) ====================

// Ambil semua riwayat barang masuk (Restok) (Mendukung filter owner)
app.get('/api/stock/entries', async (req, res) => {
  try {
    const { owner } = req.query;
    let sql = 'SELECT se.* FROM stock_entries se';
    let params = [];
    
    if (owner && owner !== 'All' && owner !== 'undefined' && owner !== 'null') {
      sql += ' JOIN products p ON se.product_id = p.id WHERE p.owner = ?';
      params.push(owner);
    }
    
    sql += ' ORDER BY se.entry_date DESC, se.id DESC';
    const entries = await dbAll(sql, params);
    res.json(entries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Catat barang masuk baru dan update stok produk (Atomic)
app.post('/api/stock/entries', (req, res) => {
  const { product_id, quantity, supplier, notes, entry_date, recorded_by } = req.body;

  if (!product_id || !quantity || quantity <= 0 || !entry_date || !recorded_by) {
    return res.status(400).json({ error: 'Data barang masuk tidak lengkap atau kuantitas tidak valid' });
  }

  db.serialize(async () => {
    try {
      await dbRun('BEGIN TRANSACTION');

      // Ambil info produk eksisting
      const product = await dbGet('SELECT name, barcode FROM products WHERE id = ?', [product_id]);
      if (!product) {
        throw new Error('Produk tidak ditemukan');
      }

      // Insert ke stock_entries
      const sqlInsert = `
        INSERT INTO stock_entries (product_id, product_name, barcode, quantity, supplier, notes, entry_date, recorded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await dbRun(sqlInsert, [
        product_id,
        product.name,
        product.barcode || null,
        parseInt(quantity),
        supplier || '',
        notes || '',
        entry_date,
        recorded_by
      ]);

      // Update stok produk
      await dbRun('UPDATE products SET stock = stock + ? WHERE id = ?', [parseInt(quantity), product_id]);

      await dbRun('COMMIT');
      res.status(201).json({ message: 'Stok barang berhasil ditambahkan dan dicatat' });
    } catch (error) {
      await dbRun('ROLLBACK');
      res.status(400).json({ error: error.message });
    }
  });
});

// ==================== ENDPOINT API AUDIT STOCK OPNAME ====================

// Ambil semua riwayat stock opname (audit) (Mendukung filter owner)
app.get('/api/stock/opnames', async (req, res) => {
  try {
    const { owner } = req.query;
    let sql = 'SELECT * FROM stock_opnames';
    let params = [];
    
    if (owner && owner !== 'All' && owner !== 'undefined' && owner !== 'null') {
      sql = `
        SELECT DISTINCT so.* FROM stock_opnames so
        JOIN stock_opname_items soi ON soi.opname_id = so.id
        JOIN products p ON soi.product_id = p.id
        WHERE p.owner = ?
      `;
      params.push(owner);
    }
    
    sql += ' ORDER BY created_at DESC';
    const opnames = await dbAll(sql, params);
    res.json(opnames);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ambil rincian detail item dari suatu sesi stock opname (Mendukung filter owner)
app.get('/api/stock/opnames/:id', async (req, res) => {
  const { id } = req.params;
  const { owner } = req.query;
  try {
    const opname = await dbGet('SELECT * FROM stock_opnames WHERE id = ?', [id]);
    if (!opname) {
      return res.status(404).json({ error: 'Data stock opname tidak ditemukan' });
    }
    
    let sql = 'SELECT soi.* FROM stock_opname_items soi';
    let params = [id];
    
    if (owner && owner !== 'All' && owner !== 'undefined' && owner !== 'null') {
      sql += ' JOIN products p ON soi.product_id = p.id WHERE soi.opname_id = ? AND p.owner = ?';
      params.push(owner);
    } else {
      sql += ' WHERE soi.opname_id = ?';
    }
    
    const items = await dbAll(sql, params);
    res.json({ ...opname, items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Simpan hasil audit stock opname baru dan sesuaikan stok produk (Atomic)
app.post('/api/stock/opnames', (req, res) => {
  const { recorded_by, items } = req.body;

  if (!recorded_by || !items || items.length === 0) {
    return res.status(400).json({ error: 'Data stock opname tidak lengkap atau kosong' });
  }

  const todayStr = getLocalTodayDate().replace(/-/g, '');

  db.serialize(async () => {
    try {
      await dbRun('BEGIN TRANSACTION');

      // Generate nomor opname OP-YYYYMMDD-XXXX
      const dateWildcard = `OP-${todayStr}-%`;
      const countRow = await dbGet('SELECT COUNT(*) as count FROM stock_opnames WHERE opname_number LIKE ?', [dateWildcard]);
      const nextSeq = String(countRow.count + 1).padStart(4, '0');
      const opnameNumber = `OP-${todayStr}-${nextSeq}`;

      // Insert ke stock_opnames
      const opnameSql = 'INSERT INTO stock_opnames (opname_number, recorded_by) VALUES (?, ?)';
      const opnameResult = await dbRun(opnameSql, [opnameNumber, recorded_by]);
      const opnameId = opnameResult.lastID;

      // Loop items untuk disesuaikan stoknya & disimpan detail auditnya
      for (const item of items) {
        // Ambil stok sistem saat ini untuk audit log
        const product = await dbGet('SELECT stock, name, barcode FROM products WHERE id = ?', [item.product_id]);
        if (!product) {
          throw new Error(`Produk dengan ID ${item.product_id} tidak ditemukan`);
        }

        const systemStock = product.stock;
        const physicalStock = parseInt(item.physical_stock);
        const difference = physicalStock - systemStock;

        // Catat di stock_opname_items
        const itemSql = `
          INSERT INTO stock_opname_items (opname_id, product_id, product_name, barcode, system_stock, physical_stock, difference)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        await dbRun(itemSql, [
          opnameId,
          item.product_id,
          product.name,
          product.barcode || null,
          systemStock,
          physicalStock,
          difference
        ]);

        // Perbarui stok produk agar bernilai persis sama dengan stok fisik
        await dbRun('UPDATE products SET stock = ? WHERE id = ?', [physicalStock, item.product_id]);
      }

      await dbRun('COMMIT');
      res.status(201).json({
        message: 'Hasil stock opname berhasil disimpan dan stok produk telah disesuaikan',
        opname_number: opnameNumber
      });
    } catch (error) {
      await dbRun('ROLLBACK');
      console.error('Stock opname dibatalkan:', error.message);
      res.status(400).json({ error: error.message });
    }
  });
});

// ==================== ENDPOINT API CONFIG & INTEGRASI MIKROTIK ====================

// Helper to get MikroTik Config
function getMikroTikConfig() {
  const configPath = path.join(__dirname, 'config-mikrotik.json');
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

// ==================== ENDPOINT API PENGATURAN SISTEM ====================

// Ambil semua pengaturan
app.get('/api/settings', async (req, res) => {
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
app.post('/api/settings', async (req, res) => {
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

// Ambil konfigurasi MikroTik (password disensor)
app.get('/api/mikrotik/config', (req, res) => {
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
app.post('/api/mikrotik/config', (req, res) => {
  const { host, port, user, password, owner } = req.body;
  if (!host || !user) {
    return res.status(400).json({ error: 'IP Address dan Username wajib diisi' });
  }

  const configPath = path.join(__dirname, 'config-mikrotik.json');
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
app.post('/api/mikrotik/test', async (req, res) => {
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
app.get('/api/mikrotik/voucher/:code', async (req, res) => {
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

// ==================== ENDPOINT API BEBAN & PENGELUARAN ====================

// Ambil list pengeluaran berdasarkan filter tanggal dan owner
app.get('/api/expenses', async (req, res) => {
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
app.post('/api/expenses', async (req, res) => {
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
app.delete('/api/expenses/:id', async (req, res) => {
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

// ==================== ENDPOINT API PETTY CASH & SHIFT KASIR ====================

// Ambil shift aktif (jika ada)
app.get('/api/cash-sessions/active', async (req, res) => {
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
app.post('/api/cash-sessions/open', async (req, res) => {
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
app.post('/api/cash-sessions/close', async (req, res) => {
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
app.get('/api/cash-sessions', async (req, res) => {
  try {
    const rows = await dbAll("SELECT * FROM cash_sessions ORDER BY id DESC LIMIT 50");
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Jalankan Server
app.listen(PORT, () => {
  console.log(`Server Kasir berjalan di http://localhost:${PORT}`);
});
