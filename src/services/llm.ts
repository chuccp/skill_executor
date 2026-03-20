import { LLMConfig, ChatMessage, StreamEvent } from '../types';

export class LLMService {
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  // 更新配置
  updateConfig(config: Partial<LLMConfig>) {
    this.config = { ...this.config, ...config };
  }

  // 获取当前配置
  getConfig(): LLMConfig {
    return { ...this.config };
  }

  // 发送聊天请求（非流式）
  async chat(messages: ChatMessage[], systemPrompt?: string): Promise<string> {
    const formattedMessages = this.formatMessages(messages, systemPrompt);

    // 如果有 baseUrl，使用自定义 API
    if (this.config.baseUrl) {
      return this.anthropicCompatibleChat(formattedMessages);
    }

    switch (this.config.provider) {
      case 'anthropic':
        return this.anthropicChat(formattedMessages);
      case 'openai':
        return this.openaiChat(formattedMessages);
      case 'custom':
        return this.customChat(formattedMessages);
      default:
        throw new Error(`Unsupported provider: ${this.config.provider}`);
    }
  }

  // 流式聊天
  async *chatStream(messages: ChatMessage[], systemPrompt?: string, tools?: any[]): AsyncGenerator<StreamEvent> {
    const formattedMessages = this.formatMessages(messages, systemPrompt);

    // 如果有 baseUrl，使用自定义 API
    if (this.config.baseUrl) {
      yield* this.anthropicCompatibleChatStream(formattedMessages, tools);
      return;
    }

    switch (this.config.provider) {
      case 'anthropic':
        yield* this.anthropicChatStream(formattedMessages, tools);
        break;
      case 'openai':
        yield* this.openaiChatStream(formattedMessages, tools);
        break;
      case 'custom':
        yield* this.customChatStream(formattedMessages, tools);
        break;
      default:
        yield { type: 'error', content: `Unsupported provider: ${this.config.provider}` };
    }
  }

  private formatMessages(messages: ChatMessage[], systemPrompt?: string): any[] {
    const formatted: any[] = [];

    // 添加系统提示
    if (systemPrompt) {
      formatted.push({ role: 'system', content: systemPrompt });
    }

    // 转换消息格式
    for (const msg of messages) {
      formatted.push({
        role: msg.role,
        content: msg.content
      });
    }

    return formatted;
  }

  // Anthropic API
  private async anthropicChat(messages: any[]): Promise<string> {
    const systemMessage = messages.find(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: this.config.model || 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemMessage?.content,
        messages: otherMessages
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${error}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  // Anthropic 流式（支持工具调用）
  private async *anthropicChatStream(messages: any[], tools?: any[]): AsyncGenerator<StreamEvent> {
    const systemMessage = messages.find(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    const requestBody: any = {
      model: this.config.model || 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemMessage?.content,
      messages: otherMessages,
      stream: true
    };

    if (tools && tools.length > 0) {
      requestBody.tools = tools;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      yield { type: 'error', content: await response.text() };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: 'error', content: 'No response body' };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    // 用于聚合工具调用
    let currentToolCall: { id: string; name: string; inputJson: string; yielded: boolean } | null = null;

    let doneSignal = false;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') {
          yield { type: 'done' };
          return;
        }

        try {
          const parsed = JSON.parse(data);

          if (parsed.type === 'content_block_start' && parsed.content_block?.type === 'tool_use') {
            currentToolCall = {
              id: parsed.index?.toString() || '0',
              name: parsed.content_block.name,
              inputJson: '',
              yielded: false
            };
          }

          if (parsed.type === 'content_block_delta' && parsed.delta) {
            if (parsed.delta.type === 'text_delta' && parsed.delta.text) {
              yield { type: 'text', content: parsed.delta.text };
            } else if (parsed.delta.type === 'text' && parsed.delta.text) {
              yield { type: 'text', content: parsed.delta.text };
            } else if (parsed.delta.text && !parsed.delta.type) {
              yield { type: 'text', content: parsed.delta.text };
            }

            if (parsed.delta.type === 'input_json_delta' && parsed.delta.partial_json && currentToolCall) {
              currentToolCall.inputJson += parsed.delta.partial_json;
            }
          }

          if (parsed.type === 'content_block_stop') {
            if (currentToolCall && currentToolCall.inputJson && !currentToolCall.yielded) {
              try {
                const input = JSON.parse(currentToolCall.inputJson);
                currentToolCall.yielded = true;
                yield { type: 'tool_use', toolId: currentToolCall.id, toolName: currentToolCall.name, toolInput: input };
              } catch (e) {
                console.error('[LLM Stream] 工具输入解析失败:', currentToolCall.inputJson);
              }
            }
            currentToolCall = null;
          }
        } catch {}
      }
    }

    yield { type: 'done' };
  }

