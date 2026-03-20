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
  // 清理任务面板
  if (window.clearTodoPanel) {
    window.clearTodoPanel();
  }
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
        // 工具开始执行
        break;
      case 'tool_result':
        handleToolResult(data);
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

// 处理工具结果
function handleToolResult(data) {
  var name = data.name;
  var result = data.result || '';
  
  if (name === 'read_file') {
    // 解析文件路径和内容
    var match = result.match(/文件内容 \((.+?)\):/);
    var filePath = match ? match[1] : '';
    var contentMatch = result.match(/```\n?([\s\S]*?)\n?```/);
    var content = contentMatch ? contentMatch[1] : result;
    
    if (filePath && content) {
      showFileContentInStream(filePath, content);
    }
  } else if (name === 'glob') {
    // 解析搜索结果
    var filesMatch = result.match(/找到 (\d+) 个文件匹配 "([^"]+)":\n([\s\S]+)/);
    if (filesMatch) {
      var files = filesMatch[3].trim().split('\n');
      showSearchResultInStream('搜索文件: ' + filesMatch[2], files.slice(0, 5), parseInt(filesMatch[1]));
    }
  } else if (name === 'grep') {
    // 解析内容搜索结果
    var grepMatch = result.match(/找到 (\d+) 个匹配:\n([\s\S]+)/);
    if (grepMatch) {
      var lines = grepMatch[2].trim().split('\n');
      showSearchResultInStream('搜索内容', lines.slice(0, 3), parseInt(grepMatch[1]));
    }
  } else if (name === 'write_file') {
    var writeMatch = result.match(/写入文件成功: (.+)/);
    if (writeMatch) {
      showWriteResultInStream(writeMatch[1]);
    }
  } else if (name === 'bash') {
    // 解析命令执行结果
    var bashMatch = result.match(/命令: (.+)\n([\s\S]*)/);
    if (bashMatch) {
      var cmd = bashMatch[1];
      var output = bashMatch[2].trim();
      var success = !output.startsWith('错误:');
      showBashResultInStream(cmd, output, success);
    }
  }
}

// 在流式消息中显示文件内容
function showFileContentInStream(filePath, content) {
  var fileName = filePath.split(/[/\\]/).pop() || filePath;
  var lines = content.split('\n');
  var lineCount = lines.length;
  
  var preview = lines.slice(0, 12).join('\n');
  if (lineCount > 12) {
    preview += '\n... (共 ' + lineCount + ' 行)';
  }
  
  var div = document.createElement('div');
  div.className = 'file-preview-inline';
  div.innerHTML = 
    '<div class="fp-header">' +
      '<span class="fp-name">📄 ' + window.escapeHtml(fileName) + '</span>' +
      '<span class="fp-meta">' + lineCount + ' 行</span>' +
    '</div>' +
    '<pre class="fp-content">' + window.escapeHtml(preview) + '</pre>';
  
  appendToStreamingMessage(div);
}

// 在流式消息中显示搜索结果
function showSearchResultInStream(title, items, total) {
  var div = document.createElement('div');
  div.className = 'search-result-inline';
  div.innerHTML = 
    '<div class="sr-title">🔍 ' + window.escapeHtml(title) + '</div>' +
    '<div class="sr-items">' + 
      items.map(function(item) {
        var name = item.split(/[/\\]/).pop() || item;
        return '<div class="sr-item">' + window.escapeHtml(name.length > 50 ? name.slice(-50) : name) + '</div>';
      }).join('') +
      (total > items.length ? '<div class="sr-more">+ 共 ' + total + ' 个结果</div>' : '') +
    '</div>';
  
  appendToStreamingMessage(div);
}

// 在流式消息中显示写入结果
function showWriteResultInStream(filePath) {
  var fileName = filePath.split(/[/\\]/).pop() || filePath;
  var div = document.createElement('div');
  div.className = 'write-result-inline';
  div.innerHTML = '✅ 已写入: <code>' + window.escapeHtml(fileName) + '</code>';
  
  appendToStreamingMessage(div);
}

// 在流式消息中显示命令执行结果
function showBashResultInStream(command, output, success) {
  var div = document.createElement('div');
  div.className = 'bash-result-inline ' + (success ? 'success' : 'error');
  
  // 截断过长的输出
  var displayOutput = output;
  if (output.length > 300) {
    displayOutput = output.substring(0, 300) + '\n... (已截断)';
  }
  
  div.innerHTML = 
    '<div class="bash-header">' +
      '<span class="bash-icon">' + (success ? '✓' : '✗') + '</span>' +
      '<code class="bash-cmd">$ ' + window.escapeHtml(command) + '</code>' +
    '</div>' +
    '<pre class="bash-output">' + window.escapeHtml(displayOutput || '(无输出)') + '</pre>';
  
  appendToStreamingMessage(div);
}

// 追加到流式消息
function appendToStreamingMessage(element) {
  var streamingEl = window.$('messages').querySelector('.streaming .content');
  if (streamingEl) {
    // 移除打字指示器
    var typing = streamingEl.querySelector('.typing');
    if (typing) typing.remove();
    
    // 如果还没有容器，创建一个
    var container = streamingEl.querySelector('.tool-results-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'tool-results-container';
      streamingEl.appendChild(container);
    }
    
    container.appendChild(element);
    window.scrollToBottom();
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