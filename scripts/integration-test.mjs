/**
 * 端到端集成测试：在 Node 中无头启动真实虚拟机（v86 + 自构建内核 + initramfs），
 * 通过串口驱动全部 10 个关卡，验证：
 *   - Linux 能启动、自动登录 guest、显示欢迎信息
 *   - @@HASHTEAM: 协议消息正确发出
 *   - 正确答案通过、错误答案失败
 *   - 第 8 关后门进程（端口 31337）可见并可 kill
 *   - 第 9 关本地 HTTP 服务可通过虚拟机内 curl 访问
 *   - 第 10 关按配置文件最终状态判题；reset-level 能还原环境
 *
 * 运行：node scripts/integration-test.mjs
 */
import { createHash, createHmac } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const { V86 } = await import('v86')

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// 评分协议签名（version 2）：init 每次启动随机生成会话密钥并随 ready 下发；
// htcheck 用 HMAC-SHA256 给通过结果与关卡切换签名。本测试捕获密钥并验签。
let sessionKeyB64 = ''
const answerHash = (answer) =>
  createHash('sha256').update(`hashteam-lab answer v1 level-1:${answer}`).digest('hex')

// Node 端 libv86 使用 fs 直接读取所有资源路径

const decoder = new TextDecoder('utf-8')
const controlDecoder = new TextDecoder('utf-8')
const ANSI_SGR = String.raw`(?:\x1b\[[0-9;]*m)*`
const GUEST_PROMPT = new RegExp(`guest@hashteam${ANSI_SGR}:${ANSI_SGR}`)
let buffer = ''
let cursor = 0
let controlBuffer = ''
let controlCursor = 0

const emulator = new V86({
  // Node 端：wasm 走文件系统读取，镜像走 fetch（本地静态服务）
  wasm_path: path.join(root, 'node_modules/v86/build/v86.wasm'),
  memory_size: 128 * 1024 * 1024,
  vga_memory_size: 2 * 1024 * 1024,
  screen_dummy: true,
  bios: { url: path.join(root, 'public/v86/bios/seabios-256k.bin') },
  bzimage: { url: path.join(root, 'public/vm/bzImage') },
  initrd: { url: path.join(root, 'public/vm/rootfs.cpio.gz') },
  cmdline: 'console=ttyS0,115200n8 quiet loglevel=3 lsm=yama',
  uart1: true,
  autostart: true,
})

emulator.add_listener('serial0-output-byte', (byte) => {
  buffer += decoder.decode(new Uint8Array([byte]), { stream: true })
})

emulator.add_listener('serial1-output-byte', (byte) => {
  controlBuffer += controlDecoder.decode(new Uint8Array([byte]), { stream: true })
})

function send(line) {
  emulator.serial0_send(line.endsWith('\n') ? line : `${line}\n`)
}

function goToLevel(level) {
  send(`cd "$HOME" && hashteamctl goto ${level}`)
}
function goToLab(labId) {
  send(`cd "$HOME" && hashteamctl goto-lab ${labId}`)
}

function waitFor(re, timeout = 30000, label = String(re)) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const timer = setInterval(() => {
      const slice = buffer.slice(cursor)
      const match = slice.match(re)
      if (match !== null) {
        cursor += match.index + match[0].length
        clearInterval(timer)
        resolve(match)
      } else if (Date.now() - started > timeout) {
        clearInterval(timer)
        reject(new Error(`超时等待 ${label}\n—— 最近输出 ——\n${buffer.slice(-1000)}`))
      }
    }, 50)
  })
}

function assertProtocolSignature(actual, message, label) {
  const expected = createHmac('sha256', Buffer.from(sessionKeyB64, 'base64'))
    .update(message, 'utf8')
    .digest('hex')
  if (actual !== expected) {
    throw new Error(`${label} 签名不符：${actual} != ${expected}`)
  }
}

