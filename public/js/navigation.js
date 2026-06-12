/**
 * Kasirku POS - Navigation & Theme Controller Module
 */

function switchScreen(screenId) {
  // Tutup mobile sidebar/overlay saat berpindah halaman
  const sidebar = document.getElementById('appSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar && overlay) {
    sidebar.classList.remove('sidebar-open');
    overlay.classList.remove('active');
  }

  // Jika level kasir mencoba masuk area terlarang, paksa ke POS
  if (currentUser && currentUser.role === 'cashier' && screenId !== 'pos') {
    screenId = 'pos';
    showToast('Akses dibatasi! Menu ini hanya dapat diakses oleh Admin.', 'warning');
  }

  // Jika level admin mencoba masuk area kasir POS, paksa ke Katalog Barang
  if (currentUser && currentUser.role === 'admin' && screenId === 'pos') {
    screenId = 'products';
    showToast('Akses dibatasi! Menu Kasir POS hanya dapat diakses oleh Kasir.', 'warning');
  }

  // Jika owner admin mencoba mengakses menu users, owners, atau mikrotik, paksa ke Katalog Barang
  const isOwnerAdmin = currentUser && currentUser.role === 'admin' && currentUser.owner && currentUser.owner !== 'All' && currentUser.owner !== 'undefined';
  if (isOwnerAdmin && (screenId === 'users' || screenId === 'owners' || screenId === 'mikrotik')) {
    screenId = 'products';
    showToast('Akses dibatasi! Menu ini hanya dapat diakses oleh Super Admin.', 'warning');
  }

  activeScreen = screenId;
  
  // Sembunyikan semua layar
  document.querySelectorAll('.screen-section').forEach(el => el.classList.add('hidden'));
  // Tampilkan layar aktif
  document.getElementById(`screen${capitalize(screenId)}`).classList.remove('hidden');

  // Hapus kelas aktif di sidebar menu
  document.querySelectorAll('.menu-item').forEach(el => el.classList.remove('active'));
  // Set menu aktif
  const menuBtn = {
    pos: 'menuPos',
    products: 'menuProducts',
    reports: 'menuReports',
    users: 'menuUsers',
    owners: 'menuOwners',
    opname: 'menuOpname',
    mikrotik: 'menuMikrotik'
  }[screenId];
  
  const menuEl = document.getElementById(menuBtn);
  if (menuEl) menuEl.classList.add('active');

  // Update Header Title
  const titles = {
    pos: { main: 'Kasir (POS)', desc: 'Proses transaksi belanja pelanggan di sini' },
    products: { main: 'Katalog Barang', desc: 'Kelola stok, harga beli/jual, dan barcode produk' },
    reports: { main: 'Laporan Penjualan', desc: 'Lihat ringkasan laba kotor, stok barang, dan kinerja keuangan' },
    users: { main: 'Manajemen Kasir', desc: 'Kelola pendaftaran akun kasir dan hak akses login' },
    owners: { main: 'Manajemen Owner', desc: 'Kelola pemilik barang dagangan multi-owner (multi-tenant)' },
    opname: { main: 'Stock Opname', desc: 'Audit fisik persediaan barang dan penyesuaian stok' },
    mikrotik: { main: 'Integrasi MikroTik', desc: 'Pengaturan koneksi router hotspot dan voucher wifi' }
  }[screenId];

  document.getElementById('screenTitle').innerText = titles.main;
  document.getElementById('screenDescription').innerText = titles.desc;

  // Trigger loading data berdasarkan layar
  if (screenId === 'products') {
    switchCatalogTab(activeCatalogTab);
  } else if (screenId === 'reports') {
    switchReportTab(activeReportTab);
  } else if (screenId === 'users') {
    fetchUserCatalog();
  } else if (screenId === 'owners') {
    fetchOwners();
  } else if (screenId === 'opname') {
    switchOpnameTab(activeOpnameTab);
  } else if (screenId === 'mikrotik') {
    loadMikrotikConfig();
    loadStoreBranding();
  }

  // Auto-fokus kolom pencarian barcode jika masuk layar POS
  if (screenId === 'pos') {
    fetchPosTodayRevenue();
    if (typeof switchMobilePosTab === 'function') {
      switchMobilePosTab('cart');
    }
    setTimeout(() => {
      document.getElementById('barcodeSearchInput').focus();
    }, 200);
  } else if (screenId === 'opname') {
    setTimeout(() => {
      document.getElementById('opnameBarcodeSearch').focus();
    }, 200);
  }
}

