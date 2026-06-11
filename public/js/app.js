/**
 * Kasirku POS - Aplikasi Kasir Utama (Frontend Logic)
 */

// API Base URL
const API_URL = '';

// Helper to append owner parameter for multi-tenant / multi-owner filtering
function appendOwnerParam(url) {
  if (currentUser && currentUser.owner && currentUser.owner !== 'All' && currentUser.owner !== 'undefined') {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}owner=${encodeURIComponent(currentUser.owner)}`;
  }
  return url;
}

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

// Inisialisasi Aplikasi saat Load
document.addEventListener('DOMContentLoaded', () => {
  // Ambil pengaturan sistem awal (branding & status mikrotik)
  fetchStoreSettings();

  // Update Jam di Header
  startClock();
  
  // Set default Tanggal Laporan Keuangan (Hari Ini)
  const todayDateStr = new Date().toISOString().split('T')[0];
  document.getElementById('financeStartDate').value = todayDateStr;
  document.getElementById('financeEndDate').value = todayDateStr;

  // Inisialisasi Pemindai Barcode Fisik
  initPhysicalBarcodeScanner((barcode) => {
    if (currentUser) {
      if (activeScreen === 'opname') {
        addBarcodeToOpnameCart(barcode);
      } else {
        addBarcodeToCart(barcode);
      }
    }
  });

  // Setup Global Keyboard Shortcuts
  setupKeyboardShortcuts();

  // Jalankan verifikasi otentikasi login
  checkUserAuth();

  // Render ulang UI
  renderCart();
});

// ==================== NAVIGASI & TEMA ====================

function switchScreen(screenId) {
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

// ==================== FEEDBACK AUDIO (Web Audio API) ====================

// Synthesizer Web Audio untuk jaminan 100% suara offline tanpa gagal loading file
function playBeepSound() {
  try {
    // Coba putar file audio dulu
    const audio = document.getElementById('soundBeep');
    audio.currentTime = 0;
    audio.play().catch(() => playSynthBeep());
  } catch (e) {
    playSynthBeep();
  }
}

function playDingSound() {
  try {
    const audio = document.getElementById('soundDing');
    audio.currentTime = 0;
    audio.play().catch(() => playSynthDing());
  } catch (e) {
    playSynthDing();
  }
}

function playSynthBeep() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, audioCtx.currentTime); // 1000Hz beep
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
  } catch (e) {
    console.log('Web Audio tidak didukung');
  }
}

function playSynthDing() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // Nada 1
    const playNote = (freq, start, duration) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime + start);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + start + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + start);
      osc.stop(audioCtx.currentTime + start + duration);
    };
    // Chord C-major (C5 -> E5)
    playNote(523.25, 0, 0.15); // C5
    playNote(659.25, 0.08, 0.25); // E5
  } catch (e) {
    console.log('Web Audio tidak didukung');
  }
}

// ==================== NOTIFIKASI TOAST ====================

function showToast(message, type = 'primary') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const iconName = {
    primary: 'info',
    success: 'check-circle',
    danger: 'x-circle',
    warning: 'alert-triangle'
  }[type];

  toast.innerHTML = `
    <i data-lucide="${iconName}" class="toast-icon"></i>
    <div class="toast-message">${message}</div>
  `;
  
  container.appendChild(toast);
  lucide.createIcons(); // render icon
  
  // Hilang setelah 3.5 detik
  setTimeout(() => {
    toast.style.transform = 'translateX(120%)';
    toast.style.opacity = '0';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3500);
}

// ==================== POS SEARCH LOGIC (Manual & Dropdown) ====================

// Cache pencarian produk untuk autocomplete instan di frontend
async function fetchProductsCache() {
  try {
    const response = await fetch(appendOwnerParam(`${API_URL}/api/products`));
    if (response.ok) {
      dbProducts = await response.json();
    }
  } catch (error) {
    console.error('Gagal memuat cache produk:', error);
  }
}

function handleSearchInput(query) {
  const dropdown = document.getElementById('searchResultsDropdown');
  const btnClear = document.getElementById('btnClearSearch');
  
  if (!query.trim()) {
    dropdown.classList.add('hidden');
    btnClear.classList.add('hidden');
    return;
  }
  
  btnClear.classList.remove('hidden');
  
  // Filter lokal dari cache dbProducts
  const filtered = dbProducts.filter(p => 
    p.name.toLowerCase().includes(query.toLowerCase()) || 
    (p.barcode && p.barcode.includes(query))
  );

  if (filtered.length === 0) {
    dropdown.innerHTML = `<div class="p-3 text-center text-xs text-muted">Produk tidak ditemukan</div>`;
    dropdown.classList.remove('hidden');
    selectedDropdownIndex = -1;
    return;
  }

  // Render hasil pencarian ke dropdown
  dropdown.innerHTML = filtered.map((p, index) => `
    <div class="search-result-item" id="resultItem-${index}" onclick="addSelectedProductToCart(${p.id})">
      <div class="result-info">
        <span class="result-name">${p.name}</span>
        <span class="result-meta">${p.barcode ? p.barcode : 'Tanpa Barcode'} | ${p.category}</span>
      </div>
      <div class="result-price-stock">
        <span class="result-price">Rp ${formatRupiah(p.price_sell)}</span>
        <span class="result-stock text-muted">Stok: ${p.stock}</span>
      </div>
    </div>
  `).join('');
  
  dropdown.classList.remove('hidden');
  selectedDropdownIndex = -1;
}

function handleSearchKeyDown(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const dropdown = document.getElementById('searchResultsDropdown');
    const items = dropdown ? dropdown.querySelectorAll('.search-result-item') : [];
    
    if (dropdown && !dropdown.classList.contains('hidden') && selectedDropdownIndex >= 0 && selectedDropdownIndex < items.length) {
      items[selectedDropdownIndex].click();
    } else {
      // Cek apakah ada input teks untuk diproses sebagai barcode/voucher manual
      const val = document.getElementById('barcodeSearchInput').value.trim();
      if (val) {
        addBarcodeToCart(val);
      }
    }
    return;
  }

  const dropdown = document.getElementById('searchResultsDropdown');
  if (dropdown.classList.contains('hidden')) return;

  const items = dropdown.querySelectorAll('.search-result-item');
  if (items.length === 0) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedDropdownIndex = (selectedDropdownIndex + 1) % items.length;
    highlightDropdownItem(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedDropdownIndex = (selectedDropdownIndex - 1 + items.length) % items.length;
    highlightDropdownItem(items);
  } else if (e.key === 'Escape') {
    clearSearch();
  }
}

function highlightDropdownItem(items) {
  items.forEach((item, index) => {
    if (index === selectedDropdownIndex) {
      item.classList.add('highlighted');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('highlighted');
    }
  });
}

function clearSearch() {
  const input = document.getElementById('barcodeSearchInput');
  input.value = '';
  input.focus();
  document.getElementById('searchResultsDropdown').classList.add('hidden');
  document.getElementById('btnClearSearch').classList.add('hidden');
  selectedDropdownIndex = -1;
}

// ==================== KERANJANG BELANJA (Cart Actions) ====================

// Tambah produk ke keranjang berdasarkan ID produk
function addSelectedProductToCart(productId) {
  const product = dbProducts.find(p => p.id === productId);
  if (!product) return;

  const isService = product.is_service == 1;
  const isVoucher = product.is_voucher || false;

  // Cek jika voucher unik ini sudah ada di keranjang
  if (isVoucher) {
    const existingVoucher = cart.find(item => item.barcode === product.barcode);
    if (existingVoucher) {
      showToast(`Voucher dengan kode "${product.barcode}" sudah masuk di keranjang!`, 'warning');
      playBeepSound();
      return;
    }
  }
  
  // Cek stok produk (hanya untuk barang fisik, bukan jasa dan bukan voucher)
  if (!isVoucher && !isService && product.stock <= 0) {
    showToast(`Produk "${product.name}" habis. Stok: 0`, 'danger');
    return;
  }

  // Cek jika produk sudah ada di keranjang
  const existingItem = cart.find(item => item.product_id === product.id);
  if (existingItem) {
    // Barang fisik: batasi sesuai stok
    if (!isVoucher && !isService && existingItem.quantity >= product.stock) {
      showToast(`Stok "${product.name}" tidak mencukupi untuk ditambah lagi`, 'warning');
      return;
    }
    existingItem.quantity++;
    existingItem.subtotal = existingItem.quantity * existingItem.price_sell;
    playBeepSound();
  } else {
    // Tambah baru
    cart.push({
      product_id: product.id,
      barcode: product.barcode,
      product_name: product.name,
      quantity: 1,
      price_sell: product.price_sell,
      stock: product.stock,
      subtotal: product.price_sell,
      is_voucher: isVoucher,
      is_service: isService,
      category: product.category
    });
    playBeepSound();
  }

  renderCart();
  clearSearch();
}

// Cari & Tambah produk ke keranjang berdasarkan barcode (untuk scan camera & fisik)
let lastScannedBarcode = '';
let lastScannedTime = 0;

async function addBarcodeToCart(barcode) {
  if (!barcode) return;
  
  // Debounce/cooldown untuk mencegah double scan beruntun dari USB scanner fisik
  const now = Date.now();
  if (barcode === lastScannedBarcode && (now - lastScannedTime < 300)) {
    console.warn('Duplicate barcode scan ignored (cooldown):', barcode);
    return;
  }
  lastScannedBarcode = barcode;
  lastScannedTime = now;
  
  try {
    const response = await fetch(appendOwnerParam(`${API_URL}/api/products?barcode=${barcode}`));
    if (response.ok) {
      const products = await response.json();
      if (products.length > 0) {
        addSelectedProductToCart(products[0].id);
      } else {
        // Barcode tidak terdaftar di katalog lokal. Coba periksa ke MikroTik router.
        showToast('Memeriksa voucher ke MikroTik...', 'primary');
        const mtResponse = await fetch(`${API_URL}/api/mikrotik/voucher/${encodeURIComponent(barcode)}`);
        const data = await mtResponse.json();
        
        if (mtResponse.ok && data.success) {
          // Buat produk virtual sementara
          const virtualId = `voucher-${data.username}`;
          const virtualProduct = {
            id: virtualId,
            name: `Voucher Wifi ${data.profile}`,
            barcode: data.username,
            price_sell: data.price,
            stock: 1,
            category: 'Voucher Wifi',
            is_voucher: true
          };
          
          // Tambahkan ke dbProducts agar addSelectedProductToCart bisa memprosesnya
          if (!dbProducts.some(p => p.id === virtualId)) {
            dbProducts.push(virtualProduct);
          }
          
          addSelectedProductToCart(virtualId);
          showToast(`Voucher ${data.username} berhasil dimasukkan!`, 'success');
        } else {
          showToast(data.error || `Barcode "${barcode}" tidak terdaftar`, 'warning');
          playBeepSound();
        }
      }
    }
  } catch (error) {
    console.error('Gagal mengambil data produk via barcode:', error);
    showToast('Gagal memverifikasi barcode', 'danger');
  }
}

function updateCartQty(index, newQty) {
  newQty = parseInt(newQty);
  if (isNaN(newQty) || newQty < 1) newQty = 1;

  const item = cart[index];
  
  // Cek stok produk (hanya untuk barang fisik, bukan jasa dan bukan voucher)
  if (!item.is_service && !item.is_voucher) {
    if (newQty > item.stock) {
      showToast(`Stok tidak mencukupi. Sisa stok: ${item.stock}`, 'warning');
      newQty = item.stock;
    }
  }

  item.quantity = newQty;
  const baseSubtotal = item.quantity * item.price_sell;
  let disc = item.discount || 0;
  if (disc > baseSubtotal) {
    disc = baseSubtotal;
    item.discount = disc;
  }
  item.subtotal = baseSubtotal - disc;
  renderCart();
}

function updateCartItemDiscount(index, discountVal) {
  const item = cart[index];
  let disc = parseFloat(discountVal) || 0;
  if (isNaN(disc) || disc < 0) disc = 0;
  
  const baseSubtotal = item.quantity * item.price_sell;
  if (disc > baseSubtotal) {
    showToast('Diskon tidak boleh melebihi subtotal barang!', 'warning');
    disc = baseSubtotal;
  }
  
  item.discount = disc;
  item.subtotal = baseSubtotal - disc;
  renderCart();
}

function adjustCartQty(index, amount) {
  const item = cart[index];
  const targetQty = item.quantity + amount;
  if (targetQty >= 1) {
    updateCartQty(index, targetQty);
  }
}

function deleteCartItem(index) {
  cart.splice(index, 1);
  renderCart();
}

function renderCart() {
  const body = document.getElementById('cartTableBody');
  const countEl = document.getElementById('cartItemCount');
  
  if (cart.length === 0) {
    body.innerHTML = `
      <tr class="empty-cart-row">
        <td colspan="7" class="text-center py-5">
          <i data-lucide="shopping-bag" class="empty-cart-icon"></i>
          <p class="text-muted">Keranjang kosong. Scan barcode atau cari produk di atas.</p>
        </td>
      </tr>
    `;
    countEl.innerText = '0 Barang';
    calculateBilling();
    lucide.createIcons();
    return;
  }

  // Hitung jumlah jenis barang
  countEl.innerText = `${cart.length} Jenis Barang`;

  body.innerHTML = cart.map((item, index) => `
    <tr>
      <td>
        <div class="product-cell">
          <span class="product-cell-name">${item.product_name}</span>
          <span class="product-cell-cat">${item.barcode ? item.barcode : 'Tanpa Barcode'}</span>
        </div>
      </td>
      <td class="text-xs font-mono text-muted">${item.barcode ? item.barcode : '-'}</td>
      <td class="text-right">Rp ${formatRupiah(item.price_sell)}</td>
      <td class="text-center">
        <div class="qty-counter">
          <button class="qty-btn" type="button" onclick="adjustCartQty(${index}, -1)"><i data-lucide="minus"></i></button>
          <input type="number" class="qty-input" value="${item.quantity}" onchange="updateCartQty(${index}, this.value)">
          <button class="qty-btn" type="button" onclick="adjustCartQty(${index}, 1)"><i data-lucide="plus"></i></button>
        </div>
      </td>
      <td class="text-center">
        <input type="number" class="qty-input" style="width: 80px; text-align: right;" min="0" value="${item.discount || 0}" onchange="updateCartItemDiscount(${index}, this.value)">
      </td>
      <td class="text-right font-mono font-bold">Rp ${formatRupiah(item.subtotal)}</td>
      <td class="text-center">
        <button class="btn btn-secondary btn-icon-only btn-xs text-danger" type="button" onclick="deleteCartItem(${index})">
          <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
        </button>
      </td>
    </tr>
  `).join('');

  calculateBilling();
  lucide.createIcons();
}

// ==================== CHECKOUT BILLING LOGIC ====================

function calculateBilling() {
  const discountInput = document.getElementById('inputDiscount');
  const taxInput = document.getElementById('inputTax');
  
  let subtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
  let discount = parseFloat(discountInput.value) || 0;
  let taxPercent = parseFloat(taxInput.value) || 0;
  
  if (discount < 0) { discount = 0; discountInput.value = 0; }
  if (discount > subtotal) { discount = subtotal; discountInput.value = subtotal; }
  if (taxPercent < 0) { taxPercent = 0; taxInput.value = 0; }
  if (taxPercent > 100) { taxPercent = 100; taxInput.value = 100; }

  let totalAfterDisc = subtotal - discount;
  let taxVal = Math.round(totalAfterDisc * (taxPercent / 100));
  let finalBill = totalAfterDisc + taxVal;

  // Render displays
  document.getElementById('detailSubtotal').innerText = `Rp ${formatRupiah(subtotal)}`;
  document.getElementById('detailDiscount').innerText = `-Rp ${formatRupiah(discount)}`;
  document.getElementById('detailTax').innerText = `Rp ${formatRupiah(taxVal)}`;
  document.getElementById('totalBelanjaDisplay').innerText = `Rp ${formatRupiah(finalBill)}`;
  
  // Simpan nilai finalBill ke atribut data untuk dibaca fungsi pembayaran
  document.getElementById('totalBelanjaDisplay').setAttribute('data-value', finalBill);

  // Update Pajak label text
  document.querySelector('.detail-row.text-primary span').innerText = `Pajak (${taxPercent}%)`;

  // Autocomplete uang pas jika metode QRIS/DEBIT
  if (currentPaymentMethod !== 'TUNAI') {
    document.getElementById('inputAmountPaid').value = finalBill;
  }

  calculateChange();
}

function togglePaymentMethod(method) {
  currentPaymentMethod = method;
  
  // Update UI active card
  document.querySelectorAll('.pay-method-card').forEach(el => el.classList.remove('active'));
  const activeCardId = {
    TUNAI: 'payMethodTunai',
    QRIS: 'payMethodQris',
    DEBIT: 'payMethodDebit'
  }[method];
  document.getElementById(activeCardId).classList.add('active');

  const finalBill = parseInt(document.getElementById('totalBelanjaDisplay').getAttribute('data-value')) || 0;
  const inputPaid = document.getElementById('inputAmountPaid');
  const labelPaid = document.getElementById('labelAmountPaid');
  const quickCash = document.getElementById('quickCashButtons');

  if (method === 'TUNAI') {
    inputPaid.disabled = false;
    inputPaid.value = '';
    labelPaid.innerText = 'Nominal Uang Bayar (Rp) (F4)';
    quickCash.classList.remove('hidden');
    inputPaid.focus();
  } else {
    // QRIS & DEBIT otomatis Uang Pas
    inputPaid.disabled = true;
    inputPaid.value = finalBill;
    labelPaid.innerText = `Pembayaran via ${method} (Otomatis Pas)`;
    quickCash.classList.add('hidden');
  }

  calculateChange();
}

function setQuickCash(val) {
  const finalBill = parseInt(document.getElementById('totalBelanjaDisplay').getAttribute('data-value')) || 0;
  const inputPaid = document.getElementById('inputAmountPaid');
  
  if (val === 'pas') {
    inputPaid.value = finalBill;
  } else {
    // Tambahkan atau ganti nominal
    inputPaid.value = parseInt(val) || 0;
  }

  inputPaid.focus();
  calculateChange();
}

function calculateChange() {
  const finalBill = parseInt(document.getElementById('totalBelanjaDisplay').getAttribute('data-value')) || 0;
  const amountPaidInput = document.getElementById('inputAmountPaid');
  let amountPaid = parseInt(amountPaidInput.value) || 0;
  
  if (amountPaid < 0) {
    amountPaid = 0;
    amountPaidInput.value = 0;
  }

  const changeDisplay = document.getElementById('changeAmountDisplay');

  if (cart.length === 0) {
    changeDisplay.innerText = 'Rp 0';
    changeDisplay.className = 'change-value text-muted';
    return;
  }

  let change = amountPaid - finalBill;
  
  if (change >= 0) {
    changeDisplay.innerText = `Rp ${formatRupiah(change)}`;
    changeDisplay.className = 'change-value text-success';
  } else {
    changeDisplay.innerText = `-Rp ${formatRupiah(Math.abs(change))}`;
    changeDisplay.className = 'change-value text-danger';
  }
}

// ==================== PEMROSESAN CHECKOUT & STRUK ====================

async function processCheckout() {
  if (!activeCashSession && currentUser && currentUser.role === 'cashier') {
    showToast('Harap buka shift kasir terlebih dahulu!', 'warning');
    checkActiveShift();
    return;
  }

  if (cart.length === 0) {
    showToast('Keranjang belanja kosong!', 'warning');
    return;
  }

  const finalBill = parseInt(document.getElementById('totalBelanjaDisplay').getAttribute('data-value')) || 0;
  const amountPaidInput = document.getElementById('inputAmountPaid');
  let amountPaid = parseInt(amountPaidInput.value) || 0;
  
  if (amountPaid < finalBill) {
    showToast('Jumlah uang bayar kurang!', 'danger');
    amountPaidInput.focus();
    return;
  }

  const discount = parseFloat(document.getElementById('inputDiscount').value) || 0;
  const tax = parseFloat(document.getElementById('inputTax').value) || 0;
  const change = amountPaid - finalBill;

  // Siapkan payload ke API
  const payload = {
    cashier_name: activeCashier,
    payment_method: currentPaymentMethod,
    total_amount: finalBill,
    discount: discount,
    tax: tax,
    payment_amount: amountPaid,
    change_amount: change,
    items: cart.map(item => ({
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      price_sell: item.price_sell,
      subtotal: item.subtotal,
      barcode: item.barcode,
      category: item.category,
      is_voucher: item.is_voucher,
      is_service: item.is_service,
      discount: item.discount || 0
    }))
  };

  try {
    const response = await fetch(`${API_URL}/api/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const resData = await response.json();

    if (response.ok) {
      playDingSound();
      showToast(`Transaksi Sukses! Invoice: ${resData.invoice_number}`, 'success');

      // Simpan data struk untuk diprint
      activeTransactionReceipt = {
        invoice_number: resData.invoice_number,
        cashier_name: activeCashier,
        payment_method: currentPaymentMethod,
        total_amount: finalBill,
        discount: discount,
        tax: tax,
        payment_amount: amountPaid,
        change_amount: change,
        created_at: new Date().toLocaleString('id-ID'),
        items: [...cart]
      };

      // Siapkan struk di modal preview
      renderReceipt(activeTransactionReceipt);

      // Bersihkan keranjang & input
      cart = [];
      document.getElementById('inputDiscount').value = '';
      document.getElementById('inputTax').value = '0';
      document.getElementById('inputAmountPaid').value = '';
      
      // Refresh cache produk lokal (karena stok berkurang)
      await fetchProductsCache();
      renderCart();
      fetchPosTodayRevenue();

      // Buka modal struk belanja
      document.getElementById('receiptPreviewModal').classList.remove('hidden');
    } else {
      showToast(resData.error || 'Gagal menyimpan transaksi', 'danger');
    }
  } catch (error) {
    console.error('Koneksi backend gagal:', error);
    showToast('Koneksi server gagal. Transaksi dibatalkan.', 'danger');
  }
}

