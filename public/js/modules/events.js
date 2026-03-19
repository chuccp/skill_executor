/**
 * 事件监听模块
 */

window.setupEventListeners = function() {
  // 发送消息
  window.$('send-btn').onclick = window.sendMessage;

  // 回车发送
  window.$('user-input').onkeydown = function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      window.sendMessage();
    }
  };

  // 模型选择
  window.$('preset-select').onchange = function(e) {
    localStorage.setItem('selectedModel', e.target.value);
    if (window.updateContextBar) window.updateContextBar();
  };

  // 技能选择
  window.$('skill-select').onchange = function() {
    if (window.updateContextBar) window.updateContextBar();
  };

  // 新建会话
  window.$('new-conversation-btn').onclick = window.createConversation;

  // 会话列表点击
  window.$('conversation-list').onclick = function(e) {
    const li = e.target.closest('li');
    if (!li) return;

    if (li.dataset.action === 'more') {
      window.showConversationModal();
      return;
    }

    if (e.target.classList.contains('conv-delete')) {
      window.deleteConversation(e.target.dataset.id);
      return;
    }

    window.selectConversation(li.dataset.id);
  };

  // 会话模态框
  const modal = window.$('conversation-modal');
  if (modal) {
    modal.querySelector('.modal-close').onclick = window.hideConversationModal;
    modal.onclick = function(e) {
      if (e.target === modal) window.hideConversationModal();
    };

    window.$('conversation-modal-list').onclick = function(e) {
      const item = e.target.closest('.conv-modal-item');
      if (!item) return;

      if (e.target.classList.contains('conv-modal-delete')) {
        window.deleteConversation(e.target.dataset.id);
        return;
      }

      window.selectConversation(item.dataset.id, true);
      window.hideConversationModal();
    };
  }

  // 工作目录导航
  window.$('workdir-up').onclick = function() {
    const parent = window.getParentPath(window.state.workdir.path);
    if (parent) window.setWorkdir(parent);
  };

  window.$('workdir-refresh').onclick = function() {
    window.loadWorkdirList(window.state.workdir.path);
  };

  window.$('workdir-set').onclick = function() {
    const path = window.$('workdir-input').value.trim();
    if (path) window.setWorkdir(path);
  };

  window.$('workdir-input').onkeydown = function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const path = e.target.value.trim();
      if (path) window.setWorkdir(path);
    }
  };

  // 技能刷新
  window.$('skill-refresh').onclick = window.refreshSkills;

  // 预设创建
  const presetCreateBtn = window.$('preset-create-btn');
  if (presetCreateBtn) {
    presetCreateBtn.onclick = window.createPreset;
  }

  // 文件拖放
  window.$('user-input').ondragover = function(e) { e.preventDefault(); };
  window.$('user-input').ondrop = async function(e) {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const content = await window.readFileAsText(file);
      window.$('user-input').value = '文件 ' + file.name + ' 的内容：\n\n' + content;
    }
  };

  // Tauri 窗口控制
  if (window.__TAURI__) {
    const appWindow = window.__TAURI__.window.appWindow;
    const minimizeBtn = window.$('titlebar-minimize');
    const maximizeBtn = window.$('titlebar-maximize');
    const closeBtn = window.$('titlebar-close');

    if (minimizeBtn) minimizeBtn.addEventListener('click', function() { appWindow.minimize(); });
    if (maximizeBtn) maximizeBtn.addEventListener('click', function() { appWindow.toggleMaximize(); });
    if (closeBtn) closeBtn.addEventListener('click', function() { appWindow.close(); });
  }
};
