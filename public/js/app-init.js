// Inisialisasi Aplikasi saat Load
document.addEventListener('DOMContentLoaded', () => {
  try {
    // Ambil pengaturan sistem awal (branding & status mikrotik)
    fetchStoreSettings();

    // Update Jam di Header
    startClock();
    
    // Set default Tanggal Laporan Keuangan (Hari Ini)
    const todayDateStr = new Date().toISOString().split('T')[0];
    const financeStart = document.getElementById('financeStartDate');
    const financeEnd = document.getElementById('financeEndDate');
    if (financeStart) financeStart.value = todayDateStr;
    if (financeEnd) financeEnd.value = todayDateStr;

    // Inisialisasi Pemindai Barcode Fisik
    if (typeof initPhysicalBarcodeScanner === 'function') {
      initPhysicalBarcodeScanner((barcode) => {
        if (currentUser) {
          if (activeScreen === 'opname') {
            addBarcodeToOpnameCart(barcode);
          } else {
            addBarcodeToCart(barcode);
          }
        }
      });
    } else {
      console.warn('initPhysicalBarcodeScanner tidak terdefinisi.');
    }

    // Setup Global Keyboard Shortcuts
    if (typeof setupKeyboardShortcuts === 'function') {
      setupKeyboardShortcuts();
    } else {
      console.warn('setupKeyboardShortcuts tidak terdefinisi.');
    }

    // Jalankan verifikasi otentikasi login
    checkUserAuth();

    // Render ulang UI
    if (typeof renderCart === 'function') {
      renderCart();
    }

    // Inisialisasi Fitur Premium Kasir
    if (typeof fetchCustomers === 'function') fetchCustomers();
    if (typeof renderQuickKeys === 'function') renderQuickKeys();
    if (typeof updateHeldCountDisplay === 'function') updateHeldCountDisplay();
  } catch (error) {
    console.error('Error saat inisialisasi awal aplikasi:', error);
    alert('Gagal memuat aplikasi (Inisialisasi Awal):\n\n' + error.message + '\n\nDetail: ' + error.stack);
  }
});

// ==================== UNIVERSAL TABLE VIEW TOGGLER ====================

// Fungsi pemetaan judul header tabel berdasarkan ID
function formatHeaderTitle(tableId) {
  const titles = {
    productCatalogTable: 'Daftar Barang',
    stockEntryTable: 'Riwayat Restok (Barang Masuk)',
    categoryTable: 'Daftar Kategori',
    userCatalogTable: 'Daftar Akun Kasir',
    ownerCatalogTable: 'Daftar Pemilik Barang (Owner)',
    opnameCartTable: 'Daftar Audit Fisik Barang',
    opnameHistoryTable: 'Daftar Riwayat Audit Opname',
    todayTransactionsTable: 'Daftar Transaksi Hari Ini',
    opnameDetailTable: 'Detail Dokumen Audit Opname'
  };
  return titles[tableId] || 'Daftar Data';
}

