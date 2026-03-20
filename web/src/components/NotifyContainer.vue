<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

interface NotifyItem {
  id: number
  type: 'info' | 'error'
  message: string
}

const notifies = ref<NotifyItem[]>([])
let idCounter = 0

const showInfo = (msg: string) => {
  const id = ++idCounter
  notifies.value.push({ id, type: 'info', message: msg })
  setTimeout(() => {
    notifies.value = notifies.value.filter(n => n.id !== id)
  }, 3000)
}

const showError = (msg: string) => {
  const id = ++idCounter
  notifies.value.push({ id, type: 'error', message: msg })
  setTimeout(() => {
    notifies.value = notifies.value.filter(n => n.id !== id)
  }, 5000)
}

// 暴露给全局
onMounted(() => {
  (window as any).showInfo = showInfo
  ;(window as any).showError = showError
})

onUnmounted(() => {
  delete (window as any).showInfo
  delete (window as any).showError
})
</script>

<template>
  <div class="notify-container">
    <div
      v-for="n in notifies"
      :key="n.id"
      class="notify"
      :class="'notify-' + n.type"
    >
      {{ n.message }}
    </div>
  </div>
</template>

<style scoped>
.notify-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>