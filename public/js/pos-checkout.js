/**
 * Kasirku POS - POS Checkout & Receipt Handler Module
 */

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
