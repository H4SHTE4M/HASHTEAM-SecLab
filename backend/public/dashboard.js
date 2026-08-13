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
  checkAccuracy: document.getElementById('check-accuracy'),
  hints: document.getElementById('hint-leaderboard'),
  resets: document.getElementById('reset-leaderboard'),
  updatedAt: document.getElementById('updated-at'),
  timeseriesChart: document.getElementById('timeseries-chart'),
  hourlyChart: document.getElementById('hourly-chart'),
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
  const checkPass = sumMetric(seclab.check_pass)
  const checkTotal = checkPass + sumMetric(seclab.check_fail)
  const checkRate = checkTotal > 0 ? `${((checkPass / checkTotal) * 100).toFixed(1)}%` : '—'

  const cards = [
    { label: '命令执行总数', value: commandTotal, sub: `${sortedEntries(seclab.command).length} 种命令` },
    { label: '通关总人次', value: completeTotal, sub: '全部关卡合计' },
    { label: 'check 正确率', value: checkRate, sub: `${fmtNum(checkPass)} 通过 / ${fmtNum(checkTotal)} 次` },
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
    valueEl.textContent = typeof value === 'number' ? fmtNum(value) : value
    const subEl = document.createElement('div')
    subEl.className = 'card-sub'
    subEl.textContent = sub
    card.append(labelEl, valueEl, subEl)
    els.cards.appendChild(card)
  }
}

/**
 * 渲染 check 正确率（按关卡）。
 * check_pass / check_fail: dimension "level-N" -> count（可能缺失，防御式处理）。
 */
function renderCheckAccuracy(seclab) {
  const container = els.checkAccuracy
  if (!container) return
  const pass = seclab.check_pass || {}
  const fail = seclab.check_fail || {}

  const entries = [...new Set([...Object.keys(pass), ...Object.keys(fail)])]
    .map((dimension) => {
      const p = typeof pass[dimension] === 'number' ? pass[dimension] : 0
      const f = typeof fail[dimension] === 'number' ? fail[dimension] : 0
      return { dimension, passed: p, failed: f, attempts: p + f }
    })
    .filter((entry) => entry.attempts > 0)
    .sort((a, b) => levelSortKey(a.dimension) - levelSortKey(b.dimension))

  container.textContent = ''
  if (entries.length === 0) {
    container.appendChild(emptyState('暂无数据'))
    return
  }

  entries.forEach((entry, idx) => {
    const pct = (entry.passed / entry.attempts) * 100
    const row = document.createElement('div')
    row.className = 'bar-row'

    const rank = document.createElement('span')
    rank.className = `bar-rank${idx < 3 ? ` rank-${idx + 1}` : ''}`
    rank.textContent = String(idx + 1)

    const labelEl = document.createElement('span')
    labelEl.className = 'bar-label'
    labelEl.textContent = entry.dimension
    labelEl.title = entry.dimension

    const track = document.createElement('div')
    track.className = 'bar-track'
    const fill = document.createElement('div')
    fill.className = 'bar-fill'
    fill.style.width = `${Math.max(pct, 0.5).toFixed(1)}%`
    track.appendChild(fill)

    const value = document.createElement('span')
    value.className = 'bar-value'
    value.textContent = `${fmtNum(entry.passed)}/${fmtNum(entry.attempts)}`

    const pctEl = document.createElement('span')
    pctEl.className = 'bar-pct'
    pctEl.textContent = `${pct.toFixed(1)}%`

    row.append(rank, labelEl, track, value, pctEl)
    container.appendChild(row)
  })
}


// ---- 悬停提示 ----

let tooltipEl = null

/** 页面级单一悬停提示元素（fixed 定位，跟随鼠标） */
function getTooltip() {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div')
    tooltipEl.className = 'chart-tooltip hidden'
    document.body.appendChild(tooltipEl)
  }
  return tooltipEl
}

/** 提示行：色点 + 名称 + 数值 */
function tooltipRow(dotClass, label, value) {
  const row = document.createElement('div')
  row.className = 'chart-tooltip-row'
  const dot = document.createElement('span')
  dot.className = `ts-legend-dot ${dotClass}`
  const name = document.createElement('span')
  name.textContent = label
  const val = document.createElement('span')
  val.className = 'chart-tooltip-value'
  val.textContent = fmtNum(value)
  row.append(dot, name, val)
  return row
}

