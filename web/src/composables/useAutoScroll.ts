// Auto-scroll composable

import { watch, nextTick, type Ref } from 'vue'

export function useAutoScroll(containerRef: Ref<HTMLElement | null>, deps: Ref<any>[]) {
  function scrollToBottom() {
    nextTick(() => {
      if (containerRef.value) {
        containerRef.value.scrollTop = containerRef.value.scrollHeight
      }
    })
  }

  // Watch all dependencies
  deps.forEach((dep) => {
    watch(dep, scrollToBottom, { deep: true })
  })

  return {
    scrollToBottom
  }
}