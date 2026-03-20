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
  claude: {
    name: 'Claude Code',
    providers: [
      { id: 'anthropic', name: 'Anthropic 官方', baseUrl: 'https://api.anthropic.com', models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514'] },
      { id: 'volcengine', name: '火山引擎', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-5-sonnet'] },
      { id: 'dashscope', name: '阿里云百炼', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-5-sonnet'] },
      { id: 'tencent', name: '腾讯云 Coding Plan', baseUrl: 'https://api.tencentcloud.com/v1', models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-5-sonnet'] },
      { id: '302ai', name: '302.AI', baseUrl: 'https://api.302.ai', models: ['kimi-for-coding', 'glm-for-coding', 'minimax-for-coding'] },
      { id: 'zhipu', name: '智谱 AI', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4', 'glm-4-air', 'glm-4-flash'] },
      { id: 'moonshot', name: '月之暗面 (Kimi)', baseUrl: 'https://api.moonshot.cn/v1', models: ['kimi-latest', 'kimi-plus', 'kimi-lite'] },
      { id: 'minimax', name: 'MiniMax', baseUrl: 'https://api.minimax.chat/v1', models: ['minimax-abab6.5', 'minimax-abab6'] },
      { id: 'stepfun', name: '阶跃星辰', baseUrl: 'https://api.stepfun.com/v1', models: ['step-1v-32k', 'step-1v-8k'] },
      { id: 'openclaw', name: 'OpenClaw', baseUrl: 'https://api.openclaw.cn/v1', models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-5-sonnet'] },
      { id: 'linoapi', name: 'LinoAPI', baseUrl: 'https://linoapi.com/v1', models: ['claude-opus-4-5-20251101', 'claude-sonnet-4-20250514', 'claude-3-5-sonnet'] }
    ]
  },
  openai: {
    name: 'OpenAI',
    providers: [
      { id: 'openai', name: 'OpenAI 官方', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o', 'gpt-4o-mini'] }
    ]
  },
  deepseek: {
    name: 'DeepSeek',
    providers: [
      { id: 'deepseek', name: 'DeepSeek 官方', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-coder'] }
    ]
  },
  qwen: {
    name: '通义千问',
    providers: [
      { id: 'dashscope-qwen', name: '阿里云百炼', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-2-72b'] }
    ]
  },
  opencode: {
    name: 'OpenCode',
    providers: [
      { 
        id: 'opencode', 
        name: 'OpenCode', 
        baseUrl: 'https://api.opencode.ai/v1', 
        models: [
          'gpt-4o-mini',
          'gpt-4o',
          'claude-3-5-sonnet',
          'claude-3-haiku',
          'llama-3-70b',
          'llama-3-8b',
          'gemini-pro',
          'mistral-large',
          'qwen-2-72b'
        ] 
      }
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
  configName.value = templates[selectedTemplate.value]?.name + ' - ' + provider?.name || ''
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

const selectPreset = (name: string) => {
  state.selectedModel = name
  localStorage.setItem('selectedModel', name)
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
  <div class="modal-overlay" @click.self="closeModal">
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