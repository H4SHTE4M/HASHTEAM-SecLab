export const SHORT_LANDSCAPE_MIN_WIDTH = 680
export const DESKTOP_TERMINAL_MIN_WIDTH = 420
export const DESKTOP_WORKSPACE_FIXED_WIDTH = 32 + 64 + 24 + 24

const MOBILE_BREAKPOINT = 900
const SHORT_LANDSCAPE_MAX_HEIGHT = 600
const PANEL_MIN_WIDTH = 320
const PANEL_MAX_WIDTH = 720
const SHORT_LANDSCAPE_PANEL_MIN_WIDTH = 280
const SHORT_LANDSCAPE_PANEL_MAX_WIDTH = 380
const SHORT_LANDSCAPE_TERMINAL_MIN_WIDTH = 284
const SHORT_LANDSCAPE_WORKSPACE_FIXED_WIDTH = 16 + 56 + 24 + 18

export interface MissionPanelWidthBounds {
  min: number
  max: number
}

export function shouldSplitShortLandscape(
  viewportWidth: number,
  viewportHeight: number,
  horizontalSafeArea = 0,
): boolean {
  const usableWidth = Math.max(0, viewportWidth - horizontalSafeArea)

  return (
    usableWidth >= SHORT_LANDSCAPE_MIN_WIDTH &&
    viewportWidth <= MOBILE_BREAKPOINT &&
    viewportHeight <= SHORT_LANDSCAPE_MAX_HEIGHT &&
    viewportWidth > viewportHeight
  )
}

export function measureHorizontalSafeArea(documentRef: Document): number {
  if (documentRef.body === null || documentRef.defaultView === null) return 0

  const probe = documentRef.createElement('div')
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText = [
    'position:fixed',
    'visibility:hidden',
    'pointer-events:none',
    'padding-left:env(safe-area-inset-left, 0px)',
    'padding-right:env(safe-area-inset-right, 0px)',
  ].join(';')
  documentRef.body.appendChild(probe)

  const styles = documentRef.defaultView.getComputedStyle(probe)
  const left = Number.parseFloat(styles.paddingLeft) || 0
  const right = Number.parseFloat(styles.paddingRight) || 0
  probe.remove()

  return left + right
}

export function getMissionPanelWidthBounds(
  viewportWidth: number,
  viewportHeight: number,
  horizontalSafeArea = 0,
): MissionPanelWidthBounds {
  const usableWidth = Math.max(0, viewportWidth - horizontalSafeArea)
  const shortLandscape = shouldSplitShortLandscape(
    viewportWidth,
    viewportHeight,
    horizontalSafeArea,
  )

  if (shortLandscape) {
    return {
      min: SHORT_LANDSCAPE_PANEL_MIN_WIDTH,
      max: Math.max(
        SHORT_LANDSCAPE_PANEL_MIN_WIDTH,
        Math.min(
          SHORT_LANDSCAPE_PANEL_MAX_WIDTH,
          usableWidth -
            SHORT_LANDSCAPE_WORKSPACE_FIXED_WIDTH -
            SHORT_LANDSCAPE_TERMINAL_MIN_WIDTH,
        ),
      ),
    }
  }

  return {
    min: PANEL_MIN_WIDTH,
    max: Math.max(
      PANEL_MIN_WIDTH,
      Math.min(
        PANEL_MAX_WIDTH,
        usableWidth - DESKTOP_WORKSPACE_FIXED_WIDTH - DESKTOP_TERMINAL_MIN_WIDTH,
      ),
    ),
  }
}
