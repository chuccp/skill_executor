/**
 * WebSocket 服务
 * @deprecated 请直接从 './websocket' 目录导入
 */

// 从模块化组件重新导出
export { setupWebSocket, WSMessage, PendingCommand, PendingQuestion, AutoProgress } from './websocket/index';
export { getContextLimit, groupToolsForParallelExecution } from './websocket/utils';