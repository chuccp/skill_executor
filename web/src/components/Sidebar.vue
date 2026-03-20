<script setup lang="ts">
import { computed } from 'vue'
import { useStore } from '../stores/app'
import { formatTime, getParentPath } from '../utils'
import ConversationModal from './ConversationModal.vue'

const { state, actions } = useStore()

const MAX_VISIBLE = 3
const visibleConversations = computed(() => state.conversations.slice(0, MAX_VISIBLE))
const hasMoreConversations = computed(() => state.conversations.length > MAX_VISIBLE)
const moreCount = computed(() => state.conversations.length - MAX_VISIBLE)

const getPreview = (conv: typeof state.conversations[0]) => {
  return conv.firstUserMessage || conv.summary || '新会话'
}

const selectModel = (name: string) => {
  state.selectedModel = name
  localStorage.setItem('selectedModel', name)
}

const goUpDir = async () => {
  if (state.workdir.path) {
    const parent = getParentPath(state.workdir.path)
    if (parent) await actions.setWorkdir(parent)
  }
}

const showAllConversations = () => {
  state.showConversationModal = true
}

const isDir = (item: typeof state.workdir.items[0]) => item.type === 'directory'
</script>

<template>
  <aside class="sidebar">
    <div class="sidebar-header">
      <h2>skill_executor</h2>
    </div>

    <!-- Conversations -->
    <div class="sidebar-section">
      <h3>会话</h3>
      <button class="btn btn-primary" @click="actions.createConversation">新建</button>
      <ul class="conversation-list">
        <li
          v-for="conv in visibleConversations"
          :key="conv.id"
          :class="{ active: conv.id === state.currentConversationId }"
          @click="actions.selectConversation(conv.id)"
        >
          <div class="conv-info">
            <span class="conv-time">{{ formatTime(new Date(conv.updatedAt || conv.createdAt)) }}</span>
            <span class="conv-preview">{{ getPreview(conv).substring(0, 30) }}</span>
          </div>
          <button class="conv-delete" @click.stop="actions.deleteConversation(conv.id)" title="删除">×</button>
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
        <select class="full-select" v-model="state.selectedSkill">
          <option value="">无</option>
          <option v-for="skill in state.skills" :key="skill.name" :value="skill.name">
            {{ skill.name }}
          </option>
        </select>
        <button class="btn btn-icon" title="刷新技能" @click="actions.reloadSkills">↻</button>
      </div>
    </div>

    <!-- Workdir -->
    <div class="sidebar-section workdir-section">
      <h3>工作目录</h3>
      <textarea
        class="workdir-input"
        placeholder="输入路径..."
        rows="1"
        :value="state.workdir.path"
        @keydown.enter.prevent="actions.setWorkdir(($event.target as HTMLTextAreaElement).value)"
      ></textarea>
      <div class="workdir-actions">
        <button class="btn btn-primary btn-small" @click="actions.setWorkdir(state.workdir.path)">切换</button>
        <button class="btn btn-small" @click="goUpDir">上一级</button>
        <button class="btn btn-small" @click="actions.loadWorkdir">刷新</button>
      </div>
      <div class="workdir-list">
        <div
          v-for="item in state.workdir.items"
          :key="item.name"
          class="workdir-item"
          :class="{ 'is-dir': isDir(item) }"
          @click="isDir(item) && actions.listWorkdir(state.workdir.path + '/' + item.name)"
        >
          <span class="item-icon">{{ isDir(item) ? '📁' : '📄' }}</span>
          <span class="item-name">{{ item.name }}</span>
        </div>
        <div v-if="!state.workdir.items.length" class="workdir-empty">
          目录为空
        </div>
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
              v-for="preset in state.presets"
              :key="preset.name"
              :value="preset.name"
              :selected="preset.name === state.selectedModel"
            >
              {{ preset.name }}
            </option>
          </select>
          <button class="btn btn-icon" title="配置模型" @click="state.showConfigModal = true">⚙</button>
        </div>
      </div>
      <div class="sidebar-section">
        <h3>技能</h3>
        <button class="btn" @click="state.showSkillModal = true">管理</button>
      </div>
    </div>

    <!-- Conversation Modal -->
    <ConversationModal v-if="state.showConversationModal" />
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

/* Workdir */
.workdir-section {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.workdir-input {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  resize: none;
  font-family: inherit;
  font-size: 0.8rem;
  line-height: 1.4;
}

.workdir-actions {
  display: flex;
  gap: 6px;
}

.btn-small {
  padding: 4px 8px;
  font-size: 0.75rem;
}

.workdir-list {
  margin-top: 8px;
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.workdir-item {
  padding: 5px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  gap: 6px;
}

.workdir-item.is-dir:hover {
  background: rgba(0,0,0,0.04);
}

.workdir-item:not(.is-dir) {
  cursor: default;
  color: var(--muted);
}

.workdir-empty {
  text-align: center;
  color: var(--muted);
  font-size: 0.85rem;
  padding: 16px;
}

.item-icon {
  font-size: 0.85rem;
  flex-shrink: 0;
}

.item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>