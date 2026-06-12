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
      if (activeScreen === 'pos' && cart.length > 0 && (currentPaymentMethod === 'TUNAI' || currentPaymentMethod === 'SPLIT')) {
        document.getElementById('inputAmountPaid').focus();
      }
    }

    // F7: Panggil transaksi ditahan
    else if (e.key === 'F7') {
      e.preventDefault();
      if (activeScreen === 'pos') {
        openHeldTransactionsModal();
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
