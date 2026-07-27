# 关卡开发指南

关卡采用“一关一目录”的结构。前端展示配置、虚拟机初始化脚本、判题脚本和
素材放在一起，避免新增关卡时分别修改前端数组和 VM 目录。

```text
vm/rootfs-overlay/opt/hashteam/levels/
├── challenge.schema.json
└── level-1/
    ├── challenge.json   # 前端任务卡 manifest
    ├── init.sh          # 每次进入或重置关卡时运行
    ├── check.sh         # check 命令调用，只验证最终状态
    └── ...              # answer、日志、二进制等关卡素材
```

## 新增一关

1. 新建下一个连续编号的 `level-N/` 目录。
2. 添加 `challenge.json`、`init.sh` 和 `check.sh`。
3. 运行 `pnpm validate:challenges`，检查字段、编号、slug 和必要脚本。
4. 在 `scripts/test-vm-checks.sh` 与 `scripts/integration-test.mjs` 中补充判题测试。
5. 运行 `pnpm test:vm`，再用 `./vm/build.sh --skip-kernel` 重打包 initramfs。
6. 运行 `pnpm build`，确认前端能够加载新的 manifest。

前端通过 Vite 在构建时自动发现全部 `level-*/challenge.json`，所以不需要再维护
关卡 import 列表或总关卡数。

## 最小 manifest

```json
{
  "$schema": "../challenge.schema.json",
  "schemaVersion": 1,
  "id": 1,
  "slug": "process-investigation",
  "name": "可疑进程",
  "tagline": "进程排查：找到异常行为",
  "story": "值班告警显示服务器上出现了一个可疑进程，请确认它的身份。",
  "goals": ["列出当前进程", "找出可疑进程", "提交进程名完成验证"],
  "suggestedCommands": ["ps", "ps aux"],
  "hints": ["先用 ps 查看当前正在运行的进程。"],
  "teaches": ["进程管理", "基础应急响应"],
  "checkUsage": "check <进程名>"
}
```

字段约束：

- `schemaVersion`：当前固定为 `1`。
- `id`：必须与 `level-N` 目录一致，所有关卡从 1 开始连续编号。
- `slug`：稳定标识，只能包含小写字母、数字和连字符，并且全局唯一。
- `goals`、`suggestedCommands`、`hints`、`teaches`：至少包含一项。
  `suggestedCommands` 在挑战模式中只作为静态命令备忘，不会直接运行。
- `guide`：可选的分步讲解数组；每项必须有 `note`，可以带 `command`。
  引导模式一次只揭示一步；完整命令可点击运行，包含 `<PID>` 一类尖括号占位符的
  命令会自动显示为不可运行的模板，必须由学生替换后手动输入。
- `concepts`：可选的核心概念数组；每项必须有 `term` 和 `explanation`，用于解释本关
  操作在现实安全中的意义。
- `takeaway`：可选的通关回顾；关卡通过后在任务面板展示，帮助学生理解
  这一关的意义。
- `checkUsage`：任务面板展示的验证命令说明。

`$schema` 能让支持 JSON Schema 的编辑器直接提示字段和格式错误；构建脚本还会
执行独立校验，因此 CI 不依赖编辑器。

## 脚本约定

`init.sh` 应当是幂等的：重复执行后得到同样的初始环境。所有用户可修改的文件
应创建或复制到 `$HOME`，不要直接让用户修改关卡源码目录。

`check.sh` 只检查最终结果，不限制用户使用哪条命令。成功时退出 `0`，失败时打印
清晰、可行动的反馈并退出非零状态。不要在脚本中手写串口协议；统一的
`/usr/local/bin/check` 包装器会发送通过或失败消息。

关卡目录内可通过以下写法定位只读素材，宿主机测试和 VM 内都能工作：

```sh
LEVEL_DIR="${HASHTEAM_LEVELS_DIR:-/opt/hashteam/levels}/level-1"
cp "$LEVEL_DIR/example.log" "$HOME/example.log"
```

## 修改 manifest 格式

新增可选字段时，同时更新：

1. `challenge.schema.json`
2. `src/types/lab.ts`
3. `src/services/challenge-manifest.ts`
4. `scripts/validate-challenges.mjs`
5. `tests/challenge-manifest.test.ts`

如果需要不兼容的字段变化，应提升 `schemaVersion` 并明确迁移现有关卡，避免旧
manifest 被静默误读。
