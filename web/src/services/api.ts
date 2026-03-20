import type { Conversation, Message, Skill, Preset, Workdir } from '../types'

const API_BASE = '/api'

export const api = {
  // Presets
  async getPresets(): Promise<Preset[]> {
    const res = await fetch(`${API_BASE}/presets`)
    const result = await res.json()
    return result.success ? result.data : []
  },

  async savePreset(preset: Preset): Promise<boolean> {
    const res = await fetch(`${API_BASE}/presets/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: preset.name,
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

  async updateMessage(conversationId: string, messageIndex: number, data: { thinking?: string; toolResults?: any[] }): Promise<boolean> {
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
  },

  // Workdir
  async getWorkdir(): Promise<{ path: string }> {
    const res = await fetch(`${API_BASE}/workdir`)
    const result = await res.json()
    return result.success ? result.data : { path: '' }
  },

  async setWorkdir(path: string): Promise<Workdir> {
    const res = await fetch(`${API_BASE}/workdir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path })
    })
    const result = await res.json()
    if (!result.success) throw new Error(result.error)
    // After setting, fetch the list
    return this.listWorkdir(path)
  },

  async listWorkdir(path: string): Promise<Workdir> {
    const url = `${API_BASE}/workdir/list?path=${encodeURIComponent(path)}`
    const res = await fetch(url)
    const result = await res.json()
    if (!result.success) throw new Error(result.error)
    return result.data
  },

  // Stream chat
  async streamChat(
    conversationId: string,
    content: string,
    skillName: string | undefined,
    onEvent: (event: string, data: any) => void,
    signal: AbortSignal
  ): Promise<void> {
    const res = await fetch(`${API_BASE}/conversations/${conversationId}/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, skillName }),
      signal
    })

    if (!res.ok) throw new Error(`请求失败: ${res.status}`)

    const reader = res.body?.getReader()
    if (!reader) throw new Error('无法获取响应流')

    const decoder = new TextDecoder()
    let buffer = ''

    const processEventBlock = (block: string) => {
      const lines = block.split('\n')
      let eventType = ''
      const dataLines: string[] = []

      for (const line of lines) {
        if (!line) continue
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim()
        } else if (line.startsWith('data:')) {
          let data = line.slice(5)
          if (data.startsWith(' ')) data = data.slice(1)
          dataLines.push(data)
        }
      }

      if (dataLines.length) {
        try {
          const data = JSON.parse(dataLines.join('\n'))
          onEvent(eventType || 'message', data)
        } catch (e) {
          console.error('解析事件数据失败:', e)
        }
      }
    }

    while (true) {
      const result = await reader.read()
      if (result.done) break

      buffer += decoder.decode(result.value, { stream: true })
      buffer = buffer.replace(/\r\n/g, '\n')

      let sepIndex
      while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, sepIndex)
        buffer = buffer.slice(sepIndex + 2)
        if (block.trim()) processEventBlock(block)
      }
    }

    if (buffer.trim()) {
      processEventBlock(buffer)
    }
  }
}