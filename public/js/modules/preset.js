/**
 * 预设管理模块
 */

window.renderPresetList = function() {
  const list = window.$('preset-list');
  if (!list) return;

  list.innerHTML = window.state.presets.map(function(p) {
    return '<div class="preset-item" data-name="' + encodeURIComponent(p.name) + '">' +
      '<span class="preset-name">' + window.escapeHtml(p.name) + '</span>' +
      '<button class="preset-delete" title="删除">×</button>' +
      '</div>';
  }).join('');

  list.querySelectorAll('.preset-item').forEach(function(item) {
    item.onclick = function() {
      const name = decodeURIComponent(item.dataset.name);
      window.$('preset-select').value = name;
      localStorage.setItem('selectedModel', name);
      window.showInfo('已选择模型: ' + name);
    };
  });

  list.querySelectorAll('.preset-delete').forEach(function(btn) {
    btn.onclick = async function(e) {
      e.stopPropagation();
      const item = btn.closest('.preset-item');
      const name = decodeURIComponent(item.dataset.name);
      if (confirm('确定删除预设 ' + name + '？')) {
        await fetch(window.API_BASE + '/presets/' + encodeURIComponent(name), { method: 'DELETE' });
        await window.loadPresets();
        window.showInfo('已删除预设: ' + name);
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