// Fungsi untuk menyuntikkan tombol toggle pada setiap table-card
function addUniversalTableViewToggles() {
  document.querySelectorAll('.table-card, .pos-cart-card').forEach((card, index) => {
    let header = card.querySelector('.card-header');
    const table = card.querySelector('table.data-table, table.cart-table');
    
    // Jangan tambahkan toggle di kartu backup atau clear database
    if (card.id === 'panelBackupRestore' || card.id === 'panelClearDatabase') {
      return;
    }
    
    if (table) {
      // Jika card-header belum ada di dalam table-card, buat baru secara dinamis
      if (!header) {
        header = document.createElement('div');
        header.className = 'card-header';
        const titleText = formatHeaderTitle(table.id);
        header.innerHTML = `<h3>${titleText}</h3>`;
        card.insertBefore(header, card.firstChild);
      }
      
      if (!header.querySelector('.btn-toggle-view')) {
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'btn btn-secondary btn-xs btn-toggle-view';
        toggleBtn.style.marginLeft = 'auto';
        toggleBtn.style.padding = '4px 8px';
        toggleBtn.style.fontSize = '11px';
        toggleBtn.style.display = 'flex';
        toggleBtn.style.alignItems = 'center';
        toggleBtn.style.gap = '4px';
        toggleBtn.setAttribute('title', 'Ubah Tampilan (Tabel/Kartu)');
        
        // Menggunakan ID tabel atau index unik sebagai key localStorage
        const tableId = table.id || `table_mode_${index}`;
        const cardKey = `view_mode_${tableId}`;
        const savedMode = localStorage.getItem(cardKey) || 'table';
        
        if (savedMode === 'card') {
          card.classList.add('view-cards');
        }
        
        const updateButtonState = () => {
          const isCards = card.classList.contains('view-cards');
          toggleBtn.innerHTML = isCards 
            ? `<i data-lucide="list" style="width:12px;height:12px;"></i> Tampilan Tabel` 
            : `<i data-lucide="layout-grid" style="width:12px;height:12px;"></i> Tampilan Kartu`;
          if (window.lucide) window.lucide.createIcons();
        };
        
        toggleBtn.onclick = (e) => {
          e.preventDefault();
          card.classList.toggle('view-cards');
          const isCards = card.classList.contains('view-cards');
          localStorage.setItem(cardKey, isCards ? 'card' : 'table');
          updateButtonState();
        };
        
        header.appendChild(toggleBtn);
        updateButtonState();
      }
    }
  });
}

// Inisialisasi MutationObserver untuk melabeli td secara otomatis & melacak rendering baru
const tableResponsiveObserver = new MutationObserver(() => {
  // 1. Suntikkan tombol toggle view tabel
  addUniversalTableViewToggles();

  // 2. Petakan nama kolom (thead th) ke data-label di setiap sel (tbody td)
  document.querySelectorAll('table.data-table, table.cart-table').forEach(table => {
    // Kumpulkan teks header kolom
    const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
    
    // Iterasi semua baris data
    table.querySelectorAll('tbody tr').forEach(row => {
      // Lewati baris kosong jika ada
      if (row.classList.contains('empty-cart-row') || row.classList.contains('empty-opname-row') || row.querySelector('td[colspan]')) {
        return;
      }
      
      row.querySelectorAll('td').forEach((cell, idx) => {
        const headerName = headers[idx];
        if (headerName && headerName !== 'No' && headerName !== 'Aksi' && !cell.hasAttribute('data-label')) {
          cell.setAttribute('data-label', headerName);
        }
      });
    });
  });
});

// Mulai mengamati perubahan DOM setelah document siap
document.addEventListener('DOMContentLoaded', () => {
  tableResponsiveObserver.observe(document.body, { childList: true, subtree: true });
  // Jalankan inisialisasi awal sekali
  addUniversalTableViewToggles();
});

// ==================== PREMIUM FITUR: TOMBOL CEPAT (QUICK KEYS) ====================

function renderQuickKeys() {
  const grid = document.getElementById('quickKeysGrid');
  if (!grid) return;

  if (!dbProducts || dbProducts.length === 0) {
    // Tunggu fetchProductsCache selesai memuat produk
    setTimeout(renderQuickKeys, 300);
    return;
  }

  // Pilih 12 produk pertama untuk tombol cepat
  const quickProducts = dbProducts.slice(0, 12);

  if (quickProducts.length === 0) {
    grid.innerHTML = `<p class="text-muted text-xs text-center py-3" style="grid-column: 1/-1;">Katalog produk kosong</p>`;
    return;
  }

  grid.innerHTML = quickProducts.map(p => `
    <button class="quick-key-btn" type="button" onclick="addSelectedProductToCart('${p.id}')">
      <span class="quick-key-name" title="${p.name}">${p.name}</span>
      <span class="quick-key-price">Rp ${formatRupiah(p.price_sell)}</span>
    </button>
  `).join('');
}