// Render HTML struk thermal
function renderReceipt(tx) {
  const thermalReceipt = document.getElementById('thermalReceipt');
  
  let discountRow = '';
  if (tx.discount > 0) {
    discountRow = `
      <div class="receipt-total-row">
        <span>Diskon</span>
        <span>-Rp ${formatRupiah(tx.discount)}</span>
      </div>
    `;
  }

  let taxRow = '';
  if (tx.tax > 0) {
    // Hitung nominal pajak dari persen
    let taxVal = Math.round((tx.total_amount + tx.discount) * (tx.tax / 100));
    taxRow = `
      <div class="receipt-total-row">
        <span>Pajak (${tx.tax}%)</span>
        <span>Rp ${formatRupiah(taxVal)}</span>
      </div>
    `;
  }

  const itemsHtml = tx.items.map(item => `
    <div class="receipt-item-row">
      <span class="receipt-item-name">${item.product_name}</span>
      <div class="receipt-item-details">
        <span class="receipt-item-qty">${item.quantity} x Rp ${formatRupiah(item.price_sell)}</span>
        <span>Rp ${formatRupiah(item.subtotal)}</span>
      </div>
    </div>
  `).join('');

  const logoHtml = systemSettings.store_logo ? `<img src="${systemSettings.store_logo}" alt="Logo Toko" style="max-height: 50px; margin-bottom: 6px; max-width: 150px; object-fit: contain; display: block; margin: 0 auto 8px auto;">` : '';
  const storeName = systemSettings.store_name || 'KASIRKU POS';
  const storeAddress = systemSettings.store_address || '';
  const storePhone = systemSettings.store_phone ? `Telp: ${systemSettings.store_phone}` : '';
  const storeFooter = systemSettings.store_footer ? systemSettings.store_footer.split('\n').map(line => `<p>${line}</p>`).join('') : '<p>Terima Kasih atas Kunjungan Anda</p>';

  thermalReceipt.innerHTML = `
    <div class="receipt-header">
      ${logoHtml}
      <h4 style="font-weight: 800; font-size: 15px; margin: 0 0 4px 0;">${storeName}</h4>
      ${storeAddress ? `<p style="margin: 0 0 2px 0; font-size: 11px;">${storeAddress}</p>` : ''}
      ${storePhone ? `<p style="margin: 0; font-size: 11px;">${storePhone}</p>` : ''}
    </div>
    <div class="receipt-divider"></div>
    <div class="receipt-meta">
      <div class="receipt-meta-row">
        <span>No Struk:</span>
        <span>${tx.invoice_number}</span>
      </div>
      <div class="receipt-meta-row">
        <span>Tanggal:</span>
        <span>${tx.created_at}</span>
      </div>
      <div class="receipt-meta-row">
        <span>Kasir:</span>
        <span>${tx.cashier_name}</span>
      </div>
      <div class="receipt-meta-row">
        <span>Bayar:</span>
        <span>${tx.payment_method}</span>
      </div>
    </div>
    <div class="receipt-divider"></div>
    <div class="receipt-items">
      ${itemsHtml}
    </div>
    <div class="receipt-divider"></div>
    <div class="receipt-totals">
      <div class="receipt-total-row">
        <span>Subtotal</span>
        <span>Rp ${formatRupiah(tx.total_amount + tx.discount - (tx.tax > 0 ? Math.round((tx.total_amount + tx.discount) * (tx.tax / 100)) : 0))}</span>
      </div>
      ${discountRow}
      ${taxRow}
      <div class="receipt-divider"></div>
      <div class="receipt-total-row bold">
        <span>Total Akhir</span>
        <span>Rp ${formatRupiah(tx.total_amount)}</span>
      </div>
      <div class="receipt-total-row">
        <span>Bayar Tunai</span>
        <span>Rp ${formatRupiah(tx.payment_amount)}</span>
      </div>
      <div class="receipt-total-row text-success">
        <span>Kembalian</span>
        <span>Rp ${formatRupiah(tx.change_amount)}</span>
      </div>
    </div>
    <div class="receipt-divider"></div>
    <div class="receipt-footer">
      ${storeFooter}
    </div>
  `;
}

function printReceipt() {
  if (!activeTransactionReceipt) return;
  
  // Tambahkan kelas print ke body
  document.body.classList.add('printing-receipt');
  
  // Cetak browser
  window.print();
  
  // Hapus kembali kelas setelah cetak
  setTimeout(() => {
    document.body.classList.remove('printing-receipt');
    closeReceiptPreview();
  }, 500);
}

function closeReceiptPreview() {
  document.getElementById('receiptPreviewModal').classList.add('hidden');
  activeTransactionReceipt = null;
  // Kembalikan fokus ke kolom barcode untuk transaksi berikutnya
  if (activeScreen === 'pos') {
    document.getElementById('barcodeSearchInput').focus();
  }
}

// ==================== WEBCAM SCANNER MODAL HANDLER ====================

let cameraTargetInputId = null;

