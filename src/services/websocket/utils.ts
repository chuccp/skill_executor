/**
 * WebSocket 服务工具函数
 */

// ==================== 模型上下文限制 ====================

/**
 * 获取模型的上下文 token 限制
 */
export function getContextLimit(model: string): number {
  const modelLower = model.toLowerCase();

  // Claude 模型
  if (modelLower.includes('claude')) {
    if (modelLower.includes('opus')) return 200000;
    if (modelLower.includes('sonnet')) return 200000;
    if (modelLower.includes('haiku')) return 200000;
    return 200000;
  }

  // GPT-4 模型
  if (modelLower.includes('gpt-4')) {
    if (modelLower.includes('turbo')) return 128000;
    return 128000;
  }

  // GPT-3.5
  if (modelLower.includes('gpt-3.5')) return 16385;

  // Qwen 模型
  if (modelLower.includes('qwen')) {
    if (modelLower.includes('max')) return 32000;
    if (modelLower.includes('plus')) return 128000;
    if (modelLower.includes('turbo')) return 128000;
    return 32000;
  }

  // DeepSeek 模型
  if (modelLower.includes('deepseek')) {
    return 64000;
  }

  // 默认限制
  return 128000;
}

// ==================== 工具依赖分析 ====================

/**
 * 定义工具之间的依赖关系
 * 如果工具需要其他工具的结果才能执行，则不能并行
 */
const TOOL_DEPENDENCIES: Record<string, string[]> = {
  // 写文件操作通常需要读文件来了解上下文
  'write_file': ['read_file'],
  'replace': ['read_file'],
  'edit': ['read_file'],
  // grep 搜索不需要依赖
  // glob 不需要依赖
  // bash 命令通常是独立的
};

/**
 * 分析一组工具调用，返回可以并行执行的组
 */
export function groupToolsForParallelExecution(toolCalls: any[]): any[][] {
  if (toolCalls.length === 0) return [];

  // 如果没有依赖配置，全部串行执行（保守策略）
  const groups: any[][] = [];
  const executed = new Set<string>();
  const remaining = [...toolCalls];

  while (remaining.length > 0) {
    const currentGroup: any[] = [];
    const toRemove: number[] = [];

    for (let i = 0; i < remaining.length; i++) {
      const tool = remaining[i];
      const deps = TOOL_DEPENDENCIES[tool.name] || [];

      // 检查依赖是否都已满足
      const depsSatisfied = deps.every(dep =>
        executed.has(`${tool.name}-${dep}`) || !toolCalls.some(t => t.name === dep)
      );

      if (depsSatisfied) {
        currentGroup.push(tool);
        toRemove.push(i);
      }
    }

    // 如果没有找到可并行的工具，至少执行一个
    if (currentGroup.length === 0 && remaining.length > 0) {
      currentGroup.push(remaining[0]);
      toRemove.push(0);
    }

    // 从剩余列表中移除已分组的工具
    for (let i = toRemove.length - 1; i >= 0; i--) {
      const idx = toRemove[i];
      const tool = remaining[idx];
      executed.add(`${tool.name}-${Date.now()}`);
      remaining.splice(idx, 1);
    }

    groups.push(currentGroup);
  }

  return groups;
}