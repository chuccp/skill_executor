/**
 * 流式输出处理模块
 */

// 思考过程相关变量
var thinkingContent = '';
var thinkingPanelVisible = false;

// 随机文案
var statusMessages = [
  '思考中...',
  '让子弹飞一会儿...',
  '脑细胞正在努力...',
  '正在召唤AI之力...',
  '码字中...',
  '正在搬运知识...',
  '灵感加载中...',
  '正在施展魔法...',
  '冥想中...',
  '正在调取记忆...',
  '大脑飞速运转...',
  '正在编织答案...',
  '努力不掉链子...',
  '正在捣鼓代码...',
  '认真干活中...',
  '正在消化问题...',
  'CPU在燃烧...',
  '正在翻译人类语言...',
  '蓄力中...',
  '即将揭晓答案...',
  '最后冲刺...',
  '精雕细琢中...',
  '马上就好...',
  '收尾中...'
];
var statusTimer = null;
var lastStatusIndex = -1;

// 随机显示状态文案
function randomStatusMessage() {
  var statusEl = window.$('messages').querySelector('.streaming .stream-status');
  if (!statusEl) return;
  
  // 随机选择一个不同的文案
  var index;
  do {
    index = Math.floor(Math.random() * statusMessages.length);
  } while (index === lastStatusIndex && statusMessages.length > 1);
  lastStatusIndex = index;
  
  statusEl.textContent = statusMessages[index];
}

// 显示思考面板（在当前 streaming 消息内）
function showThinkingPanel() {
  if (thinkingPanelVisible) return;
  thinkingPanelVisible = true;
  
  // 找到当前 streaming 的消息
  var streamingMsg = window.$('messages').querySelector('.streaming');
  if (!streamingMsg) return;
  
  // 检查是否已有思考面板
  var existingPanel = streamingMsg.querySelector('.thinking-panel');
  if (existingPanel) {
    existingPanel.classList.add('visible');
    return;
  }
  
  // 创建思考面板并插入到 content 之前
  var panel = document.createElement('div');
  panel.className = 'thinking-panel visible';
  panel.id = 'thinking-panel-current';
  panel.innerHTML = 
    '<div class="thinking-header">' +
      '<span class="thinking-icon">💭</span>' +
      '<span class="thinking-title">思考过程</span>' +
      '<button class="thinking-toggle" title="展开/折叠">▼</button>' +
    '</div>' +
    '<div class="thinking-content"></div>';
  
  // 插入到 role 之后，content 之前
  var roleEl = streamingMsg.querySelector('.role');
  if (roleEl && roleEl.nextSibling) {
    streamingMsg.insertBefore(panel, roleEl.nextSibling);
  } else {
    streamingMsg.insertBefore(panel, streamingMsg.firstChild.nextSibling);
  }
  
  // 绑定折叠事件
  var toggleBtn = panel.querySelector('.thinking-toggle');
  var header = panel.querySelector('.thinking-header');
  if (toggleBtn) {
    toggleBtn.onclick = function(e) {
      e.stopPropagation();
      panel.classList.toggle('collapsed');
    };
  }
  if (header) {
    header.onclick = function() {
      panel.classList.toggle('collapsed');
    };
  }
  
  window.scrollToBottom();
}

// 隐藏思考面板
function hideThinkingPanel() {
  thinkingPanelVisible = false;
  thinkingContent = '';
  
  // 找到并折叠当前思考面板
  var panel = window.$('messages').querySelector('.streaming .thinking-panel');
  if (panel) {
    panel.classList.add('collapsed');
  }
}

// 追加思考内容
function appendThinking(text) {
  showThinkingPanel();
  thinkingContent += text;
  
  var panel = window.$('messages').querySelector('.streaming .thinking-panel');
  if (panel) {
    var content = panel.querySelector('.thinking-content');
    if (content) {
      content.textContent = thinkingContent;
      // 自动滚动到底部
      content.scrollTop = content.scrollHeight;
    }
  }
  window.scrollToBottom();
}
// 导出到全局供 websocket.js 使用
window.appendThinking = appendThinking;

window.startStream = function() {
  window.state.isStreaming = true;
  updateSendButton();
  thinkingContent = '';
  thinkingPanelVisible = false;
  lastStatusIndex = -1;
  
  const div = document.createElement('div');
  div.className = 'message assistant streaming';
  div.innerHTML = '<div class="role">AI</div><div class="content"></div><span class="stream-status">思考中...</span>';
  window.$('messages').appendChild(div);
  window.scrollToBottom();
  
  // 启动随机文案定时器
  randomStatusMessage();
  statusTimer = setInterval(randomStatusMessage, 2000);
};

function appendStreamText(text) {
  const el = window.$('messages').querySelector('.streaming .content');
  if (el) {
    el.textContent += text;
    window.scrollToBottom();
  }
}

