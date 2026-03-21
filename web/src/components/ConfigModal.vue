<script setup lang="ts">
import { ref, computed } from 'vue'
import { useStore } from '../stores/app'
import { api } from '../services/api'
import type { Preset } from '../types'

const { state, actions } = useStore()

const configName = ref('')
const configApiKey = ref('')
const configBaseUrl = ref('')
const configModel = ref('')

const formStep = ref(0)
const selectedTemplate = ref('')

interface Provider {
  id: string
  name: string
  baseUrl: string
  models: string[]
}

const selectedProvider = ref<Provider | null>(null)
const editingOldName = ref('')  // Track original name when editing

const templates: Record<string, {name: string; providers: Provider[]}> = {
  // ===== 兼容层（支持 Claude 协议的中间层/平台）=====
  claude: {
    name: 'Claude Code',
    providers: [
      { id: 'tencent', name: '腾讯云 Coding Plan', baseUrl: 'https://api.tencentcloud.com/v1', models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022'] },
      { id: 'volcengine', name: '火山引擎 Coding Plan', baseUrl: 'https://ark.cn-beijing.volces.com/api/coding', models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022'] },
      { id: 'dashscope', name: '阿里云百炼 Coding Plan', baseUrl: 'https://coding-intl.dashscope.aliyuncs.com/apps/anthropic', models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022', 'qwen3.5-plus', 'glm-5', 'MiniMax-M2.5', 'kimi-k2.5'] },
      { id: 'zhipu', name: '智谱 GLM Coding Plan', baseUrl: 'https://open.bigmodel.cn/api/anthropic', models: ['glm-5', 'glm-4.7', 'glm-4.5', 'glm-4-air', 'glm-4-flash'] },
      { id: 'moonshot', name: '月之暗面 Kimi Coding Plan', baseUrl: 'https://api.moonshot.ai/anthropic', models: ['kimi-k2.5', 'kimi-k2-turbo-preview', 'kimi-k2-thinking', 'moonshot-v1-128k', 'moonshot-v1-32k'] },
      { id: 'minimax', name: 'MiniMax Coding Plan', baseUrl: 'https://api.minimaxi.com/anthropic', models: ['MiniMax-M2.5', 'abab6.5-chat', 'abab6.5s-chat'] },
      { id: '302ai', name: '302.AI Coding Plan', baseUrl: 'https://api.302.ai/cc', models: ['kimi-k2.5', 'glm-5', 'MiniMax-M2.5', 'deepseek-reasoner', 'qwen3-max'] },
      { id: 'openclaw', name: 'OpenClaw', baseUrl: 'https://api.openclaw.cn/v1', models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'gpt-4.1', 'kimi-k2.5', 'glm-5', 'qwen3-max', 'deepseek-chat'] },
      { id: 'linoapi', name: 'LinoAPI', baseUrl: 'https://linoapi.com/v1', models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022'] },
      { id: 'anthropic', name: 'Anthropic 官方', baseUrl: 'https://api.anthropic.com', models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'] },
    ]
  },
  opencode: {
    name: 'OpenCode',
    providers: [
      {
        id: 'opencode',
        name: 'OpenCode 官方',
        baseUrl: 'https://api.opencode.ai/v1',
        models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'gpt-4.1', 'gpt-4o', 'gemini-3.1-pro', 'kimi-k2.5', 'glm-5', 'MiniMax-M2.5', 'deepseek-chat', 'qwen3-max', 'llama-3-70b']
      },
      {
        id: 'opencode-openclaw',
        name: 'OpenClaw',
        baseUrl: 'https://api.openclaw.cn/v1',
        models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'gpt-4.1', 'gpt-4o', 'kimi-k2.5', 'glm-5', 'MiniMax-M2.5', 'deepseek-chat', 'deepseek-reasoner', 'qwen3-max']
      },
      {
        id: 'opencode-302ai',
        name: '302.AI',
        baseUrl: 'https://api.302.ai',
        models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'gpt-4.1', 'gpt-4o', 'kimi-k2.5', 'glm-5', 'MiniMax-M2.5', 'deepseek-reasoner', 'qwen3-max', 'gemini-2.5-pro']
      },
      {
        id: 'opencode-linoapi',
        name: 'LinoAPI',
        baseUrl: 'https://linoapi.com/v1',
        models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-7-sonnet-20250219', 'gpt-4.1', 'gpt-4o', 'deepseek-chat', 'qwen3-max']
      },
      {
        id: 'opencode-openrouter',
        name: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        models: ['anthropic/claude-sonnet-4', 'anthropic/claude-opus-4', 'openai/gpt-4.1', 'google/gemini-2.5-pro', 'deepseek/deepseek-chat', 'meta-llama/llama-3.1-405b', 'qwen/qwen3-max']
      },
      {
        id: 'opencode-dashscope',
        name: '阿里云百炼（千问）',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        models: ['qwen3-max', 'qwen3.5-plus', 'qwen3.5-flash', 'qwen-plus', 'qwq-plus', 'qwen3-coder-plus']
      },
      {
        id: 'opencode-volcengine',
        name: '火山引擎（豆包）',
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        models: ['doubao-pro-256k', 'doubao-pro-32k', 'doubao-lite-32k', 'deepseek-chat', 'deepseek-reasoner']
      },
      {
        id: 'opencode-deepseek',
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com/v1',
        models: ['deepseek-chat', 'deepseek-reasoner']
      },
    ]
  },
  openclaw: {
    name: 'OpenClaw',
    providers: [
      {
        id: 'openclaw',
        name: 'OpenClaw 官方',
        baseUrl: 'https://api.openclaw.cn/v1',
        models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-7-sonnet-20250219', 'gpt-4.1', 'gpt-4o', 'gemini-2.0-flash', 'kimi-k2.5', 'glm-5', 'MiniMax-M2.5', 'deepseek-chat', 'deepseek-reasoner', 'qwen3-max', 'qwen3-coder-plus', 'doubao-pro-32k', 'llama-3-70b']
      },
      {
        id: 'openclaw-302ai',
        name: '302.AI',
        baseUrl: 'https://api.302.ai',
        models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'gpt-4.1', 'gpt-4o', 'gemini-2.5-pro', 'kimi-k2.5', 'glm-5', 'MiniMax-M2.5', 'deepseek-reasoner', 'qwen3-max']
      },
      {
        id: 'openclaw-linoapi',
        name: 'LinoAPI',
        baseUrl: 'https://linoapi.com/v1',
        models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-7-sonnet-20250219', 'gpt-4.1', 'gpt-4o', 'deepseek-chat', 'qwen3-max']
      },
      {
        id: 'openclaw-openrouter',
        name: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        models: ['anthropic/claude-sonnet-4', 'anthropic/claude-opus-4', 'openai/gpt-4.1', 'google/gemini-2.5-pro', 'deepseek/deepseek-chat', 'meta-llama/llama-3.1-405b', 'qwen/qwen3-max']
      },
      {
        id: 'openclaw-dashscope',
        name: '阿里云百炼（千问）',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        models: ['qwen3-max', 'qwen3.5-plus', 'qwen3.5-flash', 'qwen-plus', 'qwq-plus', 'qwen3-coder-plus']
      },
      {
        id: 'openclaw-volcengine',
        name: '火山引擎（豆包）',
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        models: ['doubao-pro-256k', 'doubao-pro-32k', 'doubao-lite-32k', 'deepseek-chat', 'deepseek-reasoner']
      },
      {
        id: 'openclaw-deepseek',
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com/v1',
        models: ['deepseek-chat', 'deepseek-reasoner']
      },
    ]
  },
  // ===== 厂家直连 =====
  vendor: {
    name: '厂家直连',
    providers: [
      {
        id: 'openai',
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini', 'o3', 'o3-mini', 'o1', 'o1-mini']
      },
      {
        id: 'deepseek',
        name: 'DeepSeek',
        baseUrl: 'https://api.deepseek.com/v1',
        models: ['deepseek-chat', 'deepseek-reasoner']
      },
      {
        id: 'dashscope-qwen',
        name: '阿里云百炼（千问）',
        baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        models: ['qwen3-max', 'qwen3.5-plus', 'qwen3.5-flash', 'qwen-plus', 'qwen-turbo', 'qwq-plus', 'qwen3-coder-plus', 'qwen3-coder-flash']
      },
      {
        id: 'volcengine-ark',
        name: '火山引擎（豆包）',
        baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
        models: ['doubao-pro-256k', 'doubao-pro-32k', 'doubao-pro-4k', 'doubao-lite-32k', 'doubao-lite-4k']
      },
      {
        id: 'zhipu-glm',
        name: '智谱 AI（GLM）',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        models: ['glm-5', 'glm-4.7', 'glm-4.5', 'glm-4-air', 'glm-4-flash', 'glm-4-long']
      },
      {
        id: 'moonshot-kimi',
        name: '月之暗面（Kimi）',
        baseUrl: 'https://api.moonshot.cn/v1',
        models: ['kimi-k2.5', 'kimi-k2-turbo-preview', 'kimi-k2-thinking', 'moonshot-v1-128k', 'moonshot-v1-32k', 'moonshot-v1-8k', 'moonshot-v1-auto']
      },
      {
        id: 'minimax-std',
        name: 'MiniMax',
        baseUrl: 'https://api.minimaxi.com/v1',
        models: ['MiniMax-M2.5', 'abab6.5-chat', 'abab6.5s-chat', 'abab6-chat']
      },
      {
        id: 'stepfun-std',
        name: '阶跃星辰',
        baseUrl: 'https://api.stepfun.com/v1',
        models: ['step-3.5-flash', 'step-2-16k', 'step-1v-32k', 'step-1v-8k']
      },
    ]
  },
  custom: {
    name: '自定义',
    providers: [{ id: 'custom', name: '自定义配置', baseUrl: '', models: [] }]
  }
}

