<script setup lang="ts">
import { computed } from 'vue'
import { useStore } from '../stores/app'
import { formatTime, getParentPath } from '../utils'

const { state, actions } = useStore()

const MAX_VISIBLE = 8
const visibleConversations = computed(() => state.conversations.slice(0, MAX_VISIBLE))
const hasMoreConversations = computed(() => state.conversations.length > MAX_VISIBLE)

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
          <span class="conv-time">{{ formatTime(new Date(conv.updatedAt)) }}</span>
          <span class="conv-count">{{ conv.messageCount }} 条</span>
          <button class="conv-delete" @click.stop="actions.deleteConversation(conv.id)">×</button>
        </li>
      </ul>
      <button
        v-if="hasMoreConversations"
        class="btn"
        style="margin-top: 8px; width: 100%;"
        @click="state.showConversationModal = true"
      >
        查看全部 ({{ state.conversations.length }})
      </button>
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
        rows="2"
        :value="state.workdir.path"
        @keydown.enter.prevent="actions.setWorkdir(($event.target as HTMLTextAreaElement).value)"
      ></textarea>
      <div class="workdir-actions">
        <button class="btn btn-primary" @click="actions.setWorkdir(state.workdir.path)">切换</button>
        <button class="btn" @click="goUpDir">上一级</button>
        <button class="btn" @click="actions.loadWorkdir">刷新</button>
      </div>
      <div class="workdir-list">
        <div
          v-for="item in state.workdir.items.slice(0, 10)"
          :key="item.name"
          class="workdir-item"
          @click="item.isDir && actions.listWorkdir(state.workdir.path + '/' + item.name)"
        >
          <span class="item-icon">{{ item.isDir ? '📁' : '📄' }}</span>
          <span class="item-name">{{ item.name }}</span>
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
          <button class="btn btn-icon" title="配置模型" @click="state.showConfigModal = true">⚙️</button>
        </div>
      </div>
      <div class="sidebar-section">
        <h3>技能</h3>
        <button class="btn" @click="state.showSkillModal = true">管理</button>
      </div>
    </div>
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
  overflow-y: auto;
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
  margin-top: auto;
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
  max-height: 200px;
  overflow-y: auto;
}

.conversation-list li {
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  transition: background 0.15s;
}

.conversation-list li:hover {
  background: rgba(0,0,0,0.04);
}

.conversation-list li.active {
  background: var(--accent-weak);
}

.conv-time {
  flex: 1;
}

.conv-count {
  color: var(--muted);
  font-size: 0.75rem;
}

.conv-delete {
  opacity: 0;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  color: var(--muted);
}

.conversation-list li:hover .conv-delete {
  opacity: 1;
}

/* Workdir */
.workdir-section {
  flex: 1;
  min-height: 0;
}

.workdir-input {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  resize: none;
}

.workdir-actions {
  display: flex;
  gap: 6px;
}

.workdir-list {
  margin-top: 8px;
  max-height: 150px;
  overflow-y: auto;
}

.workdir-item {
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  gap: 6px;
}

.workdir-item:hover {
  background: rgba(0,0,0,0.04);
}

.item-icon {
  font-size: 0.9rem;
}

.item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
