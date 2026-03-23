/**
 * 增强的 Web 抓取工具
 * 使用 cheerio + turndown 提供更好的 HTML 解析和转换
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';

// ==================== HTTP 客户端 ====================

export interface FetchOptions {
  headers?: Record<string, string>;
  timeout?: number;
  followRedirects?: boolean;
}

export async function httpRequest(
  url: string,
  options?: FetchOptions
): Promise<{ status: number; headers: Record<string, string>; data: string }> {
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      ...options?.headers
    },
    timeout: options?.timeout || 30000,
    maxRedirects: options?.followRedirects !== false ? 5 : 0,
    responseType: 'text'
  });

  return {
    status: response.status,
    headers: response.headers as Record<string, string>,
    data: response.data
  };
}

// ==================== HTML 解析 ====================

export interface ParsedHtml {
  title: string;
  text: string;
  links: { text: string; href: string }[];
  images: { alt: string; src: string }[];
  meta: {
    description?: string;
    keywords?: string[];
    author?: string;
  };
}

export function parseHtml(html: string, baseUrl?: string): ParsedHtml {
  const $ = cheerio.load(html);

  // 移除不需要的元素
  $('script, style, nav, footer, header, aside').remove();

  const title = $('title').text().trim() || $('h1').first().text().trim();

  const text = $('body').text()
    .replace(/\s+/g, ' ')
    .trim();

  const links: { text: string; href: string }[] = [];
  $('a[href]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href');
    if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
      links.push({
        text: $el.text().trim(),
        href: baseUrl ? new URL(href, baseUrl).href : href
      });
    }
  });

  const images: { alt: string; src: string }[] = [];
  $('img[src]').each((_, el) => {
    const $el = $(el);
    const src = $el.attr('src');
    if (src) {
      images.push({
        alt: $el.attr('alt') || '',
        src: baseUrl ? new URL(src, baseUrl).href : src
      });
    }
  });

  const meta = {
    description: $('meta[name="description"]').attr('content'),
    keywords: $('meta[name="keywords"]').attr('content')?.split(',').map(k => k.trim()),
    author: $('meta[name="author"]').attr('content')
  };

  return { title, text, links, images, meta };
}

// ==================== HTML 转 Markdown ====================

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-'
});

// 自定义规则
turndownService.addRule('strikethrough', {
  filter: ['del', 's'],
  replacement: (content) => `~~${content}~~`
});

export function htmlToMarkdown(html: string): string {
  return turndownService.turndown(html);
}

// ==================== 智能抓取 ====================

export interface WebScrapeResult {
  url: string;
  title: string;
  markdown: string;
  text: string;
  links: { text: string; href: string }[];
  images: { alt: string; src: string }[];
  meta: {
    description?: string;
    keywords?: string[];
    author?: string;
  };
}

export async function scrapeWebPage(url: string, options?: FetchOptions): Promise<WebScrapeResult> {
  const { data: html } = await httpRequest(url, options);
  const parsed = parseHtml(html, url);

  // 提取主要内容区域
  const $ = cheerio.load(html);
  $('script, style, nav, footer, header, aside, .sidebar, .navigation, .menu').remove();

  // 尝试找到主要内容
  const mainContent = $('main, article, .content, #content, .post, .article').first();
  const contentHtml = mainContent.length ? mainContent.html() || '' : $('body').html() || '';

  const markdown = htmlToMarkdown(contentHtml);

  return {
    url,
    title: parsed.title,
    markdown,
    text: parsed.text,
    links: parsed.links.slice(0, 50),
    images: parsed.images.slice(0, 20),
    meta: parsed.meta
  };
}

// ==================== API 请求 ====================

export async function fetchJson<T = any>(url: string, options?: FetchOptions): Promise<T> {
  const response = await axios.get(url, {
    headers: {
      'Accept': 'application/json',
      ...options?.headers
    },
    timeout: options?.timeout || 30000
  });

  return response.data;
}

export async function postJson<T = any>(
  url: string,
  data: any,
  options?: FetchOptions
): Promise<T> {
  const response = await axios.post(url, data, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers
    },
    timeout: options?.timeout || 30000
  });

  return response.data;
}