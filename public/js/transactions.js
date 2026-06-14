function openTodayTransactionsModal() {
  if (!currentUser) return;
  document.getElementById('todayTxCashierName').innerText = currentUser.name;
  
  // Set default dates to today
  const today = new Date().toISOString().split('T')[0];
  const startInput = document.getElementById('todayTxStartDate');
  const endInput = document.getElementById('todayTxEndDate');
  if (startInput) startInput.value = today;
  if (endInput) endInput.value = today;
  
  document.getElementById('todayTransactionsModal').classList.remove('hidden');
  fetchTodayTransactions();
}

function closeTodayTransactionsModal() {
  document.getElementById('todayTransactionsModal').classList.add('hidden');
}

async function fetchTodayTransactions() {
  if (!currentUser) return;
  const tbody = document.getElementById('todayTransactionsBody');
  tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted text-xs">Memuat data...</td></tr>`;

  try {
    const startDate = document.getElementById('todayTxStartDate') ? document.getElementById('todayTxStartDate').value : '';
    const endDate = document.getElementById('todayTxEndDate') ? document.getElementById('todayTxEndDate').value : '';
    
    let url = `${API_URL}/api/transactions?cashier=${encodeURIComponent(currentUser.name)}`;
    if (startDate) url += `&startDate=${startDate}`;
    if (endDate) url += `&endDate=${endDate}`;
    
    const response = await fetch(url);
    if (response.ok) {
      const transactions = await response.json();
      if (transactions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted text-xs">Tidak ditemukan transaksi pada periode ini.</td></tr>`;
        return;
      }

      tbody.innerHTML = transactions.map((t, idx) => {
        const timeStr = new Date(t.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        return `
          <tr>
            <td class="text-center font-bold text-xs">${idx + 1}</td>
            <td class="font-mono font-bold text-sm">${t.invoice_number}</td>
            <td class="text-muted text-xs">${timeStr}</td>
            <td class="text-right font-mono font-bold text-sm">Rp ${formatRupiah(t.total_amount)}</td>
            <td class="text-center"><span class="badge badge-default">${t.payment_method}</span></td>
            <td class="text-center">
              <div style="display: flex; gap: 6px; justify-content: center;">
                <button class="btn btn-secondary btn-icon-only btn-xs" onclick="reprintReceipt(${t.id})" title="Cetak Ulang Struk">
                  <i data-lucide="printer" style="width: 12px; height: 12px;"></i>
                </button>
                <button class="btn btn-danger btn-icon-only btn-xs" onclick="voidTransaction(${t.id}, '${t.invoice_number}')" title="Batalkan Transaksi (Void)">
                  <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
      lucide.createIcons();
    } else {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-danger text-xs">Gagal mengambil data dari server.</td></tr>`;
    }
  } catch (error) {
    console.error('Error fetching cashier transactions:', error);
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-danger text-xs">Gagal terhubung ke server.</td></tr>`;
  }
}

async function voidTransaction(id, invoiceNumber) {
  const reason = prompt(`PERINGATAN VOID: Apakah Anda yakin ingin membatalkan transaksi "${invoiceNumber}"?\n\nSemua stok barang akan dikembalikan ke gudang.\n\nSilakan ketik alasan pembatalan:`);
  
  if (reason === null) return; // User clicks cancel on prompt
  if (reason.trim() === '') {
    showToast('Pembatalan dibatalkan. Alasan void wajib diisi.', 'warning');
    return;
  }

  try {
    const response = await fetch(`${API_URL}/api/transactions/${id}/void`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: reason })
    });

    const data = await response.json();
    if (response.ok) {
      showToast(data.message || 'Transaksi berhasil di-void!', 'success');
      playDingSound();
      
      // Refresh current screen data
      fetchTodayTransactions();
      
      // Refresh products cache
      fetchProductsCache();

      // Refresh POS today's revenue widget bar
      fetchPosTodayRevenue();
      
      // If reports screen is open and active report tab is today/finance, refresh it
      if (activeScreen === 'reports') {
        if (activeReportTab === 'today') fetchTodayReport();
        else if (activeReportTab === 'finance') fetchFinancialReport();
        else if (activeReportTab === 'void') fetchVoidLogs();
      }
    } else {
      showToast(data.error || 'Gagal memproses pembatalan.', 'danger');
    }
  } catch (error) {
    console.error('Error voiding transaction:', error);
    showToast('Koneksi server gagal.', 'danger');
  }
}

async function fetchVoidLogs() {
  const tbody = document.getElementById('reportVoidLogsBody');
  tbody.innerHTML = `<tr><td colspan="7" class="text-center py-5 text-muted text-xs">Memuat data...</td></tr>`;

  try {
    const response = await fetch(appendOwnerParam(`${API_URL}/api/void-logs`));
    if (response.ok) {
      const logs = await response.json();
      if (logs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-5 text-muted text-xs">Belum ada riwayat pembatalan transaksi (void).</td></tr>`;
        return;
      }

      let totalVoidAmount = 0;
      const rowsHtml = logs.map((log, idx) => {
        totalVoidAmount += log.total_amount;
        const datetimeStr = new Date(log.void_at).toLocaleString('id-ID');
        return `
          <tr>
            <td class="text-center font-bold text-xs">${idx + 1}</td>
            <td class="text-sm">${datetimeStr}</td>
            <td class="font-mono font-bold text-xs text-danger">${log.invoice_number}</td>
            <td><strong>${log.cashier_name}</strong></td>
            <td class="text-right font-mono font-bold">Rp ${formatRupiah(log.total_amount)}</td>
            <td class="text-xs" style="max-width: 250px; white-space: normal; word-break: break-word;">${log.items_summary}</td>
            <td class="text-sm italic" style="max-width: 200px; white-space: normal; word-break: break-word; color: var(--color-danger);">${log.reason}</td>
          </tr>
        `;
      }).join('');

      tbody.innerHTML = rowsHtml + `
        <tr style="background-color: var(--color-primary-glow); font-weight: bold; border-top: 2px solid var(--color-primary);">
          <td colspan="4">TOTAL VOID</td>
          <td class="text-right font-mono font-bold">Rp ${formatRupiah(totalVoidAmount)}</td>
          <td colspan="2"></td>
        </tr>
      `;
      lucide.createIcons();
    } else {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-5 text-danger text-xs">Gagal memuat log void dari server.</td></tr>`;
    }
  } catch (error) {
    console.error('Error fetching void logs:', error);
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-5 text-danger text-xs">Gagal terhubung ke server.</td></tr>`;
  }
}
