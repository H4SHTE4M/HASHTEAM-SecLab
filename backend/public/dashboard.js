/**
 * 公开数据看板逻辑。
 * 数据来自 GET ../api/public/stats（相对路径，兼容任意反代前缀）。
 * 所有 metric 可能缺失，渲染时防御式处理。
 */

'use strict'

const REFRESH_INTERVAL_MS = 30 * 1000

const els = {
  banner: document.getElementById('status-banner'),
  cards: document.getElementById('overview-cards'),
  commands: document.getElementById('command-leaderboard'),
  levels: document.getElementById('level-leaderboard'),
  hints: document.getElementById('hint-leaderboard'),
  resets: document.getElementById('reset-leaderboard'),
  updatedAt: document.getElementById('updated-at'),
  timeseriesChart: document.getElementById('timeseries-chart'),
}

function fmtNum(n) {
  return n.toLocaleString('zh-CN')
}

function fmtTime(ms) {
  return new Date(ms).toLocaleString('zh-CN', { hour12: false })
}

/** metric 对象（dimension -> count）求和；缺失时返回 0 */
function sumMetric(metric) {
  if (!metric || typeof metric !== 'object') return 0
  return Object.values(metric).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0)
}

/** metric 对象按 count 降序排序为 [dimension, count][] */
function sortedEntries(metric) {
  if (!metric || typeof metric !== 'object') return []
  return Object.entries(metric)
    .filter(([, count]) => typeof count === 'number' && count > 0)
    .sort((a, b) => b[1] - a[1])
}

/** level-N 按数字排序（N 非数字的排最后） */
function levelSortKey(dimension) {
  const m = /^level-(\d+)$/.exec(dimension)
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER
}

/** 从 complete_path 的 "level-N:path" 维度解析每关三路径细分 */
function parsePathBreakdown(completePathMetric) {
  const byLevel = new Map() // level -> { guided, mixed, challenge }
  if (!completePathMetric || typeof completePathMetric !== 'object') return byLevel
  for (const [dimension, count] of Object.entries(completePathMetric)) {
    const m = /^(level-\d+):(guided|mixed|challenge)$/.exec(dimension)
    if (!m || typeof count !== 'number') continue
    if (!byLevel.has(m[1])) byLevel.set(m[1], { guided: 0, mixed: 0, challenge: 0 })
    byLevel.get(m[1])[m[2]] = count
  }
  return byLevel
}

function emptyState(text) {
  const div = document.createElement('div')
  div.className = 'empty'
  div.textContent = text
  return div
}

/**
 * 渲染横向条形排行榜。
 * entries: [label, count][]（已排序）；subText(label) 可返回每行下方小字。
 */
function renderBars(container, entries, subText) {
  container.textContent = ''
  if (entries.length === 0) {
    container.appendChild(emptyState('暂无数据'))
    return
  }
  const max = entries[0][1]
  const total = entries.reduce((sum, [, count]) => sum + count, 0)
  entries.forEach(([label, count], idx) => {
    const row = document.createElement('div')
    row.className = 'bar-row'

    const rank = document.createElement('span')
    rank.className = `bar-rank${idx < 3 ? ` rank-${idx + 1}` : ''}`
    rank.textContent = String(idx + 1)

    const labelEl = document.createElement('span')
    labelEl.className = 'bar-label'
    labelEl.textContent = label
    labelEl.title = label

    const track = document.createElement('div')
    track.className = 'bar-track'
    const fill = document.createElement('div')
    fill.className = 'bar-fill'
    fill.style.width = `${Math.max((count / max) * 100, 1).toFixed(1)}%`
    track.appendChild(fill)

    const value = document.createElement('span')
    value.className = 'bar-value'
    value.textContent = fmtNum(count)

    const pct = document.createElement('span')
    pct.className = 'bar-pct'
    pct.textContent = total > 0 ? `${((count / total) * 100).toFixed(1)}%` : ''

    row.append(rank, labelEl, track, value, pct)
    container.appendChild(row)

    if (subText) {
      const sub = subText(label)
      if (sub) {
        const subEl = document.createElement('div')
        subEl.className = 'bar-sub'
        subEl.textContent = sub
        container.appendChild(subEl)
      }
    }
  })
}

function renderCards(modules) {
  const seclab = modules.seclab || {}
  const commandTotal = sumMetric(seclab.command)
  const completeTotal = sumMetric(seclab.complete)
  const hintTotal = sumMetric(seclab.hint)
  const resetTotal = sumMetric(seclab.reset)

  const cards = [
    { label: '命令执行总数', value: commandTotal, sub: `${sortedEntries(seclab.command).length} 种命令` },
    { label: '通关总人次', value: completeTotal, sub: '全部关卡合计' },
    { label: '提示使用次数', value: hintTotal, sub: '全部关卡合计' },
    { label: '关卡重置次数', value: resetTotal, sub: '全部关卡合计' },
  ]

  els.cards.textContent = ''
  for (const { label, value, sub } of cards) {
    const card = document.createElement('div')
    card.className = 'card'
    const labelEl = document.createElement('div')
    labelEl.className = 'card-label'
    labelEl.textContent = label
    const valueEl = document.createElement('div')
    valueEl.className = 'card-value'
    valueEl.textContent = fmtNum(value)
    const subEl = document.createElement('div')
    subEl.className = 'card-sub'
    subEl.textContent = sub
    card.append(labelEl, valueEl, subEl)
    els.cards.appendChild(card)
  }
}

