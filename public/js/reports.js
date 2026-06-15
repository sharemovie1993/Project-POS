// 1. LAPORAN HARI INI
async function populateReportTodayFilters() {
  const startInput = document.getElementById('reportTodayStartDate');
  const endInput = document.getElementById('reportTodayEndDate');
  const tzOffset = new Date().getTimezoneOffset() * 60000;
  const todayLocal = new Date(Date.now() - tzOffset).toISOString().split('T')[0];

  if (startInput && !startInput.value) {
    startInput.value = todayLocal;
  }
  if (endInput && !endInput.value) {
    endInput.value = todayLocal;
  }

  // Populate Cashier select
  const cashierSelect = document.getElementById('reportTodayCashier');
  if (cashierSelect && cashierSelect.children.length <= 1) {
    if (dbUsers.length === 0) {
      try {
        const response = await fetch(`${API_URL}/api/users`);
        if (response.ok) dbUsers = await response.json();
      } catch (e) {
        console.error('Failed to load users for report filter:', e);
      }
    }
    const cashierOptions = dbUsers.map(u => `<option value="${u.name}">${u.name}</option>`).join('');
    cashierSelect.innerHTML = '<option value="">Semua Kasir</option>' + cashierOptions;
  }

  // Populate Owner select
  const ownerSelect = document.getElementById('reportTodayOwner');
  if (ownerSelect && ownerSelect.children.length <= 1) {
    if (dbOwners.length === 0) {
      try {
        const response = await fetch(`${API_URL}/api/owners`);
        if (response.ok) dbOwners = await response.json();
      } catch (e) {
        console.error('Failed to load owners for report filter:', e);
      }
    }
    const ownerOptions = dbOwners.map(o => `<option value="${o.name}">${o.name}</option>`).join('');
    ownerSelect.innerHTML = '<option value="">Semua Owner</option>' + ownerOptions;
  }
}

