// Load environment variables PERTAMA sebelum apapun
const path = require('path');
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
require('dotenv').config({ path: path.join(__dirname, envFile) });

const express = require('express');
const cors = require('cors');
const { PORT, HOST, logger } = require('./utils/logger');
const { initializeDatabase } = require('./db/init');

// Global flags
global.isMikrotikEnabled = true;

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Inisialisasi Database
initializeDatabase();

// Mount Routes (Semua route menggunakan path absolute /api/... dari path module-nya masing-masing)
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/categories'));
app.use('/', require('./routes/products'));
app.use('/', require('./routes/owners'));
app.use('/', require('./routes/users'));
app.use('/', require('./routes/customers'));
app.use('/', require('./routes/settings'));
app.use('/', require('./routes/transactions'));
app.use('/', require('./routes/void'));
app.use('/', require('./routes/reports'));
app.use('/', require('./routes/stock'));
app.use('/', require('./routes/mikrotik'));
app.use('/', require('./routes/expenses'));
app.use('/', require('./routes/cash-sessions'));
app.use('/', require('./routes/data'));

// Jalankan Server
app.listen(PORT, HOST, () => {
  console.log(`Server Kasir berjalan di http://${HOST}:${PORT}`);
});
