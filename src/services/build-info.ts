const DIRTY_SUFFIX = '-dirty'
const DISPLAY_HASH_LENGTH = 12

export interface BuildInfo {
  sourceId: string
  displayId: string
  versioned: boolean
  dirty: boolean
}

export function createBuildInfo(sourceId: string): BuildInfo {
  if (sourceId === 'unversioned') {
    return {
      sourceId,
      displayId: '本地开发版本',
      versioned: false,
      dirty: false,
    }
  }

  const dirty = sourceId.endsWith(DIRTY_SUFFIX)
  const commit = dirty ? sourceId.slice(0, -DIRTY_SUFFIX.length) : sourceId
  const displayId = `${commit.slice(0, DISPLAY_HASH_LENGTH)}${dirty ? DIRTY_SUFFIX : ''}`

  return {
    sourceId,
    displayId,
    versioned: true,
    dirty,
  }
}

export const BUILD_INFO = createBuildInfo(__SOURCE_ID__)
