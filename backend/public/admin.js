/**
 * 管理页逻辑。
 * 会话由 HttpOnly cookie 维持(浏览器自动携带),前端不接触 token。
 * 所有 API 走相对路径 ../api/admin/*,兼容任意反代前缀。
 */

'use strict'

const REFRESH_INTERVAL_MS = 60 * 1000

const els = {
  loginView: document.getElementById('login-view'),
  adminView: document.getElementById('admin-view'),
  passwordInput: document.getElementById('password-input'),
  loginBtn: document.getElementById('login-btn'),
  loginError: document.getElementById('login-error'),
  logoutBtn: document.getElementById('logout-btn'),
  serviceCards: document.getElementById('service-cards'),
  commandTable: document.getElementById('command-table'),
  matrixTable: document.getElementById('matrix-table'),
  hintResetTable: document.getElementById('hint-reset-table'),
  sessionsTable: document.getElementById('sessions-table'),
  updatedAt: document.getElementById('updated-at'),
  timeseriesChart: document.getElementById('timeseries-chart'),
  hourlyChart: document.getElementById('hourly-chart'),
  refreshHint: document.getElementById('refresh-hint'),
}

function fmtNum(n) {
  return n.toLocaleString('zh-CN')
}

function fmtTime(ms) {
  return new Date(ms).toLocaleString('zh-CN', { hour12: false })
}

function fmtBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fmtUptime(sec) {
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d > 0) return `${d} 天 ${h} 小时`
  if (h > 0) return `${h} 小时 ${m} 分`
  return `${m} 分`
}

function levelSortKey(dimension) {
  const m = /^level-(\d+)$/.exec(dimension)
  return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER
}

function metricEntries(metric) {
  if (!metric || typeof metric !== 'object') return []
  return Object.entries(metric).filter(([, v]) => typeof v === 'number')
}

function td(text, isNum) {
  const cell = document.createElement('td')
  if (isNum) cell.className = 'num'
  cell.textContent = text
  return cell
}

function tdMono(text) {
  const cell = document.createElement('td')
  const span = document.createElement('span')
  span.className = 'mono'
  span.textContent = text
  cell.appendChild(span)
  return cell
}

function emptyRow(colspan, tableBody) {
  const row = document.createElement('tr')
  const cell = document.createElement('td')
  cell.colSpan = colspan
  cell.className = 'muted'
  cell.textContent = '暂无数据'
  row.appendChild(cell)
  tableBody.appendChild(row)
}

// ---- 视图切换 ----

function showLogin() {
  els.loginView.classList.remove('hidden')
  els.adminView.classList.add('hidden')
  els.logoutBtn.classList.add('hidden')
  els.refreshHint.classList.add('hidden')
  els.updatedAt.textContent = ''
  els.passwordInput.value = ''
  els.passwordInput.focus()
}

function showAdmin() {
  els.loginView.classList.add('hidden')
  els.adminView.classList.remove('hidden')
  els.logoutBtn.classList.remove('hidden')
  els.refreshHint.classList.remove('hidden')
}

// ---- 渲染 ----

function renderServiceCards(data) {
  const svc = data.service || {}
  const sessions = data.sessions || {}
  const completions = data.completions || {}
  const cards = [
    { label: '运行时长', value: fmtUptime(svc.uptimeSec || 0), sub: `启动于 ${svc.startedAt ? fmtTime(svc.startedAt) : '未知'}` },
    { label: 'Node 版本', value: svc.nodeVersion || '-', sub: `模块:${(svc.modules || []).join(', ') || '-'}` },
    { label: '数据库大小', value: fmtBytes(svc.dbSizeBytes || 0), sub: 'SQLite WAL' },
    { label: '活跃 / 累计会话', value: `${fmtNum(sessions.active || 0)} / ${fmtNum(sessions.total || 0)}`, sub: '匿名 session,30 分钟过期' },
    { label: '通关记录', value: fmtNum(completions.total || 0), sub: `独立会话 ${fmtNum(completions.uniqueTokens || 0)} 个` },
  ]
  els.serviceCards.textContent = ''
  for (const { label, value, sub } of cards) {
    const card = document.createElement('div')
    card.className = 'card'
    const labelEl = document.createElement('div')
    labelEl.className = 'card-label'
    labelEl.textContent = label
    const valueEl = document.createElement('div')
    valueEl.className = 'card-value'
    valueEl.style.fontSize = '20px'
    valueEl.textContent = value
    const subEl = document.createElement('div')
    subEl.className = 'card-sub'
    subEl.textContent = sub
    card.append(labelEl, valueEl, subEl)
    els.serviceCards.appendChild(card)
  }
}

