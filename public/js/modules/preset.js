/**
 * 预设管理模块
 */

// 预设配置模板
var PRESET_TEMPLATES = {
  'claude-code': { baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514' },
  'opencode': { baseUrl: 'https://api.opencode.ai/v1', model: 'claude-sonnet-4-20250514' },
  'openclaw': { baseUrl: 'https://api.openclaw.cn/v1', model: 'claude-sonnet-4-20250514' },
  'claude-sonnet': { baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514' },
  'claude-opus': { baseUrl: 'https://api.anthropic.com', model: 'claude-opus-4-20250514' },
  'gpt-4o': { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' },
  'gpt-4-turbo': { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4-turbo' },
  'deepseek': { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  'qwen': { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-turbo' },
  'moonshot': { baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  'zhipu': { baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4' }
};

// 显示配置模态框
window.showConfigModal = function() {
  var modal = window.$('config-modal');
  if (modal) {
    modal.classList.add('active');
    window.renderPresetList();
    // 重置表单
    window.$('config-name').value = '';
    window.$('config-api-key').value = '';
    window.$('config-base-url').value = '';
    window.$('config-model').value = '';
    window.$('config-type').value = '';
    window.$('edit-old-name').value = '';
    window.$('form-title').textContent = '添加新模型';
  }
};

// 隐藏配置模态框
window.hideConfigModal = function() {
  var modal = window.$('config-modal');
  if (modal) {
    modal.classList.remove('active');
  }
};

// 显示技能模态框
window.showSkillModal = function() {
  var modal = window.$('skill-modal');
  if (modal) {
    modal.classList.add('active');
    window.renderSkillManagerList();
  }
};

// 隐藏技能模态框
window.hideSkillModal = function() {
  var modal = window.$('skill-modal');
  if (modal) {
    modal.classList.remove('active');
  }
};

// 填充预设配置
window.fillPresetConfig = function(e) {
  var type = e.target.value;
  if (type && PRESET_TEMPLATES[type]) {
    var template = PRESET_TEMPLATES[type];
    window.$('config-base-url').value = template.baseUrl;
    window.$('config-model').value = template.model;
    if (!window.$('config-name').value) {
      window.$('config-name').value = type;
    }
  }
};

// 保存配置
window.saveConfig = async function() {
  var name = window.$('config-name').value.trim();
  var apiKey = window.$('config-api-key').value.trim();
  var baseUrl = window.$('config-base-url').value.trim();
  var model = window.$('config-model').value.trim();
  var oldName = window.$('edit-old-name').value;

  if (!name) {
    window.showError('请输入配置名称');
    return;
  }
  if (!apiKey) {
    window.showError('请输入 API Key');
    return;
  }
  if (!model) {
    window.showError('请输入模型名称');
    return;
  }

  try {
    var res, result;
    
    if (oldName) {
      // 更新现有配置
      res = await fetch(window.API_BASE + '/presets/' + encodeURIComponent(oldName), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, apiKey: apiKey, baseUrl: baseUrl, model: model })
      });
    } else {
      // 创建新配置
      res = await fetch(window.API_BASE + '/presets/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name, apiKey: apiKey, baseUrl: baseUrl, model: model })
      });
    }
    
    result = await res.json();
    if (result.success) {
      await window.loadPresets();
      window.hideConfigModal();
      window.showInfo('✅ 配置已保存');
    } else {
      window.showError(result.error || '保存失败');
    }
  } catch (e) {
    window.showError('保存失败: ' + e.message);
  }
};

window.renderPresetList = function() {
  const list = window.$('preset-list');
  if (!list) return;

  if (!window.state.presets.length) {
    list.innerHTML = '<div class="preset-empty">暂无配置，请添加新模型</div>';
    return;
  }

  list.innerHTML = window.state.presets.map(function(p) {
    return '<div class="preset-item" data-name="' + encodeURIComponent(p.name) + '">' +
      '<div class="preset-info">' +
        '<span class="preset-name">' + window.escapeHtml(p.name) + '</span>' +
        '<span class="preset-model">' + window.escapeHtml(p.model || '') + '</span>' +
      '</div>' +
      '<div class="preset-actions">' +
        '<button class="btn btn-small btn-edit" title="编辑">✎</button>' +
        '<button class="btn btn-small btn-danger preset-delete" title="删除">×</button>' +
      '</div>' +
      '</div>';
  }).join('');

  // 点击选择
  list.querySelectorAll('.preset-item').forEach(function(item) {
    item.onclick = function(e) {
      if (e.target.classList.contains('btn')) return;
      const name = decodeURIComponent(item.dataset.name);
      window.$('preset-select').value = name;
      localStorage.setItem('selectedModel', name);
      window.showInfo('已选择: ' + name);
      window.hideConfigModal();
    };
  });

  // 编辑按钮
  list.querySelectorAll('.btn-edit').forEach(function(btn) {
    btn.onclick = function(e) {
      e.stopPropagation();
      var item = btn.closest('.preset-item');
      var name = decodeURIComponent(item.dataset.name);
      var preset = window.state.presets.find(function(p) { return p.name === name; });
      if (preset) {
        window.$('config-name').value = preset.name;
        window.$('config-api-key').value = preset.apiKey || '';
        window.$('config-base-url').value = preset.baseUrl || '';
        window.$('config-model').value = preset.model || '';
        window.$('edit-old-name').value = preset.name;
        window.$('form-title').textContent = '编辑模型: ' + preset.name;
      }
    };
  });

  // 删除按钮
  list.querySelectorAll('.preset-delete').forEach(function(btn) {
    btn.onclick = async function(e) {
      e.stopPropagation();
      var item = btn.closest('.preset-item');
      var name = decodeURIComponent(item.dataset.name);
      
      // 使用 Tauri 原生确认框或浏览器确认框
      var confirmed = false;
      if (window.__TAURI__ && window.__TAURI__.dialog) {
        confirmed = await window.__TAURI__.dialog.confirm('确定删除配置 "' + name + '"？', { title: '确认删除' });
      } else {
        confirmed = confirm('确定删除配置 ' + name + '？');
      }
      
      if (confirmed) {
        await fetch(window.API_BASE + '/presets/' + encodeURIComponent(name), { method: 'DELETE' });
        await window.loadPresets();
        window.renderPresetList();
        window.showInfo('已删除: ' + name);
      }
    };
  });
};

window.createPreset = async function() {
  const name = window.$('preset-name').value.trim();
  const baseUrl = window.$('preset-url').value.trim();
  const apiKey = window.$('preset-key').value.trim();
  const model = window.$('preset-model').value.trim();

  if (!name || !baseUrl || !apiKey || !model) {
    window.showError('请填写所有字段');
    return;
  }

  try {
    const res = await fetch(window.API_BASE + '/presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, baseUrl: baseUrl, apiKey: apiKey, model: model })
    });
    const result = await res.json();
    if (result.success) {
      await window.loadPresets();
      window.$('preset-name').value = '';
      window.$('preset-url').value = '';
      window.$('preset-key').value = '';
      window.$('preset-model').value = '';
      window.showInfo('✅ 预设已创建');
    } else {
      window.showError(result.error || '创建失败');
    }
  } catch (e) {
    window.showError('创建失败: ' + e.message);
  }
};
