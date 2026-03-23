// Tauri 服务 - 对话框、文件操作等

interface SaveResult {
  success: boolean
  path?: string
  error?: string
}

// 检查是否在 Tauri 环境
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window
}

// 显示确认对话框
export async function confirmDialog(message: string, title: string = '确认'): Promise<boolean> {
  if (isTauri()) {
    try {
      const { ask } = await import('@tauri-apps/plugin-dialog')
      return await ask(message, { title, kind: 'warning' })
    } catch {
      return window.confirm(message)
    }
  }
  return window.confirm(message)
}

// 导出媒体文件
export async function exportMedia(sourceUrl: string, defaultName: string): Promise<SaveResult> {
  if (!isTauri()) {
    // 非 Tauri 环境，使用浏览器下载
    return downloadInBrowser(sourceUrl, defaultName)
  }

  try {
    // 动态导入 Tauri API
    const { save } = await import('@tauri-apps/plugin-dialog')
    const { readFile, writeFile } = await import('@tauri-apps/plugin-fs')

    // 打开保存对话框 - 设置默认文件名
    const savePath = await save({
      title: '保存媒体文件',
      defaultPath: `~/${defaultName}`,
      filters: [
        {
          name: 'Media',
          extensions: ['mp4', 'webm', 'mp3', 'wav', 'png', 'jpg', 'gif']
        }
      ]
    })

    console.log('[Export] Save path returned:', savePath)

    if (!savePath) {
      return { success: false, error: '用户取消' }
    }

    // 从 URL 获取文件内容
    let filePath: string

    if (sourceUrl.startsWith('/api/media/')) {
      // 相对路径: /api/media/video/xxx.mp4
      const relativePath = sourceUrl.replace('/api/media/', '')
      // 需要从后端获取实际路径
      const response = await fetch(`/api/media-path?relative=${encodeURIComponent(relativePath)}`)
      const data = await response.json()
      filePath = data.data?.absolutePath || ''
    } else if (sourceUrl.startsWith('/api/file?path=')) {
      // 旧格式: /api/file?path=/xxx
      const urlParams = new URLSearchParams(sourceUrl.split('?')[1])
      filePath = urlParams.get('path') || ''
    } else {
      // 直接是路径
      filePath = sourceUrl
    }

    console.log('[Export] Source file path:', filePath)

    if (!filePath) {
      return { success: false, error: '无法获取文件路径' }
    }

    // 读取源文件
    const fileData = await readFile(filePath)
    console.log('[Export] File data read, size:', fileData.length)

    // 写入目标文件
    await writeFile(savePath, fileData)

    return { success: true, path: savePath }
  } catch (error: any) {
    console.error('Export error:', error)
    return { success: false, error: error.message || '导出失败' }
  }
}

// 浏览器环境下载
async function downloadInBrowser(url: string, filename: string): Promise<SaveResult> {
  try {
    const response = await fetch(url)
    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = blobUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message || '下载失败' }
  }
}