# 文件读取分段功能改进

## 概述
将项目的 `read_file` 工具从截断模式改为分段读取模式，支持精确读取文件指定行范围，就像 VS Code Copilot 一样。

## 修改内容

### 1. 工具参数更新
**之前：**
```typescript
{
  file_path: string,
  offset?: number,  // 0-based 起始行
  limit?: number    // 读取行数
}
```

**现在：**
```typescript
{
  file_path: string,
  startLine?: number,  // 1-based 起始行
  endLine?: number     // 1-based 结束行
}
```

### 2. 移除截断逻辑
- **之前：** 内容超过 15,000 字符自动截断
- **现在：** 支持读取任意大小的文件段，支持分段读取大文件

### 3. 增强的行号信息
返回结果现在包含行号范围信息：
```
文件内容 (/path/to/file) - 行 1-10 (共 100 行):
```

## 使用示例

### 读取前 10 行
```json
{
  "name": "read_file",
  "input": {
    "file_path": "large_file.txt",
    "startLine": 1,
    "endLine": 10
  }
}
```

### 读取第 50-100 行
```json
{
  "name": "read_file",
  "input": {
    "file_path": "large_file.txt",
    "startLine": 50,
    "endLine": 100
  }
}
```

### 读取从第 20 行开始的所有内容
```json
{
  "name": "read_file",
  "input": {
    "file_path": "large_file.txt",
    "startLine": 20
  }
}
```

## 优势
- **精确读取：** 可以读取文件的任意段落
- **无截断：** 支持读取大文件的指定部分
- **行号友好：** 使用 1-based 行号，与编辑器一致
- **性能优化：** 只读取需要的部分，避免内存浪费

## 文件修改
- `src/services/toolExecutor/definitions.ts` - 更新工具定义
- `src/services/toolExecutor/filesystem.ts` - 重新实现读取逻辑
- `QWEN.md` - 更新文档

## 兼容性
- 向后兼容：不提供 `startLine`/`endLine` 时读取整个文件
- WebSocket 消息：新增 `range` 字段提供行号信息