async function fetchTodayReport() {
  await populateReportTodayFilters();

  try {
    const startDate = document.getElementById('reportTodayStartDate') ? document.getElementById('reportTodayStartDate').value : '';
    const endDate = document.getElementById('reportTodayEndDate') ? document.getElementById('reportTodayEndDate').value : '';
    const cashier = document.getElementById('reportTodayCashier') ? document.getElementById('reportTodayCashier').value : '';
    const owner = document.getElementById('reportTodayOwner') ? document.getElementById('reportTodayOwner').value : '';

    let url = `${API_URL}/api/reports/today?startDate=${startDate}&endDate=${endDate}`;
    if (cashier) url += `&cashier=${encodeURIComponent(cashier)}`;
    if (owner) url += `&owner=${encodeURIComponent(owner)}`;

    const response = await fetch(appendOwnerParam(url));
    if (response.ok) {
      const data = await response.json();
      
      // Tulis Metrics
      document.getElementById('todayOmsetVal').innerText = `Rp ${formatRupiah(data.revenue)}`;
      document.getElementById('todayProfitVal').innerText = `Rp ${formatRupiah(data.profit)}`;
      document.getElementById('todayTransactionsVal').innerText = `${data.transactions_count} Struk`;
      document.getElementById('todayDiscountVal').innerText = `Rp ${formatRupiah(data.discount)}`;

      // Render Item Terjual Hari Ini
      const soldBody = document.getElementById('todaySoldItemsBody');
      if (data.sold_items.length === 0) {
        soldBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted text-xs">Belum ada barang terjual hari ini</td></tr>`;
      } else {
        let totalSoldQty = 0;
        let totalSoldSales = 0;
        const rowsHtml = data.sold_items.map(item => {
          totalSoldQty += item.qty_sold;
          totalSoldSales += item.total_sales;
          return `
            <tr>
              <td>${item.product_name}</td>
              <td class="text-center font-bold">${item.qty_sold} pcs</td>
              <td class="text-right font-mono">Rp ${formatRupiah(item.price_sell)}</td>
              <td class="text-right font-mono font-bold">Rp ${formatRupiah(item.total_sales)}</td>
            </tr>
          `;
        }).join('');

        soldBody.innerHTML = rowsHtml + `
          <tr style="background-color: var(--color-primary-glow); font-weight: bold; border-top: 2px solid var(--color-primary);">
            <td>TOTAL</td>
            <td class="text-center font-bold">${totalSoldQty} pcs</td>
            <td></td>
            <td class="text-right font-mono font-bold">Rp ${formatRupiah(totalSoldSales)}</td>
          </tr>
        `;
      }

      // Render Riwayat Transaksi Hari Ini
      const txBody = document.getElementById('todayTransactionsListBody');
      if (data.transactions.length === 0) {
        txBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted text-xs">Belum ada transaksi hari ini</td></tr>`;
      } else {
        let totalTxAmount = 0;
        const rowsHtml = data.transactions.map(t => {
          totalTxAmount += t.total_amount;
          const timeStr = new Date(t.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
          return `
            <tr>
              <td class="font-mono font-bold">${t.invoice_number}</td>
              <td class="text-muted text-xs">${timeStr}</td>
              <td>${t.cashier_name}</td>
              <td class="text-center"><span class="badge badge-default">${t.payment_method}</span></td>
              <td class="text-right font-mono font-bold">Rp ${formatRupiah(t.total_amount)}</td>
              <td class="text-center">
                <button class="btn btn-secondary btn-icon-only btn-xs" onclick="reprintReceipt(${t.id})" title="Cetak Ulang Struk">
                  <i data-lucide="printer" style="width: 13px; height: 13px;"></i>
                </button>
              </td>
            </tr>
          `;
        }).join('');

        txBody.innerHTML = rowsHtml + `
          <tr style="background-color: var(--color-primary-glow); font-weight: bold; border-top: 2px solid var(--color-primary);">
            <td colspan="4">TOTAL</td>
            <td class="text-right font-mono font-bold">Rp ${formatRupiah(totalTxAmount)}</td>
            <td></td>
          </tr>
        `;
      }
      lucide.createIcons();
    }
  } catch (error) {
    console.error('Gagal mengambil laporan hari ini:', error);
  }
}

async function fetchPosTodayRevenue() {
  if (!currentUser) return;
  const posRevenueBar = document.getElementById('posRevenueBar');
  if (!posRevenueBar) return;

  try {
    const response = await fetch(appendOwnerParam(`${API_URL}/api/reports/today`));
    if (response.ok) {
      const data = await response.json();
      
      let totalOmset = data.revenue || 0;
      let totalTunai = 0;
      let totalQris = 0;
      let totalDebit = 0;
      let totalCount = data.transactions_count || 0;

      if (data.transactions && data.transactions.length > 0) {
        totalTunai = data.transactions
          .filter(t => t.payment_method === 'TUNAI')
          .reduce((sum, t) => sum + (t.total_amount || 0), 0);
        totalQris = data.transactions
          .filter(t => t.payment_method === 'QRIS')
          .reduce((sum, t) => sum + (t.total_amount || 0), 0);
        totalDebit = data.transactions
          .filter(t => t.payment_method === 'DEBIT')
          .reduce((sum, t) => sum + (t.total_amount || 0), 0);
      }

      document.getElementById('posRevenueOmset').innerText = `Rp ${formatRupiah(totalOmset)} (${totalCount} Trx)`;
      document.getElementById('posRevenueTunai').innerText = `Rp ${formatRupiah(totalTunai)}`;
      document.getElementById('posRevenueQris').innerText = `Rp ${formatRupiah(totalQris)}`;
      document.getElementById('posRevenueDebit').innerText = `Rp ${formatRupiah(totalDebit)}`;
    }
  } catch (error) {
    console.error('Gagal memuat rincian pendapatan hari ini:', error);
  }
}

async function reprintReceipt(transactionId) {
  try {
    const response = await fetch(appendOwnerParam(`${API_URL}/api/transactions/${transactionId}`));
    if (response.ok) {
      const res = await response.json();
      
      activeTransactionReceipt = {
        invoice_number: res.invoice_number,
        cashier_name: res.cashier_name,
        payment_method: res.payment_method,
        total_amount: res.total_amount,
        discount: res.discount,
        tax: res.tax,
        payment_amount: res.payment_amount,
        change_amount: res.change_amount,
        created_at: new Date(res.created_at).toLocaleString('id-ID'),
        items: res.items.map(item => ({
          product_name: item.product_name,
          quantity: item.quantity,
          price_sell: item.price_sell,
          subtotal: item.subtotal
        }))
      };

      renderReceipt(activeTransactionReceipt);
      document.getElementById('receiptPreviewModal').classList.remove('hidden');
    }
  } catch (error) {
    console.error('Gagal memuat ulang struk:', error);
  }
}

async function fetchStockReport() {
  try {
    const response = await fetch(appendOwnerParam(`${API_URL}/api/reports/products`));
    if (response.ok) {
      const data = await response.json();
      
      // Update Metrics
      document.getElementById('stockTotalSKUs').innerText = `${data.total_skus} Jenis`;
      document.getElementById('stockTotalItems').innerText = `${data.total_items} Unit`;
      document.getElementById('stockAssetBuyVal').innerText = `Rp ${formatRupiah(data.asset_value_cost)}`;
      document.getElementById('stockAssetSellVal').innerText = `Rp ${formatRupiah(data.asset_value_retail)}`;

      // Render Peringatan Stok Kritis
      const alertBox = document.getElementById('criticalStockAlertBox');
      const alertList = document.getElementById('criticalStockList');
      
      if (data.low_stock_products.length > 0) {
        alertList.innerHTML = data.low_stock_products.map(p => `
          <li>Produk <strong>"${p.name}"</strong> (Barcode: ${p.barcode ? p.barcode : '-'}) sisa <strong>${p.stock}</strong> unit.</li>
        `).join('');
        alertBox.classList.remove('hidden');
      } else {
        alertBox.classList.add('hidden');
      }

      // Render Tabel Inventaris
      const body = document.getElementById('stockInventoryBody');
      if (data.products.length === 0) {
        body.innerHTML = `<tr><td colspan="9" class="text-center text-muted">Katalog barang kosong</td></tr>`;
      } else {
        let totalStock = 0;
        let totalAssetCost = 0;
        let totalAssetRetail = 0;
        
        const rowsHtml = data.products.map((p, index) => {
          totalStock += p.stock;
          totalAssetCost += p.asset_value_buy || 0;
          totalAssetRetail += p.asset_value_sell || 0;
          
          const catClass = getCategoryBadgeClass(p.category);
          const isService = p.is_service == 1;
          
          return `
            <tr>
              <td class="text-center">${index + 1}</td>
              <td class="font-mono text-xs">${p.barcode ? p.barcode : '-'}</td>
              <td class="font-bold">${p.name}${isService ? ' <span style="font-size:0.7rem;color:#8b5cf6;">(Jasa)</span>' : ''}</td>
              <td><span class="badge ${catClass}">${p.category ? p.category : 'Lainnya'}</span></td>
              <td class="text-right font-mono text-muted">Rp ${formatRupiah(p.price_buy)}</td>
              <td class="text-right font-mono">Rp ${formatRupiah(p.price_sell)}</td>
              <td class="text-center font-bold ${isService ? '' : (p.stock < 5 ? 'text-danger' : '')}">${isService ? '-' : p.stock}</td>
              <td class="text-right font-mono text-muted">Rp ${formatRupiah(p.asset_value_buy)}</td>
              <td class="text-right font-mono font-bold text-success">Rp ${formatRupiah(p.asset_value_sell)}</td>
            </tr>
          `;
        }).join('');

        body.innerHTML = rowsHtml + `
          <tr style="background-color: var(--color-primary-glow); font-weight: bold; border-top: 2px solid var(--color-primary);">
            <td colspan="6">TOTAL</td>
            <td class="text-center font-bold">${totalStock}</td>
            <td class="text-right font-mono font-bold">Rp ${formatRupiah(totalAssetCost)}</td>
            <td class="text-right font-mono font-bold text-success">Rp ${formatRupiah(totalAssetRetail)}</td>
          </tr>
        `;
      }
    }
  } catch (error) {
    console.error('Gagal mengambil laporan stok:', error);
  }
}

// 3. LAPORAN KEUANGAN
function setFinanceQuickDate(range, btn) {
  // Update UI active button
  const filterCard = btn.closest('.finance-filter-card');
  filterCard.querySelectorAll('.quick-dates button').forEach(el => el.classList.remove('active'));
  btn.classList.add('active');

  const startInput = document.getElementById('financeStartDate');
  const endInput = document.getElementById('financeEndDate');
  
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;

  if (range === 'today') {
    startInput.value = fmt(now);
    endInput.value = fmt(now);
  } else if (range === 'yesterday') {
    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    startInput.value = fmt(yesterday);
    endInput.value = fmt(yesterday);
  } else if (range === 'last7days') {
    const start = new Date();
    start.setDate(now.getDate() - 7);
    startInput.value = fmt(start);
    endInput.value = fmt(now);
  } else if (range === 'thismonth') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    startInput.value = fmt(start);
    endInput.value = fmt(now);
  }

  fetchFinancialReport();
}