function waitForControl(re, timeout = 5000, label = String(re)) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const timer = setInterval(() => {
      const slice = controlBuffer.slice(controlCursor)
      const match = slice.match(re)
      if (match !== null) {
        controlCursor += match.index + match[0].length
        clearInterval(timer)
        resolve(match)
      } else if (Date.now() - started > timeout) {
        clearInterval(timer)
        reject(new Error(`超时等待 UART1 ${label}\n-- 最近控制输出 --\n${controlBuffer.slice(-500)}`))
      }
    }, 25)
  })
}

function sendTerminalSize(cols, rows) {
  emulator.serial_send_bytes(1, new TextEncoder().encode(`PwnHubSize;${cols};${rows}\n`))
}

const results = []
async function step(name, fn) {
  try {
    await fn()
    results.push(['✓', name])
    console.log(`✓ ${name}`)
  } catch (error) {
    results.push(['✗', name])
    console.error(`✗ ${name}\n${error.message}`)
    throw error
  }
}

async function main() {
  // autostart: v86 在 wasm 初始化完成后自行启动

  await step('Linux 启动并自动登录 guest（欢迎信息 + ready 协议）', async () => {
    await waitFor(/HASHTEAM Security Lab/, 60000, '欢迎信息')
    const ready = await waitFor(
      /@@HASHTEAM:\{"type":"ready","version":2,"key":"([A-Za-z0-9+/]{43}=)"\}/,
      5000,
      '带会话密钥的 ready 协议',
    )
    sessionKeyB64 = ready[1]
  })

  await step('进入第 1 关（签名的 level-ready 协议）', async () => {
    goToLevel(1)
    await waitFor(/@@HASHTEAM:\{"type":"level-ready","level":1,"sig":"[0-9a-f]{64}"\}/)
  })

  await step('UART1 尺寸通道更新 ttyS0，且不污染终端命令流', async () => {
    await waitForControl(/PwnHubSizeReady\r?\n/, 10000, 'PwnHubSizeReady')
    sendTerminalSize(132, 43)
    send("stty size && printf '\\nWINSIZE_OK\\n'")
    await waitFor(/\r?\n43 132\r?\n/)
    await waitFor(/WINSIZE_OK/)
  })

  await step('基本命令可用：whoami / pwd / ls / cat', async () => {
    send('whoami && pwd')
    await waitFor(
      /guest\r?\n@@HASHTEAM:\{"type":"telemetry-command","command":"whoami"\}\r?\n\/home\/guest/,
    )
    send('cat README')
    await waitFor(/first-light/)
  })

  await step('基础文件操作：touch 可创建文件且不会清空已有内容', async () => {
    send("rm -f touch-probe && touch touch-probe && test -f touch-probe && printf '\\nTOUCH_CREATE_OK\\n'")
    await waitFor(/\r?\nTOUCH_CREATE_OK\r?\n/)
    send("printf 'preserved' > touch-probe && touch touch-probe && cat touch-probe && printf '\\nTOUCH_PRESERVE_OK\\n'")
    await waitFor(
      /preserved@@HASHTEAM:\{"type":"telemetry-command","command":"cat"\}\r?\n\r?\nTOUCH_PRESERVE_OK\r?\n/,
    )
  })

  await step('VM 内核运行版本与发布锁定值一致（Linux 6.12.98）', async () => {
    send('uname -r')
    await waitFor(/6\.12\.98/)
    send("zcat /proc/config.gz | grep -q '^CONFIG_COMPAT_32BIT_TIME=y$' && printf '\\nTIME32_COMPAT_OK\\n'")
    await waitFor(/\r?\nTIME32_COMPAT_OK\r?\n/)
  })

  await step('SUID 边界：仅 su 与 htcheck，错误密码不能改变 guest 身份', async () => {
    send("stat -c 'SUID=%a:%u:%g' /bin/busybox-suid")
    await waitFor(/SUID=4755:0:0/)
    send("stat -c 'HTCHECK=%a:%u:%g' /usr/local/bin/htcheck")
    await waitFor(/HTCHECK=4755:0:0/)
    send("find / -perm -4000 2>/dev/null | sort | tr '\\n' ' '")
    await waitFor(/\/bin\/busybox-suid \/usr\/local\/bin\/htcheck/)
    send('/bin/busybox-suid --help')
    await waitFor(/Usage: su /)

    // /etc/profile 的别名必须覆盖主 BusyBox ash 的内建 applet。不能只验证
    // 出现提示：还要证明错误密码失败，并且进程仍是普通 guest。
    send('su -c id')
    await waitFor(/Password:/)
    emulator.serial0_send('definitely-wrong\n')
    await waitFor(/su: incorrect password/)
    await waitFor(GUEST_PROMPT, 30000, 'guest 提示符')
    send('id')
    await waitFor(/uid=1000\(guest\) gid=1000\(guest\)/)
  })

  await step('第 1 关：错误答案失败', async () => {
    send('check wrong-token')
    await waitFor(/✗ 通行证不对/)
    await waitFor(/@@HASHTEAM:\{"type":"error"/)
  })

  await step('SUID 评分路径忽略恶意环境覆盖并以 guest 写入状态', async () => {
    // 伪造答案目录：旧实现固定了 check.sh 路径，却把该变量继续传给脚本，
    // 导致任意答案都能匹配攻击者自建的 answer.sha256。
    send(
      `mkdir -p /tmp/fake-levels/level-1 && printf '%s\n' '${answerHash('wrong-token')}' > /tmp/fake-levels/level-1/answer.sha256 && HASHTEAM_LEVELS_DIR=/tmp/fake-levels check wrong-token`,
    )
    await waitFor(/✗ 通行证不对/)
    await waitFor(/@@HASHTEAM:\{"type":"error"/)

    // PATH 劫持：伪造 sha256sum 永远吐出正确答案哈希；生产 SUID 路径必须用固定 PATH。
    send(
      `mkdir -p /tmp/fake-bin && printf '#!/bin/sh\\nprintf "%s  -\\\\n" "${answerHash('first-light')}"\\n' > /tmp/fake-bin/sha256sum && chmod +x /tmp/fake-bin/sha256sum && PATH=/tmp/fake-bin:$PATH check wrong-token`,
    )
    await waitFor(/✗ 通行证不对/)
    await waitFor(/@@HASHTEAM:\{"type":"error"/)

    // HOME + 符号链接：旧实现会以 root 跟随到 /etc/hashteam/write-probe。
    send(
      "mkdir -p /tmp/evil-home/.hashteam && cp README /tmp/evil-home/README && printf '1\\n' > /tmp/evil-home/.hashteam/level && ln -sf /etc/hashteam/write-probe /tmp/evil-home/.hashteam/max-completed && HOME=/tmp/evil-home check first-light",
    )
    await waitFor(/"level-result","level":1,"status":"passed"/)
    send(
      "test ! -e /etc/hashteam/write-probe && stat -c 'STATE_OWNER=%u:%g' /home/guest/.hashteam/max-completed",
    )
    await waitFor(/STATE_OWNER=1000:1000/)
  })

  await step('第 1 关：正确答案通过（签名可验）', async () => {
    send('check first-light')
    const passed = await waitFor(
      /@@HASHTEAM:\{"type":"level-result","level":1,"status":"passed","sig":"([0-9a-f]{64})"\}/,
    )
    const expected = createHmac('sha256', Buffer.from(sessionKeyB64, 'base64'))
      .update('level-result:1:passed', 'utf8')
      .digest('hex')
    if (passed[1] !== expected) {
      throw new Error(`level-result 签名不符：${passed[1]} != ${expected}`)
    }
  })

  await step('辅助命令：status / help / hint', async () => {
    send('status')
    await waitFor(/当前关卡：第 1 关/)
    send('help')
    await waitFor(/HASHTEAM 零基础命令备忘/)
    send('hint')
    await waitFor(/@@HASHTEAM:\{"type":"hint-request","level":1\}/)
  })
  await step('PwnHub 首个实验可独立进入并按稳定 labId 验签', async () => {
    goToLab('num-bases-01')
    await waitFor(/第 1 关 · 三种写法，同一个数/, 20000, '终端横幅序号与头部一致')
    const ready = await waitFor(
      /@@HASHTEAM:\{"type":"lab-ready","labId":"num-bases-01","sig":"([0-9a-f]{64})"\}/,
    )
    const expectedReady = createHmac('sha256', Buffer.from(sessionKeyB64, 'base64'))
      .update('lab-ready:num-bases-01', 'utf8')
      .digest('hex')
    if (ready[1] !== expectedReady) {
      throw new Error(`lab-ready 签名不符：${ready[1]} != ${expectedReady}`)
    }

    goToLab('num-wrap-01')
    await waitFor(/这个实验尚未解锁，请先完成前置实验/)

    send(
      "mkdir -p /tmp/fake-labs/num-bases-01 && " +
      "printf '#!/bin/sh\\nexit 0\\n' > /tmp/fake-labs/num-bases-01/check.sh && " +
      "chmod +x /tmp/fake-labs/num-bases-01/check.sh && " +
      'PWNHUB_LABS_DIR=/tmp/fake-labs check wrong',
    )
    await waitFor(
      /@@HASHTEAM:\{"type":"error","message":"lab num-bases-01 check failed"\}/,
    )

    send('check 0xca 42')
    const passed = await waitFor(
      /@@HASHTEAM:\{"type":"lab-result","labId":"num-bases-01","status":"passed","sig":"([0-9a-f]{64})"\}/,
    )
    const expectedPassed = createHmac('sha256', Buffer.from(sessionKeyB64, 'base64'))
      .update('lab-result:num-bases-01:passed', 'utf8')
      .digest('hex')
    if (passed[1] !== expectedPassed) {
      throw new Error(`lab-result 签名不符：${passed[1]} != ${expectedPassed}`)
    }
  })

  await step('num-wrap-01：8 位计数器装满之后回绕', async () => {
    goToLab('num-wrap-01')
    await waitFor(/第 2 关 · 8 位计数器装满之后/, 20000, '进制实验横幅序号与头部一致')
    const ready = await waitFor(
      /@@HASHTEAM:\{"type":"lab-ready","labId":"num-wrap-01","sig":"([0-9a-f]{64})"\}/,
    )
    const expectedReady = createHmac('sha256', Buffer.from(sessionKeyB64, 'base64'))
      .update('lab-ready:num-wrap-01', 'utf8')
      .digest('hex')
    if (ready[1] !== expectedReady) {
      throw new Error(`lab-ready 签名不符：${ready[1]} != ${expectedReady}`)
    }

    send('check 0 44')
    const passed = await waitFor(
      /@@HASHTEAM:\{"type":"lab-result","labId":"num-wrap-01","status":"passed","sig":"([0-9a-f]{64})"\}/,
    )
    const expectedPassed = createHmac('sha256', Buffer.from(sessionKeyB64, 'base64'))
      .update('lab-result:num-wrap-01:passed', 'utf8')
      .digest('hex')
    if (passed[1] !== expectedPassed) {
      throw new Error(`lab-result 签名不符：${passed[1]} != ${expectedPassed}`)
    }
  })
  await step('VM 内置 python 解释器冒烟(教学工具)', async () => {
    send('python -c "print(\'py\', hex(255+1), 0x2a*2)"')
    await waitFor(/py 0x100 84/, 20000, 'python 进制与算术输出')
    send('python -c "import struct,hashlib;print(struct.pack(\'<I\',0x2a).hex(), hashlib.sha256(b\'ht\').digest().hex()[:8])"')
    await waitFor(/2a000000 712dd58e/, 20000, 'struct 小端打包与 sha256 输出')
    send('python')
    await waitFor(/Type "help\(\)" for more information\./, 20000, 'python REPL 横幅')
    send('exit()')
    send('echo repl-exited-ok')
    await waitFor(/repl-exited-ok/, 20000, 'exit() 退出 REPL 回到 shell')
  })

  await step('第 2 关：隐藏文件', async () => {
    goToLevel(2)
    await waitFor(/"level-ready","level":2,"sig":"[0-9a-f]{64}"\}/)
    send('ls -la')
    await waitFor(/\.message/)
    send('file .message')
    await waitFor(/\.message: .*text/)
    send('check dotfile-42')
    await waitFor(/"level-result","level":2,"status":"passed"/)
  })

  await step('第 3 关：进入 inbox 搬家与整理', async () => {
    goToLevel(3)
    await waitFor(/"level-ready","level":3,"sig":"[0-9a-f]{64}"\}/)
    send('cd inbox && pwd && ls')
    await waitFor(/\/home\/guest\/inbox/)
    await waitFor(/app\.log/)
    send('check')
    await waitFor(/还有 \d+ 处没归置好/)
    send('mkdir -p logs scripts secrets')
    send('mv app.log logs/ && mv backup.sh deploy.sh scripts/ && mv api.key secrets/')
    send('check')
    await waitFor(/"level-result","level":3,"status":"passed"/)
  })

  await step('第 4 关：过宽的权限', async () => {
    goToLevel(4)
    await waitFor(/"level-ready","level":4,"sig":"[0-9a-f]{64}"\}/)
    send('stat -c %a deploy.sh')
    await waitFor(/777/)
    send('check')
    await waitFor(/还有 2 处权限不符合用途/)
    send('chmod 700 deploy.sh')
    send('check')
    await waitFor(/还有 1 处权限不符合用途/)
    send('chmod 600 secret.txt')
    send('check')
    await waitFor(/"level-result","level":4,"status":"passed"/)
  })

  await step('第 5 关：读懂日志', async () => {
    goToLevel(5)
    await waitFor(/"level-ready","level":5,"sig":"[0-9a-f]{64}"\}/)
    send("grep 'Failed password' auth.log | wc -l")
    await waitFor(/30/)
    send('check 29')
    await waitFor(/✗ 次数不对/)
    send('check 30')
    await waitFor(/"level-result","level":5,"status":"passed"/)
  })

  await step('第 6 关：日志分析定位最高频来源', async () => {
    goToLevel(6)
    await waitFor(/"level-ready","level":6,"sig":"[0-9a-f]{64}"\}/)
    send("grep 'Failed password' auth.log | awk '{print $11}' | sort | uniq -c | sort -nr | head")
    await waitFor(/17 203\.0\.113\.66/)
    send('check 198.51.100.23')
    await waitFor(/✗ 198\.51\.100\.23 不是失败次数最多的 IP/)
    send('check 203.0.113.66')
    await waitFor(/"level-result","level":6,"status":"passed"/)
  })

  await step('第 7 关：编码与二进制取证', async () => {
    goToLevel(7)
    await waitFor(/"level-ready","level":7,"sig":"[0-9a-f]{64}"\}/)
    send('base64 -d message.b64')
    await waitFor(/nebula/)
    send('strings secret.bin')
    await waitFor(/comet-7/)
    send('check nebula-comet-7')
    await waitFor(/"level-result","level":7,"status":"passed"/)
  })

  await step('第 8 关：多出来的进程（端口 31337）', async () => {
    goToLevel(8)
    await waitFor(/"level-ready","level":8,"sig":"[0-9a-f]{64}"\}/)
    const netstatOutputStart = buffer.length
    send('netstat -tln')
    await waitFor(/:31337 /)
    await waitFor(GUEST_PROMPT, 30000, 'netstat 完成后的 guest 提示符')
    const netstatOutput = buffer.slice(netstatOutputStart)
    if (netstatOutput.includes('/proc/net/tcp6')) {
      throw new Error(`netstat 泄漏了缺失 IPv6 proc 文件的警告：\n${netstatOutput}`)
    }
    send('check 31337')
    await waitFor(/还在运行/)
    send('kill $(cat .backdoor/backdoor.pid)')
    send('check 31337')
    await waitFor(/"level-result","level":8,"status":"passed"/)
  })

  await step('第 9 关：本地 Web 服务（curl 访问 127.0.0.1:8080）', async () => {
    goToLevel(9)
    await waitFor(/"level-ready","level":9,"sig":"[0-9a-f]{64}"\}/)
    send('curl http://127.0.0.1:8080/')
    await waitFor(/HASHTEAM 内部系统/)
    send('curl http://127.0.0.1:8080/robots.txt')
    await waitFor(/Disallow: \/backup\.txt/)
    send('curl http://127.0.0.1:8080/backup.txt')
    await waitFor(/dbg-token-8848/)
    send('check dbg-token-8848')
    await waitFor(/"level-result","level":9,"status":"passed"/)
  })

  await step('第 10 关：综合配置、权限与运行状态判题', async () => {
    goToLevel(10)
    await waitFor(/"level-ready","level":10,"sig":"[0-9a-f]{64}"\}/)
    send('check')
    await waitFor(/还有 7 项检查/)
    send("sed -i 's/debug=true/debug=false/' server.conf")
    send("sed -i 's/allow_guest=true/allow_guest=false/' server.conf")
    send("sed -i 's/listen=0.0.0.0/listen=127.0.0.1/' server.conf")
    send('chmod 600 server.conf')
    send('kill $(cat .hashteam/level-10-httpd.pid)')
    send('httpd -p 127.0.0.1:9090 -h "$HOME/www"')
    await waitFor(/guest@hashteam/)
    send('check')
    await waitFor(/"level-result","level":10,"status":"passed"/)
  })

  await step('reset-level 还原当前关卡环境', async () => {
    send('reset-level')
    await waitFor(/"level-ready","level":10,"sig":"[0-9a-f]{64}"\}/)
    send('cat server.conf')
    await waitFor(/debug=true/)
  })

  await step('debugger 信任边界：官方工具与目标只读，动态签名入口不能直调', async () => {
    send("stat -c 'DEBUGGER=%a:%u:%g' /usr/local/bin/debugger")
    await waitFor(/DEBUGGER=755:0:0/)
    send("sha256sum /usr/local/bin/debugger | cut -d ' ' -f 1")
    await waitFor(/4a28618efb50830a34274d6daeb32cb578f52d79e02e9c6289d3ba5f406809bf/)
    send("stat -c 'DEBUG_TARGET=%a:%u:%g' /opt/pwnhub/labs/asm-call-stack-01/asm-call-stack")
    await waitFor(/DEBUG_TARGET=755:0:0/)
    send('test ! -r /etc/hashteam/protocol.key && test ! -e ./asm-call-stack.disasm && printf "\\nDEBUGGER_BOUNDARY_OK\\n"')
    await waitFor(/DEBUGGER_BOUNDARY_OK/)
    send("htcheck debugger-reset >/dev/null 2>&1; printf 'DIRECT_DEBUGGER_RESET_RC=%s\\n' \"$?\"")
    await waitFor(/DIRECT_DEBUGGER_RESET_RC=2/)
    send("htcheck debugger-complete >/dev/null 2>&1; printf 'DIRECT_DEBUGGER_COMPLETE_RC=%s\\n' \"$?\"")
    await waitFor(/DIRECT_DEBUGGER_COMPLETE_RC=2/)
  })

  const vulnLabReady = async (labId) => {
    const ready = await waitFor(
      new RegExp(`@@HASHTEAM:\\{"type":"lab-ready","labId":"${labId}","sig":"([0-9a-f]{64})"\\}`),
    )
    assertProtocolSignature(ready[1], `lab-ready:${labId}`, `${labId} lab-ready`)
  }
  const vulnLabPassed = async (labId) => {
    const passed = await waitFor(
      new RegExp(`@@HASHTEAM:\\{"type":"lab-result","labId":"${labId}","status":"passed","sig":"([0-9a-f]{64})"\\}`),
    )
    assertProtocolSignature(passed[1], `lab-result:${labId}:passed`, `${labId} lab-result`)
  }

  await step('vuln-logic vuln-weak-random-01：重放当天口令并通过签名判题', async () => {
    goToLab('vuln-weak-random-01')
    await waitFor(/第 3 关 · 会重播的口令/, 20000, '漏洞实验横幅序号与头部一致')
    await vulnLabReady('vuln-weak-random-01')
    send('status')
    await waitFor(/当前实验：第 3 关 · 会重播的口令/, 20000, 'status 序号与横幅一致')
    send('help current')
    await waitFor(/当前是第 3 关 · 会重播的口令/, 20000, 'help 序号与横幅一致')
    send('./rand-door')
    const today = await waitFor(/今日口令: ([0-9]{6})/)
    send('./rand-door --seed $(($(date +%s)/86400))')
    await waitFor(new RegExp(`种子 [0-9]+ 的口令: ${today[1]}`))
    send(`check ${today[1]}`)
    await vulnLabPassed('vuln-weak-random-01')
  })

  await step('vuln-logic vuln-integer-overflow-01：乘法回绕白拿商品', async () => {
    goToLab('vuln-integer-overflow-01')
    await vulnLabReady('vuln-integer-overflow-01')
    send('printf "1\\n" | ./wallet')
    await waitFor(/余额不足，需要 16777216/)
    send('printf "256\\n" | ./wallet')
    await waitFor(/系统计算: 256 x 16777216 = 0/)
    await waitFor(/PwnHub_integer_wrap/)
    send('check 256 0')
    await vulnLabPassed('vuln-integer-overflow-01')
  })

  await step('vuln-logic vuln-race-condition-01：并发取款突破余额', async () => {
    goToLab('vuln-race-condition-01')
    await vulnLabReady('vuln-race-condition-01')
    send('./bank 800 & ./bank 800 & wait')
    await waitFor(/(取款成功: 800[\s\S]*?){2}/, 30000, 'bank 两次并发取款成功')
    send('check')
    await vulnLabPassed('vuln-race-condition-01')
  })

  const memoryDebuggerLabs = [
    ['memory-addresses-01', 'memory_addresses_checkpoint'],
    ['memory-layout-01', 'layout_checkpoint'],
    ['memory-register-stack-01', 'stack_checkpoint'],
  ]
  for (const [labId, checkpoint] of memoryDebuggerLabs) {
    await step(`debugger ${labId}：实时状态、条件文件与动态 key 闭环`, async () => {
      goToLab(labId)
      if (labId === 'memory-addresses-01') {
        await waitFor(/第 6 关 · 地址、值与指针/, 20000, '内存实验横幅序号与头部一致')
      }
      const ready = await waitFor(
        new RegExp(`@@HASHTEAM:\\{"type":"lab-ready","labId":"${labId}","sig":"([0-9a-f]{64})"\\}`),
      )
      assertProtocolSignature(ready[1], `lab-ready:${labId}`, `${labId} debugger lab-ready`)
      send('debugger')
      await waitFor(/@@HASHTEAM:\{"type":"debugger-state","state":"ready"\}/)
      await waitFor(/dbg>/)
      send('check')
      await waitFor(new RegExp('当前 CPU/内存状态还没有满足本关条件。'))
      send(`until ${checkpoint}`)
      await waitFor(/状态满足，正在使用一次性动态 key 验证实验。/)
      const passed = await waitFor(
        new RegExp(`@@HASHTEAM:\\{"type":"lab-result","labId":"${labId}","status":"passed","sig":"([0-9a-f]{64})"\\}`),
      )
      assertProtocolSignature(passed[1], `lab-result:${labId}:passed`, `${labId} debugger lab-result`)
      await waitFor(/@@HASHTEAM:\{"type":"debugger-state","state":"exited"\}/)
      await waitFor(GUEST_PROMPT, 30000, `${labId} debugger 退出后的 guest 提示符`)
      send(`test ! -e /tmp/.pwnhub-debugger-${labId} && printf '\\nDEBUGGER_TOKEN_CLEAN_${labId}\\n'`)
      await waitFor(new RegExp(`DEBUGGER_TOKEN_CLEAN_${labId}`))
    })
  }

  await step('汇编实验在完成 vuln-format-string-01 前保持锁定', async () => {
    goToLab('asm-registers-01')
    await waitFor(/这个实验尚未解锁，请先完成前置实验/)
  })

  await step('vuln-memory vuln-overwrite-variable-01：超长名字改写相邻标志', async () => {
    goToLab('vuln-overwrite-variable-01')
    await vulnLabReady('vuln-overwrite-variable-01')
    send("printf 'AAAAAAAAAAAAAAAAA\\n' > vuln-overwrite-variable-01/input.txt")
    send('./door < vuln-overwrite-variable-01/input.txt')
    await waitFor(/PwnHub_admin_door_open/)
    send('check')
    await vulnLabPassed('vuln-overwrite-variable-01')
  })

  await step('vuln-memory vuln-string-overflow-01：覆盖返回地址并崩溃', async () => {
    goToLab('vuln-string-overflow-01')
    await vulnLabReady('vuln-string-overflow-01')
    send("printf 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' > vuln-string-overflow-01/payload.bin")
    send('./frame < vuln-string-overflow-01/payload.bin')
    await waitFor(/保存的返回地址现在是: 0x41414141/)
    await waitFor(GUEST_PROMPT, 30000, 'frame 崩溃后的 guest 提示符')
    send('check')
    await vulnLabPassed('vuln-string-overflow-01')
  })

  await step('vuln-memory vuln-format-string-01：%x 从栈上读出秘密', async () => {
    goToLab('vuln-format-string-01')
    await vulnLabReady('vuln-format-string-01')
    send("printf '%s' '%x%x%x%x%x%x%x%x%x%x%x' | ./greeter")
    await waitFor(/0badf00d/)
    send('check 0badf00d')
    await vulnLabPassed('vuln-format-string-01')
  })

  const asmDebuggerLabs = [
    ['asm-registers-01', 'registers_checkpoint'],
    ['asm-arithmetic-01', 'arithmetic_checkpoint'],
    ['asm-stack-ops-01', 'stack_ops_checkpoint'],
    ['asm-branches-01', 'branches_checkpoint'],
    ['asm-call-stack-01', 'call_stack_checkpoint'],
  ]
  for (const [labId, checkpoint] of asmDebuggerLabs) {
    await step(`debugger ${labId}：实时状态、条件文件与动态 key 闭环`, async () => {
      goToLab(labId)
      const ready = await waitFor(
        new RegExp(`@@HASHTEAM:\\{"type":"lab-ready","labId":"${labId}","sig":"([0-9a-f]{64})"\\}`),
      )
      assertProtocolSignature(ready[1], `lab-ready:${labId}`, `${labId} debugger lab-ready`)
      send('debugger')
      await waitFor(/@@HASHTEAM:\{"type":"debugger-state","state":"ready"\}/)
      await waitFor(/dbg>/)
      send('check')
      await waitFor(new RegExp('当前 CPU/内存状态还没有满足本关条件。'))
      send(`until ${checkpoint}`)
      await waitFor(/状态满足，正在使用一次性动态 key 验证实验。/)
      const passed = await waitFor(
        new RegExp(`@@HASHTEAM:\\{"type":"lab-result","labId":"${labId}","status":"passed","sig":"([0-9a-f]{64})"\\}`),
      )
      assertProtocolSignature(passed[1], `lab-result:${labId}:passed`, `${labId} debugger lab-result`)
      await waitFor(/@@HASHTEAM:\{"type":"debugger-state","state":"exited"\}/)
      await waitFor(GUEST_PROMPT, 30000, `${labId} debugger 退出后的 guest 提示符`)
      send(`test ! -e /tmp/.pwnhub-debugger-${labId} && printf '\\nDEBUGGER_TOKEN_CLEAN_${labId}\\n'`)
      await waitFor(new RegExp(`DEBUGGER_TOKEN_CLEAN_${labId}`))
    })
  }

  console.log('\n—— 集成测试结果 ——')
  for (const [mark, name] of results) console.log(`${mark} ${name}`)
  console.log(`\n全部 ${results.length} 项通过`)
  process.exit(0)
}

const watchdog = setTimeout(() => {
  console.error(`\n全局超时。\n—— 最近输出 ——\n${buffer.slice(-1500)}`)
  process.exit(1)
}, 240000)

main().catch((error) => {
  console.error('\n集成测试失败：', error.message)
  clearTimeout(watchdog)
  process.exit(1)
})