function renderCommandTable(commandMetric) {
  const entries = metricEntries(commandMetric).sort((a, b) => b[1] - a[1])
  const total = entries.reduce((sum, [, c]) => sum + c, 0)
  els.commandTable.textContent = ''
  if (entries.length === 0) return emptyRow(3, els.commandTable)
  for (const [command, count] of entries) {
    const row = document.createElement('tr')
    row.append(
      tdMono(command),
      td(fmtNum(count), true),
      td(total > 0 ? `${((count / total) * 100).toFixed(1)}%` : '-', true),
    )
    els.commandTable.appendChild(row)
  }
}

function renderMatrixTable(completeMetric, completePathMetric) {
  // 汇总所有出现过的 level
  const levels = new Set()
  for (const [dim] of metricEntries(completeMetric)) levels.add(dim)
  for (const [dim] of metricEntries(completePathMetric)) {
    const m = /^(level-\d+):/.exec(dim)
    if (m) levels.add(m[1])
  }
  const sorted = [...levels].sort((a, b) => levelSortKey(a) - levelSortKey(b))

  els.matrixTable.textContent = ''
  if (sorted.length === 0) return emptyRow(5, els.matrixTable)

  for (const level of sorted) {
    const guided = (completePathMetric || {})[`${level}:guided`] || 0
    const mixed = (completePathMetric || {})[`${level}:mixed`] || 0
    const challenge = (completePathMetric || {})[`${level}:challenge`] || 0
    const row = document.createElement('tr')
    row.append(
      tdMono(level),
      td(fmtNum(guided), true),
      td(fmtNum(mixed), true),
      td(fmtNum(challenge), true),
      td(fmtNum(guided + mixed + challenge), true),
    )
    els.matrixTable.appendChild(row)
  }
}

function renderHintResetTable(hintMetric, resetMetric) {
  const levels = new Set()
  for (const [dim] of metricEntries(hintMetric)) levels.add(dim)
  for (const [dim] of metricEntries(resetMetric)) levels.add(dim)
  const sorted = [...levels].sort((a, b) => levelSortKey(a) - levelSortKey(b))

  els.hintResetTable.textContent = ''
  if (sorted.length === 0) return emptyRow(3, els.hintResetTable)

  for (const level of sorted) {
    const row = document.createElement('tr')
    row.append(
      tdMono(level),
      td(fmtNum((hintMetric || {})[level] || 0), true),
      td(fmtNum((resetMetric || {})[level] || 0), true),
    )
    els.hintResetTable.appendChild(row)
  }
}

function renderSessionsTable(recent) {
  els.sessionsTable.textContent = ''
  if (!Array.isArray(recent) || recent.length === 0) return emptyRow(6, els.sessionsTable)

  for (const s of recent) {
    const row = document.createElement('tr')
    const tag = document.createElement('td')
    const tagSpan = document.createElement('span')
    tagSpan.className = `tag ${s.expired ? 'tag-gray' : 'tag-green'}`
    tagSpan.textContent = s.expired ? '已过期' : '活跃'
    tag.appendChild(tagSpan)
    row.append(
      tdMono(s.tokenPrefix || '-'),
      td(s.createdAt ? fmtTime(s.createdAt) : '-'),
      td(s.expiresAt ? fmtTime(s.expiresAt) : '-'),
      td(fmtNum(s.lastSeq || 0), true),
      td(fmtNum(s.eventCount || 0), true),
      tag,
    )
    els.sessionsTable.appendChild(row)
  }
}

