/**
 * 文件系统工具处理器
 */

import * as fs from 'fs';
import * as path from 'path';
import { WebSocket } from 'ws';
import { listDirectory, copyFile, moveFile, deleteFile, createDirectory, getFileInfo, fileExists, replaceInFile, xmlEscape, editFile, editMultipleFiles, EditOperation, globFiles, grepContent } from '../tools';
import { ToolContext } from '../toolExecutor/context';
import { getWorkingDir } from '../workingDir';
import { formatBytes, resolveToWorkingDir } from './utils';

export async function handleFilesystemTool(
  tool: { name: string; input?: any },
  ctx: ToolContext
): Promise<string | null> {
  const { ws } = ctx;

  switch (tool.name) {
    case 'read_file': {
      const rawPath = tool.input?.file_path;
      const filePath = rawPath ? resolveToWorkingDir(rawPath) : '';
      if (!filePath) return '错误：文件路径为空';

      try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const offset = tool.input?.offset || 0;
        const limit = tool.input?.limit;

        let lines = fileContent.split('\n');
        if (offset > 0 || limit) {
          lines = lines.slice(offset, limit ? offset + limit : undefined);
        }

        const content = lines.join('\n');
        const truncatedContent = content.length > 15000
          ? content.substring(0, 15000) + '\n... (内容过长，已截断)'
          : content;

        if (ws) {
          ws.send(JSON.stringify({ type: 'file_read', path: filePath, content: truncatedContent }));
        }

        return `文件内容 (${filePath}):\n\`\`\`\n${truncatedContent}\n\`\`\``;
      } catch (e: any) {
        const errMsg = `读取文件失败: ${e.message}`;
        if (ws) ws.send(JSON.stringify({ type: 'error', content: errMsg }));
        return errMsg;
      }
    }

    case 'write_file': {
      const rawPath = tool.input?.file_path;
      const filePath = rawPath ? resolveToWorkingDir(rawPath) : '';
      const fileContent = tool.input?.content;
      if (!filePath || fileContent === undefined) return '错误：参数不完整';

      try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(filePath, fileContent, 'utf-8');
        if (ws) ws.send(JSON.stringify({ type: 'file_written', path: filePath }));
        return `写入文件成功: ${filePath}`;
      } catch (e: any) {
        const errMsg = `写入文件失败: ${e.message}`;
        if (ws) ws.send(JSON.stringify({ type: 'error', content: errMsg }));
        return errMsg;
      }
    }

    case 'replace': {
      const rawPath = tool.input?.file_path;
      const filePath = rawPath ? resolveToWorkingDir(rawPath) : '';
      const oldString = tool.input?.old_string;
      const newString = tool.input?.new_string;

      if (!filePath || oldString === undefined || newString === undefined) {
        return '错误：参数不完整';
      }

      const result = replaceInFile(filePath, oldString, newString);
      if (result.success && ws) {
        ws.send(JSON.stringify({ type: 'file_replaced', path: filePath, matches: result.matches }));
      }
      return result.success
        ? `替换成功: ${filePath} (${result.matches} 处)`
        : `替换失败: ${result.message}`;
    }

    case 'edit': {
      const rawPath = tool.input?.file_path;
      const filePath = rawPath ? resolveToWorkingDir(rawPath) : '';
      const edits = tool.input?.edits as EditOperation[];
      const createIfNotExists = tool.input?.create_if_not_exists;

      if (!filePath || !edits || !Array.isArray(edits)) {
        return '错误：参数不完整';
      }

      const result = editFile(filePath, edits, createIfNotExists);
      if (result.success && ws) {
        ws.send(JSON.stringify({
          type: 'file_edited',
          path: filePath,
          appliedEdits: result.appliedEdits,
          totalEdits: result.totalEdits
        }));
      }
      return result.success
        ? `编辑成功: ${filePath} (已应用 ${result.appliedEdits}/${result.totalEdits} 个编辑)`
        : `编辑部分失败: ${result.message}`;
    }

    case 'multi_edit': {
      const files = tool.input?.files;

      if (!files || !Array.isArray(files)) {
        return '错误：参数不完整';
      }

      const multiEdits = files.map((f: any) => ({
        filePath: resolveToWorkingDir(f.path),
        edits: f.edits as EditOperation[],
        createIfNotExists: f.create_if_not_exists
      }));

      const results = editMultipleFiles(multiEdits);
      const successCount = results.filter(r => r.success).length;

      if (ws) {
        ws.send(JSON.stringify({
          type: 'multi_file_edited',
          results: results.map(r => ({
            path: r.filePath,
            success: r.success,
            appliedEdits: r.appliedEdits
          }))
        }));
      }

      const summary = results.map(r =>
        `${r.filePath}: ${r.success ? '成功' : '失败'} (${r.appliedEdits} 个编辑)`
      ).join('\n');

      return `批量编辑完成 (${successCount}/${results.length} 成功):\n${summary}`;
    }

    case 'list_directory': {
      const dirPath = resolveToWorkingDir(tool.input?.path);
      if (!dirPath) return '错误：目录路径为空';

      try {
        const items = listDirectory(dirPath);
        const result = items.map(item => {
          const type = item.type === 'directory' ? '[DIR]' : '[FILE]';
          const size = item.size ? ` (${formatBytes(item.size)})` : '';
          return `${type} ${item.name}${size}`;
        }).join('\n');

        if (ws) ws.send(JSON.stringify({ type: 'directory_list', path: dirPath, items }));
        return `目录内容 (${dirPath}):\n${result}`;
      } catch (e: any) {
        return `列出目录失败: ${e.message}`;
      }
    }

    case 'glob': {
      const pattern = tool.input?.pattern;
      const searchPath = resolveToWorkingDir(tool.input?.path);

      if (!pattern) return '错误：模式为空';

      const files = globFiles({ pattern, path: searchPath });

      if (files.length === 0) {
        return `未找到匹配 "${pattern}" 的文件`;
      }

      const result = files.slice(0, 50).join('\n');
      if (ws) ws.send(JSON.stringify({ type: 'glob_result', pattern, files: files.slice(0, 50) }));
      return `找到 ${files.length} 个文件匹配 "${pattern}":\n${result}${files.length > 50 ? '\n... (结果已截断)' : ''}`;
    }

    case 'grep': {
      const pattern = tool.input?.pattern;
      const searchPath = resolveToWorkingDir(tool.input?.path);
      const include = tool.input?.include;

      if (!pattern) return '错误：搜索模式为空';

      const results = grepContent({ pattern, path: searchPath, include });

      if (results.length === 0) {
        return `未找到匹配 "${pattern}" 的内容`;
      }

      const output = results.map(r => `${r.file}:${r.line}: ${r.content}`).join('\n');
      if (ws) ws.send(JSON.stringify({ type: 'grep_result', pattern, results }));
      return `找到 ${results.length} 个匹配:\n${output}`;
    }

    case 'copy_file': {
      const source = resolveToWorkingDir(tool.input?.source);
      const destination = resolveToWorkingDir(tool.input?.destination);

      if (!source || !destination) {
        return '错误：源路径和目标路径不能为空';
      }

      const result = copyFile(source, destination);
      if (result.success && ws) {
        ws.send(JSON.stringify({ type: 'file_copied', source, destination }));
      }
      return result.message;
    }

    case 'move_file': {
      const source = resolveToWorkingDir(tool.input?.source);
      const destination = resolveToWorkingDir(tool.input?.destination);

      if (!source || !destination) {
        return '错误：源路径和目标路径不能为空';
      }

      const result = moveFile(source, destination);
      if (result.success && ws) {
        ws.send(JSON.stringify({ type: 'file_moved', source, destination }));
      }
      return result.message;
    }

    case 'delete_file': {
      const rawPath = tool.input?.file_path;
      const filePath = rawPath ? resolveToWorkingDir(rawPath) : '';

      if (!filePath) return '错误：文件路径为空';

      // 危险操作，需要确认
      if (!ctx.commandExecutor.isSafeCommand(`rm ${filePath}`)) {
        if (!ws || !ctx.pendingCommands) {
          return `需要用户确认删除操作: ${filePath}`;
        }

        // 返回 Promise 等待用户确认
        const confirmResult = await new Promise<boolean>((resolve) => {
          const confirmId = `${ctx.conversationId}-${Date.now()}`;
          ctx.pendingCommands!.set(confirmId, {
            command: `删除: ${filePath}`,
            action: 'delete',
            path: filePath,
            ws,
            conversationId: ctx.conversationId,
            resolve: (approved: boolean) => resolve(approved)
          });
          ws.send(JSON.stringify({ type: 'command_confirm', confirmId, command: `删除: ${filePath}` }));
        });

        if (!confirmResult) {
          return '删除操作已取消';
        }
      }

      const result = deleteFile(filePath);
      if (result.success && ws) {
        ws.send(JSON.stringify({ type: 'file_deleted', path: filePath }));
      }
      return result.message;
    }

    case 'create_directory': {
      const dirPath = resolveToWorkingDir(tool.input?.path);

      if (!dirPath) return '错误：目录路径为空';

      const result = createDirectory(dirPath);
      if (result.success && ws) {
        ws.send(JSON.stringify({ type: 'directory_created', path: dirPath }));
      }
      return result.message;
    }

    case 'file_info': {
      const rawPath = tool.input?.file_path;
      const filePath = rawPath ? resolveToWorkingDir(rawPath) : '';

      if (!filePath) return '错误：文件路径为空';

      const info = getFileInfo(filePath);
      if (!info) {
        return `文件不存在: ${filePath}`;
      }

      const output = [
        `路径: ${info.path}`,
        `名称: ${info.name}`,
        `类型: ${info.isDirectory ? '目录' : '文件'}`,
        `扩展名: ${info.extension || '(无)'}`,
        `大小: ${info.sizeFormatted}`,
        `创建时间: ${info.created.toLocaleString()}`,
        `修改时间: ${info.modified.toLocaleString()}`,
        `访问时间: ${info.accessed.toLocaleString()}`,
        `权限: ${info.permissions}`
      ].join('\n');

      return `文件信息:\n${output}`;
    }

    case 'file_exists': {
      const rawPath = tool.input?.file_path;
      const filePath = rawPath ? resolveToWorkingDir(rawPath) : '';

      if (!filePath) return '错误：文件路径为空';

      const exists = fileExists(filePath);
      return exists ? `存在: ${filePath}` : `不存在: ${filePath}`;
    }

    case 'xml_escape': {
      const text = tool.input?.text;
      if (text === undefined || text === null) {
        return '错误：文本不能为空';
      }
      const escaped = xmlEscape(text);
      return `转义结果:\n${escaped}`;
    }

    case 'get_files': {
      const rawPath = tool.input?.path;
      const filter = tool.input?.filter as string | undefined;
      const dirPath = rawPath ? resolveToWorkingDir(rawPath) : '';

      if (!dirPath) return '错误：目录路径为空';

      try {
        if (!fs.existsSync(dirPath)) {
          return `错误：目录不存在: ${dirPath}`;
        }

        if (!fs.statSync(dirPath).isDirectory()) {
          return `错误：路径不是目录: ${dirPath}`;
        }

        const filterExtensions: Record<string, string[]> = {
          audio: ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.wma'],
          video: ['.mp4', '.webm', '.avi', '.mov', '.mkv', '.wmv', '.flv'],
          image: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'],
          document: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.md'],
          code: ['.js', '.ts', '.py', '.java', '.c', '.cpp', '.h', '.css', '.html', '.json', '.xml']
        };

        const files = fs.readdirSync(dirPath);
        const fileList: any[] = [];

        for (const file of files) {
          const filePath = path.join(dirPath, file);
          const stat = fs.statSync(filePath);
          const ext = path.extname(file).toLowerCase();

          if (filter && filterExtensions[filter]) {
            if (!stat.isDirectory() && !filterExtensions[filter].includes(ext)) {
              continue;
            }
          }

          fileList.push({
            name: file,
            path: filePath.replace(/\\/g, '/'),
            size: stat.size,
            isDirectory: stat.isDirectory(),
            extension: ext
          });
        }

        fileList.sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) {
            return a.isDirectory ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });

        const output = fileList.map(f => {
          const type = f.isDirectory ? '[DIR]' : `[${f.extension || 'FILE'}]`;
          const size = f.size ? ` (${formatBytes(f.size)})` : '';
          return `${type} ${f.name}${size}`;
        }).join('\n');

        return `目录 ${dirPath} 中的文件 (${fileList.length} 个):\n${output}`;
      } catch (e: any) {
        return `获取文件列表失败: ${e.message}`;
      }
    }

    case 'play_media': {
      const rawPath = tool.input?.file_path;
      const filePath = rawPath ? resolveToWorkingDir(rawPath) : '';

      if (!filePath) return '错误：文件路径为空';

      try {
        if (!fs.existsSync(filePath)) {
          return `错误：文件不存在: ${filePath}`;
        }

        const ext = path.extname(filePath).toLowerCase();
        const audioExts = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];
        const videoExts = ['.mp4', '.webm', '.avi', '.mov', '.mkv'];
        const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];

        let mediaType = 'unknown';
        if (audioExts.includes(ext)) mediaType = 'audio';
        else if (videoExts.includes(ext)) mediaType = 'video';
        else if (imageExts.includes(ext)) mediaType = 'image';

        if (mediaType === 'unknown') {
          return `错误：不支持的媒体类型: ${ext}`;
        }

        const fileName = path.basename(filePath);

        // 计算相对于 media 目录的相对路径
        const mediaDir = path.join(getWorkingDir(), 'media');
        let relativePath: string;

        if (filePath.startsWith(mediaDir)) {
          relativePath = path.relative(mediaDir, filePath).replace(/\\/g, '/');
        } else {
          return `错误：媒体文件必须在 media 目录内: ${filePath}`;
        }

        // 使用安全的相对路径 URL
        const mediaUrl = `/api/media/${relativePath}`;

        if (mediaType === 'image') {
          return `![${fileName}](${mediaUrl})`;
        } else if (mediaType === 'audio') {
          return `![audio: ${fileName}](${mediaUrl})`;
        } else if (mediaType === 'video') {
          return `![video: ${fileName}](${mediaUrl})`;
        }
        return `${mediaUrl}`;
      } catch (e: any) {
        return `播放媒体失败: ${e.message}`;
      }
    }

    default:
      return null; // 不是文件系统工具，交给其他处理器
  }
}