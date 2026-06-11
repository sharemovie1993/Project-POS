/**
 * Kasirku POS - Owners Catalog Management Module
 */

async function fetchOwners() {
  try {
    const response = await fetch(`${API_URL}/api/owners`);
    if (response.ok) {
      dbOwners = await response.json();
      populateOwnerDropdowns();
      if (activeScreen === 'owners') {
        renderOwnersTable();
      }
    }
  } catch (error) {
    console.error('Gagal memuat data owner:', error);
  }
}

function populateOwnerDropdowns() {
  // 1. MikroTik Owner Dropdown (#mtOwner)
  const mtOwnerSelect = document.getElementById('mtOwner');
  if (mtOwnerSelect) {
    const currentValue = mtOwnerSelect.value || 'Organisasi';
    mtOwnerSelect.innerHTML = dbOwners.map(owner => `<option value="${owner.name}">${owner.name}</option>`).join('');
    if (dbOwners.some(o => o.name === currentValue)) {
      mtOwnerSelect.value = currentValue;
    } else if (dbOwners.length > 0) {
      mtOwnerSelect.value = dbOwners[0].name;
    }
  }

  // 2. Product Form Owner Dropdown (#formOwner)
  const formOwnerSelect = document.getElementById('formOwner');
  if (formOwnerSelect) {
    const currentValue = formOwnerSelect.value || 'Organisasi';
    formOwnerSelect.innerHTML = dbOwners.map(owner => `<option value="${owner.name}">${owner.name}</option>`).join('');
    if (dbOwners.some(o => o.name === currentValue)) {
      formOwnerSelect.value = currentValue;
    } else if (dbOwners.length > 0) {
      formOwnerSelect.value = dbOwners[0].name;
    }
  }

  // 3. User Form Owner Dropdown (#formUserOwner)
  const formUserOwnerSelect = document.getElementById('formUserOwner');
  if (formUserOwnerSelect) {
    const currentValue = formUserOwnerSelect.value || '';
    const defaultOption = '<option value="">Super Admin (Semua Owner)</option>';
    const optionsHTML = dbOwners.map(owner => `<option value="${owner.name}">${owner.name}</option>`).join('');
    formUserOwnerSelect.innerHTML = defaultOption + optionsHTML;
    if (currentValue === '' || dbOwners.some(o => o.name === currentValue)) {
      formUserOwnerSelect.value = currentValue;
    } else {
      formUserOwnerSelect.value = '';
    }
  }
}

function renderOwnersTable() {
  const body = document.getElementById('ownerCatalogBody');
  if (!body) return;

  const searchInput = document.getElementById('ownerSearch');
  const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

  const filtered = dbOwners.filter(owner => 
    owner.name.toLowerCase().includes(query) || 
    (owner.description && owner.description.toLowerCase().includes(query))
  );

  if (filtered.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="5" class="text-center py-5 text-muted text-xs">Tidak ada data owner yang ditemukan.</td>
      </tr>
    `;
    return;
  }

  body.innerHTML = filtered.map((owner, index) => {
    const dateStr = owner.created_at ? formatDisplayDate(owner.created_at) : '-';
    // Proteksi: Tiga owner default dilarang dihapus untuk menjamin integritas data awal, namun boleh diedit
    const isDefaultOwner = ['Organisasi', 'Pak Nandang', 'Pak Asep'].includes(owner.name);
    
    return `
      <tr>
        <td class="text-center text-xs font-semibold text-muted">${index + 1}</td>
        <td class="font-semibold text-sm">${owner.name}</td>
        <td class="text-muted text-xs">${owner.description || '-'}</td>
        <td class="text-xs text-muted">${dateStr}</td>
        <td class="text-center">
          <div style="display: flex; gap: 8px; justify-content: center;">
            <button class="btn btn-secondary-light btn-xs" onclick="openOwnerModal('edit', ${owner.id})">
              <i data-lucide="edit-3" style="width: 12px; height: 12px;"></i> Edit
            </button>
            <button class="btn btn-danger-light btn-xs" onclick="deleteOwner(${owner.id})" ${isDefaultOwner ? 'disabled' : ''}>
              <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i> Hapus
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
  
  // Re-initialize lucide icons inside dynamically created buttons
  lucide.createIcons();
}

function openOwnerModal(mode, id = null) {
  const form = document.getElementById('ownerForm');
  if (form) form.reset();
  document.getElementById('editOwnerId').value = '';
  document.getElementById('ownerModalTitle').innerHTML = '<i data-lucide="briefcase" class="mr-2"></i> Tambah Owner Baru';

  if (mode === 'add') {
    document.getElementById('formOwnerName').disabled = false;
  } else if (mode === 'edit' && id !== null) {
    document.getElementById('ownerModalTitle').innerHTML = '<i data-lucide="edit-3" class="mr-2"></i> Ubah Data Owner';
    const owner = dbOwners.find(o => o.id === id);
    if (owner) {
      document.getElementById('editOwnerId').value = owner.id;
      document.getElementById('formOwnerName').value = owner.name;
      document.getElementById('formOwnerDesc').value = owner.description || '';
      
      // Jangan biarkan nama owner default diubah agar database seed/audit aman
      const isDefault = ['Organisasi', 'Pak Nandang', 'Pak Asep'].includes(owner.name);
      document.getElementById('formOwnerName').disabled = isDefault;
    }
  }

  document.getElementById('ownerFormModal').classList.remove('hidden');
  document.getElementById('formOwnerName').focus();
  lucide.createIcons();
}

function closeOwnerModal() {
  document.getElementById('ownerFormModal').classList.add('hidden');
}

async function saveOwner(e) {
  e.preventDefault();

  const id = document.getElementById('editOwnerId').value;
  const name = document.getElementById('formOwnerName').value.trim();
  const description = document.getElementById('formOwnerDesc').value.trim();

  const isEdit = id !== '';
  const url = isEdit ? `${API_URL}/api/owners/${id}` : `${API_URL}/api/owners`;
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const response = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description })
    });

    const data = await response.json();
    if (response.ok) {
      showToast(`Data owner "${name}" berhasil disimpan`, 'success');
      closeOwnerModal();
      await fetchOwners();
      // Refresh produk cache karena barangkali ada cascading owner rename
      if (isEdit) {
        await fetchProductsCache();
      }
    } else {
      showToast(data.error || 'Gagal menyimpan data owner', 'danger');
    }
  } catch (error) {
    console.error('Gagal menyimpan owner:', error);
    showToast('Koneksi server gagal', 'danger');
  }
}

async function deleteOwner(id) {
  const owner = dbOwners.find(o => o.id === id);
  if (!owner) return;

  if (confirm(`Apakah Anda yakin ingin menghapus owner "${owner.name}"?`)) {
    try {
      const response = await fetch(`${API_URL}/api/owners/${id}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (response.ok) {
        showToast(data.message, 'success');
        await fetchOwners();
      } else {
        showToast(data.error || 'Gagal menghapus owner', 'danger');
      }
    } catch (error) {
      console.error('Gagal menghapus owner:', error);
      showToast('Koneksi server gagal', 'danger');
    }
  }
}
