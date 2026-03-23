/**
 * Skill 和用户交互工具处理器
 */

import * as fs from 'fs';
import * as path from 'path';
import { WebSocket } from 'ws';
import { ToolContext } from '../toolExecutor/context';
import { resolveToWorkingDir } from './utils';

export async function handleSkillTool(
  tool: { name: string; input?: any },
  ctx: ToolContext
): Promise<string | null> {
  const { conversationId, skillsDir, skillLoader, ws } = ctx;

  switch (tool.name) {
    case 'create_skill': {
      const skillName = tool.input?.name;
      const skillDesc = tool.input?.description || '';
      const skillPrompt = tool.input?.prompt;
      const triggers = tool.input?.triggers || [];

      if (!skillName || !skillPrompt) {
        return '错误：技能名称和提示词不能为空';
      }

      try {
        let skillContent = `# ${skillName}\n\n${skillDesc}\n\n`;

        if (triggers.length > 0) {
          skillContent += `TRIGGER\n`;
          for (const trigger of triggers) {
            skillContent += `- ${trigger}\n`;
          }
          skillContent += '\n';
        }

        skillContent += `PROMPT:\n${skillPrompt}\n`;

        const safeName = skillName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_');
        const skillPath = path.join(skillsDir, `${safeName}.md`);

        if (!fs.existsSync(skillsDir)) {
          fs.mkdirSync(skillsDir, { recursive: true });
        }

        fs.writeFileSync(skillPath, skillContent, 'utf-8');
        skillLoader.loadAll();

        if (ws) {
          ws.send(JSON.stringify({ type: 'skill_created', name: skillName, path: skillPath }));
        }
        return `技能创建成功: ${skillName} (${skillPath})`;
      } catch (e: any) {
        const errMsg = `创建技能失败: ${e.message}`;
        if (ws) ws.send(JSON.stringify({ type: 'error', content: errMsg }));
        return errMsg;
      }
    }

    case 'ask_user': {
      const question = tool.input?.question;
      const header = tool.input?.header || '问题';
      const options = tool.input?.options;

      if (!question) return '错误：问题为空';

      // SSE 模式：不支持实时交互
      if (!ws || !ctx.pendingQuestions) {
        return `需要用户输入: ${question}`;
      }

      // WebSocket 模式：发送问题给前端，等待用户回答
      return new Promise((resolve) => {
        const askId = `${conversationId}-${Date.now()}`;
        ctx.pendingQuestions!.set(askId, { ws, resolve });

        // 设置超时（5分钟）
        const timeout = setTimeout(() => {
          if (ctx.pendingQuestions!.has(askId)) {
            ctx.pendingQuestions!.delete(askId);
            resolve('用户未响应（超时）');
          }
        }, 5 * 60 * 1000);

        // 发送问题给前端
        ws.send(JSON.stringify({ type: 'ask_user', askId, question, header, options: options || null }));
      }).then((answer: any) => {
        if (answer && typeof answer === 'object' && answer.cancelled) {
          return '用户取消了操作';
        }
        return `用户回答: ${typeof answer === 'string' ? answer : JSON.stringify(answer)}`;
      }) as Promise<string>;
    }

    default:
      return null;
  }
}