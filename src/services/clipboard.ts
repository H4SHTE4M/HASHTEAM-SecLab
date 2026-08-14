/** 复制文本到剪贴板：优先 Clipboard API，失败降级 execCommand。返回是否成功。 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard !== undefined) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 降级到 execCommand。
  }

  if (typeof document.execCommand !== 'function') return false
  const textArea = document.createElement('textarea')
  textArea.value = text
  textArea.setAttribute('aria-hidden', 'true')
  textArea.style.position = 'fixed'
  textArea.style.inset = '0 auto auto -9999px'
  document.body.appendChild(textArea)
  textArea.select()
  try {
    return document.execCommand('copy')
  } finally {
    textArea.remove()
  }
}
