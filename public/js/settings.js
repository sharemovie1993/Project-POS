function handleLogoUpload(input) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    if (file.size > 2 * 1024 * 1024) {
      showToast('Ukuran berkas logo maksimal 2MB!', 'warning');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = function(e) {
      uploadedStoreLogoBase64 = e.target.result;
      const preview = document.getElementById('storeLogoPreview');
      const placeholder = document.getElementById('storeLogoPlaceholder');
      const btnRemove = document.getElementById('btnRemoveLogo');
      
      if (preview) {
        preview.src = uploadedStoreLogoBase64;
        preview.style.display = 'block';
      }
      if (placeholder) placeholder.style.display = 'none';
      if (btnRemove) btnRemove.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  }
}

function removeStoreLogo() {
  uploadedStoreLogoBase64 = '';
  const preview = document.getElementById('storeLogoPreview');
  const placeholder = document.getElementById('storeLogoPlaceholder');
  const btnRemove = document.getElementById('btnRemoveLogo');
  const input = document.getElementById('inputStoreLogoFile');
  
  if (preview) {
    preview.src = '';
    preview.style.display = 'none';
  }
  if (placeholder) placeholder.style.display = 'flex';
  if (btnRemove) btnRemove.classList.add('hidden');
  if (input) input.value = '';
}

async function fetchStoreSettings() {
  try {
    const response = await fetch(`${API_URL}/api/settings`);
    if (response.ok) {
      systemSettings = await response.json();
      updateAppBranding();
    }
  } catch (error) {
    console.error('Gagal mengambil pengaturan sistem:', error);
  }
}

function updateAppBranding() {
  const storeName = systemSettings.store_name || 'KASIRKU POS';
  document.title = `${storeName} - Aplikasi Kasir Lokal`;
  
  // 1. Sidebar Brand Text
  const brandTextEl = document.querySelector('.brand-text h1');
  if (brandTextEl) {
    if (storeName === 'KASIRKU POS') {
      brandTextEl.innerHTML = 'KASIRKU<span>POS</span>';
    } else {
      brandTextEl.textContent = storeName;
      if (storeName.length > 15) {
        brandTextEl.style.fontSize = '12px';
      } else if (storeName.length > 10) {
        brandTextEl.style.fontSize = '14px';
      } else {
        brandTextEl.style.fontSize = '16px';
      }
    }
  }

  // 2. Login Overlay Branding
  const loginStoreNameEl = document.getElementById('loginStoreName');
  if (loginStoreNameEl) {
    if (storeName === 'KASIRKU POS') {
      loginStoreNameEl.innerHTML = 'KASIRKU<span style="color: var(--color-primary);">POS</span>';
    } else {
      loginStoreNameEl.textContent = storeName;
    }
  }

  const loginLogoWrapper = document.getElementById('loginLogoWrapper');
  if (loginLogoWrapper) {
    if (systemSettings.store_logo) {
      loginLogoWrapper.innerHTML = `<img src="${systemSettings.store_logo}" alt="Logo Toko" style="max-height: 60px; margin-bottom: 12px; max-width: 150px; object-fit: contain;">`;
    } else {
      loginLogoWrapper.innerHTML = `<i data-lucide="store" style="width: 48px; height: 48px; color: var(--color-primary); background: var(--color-primary-glow); padding: 10px; border-radius: var(--radius-md); margin-bottom: 12px;"></i>`;
      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    }
  }

  // 3. Report Print Header Branding
  const reportPrintStoreName = document.getElementById('reportPrintStoreName');
  if (reportPrintStoreName) {
    reportPrintStoreName.textContent = storeName;
  }
  const reportPrintStoreAddress = document.getElementById('reportPrintStoreAddress');
  if (reportPrintStoreAddress) {
    reportPrintStoreAddress.textContent = systemSettings.store_address || '';
  }
  const reportPrintStorePhone = document.getElementById('reportPrintStorePhone');
  if (reportPrintStorePhone) {
    reportPrintStorePhone.textContent = systemSettings.store_phone ? `Telp: ${systemSettings.store_phone}` : '';
  }
  const reportPrintLogoContainer = document.getElementById('reportPrintLogoContainer');
  if (reportPrintLogoContainer) {
    if (systemSettings.store_logo) {
      reportPrintLogoContainer.innerHTML = `<img src="${systemSettings.store_logo}" alt="Logo Toko">`;
    } else {
      reportPrintLogoContainer.innerHTML = '';
    }
  }

  // Set default values for tax and discount on POS screen on initial load
  const taxInput = document.getElementById('inputTax');
  const discountInput = document.getElementById('inputDiscount');
  
  if (taxInput && (taxInput.value === '0' || taxInput.value === '')) {
    taxInput.value = systemSettings.default_tax_rate !== undefined ? systemSettings.default_tax_rate : '0';
  }
  if (discountInput && (discountInput.value === '0' || discountInput.value === '')) {
    discountInput.value = systemSettings.default_discount !== undefined ? systemSettings.default_discount : '0';
  }
  
  if (typeof calculateBilling === 'function') {
    calculateBilling();
  }
}