async function fetchFinancialReport() {
  const startDate = document.getElementById('financeStartDate').value;
  const endDate = document.getElementById('financeEndDate').value;

  if (!startDate || !endDate) {
    showToast('Pilih rentang tanggal terlebih dahulu', 'warning');
    return;
  }

  try {
    const response = await fetch(appendOwnerParam(`${API_URL}/api/reports/finance?startDate=${startDate}&endDate=${endDate}`));
    if (response.ok) {
      const data = await response.json();

      // Metrics
      document.getElementById('financeRevenueVal').innerText = `Rp ${formatRupiah(data.summary.revenue)}`;
      document.getElementById('financeHppVal').innerText = `Rp ${formatRupiah(data.summary.hpp)}`;
      document.getElementById('financeProfitVal').innerText = `Rp ${formatRupiah(data.summary.profit)}`;
      document.getElementById('financeExpensesVal').innerText = `Rp ${formatRupiah(data.summary.expenses || 0)}`;
      document.getElementById('financeNetProfitVal').innerText = `Rp ${formatRupiah(data.summary.net_profit || 0)}`;

      // Render Laporan Harian
      const dailyBody = document.getElementById('financeDailyBody');
      if (data.daily.length === 0) {
        dailyBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted text-xs">Tidak ada data transaksi pada rentang tanggal ini</td></tr>`;
      } else {
        let totalDailyTrans = 0;
        let totalDailyRevenue = 0;
        let totalDailyHpp = 0;
        let totalDailyProfit = 0;

        const rowsHtml = data.daily.map(row => {
          totalDailyTrans += row.trans_count;
          totalDailyRevenue += row.revenue;
          totalDailyHpp += row.hpp;
          totalDailyProfit += row.profit;

          return `
            <tr>
              <td class="font-bold">${formatDisplayDate(row.trans_date)}</td>
              <td class="text-center">${row.trans_count} Transaksi</td>
              <td class="text-right font-mono text-primary">Rp ${formatRupiah(row.revenue)}</td>
              <td class="text-right font-mono text-muted">Rp ${formatRupiah(row.hpp)}</td>
              <td class="text-right font-mono font-bold text-success">Rp ${formatRupiah(row.profit)}</td>
            </tr>
          `;
        }).join('');

        dailyBody.innerHTML = rowsHtml + `
          <tr style="background-color: var(--color-primary-glow); font-weight: bold; border-top: 2px solid var(--color-primary);">
            <td>TOTAL</td>
            <td class="text-center font-bold">${totalDailyTrans} Transaksi</td>
            <td class="text-right font-mono text-primary font-bold">Rp ${formatRupiah(totalDailyRevenue)}</td>
            <td class="text-right font-mono text-muted font-bold">Rp ${formatRupiah(totalDailyHpp)}</td>
            <td class="text-right font-mono font-bold text-success">Rp ${formatRupiah(totalDailyProfit)}</td>
          </tr>
        `;
      }

      // Render Breakdown Pembayaran
      const payBody = document.getElementById('financePaymentBody');
      if (data.payment_breakdown.length === 0) {
        payBody.innerHTML = `<tr><td colspan="3" class="text-center text-muted text-xs">Kosong</td></tr>`;
      } else {
        let totalPayCount = 0;
        let totalPayAmount = 0;

        const rowsHtml = data.payment_breakdown.map(p => {
          totalPayCount += p.count;
          totalPayAmount += p.amount;

          return `
            <tr>
              <td class="font-bold">${p.payment_method}</td>
              <td class="text-center text-muted">${p.count} x</td>
              <td class="text-right font-mono font-bold">Rp ${formatRupiah(p.amount)}</td>
            </tr>
          `;
        }).join('');

        payBody.innerHTML = rowsHtml + `
          <tr style="background-color: var(--color-primary-glow); font-weight: bold; border-top: 2px solid var(--color-primary);">
            <td>TOTAL</td>
            <td class="text-center font-bold">${totalPayCount} x</td>
            <td class="text-right font-mono font-bold">Rp ${formatRupiah(totalPayAmount)}</td>
          </tr>
        `;
      }

      // Render Breakdown Kasir
      const cashierBody = document.getElementById('financeCashierBody');
      if (data.cashier_breakdown.length === 0) {
        cashierBody.innerHTML = `<tr><td colspan="3" class="text-center text-muted text-xs">Kosong</td></tr>`;
      } else {
        let totalCashierCount = 0;
        let totalCashierAmount = 0;

        const rowsHtml = data.cashier_breakdown.map(c => {
          totalCashierCount += c.count;
          totalCashierAmount += c.amount;

          return `
            <tr>
              <td class="font-bold">${c.cashier_name}</td>
              <td class="text-center text-muted">${c.count} x</td>
              <td class="text-right font-mono font-bold">Rp ${formatRupiah(c.amount)}</td>
            </tr>
          `;
        }).join('');

        cashierBody.innerHTML = rowsHtml + `
          <tr style="background-color: var(--color-primary-glow); font-weight: bold; border-top: 2px solid var(--color-primary);">
            <td>TOTAL</td>
            <td class="text-center font-bold">${totalCashierCount} x</td>
            <td class="text-right font-mono font-bold">Rp ${formatRupiah(totalCashierAmount)}</td>
          </tr>
        `;
      }

      // Render Grafik & Pengeluaran
      renderFinancialCharts(data);
      fetchExpenses();
    }
  } catch (error) {
    console.error('Gagal mengambil laporan keuangan:', error);
  }
}

