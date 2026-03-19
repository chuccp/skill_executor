/**
 * 全局状态管理
 */

window.API_BASE = '/api';

window.state = {
  currentConversationId: null,
  conversations: [],
  skills: [],
  presets: [],
  ws: null,
  workdir: {
    path: '',
    items: []
  },
  isStreaming: false,
  abortController: null
};