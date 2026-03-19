const API_BASE = '/api';

const state = {
  currentConversationId: null,
  conversations: [],  // 会话元数据列表
  skills: [],
  presets: [],
  ws: null,
  workdir: {
    path: '',
    items: []
  }
};

const $ = id => document.getElementById(id);

// 初始化
async function init() {
  connectWebSocket();
  await loadPresets();
  await loadConversations();
  await loadSkills();
  await loadWorkdir();
  
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
  setupModalDrag();
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
    renderSkillManagerList();
  }
}

async function loadWorkdir() {
  try {
    const res = await fetch(API_BASE + '/workdir');
    const { success, data } = await res.json();
    if (success && data && data.path) {
      state.workdir.path = data.path;
      $('workdir-input').value = data.path;
      await loadWorkdirList(data.path);
    }
  } catch (e) {}
}

async function loadWorkdirList(path) {
  const url = path ? (API_BASE + '/workdir/list?path=' + encodeURIComponent(path)) : (API_BASE + '/workdir/list');
  const res = await fetch(url);
  const { success, data, error } = await res.json();
  if (!success) {
    showError(error || '读取目录失败');
    return;
  }
  state.workdir.path = data.path;
  state.workdir.items = data.items || [];
  $('workdir-input').value = data.path;
  renderWorkdirList();
}

async function setWorkdir(path) {
  if (!path) return;
  const res = await fetch(API_BASE + '/workdir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  });
  const { success, data, error } = await res.json();
  if (!success) {
    showError(error || '切换目录失败');
    return;
  }
  state.workdir.path = data.path;
  $('workdir-input').value = data.path;
  await loadWorkdirList(data.path);
  showInfo('✅ 已切换目录');
}

function renderWorkdirList() {
  const listEl = $('workdir-list');
  if (!listEl) return;
  const items = state.workdir.items || [];
  if (!items.length) {
    listEl.innerHTML = '<div class="workdir-empty">目录为空</div>';
    return;
  }

  const dirs = items.filter(i => i.type === 'directory');
  const files = items.filter(i => i.type !== 'directory');
  const sorted = dirs.concat(files);

  listEl.innerHTML = sorted.map(item => {
    const isDir = item.type === 'directory';
    const icon = isDir ? '📁' : '📄';
    return '<button class="workdir-item ' + (isDir ? 'dir' : 'file') + '" data-name="' + encodeURIComponent(item.name) + '">' +
      '<span class="workdir-icon">' + icon + '</span>' +
      '<span class="workdir-name">' + escapeHtml(item.name) + '</span>' +
    '</button>';
  }).join('');

  listEl.querySelectorAll('.workdir-item.dir').forEach(btn => {
    btn.onclick = () => {
      const next = joinPath(state.workdir.path, decodeURIComponent(btn.dataset.name));
      setWorkdir(next);
    };
  });
}

function joinPath(basePath, name) {
  if (!basePath) return name;
  const sep = basePath.includes('\\') ? '\\' : '/';
  if (basePath.endsWith(sep)) return basePath + name;
  return basePath + sep + name;
}

function getParentPath(p) {
  if (!p) return '';
  let path = p.replace(/[\\/]+$/, '');
  const sep = path.includes('\\') ? '\\' : '/';
  if (sep === '\\' && /^[A-Za-z]:$/.test(path)) return path + '\\';
  const idx = path.lastIndexOf(sep);
  if (idx <= 0) return path;
  return path.slice(0, idx);
}

async function refreshSkills() {
  const btn = $('skill-refresh');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '...';
  }
  try {
    await fetch(API_BASE + '/skills/reload', { method: 'POST' });
    await loadSkills();
    showInfo('✅ 已刷新技能');
  } catch (e) {
    showError('刷新技能失败');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '↻';
    }
  }
}