  // OpenAI 兼容 API
  private async openaiChat(messages: any[]): Promise<string> {
    const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1';
    
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify({
        model: this.config.model || 'gpt-4o',
        messages: messages,
        max_tokens: 4096
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  // OpenAI 流式（支持工具调用）
  private async *openaiChatStream(messages: any[], tools?: any[]): AsyncGenerator<StreamEvent> {
    const baseUrl = this.config.baseUrl || 'https://api.openai.com/v1';

    const requestBody: any = {
      model: this.config.model || 'gpt-4o',
      messages: messages,
      max_tokens: 4096,
      stream: true
    };

    if (tools && tools.length > 0) {
      requestBody.tools = tools;
      requestBody.tool_choice = 'auto';
    }
    
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      yield { type: 'error', content: await response.text() };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: 'error', content: 'No response body' };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    const toolCallBuffers: Record<number, { id: string; name: string; args: string }> = {};
    let doneSignal = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') {
          doneSignal = true;
          break;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta || {};

          if (delta.content) {
            yield { type: 'text', content: delta.content };
          }

          const toolCalls = delta.tool_calls;
          if (Array.isArray(toolCalls)) {
            for (const call of toolCalls) {
              const index = call.index ?? 0;
              if (!toolCallBuffers[index]) {
                toolCallBuffers[index] = {
                  id: call.id || String(index),
                  name: call.function?.name || '',
                  args: ''
                };
              }
              if (call.function?.name) {
                toolCallBuffers[index].name = call.function.name;
              }
              if (call.function?.arguments) {
                toolCallBuffers[index].args += call.function.arguments;
              }
            }
          }
        } catch {}
      }

      if (doneSignal) break;
    }

    const toolCallEntries = Object.values(toolCallBuffers);
    if (toolCallEntries.length > 0) {
      for (const call of toolCallEntries) {
        if (!call.name) continue;
        try {
          const input = call.args ? JSON.parse(call.args) : {};
          yield { type: 'tool_use', toolId: call.id, toolName: call.name, toolInput: input };
        } catch (e) {
          console.error('[LLM Stream] OpenAI 工具输入解析失败:', call.args);
        }
      }
    }

