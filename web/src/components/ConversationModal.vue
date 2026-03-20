<script setup lang="ts">
import { useStore } from '../stores/app'
import { formatTime } from '../utils'

const { state, actions } = useStore()

const getPreview = (conv: typeof state.conversations[0]) => {
  return conv.firstUserMessage || conv.summary || '新会话'
}

const closeModal = () => {
  state.showConversationModal = false
}

const selectAndClose = (id: string) => {
  actions.selectConversation(id, true)
  closeModal()
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
            v-for="c in state.conversations"
            :key="c.id"
            class="conv-modal-item"
            @click="selectAndClose(c.id)"
          >
            <div class="conv-modal-info">
              <span class="conv-modal-time">{{ formatTime(new Date(c.updatedAt || c.createdAt)) }}</span>
              <span class="conv-modal-preview">{{ getPreview(c).substring(0, 50) }}</span>
            </div>
            <button class="conv-modal-delete" @click.stop="actions.deleteConversation(c.id)" title="删除">×</button>
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