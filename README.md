# HASHTEAM Security Lab · 安全新手村

一个**完全运行在浏览器里**的交互式 Linux 安全入门实验平台，面向零基础新生：
打开网页就能获得一个真实的 Linux 终端，跟着任务卡完成 6 个精心设计的
安全入门实验——从认识 Shell，到日志分析、编码还原、Web 信息泄露和配置修复。

整个环境基于 WebAssembly 在本地虚拟化运行，**不依赖任何后端容器**；
刷新页面或点击「重新开始」即可恢复原样。

---

## 1. 项目简介

- 浏览器内启动一个真实（非模拟）的 32 位 Linux：自构建精简内核 + BusyBox 用户态。
- 使用 xterm.js 作为终端，v86（WebAssembly x86 虚拟机）作为运行时。
- 6 个零基础关卡，每关 2–8 分钟：初次登录 / 隐藏文件 / 日志分析 /
  可疑数据 / 本地 Web 服务 / 配置修复。
- 虚拟机内的检查脚本通过串口协议（`@@HASHTEAM:{...}`）与前端通信，
  前端据此更新任务面板、提示系统和进度存档（LocalStorage）。
- 传达的理念：**CTF 是入门手段，不是终点**——结束页展示实验室在
  漏洞挖掘、渗透攻防、安全开发、校园安全运维四个方向的真实工作。

## 2. 架构说明

```text
┌────────────────────────────── 浏览器（纯静态页面）──────────────────────────────┐
│  Vue 3 应用                                                                    │
│  ├─ TopBar / MissionPanel / CompletionPage   （任务文案来自 src/data/levels.ts）│
│  ├─ LabTerminal (xterm.js) ◄── 显示文本                                       │
│  │                              ▲                                            │
│  ├─ useSerialProtocol           │  SerialProtocolParser：按行拆分，           │
│  │     串口字节流 ──────────────┴─► 普通输出 → 终端；@@HASHTEAM 行 → 消息     │
│  ├─ useVirtualMachine / V86Controller（对 v86 API 的唯一封装）                │
│  └─ useLabProgress（LocalStorage 持久化）                                     │
│                                                                               │
│  v86 (WebAssembly)                                                            │
│  └─ 32 位 Linux：定制内核 bzImage + initramfs（BusyBox + 关卡系统）           │
│       ├─ 自动登录 guest@hashteam（cttyhack + su）                             │
│       ├─ /usr/local/bin：check / hint / status / help / reset-level /         │
│       │   hashteamctl / curl(兼容层) / file(简化实现)                          │
│       └─ /opt/hashteam/levels/level-N/{init.sh, check.sh, ...}                │
│            串口输出 @@HASHTEAM:{"type":"level-result","level":3,...}          │
└───────────────────────────────────────────────────────────────────────────────┘
```

关键设计：

- **判题在虚拟机内完成**：每关的 `check.sh` 校验的是*结果状态*（答案、
  日志统计结论、配置文件最终内容），而不是「用户敲过哪条命令」。
- **前端只信协议，不信输入**：关卡完成状态来自 `level-result` 协议消息，
  前端从不通过监听键盘输入判题。
- **无网卡 = 天然断网**：内核不编译任何网卡驱动，v86 也不配置网络设备，
  虚拟机只能访问自己的 `127.0.0.1`。
- **内存环境 = 免快照还原**：rootfs 是 initramfs（内存文件系统），
  整机重启即回到初始状态；「重置本关」通过重跑幂等的关卡初始化脚本实现。

## 3. 为什么选择 v86

- **真正的 x86 虚拟化**：运行的是真实 Linux 内核和真实 ELF 二进制，
  不是用 JavaScript「模拟命令行」——教学体验与真实服务器一致。
- **纯静态托管**：内核、initramfs、BIOS、wasm 都是静态文件，
  任何静态空间（GitHub Pages / 对象存储 / 校园网服务器）都能部署。
- **完全开源**（BSD-2-Clause），可自主托管、可审计、可定制。
- **串口即接口**：串口输入输出天然适合与 xterm.js 对接，
  也方便夹带我们的控制协议。