window.finishStream = function() {
  window.state.isStreaming = false;
  window.state.abortController = null;
  updateSendButton();
  
  // 停止随机文案定时器
  if (statusTimer) {
    clearInterval(statusTimer);
    statusTimer = null;
  }
  
  // 只移除 streaming 标记，状态提示淡出隐藏
  const el = window.$('messages').querySelector('.streaming');
  if (el) {
    el.classList.remove('streaming');
    var statusEl = el.querySelector('.stream-status');
    if (statusEl) {
      statusEl.classList.add('fade-out');
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
      case 'thinking':
        appendThinking(data);
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
  
  // 检查是否是 MEDIA_INFO 格式（play_media 返回）
  if (result.indexOf('MEDIA_INFO:') === 0) {
    try {
      var mediaInfo = JSON.parse(result.substring(11));
      showMediaResultInStream(mediaInfo.type, mediaInfo.path, mediaInfo.name, mediaInfo.size);
    } catch (e) {
      console.error('解析媒体信息失败:', e);
    }
    return;
  }
  
  if (name === 'read_file') {
    // 解析文件路径和内容
    var match = result.match(/文件内容 \((.+?)\):/);
    var filePath = match ? match[1] : '';
    var contentMatch = result.match(/```\n?([\s\S]*?)\n?```/);
    var content = contentMatch ? contentMatch[1] : result;
    
    if (filePath && content) {
      showFileContentInStream(filePath, content);
    }
  } else if (name === 'get_files') {
    // 解析文件列表结果
    var filesMatch = result.match(/中的文件 \((\d+) 个\):\n([\s\S]*)/);
    if (filesMatch) {
      var fileList = filesMatch[2].trim().split('\n');
      showFilesResultInStream(fileList.slice(0, 10), parseInt(filesMatch[1]));
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
      var filePath = writeMatch[1];
      var ext = filePath.split('.').pop().toLowerCase();
      
      // 检测多媒体文件
      if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].indexOf(ext) !== -1) {
        showMediaResultInStream('image', filePath);
      } else if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].indexOf(ext) !== -1) {
        showMediaResultInStream('audio', filePath);
      } else if (['mp4', 'webm', 'avi', 'mov', 'mkv'].indexOf(ext) !== -1) {
        showMediaResultInStream('video', filePath);
      } else {
        showWriteResultInStream(filePath);
      }
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

// 显示文件列表结果
function showFilesResultInStream(files, total) {
  var div = document.createElement('div');
  div.className = 'files-result-inline';
  
  var html = '<div class="sr-title">📁 文件列表 (' + total + ' 个)</div><div class="sr-items">';
  
  files.forEach(function(file) {
    var isDir = file.indexOf('[DIR]') === 0;
    var icon = isDir ? '📁' : '📄';
    var name = file.replace(/\[DIR\]|\[FILE\]|\[\.\w+\]/g, '').trim();
    html += '<div class="sr-item">' + icon + ' ' + window.escapeHtml(name) + '</div>';
  });
  
  if (total > files.length) {
    html += '<div class="sr-more">+ 还有 ' + (total - files.length) + ' 个</div>';
  }
  
  html += '</div>';
  div.innerHTML = html;
  appendToStreamingMessage(div);
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

// 在流式消息中显示多媒体结果
function showMediaResultInStream(type, filePath, optName, optSize) {
  var fileName = optName || (filePath.split(/[/\\]/).pop() || filePath);
  var sizeInfo = optSize ? ' (' + optSize + ')' : '';
  var mediaPath = filePath.replace(/\\/g, '/');
  
  // 构建可访问的 URL
  var url;
  var mediaMatch = mediaPath.match(/media\/(.+)/);
  if (mediaMatch) {
    url = '/media/' + mediaMatch[1];
  } else {
    // 非 media 目录的文件，使用 API 代理
    url = '/api/file?path=' + encodeURIComponent(filePath);
  }
  
  var div = document.createElement('div');
  div.className = 'media-result-inline';
  
  if (type === 'image') {
    div.innerHTML = 
      '<div class="media-label">🖼️ 图片: ' + window.escapeHtml(fileName) + sizeInfo + '</div>' +
      '<img src="' + url + '" class="media-thumb" onclick="window.open(\'' + url + '\', \'_blank\')">';
  } else if (type === 'audio') {
    div.innerHTML = 
      '<div class="media-label">🎵 音频: ' + window.escapeHtml(fileName) + sizeInfo + '</div>' +
      '<audio controls src="' + url + '"></audio>';
  } else if (type === 'video') {
    div.innerHTML = 
      '<div class="media-label">🎬 视频: ' + window.escapeHtml(fileName) + sizeInfo + '</div>' +
      '<video controls playsinline src="' + url + '" style="max-width: 100%; border-radius: 8px;"></video>';
  }
  
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