function renderSkillManagerList() {
  const listEl = $('skill-list');
  if (!listEl) return;
  if (!state.skills.length) {
    listEl.innerHTML = '<div class="skill-empty">暂无技能</div>';
    $('skill-detail').textContent = '选择一个技能查看详情';
    return;
  }

  listEl.innerHTML = state.skills.map(s =>
    '<button class="skill-item" data-name="' + encodeURIComponent(s.name) + '">' +
      '<div class="skill-name">' + escapeHtml(s.name) + '</div>' +
      '<div class="skill-desc">' + escapeHtml(s.description || '') + '</div>' +
    '</button>'
  ).join('');

  listEl.querySelectorAll('.skill-item').forEach(btn => {
    btn.onclick = () => showSkillDetail(decodeURIComponent(btn.dataset.name));
  });
}

function showSkillDetail(name) {
  const skill = state.skills.find(s => s.name === name);
  const detailEl = $('skill-detail');
  if (!detailEl || !skill) return;

  const when = (skill.trigger && skill.trigger.when) ? skill.trigger.when : [];
  const notWhen = (skill.trigger && skill.trigger.notWhen) ? skill.trigger.notWhen : [];

  detailEl.innerHTML = [
    '<div class="skill-title">' + escapeHtml(skill.name) + '</div>',
    '<div class="skill-meta">文件: ' + escapeHtml(skill.path || '') + '</div>',
    skill.description ? '<div class="skill-meta">' + escapeHtml(skill.description) + '</div>' : '',
    '<div class="skill-section-title">触发条件</div>',
    '<div class="skill-meta">当包含: ' + escapeHtml(when.join(', ') || '无') + '</div>',
    '<div class="skill-meta">排除: ' + escapeHtml(notWhen.join(', ') || '无') + '</div>',
    '<div class="skill-section-title">PROMPT</div>',
    '<pre class="skill-prompt">' + escapeHtml(skill.prompt || '') + '</pre>'
  ].join('');

  const listEl = $('skill-list');
  if (listEl) {
    listEl.querySelectorAll('.skill-item').forEach(item => {
      item.classList.toggle('active', item.dataset.name === name);
    });
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

async function deleteConversation(id) {
  // 在 Tauri 环境下使用 Tauri 对话框，否则使用原生 confirm
  let confirmed = false;
  if (window.__TAURI__) {
    const { ask } = window.__TAURI__.dialog;
    confirmed = await ask('确定要删除这个会话吗？', {
      title: '确认删除',
      kind: 'warning',
      okLabel: '删除',
      cancelLabel: '取消'
    });
  } else {
    confirmed = confirm('确定要删除这个会话吗？');
  }
  
  if (!confirmed) {
    console.log('[DEBUG] 用户取消了删除');
    return;
  }

  console.log('[DEBUG] 开始删除会话:', id);
  try {
    const res = await fetch(API_BASE + '/conversations/' + id, { method: 'DELETE' });
    const data = await res.json();
    console.log("[DEBUG] 删除响应:", data);
    const success = data && data.success;
    if (success) {
      state.conversations = state.conversations.filter(c => c.id !== id);
      renderConversationList();
      // 更新会话模态框（如果打开的话）
      const modal = $('conversation-modal');
      if (modal && modal.classList.contains('active')) {
        renderConversationModalList();
      }
      
      // 如果删除的是当前会话，选择其他会话
      if (state.currentConversationId === id) {
        localStorage.removeItem('lastConversationId');
        if (state.conversations.length > 0) {
          selectConversation(state.conversations[0].id);
        } else {
          createConversation();
        }
      }
      showInfo('✅ 会话已删除');
    } else {
      showError('删除失败: ' + (data.error || '未知错误'));
    }
  } catch (error) {
    console.error('[DEBUG] 删除异常:', error);
    showError('删除失败: ' + error.message);
  }
}

async function selectConversation(id) {
  state.currentConversationId = id;
  localStorage.setItem('lastConversationId', id);
  
  // 将选中的会话移到列表第一位
  const index = state.conversations.findIndex(c => c.id === id);
  if (index > 0) {
    const [selected] = state.conversations.splice(index, 1);
    state.conversations.unshift(selected);
    renderConversationList();
  }
  
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
  const MAX_VISIBLE = 3;
  const visibleConversations = state.conversations.slice(0, MAX_VISIBLE);
  const hasMore = state.conversations.length > MAX_VISIBLE;
  
  let html = visibleConversations.map(c => {
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
  
  if (hasMore) {
    html += '<li class="conv-more" data-action="more">' +
      '<span class="conv-more-text">更多 (' + (state.conversations.length - MAX_VISIBLE) + ')</span>' +
      '</li>';
  }
  
  $('conversation-list').innerHTML = html;
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
  if (!content) return;
  if (!state.currentConversationId) return;
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
      finishStream();
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const processEventBlock = (block) => {
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
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
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

    finishStream();
    loadConversations();
  } catch (error) {
    showError('连接错误: ' + error.message);
    finishStream();
  }
}

// 读取文件内容
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
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
  }).replace(/`([^`]+)`/g, (match, inline) => {
    return '<code class="inline-code">' + escapeHtml(inline) + '</code>';
  });
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
    state.ws.send(JSON.stringify({ type: 'confirm_command', confirmId, approved: false }));
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
  if (!todos || todos.length === 0) {
    const panel = document.querySelector('.todo-panel');
    if (panel) panel.remove();
    return;
  }
  
  let panel = document.querySelector('.todo-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'todo-panel floating';
    panel.innerHTML = '' +
      '<div class="todo-header">' +
        '<div class="todo-title">任务进度</div>' +
      '</div>' +
      '<div class="todo-list"></div>' +
      '<div class="todo-resize" title="拖拽调整大小"></div>';
    document.body.appendChild(panel);
    attachTodoPanelBehavior(panel);
  }
  
  const listEl = panel.querySelector('.todo-list');
  if (listEl) {
    listEl.innerHTML = todos.map(t => {
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
    }).join('');
  }
  
  const allCompleted = todos.every(t => t.status === 'completed');
  if (allCompleted) {
    setTimeout(() => { if (panel) panel.remove(); }, 3000);
  }
}

function attachTodoPanelBehavior(panel) {
  const header = panel.querySelector('.todo-header');
  const resizeHandle = panel.querySelector('.todo-resize');
  if (!header || !resizeHandle) return;

  let dragging = false;
  let resizing = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  let startWidth = 0;
  let startHeight = 0;

  header.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    const rect = panel.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    document.body.classList.add('no-select');
  });

  resizeHandle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    resizing = true;
    const rect = panel.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    startWidth = rect.width;
    startHeight = rect.height;
    document.body.classList.add('no-select');
    e.stopPropagation();
  });

  window.addEventListener('mousemove', (e) => {
    if (dragging) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const nextLeft = Math.max(8, Math.min(window.innerWidth - panel.offsetWidth - 8, startLeft + dx));
      const nextTop = Math.max(8, Math.min(window.innerHeight - panel.offsetHeight - 8, startTop + dy));
      panel.style.left = nextLeft + 'px';
      panel.style.top = nextTop + 'px';
      panel.style.right = 'auto';
    } else if (resizing) {
      const dw = e.clientX - startX;
      const dh = e.clientY - startY;
      const nextWidth = Math.max(220, Math.min(window.innerWidth - panel.getBoundingClientRect().left - 8, startWidth + dw));
      const nextHeight = Math.max(140, Math.min(window.innerHeight - panel.getBoundingClientRect().top - 8, startHeight + dh));
      panel.style.width = nextWidth + 'px';
      panel.style.height = nextHeight + 'px';
      panel.style.maxHeight = 'none';
    }
  });

  window.addEventListener('mouseup', () => {
    if (dragging || resizing) {
      dragging = false;
      resizing = false;
      document.body.classList.remove('no-select');
    }
  });
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
  $('skill-refresh').onclick = refreshSkills;
  $('skill-manage-btn').onclick = openSkillModal;
  $('conversation-list').addEventListener('click', (e) => {
    e.stopPropagation();
    const target = e.target;

    // 处理删除按钮
    const deleteBtn = target.closest('.conv-delete');
    if (deleteBtn) {
      e.preventDefault();
      e.stopImmediatePropagation();
      const id = deleteBtn.dataset.id;
      console.log('[DEBUG] 删除按钮被点击，ID:', id);
      deleteConversation(id);
      return;
    }

    // 处理"更多"按钮
    const moreBtn = target.closest('.conv-more');
    if (moreBtn) {
      openConversationModal();
      return;
    }

    // 处理会话选择
    const li = target.closest('li[data-id]');
    if (li) {
      selectConversation(li.dataset.id);
    }
  });
  $('workdir-set').onclick = () => setWorkdir($('workdir-input').value.trim());
  $('workdir-up').onclick = () => {
    const parent = getParentPath($('workdir-input').value.trim());
    if (parent) setWorkdir(parent);
  };
  $('workdir-input').onkeydown = e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setWorkdir($('workdir-input').value.trim());
    }
  };

  // 配置模态框事件
  $('config-btn').onclick = openConfigModal;
  $('modal-close').onclick = closeConfigModal;
  $('config-cancel').onclick = closeConfigModal;
  $('config-save').onclick = saveConfig;
  $('config-type').onchange = e => onModelTypeChange(e.target.value);
  $('skill-modal-close').onclick = closeSkillModal;
  $('skill-modal-close-footer').onclick = closeSkillModal;
  
  // 会话模态框事件
  $('conv-modal-close').onclick = closeConversationModal;
  $('conv-modal-close-footer').onclick = closeConversationModal;
  $('conversation-modal-list').addEventListener('click', (e) => {
    const target = e.target;
    
    // 处理删除
    const deleteBtn = target.closest('.conv-modal-delete');
    if (deleteBtn) {
      e.stopPropagation();
      deleteConversation(deleteBtn.dataset.id);
      return;
    }
    
    // 处理选择
    const item = target.closest('.conv-modal-item');
    if (item) {
      selectConversation(item.dataset.id);
      closeConversationModal();
    }
  });

  // 输入框拖拽支持
  const inputArea = document.querySelector('.input-area');

  // 网页拖拽 - 读取文件内容
  inputArea.addEventListener('dragover', e => {
    e.preventDefault();
    inputArea.classList.add('drag-over');
  });

  inputArea.addEventListener('dragleave', e => {
    e.preventDefault();
    inputArea.classList.remove('drag-over');
  });

  inputArea.addEventListener('drop', e => {
    e.preventDefault();
    inputArea.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      files.forEach(async file => {
        try {
          const text = await file.text();
          const input = $('user-input');
          input.value += `\n\n--- 文件: ${file.name} ---\n${text}\n`;
        } catch (err) {
          console.error('读取文件失败:', err);
        }
      });
    }
  });

  // Tauri 拖拽 - 获取文件路径
  if (window.__TAURI__) {
    const { listen } = window.__TAURI__.event;

    listen('file-drop', (event) => {
      const paths = event.payload;
      if (Array.isArray(paths) && paths.length > 0) {
        const pathText = paths.map(p => '@' + p).join(' ');
        const input = $('user-input');
        const currentText = input.value;
        const cursorPos = input.selectionStart;

        const before = currentText.substring(0, cursorPos);
        const after = currentText.substring(cursorPos);
        const insertText = (before && !before.endsWith(' ') && !before.endsWith('\n') ? ' ' : '') + pathText + ' ';
        input.value = before + insertText + after;
        input.selectionStart = input.selectionEnd = before.length + insertText.length;
        input.focus();
      }
    });

    // 刷新页面快捷键 (Cmd+R / Ctrl+R)
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
        e.preventDefault();
        location.reload();
      }
    });
  }
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
  const modal = $('config-modal');
  const content = modal ? modal.querySelector('.modal-content') : null;
  if (content) applyModalSize(content);
  if (modal) modal.classList.add('active');
}

function closeConfigModal() {
  const modal = $('config-modal');
  if (modal) {
    modal.classList.remove('active');
    resetModalPosition(modal);
  }
  resetConfigForm();
}

// 技能管理模态框
async function openSkillModal() {
  await refreshSkills();
  const modal = $('skill-modal');
  const content = modal ? modal.querySelector('.modal-content') : null;
  if (content) applyModalSize(content);
  if (modal) modal.classList.add('active');
}

function closeSkillModal() {
  const modal = $('skill-modal');
  if (modal) {
    modal.classList.remove('active');
    resetModalPosition(modal);
  }
}

// 会话模态框
function openConversationModal() {
  renderConversationModalList();
  const modal = $('conversation-modal');
  const content = modal ? modal.querySelector('.modal-content') : null;
  if (content) applyModalSize(content);
  if (modal) modal.classList.add('active');
}

function closeConversationModal() {
  const modal = $('conversation-modal');
  if (modal) {
    modal.classList.remove('active');
    resetModalPosition(modal);
  }
}

// 重置模态框位置（关闭时调用，让下次打开居中）
function resetModalPosition(modal) {
  const content = modal.querySelector('.modal-content');
  if (!content) return;
  content.style.position = '';
  content.style.left = '';
  content.style.top = '';
  content.style.margin = '';
  content.dataset.dragged = '0';
}

// 只应用保存的尺寸（不应用位置）
function applyModalSize(content) {
  if (!content) return;
  // 检查是否有保存的状态
  const modalId = content.closest('.modal')?.id;
  if (!modalId) return;
  
  const raw = localStorage.getItem('modal_state_' + modalId);
  if (!raw) return;
  try {
    const state = JSON.parse(raw);
    if (state.width) {
      content.style.width = state.width + 'px';
      content.style.maxWidth = 'none';
    }
    if (state.height) {
      content.style.height = state.height + 'px';
      content.style.maxHeight = 'none';
    }
    // 不再自动应用位置，让弹窗默认居中
  } catch (e) {}
}

function renderConversationModalList() {
  const listEl = $('conversation-modal-list');
  if (!listEl) return;
  
  if (state.conversations.length === 0) {
    listEl.innerHTML = '<div class="conv-modal-empty">暂无会话</div>';
    return;
  }
  
  listEl.innerHTML = state.conversations.map(c => {
    const date = new Date(c.updatedAt || c.createdAt);
    const timeStr = formatTime(date);
    const preview = c.firstUserMessage || c.summary || '新会话';
    
    return '<div class="conv-modal-item ' + (c.id === state.currentConversationId ? 'active' : '') + '" data-id="' + c.id + '">' +
      '<div class="conv-modal-info">' +
      '<span class="conv-modal-time">' + timeStr + '</span>' +
      '<span class="conv-modal-preview">' + escapeHtml(preview.substring(0, 50)) + '</span>' +
      '</div>' +
      '<button class="conv-modal-delete" data-id="' + c.id + '" title="删除">×</button>' +
      '</div>';
  }).join('');
}

function setupModalDrag() {
  enableModalDrag('config-modal');
  enableModalDrag('skill-modal');
  enableModalDrag('conversation-modal');
}

function enableModalDrag(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  const content = modal.querySelector('.modal-content');
  const header = modal.querySelector('.modal-header');
  if (!content || !header) return;

  // 不再初始化时应用状态，让弹窗默认居中

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  header.style.cursor = 'move';

  header.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    const rect = content.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    content.style.margin = '0';
    content.style.position = 'fixed';
    content.style.left = rect.left + 'px';
    content.style.top = rect.top + 'px';
    content.dataset.dragged = '1';
    document.body.classList.add('no-select');
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const nextLeft = Math.max(8, Math.min(window.innerWidth - content.offsetWidth - 8, startLeft + dx));
    const nextTop = Math.max(8, Math.min(window.innerHeight - content.offsetHeight - 8, startTop + dy));
    content.style.left = nextLeft + 'px';
    content.style.top = nextTop + 'px';
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('no-select');
    saveModalState(modalId, content, true);
  });

  const resizeObserver = new ResizeObserver(() => {
    saveModalState(modalId, content, false);
  });
  resizeObserver.observe(content);

  window.addEventListener('resize', () => {
    if (content.dataset.dragged === '1') {
      const rect = content.getBoundingClientRect();
      const clamped = clampModalPosition(rect.left, rect.top, content);
      content.style.left = clamped.left + 'px';
      content.style.top = clamped.top + 'px';
      saveModalState(modalId, content, true);
    }
  });
}

function applyModalState(modalId, content) {
  if (!content) return;
  const raw = localStorage.getItem('modal_state_' + modalId);
  if (!raw) return;
  try {
    const state = JSON.parse(raw);
    if (state.width) {
      content.style.width = state.width + 'px';
      content.style.maxWidth = 'none';
    }
    if (state.height) {
      content.style.height = state.height + 'px';
      content.style.maxHeight = 'none';
    }
    if (state.left !== null && state.top !== null && state.left !== undefined && state.top !== undefined) {
      content.style.position = 'fixed';
      content.style.margin = '0';
      const clamped = clampModalPosition(state.left, state.top, content);
      content.style.left = clamped.left + 'px';
      content.style.top = clamped.top + 'px';
      content.dataset.dragged = '1';
    }
  } catch (e) {}
}

function clampModalPosition(left, top, content) {
  const width = content.offsetWidth || 0;
  const height = content.offsetHeight || 0;
  const maxLeft = Math.max(8, window.innerWidth - width - 8);
  const maxTop = Math.max(8, window.innerHeight - height - 8);
  return {
    left: Math.max(8, Math.min(maxLeft, left)),
    top: Math.max(8, Math.min(maxTop, top))
  };
}

function saveModalState(modalId, content, includePosition) {
  const rect = content.getBoundingClientRect();
  const state = {
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    left: null,
    top: null
  };
  if (includePosition && content.dataset.dragged === '1') {
    state.left = Math.round(rect.left);
    state.top = Math.round(rect.top);
  } else {
    const raw = localStorage.getItem('modal_state_' + modalId);
    if (raw) {
      try {
        const prev = JSON.parse(raw);
        if (prev.left !== null && prev.left !== undefined) state.left = prev.left;
        if (prev.top !== null && prev.top !== undefined) state.top = prev.top;
      } catch (e) {}
    }
  }
  localStorage.setItem('modal_state_' + modalId, JSON.stringify(state));
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
  // 在 Tauri 环境下使用 Tauri 对话框，否则使用原生 confirm
  let confirmed = false;
  if (window.__TAURI__) {
    const { ask } = window.__TAURI__.dialog;
    confirmed = await ask('确定要删除模型 "' + name + '" 吗？', {
      title: '确认删除',
      kind: 'warning',
      okLabel: '删除',
      cancelLabel: '取消'
    });
  } else {
    confirmed = confirm('确定要删除模型 "' + name + '" 吗？');
  }
  
  if (!confirmed) return;

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
  const oldName = $('edit-old-name').value;
  const name = $('config-name').value.trim();
  const apiKey = $('config-api-key').value.trim();
  const baseUrl = $('config-base-url').value.trim();
  const model = $('config-model').value.trim();

  if (!name) {
    showInfo('请输入配置名称');
    return;
  }

  if (!apiKey) {
    showInfo('请输入 API Key');
    return;
  }

  if (!model) {
    showInfo('请输入模型名称');
    return;
  }

  try {
    let res;
    if (oldName) {
      // 编辑模式：更新现有配置
      res = await fetch(API_BASE + '/presets/' + encodeURIComponent(oldName), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, apiKey, baseUrl: baseUrl || undefined, model })
      });
    } else {
      // 新增模式
      res = await fetch(API_BASE + '/presets/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, apiKey, baseUrl: baseUrl || undefined, model })
      });
    }

    const { success, error } = await res.json();
    if (success) {
      showInfo(oldName ? '配置已更新' : '配置已保存');
      renderPresetList();
      await loadPresets();
      // 选中新保存的预设
      $('preset-select').value = name;
      localStorage.setItem('selectedModel', name);
      resetConfigForm();
    } else {
      showInfo('保存失败: ' + (error || '未知错误'));
    }
  } catch (error) {
    showInfo('保存失败: ' + error.message);
  }
}

init();
