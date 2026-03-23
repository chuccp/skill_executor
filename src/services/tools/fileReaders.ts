/**
 * 增强的文件读取工具
 * 支持图片格式
 * 对于无法直接读取的文件，会自动检查并安装命令行工具来打开
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import sharp from 'sharp';

// ==================== 图片处理 ====================

export interface ImageInfo {
  width: number;
  height: number;
  format: string;
  size: number;
  channels: number;
  hasAlpha: boolean;
  density?: { x: number; y: number };
}

export async function getImageInfo(filePath: string): Promise<ImageInfo> {
  const metadata = await sharp(filePath).metadata();
  const stat = fs.statSync(filePath);

  return {
    width: metadata.width || 0,
    height: metadata.height || 0,
    format: metadata.format || 'unknown',
    size: stat.size,
    channels: metadata.channels || 3,
    hasAlpha: metadata.hasAlpha || false,
    density: metadata.density ? { x: metadata.density, y: metadata.density } : undefined
  };
}

export interface ImageResizeOptions {
  width?: number;
  height?: number;
  format?: 'jpeg' | 'png' | 'webp' | 'avif';
  quality?: number;
}

export async function resizeImage(
  inputPath: string,
  outputPath: string,
  options: ImageResizeOptions
): Promise<void> {
  let image = sharp(inputPath);

  if (options.width || options.height) {
    image = image.resize(options.width, options.height, {
      fit: 'inside',
      withoutEnlargement: true
    });
  }

  switch (options.format) {
    case 'jpeg':
      image = image.jpeg({ quality: options.quality || 80 });
      break;
    case 'png':
      image = image.png({ quality: options.quality || 80 });
      break;
    case 'webp':
      image = image.webp({ quality: options.quality || 80 });
      break;
    case 'avif':
      image = image.avif({ quality: options.quality || 80 });
      break;
  }

  await image.toFile(outputPath);
}

export async function imageToBase64(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  const buffer = await sharp(filePath).toBuffer();
  const base64 = buffer.toString('base64');
  return `data:image/${ext};base64,${base64}`;
}

// ==================== 通用文件读取 ====================

// 文件扩展名对应的命令行工具映射
const FILE_TYPE_TOOLS: Record<string, { toolName: string; checkCmd: string; installCmd: { mac: string; linux: string; win: string } }> = {
  '.pdf': {
    toolName: 'poppler',
    checkCmd: 'pdftotext -v',
    installCmd: {
      mac: 'brew install poppler',
      linux: 'sudo apt install poppler-utils -y || sudo yum install poppler-utils -y',
      win: 'winget install poppler --accept-source-agreements --accept-package-agreements'
    }
  },
  '.docx': {
    toolName: 'pandoc',
    checkCmd: 'pandoc --version',
    installCmd: {
      mac: 'brew install pandoc',
      linux: 'sudo apt install pandoc -y || sudo yum install pandoc -y',
      win: 'winget install JohnMacFarlane.Pandoc --accept-source-agreements --accept-package-agreements'
    }
  },
  '.doc': {
    toolName: 'antiword or catdoc',
    checkCmd: 'antiword -v || catdoc -v',
    installCmd: {
      mac: 'brew install antiword || brew install catdoc',
      linux: 'sudo apt install antiword -y || sudo apt install catdoc -y',
      win: 'winget install GnuWin32.Antiword --accept-source-agreements --accept-package-agreements'
    }
  },
  '.xlsx': {
    toolName: 'ssconvert (gnumeric)',
    checkCmd: 'ssconvert --version',
    installCmd: {
      mac: 'brew install gnumeric',
      linux: 'sudo apt install gnumeric -y || sudo yum install gnumeric -y',
      win: 'winget install Gnumeric.Gnumeric --accept-source-agreements --accept-package-agreements'
    }
  },
  '.xls': {
    toolName: 'ssconvert (gnumeric)',
    checkCmd: 'ssconvert --version',
    installCmd: {
      mac: 'brew install gnumeric',
      linux: 'sudo apt install gnumeric -y || sudo yum install gnumeric -y',
      win: 'winget install Gnumeric.Gnumeric --accept-source-agreements --accept-package-agreements'
    }
  },
  '.pptx': {
    toolName: 'libreoffice',
    checkCmd: 'soffice --version',
    installCmd: {
      mac: 'brew install --cask libreoffice',
      linux: 'sudo apt install libreoffice -y || sudo yum install libreoffice -y',
      win: 'winget install TheDocumentFoundation.LibreOffice --accept-source-agreements --accept-package-agreements'
    }
  },
  '.ppt': {
    toolName: 'libreoffice',
    checkCmd: 'soffice --version',
    installCmd: {
      mac: 'brew install --cask libreoffice',
      linux: 'sudo apt install libreoffice -y || sudo yum install libreoffice -y',
      win: 'winget install TheDocumentFoundation.LibreOffice --accept-source-agreements --accept-package-agreements'
    }
  },
  '.rtf': {
    toolName: 'unrtf',
    checkCmd: 'unrtf --version',
    installCmd: {
      mac: 'brew install unrtf',
      linux: 'sudo apt install unrtf -y || sudo yum install unrtf -y',
      win: 'winget install unrtf --accept-source-agreements --accept-package-agreements'
    }
  },
  '.7z': {
    toolName: 'p7zip',
    checkCmd: '7z --version',
    installCmd: {
      mac: 'brew install p7zip',
      linux: 'sudo apt install p7zip-full -y || sudo yum install p7zip -y',
      win: 'winget install 7zip.7zip --accept-source-agreements --accept-package-agreements'
    }
  },
  '.rar': {
    toolName: 'unar or unrar',
    checkCmd: 'unar -v || unrar -v',
    installCmd: {
      mac: 'brew install unar',
      linux: 'sudo apt install unar -y || sudo apt install unrar -y',
      win: 'winget install 7zip.7zip --accept-source-agreements --accept-package-agreements'
    }
  }
};

export async function readFileAuto(filePath: string): Promise<{ type: string; content: any; needsSystemOpen?: boolean }> {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case '.jpg':
    case '.jpeg':
    case '.png':
    case '.webp':
    case '.gif':
      return { type: 'image', content: await getImageInfo(filePath) };
    default:
      // 检查是否是需要命令行工具的类型
      if (FILE_TYPE_TOOLS[ext]) {
        return {
          type: 'needs_cli_tool',
          content: `此文件类型 (${ext}) 需要使用 open_file 工具打开。系统会自动检查并安装所需的命令行工具。`,
          needsSystemOpen: true
        };
      }
      try {
        return { type: 'text', content: fs.readFileSync(filePath, 'utf-8') };
      } catch (e: any) {
        return {
          type: 'binary',
          content: `无法读取此文件: ${e.message}。建议使用 open_file 工具调用系统默认程序打开。`,
          needsSystemOpen: true
        };
      }
  }
}

// 检查命令行工具是否已安装
async function checkToolInstalled(checkCmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    exec(checkCmd, (error: any) => {
      resolve(!error);
    });
  });
}

// 安装命令行工具
async function installTool(installCmd: string): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    exec(installCmd, (error: any) => {
      if (error) {
        resolve({
          success: false,
          message: `安装失败: ${error.message}\n建议手动执行: ${installCmd}`
        });
      } else {
        resolve({
          success: true,
          message: `安装成功`
        });
      }
    });
  });
}

// 获取平台对应的安装命令
function getPlatformInstallCmd(installCmd: { mac: string; linux: string; win: string }): string {
  const platform = process.platform;
  if (platform === 'darwin') return installCmd.mac;
  if (platform === 'win32') return installCmd.win;
  return installCmd.linux;
}

// 使用系统默认程序打开文件
export async function openWithSystemApp(filePath: string): Promise<{ success: boolean; message: string }> {
  const ext = path.extname(filePath).toLowerCase();
  const platform = process.platform;

  // 检查是否有对应的命令行工具
  const toolInfo = FILE_TYPE_TOOLS[ext];
  if (toolInfo) {
    // 检查工具是否已安装
    const isInstalled = await checkToolInstalled(toolInfo.checkCmd);
    if (!isInstalled) {
      // 自动安装工具
      const installCmd = getPlatformInstallCmd(toolInfo.installCmd);
      console.log(`[open_file] 正在安装 ${toolInfo.toolName}...`);
      const installResult = await installTool(installCmd);
      if (!installResult.success) {
        // 安装失败，尝试用系统默认程序打开
        return fallbackToSystemOpen(filePath, platform, installResult.message);
      }
    }
  }

  // 用系统默认程序打开
  return fallbackToSystemOpen(filePath, platform);
}

// 回退到系统默认程序打开
async function fallbackToSystemOpen(filePath: string, platform: string, extraMessage?: string): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    let command: string;
    if (platform === 'darwin') {
      command = `open "${filePath}"`;
    } else if (platform === 'win32') {
      command = `start "" "${filePath}"`;
    } else {
      command = `xdg-open "${filePath}"`;
    }

    exec(command, (error: any) => {
      if (error) {
        const msg = extraMessage
          ? `${extraMessage}\n无法用系统默认程序打开文件: ${error.message}`
          : `无法用系统默认程序打开文件: ${error.message}。请检查是否安装了相应的软件。`;
        resolve({ success: false, message: msg });
      } else {
        const msg = extraMessage
          ? `${extraMessage}\n已使用系统默认程序打开文件: ${filePath}`
          : `已使用系统默认程序打开文件: ${filePath}`;
        resolve({ success: true, message: msg });
      }
    });
  });
}