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
      break;
    case 'file_written':
      window.showInfo('✏️ 文件已写入: ' + data.path);
      break;
    case 'file_replaced':
      window.showInfo('📝 文件已替换: ' + data.path + ' (' + data.matches + ' 处)');
      break;

    case 'directory_list':
      window.showInfo('📂 已列出目录: ' + data.path);
      break;

    case 'glob_result':
      window.showInfo('🔍 找到 ' + data.files.length + ' 个文件');
      break;

    case 'grep_result':
      window.showInfo('🔍 找到 ' + data.results.length + ' 个匹配');
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
    window.scrollToBottom();
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
  const div = document.createElement('div');
  div.className = 'message assistant command-box';
  div.dataset.command = command;
  div.innerHTML = '<div class="role">💻</div><div class="content">' +
    '<div class="cmd-header">$ ' + window.escapeHtml(command) + '</div>' +
    '<div class="cmd-output">执行中...</div></div>';
  window.$('messages').appendChild(div);
  window.scrollToBottom();
}

function updateCommandResult(command, success, stdout, stderr) {
  const box = window.$('messages').querySelector('.command-box[data-command="' + command.replace(/"/g, '\\"') + '"]');
  if (!box) return;

  const output = box.querySelector('.cmd-output');
  if (!output) return;

  const text = success ? (stdout || '(无输出)') : ('错误: ' + (stderr || stdout));
  output.textContent = text;
  output.className = 'cmd-output ' + (success ? 'success' : 'error');
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