## 4. 为什么不选择 WebVM/CheerpX 作为主方案

- CheerpX 是**商业闭源**产品，自托管与长期可用性受制于厂商；
  项目要求尽量完整开源、支持自主托管。
- WebVM 基于 CheerpX，同样继承这一限制。
- v86 让我们可以**从源码定制内核**（裁掉网卡、裁掉一切不需要的东西），
  这对一个默认断网、最小攻击面的教学环境非常重要。

## 5. 环境要求

开发环境：

- Node.js ≥ 18（建议 20+）与 pnpm 10
- Python 3（打包 initramfs）
- 仅当需要**重新构建内核**时：gcc、make、flex、bison、bc、xz
  （仅重新打包 initramfs 不需要编译工具链）

运行环境（用户侧）：见「浏览器兼容性」一节，无需安装任何东西。

## 6. 安装和启动

```bash
pnpm install        # 安装依赖
pnpm dev            # 启动开发服务器（默认 http://localhost:5173）
```

仓库已附带预构建的虚拟机资源（`public/vm/`、`public/v86/`），
`pnpm install && pnpm dev` 即可直接体验，无需先构建镜像。

其他命令：

```bash
pnpm test               # 前端单元测试（协议解析、进度持久化）
pnpm test:vm            # Linux 检查脚本测试（需要 busybox，见下）
pnpm test:integration   # 端到端测试：Node 无头启动真实虚拟机通关全部 6 关
pnpm build              # vue-tsc 严格类型检查 + 生产构建（输出 dist/）
./scripts/verify-build.sh  # 一键完成：资源检查 + 全部测试 + 构建
```

`pnpm test:vm` 需要一个 busybox 静态二进制：运行过 `vm/build.sh` 后会自动
使用 `vm/.cache/busybox`；也可以通过 `BUSYBOX=/path/to/busybox` 指定。

## 7. Linux 镜像构建方法

### 实际采用的方案

| 组件 | 来源 | 许可证 | 体积 |
| --- | --- | --- | --- |
| 内核 bzImage | 自构建：kernel.org `linux-6.12.96`，`tinyconfig` + 最小特性集（串口控制台 / initramfs / tmpfs / IPv4 回环 / **无网卡驱动**） | GPLv2 | ≈ 1.3 MB |
| 用户态 busybox | Debian `busybox-static` 1.38.0-3（i386 静态链接） | GPLv2 | ≈ 1.0 MB（打进 initramfs） |
| initramfs | 本项目 `vm/rootfs-overlay/` + busybox，`scripts/pack-initramfs.py` 打包（确定性、显式权限） | 本项目 | ≈ 1.1 MB（gzip） |
| v86 运行时 | npm `v86` 包（libv86.js / v86.wasm） | BSD-2-Clause | ≈ 2.5 MB |
| SeaBIOS | Debian `seabios` 包（bios-256k.bin） | LGPLv3 | 256 KB |

浏览器端总下载量约 **7 MB**（gzip 传输更小），首次启动 ~5–15 秒。
构建命令：

```bash
./vm/build.sh                 # 完整构建（含内核编译，5–15 分钟）
./vm/build.sh --skip-kernel   # 只重打包 initramfs 与拷贝资源（秒级）
```

构建产物提交在 `public/` 下，日常改关卡只需 `--skip-kernel` 重打包。

### 为什么没有使用 env86

调研结论：env86 的官方镜像与部分依赖资源托管在 `k.copy.sh` / GitHub Releases，
而本项目构建环境（以及部分校园网环境）无法稳定访问这些地址；
同时 env86 产出的是通用 Buildroot 镜像，仍然需要二次定制关卡内容。
因此我们采用了**完全等价但更透明**的路线：
`tinyconfig 内核 + Debian busybox-static + 自定义 initramfs`，
每一步都来自可审计的标准源（kernel.org / Debian 仓库），
并且全部脚本化（`vm/build.sh`）。

### 后续替换 / 升级路径

