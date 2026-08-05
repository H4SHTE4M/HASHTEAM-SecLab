import { execFileSync, spawnSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

const colorsScript = resolve('vm/rootfs-overlay/etc/hashteam/colors.sh')
const motd = resolve('vm/rootfs-overlay/etc/hashteam/motd')
const hashteamctl = resolve('vm/rootfs-overlay/usr/local/bin/hashteamctl')
const htcheckSource = resolve('vm/toolchain-source/htcheck/htcheck.c')
const temporaryDirectories: string[] = []
let buildDirectory: string | null = null
const ESC = ''
const ansiPattern = /\[[0-9;]*m/g
const sessionKey = Buffer.alloc(32, 9)

const gccAvailable = spawnSync('gcc', ['--version']).status === 0
let htcheckBinary: string | null = null

beforeAll(() => {
  if (!gccAvailable) return
  buildDirectory = mkdtempSync(join(tmpdir(), 'hashteam-htcheck-build-'))
  const binary = join(buildDirectory, 'htcheck')
  const build = spawnSync('gcc', ['-O2', '-Wall', '-Werror', '-o', binary, htcheckSource])
  if (build.status !== 0) {
    throw new Error(`htcheck 宿主构建失败:\n${build.stderr}`)
  }
  htcheckBinary = binary
})

function shell(command: string, args: string[], forceColor: boolean): string {
  return execFileSync('sh', ['-c', command, 'sh', ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HASHTEAM_FORCE_COLOR: forceColor ? '1' : '0',
    },
  })
}

function renderMotd(forceColor: boolean): string {
  return shell('. "$1"; ht_render_motd "$2"', [colorsScript, motd], forceColor)
}

interface CheckRun {
  readonly stdout: string
  readonly stderr: string
  readonly status: number | null
  readonly stateDir: string
}

/**
 * 经 htcheck（生产评分路径）运行一关 check：临时关卡脚本输出指定的 ✓/✗ 行。
 * stateDir 用于断言 max-completed 副作用。
 */
function runCheck(scriptBody: string, exitCode: number, forceColor: boolean): CheckRun {
  if (htcheckBinary === null) throw new Error('htcheck 未编译')
  const root = mkdtempSync(join(tmpdir(), 'hashteam-colors-'))
  temporaryDirectories.push(root)
  const home = join(root, 'home')
  const stateDir = join(home, '.hashteam')
  const level = join(root, 'levels', 'level-1')
  mkdirSync(stateDir, { recursive: true })
  mkdirSync(level, { recursive: true })
  writeFileSync(join(stateDir, 'level'), '1\n')
  writeFileSync(join(root, 'key'), sessionKey)
  writeFileSync(join(level, 'check.sh'), `#!/bin/sh\n${scriptBody}\nexit ${exitCode}\n`)

  const result = spawnSync(htcheckBinary, ['run'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: home,
      HASHTEAM_LEVELS_DIR: join(root, 'levels'),
      HASHTEAM_KEY_FILE: join(root, 'key'),
      HASHTEAM_FORCE_COLOR: forceColor ? '1' : '0',
    },
  })
  return { stdout: result.stdout, stderr: result.stderr, status: result.status, stateDir }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

afterAll(() => {
  if (buildDirectory !== null) rmSync(buildDirectory, { recursive: true, force: true })
})

describe('VM terminal semantic colors', () => {
  it('keeps non-interactive MOTD and banner output byte-for-byte plain', () => {
    expect(renderMotd(false)).toBe(readFileSync(motd, 'utf8'))
    expect(
      shell('. "$1"; ht_banner "$2"', [colorsScript, '第 1 关 · 欢迎来到服务器'], false),
    ).toBe(
      '──────────────────────────────────────────────\n' +
        ' 第 1 关 · 欢迎来到服务器\n' +
        '──────────────────────────────────────────────\n',
    )
  })

  it('keeps the classic MOTD frame and colors its border without changing the text', () => {
    const rendered = renderMotd(true)
    const plainMotd = readFileSync(motd, 'utf8')

    expect(plainMotd).toContain('╭─────────────────────────────────────────╮')
    expect(plainMotd).toContain('  HASHTEAM Security Lab  /  安全新手村')
    expect(plainMotd).not.toContain('===========================================')
    expect(rendered).toContain(`${ESC}[36m╭─────────────────────────────────────────╮${ESC}[0m`)
    expect(rendered.replace(ansiPattern, '')).toBe(plainMotd)
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
    expect(result.stderr).toContain(`${ESC}[1;91m`)
    expect(result.stderr.replace(ansiPattern, '')).toBe('无效的关卡编号: invalid\n')
  })
})

describe.skipIf(!gccAvailable)('htcheck signed checker (host build)', () => {
  const mixedResult = [
    '正在复查目录结构 ...',
    '  ✓ logs/app.log',
    '  ✗ secrets/api.key 应存在',
    '还有 1 处没归置好。',
  ].join('\n')
  const mixedScript = `printf '%s\\n' '${mixedResult.split('\n').join("' '")}'`

  it('keeps non-interactive check output byte-for-byte plain', () => {
    const result = runCheck(mixedScript, 1, false)
    expect(result.status).toBe(1)
    expect(result.stdout).not.toMatch(ansiPattern)
    expect(result.stdout).toContain(`${mixedResult}\n`)
  })

  it('colors each result line by meaning without changing its text', () => {
    const result = runCheck(mixedScript, 1, true)
    expect(result.status).toBe(1)

    expect(result.stdout).toContain(`${ESC}[1;92m  ✓ logs/app.log${ESC}[0m`)
    expect(result.stdout).toContain(`${ESC}[1;91m  ✗ secrets/api.key 应存在${ESC}[0m`)
    const plainLines = result.stdout
      .replace(ansiPattern, '')
      .split('\n')
      .filter((line) => !line.startsWith('@@HASHTEAM:') && line !== '')
    expect(plainLines.join('\n')).toBe(mixedResult)
  })

  it('signs passed results and never adds ANSI to protocol lines', () => {
    const passed = runCheck("printf '  ✓ 已通过\\n  ✗ 仍需修复\\n'", 0, true)
    expect(passed.status).toBe(0)
    expect(passed.stdout).toContain(`${ESC}[1;92m  ✓ 已通过${ESC}[0m`)

    const protocolLines = passed.stdout.split('\n').filter((line) => line.startsWith('@@HASHTEAM:'))
    expect(protocolLines).toHaveLength(1)
    expect(protocolLines[0]).not.toMatch(ansiPattern)
    const match =
      /^@@HASHTEAM:\{"type":"level-result","level":1,"status":"passed","sig":"([0-9a-f]{64})"\}$/.exec(
        protocolLines[0],
      )
    expect(match).not.toBeNull()
    // 签名必须真的是「level-result:1:passed」在会话密钥下的 HMAC-SHA256
    const expectedSig = createHmac('sha256', sessionKey)
      .update('level-result:1:passed', 'utf8')
      .digest('hex')
    expect(match![1]).toBe(expectedSig)
  })

  it('emits unsigned error protocol and preserves the failing exit code', () => {
    const failed = runCheck("printf '  ✓ 已通过\\n  ✗ 仍需修复\\n'", 1, true)
    expect(failed.status).toBe(1)
    expect(failed.stdout).toContain(`${ESC}[1;91m  ✗ 仍需修复${ESC}[0m`)
    expect(failed.stdout.split('\n').filter((line) => line.startsWith('@@HASHTEAM:'))).toEqual([
      '@@HASHTEAM:{"type":"error","message":"level 1 check failed"}',
    ])
    expect(failed.stdout).not.toContain('"sig"')
  })

  it('advances max-completed only when the check passes', () => {
    const passed = runCheck("printf '  ✓ 已通过\\n'", 0, false)
    expect(readFileSync(join(passed.stateDir, 'max-completed'), 'utf8')).toBe('1\n')

    const failed = runCheck("printf '  ✗ 仍需修复\\n'", 1, false)
    expect(existsSync(join(failed.stateDir, 'max-completed'))).toBe(false)
  })

  it('rejects tampered state paths instead of running a bogus script', () => {
    if (htcheckBinary === null) throw new Error('htcheck 未编译')
    const root = mkdtempSync(join(tmpdir(), 'hashteam-tamper-'))
    temporaryDirectories.push(root)
    const stateDir = join(root, 'home', '.hashteam')
    mkdirSync(stateDir, { recursive: true })
    mkdirSync(join(root, 'levels', 'level-1'), { recursive: true })
    writeFileSync(join(root, 'levels', 'level-1', 'check.sh'), '#!/bin/sh\nexit 0\n')
    writeFileSync(join(root, 'key'), sessionKey)
    // 学生可写的状态文件被写入路径穿越内容 → 按「无检查脚本」处理而不是拼出穿越路径
    writeFileSync(join(stateDir, 'level'), '../../etc\n')

    const result = spawnSync(htcheckBinary, ['run'], {
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: join(root, 'home'),
        HASHTEAM_LEVELS_DIR: join(root, 'levels'),
        HASHTEAM_KEY_FILE: join(root, 'key'),
      },
    })
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('当前关卡没有检查脚本')
    expect(result.stdout).not.toContain('@@HASHTEAM:')
  })
})
