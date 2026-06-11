function checkUserAuth() {
  const savedUser = localStorage.getItem('pos_user');
  const loginOverlay = document.getElementById('loginOverlay');
  
  if (!savedUser) {
    currentUser = null;
    loginOverlay.classList.remove('hidden');
    document.getElementById('loginUsername').focus();
    return;
  }

  try {
    currentUser = JSON.parse(savedUser);
    loginOverlay.classList.add('hidden');
    
    // Terapkan kelas tema visual berdasarkan role pengguna
    document.body.classList.remove('role-superadmin', 'role-owneradmin', 'role-cashier');
    if (currentUser.role === 'cashier') {
      document.body.classList.add('role-cashier');
    } else if (currentUser.role === 'admin') {
      const isOwnerAdmin = currentUser.owner && currentUser.owner !== 'All' && currentUser.owner !== 'undefined';
      if (isOwnerAdmin) {
        document.body.classList.add('role-owneradmin');
      } else {
        document.body.classList.add('role-superadmin');
      }
    }
    
    // Set nama kasir aktif di header
    activeCashier = currentUser.name;
    document.getElementById('activeCashierName').innerText = currentUser.name;
    
    // Terapkan batasan level akses (role)
    const menuProducts = document.getElementById('menuProducts');
    const menuReports = document.getElementById('menuReports');
    const menuUsers = document.getElementById('menuUsers');
    const menuOwners = document.getElementById('menuOwners');
    const menuOpname = document.getElementById('menuOpname');
    const menuMikrotik = document.getElementById('menuMikrotik');
    const menuPos = document.getElementById('menuPos');

    if (currentUser.role === 'cashier') {
      if (menuPos) menuPos.classList.remove('hidden');
      if (menuProducts) menuProducts.classList.add('hidden');
      if (menuReports) menuReports.classList.add('hidden');
      if (menuUsers) menuUsers.classList.add('hidden');
      if (menuOwners) menuOwners.classList.add('hidden');
      if (menuOpname) menuOpname.classList.add('hidden');
      if (menuMikrotik) menuMikrotik.classList.add('hidden');
      switchScreen('pos');
    } else {
      if (menuPos) menuPos.classList.add('hidden');
      if (menuProducts) menuProducts.classList.remove('hidden');
      if (menuReports) menuReports.classList.remove('hidden');
      if (menuOpname) menuOpname.classList.remove('hidden');
      
      // Batasi akses Manajemen Kasir, Manajemen Owner & Integrasi MikroTik untuk Owner Admin
      const isOwnerAdmin = currentUser.owner && currentUser.owner !== 'All' && currentUser.owner !== 'undefined';
      if (isOwnerAdmin) {
        if (menuUsers) menuUsers.classList.add('hidden');
        if (menuOwners) menuOwners.classList.add('hidden');
        if (menuMikrotik) menuMikrotik.classList.add('hidden');
      } else {
        if (menuUsers) menuUsers.classList.remove('hidden');
        if (menuOwners) menuOwners.classList.remove('hidden');
        if (menuMikrotik) menuMikrotik.classList.remove('hidden');
      }
      switchScreen('products');
    }

    // Ambil cache data produk, kategori & owner dari API
    fetchProductsCache();
    fetchCategories();
    fetchOwners();
    fetchStoreSettings();
    checkActiveShift();

  } catch (e) {
    console.error('Error parsing user data:', e);
    logout();
  }
}

async function processLogin(e) {
  e.preventDefault();
  const usernameInput = document.getElementById('loginUsername');
  const passwordInput = document.getElementById('loginPassword');
  const errorAlert = document.getElementById('loginErrorAlert');

  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  try {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (response.ok) {
      errorAlert.classList.add('hidden');
      playDingSound();
      showToast(`Selamat datang kembali, ${data.user.name}!`, 'success');
      
      // Simpan status login
      localStorage.setItem('pos_user', JSON.stringify(data.user));
      
      // Bersihkan form
      usernameInput.value = '';
      passwordInput.value = '';
      
      // Jalankan auth check
      checkUserAuth();
    } else {
      errorAlert.innerText = data.error || 'Username atau Password salah!';
      errorAlert.classList.remove('hidden');
      playBeepSound();
    }
  } catch (error) {
    console.error('Koneksi login gagal:', error);
    errorAlert.innerText = 'Koneksi server gagal. Silakan coba lagi.';
    errorAlert.classList.remove('hidden');
    playBeepSound();
  }
}

function logout() {
  localStorage.removeItem('pos_user');
  currentUser = null;
  cart = [];
  window.location.reload();
}
