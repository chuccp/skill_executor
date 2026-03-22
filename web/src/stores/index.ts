// Store 统一导出

export { useConversationsStore, conversationsActions } from './conversations'
export { useConfigStore, configActions, currentPreset } from './config'

// 兼容性导出 - 保持旧代码可用
import { useConversationsStore } from './conversations'
import { useConfigStore } from './config'

const conversationsStore = useConversationsStore()
const configStore = useConfigStore()

// 合并为统一的 useStore (兼容现有组件)
export function useStore() {
  return {
    // 会话相关
    currentConversationId: conversationsStore.currentConversationId,
    currentMessages: conversationsStore.currentMessages,
    currentStreaming: conversationsStore.currentStreaming,

    // 配置相关
    skills: configStore.state.skills,
    presets: configStore.state.presets,
    selectedModel: configStore.state.selectedModel,
    selectedSkill: configStore.state.selectedSkill,

    // UI 状态
    showConfigModal: configStore.state.showConfigModal,
    showSkillModal: configStore.state.showSkillModal,
    showConversationModal: configStore.state.showConversationModal,
    selectedSkillDetail: configStore.state.selectedSkillDetail,

    // Ask User 状态
    askQuestion: configStore.state.askQuestion,
    askOptions: configStore.state.askOptions,
    askId: configStore.state.askId,

    // Actions - 合并
    ...conversationsStore.actions,
    ...configStore.actions,

    // 原始 state 引用 (兼容直接访问)
    state: {
      ...configStore.state,
      currentConversationId: conversationsStore.currentConversationId,
      messages: conversationsStore.currentMessages,
      streaming: conversationsStore.currentStreaming
    }
  }
}
