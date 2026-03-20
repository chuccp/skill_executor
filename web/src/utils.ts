export function formatTime(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前'
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前'
  if (diff < 604800000) return Math.floor(diff / 86400000) + '天前'

  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function getParentPath(path: string): string {
  if (!path) return ''
  let p = path.replace(/[\\/]+$/, '')
  const sep = p.includes('\\') ? '\\' : '/'
  if (sep === '\\' && /^[A-Za-z]:$/.test(p)) return p + '\\'
  const idx = p.lastIndexOf(sep)
  if (idx <= 0) return p
  return p.slice(0, idx)
}

export function escapeHtml(text: string): string {
  if (!text) return ''
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timer: number | null = null
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = window.setTimeout(() => fn(...args), delay)
  }
}