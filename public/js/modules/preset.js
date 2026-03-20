/**
 * 预设管理模块 - 三步式模型配置
 */

// 当前选中的配置
var currentTemplate = null;
var currentProvider = null;
var currentStep = 1;

// 模型模板配置 - 包含各提供商信息
var MODEL_TEMPLATES = {
  claude: {
    name: 'Claude Code',
    description: 'Anthropic Claude 系列',
    providers: [
      {
        id: 'anthropic',
        name: 'Anthropic 官方',
        baseUrl: 'https://api.anthropic.com',
        models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
        docs: 'https://docs.anthropic.com'
      },
      {
        id: 'openclaw',
        name: 'OpenClaw',
        baseUrl: 'https://api.openclaw.cn/v1',
        models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-5-sonnet-20241022'],
        docs: 'https://openclaw.cn'
      },
      {
        id: 'opencode',
        name: 'OpenCode',
        baseUrl: 'https://api.opencode.ai/v1',
        models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022'],
        docs: 'https://opencode.ai'
      },
      {
        id: 'volcengine',
        name: '火山引擎',
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022'],
        docs: 'https://www.volcengine.com/docs/82379/2160841'
      },
      {
        id: 'aliyun-bailian',
        name: '阿里云百炼',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022'],
        docs: 'https://help.aliyun.com/document_detail/2712195.html'
      },
      {
        id: 'tencent-cloud',
        name: '腾讯云',
        baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
        models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022'],
        docs: 'https://cloud.tencent.com/document/product/1729'
      },
      {
        id: 'baidu-qianfan',
        name: '百度千帆',
        baseUrl: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop',
        models: ['claude-sonnet-4-20250514'],
        docs: 'https://cloud.baidu.com/doc/WENXINWORKSHOP/index.html'
      },
      {
        id: 'zhipu',
        name: '智谱 AI',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022'],
        docs: 'https://open.bigmodel.cn/dev/api'
      },
      {
        id: 'siliconflow',
        name: 'SiliconFlow',
        baseUrl: 'https://api.siliconflow.cn/v1',
        models: ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022'],
        docs: 'https://docs.siliconflow.cn'
      },
      {
        id: 'moonshot',
        name: 'Kimi (月之暗面)',
        baseUrl: 'https://api.moonshot.cn/v1',
        models: ['claude-sonnet-4-20250514'],
        docs: 'https://platform.moonshot.cn/docs'
      },
      {
        id: 'deepseek-claude',
        name: 'DeepSeek 代理',
        baseUrl: 'https://api.deepseek.com/v1',
        models: ['claude-sonnet-4-20250514'],
        docs: 'https://platform.deepseek.com/docs'
      },
      {
        id: 'minimax',
        name: 'MiniMax',
        baseUrl: 'https://api.minimax.chat/v1',
        models: ['claude-sonnet-4-20250514'],
        docs: 'https://www.minimaxi.com/document'
      }
    ]
  },
  openai: {
    name: 'OpenAI',
    description: 'GPT-4, GPT-4o 系列',
    providers: [
      {
        id: 'openai',
        name: 'OpenAI 官方',
        baseUrl: 'https://api.openai.com/v1',
        models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'o1-preview', 'o1-mini'],
        docs: 'https://platform.openai.com/docs'
      },
      {
        id: 'azure',
        name: 'Azure OpenAI',
        baseUrl: 'https://YOUR_RESOURCE.openai.azure.com/openai/deployments',
        models: ['gpt-4o', 'gpt-4-turbo'],
        docs: 'https://learn.microsoft.com/azure/ai-services/openai'
      }
    ]
  },
  deepseek: {
    name: 'DeepSeek',
    description: '深度求索大模型',
    providers: [
      {
        id: 'deepseek',
        name: 'DeepSeek 官方',
        baseUrl: 'https://api.deepseek.com/v1',
        models: ['deepseek-chat', 'deepseek-coder', 'deepseek-reasoner'],
        docs: 'https://platform.deepseek.com/docs'
      }
    ]
  },
  qwen: {
    name: '通义千问',
    description: '阿里云百炼 Qwen',
    providers: [
      {
        id: 'dashscope',
        name: '阿里云百炼',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        models: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-max-longcontext', 'qwen-coder-plus', 'qwen-coder-turbo'],
        docs: 'https://help.aliyun.com/document_detail/2712195.html'
      },
      {
        id: 'aliyun',
        name: '阿里云灵积',
        baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
        models: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
        docs: 'https://help.aliyun.com/document_detail/2712195.html'
      }
    ]
  },
  zhipu: {
    name: '智谱 GLM',
    description: '智谱清言大模型',
    providers: [
      {
        id: 'zhipu',
        name: '智谱 AI 官方',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        models: ['glm-4', 'glm-4-plus', 'glm-4-air', 'glm-4-airx', 'glm-4-flash', 'glm-4v-plus', 'glm-4v-flash'],
        docs: 'https://open.bigmodel.cn/dev/api'
      }
    ]
  },
  moonshot: {
    name: 'Kimi',
    description: '月之暗面大模型',
    providers: [
      {
        id: 'moonshot',
        name: 'Moonshot 官方',
        baseUrl: 'https://api.moonshot.cn/v1',
        models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
        docs: 'https://platform.moonshot.cn/docs'
      }
    ]
  },
  doubao: {
    name: '豆包',
    description: '火山引擎 Doubao',
    providers: [
      {
        id: 'volcengine-doubao',
        name: '火山引擎',
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        models: ['doubao-pro-32k', 'doubao-pro-128k', 'doubao-lite-32k', 'doubao-lite-128k', 'doubao-pro-4k'],
        docs: 'https://www.volcengine.com/docs/82379/1099475'
      }
    ]
  },
  custom: {
    name: '自定义',
    description: '自定义 API 配置',
    providers: [
      {
        id: 'custom',
        name: '自定义配置',
        baseUrl: '',
        models: [],
        docs: ''
      }
    ]
  }
};

