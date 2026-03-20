<script setup lang="ts">
import { useStore } from '../stores/app'

const { state } = useStore()

const closeModal = () => {
  state.showSkillModal = false
}

const selectSkill = (skill: typeof state.selectedSkillDetail) => {
  state.selectedSkillDetail = skill
}
</script>

<template>
  <div class="modal-overlay" @click.self="closeModal">
    <div class="modal-content modal-large">
      <div class="modal-header">
        <h3>技能管理</h3>
        <button class="modal-close" @click="closeModal">&times;</button>
      </div>
      <div class="modal-body">
        <div class="skill-manager">
          <div class="skill-list-panel">
            <div class="skill-list-title">技能列表</div>
            <div class="skill-list">
              <div
                v-for="s in state.skills"
                :key="s.name"
                class="skill-item"
                :class="{ active: state.selectedSkillDetail?.name === s.name }"
                @click="selectSkill(s)"
              >
                {{ s.name }}
              </div>
              <div v-if="!state.skills.length" class="skill-empty">暂无技能</div>
            </div>
          </div>
          <div class="skill-detail-panel">
            <div v-if="state.selectedSkillDetail" class="skill-detail">
              <h4>{{ state.selectedSkillDetail.name }}</h4>
              <p class="skill-desc">{{ state.selectedSkillDetail.description }}</p>
              <pre class="skill-content">{{ state.selectedSkillDetail.content }}</pre>
            </div>
            <div v-else class="skill-empty">选择一个技能查看详情</div>
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
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}
.modal-large {
  max-width: 800px;
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
.skill-manager {
  display: flex;
  gap: 16px;
  min-height: 400px;
}
.skill-list-panel {
  width: 200px;
  border-right: 1px solid var(--border);
  padding-right: 16px;
}
.skill-list-title {
  font-weight: 500;
  margin-bottom: 8px;
}
.skill-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.skill-item {
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.skill-item:hover {
  background: #f5f2ec;
}
.skill-item.active {
  background: var(--accent-weak);
}
.skill-detail-panel {
  flex: 1;
}
.skill-detail h4 {
  margin: 0 0 8px 0;
}
.skill-desc {
  color: var(--muted);
  font-size: 0.9rem;
  margin-bottom: 12px;
}
.skill-content {
  background: #f8f6f2;
  padding: 12px;
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  overflow-x: auto;
  white-space: pre-wrap;
}
.skill-empty {
  color: var(--muted);
  text-align: center;
  padding: 24px;
}
</style>