// 全局配置管理 - Presets, Skills, UI 状态等

import { reactive } from 'vue'
import type { Skill, Preset } from '../types'
import { api } from '../services/api'

const state = reactive({
  // 配置数据
  skills: [] as Skill[],
  presets: [] as Preset[],

  // 选择状态
  selectedModel: localStorage.getItem('selectedModel') || '',
  selectedSkill: localStorage.getItem('selectedSkill') || '',

  // UI 状态
  showConfigModal: false,
  showSkillModal: false,
  showConversationModal: false,
  selectedSkillDetail: null as Skill | null,

  // Ask User 状态
  askQuestion: '',
  askOptions: [] as any[],
  askId: ''
})

// Actions
export const configActions = {
  // 加载 Presets
  async loadPresets() {
    state.presets = await api.getPresets()
    const savedModel = localStorage.getItem('selectedModel')
    
    if (savedModel && state.presets.find(p => p.name === savedModel)) {
      state.selectedModel = savedModel
      await api.usePreset(savedModel)
    } else if (state.presets.length > 0 && !state.selectedModel) {
      state.selectedModel = state.presets[0].name
      await api.usePreset(state.presets[0].name)
    }
  },

  // 加载 Skills
  async loadSkills() {
    state.skills = await api.getSkills()
  },

  // 刷新 Skills
  async reloadSkills() {
    await api.reloadSkills()
    await this.loadSkills()
  },

  // 选择模型
  async selectModel(name: string) {
    state.selectedModel = name
    localStorage.setItem('selectedModel', name)
    await api.usePreset(name)
  },

  // 选择技能
  selectSkill(name: string) {
    state.selectedSkill = name
    localStorage.setItem('selectedSkill', name)
  },

  // 显示配置弹窗
  showConfig() {
    state.showConfigModal = true
  },

  // 隐藏配置弹窗
  hideConfig() {
    state.showConfigModal = false
  },

  // 显示技能弹窗
  showSkills() {
    state.showSkillModal = true
  },

  // 隐藏技能弹窗
  hideSkills() {
    state.showSkillModal = false
  },

  // 显示会话弹窗
  showConversations() {
    state.showConversationModal = true
  },

  // 隐藏会话弹窗
  hideConversations() {
    state.showConversationModal = false
  },

  // 查看技能详情
  viewSkillDetail(skill: Skill) {
    state.selectedSkillDetail = skill
    state.showSkillModal = true
  },

  // 设置 Ask User 状态
  setAskUser(question: string, options: any[], askId: string) {
    state.askQuestion = question
    state.askOptions = options
    state.askId = askId
  },

  // 清除 Ask User 状态
  clearAskUser() {
    state.askQuestion = ''
    state.askOptions = []
    state.askId = ''
  }
}

// Computed
export const currentPreset = () =>
  state.presets.find(p => p.name === state.selectedModel)

export function useConfigStore() {
  return {
    state,
    actions: configActions,
    currentPreset: currentPreset()
  }
}
