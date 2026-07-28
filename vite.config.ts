/// <reference types="vitest/config" />
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'

const VM_ASSETS = {
  libv86: 'v86/libv86.js',
  wasm: 'v86/v86.wasm',
  wasmFallback: 'v86/v86-fallback.wasm',
  bios: 'v86/bios/seabios-256k.bin',
  bzimage: 'vm/bzImage',
  initrd: 'vm/rootfs.cpio.gz',
} as const

const LEGAL_FILES = ['SOURCE_CODE.md', 'THIRD_PARTY_NOTICES.md'] as const

interface VmAssetBundle {
  hash: string
  sources: Map<string, Buffer>
  sha256: Record<string, string>
}

function resolveSourceId(): string {
  const configured = process.env.SOURCE_ID?.trim()
  if (configured !== undefined && configured !== '') {
    if (!/^[a-f0-9]{40}(?:-dirty)?$/.test(configured)) {
      throw new Error('SOURCE_ID 必须是完整的 40 位 Git 提交哈希，可选 -dirty 后缀')
    }
    return configured
  }
  try {
    const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    const status = execFileSync(
      'git',
      ['status', '--porcelain', '--untracked-files=normal'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
    if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('invalid Git commit')
    return status === '' ? commit : `${commit}-dirty`
  } catch {
    // 对应源码归档不携带 .git，但会嵌入由打包脚本生成的不可变 source ID。
    try {
      const archivedSourceId = readFileSync(
        path.resolve(process.cwd(), '.hashteam-source-id'),
        'utf8',
      ).trim()
      if (!/^[a-f0-9]{40}(?:-dirty)?$/.test(archivedSourceId)) {
        throw new Error('invalid archived source ID')
      }
      return archivedSourceId
    } catch {
      // 普通源码副本仍可开发构建；verify:dist 会拒绝这种不可追溯产物。
      return 'unversioned'
    }
  }
}

/** 读取并校验整组 VM 资源。任何缺失都会直接中止测试或生产构建。 */
function loadVmAssets(): VmAssetBundle {
  const groupHash = createHash('sha256')
  const sources = new Map<string, Buffer>()
  const sha256: Record<string, string> = {}

  for (const relativePath of Object.values(VM_ASSETS)) {
    const sourcePath = path.resolve(process.cwd(), 'public', relativePath)
    const source = readFileSync(sourcePath)
    if (source.byteLength === 0) throw new Error(`VM 资源为空：${sourcePath}`)
    sources.set(relativePath, source)
    sha256[relativePath] = createHash('sha256').update(source).digest('hex')
    groupHash.update(relativePath)
    groupHash.update(source)
  }

  const wasm = sources.get(VM_ASSETS.wasm)!
  const fallback = sources.get(VM_ASSETS.wasmFallback)!
  const initrd = sources.get(VM_ASSETS.initrd)!
  if (!wasm.subarray(0, 4).equals(Buffer.from([0x00, 0x61, 0x73, 0x6d]))) {
    throw new Error('v86.wasm 缺少 WebAssembly 文件头')
  }
  if (!fallback.subarray(0, 4).equals(Buffer.from([0x00, 0x61, 0x73, 0x6d]))) {
    throw new Error('v86-fallback.wasm 缺少 WebAssembly 文件头')
  }
  if (!initrd.subarray(0, 2).equals(Buffer.from([0x1f, 0x8b]))) {
    throw new Error('rootfs.cpio.gz 缺少 gzip 文件头')
  }

  return {
    hash: groupHash.digest('hex'),
    sources,
    sha256,
  }
}

/**
 * 生产构建只输出内容寻址的 VM 资源。旧页面仍可按旧 hash 请求共享资产，
 * 避免原子切换后把新内核与旧 rootfs 混在同一个虚拟机里。
 */
function vmAssetsPlugin(bundle: VmAssetBundle, sourceId: string): Plugin {
  return {
    name: 'hashteam-vm-assets',
    apply: 'build',
    buildStart() {
      for (const [relativePath, source] of bundle.sources) {
        this.emitFile({
          type: 'asset',
          fileName: `vm-assets/${bundle.hash}/${relativePath}`,
          source,
        })
      }
      this.emitFile({
        type: 'asset',
        fileName: 'favicon.svg',
        source: readFileSync(path.resolve(process.cwd(), 'public/favicon.svg')),
      })
      for (const legalFile of LEGAL_FILES) {
        const legalSource = readFileSync(
          path.resolve(process.cwd(), legalFile),
          'utf8',
        ).split('{{SOURCE_ID}}').join(sourceId)
        this.emitFile({
          type: 'asset',
          fileName: `legal/${legalFile}`,
          source: legalSource,
        })
      }
      this.emitFile({
        type: 'asset',
        fileName: 'vm-assets.json',
        source: `${JSON.stringify(
          {
            version: 1,
            hash: bundle.hash,
            sourceId,
            base: `vm-assets/${bundle.hash}/`,
            assets: VM_ASSETS,
            sha256: bundle.sha256,
          },
          null,
          2,
        )}\n`,
      })
    },
  }
}

export default defineConfig(({ command }) => {
  const vmBundle = loadVmAssets()
  const sourceId = resolveSourceId()
  const vmAssetBase = command === 'serve' ? '' : `vm-assets/${vmBundle.hash}/`

  return {
    // 使用相对路径，构建产物可部署在任意子目录。
    base: './',
    plugins: [vue(), vmAssetsPlugin(vmBundle, sourceId)],
    define: {
      __VM_ASSET_BASE__: JSON.stringify(vmAssetBase),
    },
    build: {
      target: 'es2020',
      chunkSizeWarningLimit: 1500,
      // public/ 在开发服务器中仍按 Vite 约定提供；生产由上面的插件只输出
      // 审核过的 favicon 与内容寻址 VM 资产，避免遗留固定文件名副本。
      copyPublicDir: false,
    },
    test: {
      include: ['tests/**/*.test.ts'],
      environment: 'node',
    },
  }
})
