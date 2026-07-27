// 构建期由 vite.config.ts 的 define 注入：rootfs.cpio.gz 的内容哈希。
// 用于给 initrd URL 加查询参数做缓存击穿——rootfs 是固定 URL 的不可变资源
// （nginx 30d immutable），改了 VM 脚本后老用户会一直拿到旧镜像；用内容哈希
// 做后缀，内容变则 URL 变，自动绕过缓存；内容不变则哈希不变，缓存仍然有效。
declare const __ROOTFS_HASH__: string
