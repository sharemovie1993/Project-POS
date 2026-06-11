# 📋 Kasirku POS — Panduan & Aturan Modularitas Proyek

Dokumen ini berisi standar arsitektur dan panduan pengkodean untuk menjaga kerapian kode proyek Kasirku POS. Seluruh pengembang (developer) wajib mengikuti aturan ini saat melakukan perbaikan, penambahan fitur, atau pembuatan modul baru.

---

## 🏛️ Arsitektur Folder Proyek

Proyek ini telah direfaktorisasi dari file tunggal raksasa (*God Files*) menjadi struktur modular berikut:

```
Project-POS/
├── server.js                    # Entry point aplikasi (Slim Bootstrapper)
├── project_rules.md             # Dokumen aturan proyek ini
├── test-api.js                  # Suite pengujian API otomatis (41 skenario)
├── db/                          # Modul database SQLite3
│   ├── connection.js            # Koneksi DB & helper DB promise
│   ├── init.js                  # Inisialisasi skema tabel awal
│   ├── migrations.js            # Riwayat migrasi skema database
│   └── seed.js                  # Data awal (dummy/starter seed)
├── utils/                       # Utilitas & pembantu backend
│   ├── logger.js                # logger pino/winston console banner
│   ├── helpers.js               # Enkripsi & helper penanggalan
│   └── mikrotik.js              # Router client connection pool
├── routes/                      # Route modules Express
│   ├── auth.js
│   ├── products.js
│   └── [domain-modul].js        # Modul route baru
└── public/                      # Static Assets (Frontend)
    ├── index.html               # Halaman utama aplikasi (HTML5)
    ├── css/                     # CSS Modul terpisah
    │   ├── variables.css        # Token CSS & Dark mode
    │   ├── reset.css            # Browser resets & typography
    │   ├── ...
    │   └── responsive.css       # Media queries responsif
    └── js/                      # JS Modul tanpa bundler
        ├── state.js             # Global state (Load pertama)
        ├── utils.js             # Helper format & string
        ├── ...
        └── app-init.js          # Bootstrapper DOMContentLoaded (Load terakhir)
```

---

## 🟢 1. Aturan Pengembangan Backend (Express Router)

Setiap endpoint API baru harus dipecah berdasarkan domain fungsionalitasnya dan ditaruh di dalam direktori `routes/`.

### Pembuatan File Route Baru
* Gunakan `express.Router()`.
* Jangan melakukan inisialisasi koneksi database baru (`sqlite3.Database`) di dalam route. Selalu import pembantu database promise (`dbRun`, `dbGet`, `dbAll`) dari `../db/connection.js`.
* Ekspor router menggunakan `module.exports = router;`.

*Contoh `routes/new-feature.js`:*
```javascript
const express = require('express');
const router = express.Router();
const { dbAll, dbRun } = require('../db/connection');
const { logger } = require('../utils/logger');

// GET /api/new-feature
router.get('/new-feature', async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM new_table');
    res.json(rows);
  } catch (err) {
    logger.error('Error fetching new feature:', err);
    res.status(500).json({ error: 'Gagal mengambil data' });
  }
});

module.exports = router;
```

