// 构建期由 vite.config.ts 的 define 注入：整组 VM 静态资源的内容哈希。
// 固定文件名资源均以 ?v=<hash> 访问，任一文件变化都会整体切换 URL，
// 从而绕过 immutable 缓存并避免运行时、内核与 rootfs 版本错配。
declare const __VM_ASSET_BASE__: string

// 构建对应的完整 Git source ID；本地源码副本无法识别版本时为 unversioned。
declare const __SOURCE_ID__: string

// 项目根目录 .env 中以 WEBLAB_ 为前缀的变量会经 vite.config.ts 的
// envPrefix 注入 import.meta.env；WEBLAB_HOST 是主页 WebLab 卡片的
// 外链地址，开发模式下 .env 变更会触发 Vite 重启并实时生效。
interface ImportMetaEnv {
  readonly WEBLAB_HOST?: string
}
