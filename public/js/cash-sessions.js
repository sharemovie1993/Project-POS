async function checkActiveShift() {
  if (!currentUser) return;
  
  try {
    const response = await fetch(`${API_URL}/api/cash-sessions/active`);
    if (response.ok) {
      const session = await response.json();
      const sidebarCard = document.getElementById('sidebarShiftCard');
      const sidebarInfo = document.getElementById('sidebarShiftInfo');
      
      if (session) {
        activeCashSession = session;
        if (sidebarCard) sidebarCard.classList.remove('hidden');
        if (sidebarInfo) {
          sidebarInfo.innerHTML = `
            Kasir: <strong>${session.cashier_name}</strong><br>
            Modal: <strong>Rp ${formatRupiah(session.initial_cash)}</strong><br>
            Kas Laci: <strong>Rp ${formatRupiah(session.expected_cash)}</strong>
          `;
        }
      } else {
        activeCashSession = null;
        if (sidebarCard) sidebarCard.classList.add('hidden');
        
        // Kasir wajib membuka shift sebelum bertransaksi
        if (currentUser.role === 'cashier') {
          openOpenShiftModal();
        }
      }
      lucide.createIcons();
    }
  } catch (error) {
    console.error('Gagal memverifikasi shift aktif:', error);
  }
}

function openOpenShiftModal() {
  document.getElementById('openShiftCashier').value = currentUser ? currentUser.name : 'Kasir';
  document.getElementById('openShiftInitialCash').value = '';
  document.getElementById('openShiftModal').classList.remove('hidden');
}

async function saveOpenShift(e) {
  e.preventDefault();
  const initialCash = parseFloat(document.getElementById('openShiftInitialCash').value) || 0;
  const cashierName = currentUser ? currentUser.name : 'Kasir';

  try {
    const response = await fetch(`${API_URL}/api/cash-sessions/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cashier_name: cashierName, initial_cash: initialCash })
    });

    const data = await response.json();
    if (response.ok) {
      showToast('Shift kasir berhasil dibuka. Selamat bekerja!', 'success');
      document.getElementById('openShiftModal').classList.add('hidden');
      await checkActiveShift();
    } else {
      showToast(data.error || 'Gagal membuka shift kasir', 'danger');
    }
  } catch (error) {
    console.error('Gagal membuka shift:', error);
    showToast('Koneksi server gagal', 'danger');
  }
}

function openCloseShiftModal() {
  if (!activeCashSession) {
    showToast('Tidak ada shift aktif yang terbuka', 'warning');
    return;
  }

  // Reload active session statistics from database first for accurate expected_cash
  fetch(`${API_URL}/api/cash-sessions/active`)
    .then(res => res.json())
    .then(session => {
      if (session) {
        activeCashSession = session;
        document.getElementById('closeShiftModalInitial').innerText = `Rp ${formatRupiah(session.initial_cash)}`;
        document.getElementById('closeShiftModalSales').innerText = `+Rp ${formatRupiah(session.total_cash_sales)}`;
        document.getElementById('closeShiftModalExpenses').innerText = `-Rp ${formatRupiah(session.total_cash_expenses)}`;
        document.getElementById('closeShiftModalExpected').innerText = `Rp ${formatRupiah(session.expected_cash)}`;
        
        document.getElementById('closeShiftActualCash').value = '';
        document.getElementById('closeShiftNotes').value = '';
        calculateShiftDiff();
        
        document.getElementById('closeShiftModal').classList.remove('hidden');
      }
    })
    .catch(err => {
      console.error('Gagal mereload status shift:', err);
      showToast('Gagal terhubung ke server', 'danger');
    });
}

function calculateShiftDiff() {
  if (!activeCashSession) return;
  const expected = activeCashSession.expected_cash;
  const actual = parseFloat(document.getElementById('closeShiftActualCash').value) || 0;
  const diff = actual - expected;
  
  const display = document.getElementById('closeShiftDiffDisplay');
  if (diff === 0) {
    display.innerText = `Rp 0 (Pas)`;
    display.style.color = 'var(--color-success)';
  } else if (diff < 0) {
    display.innerText = `-Rp ${formatRupiah(Math.abs(diff))} (Minus/Kurang)`;
    display.style.color = 'var(--color-danger)';
  } else {
    display.innerText = `+Rp ${formatRupiah(diff)} (Surplus/Lebih)`;
    display.style.color = 'var(--color-primary)';
  }
}

function closeCloseShiftModal() {
  document.getElementById('closeShiftModal').classList.add('hidden');
}

async function saveCloseShift(e) {
  e.preventDefault();
  const actualCash = parseFloat(document.getElementById('closeShiftActualCash').value) || 0;
  const notes = document.getElementById('closeShiftNotes').value.trim();

  try {
    const response = await fetch(`${API_URL}/api/cash-sessions/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actual_cash: actualCash, notes: notes })
    });

    const data = await response.json();
    if (response.ok) {
      showToast('Shift kasir berhasil ditutup!', 'success');
      closeCloseShiftModal();
      
      // Print Shift Closing Report
      printShiftReport(data.session);
      
      // Logout otomatis setelah penutupan shift
      setTimeout(() => {
        logout();
      }, 3000);
    } else {
      showToast(data.error || 'Gagal menutup shift kasir', 'danger');
    }
  } catch (error) {
    console.error('Gagal menutup shift:', error);
    showToast('Koneksi server gagal', 'danger');
  }
}