### Registrasi di `server.js`
Setiap modul route baru wajib didaftarkan di dalam [server.js](file:///c:/Users/admin/Documents/Project-POS/server.js):
```javascript
const newFeatureRouter = require('./routes/new-feature');
// ...
app.use('/api', newFeatureRouter);
```

---

## 🔵 2. Aturan CSS Frontend (CSS Modules)

Kami menggunakan Vanilla CSS murni yang modular tanpa utility framework (Tailwind/Bootstrap). Gaya tampilan dipecah ke 17 CSS files.

### Penambahan Style Baru
* **Gunakan CSS Custom Properties**: Selalu gunakan warna bertema dari `variables.css` (misal: `var(--color-primary)`, `var(--text-main)`) untuk menjaga konsistensi UI & dark mode.
* **Kelompokkan Berdasarkan Modul**: Jika Anda membuat fitur baru (misal: "Voucher Promo"), buat file `public/css/promo.css` dan masukkan semua kelas khusus di sana.
* **Responsive Queries**: Taruh query `@media` responsif di dalam `responsive.css` agar tidak tersebar berantakan.
* **Daftarkan Link di HTML**: Import file CSS baru di `public/index.html` sebelum `responsive.css` dan `print.css`.

---

## 🟡 3. Aturan Javascript Frontend (JS Modules)

Karena aplikasi berjalan langsung pada browser **tanpa bundler/compiler** (seperti Webpack/Vite), kita menggunakan pola **Global Scope execution**.

### Manajemen State & Global Variables
* **state.js**: Semua variabel state global (misal: `cart`, `currentUser`, cache array) dideklarasikan sekali di [public/js/state.js](file:///c:/Users/admin/Documents/Project-POS/public/js/state.js).
* **Hindari SyntaxError**: Jangan menggunakan kata kunci `let` atau `const` pada level global di file modul baru untuk variabel yang sudah terdaftar di `state.js`. Anda cukup menggunakan mutasi langsung (misal: `cart = [...]`).
* **Format Penamaan Fungsi**: Buat nama fungsi yang deskriptif dan unik untuk menghindari tabrakan nama fungsi di global scope (namespace pollution).

### Struktur File Modul JS Baru
* Buat berkas baru di `public/js/[nama-modul].js`.
* Kelompokkan logika CRUD UI, interaksi DOM, dan pemanggilan API endpoint di sini.

*Contoh `public/js/promo.js`:*
```javascript
// Mengakses state global dari state.js langsung
async function fetchPromoList() {
  try {
    const response = await fetch(`${API_URL}/api/promos`);
    if (response.ok) {
      dbPromos = await response.json(); // Mengisi global state cache
      renderPromoTable();
    }
  } catch (error) {
    console.error('Gagal memuat promo:', error);
  }
}

function renderPromoTable() {
  const container = document.getElementById('promoTableBody');
  if (!container) return;
  // Logika manipulasi DOM...
}
```

### Aturan Load Script di `public/index.html`
Urutan pemuatan script di index.html sangat penting untuk menghindari error `undefined` variable/function:
1. **Library Vendor** (Lucide, Chart.js, HTML5-QRCode) dimuat paling atas.
2. **State & Core Utilities** (`state.js`, `utils.js`, `audio.js`, `toast.js`) dimuat berikutnya.
3. **Modul CRUD & Fitur** (`products.js`, `navigation.js`, modul baru Anda) dimuat di tengah.
4. **Bootstrapper** (`app-init.js`) wajib diletakkan di **paling akhir** (load last) agar seluruh fungsi di modul lain sudah terdefinisi saat DOMContentLoaded dijalankan.

---

## 🔴 4. Prosedur Pengujian & Kontrol Kualitas (QA)

Setiap kali Anda mengubah struktur kode backend atau frontend, jalankan langkah-langkah verifikasi berikut sebelum melakukan commit:

### 1. Uji Validitas Syntax Javascript (Frontend)
Jalankan perintah Node.js ini untuk memverifikasi bahwa tidak ada kesalahan deklarasi atau typo yang memecahkan parser browser:
```powershell
node -e "const fs = require('fs'); const path = require('path'); const files = fs.readdirSync('public/js').filter(f => f.endsWith('.js')); files.forEach(f => { try { const code = fs.readFileSync(path.join('public/js', f), 'utf8'); new Function(code); } catch(e) { console.error(f, 'ERROR:', e.message); process.exit(1); } }); console.log('Semua script JS lolos parser check!');"
```

### 2. Uji Integrasi API Backend
Jalankan regression test suite untuk memastikan tidak ada logika rute bisnis yang rusak:
```powershell
node test-api.js
```
*Pastikan hasil menunjukkan:* `Total Uji: 41 | [PASS]: 41 | [FAIL]: 0`.

### 3. Validasi Manual Browser
* Jalankan server (`node server.js`).
* Buka aplikasi di Google Chrome/Firefox devtools.
* Masuk sebagai Kasir / Admin, pastikan konsol bebas dari error berwarna merah (`Uncaught ReferenceError` / `SyntaxError`).
