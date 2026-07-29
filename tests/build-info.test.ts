import { describe, expect, it } from 'vitest'
import { createBuildInfo } from '../src/services/build-info'

const SOURCE_ID = '0123456789abcdef0123456789abcdef01234567'

describe('build information', () => {
  it('shows a compact build ID while retaining the complete source ID', () => {
    expect(createBuildInfo(SOURCE_ID)).toEqual({
      sourceId: SOURCE_ID,
      displayId: '0123456789ab',
      versioned: true,
      dirty: false,
    })
  })

  it('preserves the dirty marker in the visible build ID', () => {
    expect(createBuildInfo(`${SOURCE_ID}-dirty`)).toEqual({
      sourceId: `${SOURCE_ID}-dirty`,
      displayId: '0123456789ab-dirty',
      versioned: true,
      dirty: true,
    })
  })

  it('labels source copies without Git metadata as local development builds', () => {
    expect(createBuildInfo('unversioned')).toEqual({
      sourceId: 'unversioned',
      displayId: '本地开发版本',
      versioned: false,
      dirty: false,
    })
  })
})