function openCameraScanner(targetInputId = null) {
  cameraTargetInputId = targetInputId;
  document.getElementById('cameraScannerModal').classList.remove('hidden');
  startCameraScanner('cameraScannerReader', (barcode) => {
    if (cameraTargetInputId) {
      const inputEl = document.getElementById(cameraTargetInputId);
      if (inputEl) {
        inputEl.value = barcode;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else {
      addBarcodeToCart(barcode);
    }
    closeCameraScanner();
  });
}

function closeCameraScanner() {
  stopCameraScanner();
  document.getElementById('cameraScannerModal').classList.add('hidden');
  if (cameraTargetInputId) {
    const inputEl = document.getElementById(cameraTargetInputId);
    if (inputEl) inputEl.focus();
    cameraTargetInputId = null;
  } else if (activeScreen === 'pos') {
    document.getElementById('barcodeSearchInput').focus();
  }
}

// ==================== SCREEN: KATALOG BARANG (Products Catalog CRUD) ====================

async function fetchProductCatalog() {
  const searchInput = document.getElementById('productCatalogSearch');
  const query = searchInput.value.trim();
  
  let url = `${API_URL}/api/products`;
  if (query) {
    url += `?search=${encodeURIComponent(query)}`;
  }
  url = appendOwnerParam(url);

  try {
    const response = await fetch(url);
    if (response.ok) {
      const products = await response.json();
      renderProductCatalog(products);
    }
  } catch (error) {
    console.error('Gagal mengambil katalog produk:', error);
  }
}

function renderProductCatalog(products) {
  const body = document.getElementById('productCatalogBody');
  
  if (products.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-5 text-muted">Barang tidak ditemukan di katalog</td>
      </tr>
    `;
    return;
  }

  body.innerHTML = products.map((p, index) => {
    const isService = p.is_service == 1;

    // Estimasi margin laba
    const profit = p.price_sell - p.price_buy;
    const marginPercent = p.price_sell > 0 ? Math.round((profit / p.price_sell) * 100) : 0;
    
    // Tanda Kategori
    const catClass = getCategoryBadgeClass(p.category);

    // Indikator Stok
    let stockDisplay;
    if (isService) {
      stockDisplay = `<span class="badge" style="background: linear-gradient(135deg,#6366f1,#8b5cf6); color:#fff; font-size:0.7rem;">🛠️ Jasa</span>`;
    } else {
      let stockDotClass = 'stock-safe';
      if (p.stock === 0) stockDotClass = 'stock-empty';
      else if (p.stock < 5) stockDotClass = 'stock-warning';
      stockDisplay = `<div class="stock-indicator"><span class="stock-dot ${stockDotClass}"></span><span>${p.stock}</span></div>`;
    }

    return `
      <tr>
        <td class="text-center">${index + 1}</td>
        <td class="font-mono text-xs">${p.barcode ? p.barcode : '-'}</td>
        <td class="font-bold">${p.name}${isService ? ' <span style="font-size:0.7rem;color:#8b5cf6;">(Jasa)</span>' : ''}</td>
        <td><span class="badge ${catClass}">${p.category ? p.category : 'Lainnya'}</span></td>
        <td class="text-right font-mono">Rp ${formatRupiah(p.price_buy)}</td>
        <td class="text-right font-mono font-bold text-primary">Rp ${formatRupiah(p.price_sell)}</td>
        <td class="text-center">${stockDisplay}</td>
        <td class="text-right font-mono text-success">
          ${isService
            ? '<span class="text-muted text-xs">—</span>'
            : `Rp ${formatRupiah(profit)} <span class="text-xs text-muted">(${marginPercent}%)</span>`
          }
        </td>
        <td class="text-center">
          <div class="input-with-action justify-center">
            <button class="btn btn-secondary btn-xs" onclick="openProductModal('edit', ${p.id})">
              <i data-lucide="edit-3" style="width: 13px; height: 13px;"></i>
              <span>Edit</span>
            </button>
            <button class="btn btn-secondary btn-xs text-danger" onclick="deleteProduct(${p.id})">
              <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
  
  lucide.createIcons();
}

function openProductModal(mode, id = null) {
  const form = document.getElementById('productForm');
  form.reset();
  document.getElementById('editProductId').value = '';
  document.getElementById('productModalTitle').innerText = 'Tambah Barang Baru';
  document.getElementById('modalProfitMarginBox').classList.add('hidden');

  // Reset toggle jasa
  const serviceToggle = document.getElementById('formIsService');
  serviceToggle.checked = false;
  applyServiceToggleStyle(false);
  document.getElementById('stockFieldWrapper').style.display = '';

  // Isi dropdown kategori secara dinamis
  const catSelect = document.getElementById('formCategory');
  catSelect.innerHTML = dbCategories.length > 0
    ? dbCategories.map(c => `<option value="${c.name}">${c.name}</option>`).join('')
    : '<option value="Lainnya">Lainnya</option>';
  
  // Set Pemilik dropdown visibility and default
  const ownerWrapper = document.getElementById('formOwnerWrapper');
  const ownerSelect = document.getElementById('formOwner');
  if (currentUser && currentUser.role === 'admin' && currentUser.owner && currentUser.owner !== 'All' && currentUser.owner !== 'undefined') {
    if (ownerWrapper) ownerWrapper.style.display = 'none';
    if (ownerSelect) ownerSelect.value = currentUser.owner;
  } else {
    if (ownerWrapper) ownerWrapper.style.display = '';
    if (ownerSelect) ownerSelect.value = 'Organisasi';
  }

  if (mode === 'edit' && id !== null) {
    document.getElementById('productModalTitle').innerText = 'Ubah Detail Barang';
    const p = dbProducts.find(prod => prod.id === id);
    if (p) {
      document.getElementById('editProductId').value = p.id;
      document.getElementById('formBarcode').value = p.barcode || '';
      document.getElementById('formName').value = p.name;
      document.getElementById('formCategory').value = p.category || '';
      document.getElementById('formStock').value = p.stock;
      document.getElementById('formPriceBuy').value = p.price_buy;
      document.getElementById('formPriceSell').value = p.price_sell;
      if (ownerSelect) ownerSelect.value = p.owner || 'Organisasi';

      // Set toggle jasa
      const isService = p.is_service == 1;
      serviceToggle.checked = isService;
      applyServiceToggleStyle(isService);
      document.getElementById('stockFieldWrapper').style.display = isService ? 'none' : '';

      calculateModalProfitMargin();
    }
  }

  document.getElementById('productFormModal').classList.remove('hidden');
  document.getElementById('formBarcode').focus();
}

function toggleServiceMode(checkbox) {
  const isService = checkbox.checked;
  applyServiceToggleStyle(isService);
  const stockWrapper = document.getElementById('stockFieldWrapper');
  stockWrapper.style.display = isService ? 'none' : '';
  if (isService) {
    document.getElementById('formStock').value = 0;
  }
}

function applyServiceToggleStyle(active) {
  const label = document.querySelector('#formIsService + .toggle-label');
  const thumb = document.getElementById('toggleThumb');
  if (label) label.style.background = active ? 'var(--color-primary)' : 'var(--border-color)';
  if (thumb) thumb.style.left = active ? '23px' : '3px';
}

function closeProductModal() {
  document.getElementById('productFormModal').classList.add('hidden');
}

function generateRandomBarcode() {
  // Generate random 12-digit number + EAN-13 check digit (dummy)
  let code = '899'; // Barcode prefix Indonesia
  for (let i = 0; i < 9; i++) {
    code += Math.floor(Math.random() * 10);
  }
  document.getElementById('formBarcode').value = code;
  showToast('Barcode acak berhasil digenerate', 'primary');
}

function calculateModalProfitMargin() {
  const buy = parseFloat(document.getElementById('formPriceBuy').value) || 0;
  const sell = parseFloat(document.getElementById('formPriceSell').value) || 0;
  const box = document.getElementById('modalProfitMarginBox');

  if (sell > 0) {
    const profit = sell - buy;
    const percent = Math.round((profit / sell) * 100);
    
    document.getElementById('modalProfitMarginVal').innerText = `Rp ${formatRupiah(profit)}`;
    document.getElementById('modalProfitMarginPercent').innerText = `${percent}%`;
    
    if (profit < 0) {
      document.getElementById('modalProfitMarginVal').className = 'text-danger';
    } else {
      document.getElementById('modalProfitMarginVal').className = 'text-success';
    }
    box.classList.remove('hidden');
  } else {
    box.classList.add('hidden');
  }
}

async function saveProduct(e) {
  e.preventDefault();
  
  const id = document.getElementById('editProductId').value;
  const isService = document.getElementById('formIsService').checked;
  const ownerEl = document.getElementById('formOwner');
  const payload = {
    barcode: document.getElementById('formBarcode').value.trim() || null,
    name: document.getElementById('formName').value.trim(),
    category: document.getElementById('formCategory').value,
    stock: isService ? 0 : (parseInt(document.getElementById('formStock').value) || 0),
    price_buy: parseFloat(document.getElementById('formPriceBuy').value) || 0,
    price_sell: parseFloat(document.getElementById('formPriceSell').value) || 0,
    is_service: isService ? 1 : 0,
    owner: ownerEl ? (ownerEl.value || (currentUser && currentUser.owner) || 'Organisasi') : ((currentUser && currentUser.owner) || 'Organisasi')
  };

  const isEdit = id !== '';
  const url = isEdit ? `${API_URL}/api/products/${id}` : `${API_URL}/api/products`;
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const response = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const resData = await response.json();

    if (response.ok) {
      showToast(`${isService ? 'Jasa' : 'Barang'} "${payload.name}" berhasil disimpan`, 'success');
      closeProductModal();
      
      // Update cache
      await fetchProductsCache();
      fetchProductCatalog();
    } else {
      showToast(resData.error || 'Gagal menyimpan', 'danger');
    }
  } catch (error) {
    console.error('Gagal menyimpan produk:', error);
    showToast('Koneksi server gagal', 'danger');
  }
}

async function deleteProduct(id) {
  const product = dbProducts.find(p => p.id === id);
  if (!product) return;

  if (confirm(`Apakah Anda yakin ingin menghapus produk "${product.name}"?`)) {
    try {
      const response = await fetch(appendOwnerParam(`${API_URL}/api/products/${id}`), { method: 'DELETE' });
      if (response.ok) {
        showToast(`Produk "${product.name}" dihapus`, 'success');
        await fetchProductsCache();
        fetchProductCatalog();
      }
    } catch (error) {
      console.error('Gagal menghapus produk:', error);
    }
  }
}

// ==================== SCREEN: LAPORAN PENJUALAN (Reporting Engine) ====================

// 1. LAPORAN HARI INI
async function fetchTodayReport() {
  try {
    const response = await fetch(appendOwnerParam(`${API_URL}/api/reports/today`));
    if (response.ok) {
      const data = await response.json();
      
      // Tulis Metrics
      document.getElementById('todayOmsetVal').innerText = `Rp ${formatRupiah(data.revenue)}`;
      document.getElementById('todayProfitVal').innerText = `Rp ${formatRupiah(data.profit)}`;
      document.getElementById('todayTransactionsVal').innerText = `${data.transactions_count} Struk`;
      document.getElementById('todayDiscountVal').innerText = `Rp ${formatRupiah(data.discount)}`;

      // Render Item Terjual Hari Ini
      const soldBody = document.getElementById('todaySoldItemsBody');
      if (data.sold_items.length === 0) {
        soldBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted text-xs">Belum ada barang terjual hari ini</td></tr>`;
      } else {
        let totalSoldQty = 0;
        let totalSoldSales = 0;
        const rowsHtml = data.sold_items.map(item => {
          totalSoldQty += item.qty_sold;
          totalSoldSales += item.total_sales;
          return `
            <tr>
              <td>${item.product_name}</td>
              <td class="text-center font-bold">${item.qty_sold} pcs</td>
              <td class="text-right font-mono">Rp ${formatRupiah(item.price_sell)}</td>
              <td class="text-right font-mono font-bold">Rp ${formatRupiah(item.total_sales)}</td>
            </tr>
          `;
        }).join('');

        soldBody.innerHTML = rowsHtml + `
          <tr style="background-color: var(--color-primary-glow); font-weight: bold; border-top: 2px solid var(--color-primary);">
            <td>TOTAL</td>
            <td class="text-center font-bold">${totalSoldQty} pcs</td>
            <td></td>
            <td class="text-right font-mono font-bold">Rp ${formatRupiah(totalSoldSales)}</td>
          </tr>
        `;
      }

      // Render Riwayat Transaksi Hari Ini
      const txBody = document.getElementById('todayTransactionsListBody');
      if (data.transactions.length === 0) {
        txBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted text-xs">Belum ada transaksi hari ini</td></tr>`;
      } else {
        let totalTxAmount = 0;
        const rowsHtml = data.transactions.map(t => {
          totalTxAmount += t.total_amount;
          const timeStr = new Date(t.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
          return `
            <tr>
              <td class="font-mono font-bold">${t.invoice_number}</td>
              <td class="text-muted text-xs">${timeStr}</td>
              <td>${t.cashier_name}</td>
              <td class="text-center"><span class="badge badge-default">${t.payment_method}</span></td>
              <td class="text-right font-mono font-bold">Rp ${formatRupiah(t.total_amount)}</td>
              <td class="text-center">
                <button class="btn btn-secondary btn-icon-only btn-xs" onclick="reprintReceipt(${t.id})" title="Cetak Ulang Struk">
                  <i data-lucide="printer" style="width: 13px; height: 13px;"></i>
                </button>
              </td>
            </tr>
          `;
        }).join('');

        txBody.innerHTML = rowsHtml + `
          <tr style="background-color: var(--color-primary-glow); font-weight: bold; border-top: 2px solid var(--color-primary);">
            <td colspan="4">TOTAL</td>
            <td class="text-right font-mono font-bold">Rp ${formatRupiah(totalTxAmount)}</td>
            <td></td>
          </tr>
        `;
      }
      lucide.createIcons();
    }
  } catch (error) {
    console.error('Gagal mengambil laporan hari ini:', error);
  }
}

async function fetchPosTodayRevenue() {
  if (!currentUser) return;
  const posRevenueBar = document.getElementById('posRevenueBar');
  if (!posRevenueBar) return;

  try {
    const response = await fetch(appendOwnerParam(`${API_URL}/api/reports/today`));
    if (response.ok) {
      const data = await response.json();
      
      let totalOmset = data.revenue || 0;
      let totalTunai = 0;
      let totalQris = 0;
      let totalDebit = 0;
      let totalCount = data.transactions_count || 0;

      if (data.transactions && data.transactions.length > 0) {
        totalTunai = data.transactions
          .filter(t => t.payment_method === 'TUNAI')
          .reduce((sum, t) => sum + (t.total_amount || 0), 0);
        totalQris = data.transactions
          .filter(t => t.payment_method === 'QRIS')
          .reduce((sum, t) => sum + (t.total_amount || 0), 0);
        totalDebit = data.transactions
          .filter(t => t.payment_method === 'DEBIT')
          .reduce((sum, t) => sum + (t.total_amount || 0), 0);
      }

      document.getElementById('posRevenueOmset').innerText = `Rp ${formatRupiah(totalOmset)} (${totalCount} Trx)`;
      document.getElementById('posRevenueTunai').innerText = `Rp ${formatRupiah(totalTunai)}`;
      document.getElementById('posRevenueQris').innerText = `Rp ${formatRupiah(totalQris)}`;
      document.getElementById('posRevenueDebit').innerText = `Rp ${formatRupiah(totalDebit)}`;
    }
  } catch (error) {
    console.error('Gagal memuat rincian pendapatan hari ini:', error);
  }
}

async function reprintReceipt(transactionId) {
  try {
    const response = await fetch(appendOwnerParam(`${API_URL}/api/transactions/${transactionId}`));
    if (response.ok) {
      const res = await response.json();
      
      activeTransactionReceipt = {
        invoice_number: res.invoice_number,
        cashier_name: res.cashier_name,
        payment_method: res.payment_method,
        total_amount: res.total_amount,
        discount: res.discount,
        tax: res.tax,
        payment_amount: res.payment_amount,
        change_amount: res.change_amount,
        created_at: new Date(res.created_at).toLocaleString('id-ID'),
        items: res.items.map(item => ({
          product_name: item.product_name,
          quantity: item.quantity,
          price_sell: item.price_sell,
          subtotal: item.subtotal
        }))
      };

      renderReceipt(activeTransactionReceipt);
      document.getElementById('receiptPreviewModal').classList.remove('hidden');
    }
  } catch (error) {
    console.error('Gagal memuat ulang struk:', error);
  }
}

// ==================== TRANSAKSI HARI INI KASIR & VOID ====================

function openTodayTransactionsModal() {
  if (!currentUser) return;
  document.getElementById('todayTxCashierName').innerText = currentUser.name;
  document.getElementById('todayTransactionsModal').classList.remove('hidden');
  fetchTodayTransactions();
}

function closeTodayTransactionsModal() {
  document.getElementById('todayTransactionsModal').classList.add('hidden');
}

async function fetchTodayTransactions() {
  if (!currentUser) return;
  const tbody = document.getElementById('todayTransactionsBody');
  tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted text-xs">Memuat data...</td></tr>`;

  try {
    const today = new Date().toISOString().slice(0, 10);
    const response = await fetch(`${API_URL}/api/transactions?date=${today}&cashier=${encodeURIComponent(currentUser.name)}`);
    if (response.ok) {
      const transactions = await response.json();
      if (transactions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted text-xs">Belum ada transaksi hari ini.</td></tr>`;
        return;
      }

      tbody.innerHTML = transactions.map((t, idx) => {
        const timeStr = new Date(t.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        return `
          <tr>
            <td class="text-center font-bold text-xs">${idx + 1}</td>
            <td class="font-mono font-bold text-sm">${t.invoice_number}</td>
            <td class="text-muted text-xs">${timeStr}</td>
            <td class="text-right font-mono font-bold text-sm">Rp ${formatRupiah(t.total_amount)}</td>
            <td class="text-center"><span class="badge badge-default">${t.payment_method}</span></td>
            <td class="text-center">
              <div style="display: flex; gap: 6px; justify-content: center;">
                <button class="btn btn-secondary btn-icon-only btn-xs" onclick="reprintReceipt(${t.id})" title="Cetak Ulang Struk">
                  <i data-lucide="printer" style="width: 12px; height: 12px;"></i>
                </button>
                <button class="btn btn-danger btn-icon-only btn-xs" onclick="voidTransaction(${t.id}, '${t.invoice_number}')" title="Batalkan Transaksi (Void)">
                  <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
      lucide.createIcons();
    } else {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-danger text-xs">Gagal mengambil data dari server.</td></tr>`;
    }
  } catch (error) {
    console.error('Error fetching cashier transactions:', error);
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-danger text-xs">Gagal terhubung ke server.</td></tr>`;
  }
}

async function voidTransaction(id, invoiceNumber) {
  const reason = prompt(`PERINGATAN VOID: Apakah Anda yakin ingin membatalkan transaksi "${invoiceNumber}"?\n\nSemua stok barang akan dikembalikan ke gudang.\n\nSilakan ketik alasan pembatalan:`);
  
  if (reason === null) return; // User clicks cancel on prompt
  if (reason.trim() === '') {
    showToast('Pembatalan dibatalkan. Alasan void wajib diisi.', 'warning');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/api/transactions/${id}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason })
    });

    const data = await response.json();
    if (response.ok) {
      showToast(data.message || 'Transaksi berhasil di-void!', 'success');
      playDingSound();
      
      // Refresh current screen data
      fetchTodayTransactions();
      
      // Refresh products cache
      fetchProductsCache();

      // Refresh POS today's revenue widget bar
      fetchPosTodayRevenue();
      
      // If reports screen is open and active report tab is today/finance, refresh it
      if (activeScreen === 'reports') {
        if (activeReportTab === 'today') fetchTodayReport();
        else if (activeReportTab === 'finance') fetchFinancialReport();
        else if (activeReportTab === 'void') fetchVoidLogs();
      }
    } else {
      showToast(data.error || 'Gagal memproses pembatalan.', 'danger');
    }
  } catch (error) {
    console.error('Error voiding transaction:', error);
    showToast('Koneksi server gagal.', 'danger');
  }
}

async function fetchVoidLogs() {
  const tbody = document.getElementById('reportVoidLogsBody');
  tbody.innerHTML = `<tr><td colspan="7" class="text-center py-5 text-muted text-xs">Memuat data...</td></tr>`;

  try {
    const response = await fetch(appendOwnerParam(`${API_URL}/api/void-logs`));
    if (response.ok) {
      const logs = await response.json();
      if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-5 text-muted text-xs">Belum ada riwayat pembatalan transaksi (void).</td></tr>`;
        return;
      }

      let totalVoidAmount = 0;
      const rowsHtml = logs.map((log, idx) => {
        totalVoidAmount += log.total_amount;
        const datetimeStr = new Date(log.void_at).toLocaleString('id-ID');
        return `
          <tr>
            <td class="text-center font-bold text-xs">${idx + 1}</td>
            <td class="text-sm">${datetimeStr}</td>
            <td class="font-mono font-bold text-xs text-danger">${log.invoice_number}</td>
            <td><strong>${log.cashier_name}</strong></td>
            <td class="text-right font-mono font-bold">Rp ${formatRupiah(log.total_amount)}</td>
            <td class="text-xs" style="max-width: 250px; white-space: normal; word-break: break-word;">${log.items_summary}</td>
            <td class="text-sm italic" style="max-width: 200px; white-space: normal; word-break: break-word; color: var(--color-danger);">${log.reason}</td>
          </tr>
        `;
      }).join('');

      tbody.innerHTML = rowsHtml + `
        <tr style="background-color: var(--color-primary-glow); font-weight: bold; border-top: 2px solid var(--color-primary);">
          <td colspan="4">TOTAL VOID</td>
          <td class="text-right font-mono font-bold">Rp ${formatRupiah(totalVoidAmount)}</td>
          <td colspan="2"></td>
        </tr>
      `;
      lucide.createIcons();
    } else {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-5 text-danger text-xs">Gagal memuat log void dari server.</td></tr>`;
    }
  } catch (error) {
    console.error('Error fetching void logs:', error);
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-5 text-danger text-xs">Gagal terhubung ke server.</td></tr>`;
  }
}

// 2. LAPORAN STOK
async function fetchStockReport() {
  try {
    const response = await fetch(appendOwnerParam(`${API_URL}/api/reports/products`));
    if (response.ok) {
      const data = await response.json();
      
      // Update Metrics
      document.getElementById('stockTotalSKUs').innerText = `${data.total_skus} Jenis`;
      document.getElementById('stockTotalItems').innerText = `${data.total_items} Unit`;
      document.getElementById('stockAssetBuyVal').innerText = `Rp ${formatRupiah(data.asset_value_cost)}`;
      document.getElementById('stockAssetSellVal').innerText = `Rp ${formatRupiah(data.asset_value_retail)}`;

      // Render Peringatan Stok Kritis
      const alertBox = document.getElementById('criticalStockAlertBox');
      const alertList = document.getElementById('criticalStockList');
      
      if (data.low_stock_products.length > 0) {
        alertList.innerHTML = data.low_stock_products.map(p => `
          <li>Produk <strong>"${p.name}"</strong> (Barcode: ${p.barcode ? p.barcode : '-'}) sisa <strong>${p.stock}</strong> unit.</li>
        `).join('');
        alertBox.classList.remove('hidden');
      } else {
        alertBox.classList.add('hidden');
      }

      // Render Tabel Inventaris
      const body = document.getElementById('stockInventoryBody');
      if (data.products.length === 0) {
        body.innerHTML = `<tr><td colspan="9" class="text-center text-muted">Katalog barang kosong</td></tr>`;
      } else {
        let totalStock = 0;
        let totalAssetCost = 0;
        let totalAssetRetail = 0;
        
        const rowsHtml = data.products.map((p, index) => {
          totalStock += p.stock;
          totalAssetCost += p.asset_value_buy || 0;
          totalAssetRetail += p.asset_value_sell || 0;
          
          const catClass = getCategoryBadgeClass(p.category);
          const isService = p.is_service == 1;
          
          return `
            <tr>
              <td class="text-center">${index + 1}</td>
              <td class="font-mono text-xs">${p.barcode ? p.barcode : '-'}</td>
              <td class="font-bold">${p.name}${isService ? ' <span style="font-size:0.7rem;color:#8b5cf6;">(Jasa)</span>' : ''}</td>
              <td><span class="badge ${catClass}">${p.category ? p.category : 'Lainnya'}</span></td>
              <td class="text-right font-mono text-muted">Rp ${formatRupiah(p.price_buy)}</td>
              <td class="text-right font-mono">Rp ${formatRupiah(p.price_sell)}</td>
              <td class="text-center font-bold ${isService ? '' : (p.stock < 5 ? 'text-danger' : '')}">${isService ? '-' : p.stock}</td>
              <td class="text-right font-mono text-muted">Rp ${formatRupiah(p.asset_value_buy)}</td>
              <td class="text-right font-mono font-bold text-success">Rp ${formatRupiah(p.asset_value_sell)}</td>
            </tr>
          `;
        }).join('');

        body.innerHTML = rowsHtml + `
          <tr style="background-color: var(--color-primary-glow); font-weight: bold; border-top: 2px solid var(--color-primary);">
            <td colspan="6">TOTAL</td>
            <td class="text-center font-bold">${totalStock}</td>
            <td class="text-right font-mono font-bold">Rp ${formatRupiah(totalAssetCost)}</td>
            <td class="text-right font-mono font-bold text-success">Rp ${formatRupiah(totalAssetRetail)}</td>
          </tr>
        `;
      }
    }
  } catch (error) {
    console.error('Gagal mengambil laporan stok:', error);
  }
}

// 3. LAPORAN KEUANGAN
function setFinanceQuickDate(range, btn) {
  // Update UI active button
  const filterCard = btn.closest('.finance-filter-card');
  filterCard.querySelectorAll('.quick-dates button').forEach(el => el.classList.remove('active'));
  btn.classList.add('active');

  const startInput = document.getElementById('financeStartDate');
  const endInput = document.getElementById('financeEndDate');
  
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  if (range === 'today') {
    startInput.value = fmt(now);
    endInput.value = fmt(now);
  } else if (range === 'yesterday') {
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    startInput.value = fmt(yesterday);
    endInput.value = fmt(yesterday);
  } else if (range === 'last7days') {
    const start = new Date();
    start.setDate(now.getDate() - 7);
    startInput.value = fmt(start);
    endInput.value = fmt(now);
  } else if (range === 'thismonth') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    startInput.value = fmt(start);
    endInput.value = fmt(now);
  }

  fetchFinancialReport();
}

