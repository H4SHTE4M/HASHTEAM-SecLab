# HASHTEAM Security Lab

一个**完全运行在浏览器里**的交互式安全实验平台。根路径提供 Lab 选择器：
SecLab「安全新手村」包含 10 个 Linux 安全入门关卡；PwnHub 首批开放
数字与进制、逻辑漏洞、内存模型、内存漏洞、汇编与 ELF 六章共 20 个二进制安全实验。
两者共用真实的 32 位 Linux 虚拟机、引导/挑战模式和本地进度存档。

整个环境基于 WebAssembly 在本地虚拟化运行，**不依赖任何后端容器**；
刷新页面或点击「重新开始」即可恢复原样。

---

## 1. 项目简介

- 浏览器内启动一个真实（非模拟）的 32 位 Linux：自构建精简内核 + BusyBox 用户态。
- 使用 xterm.js 作为终端，v86（WebAssembly x86 虚拟机）作为运行时。
- SecLab：10 个零基础关卡，覆盖终端、文件、权限、日志、编码、进程、本地 Web 与配置修复。
- PwnHub：六章 20 个实验按严格串行链解锁——数字与进制 2 个（三种写法、8 位计数器回绕）→ 逻辑漏洞 3 个（弱随机、整数回绕、条件竞争）→ 内存模型 3 个 → 内存漏洞 3 个（越界覆盖、栈溢出、格式化字符串）→ 汇编读写 5 个 → ELF 静态分析 4 个；GDB 动态调试、外部静态逆向与 ret2win / 基础 ROP 等后续章节尚未进入生产课程包。
- 首次进入可明确选择**引导模式**或**挑战模式**：引导模式逐步讲解并要求留下
  教学证据；挑战模式只展示目标、按需提示和最终验证，允许在真实终端自由探索。
  两种模式共用同一套环境与最终状态判题，并可随时无损切换。
- 虚拟机内的检查脚本通过串口协议（`@@HASHTEAM:{...}`）与前端通信，
  前端据此更新任务面板、提示系统和进度存档（LocalStorage）。
- 两个 Lab 都具备模块隔离的阻断异常检测：进度证据损坏、评分密钥缺失或
  WebCrypto 不可用时，当前工作台提供重置/重启、挑战模式出口和 v2 现场日志下载。
- 传达的理念：**CTF 是入门手段，不是终点**——结束页展示实验室在
  漏洞挖掘、渗透攻防、安全开发、校园安全运维四个方向的真实工作。

## 2. 架构说明

```text
┌────────────────────────────── 浏览器（纯静态页面）──────────────────────────────┐
│  Vue 3 应用                                                                    │
│  ├─ TopBar / MissionPanel / CompletionPage   （任务文案来自每关 challenge.json）│
│  ├─ LabTerminal (xterm.js) ◄── 显示文本                                       │
│  │                              ▲                                            │
│  ├─ useSerialProtocol           │  SerialProtocolParser：按行拆分，           │
│  │     串口字节流 ──────────────┴─► 普通输出 → 终端；@@HASHTEAM 行 → 消息     │
│  ├─ useVirtualMachine / V86Controller（对 v86 API 的唯一封装）                │
│  └─ useLabProgress（LocalStorage 持久化）                                     │
│                                                                               │
│  v86 (WebAssembly)                                                            │
│  └─ 32 位 Linux：定制内核 bzImage + 统一 initramfs（BusyBox + 实验系统）     │
│       ├─ 自动登录 guest@hashteam（cttyhack + su）                             │
│       ├─ /usr/local/bin：check / hint / status / help / reset-level /         │
│       │   hashteamctl / readelf / nm / objdump / debugger / payload 教学工具     │
│       ├─ /opt/hashteam/levels/level-N：SecLab 数字关卡                        │
│       └─ /opt/pwnhub/labs/<labId>：PwnHub 稳定实验标识                        │
│            串口输出签名的 level-result 或 lab-result 协议                     │
└───────────────────────────────────────────────────────────────────────────────┘
```

关键设计：

- **判题在虚拟机内完成**：每关的 `check.sh` 校验的是*结果状态*（答案、
  日志统计结论、配置文件最终内容），而不是「用户敲过哪条命令」。
- **前端只信协议，不信输入**：关卡完成状态来自 `level-result` 协议消息，
  前端从不通过监听键盘输入判题。
- **教学路径按模式分流**：引导模式在接受 VM 通过结果前检查全部步骤证据；
  挑战模式直接接受最终环境结果。看过引导后再切回挑战会记录为混合完成。