/**
 * 渲染近 30 天活动趋势堆叠柱状图。
 * data.timeseries: [{ day, session_create, command, level_complete, hint, reset }]
 */
function renderTimeseries(timeseries) {
  const container = els.timeseriesChart
  if (!container) return
  container.textContent = ''

  if (!Array.isArray(timeseries) || timeseries.length === 0) {
    container.textContent = '暂无趋势数据'
    return
  }

  const maxTotal = Math.max(1, ...timeseries.map((d) =>
    d.session_create + d.command + d.level_complete + d.hint + d.reset))

  // 图例
  const legend = document.createElement('div')
  legend.className = 'ts-legend'
  const legendItems = [
    ['session', '会话'],
    ['command', '命令'],
    ['complete', '通关'],
    ['hint', '提示'],
    ['reset', '重置'],
  ]
  for (const [cls, label] of legendItems) {
    const item = document.createElement('div')
    item.className = 'ts-legend-item'
    const dot = document.createElement('span')
    dot.className = `ts-legend-dot ts-seg-${cls}`
    item.append(dot, document.createTextNode(label))
    legend.appendChild(item)
  }
  container.appendChild(legend)

  // 柱状图区域
  const barsArea = document.createElement('div')
  barsArea.style.cssText = 'display:flex;align-items:flex-end;gap:2px;height:140px;'
  container.appendChild(barsArea)

  // 每隔约 7 天显示一个日期标签
  const labelInterval = Math.ceil(timeseries.length / 5)
  for (let i = 0; i < timeseries.length; i++) {
    const d = timeseries[i]
    const total = d.session_create + d.command + d.level_complete + d.hint + d.reset
    const col = document.createElement('div')
    col.className = 'ts-col'
    col.title = `${new Date(d.day).toLocaleDateString('zh-CN')} 会话${d.session_create} 命令${d.command} 通关${d.level_complete} 提示${d.hint} 重置${d.reset}`

    const segs = [
      ['session', d.session_create],
      ['command', d.command],
      ['complete', d.level_complete],
      ['hint', d.hint],
      ['reset', d.reset],
    ]
    for (const [cls, val] of segs) {
      if (val === 0) continue
      const seg = document.createElement('div')
      seg.className = `ts-seg ts-seg-${cls}`
      seg.style.minHeight = `${(val / maxTotal) * 100}%`
      col.appendChild(seg)
    }

    if (i % labelInterval === 0 || i === timeseries.length - 1) {
      const lbl = document.createElement('span')
      lbl.className = 'ts-col-label'
      lbl.textContent = new Date(d.day).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
      col.appendChild(lbl)
    }

    barsArea.appendChild(col)
  }
}

function render(data) {
  const modules = (data && typeof data.modules === 'object' && data.modules) || {}
  const seclab = modules.seclab || {}

  renderCards(modules)

  renderTimeseries(data.timeseries)

  renderBars(els.commands, sortedEntries(seclab.command), null)

  const levelEntries = sortedEntries(seclab.complete)
    .sort((a, b) => levelSortKey(a[0]) - levelSortKey(b[0]))
  const breakdown = parsePathBreakdown(seclab.complete_path)
  renderBars(els.levels, levelEntries, (label) => {
    const paths = breakdown.get(label)
    if (!paths) return null
    return `guided ${fmtNum(paths.guided)} · mixed ${fmtNum(paths.mixed)} · challenge ${fmtNum(paths.challenge)}`
  })

  renderBars(
    els.hints,
    sortedEntries(seclab.hint).sort((a, b) => levelSortKey(a[0]) - levelSortKey(b[0])),
    null,
  )
  renderBars(
    els.resets,
    sortedEntries(seclab.reset).sort((a, b) => levelSortKey(a[0]) - levelSortKey(b[0])),
    null,
  )

  els.updatedAt.textContent = `数据更新时间:${fmtTime(data.generatedAt || Date.now())}`
}

function showBanner(text) {
  els.banner.textContent = text
  els.banner.classList.remove('hidden')
}

function hideBanner() {
  els.banner.classList.add('hidden')
}

let hadData = false

async function refresh() {
  try {
    const response = await fetch('../api/public/stats', { headers: { Accept: 'application/json' } })
    if (response.status === 429) {
      showBanner('请求过于频繁，已自动降低刷新频率，请稍候…')
      return
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    render(data)
    hadData = true
    hideBanner()
  } catch (err) {
    showBanner(hadData ? '数据刷新失败，将在 30 秒后重试(当前显示为上次成功数据)' : '数据加载失败，将在 30 秒后重试')
  }
}

refresh()
setInterval(refresh, REFRESH_INTERVAL_MS)