/**
 * 渲染近 30 天活动趋势堆叠柱状图。
 * timeseries: [{ day, session_create, command, level_complete, hint, reset }]
 */
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

  const pts = (key) => hourly.map((d, i) => `${xOf(i)},${yOf(d[key])}`).join(' ')
  const area = (key) => {
    const top = hourly.map((d, i) => `${xOf(i)},${yOf(d[key])}`).join(' L ')
    return `M ${xOf(0)},${padT + plotH} L ${top} L ${xOf(n - 1)},${padT + plotH} Z`
  }

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
  svg.setAttribute('preserveAspectRatio', 'none')

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

  const sessionArea = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  sessionArea.setAttribute('class', 'ts-line-area ts-line-area-session')
  sessionArea.setAttribute('d', area('session_create'))
  svg.appendChild(sessionArea)
  const sessionLine = document.createElementNS('http://www.w3.org/2000/svg', 'polyline')
  sessionLine.setAttribute('class', 'ts-line ts-line-session')
  sessionLine.setAttribute('points', pts('session_create'))
  svg.appendChild(sessionLine)

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
  renderServiceCards(data)
  renderCommandTable(seclab.command)
  renderMatrixTable(seclab.complete, seclab.complete_path)
  renderHintResetTable(seclab.hint, seclab.reset)
  renderSessionsTable(data.sessions && data.sessions.recent)
  renderTimeseries(data.timeseries)
  renderHourly(data.hourly)
  els.updatedAt.textContent = `数据更新时间:${fmtTime(data.generatedAt || Date.now())}`
}

// ---- API ----

let refreshTimer = null

async function loadOverview() {
  try {
    const response = await fetch('../api/admin/overview', { headers: { Accept: 'application/json' } })
    if (response.status === 401) {
      showLogin()
      if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null }
      return
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    render(await response.json())
    showAdmin()
    if (!refreshTimer) refreshTimer = setInterval(loadOverview, REFRESH_INTERVAL_MS)
  } catch (err) {
    els.updatedAt.textContent = '数据刷新失败,将在 60 秒后重试'
  }
}

async function login() {
  const password = els.passwordInput.value
  if (!password) {
    showLoginError('请输入密码')
    return
  }
  els.loginBtn.disabled = true
  hideLoginError()
  try {
    const response = await fetch('../api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (response.status === 401) {
      showLoginError('密码错误')
    } else if (response.status === 429) {
      showLoginError('尝试过于频繁,请 5 分钟后再试')
    } else if (response.status === 503) {
      showLoginError('管理功能未在服务端配置')
    } else if (response.ok) {
      await loadOverview()
    } else {
      showLoginError(`登录失败(HTTP ${response.status})`)
    }
  } catch (err) {
    showLoginError('网络错误,请稍后重试')
  } finally {
    els.loginBtn.disabled = false
  }
}

async function logout() {
  try {
    await fetch('../api/admin/logout', { method: 'POST' })
  } catch (err) {
    // 网络失败也强制回到登录态;服务端会话 12h 内自动过期
  }
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null }
  showLogin()
}

function showLoginError(text) {
  els.loginError.textContent = text
  els.loginError.classList.remove('hidden')
}

function hideLoginError() {
  els.loginError.classList.add('hidden')
}

els.loginBtn.addEventListener('click', login)
els.passwordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') login()
})
els.logoutBtn.addEventListener('click', logout)

// 初始:尝试加载 overview,401 时自动落到登录视图
loadOverview()