const currentProviders = computed(() => {
  return templates[selectedTemplate.value]?.providers || []
})

const closeModal = () => {
  state.showConfigModal = false
  resetForm()
}

const resetForm = () => {
  formStep.value = 0
  selectedTemplate.value = ''
  selectedProvider.value = null
  configName.value = ''
  configApiKey.value = ''
  configBaseUrl.value = ''
  configModel.value = ''
  editingOldName.value = ''
}

const selectTemplate = (id: string) => {
  selectedTemplate.value = id
  formStep.value = 2
}

const selectProvider = (provider: Provider) => {
  selectedProvider.value = provider
  configBaseUrl.value = provider?.baseUrl || ''
  configName.value = provider?.name || ''
  formStep.value = 3
}

const goBack = () => {
  if (formStep.value > 1) formStep.value--
}

const saveConfig = async () => {
  if (!configName.value.trim() || !configApiKey.value.trim() || !configModel.value.trim()) {
    alert('请填写完整信息')
    return
  }

  const preset: Preset = {
    name: configName.value.trim(),
    template: selectedTemplate.value || '',
    env: {
      ANTHROPIC_AUTH_TOKEN: configApiKey.value.trim(),
      ANTHROPIC_BASE_URL: configBaseUrl.value.trim(),
      ANTHROPIC_MODEL: configModel.value.trim()
    }
  }

  let success
  if (editingOldName.value) {
    // Update existing preset
    success = await api.updatePreset(editingOldName.value, preset)
  } else {
    // Create new preset
    success = await api.savePreset(preset)
  }

  if (success) {
    await actions.loadPresets()
    closeModal()
  } else {
    alert('保存失败')
  }
}

