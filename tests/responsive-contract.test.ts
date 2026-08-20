import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DESKTOP_TERMINAL_MIN_WIDTH,
  DESKTOP_WORKSPACE_FIXED_WIDTH,
  getMissionPanelWidthBounds,
  SHORT_LANDSCAPE_MIN_WIDTH,
  shouldSplitShortLandscape,
} from '../src/services/workspace-layout'

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

function contrastRatio(foreground: string, background: string): number {
  const luminance = (color: string): number => {
    const channels = color
      .slice(1)
      .match(/.{2}/g)!
      .map((value) => Number.parseInt(value, 16) / 255)
      .map((value) =>
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
      )
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
  }

  const foregroundLuminance = luminance(foreground)
  const backgroundLuminance = luminance(background)
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

function cssColor(sourceText: string, property: string): string {
  const value = sourceText.match(new RegExp(`${property}:\\s*(#[0-9a-f]{6})`, 'i'))?.[1]
  if (value === undefined) throw new Error(`Missing CSS color: ${property}`)
  return value
}

describe('responsive layout contract', () => {
  it('enables safe-area and virtual-keyboard-aware viewport behavior', () => {
    const html = source('index.html')
    const globalCss = source('src/styles/global.css')

    expect(html).toContain('viewport-fit=cover')
    expect(html).toContain('interactive-widget=resizes-content')
    expect(globalCss).toContain('env(safe-area-inset-top')
    expect(globalCss).toContain('@media (min-resolution: 2dppx)')
    expect(globalCss).toContain('--hairline: 0.5px')
  })

  it('supports a persistent light and dark theme without a startup flash', () => {
    const html = source('index.html')
    const globalCss = source('src/styles/global.css')
    const topbar = source('src/components/TopBar.vue')
    const appearancePicker = source('src/components/AppearancePicker.vue')

    expect(html).toContain('hashteam-theme-v1')
    expect(globalCss).toContain(":root[data-theme='dark']")
    expect(topbar).toContain('class="icon-btn theme-toggle"')
    expect(topbar).toContain("'深色模式' : '浅色模式'")
    expect(topbar).not.toContain('<Transition name="theme-icon"')
    expect(topbar).not.toContain('.theme-icon-leave-to')
    expect(topbar).toContain('class="appearance-controls"')
    expect(appearancePicker).toContain('aria-label="界面配色"')
    expect(appearancePicker).toContain('class="palette-swatch"')
    expect(appearancePicker).toContain('type="color"')
    expect(appearancePicker).toContain('class="custom-color-select"')
    expect(globalCss).toContain(":root[data-theme='dark'][data-accent='ocean']")
    expect(globalCss).toContain(":root[data-theme='dark'][data-accent='custom']")
    expect(globalCss).toContain(
      '--bg-canvas: color-mix(in srgb, var(--accent-cyan) 10%',
    )
    expect(globalCss).toContain(
      '--surface-2: color-mix(in srgb, var(--accent-cyan) 7%',
    )
    expect(globalCss).toContain('--accent-nav-text: var(--accent-cyan)')
  })

  it('keeps increased-contrast colors legible in both themes', () => {
    const globalCss = source('src/styles/global.css')

    expect(globalCss).toContain('@media (prefers-contrast: more)')
    expect(globalCss).toContain('--text-muted: #d1d8d2')
    expect(globalCss).toContain('--text-faint: #b8c2ba')
  })

  it('keeps default light-theme small text above WCAG AA contrast', () => {
    const globalCss = source('src/styles/global.css')

    expect(contrastRatio(cssColor(globalCss, '--text-faint'), '#ffffff')).toBeGreaterThanOrEqual(
      4.5,
    )
    expect(contrastRatio(cssColor(globalCss, '--accent-cyan'), '#ffffff')).toBeGreaterThanOrEqual(
      4.5,
    )
  })

  it('keeps every selectable accent legible in both themes', () => {
    const globalCss = source('src/styles/global.css')
    const lightAccents = ['#357a50', '#176b87', '#5b5fa3', '#9b4a69']
    const darkAccents = ['#71c78a', '#63c5e3', '#aeb8ff', '#ec9bb4']

    for (const color of lightAccents) {
      expect(globalCss).toContain(`--accent-cyan: ${color}`)
      expect(contrastRatio(color, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    }
    for (const color of darkAccents) {
      expect(globalCss).toContain(`--accent-cyan: ${color}`)
      expect(contrastRatio(color, '#25302a')).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('stacks narrow landscape screens and only splits when both panes fit', () => {
    const app = source('src/views/SecLabWorkspace.vue')
    const panel = source('src/components/MissionPanel.vue')
    const rail = source('src/components/LevelRail.vue')
    const topbar = source('src/components/TopBar.vue')

    expect(SHORT_LANDSCAPE_MIN_WIDTH).toBe(680)
    expect(app).toContain("'short-landscape-split': shortLandscapeSplit")
    expect(rail).toContain(":class=\"{ 'short-landscape-split': shortLandscapeSplit }\"")
    expect(app).toMatch(/grid-template-columns:\s*56px minmax\(0, 1fr\)/)
    expect(app).toContain('grid-template-rows: 52px minmax(220px, 68dvh) max-content')
    expect(app).toMatch(
      /\.terminal-title > span,\s*\.terminal-title code,\s*\.vm-status span:last-child\s*\{\s*display:\s*none;/,
    )
    expect(panel).toMatch(/\.mission-panel\s*\{[\s\S]*?overflow-y:\s*auto;/)
    expect(topbar).toContain('height: calc(52px + var(--safe-top))')
  })

  it('reserves the current workspace chrome when bounding the mission panel', () => {
    for (const viewportWidth of [901, 1024, 1218]) {
      const bounds = getMissionPanelWidthBounds(viewportWidth, 800)
      const terminalWidth = viewportWidth - DESKTOP_WORKSPACE_FIXED_WIDTH - bounds.max
      expect(terminalWidth, `${viewportWidth}px viewport`).toBeGreaterThanOrEqual(
        DESKTOP_TERMINAL_MIN_WIDTH,
      )
    }

    expect(getMissionPanelWidthBounds(568, 320)).toEqual({ min: 320, max: 320 })
    expect(getMissionPanelWidthBounds(679, 360)).toEqual({ min: 320, max: 320 })
    expect(getMissionPanelWidthBounds(680, 360)).toEqual({ min: 280, max: 282 })
    expect(getMissionPanelWidthBounds(900, 500)).toEqual({ min: 280, max: 380 })
    expect(shouldSplitShortLandscape(736, 414, 88)).toBe(false)
    expect(shouldSplitShortLandscape(844, 390, 88)).toBe(true)
    expect(getMissionPanelWidthBounds(736, 414, 88)).toEqual({ min: 320, max: 320 })
    expect(getMissionPanelWidthBounds(844, 390, 88)).toEqual({ min: 280, max: 358 })
  })

  it('uses one scroll container for the stacked mobile workspace', () => {
    const app = source('src/views/SecLabWorkspace.vue')

    expect(app).toMatch(/grid-template-rows:\s*64px minmax\(300px, 42vh\) max-content/)
    expect(app).toContain('overflow-y: auto')
    expect(app).toMatch(
      /\.workspace:not\(\.short-landscape-split\) :deep\(\.panel-scroll\)[\s\S]*?overflow:\s*visible;/,
    )
  })

  it('refits the terminal when viewport scale or size changes', () => {
    const terminal = source('src/components/LabTerminal.vue')

    expect(terminal).toContain('visualViewport?.addEventListener')
    expect(terminal).toContain('new ResizeObserver')
    expect(terminal).toContain('rescaleOverlappingGlyphs: true')
  })

  it('synchronizes the guest tty width without injecting resize commands into the foreground app', () => {
    const profile = source('vm/rootfs-overlay/home/guest/.profile')
    const init = source('vm/rootfs-overlay/init')
    const controller = source('src/services/vm-controller.ts')
    const winsize = source('vm/rootfs-overlay/usr/local/bin/pwnhub-winsize')

    expect(profile).toContain('stty cols 80 rows 24')
    expect(init).toContain('/usr/local/bin/pwnhub-winsize')
    expect(controller).toContain("add_listener('serial1-output-byte'")
    expect(controller).toContain('PwnHubSize;${this.terminalSize.cols};${this.terminalSize.rows}')
    expect(winsize).toContain('TARGET_TTY=/dev/ttyS0')
    expect(winsize).toContain('stty -F "$TARGET_TTY" cols "$cols" rows "$rows"')
    expect(controller).not.toMatch(/runCommand\([^)]*stty/)
  })

  it('offers persisted, bounded terminal font controls', () => {
    const app = source('src/views/SecLabWorkspace.vue')
    const terminal = source('src/components/LabTerminal.vue')
    const preferences = source('src/services/ui-preferences-store.ts')

    expect(app).toContain('aria-label="减小终端字号"')
    expect(app).toContain('aria-label="增大终端字号"')
    expect(app).toContain(':font-size="preferences.state.terminalFontSize"')
    expect(terminal).toContain('terminal.options.fontSize = fontSize')
    expect(preferences).toContain('TERMINAL_FONT_SIZE_MIN = 12')
    expect(preferences).toContain('TERMINAL_FONT_SIZE_MAX = 20')
    expect(preferences).toContain('TERMINAL_FONT_SIZE_DEFAULT = 14')
    expect(terminal).toContain('fontSize: 14')
    expect(app).toContain('grid-template-columns: 44px 32px 44px')
  })

  it('keeps compact interactive targets usable by touch', () => {
    const about = source('src/components/AboutModal.vue')
    const app = source('src/views/SecLabWorkspace.vue')
    const panel = source('src/components/MissionPanel.vue')
    const rail = source('src/components/LevelRail.vue')
    const topbar = source('src/components/TopBar.vue')

    expect(app).toContain(
      'grid-template-columns: var(--workspace-rail-width) minmax(0, 1fr) var(--workspace-resizer-width)',
    )
    expect(app).toMatch(/\.font-size-control\s*\{[\s\S]*?height:\s*46px;/)
    expect(app).toMatch(
      /@media \(max-width:\s*900px\)[\s\S]*?\.font-size-control \[data-tooltip\]::before\s*\{[\s\S]*?display:\s*none;/,
    )
    expect(panel).toMatch(
      /@media \(max-width:\s*600px\)[\s\S]*?\.story-details summary\s*\{[\s\S]*?padding-block:\s*9px;/,
    )
    expect(about).toMatch(
      /@media \(max-width:\s*480px\)[\s\S]*?\.btn-close\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/,
    )
    expect(rail).not.toContain('flex-basis: 38px')
    expect(topbar).not.toContain('width: 34px')
  })

  it('keeps payload segment controls in stable columns and stacks them on narrow screens', () => {
    const payload = source('src/components/PayloadWorkbench.vue')

    expect(payload).toMatch(/grid-template-columns:\s*30px[^;]+58px 34px;/)
    expect(payload).toContain('.segment-kind { grid-column: 5;')
    expect(payload).toContain('.remove-segment { grid-column: 6;')
    expect(payload).toContain("li:not([data-kind='padding']) > label:nth-of-type(2) { grid-column: 3 / 5; }")
    expect(payload).toContain("li:not([data-kind='padding']) > label:nth-of-type(2) { grid-column: 2; }")
  })

  it('keeps debugger controls usable on narrow mission panels', () => {
    const debuggerControls = source('src/components/DebuggerControls.vue')

    expect(debuggerControls).toContain('debugger-checkpoint')
    expect(debuggerControls).toMatch(
      /@media \(max-width: 520px\)[\s\S]*?\.debugger-command-form,\s*\.debugger-command-form:last-child\s*\{\s*grid-template-columns: minmax\(0, 1fr\);/,
    )
    expect(debuggerControls).toContain("send(`until ${props.checkpoint}`)")
  })

  it('ships compact WOFF2 terminal fonts instead of multi-megabyte TTF payloads', () => {
    const fontsCss = source('src/styles/fonts.css')
    const fontFiles = [
      'CaskaydiaCoveNerdFontMono-Regular.woff2',
      'CaskaydiaCoveNerdFontMono-SemiBold.woff2',
    ]

    expect(fontsCss).not.toContain('.ttf')
    expect(
      existsSync(
        resolve(
          'src/assets/fonts/caskaydia-cove-nerd',
          'CaskaydiaCoveNerdFontMono-Regular.ttf',
        ),
      ),
    ).toBe(false)
    for (const fontFile of fontFiles) {
      expect(fontsCss).toContain(fontFile)
      expect(
        statSync(resolve('src/assets/fonts/caskaydia-cove-nerd', fontFile)).size,
        fontFile,
      ).toBeLessThan(100_000)
    }
  })

  it('keeps every terminal character on exactly one grid cell', () => {
    const globalCss = source('src/styles/global.css')
    const terminalCjkCss = source('src/styles/terminal-cjk-font.css')

    // 单元格宽度取决于字体栈里**第一个**有该字形的字体，也就是 CaskaydiaCove 的拉丁
    // advance。终端 CJK 族靠 size-adjust 放大到正好填满两格，顺序换了前提就没了。
    const stack = globalCss.match(/--font-terminal:\s*([^;]+);/)?.[1].replace(/\s+/g, ' ')
    if (stack === undefined) throw new Error('Missing --font-terminal')
    const caskaydiaAt = stack.indexOf('CaskaydiaCove Nerd Font Mono')
    const cjkAt = stack.indexOf('Noto Sans SC Terminal')
    expect(caskaydiaAt, '字体栈缺少 CaskaydiaCove').toBeGreaterThanOrEqual(0)
    expect(cjkAt, '字体栈缺少 Noto Sans SC Terminal').toBeGreaterThanOrEqual(0)
    expect(caskaydiaAt, 'CaskaydiaCove 必须排在 CJK 族之前').toBeLessThan(cjkAt)

    // 放大比例必须正好是 CaskaydiaCove 的两格
    const expected = `${((2 * 1200) / 2048) * 100}%`
    expect(terminalCjkCss).toContain(`size-adjust: ${expected}`)
    expect(terminalCjkCss).toContain('/files/noto-sans-sc-')
    expect(source('src/main.ts')).toContain("import './styles/terminal-cjk-font.css'")

    // Chrome 默认会压缩相邻 CJK 标点，既改渲染也污染 xterm 的宽度测量
    expect(globalCss).toMatch(/\.xterm\s*\{[^}]*text-spacing-trim:\s*space-all/)
  })

  it('re-measures the terminal when a lazily-loaded CJK subset arrives', () => {
    // 中文分片按需下载，WidthCache 会把分片到位前的兜底宽度永久缓存下来。
    const metrics = source('src/composables/useTerminalMetrics.ts')
    expect(metrics).toContain("addEventListener('loadingdone'")

    for (const path of [
      'src/components/LabTerminal.vue',
      'src/components/PwnHubLabTerminal.vue',
    ]) {
      const terminal = source(path)
      expect(terminal, path).toContain('watchFontLoads(')
      expect(terminal, path).toContain('stopFontWatch?.()')
    }
  })

  it('keeps the global letter-spacing reset away from xterm so the cell grid stays aligned', () => {
    const globalCss = source('src/styles/global.css')

    // xterm 的 DOM renderer 靠给每个 span 写内联 letter-spacing 把字形宽度校正回单元格
    // 网格；作者样式表里的 !important 优先级高于内联样式，一旦用 `*` 盖住终端内部，
    // 校正就被丢弃，选区/光标会逐列偏移并盖住文字。
    const letterSpacingRules = [
      ...globalCss
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .matchAll(/([^{}]+)\{[^{}]*letter-spacing:[^;}]*!important[^;}]*[;}]/g),
    ].map((match) => match[1].trim())

    expect(letterSpacingRules.length).toBeGreaterThan(0)
    for (const selector of letterSpacingRules) {
      expect(selector, `选择器 ${selector} 会把 letter-spacing 强制盖到 xterm 上`).toContain(
        ':not(.xterm, .xterm *)',
      )
    }
  })

  it('re-measures the terminal cell grid after the web fonts finish loading', () => {
    // CharSizeService 只在 Terminal.open() 时量一次，之后没有任何字体加载监听。
    // 组件在 onMounted 里建终端，此时 @font-face 还没下载完，量到的是系统兜底等宽字体
    // 而实际绘制用的是 CaskaydiaCove——两者 advance 不同，网格和字形对不上。
    const metrics = source('src/composables/useTerminalMetrics.ts')
    expect(metrics).toContain('document.fonts.load')

    for (const path of [
      'src/components/LabTerminal.vue',
      'src/components/PwnHubLabTerminal.vue',
    ]) {
      const terminal = source(path)
      expect(terminal, path).toContain('loadTerminalFonts(terminalFontFamily, props.fontSize)')
      expect(terminal, path).toContain('remeasureTerminal(terminal)')
    }
  })

  it('measures terminal rows inside the padded frame without clipping the last row', () => {
    const terminal = source('src/components/LabTerminal.vue')

    expect(terminal).toMatch(
      /class="lab-terminal">[\s\S]*?<div ref="containerRef" class="terminal-viewport"/,
    )
    expect(terminal).toMatch(
      /\.terminal-viewport\s*\{[\s\S]*?height:\s*100%;[\s\S]*?overflow:\s*hidden;/,
    )
  })

  it('retains the upstream v2 learning flow instead of restoring the removed completion dialog', () => {
    const app = source('src/views/SecLabWorkspace.vue')
    const panel = source('src/components/MissionPanel.vue')

    expect(app).toContain(':completed-steps="currentCompletedSteps"')
    expect(app).toContain('@complete-step="progress.completeStep"')
    expect(panel).toContain('level.steps.length')
    expect(panel).toContain('learningPathComplete')
    expect(panel).toContain('completion-card')
    expect(app).not.toContain('LevelCompleteDialog')
  })

  it('uses the earlier mission-panel typography without changing the v2 learning content', () => {
    const globalCss = source('src/styles/global.css')
    const panel = source('src/components/MissionPanel.vue')

    expect(panel).toMatch(/\.mission-panel\s*\{[\s\S]*?font-family:\s*var\(--font-ui\);/)
    expect(globalCss).toContain(
      "--font-cjk: 'Noto Sans SC Variable', 'PingFang SC', 'Microsoft YaHei', sans-serif;",
    )
    expect(panel).toMatch(
      /\.level-name\s*\{[\s\S]*?font-family:\s*var\(--font-cjk\);[\s\S]*?font-size:\s*20px;[\s\S]*?font-weight:\s*600;/,
    )
    expect(panel).toMatch(/\.story-details p\s*\{[\s\S]*?font-size:\s*15px;[\s\S]*?line-height:\s*1\.75;/)
    expect(panel).toMatch(/\.story-details summary span\s*\{[\s\S]*?display:\s*inline;/)
    expect(panel).toMatch(/\.story-details \.story-summary\s*\{[\s\S]*?font-weight:\s*550;/)
    expect(panel).toMatch(/\.action-header h3\s*\{[\s\S]*?font-size:\s*17px;/)
    expect(panel).toMatch(/\.step-instruction\s*\{[\s\S]*?font-size:\s*15px;[\s\S]*?line-height:\s*1\.7;/)
    expect(panel).toMatch(/code,\s*input\s*\{\s*font-family:\s*var\(--font-mono\);/)
    expect(panel).toContain('level.steps.length')
    expect(panel).toContain('learningPathComplete')
  })

  it('supports accessible tooltips and a resizable mission panel', () => {
    const app = source('src/views/SecLabWorkspace.vue')
    const pwnhubApp = source('src/views/PwnHubWorkspace.vue')
    const globalCss = source('src/styles/global.css')
    const topbar = source('src/components/TopBar.vue')

    expect(app).toContain('role="separator"')
    expect(app).toContain('@pointerdown="startPanelResize"')
    expect(app).toContain('handlePanelResizeKeydown')
    expect(app).toContain('--mission-panel-width')
    expect(app).toContain('class="panel-collapse-toggle"')
    expect(app).toContain('aria-controls="mission-panel"')
    expect(app).toContain("'展开任务栏' : '收起任务栏'")
    expect(pwnhubApp).toContain('@pointerdown="startPanelToggleGesture"')
    expect(pwnhubApp).toContain('@click="handlePanelToggleClick"')
    expect(pwnhubApp).toMatch(
      /\.panel-collapse-toggle\s*\{[^}]*width:\s*24px;[^}]*height:\s*40px;/,
    )
    expect(pwnhubApp).not.toMatch(/\.panel-collapse-toggle\s*\{[^}]*top:/)
    expect(app).toContain('--workspace-panel-width')
    expect(globalCss).toContain('[data-tooltip]:hover::before')
    expect(globalCss).toContain('[data-tooltip]:focus-visible::before')
    expect(globalCss).not.toContain('[data-tooltip]:focus::before')
    expect(topbar).toContain('data-tooltip="操作帮助"')
  })

  it('aligns desktop controls with the terminal and mission panel boundaries', () => {
    const app = source('src/views/SecLabWorkspace.vue')
    const topbar = source('src/components/TopBar.vue')

    expect(app).toContain('class="app-content"\n      :style="workspaceStyle"')
    expect(app).toContain('--workspace-rail-width: 64px')
    expect(app).toContain('--workspace-resizer-width: 24px')
    expect(topbar).toContain('@media (min-width: 901px)')
    expect(topbar).toMatch(
      /\.topbar\s*\{[\s\S]*?grid-template-columns:\s*var\(--workspace-rail-width\) minmax\(0, 1fr\) var\(--workspace-resizer-width\) var\(--mission-panel-width\);/,
    )
    expect(topbar).toContain('class="brand"')
    expect(topbar).not.toMatch(/\.topbar-identity\s*\{\s*display:\s*none;/)
    expect(topbar).toMatch(
      /\.topbar-identity\s*\{[\s\S]*?grid-column:\s*1 \/ 3;[\s\S]*?grid-row:\s*1;[\s\S]*?padding-right:\s*156px;/,
    )
    expect(topbar).toMatch(
      /\.progress\s*\{[\s\S]*?grid-column:\s*1 \/ 3;[\s\S]*?grid-row:\s*1;[\s\S]*?justify-self:\s*end;/,
    )
    expect(topbar).toMatch(
      /\.mission-controls\s*\{[\s\S]*?grid-column:\s*4;[\s\S]*?grid-row:\s*1;/,
    )
    expect(topbar).toMatch(
      /\.mission-controls-layout\s*\{[\s\S]*?grid-template-columns:\s*auto minmax\(0, 1fr\) auto auto;/,
    )
    expect(topbar).toMatch(/\.tool-group\s*\{[\s\S]*?grid-column:\s*3;[\s\S]*?justify-self:\s*end;/)
    expect(topbar).toContain('@container (max-width: 560px)')
  })

  it('keeps the desktop workspace name line box tall enough to avoid clipping', () => {
    const topbar = source('src/components/TopBar.vue')

    expect(topbar).toMatch(
      /\.context-name\s*\{[\s\S]*?font-size:\s*15px;[\s\S]*?line-height:\s*1\.3;/,
    )
  })

  it('bounds overlays to the dynamic viewport and safe areas', () => {
    for (const component of [
      'src/components/AboutModal.vue',
      'src/components/LoadingScreen.vue',
      'src/components/OnboardingDialog.vue',
    ]) {
      const contents = source(component)
      expect(contents, component).toContain('height: 100dvh')
      expect(contents, component).toContain('var(--safe-top)')
      expect(contents, component).toMatch(/max-height:\s*(?:min\([^;]*100%\)|100%)/)
    }

    const completion = source('src/components/CompletionPage.vue')
    expect(completion).toContain('overflow-y: auto')
    expect(completion).toContain('var(--safe-top)')
    expect(completion).toContain('var(--safe-bottom)')
  })

  it('adapts the about-lab introduction to narrow, desktop, and large viewports', () => {
    const about = source('src/components/AboutModal.vue')

    expect(about).toContain('width: min(100%, clamp(42.5rem, 48vw, 54rem))')
    expect(about).toContain('max-height: min(100%, clamp(47.5rem, 82dvh, 56rem))')
    expect(about).toContain('--about-gutter-inline: clamp(12px, 3vw, 40px)')
    expect(about).toMatch(/\.modal-body p,[\s\S]*?overflow-wrap:\s*anywhere;/)
    expect(about).toMatch(
      /@media \(min-width:\s*1440px\) and \(min-height:\s*800px\)[\s\S]*?\.modal-body p,[\s\S]*?font-size:\s*15px;/,
    )
    expect(about).toMatch(
      /@media \(min-width:\s*2200px\) and \(min-height:\s*1200px\)[\s\S]*?\.modal-body p,[\s\S]*?font-size:\s*16px;/,
    )
  })

  it('keeps the completed boot state visible before opening onboarding', () => {
    const app = source('src/views/SecLabWorkspace.vue')

    expect(app).toContain('BOOT_OVERLAY_MIN_VISIBLE_MS = 900')
    expect(app).toContain('BOOT_READY_HOLD_MS = 180')
    expect(app).toContain('v-if="showBootOverlay"')
    expect(app).toContain(':inert="backgroundInert"')
    expect(app).toContain(':auto-focus="!backgroundInert"')
    expect(app).toContain('v-if="showOnboardingDialog"')
  })

  it('keeps the pwnhub readiness note free of dead vertical space', () => {
    const selector = source('src/views/LabSelectorView.vue')

    // readiness 提示三种文案（0/10、x/10、10/10）在卡片内宽下都是单行
    // （13px × 1.55 ≈ 20px）；若为该行保留 min-height，多出的高度会在
    // 「已完成 x/10 个基础实验」与「模块仍在建设中」之间形成一片空白。
    // 卡片纵向留白由 .enter-button 的 margin-top:auto 统一吸收。
    const readinessBlock = selector.match(/\.readiness-note\s*\{[^}]*\}/)?.[0]
    expect(readinessBlock).toBeDefined()
    expect(readinessBlock).not.toMatch(/min-height/)
    const enterButtonBlock = selector.match(/\.enter-button\s*\{[^}]*\}/)?.[0]
    expect(enterButtonBlock).toBeDefined()
    expect(enterButtonBlock).toContain('margin-top: auto')
  })
})
