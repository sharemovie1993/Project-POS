const { dbRun, dbGet } = require('./connection');
const { runMigrations } = require('./migrations');
const { seedDummyProducts, seedDummyUsers, seedDummyCategories } = require('./seed');
const { logger } = require('../utils/logger');

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

module.exports = { initializeDatabase };
