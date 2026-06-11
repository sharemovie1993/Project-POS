// Load environment variables dynamically
const path = require('path');
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
require('dotenv').config({ path: path.join(__dirname, envFile) });

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

async function runTests() {
  console.log('\n=======================================================');
  console.log('      MEMULAI PENGUJIAN API ENDPOINT KASIRKU POS');
  console.log('=======================================================\n');

  let passed = 0;
  let failed = 0;
  let tempProductId = null;
  let tempTransactionId = null;
  const tempBarcode = '9999999999999';

  // Helper to assert
  const assertTest = (name, condition, details = '') => {
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.log(`[FAIL] ${name} ${details ? '-> ' + details : ''}`);
      failed++;
    }
  };

  try {
    // Inisialisasi awal: Aktifkan MikroTik untuk pengetesan terpadu
    try {
      await fetch(`${BASE_URL}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mikrotik_enabled: '1' })
      });
    } catch (e) {}
    // ----------------------------------------------------
    // TEST 1: GET /api/products (Ambil Semua Produk)
    // ----------------------------------------------------
    try {
      const res = await fetch(`${BASE_URL}/api/products`);
      const products = await res.json();
      assertTest(
        'GET /api/products (Ambil Semua Produk)',
        res.status === 200 && Array.isArray(products) && products.length >= 8,
        `Status: ${res.status}, Jumlah Produk: ${products ? products.length : 0}`
      );
    } catch (e) {
      assertTest('GET /api/products (Ambil Semua Produk)', false, e.message);
    }

    // ----------------------------------------------------
    // TEST 2: POST /api/products (Tambah Produk Baru)
    // ----------------------------------------------------
    try {
      const res = await fetch(`${BASE_URL}/api/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barcode: tempBarcode,
          name: 'Produk Test API',
          price_buy: 1000,
          price_sell: 2000,
          stock: 10,
          category: 'Lainnya'
        })
      });
      const data = await res.json();
      tempProductId = data.id;
      assertTest(
        'POST /api/products (Tambah Produk Baru)',
        res.status === 201 && data.barcode === tempBarcode && data.id !== undefined,
        `Status: ${res.status}, ID Baru: ${tempProductId}`
      );
    } catch (e) {
      assertTest('POST /api/products (Tambah Produk Baru)', false, e.message);
    }

    // ----------------------------------------------------
    // TEST 3: PUT /api/products/:id (Ubah Detail Produk)
    // ----------------------------------------------------
    if (tempProductId) {
      try {
        const res = await fetch(`${BASE_URL}/api/products/${tempProductId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            barcode: tempBarcode,
            name: 'Produk Test API (Diubah)',
            price_buy: 1100,
            price_sell: 2200,
            stock: 15,
            category: 'Makanan'
          })
        });
        const data = await res.json();
        assertTest(
          'PUT /api/products/:id (Ubah Detail Produk)',
          res.status === 200 && data.name === 'Produk Test API (Diubah)' && data.stock === 15,
          `Status: ${res.status}, Nama Baru: ${data.name}`
        );
      } catch (e) {
        assertTest('PUT /api/products/:id (Ubah Detail Produk)', false, e.message);
      }
    } else {
      console.log('[SKIP] PUT /api/products/:id (Tambahan produk gagal sebelumnya)');
    }

    // ----------------------------------------------------
    // TEST 4: POST /api/transactions (Simpan Transaksi / Checkout)
    // ----------------------------------------------------
    let initialIndomieStock = 0;
    try {
      // Ambil stock indomie sebelum transaksi (Barcode Indomie Goreng: 8998866200559)
      const resStock = await fetch(`${BASE_URL}/api/products?barcode=8998866200559`);
      const prods = await resStock.json();
      if (prods.length > 0) {
        initialIndomieStock = prods[0].stock;
      }

      // Jalankan transaksi belanja: beli 2 Indomie Goreng (id=1)
      const res = await fetch(`${BASE_URL}/api/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cashier_name: 'Kasir Uji Coba',
          payment_method: 'TUNAI',
          total_amount: 7000, // 2 x 3500
          discount: 0,
          tax: 0,
          payment_amount: 10000,
          change_amount: 3000,
          items: [
            {
              product_id: 1, // ID Indomie dummy
              product_name: 'Indomie Goreng Spesial',
              quantity: 2,
              price_sell: 3500,
              subtotal: 7000
            }
          ]
        })
      });
      const data = await res.json();
      tempTransactionId = data.transaction ? data.transaction.id : null;
      assertTest(
        'POST /api/transactions (Simpan Transaksi / Checkout)',
        res.status === 201 && data.invoice_number !== undefined,
        `Status: ${res.status}, No Invoice: ${data.invoice_number}`
      );
    } catch (e) {
      assertTest('POST /api/transactions (Simpan Transaksi / Checkout)', false, e.message);
    }

    // ----------------------------------------------------
    // TEST 5: Verifikasi Pengurangan Stok di Database
    // ----------------------------------------------------
    try {
      const resStock = await fetch(`${BASE_URL}/api/products?barcode=8998866200559`);
      const prods = await resStock.json();
      const newStock = prods[0].stock;
      assertTest(
        'Verifikasi Pengurangan Stok Produk di Database',
        newStock === initialIndomieStock - 2,
        `Stok Indomie Awal: ${initialIndomieStock}, Sekarang: ${newStock} (Berkurang 2)`
      );
    } catch (e) {
      assertTest('Verifikasi Pengurangan Stok Produk', false, e.message);
    }

    // ----------------------------------------------------
    // TEST 6: GET /api/transactions (Daftar Semua Transaksi)
    // ----------------------------------------------------
    try {
      const res = await fetch(`${BASE_URL}/api/transactions`);
      const list = await res.json();
      assertTest(
        'GET /api/transactions (Daftar Semua Transaksi)',
        res.status === 200 && Array.isArray(list) && list.length >= 1,
        `Status: ${res.status}, Total Transaksi Tercatat: ${list.length}`
      );
    } catch (e) {
      assertTest('GET /api/transactions (Daftar Semua Transaksi)', false, e.message);
    }

    // ----------------------------------------------------
    // TEST 7: GET /api/transactions/:id (Ambil Rincian Transaksi)
    // ----------------------------------------------------
    if (tempTransactionId) {
      try {
        const res = await fetch(`${BASE_URL}/api/transactions/${tempTransactionId}`);
        const data = await res.json();
        assertTest(
          'GET /api/transactions/:id (Ambil Rincian Transaksi)',
          res.status === 200 && data.items.length === 1 && data.items[0].product_id === 1,
          `Status: ${res.status}, Jumlah Item di Struk: ${data.items ? data.items.length : 0}`
        );
      } catch (e) {
        assertTest('GET /api/transactions/:id (Ambil Rincian Transaksi)', false, e.message);
      }
    } else {
      console.log('[SKIP] GET /api/transactions/:id (Transaksi gagal sebelumnya)');
    }

    // ----------------------------------------------------
    // TEST 8: GET /api/dashboard/summary (Ringkasan Dashboard)
    // ----------------------------------------------------
    try {
      const res = await fetch(`${BASE_URL}/api/dashboard/summary`);
      const summary = await res.json();
      assertTest(
        'GET /api/dashboard/summary (Dashboard Stats)',
        res.status === 200 && summary.today_revenue >= 7000 && summary.today_transactions >= 1,
        `Status: ${res.status}, Omset Hari Ini: Rp ${summary.today_revenue}, Transaksi: ${summary.today_transactions}`
      );
    } catch (e) {
      assertTest('GET /api/dashboard/summary', false, e.message);
    }

    // ----------------------------------------------------
    // TEST 9: GET /api/reports/today (Laporan Hari Ini)
    // ----------------------------------------------------
    try {
      const res = await fetch(`${BASE_URL}/api/reports/today`);
      const report = await res.json();
      assertTest(
        'GET /api/reports/today (Laporan Hari Ini)',
        res.status === 200 && report.sold_items.length >= 1 && report.transactions.length >= 1,
        `Status: ${res.status}, Revenue: Rp ${report.revenue}, Laba Kotor: Rp ${report.profit}`
      );
    } catch (e) {
      assertTest('GET /api/reports/today', false, e.message);
    }

    // ----------------------------------------------------
    // TEST 10: GET /api/reports/products (Laporan Stok & Inventaris)
    // ----------------------------------------------------
    try {
      const res = await fetch(`${BASE_URL}/api/reports/products`);
      const report = await res.json();
      const hasServiceInLowStock = report.low_stock_products.some(p => p.is_service === 1);
      assertTest(
        'GET /api/reports/products (Laporan Stok & Kecualikan Jasa)',
        res.status === 200 && report.total_skus >= 8 && report.asset_value_cost > 0 && !hasServiceInLowStock,
        `Status: ${res.status}, Total SKU: ${report.total_skus}, Low Stock Count: ${report.low_stock_products.length}, Jasa Terkecualikan: ${!hasServiceInLowStock}`
      );
    } catch (e) {
      assertTest('GET /api/reports/products (Laporan Stok & Kecualikan Jasa)', false, e.message);
    }

    // ----------------------------------------------------
    // TEST 11: GET /api/reports/finance (Laporan Keuangan berbasis Tanggal)
    // ----------------------------------------------------
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const todayStr = `${year}-${month}-${day}`;
      const res = await fetch(`${BASE_URL}/api/reports/finance?startDate=${todayStr}&endDate=${todayStr}`);
      const report = await res.json();
      assertTest(
        'GET /api/reports/finance (Laporan Laba/Rugi)',
        res.status === 200 && report.summary.revenue >= 7000 && report.daily.length >= 1,
        `Status: ${res.status}, Omset Periode: Rp ${report.summary.revenue}, Profit Bersih: Rp ${report.summary.profit}`
      );
    } catch (e) {
      assertTest('GET /api/reports/finance', false, e.message);
    }

    // ----------------------------------------------------
    // TEST 12: GET /api/data/export (Unduh Backup Database JSON)
    // ----------------------------------------------------
    try {
      const res = await fetch(`${BASE_URL}/api/data/export`);
      const backup = await res.json();
      assertTest(
        'GET /api/data/export (Backup Database JSON)',
        res.status === 200 && Array.isArray(backup.products) && Array.isArray(backup.transactions),
        `Status: ${res.status}, SKU Ter-backup: ${backup.products ? backup.products.length : 0}, Transaksi Ter-backup: ${backup.transactions ? backup.transactions.length : 0}`
      );
    } catch (e) {
      assertTest('GET /api/data/export', false, e.message);
    }

    // ----------------------------------------------------
    // TEST 13: DELETE /api/products/:id (Pembersihan Produk Uji Coba)
    // ----------------------------------------------------
    if (tempProductId) {
      try {
        const res = await fetch(`${BASE_URL}/api/products/${tempProductId}`, { method: 'DELETE' });
        const data = await res.json();
        assertTest(
          'DELETE /api/products/:id (Pembersihan Produk Uji Coba)',
          res.status === 200 && data.message !== undefined,
          `Status: ${res.status}, Pesan: ${data.message}`
        );
      } catch (e) {
        assertTest('DELETE /api/products/:id', false, e.message);
      }
    }

    // ----------------------------------------------------
    // TEST 14: POST /api/auth/login (Login Admin & Kasir)
    // ----------------------------------------------------
    let token = null; // if using tokens, but here we check basic json auth response
    try {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'admin123' })
      });
      const data = await res.json();
      assertTest(
        'POST /api/auth/login (Login Admin Berhasil)',
        res.status === 200 && data.user !== undefined && data.user.role === 'admin',
        `Status: ${res.status}, User: ${data.user ? data.user.name : 'null'}`
      );
    } catch (e) {
      assertTest('POST /api/auth/login (Login Admin Berhasil)', false, e.message);
    }

    try {
      const res = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'salah_password' })
      });
      const data = await res.json();
      assertTest(
        'POST /api/auth/login (Cegah Password Salah)',
        res.status === 401 && data.error !== undefined,
        `Status: ${res.status}, Error: ${data.error}`
      );
    } catch (e) {
      assertTest('POST /api/auth/login (Cegah Password Salah)', false, e.message);
    }

    // ----------------------------------------------------
    // TEST 15: GET /api/users (Daftar Semua User/Kasir)
    // ----------------------------------------------------
    try {
      const res = await fetch(`${BASE_URL}/api/users`);
      const users = await res.json();
      assertTest(
        'GET /api/users (Daftar Kasir)',
        res.status === 200 && Array.isArray(users) && users.length >= 3,
        `Status: ${res.status}, Jumlah Akun: ${users ? users.length : 0}`
      );
    } catch (e) {
      assertTest('GET /api/users (Daftar Kasir)', false, e.message);
    }

    // ----------------------------------------------------
    // TEST 16: POST /api/users (Tambah Kasir Baru)
    // ----------------------------------------------------
    let tempUserId = null;
    try {
      const res = await fetch(`${BASE_URL}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'kasir_uji',
          name: 'Kasir Uji Coba Baru',
          password: 'passworduji123',
          role: 'cashier'
        })
      });
      const data = await res.json();
      tempUserId = data.id;
      assertTest(
        'POST /api/users (Tambah Kasir Baru)',
        res.status === 201 && data.username === 'kasir_uji',
        `Status: ${res.status}, ID Baru: ${tempUserId}`
      );
    } catch (e) {
      assertTest('POST /api/users (Tambah Kasir Baru)', false, e.message);
    }

    // ----------------------------------------------------
    // TEST 17: PUT /api/users/:id (Ubah Detail Kasir)
    // ----------------------------------------------------
    if (tempUserId) {
      try {
        const res = await fetch(`${BASE_URL}/api/users/${tempUserId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'kasir_uji_ubah',
            name: 'Kasir Uji Coba Diubah',
            role: 'cashier',
            password: '' // kosongkan password
          })
        });
        const data = await res.json();
        assertTest(
          'PUT /api/users/:id (Ubah Detail Kasir)',
          res.status === 200 && data.name === 'Kasir Uji Coba Diubah' && data.username === 'kasir_uji_ubah',
          `Status: ${res.status}, Username Baru: ${data.username}`
        );
      } catch (e) {
        assertTest('PUT /api/users/:id (Ubah Detail Kasir)', false, e.message);
      }
    }

    // ----------------------------------------------------
    // TEST 18: DELETE /api/users/:id (Hapus Akun Kasir Uji)
    // ----------------------------------------------------
    if (tempUserId) {
      try {
        const res = await fetch(`${BASE_URL}/api/users/${tempUserId}`, { method: 'DELETE' });
        const data = await res.json();
        assertTest(
          'DELETE /api/users/:id (Hapus Kasir Uji Coba)',
          res.status === 200 && data.message !== undefined,
          `Status: ${res.status}, Pesan: ${data.message}`
        );
      } catch (e) {
        assertTest('DELETE /api/users/:id (Hapus Kasir Uji Coba)', false, e.message);
      }
    }

    // ----------------------------------------------------
    // TEST 19: POST /api/stock/entries (Pencatatan Barang Masuk / Restok)
    // ----------------------------------------------------
    let initialIndomieStockRestock = 0;
    try {
      // Ambil stock indomie sebelum restok (Barcode Indomie Goreng: 8998866200559)
      const resStock = await fetch(`${BASE_URL}/api/products?barcode=8998866200559`);
      const prods = await resStock.json();
      if (prods.length > 0) {
        initialIndomieStockRestock = prods[0].stock;
      }

      // Restok 50 unit Indomie Goreng (id = 1)
      const res = await fetch(`${BASE_URL}/api/stock/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: 1,
          quantity: 50,
          supplier: 'Supplier Uji',
          notes: 'PO-TEST-101',
          entry_date: new Date().toISOString().split('T')[0],
          recorded_by: 'Admin Uji'
        })
      });
      const data = await res.json();
      assertTest(
        'POST /api/stock/entries (Pencatatan Barang Masuk / Restok)',
        res.status === 201 && data.message !== undefined,
        `Status: ${res.status}, Pesan: ${data.message}`
      );
    } catch (e) {
      assertTest('POST /api/stock/entries (Pencatatan Barang Masuk / Restok)', false, e.message);
    }

    // ----------------------------------------------------
    // TEST 20: Verifikasi Stok Bertambah setelah Restok
    // ----------------------------------------------------
    try {
      const resStock = await fetch(`${BASE_URL}/api/products?barcode=8998866200559`);
      const prods = await resStock.json();
      const newStock = prods[0].stock;
      assertTest(
        'Verifikasi Stok Produk Bertambah setelah Restok',
        newStock === initialIndomieStockRestock + 50,
        `Stok Indomie Awal: ${initialIndomieStockRestock}, Sekarang: ${newStock} (Bertambah 50)`
      );
    } catch (e) {
      assertTest('Verifikasi Stok Produk Bertambah setelah Restok', false, e.message);
    }

    // ----------------------------------------------------
    // TEST 21: GET /api/stock/entries (Riwayat Barang Masuk)
    // ----------------------------------------------------
    try {
      const res = await fetch(`${BASE_URL}/api/stock/entries`);
      const entries = await res.json();
      assertTest(
        'GET /api/stock/entries (Daftar Riwayat Restok)',
        res.status === 200 && Array.isArray(entries) && entries.length >= 1 && entries[0].product_id === 1,
        `Status: ${res.status}, Total Riwayat: ${entries ? entries.length : 0}`
      );
    } catch (e) {
      assertTest('GET /api/stock/entries (Daftar Riwayat Restok)', false, e.message);
    }

    // ----------------------------------------------------
    // TEST 22: POST /api/stock/opnames (Simpan Hasil Audit Stock Opname)
    // ----------------------------------------------------
    let tempOpnameId = null;
    try {
      const res = await fetch(`${BASE_URL}/api/stock/opnames`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recorded_by: 'Admin Tester',
          items: [
            {
              product_id: 1, // Indomie Goreng
              physical_stock: 145 // sesuaikan stok sistem ke 145
            }
          ]
        })
      });
      const data = await res.json();
      assertTest(
        'POST /api/stock/opnames (Simpan Hasil Audit Stock Opname)',
        res.status === 201 && data.opname_number !== undefined,
        `Status: ${res.status}, No Opname: ${data.opname_number}`
      );
    } catch (e) {
      assertTest('POST /api/stock/opnames (Simpan Hasil Audit Stock Opname)', false, e.message);
    }

    // ----------------------------------------------------
    // TEST 23: Verifikasi Penyesuaian Stok Produk di Database
    // ----------------------------------------------------
    try {
      const resStock = await fetch(`${BASE_URL}/api/products?barcode=8998866200559`);
      const prods = await resStock.json();
      const newStock = prods[0].stock;
      assertTest(
        'Verifikasi Penyesuaian Stok Produk Setelah Opname',
        newStock === 145,
        `Stok Indomie Setelah Opname: ${newStock} (Disesuaikan ke 145)`
      );
    } catch (e) {
      assertTest('Verifikasi Penyesuaian Stok Produk Setelah Opname', false, e.message);
    }

    // ----------------------------------------------------
    // TEST 24: GET /api/stock/opnames (Riwayat Stock Opname)
    // ----------------------------------------------------
    try {
      const res = await fetch(`${BASE_URL}/api/stock/opnames`);
      const opnames = await res.json();
      if (opnames.length > 0) {
        tempOpnameId = opnames[0].id;
      }
      assertTest(
        'GET /api/stock/opnames (Riwayat Stock Opname)',
        res.status === 200 && Array.isArray(opnames) && opnames.length >= 1,
        `Status: ${res.status}, Total Riwayat Opname: ${opnames ? opnames.length : 0}`
      );
    } catch (e) {
      assertTest('GET /api/stock/opnames (Riwayat Stock Opname)', false, e.message);
    }

    // ----------------------------------------------------
    // TEST 25: GET /api/stock/opnames/:id (Rincian Sesi Opname)
    // ----------------------------------------------------
    if (tempOpnameId) {
      try {
        const res = await fetch(`${BASE_URL}/api/stock/opnames/${tempOpnameId}`);
        const data = await res.json();
        assertTest(
          'GET /api/stock/opnames/:id (Rincian Sesi Opname)',
          res.status === 200 && data.items.length === 1 && data.items[0].product_id === 1 && data.items[0].physical_stock === 145,
          `Status: ${res.status}, No Opname: ${data.opname_number}, Item: ${data.items ? data.items[0].product_name : ''}`
        );
      } catch (e) {
        assertTest('GET /api/stock/opnames/:id (Rincian Sesi Opname)', false, e.message);
      }
    } else {
      console.log('[SKIP] GET /api/stock/opnames/:id (Sesi opname gagal sebelumnya)');
    }

    // ----------------------------------------------------
    // TEST 26: GET /api/mikrotik/config (Ambil Konfigurasi MikroTik)
    // ----------------------------------------------------
    try {
      const res = await fetch(`${BASE_URL}/api/mikrotik/config`);
      const config = await res.json();
      assertTest(
        'GET /api/mikrotik/config (Ambil Seting MikroTik)',
        res.status === 200 && config.host !== undefined && config.port !== undefined,
        `Status: ${res.status}, Host: ${config.host || 'Kosong'}`
      );
    } catch (e) {
      assertTest('GET /api/mikrotik/config', false, e.message);
    }

    // ----------------------------------------------------
    // TEST 27: POST /api/mikrotik/config (Simpan Konfigurasi MikroTik)
    // ----------------------------------------------------
    try {
      const res = await fetch(`${BASE_URL}/api/mikrotik/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: '10.10.10.254', // Dummy IP
          port: 8728,
          user: 'admin',
          password: 'password123'
        })
      });
      const data = await res.json();
      assertTest(
        'POST /api/mikrotik/config (Simpan Seting MikroTik)',
        res.status === 200 && data.message !== undefined,
        `Status: ${res.status}, Pesan: ${data.message}`
      );
    } catch (e) {
      assertTest('POST /api/mikrotik/config', false, e.message);
    }

    // ----------------------------------------------------
    // TEST 28: POST /api/mikrotik/test (Tes Koneksi MikroTik - Expected Fail/Error Offline)
    // ----------------------------------------------------
    try {
      const res = await fetch(`${BASE_URL}/api/mikrotik/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: '10.10.10.254',
          port: 8728,
          user: 'admin',
          password: 'password123'
        })
      });
      const data = await res.json();
      // Karena IP di atas dummy, pasti gagal terkoneksi, yang penting respons API ditangani (status 400 dengan pesan error)
      assertTest(
        'POST /api/mikrotik/test (Endpoint Validasi Tes Koneksi)',
        res.status === 400 && data.error !== undefined && data.error.includes('Koneksi gagal'),
        `Status: ${res.status}, Error Terdeteksi: ${data.error}`
      );
    } catch (e) {
      assertTest('POST /api/mikrotik/test', false, e.message);
    }

    // ----------------------------------------------------
    // TEST 29: GET /api/mikrotik/voucher/:code (Validasi Voucher - Expected Fail/Error Offline)
    // ----------------------------------------------------
    try {
      const res = await fetch(`${BASE_URL}/api/mikrotik/voucher/WIFI-DUMMY-123`);
      const data = await res.json();
      // Karena router offline/dummy, endpoint akan mengembalikan error 500/400 koneksi
      assertTest(
        'GET /api/mikrotik/voucher/:code (Endpoint Validasi Voucher)',
        res.status === 500 && data.error !== undefined && data.error.includes('Gagal terhubung'),
        `Status: ${res.status}, Error Terdeteksi: ${data.error}`
      );
    } catch (e) {
      assertTest('GET /api/mikrotik/voucher/:code', false, e.message);
    }

    // ----------------------------------------------------
    // TEST 30: POST /api/transactions/:id/void (Void Transaksi & Pemulihan Stok & Log Audit)
    // ----------------------------------------------------
    try {
      // 1. Buat transaksi baru khusus untuk di-void
      // Ambil stock indomie sebelum transaksi (id=1, barcode: 8998866200559)
      const resStockBefore = await fetch(`${BASE_URL}/api/products?barcode=8998866200559`);
      const prodsBefore = await resStockBefore.json();
      const stockBefore = prodsBefore[0].stock;

      const resCreate = await fetch(`${BASE_URL}/api/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cashier_name: 'Kasir Audit Void',
          payment_method: 'TUNAI',
          total_amount: 3500,
          discount: 0,
          tax: 0,
          payment_amount: 5000,
          change_amount: 1500,
          items: [
            {
              product_id: 1,
              product_name: 'Indomie Goreng Spesial',
              quantity: 1,
              price_sell: 3500,
              subtotal: 3500
            }
          ]
        })
      });
      const dataCreate = await resCreate.json();
      const newTxId = dataCreate.transaction ? dataCreate.transaction.id : null;
      const invoiceNumber = dataCreate.invoice_number;

      assertTest(
        'POST /api/transactions (Pembuatan transaksi untuk di-void)',
        resCreate.status === 201 && newTxId !== null,
        `Status: ${resCreate.status}, ID Transaksi Baru: ${newTxId}`
      );

      if (newTxId) {
        // 2. Void transaksi tersebut
        const resVoid = await fetch(`${BASE_URL}/api/transactions/${newTxId}/void`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Salah input kuantitas barang oleh kasir' })
        });
        const dataVoid = await resVoid.json();
        
        assertTest(
          'POST /api/transactions/:id/void (Void Transaksi Berhasil)',
          resVoid.status === 200 && dataVoid.message.includes('berhasil dibatalkan'),
          `Status: ${resVoid.status}, Pesan: ${dataVoid.message}`
        );

        // 3. Verifikasi stok dikembalikan
        const resStockAfter = await fetch(`${BASE_URL}/api/products?barcode=8998866200559`);
        const prodsAfter = await resStockAfter.json();
        const stockAfter = prodsAfter[0].stock;

        assertTest(
          'Verifikasi Pemulihan Stok setelah Void',
          stockAfter === stockBefore,
          `Stok Awal: ${stockBefore}, Setelah Transaksi: ${stockBefore - 1}, Setelah Void: ${stockAfter}`
        );

        // 4. Verifikasi log audit tercatat
        const resLogs = await fetch(`${BASE_URL}/api/void-logs`);
        const logs = await resLogs.json();
        const matchingLog = logs.find(l => l.invoice_number === invoiceNumber);

        assertTest(
          'GET /api/void-logs (Verifikasi pencatatan log audit void)',
          resLogs.status === 200 && matchingLog !== undefined && matchingLog.reason === 'Salah input kuantitas barang oleh kasir',
          `Status: ${resLogs.status}, Log Ditemukan: ${!!matchingLog}, Alasan: ${matchingLog ? matchingLog.reason : 'N/A'}`
        );
      }
    } catch (e) {
      assertTest('TEST 30: Void Transaksi & Log Audit', false, e.message);
    }

    // ----------------------------------------------------
    // TEST 31: GET /api/transactions (Filter Tanggal dan Kasir)
    // ----------------------------------------------------
    try {
      const today = new Date().toISOString().slice(0, 10);
      const resFilter = await fetch(`${BASE_URL}/api/transactions?date=${today}&cashier=Kasir%20Uji%20Coba`);
      const txs = await resFilter.json();
      const hasCorrectCashier = txs.every(t => t.cashier_name === 'Kasir Uji Coba');
      
      assertTest(
        'GET /api/transactions?date=...&cashier=... (Filter Transaksi)',
        resFilter.status === 200 && txs.length > 0 && hasCorrectCashier,
        `Status: ${resFilter.status}, Jumlah Transaksi Terfilter: ${txs.length}, Kasir Sesuai: ${hasCorrectCashier}`
      );
    } catch (e) {
      assertTest('TEST 31: Filter Transaksi', false, e.message);
    }

    // ----------------------------------------------------
    // TEST 32: GET /api/settings (Ambil Status Integrasi)
    // ----------------------------------------------------
    try {
      const res = await fetch(`${BASE_URL}/api/settings`);
      const settings = await res.json();
      assertTest(
        'GET /api/settings (Ambil Status Integrasi)',
        res.status === 200 && settings.mikrotik_enabled !== undefined,
        `Status: ${res.status}, mikrotik_enabled: ${settings.mikrotik_enabled}`
      );
    } catch (e) {
      assertTest('TEST 32: GET /api/settings', false, e.message);
    }

    // ----------------------------------------------------
    // TEST 33: POST /api/settings (Simpan Status Integrasi)
    // ----------------------------------------------------
    try {
      // Nonaktifkan
      const resPostDisable = await fetch(`${BASE_URL}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mikrotik_enabled: '0' })
      });
      const dataDisable = await resPostDisable.json();

      // Verifikasi di-GET kembali
      const resGet = await fetch(`${BASE_URL}/api/settings`);
      const settingsGet = await resGet.json();

      // Kembalikan ke Aktif (default)
      await fetch(`${BASE_URL}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mikrotik_enabled: '1' })
      });

      assertTest(
        'POST /api/settings (Simpan & Toggle Status)',
        resPostDisable.status === 200 && dataDisable.success === true && settingsGet.mikrotik_enabled === '0',
        `Status POST: ${resPostDisable.status}, Success: ${dataDisable.success}, Status Baru: ${settingsGet.mikrotik_enabled}`
      );
    } catch (e) {
      assertTest('TEST 33: POST /api/settings', false, e.message);
    }

    // ----------------------------------------------------
    // TEST 34: POST /api/settings (Ubah Detail Branding Toko)
    // ----------------------------------------------------
    try {
      const payload = {
        store_name: 'Toko Uji Coba',
        store_address: 'Jl. Uji Coba No. 99',
        store_phone: '0899-9999-9999',
        store_logo: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        store_footer: 'Terima Kasih\nSelamat Berbelanja Kembali'
      };

      const resPost = await fetch(`${BASE_URL}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const dataPost = await resPost.json();

      // Verifikasi di-GET kembali
      const resGet = await fetch(`${BASE_URL}/api/settings`);
      const settingsGet = await resGet.json();

      // Kembalikan ke nilai default
      await fetch(`${BASE_URL}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_name: 'KASIRKU POS',
          store_address: 'Jl. Raya Toko Kasir No. 123',
          store_phone: '0812-3456-7890',
          store_logo: '',
          store_footer: 'Terima Kasih atas Kunjungan Anda\nBarang yang sudah dibeli\ntidak dapat ditukar/dikembalikan'
        })
      });

      const isMatch = settingsGet.store_name === 'Toko Uji Coba' && 
                      settingsGet.store_address === 'Jl. Uji Coba No. 99' &&
                      settingsGet.store_phone === '0899-9999-9999' &&
                      settingsGet.store_logo.startsWith('data:image/') &&
                      settingsGet.store_footer.includes('Selamat Berbelanja');

      assertTest(
        'POST /api/settings (Ubah Branding Toko)',
        resPost.status === 200 && dataPost.success === true && isMatch,
        `Status POST: ${resPost.status}, Success: ${dataPost.success}, Validasi Branding: ${isMatch}`
      );
    } catch (e) {
      assertTest('TEST 34: POST /api/settings (Branding)', false, e.message);
    }

    // ----------------------------------------------------
    // TEST 35: Petty Cash / Cash Sessions (Shift Kasir)
    // ----------------------------------------------------
    try {
      // 1. Pastikan jika ada shift aktif, ditutup terlebih dahulu agar clean state
      const resActiveCheck = await fetch(`${BASE_URL}/api/cash-sessions/active`);
      const activeSessionInit = await resActiveCheck.json();
      if (activeSessionInit) {
        await fetch(`${BASE_URL}/api/cash-sessions/close`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actual_cash: activeSessionInit.expected_cash, notes: 'Auto close for testing' })
        });
      }

      // 2. Buka shift baru
      const resOpen = await fetch(`${BASE_URL}/api/cash-sessions/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cashier_name: 'Kasir Uji 35', initial_cash: 100000 })
      });
      const dataOpen = await resOpen.json();

      // 3. Verifikasi shift aktif
      const resActive = await fetch(`${BASE_URL}/api/cash-sessions/active`);
      const sessionActive = await resActive.json();
      const openSuccess = resOpen.status === 200 && sessionActive && sessionActive.cashier_name === 'Kasir Uji 35' && sessionActive.initial_cash === 100000;

      // 4. Lakukan transaksi cash untuk menambah kas laci
      const resTx = await fetch(`${BASE_URL}/api/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cashier_name: 'Kasir Uji 35',
          payment_method: 'TUNAI',
          total_amount: 15000,
          discount: 0,
          tax: 0,
          payment_amount: 20000,
          change_amount: 5000,
          items: [
            {
              product_id: 1,
              product_name: 'Indomie Goreng Spesial',
              quantity: 3,
              price_sell: 5000,
              subtotal: 15000
            }
          ]
        })
      });
      const dataTx = await resTx.json();

      // 5. Cek expected_cash setelah transaksi
      const resActive2 = await fetch(`${BASE_URL}/api/cash-sessions/active`);
      const sessionActive2 = await resActive2.json();
      const expectedCashCorrect = sessionActive2 && sessionActive2.expected_cash === 115000 && sessionActive2.total_cash_sales === 15000;

      // 6. Tutup shift kasir
      const resClose = await fetch(`${BASE_URL}/api/cash-sessions/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actual_cash: 114000, notes: 'Uang hilang 1000' }) // Selisih -1000
      });
      const dataClose = await resClose.json();
      const closeSuccess = resClose.status === 200 && dataClose.success === true && dataClose.session.difference === -1000 && dataClose.session.status === 'CLOSED';

      assertTest(
        'TEST 35: Petty Cash / Shift Kasir Flow',
        openSuccess && expectedCashCorrect && closeSuccess,
        `Buka: ${openSuccess}, expected_cash (115000): ${sessionActive2 ? sessionActive2.expected_cash : 'N/A'}, Tutup & Selisih (-1000): ${dataClose.session ? dataClose.session.difference : 'N/A'}`
      );
    } catch (e) {
      assertTest('TEST 35: Petty Cash / Shift Kasir Flow', false, e.message);
    }

    // ----------------------------------------------------
    // TEST 36: Expenses CRUD & Finance Report Integration
    // ----------------------------------------------------
    try {
      // 1. Tambah pengeluaran baru
      const resAdd = await fetch(`${BASE_URL}/api/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'Beli Kertas Thermal Uji',
          amount: 25000,
          category: 'Operasional',
          expense_date: new Date().toISOString().split('T')[0],
          owner: 'Organisasi'
        })
      });
      const dataAdd = await resAdd.json();
      const expenseId = dataAdd.id;
      const addSuccess = resAdd.status === 200 && expenseId !== undefined;

      // 2. Ambil list pengeluaran dan pastikan pengeluaran yang baru dibuat ada
      const todayStr = new Date().toISOString().split('T')[0];
      const resGet = await fetch(`${BASE_URL}/api/expenses?startDate=${todayStr}&endDate=${todayStr}`);
      const expenses = await resGet.json();
      const getSuccess = resGet.status === 200 && Array.isArray(expenses) && expenses.some(e => e.id === expenseId);

      // 3. Verifikasi dampaknya di Laporan Keuangan (finance report)
      const resReport = await fetch(`${BASE_URL}/api/reports/finance?startDate=${todayStr}&endDate=${todayStr}`);
      const reportData = await resReport.json();
      const reportSuccess = resReport.status === 200 && reportData.summary && reportData.summary.expenses >= 25000;

      // 4. Hapus pengeluaran uji coba
      const resDel = await fetch(`${BASE_URL}/api/expenses/${expenseId}`, {
        method: 'DELETE'
      });
      const delSuccess = resDel.status === 200;

      assertTest(
        'TEST 36: Expenses CRUD & Finance Report Integration',
        addSuccess && getSuccess && reportSuccess && delSuccess,
        `Tambah: ${addSuccess}, List: ${getSuccess}, Laporan Finansial: ${reportSuccess}, Hapus: ${delSuccess}`
      );
    } catch (e) {
      assertTest('TEST 36: Expenses CRUD & Finance Report Integration', false, e.message);
    }

    // ----------------------------------------------------
    // TEST 37: Backup Database Export / Import Schema Check
    // ----------------------------------------------------
    try {
      // 1. Dapatkan backup database saat ini
      const resExport = await fetch(`${BASE_URL}/api/data/export`);
      const backupData = await resExport.json();
      const exportSuccess = resExport.status === 200 && Array.isArray(backupData.products) && Array.isArray(backupData.expenses) && Array.isArray(backupData.cash_sessions);

      // 2. Tambahkan dummy item di data backup untuk di-impor
      const modifiedBackup = JSON.parse(JSON.stringify(backupData));
      
      // Pastikan ada setidaknya 1 item dengan discount di transaction_items untuk testing
      if (modifiedBackup.transaction_items && modifiedBackup.transaction_items.length > 0) {
        modifiedBackup.transaction_items[0].discount = 500;
      }
      
      // Tambahkan dummy expense & cash session
      if (!modifiedBackup.expenses) modifiedBackup.expenses = [];
      modifiedBackup.expenses.push({
        id: 9999,
        description: 'Beban Sewa Backup Test',
        amount: 50000,
        category: 'Operasional',
        expense_date: '2026-06-11',
        owner: 'Organisasi',
        created_at: new Date().toISOString()
      });

      if (!modifiedBackup.cash_sessions) modifiedBackup.cash_sessions = [];
      modifiedBackup.cash_sessions.push({
        id: 9999,
        cashier_name: 'Kasir Backup Test',
        opened_at: new Date().toISOString(),
        closed_at: new Date().toISOString(),
        initial_cash: 50000,
        expected_cash: 50000,
        actual_cash: 50000,
        difference: 0,
        total_cash_sales: 0,
        total_cash_expenses: 0,
        notes: 'Backup Test Session',
        status: 'CLOSED'
      });

      // 3. Impor data backup yang dimodifikasi
      const resImport = await fetch(`${BASE_URL}/api/data/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modifiedBackup)
      });
      const dataImport = await resImport.json();
      const importSuccess = resImport.status === 200 && (dataImport.success === true || dataImport.message !== undefined);

      // 4. Ekspor kembali untuk memverifikasi data dummy ada di database
      const resExportVerify = await fetch(`${BASE_URL}/api/data/export`);
      const verifiedData = await resExportVerify.json();
      const verifySuccess = resExportVerify.status === 200 && 
                            verifiedData.expenses.some(e => e.id === 9999) &&
                            verifiedData.cash_sessions.some(s => s.id === 9999);

      // 5. Bersihkan data dummy dengan mengembalikan backup asli
      await fetch(`${BASE_URL}/api/data/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backupData)
      });

      assertTest(
        'TEST 37: Backup Database Export / Import Schema Check',
        exportSuccess && importSuccess && verifySuccess,
        `Ekspor Awal: ${exportSuccess}, Impor: ${importSuccess}, Verifikasi: ${verifySuccess}`
      );
    } catch (e) {
      assertTest('TEST 37: Backup Database Export / Import Schema Check', false, e.message);
    }

  } catch (err) {
    console.error('Pengujian terhenti karena kesalahan fatal:', err.message);
  }

  console.log('\n=======================================================');
  console.log('              HASIL PENGUJIAN AKHIR API');
  console.log(`  Total Uji: ${passed + failed} | [PASS]: ${passed} | [FAIL]: ${failed}`);
  console.log('=======================================================\n');
  
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