- **无网卡 = 天然断网**：内核不编译任何网卡驱动，v86 也不配置网络设备，
  虚拟机只能访问自己的 `127.0.0.1`。
- **内存环境 = 免快照还原**：rootfs 是 initramfs（内存文件系统），
  整机重启即回到初始状态；「重置本关」通过重跑幂等的关卡初始化脚本实现。
- **debugger 操作真实进程状态**：内存和汇编八个实验可启动项目自带的静态 i386
  `ptrace` debugger，实时读取寄存器、反汇编、相关内存和映射，并支持单步、继续、断点、
  跳转以及受限的寄存器/内存修改。右侧 GUI 只发送同一组终端命令，不维护第二份模拟状态。

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

- Node.js ≥ 20.19 与 pnpm 10
- Python 3（打包 initramfs）
- 重新构建 VM 资源时：make、curl、tar、gzip、sha256sum、`dpkg-deb`、
  GNU `date`，以及 i386 交叉编译器；
  默认使用 `/opt/32/bin/i686-aosc-linux-gnu-`，也可通过
  `BUSYBOX_CROSS_COMPILE` 指定。已审核的精确 AOSC `gcc+32`、
  `binutils+32`、`glibc+32` 与 `linux+api+32` 版本和编译器文件哈希记录在
  `vm/suid-toolchain.lock`；AOSC 的 `32subsystem` 是该 32 位开发环境的
  官方元包。工具链不匹配时构建会在生成 SUID 二进制前失败，而不是静默更新
  审核哈希
