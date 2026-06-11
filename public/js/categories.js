/**
 * Kasirku POS - Categories Catalog Management Module
 */

async function fetchCategories() {
  try {
    const response = await fetch(`${API_URL}/api/categories`);
    if (response.ok) {
      dbCategories = await response.json();

      // Ambil jumlah produk per kategori
      const productsRes = await fetch(`${API_URL}/api/products`);
      const allProducts = productsRes.ok ? await productsRes.json() : [];

      dbAllCategoriesWithCount = dbCategories.map(cat => {
        const count = allProducts.filter(p => p.category === cat.name).length;
        return { ...cat, product_count: count };
      });

      renderCategoryTable(dbAllCategoriesWithCount);
    }
  } catch (error) {
    console.error('Gagal mengambil data kategori:', error);
  }
}

function renderCategoryTable(categories) {
  const body = document.getElementById('categoryTableBody');
  if (!body) return;

  if (categories.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-5 text-muted">Belum ada kategori. Klik "Tambah Kategori Baru" untuk menambahkan.</td>
      </tr>
    `;
    return;
  }

  body.innerHTML = categories.map((cat, index) => {
    const dateStr = formatDisplayDate(cat.created_at);
    const hasProducts = cat.product_count > 0;
    return `
      <tr>
        <td class="text-center">${index + 1}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 10px;">
            <i data-lucide="folder" style="width: 16px; height: 16px; color: var(--color-primary);"></i>
            <span class="font-bold">${cat.name}</span>
          </div>
        </td>
        <td class="text-center">
          <span class="badge ${hasProducts ? 'badge-harian' : 'badge-default'}">
            ${cat.product_count} Produk
          </span>
        </td>
        <td class="text-muted text-xs">${dateStr}</td>
        <td class="text-center">
          <div class="input-with-action justify-center" style="gap: 6px;">
            <button class="btn btn-secondary btn-xs" onclick="openCategoryModal('edit', ${cat.id})">
              <i data-lucide="edit-3" style="width: 13px; height: 13px;"></i>
              <span>Edit</span>
            </button>
            <button class="btn btn-secondary btn-xs text-danger" onclick="deleteCategory(${cat.id})" ${hasProducts ? 'disabled title="Hapus semua produk di kategori ini terlebih dahulu"' : ''}>
              <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  lucide.createIcons();
}

function filterCategoryTable() {
  const query = document.getElementById('categorySearch').value.toLowerCase();
  const filtered = dbAllCategoriesWithCount.filter(cat =>
    cat.name.toLowerCase().includes(query)
  );
  renderCategoryTable(filtered);
}

function openCategoryModal(mode, id = null) {
  const form = document.getElementById('categoryForm');
  form.reset();
  document.getElementById('editCategoryId').value = '';

  if (mode === 'add') {
    document.getElementById('categoryModalTitle').innerHTML = '<i data-lucide="folder-plus" class="mr-2"></i> Tambah Kategori Baru';
    document.getElementById('btnSaveCategory').innerText = 'Simpan Kategori';
  } else if (mode === 'edit' && id !== null) {
    const cat = dbCategories.find(c => c.id === id);
    if (cat) {
      document.getElementById('categoryModalTitle').innerHTML = '<i data-lucide="edit-3" class="mr-2"></i> Ubah Nama Kategori';
      document.getElementById('editCategoryId').value = cat.id;
      document.getElementById('formCategoryName').value = cat.name;
      document.getElementById('btnSaveCategory').innerText = 'Simpan Perubahan';
    }
  }

  document.getElementById('categoryFormModal').classList.remove('hidden');
  lucide.createIcons();
  setTimeout(() => document.getElementById('formCategoryName').focus(), 100);
}

function closeCategoryModal() {
  document.getElementById('categoryFormModal').classList.add('hidden');
}

async function saveCategory(e) {
  e.preventDefault();
  const id = document.getElementById('editCategoryId').value;
  const name = document.getElementById('formCategoryName').value.trim();

  if (!name) {
    showToast('Nama kategori tidak boleh kosong!', 'warning');
    return;
  }

  const isEdit = id !== '';
  const url = isEdit ? `${API_URL}/api/categories/${id}` : `${API_URL}/api/categories`;
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });

    const data = await response.json();

    if (response.ok) {
      showToast(`Kategori "${name}" berhasil ${isEdit ? 'diperbarui' : 'ditambahkan'}!`, 'success');
      closeCategoryModal();
      await fetchCategories();
      // Refresh cache produk juga (karena nama kategori mungkin berubah)
      await fetchProductsCache();
    } else {
      showToast(data.error || 'Gagal menyimpan kategori', 'danger');
    }
  } catch (error) {
    console.error('Gagal menyimpan kategori:', error);
    showToast('Koneksi server gagal', 'danger');
  }
}

async function deleteCategory(id) {
  const cat = dbCategories.find(c => c.id === id);
  if (!cat) return;

  if (confirm(`Hapus kategori "${cat.name}"? Tindakan ini tidak dapat dibatalkan.`)) {
    try {
      const response = await fetch(`${API_URL}/api/categories/${id}`, { method: 'DELETE' });
      const data = await response.json();

      if (response.ok) {
        showToast(data.message, 'success');
        await fetchCategories();
      } else {
        showToast(data.error || 'Gagal menghapus kategori', 'danger');
      }
    } catch (error) {
      console.error('Gagal menghapus kategori:', error);
      showToast('Koneksi server gagal', 'danger');
    }
  }
}
