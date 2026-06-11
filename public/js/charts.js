// ==================== VISUAL CHARTS (CHART.JS) ====================

function renderFinancialCharts(data) {
  const trendCtx = document.getElementById('financeTrendChart');
  const pieCtx = document.getElementById('categoryPieChart');

  if (!trendCtx || !pieCtx) return;

  // Hancurkan chart lama jika ada
  if (trendChartInstance) trendChartInstance.destroy();
  if (pieChartInstance) pieChartInstance.destroy();

  // Dapatkan warna-warna theme dinamis dari CSS
  const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#6366f1';
  const successColor = getComputedStyle(document.documentElement).getPropertyValue('--color-success').trim() || '#10b981';
  const textMain = getComputedStyle(document.documentElement).getPropertyValue('--text-main').trim() || '#1f2937';
  const borderColor = getComputedStyle(document.documentElement).getPropertyValue('--border-color').trim() || '#e5e7eb';

  // 1. Render Trend Chart (Line Chart)
  const dailyData = data.daily || [];
  const labels = dailyData.map(d => formatDisplayDate(d.trans_date));
  const revenueData = dailyData.map(d => d.revenue);
  const profitData = dailyData.map(d => d.profit);

  trendChartInstance = new Chart(trendCtx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Omset Pendapatan',
          data: revenueData,
          borderColor: primaryColor,
          backgroundColor: primaryColor + '20', // Opacity 12%
          tension: 0.3,
          fill: true,
          borderWidth: 2
        },
        {
          label: 'Laba Kotor',
          data: profitData,
          borderColor: successColor,
          backgroundColor: successColor + '20',
          tension: 0.3,
          fill: true,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: textMain, font: { family: 'Inter', size: 11, weight: '500' } }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              return `${context.dataset.label}: Rp ${formatRupiah(context.raw)}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: borderColor },
          ticks: { color: textMain, font: { size: 10 } }
        },
        y: {
          grid: { color: borderColor },
          ticks: {
            color: textMain,
            font: { size: 10 },
            callback: function(value) {
              return 'Rp ' + formatRupiah(value);
            }
          }
        }
      }
    }
  });

  // 2. Render Category Pie Chart (Doughnut Chart)
  const categoryData = data.category_breakdown || [];
  const pieLabels = categoryData.map(c => c.category);
  const pieValues = categoryData.map(c => c.amount);

  // Palet warna yang harmonis untuk kategori terlaris
  const categoryColors = [
    '#6366f1', // Indigo
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#ec4899', // Pink
    '#06b6d4', // Cyan
    '#8b5cf6', // Violet
    '#ef4444', // Red
    '#3b82f6', // Blue
    '#6b7280'  // Gray
  ];

  pieChartInstance = new Chart(pieCtx, {
    type: 'doughnut',
    data: {
      labels: pieLabels,
      datasets: [{
        data: pieValues,
        backgroundColor: categoryColors.slice(0, pieLabels.length),
        borderWidth: 1,
        borderColor: borderColor
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: textMain, font: { family: 'Inter', size: 10, weight: '500' } }
        },
        tooltip: {
          callbacks: {
            label: function(context) {
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percentage = total > 0 ? Math.round((context.raw / total) * 100) : 0;
              return `${context.label}: Rp ${formatRupiah(context.raw)} (${percentage}%)`;
            }
          }
        }
      }
    }
  });
}
