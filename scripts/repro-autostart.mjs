// 最小复现：autostart:false + 手动 run()，对比 autostart:true
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const { V86 } = await import('v86')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const decoder = new TextDecoder('utf-8')
let serial = ''
let serialByteCount = 0

function make(opts) {
  const emu = new V86({
    wasm_path: path.join(root, 'node_modules/v86/build/v86.wasm'),
    memory_size: 128 * 1024 * 1024,
    vga_memory_size: 2 * 1024 * 1024,
    screen_dummy: true,
    bios: { url: path.join(root, 'public/v86/bios/seabios-256k.bin') },
    bzimage: { url: path.join(root, 'public/vm/bzImage') },
    initrd: { url: path.join(root, 'public/vm/rootfs.cpio.gz') },
    cmdline: 'console=ttyS0,115200n8 quiet loglevel=3',
    ...opts,
  })
  emu.add_listener('serial0-output-byte', (b) => {
    serialByteCount++
    serial += decoder.decode(new Uint8Array([b]), { stream: true })
  })
  emu.add_listener('emulator-ready', () => console.log(`[${opts.label}] emulator-ready`))
  emu.add_listener('emulator-started', () => console.log(`[${opts.label}] emulator-started`))
  emu.add_listener('emulator-stopped', () => console.log(`[${opts.label}] emulator-stopped`))
  emu.add_listener('emulator-loaded', () => console.log(`[${opts.label}] emulator-loaded`))
  return emu
}

console.log('=== 场景 A: autostart:false + 立即 run()（当前浏览器做法）===')
const emuA = make({ label: 'A', autostart: false })
console.log('[A] 构造完成，is_running=', emuA.is_running())
const runPromiseA = emuA.run()
console.log('[A] run() 已调用，返回:', typeof runPromiseA, runPromiseA && typeof runPromiseA.then)
if (runPromiseA && typeof runPromiseA.then === 'function') {
  runPromiseA.then(() => console.log('[A] run() Promise resolved')).catch((e) => console.log('[A] run() Promise REJECTED:', e?.message || e))
}

setTimeout(() => {
  console.log(`[A] 8s 后：is_running=${emuA.is_running()} 串口字节=${serialByteCount}`)
  console.log('[A] 串口内容(前300):', JSON.stringify(serial.slice(0, 300)))
  process.exit(0)
}, 8000)
