/**
 * 工具函数
 */

window.$ = id => document.getElementById(id);

window.escapeHtml = function(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

window.formatTime = function(date) {
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';

  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
};

window.formatBytes = function(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

window.joinPath = function(basePath, name) {
  if (!basePath) return name;
  const sep = basePath.includes('\\') ? '\\' : '/';
  if (basePath.endsWith(sep)) return basePath + name;
  return basePath + sep + name;
};

window.getParentPath = function(p) {
  if (!p) return '';
  let path = p.replace(/[\\/]+$/, '');
  const sep = path.includes('\\') ? '\\' : '/';
  if (sep === '\\' && /^[A-Za-z]:$/.test(path)) return path + '\\';
  const idx = path.lastIndexOf(sep);
  if (idx <= 0) return path;
  return path.slice(0, idx);
};

window.scrollToBottom = function() {
  const container = window.$('messages');
  if (container) {
    // 使用 smooth 滚动，更平滑
    container.scrollTo({
      top: container.scrollHeight,
      behavior: 'smooth'
    });
  }
};

window.debounce = function(fn, delay) {
  let timer = null;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
};

// 常见二进制文件扩展名
window.BINARY_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.bmp', '.tiff', '.tif', '.heic', '.heif',
  '.mp3', '.mp4', '.wav', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4a', '.ogg',
  '.exe', '.dll', '.so', '.dylib', '.app', '.dmg', '.deb', '.rpm',
  '.zip', '.tar', '.gz', '.rar', '.7z', '.bz2', '.xz',
  '.db', '.sqlite', '.sqlite3',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  '.bin', '.dat', '.iso', '.img', '.class', '.jar', '.war', '.pyc', '.pyo'
];

window.isBinaryFile = function(filename) {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  return window.BINARY_EXTENSIONS.includes(ext);
};