async function fetchFinancialReport() {
  const startDate = document.getElementById('financeStartDate').value;
  const endDate = document.getElementById('financeEndDate').value;

  if (!startDate || !endDate) {
    showToast('Pilih rentang tanggal terlebih dahulu', 'warning');
    return;
  }

  try {
    const response = await fetch(appendOwnerParam(`${API_URL}/api/reports/finance?startDate=${startDate}&endDate=${endDate}`));
    if (response.ok) {
      const data = await response.json();

      // Metrics
      document.getElementById('financeRevenueVal').innerText = `Rp ${formatRupiah(data.summary.revenue)}`;
      document.getElementById('financeHppVal').innerText = `Rp ${formatRupiah(data.summary.hpp)}`;
      document.getElementById('financeProfitVal').innerText = `Rp ${formatRupiah(data.summary.profit)}`;
      document.getElementById('financeExpensesVal').innerText = `Rp ${formatRupiah(data.summary.expenses || 0)}`;
      document.getElementById('financeNetProfitVal').innerText = `Rp ${formatRupiah(data.summary.net_profit || 0)}`;

      // Render Laporan Harian
      const dailyBody = document.getElementById('financeDailyBody');
      if (data.daily.length === 0) {
        dailyBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted text-xs">Tidak ada data transaksi pada rentang tanggal ini</td></tr>`;
      } else {
        let totalDailyTrans = 0;
        let totalDailyRevenue = 0;
        let totalDailyHpp = 0;
        let totalDailyProfit = 0;

        const rowsHtml = data.daily.map(row => {
          totalDailyTrans += row.trans_count;
          totalDailyRevenue += row.revenue;
          totalDailyHpp += row.hpp;
          totalDailyProfit += row.profit;

          return `
            <tr>
              <td class="font-bold">${formatDisplayDate(row.trans_date)}</td>
              <td class="text-center">${row.trans_count} Transaksi</td>
              <td class="text-right font-mono text-primary">Rp ${formatRupiah(row.revenue)}</td>
              <td class="text-right font-mono text-muted">Rp ${formatRupiah(row.hpp)}</td>
              <td class="text-right font-mono font-bold text-success">Rp ${formatRupiah(row.profit)}</td>
            </tr>
          `;
        }).join('');

        dailyBody.innerHTML = rowsHtml + `
          <tr style="background-color: var(--color-primary-glow); font-weight: bold; border-top: 2px solid var(--color-primary);">
            <td>TOTAL</td>
            <td class="text-center font-bold">${totalDailyTrans} Transaksi</td>
            <td class="text-right font-mono text-primary font-bold">Rp ${formatRupiah(totalDailyRevenue)}</td>
            <td class="text-right font-mono text-muted font-bold">Rp ${formatRupiah(totalDailyHpp)}</td>
            <td class="text-right font-mono font-bold text-success">Rp ${formatRupiah(totalDailyProfit)}</td>
          </tr>
        `;
      }

      // Render Breakdown Pembayaran
      const payBody = document.getElementById('financePaymentBody');
      if (data.payment_breakdown.length === 0) {
        payBody.innerHTML = `<tr><td colspan="3" class="text-center text-muted text-xs">Kosong</td></tr>`;
      } else {
        let totalPayCount = 0;
        let totalPayAmount = 0;

        const rowsHtml = data.payment_breakdown.map(p => {
          totalPayCount += p.count;
          totalPayAmount += p.amount;

          return `
            <tr>
              <td class="font-bold">${p.payment_method}</td>
              <td class="text-center text-muted">${p.count} x</td>
              <td class="text-right font-mono font-bold">Rp ${formatRupiah(p.amount)}</td>
            </tr>
          `;
        }).join('');

        payBody.innerHTML = rowsHtml + `
          <tr style="background-color: var(--color-primary-glow); font-weight: bold; border-top: 2px solid var(--color-primary);">
            <td>TOTAL</td>
            <td class="text-center font-bold">${totalPayCount} x</td>
            <td class="text-right font-mono font-bold">Rp ${formatRupiah(totalPayAmount)}</td>
          </tr>
        `;
      }

      // Render Breakdown Kasir
      const cashierBody = document.getElementById('financeCashierBody');
      if (data.cashier_breakdown.length === 0) {
        cashierBody.innerHTML = `<tr><td colspan="3" class="text-center text-muted text-xs">Kosong</td></tr>`;
      } else {
        let totalCashierCount = 0;
        let totalCashierAmount = 0;

        const rowsHtml = data.cashier_breakdown.map(c => {
          totalCashierCount += c.count;
          totalCashierAmount += c.amount;

          return `
            <tr>
              <td class="font-bold">${c.cashier_name}</td>
              <td class="text-center text-muted">${c.count} x</td>
              <td class="text-right font-mono font-bold">Rp ${formatRupiah(c.amount)}</td>
            </tr>
          `;
        }).join('');

        cashierBody.innerHTML = rowsHtml + `
          <tr style="background-color: var(--color-primary-glow); font-weight: bold; border-top: 2px solid var(--color-primary);">
            <td>TOTAL</td>
            <td class="text-center font-bold">${totalCashierCount} x</td>
            <td class="text-right font-mono font-bold">Rp ${formatRupiah(totalCashierAmount)}</td>
          </tr>
        `;
      }

      // Render Grafik & Pengeluaran
      renderFinancialCharts(data);
      fetchExpenses();
    }
  } catch (error) {
    console.error('Gagal mengambil laporan keuangan:', error);
  }
}

// Print Reports in A4 layout
function printReport(type) {
  // Bersihkan kelas cetak laporan sebelumnya
  document.body.classList.remove('print-today-items', 'print-today-transactions', 'print-inventory', 'print-finance-summary');
  
  // Tambah kelas khusus print ke body
  document.body.classList.add('printing-report', `print-${type}`);
  
  window.print();
  
  // Normal kembali
  setTimeout(() => {
    document.body.classList.remove('printing-report', `print-${type}`);
  }, 500);
}

// ==================== CADANGAN DATABASE (BACKUP / RESTORE) ====================

async function exportDatabase() {
  try {
    const response = await fetch(`${API_URL}/api/data/export`);
    if (response.ok) {
      const data = await response.json();
      
      // Buat file JSON download
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data));
      const downloadAnchor = document.createElement('a');
      
      const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const filename = `kasirku_backup_${dateStr}.json`;
      
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", filename);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      showToast('Pencadangan berhasil! File JSON terunduh.', 'success');
    }
  } catch (error) {
    console.error('Ekspor database gagal:', error);
    showToast('Koneksi backend gagal. Backup dibatalkan.', 'danger');
  }
}

function triggerImportFileInput() {
  document.getElementById('importFileInput').click();
}

async function importDatabase(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.products || !data.transactions || !data.transaction_items) {
        showToast('File JSON tidak valid. Format backup salah.', 'danger');
        return;
      }

      if (confirm('PERINGATAN: Memulihkan data akan menghapus semua database barang dan transaksi saat ini! Apakah Anda yakin?')) {
        const response = await fetch(`${API_URL}/api/data/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        if (response.ok) {
          showToast('Data berhasil dipulihkan secara penuh!', 'success');
          // Reload
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        } else {
          const res = await response.json();
          showToast(res.error || 'Gagal memulihkan database', 'danger');
        }
      }
    } catch (err) {
      showToast('Gagal membaca file JSON backup.', 'danger');
    }
  };
  reader.readAsText(file);
}

async function clearDatabase(mode) {
  const confirmMsg = mode === 'all' 
    ? 'PERINGATAN KRITIS: Anda akan menghapus SELURUH database (semua produk dan riwayat penjualan)! Data tidak dapat dikembalikan.\n\nKetik kata sandi "KOSONGKAN" untuk melanjutkan:'
    : 'PERINGATAN: Anda akan menghapus SELURUH riwayat transaksi penjualan! Katalog produk tetap disimpan.\n\nKetik kata sandi "KOSONGKAN" untuk melanjutkan:';

  const userConfirm = prompt(confirmMsg);
  if (userConfirm === 'KOSONGKAN') {
    try {
      const response = await fetch(`${API_URL}/api/data/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: mode })
      });

      const resData = await response.json();

      if (response.ok) {
        showToast(resData.message, 'success');
        playDingSound();
        
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        showToast(resData.error || 'Gagal mengosongkan database', 'danger');
      }
    } catch (error) {
      console.error('Pengosongan database gagal:', error);
      showToast('Koneksi server gagal', 'danger');
    }
  } else if (userConfirm !== null) {
    showToast('Konfirmasi salah. Database batal dikosongkan.', 'warning');
  }
}

// ==================== SHORTCUT KEYBOARD UTILITIES ====================

function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    // F2: Fokus kolom input cari barcode
    if (e.key === 'F2') {
      e.preventDefault();
      switchScreen('pos');
      document.getElementById('barcodeSearchInput').focus();
    }
    
    // F4: Fokus nominal uang bayar
    else if (e.key === 'F4') {
      e.preventDefault();
      if (activeScreen === 'pos' && cart.length > 0 && currentPaymentMethod === 'TUNAI') {
        document.getElementById('inputAmountPaid').focus();
      }
    }

    // F8: Aktifkan/Matikan webcam scanner
    else if (e.key === 'F8') {
      e.preventDefault();
      if (activeScreen === 'pos') {
        const modal = document.getElementById('cameraScannerModal');
        if (modal.classList.contains('hidden')) {
          openCameraScanner();
        } else {
          closeCameraScanner();
        }
      }
    }

    // Enter di receipt modal untuk print
    else if (e.key === 'Enter') {
      const receiptModal = document.getElementById('receiptPreviewModal');
      if (!receiptModal.classList.contains('hidden')) {
        e.preventDefault();
        printReceipt();
      }
    }
  });
}

// ==================== HELPER FORMATTING & UTILITIES ====================

function formatRupiah(number) {
  return new Intl.NumberFormat('id-ID').format(Math.round(number));
}

function formatDisplayDate(dateStr) {
  const d = new Date(dateStr);
  const pad = (n) => String(n).padStart(2, '0');
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return `${pad(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function getCategoryBadgeClass(category) {
  if (!category) return 'badge-default';
  const c = category.toLowerCase();
  if (c.includes('makan')) return 'badge-makanan';
  if (c.includes('minum')) return 'badge-minuman';
  if (c.includes('harian') || c.includes('sabun') || c.includes('kebutuhan')) return 'badge-harian';
  if (c.includes('tulis') || c.includes('alat')) return 'badge-tulis';
  return 'badge-default';
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ==================== CATAT BARANG MASUK / RESTOCK WIZARD ====================

let activeCatalogTab = 'list';
let dbStockEntries = []; // Cache riwayat barang masuk
let selectedRestockProductIndex = -1; // Navigasi pencarian modal restok

function switchCatalogTab(tabId) {
  activeCatalogTab = tabId;

  // Sembunyikan semua konten sub-tab
  document.getElementById('catalogContentList').classList.add('hidden');
  document.getElementById('catalogContentStockIn').classList.add('hidden');
  document.getElementById('catalogContentCategories').classList.add('hidden');

  // Hapus aktif semua tombol
  document.getElementById('subTabCatalogList').classList.remove('active');
  document.getElementById('subTabCatalogStockIn').classList.remove('active');
  document.getElementById('subTabCatalogCategories').classList.remove('active');

  if (tabId === 'list') {
    document.getElementById('subTabCatalogList').classList.add('active');
    document.getElementById('catalogContentList').classList.remove('hidden');
    fetchProductCatalog();
  } else if (tabId === 'stockin') {
    document.getElementById('subTabCatalogStockIn').classList.add('active');
    document.getElementById('catalogContentStockIn').classList.remove('hidden');
    fetchStockEntries();
  } else if (tabId === 'categories') {
    document.getElementById('subTabCatalogCategories').classList.add('active');
    document.getElementById('catalogContentCategories').classList.remove('hidden');
    fetchCategories();
  }
}

function openStockEntryModal() {
  const form = document.getElementById('stockEntryForm');
  form.reset();
  
  // Set default date to today in local timezone YYYY-MM-DD
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;
  document.getElementById('stockEntryDate').value = todayStr;
  
  // Reset fields
  document.getElementById('stockEntryProductId').value = '';
  document.getElementById('stockEntrySelectedProductDisplay').classList.add('hidden');
  document.getElementById('stockEntryProductDropdown').classList.add('hidden');
  selectedRestockProductIndex = -1;

  document.getElementById('stockEntryModal').classList.remove('hidden');
  document.getElementById('stockEntryProductSearch').focus();
}

function closeStockEntryModal() {
  document.getElementById('stockEntryModal').classList.add('hidden');
}

function handleStockEntryProductSearch(query) {
  const dropdown = document.getElementById('stockEntryProductDropdown');
  
  if (!query.trim()) {
    dropdown.classList.add('hidden');
    return;
  }
  
  // Filter lokal dari cache dbProducts
  const filtered = dbProducts.filter(p => 
    p.name.toLowerCase().includes(query.toLowerCase()) || 
    (p.barcode && p.barcode.includes(query))
  );

  if (filtered.length === 0) {
    dropdown.innerHTML = `<div class="p-3 text-center text-xs text-muted">Produk tidak ditemukan</div>`;
    dropdown.classList.remove('hidden');
    selectedRestockProductIndex = -1;
    return;
  }

  // Render hasil pencarian produk ke dropdown autocomplete
  dropdown.innerHTML = filtered.map((p, index) => `
    <div class="search-result-item" id="restockItem-${index}" onclick="selectProductForStockEntry(${p.id})">
      <div class="result-info">
        <span class="result-name">${p.name}</span>
        <span class="result-meta">${p.barcode ? p.barcode : 'Tanpa Barcode'} | ${p.category}</span>
      </div>
      <div class="result-price-stock">
        <span class="result-stock text-muted">Stok Saat Ini: ${p.stock}</span>
      </div>
    </div>
  `).join('');
  
  dropdown.classList.remove('hidden');
  selectedRestockProductIndex = -1;
  
  // Bind arrow keys listener just for this input
  document.getElementById('stockEntryProductSearch').onkeydown = (e) => {
    const items = dropdown.querySelectorAll('.search-result-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedRestockProductIndex = (selectedRestockProductIndex + 1) % items.length;
      highlightRestockDropdownItem(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedRestockProductIndex = (selectedRestockProductIndex - 1 + items.length) % items.length;
      highlightRestockDropdownItem(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedRestockProductIndex >= 0 && selectedRestockProductIndex < items.length) {
        items[selectedRestockProductIndex].click();
      }
    } else if (e.key === 'Escape') {
      dropdown.classList.add('hidden');
    }
  };
}

function highlightRestockDropdownItem(items) {
  items.forEach((item, index) => {
    if (index === selectedRestockProductIndex) {
      item.classList.add('highlighted');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('highlighted');
    }
  });
}

function selectProductForStockEntry(productId) {
  const product = dbProducts.find(p => p.id === productId);
  if (!product) return;

  // Set values
  document.getElementById('stockEntryProductId').value = product.id;
  document.getElementById('stockEntryProductSearch').value = product.name;
  
  // Show product badge
  document.getElementById('selectedProductName').innerText = product.name;
  document.getElementById('selectedProductMeta').innerText = `${product.barcode ? product.barcode : 'Tanpa Barcode'} | ${product.category}`;
  document.getElementById('selectedProductStock').innerText = `Stok Saat Ini: ${product.stock}`;
  document.getElementById('stockEntrySelectedProductDisplay').classList.remove('hidden');
  
  // Hide dropdown
  document.getElementById('stockEntryProductDropdown').classList.add('hidden');
  
  // Focus qty input
  document.getElementById('stockEntryQty').focus();
}

async function saveStockEntry(e) {
  e.preventDefault();
  
  const productId = document.getElementById('stockEntryProductId').value;
  const quantity = parseInt(document.getElementById('stockEntryQty').value);
  const entryDate = document.getElementById('stockEntryDate').value;
  const supplier = document.getElementById('stockEntrySupplier').value.trim();
  const notes = document.getElementById('stockEntryNotes').value.trim();

  if (!productId) {
    showToast('Harap pilih produk terdaftar dari hasil pencarian!', 'warning');
    document.getElementById('stockEntryProductSearch').focus();
    return;
  }

  if (isNaN(quantity) || quantity <= 0) {
    showToast('Jumlah masuk harus berupa angka positif!', 'warning');
    document.getElementById('stockEntryQty').focus();
    return;
  }

  const payload = {
    product_id: parseInt(productId),
    quantity: quantity,
    entry_date: entryDate,
    supplier: supplier,
    notes: notes,
    recorded_by: currentUser ? currentUser.name : 'System'
  };

  try {
    const response = await fetch(`${API_URL}/api/stock/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (response.ok) {
      showToast('Stok barang berhasil ditambahkan dan dicatat!', 'success');
      playDingSound();
      closeStockEntryModal();
      
      // Refresh cache produk & update view
      await fetchProductsCache();
      if (activeCatalogTab === 'list') {
        fetchProductCatalog();
      } else {
        fetchStockEntries();
      }
    } else {
      showToast(data.error || 'Gagal menyimpan barang masuk', 'danger');
    }
  } catch (error) {
    console.error('Koneksi backend gagal:', error);
    showToast('Koneksi server gagal', 'danger');
  }
}

