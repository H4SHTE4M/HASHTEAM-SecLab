#!/usr/bin/env node
/**
 * 生成 src/styles/terminal-cjk-font.css。
 *
 * 终端主字体是 CaskaydiaCove Nerd Font Mono，拉丁 advance = 1200/2048 = 0.5859375 em，
 * 所以一个单元格宽 0.5859375 em、汉字占的两格 = 1.171875 em。而中文字形天生是 1.0 em，
 * 塞进两格会被 xterm 用 letter-spacing 补差，每字多出约 17% 空隙，中文看起来是散开的。
 *
 * 这里不新增任何字体文件：直接复用已打包的 Noto Sans SC Variable 分片，另起一个
 * font-family 名字并加上 size-adjust，让字形和 advance 一起放大到接近两格宽度。
 * size-adjust 只影响这个新 family，UI 用的 'Noto Sans SC Variable' 不受影响。
 * 具体比例见下面 SIZE_ADJUST 的说明。
 *
 * 只保留 East Asian Wide 区间：`·—…“”×÷°→` 这类 Ambiguous 宽度字符在 xterm 的
 * wcwidth 里算 1 列，跟着放大会溢出格子，它们交给 CaskaydiaCove（已全部覆盖）。
 *
 * 用法：node scripts/generate-terminal-cjk-font.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SOURCE_CSS = 'src/assets/fonts/noto-sans-sc/index.css'
const OUTPUT_CSS = 'src/styles/terminal-cjk-font.css'
const FAMILY = 'Noto Sans SC Terminal'

/**
 * 中文放大比例。
 *
 * 上限是 117.1875%（= 2 × 1200/2048），此时字形正好填满两格、一点余量都没有——
 * 实拍下来偏大且发挤，字与字几乎贴在一起。下限是 100%（原始大小），此时每字空出
 * 17% 的格子，中文明显散开。
 *
 * 110% 是实拍比对后选的折中：字号收回来一些，每字留约 1px 的呼吸位（14px 字号下
 * 字形 15.41px、格子 16.41px），既不挤也不散。要改的话只动这个数再重新生成即可，
 * 对齐不受影响——差额由 xterm 的网格校正吸收。
 *
 * 注意不能超过 117.1875%，否则字形会溢出格子和相邻字重叠。
 */
const SIZE_ADJUST = 110

const MAX_SIZE_ADJUST = ((2 * 1200) / 2048) * 100
if (SIZE_ADJUST > MAX_SIZE_ADJUST) {
  throw new Error(`SIZE_ADJUST ${SIZE_ADJUST}% 超过两格宽度 ${MAX_SIZE_ADJUST}%，字形会溢出单元格`)
}

// 明确全角（East Asian Wide / Fullwidth），不含 Ambiguous
const WIDE_RANGES = [
  [0x2e80, 0x2eff], // CJK 部首补充
  [0x2f00, 0x2fdf], // 康熙部首
  [0x3000, 0x303f], // CJK 标点
  [0x3040, 0x309f], // 平假名
  [0x30a0, 0x30ff], // 片假名
  [0x3100, 0x312f], // 注音
  [0x3400, 0x4dbf], // CJK 扩展 A
  [0x4e00, 0x9fff], // CJK 统一表意文字
  [0xf900, 0xfaff], // CJK 兼容表意文字
  [0xfe30, 0xfe4f], // CJK 兼容形式
  [0xff01, 0xff60], // 全角形式
  [0xffe0, 0xffe6], // 全角符号
]

function isWide(codePoint) {
  return WIDE_RANGES.some(([lo, hi]) => codePoint >= lo && codePoint <= hi)
}

/** 把 "U+4e00-9fff,U+3000" 解析成 [lo, hi] 数组 */
function parseRange(text) {
  const out = []
  for (const token of text.split(',')) {
    const body = token.trim().replace(/^u\+/i, '')
    const [lo, hi] = body.includes('-') ? body.split('-') : [body, body]
    out.push([Number.parseInt(lo, 16), Number.parseInt(hi, 16)])
  }
  return out
}

/** 只保留与全角区间相交的部分 */
function intersectWide(ranges) {
  const out = []
  for (const [lo, hi] of ranges) {
    for (const [wLo, wHi] of WIDE_RANGES) {
      const start = Math.max(lo, wLo)
      const end = Math.min(hi, wHi)
      if (start <= end) out.push([start, end])
    }
  }
  return out.sort((a, b) => a[0] - b[0])
}

function formatRange(ranges) {
  return ranges
    .map(([lo, hi]) =>
      lo === hi ? `U+${lo.toString(16)}` : `U+${lo.toString(16)}-${hi.toString(16)}`,
    )
    .join(',')
}

const css = readFileSync(resolve(process.cwd(), SOURCE_CSS), 'utf8')
const blocks = [
  ...css.matchAll(
    /@font-face\s*\{[^}]*?src:\s*url\(\.\/files\/([^)]+)\)\s*format\('([^']+)'\)[^}]*?unicode-range:\s*([^;]+);[^}]*?\}/g,
  ),
]

if (blocks.length === 0) throw new Error(`No @font-face blocks parsed from ${SOURCE_CSS}`)

const faces = []
let keptCodePoints = 0
for (const [, file, format, range] of blocks) {
  const wide = intersectWide(parseRange(range))
  if (wide.length === 0) continue
  keptCodePoints += wide.reduce((sum, [lo, hi]) => sum + (hi - lo + 1), 0)
  faces.push(
    `@font-face {\n` +
      `  font-family: '${FAMILY}';\n` +
      `  font-style: normal;\n` +
      `  font-display: swap;\n` +
      `  font-weight: 100 900;\n` +
      `  size-adjust: ${SIZE_ADJUST}%;\n` +
      `  src: url('../assets/fonts/noto-sans-sc/files/${file}') format('${format}');\n` +
      `  unicode-range: ${formatRange(wide)};\n` +
      `}`,
  )
}

const header =
  `/* 本文件由 scripts/generate-terminal-cjk-font.mjs 生成，请勿手改。\n` +
  `   终端中文专用字体族：复用已打包的 Noto Sans SC Variable 分片（不新增任何字体文件），\n` +
  `   通过 size-adjust: ${SIZE_ADJUST}% 把字形放大，贴近 CaskaydiaCove 两个单元格的宽度\n` +
  `   （上限 117.1875% = 2 × 1200/2048 em，那是正好填满、没有余量的极限）。不放大的话\n` +
  `   1.0em 的汉字塞进 1.171875em 的两格里，会被 xterm 的网格校正拉开约 17% 字间距。\n` +
  `   只覆盖 East Asian Wide 区间；·—…“”×÷°→ 等 Ambiguous 宽度字符在 xterm 里算 1 列，\n` +
  `   交给 CaskaydiaCove 提供，不能跟着放大。 */\n\n`

writeFileSync(resolve(process.cwd(), OUTPUT_CSS), header + faces.join('\n\n') + '\n', 'utf8')
console.log(
  `${OUTPUT_CSS}: ${faces.length}/${blocks.length} 个分片，覆盖 ${keptCodePoints} 个全角码位，` +
    `size-adjust=${SIZE_ADJUST}%`,
)
