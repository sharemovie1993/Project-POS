/**
 * Kasirku POS - Modul Pemindai Barcode (Fisik & Kamera)
 */

// Buffer untuk pendeteksian barcode scanner fisik (meniru ketikan cepat)
let lastKeyTime = 0;
let barcodeBuffer = '';
const SCANNER_CHAR_DELAY = 50; // Maksimum delay per karakter (milidetik) dari scanner fisik

// Callback global ketika barcode berhasil dipindai
let onBarcodeScannedCallback = null;

// Mengatur listener global untuk USB Barcode Scanner
function initPhysicalBarcodeScanner(callback) {
  onBarcodeScannedCallback = callback;
  
  window.addEventListener('keydown', (e) => {
    // Abaikan jika fokus sedang berada di input yang membutuhkan tombol Enter (seperti tombol submit)
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'BUTTON' || activeEl.type === 'submit')) {
      return;
    }

    const currentTime = new Date().getTime();
    
    // Jika jeda antar tombol ketik sangat kecil, diasumsikan input dari Barcode Scanner Fisik
    if (currentTime - lastKeyTime < SCANNER_CHAR_DELAY) {
      if (e.key !== 'Enter') {
        barcodeBuffer += e.key;
      }
    } else {
      // Jika jeda terlalu lama, reset buffer dan mulai rekam karakter baru
      if (e.key !== 'Enter') {
        barcodeBuffer = e.key;
      } else {
        barcodeBuffer = '';
      }
    }
    
    lastKeyTime = currentTime;

    // Jika menekan Enter dan buffer terisi (selesai scan barcode)
    if (e.key === 'Enter') {
      if (barcodeBuffer.length >= 3) { // Minimal panjang barcode 3 karakter
        e.preventDefault();
        const scannedCode = barcodeBuffer.trim();
        barcodeBuffer = ''; // Reset buffer
        
        console.log('Barcode terdeteksi dari scanner fisik:', scannedCode);
        
        // Jika sedang fokus pada input lain (misal form tambah barang / form restok)
        if (activeEl && activeEl.tagName === 'INPUT') {
          if (activeEl.id !== 'barcodeSearchInput') {
            activeEl.value = scannedCode;
            activeEl.dispatchEvent(new Event('input', { bubbles: true }));
            activeEl.dispatchEvent(new Event('change', { bubbles: true }));
          }
          // Jika fokus di barcodeSearchInput, biarkan event Enter keydown di input tersebut
          // yang memproses lewat handleSearchKeyDown di app.js untuk mencegah double-trigger.
        } else {
          if (typeof onBarcodeScannedCallback === 'function') {
            onBarcodeScannedCallback(scannedCode);
          }
        }
      } else {
        barcodeBuffer = ''; // Reset jika isinya terlalu pendek untuk barcode
      }
    }
  });
}

// Instance Html5Qrcode untuk webcam scanner
let html5QrCode = null;

// Fungsi untuk membuka Webcam Barcode Scanner
function startCameraScanner(elementId, onSuccessCallback) {
  // Tutup kamera lama jika masih berjalan
  stopCameraScanner();

  // Buat instance baru
  html5QrCode = new Html5Qrcode(elementId);
  
  const config = {
    fps: 10,
    qrbox: (width, height) => {
      // Kotak scan barcode memanjang (cocok untuk barcode produk)
      const boxWidth = Math.min(width * 0.8, 300);
      const boxHeight = Math.min(height * 0.4, 120);
      return { width: boxWidth, height: boxHeight };
    },
    // Mengizinkan berbagai jenis barcode 1D (EAN-13, EAN-8, UPC, Code 128, dll)
    formatsToSupport: [ 
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.CODE_39,
      Html5QrcodeSupportedFormats.QR_CODE
    ]
  };

  // Pilih kamera belakang (environment) jika ada, jika tidak default kamera depan/laptop
  html5QrCode.start(
    { facingMode: "environment" }, 
    config,
    (decodedText, decodedResult) => {
      // Callback ketika scan sukses
      console.log(`Barcode terdeteksi dari kamera: ${decodedText}`);
      
      // Bunyikan beep suara
      playBeepSound();
      
      // Hentikan kamera
      stopCameraScanner();
      
      // Kembalikan teks barcode
      if (typeof onSuccessCallback === 'function') {
        onSuccessCallback(decodedText);
      }
    },
    (errorMessage) => {
      // Verbose error log diabaikan agar console bersih
    }
  ).catch(err => {
    console.error("Gagal menjalankan kamera:", err);
    showToast("Gagal mengakses kamera. Pastikan izin kamera telah diberikan.", "danger");
    closeCameraScanner();
  });
}

// Fungsi menghentikan Webcam Barcode Scanner
function stopCameraScanner() {
  if (html5QrCode) {
    if (html5QrCode.isScanning) {
      html5QrCode.stop().then(() => {
        console.log("Kamera pemindai dihentikan.");
        html5QrCode = null;
      }).catch(err => {
        console.error("Gagal menghentikan kamera:", err);
      });
    } else {
      html5QrCode = null;
    }
  }
}
