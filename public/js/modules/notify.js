/**
 * 通知模块
 */

let notificationTimeout = null;

window.showInfo = function(msg) {
  showNotification(msg, 'info');
};

window.showError = function(msg) {
  showNotification(msg, 'error');
};

function showNotification(msg, type) {
  const existing = document.querySelector('.notification');
  if (existing) existing.remove();

  const div = document.createElement('div');
  div.className = 'notification ' + type;
  div.textContent = msg;
  document.body.appendChild(div);

  if (notificationTimeout) clearTimeout(notificationTimeout);
  notificationTimeout = setTimeout(() => div.remove(), 3000);
}