function loadStoreBranding() {
  const nameInput = document.getElementById('inputStoreName');
  const addressInput = document.getElementById('inputStoreAddress');
  const phoneInput = document.getElementById('inputStorePhone');
  const footerInput = document.getElementById('inputStoreFooter');
  const defaultTaxRateInput = document.getElementById('inputDefaultTaxRate');
  const defaultDiscountInput = document.getElementById('inputDefaultDiscount');
  
  if (nameInput) nameInput.value = systemSettings.store_name || 'KASIRKU POS';
  if (addressInput) addressInput.value = systemSettings.store_address || '';
  if (phoneInput) phoneInput.value = systemSettings.store_phone || '';
  if (footerInput) footerInput.value = systemSettings.store_footer || '';
  if (defaultTaxRateInput) defaultTaxRateInput.value = systemSettings.default_tax_rate !== undefined ? systemSettings.default_tax_rate : '0';
  if (defaultDiscountInput) defaultDiscountInput.value = systemSettings.default_discount !== undefined ? systemSettings.default_discount : '0';
  
  const preview = document.getElementById('storeLogoPreview');
  const placeholder = document.getElementById('storeLogoPlaceholder');
  const btnRemove = document.getElementById('btnRemoveLogo');
  
  if (systemSettings.store_logo) {
    uploadedStoreLogoBase64 = systemSettings.store_logo;
    if (preview) {
      preview.src = systemSettings.store_logo;
      preview.style.display = 'block';
    }
    if (placeholder) placeholder.style.display = 'none';
    if (btnRemove) btnRemove.classList.remove('hidden');
  } else {
    uploadedStoreLogoBase64 = '';
    if (preview) {
      preview.src = '';
      preview.style.display = 'none';
    }
    if (placeholder) placeholder.style.display = 'flex';
    if (btnRemove) btnRemove.classList.add('hidden');
  }
}

