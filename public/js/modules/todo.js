/**
 * 任务列表模块
 */

window.renderTodoList = function(todos) {
  if (!todos || !todos.length) return;

  let panel = document.querySelector('.todo-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'todo-panel';
    window.$('messages').appendChild(panel);
  }

  panel.innerHTML = '<div class="todo-header">📋 任务进度</div>' +
    '<div class="todo-list">' +
    todos.map(function(t, i) {
      const status = {
        'pending': '⏳',
        'in_progress': '🔄',
        'completed': '✅',
        'failed': '❌'
      }[t.status] || '⏳';
      return '<div class="todo-item ' + t.status + '">' +
        '<span class="todo-status">' + status + '</span>' +
        '<span class="todo-text">' + window.escapeHtml(t.task) + '</span>' +
        '</div>';
    }).join('') +
    '</div>';

  window.scrollToBottom();

  // 全部完成时延迟隐藏
  const allDone = todos.every(function(t) { return t.status === 'completed' || t.status === 'failed'; });
  if (allDone) {
    setTimeout(function() { panel.remove(); }, 3000);
  }
};