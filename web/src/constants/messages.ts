// 状态消息

export const STATUS_MESSAGES = [
  '思考中...',
  '让子弹飞一会儿...',
  '脑细胞正在努力...',
  '正在召唤 AI 之力...',
  '码字中...',
  '正在搬运知识...',
  '灵感加载中...',
  '正在施展魔法...',
  '冥想中...',
  '正在调取记忆...',
  '大脑飞速运转...',
  '正在编织答案...'
]

export function getRandomStatusMessage(exclude?: string): string {
  const available = exclude
    ? STATUS_MESSAGES.filter((msg) => msg !== exclude)
    : STATUS_MESSAGES

  return available[Math.floor(Math.random() * available.length)]
}