/** 在鼠标附近显示提示；接近右/下边缘时翻转方向避免出屏 */
function showTooltip(clientX, clientY, build) {
  const el = getTooltip()
  el.textContent = ''
  build(el)
  el.classList.remove('hidden')
  const rect = el.getBoundingClientRect()
  let x = clientX + 14
  let y = clientY + 14
  if (x + rect.width > window.innerWidth - 8) x = clientX - rect.width - 14
  if (y + rect.height > window.innerHeight - 8) y = clientY - rect.height - 14
  el.style.left = `${Math.max(8, x)}px`
  el.style.top = `${Math.max(8, y)}px`
}

function hideTooltip() {
  if (tooltipEl) tooltipEl.classList.add('hidden')
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
    col.addEventListener('mousemove', (e) => {
      showTooltip(e.clientX, e.clientY, (el) => {
        const title = document.createElement('div')
        title.className = 'chart-tooltip-title'
        title.textContent = new Date(d.day).toLocaleDateString('zh-CN')
        el.appendChild(title)
        el.appendChild(tooltipRow('ts-seg-session', '会话', d.session_create))
        el.appendChild(tooltipRow('ts-seg-command', '命令', d.command))
        el.appendChild(tooltipRow('ts-seg-complete', '通关', d.level_complete))
        el.appendChild(tooltipRow('ts-seg-hint', '提示', d.hint))
        el.appendChild(tooltipRow('ts-seg-reset', '重置', d.reset))
      })
    })
    col.addEventListener('mouseleave', hideTooltip)

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

/**
 * 渲染近 24 小时活动趋势折线图（会话数 + 命令数）。
 * hourly: [{ hour, session_create, command }]
 * 使用纯 SVG 绘制，零依赖。
 */
function renderHourly(hourly) {
  const container = els.hourlyChart
  if (!container) return
  container.textContent = ''

  if (!Array.isArray(hourly) || hourly.length === 0) {
    container.textContent = '暂无趋势数据'
    return
  }

  const W = 800
  const H = 200
  const padL = 40
  const padR = 16
  const padT = 12
  const padB = 28
  const plotW = W - padL - padR
  const plotH = H - padT - padB

  const maxVal = Math.max(1, ...hourly.flatMap((d) => [d.session_create, d.command]))
  const n = hourly.length
  const xStep = n > 1 ? plotW / (n - 1) : 0

  const xOf = (i) => padL + i * xStep
  const yOf = (v) => padT + plotH - (v / maxVal) * plotH

  // 构建 polyline 点
  const pts = (key) => hourly.map((d, i) => `${xOf(i)},${yOf(d[key])}`).join(' ')
  // 构建填充区域路径
  const area = (key) => {
    const top = hourly.map((d, i) => `${xOf(i)},${yOf(d[key])}`).join(' L ')
    return `M ${xOf(0)},${padT + plotH} L ${top} L ${xOf(n - 1)},${padT + plotH} Z`
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
  svg.setAttribute('preserveAspectRatio', 'none')

  // Y 轴网格线（4 等分）
  for (let g = 0; g <= 4; g++) {
    const y = padT + (g / 4) * plotH
    const val = Math.round(maxVal - (g / 4) * maxVal)
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    line.setAttribute('class', 'ts-grid-line')
    line.setAttribute('x1', padL)
    line.setAttribute('x2', W - padR)
    line.setAttribute('y1', y)
    line.setAttribute('y2', y)
    svg.appendChild(line)
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    label.setAttribute('class', 'ts-axis-label')
    label.setAttribute('x', padL - 6)
    label.setAttribute('y', y + 3)
    label.setAttribute('text-anchor', 'end')
    label.textContent = val
    svg.appendChild(label)
  }

  // X 轴标签（每 6 小时）
  const labelInterval = Math.ceil(n / 5)
  for (let i = 0; i < n; i += labelInterval) {
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text')
    label.setAttribute('class', 'ts-axis-label')
    label.setAttribute('x', xOf(i))
    label.setAttribute('y', H - 8)
    label.setAttribute('text-anchor', 'middle')
    label.textContent = new Date(hourly[i].hour).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    svg.appendChild(label)
  }

  // 会话数折线
  const sessionArea = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  sessionArea.setAttribute('class', 'ts-line-area ts-line-area-session')
  sessionArea.setAttribute('d', area('session_create'))
  svg.appendChild(sessionArea)
  const sessionLine = document.createElementNS('http://www.w3.org/2000/svg', 'polyline')
  sessionLine.setAttribute('class', 'ts-line ts-line-session')
  sessionLine.setAttribute('points', pts('session_create'))
  svg.appendChild(sessionLine)

  // 命令数折线
  const commandArea = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  commandArea.setAttribute('class', 'ts-line-area ts-line-area-command')
  commandArea.setAttribute('d', area('command'))
  svg.appendChild(commandArea)
  const commandLine = document.createElementNS('http://www.w3.org/2000/svg', 'polyline')
  commandLine.setAttribute('class', 'ts-line ts-line-command')
  commandLine.setAttribute('points', pts('command'))
  svg.appendChild(commandLine)

  // 悬停参考线（初始隐藏）
  const hoverLine = document.createElementNS('http://www.w3.org/2000/svg', 'line')
  hoverLine.setAttribute('class', 'ts-hover-line hidden')
  hoverLine.setAttribute('y1', padT)
  hoverLine.setAttribute('y2', padT + plotH)
  svg.appendChild(hoverLine)

  // 数据点（按索引保存引用，悬停时高亮）
  const dots = hourly.map(() => ({ session: null, command: null }))
  for (let i = 0; i < n; i++) {
    for (const [key, cls] of [['session_create', 'ts-line-dot-session'], ['command', 'ts-line-dot-command']]) {
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
      dot.setAttribute('class', `ts-line-dot ${cls}`)
      dot.setAttribute('cx', xOf(i))
      dot.setAttribute('cy', yOf(hourly[i][key]))
      svg.appendChild(dot)
      dots[i][key === 'session_create' ? 'session' : 'command'] = dot
    }
  }

  // 透明捕获层 + 悬停交互：mousemove 定位最近数据点并显示提示
  let hoverIdx = -1
  function setHover(idx) {
    if (idx === hoverIdx) return
    if (hoverIdx >= 0) {
      dots[hoverIdx].session.classList.remove('ts-dot-active')
      dots[hoverIdx].command.classList.remove('ts-dot-active')
    }
    hoverIdx = idx
    if (idx < 0) {
      hoverLine.classList.add('hidden')
      return
    }
    hoverLine.setAttribute('x1', xOf(idx))
    hoverLine.setAttribute('x2', xOf(idx))
    hoverLine.classList.remove('hidden')
    dots[idx].session.classList.add('ts-dot-active')
    dots[idx].command.classList.add('ts-dot-active')
  }

  const capture = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  capture.setAttribute('class', 'ts-hover-capture')
  capture.setAttribute('x', 0)
  capture.setAttribute('y', 0)
  capture.setAttribute('width', W)
  capture.setAttribute('height', H)
  capture.setAttribute('fill', 'transparent')
  svg.appendChild(capture)

  svg.addEventListener('mousemove', (e) => {
    const rect = svg.getBoundingClientRect()
    const xView = ((e.clientX - rect.left) / Math.max(rect.width, 1)) * W
    const idx = Math.min(n - 1, Math.max(0, Math.round((xView - padL) / (xStep || 1))))
    setHover(idx)
    const d = hourly[idx]
    showTooltip(e.clientX, e.clientY, (el) => {
      const title = document.createElement('div')
      title.className = 'chart-tooltip-title'
      title.textContent = new Date(d.hour).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
      el.appendChild(title)
      el.appendChild(tooltipRow('ts-seg-session', '会话', d.session_create))
      el.appendChild(tooltipRow('ts-seg-command', '命令', d.command))
    })
  })
  svg.addEventListener('mouseleave', () => {
    setHover(-1)
    hideTooltip()
  })

  container.appendChild(svg)

  // 图例
  const legend = document.createElement('div')
  legend.className = 'ts-legend'
  for (const [cls, label] of [['ts-line-session', '会话'], ['ts-line-command', '命令']]) {
    const item = document.createElement('div')
    item.className = 'ts-legend-item'
    const dot = document.createElement('span')
    dot.className = 'ts-legend-dot'
    dot.style.background = cls === 'ts-line-session' ? 'var(--blue)' : 'var(--green)'
    item.append(dot, document.createTextNode(label))
    legend.appendChild(item)
  }
  container.appendChild(legend)
}

function render(data) {
  const modules = (data && typeof data.modules === 'object' && data.modules) || {}
  const seclab = modules.seclab || {}

  renderCards(modules)

  renderTimeseries(data.timeseries)

  renderHourly(data.hourly)

  renderBars(els.commands, sortedEntries(seclab.command), null)

  const levelEntries = sortedEntries(seclab.complete)
    .sort((a, b) => levelSortKey(a[0]) - levelSortKey(b[0]))
  const breakdown = parsePathBreakdown(seclab.complete_path)
  renderBars(els.levels, levelEntries, (label) => {
    const paths = breakdown.get(label)
    if (!paths) return null
    return `guided ${fmtNum(paths.guided)} · mixed ${fmtNum(paths.mixed)} · challenge ${fmtNum(paths.challenge)}`
  })

  renderCheckAccuracy(seclab)

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