- 想换成 env86/Buildroot：用 env86 构建镜像后，把产出的 bzImage 与
  rootfs 替换到 `public/vm/`，并将 `vm/rootfs-overlay/` 的内容并入其
  rootfs-overlay 即可，前端无需改动。
- 想换 Alpine：下载 alpine-virt ISO 作为 cdrom 启动亦可工作，
  但体积（60MB+）和启动时间都明显更差，不推荐用于本场景。

## 8. 添加新关卡的方法

1. **写关卡文案**：在 `src/data/levels.ts` 的 `LEVELS` 数组中追加一项
   （剧情 / 目标 / 建议命令 / 提示 / 教学目标 / check 用法）。
2. **写关卡脚本**：新建
   `vm/rootfs-overlay/opt/hashteam/levels/level-7/`，包含：
   - `init.sh`：幂等的关卡环境初始化（创建挑战文件、启动服务等），
     每次进入或重置本关都会执行；
   - `check.sh`：验证逻辑。**只检查最终状态**，成功 `exit 0`，
     失败打印人类可读的 ✗ 提示并 `exit 1`；
   - 需要答案时放 `answer` 文件。
3. **重打包**：`./vm/build.sh --skip-kernel`。
4. **补测试**：在 `scripts/test-vm-checks.sh` 与
   `scripts/integration-test.mjs` 中增加对应关卡用例。

判题协议（`passed` / `error` 消息）由 `/usr/local/bin/check` 包装器
自动发出，关卡脚本无需关心协议格式。

## 9. 关卡协议说明

虚拟机通过串口输出机器可识别的控制行，格式为单行 JSON 加固定前缀：

```text
@@HASHTEAM:{"type":"level-result","level":3,"status":"passed"}
```

已定义的消息类型：

| type | 字段 | 含义 |
| --- | --- | --- |
| `ready` | `version` | Linux 启动并完成自动登录，环境就绪 |
| `level-ready` | `level` | 关卡环境初始化完成（进入/重置某关后发出） |
| `level-result` | `level`, `status` | 关卡验证结果（`passed`） |
| `hint-request` | `level` | 用户在终端输入了 `hint`，请求前端显示提示 |
| `progress` | `level`, `value` | （预留）细粒度进度 |
| `error` | `message` | 检查失败等错误信息 |

前端行为（`src/services/protocol-parser.ts`）：

1. 只识别**行首**以 `@@HASHTEAM:` 开头的行；
2. 协议行**不显示**在终端中，普通输出原样显示；
3. 支持半包 / 粘包（按行缓冲），非法 JSON 静默忽略不会导致崩溃；
4. 前端只根据协议消息更新状态，从不监听用户输入判题。

前端 → 虚拟机方向：通过串口输入调用虚拟机内的
`hashteamctl goto N / reset-level / factory-reset` 等命令。

## 10. 静态部署方法

```bash
pnpm build     # 输出 dist/（约 7.4 MB，含全部虚拟机资源）
```

`dist/` 是纯静态目录（构建使用相对路径 `base: './'`），
可直接部署到任意静态托管：GitHub Pages、Nginx、对象存储、校园网静态空间等，
**包括任意子路径**下，无需服务端重写规则。

注意：首次加载会下载约 7MB 资源，建议托管方开启 gzip/br 与长缓存
（`v86.wasm`、`bzImage`、`rootfs.cpio.gz` 内容稳定，适合强缓存）。

## 11. 已知限制

- **性能**：v86 是纯软件虚拟化，重计算任务较慢（教学目标均无影响）。
- **无快照恢复**：MVP 通过「整机重启 + 幂等关卡初始化」实现重置；
  `VirtualMachineController.restoreLevel()` 已预留快照替换点
  （v86 的 `save_state`/`restore_state` 已列入后续规划）。
- **工具差异**：`curl` 是基于 busybox wget 的兼容层（仅支持本实验的基本
  用法），`file` 是简化的魔数识别脚本，没有 `objdump` 和 Python 3
  （控制体积的取舍，见后续规划）。
