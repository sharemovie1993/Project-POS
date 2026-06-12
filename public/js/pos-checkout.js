/**
 * Kasirku POS - POS Checkout & Receipt Handler Module
 */

function calculateBilling() {
  const discountInput = document.getElementById('inputDiscount');
  const taxInput = document.getElementById('inputTax');
  
  let subtotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
  
  // Hitung diskon member jika terpilih
  let memberDiscount = 0;
  if (selectedCustomer && selectedCustomer.discount_percent > 0) {
    memberDiscount = Math.round(subtotal * (selectedCustomer.discount_percent / 100));
  }

  let discountFieldVal = parseFloat(discountInput.value) || 0;
  let totalDiscount = discountFieldVal + memberDiscount;
  if (totalDiscount > subtotal) {
    totalDiscount = subtotal;
    discountInput.value = subtotal - memberDiscount;
  }

  let totalAfterDisc = subtotal - totalDiscount;
  let taxPercent = parseFloat(taxInput.value) || 0;
  let taxVal = Math.round(totalAfterDisc * (taxPercent / 100));
  let finalBill = totalAfterDisc + taxVal;

  // Render displays
  document.getElementById('detailSubtotal').innerText = `Rp ${formatRupiah(subtotal)}`;
  document.getElementById('detailDiscount').innerText = `-Rp ${formatRupiah(totalDiscount)}`;
  document.getElementById('detailTax').innerText = `Rp ${formatRupiah(taxVal)}`;
  document.getElementById('totalBelanjaDisplay').innerText = `Rp ${formatRupiah(finalBill)}`;
  
  // Simpan nilai finalBill ke atribut data untuk dibaca fungsi pembayaran
  document.getElementById('totalBelanjaDisplay').setAttribute('data-value', finalBill);

  // Update Pajak label text
  document.querySelector('.detail-row.text-primary span').innerText = `Pajak (${taxPercent}%)`;

  // Autocomplete uang pas jika metode QRIS/DEBIT
  if (currentPaymentMethod !== 'TUNAI' && currentPaymentMethod !== 'SPLIT') {
    document.getElementById('inputAmountPaid').value = finalBill;
  } else if (currentPaymentMethod === 'SPLIT') {
    calculateSplitChange();
  }

  // Update badge member info
  const badge = document.getElementById('customerInfoBadge');
  if (selectedCustomer) {
    badge.innerHTML = `<i data-lucide="tag" style="width:10px;height:10px;"></i> Member: ${selectedCustomer.name} (Diskon ${selectedCustomer.discount_percent}%)`;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
  if (window.lucide) window.lucide.createIcons();

  calculateChange();
}

function togglePaymentMethod(method) {
  currentPaymentMethod = method;
  
  // Update UI active card
  document.querySelectorAll('.pay-method-card').forEach(el => el.classList.remove('active'));
  const activeCardId = {
    TUNAI: 'payMethodTunai',
    QRIS: 'payMethodQris',
    DEBIT: 'payMethodDebit',
    SPLIT: 'payMethodSplit'
  }[method];
  document.getElementById(activeCardId).classList.add('active');

  const finalBill = parseInt(document.getElementById('totalBelanjaDisplay').getAttribute('data-value')) || 0;
  const inputPaid = document.getElementById('inputAmountPaid');
  const labelPaid = document.getElementById('labelAmountPaid');
  const quickCash = document.getElementById('quickCashButtons');
  const splitFields = document.getElementById('splitPaymentFields');

  if (method === 'TUNAI') {
    inputPaid.disabled = false;
    inputPaid.value = '';
    labelPaid.innerText = 'Nominal Uang Bayar (Rp) (F4)';
    quickCash.classList.remove('hidden');
    splitFields.classList.add('hidden');
    inputPaid.focus();
  } else if (method === 'SPLIT') {
    inputPaid.disabled = false;
    inputPaid.value = '';
    labelPaid.innerText = 'Uang Tunai Diterima (Rp)';
    quickCash.classList.remove('hidden');
    splitFields.classList.remove('hidden');
    
    // Set default split cash ke setengah total belanja atau 0
    document.getElementById('splitCashInput').value = Math.round(finalBill / 2);
    calculateSplitChange();
  } else {
    // QRIS & DEBIT otomatis Uang Pas
    inputPaid.disabled = true;
    inputPaid.value = finalBill;
    labelPaid.innerText = `Pembayaran via ${method} (Otomatis Pas)`;
    quickCash.classList.add('hidden');
    splitFields.classList.add('hidden');
  }

  calculateChange();
}

function setQuickCash(val) {
  const finalBill = parseInt(document.getElementById('totalBelanjaDisplay').getAttribute('data-value')) || 0;
  const inputPaid = document.getElementById('inputAmountPaid');
  
  if (val === 'pas') {
    if (currentPaymentMethod === 'SPLIT') {
      const splitCash = parseFloat(document.getElementById('splitCashInput').value) || 0;
      inputPaid.value = splitCash;
    } else {
      inputPaid.value = finalBill;
    }
  } else {
    inputPaid.value = parseInt(val) || 0;
  }

  inputPaid.focus();
  calculateChange();
}

function calculateSplitChange() {
  const finalBill = parseInt(document.getElementById('totalBelanjaDisplay').getAttribute('data-value')) || 0;
  const splitCashInput = document.getElementById('splitCashInput');
  let splitCash = parseFloat(splitCashInput.value) || 0;

  if (splitCash < 0) {
    splitCash = 0;
    splitCashInput.value = 0;
  }
  if (splitCash > finalBill) {
    splitCash = finalBill;
    splitCashInput.value = finalBill;
  }

  const splitNonCash = finalBill - splitCash;
  document.getElementById('splitNonCashInput').value = splitNonCash;

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

  let change = 0;
  if (currentPaymentMethod === 'SPLIT') {
    const splitCash = parseFloat(document.getElementById('splitCashInput').value) || 0;
    change = amountPaid - splitCash;
  } else {
    change = amountPaid - finalBill;
  }
  
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
  
  let change = 0;
  let paymentDetails = null;

  if (currentPaymentMethod === 'SPLIT') {
    const splitCashAmount = parseFloat(document.getElementById('splitCashInput').value) || 0;
    const splitNonCashAmount = parseFloat(document.getElementById('splitNonCashInput').value) || 0;
    
    if (amountPaid < splitCashAmount) {
      showToast('Jumlah uang tunai bayar kurang!', 'danger');
      amountPaidInput.focus();
      return;
    }
    
    change = amountPaid - splitCashAmount;
    paymentDetails = {
      cash: splitCashAmount,
      non_cash: splitNonCashAmount,
      non_cash_method: document.getElementById('splitNonCashMethod').value
    };
  } else {
    if (amountPaid < finalBill) {
      showToast('Jumlah uang bayar kurang!', 'danger');
      amountPaidInput.focus();
      return;
    }
    change = amountPaid - finalBill;
  }

  const discount = parseFloat(document.getElementById('inputDiscount').value) || 0;
  const tax = parseFloat(document.getElementById('inputTax').value) || 0;
  
  // Hitung diskon member jika terpilih
  let memberDiscount = 0;
  if (selectedCustomer && selectedCustomer.discount_percent > 0) {
    memberDiscount = Math.round(cart.reduce((sum, item) => sum + item.subtotal, 0) * (selectedCustomer.discount_percent / 100));
  }
  const totalDiscount = discount + memberDiscount;

  // Siapkan payload ke API
  const payload = {
    cashier_name: activeCashier,
    payment_method: currentPaymentMethod,
    total_amount: finalBill,
    discount: totalDiscount,
    tax: tax,
    payment_amount: currentPaymentMethod === 'SPLIT' ? (amountPaid + paymentDetails.non_cash) : amountPaid,
    change_amount: change,
    customer_id: selectedCustomer ? selectedCustomer.id : null,
    customer_name: selectedCustomer ? selectedCustomer.name : null,
    payment_details: paymentDetails,
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
        discount: totalDiscount,
        tax: tax,
        payment_amount: currentPaymentMethod === 'SPLIT' ? amountPaid : amountPaid,
        change_amount: change,
        customer_name: selectedCustomer ? selectedCustomer.name : null,
        payment_details: paymentDetails,
        created_at: new Date().toLocaleString('id-ID'),
        items: [...cart]
      };

      // Siapkan struk di modal preview
      renderReceipt(activeTransactionReceipt);

      // Bersihkan keranjang & input
      cart = [];
      selectedCustomer = null;
      const select = document.getElementById('selectCustomer');
      if (select) select.value = '';
      
      document.getElementById('inputDiscount').value = '';
      document.getElementById('inputTax').value = '0';
      document.getElementById('inputAmountPaid').value = '';
      
      // Sembunyikan field split
      document.getElementById('splitPaymentFields').classList.add('hidden');
      
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

  let paymentDetailsRows = '';
  if (tx.payment_method === 'SPLIT' && tx.payment_details) {
    const details = typeof tx.payment_details === 'string' ? JSON.parse(tx.payment_details) : tx.payment_details;
    paymentDetailsRows = `
      <div class="receipt-total-row">
        <span>Tunai Diterima</span>
        <span>Rp ${formatRupiah(tx.payment_amount)}</span>
      </div>
      <div class="receipt-total-row">
        <span>Porsi Tunai</span>
        <span>Rp ${formatRupiah(details.cash)}</span>
      </div>
      <div class="receipt-total-row">
        <span>Porsi ${details.non_cash_method}</span>
        <span>Rp ${formatRupiah(details.non_cash)}</span>
      </div>
    `;
  } else {
    paymentDetailsRows = `
      <div class="receipt-total-row">
        <span>Uang Bayar</span>
        <span>Rp ${formatRupiah(tx.payment_amount)}</span>
      </div>
    `;
  }

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
      ${tx.customer_name ? `
      <div class="receipt-meta-row">
        <span>Member:</span>
        <span>${tx.customer_name}</span>
      </div>
      ` : ''}
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
      ${paymentDetailsRows}
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

// ==================== PREMIUM FITUR: PELANGGAN / CRM / MEMBERSHIP ====================

function changeSelectedCustomer(idStr) {
  if (!idStr) {
    selectedCustomer = null;
  } else {
    const id = parseInt(idStr);
    selectedCustomer = dbCustomers.find(c => c.id === id) || null;
  }
  calculateBilling();
}

function openAddCustomerModal() {
  document.getElementById('customerForm').reset();
  document.getElementById('customerModal').classList.remove('hidden');
  document.getElementById('customerName').focus();
}

function closeAddCustomerModal() {
  document.getElementById('customerModal').classList.add('hidden');
}

async function processAddCustomer(e) {
  e.preventDefault();
  
  const name = document.getElementById('customerName').value.trim();
  const phone = document.getElementById('customerPhone').value.trim();
  const discount_percent = parseFloat(document.getElementById('customerDiscount').value) || 0;

  try {
    const response = await fetch(`${API_URL}/api/customers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, discount_percent })
    });

    const data = await response.json();
    if (response.ok) {
      showToast('Member baru berhasil didaftarkan', 'success');
      closeAddCustomerModal();
      
      // Reload customer list & pilih yang baru terdaftar
      await fetchCustomers();
      
      const newMember = data.customer;
      if (newMember) {
        selectedCustomer = newMember;
        const select = document.getElementById('selectCustomer');
        select.value = newMember.id;
        calculateBilling();
      }
    } else {
      showToast(data.error || 'Gagal mendaftarkan member', 'danger');
    }
  } catch (error) {
    console.error('Gagal menambahkan member:', error);
    showToast('Koneksi server gagal', 'danger');
  }
}

async function fetchCustomers() {
  try {
    const response = await fetch(`${API_URL}/api/customers`);
    if (response.ok) {
      dbCustomers = await response.json();
      renderCustomerSelect();
    }
  } catch (error) {
    console.error('Gagal mengambil daftar member:', error);
  }
}

function renderCustomerSelect() {
  const select = document.getElementById('selectCustomer');
  if (!select) return;
  
  const currentVal = select.value;
  select.innerHTML = `
    <option value="">-- Non-Member / Umum --</option>
    ${dbCustomers.map(c => `
      <option value="${c.id}">${c.name} (${c.discount_percent}%)</option>
    `).join('')}
  `;
  
  if (currentVal && dbCustomers.some(c => c.id == currentVal)) {
    select.value = currentVal;
  } else {
    select.value = '';
    selectedCustomer = null;
  }
}
