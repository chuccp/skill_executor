/**
 * Web 工具
 */

// ==================== Web Search ====================

export interface WebSearchResult {
  title: string;
  link: string;
  snippet: string;
}

export async function webSearch(query: string): Promise<WebSearchResult[]> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1`;

    const response = await fetch(url);
    const data = await response.json() as any;

    const results: WebSearchResult[] = [];

    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, 10)) {
        if (topic.Text && topic.FirstURL) {
          results.push({
            title: topic.Text.split(' - ')[0] || topic.Text.substring(0, 50),
            link: topic.FirstURL,
            snippet: topic.Text
          });
        }
      }
    }

    if (results.length === 0) {
      results.push({
        title: '搜索提示',
        link: '',
        snippet: `DuckDuckGo 未返回结果。建议使用搜索引擎直接搜索: https://www.google.com/search?q=${encodedQuery}`
      });
    }

    return results;
  } catch (error: any) {
    return [{
      title: '搜索失败',
      link: '',
      snippet: `搜索出错: ${error.message}。请直接访问搜索引擎。`
    }];
  }
}

// ==================== Web Fetch ====================

export interface WebFetchResult {
  url: string;
  title: string;
  content: string;
  error?: string;
}

export async function webFetch(url: string, prompt?: string): Promise<WebFetchResult> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!response.ok) {
      return { url, title: '', content: '', error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const html = await response.text();

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : url;

    let content = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (content.length > 10000) {
      content = content.substring(0, 10000) + '\n... (内容已截断)';
    }

    if (prompt) {
      content = `[根据提示 "${prompt}" 提取的内容]\n\n${content}`;
    }

    return { url, title, content };
  } catch (error: any) {
    return { url, title: '', content: '', error: error.message };
  }
}