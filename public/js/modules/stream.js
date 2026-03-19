/**
 * 流式输出处理模块
 */

window.startStream = function() {
  window.state.isStreaming = true;
  updateSendButton();
  const div = document.createElement('div');
  div.className = 'message assistant streaming';
  div.innerHTML = '<div class="role">AI</div><div class="content"><span class="typing"></span></div>';
  window.$('messages').appendChild(div);
  window.scrollToBottom();
};

function appendStreamText(text) {
  const el = window.$('messages').querySelector('.streaming .content');
  if (el) {
    const t = el.querySelector('.typing');
    if (t) t.remove();
    el.textContent += text;
    window.scrollToBottom();
  }
}

window.finishStream = function() {
  window.state.isStreaming = false;
  window.state.abortController = null;
  updateSendButton();
  const el = window.$('messages').querySelector('.streaming');
  if (el) {
    el.classList.remove('streaming');
    const contentEl = el.querySelector('.content');
    if (contentEl) {
      contentEl.innerHTML = formatCodeBlocks(contentEl.textContent);
    }
  }
  hideProgressPanel();
  hideProgressIndicator();
};

window.stopStream = function() {
  if (window.state.abortController) {
    window.state.abortController.abort();
    window.state.abortController = null;
  }
  window.state.isStreaming = false;
  updateSendButton();
};

function updateSendButton() {
  const btn = window.$('send-btn');
  if (!btn) return;

  if (window.state.isStreaming) {
    btn.textContent = '停止';
    btn.classList.add('btn-stop');
    btn.classList.remove('btn-primary');
  } else {
    btn.textContent = '发送';
    btn.classList.remove('btn-stop');
    btn.classList.add('btn-primary');
  }
}

function showProgressIndicator(text) {
  const el = window.$('messages').querySelector('.streaming .content');
  if (el) {
    const t = el.querySelector('.typing');
    if (t) t.remove();

    const progress = el.querySelector('.progress-text');
    if (progress) {
      progress.textContent = text;
    } else {
      const div = document.createElement('div');
      div.className = 'progress-text';
      div.textContent = text;
      el.appendChild(div);
    }
    window.scrollToBottom();
  }
}

function hideProgressIndicator() {
  const el = window.$('messages').querySelector('.streaming .content');
  if (el) {
    const progress = el.querySelector('.progress-text');
    if (progress) progress.remove();
  }
}

function showProgressPanel(data) {
  let panel = document.querySelector('.progress-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'progress-panel';
    window.$('messages').appendChild(panel);
  }

  const current = data.current || 0;
  const total = data.total || 0;
  const currentTask = data.currentTask || '';
  const logs = data.logs || [];
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

  panel.innerHTML =
    '<div class="progress-header">' +
    '<span class="progress-title">📋 执行进度</span>' +
    '<span class="progress-percent">' + current + '/' + total + ' (' + percent + '%)</span>' +
    '</div>' +
    '<div class="progress-bar">' +
    '<div class="progress-fill" style="width: ' + percent + '%"></div>' +
    '</div>' +
    (currentTask ? '<div class="progress-current">🔄 ' + window.escapeHtml(currentTask) + '</div>' : '') +
    (logs.length > 0 ?
      '<div class="progress-logs">' +
      logs.map(function(l) { return '<div class="log-item">' + window.escapeHtml(l) + '</div>'; }).join('') +
      '</div>' : '');

  window.scrollToBottom();
}

function hideProgressPanel() {
  const panel = document.querySelector('.progress-panel');
  if (panel) {
    setTimeout(function() { panel.remove(); }, 2000);
  }
}

// 发送消息
window.sendMessage = async function() {
  if (window.state.isStreaming) {
    window.stopStream();
    return;
  }

  const content = window.$('user-input').value.trim();
  if (!content) return;
  if (!window.state.currentConversationId) return;
  const skillName = window.$('skill-select').value || undefined;

  window.appendMessage('user', content);
  window.$('user-input').value = '';
  window.startStream();

  window.state.abortController = new AbortController();

  try {
    const res = await fetch(window.API_BASE + '/conversations/' + window.state.currentConversationId + '/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content, skillName: skillName }),
      signal: window.state.abortController.signal
    });

    if (!res.ok) {
      window.showError('请求失败: ' + res.status);
      window.finishStream();
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const processEventBlock = function(block) {
      const lines = block.split('\n');
      let eventType = '';
      const dataLines = [];

      for (const line of lines) {
        if (!line) continue;
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          let data = line.slice(5);
          if (data.startsWith(' ')) data = data.slice(1);
          dataLines.push(data);
        }
      }

      if (dataLines.length) {
        handleSSEEvent(eventType || 'message', dataLines.join('\n'));
      }
    };

    while (true) {
      const result = await reader.read();
      if (result.done) break;

      buffer += decoder.decode(result.value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');

      let sepIndex;
      while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);
        if (block.trim()) processEventBlock(block);
      }
    }

    if (buffer.trim()) {
      processEventBlock(buffer);
    }

    window.finishStream();
    window.loadConversations();
  } catch (error) {
    if (error.name === 'AbortError') {
      window.appendMessage('assistant', '⏹️ 已停止生成');
    } else {
      window.showError('连接错误: ' + error.message);
    }
    window.finishStream();
  }
};

// 处理 SSE 事件
function handleSSEEvent(eventType, dataStr) {
  try {
    const data = JSON.parse(dataStr);

    switch (eventType) {
      case 'text':
        appendStreamText(data);
        break;
      case 'progress':
        showProgressIndicator(data);
        break;
      case 'tool_use':
        window.showInfo('🔧 使用工具: ' + data.name);
        break;
      case 'tool_result':
        if (data.name === 'read_file') window.showInfo('📖 已读取文件');
        else if (data.name === 'write_file') window.showInfo('✏️ 文件已写入');
        else if (data.name === 'bash') window.showInfo('💻 命令执行完成');
        break;
      case 'todo':
        window.renderTodoList(data);
        break;
      case 'error':
        window.showError(data);
        break;
      case 'done':
        hideProgressIndicator();
        break;
    }
  } catch (e) {
    console.error('[SSE] 解析错误:', e);
  }
}

// 读取文件内容
window.readFileAsText = function(file) {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader();
    reader.onload = function() { resolve(reader.result); };
    reader.onerror = function() { reject(reader.error); };
    reader.readAsText(file);
  });
};

function formatCodeBlocks(content) {
  return content.replace(/```(\w*)\n([\s\S]*?)```/g, function(match, lang, code) {
    return '<pre class="code-block"><code class="language-' + lang + '">' + window.escapeHtml(code.trim()) + '</code></pre>';
  }).replace(/`([^`]+)`/g, function(match, inline) {
    return '<code class="inline-code">' + window.escapeHtml(inline) + '</code>';
  });
}