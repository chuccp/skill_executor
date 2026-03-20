/**
 * 任务列表模块 - 显示在消息区域
 */

window.renderTodoList = function(todos) {
  if (!todos || !todos.length) return;

  // 获取或创建任务容器
  var container = getTodoContainer();
  
  // 只显示当前进行中的任务和最近完成的任务
  var inProgress = todos.filter(function(t) { return t.status === 'in_progress'; });
  var completed = todos.filter(function(t) { return t.status === 'completed'; }).slice(-3);
  var failed = todos.filter(function(t) { return t.status === 'failed'; });
  
  var displayTodos = inProgress.concat(failed).concat(completed);
  
  if (displayTodos.length === 0) return;
  
  // 检查是否全部完成
  var allDone = todos.every(function(t) { return t.status === 'completed' || t.status === 'failed'; });
  
  // 生成 HTML
  var html = '<div class="todo-header">📋 执行进度</div><div class="todo-list">';
  
  displayTodos.forEach(function(t) {
    var icon, cls;
    switch (t.status) {
      case 'in_progress':
        icon = '🔄';
        cls = 'running';
        break;
      case 'completed':
        icon = '✅';
        cls = 'done';
        break;
      case 'failed':
        icon = '❌';
        cls = 'failed';
        break;
      default:
        icon = '⏳';
        cls = 'pending';
    }
    
    html += '<div class="todo-item ' + cls + '">' +
      '<span class="todo-icon">' + icon + '</span>' +
      '<span class="todo-text">' + window.escapeHtml(t.task) + '</span>' +
      '</div>';
  });
  
  html += '</div>';
  
  container.innerHTML = html;
  container.style.display = 'block';
  
  window.scrollToBottom();
  
  // 全部完成时延迟隐藏
  if (allDone) {
    setTimeout(function() {
      container.style.opacity = '0.6';
    }, 2000);
    setTimeout(function() {
      container.style.display = 'none';
      container.style.opacity = '1';
    }, 5000);
  }
};

// 获取或创建任务容器
function getTodoContainer() {
  var container = window.$('todo-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'todo-container';
    container.className = 'todo-message';
    
    // 插入到消息区域的底部（输入框之前）
    var messages = window.$('messages');
    if (messages) {
      messages.appendChild(container);
    }
  }
  return container;
}

// 清除任务面板
window.clearTodoPanel = function() {
  var container = window.$('todo-container');
  if (container) {
    container.style.display = 'none';
  }
};