    yield { type: 'done' };
  }

  // 自定义 API（兼容 OpenAI 格式）
  private async customChat(messages: any[]): Promise<string> {
    return this.openaiChat(messages);
  }

  private async *customChatStream(messages: any[], tools?: any[]): AsyncGenerator<StreamEvent> {
    yield* this.openaiChatStream(messages, tools);
  }

  // Anthropic 兼容 API（支持自定义 baseUrl，如阿里云）
  private async anthropicCompatibleChat(messages: any[]): Promise<string> {
    const systemMessage = messages.find(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    const url = this.buildApiUrl();
    console.log('[LLM] 请求 URL:', url);
    console.log('[LLM] Model:', this.config.model);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: 4096,
        system: systemMessage?.content,
        messages: otherMessages
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[LLM] API 错误:', error);
      throw new Error(`API error: ${error}`);
    }

    const data = await response.json();
    console.log('[LLM] 响应数据:', JSON.stringify(data).substring(0, 200));

    // 处理阿里云格式的响应：content 可能包含 thinking 和 text 两种类型
    if (data.content && Array.isArray(data.content)) {
      const textBlock = data.content.find((block: any) => block.type === 'text');
      if (textBlock && textBlock.text) {
        return textBlock.text;
      }
      // 兼容标准 Anthropic 格式
      if (data.content[0]?.text) {
        return data.content[0].text;
      }
    }

    throw new Error('Invalid response format');
  }

  // 构建 API URL（智能处理不同 provider 的路径格式）
  private buildApiUrl(): string {
    const baseUrl = this.config.baseUrl || '';

    // 如果 baseUrl 已经包含完整路径（以 /v1/messages 结尾），直接使用
    if (baseUrl.endsWith('/v1/messages')) {
      return baseUrl;
    }

    // 如果 baseUrl 以 /v1 结尾，添加 /messages
    if (baseUrl.endsWith('/v1')) {
      return baseUrl + '/messages';
    }

    // 否则添加 /v1/messages
    return baseUrl + '/v1/messages';
  }

  // Anthropic 兼容 API 流式
  private async *anthropicCompatibleChatStream(messages: any[], tools?: any[]): AsyncGenerator<StreamEvent> {
    const systemMessage = messages.find(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    const url = this.buildApiUrl();
    console.log('[LLM Stream] 请求 URL:', url);
    console.log('[LLM Stream] Model:', this.config.model);
    if (tools) console.log('[LLM Stream] Tools:', tools.length);

    const requestBody: any = {
      model: this.config.model,
      max_tokens: 4096,
      system: systemMessage?.content,
      messages: otherMessages,
      stream: true
    };

    // 添加工具定义
    if (tools && tools.length > 0) {
      requestBody.tools = tools;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[LLM Stream] API 错误:', errorText);
      yield { type: 'error', content: errorText };
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: 'error', content: 'No response body' };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    // 用于聚合工具调用和追踪当前文本块
    let currentToolCall: { id: string; name: string; inputJson: string, yielded: boolean } | null = null;
    // 追踪当前是否在 thinking 块中
    let isThinkingBlock: boolean = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        // 处理 data: 开头的行
        if (line.startsWith('data:')) {
          const data = line.slice(5).trim();
          if (data === '[DONE]') {
            yield { type: 'done' };
            return;
          }

          try {
            const parsed = JSON.parse(data);

            // 处理 content_block_start 事件
            if (parsed.type === 'content_block_start' && parsed.content_block) {
              if (parsed.content_block.type === 'tool_use') {
                currentToolCall = {
                  id: parsed.index?.toString() || '0',
                  name: parsed.content_block.name,
                  inputJson: '',
                  yielded: false
                };
              }
              // 检测 thinking 类型块（阿里云等模型支持）
              if (parsed.content_block.type === 'thinking') {
                isThinkingBlock = true;
              }
            }

            // 处理 content_block_delta 事件
            if (parsed.type === 'content_block_delta' && parsed.delta) {
              // 标准格式：text_delta
              if (parsed.delta.type === 'text_delta' && parsed.delta.text) {
                yield { type: 'text', content: parsed.delta.text };
              }
              // 阿里云格式：type 可能是 'text'
              else if (parsed.delta.type === 'text' && parsed.delta.text) {
                yield { type: 'text', content: parsed.delta.text };
              }
              // 兼容没有 type 但有 text 的情况
              else if (parsed.delta.text && !parsed.delta.type) {
                yield { type: 'text', content: parsed.delta.text };
              }
              // 处理 thinking_delta（思考过程）
              if (parsed.delta.type === 'thinking_delta' && parsed.delta.thinking) {
                yield { type: 'thinking', content: parsed.delta.thinking };
              }
              // 处理 input_json_delta（工具输入）
              if (parsed.delta.type === 'input_json_delta' && parsed.delta.partial_json) {
                if (currentToolCall) {
                  currentToolCall.inputJson += parsed.delta.partial_json;
                }
              }
            }

            // 处理 content_block_stop 事件
            if (parsed.type === 'content_block_stop') {
              if (currentToolCall && currentToolCall.inputJson && !currentToolCall.yielded) {
                try {
                  const input = JSON.parse(currentToolCall.inputJson);
                  currentToolCall.yielded = true;
                  yield { type: 'tool_use', toolId: currentToolCall.id, toolName: currentToolCall.name, toolInput: input };
                } catch (e) {
                  console.error('[LLM Stream] 工具输入解析失败:', currentToolCall.inputJson);
                }
              }
              currentToolCall = null;
              isThinkingBlock = false;
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }

    yield { type: 'done' };
  }
}

export default LLMService;
