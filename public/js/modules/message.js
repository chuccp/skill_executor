/**
 * 消息渲染模块
 */

window.renderMessages = function(messages) {
  let hasSummary = false;
  const processedMessages = [];

  for (const m of messages) {
    const content = typeof m.content === 'string' ? m.content : '';

    if (content.startsWith('[工具结果]')) continue;

    if (content.startsWith('[历史对话摘要]')) {
      if (!hasSummary) {
        hasSummary = true;
        processedMessages.push({
          role: 'system',
          content: '📋 已加载之前的对话记录'
        });
      }
      continue;
    }

    processedMessages.push(m);
  }

  window.$('messages').innerHTML = processedMessages.map(m => {
    if (m.role === 'system') {
      return '<div class="message system"><div class="content">' + window.escapeHtml(m.content) + '</div></div>';
    }
    return '<div class="message ' + m.role + '">' +
      '<div class="role">' + (m.role === 'user' ? '你' : 'AI') + '</div>' +
      '<div class="content">' + formatContent(m.content) + '</div></div>';
  }).join('');
  window.scrollToBottom();
};

function formatContent(content) {
  if (content.startsWith('[历史对话摘要]') || content.startsWith('[工具结果]')) {
    return '<div class="tool-result">' + window.escapeHtml(content) + '</div>';
  }
  if (content.includes('```')) {
    return formatCodeBlocks(content);
  }
  return window.escapeHtml(content);
}

function formatCodeBlocks(content) {
  return content.replace(/```(\w*)\n([\s\S]*?)```/g, function(match, lang, code) {
    return '<pre class="code-block"><code class="language-' + lang + '">' + window.escapeHtml(code.trim()) + '</code></pre>';
  }).replace(/`([^`]+)`/g, function(match, inline) {
    return '<code class="inline-code">' + window.escapeHtml(inline) + '</code>';
  });
}

window.appendMessage = function(role, content) {
  const div = document.createElement('div');
  div.className = 'message ' + role;
  div.innerHTML = '<div class="role">' + (role === 'user' ? '你' : 'AI') + '</div>' +
    '<div class="content">' + formatContent(content) + '</div>';
  window.$('messages').appendChild(div);
  window.scrollToBottom();
};