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
      const engine = tool.input?.engine || 'bing';
      const timeout = tool.input?.timeout || 10000;
      const maxResults = tool.input?.max_results || 10;

      if (!query) return '错误：搜索查询为空';

      if (ws) ws.send(JSON.stringify({ type: 'search_start', query, engine }));

      try {
        const results = await webSearch(query, { timeout, maxResults, engine });
        const output = results.map((r, i) =>
          `${i + 1}. ${r.title}\n   ${r.link}\n   ${r.snippet}${r.source ? `\n   来源: ${r.source}` : ''}`
        ).join('\n\n');

        if (ws) ws.send(JSON.stringify({ type: 'search_result', query, results, engine }));
        return `搜索结果 (${results.length} 条，使用 ${engine}):\n${output}`;
      } catch (e: any) {
        return `搜索失败: ${e.message}`;
      }
    }

    case 'web_fetch': {
      const url = tool.input?.url;
      const prompt = tool.input?.prompt;
      const timeout = tool.input?.timeout || 15000;
      const maxContentLength = tool.input?.max_content_length || 20000;

      if (!url) return '错误：URL 为空';

      if (ws) ws.send(JSON.stringify({ type: 'fetch_start', url }));

      try {
        const result = await webFetch(url, prompt, { timeout, maxContentLength });

        if (result.error) {
          return `获取失败: ${result.error}`;
        }

        let response = `网页内容: ${result.title}\nURL: ${result.url}\n`;

        if (result.wordCount) {
          response += `词数: ${result.wordCount}\n`;
        }

        response += `\n${result.content}`;

        if (ws) ws.send(JSON.stringify({
          type: 'fetch_result',
          url,
          title: result.title,
          wordCount: result.wordCount
        }));

        return response;
      } catch (error: any) {
        return `获取失败: ${error.message}`;
      }
    }

    default:
      return null;
  }
}