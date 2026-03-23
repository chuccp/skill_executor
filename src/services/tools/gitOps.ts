/**
 * Git 操作工具
 * 使用 simple-git 提供更安全的 Git 操作
 */

import simpleGit, { SimpleGit, SimpleGitOptions } from 'simple-git';
import * as path from 'path';

// ==================== Git 客户端 ====================

function createGitClient(repoPath?: string): SimpleGit {
  const options: Partial<SimpleGitOptions> = {
    baseDir: repoPath || process.cwd(),
    binary: 'git',
    maxConcurrentProcesses: 6,
    trimmed: true
  };

  return simpleGit(options);
}

// ==================== 状态和信息 ====================

export interface GitStatus {
  created: string[];
  deleted: string[];
  modified: string[];
  renamed: { from: string; to: string }[];
  conflicted: string[];
  staged: string[];
  ahead: number;
  behind: number;
  current: string | null;
  tracking: string | null;
  isClean: boolean;
}

export async function getGitStatus(repoPath?: string): Promise<GitStatus> {
  const git = createGitClient(repoPath);
  const status = await git.status();

  return {
    created: status.created,
    deleted: status.deleted,
    modified: status.modified,
    renamed: status.renamed.map(r => ({ from: r.from, to: r.to })),
    conflicted: status.conflicted,
    staged: status.staged,
    ahead: status.ahead,
    behind: status.behind,
    current: status.current,
    tracking: status.tracking,
    isClean: status.isClean()
  };
}

export async function getGitLog(repoPath?: string, maxCount: number = 20): Promise<{
  hash: string;
  date: string;
  message: string;
  author_name: string;
  author_email: string;
}[]> {
  const git = createGitClient(repoPath);
  const log = await git.log(['--max-count', String(maxCount)]);

  return log.all.map(commit => ({
    hash: commit.hash,
    date: commit.date,
    message: commit.message,
    author_name: commit.author_name,
    author_email: commit.author_email
  }));
}

export async function getGitBranches(repoPath?: string): Promise<{
  current: string;
  all: string[];
  local: string[];
  remote: string[];
}> {
  const git = createGitClient(repoPath);
  const branches = await git.branchLocal();

  return {
    current: branches.current,
    all: branches.all,
    local: branches.all.filter(b => !b.startsWith('remotes/')),
    remote: branches.all.filter(b => b.startsWith('remotes/'))
  };
}

// ==================== 操作 ====================

export async function gitAdd(files: string | string[], repoPath?: string): Promise<void> {
  const git = createGitClient(repoPath);
  await git.add(files);
}

export async function gitCommit(message: string, repoPath?: string): Promise<{ hash: string }> {
  const git = createGitClient(repoPath);
  const result = await git.commit(message);
  return { hash: result.commit };
}

export async function gitPush(repoPath?: string, remote?: string, branch?: string): Promise<void> {
  const git = createGitClient(repoPath);
  await git.push(remote || 'origin', branch);
}

export async function gitPull(repoPath?: string, remote?: string, branch?: string): Promise<{
  files: string[];
  insertions: number;
  deletions: number;
}> {
  const git = createGitClient(repoPath);
  const result = await git.pull(remote || 'origin', branch);
  return {
    files: result.files,
    insertions: result.summary.insertions,
    deletions: result.summary.deletions
  };
}

export async function gitCheckout(branch: string, repoPath?: string): Promise<void> {
  const git = createGitClient(repoPath);
  await git.checkout(branch);
}

export async function gitCreateBranch(branch: string, repoPath?: string): Promise<void> {
  const git = createGitClient(repoPath);
  await git.checkoutLocalBranch(branch);
}

export async function gitMerge(branch: string, repoPath?: string): Promise<void> {
  const git = createGitClient(repoPath);
  await git.merge([branch]);
}

// ==================== Diff ====================

export async function getGitDiff(repoPath?: string, options?: {
  cached?: boolean;
  file?: string;
}): Promise<string> {
  const git = createGitClient(repoPath);

  const args: string[] = [];
  if (options?.cached) args.push('--cached');
  if (options?.file) args.push('--', options.file);

  return git.diff(args);
}

// ==================== 远程操作 ====================

export async function getGitRemotes(repoPath?: string): Promise<{
  name: string;
  refs: { fetch: string; push: string };
}[]> {
  const git = createGitClient(repoPath);
  const remotes = await git.getRemotes(true);
  return remotes as any;
}

export async function gitFetch(repoPath?: string, remote?: string): Promise<void> {
  const git = createGitClient(repoPath);
  await git.fetch(remote || 'origin');
}

// ==================== Stash ====================

export async function gitStash(repoPath?: string, message?: string): Promise<void> {
  const git = createGitClient(repoPath);
  if (message) {
    await git.stash(['push', '-m', message]);
  } else {
    await git.stash();
  }
}

export async function gitStashPop(repoPath?: string): Promise<void> {
  const git = createGitClient(repoPath);
  await git.stash(['pop']);
}

export async function gitStashList(repoPath?: string): Promise<{ hash: string; message: string }[]> {
  const git = createGitClient(repoPath);
  const list = await git.stashList();
  return list.all.map(item => ({
    hash: item.hash,
    message: item.message
  }));
}