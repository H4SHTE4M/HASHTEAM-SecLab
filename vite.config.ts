/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'

const VM_ASSET_PATHS = [
  'public/v86/libv86.js',
  'public/v86/v86.wasm',
  'public/v86/v86-fallback.wasm',
  'public/v86/bios/seabios-256k.bin',
  'public/vm/bzImage',
  'public/vm/rootfs.cpio.gz',
] as const

/** 计算整组 VM 资源的内容哈希，避免固定 URL 的 immutable 缓存造成版本错配。 */
function vmAssetsHash(): string {
  try {
    const hash = createHash('sha256')
    for (const assetPath of VM_ASSET_PATHS) {
      hash.update(assetPath)
      hash.update(readFileSync(path.resolve(process.cwd(), assetPath)))
    }
    return hash.digest('hex').slice(0, 12)
  } catch {
    return 'dev'
  }
}

export default defineConfig({
  // 使用相对路径，构建产物可部署在任意子目录
  base: './',
  plugins: [vue()],
  define: {
    __VM_ASSETS_HASH__: JSON.stringify(vmAssetsHash()),
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
