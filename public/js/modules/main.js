/**
 * 主入口文件
 * 负责初始化应用
 */

async function init() {
  window.connectWebSocket();
  await window.loadPresets();
  await window.loadConversations();
  await window.loadSkills();
  await window.loadWorkdir();

  // 尝试恢复上次会话
  const lastConversationId = localStorage.getItem('lastConversationId');
  if (lastConversationId) {
    const exists = window.state.conversations.find(function(c) { return c.id === lastConversationId; });
    if (exists) {
      window.selectConversation(lastConversationId);
    } else if (window.state.conversations.length > 0) {
      window.selectConversation(window.state.conversations[0].id);
    } else {
      await window.createConversation();
    }
  } else if (window.state.conversations.length > 0) {
    window.selectConversation(window.state.conversations[0].id);
  } else {
    await window.createConversation();
  }

  window.setupEventListeners();
  window.setupModalDrag();
}

// 启动应用
init();