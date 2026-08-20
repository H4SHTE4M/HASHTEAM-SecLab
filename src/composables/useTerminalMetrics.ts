import type { Terminal } from '@xterm/xterm'

/**
 * xterm.js 只在 `Terminal.open()` 时量一次单元格宽度（CharSizeService 用
 * `measureText('W')`），之后除非 fontFamily/fontSize 变化、dpr 变化，或上一次量到 0，
 * 否则永不重量；它内部也没有任何 `document.fonts` 监听。
 *
 * 终端组件在 `onMounted()` 里建 Terminal，此时 @font-face 通常还没下载完，于是量到的是
 * 系统兜底等宽字体，而真正绘制时用的是 CaskaydiaCove。两者的 advance 不一样，网格按
 * 一个宽度排、字形按另一个宽度画，选区/光标又是直接用 `col * cellWidth` 画的矩形，
 * 于是逐列越错越多——这就是"选区盖到文字"的根因。
 *
 * WidthCache 同理：首屏渲染时缓存下的 ASCII 宽度也是兜底字体的，且只有 setFont() 才会清。
 *
 * 下面两个函数负责：先把终端字体真正加载完，再强制 xterm 重量一次。
 */

/** 从 CSS font-family 栈里取出带引号的字体名，用于 `document.fonts.load()`。 */
function parseFontFamilies(fontFamily: string): string[] {
  return fontFamily
    .split(',')
    .map((name) => name.trim().replace(/^['"]|['"]$/g, ''))
    .filter((name) => name.length > 0 && !/^(monospace|sans-serif|serif|system-ui)$/i.test(name))
}

/**
 * 加载字体栈里所有自定义字体的常规体与粗体。
 * 兜底字形（Nerd Font 图标等）也要一起加载：它们是按需下载的，如果等到首次渲染才触发，
 * WidthCache 会把"还没下载完"时的兜底宽度永久缓存下来。
 */
export async function loadTerminalFonts(fontFamily: string, fontSize: number): Promise<void> {
  if (typeof document === 'undefined' || document.fonts === undefined) return

  const families = parseFontFamilies(fontFamily)
  const probe = '中A'

  await Promise.all(
    families.flatMap((family) => [
      document.fonts.load(`400 ${fontSize}px "${family}"`, probe).catch(() => undefined),
      document.fonts.load(`600 ${fontSize}px "${family}"`, probe).catch(() => undefined),
    ]),
  )
}

/**
 * 强制 xterm 重新测量单元格宽度并清空 WidthCache。
 *
 * 手段是把 fontFamily 改成别的值再改回来：`optionsService` 的 change 事件会同步触发
 * `CharSizeService.measure()` 和 DomRenderer 的 `WidthCache.setFont()`（后者在字体串
 * 变化时会 clear()）。两次赋值在同一个任务里完成，中间不会绘制，不会闪烁。
 */
/**
 * 字体加载完成后重新测量。
 *
 * 终端中文来自 Noto Sans SC 的 88 个 unicode-range 分片，是**按需**下载的：某个字第一次
 * 出现时才会去取它所在的分片。而 xterm 的 WidthCache 是按字符缓存宽度、且只有 setFont()
 * 才会清——于是那一刻量到的是分片还没到位时的兜底宽度，并被永久缓存下来。结果是字形按
 * 真实字体绘制、网格却按兜底宽度排，每个受影响的字都会偏。
 *
 * 单靠 `loadTerminalFonts()` 解决不了：它只能预加载探测字符所在的那几个分片。
 * 所以这里监听 `document.fonts` 的 loadingdone，每有新分片到位就清缓存重量一次。
 *
 * 返回取消监听的函数。
 */
export function watchFontLoads(onFontsLoaded: () => void): () => void {
  if (typeof document === 'undefined' || document.fonts === undefined) return () => undefined

  const handler = (): void => onFontsLoaded()
  document.fonts.addEventListener('loadingdone', handler)
  return () => document.fonts.removeEventListener('loadingdone', handler)
}

export function remeasureTerminal(terminal: Terminal): void {
  const fontFamily = terminal.options.fontFamily
  if (fontFamily === undefined) return
  terminal.options.fontFamily = 'monospace'
  terminal.options.fontFamily = fontFamily
}