async function saveStoreBranding(e) {
  e.preventDefault();
  
  const name = document.getElementById('inputStoreName').value.trim();
  const address = document.getElementById('inputStoreAddress').value.trim();
  const phone = document.getElementById('inputStorePhone').value.trim();
  const footer = document.getElementById('inputStoreFooter').value;
  const logo = uploadedStoreLogoBase64;
  const defaultTaxRateVal = document.getElementById('inputDefaultTaxRate') ? document.getElementById('inputDefaultTaxRate').value.trim() : '0';
  const defaultDiscountVal = document.getElementById('inputDefaultDiscount') ? document.getElementById('inputDefaultDiscount').value.trim() : '0';

  if (!name) {
    showToast('Nama toko wajib diisi!', 'warning');
    return;
  }

  const payload = {
    store_name: name,
    store_address: address,
    store_phone: phone,
    store_logo: logo,
    store_footer: footer,
    default_tax_rate: defaultTaxRateVal,
    default_discount: defaultDiscountVal
  };

  try {
    const response = await fetch(`${API_URL}/api/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const resData = await response.json();

    if (response.ok && resData.success) {
      showToast('Branding toko berhasil disimpan!', 'success');
      playDingSound();
      systemSettings = resData.settings;
      updateAppBranding();
    } else {
      showToast(resData.error || 'Gagal menyimpan branding toko', 'danger');
    }
  } catch (error) {
    console.error('Gagal menyimpan branding:', error);
    showToast('Koneksi server gagal', 'danger');
  }
}

// ==================== FITUR CHECK UPDATE SISTEM ====================

async function checkSystemUpdate() {
  const btnCheck = document.getElementById('btnCheckUpdate');
  const btnApply = document.getElementById('btnApplyUpdate');
  const lblStatus = document.getElementById('lblUpdateStatus');
  const lblLocal = document.getElementById('lblLocalSha');
  const lblRemote = document.getElementById('lblRemoteSha');
  const changelogWrapper = document.getElementById('changelogWrapper');
  const lstChangelog = document.getElementById('lstChangelog');

  if (!btnCheck || !lblStatus || !lblLocal || !lblRemote) return;

  btnCheck.disabled = true;
  btnCheck.innerHTML = 'Memeriksa...';
  lblStatus.textContent = 'Memeriksa...';
  lblStatus.className = 'text-muted';
  if (changelogWrapper) changelogWrapper.classList.add('hidden');

  try {
    const response = await fetch(`${API_URL}/api/settings/update-check`);
    const data = await response.json();

    if (!response.ok) {
      showToast(data.error || 'Gagal memeriksa pembaruan', 'danger');
      lblStatus.textContent = 'Gagal memeriksa';
      lblStatus.className = 'text-danger';
      return;
    }

    lblLocal.textContent = data.localSha || '-';
    lblRemote.textContent = data.remoteSha || '-';

    if (data.upToDate) {
      lblStatus.textContent = 'Aplikasi Up to Date';
      lblStatus.style.color = 'var(--color-success)';
      if (btnApply) btnApply.classList.add('hidden');
      showToast('Aplikasi Anda sudah menggunakan versi terbaru!', 'success');
    } else {
      lblStatus.textContent = 'Tersedia Pembaruan Baru!';
      lblStatus.style.color = 'var(--color-warning)';
      if (btnApply) btnApply.classList.remove('hidden');

      // Tampilkan changelog jika ada
      if (data.changelog && data.changelog.length > 0) {
        if (lstChangelog && changelogWrapper) {
          lstChangelog.textContent = data.changelog.join('\n');
          changelogWrapper.classList.remove('hidden');
        }
      }
      showToast('Tersedia pembaruan baru! Silakan klik "Pasang Update".', 'warning');
      playBeepSound();
    }
  } catch (error) {
    console.error('Error checking updates:', error);
    showToast('Koneksi server gagal saat memeriksa pembaruan', 'danger');
    lblStatus.textContent = 'Koneksi gagal';
    lblStatus.className = 'text-danger';
  } finally {
    btnCheck.disabled = false;
    btnCheck.innerHTML = '<i data-lucide="search"></i> Periksa Update';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }
}

async function applySystemUpdate() {
  const btnApply = document.getElementById('btnApplyUpdate');
  const btnCheck = document.getElementById('btnCheckUpdate');
  const lblStatus = document.getElementById('lblUpdateStatus');

  if (!confirm('Apakah Anda yakin ingin memasang pembaruan sekarang?\nAplikasi akan mengunduh kode terbaru dan merestart server secara otomatis.')) {
    return;
  }

  if (btnApply) {
    btnApply.disabled = true;
    btnApply.innerHTML = 'Mengunduh...';
  }
  if (btnCheck) btnCheck.disabled = true;
  if (lblStatus) {
    lblStatus.textContent = 'Sedang memperbarui...';
    lblStatus.style.color = 'var(--color-warning)';
  }

  try {
    const response = await fetch(`${API_URL}/api/settings/update-apply`, { method: 'POST' });
    const data = await response.json();

    if (response.ok && data.success) {
      showToast(data.message, 'success');
      playDingSound();
      
      if (lblStatus) {
        lblStatus.textContent = 'Server merestart... Reload halaman...';
        lblStatus.style.color = 'var(--color-success)';
      }

      setTimeout(() => {
        window.location.reload();
      }, 5000);
    } else {
      showToast(data.error || 'Gagal memasang pembaruan', 'danger');
      if (lblStatus) {
        lblStatus.textContent = 'Gagal memperbarui';
        lblStatus.className = 'text-danger';
      }
      if (btnApply) {
        btnApply.disabled = false;
        btnApply.innerHTML = '<i data-lucide="download"></i> Pasang Update';
      }
      if (btnCheck) btnCheck.disabled = false;
    }
  } catch (error) {
    console.error('Error applying updates:', error);
    showToast('Koneksi terputus saat merestart server. Memuat ulang halaman...', 'warning');
    setTimeout(() => {
      window.location.reload();
    }, 4000);
  }
}
