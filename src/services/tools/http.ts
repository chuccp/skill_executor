/**
 * 增强的 HTTP 客户端
 * 使用 ky 提供更简洁的 HTTP 请求 API
 */

import ky, { type KyInstance, type Options as KyOptions } from 'ky';

// ==================== 类型定义 ====================

export interface HttpClientOptions {
  baseUrl?: string;
  timeout?: number;
  headers?: Record<string, string>;
  retries?: number;
  hooks?: {
    beforeRequest?: ((request: Request) => Request | Promise<Request> | void)[];
    afterResponse?: ((request: Request, options: KyOptions, response: Response) => Response | Promise<Response> | void)[];
  };
}

export interface HttpResponse<T = any> {
  data: T;
  status: number;
  headers: Headers;
}

// ==================== 创建 HTTP 客户端 ====================

export function createHttpClient(options: HttpClientOptions = {}): KyInstance {
  const { baseUrl, timeout = 30000, headers = {}, retries = 2, hooks } = options;

  return ky.create({
    prefixUrl: baseUrl,
    timeout,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      ...headers
    },
    retry: {
      limit: retries,
      methods: ['get'],
      statusCodes: [408, 413, 429, 500, 502, 503, 504]
    },
    hooks
  });
}

// ==================== 默认客户端 ====================

export const defaultClient = createHttpClient();

// ==================== 便捷方法 ====================

export async function httpGet<T = any>(
  url: string,
  options?: { headers?: Record<string, string>; timeout?: number }
): Promise<HttpResponse<T>> {
  const response = await ky.get(url, {
    headers: options?.headers,
    timeout: options?.timeout || 30000
  });

  const data = await response.json<T>();

  return {
    data,
    status: response.status,
    headers: response.headers
  };
}

export async function httpPost<T = any>(
  url: string,
  body: any,
  options?: { headers?: Record<string, string>; timeout?: number }
): Promise<HttpResponse<T>> {
  const response = await ky.post(url, {
    json: body,
    headers: options?.headers,
    timeout: options?.timeout || 30000
  });

  const data = await response.json<T>();

  return {
    data,
    status: response.status,
    headers: response.headers
  };
}

export async function httpPut<T = any>(
  url: string,
  body: any,
  options?: { headers?: Record<string, string>; timeout?: number }
): Promise<HttpResponse<T>> {
  const response = await ky.put(url, {
    json: body,
    headers: options?.headers,
    timeout: options?.timeout || 30000
  });

  const data = await response.json<T>();

  return {
    data,
    status: response.status,
    headers: response.headers
  };
}

export async function httpDelete<T = any>(
  url: string,
  options?: { headers?: Record<string, string>; timeout?: number }
): Promise<HttpResponse<T>> {
  const response = await ky.delete(url, {
    headers: options?.headers,
    timeout: options?.timeout || 30000
  });

  const data = await response.json<T>();

  return {
    data,
    status: response.status,
    headers: response.headers
  };
}

// ==================== 文本和流式响应 ====================

export async function httpGetText(url: string, options?: { headers?: Record<string, string>; timeout?: number }): Promise<string> {
  return ky.get(url, {
    headers: options?.headers,
    timeout: options?.timeout || 30000
  }).text();
}

export async function httpGetBuffer(url: string, options?: { headers?: Record<string, string>; timeout?: number }): Promise<Buffer> {
  const arrayBuffer = await ky.get(url, {
    headers: options?.headers,
    timeout: options?.timeout || 30000
  }).arrayBuffer();

  return Buffer.from(arrayBuffer);
}

// ==================== 流式下载 ====================

export async function downloadFile(
  url: string,
  outputPath: string,
  options?: { headers?: Record<string, string>; timeout?: number; onProgress?: (downloaded: number, total?: number) => void }
): Promise<void> {
  const response = await ky.get(url, {
    headers: options?.headers,
    timeout: options?.timeout || 60000
  });

  const contentLength = response.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : undefined;

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const chunks: Uint8Array[] = [];
  let downloaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunks.push(value);
    downloaded += value.length;

    if (options?.onProgress) {
      options.onProgress(downloaded, total);
    }
  }

  const buffer = Buffer.concat(chunks);
  const fs = await import('fs/promises');
  await fs.writeFile(outputPath, buffer);
}

// ==================== 重试请求 ====================

export async function httpGetWithRetry<T = any>(
  url: string,
  options?: { headers?: Record<string, string>; timeout?: number; maxRetries?: number; retryDelay?: number }
): Promise<HttpResponse<T>> {
  const { maxRetries = 3, retryDelay = 1000, ...httpOptions } = options || {};

  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await httpGet<T>(url, httpOptions);
    } catch (error: any) {
      lastError = error;

      // 不重试的状态码
      if (error.response?.status === 400 || error.response?.status === 401 || error.response?.status === 403) {
        throw error;
      }

      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * (i + 1)));
      }
    }
  }

  throw lastError;
}

export { ky };
export default defaultClient;