- 仅当需要**重新构建内核**时，额外需要：gcc、flex、bison、bc、xz

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
pnpm test:watch         # Vitest 监听模式，适合本地迭代
pnpm validate:challenges # 校验关卡 manifest、连续编号与必要脚本
pnpm validate:binary-profile # 校验 PwnHub ELF、工具链锁与生产 profile
pnpm test:vm            # Linux 检查脚本测试（需要 busybox，见下）
pnpm test:suid          # 校验 initramfs 中 SUID helper 的权限与 applet 白名单
pnpm test:binary-profile # 重放离线 i386 二进制样本
pnpm test:integration   # 端到端测试：真实 VM 覆盖 SecLab 与首个 PwnHub 实验
pnpm build              # manifest / binary profile / 类型检查 + 生产构建
pnpm verify:dist        # 校验 VM、companion、发布实验下载物与法律声明
./scripts/verify-build.sh  # 一键完成全部 release gate
```

`pnpm test:vm` 需要一个 busybox 静态二进制：运行过 `vm/build.sh` 后会自动
使用 `vm/.cache/busybox`；也可以通过 `BUSYBOX=/path/to/busybox` 指定。

仓库内的 `.github/workflows/ci.yml` 会在 push 与 pull request 时运行单元/
组件测试、Linux 检查脚本、真实 VM 集成测试和生产构建。

## 7. Linux 镜像构建方法

### 实际采用的方案

| 组件 | 来源 | 许可证 | 体积 |
| --- | --- | --- | --- |
| 内核 bzImage | 自构建：kernel.org `linux-6.12.98`，`tinyconfig` + 最小特性集（串口控制台 / initramfs / tmpfs / IPv4 回环 / **无网卡驱动**） | GPLv2 | ≈ 1.3 MB |
| 用户态 busybox | Debian `busybox-static` 1.38.0-3（i386，静态链接 Debian glibc 2.42-17） | GPLv2 / LGPLv2.1+ | ≈ 1.0 MB（打进 initramfs） |
| SUID helper | 源码构建 BusyBox 1.38.0（i386，静态链接 AOSC glibc 2.42，严格仅含 `su`，口令数据库保持锁定） | GPLv2 / LGPLv2.1+ | ≈ 1.0 MB（打进 initramfs） |
| PwnHub debugger | 项目源码构建的静态、剥离 i386 `ptrace` 调试器 | 项目源码 / LGPLv2.1+（静态 glibc） | ≈ 0.8 MB（打进 initramfs） |
| initramfs | 本项目 `vm/rootfs-overlay/` + 两个 busybox，`scripts/pack-initramfs.py` 打包（确定性、显式权限） | 本项目 | ≈ 1.6 MB（gzip） |
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
`tinyconfig 内核 + Debian busybox-static + 最小 SUID helper + 自定义 initramfs`，
每一步都来自可审计的标准源（kernel.org / Debian 仓库），
并且全部脚本化（`vm/build.sh`）。

### 后续替换 / 升级路径

- 想换成 env86/Buildroot：用 env86 构建镜像后，把产出的 bzImage 与
  rootfs 替换到 `public/vm/`，并将 `vm/rootfs-overlay/` 的内容并入其
  rootfs-overlay 即可，前端无需改动。
- 想换 Alpine：下载 alpine-virt ISO 作为 cdrom 启动亦可工作，
  但体积（60MB+）和启动时间都明显更差，不推荐用于本场景。

## 8. 添加新关卡的方法

关卡已经配置化。每个 `level-N/` 都是一个自包含关卡包：

- `challenge.json`：剧情、目标、结构化教学步骤、三层提示、验证说明和
  通关总结；前端在构建时自动发现并加载。
- `init.sh`：幂等的关卡环境初始化，每次进入或重置本关都会执行。
- `check.sh`：只检查最终状态；成功 `exit 0`，失败输出可读提示并退出非零。
- `answer.sha256`、日志或二进制等文件：本关需要的只读素材；需要固定答案时，
  明文只写入 `tests/fixtures/level-answers.json`，再运行 `scripts/hash-answer.sh` 生成哈希。

新增关卡时只需建立下一个连续编号的目录，不再修改前端关卡数组或总关卡数。
运行 `pnpm validate:challenges` 会校验 manifest 字段、目录编号、唯一 slug 以及
`init.sh` / `check.sh` 是否完整。然后补充 VM 测试并运行
`./vm/build.sh --skip-kernel` 重打包。

PwnHub 实验位于 `vm/labs/pwnhub/<labId>/`，使用稳定字符串 `labId` 和
`manifest.json`。`vm/profiles/production.json` 是前端课程、production
initramfs、下载产物和 telemetry backend activity 白名单的唯一发布清单。
修改二进制实验时还需运行 `pnpm validate:binary-profile` 与
`pnpm test:binary-profile`。

完整字段说明、最小模板和脚本约定见
[关卡开发指南](docs/challenges.md)。

判题协议（`passed` / `error` 消息）由 `/usr/local/bin/check` 委托 SUID
`htcheck` 自动发出；只有真实通过的结果才带签名，关卡脚本无需关心协议格式。

## 9. 关卡协议说明

虚拟机通过串口输出机器可识别的控制行，格式为单行 JSON 加固定前缀：

```text
@@HASHTEAM:{"type":"level-result","level":3,"status":"passed","sig":"<64 位十六进制签名>"}
```

已定义的消息类型：

| type | 字段 | 含义 |
| --- | --- | --- |
| `ready` | `version`, `key` | Linux 启动，提供本次 VM 的临时验签材料 |
| `level-ready` | `level`, `sig` | 关卡环境初始化完成（进入/重置某关后发出） |
| `level-result` | `level`, `status`, `sig` | 关卡验证结果（`passed`） |
| `lab-ready` | `labId`, `sig` | 稳定标识实验初始化完成 |
| `lab-result` | `labId`, `status`, `sig` | 稳定标识实验验证结果 |
| `hint-request` | `level` | 用户在终端输入了 `hint`，请求前端显示提示 |
| `progress` | `level`, `value` | （预留）细粒度进度 |
| `error` | `message` | 检查失败等错误信息 |

前端行为（`src/services/protocol-parser.ts`）：

1. 只识别**行首**以 `@@HASHTEAM:` 开头的行；
2. 协议行**不显示**在终端中，普通输出原样显示；
3. 支持半包 / 粘包（按行缓冲），非法 JSON 静默忽略不会导致崩溃；
4. 前端只根据协议消息更新状态，从不监听用户输入判题；version 2 的数字关卡和
   稳定实验切换/通过结果都必须验签，且只接受当前会话和顺序解锁范围内的消息。

前端 → 虚拟机方向：通过串口输入调用
`hashteamctl goto N / goto-lab <labId> / reset-level / factory-reset`。

## 10. 静态部署方法

```bash
bash scripts/verify-build.sh
# 输出 dist/，并验证内容寻址 VM 资产的 SHA-256 清单
```

`dist/` 是纯静态目录（构建使用相对路径 `base: './'`），
可直接部署到任意静态托管：GitHub Pages、Nginx、对象存储、校园网静态空间等，
**包括任意子路径**下，无需服务端重写规则。

注意：首次加载会下载约 7MB 资源，建议托管方对带内容哈希的
`vm-assets/<hash>/` 和 `assets/` 启用不可变长缓存，对 `index.html` 与
`vm-assets.json` 禁止缓存。
构建会为整组 VM 资源计算统一内容哈希并附加到 URL；任一资源更新都会整体
切换缓存版本，避免运行时、内核与 rootfs 新旧混用。

生产法律声明会嵌入本次完整 Git SHA，并链接到 GitHub 上不可变的 commit tree 与
下载归档。固定提交包含精确第三方源码 URL、SHA-256、构建配置、静态重链接材料和
`scripts/prepare-corresponding-source.sh`；需要本地副本的用户可自行运行该脚本。
生产 artifact 不再携带 `sources/`。许可证和源码获取说明见
[第三方声明](THIRD_PARTY_NOTICES.md) 与 [对应源码说明](SOURCE_CODE.md)。

GitHub Actions 的 `verify` job 在无凭据环境完成全部门禁与发布包 SHA-256 固化，
产物是约 8 MiB 的确定性 artifact。部署分两个环境：同仓库 PR 通过 verify 后，
`staging` Environment 把该 artifact 原子发布到腾讯云 Nginx
`https://labtest.lwzheng.tech`（实验性部署，供合并前验收；无 sudo 专用 SSH
账号、独立 release、共享内容寻址 VM 资源、原子软链接切换、失败自动回滚）；
合并进受保护的 `main` 后，`production` Environment 只把 artifact 发布到
EdgeOne Makers `seclabtest`（`makers-iehfqellwnxf`）生产环境，并通过
`https://lab.lwzheng.tech` 验收。fork PR 不会运行部署 job，也不会获得任何
部署 Secret。

