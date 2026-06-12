const { dbRun, dbGet } = require('./connection');
const { logger } = require('../utils/logger');

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
      await dbRun("INSERT OR IGNORE INTO settings (key, value) VALUES ('store_footer', 'Terima Kasih atas Kunjungan Anda\\nBarang yang sudah dibeli\\ntidak dapat ditukar/dikembalikan')");
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
  },
  {
    version: 7,
    date: '2026-06-12',
    desc: 'Tambah tabel customers dan kolom customer/split-payment di tabel transactions',
    up: async () => {
      // 1. Buat tabel customers
      await dbRun(`
        CREATE TABLE IF NOT EXISTS customers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          phone TEXT,
          discount_percent REAL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
      logger.info('Migrasi v7: tabel customers berhasil dibuat');

      // Seeding awal default customers jika kosong
      const countRow = await dbGet('SELECT COUNT(*) as count FROM customers');
      if (countRow.count === 0) {
        const defaultMembers = [
          { name: 'Budi Santoso', phone: '081234567890', discount: 5 },
          { name: 'Dewi Sartika', phone: '089876543210', discount: 10 },
          { name: 'Ahmad Faisal', phone: '085223344556', discount: 0 }
        ];
        for (const member of defaultMembers) {
          await dbRun('INSERT INTO customers (name, phone, discount_percent) VALUES (?, ?, ?)', [member.name, member.phone, member.discount]);
        }
        logger.info('Migrasi v7: seeding data pelanggan default selesai');
      }

      // 2. Tambahkan kolom-kolom baru di tabel transactions
      try {
        await dbRun('ALTER TABLE transactions ADD COLUMN customer_name TEXT');
        logger.info('Migrasi v7: kolom customer_name ditambahkan ke tabel transactions');
      } catch (e) { /* skip */ }

      try {
        await dbRun('ALTER TABLE transactions ADD COLUMN customer_id TEXT');
        logger.info('Migrasi v7: kolom customer_id ditambahkan ke tabel transactions');
      } catch (e) { /* skip */ }

      try {
        await dbRun('ALTER TABLE transactions ADD COLUMN payment_details TEXT');
        logger.info('Migrasi v7: kolom payment_details ditambahkan ke tabel transactions');
      } catch (e) { /* skip */ }
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

module.exports = { runMigrations };
