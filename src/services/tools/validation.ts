/**
 * 参数验证工具
 * 使用 zod 提供类型安全的参数验证
 */

import { z } from 'zod';

// ==================== 常用验证器 ====================

// 基础类型
export const validators = {
  // 字符串
  string: z.string(),
  nonEmptyString: z.string().min(1, '不能为空'),
  email: z.string().email('无效的邮箱格式'),
  url: z.string().url('无效的 URL 格式'),
  uuid: z.string().uuid('无效的 UUID 格式'),

  // 数字
  number: z.number(),
  positiveNumber: z.number().positive('必须为正数'),
  int: z.number().int('必须为整数'),
  port: z.number().int().min(1).max(65535, '端口号必须在 1-65535 之间'),

  // 布尔
  boolean: z.boolean(),

  // 数组
  stringArray: z.array(z.string()),
  numberArray: z.array(z.number()),

  // 对象
  record: z.record(z.string(), z.any()),

  // 可选
  optional: <T extends z.ZodTypeAny>(schema: T) => schema.optional(),
  nullable: <T extends z.ZodTypeAny>(schema: T) => schema.nullable(),

  // 默认值
  withDefault: <T extends z.ZodTypeAny>(schema: T, defaultValue: z.infer<T>) =>
    schema.default(defaultValue as any)
};

// ==================== 工具参数验证器 ====================

// 文件路径验证
export const filePathSchema = z.string().min(1, '文件路径不能为空');

// 目录路径验证
export const dirPathSchema = z.string().min(1, '目录路径不能为空');

// 文件编辑验证
export const editSchema = z.object({
  file_path: filePathSchema,
  old_string: z.string(),
  new_string: z.string()
});

// 多文件编辑验证
export const multiEditSchema = z.object({
  edits: z.array(editSchema).min(1, '至少需要一个编辑操作')
});

// Bash 命令验证
export const bashSchema = z.object({
  command: z.string().min(1, '命令不能为空'),
  timeout: validators.withDefault(validators.positiveNumber, 60000)
});

// Glob 搜索验证
export const globSchema = z.object({
  pattern: z.string().min(1, '搜索模式不能为空'),
  path: validators.optional(filePathSchema)
});

// Grep 搜索验证
export const grepSchema = z.object({
  pattern: z.string().min(1, '搜索模式不能为空'),
  path: validators.optional(filePathSchema),
  include: validators.optional(z.string()),
  ignore_case: validators.withDefault(z.boolean(), true)
});

// Web 请求验证
export const webFetchSchema = z.object({
  url: validators.url,
  timeout: validators.withDefault(validators.positiveNumber, 30000)
});

// Web 搜索验证
export const webSearchSchema = z.object({
  query: z.string().min(1, '搜索关键词不能为空')
});

// ==================== 验证函数 ====================

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: string[];
}

export function validate<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): ValidationResult<z.infer<T>> {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.issues.map((e: z.ZodIssue) => {
    const path = e.path.join('.');
    return path ? `${path}: ${e.message}` : e.message;
  });

  return { success: false, errors };
}

// 验证并抛出错误
export function validateOrThrow<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): z.infer<T> {
  return schema.parse(data);
}

// ==================== 自定义验证器构建器 ====================

export function createValidator<T extends z.ZodRawShape>(shape: T) {
  const schema = z.object(shape);

  return {
    schema,
    validate: (data: unknown) => validate(schema, data),
    validateOrThrow: (data: unknown) => schema.parse(data)
  };
}

// ==================== 工具输入验证中间件 ====================

export function validateToolInput<T extends z.ZodTypeAny>(
  toolName: string,
  schema: T,
  input: unknown
): { valid: boolean; data?: z.infer<T>; error?: string } {
  const result = validate(schema, input);

  if (!result.success) {
    return {
      valid: false,
      error: `[${toolName}] 参数验证失败: ${result.errors?.join(', ')}`
    };
  }

  return { valid: true, data: result.data };
}

export { z };
export default z;