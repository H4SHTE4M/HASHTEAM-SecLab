import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const colorsScript = resolve('vm/rootfs-overlay/etc/hashteam/colors.sh')
const motd = resolve('vm/rootfs-overlay/etc/hashteam/motd')
const checkCommand = resolve('vm/rootfs-overlay/usr/local/bin/check')
const hashteamctl = resolve('vm/rootfs-overlay/usr/local/bin/hashteamctl')
const temporaryDirectories: string[] = []
const ansiPattern = /\u001b\[[0-9;]*m/g

function shell(command: string, args: string[], forceColor: boolean): string {
  return execFileSync('sh', ['-c', command, 'sh', ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HASHTEAM_FORCE_COLOR: forceColor ? '1' : '0',
    },
  })
}

function renderResult(exitCode: number, output: string, forceColor: boolean): string {
  return shell('. "$1"; ht_render_result "$2" "$3"', [colorsScript, String(exitCode), output], forceColor)
}

function renderMotd(forceColor: boolean): string {
  return shell('. "$1"; ht_render_motd "$2"', [colorsScript, motd], forceColor)
}

function runCheck(exitCode: number, forceColor: boolean) {
  const root = mkdtempSync(join(tmpdir(), 'hashteam-colors-'))
  temporaryDirectories.push(root)
  const home = join(root, 'home')
  const state = join(home, '.hashteam')
  const level = join(root, 'levels', 'level-1')
  mkdirSync(state, { recursive: true })
  mkdirSync(level, { recursive: true })
  writeFileSync(join(state, 'level'), '1\n')
  writeFileSync(
    join(level, 'check.sh'),
    `#!/bin/sh\nprintf '  ✓ 已通过\\n  ✗ 仍需修复\\n'\nexit ${exitCode}\n`,
  )

  return spawnSync('sh', [checkCommand], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: home,
      HASHTEAM_LEVELS_DIR: join(root, 'levels'),
      HASHTEAM_LIB_DIR: resolve('vm/rootfs-overlay/etc/hashteam'),
      HASHTEAM_FORCE_COLOR: forceColor ? '1' : '0',
    },
  })
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('VM terminal semantic colors', () => {
  const mixedResult = [
    '正在复查目录结构 ...',
    '  ✓ logs/app.log',
    '  ✗ secrets/api.key 应存在',
    '还有 1 处没归置好。',
  ].join('\n')

  it('keeps non-interactive result and MOTD output byte-for-byte plain', () => {
    expect(renderResult(1, mixedResult, false)).toBe(`${mixedResult}\n`)
    expect(renderMotd(false)).toBe(readFileSync(motd, 'utf8'))
    expect(
      shell('. "$1"; ht_banner "$2"', [colorsScript, '第 1 关 · 欢迎来到服务器'], false),
    ).toBe(
      '──────────────────────────────────────────────\n' +
        ' 第 1 关 · 欢迎来到服务器\n' +
        '──────────────────────────────────────────────\n',
    )
  })

  it('colors each result line by meaning without changing its text', () => {
    const rendered = renderResult(1, mixedResult, true)

    expect(rendered).toContain('\u001b[1;92m  ✓ logs/app.log\u001b[0m')
    expect(rendered).toContain('\u001b[1;91m  ✗ secrets/api.key 应存在\u001b[0m')
    expect(rendered.replace(ansiPattern, '')).toBe(`${mixedResult}\n`)
  })

  it('never adds ANSI to success or error protocol lines and preserves exit codes', () => {
    const passed = runCheck(0, true)
    expect(passed.status).toBe(0)
    expect(passed.stdout).toContain('\u001b[1;92m  ✓ 已通过\u001b[0m')
    expect(passed.stdout.split('\n').filter((line) => line.startsWith('@@HASHTEAM:'))).toEqual([
      '@@HASHTEAM:{"type":"level-result","level":1,"status":"passed"}',
    ])

    const failed = runCheck(1, true)
    expect(failed.status).toBe(1)
    expect(failed.stdout).toContain('\u001b[1;91m  ✗ 仍需修复\u001b[0m')
    expect(failed.stdout.split('\n').filter((line) => line.startsWith('@@HASHTEAM:'))).toEqual([
      '@@HASHTEAM:{"type":"error","message":"level 1 check failed"}',
    ])
  })

  it('keeps hashteamctl errors on stderr with their original exit code', () => {
    const result = spawnSync('sh', [hashteamctl, 'goto', 'invalid'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        HASHTEAM_LIB_DIR: resolve('vm/rootfs-overlay/etc/hashteam'),
        HASHTEAM_FORCE_COLOR: '1',
      },
    })

    expect(result.status).toBe(2)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain('\u001b[1;91m')
    expect(result.stderr.replace(ansiPattern, '')).toBe('无效的关卡编号: invalid\n')
  })
})
