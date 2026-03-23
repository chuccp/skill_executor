/**
 * Markdown 处理工具
 * 使用 marked + gray-matter 提供 Markdown 解析和 frontmatter 支持
 */

import { marked } from 'marked';
import matter from 'gray-matter';
import * as fs from 'fs';

// ==================== Markdown 解析 ====================

export interface ParsedMarkdown {
  frontmatter: Record<string, any>;
  content: string;
  html: string;
  toc: { level: number; text: string; slug: string }[];
  links: { text: string; href: string }[];
  images: { alt: string; src: string }[];
}

// 配置 marked
marked.setOptions({
  gfm: true,
  breaks: true
});

export function parseMarkdown(markdown: string): ParsedMarkdown {
  // 解析 frontmatter
  const { data: frontmatter, content } = matter(markdown);

  // 解析为 HTML
  const html = marked.parse(content) as string;

  // 提取目录
  const toc: { level: number; text: string; slug: string }[] = [];
  const tokens = marked.lexer(content);

  function extractHeadings(tokens: any[]) {
    for (const token of tokens) {
      if (token.type === 'heading') {
        toc.push({
          level: token.depth,
          text: token.text,
          slug: slugify(token.text)
        });
      }
      if (token.tokens) {
        extractHeadings(token.tokens);
      }
    }
  }

  extractHeadings(tokens);

  // 提取链接和图片
  const links: { text: string; href: string }[] = [];
  const images: { alt: string; src: string }[] = [];

  function extractMedia(tokens: any[]) {
    for (const token of tokens) {
      if (token.type === 'link') {
        links.push({ text: token.text, href: token.href });
      }
      if (token.type === 'image') {
        images.push({ alt: token.text || '', src: token.href });
      }
      if (token.tokens) {
        extractMedia(token.tokens);
      }
    }
  }

  extractMedia(tokens);

  return {
    frontmatter,
    content,
    html,
    toc,
    links,
    images
  };
}

// ==================== Markdown 文件操作 ====================

export interface MarkdownFile {
  path: string;
  frontmatter: Record<string, any>;
  content: string;
  html: string;
}

export function readMarkdownFile(filePath: string): MarkdownFile {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseMarkdown(raw);

  return {
    path: filePath,
    frontmatter: parsed.frontmatter,
    content: parsed.content,
    html: parsed.html
  };
}

export function writeMarkdownFile(
  filePath: string,
  content: string,
  frontmatter?: Record<string, any>
): void {
  const output = frontmatter
    ? matter.stringify(content, frontmatter)
    : content;

  fs.writeFileSync(filePath, output, 'utf-8');
}

// ==================== Markdown 转换 ====================

export function markdownToHtml(markdown: string): string {
  return marked.parse(markdown) as string;
}

export function extractMarkdownHeadings(markdown: string): { level: number; text: string }[] {
  const headings: { level: number; text: string }[] = [];
  const lines = markdown.split('\n');

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim()
      });
    }
  }

  return headings;
}

// ==================== 技能文件解析 ====================

export interface SkillFile {
  name: string;
  description: string;
  triggers: string[];
  prompt: string;
  path: string;
}

export function parseSkillFile(filePath: string): SkillFile {
  const content = fs.readFileSync(filePath, 'utf-8');
  return parseSkillContent(content, filePath);
}

export function parseSkillContent(content: string, filePath: string = ''): SkillFile {
  const lines = content.split('\n');
  let name = '';
  let description = '';
  let triggers: string[] = [];
  let prompt = '';
  let section = 'header';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 标题作为技能名
    if (line.startsWith('# ') && !name) {
      name = line.substring(2).trim();
      continue;
    }

    // TRIGGER 部分
    if (line.trim() === 'TRIGGER') {
      section = 'trigger';
      continue;
    }

    // PROMPT 部分
    if (line.trim() === 'PROMPT:') {
      section = 'prompt';
      continue;
    }

    // 根据当前部分处理
    if (section === 'header' && line.trim() && !line.startsWith('#') && !line.startsWith('-')) {
      description = (description + ' ' + line.trim()).trim();
    } else if (section === 'trigger') {
      if (line.startsWith('- ')) {
        triggers.push(line.substring(2).trim());
      } else if (line.trim() && !line.startsWith('-')) {
        section = 'header';
      }
    } else if (section === 'prompt') {
      prompt += line + '\n';
    }
  }

  // 如果没有找到名字，使用文件名
  if (!name && filePath) {
    name = require('path').basename(filePath, '.md');
  }

  return {
    name,
    description: description.trim(),
    triggers,
    prompt: prompt.trim(),
    path: filePath
  };
}

// ==================== 辅助函数 ====================

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    .replace(/^-|-$/g, '');
}