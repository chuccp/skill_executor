
<script setup lang="ts">
import { computed, watch, ref, onMounted } from 'vue'
import type { Conversation } from '../types'
import { useConversationsStore } from '../stores/conversations'
import { useConfigStore } from '../stores/config'
import { api } from '../services/api'
import { formatTime } from '../utils'
import { confirmDialog } from '../services/tauri'
import ConversationModal from './ConversationModal.vue'

const conversationsStore = useConversationsStore()
const configStore = useConfigStore()

const allConversations = ref<Conversation[]>([])

// Load conversations
async function loadConversations() {
  allConversations.value = await api.getConversations()
}

onMounted(() => {
  loadConversations()
})

// Save selected skill to localStorage when changed
watch(() => configStore.state.selectedSkill, (newVal) => {
  localStorage.setItem('selectedSkill', newVal)
})

const MAX_VISIBLE = 3
const visibleConversations = computed(() => allConversations.value.slice(0, MAX_VISIBLE))
const hasMoreConversations = computed(() => allConversations.value.length > MAX_VISIBLE)
const moreCount = computed(() => allConversations.value.length - MAX_VISIBLE)

const getPreview = (conv: Conversation) => {
  return conv.firstUserMessage || conv.summary || '新会话'
}

const selectModel = async (name: string) => {
  await configStore.actions.selectModel(name)
}

const showAllConversations = () => {
  configStore.actions.showConversations()
}

const createConversation = async () => {
  const conv = await api.createConversation()
  if (conv) {
    await loadConversations()
    if (conv.id) {
      await conversationsStore.actions.setCurrentConversation(conv.id)
    }
  }
}

const selectConversation = async (id: string) => {
  await conversationsStore.actions.setCurrentConversation(id)
}

const deleteConversation = async (id: string) => {
  const confirmed = await confirmDialog('确定要删除这个会话吗？', '删除会话')
  if (!confirmed) return

  await api.deleteConversation(id)
  conversationsStore.actions.removeState(id)
  await loadConversations()
  if (allConversations.value.length > 0) {
    await conversationsStore.actions.setCurrentConversation(allConversations.value[0].id)
  } else {
    await createConversation()
  }
}
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <h2>skill_executor</h2>
    </div>

    <!-- Conversations -->
    <div class="sidebar-section">
      <h3>会话</h3>
      <button class="btn btn-primary" @click="createConversation">新建</button>
      <ul class="conversation-list">
        <li
          v-for="conv in visibleConversations"
          :key="conv.id"
          :class="{ active: conv.id === conversationsStore.currentConversationId }"
          @click="selectConversation(conv.id)"
        >
          <div class="conv-info">
            <span class="conv-time">{{ formatTime(new Date(conv.updatedAt || conv.createdAt)) }}</span>
            <span class="conv-preview">{{ getPreview(conv).substring(0, 30) }}</span>
          </div>
          <button class="conv-delete" @click.stop="deleteConversation(conv.id)" title="删除">×</button>
        </li>
        <li v-if="hasMoreConversations" class="conv-more" @click="showAllConversations">
          <span class="conv-more-text">更多 ({{ moreCount }})</span>
        </li>
      </ul>
    </div>

    <!-- Skills -->
    <div class="sidebar-section">
      <h3>Skill</h3>
      <div class="model-section">
        <select class="full-select" v-model="configStore.state.selectedSkill">
          <option value="">无</option>
          <option v-for="skill in configStore.state.skills" :key="skill.name" :value="skill.name">
            {{ skill.name }}
          </option>
        </select>
        <button class="btn btn-icon" title="刷新技能" @click="configStore.actions.reloadSkills">↻</button>
      </div>
    </div>

    <!-- Footer -->
    <div class="sidebar-footer">
      <div class="sidebar-section">
        <h3>模型</h3>
        <div class="model-section">
          <select class="full-select" @change="selectModel(($event.target as HTMLSelectElement).value)">
            <option value="">选择预设...</option>
            <option
              v-for="preset in configStore.state.presets"
              :key="preset.name"
              :value="preset.name"
              :selected="preset.name === configStore.state.selectedModel"
            >
              {{ preset.name }}
            </option>
          </select>
          <button class="btn btn-icon" title="配置模型" @click="configStore.actions.showConfig">⚙</button>
        </div>
      </div>
      <div class="sidebar-section">
        <h3>技能</h3>
        <button class="btn" @click="configStore.actions.showSkills">管理</button>
      </div>
    </div>

    <!-- Conversation Modal -->
    <ConversationModal v-if="configStore.state.showConversationModal" />
  </aside>
</template>

<style scoped>
.sidebar {
  width: 260px;
  background: linear-gradient(180deg, #fcfaf6 0%, #f6f1e9 100%);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-right: 1px solid var(--border);
  flex-shrink: 0;
  overflow: hidden;
  height: 100vh;
}

.sidebar-header h2 {
  font-size: 1.05rem;
  color: var(--text);
  font-weight: 600;
}

.sidebar-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sidebar-section h3 {
  font-size: 0.75rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.sidebar-footer {
  padding-top: 12px;
  border-top: 1px solid var(--border);
  margin-top: auto;
}

.model-section {
  display: flex;
  gap: 6px;
}

.model-section select {
  flex: 1;
}

/* Conversation list */
.conversation-list {
  list-style: none;
}

.conversation-list li {
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  transition: background 0.15s;
  margin-bottom: 4px;
}

.conversation-list li:hover {
  background: rgba(0,0,0,0.04);
}

.conversation-list li.active {
  background: var(--accent-weak);
}

.conv-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.conv-time {
  font-size: 0.75rem;
  color: var(--muted);
}

.conv-preview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conv-delete {
  opacity: 0;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  color: var(--muted);
  padding: 2px 6px;
}

.conversation-list li:hover .conv-delete {
  opacity: 1;
}

.conv-more {
  justify-content: center;
  color: var(--muted);
}

.conv-more-text {
  font-size: 0.8rem;
}
</style>