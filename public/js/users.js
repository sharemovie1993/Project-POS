/**
 * Kasirku POS - Cashier Management Module
 */

async function fetchUserCatalog() {
  const searchInput = document.getElementById('userCatalogSearch');
  const query = searchInput.value.trim().toLowerCase();

  try {
    const response = await fetch(`${API_URL}/api/users`);
    if (response.ok) {
      dbUsers = await response.json();
      
      // Filter lokal jika ada search
      let filteredUsers = dbUsers;
      if (query) {
        filteredUsers = dbUsers.filter(u => 
          u.name.toLowerCase().includes(query) || 
          u.username.toLowerCase().includes(query)
        );
      }
      
      renderUserCatalog(filteredUsers);
    }
  } catch (error) {
    console.error('Gagal mengambil daftar kasir:', error);
  }
}

function renderUserCatalog(users) {
  const body = document.getElementById('userCatalogBody');
  
  if (users.length === 0) {
    body.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-5 text-muted">Akun kasir tidak ditemukan</td>
      </tr>
    `;
    return;
  }

  body.innerHTML = users.map((u, index) => {
    const roleBadge = u.role === 'admin' 
      ? '<span class="badge badge-harian">Admin (Akses Penuh)</span>' 
      : '<span class="badge badge-minuman">Kasir (POS Saja)</span>';

    // Tombol hapus disembunyikan untuk akun admin utama
    const deleteBtn = u.username === 'admin'
      ? ''
      : `
        <button class="btn btn-secondary btn-xs text-danger" onclick="deleteUser(${u.id})">
          <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
        </button>
      `;

    return `
      <tr>
        <td class="text-center">${index + 1}</td>
        <td class="font-bold">${u.name}</td>
        <td class="font-mono text-sm">${u.username}</td>
        <td class="text-center">${roleBadge}</td>
        <td class="text-muted text-xs">${formatDisplayDate(u.created_at)}</td>
        <td class="text-center">
          <div class="input-with-action justify-center" style="gap: 6px;">
            <button class="btn btn-secondary btn-xs" onclick="openUserModal('edit', ${u.id})">
              <i data-lucide="edit-3" style="width: 13px; height: 13px;"></i>
              <span>Edit</span>
            </button>
            ${deleteBtn}
          </div>
        </td>
      </tr>
    `;
  }).join('');
  
  lucide.createIcons();
}

function openUserModal(mode, id = null) {
  const form = document.getElementById('userForm');
  form.reset();
  document.getElementById('editUserId').value = '';
  document.getElementById('userModalTitle').innerText = 'Tambah Kasir Baru';
  
  const passwordInput = document.getElementById('formUserPassword');
  const labelPassword = document.getElementById('labelFormUserPassword');
  const helpPassword = document.getElementById('helpFormUserPassword');
  
  const roleSelect = document.getElementById('formUserRole');
  const ownerWrapper = document.getElementById('formUserOwnerWrapper');
  const ownerSelect = document.getElementById('formUserOwner');

  // Setup change listener to toggle owner dropdown
  roleSelect.onchange = () => {
    if (roleSelect.value === 'admin') {
      if (ownerWrapper) ownerWrapper.style.display = '';
    } else {
      if (ownerWrapper) ownerWrapper.style.display = 'none';
      if (ownerSelect) ownerSelect.value = '';
    }
  };
  
  if (mode === 'add') {
    passwordInput.required = true;
    labelPassword.innerText = 'Password Login *';
    helpPassword.innerText = '';
    document.getElementById('formUserUsername').disabled = false;
    if (ownerWrapper) ownerWrapper.style.display = 'none';
    if (ownerSelect) ownerSelect.value = '';
  } else if (mode === 'edit' && id !== null) {
    document.getElementById('userModalTitle').innerText = 'Ubah Akun Kasir';
    const u = dbUsers.find(user => user.id === id);
    if (u) {
      document.getElementById('editUserId').value = u.id;
      document.getElementById('formUserFullName').value = u.name;
      document.getElementById('formUserUsername').value = u.username;
      document.getElementById('formUserRole').value = u.role;
      if (ownerSelect) ownerSelect.value = u.owner || '';

      if (u.role === 'admin' && u.username !== 'admin') {
        if (ownerWrapper) ownerWrapper.style.display = '';
      } else {
        if (ownerWrapper) ownerWrapper.style.display = 'none';
      }
      
      // Admin utama tidak boleh diganti username dan rolenya
      if (u.username === 'admin') {
        document.getElementById('formUserUsername').disabled = true;
        document.getElementById('formUserRole').disabled = true;
      } else {
        document.getElementById('formUserUsername').disabled = false;
        document.getElementById('formUserRole').disabled = false;
      }

      passwordInput.required = false;
      labelPassword.innerText = 'Ganti Password (Opsional)';
      helpPassword.innerText = 'Kosongkan jika password tidak ingin diubah.';
    }
  }

  document.getElementById('userFormModal').classList.remove('hidden');
  document.getElementById('formUserFullName').focus();
}

function closeUserModal() {
  document.getElementById('userFormModal').classList.add('hidden');
}

async function saveUser(e) {
  e.preventDefault();
  
  const id = document.getElementById('editUserId').value;
  const username = document.getElementById('formUserUsername').value.trim();
  const name = document.getElementById('formUserFullName').value.trim();
  const password = document.getElementById('formUserPassword').value;
  const role = document.getElementById('formUserRole').value;

  const isEdit = id !== '';
  const url = isEdit ? `${API_URL}/api/users/${id}` : `${API_URL}/api/users`;
  const method = isEdit ? 'PUT' : 'POST';

  const ownerEl = document.getElementById('formUserOwner');
  const payload = { username, name, role, owner: (role === 'admin' && ownerEl) ? (ownerEl.value || null) : null };
  if (password.trim() !== '') {
    payload.password = password;
  }

  try {
    const response = await fetch(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const resData = await response.json();

    if (response.ok) {
      showToast(`Akun kasir "${name}" berhasil disimpan`, 'success');
      closeUserModal();
      fetchUserCatalog();
      fetchOwners();
    } else {
      showToast(resData.error || 'Gagal menyimpan akun kasir', 'danger');
    }
  } catch (error) {
    console.error('Gagal menyimpan kasir:', error);
    showToast('Koneksi server gagal', 'danger');
  }
}

async function deleteUser(id) {
  const u = dbUsers.find(user => user.id === id);
  if (!u) return;

  if (confirm(`Apakah Anda yakin ingin menghapus akun kasir "${u.name}"?`)) {
    try {
      const response = await fetch(`${API_URL}/api/users/${id}`, { method: 'DELETE' });
      if (response.ok) {
        showToast(`Akun kasir "${u.name}" berhasil dihapus`, 'success');
        fetchUserCatalog();
        fetchOwners();
      } else {
        const res = await response.json();
        showToast(res.error || 'Gagal menghapus kasir', 'danger');
      }
    } catch (error) {
      console.error('Gagal menghapus kasir:', error);
    }
  }
}
