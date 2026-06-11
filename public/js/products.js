/**
 * Kasirku POS - Product Catalog Management Module
 */

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

