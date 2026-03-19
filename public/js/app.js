const API_BASE = '/api';

const state = {
  currentConversationId: null,
  conversations: [],  // 会话元数据列表
  skills: [],
  presets: [],
  ws: null
};

const $ = id => document.getElementById(id);

// 初始化
async function init() {
  connectWebSocket();
  await loadPresets();
  await loadConversations();
  await loadSkills();
  
  // 尝试恢复上次会话
  const lastConversationId = localStorage.getItem('lastConversationId');
  if (lastConversationId) {
    const exists = state.conversations.find(c => c.id === lastConversationId);
    if (exists) {
      selectConversation(lastConversationId);
    } else if (state.conversations.length > 0) {
      selectConversation(state.conversations[0].id);
    } else {
      await createConversation();
    }
  } else if (state.conversations.length > 0) {
    selectConversation(state.conversations[0].id);
  } else {
    await createConversation();
  }
  
  setupEventListeners();
}

// WebSocket
function connectWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  state.ws = new WebSocket(protocol + '//' + location.host);
  state.ws.onmessage = e => {
    const data = JSON.parse(e.data);
    handleWSMessage(data);
  };
  state.ws.onclose = () => setTimeout(connectWebSocket, 3000);
}

function handleWSMessage(data) {
  console.log('[WS] 收到消息:', data.type, data);
  switch (data.type) {
    case 'text':
      appendStreamText(data.content);
      break;
    case 'done':
      finishStream();
      // 更新会话列表
      loadConversations();
      break;
    case 'error':
      showError(data.content);
      break;
    case 'user_message':
      // 用户消息已在发送时添加，忽略
      break;
      
    // 进度面板
    case 'progress_update':
      renderProgressPanel(data);
      break;
      
    // 命令相关
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
      appendMessage('assistant', '命令已取消: ' + data.command);
      break;
      
    // 文件操作
    case 'file_read':
      showInfo('📖 已读取文件: ' + data.path);
      break;
    case 'file_written':
      showInfo('✏️ 文件已写入: ' + data.path);
      break;
    case 'file_replaced':
      showInfo('📝 文件已替换: ' + data.path + ' (' + data.matches + ' 处)');
      break;
      
    // 目录列表
    case 'directory_list':
      showInfo('📂 已列出目录: ' + data.path);
      break;
      
    // 文件搜索
    case 'glob_result':
      showInfo('🔍 找到 ' + data.files.length + ' 个文件');
      break;
      
    // 内容搜索
    case 'grep_result':
      showInfo('🔍 找到 ' + data.results.length + ' 个匹配');
      break;
      
    // 网络搜索
    case 'search_start':
      showInfo('🔍 正在搜索: ' + data.query);
      break;
    case 'search_result':
      showInfo('🌐 搜索完成，找到 ' + data.results.length + ' 个结果');
      break;
      
    // 网络获取
    case 'fetch_start':
      showInfo('🌐 正在获取: ' + data.url);
      break;
    case 'fetch_result':
      showInfo('📄 已获取: ' + data.title);
      break;
      
    // 任务管理
    case 'todo_updated':
      renderTodoList(data.todos);
      break;
    case 'todo_read':
      renderTodoList(data.todos);
      break;
      
    // Skill
    case 'skill_created':
      showInfo('✨ 技能已创建: ' + data.name);
      loadSkills();
      break;
      
    // 询问用户
    case 'ask_user':
      showAskUser(data.askId, data.question, data.header, data.options);
      break;
  }
}

// 加载数据
async function loadPresets() {
  const res = await fetch(API_BASE + '/presets');
  const { success, data } = await res.json();
  if (success) {
    state.presets = data || [];
    $('preset-select').innerHTML = '<option value="">选择模型</option>' +
      state.presets.map(p => '<option value="' + p.name + '">' + p.name + '</option>').join('');

    // 自动选择上次选择的模型或第一个模型
    const lastSelected = localStorage.getItem('selectedModel');
    if (lastSelected && state.presets.find(p => p.name === lastSelected)) {
      $('preset-select').value = lastSelected;
    } else if (state.presets.length > 0) {
      $('preset-select').value = state.presets[0].name;
      localStorage.setItem('selectedModel', state.presets[0].name);
    }
  }
}

