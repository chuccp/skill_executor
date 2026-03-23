<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { Conversation } from '../types'
import { useConversationsStore } from '../stores/conversations'
import { useConfigStore } from '../stores/config'
import { api } from '../services/api'
import { formatTime } from '../utils'
import { confirmDialog } from '../services/tauri'

const conversationsStore = useConversationsStore()
const configStore = useConfigStore()

const allConversations = ref<Conversation[]>([])

const loadConversations = async () => {
  allConversations.value = await api.getConversations()
}

onMounted(() => {
  loadConversations()
})

const getPreview = (conv: Conversation) => {
  return conv.firstUserMessage || conv.summary || '新会话'
}

const closeModal = () => {
  configStore.actions.hideConversations()
}

const selectAndClose = async (id: string) => {
  await conversationsStore.actions.setCurrentConversation(id)
  closeModal()
}

const deleteConversation = async (id: string) => {
  const confirmed = await confirmDialog('确定要删除这个会话吗？', '删除会话')
  if (!confirmed) return

  await api.deleteConversation(id)
  conversationsStore.actions.removeState(id)
  await loadConversations()
}
</script>

<template>
  <div class="modal-overlay" @click.self="closeModal">
    <div class="modal-content">
      <div class="modal-header">
        <h3>所有会话</h3>
        <button class="modal-close" @click="closeModal">&times;</button>
      </div>
      <div class="modal-body">
        <div class="conv-modal-list">
          <div
            v-for="c in allConversations"
            :key="c.id"
            class="conv-modal-item"
            @click="selectAndClose(c.id)"
          >
            <div class="conv-modal-info">
              <span class="conv-modal-time">{{ formatTime(new Date(c.updatedAt || c.createdAt)) }}</span>
              <span class="conv-modal-preview">{{ getPreview(c).substring(0, 50) }}</span>
            </div>
            <button class="conv-modal-delete" @click.stop="deleteConversation(c.id)" title="删除">×</button>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" @click="closeModal">关闭</button>
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
  max-width: 500px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--border);
}

.modal-header h3 {
  margin: 0;
}

.modal-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--muted);
}

.modal-body {
  padding: 16px;
  flex: 1;
  overflow-y: auto;
}

.modal-footer {
  padding: 16px;
  border-top: 1px solid var(--border);
  text-align: right;
}

.conv-modal-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.conv-modal-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background: #f8f6f2;
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.conv-modal-item:hover {
  background: #f0ede6;
}

.conv-modal-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.conv-modal-time {
  font-size: 0.75rem;
  color: var(--muted);
}

.conv-modal-preview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conv-modal-delete {
  opacity: 0;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  color: var(--muted);
  padding: 4px 8px;
}

.conv-modal-item:hover .conv-modal-delete {
  opacity: 1;
}
</style>