/**
 * Git Worktree 工具
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ==================== Git Worktree ====================

export interface WorktreeInfo {
  path: string;
  branch: string;
  head: string;
  isMain: boolean;
}

export async function listWorktrees(repoPath: string): Promise<WorktreeInfo[]> {
  try {
    const { stdout } = await execAsync('git worktree list --porcelain', { cwd: repoPath });
    const worktrees: WorktreeInfo[] = [];
    const lines = stdout.split('\n');

    let currentWorktree: Partial<WorktreeInfo> = {};
    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        if (currentWorktree.path) {
          worktrees.push(currentWorktree as WorktreeInfo);
        }
        currentWorktree = { path: line.substring(9) };
      } else if (line.startsWith('HEAD ')) {
        currentWorktree.head = line.substring(5);
      } else if (line.startsWith('branch ')) {
        currentWorktree.branch = line.substring(7);
      }
    }
    if (currentWorktree.path) {
      worktrees.push(currentWorktree as WorktreeInfo);
    }

    // 标记主工作树
    if (worktrees.length > 0) {
      worktrees[0].isMain = true;
    }

    return worktrees;
  } catch {
    return [];
  }
}

export async function createWorktree(
  repoPath: string,
  branchName: string,
  worktreePath: string
): Promise<{ success: boolean; message: string }> {
  try {
    await execAsync(`git worktree add "${worktreePath}" -b "${branchName}"`, { cwd: repoPath });
    return { success: true, message: `工作树创建成功: ${worktreePath}` };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

export async function removeWorktree(
  repoPath: string,
  worktreePath: string
): Promise<{ success: boolean; message: string }> {
  try {
    await execAsync(`git worktree remove "${worktreePath}"`, { cwd: repoPath });
    return { success: true, message: `工作树已删除: ${worktreePath}` };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}