async function loadConversations() {
  const res = await fetch(API_BASE + '/conversations/meta');
  const { success, data } = await res.json();
  if (success) {
    state.conversations = data || [];
    renderConversationList();
  }
}

async function loadSkills() {
  const res = await fetch(API_BASE + '/skills');
  const { success, data } = await res.json();
  if (success) {
    state.skills = data || [];
    $('skill-select').innerHTML = '<option value="">无 Skill</option>' +
      state.skills.map(s => '<option value="' + s.name + '">' + s.name + '</option>').join('');
  }
}

// 会话操作
async function createConversation() {
  const res = await fetch(API_BASE + '/conversations', { method: 'POST' });
  const { success, data } = await res.json();
  if (success) {
    state.conversations.unshift({
      id: data.id,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      messageCount: 0
    });
    renderConversationList();
    selectConversation(data.id);
  }
}

async function deleteConversation(id, event) {
  event.stopPropagation();
  
  if (!confirm('确定要删除这个会话吗？')) return;
  
  const res = await fetch(API_BASE + '/conversations/' + id, { method: 'DELETE' });
  const { success } = await res.json();
  if (success) {
    state.conversations = state.conversations.filter(c => c.id !== id);
    renderConversationList();
    
    // 如果删除的是当前会话，选择其他会话
    if (state.currentConversationId === id) {
      localStorage.removeItem('lastConversationId');
      if (state.conversations.length > 0) {
        selectConversation(state.conversations[0].id);
      } else {
        createConversation();
      }
    }
  }
}

async function selectConversation(id) {
  state.currentConversationId = id;
  localStorage.setItem('lastConversationId', id);
  
  // 更新列表高亮
  document.querySelectorAll('.conversation-list li').forEach(li => {
    li.classList.toggle('active', li.dataset.id === id);
  });
  
  // 加载会话消息
  const res = await fetch(API_BASE + '/conversations/' + id);
  const { success, data } = await res.json();
  if (success) {
    renderMessages(data.messages || []);
  }
}

function renderConversationList() {
  $('conversation-list').innerHTML = state.conversations.map(c => {
    const date = new Date(c.updatedAt || c.createdAt);
    const timeStr = formatTime(date);
    const preview = c.firstUserMessage || c.summary || '新会话';
    
    return '<li data-id="' + c.id + '" class="' + (c.id === state.currentConversationId ? 'active' : '') + '">' +
      '<div class="conv-info">' +
      '<span class="conv-time">' + timeStr + '</span>' +
      '<span class="conv-preview">' + escapeHtml(preview.substring(0, 30)) + '</span>' +
      '</div>' +
      '<button class="conv-delete" data-id="' + c.id + '" title="删除">×</button>' +
      '</li>';
  }).join('');
  
  // 绑定点击事件
  document.querySelectorAll('.conversation-list li').forEach(li => {
    li.onclick = (e) => {
      if (!e.target.classList.contains('conv-delete')) {
        selectConversation(li.dataset.id);
      }
    };
  });
  
  // 绑定删除按钮
  document.querySelectorAll('.conv-delete').forEach(btn => {
    btn.onclick = (e) => deleteConversation(btn.dataset.id, e);
  });
}

function formatTime(date) {
  const now = new Date();
  const diff = now - date;
  
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  if (diff < 604800000) return Math.floor(diff / 86400000) + '天前';
  
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

// 消息
async function sendMessage() {
  const content = $('user-input').value.trim();
  if (!content || !state.currentConversationId) return;
  const skillName = $('skill-select').value || undefined;
  
  appendMessage('user', content);
  $('user-input').value = '';
  startStream();
  
  // 使用 SSE 流式接口
  try {
    const res = await fetch(API_BASE + '/conversations/' + state.currentConversationId + '/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, skillName })
    });

    if (!res.ok) {
      showError('请求失败: ' + res.status);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let currentEvent = '';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (currentEvent && data) {
            handleSSEEvent(currentEvent, data);
          }
        }
      }
    }

    finishStream();
    loadConversations();
  } catch (error) {
    showError('连接错误: ' + error.message);
  }
}