function printShiftReport(session) {
  const printWindow = window.open('', '_blank', 'width=300,height=600');
  
  const formattedOpened = formatDisplayDate(session.opened_at) + ' ' + new Date(session.opened_at).toLocaleTimeString();
  const formattedClosed = formatDisplayDate(session.closed_at) + ' ' + new Date(session.closed_at).toLocaleTimeString();
  const diff = session.difference;
  let diffText = 'Rp 0';
  if (diff < 0) diffText = `-Rp ${formatRupiah(Math.abs(diff))} (KURANG)`;
  else if (diff > 0) diffText = `+Rp ${formatRupiah(diff)} (LEBIH)`;
  else diffText = 'Rp 0 (PAS)';

  const storeName = systemSettings.store_name || 'KASIRKU POS';
  const storeAddress = systemSettings.store_address || '';
  const storePhone = systemSettings.store_phone || '';

  const html = `
    <html>
      <head>
        <title>Laporan Tutup Shift</title>
        <style>
          body { font-family: 'Courier New', Courier, monospace; font-size: 12px; margin: 10px; color: #000; }
          .text-center { text-align: center; }
          .font-bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          .flex-row { display: flex; justify-content: space-between; margin: 3px 0; }
          .header-title { font-size: 14px; margin-bottom: 2px; }
        </style>
      </head>
      <body>
        <div class="text-center font-bold header-title">${storeName}</div>
        <div class="text-center">${storeAddress}</div>
        <div class="text-center">Telp: ${storePhone}</div>
        <div class="divider"></div>
        <div class="text-center font-bold">LAPORAN TUTUP SHIFT / SETORAN</div>
        <div class="divider"></div>
        <div class="flex-row"><span>Kasir:</span><span>${session.cashier_name}</span></div>
        <div class="flex-row"><span>Shift ID:</span><span>#${session.id}</span></div>
        <div style="font-size: 10px; margin: 3px 0;">Buka: ${formattedOpened}</div>
        <div style="font-size: 10px; margin: 3px 0;">Tutup: ${formattedClosed}</div>
        <div class="divider"></div>
        <div class="flex-row font-bold"><span>Modal Awal:</span><span>Rp ${formatRupiah(session.initial_cash)}</span></div>
        <div class="flex-row"><span>Total Tunai Masuk:</span><span>+Rp ${formatRupiah(session.total_cash_sales)}</span></div>
        <div class="flex-row"><span>Total Tunai Keluar:</span><span>-Rp ${formatRupiah(session.total_cash_expenses)}</span></div>
        <div class="divider"></div>
        <div class="flex-row font-bold"><span>Saldo Kas Seharusnya:</span><span>Rp ${formatRupiah(session.expected_cash)}</span></div>
        <div class="flex-row font-bold"><span>Uang Laci Fisik:</span><span>Rp ${formatRupiah(session.actual_cash)}</span></div>
        <div class="divider"></div>
        <div class="flex-row font-bold"><span>Selisih:</span><span>${diffText}</span></div>
        ${session.notes ? `<div style="margin-top: 8px; font-size:10px;">Catatan: ${session.notes}</div>` : ''}
        <div class="divider"></div>
        <div class="text-center" style="margin-top: 15px;">Dicetak otomatis oleh Sistem POS<br>Terima kasih.</div>
      </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
    printWindow.close();
  }, 500);
}