// Print Reports in A4 layout
function printReport(type) {
  // Bersihkan kelas cetak laporan sebelumnya
  document.body.classList.remove('print-today-items', 'print-today-transactions', 'print-inventory', 'print-finance-summary');
  
  // Tambah kelas khusus print ke body
  document.body.classList.add('printing-report', `print-${type}`);
  
  window.print();
  
  // Normal kembali
  setTimeout(() => {
    document.body.classList.remove('printing-report', `print-${type}`);
  }, 500);
}

// ==================== CADANGAN DATABASE (BACKUP / RESTORE) ====================

async function exportDatabase() {
  try {
    const response = await fetch(`${API_URL}/api/data/export`);
    if (response.ok) {
      const data = await response.json();
      
      // Buat file JSON download
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data));
      const downloadAnchor = document.createElement('a');
      
      const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
      const filename = `kasirku_backup_${dateStr}.json`;
      
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", filename);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      showToast('Pencadangan berhasil! File JSON terunduh.', 'success');
    }
  } catch (error) {
    console.error('Ekspor database gagal:', error);
    showToast('Koneksi backend gagal. Backup dibatalkan.', 'danger');
  }
}

function triggerImportFileInput() {
  document.getElementById('importFileInput').click();
}

async function importDatabase(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.products || !data.transactions || !data.transaction_items) {
        showToast('File JSON tidak valid. Format backup salah.', 'danger');
        return;
      }

      if (confirm('PERINGATAN: Memulihkan data akan menghapus semua database barang dan transaksi saat ini! Apakah Anda yakin?')) {
        const response = await fetch(`${API_URL}/api/data/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        if (response.ok) {
          showToast('Data berhasil dipulihkan secara penuh!', 'success');
          // Reload
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        } else {
          const res = await response.json();
          showToast(res.error || 'Gagal memulihkan database', 'danger');
        }
      }
    } catch (err) {
      showToast('Gagal membaca file JSON backup.', 'danger');
    }
  };
  reader.readAsText(file);
}

async function clearDatabase(mode) {
  const confirmMsg = mode === 'all' 
    ? 'PERINGATAN KRITIS: Anda akan menghapus SELURUH database (semua produk dan riwayat penjualan)! Data tidak dapat dikembalikan.\n\nKetik kata sandi "KOSONGKAN" untuk melanjutkan:'
    : 'PERINGATAN: Anda akan menghapus SELURUH riwayat transaksi penjualan! Katalog produk tetap disimpan.\n\nKetik kata sandi "KOSONGKAN" untuk melanjutkan:';

  const userConfirm = prompt(confirmMsg);
  if (userConfirm === 'KOSONGKAN') {
    try {
      const response = await fetch(`${API_URL}/api/data/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: mode })
      });

      const resData = await response.json();

      if (response.ok) {
        showToast(resData.message, 'success');
        playDingSound();
        
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        showToast(resData.error || 'Gagal mengosongkan database', 'danger');
      }
    } catch (error) {
      console.error('Pengosongan database gagal:', error);
      showToast('Koneksi server gagal', 'danger');
    }
  } else if (userConfirm !== null) {
    showToast('Konfirmasi salah. Database batal dikosongkan.', 'warning');
  }
}