// 处理 SSE 事件
function handleSSEEvent(eventType, dataStr) {
  try {
    const data = JSON.parse(dataStr);
    
    switch (eventType) {
      case 'text':
        appendStreamText(data);
        break;
      case 'tool_use':
        showInfo('🔧 使用工具: ' + data.name);
        break;
      case 'tool_result':
        if (data.name === 'read_file') showInfo('📖 已读取文件');
        else if (data.name === 'write_file') showInfo('✏️ 文件已写入');
        else if (data.name === 'bash') showInfo('💻 命令执行完成');
        break;
      case 'todo':
        renderTodoList(data);
        break;
      case 'error':
        showError(data);
        break;
      case 'done':
        // 完成
        break;
    }
  } catch (e) {
    console.error('[SSE] 解析错误:', e);
  }
}

function renderMessages(messages) {
  $('messages').innerHTML = messages.map(m =>
    '<div class="message ' + m.role + '">' +
    '<div class="role">' + (m.role === 'user' ? '你' : 'AI') + '</div>' +
    '<div class="content">' + formatContent(m.content) + '</div></div>'
  ).join('');
  scrollToBottom();
}

function formatContent(content) {
  // 检查是否是历史摘要
  if (content.startsWith('[历史对话摘要]') || content.startsWith('[工具结果]')) {
    return '<div class="tool-result">' + escapeHtml(content) + '</div>';
  }
  // 检查是否包含代码块
  if (content.includes('```')) {
    return formatCodeBlocks(content);
  }
  return escapeHtml(content);
}

function formatCodeBlocks(content) {
  return content.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    return '<pre class="code-block"><code class="language-' + lang + '">' + escapeHtml(code.trim()) + '</code></pre>';
  }).replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
}

function appendMessage(role, content) {
  const div = document.createElement('div');
  div.className = 'message ' + role;
  div.innerHTML = '<div class="role">' + (role === 'user' ? '你' : 'AI') + '</div>' +
    '<div class="content">' + formatContent(content) + '</div>';
  $('messages').appendChild(div);
  scrollToBottom();
}

function startStream() {
  const div = document.createElement('div');
  div.className = 'message assistant streaming';
  div.innerHTML = '<div class="role">AI</div><div class="content"><span class="typing"></span></div>';
  $('messages').appendChild(div);
  scrollToBottom();
}

function appendStreamText(text) {
  const el = $('messages').querySelector('.streaming .content');
  if (el) {
    const t = el.querySelector('.typing');
    if (t) t.remove();
    el.textContent += text;
    scrollToBottom();
  }
}

function finishStream() {
  const el = $('messages').querySelector('.streaming');
  if (el) {
    el.classList.remove('streaming');
    const contentEl = el.querySelector('.content');
    if (contentEl) {
      contentEl.innerHTML = formatCodeBlocks(contentEl.textContent);
    }
  }
  // 隐藏进度面板
  hideProgressPanel();
}

function showError(msg) {
  const el = $('messages').querySelector('.streaming');
  if (el) el.remove();
  appendMessage('assistant', '❌ 错误: ' + msg);
  hideProgressPanel();
}

// 进度面板
function renderProgressPanel(data) {
  let panel = document.querySelector('.progress-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'progress-panel';
    $('messages').appendChild(panel);
  }
  
  const { current, total, currentTask, logs } = data;
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  
  panel.innerHTML = 
    '<div class="progress-header">' +
    '<span class="progress-title">📋 执行进度</span>' +
    '<span class="progress-percent">' + current + '/' + total + ' (' + percent + '%)</span>' +
    '</div>' +
    '<div class="progress-bar">' +
    '<div class="progress-fill" style="width: ' + percent + '%"></div>' +
    '</div>' +
    (currentTask ? '<div class="progress-current">🔄 ' + escapeHtml(currentTask) + '</div>' : '') +
    (logs && logs.length > 0 ? 
      '<div class="progress-logs">' + 
      logs.map(l => '<div class="log-item">' + escapeHtml(l) + '</div>').join('') + 
      '</div>' : '');
  
  scrollToBottom();
}

