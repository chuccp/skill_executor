/**
 * Git 工具处理器
 */

import * as path from 'path';
import { WebSocket } from 'ws';
import { listWorktrees, createWorktree, removeWorktree } from '../tools';
import { ToolContext } from '../toolExecutor/context';
import { resolveToWorkingDir } from './utils';
import { getWorkingDir } from '../workingDir';

const { execSync } = require('child_process');

export async function handleGitTool(
  tool: { name: string; input?: any },
  ctx: ToolContext
): Promise<string | null> {
  const { conversationId, ws } = ctx;

  switch (tool.name) {
    case 'git_status': {
      const repoPath = resolveToWorkingDir(tool.input?.repo_path) || getWorkingDir();

      try {
        const result = execSync('git status --short', { cwd: repoPath, encoding: 'utf-8' });

        if (!result.trim()) {
          return 'Git 状态：工作区干净，没有未提交的更改';
        }

        return `Git 状态 (${repoPath}):\n${result}`;
      } catch (e: any) {
        return `获取 Git 状态失败：${e.message}`;
      }
    }

    case 'git_diff': {
      const repoPath = resolveToWorkingDir(tool.input?.repo_path) || getWorkingDir();
      const staged = tool.input?.staged ? '--staged' : '';
      const filePath = tool.input?.file_path || '';

      try {
        const cmd = `git diff ${staged} ${filePath}`.trim();
        const result = execSync(cmd, { cwd: repoPath, encoding: 'utf-8' });

        if (!result.trim()) {
          return `Git 差异：${staged ? '暂存区' : '工作区'} 没有变化`;
        }

        return `Git 差异 (${repoPath}):\n${result}`;
      } catch (e: any) {
        return `获取 Git 差异失败：${e.message}`;
      }
    }

    case 'git_log': {
      const repoPath = resolveToWorkingDir(tool.input?.repo_path) || getWorkingDir();
      const maxCount = tool.input?.max_count || 10;

      try {
        const format = '--pretty=format:"%h - %an, %ar : %s"';
        const result = execSync(`git log ${format} -n ${maxCount}`, { cwd: repoPath, encoding: 'utf-8' });

        if (!result.trim()) {
          return 'Git 日志：没有找到提交记录';
        }

        return `Git 提交历史 (${repoPath}, 最近 ${maxCount} 条):\n${result}`;
      } catch (e: any) {
        return `获取 Git 日志失败：${e.message}`;
      }
    }

    case 'git_branch': {
      const repoPath = resolveToWorkingDir(tool.input?.repo_path) || getWorkingDir();
      const remote = tool.input?.remote ? '-r' : '';

      try {
        const result = execSync(`git branch ${remote}`, { cwd: repoPath, encoding: 'utf-8' });

        if (!result.trim()) {
          return 'Git 分支：没有找到分支';
        }

        return `Git 分支 (${repoPath}):\n${result}`;
      } catch (e: any) {
        return `获取 Git 分支失败：${e.message}`;
      }
    }

    case 'git_checkout': {
      const repoPath = resolveToWorkingDir(tool.input?.repo_path) || getWorkingDir();
      const branchName = tool.input?.branch_name;
      const createNew = tool.input?.create_new || false;

      if (!branchName) {
        return '错误：分支名称不能为空';
      }

      try {
        const cmd = createNew ? `git checkout -b ${branchName}` : `git checkout ${branchName}`;
        const result = execSync(cmd, { cwd: repoPath, encoding: 'utf-8' });

        return `Git 切换分支：${createNew ? '创建并切换到' : '已切换到'} ${branchName}\n${result}`;
      } catch (e: any) {
        return `Git 切换分支失败：${e.message}`;
      }
    }

    case 'git_add': {
      const repoPath = resolveToWorkingDir(tool.input?.repo_path) || getWorkingDir();
      const files = tool.input?.files || [];

      if (!files.length) {
        return '错误：文件列表不能为空';
      }

      try {
        const cmd = `git add ${files.join(' ')}`;
        execSync(cmd, { cwd: repoPath, encoding: 'utf-8' });

        return `Git 添加文件成功：${files.join(', ')}`;
      } catch (e: any) {
        return `Git 添加文件失败：${e.message}`;
      }
    }

    case 'git_commit': {
      const repoPath = resolveToWorkingDir(tool.input?.repo_path) || getWorkingDir();
      const message = tool.input?.message;
      const amend = tool.input?.amend || false;

      if (!message) {
        return '错误：提交信息不能为空';
      }

      // 危险操作，需要确认
      if (!ws || !ctx.pendingCommands) {
        return `需要用户确认提交：${message}`;
      }

      // 等待用户确认
      const confirmResult = await new Promise<boolean>((resolve) => {
        const confirmId = `${conversationId}-${Date.now()}`;
        ctx.pendingCommands!.set(confirmId, {
          command: `git commit ${amend ? '--amend' : ''} -m "${message}"`,
          action: 'git_commit',
          ws: ws!,
          conversationId,
          resolve: (approved: boolean) => resolve(approved)
        });
        ws.send(JSON.stringify({
          type: 'command_confirm',
          confirmId,
          command: `Git 提交：${message}${amend ? ' (修正上一次提交)' : ''}`
        }));
      });

      if (!confirmResult) {
        return 'Git 提交已取消';
      }

      // 执行提交
      try {
        const cmd = `git commit ${amend ? '--amend ' : ''}-m "${message}"`;
        const result = execSync(cmd, { cwd: repoPath, encoding: 'utf-8' });
        return `Git 提交成功：${message}\n${result}`;
      } catch (e: any) {
        return `Git 提交失败：${e.message}`;
      }
    }

    case 'git_worktree_list': {
      const repoPath = resolveToWorkingDir(tool.input?.repo_path);

      const worktrees = await listWorktrees(repoPath);
      if (worktrees.length === 0) {
        return `未找到工作树，或不是 Git 仓库`;
      }

      const output = worktrees.map(w => {
        const mainTag = w.isMain ? ' [MAIN]' : '';
        return `${mainTag} ${w.path}\n    分支: ${w.branch || '(detached)'}\n    HEAD: ${w.head?.substring(0, 8)}`;
      }).join('\n\n');

      return `Git 工作树 (${worktrees.length} 个):\n\n${output}`;
    }

    case 'git_worktree_create': {
      const repoPath = resolveToWorkingDir(tool.input?.repo_path);
      const branchName = tool.input?.branch_name;
      const worktreePath = tool.input?.worktree_path;

      if (!branchName || !worktreePath) {
        return '错误：缺少分支名称或工作树路径';
      }

      const result = await createWorktree(repoPath, branchName, worktreePath);
      if (result.success && ws) {
        ws.send(JSON.stringify({ type: 'worktree_created', branchName, worktreePath }));
      }
      return result.message;
    }

    case 'git_worktree_remove': {
      const repoPath = resolveToWorkingDir(tool.input?.repo_path);
      const worktreePath = tool.input?.worktree_path;

      if (!worktreePath) {
        return '错误：缺少工作树路径';
      }

      const result = await removeWorktree(repoPath, worktreePath);
      if (result.success && ws) {
        ws.send(JSON.stringify({ type: 'worktree_removed', worktreePath }));
      }
      return result.message;
    }

    default:
      return null;
  }
}