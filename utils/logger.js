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

module.exports = { NODE_ENV, PORT, DB_NAME, LOG_LEVEL, logger };
