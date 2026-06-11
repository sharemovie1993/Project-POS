function openStockEntryModal() {
  const form = document.getElementById('stockEntryForm');
  form.reset();
  
  // Set default date to today in local timezone YYYY-MM-DD
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;
  document.getElementById('stockEntryDate').value = todayStr;
  
  // Reset fields
  document.getElementById('stockEntryProductId').value = '';
  document.getElementById('stockEntrySelectedProductDisplay').classList.add('hidden');
  document.getElementById('stockEntryProductDropdown').classList.add('hidden');
  selectedRestockProductIndex = -1;

  document.getElementById('stockEntryModal').classList.remove('hidden');
  document.getElementById('stockEntryProductSearch').focus();
}

function closeStockEntryModal() {
  document.getElementById('stockEntryModal').classList.add('hidden');
}

function handleStockEntryProductSearch(query) {
  const dropdown = document.getElementById('stockEntryProductDropdown');
  
  if (!query.trim()) {
    dropdown.classList.add('hidden');
    return;
  }
  
  // Filter lokal dari cache dbProducts
  const filtered = dbProducts.filter(p => 
    p.name.toLowerCase().includes(query.toLowerCase()) || 
    (p.barcode && p.barcode.includes(query))
  );

  if (filtered.length === 0) {
    dropdown.innerHTML = `<div class="p-3 text-center text-xs text-muted">Produk tidak ditemukan</div>`;
    dropdown.classList.remove('hidden');
    selectedRestockProductIndex = -1;
    return;
  }

  // Render hasil pencarian produk ke dropdown autocomplete
  dropdown.innerHTML = filtered.map((p, index) => `
    <div class="search-result-item" id="restockItem-${index}" onclick="selectProductForStockEntry(${p.id})">
      <div class="result-info">
        <span class="result-name">${p.name}</span>
        <span class="result-meta">${p.barcode ? p.barcode : 'Tanpa Barcode'} | ${p.category}</span>
      </div>
      <div class="result-price-stock">
        <span class="result-stock text-muted">Stok Saat Ini: ${p.stock}</span>
      </div>
    </div>
  `).join('');
  
  dropdown.classList.remove('hidden');
  selectedRestockProductIndex = -1;
  
  // Bind arrow keys listener just for this input
  document.getElementById('stockEntryProductSearch').onkeydown = (e) => {
    const items = dropdown.querySelectorAll('.search-result-item');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedRestockProductIndex = (selectedRestockProductIndex + 1) % items.length;
      highlightRestockDropdownItem(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedRestockProductIndex = (selectedRestockProductIndex - 1 + items.length) % items.length;
      highlightRestockDropdownItem(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedRestockProductIndex >= 0 && selectedRestockProductIndex < items.length) {
        items[selectedRestockProductIndex].click();
      }
    } else if (e.key === 'Escape') {
      dropdown.classList.add('hidden');
    }
  };
}

function highlightRestockDropdownItem(items) {
  items.forEach((item, index) => {
    if (index === selectedRestockProductIndex) {
      item.classList.add('highlighted');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('highlighted');
    }
  });
}

function selectProductForStockEntry(productId) {
  const product = dbProducts.find(p => p.id === productId);
  if (!product) return;

  // Set values
  document.getElementById('stockEntryProductId').value = product.id;
  document.getElementById('stockEntryProductSearch').value = product.name;
  
  // Show product badge
  document.getElementById('selectedProductName').innerText = product.name;
  document.getElementById('selectedProductMeta').innerText = `${product.barcode ? product.barcode : 'Tanpa Barcode'} | ${product.category}`;
  document.getElementById('selectedProductStock').innerText = `Stok Saat Ini: ${product.stock}`;
  document.getElementById('stockEntrySelectedProductDisplay').classList.remove('hidden');
  
  // Hide dropdown
  document.getElementById('stockEntryProductDropdown').classList.add('hidden');
  
  // Focus qty input
  document.getElementById('stockEntryQty').focus();
}

async function saveStockEntry(e) {
  e.preventDefault();
  
  const productId = document.getElementById('stockEntryProductId').value;
  const quantity = parseInt(document.getElementById('stockEntryQty').value);
  const entryDate = document.getElementById('stockEntryDate').value;
  const supplier = document.getElementById('stockEntrySupplier').value.trim();
  const notes = document.getElementById('stockEntryNotes').value.trim();

  if (!productId) {
    showToast('Harap pilih produk terdaftar dari hasil pencarian!', 'warning');
    document.getElementById('stockEntryProductSearch').focus();
    return;
  }

  if (isNaN(quantity) || quantity <= 0) {
    showToast('Jumlah masuk harus berupa angka positif!', 'warning');
    document.getElementById('stockEntryQty').focus();
    return;
  }

  const payload = {
    product_id: parseInt(productId),
    quantity: quantity,
    entry_date: entryDate,
    supplier: supplier,
    notes: notes,
    recorded_by: currentUser ? currentUser.name : 'System'
  };

  try {
    const response = await fetch(`${API_URL}/api/stock/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (response.ok) {
      showToast('Stok barang berhasil ditambahkan dan dicatat!', 'success');
      playDingSound();
      closeStockEntryModal();
      
      // Refresh cache produk & update view
      await fetchProductsCache();
      if (activeCatalogTab === 'list') {
        fetchProductCatalog();
      } else {
        fetchStockEntries();
      }
    } else {
      showToast(data.error || 'Gagal menyimpan barang masuk', 'danger');
    }
  } catch (error) {
    console.error('Koneksi backend gagal:', error);
    showToast('Koneksi server gagal', 'danger');
  }
}

async function fetchStockEntries() {
  const searchInput = document.getElementById('stockEntrySearch');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

  try {
    const response = await fetch(appendOwnerParam(`${API_URL}/api/stock/entries`));
    if (response.ok) {
      dbStockEntries = await response.json();
      
      // Filter local jika ada search
      let filtered = dbStockEntries;
      if (query) {
        filtered = dbStockEntries.filter(e => 
          e.product_name.toLowerCase().includes(query) || 
          (e.barcode && e.barcode.includes(query)) ||
          (e.supplier && e.supplier.toLowerCase().includes(query))
        );
      }
      
      renderStockEntries(filtered);
    }
  } catch (error) {
    console.error('Gagal mengambil riwayat barang masuk:', error);
  }
}

function renderStockEntries(entries) {
  const body = document.getElementById('stockEntryBody');
  if (!body) return;

  if (entries.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-5 text-muted">Belum ada riwayat barang masuk / restok.</td>
      </tr>
    `;
    return;
  }

  body.innerHTML = entries.map((e, index) => `
    <tr>
      <td class="text-center">${index + 1}</td>
      <td class="font-bold text-xs">${formatDisplayDate(e.entry_date)}</td>
      <td class="font-mono text-xs text-muted">${e.barcode ? e.barcode : '-'}</td>
      <td class="font-semibold">${e.product_name}</td>
      <td class="text-center font-bold font-mono text-success">+${e.quantity}</td>
      <td>${e.supplier ? e.supplier : '<span class="text-muted">-</span>'}</td>
      <td class="text-muted text-sm">${e.notes ? e.notes : '-'}</td>
      <td class="text-xs text-muted font-bold">${e.recorded_by}</td>
    </tr>
  `).join('');
}
