function switchOpnameTab(tabId) {
  activeOpnameTab = tabId;

  // Toggle active tab buttons
  document.getElementById('subTabOpnameNew').classList.toggle('active', tabId === 'new');
  document.getElementById('subTabOpnameHistory').classList.toggle('active', tabId === 'history');

  // Toggle active content divs
  document.getElementById('opnameContentNew').classList.toggle('hidden', tabId !== 'new');
  document.getElementById('opnameContentHistory').classList.toggle('hidden', tabId !== 'history');

  if (tabId === 'history') {
    fetchOpnameHistory();
  } else {
    setTimeout(() => {
      document.getElementById('opnameBarcodeSearch').focus();
    }, 200);
  }
}

function handleOpnameProductSearch(query) {
  const dropdown = document.getElementById('opnameProductDropdown');
  if (!query.trim()) {
    dropdown.classList.add('hidden');
    return;
  }

  // Filter products by name or barcode
  const filtered = dbProducts.filter(p =>
    p.name.toLowerCase().includes(query.toLowerCase()) ||
    (p.barcode && p.barcode.includes(query))
  );

  if (filtered.length === 0) {
    dropdown.innerHTML = `<div class="p-3 text-center text-xs text-muted">Produk tidak ditemukan</div>`;
    dropdown.classList.remove('hidden');
    return;
  }

  dropdown.innerHTML = filtered.map((p, index) => `
    <div class="search-result-item" id="opnameResult-${p.id}" onclick="selectProductForOpname(${p.id})">
      <div class="result-info">
        <span class="result-name">${p.name}</span>
        <span class="result-meta">${p.barcode ? p.barcode : 'Tanpa Barcode'} | ${p.category}</span>
      </div>
      <div class="result-price-stock">
        <span class="result-stock text-muted">Stok Sistem: ${p.stock}</span>
      </div>
    </div>
  `).join('');

  dropdown.classList.remove('hidden');
}

function selectProductForOpname(productId) {
  const product = dbProducts.find(p => p.id === productId);
  if (!product) return;

  const existing = opnameCart.find(item => item.product_id === productId);
  if (existing) {
    existing.physical_stock += 1;
  } else {
    opnameCart.push({
      product_id: product.id,
      barcode: product.barcode,
      name: product.name,
      system_stock: product.stock,
      physical_stock: 1
    });
  }

  playBeepSound();
  
  // Clear and hide search input/dropdown
  const searchInput = document.getElementById('opnameBarcodeSearch');
  searchInput.value = '';
  searchInput.focus();
  document.getElementById('opnameProductDropdown').classList.add('hidden');

  renderOpnameCart();
}

function addBarcodeToOpnameCart(barcode) {
  const product = dbProducts.find(p => p.barcode === barcode);
  if (!product) {
    showToast(`Produk dengan barcode ${barcode} tidak terdaftar!`, 'warning');
    playBeepSound();
    return;
  }

  const existing = opnameCart.find(item => item.product_id === product.id);
  if (existing) {
    existing.physical_stock += 1;
  } else {
    opnameCart.push({
      product_id: product.id,
      barcode: product.barcode,
      name: product.name,
      system_stock: product.stock,
      physical_stock: 1
    });
  }

  playBeepSound();
  showToast(`Berhasil memindai: ${product.name}`, 'success');

  renderOpnameCart();
}

function updateOpnameQty(productId, val) {
  const item = opnameCart.find(item => item.product_id === productId);
  if (!item) return;

  const parsed = parseInt(val);
  if (isNaN(parsed) || parsed < 0) {
    item.physical_stock = 0;
  } else {
    item.physical_stock = parsed;
  }

  renderOpnameCart();
}

function deleteOpnameItem(productId) {
  opnameCart = opnameCart.filter(item => item.product_id !== productId);
  renderOpnameCart();
}

