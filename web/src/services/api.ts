// API 服务

import type { Conversation, Message, Skill, Preset } from '../types'

const API_BASE = '/api'

export const api = {
  // Presets
  async getPresets(): Promise<Preset[]> {
    const res = await fetch(`${API_BASE}/presets`)
    const result = await res.json()
    return result.success ? result.data : []
  },

  async usePreset(name: string): Promise<boolean> {
    const res = await fetch(`${API_BASE}/presets/${encodeURIComponent(name)}/use`, {
      method: 'POST'
    })
    const result = await res.json()
    return result.success
  },

  async savePreset(preset: Preset): Promise<boolean> {
    const res = await fetch(`${API_BASE}/presets/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: preset.name,
        template: preset.template || '',
        apiKey: preset.env.ANTHROPIC_AUTH_TOKEN,
        baseUrl: preset.env.ANTHROPIC_BASE_URL,
        model: preset.env.ANTHROPIC_MODEL
      })
    })
    const result = await res.json()
    return result.success
  },

  async updatePreset(oldName: string, preset: Preset): Promise<boolean> {
    const res = await fetch(`${API_BASE}/presets/${encodeURIComponent(oldName)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: preset.name,
        template: preset.template || '',
        apiKey: preset.env.ANTHROPIC_AUTH_TOKEN,
        baseUrl: preset.env.ANTHROPIC_BASE_URL,
        model: preset.env.ANTHROPIC_MODEL
      })
    })
    const result = await res.json()
    return result.success
  },

  async deletePreset(name: string): Promise<boolean> {
    const res = await fetch(`${API_BASE}/presets/${encodeURIComponent(name)}`, {
      method: 'DELETE'
    })
    const result = await res.json()
    return result.success
  },

  // Conversations
  async getConversations(): Promise<Conversation[]> {
    const res = await fetch(`${API_BASE}/conversations/meta`)
    const result = await res.json()
    return result.success ? result.data : []
  },

  async createConversation(): Promise<Conversation | null> {
    const res = await fetch(`${API_BASE}/conversations`, { method: 'POST' })
    const result = await res.json()
    return result.success ? result.data : null
  },

  async getConversation(id: string): Promise<Message[]> {
    const res = await fetch(`${API_BASE}/conversations/${id}`)
    const result = await res.json()
    return result.success ? result.data.messages : []
  },

  async deleteConversation(id: string): Promise<boolean> {
    const res = await fetch(`${API_BASE}/conversations/${id}`, { method: 'DELETE' })
    const result = await res.json()
    return result.success
  },

  async updateMessage(conversationId: string, messageIndex: number, data: { thinking?: string; toolResults?: any[]; todos?: any[] }): Promise<boolean> {
    const res = await fetch(`${API_BASE}/conversations/${conversationId}/messages/${messageIndex}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    const result = await res.json()
    return result.success
  },

  // Skills
  async getSkills(): Promise<Skill[]> {
    const res = await fetch(`${API_BASE}/skills`)
    const result = await res.json()
    return result.success ? result.data : []
  },

  async reloadSkills(): Promise<void> {
    await fetch(`${API_BASE}/skills/reload`, { method: 'POST' })
  }
}
