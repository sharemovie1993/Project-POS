/**
 * Kasirku POS - State Variables Module
 */

// API Base URL
const API_URL = '';

// Application States
let activeScreen = 'pos';
let activeReportTab = 'today';
let activeCashier = 'Admin Toko';
let currentPaymentMethod = 'TUNAI';
let cart = [];
let dbProducts = []; // Tempat cache data pencarian produk
let dbUsers = [];    // Tempat cache data kasir/users
let dbCategories = []; // Cache data kategori produk
let selectedDropdownIndex = -1; // Untuk navigasi arrow pencarian manual
let activeTransactionReceipt = null; // Menyimpan struk transaksi aktif
let currentUser = null; // Menyimpan user yang sedang login aktif
let opnameCart = [];
let activeOpnameTab = 'new';
let dbStockOpnames = [];
let dbOwners = []; // Cache list owner
let systemSettings = {};
let uploadedStoreLogoBase64 = '';

// Additional States
let lastScannedBarcode = '';
let lastScannedTime = 0;
let cameraTargetInputId = null;
let activeCatalogTab = 'list';
let dbStockEntries = [];
let selectedRestockProductIndex = -1;
let dbAllCategoriesWithCount = [];
let activeCashSession = null;
let trendChartInstance = null;
let pieChartInstance = null;

// Cashier Premium Feature States
let heldTransactions = JSON.parse(localStorage.getItem('held_transactions') || '[]');
let selectedCustomer = null;
let dbCustomers = [];
let splitCashAmount = 0;
let splitNonCashAmount = 0;