受版本控制的日常原子发布逻辑位于 `scripts/deploy-release.sh`；服务器账号初始化、
GitHub Environment、密钥轮换和故障恢复见
[生产 CI/CD 手册](docs/deployment.md)。本机 `.deploy/` 继续保存 Nginx、证书和
手工发布资料，不会进入仓库或 GitHub artifact。

## 11. 已知限制

- **性能**：v86 是纯软件虚拟化，重计算任务较慢（教学目标均无影响）。
- **无快照恢复**：MVP 通过「整机重启 + 幂等关卡初始化」实现重置；
  `VirtualMachineController.restoreLevel()` 已预留快照替换点
  （v86 的 `save_state`/`restore_state` 已列入后续规划）。
- **工具差异**：`curl` 是基于 busybox wget 的兼容层（仅支持本实验的基本
  用法），`file` 是简化的魔数识别脚本，没有 `objdump` 和 Python 3
  （控制体积的取舍，见后续规划）。
- **关卡切换依赖串口命令**：前端会先退出已知的 GDB、debugger 和汇编 TUI 会话再切换；
  若用户自行运行了其他持续占用前台的交互程序，切换命令仍可能进入该程序的输入。
- **移动端**：可以查看任务说明与页面，但终端操作体验针对桌面优化；
  窄屏会显示提示横幅，建议桌面浏览器完成实验。
- **中文输入法**：在终端内输入命令前请切换到英文输入状态——全角引号、
  全角空格不会被 Shell 识别。任务面板的答案输入框会自动做全角→半角
  归一化，但终端内直接输入不受影响。
- **客户端答案可推导**：明文答案文件不再进入镜像（关卡只携带
  `answer.sha256` 校验值，评分由 SUID 的 `htcheck` 完成并对结果签名）；
  但镜像与前端都运行在用户浏览器里，认真分析仍能推出答案——
  这在教学场景是可接受的（见安全说明）。

## 12. 浏览器兼容性

- 推荐：最新版 Chrome / Edge / Firefox（Wasm SIMD 支持最佳，启动最快）。
- Safari 16.4+：可用（自动回退到非 SIMD 的 `v86-fallback.wasm`，速度略慢）。
- 需要开启 WebAssembly；`SharedArrayBuffer` 不可用时会自动降级，不影响使用。
- 屏幕：1366×768 及以上桌面分辨率体验最佳；移动端可正常阅读任务面板。

## 13. 安全说明

- 虚拟机**没有网卡**（内核未编译驱动、v86 未配置网络设备），
  无法主动访问公网；第 9 关的 Web 服务只监听虚拟机内部的 `127.0.0.1`。
