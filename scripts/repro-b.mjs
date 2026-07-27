import path from 'node:path'
import { fileURLToPath } from 'node:url'
const { V86 } = await import('v86')
const root = process.cwd()
const decoder = new TextDecoder('utf-8')
let serial = '', n = 0
const emu = new V86({
  wasm_path: path.join(root, 'node_modules/v86/build/v86.wasm'),
  memory_size: 128 * 1024 * 1024, vga_memory_size: 2 * 1024 * 1024, screen_dummy: true,
  bios: { url: path.join(root, 'public/v86/bios/seabios-256k.bin') },
  bzimage: { url: path.join(root, 'public/vm/bzImage') },
  initrd: { url: path.join(root, 'public/vm/rootfs.cpio.gz') },
  cmdline: 'console=ttyS0,115200n8 quiet loglevel=3',
  autostart: true,
})
emu.add_listener('serial0-output-byte', (b) => { n++; serial += decoder.decode(new Uint8Array([b]), { stream: true }) })
emu.add_listener('emulator-ready', () => console.log('emulator-ready'))
emu.add_listener('emulator-started', () => console.log('emulator-started'))
setTimeout(() => {
  console.log(`8s 后：is_running=${emu.is_running()} 字节=${n}`)
  console.log('含 ready 协议?', serial.includes('@@HASHTEAM:{"type":"ready"'))
  console.log('串口(前200):', JSON.stringify(serial.slice(0, 200)))
  process.exit(0)
}, 8000)
