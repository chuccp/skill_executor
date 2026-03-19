/**
 * 工作目录模块
 */

window.renderWorkdirList = function() {
  const listEl = window.$('workdir-list');
  if (!listEl) return;
  const items = window.state.workdir.items || [];
  if (!items.length) {
    listEl.innerHTML = '<div class="workdir-empty">目录为空</div>';
    return;
  }

  const dirs = items.filter(function(i) { return i.type === 'directory'; });
  const files = items.filter(function(i) { return i.type !== 'directory' && !window.isBinaryFile(i.name); });
  const sorted = dirs.concat(files);

  listEl.innerHTML = sorted.map(function(item) {
    const isDir = item.type === 'directory';
    const icon = isDir ? '📁' : '📄';
    return '<button class="workdir-item ' + (isDir ? 'dir' : 'file') + '" data-name="' + encodeURIComponent(item.name) + '">' +
      '<span class="workdir-icon">' + icon + '</span>' +
      '<span class="workdir-name">' + window.escapeHtml(item.name) + '</span>' +
      '</button>';
  }).join('');

  listEl.querySelectorAll('.workdir-item.dir').forEach(function(btn) {
    btn.onclick = function() {
      const next = window.joinPath(window.state.workdir.path, decodeURIComponent(btn.dataset.name));
      window.setWorkdir(next);
    };
  });

  listEl.querySelectorAll('.workdir-item.file').forEach(function(btn) {
    btn.onclick = function() {
      const filePath = window.joinPath(window.state.workdir.path, decodeURIComponent(btn.dataset.name));
      window.appendMessage('user', '请读取文件: ' + filePath);
      window.$('user-input').value = filePath;
    };
  });
};