/**
 * Kasirku POS - POS Cart Operations Module
 */

// Tambah produk ke keranjang berdasarkan ID produk
function addSelectedProductToCart(productId) {
  const product = dbProducts.find(p => String(p.id) === String(productId));
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
  
  // Jika diskon > 25% dari subtotal, minta persetujuan supervisor
  const isHighDiscount = baseSubtotal > 0 && (disc / baseSubtotal) > 0.25;
  if (isHighDiscount) {
    requireSupervisor('Diskon Tinggi (>25%)', () => {
      item.discount = disc;
      item.subtotal = baseSubtotal - disc;
      renderCart();
      showToast('Diskon disetujui oleh Supervisor', 'success');
    });
  } else {
    item.discount = disc;
    item.subtotal = baseSubtotal - disc;
    renderCart();
  }
}

function adjustCartQty(index, amount) {
  const item = cart[index];
  const targetQty = item.quantity + amount;
  if (targetQty >= 1) {
    updateCartQty(index, targetQty);
  }
}

function deleteCartItem(index) {
  requireSupervisor('Hapus Item Keranjang', () => {
    cart.splice(index, 1);
    renderCart();
    showToast('Item berhasil dihapus dari keranjang', 'info');
  });
}

function renderCart() {
  const body = document.getElementById('cartTableBody');
  const countEl = document.getElementById('cartItemCount');
  const mobileCountEl = document.getElementById('mobileCartCount');
  
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
    if (mobileCountEl) mobileCountEl.innerText = '0';
    calculateBilling();
    lucide.createIcons();
    return;
  }

  // Hitung jumlah jenis barang
  countEl.innerText = `${cart.length} Jenis Barang`;
  if (mobileCountEl) {
    mobileCountEl.innerText = cart.reduce((sum, item) => sum + item.quantity, 0);
  }

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

// ==================== PREMIUM FITUR: TAHAN & PANGGIL (HOLD & RECALL) ====================

function holdCurrentTransaction() {
  if (cart.length === 0) {
    showToast('Keranjang belanja kosong, tidak ada transaksi untuk ditahan!', 'warning');
    return;
  }

  const heldTx = {
    id: Date.now(),
    time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    cart: [...cart],
    total: cart.reduce((sum, item) => sum + item.subtotal, 0)
  };

  heldTransactions.push(heldTx);
  localStorage.setItem('held_transactions', JSON.stringify(heldTransactions));
  
  cart = [];
  renderCart();
  updateHeldCountDisplay();
  showToast('Transaksi berhasil ditahan', 'success');
}

function updateHeldCountDisplay() {
  const countEl = document.getElementById('heldCount');
  if (countEl) {
    countEl.innerText = heldTransactions.length;
  }
}

function openHeldTransactionsModal() {
  const modal = document.getElementById('heldTransactionsModal');
  const body = document.getElementById('heldTransactionsTableBody');
  
  if (heldTransactions.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="4" class="text-center py-4 text-muted">Tidak ada transaksi yang ditahan</td>
      </tr>
    `;
  } else {
    body.innerHTML = heldTransactions.map((tx, idx) => `
      <tr>
        <td>${tx.time}</td>
        <td>${tx.cart.length} Item</td>
        <td class="font-mono font-bold text-primary">Rp ${formatRupiah(tx.total)}</td>
        <td class="text-center">
          <div class="input-with-action justify-center">
            <button class="btn btn-primary btn-xs" onclick="recallTransaction(${idx})">
              <i data-lucide="play" style="width:12px;height:12px;"></i> Panggil
            </button>
            <button class="btn btn-secondary btn-xs text-danger" onclick="discardHeldTransaction(${idx})">
              <i data-lucide="trash" style="width:12px;height:12px;"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
    lucide.createIcons();
  }
  
  modal.classList.remove('hidden');
}

function closeHeldTransactionsModal() {
  document.getElementById('heldTransactionsModal').classList.add('hidden');
}

function recallTransaction(idx) {
  if (cart.length > 0) {
    if (!confirm('Keranjang saat ini tidak kosong. Panggil transaksi ini akan menimpa keranjang saat ini. Lanjutkan?')) {
      return;
    }
  }

  const tx = heldTransactions[idx];
  cart = [...tx.cart];
  
  heldTransactions.splice(idx, 1);
  localStorage.setItem('held_transactions', JSON.stringify(heldTransactions));
  
  closeHeldTransactionsModal();
  renderCart();
  updateHeldCountDisplay();
  showToast('Transaksi berhasil dipanggil kembali', 'success');
}

function discardHeldTransaction(idx) {
  if (confirm('Apakah Anda yakin ingin menghapus transaksi yang ditahan ini?')) {
    heldTransactions.splice(idx, 1);
    localStorage.setItem('held_transactions', JSON.stringify(heldTransactions));
    openHeldTransactionsModal();
    updateHeldCountDisplay();
    showToast('Transaksi ditahan dihapus', 'info');
  }
}

// ==================== PREMIUM FITUR: OTORISASI PIN SUPERVISOR (PIN GUARD) ====================

let supervisorCallback = null;

function requireSupervisor(actionName, callback) {
  if (currentUser && currentUser.role === 'admin') {
    callback();
    return;
  }

  supervisorCallback = callback;

  document.getElementById('overrideUsername').value = '';
  document.getElementById('overridePassword').value = '';
  document.getElementById('overrideErrorAlert').classList.add('hidden');
  document.getElementById('supervisorOverrideModal').classList.remove('hidden');
  document.getElementById('overrideUsername').focus();
}

function closeSupervisorOverrideModal() {
  document.getElementById('supervisorOverrideModal').classList.add('hidden');
  supervisorCallback = null;
}

async function processSupervisorOverride(e) {
  e.preventDefault();
  const username = document.getElementById('overrideUsername').value.trim();
  const password = document.getElementById('overridePassword').value;
  const errorAlert = document.getElementById('overrideErrorAlert');

  try {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();
    if (response.ok && data.user && data.user.role === 'admin') {
      closeSupervisorOverrideModal();
      showToast('Otorisasi Supervisor Berhasil!', 'success');
      if (supervisorCallback) {
        const cb = supervisorCallback;
        supervisorCallback = null;
        cb();
      }
    } else {
      errorAlert.innerText = 'Username/password supervisor salah atau bukan admin!';
      errorAlert.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Gagal otentikasi supervisor:', error);
    errorAlert.innerText = 'Koneksi server gagal!';
    errorAlert.classList.remove('hidden');
  }
}
