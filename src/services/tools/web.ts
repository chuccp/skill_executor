/**
 * Web 工具
 */

// ==================== 工具函数 ====================

// 超时控制包装器
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string = '操作超时'
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}

// 改进的内容提取函数
function extractContent(html: string): string {
  // 移除脚本和样式
  let content = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');

  // 移除导航和页脚等无关内容
  content = content
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '');

  // 移除广告相关内容
  content = content
    .replace(/<div[^>]*class="[^"]*ad[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<div[^>]*id="[^"]*ad[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');

  // 提取主要内容区域
  const mainMatch = content.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (mainMatch) {
    content = mainMatch[1];
  } else {
    // 尝试提取文章内容
    const articleMatch = content.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch) {
      content = articleMatch[1];
    }
  }

  // 移除 HTML 标签
  content = content
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return content;
}

// ==================== Web Search ====================

export interface WebSearchResult {
  title: string;
  link: string;
  snippet: string;
  source?: string;
}

export async function webSearch(query: string, options: { timeout?: number; maxResults?: number; engine?: 'duckduckgo' | 'bing' } = {}): Promise<WebSearchResult[]> {
  const { timeout = 10000, maxResults = 10, engine = 'bing' } = options; // 默认使用Bing

  try {
    let results: WebSearchResult[] = [];

    if (engine === 'bing') {
      // 使用 Bing Web Search API 或网页搜索
      results = await searchBing(query, maxResults, timeout);
    } else {
      // DuckDuckGo 搜索 (原有实现)
      const encodedQuery = encodeURIComponent(query);
      const url = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1`;

      const response = await withTimeout(fetch(url), timeout, 'DuckDuckGo搜索超时');
      const data = await response.json() as any;

      if (data.RelatedTopics) {
        for (const topic of data.RelatedTopics.slice(0, maxResults)) {
          if (topic.Text && topic.FirstURL) {
            results.push({
              title: topic.Text.split(' - ')[0] || topic.Text.substring(0, 50),
              link: topic.FirstURL,
              snippet: topic.Text,
              source: 'DuckDuckGo'
            });
          }
        }
      }
    }

    if (results.length === 0) {
      results.push({
        title: '搜索提示',
        link: `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
        snippet: `${engine === 'bing' ? 'Bing' : 'DuckDuckGo'} 未返回结果。建议直接使用 Bing 搜索。`,
        source: engine === 'bing' ? 'Bing' : 'DuckDuckGo'
      });
    }

    return results;
  } catch (error: any) {
    return [{
      title: '搜索失败',
      link: `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
      snippet: `搜索出错: ${error.message}。请直接使用 Bing 搜索。`,
      source: 'Error'
    }];
  }
}

// ==================== Web Fetch ====================

export interface WebFetchResult {
  url: string;
  title: string;
  content: string;
  error?: string;
  wordCount?: number;
  extractedAt?: Date;
}

export async function webFetch(url: string, prompt?: string, options: { timeout?: number; maxContentLength?: number } = {}): Promise<WebFetchResult> {
  const { timeout = 15000, maxContentLength = 20000 } = options;

  try {
    const response = await withTimeout(
      fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        redirect: 'follow'
      }),
      timeout,
      '网页获取超时'
    );

    if (!response.ok) {
      return {
        url,
        title: '',
        content: '',
        error: `HTTP ${response.status}: ${response.statusText}`,
        extractedAt: new Date()
      };
    }

    const html = await response.text();

    // 提取标题
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : url;

    // 使用改进的内容提取
    let content = extractContent(html);

    // 计算词数
    const wordCount = content.split(/\s+/).length;

    // 截断过长内容
    if (content.length > maxContentLength) {
      content = content.substring(0, maxContentLength) + '\n\n[内容已截断，原文过长]';
    }

    // 添加提示信息
    if (prompt) {
      content = `[根据提示 "${prompt}" 提取的内容]\n\n${content}`;
    }

    return {
      url,
      title,
      content,
      wordCount,
      extractedAt: new Date()
    };
  } catch (error: any) {
    return {
      url,
      title: '',
      content: '',
      error: error.message,
      extractedAt: new Date()
    };
  }
}

// ==================== Bing Search Implementation ====================

// Bing 搜索实现
async function searchBing(query: string, maxResults: number, timeout: number): Promise<WebSearchResult[]> {
  try {
    const encodedQuery = encodeURIComponent(query);

    // 首先尝试 Bing API (如果有API密钥)
    if (process.env.BING_API_KEY && process.env.BING_API_KEY !== 'demo-key') {
      const bingUrl = `https://api.bing.microsoft.com/v7.0/search?q=${encodedQuery}&count=${maxResults}&responseFilter=Webpages&mkt=zh-CN`;

      const response = await withTimeout(
        fetch(bingUrl, {
          headers: {
            'Ocp-Apim-Subscription-Key': process.env.BING_API_KEY,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        }),
        timeout,
        'Bing API搜索超时'
      );

      if (response.ok) {
        const data = await response.json();

        if (data.webPages && data.webPages.value) {
          return data.webPages.value.slice(0, maxResults).map((item: any) => ({
            title: item.name || '无标题',
            link: item.url,
            snippet: item.snippet || item.description || '无描述',
            source: 'Bing API'
          }));
        }
      }
    }

    // Fallback: 使用 Bing 网页搜索
    return await searchBingWebFallback(query, maxResults, timeout);
  } catch (error: any) {
    // 如果API搜索失败，使用网页搜索
    return await searchBingWebFallback(query, maxResults, timeout);
  }
}

// Bing 网页搜索 fallback
async function searchBingWebFallback(query: string, maxResults: number, timeout: number): Promise<WebSearchResult[]> {
  try {
    const encodedQuery = encodeURIComponent(query);
    const bingWebUrl = `https://www.bing.com/search?q=${encodedQuery}&count=${maxResults}&setlang=zh-cn`;

    const response = await withTimeout(
      fetch(bingWebUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
        }
      }),
      timeout,
      'Bing网页搜索超时'
    );

    const html = await response.text();
    const results: WebSearchResult[] = [];

    // 解析 Bing 搜索结果 HTML
    // 查找搜索结果的模式
    const resultBlocks = html.split(/<li class="b_algo"/);

    for (let i = 1; i < resultBlocks.length && results.length < maxResults; i++) {
      const block = resultBlocks[i];

      // 提取标题和链接
      const titleMatch = block.match(/<h2[^>]*><a[^>]*href="([^"]*)"[^>]*>([^<]*(?:<[^>]*>[^<]*<\/[^>]*>[^<]*)*)<\/a><\/h2>/);
      if (titleMatch) {
        const [, url, titleHtml] = titleMatch;
        const title = titleHtml.replace(/<[^>]+>/g, '').trim();

        // 提取描述
        const descMatch = block.match(/<p[^>]*>([^<]*(?:<[^>]*>[^<]*<\/[^>]*>[^<]*)*)<\/p>/);
        const snippet = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '无描述';

        if (title && url) {
          results.push({
            title: title.substring(0, 100), // 限制标题长度
            link: url.startsWith('http') ? url : `https://www.bing.com${url}`,
            snippet: snippet.substring(0, 200), // 限制描述长度
            source: 'Bing Web'
          });
        }
      }
    }

    return results.length > 0 ? results : [{
      title: 'Bing搜索',
      link: `https://www.bing.com/search?q=${encodedQuery}`,
      snippet: '点击链接查看 Bing 搜索结果',
      source: 'Bing Web'
    }];
  } catch (error: any) {
    return [{
      title: '搜索失败',
      link: `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
      snippet: `网页搜索出错: ${error.message}`,
      source: 'Error'
    }];
  }
}