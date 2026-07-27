// @ts-nocheck — 构建配置文件，用到 node:fs/crypto/path；不随应用代码一起做类型检查
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'

/** 计算 rootfs.cpio.gz 的内容哈希，构建期注入为 __ROOTFS_HASH__。
 *  见 src/vite-env.d.ts 的说明：给 initrd URL 加 ?v=<hash> 做缓存击穿。 */
function rootfsAssetHash(): string {
  try {
    const data = readFileSync(path.resolve(process.cwd(), 'public/vm/rootfs.cpio.gz'))
    return createHash('sha256').update(data).digest('hex').slice(0, 12)
  } catch {
    return 'dev'
  }
}

export default defineConfig({
  // 使用相对路径，构建产物可部署在任意子目录
  base: './',
  plugins: [vue()],
  define: {
    __ROOTFS_HASH__: JSON.stringify(rootfsAssetHash()),
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