async function fetchStockEntries() {
  const searchInput = document.getElementById('stockEntrySearch');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

  try {
    const response = await fetch(appendOwnerParam(`${API_URL}/api/stock/entries`));
    if (response.ok) {
      dbStockEntries = await response.json();
      
      // Filter local jika ada search
      let filtered = dbStockEntries;
      if (query) {
        filtered = dbStockEntries.filter(e => 
          e.product_name.toLowerCase().includes(query) || 
          (e.barcode && e.barcode.includes(query)) ||
          (e.supplier && e.supplier.toLowerCase().includes(query))
        );
      }
      
      renderStockEntries(filtered);
    }
  } catch (error) {
    console.error('Gagal mengambil riwayat barang masuk:', error);
  }
}

function renderStockEntries(entries) {
  const body = document.getElementById('stockEntryBody');
  if (!body) return;

  if (entries.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-5 text-muted">Belum ada riwayat barang masuk / restok.</td>
      </tr>
    `;
    return;
  }

  body.innerHTML = entries.map((e, index) => `
    <tr>
      <td class="text-center">${index + 1}</td>
      <td class="font-bold text-xs">${formatDisplayDate(e.entry_date)}</td>
      <td class="font-mono text-xs text-muted">${e.barcode ? e.barcode : '-'}</td>
      <td class="font-semibold">${e.product_name}</td>
      <td class="text-center font-bold font-mono text-success">+${e.quantity}</td>
      <td>${e.supplier ? e.supplier : '<span class="text-muted">-</span>'}</td>
      <td class="text-muted text-sm">${e.notes ? e.notes : '-'}</td>
      <td class="text-xs text-muted font-bold">${e.recorded_by}</td>
    </tr>
  `).join('');
}

// ==================== SYSTEMS LOGINS & AUTHENTICATION ====================

function checkUserAuth() {
  const savedUser = localStorage.getItem('pos_user');
  const loginOverlay = document.getElementById('loginOverlay');
  
  if (!savedUser) {
    currentUser = null;
    loginOverlay.classList.remove('hidden');
    document.getElementById('loginUsername').focus();
    return;
  }

  try {
    currentUser = JSON.parse(savedUser);
    loginOverlay.classList.add('hidden');
    
    // Terapkan kelas tema visual berdasarkan role pengguna
    document.body.classList.remove('role-superadmin', 'role-owneradmin', 'role-cashier');
    if (currentUser.role === 'cashier') {
      document.body.classList.add('role-cashier');
    } else if (currentUser.role === 'admin') {
      const isOwnerAdmin = currentUser.owner && currentUser.owner !== 'All' && currentUser.owner !== 'undefined';
      if (isOwnerAdmin) {
        document.body.classList.add('role-owneradmin');
      } else {
        document.body.classList.add('role-superadmin');
      }
    }
    
    // Set nama kasir aktif di header
    activeCashier = currentUser.name;
    document.getElementById('activeCashierName').innerText = currentUser.name;
    
    // Terapkan batasan level akses (role)
    const menuProducts = document.getElementById('menuProducts');
    const menuReports = document.getElementById('menuReports');
    const menuUsers = document.getElementById('menuUsers');
    const menuOwners = document.getElementById('menuOwners');
    const menuOpname = document.getElementById('menuOpname');
    const menuMikrotik = document.getElementById('menuMikrotik');
    const menuPos = document.getElementById('menuPos');

    if (currentUser.role === 'cashier') {
      if (menuPos) menuPos.classList.remove('hidden');
      if (menuProducts) menuProducts.classList.add('hidden');
      if (menuReports) menuReports.classList.add('hidden');
      if (menuUsers) menuUsers.classList.add('hidden');
      if (menuOwners) menuOwners.classList.add('hidden');
      if (menuOpname) menuOpname.classList.add('hidden');
      if (menuMikrotik) menuMikrotik.classList.add('hidden');
      switchScreen('pos');
    } else {
      if (menuPos) menuPos.classList.add('hidden');
      if (menuProducts) menuProducts.classList.remove('hidden');
      if (menuReports) menuReports.classList.remove('hidden');
      if (menuOpname) menuOpname.classList.remove('hidden');
      
      // Batasi akses Manajemen Kasir, Manajemen Owner & Integrasi MikroTik untuk Owner Admin
      const isOwnerAdmin = currentUser.owner && currentUser.owner !== 'All' && currentUser.owner !== 'undefined';
      if (isOwnerAdmin) {
        if (menuUsers) menuUsers.classList.add('hidden');
        if (menuOwners) menuOwners.classList.add('hidden');
        if (menuMikrotik) menuMikrotik.classList.add('hidden');
      } else {
        if (menuUsers) menuUsers.classList.remove('hidden');
        if (menuOwners) menuOwners.classList.remove('hidden');
        if (menuMikrotik) menuMikrotik.classList.remove('hidden');
      }
      switchScreen('products');
    }

    // Ambil cache data produk, kategori & owner dari API
    fetchProductsCache();
    fetchCategories();
    fetchOwners();
    fetchStoreSettings();
    checkActiveShift();

  } catch (e) {
    console.error('Error parsing user data:', e);
    logout();
  }
}

async function processLogin(e) {
  e.preventDefault();
  const usernameInput = document.getElementById('loginUsername');
  const passwordInput = document.getElementById('loginPassword');
  const errorAlert = document.getElementById('loginErrorAlert');

  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  try {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (response.ok) {
      errorAlert.classList.add('hidden');
      playDingSound();
      showToast(`Selamat datang kembali, ${data.user.name}!`, 'success');
      
      // Simpan status login
      localStorage.setItem('pos_user', JSON.stringify(data.user));
      
      // Bersihkan form
      usernameInput.value = '';
      passwordInput.value = '';
      
      // Jalankan auth check
      checkUserAuth();
    } else {
      errorAlert.innerText = data.error || 'Username atau Password salah!';
      errorAlert.classList.remove('hidden');
      playBeepSound();
    }
  } catch (error) {
    console.error('Koneksi login gagal:', error);
    errorAlert.innerText = 'Koneksi server gagal. Silakan coba lagi.';
    errorAlert.classList.remove('hidden');
    playBeepSound();
  }
}

function logout() {
  localStorage.removeItem('pos_user');
  currentUser = null;
  cart = [];
  window.location.reload();
}

// ==================== MANAGEMENT KASIR (USERS CRUD) ====================

async function fetchUserCatalog() {
  const searchInput = document.getElementById('userCatalogSearch');
  const query = searchInput.value.trim().toLowerCase();

  try {
    const response = await fetch(`${API_URL}/api/users`);
    if (response.ok) {
      dbUsers = await response.json();
      
      // Filter lokal jika ada search
      let filteredUsers = dbUsers;
      if (query) {
        filteredUsers = dbUsers.filter(u => 
          u.name.toLowerCase().includes(query) || 
          u.username.toLowerCase().includes(query)
        );
      }
      
      renderUserCatalog(filteredUsers);
    }
  } catch (error) {
    console.error('Gagal mengambil daftar kasir:', error);
  }
}

function renderUserCatalog(users) {
  const body = document.getElementById('userCatalogBody');
  
  if (users.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-5 text-muted">Akun kasir tidak ditemukan</td>
      </tr>
    `;
    return;
  }

  body.innerHTML = users.map((u, index) => {
    const roleBadge = u.role === 'admin' 
      ? '<span class="badge badge-harian">Admin (Akses Penuh)</span>' 
      : '<span class="badge badge-minuman">Kasir (POS Saja)</span>';

    // Tombol hapus disembunyikan untuk akun admin utama
    const deleteBtn = u.username === 'admin'
      ? ''
      : `
        <button class="btn btn-secondary btn-xs text-danger" onclick="deleteUser(${u.id})">
          <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
        </button>
      `;

    return `
      <tr>
        <td class="text-center">${index + 1}</td>
        <td class="font-bold">${u.name}</td>
        <td class="font-mono text-sm">${u.username}</td>
        <td class="text-center">${roleBadge}</td>
        <td class="text-muted text-xs">${formatDisplayDate(u.created_at)}</td>
        <td class="text-center">
          <div class="input-with-action justify-center" style="gap: 6px;">
            <button class="btn btn-secondary btn-xs" onclick="openUserModal('edit', ${u.id})">
              <i data-lucide="edit-3" style="width: 13px; height: 13px;"></i>
              <span>Edit</span>
            </button>
            ${deleteBtn}
          </div>
        </td>
      </tr>
    `;
  }).join('');
  
  lucide.createIcons();
}

function openUserModal(mode, id = null) {
  const form = document.getElementById('userForm');
  form.reset();
  document.getElementById('editUserId').value = '';
  document.getElementById('userModalTitle').innerText = 'Tambah Kasir Baru';
  
  const passwordInput = document.getElementById('formUserPassword');
  const labelPassword = document.getElementById('labelFormUserPassword');
  const helpPassword = document.getElementById('helpFormUserPassword');
  
  const roleSelect = document.getElementById('formUserRole');
  const ownerWrapper = document.getElementById('formUserOwnerWrapper');
  const ownerSelect = document.getElementById('formUserOwner');

  // Setup change listener to toggle owner dropdown
  roleSelect.onchange = () => {
    if (roleSelect.value === 'admin') {
      if (ownerWrapper) ownerWrapper.style.display = '';
    } else {
      if (ownerWrapper) ownerWrapper.style.display = 'none';
      if (ownerSelect) ownerSelect.value = '';
    }
  };
  
  if (mode === 'add') {
    passwordInput.required = true;
    labelPassword.innerText = 'Password Login *';
    helpPassword.innerText = '';
    document.getElementById('formUserUsername').disabled = false;
    if (ownerWrapper) ownerWrapper.style.display = 'none';
    if (ownerSelect) ownerSelect.value = '';
  } else if (mode === 'edit' && id !== null) {
    document.getElementById('userModalTitle').innerText = 'Ubah Akun Kasir';
    const u = dbUsers.find(user => user.id === id);
    if (u) {
      document.getElementById('editUserId').value = u.id;
      document.getElementById('formUserFullName').value = u.name;
      document.getElementById('formUserUsername').value = u.username;
      document.getElementById('formUserRole').value = u.role;
      if (ownerSelect) ownerSelect.value = u.owner || '';

      if (u.role === 'admin' && u.username !== 'admin') {
        if (ownerWrapper) ownerWrapper.style.display = '';
      } else {
        if (ownerWrapper) ownerWrapper.style.display = 'none';
      }
      
      // Admin utama tidak boleh diganti username dan rolenya
      if (u.username === 'admin') {
        document.getElementById('formUserUsername').disabled = true;
        document.getElementById('formUserRole').disabled = true;
      } else {
        document.getElementById('formUserUsername').disabled = false;
        document.getElementById('formUserRole').disabled = false;
      }

      passwordInput.required = false;
      labelPassword.innerText = 'Ganti Password (Opsional)';
      helpPassword.innerText = 'Kosongkan jika password tidak ingin diubah.';
    }
  }

  document.getElementById('userFormModal').classList.remove('hidden');
  document.getElementById('formUserFullName').focus();
}

function closeUserModal() {
  document.getElementById('userFormModal').classList.add('hidden');
}

async function saveUser(e) {
  e.preventDefault();
  
  const id = document.getElementById('editUserId').value;
  const username = document.getElementById('formUserUsername').value.trim();
  const name = document.getElementById('formUserFullName').value.trim();
  const password = document.getElementById('formUserPassword').value;
  const role = document.getElementById('formUserRole').value;

  const isEdit = id !== '';
  const url = isEdit ? `${API_URL}/api/users/${id}` : `${API_URL}/api/users`;
  const method = isEdit ? 'PUT' : 'POST';

  const ownerEl = document.getElementById('formUserOwner');
  const payload = { username, name, role, owner: (role === 'admin' && ownerEl) ? (ownerEl.value || null) : null };
  if (password.trim() !== '') {
    payload.password = password;
  }

  try {
    const response = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const resData = await response.json();

    if (response.ok) {
      showToast(`Akun kasir "${name}" berhasil disimpan`, 'success');
      closeUserModal();
      fetchUserCatalog();
      fetchOwners();
    } else {
      showToast(resData.error || 'Gagal menyimpan akun kasir', 'danger');
    }
  } catch (error) {
    console.error('Gagal menyimpan kasir:', error);
    showToast('Koneksi server gagal', 'danger');
  }
}

async function deleteUser(id) {
  const u = dbUsers.find(user => user.id === id);
  if (!u) return;

  if (confirm(`Apakah Anda yakin ingin menghapus akun kasir "${u.name}"?`)) {
    try {
      const response = await fetch(`${API_URL}/api/users/${id}`, { method: 'DELETE' });
      if (response.ok) {
        showToast(`Akun kasir "${u.name}" berhasil dihapus`, 'success');
        fetchUserCatalog();
        fetchOwners();
      } else {
        const res = await response.json();
        showToast(res.error || 'Gagal menghapus kasir', 'danger');
      }
    } catch (error) {
      console.error('Gagal menghapus kasir:', error);
    }
  }
}

// ==================== STOCK OPNAME LOGIC (INVENTORY AUDIT) ====================

function switchOpnameTab(tabId) {
  activeOpnameTab = tabId;

  // Toggle active tab buttons
  document.getElementById('subTabOpnameNew').classList.toggle('active', tabId === 'new');
  document.getElementById('subTabOpnameHistory').classList.toggle('active', tabId === 'history');

  // Toggle active content divs
  document.getElementById('opnameContentNew').classList.toggle('hidden', tabId !== 'new');
  document.getElementById('opnameContentHistory').classList.toggle('hidden', tabId !== 'history');

  if (tabId === 'history') {
    fetchOpnameHistory();
  } else {
    setTimeout(() => {
      document.getElementById('opnameBarcodeSearch').focus();
    }, 200);
  }
}

