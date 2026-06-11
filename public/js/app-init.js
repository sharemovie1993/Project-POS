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
