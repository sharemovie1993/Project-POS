const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { DB_NAME, logger } = require('../utils/logger');

// Database setup - menggunakan DB_NAME dari env
const dbPath = path.join(__dirname, '..', DB_NAME);
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    logger.error('Koneksi database gagal:', err.message);
  } else {
    logger.info('Database SQLite terhubung di:', dbPath);
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

module.exports = { db, dbRun, dbGet, dbAll };
