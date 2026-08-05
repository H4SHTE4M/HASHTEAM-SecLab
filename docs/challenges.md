# 关卡开发指南

关卡采用“一关一目录”的结构，前端教学配置、虚拟机初始化脚本、判题脚本和素材放在一起：

```text
vm/rootfs-overlay/opt/hashteam/levels/
├── challenge.schema.json
└── level-1/
    ├── challenge.json   # 渐进式教学 manifest
    ├── init.sh          # 每次进入或重置关卡时运行
    ├── check.sh         # 只验证环境最终状态
    └── ...              # 日志、二进制等关卡素材
```

前端通过 Vite 自动发现全部 `level-*/challenge.json`。新增关卡不需要维护 import 列表或总数。

## 教学闭环

每关同时支持两条学习路径：

1. 短背景只说明问题和成功状态，不给关键发现。
2. `introduces` 在概念首次使用的当前步骤展示最小必要知识。
3. `observation` 明确要求观察的输出，不写观察结果。
4. 步骤通过运行、填写、手动输入、判断或确认留下完成证据。
5. 三层提示固定为方向、工具、结构，最高层仍保留关键空位。
6. 引导模式在全部必要步骤完成后开放最终验证。
7. 挑战模式不渲染 `steps`，只展示背景、目标、按需提示和始终开放的验证。
8. 通关后先展示解决结果、已掌握能力和下一关迁移关系。

环境中的 `check` 始终只检查最终状态。引导模式还要求全部步骤已记录证据；
挑战模式直接接受正确结果。曾打开引导内容后切回挑战通关会记录为“混合完成”，
但切换本身不会重启环境或丢失进度。

## Manifest v2

顶层结构：

```json
{
  "$schema": "../challenge.schema.json",
  "schemaVersion": 2,
  "id": 1,
  "slug": "process-investigation",
  "name": "可疑进程",
  "tagline": "从基线中发现异常",
  "storySummary": "本机出现不属于正常基线的服务。",
  "story": "完整故事可以展开，但不承担命令教学职责。",
  "goals": ["建立基线", "定位异常", "处置并复核"],
  "prerequisites": ["比较终端输出"],
  "newConcepts": ["进程与 PID"],
  "steps": [],
  "hints": [],
  "verification": {},
  "completionSummary": {}
}
```

字段职责：

- `storySummary`：默认可见的短背景。
- `story`：可展开全文，不能隐藏完成任务所必需的信息。
- `goals`：描述成功状态，不列完整操作脚本。
- `prerequisites`：本关复用的既有能力；第 1 关可以为空。
- `newConcepts`：本关实际首次引入的概念名称，必须与步骤中的 `introduces` 一致，最多三个。
- `steps`：教学步骤，编号从 1 连续。
- `hints`：固定三层分级帮助。
- `verification`：验证结构、占位符解释和反馈分类。
- `completionSummary`：只回顾已经实践过的能力，并说明下一关怎样迁移。

## 步骤模型

所有步骤都包含：

```json
{
  "id": 1,
  "type": "observe",
  "title": "查看当前进程",
  "objective": "根据基线定位额外服务",
  "instruction": "运行后比较 COMMAND 一列。",
  "completion": "run",
  "allowRun": true,
  "command": "ps",
  "observation": "找出不属于预期职责的程序并记录 PID。",
  "commonErrors": ["PID 不是端口。"],
  "reinforcement": "异常判断必须能写出基线证据。"
}
```

支持的类型与完成证据：

| `type` | 用途 | `completion` | 关键约束 |
| --- | --- | --- | --- |
| `explain` | 首次解释必要概念 | `acknowledge` | 不运行命令 |
| `observe` | 运行安全示例并观察 | `run` | 必须提供 `command`、`observation`，仅此类可 `allowRun: true` |
| `partial-command` | 给结构，由学生填字段 | `input` | 使用 `commandTemplate` 与 `fields`，不可一键运行 |
| `manual-command` | 只给目标，由学生完整输入 | `input` | 不得预置命令或模板 |
| `question` | 根据输出判断 | `answer` | 至少两个选项，答对才继续 |
| `checkpoint` | 确认中间状态 | `confirm` | 必须写清要确认的 `observation` |
| `reflection` | 强化刚完成的方法 | `acknowledge` | 不首次堆入未实践知识 |

### 概念时机

概念在首次操作前或当前步骤定义：

```json
{
  "introduces": [
    {
      "id": "pipeline",
      "term": "管道",
      "explanation": "左边产生输出，右边消费输入。"
    }
  ],
  "uses": ["grep-filter", "pipeline"]
}
```

`id` 可以被后续关卡的 `uses` 复用。校验器会按关卡和步骤顺序检查，任何概念在定义前使用都会失败。

