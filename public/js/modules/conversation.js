/**
 * 会话列表渲染模块
 */

window.renderConversationList = function() {
  const MAX_VISIBLE = 3;
  const visibleConversations = window.state.conversations.slice(0, MAX_VISIBLE);
  const hasMore = window.state.conversations.length > MAX_VISIBLE;

  let html = visibleConversations.map(function(c) {
    const date = new Date(c.updatedAt || c.createdAt);
    const timeStr = window.formatTime(date);
    const preview = c.firstUserMessage || c.summary || '新会话';

    return '<li data-id="' + c.id + '" class="' + (c.id === window.state.currentConversationId ? 'active' : '') + '">' +
      '<div class="conv-info">' +
      '<span class="conv-time">' + timeStr + '</span>' +
      '<span class="conv-preview">' + window.escapeHtml(preview.substring(0, 30)) + '</span>' +
      '</div>' +
      '<button class="conv-delete" data-id="' + c.id + '" title="删除">×</button>' +
      '</li>';
  }).join('');

  if (hasMore) {
    html += '<li class="conv-more" data-action="more">' +
      '<span class="conv-more-text">更多 (' + (window.state.conversations.length - MAX_VISIBLE) + ')</span>' +
      '</li>';
  }

  window.$('conversation-list').innerHTML = html;
};

// 会话模态框
window.showConversationModal = function() {
  const modal = window.$('conversation-modal');
  if (modal) {
    modal.classList.add('active');
    window.renderConversationModalList();
  }
};

window.hideConversationModal = function() {
  const modal = window.$('conversation-modal');
  if (modal) modal.classList.remove('active');
};

window.renderConversationModalList = function() {
  const list = window.$('conversation-modal-list');
  if (!list) return;

  list.innerHTML = window.state.conversations.map(function(c) {
    const date = new Date(c.updatedAt || c.createdAt);
    const timeStr = window.formatTime(date);
    const preview = c.firstUserMessage || c.summary || '新会话';

    return '<div class="conv-modal-item" data-id="' + c.id + '">' +
      '<div class="conv-modal-info">' +
      '<span class="conv-modal-time">' + timeStr + '</span>' +
      '<span class="conv-modal-preview">' + window.escapeHtml(preview.substring(0, 50)) + '</span>' +
      '</div>' +
      '<button class="conv-modal-delete" data-id="' + c.id + '" title="删除">×</button>' +
      '</div>';
  }).join('');
};