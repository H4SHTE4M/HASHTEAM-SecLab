import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

function unixPath(path: string): string {
  return path.split('\\').join('/')
}

const resetCommand = unixPath(resolve('vm/rootfs-overlay/usr/local/bin/reset'))
const labsDirectory = unixPath(resolve('vm/labs/pwnhub'))
const libraryDirectory = unixPath(resolve('vm/rootfs-overlay/etc/hashteam'))
const temporaryDirectories: string[] = []

function runReset(labId: string, prepare?: (home: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'pwnhub-reset-'))
  temporaryDirectories.push(root)
  const home = join(root, 'home')
  mkdirSync(join(home, '.hashteam'), { recursive: true })
  writeFileSync(join(home, '.hashteam', 'lab'), `${labId}\n`)
  prepare?.(home)

  const result = spawnSync('sh', [resetCommand], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: unixPath(home),
      PWNHUB_LABS_DIR: labsDirectory,
      HASHTEAM_LIB_DIR: libraryDirectory,
    },
  })
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).not.toContain('@@HASHTEAM:')
  return { home, stdout: result.stdout }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('PwnHub terminal reset command', () => {
  it('第 4 关无持久状态时给出明确的重置结果', () => {
    const { stdout } = runReset('vuln-integer-overflow-01')
    expect(stdout).toContain('钱包样本是无状态只读样本')
  })

  it('第 5 关恢复余额并清空账本', () => {
    const { home } = runReset('vuln-race-condition-01', (homeDirectory) => {
      const stateDirectory = join(homeDirectory, 'vuln-race-condition-01')
      mkdirSync(stateDirectory, { recursive: true })
      writeFileSync(join(stateDirectory, 'balance.txt'), '200\n')
      writeFileSync(join(stateDirectory, 'ledger'), '取出 800 成功\n')
    })
    const stateDirectory = join(home, 'vuln-race-condition-01')
    expect(readFileSync(join(stateDirectory, 'balance.txt'), 'utf8')).toBe('1000\n')
    expect(readFileSync(join(stateDirectory, 'ledger'), 'utf8')).toBe('')
  })

  it.each([
    ['第 9 关', 'vuln-overwrite-variable-01', 'input.txt'],
    ['第 10 关', 'vuln-string-overflow-01', 'payload.bin'],
  ])('%s 删除旧 payload 并重建空状态目录', (_, labId, payloadName) => {
    const { home } = runReset(labId, (homeDirectory) => {
      const stateDirectory = join(homeDirectory, labId)
      mkdirSync(stateDirectory, { recursive: true })
      writeFileSync(join(stateDirectory, payloadName), 'stale payload')
    })
    const stateDirectory = join(home, labId)
    expect(() => readFileSync(join(stateDirectory, payloadName))).toThrow()
    expect(readFileSync(join(home, '.hashteam', 'lab'), 'utf8')).toBe(`${labId}\n`)
  })
})
