/**
 * Kasirku POS - Toast Notification Module
 */

function showToast(message, type = 'primary') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const iconName = {
    primary: 'info',
    success: 'check-circle',
    danger: 'x-circle',
    warning: 'alert-triangle'
  }[type];

  toast.innerHTML = `
    <i data-lucide="${iconName}" class="toast-icon"></i>
    <div class="toast-message">${message}</div>
  `;
  
  container.appendChild(toast);
  lucide.createIcons(); // render icon
  
  // Hilang setelah 3.5 detik
  setTimeout(() => {
    toast.style.transform = 'translateX(120%)';
    toast.style.opacity = '0';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3500);
}