- **关卡切换依赖串口命令**：若用户正在终端里运行其他程序，
  前端发送的切换命令会进入该程序的输入（边缘情况，重置即可恢复）。
- **移动端**：可以查看任务说明与页面，但终端操作体验针对桌面优化。
- **客户端答案可知**：答案文件就在虚拟机内（如
  `/opt/hashteam/levels/level-1/answer`），认真的同学可以直接翻到——
  这在教学场景是可接受的（见安全说明）。

## 12. 浏览器兼容性

- 推荐：最新版 Chrome / Edge / Firefox（Wasm SIMD 支持最佳，启动最快）。
- Safari 16.4+：可用（自动回退到非 SIMD 的 `v86-fallback.wasm`，速度略慢）。
- 需要开启 WebAssembly；`SharedArrayBuffer` 不可用时会自动降级，不影响使用。
- 屏幕：1366×768 及以上桌面分辨率体验最佳；移动端可正常阅读任务面板。

## 13. 安全说明

- 虚拟机**没有网卡**（内核未编译驱动、v86 未配置网络设备），
  无法主动访问公网；第 5 关的 Web 服务只监听虚拟机内部的 `127.0.0.1`。
- 不连接宿主机 Shell，不提供浏览器到任何服务器的命令执行接口。
- 前端与磁盘镜像中**不包含任何真实密钥**；所有令牌均为教学道具。
- **客户端状态不是安全边界**：关卡逻辑、答案、进度都运行在用户浏览器里，
  可以被分析和修改——这是刻意的教学取舍。
- 本项目用于**教学和纳新体验**，不适合直接作为有奖金或正式排名的比赛系统。
- 所有安全实验仅作用于随网页提供的隔离环境；请勿把其中的思路
  用于任何未经授权的真实系统。

## 14. 后续规划

1. **快照启动**：用 v86 `save_state` 制作「已登录基础快照」，
   页面加载即恢复，消除每次的完整引导（接口已预留）。
2. **每关独立快照**：`restoreLevel()` 切换到快照恢复，实现真正的
   关卡级环境隔离与秒级重置。
3. **更丰富的用户态**：评估加入 Python 3（micropython 或精简 CPython）、
   `objdump`，用于程序分析类新关卡。
4. **关卡扩展**：计划中的方向包括简易端口与服务识别、权限与日志取证、
   安全开发小练习（修复一个有 bug 的脚本）。
5. **资源优化**：Brotli 预压缩静态资源、Service Worker 离线缓存。
6. **无障碍与移动端**：终端缩放、虚拟键盘适配。

---

### 附：目录结构

```text
hashteam-web-lab/
├── README.md
├── package.json
├── vite.config.ts / tsconfig.json
├── public/
│   ├── v86/            # libv86.js / v86.wasm / v86-fallback.wasm / bios/
│   └── vm/             # bzImage / rootfs.cpio.gz（预构建产物）
├── src/
│   ├── main.ts / App.vue
│   ├── components/     # TopBar / LabTerminal / MissionPanel /
│   │                   # LoadingScreen / CompletionPage / AboutModal
│   ├── composables/    # useVirtualMachine / useLabProgress / useSerialProtocol
│   ├── services/       # vm-controller / protocol-parser / progress-store
│   ├── data/levels.ts  # 全部关卡文案与实验室方向
│   ├── types/lab.ts
│   └── styles/global.css
├── tests/              # vitest 单元测试（协议解析、进度持久化）
├── vm/
│   ├── build.sh        # 虚拟机资源构建（内核 + initramfs + v86 资源）
│   └── rootfs-overlay/ # initramfs 内容：init、账号、辅助命令、6 个关卡
└── scripts/
    ├── pack-initramfs.py    # 确定性 cpio 打包（显式权限位）
    ├── test-vm-checks.sh    # Linux 检查脚本测试（30 项断言）
    ├── integration-test.mjs # 端到端：Node 无头启动真实 VM 通关 6 关
    ├── prepare-vm-assets.sh # vm/build.sh 的便捷入口
    └── verify-build.sh      # 一键验证：资源 + 测试 + 构建
```
