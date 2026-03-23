/**
 * 项目分析工具处理器
 */

import * as path from 'path';
import * as fs from 'fs';
import { ToolContext } from '../toolExecutor/context';
import { resolveToWorkingDir } from './utils';
import { getWorkingDir } from '../workingDir';

export async function handleProjectTool(
  tool: { name: string; input?: any },
  ctx: ToolContext
): Promise<string | null> {
  switch (tool.name) {
    case 'project_index': {
      const rootPath = resolveToWorkingDir(tool.input?.root_path) || getWorkingDir();
      const maxDepth = tool.input?.max_depth || 5;

      try {
        let structure = '';
        try {
          const treeCmd = process.platform === 'win32' ? 'tree /F' : 'find . -type f | head -200';
          structure = require('child_process').execSync(treeCmd, { cwd: rootPath, encoding: 'utf-8', maxBuffer: 1024 * 1024 });
        } catch (e) {
          structure = '无法生成树状图';
        }

        const fileTypes: Record<string, number> = {};

        function countFiles(dir: string, depth: number) {
          if (depth > maxDepth) return;

          let items;
          try {
            items = fs.readdirSync(dir, { withFileTypes: true });
          } catch (e) {
            return;
          }

          for (const item of items) {
            if (item.name.startsWith('.') || item.name === 'node_modules') continue;

            if (item.isDirectory()) {
              countFiles(path.join(dir, item.name), depth + 1);
            } else if (item.isFile()) {
              const ext = path.extname(item.name).toLowerCase() || '(无扩展名)';
              fileTypes[ext] = (fileTypes[ext] || 0) + 1;
            }
          }
        }

        countFiles(rootPath, 0);

        const typeSummary = Object.entries(fileTypes)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([ext, count]) => `  ${ext}: ${count} 个文件`)
          .join('\n');

        const totalFiles = Object.values(fileTypes).reduce((a, b) => a + b, 0);

        return `项目索引 (${rootPath}):\n\n📁 目录结构:\n${structure}\n\n📊 文件类型统计 (共 ${totalFiles} 个文件):\n${typeSummary}`;
      } catch (e: any) {
        return `生成项目索引失败：${e.message}`;
      }
    }

    case 'find_entry_points': {
      const rootPath = resolveToWorkingDir(tool.input?.root_path) || getWorkingDir();

      try {
        const entryNames = [
          'main.ts', 'main.js', 'main.py', 'main.go', 'main.rs',
          'index.ts', 'index.js', 'index.py',
          'app.ts', 'app.js', 'app.py',
          'server.ts', 'server.js', 'server.py'
        ];

        const entries: string[] = [];

        function findEntries(dir: string, depth: number) {
          if (depth > 3) return;

          let items;
          try {
            items = fs.readdirSync(dir, { withFileTypes: true });
          } catch (e) {
            return;
          }

          for (const item of items) {
            if (item.name.startsWith('.') || item.name === 'node_modules') continue;

            const fullPath = path.join(dir, item.name);

            if (item.isDirectory()) {
              if (entryNames.includes(item.name)) {
                entries.push('[DIR] ' + fullPath);
              }
              findEntries(fullPath, depth + 1);
            } else if (item.isFile() && entryNames.includes(item.name)) {
              entries.push('[FILE] ' + fullPath);
            }
          }
        }

        findEntries(rootPath, 0);

        const pkgPath = path.join(rootPath, 'package.json');
        if (fs.existsSync(pkgPath)) {
          try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            if (pkg.main) {
              entries.unshift('[npm main] ' + pkg.main);
            }
          } catch (e) {}
        }

        if (entries.length === 0) {
          return '未找到明显的入口点文件';
        }

        return `项目入口点 (${rootPath}):\n${entries.join('\n')}`;
      } catch (e: any) {
        return `查找入口点失败：${e.message}`;
      }
    }

    case 'analyze_dependencies': {
      const rootPath = resolveToWorkingDir(tool.input?.root_path) || getWorkingDir();

      try {
        const deps: string[] = [];

        const pkgPath = path.join(rootPath, 'package.json');
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          const depCount = pkg.dependencies ? Object.keys(pkg.dependencies).length : 0;
          const devDepCount = pkg.devDependencies ? Object.keys(pkg.devDependencies).length : 0;
          deps.push(`Node.js 项目：${pkg.name || 'unknown'}@${pkg.version || '0.0.0'} - 生产依赖：${depCount} 个，开发依赖：${devDepCount} 个`);
        }

        const reqPath = path.join(rootPath, 'requirements.txt');
        if (fs.existsSync(reqPath)) {
          const content = fs.readFileSync(reqPath, 'utf-8');
          const packages = content.split('\n').filter(line => line.trim() && !line.startsWith('#')).length;
          deps.push(`Python 项目：${packages} 个依赖包`);
        }

        const goPath = path.join(rootPath, 'go.mod');
        if (fs.existsSync(goPath)) {
          const content = fs.readFileSync(goPath, 'utf-8');
          const moduleMatch = content.match(/module\s+(\S+)/);
          deps.push(`Go 模块：${moduleMatch ? moduleMatch[1] : 'unknown'}`);
        }

        const cargoPath = path.join(rootPath, 'Cargo.toml');
        if (fs.existsSync(cargoPath)) {
          const content = fs.readFileSync(cargoPath, 'utf-8');
          const nameMatch = content.match(/^name\s*=\s*"([^"]+)"/m);
          deps.push(`Rust 项目：${nameMatch ? nameMatch[1] : 'unknown'}`);
        }

        if (deps.length === 0) {
          return '未找到常见的依赖配置文件';
        }

        return `项目依赖分析 (${rootPath}):\n\n${deps.join('\n')}`;
      } catch (e: any) {
        return `分析依赖失败：${e.message}`;
      }
    }

    default:
      return null;
  }
}