function switchReportTab(tabId) {
  activeReportTab = tabId;

  // Sembunyikan konten sub-tab
  document.querySelectorAll('.report-tab-content').forEach(el => el.classList.add('hidden'));
  // Tampilkan sub-tab aktif
  const subTabEl = {
    today: 'reportSubToday',
    stock: 'reportSubStock',
    finance: 'reportSubFinance',
    void: 'reportSubVoid'
  }[tabId];
  document.getElementById(subTabEl).classList.remove('hidden');

  // Hapus kelas aktif sub-tab button
  document.querySelectorAll('.sub-tab').forEach(el => el.classList.remove('active'));
  // Set button aktif
  const tabBtn = {
    today: 'subTabToday',
    stock: 'subTabStock',
    finance: 'subTabFinance',
    void: 'subTabVoid'
  }[tabId];
  document.getElementById(tabBtn).classList.add('active');

  // Sembunyikan panel backup/restore dan clear database jika logged-in user adalah Admin Owner
  const panelBackupRestore = document.getElementById('panelBackupRestore');
  const panelClearDatabase = document.getElementById('panelClearDatabase');
  const isOwnerAdmin = currentUser && currentUser.role === 'admin' && currentUser.owner && currentUser.owner !== 'All' && currentUser.owner !== 'undefined';
  if (isOwnerAdmin) {
    if (panelBackupRestore) panelBackupRestore.classList.add('hidden');
    if (panelClearDatabase) panelClearDatabase.classList.add('hidden');
  } else {
    if (panelBackupRestore) panelBackupRestore.classList.remove('hidden');
    if (panelClearDatabase) panelClearDatabase.classList.remove('hidden');
  }

  // Fetch data
  if (tabId === 'today') {
    fetchTodayReport();
  } else if (tabId === 'stock') {
    fetchStockReport();
  } else if (tabId === 'finance') {
    fetchFinancialReport();
  } else if (tabId === 'void') {
    fetchVoidLogs();
  }
}

function toggleTheme() {
  const body = document.body;
  const isDark = body.classList.toggle('dark-mode');
  body.classList.toggle('light-mode', !isDark);
  
  // Update icon & teks di sidebar footer
  const sunIcon = document.getElementById('themeSun');
  const moonIcon = document.getElementById('themeMoon');
  const text = document.getElementById('themeText');
  
  if (isDark) {
    sunIcon.classList.add('hidden');
    moonIcon.classList.remove('hidden');
    text.innerText = 'Mode Gelap';
  } else {
    sunIcon.classList.remove('hidden');
    moonIcon.classList.add('hidden');
    text.innerText = 'Mode Terang';
  }
}

function changeCashier(name) {
  activeCashier = name;
  localStorage.setItem('pos_cashier', name);
  showToast(`Kasir aktif dialihkan ke: ${name}`, 'success');
}

// Update clock header
function startClock() {
  const clockEl = document.getElementById('headerClock');
  const update = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'];
    const dateStr = `${pad(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    clockEl.innerText = dateStr;
  };
  update();
  setInterval(update, 1000);
}

// Toggle mobile drawer sidebar
function toggleMobileSidebar() {
  const sidebar = document.getElementById('appSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar && overlay) {
    sidebar.classList.toggle('sidebar-open');
    overlay.classList.toggle('active');
  }
}

// Switch Mobile POS view layout (Cart vs Checkout)
function switchMobilePosTab(tab) {
  const mainCol = document.querySelector('.pos-main');
  const sidebarCol = document.querySelector('.pos-sidebar');
  const checkoutBar = document.getElementById('mobileCheckoutBar');

  if (!mainCol || !sidebarCol) return;

  if (tab === 'cart') {
    // Show cart, hide checkout
    mainCol.classList.remove('mobile-hidden');
    sidebarCol.classList.remove('mobile-visible');
    sidebarCol.style.display = ''; // Reset to CSS default (hidden by media query)
    if (checkoutBar) checkoutBar.style.display = '';
  } else {
    // Show checkout, hide cart
    mainCol.classList.add('mobile-hidden');
    sidebarCol.classList.add('mobile-visible');
    sidebarCol.style.display = 'block';
    if (checkoutBar) checkoutBar.style.display = 'none'; // Hide bar when on checkout page
  }
}