function handleOpnameProductSearch(query) {
  const dropdown = document.getElementById('opnameProductDropdown');
  if (!query.trim()) {
    dropdown.classList.add('hidden');
    return;
  }

  // Filter products by name or barcode
  const filtered = dbProducts.filter(p =>
    p.name.toLowerCase().includes(query.toLowerCase()) ||
    (p.barcode && p.barcode.includes(query))
  );

  if (filtered.length === 0) {
    dropdown.innerHTML = `<div class="p-3 text-center text-xs text-muted">Produk tidak ditemukan</div>`;
    dropdown.classList.remove('hidden');
    return;
  }

  dropdown.innerHTML = filtered.map((p, index) => `
    <div class="search-result-item" id="opnameResult-${p.id}" onclick="selectProductForOpname(${p.id})">
      <div class="result-info">
        <span class="result-name">${p.name}</span>
        <span class="result-meta">${p.barcode ? p.barcode : 'Tanpa Barcode'} | ${p.category}</span>
      </div>
      <div class="result-price-stock">
        <span class="result-stock text-muted">Stok Sistem: ${p.stock}</span>
      </div>
    </div>
  `).join('');

  dropdown.classList.remove('hidden');
}

function selectProductForOpname(productId) {
  const product = dbProducts.find(p => p.id === productId);
  if (!product) return;

  const existing = opnameCart.find(item => item.product_id === productId);
  if (existing) {
    existing.physical_stock += 1;
  } else {
    opnameCart.push({
      product_id: product.id,
      barcode: product.barcode,
      name: product.name,
      system_stock: product.stock,
      physical_stock: 1
    });
  }

  playBeepSound();
  
  // Clear and hide search input/dropdown
  const searchInput = document.getElementById('opnameBarcodeSearch');
  searchInput.value = '';
  searchInput.focus();
  document.getElementById('opnameProductDropdown').classList.add('hidden');

  renderOpnameCart();
}

function addBarcodeToOpnameCart(barcode) {
  const product = dbProducts.find(p => p.barcode === barcode);
  if (!product) {
    showToast(`Produk dengan barcode ${barcode} tidak terdaftar!`, 'warning');
    playBeepSound();
    return;
  }

  const existing = opnameCart.find(item => item.product_id === product.id);
  if (existing) {
    existing.physical_stock += 1;
  } else {
    opnameCart.push({
      product_id: product.id,
      barcode: product.barcode,
      name: product.name,
      system_stock: product.stock,
      physical_stock: 1
    });
  }

  playBeepSound();
  showToast(`Berhasil memindai: ${product.name}`, 'success');

  renderOpnameCart();
}

function updateOpnameQty(productId, val) {
  const item = opnameCart.find(item => item.product_id === productId);
  if (!item) return;

  const parsed = parseInt(val);
  if (isNaN(parsed) || parsed < 0) {
    item.physical_stock = 0;
  } else {
    item.physical_stock = parsed;
  }

  renderOpnameCart();
}

function deleteOpnameItem(productId) {
  opnameCart = opnameCart.filter(item => item.product_id !== productId);
  renderOpnameCart();
}

function renderOpnameCart() {
  const body = document.getElementById('opnameCartBody');
  const count = document.getElementById('opnameCartCount');
  
  count.innerText = `${opnameCart.length} Barang`;

  if (opnameCart.length === 0) {
    body.innerHTML = `
      <tr class="empty-opname-row">
        <td colspan="8" class="text-center py-5 text-muted">
          <i data-lucide="clipboard-check" class="empty-cart-icon" style="width: 48px; height: 48px; margin-bottom: 12px; display: inline-block;"></i>
          <p>Mulai memindai barcode atau ketik nama produk di atas untuk memulai audit fisik.</p>
        </td>
      </tr>
    `;
    lucide.createIcons();
    return;
  }

  body.innerHTML = opnameCart.map((item, index) => {
    const diff = item.physical_stock - item.system_stock;
    let diffText = diff > 0 ? `+${diff}` : `${diff}`;
    let badgeClass = 'badge-match';
    let statusText = 'Sesuai';

    if (diff < 0) {
      badgeClass = 'badge-shortage';
      statusText = 'Kurang / Minus';
    } else if (diff > 0) {
      badgeClass = 'badge-surplus';
      statusText = 'Lebih / Surplus';
    }

    return `
      <tr>
        <td class="text-center">${index + 1}</td>
        <td class="font-mono text-xs text-muted">${item.barcode ? item.barcode : '-'}</td>
        <td class="font-semibold">${item.name}</td>
        <td class="text-center font-mono font-bold">${item.system_stock}</td>
        <td class="text-center">
          <input type="number" min="0" value="${item.physical_stock}" 
                 style="width: 80px; text-align: center; padding: 6px;" 
                 oninput="updateOpnameQty(${item.product_id}, this.value)">
        </td>
        <td class="text-center font-mono font-bold ${diff === 0 ? '' : (diff > 0 ? 'text-success' : 'text-danger')}">${diffText}</td>
        <td class="text-center">
          <span class="badge ${badgeClass}">${statusText}</span>
        </td>
        <td class="text-center">
          <button class="btn btn-secondary btn-xs text-danger" onclick="deleteOpnameItem(${item.product_id})">
            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  lucide.createIcons();
}

function resetOpnameSession() {
  if (opnameCart.length === 0) return;
  if (confirm('Apakah Anda yakin ingin membatalkan sesi audit opname aktif? Semua data hitungan sementara akan dihapus.')) {
    opnameCart = [];
    renderOpnameCart();
    showToast('Sesi opname dibatalkan.', 'primary');
  }
}

async function submitOpnameSession() {
  if (opnameCart.length === 0) {
    showToast('Daftar barang yang dihitung masih kosong!', 'warning');
    return;
  }

  if (!confirm('Apakah Anda yakin ingin menyimpan sesi opname? Tindakan ini akan menyinkronkan stok sistem dengan stok fisik.')) {
    return;
  }

  const payload = {
    recorded_by: currentUser ? currentUser.name : 'Administrator',
    items: opnameCart.map(item => ({
      product_id: item.product_id,
      physical_stock: item.physical_stock
    }))
  };

  try {
    const response = await fetch(`${API_URL}/api/stock/opnames`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (response.ok) {
      showToast(`Stock opname berhasil disimpan! (No: ${data.opname_number})`, 'success');
      playDingSound();
      opnameCart = [];
      renderOpnameCart();
      await fetchProductsCache(); // Refresh local cache
      switchOpnameTab('history');
    } else {
      showToast(data.error || 'Gagal menyimpan stock opname', 'danger');
    }
  } catch (error) {
    console.error('Koneksi server gagal:', error);
    showToast('Koneksi server gagal', 'danger');
  }
}

async function fetchOpnameHistory() {
  try {
    const response = await fetch(appendOwnerParam(`${API_URL}/api/stock/opnames`));
    if (response.ok) {
      dbStockOpnames = await response.json();
      renderOpnameHistory(dbStockOpnames);
    }
  } catch (error) {
    console.error('Gagal memuat riwayat opname:', error);
  }
}

function renderOpnameHistory(opnames) {
  const body = document.getElementById('opnameHistoryBody');
  if (opnames.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-5 text-muted">Belum ada riwayat stock opname yang tercatat.</td>
      </tr>
    `;
    return;
  }

  body.innerHTML = opnames.map((o, index) => `
    <tr>
      <td class="text-center">${index + 1}</td>
      <td class="font-mono font-bold text-xs">${o.opname_number}</td>
      <td>${formatDisplayDate(o.created_at)}</td>
      <td class="font-bold">${o.recorded_by}</td>
      <td class="text-center">
        <button class="btn btn-secondary btn-sm" onclick="openOpnameDetailModal(${o.id})">
          <i data-lucide="eye" style="width: 14px; height: 14px;"></i>
          <span>Lihat Detail</span>
        </button>
      </td>
    </tr>
  `).join('');

  lucide.createIcons();
}

async function openOpnameDetailModal(opnameId) {
  try {
    const response = await fetch(appendOwnerParam(`${API_URL}/api/stock/opnames/${opnameId}`));
    if (response.ok) {
      const data = await response.json();
      
      document.getElementById('detailOpnameNumber').innerText = data.opname_number;
      document.getElementById('detailOpnameAuditor').innerText = data.recorded_by;
      document.getElementById('detailOpnameDate').innerText = formatDisplayDate(data.created_at);

      const tableBody = document.getElementById('opnameDetailTableBody');
      if (data.items.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-3 text-muted">Tidak ada detail item</td></tr>`;
      } else {
        tableBody.innerHTML = data.items.map((item, index) => {
          let diffText = item.difference > 0 ? `+${item.difference}` : `${item.difference}`;
          return `
            <tr>
              <td class="text-center">${index + 1}</td>
              <td class="font-mono text-xs text-muted">${item.barcode ? item.barcode : '-'}</td>
              <td class="font-semibold">${item.product_name}</td>
              <td class="text-center font-mono">${item.system_stock}</td>
              <td class="text-center font-mono font-bold">${item.physical_stock}</td>
              <td class="text-center font-mono font-bold ${item.difference === 0 ? '' : (item.difference > 0 ? 'text-success' : 'text-danger')}">${diffText}</td>
            </tr>
          `;
        }).join('');
      }

      document.getElementById('opnameDetailModal').classList.remove('hidden');
    } else {
      showToast('Gagal memuat rincian stock opname', 'danger');
    }
  } catch (error) {
    console.error('Koneksi server gagal:', error);
  }
}

function closeOpnameDetailModal() {
  document.getElementById('opnameDetailModal').classList.add('hidden');
}

// ==================== MIKROTIK INTEGRATION LOGIC ====================

function toggleMikrotikFields(value) {
  const wrapper = document.getElementById('mikrotikFieldsWrapper');
  const btnTest = document.getElementById('btnTestMikrotik');
  
  const mtHost = document.getElementById('mtHost');
  const mtPort = document.getElementById('mtPort');
  const mtUser = document.getElementById('mtUser');
  
  if (value === '0') {
    if (wrapper) wrapper.classList.add('hidden');
    if (btnTest) btnTest.classList.add('hidden');
    
    if (mtHost) mtHost.removeAttribute('required');
    if (mtPort) mtPort.removeAttribute('required');
    if (mtUser) mtUser.removeAttribute('required');
  } else {
    if (wrapper) wrapper.classList.remove('hidden');
    if (btnTest) btnTest.classList.remove('hidden');
    
    if (mtHost) mtHost.setAttribute('required', 'required');
    if (mtPort) mtPort.setAttribute('required', 'required');
    if (mtUser) mtUser.setAttribute('required', 'required');
  }
}

async function loadMikrotikConfig() {
  const form = document.getElementById('mikrotikConfigForm');
  if (!form) return;

  try {
    // 1. Muat status active mikrotik dari settings
    const settingsResponse = await fetch(`${API_URL}/api/settings`);
    let isEnabled = '1';
    if (settingsResponse.ok) {
      const settings = await settingsResponse.json();
      isEnabled = settings.mikrotik_enabled !== undefined ? settings.mikrotik_enabled : '1';
    }
    
    const selectEnabled = document.getElementById('selectMikrotikEnabled');
    if (selectEnabled) {
      selectEnabled.value = isEnabled;
    }
    
    toggleMikrotikFields(isEnabled);

    // 2. Muat konfigurasi Router MikroTik
    const response = await fetch(`${API_URL}/api/mikrotik/config`);
    if (response.ok) {
      const config = await response.json();
      document.getElementById('mtHost').value = config.host || '';
      document.getElementById('mtPort').value = config.port || 8728;
      document.getElementById('mtUser').value = config.user || '';
      if (document.getElementById('mtOwner')) {
        document.getElementById('mtOwner').value = config.owner || 'Organisasi';
      }
      
      const pwdInput = document.getElementById('mtPassword');
      if (config.has_password) {
        pwdInput.placeholder = '••••••••';
        document.getElementById('mtPasswordLabel').innerText = 'Password API (Kosongkan jika tidak diubah)';
      } else {
        pwdInput.placeholder = 'Masukkan password router...';
        document.getElementById('mtPasswordLabel').innerText = 'Password API';
      }
    }
  } catch (error) {
    console.error('Gagal memuat konfigurasi MikroTik:', error);
  }
}

async function saveMikrotikConfig(e) {
  e.preventDefault();
  
  const selectEnabled = document.getElementById('selectMikrotikEnabled');
  const isEnabled = selectEnabled ? selectEnabled.value : '1';
  
  try {
    // 1. Simpan pengaturan sistem terlebih dahulu
    const settingsResponse = await fetch(`${API_URL}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mikrotik_enabled: isEnabled })
    });
    
    if (!settingsResponse.ok) {
      const resData = await settingsResponse.json();
      showToast(resData.error || 'Gagal menyimpan pengaturan sistem', 'danger');
      return;
    }
    
    // 2. Jika diaktifkan, simpan detail koneksi MikroTik ke file/db
    if (isEnabled === '1') {
      const host = document.getElementById('mtHost').value.trim();
      const port = document.getElementById('mtPort').value;
      const user = document.getElementById('mtUser').value.trim();
      const password = document.getElementById('mtPassword').value;
      const owner = document.getElementById('mtOwner') ? document.getElementById('mtOwner').value : 'Organisasi';

      const payload = { host, port, user, password, owner };

      const response = await fetch(`${API_URL}/api/mikrotik/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const resData = await response.json();

      if (!response.ok) {
        showToast(resData.error || 'Gagal menyimpan konfigurasi MikroTik', 'danger');
        return;
      }
    }
    
    showToast('Pengaturan sistem berhasil disimpan!', 'success');
    playDingSound();
    document.getElementById('mtPassword').value = '';
    loadMikrotikConfig(); // Refresh
  } catch (error) {
    console.error('Gagal menyimpan konfigurasi:', error);
    showToast('Koneksi server gagal', 'danger');
  }
}

async function testMikrotikConnection() {
  const host = document.getElementById('mtHost').value.trim();
  const port = document.getElementById('mtPort').value;
  const user = document.getElementById('mtUser').value.trim();
  const password = document.getElementById('mtPassword').value;

  if (!host || !user) {
    showToast('IP Address dan Username wajib diisi untuk tes koneksi!', 'warning');
    return;
  }

  showToast('Mencoba menghubungkan ke router MikroTik...', 'primary');

  const payload = { host, port, user, password };

  try {
    const response = await fetch(`${API_URL}/api/mikrotik/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const resData = await response.json();

    if (response.ok && resData.success) {
      showToast('Tes Koneksi Berhasil! Router MikroTik terhubung.', 'success');
      playDingSound();
    } else {
      showToast(resData.error || 'Koneksi ke MikroTik gagal!', 'danger');
      playBeepSound();
    }
  } catch (error) {
    console.error('Gagal melakukan tes koneksi MikroTik:', error);
    showToast('Koneksi server gagal', 'danger');
  }
}

// ==================== STORE BRANDING LOGIC ====================

function handleLogoUpload(input) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    if (file.size > 2 * 1024 * 1024) {
      showToast('Ukuran berkas logo maksimal 2MB!', 'warning');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
      uploadedStoreLogoBase64 = e.target.result;
      const preview = document.getElementById('storeLogoPreview');
      const placeholder = document.getElementById('storeLogoPlaceholder');
      const btnRemove = document.getElementById('btnRemoveLogo');
      
      if (preview) {
        preview.src = uploadedStoreLogoBase64;
        preview.style.display = 'block';
      }
      if (placeholder) placeholder.style.display = 'none';
      if (btnRemove) btnRemove.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  }
}

function removeStoreLogo() {
  uploadedStoreLogoBase64 = '';
  const preview = document.getElementById('storeLogoPreview');
  const placeholder = document.getElementById('storeLogoPlaceholder');
  const btnRemove = document.getElementById('btnRemoveLogo');
  const input = document.getElementById('inputStoreLogoFile');
  
  if (preview) {
    preview.src = '';
    preview.style.display = 'none';
  }
  if (placeholder) placeholder.style.display = 'flex';
  if (btnRemove) btnRemove.classList.add('hidden');
  if (input) input.value = '';
}

async function fetchStoreSettings() {
  try {
    const response = await fetch(`${API_URL}/api/settings`);
    if (response.ok) {
      systemSettings = await response.json();
      updateAppBranding();
    }
  } catch (error) {
    console.error('Gagal mengambil pengaturan sistem:', error);
  }
}

function updateAppBranding() {
  const storeName = systemSettings.store_name || 'KASIRKU POS';
  document.title = `${storeName} - Aplikasi Kasir Lokal`;
  
  // 1. Sidebar Brand Text
  const brandTextEl = document.querySelector('.brand-text h1');
  if (brandTextEl) {
    if (storeName === 'KASIRKU POS') {
      brandTextEl.innerHTML = 'KASIRKU<span>POS</span>';
    } else {
      brandTextEl.textContent = storeName;
      if (storeName.length > 15) {
        brandTextEl.style.fontSize = '12px';
      } else if (storeName.length > 10) {
        brandTextEl.style.fontSize = '14px';
      } else {
        brandTextEl.style.fontSize = '16px';
      }
    }
  }

  // 2. Login Overlay Branding
  const loginStoreNameEl = document.getElementById('loginStoreName');
  if (loginStoreNameEl) {
    if (storeName === 'KASIRKU POS') {
      loginStoreNameEl.innerHTML = 'KASIRKU<span style="color: var(--color-primary);">POS</span>';
    } else {
      loginStoreNameEl.textContent = storeName;
    }
  }

  const loginLogoWrapper = document.getElementById('loginLogoWrapper');
  if (loginLogoWrapper) {
    if (systemSettings.store_logo) {
      loginLogoWrapper.innerHTML = `<img src="${systemSettings.store_logo}" alt="Logo Toko" style="max-height: 60px; margin-bottom: 12px; max-width: 150px; object-fit: contain;">`;
    } else {
      loginLogoWrapper.innerHTML = `<i data-lucide="store" style="width: 48px; height: 48px; color: var(--color-primary); background: var(--color-primary-glow); padding: 10px; border-radius: var(--radius-md); margin-bottom: 12px;"></i>`;
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    }
  }

  // 3. Report Print Header Branding
  const reportPrintStoreName = document.getElementById('reportPrintStoreName');
  if (reportPrintStoreName) {
    reportPrintStoreName.textContent = storeName;
  }
  const reportPrintStoreAddress = document.getElementById('reportPrintStoreAddress');
  if (reportPrintStoreAddress) {
    reportPrintStoreAddress.textContent = systemSettings.store_address || '';
  }
  const reportPrintStorePhone = document.getElementById('reportPrintStorePhone');
  if (reportPrintStorePhone) {
    reportPrintStorePhone.textContent = systemSettings.store_phone ? `Telp: ${systemSettings.store_phone}` : '';
  }
  const reportPrintLogoContainer = document.getElementById('reportPrintLogoContainer');
  if (reportPrintLogoContainer) {
    if (systemSettings.store_logo) {
      reportPrintLogoContainer.innerHTML = `<img src="${systemSettings.store_logo}" alt="Logo Toko">`;
    } else {
      reportPrintLogoContainer.innerHTML = '';
    }
  }
}

function loadStoreBranding() {
  const nameInput = document.getElementById('inputStoreName');
  const addressInput = document.getElementById('inputStoreAddress');
  const phoneInput = document.getElementById('inputStorePhone');
  const footerInput = document.getElementById('inputStoreFooter');
  
  if (nameInput) nameInput.value = systemSettings.store_name || 'KASIRKU POS';
  if (addressInput) addressInput.value = systemSettings.store_address || '';
  if (phoneInput) phoneInput.value = systemSettings.store_phone || '';
  if (footerInput) footerInput.value = systemSettings.store_footer || '';
  
  const preview = document.getElementById('storeLogoPreview');
  const placeholder = document.getElementById('storeLogoPlaceholder');
  const btnRemove = document.getElementById('btnRemoveLogo');
  
  if (systemSettings.store_logo) {
    uploadedStoreLogoBase64 = systemSettings.store_logo;
    if (preview) {
      preview.src = systemSettings.store_logo;
      preview.style.display = 'block';
    }
    if (placeholder) placeholder.style.display = 'none';
    if (btnRemove) btnRemove.classList.remove('hidden');
  } else {
    uploadedStoreLogoBase64 = '';
    if (preview) {
      preview.src = '';
      preview.style.display = 'none';
    }
    if (placeholder) placeholder.style.display = 'flex';
    if (btnRemove) btnRemove.classList.add('hidden');
  }
}

async function saveStoreBranding(e) {
  e.preventDefault();
  
  const name = document.getElementById('inputStoreName').value.trim();
  const address = document.getElementById('inputStoreAddress').value.trim();
  const phone = document.getElementById('inputStorePhone').value.trim();
  const footer = document.getElementById('inputStoreFooter').value;
  const logo = uploadedStoreLogoBase64;

  if (!name) {
    showToast('Nama toko wajib diisi!', 'warning');
    return;
  }

  const payload = {
    store_name: name,
    store_address: address,
    store_phone: phone,
    store_logo: logo,
    store_footer: footer
  };

  try {
    const response = await fetch(`${API_URL}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const resData = await response.json();

    if (response.ok && resData.success) {
      showToast('Branding toko berhasil disimpan!', 'success');
      playDingSound();
      systemSettings = resData.settings;
      updateAppBranding();
    } else {
      showToast(resData.error || 'Gagal menyimpan branding toko', 'danger');
    }
  } catch (error) {
    console.error('Gagal menyimpan branding:', error);
    showToast('Koneksi server gagal', 'danger');
  }
}

// ==================== MANAJEMEN KATEGORI (CRUD) ====================

let dbAllCategoriesWithCount = []; // Cache kategori lengkap dengan jumlah produk

async function fetchCategories() {
  try {
    const response = await fetch(`${API_URL}/api/categories`);
    if (response.ok) {
      dbCategories = await response.json();

      // Ambil jumlah produk per kategori
      const productsRes = await fetch(`${API_URL}/api/products`);
      const allProducts = productsRes.ok ? await productsRes.json() : [];

      dbAllCategoriesWithCount = dbCategories.map(cat => {
        const count = allProducts.filter(p => p.category === cat.name).length;
        return { ...cat, product_count: count };
      });

      renderCategoryTable(dbAllCategoriesWithCount);
    }
  } catch (error) {
    console.error('Gagal mengambil data kategori:', error);
  }
}

function renderCategoryTable(categories) {
  const body = document.getElementById('categoryTableBody');
  if (!body) return;

  if (categories.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-5 text-muted">Belum ada kategori. Klik "Tambah Kategori Baru" untuk menambahkan.</td>
      </tr>
    `;
    return;
  }

  body.innerHTML = categories.map((cat, index) => {
    const dateStr = formatDisplayDate(cat.created_at);
    const hasProducts = cat.product_count > 0;
    return `
      <tr>
        <td class="text-center">${index + 1}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 10px;">
            <i data-lucide="folder" style="width: 16px; height: 16px; color: var(--color-primary);"></i>
            <span class="font-bold">${cat.name}</span>
          </div>
        </td>
        <td class="text-center">
          <span class="badge ${hasProducts ? 'badge-harian' : 'badge-default'}">
            ${cat.product_count} Produk
          </span>
        </td>
        <td class="text-muted text-xs">${dateStr}</td>
        <td class="text-center">
          <div class="input-with-action justify-center" style="gap: 6px;">
            <button class="btn btn-secondary btn-xs" onclick="openCategoryModal('edit', ${cat.id})">
              <i data-lucide="edit-3" style="width: 13px; height: 13px;"></i>
              <span>Edit</span>
            </button>
            <button class="btn btn-secondary btn-xs text-danger" onclick="deleteCategory(${cat.id})" ${hasProducts ? 'disabled title="Hapus semua produk di kategori ini terlebih dahulu"' : ''}>
              <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  lucide.createIcons();
}

function filterCategoryTable() {
  const query = document.getElementById('categorySearch').value.toLowerCase();
  const filtered = dbAllCategoriesWithCount.filter(cat =>
    cat.name.toLowerCase().includes(query)
  );
  renderCategoryTable(filtered);
}

function openCategoryModal(mode, id = null) {
  const form = document.getElementById('categoryForm');
  form.reset();
  document.getElementById('editCategoryId').value = '';

  if (mode === 'add') {
    document.getElementById('categoryModalTitle').innerHTML = '<i data-lucide="folder-plus" class="mr-2"></i> Tambah Kategori Baru';
    document.getElementById('btnSaveCategory').innerText = 'Simpan Kategori';
  } else if (mode === 'edit' && id !== null) {
    const cat = dbCategories.find(c => c.id === id);
    if (cat) {
      document.getElementById('categoryModalTitle').innerHTML = '<i data-lucide="edit-3" class="mr-2"></i> Ubah Nama Kategori';
      document.getElementById('editCategoryId').value = cat.id;
      document.getElementById('formCategoryName').value = cat.name;
      document.getElementById('btnSaveCategory').innerText = 'Simpan Perubahan';
    }
  }

  document.getElementById('categoryFormModal').classList.remove('hidden');
  lucide.createIcons();
  setTimeout(() => document.getElementById('formCategoryName').focus(), 100);
}

function closeCategoryModal() {
  document.getElementById('categoryFormModal').classList.add('hidden');
}

async function saveCategory(e) {
  e.preventDefault();
  const id = document.getElementById('editCategoryId').value;
  const name = document.getElementById('formCategoryName').value.trim();

  if (!name) {
    showToast('Nama kategori tidak boleh kosong!', 'warning');
    return;
  }

  const isEdit = id !== '';
  const url = isEdit ? `${API_URL}/api/categories/${id}` : `${API_URL}/api/categories`;
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });

    const data = await response.json();

    if (response.ok) {
      showToast(`Kategori "${name}" berhasil ${isEdit ? 'diperbarui' : 'ditambahkan'}!`, 'success');
      closeCategoryModal();
      await fetchCategories();
      // Refresh cache produk juga (karena nama kategori mungkin berubah)
      await fetchProductsCache();
    } else {
      showToast(data.error || 'Gagal menyimpan kategori', 'danger');
    }
  } catch (error) {
    console.error('Gagal menyimpan kategori:', error);
    showToast('Koneksi server gagal', 'danger');
  }
}

