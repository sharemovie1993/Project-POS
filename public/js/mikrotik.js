function toggleMikrotikFields(value) {
  const wrapper = document.getElementById('mikrotikFieldsWrapper');
  const btnTest = document.getElementById('btnTestMikrotik');
  
  const mtHost = document.getElementById('mtHost');
  const mtPort = document.getElementById('mtPort');
  const mtUser = document.getElementById('mtUser');
  
  if (value === '0') {
    if (wrapper) wrapper.classList.add('hidden');
    if (btnTest) btnTest.classList.add('hidden');
    
    if (mtHost) mtHost.removeAttribute('required');
    if (mtPort) mtPort.removeAttribute('required');
    if (mtUser) mtUser.removeAttribute('required');
  } else {
    if (wrapper) wrapper.classList.remove('hidden');
    if (btnTest) btnTest.classList.remove('hidden');
    
    if (mtHost) mtHost.setAttribute('required', 'required');
    if (mtPort) mtPort.setAttribute('required', 'required');
    if (mtUser) mtUser.setAttribute('required', 'required');
  }
}

async function loadMikrotikConfig() {
  const form = document.getElementById('mikrotikConfigForm');
  if (!form) return;

  try {
    // 1. Muat status active mikrotik dari settings
    const settingsResponse = await fetch(`${API_URL}/api/settings`);
    let isEnabled = '1';
    if (settingsResponse.ok) {
      const settings = await settingsResponse.json();
      isEnabled = settings.mikrotik_enabled !== undefined ? settings.mikrotik_enabled : '1';
    }
    
    const selectEnabled = document.getElementById('selectMikrotikEnabled');
    if (selectEnabled) {
      selectEnabled.value = isEnabled;
    }
    
    toggleMikrotikFields(isEnabled);

    // 2. Muat konfigurasi Router MikroTik
    const response = await fetch(`${API_URL}/api/mikrotik/config`);
    if (response.ok) {
      const config = await response.json();
      document.getElementById('mtHost').value = config.host || '';
      document.getElementById('mtPort').value = config.port || 8728;
      document.getElementById('mtUser').value = config.user || '';
      if (document.getElementById('mtOwner')) {
        document.getElementById('mtOwner').value = config.owner || 'Organisasi';
      }
      
      const pwdInput = document.getElementById('mtPassword');
      if (config.has_password) {
        pwdInput.placeholder = '••••••••';
        document.getElementById('mtPasswordLabel').innerText = 'Password API (Kosongkan jika tidak diubah)';
      } else {
        pwdInput.placeholder = 'Masukkan password router...';
        document.getElementById('mtPasswordLabel').innerText = 'Password API';
      }
    }
  } catch (error) {
    console.error('Gagal memuat konfigurasi MikroTik:', error);
  }
}

async function saveMikrotikConfig(e) {
  e.preventDefault();
  
  const selectEnabled = document.getElementById('selectMikrotikEnabled');
  const isEnabled = selectEnabled ? selectEnabled.value : '1';
  
  try {
    // 1. Simpan pengaturan sistem terlebih dahulu
    const settingsResponse = await fetch(`${API_URL}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mikrotik_enabled: isEnabled })
    });
    
    if (!settingsResponse.ok) {
      const resData = await settingsResponse.json();
      showToast(resData.error || 'Gagal menyimpan pengaturan sistem', 'danger');
      return;
    }
    
    // 2. Jika diaktifkan, simpan detail koneksi MikroTik ke file/db
    if (isEnabled === '1') {
      const host = document.getElementById('mtHost').value.trim();
      const port = document.getElementById('mtPort').value;
      const user = document.getElementById('mtUser').value.trim();
      const password = document.getElementById('mtPassword').value;
      const owner = document.getElementById('mtOwner') ? document.getElementById('mtOwner').value : 'Organisasi';

      const payload = { host, port, user, password, owner };

      const response = await fetch(`${API_URL}/api/mikrotik/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const resData = await response.json();

      if (!response.ok) {
        showToast(resData.error || 'Gagal menyimpan konfigurasi MikroTik', 'danger');
        return;
      }
    }
    
    showToast('Pengaturan sistem berhasil disimpan!', 'success');
    playDingSound();
    document.getElementById('mtPassword').value = '';
    loadMikrotikConfig(); // Refresh
  } catch (error) {
    console.error('Gagal menyimpan konfigurasi:', error);
    showToast('Koneksi server gagal', 'danger');
  }
}

async function testMikrotikConnection() {
  const host = document.getElementById('mtHost').value.trim();
  const port = document.getElementById('mtPort').value;
  const user = document.getElementById('mtUser').value.trim();
  const password = document.getElementById('mtPassword').value;

  if (!host || !user) {
    showToast('IP Address dan Username wajib diisi untuk tes koneksi!', 'warning');
    return;
  }

  showToast('Mencoba menghubungkan ke router MikroTik...', 'primary');

  const payload = { host, port, user, password };

  try {
    const response = await fetch(`${API_URL}/api/mikrotik/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const resData = await response.json();

    if (response.ok && resData.success) {
      showToast('Tes Koneksi Berhasil! Router MikroTik terhubung.', 'success');
      playDingSound();
    } else {
      showToast(resData.error || 'Koneksi ke MikroTik gagal!', 'danger');
      playBeepSound();
    }
  } catch (error) {
    console.error('Gagal melakukan tes koneksi MikroTik:', error);
    showToast('Koneksi server gagal', 'danger');
  }
}
