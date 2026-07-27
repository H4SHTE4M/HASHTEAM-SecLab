// 构建期由 vite.config.ts 的 define 注入：整组 VM 静态资源的内容哈希。
// 固定文件名资源均以 ?v=<hash> 访问，任一文件变化都会整体切换 URL，
// 从而绕过 immutable 缓存并避免运行时、内核与 rootfs 版本错配。
declare const __VM_ASSETS_HASH__: string
