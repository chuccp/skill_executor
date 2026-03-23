/**
 * Web 工具处理器
 */

import { WebSocket } from 'ws';
import { webSearch, webFetch } from '../tools';
import { ToolContext } from '../toolExecutor/context';

export async function handleWebTool(
  tool: { name: string; input?: any },
  ctx: ToolContext
): Promise<string | null> {
  const { ws } = ctx;

  switch (tool.name) {
    case 'web_search': {
      const query = tool.input?.query;
      if (!query) return '错误：搜索查询为空';

      if (ws) ws.send(JSON.stringify({ type: 'search_start', query }));

      try {
        const results = await webSearch(query);
        const output = results.map((r, i) =>
          `${i + 1}. ${r.title}\n   ${r.link}\n   ${r.snippet}`
        ).join('\n\n');

        if (ws) ws.send(JSON.stringify({ type: 'search_result', query, results }));
        return `搜索结果:\n${output}`;
      } catch (e: any) {
        return `搜索失败: ${e.message}`;
      }
    }

    case 'web_fetch': {
      const url = tool.input?.url;
      const prompt = tool.input?.prompt;

      if (!url) return '错误：URL 为空';

      if (ws) ws.send(JSON.stringify({ type: 'fetch_start', url }));

      try {
        const result = await webFetch(url, prompt);

        if (result.error) {
          return `获取失败: ${result.error}`;
        }

        if (ws) ws.send(JSON.stringify({ type: 'fetch_result', url, title: result.title }));
        return `网页内容 (${result.title}):\n${result.content}`;
      } catch (e: any) {
        return `获取失败: ${e.message}`;
      }
    }

    default:
      return null;
  }
}