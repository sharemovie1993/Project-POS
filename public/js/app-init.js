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
  } catch (error) {
    console.error('Error saat inisialisasi awal aplikasi:', error);
    alert('Gagal memuat aplikasi (Inisialisasi Awal):\n\n' + error.message + '\n\nDetail: ' + error.stack);
  }
});
