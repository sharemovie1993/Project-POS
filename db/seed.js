const { db, dbRun, dbGet } = require('./connection');
const { hashPassword } = require('../utils/helpers');

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

module.exports = { seedDummyProducts, seedDummyUsers, seedDummyCategories };