const deletePreset = async (name: string) => {
  if (!confirm('确定删除?')) return
  await api.deletePreset(name)
  await actions.loadPresets()
}

const selectPreset = async (name: string) => {
  state.selectedModel = name
  localStorage.setItem('selectedModel', name)
  await api.usePreset(name)
  closeModal()
}

const editPreset = (preset: Preset) => {
  editingOldName.value = preset.name
  configName.value = preset.name
  configApiKey.value = preset.env.ANTHROPIC_AUTH_TOKEN || ''
  configBaseUrl.value = preset.env.ANTHROPIC_BASE_URL || ''
  configModel.value = preset.env.ANTHROPIC_MODEL || ''
  selectedProvider.value = null
  selectedTemplate.value = 'custom'
  formStep.value = 3
}
</script>

<template>
  <div class="modal-overlay">
    <div class="modal-content">
      <div class="modal-header">
        <h3>模型管理</h3>
        <button class="modal-close" @click="closeModal">&times;</button>
      </div>
      <div class="modal-body">
        <div v-if="formStep === 1">
          <h4>选择模型模板</h4>
          <div class="template-grid">
            <div v-for="(t, id) in templates" :key="id" class="template-card" @click="selectTemplate(id as string)">
              <div class="template-name">{{ t.name }}</div>
            </div>
          </div>
        </div>

        <div v-if="formStep === 2">
          <h4>选择提供商</h4>
          <div class="provider-grid">
            <div v-for="p in currentProviders" :key="p.id" class="provider-card" @click="selectProvider(p)">
              <div class="provider-name">{{ p.name }}</div>
              <div class="provider-url">{{ p.baseUrl.replace(/^https?:\/\//, '').split('/')[0] }}</div>
            </div>
          </div>
          <button class="btn" @click="goBack" style="margin-top: 16px;">上一步</button>
        </div>

        <div v-if="formStep === 3">
          <h4>配置详情</h4>
          <div class="form-group">
            <label>配置名称</label>
            <input v-model="configName" type="text" placeholder="例如: 我的 Claude">
          </div>
          <div class="form-group">
            <label>API Key</label>
            <input v-model="configApiKey" type="text" placeholder="输入 API Key">
          </div>
          <div class="form-group">
            <label>API 地址</label>
            <input v-model="configBaseUrl" type="text" placeholder="API Base URL">
          </div>
          <div class="form-group">
            <label>模型名称</label>
            <select v-if="selectedProvider?.models?.length" v-model="configModel" class="full-select">
              <option value="">选择模型...</option>
              <option v-for="m in selectedProvider.models" :key="m" :value="m">{{ m }}</option>
            </select>
            <input v-else v-model="configModel" type="text" placeholder="输入模型标识符">
          </div>
          <div class="step-actions">
            <button class="btn" @click="goBack">上一步</button>
            <button class="btn btn-primary" @click="saveConfig">保存</button>
          </div>
        </div>

        <div v-if="formStep === 0">
          <div class="preset-header">
            <h4>已保存的模型</h4>
            <button class="btn btn-primary" @click="formStep = 1">+ 添加</button>
          </div>
          <div class="preset-list">
            <div v-for="p in state.presets" :key="p.name" class="preset-item" @click="selectPreset(p.name)">
              <div class="preset-info">
                <span class="preset-name">{{ p.name }}</span>
                <span class="preset-model">{{ p.env.ANTHROPIC_MODEL }}</span>
              </div>
              <div class="preset-actions">
                <button class="btn btn-small" @click.stop="editPreset(p)" title="编辑">✎</button>
                <button class="btn btn-small btn-danger" @click.stop="deletePreset(p.name)" title="删除">×</button>
              </div>
            </div>
            <div v-if="!state.presets.length" class="preset-empty">暂无配置，点击上方按钮添加新模型</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-content {
  background: var(--panel);
  border-radius: var(--radius-lg);
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  overflow-y: auto;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--border);
}
.modal-header h3 { margin: 0; }
.modal-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--muted);
}
.modal-body { padding: 16px; }
.preset-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.preset-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.preset-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #f8f6f2;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.preset-item:hover {
  background: #f0ede6;
}
.preset-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.preset-name { font-weight: 500; }
.preset-model { font-size: 0.85rem; color: var(--muted); }
.preset-actions {
  display: flex;
  gap: 4px;
}
.preset-empty {
  text-align: center;
  padding: 32px;
  color: var(--muted);
}
.template-grid, .provider-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-top: 12px;
}
.template-card, .provider-card {
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-align: center;
}
.template-card:hover, .provider-card:hover {
  border-color: var(--accent);
  background: var(--accent-weak);
}
.template-name, .provider-name { font-weight: 500; }
.provider-url { font-size: 0.8rem; color: var(--muted); margin-top: 4px; }
.form-group { margin-bottom: 12px; }
.form-group label {
  display: block;
  margin-bottom: 4px;
  font-size: 0.85rem;
  color: var(--muted);
}
.form-group input, .form-group select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.step-actions { display: flex; gap: 8px; margin-top: 16px; }
.btn-danger {
  background: #dc2626;
  color: white;
  border-color: #dc2626;
}
.btn-danger:hover {
  background: #b91c1c;
}
</style>