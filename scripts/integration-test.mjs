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
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const { V86 } = await import('v86')

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Node 端 libv86 使用 fs 直接读取所有资源路径

const decoder = new TextDecoder('utf-8')
let buffer = ''
let cursor = 0

const emulator = new V86({
  // Node 端：wasm 走文件系统读取，镜像走 fetch（本地静态服务）
  wasm_path: path.join(root, 'node_modules/v86/build/v86.wasm'),
  memory_size: 128 * 1024 * 1024,
  vga_memory_size: 2 * 1024 * 1024,
  screen_dummy: true,
  bios: { url: path.join(root, 'public/v86/bios/seabios-256k.bin') },
  bzimage: { url: path.join(root, 'public/vm/bzImage') },
  initrd: { url: path.join(root, 'public/vm/rootfs.cpio.gz') },
  cmdline: 'console=ttyS0,115200n8 quiet loglevel=3',
  autostart: true,
})

emulator.add_listener('serial0-output-byte', (byte) => {
  buffer += decoder.decode(new Uint8Array([byte]), { stream: true })
})

function send(line) {
  emulator.serial0_send(line.endsWith('\n') ? line : `${line}\n`)
}

function goToLevel(level) {
  send(`cd "$HOME" && hashteamctl goto ${level}`)
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
    await waitFor(/@@HASHTEAM:\{"type":"ready"/, 5000, 'ready 协议')
  })

  await step('进入第 1 关（level-ready 协议）', async () => {
    goToLevel(1)
    await waitFor(/@@HASHTEAM:\{"type":"level-ready","level":1\}/)
  })

  await step('基本命令可用：whoami / pwd / ls / cat', async () => {
    send('whoami && pwd')
    await waitFor(/guest\r?\n\/home\/guest/)
    send('cat README')
    await waitFor(/first-light/)
  })

  await step('第 1 关：错误答案失败', async () => {
    send('check wrong-token')
    await waitFor(/✗ 通行证不对/)
    await waitFor(/@@HASHTEAM:\{"type":"error"/)
  })

  await step('第 1 关：正确答案通过', async () => {
    send('check first-light')
    await waitFor(/@@HASHTEAM:\{"type":"level-result","level":1,"status":"passed"\}/)
  })

  await step('辅助命令：status / help / hint', async () => {
    send('status')
    await waitFor(/当前关卡：第 1 关/)
    send('help')
    await waitFor(/实验辅助命令/)
    send('hint')
    await waitFor(/@@HASHTEAM:\{"type":"hint-request","level":1\}/)
  })

  await step('第 2 关：隐藏文件', async () => {
    goToLevel(2)
    await waitFor(/"level-ready","level":2\}/)
    send('ls -la')
    await waitFor(/\.message/)
    send('file .message')
    await waitFor(/\.message: .*text/)
    send('check dotfile-42')
    await waitFor(/"level-result","level":2,"status":"passed"/)
  })

  await step('第 3 关：进入 inbox 搬家与整理', async () => {
    goToLevel(3)
    await waitFor(/"level-ready","level":3\}/)
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
    await waitFor(/"level-ready","level":4\}/)
    send('stat -c %a deploy.sh')
    await waitFor(/777/)
    send('check')
    await waitFor(/还有 2 处权限过宽/)
    send('chmod 700 deploy.sh')
    send('check')
    await waitFor(/还有 1 处权限过宽/)
    send('chmod 600 secret.txt')
    send('check')
    await waitFor(/"level-result","level":4,"status":"passed"/)
  })

  await step('第 5 关：读懂日志', async () => {
    goToLevel(5)
    await waitFor(/"level-ready","level":5\}/)
    send("grep 'Failed password' auth.log | wc -l")
    await waitFor(/30/)
    send('check 29')
    await waitFor(/✗ 次数不对/)
    send('check 30')
    await waitFor(/"level-result","level":5,"status":"passed"/)
  })

  await step('第 6 关：日志分析找出攻击者', async () => {
    goToLevel(6)
    await waitFor(/"level-ready","level":6\}/)
    send("grep 'Failed password' auth.log | awk '{print $11}' | sort | uniq -c | sort -nr | head")
    await waitFor(/17 203\.0\.113\.66/)
    send('check 198.51.100.23')
    await waitFor(/✗ 198\.51\.100\.23 不是失败次数最多的 IP/)
    send('check 203.0.113.66')
    await waitFor(/"level-result","level":6,"status":"passed"/)
  })

  await step('第 7 关：编码与二进制取证', async () => {
    goToLevel(7)
    await waitFor(/"level-ready","level":7\}/)
    send('base64 -d message.b64')
    await waitFor(/nebula/)
    send('strings secret.bin')
    await waitFor(/comet-7/)
    send('check nebula-comet-7')
    await waitFor(/"level-result","level":7,"status":"passed"/)
  })

  await step('第 8 关：多出来的进程（端口 31337）', async () => {
    goToLevel(8)
    await waitFor(/"level-ready","level":8\}/)
    send('netstat -tln')
    await waitFor(/:31337 /)
    send('check 31337')
    await waitFor(/还在运行/)
    send('kill $(cat .backdoor/backdoor.pid)')
    send('check 31337')
    await waitFor(/"level-result","level":8,"status":"passed"/)
  })

  await step('第 9 关：本地 Web 服务（curl 访问 127.0.0.1:8080）', async () => {
    goToLevel(9)
    await waitFor(/"level-ready","level":9\}/)
    send('curl http://127.0.0.1:8080/')
    await waitFor(/HASHTEAM 内部系统/)
    send('curl http://127.0.0.1:8080/robots.txt')
    await waitFor(/Disallow: \/backup\.txt/)
    send('curl http://127.0.0.1:8080/backup.txt')
    await waitFor(/dbg-token-8848/)
    send('check dbg-token-8848')
    await waitFor(/"level-result","level":9,"status":"passed"/)
  })

  await step('第 10 关：按配置文件最终状态判题', async () => {
    goToLevel(10)
    await waitFor(/"level-ready","level":10\}/)
    send('check')
    await waitFor(/还有 3 处配置不安全/)
    send("sed -i 's/debug=true/debug=false/' server.conf")
    send("sed -i 's/allow_guest=true/allow_guest=false/' server.conf")
    send("sed -i 's/listen=0.0.0.0/listen=127.0.0.1/' server.conf")
    send('check')
    await waitFor(/"level-result","level":10,"status":"passed"/)
  })

  await step('reset-level 还原当前关卡环境', async () => {
    send('reset-level')
    await waitFor(/"level-ready","level":10\}/)
    send('cat server.conf')
    await waitFor(/debug=true/)
  })

  console.log('\n—— 集成测试结果 ——')
  for (const [mark, name] of results) console.log(`${mark} ${name}`)
  console.log(`\n全部 ${results.length} 项通过`)
  emulator.stop()
  process.exit(0)
}

const watchdog = setTimeout(() => {
  console.error(`\n全局超时。\n—— 最近输出 ——\n${buffer.slice(-1500)}`)
  process.exit(1)
}, 120000)

main().catch((error) => {
  console.error('\n集成测试失败：', error.message)
  clearTimeout(watchdog)
  process.exit(1)
})