### 补全命令

模板空位使用 `{{field-id}}`，每个空位必须恰好对应一个字段：

```json
{
  "type": "partial-command",
  "completion": "input",
  "allowRun": false,
  "commandTemplate": "cat {{file}}",
  "fields": [
    {
      "id": "file",
      "label": "文件名",
      "placeholder": "从 ls 输出中填写"
    }
  ]
}
```

字段的 `placeholder` 只能描述来源或格式，不能写真实答案。

## 模式展示约束

- 引导模式完整渲染 `steps`，包括概念、操作说明、观察点、结构化输入和完成证据。
- 挑战模式不得渲染任何 `steps` 派生内容，也不能从中提取命令备忘；用户只依赖
  `storySummary`、`story`、`goals`、`hints` 和 `verification` 自由探索。
- 因此顶层目标、三层提示和验证说明必须能够独立表达任务，不能假设用户已经看过
  某个教学步骤。
- 两种模式使用相同 `init.sh`、`check.sh` 和最终状态标准。

## 分层提示

每关恰好三层，顺序固定：

```json
[
  { "level": 1, "kind": "direction", "text": "指出应该观察什么。" },
  { "level": 2, "kind": "tool", "text": "指出可能使用的命令类别。" },
  { "level": 3, "kind": "structure", "text": "给出仍需填写关键值的结构。" }
]
```

提示不得推进步骤、代替判断或直接给出最终答案。

## 验证与占位符

```json
{
  "verification": {
    "usage": "check <结果>",
    "instruction": "用终端发现的真实值替换占位符。",
    "placeholders": [
      {
        "token": "<结果>",
        "meaning": "排名第一行中的地址，不包含前面的计数"
      }
    ],
    "feedback": {
      "empty": "还未提供结果。",
      "incorrect": "回到中间输出定位字段或排序问题。",
      "success": "环境状态与目标一致。"
    }
  }
}
```

`usage` 中每个尖括号占位符都必须逐一解释。UI 会拒绝把未替换的尖括号原样送入终端。

`check.sh` 的失败反馈应区分空参数、对象错误和环境状态错误，指出排查方向但不打印完整解法。

## 初始化和判题脚本

`init.sh` 必须幂等：

- 用户可修改文件写入 `$HOME`。
- 重置时清理上一轮进程和文件。
- 启动文案只说明现场，不泄露答案、路径路线或最终参数。
- 训练数据规模描述必须与实际素材一致。

`check.sh` 只检查最终环境状态，不限制唯一命令：

- 成功退出 `0`，失败退出非零。
- 不在失败输出中打印完整命令管道或最终修复值。
- 涉及运行配置时，同时检查配置文件和真实进程/监听状态。
- 需要固定答案时，明文只放在 `tests/fixtures/level-answers.json`；运行
  `scripts/hash-answer.sh` 生成镜像内的 `answer.sha256`，不要添加明文 `answer` 文件。
- 生产环境中的 `HOME`、`PATH` 和答案目录由 SUID `htcheck` 固定；测试专用的
  `HASHTEAM_*` 覆盖不得成为判题前提。

## 自动校验

`pnpm validate:challenges` 会检查：

- 关卡和步骤编号连续、slug 唯一、必要脚本存在。
- 顶层、步骤和嵌套对象没有旧字段或未知字段。
- 步骤类型与完成证据匹配。
- 手动步骤没有预置可点击命令。
- 命令模板空位与 `fields` 一一对应。
- 概念在首次使用前或当前步骤定义。
- `newConcepts` 与实际引入一致，单关不超过三个。
- 每关至少包含一次独立填写、输入或判断，且不能全关一键运行。
- 三层提示按方向、工具、结构排列。
- 验证占位符都有解释。
- 通关前不引用通关后内容。
- 测试夹具中的答案不出现在通关前教学文本，且镜像不包含明文 `answer` 文件。
- 第 8–10 关受保护的端口、路径、令牌和最终配置不在初始内容泄露。
- 日志规模描述与当前训练数据一致。

## 新增或修改关卡

1. 添加或修改 `challenge.json`、`init.sh`、`check.sh` 和素材。
2. 若关卡使用固定答案，同步修改 `tests/fixtures/level-answers.json` 并运行
   `scripts/hash-answer.sh`。
3. 运行 `pnpm validate:challenges`。
4. 在 `tests/components.test.ts` 增加教学交互测试。
5. 在 `scripts/test-vm-checks.sh` 增加环境判题与替代合法方法。
6. 依次运行：

   ```sh
   pnpm test
   pnpm test:vm
   pnpm build
   ```

7. 修改 VM 文件后，发布前运行 `pnpm build:vm` 重打包 initramfs，再执行集成测试。