function hideProgressPanel() {
  const panel = document.querySelector('.progress-panel');
  if (panel) {
    setTimeout(() => panel.remove(), 2000);
  }
}

// 命令确认
function showCommandConfirm(confirmId, command) {
  finishStream();
  const div = document.createElement('div');
  div.className = 'message assistant command-confirm';
  div.innerHTML = '<div class="role">⚠️ 确认</div><div class="content">' +
    '<div class="cmd-text">$ ' + escapeHtml(command) + '</div>' +
    '<div class="cmd-actions">' +
    '<button class="btn-approve">✓ 执行</button>' +
    '<button class="btn-cancel">✗ 取消</button>' +
    '</div></div>';
  $('messages').appendChild(div);
  scrollToBottom();

  div.querySelector('.btn-approve').onclick = () => {
    div.remove();
    startStream();
    state.ws.send(JSON.stringify({ type: 'confirm_command', confirmId, approved: true }));
  };
  div.querySelector('.btn-cancel').onclick = () => {
    div.remove();
    appendMessage('assistant', '命令已取消');
  };
}

// 命令执行结果
let cmdCounter = 0;
let cmdStack = [];

function appendCommandBox(command) {
  cmdCounter++;
  const cmdId = 'cmd-' + cmdCounter;
  const div = document.createElement('div');
  div.className = 'message assistant command-box';
  div.id = cmdId;
  div.innerHTML = '<div class="role">💻 命令</div>' +
    '<div class="cmd-header">$ ' + escapeHtml(command) + '</div>' +
    '<div class="cmd-output"><span class="running">⏳ 执行中...</span></div>';
  $('messages').appendChild(div);
  scrollToBottom();
  cmdStack.push(cmdId);
}

function updateCommandResult(command, success, stdout, stderr) {
  let targetBox = null;
  if (cmdStack.length > 0) {
    const cmdId = cmdStack.shift();
    targetBox = $(cmdId);
  }

  if (!targetBox) {
    const boxes = document.querySelectorAll('.command-box .running');
    if (boxes.length > 0) {
      targetBox = boxes[0].closest('.command-box');
    }
  }

  if (!targetBox) return;

  const output = targetBox.querySelector('.cmd-output');
  if (output) {
    output.innerHTML = '<span class="' + (success ? 'success' : 'error') + '">' +
      (success ? '✓ 成功' : '✗ 失败') + '</span>' +
      (stdout ? '<pre>' + escapeHtml(stdout) + '</pre>' : '') +
      (stderr ? '<pre class="error">' + escapeHtml(stderr) + '</pre>' : '');
  }
  scrollToBottom();
}

// 询问用户
function showAskUser(askId, question, header, options) {
  finishStream();
  
  const div = document.createElement('div');
  div.className = 'message assistant ask-user';
  
  let optionsHtml = '';
  if (options && options.length > 0) {
    optionsHtml = '<div class="ask-options">' +
      options.map((opt, i) => 
        '<button class="ask-option" data-value="' + i + '">' +
        '<span class="opt-label">' + escapeHtml(opt.label) + '</span>' +
        '<span class="opt-desc">' + escapeHtml(opt.description) + '</span>' +
        '</button>'
      ).join('') +
      '<input type="text" class="ask-input" placeholder="或输入其他答案...">' +
      '</div>';
  } else {
    optionsHtml = '<input type="text" class="ask-input" placeholder="输入你的回答...">' +
      '<button class="ask-submit">提交</button>';
  }
  
  div.innerHTML = '<div class="role">❓ ' + escapeHtml(header || '问题') + '</div>' +
    '<div class="content">' +
    '<div class="ask-question">' + escapeHtml(question) + '</div>' +
    optionsHtml +
    '</div>';
  
  $('messages').appendChild(div);
  scrollToBottom();
  
  const input = div.querySelector('.ask-input');
  const submitBtn = div.querySelector('.ask-submit');
  
  div.querySelectorAll('.ask-option').forEach(btn => {
    btn.onclick = () => {
      const value = btn.dataset.value;
      state.ws.send(JSON.stringify({ type: 'ask_response', askId, answer: options[value].label }));
      div.remove();
      startStream();
    };
  });
  
  if (submitBtn) {
    submitBtn.onclick = () => {
      const answer = input.value.trim();
      if (answer) {
        state.ws.send(JSON.stringify({ type: 'ask_response', askId, answer }));
        div.remove();
        startStream();
      }
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter') submitBtn.click();
    };
  }
  
  if (input) input.focus();
}

