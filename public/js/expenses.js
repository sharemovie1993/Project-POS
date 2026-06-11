async function fetchExpenses() {
  const startDate = document.getElementById('financeStartDate').value;
  const endDate = document.getElementById('financeEndDate').value;
  
  if (!startDate || !endDate) return;

  try {
    const response = await fetch(appendOwnerParam(`${API_URL}/api/expenses?startDate=${startDate}&endDate=${endDate}`));
    if (response.ok) {
      const expenses = await response.json();
      
      // Render Expense Table Rows
      const body = document.getElementById('financeExpensesBody');
      if (expenses.length === 0) {
        body.innerHTML = `<tr><td colspan="5" class="text-center text-muted text-xs py-4">Tidak ada beban pengeluaran pada rentang tanggal ini</td></tr>`;
      } else {
        body.innerHTML = expenses.map(e => `
          <tr>
            <td>${formatDisplayDate(e.expense_date)}</td>
            <td><span class="badge" style="background-color: rgba(239, 68, 68, 0.1); color: var(--color-danger); border: 1px solid rgba(239, 68, 68, 0.2);">${e.category}</span></td>
            <td class="font-bold text-xs">${e.description}</td>
            <td class="text-right font-mono font-bold text-danger">Rp ${formatRupiah(e.amount)}</td>
            <td class="text-center">
              <button class="btn btn-secondary btn-icon-only btn-xs text-danger" type="button" onclick="deleteExpense(${e.id})">
                <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i>
              </button>
            </td>
          </tr>
        `).join('');
      }

      // Calculate category expenses summary
      const categoryTotals = {};
      expenses.forEach(e => {
        categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
      });

      const catBody = document.getElementById('financeExpensesCategoryBody');
      const categories = Object.keys(categoryTotals);
      if (categories.length === 0) {
        catBody.innerHTML = `<tr><td colspan="2" class="text-center text-muted text-xs py-3">Kosong</td></tr>`;
      } else {
        let grandTotal = 0;
        const rowsHtml = categories.map(cat => {
          grandTotal += categoryTotals[cat];
          return `
            <tr>
              <td class="font-semibold text-xs">${cat}</td>
              <td class="text-right font-mono text-danger">Rp ${formatRupiah(categoryTotals[cat])}</td>
            </tr>
          `;
        }).join('');

        catBody.innerHTML = rowsHtml + `
          <tr style="background-color: rgba(239, 68, 68, 0.05); font-weight: bold; border-top: 1px solid var(--color-danger);">
            <td class="text-xs">TOTAL BEBAN</td>
            <td class="text-right font-mono text-danger">Rp ${formatRupiah(grandTotal)}</td>
          </tr>
        `;
      }

      lucide.createIcons();
    }
  } catch (error) {
    console.error('Gagal mengambil pengeluaran:', error);
  }
}

function getLocalTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function openExpenseModal() {
  document.getElementById('expenseForm').reset();
  document.getElementById('expenseDate').value = getLocalTodayDate();
  
  // Populate owners options
  const select = document.getElementById('expenseOwner');
  select.innerHTML = dbOwners.map(o => `<option value="${o.name}">${o.name}</option>`).join('');
  
  // Sembunyikan field owner jika kasir masuk atau owner-admin masuk (otomatis di-set oleh backend)
  const isSuper = currentUser && currentUser.role === 'admin' && (!currentUser.owner || currentUser.owner === 'All');
  const ownerFormGroup = document.getElementById('expenseOwnerFormGroup');
  if (isSuper) {
    ownerFormGroup.classList.remove('hidden');
  } else {
    ownerFormGroup.classList.add('hidden');
    select.value = currentUser.owner || 'Organisasi';
  }

  document.getElementById('expenseModal').classList.remove('hidden');
}

function closeExpenseModal() {
  document.getElementById('expenseModal').classList.add('hidden');
}

async function saveExpense(e) {
  e.preventDefault();
  const date = document.getElementById('expenseDate').value;
  const category = document.getElementById('expenseCategory').value;
  const description = document.getElementById('expenseDescription').value.trim();
  const amount = parseFloat(document.getElementById('expenseAmount').value) || 0;
  const owner = document.getElementById('expenseOwner').value;

  try {
    const response = await fetch(`${API_URL}/api/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, amount, category, expense_date: date, owner })
    });

    const data = await response.json();
    if (response.ok) {
      showToast('Beban pengeluaran berhasil disimpan', 'success');
      closeExpenseModal();
      await fetchFinancialReport();
      await checkActiveShift(); // Reload shift expected cash in case it was a cash expense
    } else {
      showToast(data.error || 'Gagal menyimpan pengeluaran', 'danger');
    }
  } catch (error) {
    console.error('Gagal menyimpan pengeluaran:', error);
    showToast('Koneksi server gagal', 'danger');
  }
}

async function deleteExpense(id) {
  if (confirm('Apakah Anda yakin ingin menghapus beban pengeluaran ini?')) {
    try {
      const response = await fetch(`${API_URL}/api/expenses/${id}`, { method: 'DELETE' });
      if (response.ok) {
        showToast('Pengeluaran berhasil dihapus', 'success');
        await fetchFinancialReport();
        await checkActiveShift();
      } else {
        const data = await response.json();
        showToast(data.error || 'Gagal menghapus pengeluaran', 'danger');
      }
    } catch (error) {
      console.error('Gagal menghapus pengeluaran:', error);
      showToast('Koneksi server gagal', 'danger');
    }
  }
}
