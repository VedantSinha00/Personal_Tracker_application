/**
 * toast.js
 * A lightweight notification system for the Weekly Tracker.
 */

const toastContainer = document.createElement('div');
toastContainer.id = 'toastContainer';
document.body.appendChild(toastContainer);

/**
 * Shows a toast notification.
 * @param {string} msg - The message to display.
 * @param {string} type - 'info' | 'warning' | 'error' | 'success'
 * @param {number} duration - ms before fading out
 */
export function showToast(msg, type = 'info', duration = 3000) {
  const toast = document.createElement('div');
  toast.className = `wt-toast toast-${type}`;
  
  // Icon based on type
  let icon = 'info';
  if (type === 'warning') icon = 'alert-triangle';
  if (type === 'error') icon = 'x-circle';
  if (type === 'success') icon = 'check-circle';

  toast.innerHTML = `
    <i data-lucide="${icon}" style="width:16px;height:16px;"></i>
    <span>${msg}</span>
  `;

  toastContainer.appendChild(toast);

  // Trigger Lucide icons if available
  if (window.lucide) window.lucide.createIcons({ root: toast });

  // Slide in
  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });

  // Auto-remove
  setTimeout(() => {
    toast.classList.remove('visible');
    toast.addEventListener('transitionend', () => {
      toast.remove();
    }, { once: true });
  }, duration);
}

// Make it available globally if needed for non-module scripts
window.showToast = showToast;