// 任务列表（侧边栏）
function renderTodoList(todos) {
  if (!todos || todos.length === 0) return;
  
  let panel = document.querySelector('.todo-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'todo-panel';
    document.querySelector('.sidebar').appendChild(panel);
  }
  
  panel.innerHTML = '<h3>任务进度</h3>' +
    '<div class="todo-list">' +
    todos.map(t => {
      const statusIcon = {
        'pending': '⏳',
        'in_progress': '🔄',
        'completed': '✅',
        'failed': '❌'
      }[t.status] || '⏳';
      return '<div class="todo-item ' + t.status + '">' +
        '<span class="todo-icon">' + statusIcon + '</span>' +
        '<span class="todo-text">' + escapeHtml(t.task) + '</span>' +
        '</div>';
    }).join('') +
    '</div>';
  
  const allCompleted = todos.every(t => t.status === 'completed');
  if (allCompleted) {
    setTimeout(() => { if (panel) panel.remove(); }, 3000);
  }
}

function scrollToBottom() {
  const el = document.querySelector('.chat-container');
  if (el) el.scrollTop = el.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 切换预设
async function usePreset(name) {
  if (!name) return;
  const res = await fetch(API_BASE + '/presets/' + encodeURIComponent(name) + '/use', { method: 'POST' });
  const { success } = await res.json();
  if (success) {
    localStorage.setItem('selectedModel', name);
    showInfo('已切换模型: ' + name);
  }
}

function showInfo(msg) {
  const el = document.createElement('div');
  el.className = 'info-toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

// 事件绑定
function setupEventListeners() {
  $('send-btn').onclick = sendMessage;
  $('user-input').onkeydown = e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };
  $('new-conversation').onclick = createConversation;
  $('preset-select').onchange = e => usePreset(e.target.value);
  
  // 配置模态框事件
  $('config-btn').onclick = openConfigModal;
  $('modal-close').onclick = closeConfigModal;
  $('config-cancel').onclick = closeConfigModal;
  $('config-save').onclick = saveConfig;
  $('config-type').onchange = e => onModelTypeChange(e.target.value);
}

// 模型类型预设配置
const MODEL_PRESETS = {
  'claude-code': {
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-20250514',
    hint: 'Claude Code 官方 API'
  },
  'opencode': {
    baseUrl: 'https://api.opencode.ai/v1',
    model: 'claude-sonnet-4-20250514',
    hint: 'OpenCode 兼容 API'
  },
  'openclaw': {
    baseUrl: 'https://api.openclaw.ai/v1',
    model: 'claude-sonnet-4-20250514',
    hint: 'OpenClaw 代理 API'
  },
  'claude-sonnet': {
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-20250514',
    hint: 'Claude Sonnet 4'
  },
  'claude-opus': {
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-opus-4-20250514',
    hint: 'Claude Opus 4'
  },
  'gpt-4o': {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    hint: 'GPT-4o'
  },
  'gpt-4-turbo': {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4-turbo',
    hint: 'GPT-4 Turbo'
  },
  'deepseek': {
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-coder',
    hint: 'DeepSeek Coder'
  },
  'qwen': {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-coder-plus',
    hint: '通义千问'
  },
  'moonshot': {
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    hint: '月之暗面 Kimi'
  },
  'zhipu': {
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4',
    hint: '智谱 GLM-4'
  }
};

// 配置模态框
function openConfigModal() {
  renderPresetList();
  resetConfigForm();
  $('config-modal').classList.add('active');
}

function closeConfigModal() {
  $('config-modal').classList.remove('active');
  resetConfigForm();
}

function resetConfigForm() {
  $('config-name').value = '';
  $('config-api-key').value = '';
  $('config-base-url').value = '';
  $('config-model').value = '';
  $('config-type').value = '';
  $('edit-old-name').value = '';
  $('form-title').textContent = '添加新模型';
}

// 渲染模型列表
async function renderPresetList() {
  const res = await fetch(API_BASE + '/presets');
  const { success, data } = await res.json();

  if (!success || !data || data.length === 0) {
    $('preset-list').innerHTML = '<div class="preset-empty">暂无保存的模型配置</div>';
    return;
  }

  $('preset-list').innerHTML = data.map(p => `
    <div class="preset-item" data-name="${escapeHtml(p.name)}">
      <div class="preset-info">
        <span class="preset-name">${escapeHtml(p.name)}</span>
        <span class="preset-model">${escapeHtml(p.model)}</span>
      </div>
      <div class="preset-actions">
        <button class="btn btn-small btn-edit" data-name="${escapeHtml(p.name)}">编辑</button>
        <button class="btn btn-small btn-danger btn-delete" data-name="${escapeHtml(p.name)}">删除</button>
      </div>
    </div>
  `).join('');

  // 绑定编辑按钮
  $('preset-list').querySelectorAll('.btn-edit').forEach(btn => {
    btn.onclick = () => editPreset(btn.dataset.name);
  });

  // 绑定删除按钮
  $('preset-list').querySelectorAll('.btn-delete').forEach(btn => {
    btn.onclick = () => deletePreset(btn.dataset.name);
  });
}

// 编辑预设
async function editPreset(name) {
  const res = await fetch(API_BASE + '/presets');
  const { success, data } = await res.json();

  if (!success) return;

  const preset = data.find(p => p.name === name);
  if (!preset) return;

  $('edit-old-name').value = name;
  $('config-name').value = preset.name;
  $('config-api-key').value = preset.apiKey || '';
  $('config-base-url').value = preset.baseUrl || '';
  $('config-model').value = preset.model || '';
  $('config-type').value = '';
  $('form-title').textContent = '编辑模型: ' + name;
}

// 删除预设
async function deletePreset(name) {
  if (!confirm('确定要删除模型 "' + name + '" 吗？')) return;

  const res = await fetch(API_BASE + '/presets/' + encodeURIComponent(name), {
    method: 'DELETE'
  });

  const { success, error } = await res.json();
  if (success) {
    showInfo('已删除: ' + name);
    renderPresetList();
    loadPresets();
    // 如果删除的是当前选中的模型，清除选择
    if ($('preset-select').value === name) {
      $('preset-select').value = '';
      localStorage.removeItem('selectedModel');
    }
  } else {
    showInfo('删除失败: ' + (error || '未知错误'));
  }
}

function onModelTypeChange(type) {
  const preset = MODEL_PRESETS[type];
  if (preset) {
    $('config-base-url').value = preset.baseUrl;
    $('config-model').value = preset.model;
    $('config-model').placeholder = preset.hint;
  }
}

async function saveConfig() {
  const apiKey = $('config-api-key').value.trim();
  const baseUrl = $('config-base-url').value.trim();
  const model = $('config-model').value.trim();

  if (!apiKey) {
    showInfo('请输入 API Key');
    return;
  }

  if (!model) {
    showInfo('请输入模型名称');
    return;
  }

  try {
    // 保存到文件
    const res = await fetch(API_BASE + '/presets/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: model, // 使用模型名作为预设名
        apiKey,
        baseUrl: baseUrl || undefined,
        model
      })
    });

    const { success, error } = await res.json();
    if (success) {
      showInfo('配置已保存');
      closeConfigModal();
      // 重新加载预设列表
      await loadPresets();
      // 选中新保存的预设
      $('preset-select').value = model;
      localStorage.setItem('selectedModel', model);
    } else {
      showInfo('保存失败: ' + (error || '未知错误'));
    }
  } catch (error) {
    showInfo('保存失败: ' + error.message);
  }
}

init();