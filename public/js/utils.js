/**
 * Kasirku POS - Helpers & Formatting Utilities Module
 */

// Helper to append owner parameter for multi-tenant / multi-owner filtering
function appendOwnerParam(url) {
  if (currentUser && currentUser.owner && currentUser.owner !== 'All' && currentUser.owner !== 'undefined') {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}owner=${encodeURIComponent(currentUser.owner)}`;
  }
  return url;
}

function formatRupiah(number) {
  return new Intl.NumberFormat('id-ID').format(Math.round(number));
}

function formatDisplayDate(dateStr) {
  const d = new Date(dateStr);
  const pad = (n) => String(n).padStart(2, '0');
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return `${pad(d.getDate())} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function getCategoryBadgeClass(category) {
  if (!category) return 'badge-default';
  const c = category.toLowerCase();
  if (c.includes('makan')) return 'badge-makanan';
  if (c.includes('minum')) return 'badge-minuman';
  if (c.includes('harian') || c.includes('sabun') || c.includes('kebutuhan')) return 'badge-harian';
  if (c.includes('tulis') || c.includes('alat')) return 'badge-tulis';
  return 'badge-default';
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getLocalTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