// 显示配置模态框
window.showConfigModal = function() {
  var modal = window.$('config-modal');
  if (modal) {
    modal.classList.add('active');
    // 重置到列表视图
    showPresetListView();
    renderPresetList();
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

// 显示模型列表视图
function showPresetListView() {
  window.$('preset-list-view').style.display = 'block';
  window.$('preset-form-view').style.display = 'none';
  resetFormState();
}

// 显示添加表单视图
function showPresetFormView() {
  window.$('preset-list-view').style.display = 'none';
  window.$('preset-form-view').style.display = 'block';
  resetFormState();
  goToStep(1);
}

// 重置表单状态
function resetFormState() {
  currentTemplate = null;
  currentProvider = null;
  currentStep = 1;
  
  window.$('config-name').value = '';
  window.$('config-api-key').value = '';
  window.$('config-base-url').value = '';
  window.$('config-model').value = '';
  window.$('config-model-select').innerHTML = '<option value="">选择模型...</option>';
  window.$('edit-old-name').value = '';
  window.$('form-title').textContent = '配置详情';
  
  // 清除模板卡片选中状态
  document.querySelectorAll('.template-card').forEach(function(card) {
    card.classList.remove('selected');
  });
  
  updateStepIndicators(1);
}

// 跳转到指定步骤
function goToStep(step) {
  currentStep = step;
  
  // 隐藏所有步骤内容
  window.$('step-1').style.display = 'none';
  window.$('step-2').style.display = 'none';
  window.$('step-3').style.display = 'none';
  
  // 显示当前步骤
  window.$('step-' + step).style.display = 'block';
  
  updateStepIndicators(step);
}

// 更新步骤指示器
function updateStepIndicators(activeStep) {
  document.querySelectorAll('.form-steps .step').forEach(function(stepEl, index) {
    var stepNum = index + 1;
    stepEl.classList.remove('active', 'completed');
    if (stepNum < activeStep) {
      stepEl.classList.add('completed');
    } else if (stepNum === activeStep) {
      stepEl.classList.add('active');
    }
  });
}

// 选择模板
function selectTemplate(templateId) {
  currentTemplate = templateId;
  
  // 更新选中状态
  document.querySelectorAll('.template-card').forEach(function(card) {
    card.classList.remove('selected');
    if (card.dataset.template === templateId) {
      card.classList.add('selected');
    }
  });
  
  // 显示提供商列表
  renderProviderList();
  
  // 延迟跳转，让用户看到选中效果
  setTimeout(function() {
    goToStep(2);
  }, 200);
}

// 渲染提供商列表
function renderProviderList() {
  var container = window.$('provider-list');
  if (!currentTemplate || !MODEL_TEMPLATES[currentTemplate]) {
    container.innerHTML = '<div class="provider-empty">请先选择模板类型</div>';
    return;
  }
  
  var template = MODEL_TEMPLATES[currentTemplate];
  var html = '<div class="provider-grid">';
  
  template.providers.forEach(function(provider) {
    // 提取域名显示
    var domain = provider.baseUrl.replace(/^https?:\/\//, '').split('/')[0];
    html += '<div class="provider-card" data-provider="' + provider.id + '" title="' + provider.baseUrl + '">' +
      '<div class="provider-name">' + provider.name + '</div>' +
      '<div class="provider-url">' + domain + '</div>' +
    '</div>';
  });
  
  html += '</div>';
  container.innerHTML = html;
  
  // 绑定点击事件
  container.querySelectorAll('.provider-card').forEach(function(card) {
    card.onclick = function(e) {
      selectProvider(card.dataset.provider);
    };
  });
}

// 选择提供商
function selectProvider(providerId) {
  var template = MODEL_TEMPLATES[currentTemplate];
  if (!template) return;
  
  currentProvider = template.providers.find(function(p) { return p.id === providerId; });
  if (!currentProvider) return;
  
  // 更新选中状态
  document.querySelectorAll('.provider-card').forEach(function(card) {
    card.classList.remove('selected');
    if (card.dataset.provider === providerId) {
      card.classList.add('selected');
    }
  });
  
  // 填充默认值
  window.$('config-base-url').value = currentProvider.baseUrl;
  window.$('config-name').value = template.name + ' - ' + currentProvider.name;
  
  // 填充模型选择列表
  var modelSelect = window.$('config-model-select');
  if (currentProvider.models && currentProvider.models.length > 0) {
    modelSelect.innerHTML = '<option value="">选择模型...</option>' +
      currentProvider.models.map(function(m) { 
        return '<option value="' + m + '">' + m + '</option>'; 
      }).join('');
    modelSelect.style.display = 'block';
  } else {
    modelSelect.innerHTML = '<option value="">手动输入模型</option>';
    modelSelect.style.display = 'block';
  }
  
  // 更新标题
  window.$('form-title').textContent = '配置 ' + template.name + ' - ' + currentProvider.name;
  
  // 延迟跳转
  setTimeout(function() {
    goToStep(3);
  }, 200);
}

// 模型选择变化
function onModelSelectChange(e) {
  var select = e.target;
  var customInput = window.$('config-model');
  if (select.value) {
    customInput.value = select.value;
  }
}

// 返回上一步
function goBack() {
  if (currentStep > 1) {
    goToStep(currentStep - 1);
  }
}

// 保存配置
window.saveConfig = async function() {
  var name = window.$('config-name').value.trim();
  var apiKey = window.$('config-api-key').value.trim();
  var baseUrl = window.$('config-base-url').value.trim();
  var model = window.$('config-model').value.trim() || window.$('config-model-select').value;
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
    window.showError('请选择或输入模型名称');
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
      showPresetListView();
      renderPresetList();
      window.showInfo('✅ 配置已保存');
    } else {
      window.showError(result.error || '保存失败');
    }
  } catch (e) {
    window.showError('保存失败: ' + e.message);
  }
};

// 编辑现有配置
function editPreset(preset) {
  showPresetFormView();
  
  window.$('config-name').value = preset.name;
  window.$('config-api-key').value = preset.apiKey || '';
  window.$('config-base-url').value = preset.baseUrl || '';
  window.$('config-model').value = preset.model || '';
  window.$('edit-old-name').value = preset.name;
  window.$('form-title').textContent = '编辑模型: ' + preset.name;
  
  // 直接跳到步骤3
  goToStep(3);
  window.$('step-1').style.display = 'none';
  window.$('step-2').style.display = 'none';
}

window.renderPresetList = function() {
  const list = window.$('preset-list');
  if (!list) return;

  if (!window.state.presets.length) {
    list.innerHTML = '<div class="preset-empty">暂无配置，点击上方按钮添加新模型</div>';
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
        editPreset(preset);
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
        renderPresetList();
        window.showInfo('已删除: ' + name);
      }
    };
  });
};

// 初始化事件绑定
function initPresetEvents() {
  // 添加新模型按钮
  var addBtn = window.$('show-add-form-btn');
  if (addBtn) {
    addBtn.onclick = showPresetFormView;
  }
  
  // 模板卡片点击
  document.querySelectorAll('.template-card').forEach(function(card) {
    card.onclick = function() {
      selectTemplate(card.dataset.template);
    };
  });
  
  // 模型选择变化
  var modelSelect = window.$('config-model-select');
  if (modelSelect) {
    modelSelect.onchange = onModelSelectChange;
  }
  
  // 上一步按钮
  var step2Back = window.$('step2-back');
  if (step2Back) {
    step2Back.onclick = function() {
      goToStep(1);
    };
  }
  
  var step3Back = window.$('step3-back');
  if (step3Back) {
    step3Back.onclick = function() {
      goToStep(2);
    };
  }
}

// 页面加载后初始化
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(initPresetEvents, 100);
});

// 保留旧接口兼容性
window.fillPresetConfig = function() {};
window.createPreset = async function() {};