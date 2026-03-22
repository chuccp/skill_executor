// 媒体导出服务 - 使用 Tauri 对话框

interface SaveResult {
  success: boolean
  path?: string
  error?: string
}

// 检查是否在 Tauri 环境
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window
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
    const { readFile, writeFile, exists, mkdir } = await import('@tauri-apps/plugin-fs')
    const { convertFileSrc } = await import('@tauri-apps/api/core')

    // 打开保存对话框
    const savePath = await save({
      defaultPath: defaultName,
      filters: [
        {
          name: 'Media',
          extensions: ['mp4', 'webm', 'mp3', 'wav', 'png', 'jpg', 'gif']
        }
      ]
    })

    if (!savePath) {
      return { success: false, error: '用户取消' }
    }

    // 从 URL 获取文件内容
    // URL 格式: /api/media/xxx 或 /api/file?path=xxx
    let filePath: string

    if (sourceUrl.startsWith('/api/media/')) {
      // 相对路径: /api/media/video/xxx.mp4
      const relativePath = sourceUrl.replace('/api/media/', '')
      // 需要从后端获取实际路径，这里假设 media 在工作目录下
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

    if (!filePath) {
      return { success: false, error: '无法获取文件路径' }
    }

    // 读取源文件
    const fileData = await readFile(filePath)

    // 确保目标目录存在
    const dir = savePath.substring(0, savePath.lastIndexOf('/'))
    if (!await exists(dir)) {
      await mkdir(dir, { recursive: true })
    }

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