- 不连接宿主机 Shell，不提供浏览器到任何服务器的命令执行接口。
- 前端与磁盘镜像中**不包含任何真实密钥**；所有令牌均为教学道具。
- **客户端状态不是安全边界**：关卡逻辑、答案、进度都运行在用户浏览器里，
  可以被分析和修改——这是刻意的教学取舍。为抬高直接伪造通关记录的门槛，
  VM 内的评分结果由 SUID 的 `htcheck` 用每次启动随机生成的会话密钥签名，
  前端验签通过后才计入进度；但这仍不构成服务端可信边界。
- 本项目用于**教学和纳新体验**，不适合直接作为有奖金或正式排名的比赛系统。
- 所有安全实验仅作用于随网页提供的隔离环境；请勿把其中的思路
  用于任何未经授权的真实系统。

## 14. 后续规划

1. **快照启动**：用 v86 `save_state` 制作「已登录基础快照」，
   页面加载即恢复，消除每次的完整引导（接口已预留）。
2. **每关独立快照**：`restoreLevel()` 切换到快照恢复，实现真正的
   关卡级环境隔离与秒级重置。
3. **更丰富的用户态**：仅在独立 profile 的体积、Python ABI 与启动预算通过审计后，
   再评估精简 Python 3 或其他程序分析工具。
4. **关卡扩展**：计划中的方向包括简易二进制逆向与逆向工程基础、
   安全开发小练习（修复一个有 bug 的脚本）。
5. **资源优化**：Brotli 预压缩静态资源、Service Worker 离线缓存。
6. **无障碍与移动端**：终端缩放、虚拟键盘适配。

## 15. 问题反馈

页面检测到**阻断类异常**（进度档自相矛盾、判题会话密钥缺失、浏览器不支持验签）时
会弹出引导窗，按提示操作即可：

1. 优先点主修复按钮（切换模式 / 重启实验环境），多数情况一次就好。
2. 仍有问题：点「下载问题日志」得到一个 `.json` 现场文件（构建版本、页面环境、
   进度档原文、启动日志；不自动上报任何内容），把它发到 **SDUCTF 新手村 QQ 群**，
   并附一张终端最后几行的截图，开发者会跟进分析。

注意：启动日志里可能包含你的终端回显内容，日志文件请只发给开发者，不要公开粘贴。

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
│   ├── components/     # TopBar / LabTerminal / MissionPanel / DebuggerControls /
│   │                   # LoadingScreen / CompletionPage / AboutModal
│   ├── composables/    # useVirtualMachine / useLabProgress / useSerialProtocol
│   ├── services/       # VM、协议、存储与 challenge manifest 校验
│   ├── data/levels.ts  # 自动发现并加载全部 challenge.json
│   ├── types/lab.ts
│   └── styles/global.css
├── docs/challenges.md  # 新增关卡的配置、脚本与测试指南
├── tests/              # vitest 单元测试（协议解析、进度持久化）
├── vm/
│   ├── build.sh        # 虚拟机资源构建（内核 + initramfs + v86 资源）
│   ├── busybox-suid.config # 仅启用 su 的最小 BusyBox 配置
│   ├── toolchain-source/debugger/ # ptrace debugger 源码与工具链锁
│   └── rootfs-overlay/ # initramfs 内容；每关目录含 manifest、脚本和素材
└── scripts/
    ├── validate-challenges.mjs # 构建前校验关卡配置和目录完整性
    ├── generate-debugger-index.sh # 从锁定 ELF 生成指令与符号索引
    ├── pack-initramfs.py    # 确定性 cpio 打包（显式权限位）
    ├── verify-suid-initramfs.py # 校验 SUID 权限与 applet 白名单
    ├── test-vm-checks.sh    # Linux 检查脚本与绕过回归测试
    ├── integration-test.mjs # 端到端：Node 无头启动真实 VM 通关 10 关
    ├── prepare-corresponding-source.sh # 可选下载并校验 GPL/LGPL 对应源码
    ├── deploy-release.sh   # Nginx 原子发布、校验和失败回滚
    ├── verify-release-archive.sh # 两个发布目标共用的 artifact 校验
    ├── verify-edgeone-project.mjs # EO 项目名称/ID 防误建预检
    ├── guard-edgeone-project.mjs # CLI 进程内禁止项目创建/API 回退
    ├── verify-edgeone-production.sh # EO 自定义域名完整验收
    ├── provision-deploy-user.sh # 一次性初始化无 sudo 部署账号
    ├── verify-dist.mjs      # 校验生产 VM 资产清单和 SHA-256
    ├── prepare-vm-assets.sh # vm/build.sh 的便捷入口
    └── verify-build.sh      # 一键验证：资源 + 测试 + 构建
```
