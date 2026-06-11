/**
 * Kasirku POS - POS Autocomplete & Search Controller Module
 */

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
