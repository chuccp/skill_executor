/**
 * WebSocket 处理模块
 */

window.connectWebSocket = function() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  window.state.ws = new WebSocket(protocol + '//' + location.host);
  window.state.ws.onmessage = function(e) {
    const data = JSON.parse(e.data);
    handleWSMessage(data);
  };
  window.state.ws.onclose = function() {
    setTimeout(window.connectWebSocket, 3000);
  };
};

function handleWSMessage(data) {
  console.log('[WS] 收到消息:', data.type, data);

  switch (data.type) {
    case 'text':
      // 使用 stream 模块的函数
      appendStreamText(data.content);
      break;
    case 'done':
      window.clearTodoPanel();
      window.finishStream();
      window.loadConversations();
      break;
    case 'error':
      window.showError(data.content);
      break;
    case 'user_message':
      break;

    case 'progress_update':
      showProgressPanel(data);
      break;

    case 'command_confirm':
      showCommandConfirm(data.confirmId, data.command);
      break;
    case 'command_start':
      appendCommandBox(data.command);
      break;
    case 'command_result':
      updateCommandResult(data.command, data.success, data.stdout, data.stderr);
      break;
    case 'command_cancelled':
      window.appendMessage('assistant', '命令已取消: ' + data.command);
      break;

    case 'file_read':
      window.showInfo('📖 已读取文件: ' + data.path);
      if (data.content) {
        showFileContent(data.path, data.content);
      }
      break;
    case 'file_written':
      var filePath = data.path || '';
      var ext = filePath.split('.').pop().toLowerCase();
      
      // 根据文件类型显示不同的结果
      if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].indexOf(ext) !== -1) {
        window.showInfo('🖼️ 已生成图片: ' + filePath);
        showImageResult(filePath, filePath.split(/[/\\]/).pop());
      } else if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].indexOf(ext) !== -1) {
        window.showInfo('🎵 已生成音频: ' + filePath);
        showAudioResult(filePath, filePath.split(/[/\\]/).pop());
      } else if (['mp4', 'webm', 'avi', 'mov', 'mkv'].indexOf(ext) !== -1) {
        window.showInfo('🎬 已生成视频: ' + filePath);
        showVideoResult(filePath, filePath.split(/[/\\]/).pop());
      } else {
        window.showInfo('✏️ 文件已写入: ' + filePath);
        showWriteResult(filePath);
      }
      break;
    case 'file_replaced':
      window.showInfo('📝 文件已替换: ' + data.path + ' (' + data.matches + ' 处)');
      break;

    case 'directory_list':
      window.showInfo('📂 已列出目录: ' + data.path);
      break;

    case 'glob_result':
      window.showInfo('🔍 找到 ' + data.files.length + ' 个文件');
      if (data.files && data.files.length > 0) {
        showSearchResult('搜索文件', data.files);
      }
      break;

    case 'grep_result':
      window.showInfo('🔍 找到 ' + data.results.length + ' 个匹配');
      if (data.results && data.results.length > 0) {
        showGrepResult('搜索内容', data.results);
      }
      break;

    case 'search_start':
      window.showInfo('🔍 正在搜索: ' + data.query);
      break;
    case 'search_result':
      window.showInfo('🌐 搜索完成，找到 ' + data.results.length + ' 个结果');
      break;

    case 'fetch_start':
      window.showInfo('🌐 正在获取: ' + data.url);
      break;
    case 'fetch_result':
      window.showInfo('📄 已获取: ' + data.title);
      break;

    case 'todo_updated':
    case 'todo_read':
      window.renderTodoList(data.todos);
      break;

    case 'skill_created':
      window.showInfo('✨ 技能已创建: ' + data.name);
      window.loadSkills();
      break;

    case 'ask_user':
      showAskUser(data.askId, data.question, data.header, data.options);
      break;
  }
}

// 内部函数 - 追加流文本
function appendStreamText(text) {
  const el = window.$('messages').querySelector('.streaming .content');
  if (el) {
    const t = el.querySelector('.typing');
    if (t) t.remove();
    el.textContent += text;
    // 立即滚动到底部，不使用动画
    const container = window.$('messages');
    if (container) container.scrollTop = container.scrollHeight;
  }
}

// 命令确认
function showCommandConfirm(confirmId, command) {
  window.finishStream();
  const div = document.createElement('div');
  div.className = 'message assistant command-confirm';
  div.innerHTML = '<div class="role">⚠️ 确认</div><div class="content">' +
    '<div class="cmd-text">$ ' + window.escapeHtml(command) + '</div>' +
    '<div class="cmd-actions">' +
    '<button class="btn-approve">✓ 执行</button>' +
    '<button class="btn-cancel">✗ 取消</button>' +
    '</div></div>';
  window.$('messages').appendChild(div);
  window.scrollToBottom();

  div.querySelector('.btn-approve').onclick = function() {
    div.remove();
    window.startStream();
    window.state.ws.send(JSON.stringify({ type: 'confirm_command', confirmId: confirmId, approved: true }));
  };
  div.querySelector('.btn-cancel').onclick = function() {
    div.remove();
    window.state.ws.send(JSON.stringify({ type: 'confirm_command', confirmId: confirmId, approved: false }));
  };
}