async function deleteCategory(id) {
  const cat = dbCategories.find(c => c.id === id);
  if (!cat) return;

  if (confirm(`Hapus kategori "${cat.name}"? Tindakan ini tidak dapat dibatalkan.`)) {
    try {
      const response = await fetch(`${API_URL}/api/categories/${id}`, { method: 'DELETE' });
      const data = await response.json();

      if (response.ok) {
        showToast(data.message, 'success');
        await fetchCategories();
      } else {
        showToast(data.error || 'Gagal menghapus kategori', 'danger');
      }
    } catch (error) {
      console.error('Gagal menghapus kategori:', error);
      showToast('Koneksi server gagal', 'danger');
    }
  }
}

// ==================== DYNAMIC OWNER LOGIC (CRUD OWNER) ====================

async function fetchOwners() {
  try {
    const response = await fetch(`${API_URL}/api/owners`);
    if (response.ok) {
      dbOwners = await response.json();
      populateOwnerDropdowns();
      if (activeScreen === 'owners') {
        renderOwnersTable();
      }
    }
  } catch (error) {
    console.error('Gagal memuat data owner:', error);
  }
}

function populateOwnerDropdowns() {
  // 1. MikroTik Owner Dropdown (#mtOwner)
  const mtOwnerSelect = document.getElementById('mtOwner');
  if (mtOwnerSelect) {
    const currentValue = mtOwnerSelect.value || 'Organisasi';
    mtOwnerSelect.innerHTML = dbOwners.map(owner => `<option value="${owner.name}">${owner.name}</option>`).join('');
    if (dbOwners.some(o => o.name === currentValue)) {
      mtOwnerSelect.value = currentValue;
    } else if (dbOwners.length > 0) {
      mtOwnerSelect.value = dbOwners[0].name;
    }
  }

  // 2. Product Form Owner Dropdown (#formOwner)
  const formOwnerSelect = document.getElementById('formOwner');
  if (formOwnerSelect) {
    const currentValue = formOwnerSelect.value || 'Organisasi';
    formOwnerSelect.innerHTML = dbOwners.map(owner => `<option value="${owner.name}">${owner.name}</option>`).join('');
    if (dbOwners.some(o => o.name === currentValue)) {
      formOwnerSelect.value = currentValue;
    } else if (dbOwners.length > 0) {
      formOwnerSelect.value = dbOwners[0].name;
    }
  }

  // 3. User Form Owner Dropdown (#formUserOwner)
  const formUserOwnerSelect = document.getElementById('formUserOwner');
  if (formUserOwnerSelect) {
    const currentValue = formUserOwnerSelect.value || '';
    const defaultOption = '<option value="">Super Admin (Semua Owner)</option>';
    const optionsHTML = dbOwners.map(owner => `<option value="${owner.name}">${owner.name}</option>`).join('');
    formUserOwnerSelect.innerHTML = defaultOption + optionsHTML;
    if (currentValue === '' || dbOwners.some(o => o.name === currentValue)) {
      formUserOwnerSelect.value = currentValue;
    } else {
      formUserOwnerSelect.value = '';
    }
  }
}

function renderOwnersTable() {
  const body = document.getElementById('ownerCatalogBody');
  if (!body) return;

  const searchInput = document.getElementById('ownerSearch');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

  const filtered = dbOwners.filter(owner => 
    owner.name.toLowerCase().includes(query) || 
    (owner.description && owner.description.toLowerCase().includes(query))
  );

  if (filtered.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-5 text-muted text-xs">Tidak ada data owner yang ditemukan.</td>
      </tr>
    `;
    return;
  }

  body.innerHTML = filtered.map((owner, index) => {
    const dateStr = owner.created_at ? formatDisplayDate(owner.created_at) : '-';
    // Proteksi: Tiga owner default dilarang dihapus untuk menjamin integritas data awal, namun boleh diedit
    const isDefaultOwner = ['Organisasi', 'Pak Nandang', 'Pak Asep'].includes(owner.name);
    
    return `
      <tr>
        <td class="text-center text-xs font-semibold text-muted">${index + 1}</td>
        <td class="font-semibold text-sm">${owner.name}</td>
        <td class="text-muted text-xs">${owner.description || '-'}</td>
        <td class="text-xs text-muted">${dateStr}</td>
        <td class="text-center">
          <div style="display: flex; gap: 8px; justify-content: center;">
            <button class="btn btn-secondary-light btn-xs" onclick="openOwnerModal('edit', ${owner.id})">
              <i data-lucide="edit-3" style="width: 12px; height: 12px;"></i> Edit
            </button>
            <button class="btn btn-danger-light btn-xs" onclick="deleteOwner(${owner.id})" ${isDefaultOwner ? 'disabled' : ''}>
              <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i> Hapus
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
  
  // Re-initialize lucide icons inside dynamically created buttons
  lucide.createIcons();
}

function openOwnerModal(mode, id = null) {
  const form = document.getElementById('ownerForm');
  if (form) form.reset();
  document.getElementById('editOwnerId').value = '';
  document.getElementById('ownerModalTitle').innerHTML = '<i data-lucide="briefcase" class="mr-2"></i> Tambah Owner Baru';

  if (mode === 'add') {
    document.getElementById('formOwnerName').disabled = false;
  } else if (mode === 'edit' && id !== null) {
    document.getElementById('ownerModalTitle').innerHTML = '<i data-lucide="edit-3" class="mr-2"></i> Ubah Data Owner';
    const owner = dbOwners.find(o => o.id === id);
    if (owner) {
      document.getElementById('editOwnerId').value = owner.id;
      document.getElementById('formOwnerName').value = owner.name;
      document.getElementById('formOwnerDesc').value = owner.description || '';
      
      // Jangan biarkan nama owner default diubah agar database seed/audit aman
      const isDefault = ['Organisasi', 'Pak Nandang', 'Pak Asep'].includes(owner.name);
      document.getElementById('formOwnerName').disabled = isDefault;
    }
  }

  document.getElementById('ownerFormModal').classList.remove('hidden');
  document.getElementById('formOwnerName').focus();
  lucide.createIcons();
}

function closeOwnerModal() {
  document.getElementById('ownerFormModal').classList.add('hidden');
}

async function saveOwner(e) {
  e.preventDefault();

  const id = document.getElementById('editOwnerId').value;
  const name = document.getElementById('formOwnerName').value.trim();
  const description = document.getElementById('formOwnerDesc').value.trim();

  const isEdit = id !== '';
  const url = isEdit ? `${API_URL}/api/owners/${id}` : `${API_URL}/api/owners`;
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const response = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description })
    });

    const data = await response.json();
    if (response.ok) {
      showToast(`Data owner "${name}" berhasil disimpan`, 'success');
      closeOwnerModal();
      await fetchOwners();
      // Refresh produk cache karena barangkali ada cascading owner rename
      if (isEdit) {
        await fetchProductsCache();
      }
    } else {
      showToast(data.error || 'Gagal menyimpan data owner', 'danger');
    }
  } catch (error) {
    console.error('Gagal menyimpan owner:', error);
    showToast('Koneksi server gagal', 'danger');
  }
}

