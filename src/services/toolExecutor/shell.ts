/**
 * Shell 工具处理器
 */

import { WebSocket } from 'ws';
import { ToolContext } from '../toolExecutor/context';

export async function handleShellTool(
  tool: { name: string; input?: any },
  ctx: ToolContext
): Promise<string | null> {
  const { conversationId, commandExecutor, ws } = ctx;

  switch (tool.name) {
    case 'bash': {
      const cmd = tool.input?.command;
      if (!cmd) return '错误：命令为空';

      if (!commandExecutor.isSafeCommand(cmd)) {
        // SSE 模式：返回需要确认的提示
        if (!ws || !ctx.pendingCommands) {
          return `需要用户确认命令: ${cmd}`;
        }
        // WebSocket 模式：等待用户确认
        return new Promise((resolve) => {
          const confirmId = `${conversationId}-${Date.now()}`;
          ctx.pendingCommands!.set(confirmId, { command: cmd, ws, conversationId, resolve });
          ws.send(JSON.stringify({ type: 'command_confirm', confirmId, command: cmd }));
        });
      }

      if (ws) ws.send(JSON.stringify({ type: 'command_start', command: cmd }));

      // 流式执行命令
      const result = await commandExecutor.execute(cmd, 60000, {
        onStdout: (data) => {
          if (ws) {
            ws.send(JSON.stringify({
              type: 'command_output',
              command: cmd,
              output: data,
              stream: 'stdout'
            }));
          }
        },
        onStderr: (data) => {
          if (ws) {
            ws.send(JSON.stringify({
              type: 'command_output',
              command: cmd,
              output: data,
              stream: 'stderr'
            }));
          }
        }
      });

      if (ws) {
        ws.send(JSON.stringify({
          type: 'command_result',
          command: cmd,
          success: result.success,
          stdout: result.stdout,
          stderr: result.stderr
        }));
      }

      const output = result.success
        ? (result.stdout || '(无输出)')
        : `错误: ${result.stderr || result.stdout}`;
      return `命令: ${cmd}\n${output}`;
    }

    default:
      return null;
  }
}