function appendCommandBox(command) {
  // 检查是否已存在相同命令的盒子
  var existing = window.$('messages').querySelector('.command-box[data-command="' + command.replace(/"/g, '\\"') + '"]');
  if (existing) return;
  
  const div = document.createElement('div');
  div.className = 'message assistant command-box';
  div.dataset.command = command;
  div.innerHTML = '<div class="role">💻</div><div class="content">' +
    '<div class="cmd-header">$ ' + window.escapeHtml(command) + '</div>' +
    '<div class="cmd-output"><span class="running">执行中...</span></div></div>';
  window.$('messages').appendChild(div);
  window.scrollToBottom();
}

function updateCommandResult(command, success, stdout, stderr) {
  const box = window.$('messages').querySelector('.command-box[data-command="' + command.replace(/"/g, '\\"') + '"]');
  if (!box) return;

  const output = box.querySelector('.cmd-output');
  if (!output) return;

  var text = '';
  if (success) {
    text = stdout || '(无输出)';
    output.innerHTML = '<span class="success">✓ 完成</span>\n' + window.escapeHtml(text);
  } else {
    text = stderr || stdout || '执行失败';
    output.innerHTML = '<span class="error">✗ 失败</span>\n' + window.escapeHtml(text);
  }
  
  // 3秒后折叠长输出
  if (text.length > 500) {
    setTimeout(function() {
      output.style.maxHeight = '100px';
      output.style.overflow = 'hidden';
      output.style.cursor = 'pointer';
      output.title = '点击展开';
      output.onclick = function() {
        output.style.maxHeight = '';
        output.style.overflow = '';
      };
    }, 3000);
  }
}

// 询问用户
function showAskUser(askId, question, header, options) {
  window.finishStream();
  const div = document.createElement('div');
  div.className = 'message assistant ask-user';
  div.innerHTML = '<div class="role">❓</div><div class="content">' +
    (header ? '<div class="ask-header">' + window.escapeHtml(header) + '</div>' : '') +
    '<div class="ask-question">' + window.escapeHtml(question) + '</div>' +
    (options ? '<div class="ask-options">' +
      options.map(function(opt, i) { return '<button data-index="' + i + '">' + window.escapeHtml(opt.label) + '</button>'; }).join('') +
      '</div>' : '<input type="text" class="ask-input" placeholder="输入回答..."><button class="ask-submit">提交</button>') +
    '</div>';
  window.$('messages').appendChild(div);
  window.scrollToBottom();

  if (options) {
    div.querySelectorAll('.ask-options button').forEach(function(btn) {
      btn.onclick = function() {
        const idx = parseInt(btn.dataset.index);
        div.remove();
        window.state.ws.send(JSON.stringify({ type: 'ask_response', askId: askId, answer: options[idx] }));
      };
    });
  } else {
    const input = div.querySelector('.ask-input');
    const submit = div.querySelector('.ask-submit');
    submit.onclick = function() {
      const answer = input.value.trim();
      if (answer) {
        div.remove();
        window.state.ws.send(JSON.stringify({ type: 'ask_response', askId: askId, answer: answer }));
      }
    };
    input.onkeydown = function(e) {
      if (e.key === 'Enter') submit.click();
    };
  }
}

// 进度面板
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

// 文件内容展示
function showFileContent(filePath, content) {
  var fileName = filePath.split(/[/\\]/).pop() || filePath;
  var lines = content.split('\n');
  var lineCount = lines.length;
  
  // 提取关键信息（前几行和结构）
  var preview = lines.slice(0, 15).join('\n');
  if (lineCount > 15) {
    preview += '\n... (共 ' + lineCount + ' 行)';
  }
  
  var div = document.createElement('div');
  div.className = 'message assistant file-preview';
  div.innerHTML = 
    '<div class="file-preview-header">' +
      '<span class="file-name">📄 ' + window.escapeHtml(fileName) + '</span>' +
      '<span class="file-meta">' + lineCount + ' 行</span>' +
    '</div>' +
    '<pre class="file-preview-content">' + window.escapeHtml(preview) + '</pre>';
  
  window.$('messages').appendChild(div);
  window.scrollToBottom();
}

// 搜索结果展示
function showSearchResult(title, files) {
  var div = document.createElement('div');
  div.className = 'message assistant search-result-box';
  var items = files.slice(0, 5).map(function(f) {
    var name = f.split(/[/\\]/).pop();
    return '<div class="sr-item">' + window.escapeHtml(name) + '</div>';
  }).join('');
  
  div.innerHTML = 
    '<div class="sr-title">🔍 ' + window.escapeHtml(title) + '</div>' +
    '<div class="sr-items">' + items + '</div>' +
    (files.length > 5 ? '<div class="sr-more">+ 共 ' + files.length + ' 个结果</div>' : '');
  
  window.$('messages').appendChild(div);
  window.scrollToBottom();
  
  // 5秒后半透明
  setTimeout(function() { div.style.opacity = '0.5'; }, 5000);
}

// grep 结果展示
function showGrepResult(title, results) {
  var div = document.createElement('div');
  div.className = 'message assistant search-result-box';
  var items = results.slice(0, 3).map(function(r) {
    var name = r.file.split(/[/\\]/).pop();
    return '<div class="sr-item"><span class="sr-file">' + window.escapeHtml(name) + '</span>:<span class="sr-line">' + r.line + '</span></div>';
  }).join('');
  
  div.innerHTML = 
    '<div class="sr-title">🔍 ' + window.escapeHtml(title) + '</div>' +
    '<div class="sr-items">' + items + '</div>' +
    (results.length > 3 ? '<div class="sr-more">+ 共 ' + results.length + ' 个匹配</div>' : '');
  
  window.$('messages').appendChild(div);
  window.scrollToBottom();
  
  setTimeout(function() { div.style.opacity = '0.5'; }, 5000);
}

// 写入结果展示
function showWriteResult(filePath) {
  var fileName = filePath.split(/[/\\]/).pop() || filePath;
  var ext = fileName.split('.').pop().toLowerCase();
  
  // 检查是否是多媒体文件
  var imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'];
  var audioExts = ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'];
  var videoExts = ['mp4', 'webm', 'avi', 'mov', 'mkv'];
  
  if (imageExts.indexOf(ext) !== -1) {
    showImageResult(filePath, fileName);
  } else if (audioExts.indexOf(ext) !== -1) {
    showAudioResult(filePath, fileName);
  } else if (videoExts.indexOf(ext) !== -1) {
    showVideoResult(filePath, fileName);
  } else {
    // 普通文件
    var div = document.createElement('div');
    div.className = 'message assistant write-result-box';
    div.innerHTML = '✅ 已写入: <code>' + window.escapeHtml(fileName) + '</code>';
    window.$('messages').appendChild(div);
    window.scrollToBottom();
    setTimeout(function() { div.style.opacity = '0.5'; }, 3000);
  }
}

// 图片展示
function showImageResult(filePath, fileName) {
  // 转换文件路径为 URL
  var mediaPath = filePath.replace(/\\/g, '/');
  var match = mediaPath.match(/media\/(.+)/);
  var url = match ? '/media/' + match[1] : '/media/' + fileName;
  
  var div = document.createElement('div');
  div.className = 'message assistant media-result';
  div.innerHTML = 
    '<div class="media-header">🖼️ 图片: ' + window.escapeHtml(fileName) + '</div>' +
    '<div class="media-content">' +
      '<img src="' + url + '" alt="' + window.escapeHtml(fileName) + '" class="media-image" onclick="window.open(\'' + url + '\', \'_blank\')">' +
    '</div>';
  
  window.$('messages').appendChild(div);
  window.scrollToBottom();
}

// 音频展示
function showAudioResult(filePath, fileName) {
  var mediaPath = filePath.replace(/\\/g, '/');
  var match = mediaPath.match(/media\/(.+)/);
  var url = match ? '/media/' + match[1] : '/media/' + fileName;
  
  var div = document.createElement('div');
  div.className = 'message assistant media-result';
  div.innerHTML = 
    '<div class="media-header">🎵 音频: ' + window.escapeHtml(fileName) + '</div>' +
    '<div class="media-content">' +
      '<audio controls class="media-audio" src="' + url + '"></audio>' +
    '</div>';
  
  window.$('messages').appendChild(div);
  window.scrollToBottom();
}

// 视频展示
function showVideoResult(filePath, fileName) {
  var mediaPath = filePath.replace(/\\/g, '/');
  var match = mediaPath.match(/media\/(.+)/);
  var url = match ? '/media/' + match[1] : '/media/' + fileName;
  
  var div = document.createElement('div');
  div.className = 'message assistant media-result';
  div.innerHTML = 
    '<div class="media-header">🎬 视频: ' + window.escapeHtml(fileName) + '</div>' +
    '<div class="media-content">' +
      '<video controls class="media-video" src="' + url + '"></video>' +
    '</div>';
  
  window.$('messages').appendChild(div);
  window.scrollToBottom();
}