async function deleteOwner(id) {
  const owner = dbOwners.find(o => o.id === id);
  if (!owner) return;

  if (confirm(`Apakah Anda yakin ingin menghapus owner "${owner.name}"?`)) {
    try {
      const response = await fetch(`${API_URL}/api/owners/${id}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (response.ok) {
        showToast(data.message, 'success');
        await fetchOwners();
      } else {
        showToast(data.error || 'Gagal menghapus owner', 'danger');
      }
    } catch (error) {
      console.error('Gagal menghapus owner:', error);
      showToast('Koneksi server gagal', 'danger');
    }
  }
}

// ==================== PETTY CASH & SHIFT LIFECYCLE MANAGEMENT ====================

let activeCashSession = null;

async function checkActiveShift() {
  if (!currentUser) return;
  
  try {
    const response = await fetch(`${API_URL}/api/cash-sessions/active`);
    if (response.ok) {
      const session = await response.json();
      const sidebarCard = document.getElementById('sidebarShiftCard');
      const sidebarInfo = document.getElementById('sidebarShiftInfo');
      
      if (session) {
        activeCashSession = session;
        if (sidebarCard) sidebarCard.classList.remove('hidden');
        if (sidebarInfo) {
          sidebarInfo.innerHTML = `
            Kasir: <strong>${session.cashier_name}</strong><br>
            Modal: <strong>Rp ${formatRupiah(session.initial_cash)}</strong><br>
            Kas Laci: <strong>Rp ${formatRupiah(session.expected_cash)}</strong>
          `;
        }
      } else {
        activeCashSession = null;
        if (sidebarCard) sidebarCard.classList.add('hidden');
        
        // Kasir wajib membuka shift sebelum bertransaksi
        if (currentUser.role === 'cashier') {
          openOpenShiftModal();
        }
      }
      lucide.createIcons();
    }
  } catch (error) {
    console.error('Gagal memverifikasi shift aktif:', error);
  }
}

function openOpenShiftModal() {
  document.getElementById('openShiftCashier').value = currentUser ? currentUser.name : 'Kasir';
  document.getElementById('openShiftInitialCash').value = '';
  document.getElementById('openShiftModal').classList.remove('hidden');
}

async function saveOpenShift(e) {
  e.preventDefault();
  const initialCash = parseFloat(document.getElementById('openShiftInitialCash').value) || 0;
  const cashierName = currentUser ? currentUser.name : 'Kasir';

  try {
    const response = await fetch(`${API_URL}/api/cash-sessions/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cashier_name: cashierName, initial_cash: initialCash })
    });

    const data = await response.json();
    if (response.ok) {
      showToast('Shift kasir berhasil dibuka. Selamat bekerja!', 'success');
      document.getElementById('openShiftModal').classList.add('hidden');
      await checkActiveShift();
    } else {
      showToast(data.error || 'Gagal membuka shift kasir', 'danger');
    }
  } catch (error) {
    console.error('Gagal membuka shift:', error);
    showToast('Koneksi server gagal', 'danger');
  }
}

function openCloseShiftModal() {
  if (!activeCashSession) {
    showToast('Tidak ada shift aktif yang terbuka', 'warning');
    return;
  }

  // Reload active session statistics from database first for accurate expected_cash
  fetch(`${API_URL}/api/cash-sessions/active`)
    .then(res => res.json())
    .then(session => {
      if (session) {
        activeCashSession = session;
        document.getElementById('closeShiftModalInitial').innerText = `Rp ${formatRupiah(session.initial_cash)}`;
        document.getElementById('closeShiftModalSales').innerText = `+Rp ${formatRupiah(session.total_cash_sales)}`;
        document.getElementById('closeShiftModalExpenses').innerText = `-Rp ${formatRupiah(session.total_cash_expenses)}`;
        document.getElementById('closeShiftModalExpected').innerText = `Rp ${formatRupiah(session.expected_cash)}`;
        
        document.getElementById('closeShiftActualCash').value = '';
        document.getElementById('closeShiftNotes').value = '';
        calculateShiftDiff();
        
        document.getElementById('closeShiftModal').classList.remove('hidden');
      }
    })
    .catch(err => {
      console.error('Gagal mereload status shift:', err);
      showToast('Gagal terhubung ke server', 'danger');
    });
}

function calculateShiftDiff() {
  if (!activeCashSession) return;
  const expected = activeCashSession.expected_cash;
  const actual = parseFloat(document.getElementById('closeShiftActualCash').value) || 0;
  const diff = actual - expected;
  
  const display = document.getElementById('closeShiftDiffDisplay');
  if (diff === 0) {
    display.innerText = `Rp 0 (Pas)`;
    display.style.color = 'var(--color-success)';
  } else if (diff < 0) {
    display.innerText = `-Rp ${formatRupiah(Math.abs(diff))} (Minus/Kurang)`;
    display.style.color = 'var(--color-danger)';
  } else {
    display.innerText = `+Rp ${formatRupiah(diff)} (Surplus/Lebih)`;
    display.style.color = 'var(--color-primary)';
  }
}

function closeCloseShiftModal() {
  document.getElementById('closeShiftModal').classList.add('hidden');
}

async function saveCloseShift(e) {
  e.preventDefault();
  const actualCash = parseFloat(document.getElementById('closeShiftActualCash').value) || 0;
  const notes = document.getElementById('closeShiftNotes').value.trim();

  try {
    const response = await fetch(`${API_URL}/api/cash-sessions/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actual_cash: actualCash, notes: notes })
    });

    const data = await response.json();
    if (response.ok) {
      showToast('Shift kasir berhasil ditutup!', 'success');
      closeCloseShiftModal();
      
      // Print Shift Closing Report
      printShiftReport(data.session);
      
      // Logout otomatis setelah penutupan shift
      setTimeout(() => {
        logout();
      }, 3000);
    } else {
      showToast(data.error || 'Gagal menutup shift kasir', 'danger');
    }
  } catch (error) {
    console.error('Gagal menutup shift:', error);
    showToast('Koneksi server gagal', 'danger');
  }
}

function printShiftReport(session) {
  const printWindow = window.open('', '_blank', 'width=300,height=600');
  
  const formattedOpened = formatDisplayDate(session.opened_at) + ' ' + new Date(session.opened_at).toLocaleTimeString();
  const formattedClosed = formatDisplayDate(session.closed_at) + ' ' + new Date(session.closed_at).toLocaleTimeString();
  const diff = session.difference;
  let diffText = 'Rp 0';
  if (diff < 0) diffText = `-Rp ${formatRupiah(Math.abs(diff))} (KURANG)`;
  else if (diff > 0) diffText = `+Rp ${formatRupiah(diff)} (LEBIH)`;
  else diffText = 'Rp 0 (PAS)';

  const storeName = systemSettings.store_name || 'KASIRKU POS';
  const storeAddress = systemSettings.store_address || '';
  const storePhone = systemSettings.store_phone || '';

  const html = `
    <html>
      <head>
        <title>Laporan Tutup Shift</title>
        <style>
          body { font-family: 'Courier New', Courier, monospace; font-size: 12px; margin: 10px; color: #000; }
          .text-center { text-align: center; }
          .font-bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          .flex-row { display: flex; justify-content: space-between; margin: 3px 0; }
          .header-title { font-size: 14px; margin-bottom: 2px; }
        </style>
      </head>
      <body>
        <div class="text-center font-bold header-title">${storeName}</div>
        <div class="text-center">${storeAddress}</div>
        <div class="text-center">Telp: ${storePhone}</div>
        <div class="divider"></div>
        <div class="text-center font-bold">LAPORAN TUTUP SHIFT / SETORAN</div>
        <div class="divider"></div>
        <div class="flex-row"><span>Kasir:</span><span>${session.cashier_name}</span></div>
        <div class="flex-row"><span>Shift ID:</span><span>#${session.id}</span></div>
        <div style="font-size: 10px; margin: 3px 0;">Buka: ${formattedOpened}</div>
        <div style="font-size: 10px; margin: 3px 0;">Tutup: ${formattedClosed}</div>
        <div class="divider"></div>
        <div class="flex-row font-bold"><span>Modal Awal:</span><span>Rp ${formatRupiah(session.initial_cash)}</span></div>
        <div class="flex-row"><span>Total Tunai Masuk:</span><span>+Rp ${formatRupiah(session.total_cash_sales)}</span></div>
        <div class="flex-row"><span>Total Tunai Keluar:</span><span>-Rp ${formatRupiah(session.total_cash_expenses)}</span></div>
        <div class="divider"></div>
        <div class="flex-row font-bold"><span>Saldo Kas Seharusnya:</span><span>Rp ${formatRupiah(session.expected_cash)}</span></div>
        <div class="flex-row font-bold"><span>Uang Laci Fisik:</span><span>Rp ${formatRupiah(session.actual_cash)}</span></div>
        <div class="divider"></div>
        <div class="flex-row font-bold"><span>Selisih:</span><span>${diffText}</span></div>
        ${session.notes ? `<div style="margin-top: 8px; font-size:10px;">Catatan: ${session.notes}</div>` : ''}
        <div class="divider"></div>
        <div class="text-center" style="margin-top: 15px;">Dicetak otomatis oleh Sistem POS<br>Terima kasih.</div>
      </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 500);
}

// ==================== OPERATIONAL EXPENSES / BEBAN TOKO ====================

async function fetchExpenses() {
  const startDate = document.getElementById('financeStartDate').value;
  const endDate = document.getElementById('financeEndDate').value;
  
  if (!startDate || !endDate) return;

  try {
    const response = await fetch(appendOwnerParam(`${API_URL}/api/expenses?startDate=${startDate}&endDate=${endDate}`));
    if (response.ok) {
      const expenses = await response.json();
      
      // Render Expense Table Rows
      const body = document.getElementById('financeExpensesBody');
      if (expenses.length === 0) {
        body.innerHTML = `<tr><td colspan="5" class="text-center text-muted text-xs py-4">Tidak ada beban pengeluaran pada rentang tanggal ini</td></tr>`;
      } else {
        body.innerHTML = expenses.map(e => `
          <tr>
            <td>${formatDisplayDate(e.expense_date)}</td>
            <td><span class="badge" style="background-color: rgba(239, 68, 68, 0.1); color: var(--color-danger); border: 1px solid rgba(239, 68, 68, 0.2);">${e.category}</span></td>
            <td class="font-bold text-xs">${e.description}</td>
            <td class="text-right font-mono font-bold text-danger">Rp ${formatRupiah(e.amount)}</td>
            <td class="text-center">
              <button class="btn btn-secondary btn-icon-only btn-xs text-danger" type="button" onclick="deleteExpense(${e.id})">
                <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
              </button>
            </td>
          </tr>
        `).join('');
      }

      // Calculate category expenses summary
      const categoryTotals = {};
      expenses.forEach(e => {
        categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
      });

      const catBody = document.getElementById('financeExpensesCategoryBody');
      const categories = Object.keys(categoryTotals);
      if (categories.length === 0) {
        catBody.innerHTML = `<tr><td colspan="2" class="text-center text-muted text-xs py-3">Kosong</td></tr>`;
      } else {
        let grandTotal = 0;
        const rowsHtml = categories.map(cat => {
          grandTotal += categoryTotals[cat];
          return `
            <tr>
              <td class="font-semibold text-xs">${cat}</td>
              <td class="text-right font-mono text-danger">Rp ${formatRupiah(categoryTotals[cat])}</td>
            </tr>
          `;
        }).join('');

        catBody.innerHTML = rowsHtml + `
          <tr style="background-color: rgba(239, 68, 68, 0.05); font-weight: bold; border-top: 1px solid var(--color-danger);">
            <td class="text-xs">TOTAL BEBAN</td>
            <td class="text-right font-mono text-danger">Rp ${formatRupiah(grandTotal)}</td>
          </tr>
        `;
      }

      lucide.createIcons();
    }
  } catch (error) {
    console.error('Gagal mengambil pengeluaran:', error);
  }
}

function getLocalTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function openExpenseModal() {
  document.getElementById('expenseForm').reset();
  document.getElementById('expenseDate').value = getLocalTodayDate();
  
  // Populate owners options
  const select = document.getElementById('expenseOwner');
  select.innerHTML = dbOwners.map(o => `<option value="${o.name}">${o.name}</option>`).join('');
  
  // Sembunyikan field owner jika kasir masuk atau owner-admin masuk (otomatis di-set oleh backend)
  const isSuper = currentUser && currentUser.role === 'admin' && (!currentUser.owner || currentUser.owner === 'All');
  const ownerFormGroup = document.getElementById('expenseOwnerFormGroup');
  if (isSuper) {
    ownerFormGroup.classList.remove('hidden');
  } else {
    ownerFormGroup.classList.add('hidden');
    select.value = currentUser.owner || 'Organisasi';
  }

  document.getElementById('expenseModal').classList.remove('hidden');
}

function closeExpenseModal() {
  document.getElementById('expenseModal').classList.add('hidden');
}

async function saveExpense(e) {
  e.preventDefault();
  const date = document.getElementById('expenseDate').value;
  const category = document.getElementById('expenseCategory').value;
  const description = document.getElementById('expenseDescription').value.trim();
  const amount = parseFloat(document.getElementById('expenseAmount').value) || 0;
  const owner = document.getElementById('expenseOwner').value;

  try {
    const response = await fetch(`${API_URL}/api/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, amount, category, expense_date: date, owner })
    });

    const data = await response.json();
    if (response.ok) {
      showToast('Beban pengeluaran berhasil disimpan', 'success');
      closeExpenseModal();
      await fetchFinancialReport();
      await checkActiveShift(); // Reload shift expected cash in case it was a cash expense
    } else {
      showToast(data.error || 'Gagal menyimpan pengeluaran', 'danger');
    }
  } catch (error) {
    console.error('Gagal menyimpan pengeluaran:', error);
    showToast('Koneksi server gagal', 'danger');
  }
}

async function deleteExpense(id) {
  if (confirm('Apakah Anda yakin ingin menghapus beban pengeluaran ini?')) {
    try {
      const response = await fetch(`${API_URL}/api/expenses/${id}`, { method: 'DELETE' });
      if (response.ok) {
        showToast('Pengeluaran berhasil dihapus', 'success');
        await fetchFinancialReport();
        await checkActiveShift();
      } else {
        const data = await response.json();
        showToast(data.error || 'Gagal menghapus pengeluaran', 'danger');
      }
    } catch (error) {
      console.error('Gagal menghapus pengeluaran:', error);
      showToast('Koneksi server gagal', 'danger');
    }
  }
}

// ==================== VISUAL CHARTS (CHART.JS) ====================

let trendChartInstance = null;
let pieChartInstance = null;

function renderFinancialCharts(data) {
  const trendCtx = document.getElementById('financeTrendChart');
  const pieCtx = document.getElementById('categoryPieChart');

  if (!trendCtx || !pieCtx) return;

  // Hancurkan chart lama jika ada
  if (trendChartInstance) trendChartInstance.destroy();
  if (pieChartInstance) pieChartInstance.destroy();

  // Dapatkan warna-warna theme dinamis dari CSS
  const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#6366f1';
  const successColor = getComputedStyle(document.documentElement).getPropertyValue('--color-success').trim() || '#10b981';
  const textMain = getComputedStyle(document.documentElement).getPropertyValue('--text-main').trim() || '#1f2937';
  const borderColor = getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim() || '#e5e7eb';

  // 1. Render Trend Chart (Line Chart)
  const dailyData = data.daily || [];
  const labels = dailyData.map(d => formatDisplayDate(d.trans_date));
  const revenueData = dailyData.map(d => d.revenue);
  const profitData = dailyData.map(d => d.profit);

  trendChartInstance = new Chart(trendCtx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Omset Pendapatan',
          data: revenueData,
          borderColor: primaryColor,
          backgroundColor: primaryColor + '20', // Opacity 12%
          tension: 0.3,
          fill: true,
          borderWidth: 2
        },
        {
          label: 'Laba Kotor',
          data: profitData,
          borderColor: successColor,
          backgroundColor: successColor + '20',
          tension: 0.3,
          fill: true,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: textMain, font: { family: 'Inter', size: 11, weight: '500' } }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: Rp ${formatRupiah(context.raw)}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: borderColor },
          ticks: { color: textMain, font: { size: 10 } }
        },
        y: {
          grid: { color: borderColor },
          ticks: {
            color: textMain,
            font: { size: 10 },
            callback: function(value) {
              return 'Rp ' + formatRupiah(value);
            }
          }
        }
      }
    }
  });

  // 2. Render Category Pie Chart (Doughnut Chart)
  const categoryData = data.category_breakdown || [];
  const pieLabels = categoryData.map(c => c.category);
  const pieValues = categoryData.map(c => c.amount);

  // Palet warna yang harmonis untuk kategori terlaris
  const categoryColors = [
    '#6366f1', // Indigo
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#ec4899', // Pink
    '#06b6d4', // Cyan
    '#8b5cf6', // Violet
    '#ef4444', // Red
    '#3b82f6', // Blue
    '#6b7280'  // Gray
  ];

  pieChartInstance = new Chart(pieCtx, {
    type: 'doughnut',
    data: {
      labels: pieLabels,
      datasets: [{
        data: pieValues,
        backgroundColor: categoryColors.slice(0, pieLabels.length),
        borderWidth: 1,
        borderColor: borderColor
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: textMain, font: { family: 'Inter', size: 10, weight: '500' } }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = total > 0 ? Math.round((context.raw / total) * 100) : 0;
              return `${context.label}: Rp ${formatRupiah(context.raw)} (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}