function renderOpnameCart() {
  const body = document.getElementById('opnameCartBody');
  const count = document.getElementById('opnameCartCount');
  
  count.innerText = `${opnameCart.length} Barang`;

  if (opnameCart.length === 0) {
    body.innerHTML = `
      <tr class="empty-opname-row">
        <td colspan="8" class="text-center py-5 text-muted">
          <i data-lucide="clipboard-check" class="empty-cart-icon" style="width: 48px; height: 48px; margin-bottom: 12px; display: inline-block;"></i>
          <p>Mulai memindai barcode atau ketik nama produk di atas untuk memulai audit fisik.</p>
        </td>
      </tr>
    `;
    lucide.createIcons();
    return;
  }

  body.innerHTML = opnameCart.map((item, index) => {
    const diff = item.physical_stock - item.system_stock;
    let diffText = diff > 0 ? `+${diff}` : `${diff}`;
    let badgeClass = 'badge-match';
    let statusText = 'Sesuai';

    if (diff < 0) {
      badgeClass = 'badge-shortage';
      statusText = 'Kurang / Minus';
    } else if (diff > 0) {
      badgeClass = 'badge-surplus';
      statusText = 'Lebih / Surplus';
    }

    return `
      <tr>
        <td class="text-center">${index + 1}</td>
        <td class="font-mono text-xs text-muted">${item.barcode ? item.barcode : '-'}</td>
        <td class="font-semibold">${item.name}</td>
        <td class="text-center font-mono font-bold">${item.system_stock}</td>
        <td class="text-center">
          <input type="number" min="0" value="${item.physical_stock}" 
                 style="width: 80px; text-align: center; padding: 6px;" 
                 oninput="updateOpnameQty(${item.product_id}, this.value)">
        </td>
        <td class="text-center font-mono font-bold ${diff === 0 ? '' : (diff > 0 ? 'text-success' : 'text-danger')}">${diffText}</td>
        <td class="text-center">
          <span class="badge ${badgeClass}">${statusText}</span>
        </td>
        <td class="text-center">
          <button class="btn btn-secondary btn-xs text-danger" onclick="deleteOpnameItem(${item.product_id})">
            <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  lucide.createIcons();
}

function resetOpnameSession() {
  if (opnameCart.length === 0) return;
  if (confirm('Apakah Anda yakin ingin membatalkan sesi audit opname aktif? Semua data hitungan sementara akan dihapus.')) {
    opnameCart = [];
    renderOpnameCart();
    showToast('Sesi opname dibatalkan.', 'primary');
  }
}

async function submitOpnameSession() {
  if (opnameCart.length === 0) {
    showToast('Daftar barang yang dihitung masih kosong!', 'warning');
    return;
  }

  if (!confirm('Apakah Anda yakin ingin menyimpan sesi opname? Tindakan ini akan menyinkronkan stok sistem dengan stok fisik.')) {
    return;
  }

  const payload = {
    recorded_by: currentUser ? currentUser.name : 'Administrator',
    items: opnameCart.map(item => ({
      product_id: item.product_id,
      physical_stock: item.physical_stock
    }))
  };

  try {
    const response = await fetch(`${API_URL}/api/stock/opnames`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (response.ok) {
      showToast(`Stock opname berhasil disimpan! (No: ${data.opname_number})`, 'success');
      playDingSound();
      opnameCart = [];
      renderOpnameCart();
      await fetchProductsCache(); // Refresh local cache
      switchOpnameTab('history');
    } else {
      showToast(data.error || 'Gagal menyimpan stock opname', 'danger');
    }
  } catch (error) {
    console.error('Koneksi server gagal:', error);
    showToast('Koneksi server gagal', 'danger');
  }
}

async function fetchOpnameHistory() {
  try {
    const response = await fetch(appendOwnerParam(`${API_URL}/api/stock/opnames`));
    if (response.ok) {
      dbStockOpnames = await response.json();
      renderOpnameHistory(dbStockOpnames);
    }
  } catch (error) {
    console.error('Gagal memuat riwayat opname:', error);
  }
}

function renderOpnameHistory(opnames) {
  const body = document.getElementById('opnameHistoryBody');
  if (opnames.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-5 text-muted">Belum ada riwayat stock opname yang tercatat.</td>
      </tr>
    `;
    return;
  }

  body.innerHTML = opnames.map((o, index) => `
    <tr>
      <td class="text-center">${index + 1}</td>
      <td class="font-mono font-bold text-xs">${o.opname_number}</td>
      <td>${formatDisplayDate(o.created_at)}</td>
      <td class="font-bold">${o.recorded_by}</td>
      <td class="text-center">
        <button class="btn btn-secondary btn-sm" onclick="openOpnameDetailModal(${o.id})">
          <i data-lucide="eye" style="width: 14px; height: 14px;"></i>
          <span>Lihat Detail</span>
        </button>
      </td>
    </tr>
  `).join('');

  lucide.createIcons();
}

async function openOpnameDetailModal(opnameId) {
  try {
    const response = await fetch(appendOwnerParam(`${API_URL}/api/stock/opnames/${opnameId}`));
    if (response.ok) {
      const data = await response.json();
      
      document.getElementById('detailOpnameNumber').innerText = data.opname_number;
      document.getElementById('detailOpnameAuditor').innerText = data.recorded_by;
      document.getElementById('detailOpnameDate').innerText = formatDisplayDate(data.created_at);

      const tableBody = document.getElementById('opnameDetailTableBody');
      if (data.items.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="6" class="text-center py-3 text-muted">Tidak ada detail item</td></tr>`;
      } else {
        tableBody.innerHTML = data.items.map((item, index) => {
          let diffText = item.difference > 0 ? `+${item.difference}` : `${item.difference}`;
          return `
            <tr>
              <td class="text-center">${index + 1}</td>
              <td class="font-mono text-xs text-muted">${item.barcode ? item.barcode : '-'}</td>
              <td class="font-semibold">${item.product_name}</td>
              <td class="text-center font-mono">${item.system_stock}</td>
              <td class="text-center font-mono font-bold">${item.physical_stock}</td>
              <td class="text-center font-mono font-bold ${item.difference === 0 ? '' : (item.difference > 0 ? 'text-success' : 'text-danger')}">${diffText}</td>
            </tr>
          `;
        }).join('');
      }

      document.getElementById('opnameDetailModal').classList.remove('hidden');
    } else {
      showToast('Gagal memuat rincian stock opname', 'danger');
    }
  } catch (error) {
    console.error('Koneksi server gagal:', error);
  }
}

function closeOpnameDetailModal() {
  document.getElementById('opnameDetailModal').classList.add('hidden');
}
