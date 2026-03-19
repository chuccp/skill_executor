/**
 * API 请求封装
 */

window.loadPresets = async function() {
  const res = await fetch(window.API_BASE + '/presets');
  const result = await res.json();
  if (result.success) {
    window.state.presets = result.data || [];
    window.$('preset-select').innerHTML = '<option value="">选择模型</option>' +
      window.state.presets.map(function(p) { return '<option value="' + p.name + '">' + p.name + '</option>'; }).join('');

    const lastSelected = localStorage.getItem('selectedModel');
    if (lastSelected && window.state.presets.find(function(p) { return p.name === lastSelected; })) {
      window.$('preset-select').value = lastSelected;
    } else if (window.state.presets.length > 0) {
      window.$('preset-select').value = window.state.presets[0].name;
      localStorage.setItem('selectedModel', window.state.presets[0].name);
    }
  }
};

window.loadConversations = async function() {
  const res = await fetch(window.API_BASE + '/conversations/meta');
  const result = await res.json();
  if (result.success) {
    window.state.conversations = result.data || [];
    window.renderConversationList();
  }
};

window.loadSkills = async function() {
  const res = await fetch(window.API_BASE + '/skills');
  const result = await res.json();
  if (result.success) {
    window.state.skills = result.data || [];
    window.$('skill-select').innerHTML = '<option value="">无 Skill</option>' +
      window.state.skills.map(function(s) { return '<option value="' + s.name + '">' + s.name + '</option>'; }).join('');
    window.renderSkillManagerList();
  }
};

window.loadWorkdir = async function() {
  try {
    const res = await fetch(window.API_BASE + '/workdir');
    const result = await res.json();
    if (result.success && result.data && result.data.path) {
      window.state.workdir.path = result.data.path;
      window.$('workdir-input').value = result.data.path;
      await window.loadWorkdirList(result.data.path);
    }
  } catch (e) {}
};

window.loadWorkdirList = async function(path) {
  const url = path ? (window.API_BASE + '/workdir/list?path=' + encodeURIComponent(path)) : (window.API_BASE + '/workdir/list');
  const res = await fetch(url);
  const result = await res.json();
  if (!result.success) {
    window.showError(result.error || '读取目录失败');
    return;
  }
  window.state.workdir.path = result.data.path;
  window.state.workdir.items = result.data.items || [];
  window.$('workdir-input').value = result.data.path;
  window.renderWorkdirList();
};

window.setWorkdir = async function(path) {
  if (!path) return;
  const res = await fetch(window.API_BASE + '/workdir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: path })
  });
  const result = await res.json();
  if (!result.success) {
    window.showError(result.error || '切换目录失败');
    return;
  }
  window.state.workdir.path = result.data.path;
  window.$('workdir-input').value = result.data.path;
  await window.loadWorkdirList(result.data.path);
  window.showInfo('✅ 已切换目录');
};

window.refreshSkills = async function() {
  const btn = window.$('skill-refresh');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '...';
  }
  try {
    await fetch(window.API_BASE + '/skills/reload', { method: 'POST' });
    await window.loadSkills();
    window.showInfo('✅ 已刷新技能');
  } catch (e) {
    window.showError('刷新技能失败');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '↻';
    }
  }
};

window.createConversation = async function() {
  const res = await fetch(window.API_BASE + '/conversations', { method: 'POST' });
  const result = await res.json();
  if (result.success) {
    window.state.conversations.unshift({
      id: result.data.id,
      createdAt: result.data.createdAt,
      updatedAt: result.data.updatedAt,
      messageCount: 0
    });
    window.renderConversationList();
    window.selectConversation(result.data.id);
  }
};

window.deleteConversation = async function(id) {
  let confirmed = false;
  if (window.__TAURI__) {
    const ask = window.__TAURI__.dialog.ask;
    confirmed = await ask('确定要删除这个会话吗？', {
      title: '确认删除',
      kind: 'warning',
      okLabel: '删除',
      cancelLabel: '取消'
    });
  } else {
    confirmed = confirm('确定要删除这个会话吗？');
  }

  if (!confirmed) return;

  try {
    const res = await fetch(window.API_BASE + '/conversations/' + id, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      window.state.conversations = window.state.conversations.filter(function(c) { return c.id !== id; });
      window.renderConversationList();
      const modal = window.$('conversation-modal');
      if (modal && modal.classList.contains('active')) {
        window.renderConversationModalList();
      }

      if (window.state.currentConversationId === id) {
        localStorage.removeItem('lastConversationId');
        if (window.state.conversations.length > 0) {
          window.selectConversation(window.state.conversations[0].id);
        } else {
          window.createConversation();
        }
      }
      window.showInfo('✅ 会话已删除');
    } else {
      window.showError('删除失败: ' + (result.error || '未知错误'));
    }
  } catch (error) {
    window.showError('删除失败: ' + error.message);
  }
};

window.selectConversation = async function(id, moveToTop) {
  window.state.currentConversationId = id;
  localStorage.setItem('lastConversationId', id);

  if (moveToTop) {
    const index = window.state.conversations.findIndex(function(c) { return c.id === id; });
    if (index > 0) {
      const selected = window.state.conversations.splice(index, 1)[0];
      window.state.conversations.unshift(selected);
      window.renderConversationList();
    }
  }

  document.querySelectorAll('.conversation-list li').forEach(function(li) {
    li.classList.toggle('active', li.dataset.id === id);
  });

  const res = await fetch(window.API_BASE + '/conversations/' + id);
  const result = await res.json();
  if (result.success) {
    window.renderMessages(result.data.messages || []);
  }
};