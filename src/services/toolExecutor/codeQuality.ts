/**
 * 代码质量工具处理器
 */

import { WebSocket } from 'ws';
import { formatCode, analyzeCode, lintCode } from '../tools';
import { ToolContext } from '../toolExecutor/context';
import { resolveToWorkingDir } from './utils';

export async function handleCodeQualityTool(
  tool: { name: string; input?: any },
  ctx: ToolContext
): Promise<string | null> {
  const { ws } = ctx;

  switch (tool.name) {
    case 'format_code': {
      const rawPath = tool.input?.file_path;
      const filePath = rawPath ? resolveToWorkingDir(rawPath) : '';
      const style = tool.input?.style || 'prettier';
      const language = tool.input?.language;

      if (!filePath) return '错误：文件路径为空';

      if (ws) ws.send(JSON.stringify({ type: 'format_start', file: filePath }));

      try {
        const result = await formatCode({ filePath, style, language });

        if (result.success) {
          if (ws) ws.send(JSON.stringify({ type: 'format_complete', file: filePath }));
          return `代码格式化成功: ${filePath}\n\n格式化后内容:\n\`\`\`\n${result.content}\n\`\`\``;
        } else {
          return `格式化失败: ${result.error}`;
        }
      } catch (error: any) {
        return `格式化异常: ${error.message}`;
      }
    }

    case 'analyze_code': {
      const rawPath = tool.input?.file_path;
      const filePath = rawPath ? resolveToWorkingDir(rawPath) : '';

      if (!filePath) return '错误：文件路径为空';

      try {
        const metrics = analyzeCode(filePath);

        const output = `
代码分析结果: ${filePath}

📊 基本信息:
- 语言: ${metrics.language}
- 行数: ${metrics.lines}
- 字符数: ${metrics.characters}

🏗️ 结构信息:
- 函数数量: ${metrics.functions}
- 类数量: ${metrics.classes}
- 复杂度: ${metrics.complexity}

📈 质量指标:
- 平均每函数行数: ${metrics.functions > 0 ? (metrics.lines / metrics.functions).toFixed(1) : 'N/A'}
- 复杂度评估: ${metrics.complexity < 10 ? '简单' : metrics.complexity < 20 ? '中等' : '复杂'}
        `.trim();

        if (ws) ws.send(JSON.stringify({ type: 'analysis_complete', file: filePath, metrics }));
        return output;
      } catch (error: any) {
        return `代码分析失败: ${error.message}`;
      }
    }

    case 'lint_code': {
      const rawPath = tool.input?.file_path;
      const filePath = rawPath ? resolveToWorkingDir(rawPath) : '';
      const language = tool.input?.language;

      if (!filePath) return '错误：文件路径为空';

      if (ws) ws.send(JSON.stringify({ type: 'lint_start', file: filePath }));

      try {
        const results = await lintCode(filePath, language);

        if (results.length === 0) {
          if (ws) ws.send(JSON.stringify({ type: 'lint_complete', file: filePath, issues: 0 }));
          return `语法检查完成: ${filePath} - 未发现问题`;
        }

        const output = results.map(r =>
          `${r.severity.toUpperCase()}: ${r.file}:${r.line}:${r.column} - ${r.message}${r.rule ? ` (${r.rule})` : ''}`
        ).join('\n');

        const summary = `发现 ${results.length} 个问题 (${results.filter(r => r.severity === 'error').length} 错误, ${results.filter(r => r.severity === 'warning').length} 警告)`;

        if (ws) ws.send(JSON.stringify({ type: 'lint_complete', file: filePath, issues: results.length, results }));
        return `语法检查结果: ${filePath}\n${summary}\n\n${output}`;
      } catch (error: any) {
        return `语法检查异常: ${error.message}`;
      }
    }
  }

  return null;
}