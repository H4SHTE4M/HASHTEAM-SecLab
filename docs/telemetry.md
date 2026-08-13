# HASHTEAM Security Lab 遥测系统

SecLab 与 PwnHub 仅收集预定义的**匿名聚合使用统计**，不会向遥测服务发送原始终端输入、命令参数、答案内容、账号、Cookie 或设备指纹。

## 架构

```text
Browser / VM
     │
     │  /api/telemetry/session   (POST, 匿名 session 引导)
     │  /api/telemetry/events    (POST, 批量事件上报)
     │  /api/telemetry/stats     (GET,  只读聚合统计)
     ↓
EdgeOne Makers Edge Function  (edge-functions/api/telemetry/*.js)
     │  HMAC 签名鉴权
     ↓
Telemetry Backend              (backend/server.js, 腾讯云 VM)
     │  Node + SQLite WAL
     ↓
aggregates 表 (module, metric, dimension, count)
```

### 链路说明

1. **前端**（`src/telemetry/`）是按 module 复用的 service。SecLab 使用数字关卡 v1 事件；PwnHub 使用稳定 `activityId` v2 事件。调用方不关心 batching、session、HTTP、seq 或 EdgeOne API。
2. **Edge Function**（`edge-functions/api/telemetry/*.js`）运行在 EdgeOne 边缘节点，做基础校验后通过 HMAC 签名转发到后端。前端统一调用同源 `/api/telemetry/*`。
3. **后端**（`backend/server.js`）运行在腾讯云 VM 上，Node + SQLite WAL。匿名 session 在首批合法事件到达时绑定 module，此后不能跨模块复用。

### EdgeOne Makers Direct Upload 与 Edge Functions

EdgeOne Makers Direct Upload 项目支持 Edge Functions：将 `edge-functions/` 目录放在项目根目录，Direct Upload 部署时自动注册路由。文件路径映射到 URL：

```
edge-functions/api/telemetry/session.js  ->  /api/telemetry/session
edge-functions/api/telemetry/events.js   ->  /api/telemetry/events
edge-functions/api/telemetry/stats.js    ->  /api/telemetry/stats
```

`edgeone.json` 仅支持 `headers` 配置（Direct Upload 限制），Edge Function 路由由目录结构自动生成，无需在 `edgeone.json` 中声明。

Vite 构建时将 `edge-functions/` 原样输出到 `dist/edge-functions/`，`verify-dist` 校验 dist 与源码一致。

## 事件与数据模型

### 事件 schema（按 module 版本化）

```json
{
  "v": 1,
  "module": "seclab",
  "session": "<anonymous-token>",
  "seq": 12,
  "events": [
    { "type": "command", "command": "find" },
    { "type": "level_complete", "level": 5, "path": "challenge" },
    { "type": "check_result", "level": 5, "passed": false },
    { "type": "hint", "level": 3 },
    { "type": "reset", "level": 2 }
  ]
}
```

PwnHub 使用 `v=2` 和稳定 `activityId`：

```json
{
  "v": 2,
  "module": "pwnhub",
  "session": "<anonymous-token>",
  "seq": 4,
  "events": [
    { "type": "activity_complete", "activityId": "memory-addresses-01", "path": "guided" },
    { "type": "activity_check", "activityId": "memory-addresses-01", "passed": true },
    { "type": "vm_boot", "outcome": "ready", "duration": "5-10s", "cache": "warm" }
  ]
}
```

| type             | 维度                     | 说明                         |
|------------------|--------------------------|------------------------------|
| `command`        | `command` (allowlist)    | 某命令实际执行一次           |
| `level_complete` | `level`, `path`          | 关卡首次完成（guided/mixed/challenge） |
| `check_result`   | `level`, `passed`        | 每次 check 评分结果（通过/未通过，不去重） |
| `hint`           | `level`                  | 提示使用                     |
| `reset`          | `level`                  | 关卡重置                     |
| `activity_complete` | `activityId`, `path` | PwnHub 实验首次完成 |
| `activity_check` | `activityId`, `passed` | PwnHub 实验 check 结果 |
| `activity_hint` / `activity_reset` | `activityId` | PwnHub 提示 / 重置 |
| `vm_boot` | `outcome`, `duration`, `cache` | PwnHub VM 启动结果与分桶耗时 |

### Module 概念

事件携带 `module` 字段。`seclab` 固定使用 v1 与数字 `level`；`pwnhub`
固定使用 v2 与稳定 `activityId`。后端按 module 分离事件 allowlist、命令
allowlist、完成去重和 Dashboard 数据，不接受交叉版本或交叉事件。

PwnHub 的已公开 `activityId` 唯一来源是 `vm/profiles/production.json`。前端在
构建时直接读取该文件，backend 部署时把同一文件复制到当前 release 的
`/opt/hashteam-telemetry/current/production.json`；配置缺失、ID 非法或重复时服务拒绝启动。

### 聚合表结构

```sql
aggregates(module, metric, dimension, count)
```

首次完成去重分别使用：

```sql
completions(token_hash, module, level)
activity_completions(token_hash, module, activity_id)
```

前者服务 SecLab 数字关卡，后者服务 PwnHub 稳定实验；同一匿名 session
重复完成不会增加 `complete` 或 `complete_path`。

```
seclab | command       | find                 | 271
seclab | command       | grep                 | 184
seclab | complete      | level-5              | 42
seclab | complete_path | level-5:challenge    | 18
seclab | complete_path | level-5:guided       | 15
seclab | complete_path | level-5:mixed        | 9
seclab | check_pass    | level-5              | 45
seclab | check_fail    | level-5              | 9
seclab | hint          | level-3              | 67
seclab | reset         | level-2              | 23
pwnhub | command       | readelf                       | 84
pwnhub | complete      | memory-addresses-01           | 31
pwnhub | complete_path | memory-addresses-01:guided    | 22
pwnhub | vm_boot_duration | 5-10s                       | 19
```

### 事件明细表（时间序列）

除了聚合 counter，后端还维护一张事件明细表用于按时间统计：

```sql
event_log(id, module, event_type, dimension, ts)
```

- `module`：事件所属 module；`session_create` 在该 session 的首批合法事件到达时写入对应 module
- `event_type`：包含 `session_create`、`command`、SecLab 的数字关卡事件、
  PwnHub 的 `activity_*` 与 `vm_boot`
- `dimension`：命令名、`level-N`、稳定 `activityId` 或 VM 启动分桶；session 创建为空串
- `ts`：事件到达后端的时间戳（ms epoch）

明细表不含 token_hash、IP 或任何身份信息，与聚合表同属匿名统计。保留 90 天，过期后定期删除。

`GET /api/public/stats` 和 `GET /api/admin/overview` 的响应中新增 `timeseries` 字段，返回最近 30 天的按天聚合数据：

```json
[
  { "day": 1723334400000, "session_create": 3, "command": 15, "level_complete": 2, "hint": 1, "reset": 0 },
  ...
]
```

每天的结构补零。公开 Dashboard 和管理页都按 SecLab/PwnHub 模块切换；PwnHub 的 `activity_complete` 在趋势图中归一为完成事件，但数据库仍保留原始事件类型。

### 命令 allowlist

VM wrapper 只上报各 module 预定义的命令名，不包含参数：

```text
seclab: find grep chmod ls cat cd pwd whoami check help su
pwnhub: ls cat cd pwd check help readelf nm objdump file hexdump strings od
```

提示和重置使用独立事件类型，不经 command wrapper。

### 扩展性

扩展性来自**明确 schema 演进**，而不是允许客户端上传任意字段。事件是判别联合（discriminated union），每个事件类型有固定的维度字段。新增事件类型需要：
1. 在 `schema.ts` 的 `TelemetryEvent` 联合中添加类型
2. 在对应 module 的 `events` allowlist 中注册
3. 在后端 `processEvent` 中添加处理逻辑

## 收集什么 / 不收集什么

### 收集

- 各 module 受支持命令的执行次数（命令名，不含参数）
- SecLab 关卡或 PwnHub 实验的首次完成次数与完成路径
- 每次 check 的通过/未通过结果
- 提示与重置次数
- PwnHub VM 启动结果、耗时区间与缓存状态（分桶值）
- 按 module 过滤的事件时间序列（明细保留 90 天）

### 不收集

- 原始终端输入
- 命令参数 / 参数值
- 答案内容
- 账号 / Cookie / 设备指纹
- 用户轨迹 / 行为回放
- IP 地址（不持久化）

## 匿名 session

- 前端首次上报时通过 `POST /api/telemetry/session` 获取短生命周期匿名 token
- 后端只存 token 的 SHA-256 hash，不存明文
- session 30 分钟自动过期
- 每 session 最多 500 个事件
- monotonic `seq` 防重放
- 每 session 每 module 每 level 的 `level_complete` 最多统计一次
- 单批最多 50 个事件
- 队列上限 200（超出丢弃最早事件）

## 命令统计实现

### VM 侧（`vm/rootfs-overlay/etc/hashteam/telemetry.sh`）

shell 函数 wrapper 在执行真实命令后，通过 `/dev/tty` 输出协议行：

```sh
find() { command find "$@"; local rc=$?; _ht_telemetry_emit find; return $rc; }
```

关键设计：
- 协议行写入 `/dev/tty`（控制终端 = 串口控制台），**不经过 fd 1/fd 2**，因此管道、重定向、命令替换均不受污染
- 先执行命令、捕获退出码（`local rc=$?`），再上报，最后 `return $rc` 透传退出码
- `command` 内建绕过函数自身，调用真实 BusyBox applet
- 不改变 argv、stdin、stdout、stderr、exit code

### 前端侧

串口协议解析器识别 `telemetry-command` 消息类型，`useVirtualMachine` 中的 `handleMessage` 调用 `telemetry.trackCommand()`。非 allowlist 命令被 telemetry 层静默丢弃。

## 通关统计

复用现有 `level-result` 协议消息和 VM session HMAC 验签。只有验签通过的 `level-result` + `status: passed` 才触发 `progress.complete()`。`complete()` 返回 `false` 表示重复完成，此时不产生遥测事件。

防重复统计：
- VM session HMAC 验签（防伪造）
- `progress.complete()` 幂等（防重复 check / 协议重放）
- 后端每 session 每 level 最多一次 `level_complete`（防 session 内重复）
- 页面刷新后 session 重建，但前端 `complete()` 已记录该关完成，不会重复触发

## check 正确率统计

每次 check 执行都产生一个 `check_result` 事件（不去重），正确率 = `check_pass / (check_pass + check_fail)`：

- **通过**：htcheck 签发的 `level-result` + `status: passed` 通过前端 HMAC 验签后上报 `check_result { passed: true }`，可信（签名不可伪造）
- **未通过**：htcheck 对未通过的 check 发出 `error` 协议消息（`level N check failed`），前端识别后上报 `check_result { passed: false }`。该消息未签名，与 `telemetry-command` 同属尽力而为统计——学生可从 VM 伪造失败事件压低正确率，但无法伪造通过（威胁模型已接受此类低价值污染）

聚合维度：`check_pass` / `check_fail` metric，dimension `level-N`。数据看板新增「check 正确率」面板与总览卡片。

## 发送与可靠性

- 独立队列，不阻塞业务
- batching：队列达 10 个或 5 秒发送一批
- 队列上限 200，超出丢弃最早事件
- 网络错误静默失败，不重试
- 请求超时 4 秒后放弃
- telemetry exception 不传播到业务逻辑（所有 `track*` 方法无返回值、不抛错）

## Dashboard 看板（公开数据页与管理页）

后端内置两个浏览器直连页面（零依赖静态文件，由 `backend/server.js` 以白名单路由提供，目录 `backend/public/`）：

| 页面 | URL（经 nginx 反代） | 认证 |
|------|----------------------|------|
| 数据看板 | `/telemetry-backend/dashboard/` | 无（公开） |
| 管理页 | `/telemetry-backend/dashboard/admin.html` | 密码登录 |

### 数据看板（公开）

- SecLab/PwnHub 模块切换，统计不混算
- 近 30 天活动趋势和近 24 小时会话/命令趋势
- 命令、完成路径、check 正确率、提示与重置
- PwnHub VM 启动成功率、匿名耗时 p75 区间、冷/热/未知缓存样本
- 数据源：`GET /api/public/stats?module=<module>`；仅返回聚合数据

### 管理页（需登录）

详细数据使用 `GET /api/admin/overview?module=<module>`：

- SecLab/PwnHub 独立的聚合表、完成矩阵、提示/重置和最近匿名 session
- SecLab 从 `completions` 计数；PwnHub 从 `activity_completions` 计数
- VM 启动失败率超过 2% 或 p75 进入 `10-20s`/`>=20s` 时明确标记
- 近 30 天和近 24 小时趋势按 module 隔离

### 管理认证设计

- 单管理员密码，服务端只存 scrypt 哈希（`scrypt:N:r:p:salt:hash`，N=16384）
- `deploy.sh` 首次部署生成 20 位随机密码并**只在部署会话打印一次**
- 自定义轮换使用 `sudo bash /opt/hashteam-telemetry/current/set-admin-password.sh`，脚本从 `/dev/tty` 隐式读取两次，拒绝 argv 密码；自动生成使用同一路径加 `--generate`
- 密码按实际输入至少 12 位校验；首尾空白原样保留，换行符不属于密码内容。env 通过从创建即为 `0600` 的同目录临时文件原子替换
- 登录（`POST /api/admin/login`）成功后下发 32 字节随机 token 的 cookie：`HttpOnly; Secure; SameSite=Strict; Path=/telemetry-backend/api/admin`，12 小时固定过期（不滑动）
- 后端只存 token 的 SHA-256 哈希（`admin_sessions` 表），与匿名 session 同一清理周期
- 登录限流：5 次/5 分钟/IP + 30 次/5 分钟全局；失败日志不写入原始 IP；overview 60 次/分钟/IP
- 会话固定 12h 过期 + SameSite=Strict + 仅 JSON API（无表单提交，CSP `form-action 'none'`），CSRF 面最小

### Dashboard 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TELEMETRY_ADMIN_PASSWORD_HASH` | （空） | 管理密码 scrypt 哈希；为空时登录返回 503，公开页不受影响 |
| `TELEMETRY_PUBLIC_PREFIX` | `/telemetry-backend` | nginx 反代前缀，用于 `/dashboard` 尾斜杠 302 的 Location |
| `TELEMETRY_COOKIE_PATH` | `/telemetry-backend/api/admin` | 管理 cookie 的 Path；前缀变更时同步调整 |
| `TELEMETRY_DASHBOARD_DIR` | `<backend>/public` | 静态资源目录（启动时加载进内存） |
| `TELEMETRY_PRODUCTION_PROFILE` | 自动发现 | 可选的 production profile 绝对路径；部署包默认使用同目录 `production.json` |

修改 nginx 反代前缀或 production profile 位置时，以上变量需同步修改并重启服务。

## EdgeOne 配置

### 环境变量（在 EdgeOne Makers 控制台配置）

在 `seclabtest` 项目的环境变量中添加：

| 变量名                   | 值                                                    |
|--------------------------|-------------------------------------------------------|
| `TELEMETRY_BACKEND_URL`  | `https://<后端 HTTPS 域名>/telemetry-backend`         |
| `TELEMETRY_EDGE_SECRET`  | 与后端 `TELEMETRY_EDGE_SECRET` 相同的密钥             |

### 速率限制

在 EdgeOne Makers 控制台为 `/api/telemetry/*` 路径配置 Rate Limiting 规则（控制台操作）：

- `/api/telemetry/session`：每 IP 每分钟最多 10 次
- `/api/telemetry/events`：每 IP 每分钟最多 60 次
- `/api/telemetry/stats`：每 IP 每分钟最多 30 次

### CSP 注意

当前 `edgeone.json` 的 CSP 设置 `connect-src 'self'`，前端通过同源 `/api/telemetry/*` 调用，无需修改 CSP。

## Backend 部署（腾讯云 VM）

### 前置条件

- Node.js >= 20、pnpm 10
- 完整仓库中的 `backend/` 与 `vm/profiles/production.json`；部署脚本拒绝缺少发布清单的独立 backend 目录

### 部署步骤

```bash
# 1. 保留仓库相对结构上传 backend 与唯一 production profile
ssh cn-tencent 'rm -rf /tmp/hashteam-telemetry-release &&
  mkdir -p /tmp/hashteam-telemetry-release/vm/profiles'
scp -r backend cn-tencent:/tmp/hashteam-telemetry-release/
scp vm/profiles/production.json \
  cn-tencent:/tmp/hashteam-telemetry-release/vm/profiles/

# 2. 已有生产库先做一致性备份
ssh cn-tencent sudo sqlite3 /var/lib/hashteam-telemetry/telemetry.db \
  '.backup /var/lib/hashteam-telemetry/telemetry.before-pwnhub.db'

# 3. 先发布兼容 v1+v2 的 backend，再发布包含 PwnHub 的静态前端
ssh cn-tencent sudo bash \
  /tmp/hashteam-telemetry-release/backend/deploy.sh

# 4. 脚本先在 /opt/hashteam-telemetry/releases/ 下的同文件系统 staging
#    复制文件、执行 frozen install 并完成语法/权限检查，之后才原子切换
#    /opt/hashteam-telemetry/current；production.json 位于 current 中。

# 5. 配置 nginx 反代（7841 始终只监听 127.0.0.1）：
#    location /telemetry-backend/ {
#        proxy_pass http://127.0.0.1:7841/;
#        proxy_set_header Host $host;
#        proxy_set_header X-Real-IP $remote_addr;
#    }

# 6. 在 EdgeOne 配置同一 TELEMETRY_EDGE_SECRET 与 backend URL。
```

release 目录采用 `/opt/hashteam-telemetry/releases/<release-id>`。systemd 始终从
`/opt/hashteam-telemetry/current` 启动；健康检查成功后，原 active release 由
`/opt/hashteam-telemetry/previous` 保留以便回滚。install、语法、权限、unit、
重启或健康检查任一步失败，脚本都会保持或恢复原 `current`，且不会改写原 release
中的任何字节。纯本地故障注入回归入口为 `bash scripts/test-backend-ops.sh`，使用
临时目录和伪造的 pnpm/systemd 命令，不执行实际部署。

上线顺序不可反转：旧前端只发送 v1，新 backend 同时接受 v1/v2，因此先升级 backend
无行为变化；如果先发布新前端，旧 backend 会拒绝 PwnHub v2，客户端虽不受影响，
但这段时间的匿名事件会静默丢失。

### Secret 配置

```bash
# 查看已生成的密钥
ssh cn-tencent sudo cat /etc/hashteam-telemetry/env

# 输出示例：
# TELEMETRY_PORT=7841
# TELEMETRY_DB_PATH=/var/lib/hashteam-telemetry/telemetry.db
# TELEMETRY_EDGE_SECRET=<64位十六进制密钥>
```

将 `TELEMETRY_EDGE_SECRET` 的值配置到 EdgeOne Makers 控制台的环境变量中。

### 数据库

- SQLite WAL 模式，路径 `/var/lib/hashteam-telemetry/telemetry.db`
- `aggregates` 存匿名聚合；`event_log` 不含 token/IP，保留 90 天后清理
- `sessions.module` 在首批合法事件时绑定，阻止跨 module token 复用
- `completions` 和 `activity_completions` 分别记录 SecLab/PwnHub 首次完成去重
- session 表自动清理过期记录（每 5 分钟）

## Threat Model

### 公开前端无法完全阻止恶意伪造

目标：防止普通脚本随意刷量，并限制单个客户端能造成的污染。

### 已实现的防护

| 威胁                  | 防护                                           |
|-----------------------|------------------------------------------------|
| 伪造命令统计          | VM wrapper only emits allowlist commands; parser + telemetry 层双重过滤 |
| 伪造通关              | VM session HMAC 验签 + `complete()` 幂等 + 后端 per-session dedup |
| 重复统计              | monotonic seq 重放保护 + per-session level dedup |
| 刷量                  | session 事件预算（500）+ batch 上限（50）+ 队列上限（200）+ EdgeOne rate limit |
| 绕过 Edge Function    | 后端验证 HMAC 签名（共享密钥），无签名请求被拒绝 |
| session 劫持          | token 只存 SHA-256 hash，30 分钟过期           |
| 管理密码爆破          | scrypt + 登录限流（5 次/5 分钟/IP + 全局限流）；失败日志不记录原始 IP |
| 管理 cookie 窃取/滥用 | HttpOnly + Secure + SameSite=Strict + Path 限定，12 小时过期，服务端只存哈希 |
| 公开看板刷量          | `/api/public/stats` 限流 30 次/分钟/IP，且只读聚合数据 |
| 用户画像 / 追踪       | 不收集 IP（不持久化）、账号、Cookie、指纹       |

### 仍然存在的攻击边界

- **有动机的攻击者**可以反编译前端、提取 Edge Function 密钥（如果密钥泄露）、或直接向后端发请求（如果后端地址暴露）。Edge Function -> Backend 的 HMAC 只防止绕过 Edge Function，不防止密钥泄露后的伪造。
- **分布式刷量**：单 IP rate limit 可被多 IP 绕过。aggregate 数据可能被污染，但影响有限（只影响公开统计数字）。
- **VM 内篡改**：学生可以修改 `telemetry.sh` 或直接调用 BusyBox applet 绕过 wrapper。这只影响命令统计的完整性，不影响通关统计（后者依赖 HMAC 验签）。
- **密钥泄露**：`TELEMETRY_EDGE_SECRET` 泄露后攻击者可伪造任意事件。应通过环境变量管理，不入仓库。

## 如何为未来新的 Lab 接入 telemetry

未来新增一个 Lab（如 `network-lab`）时，需要：

### 1. 注册 module

在 `src/telemetry/schema.ts` 中：

```ts
export type ModuleId = 'seclab' | 'network-lab'

export const MODULES: Record<ModuleId, { events: readonly TelemetryEventType[] }> = {
  seclab: { events: ['command', 'level_complete', 'hint', 'reset'] },
  'network-lab': { events: ['command', 'level_complete', 'hint', 'reset'] },
}
```

### 2. 注册命令 allowlist（如需统计命令）

```ts
export const NETWORK_LAB_COMMAND_ALLOWLIST = ['nmap', 'tcpdump', ...] as const
```

### 3. 创建 telemetry client

```ts
const telemetry = createTelemetry('network-lab')
telemetry.trackCommand('nmap')
telemetry.trackLevelComplete(1, 'guided')
```

### 4. 后端注册 module

在 `backend/server.js` 的 `MODULES` 中添加：

```js
const MODULES = {
  seclab: { events: ['command', 'level_complete', 'hint', 'reset'] },
  'network-lab': { events: ['command', 'level_complete', 'hint', 'reset'] },
}
```

如需新的命令 allowlist，在 `COMMAND_ALLOWLIST` 或 per-module allowlist 中添加。

### 5. 无需修改的内容

- Edge Functions（`session.js` / `events.js` / `stats.js`）-- 通用，不绑定 module
- 聚合表结构 -- `aggregates(module, metric, dimension, count)` 天然支持多 module
- Stats API -- `GET /api/telemetry/stats?module=network-lab` 自动支持
- VM wrapper -- 如果新 Lab 复用同一 VM，只需在 `telemetry.sh` 中添加新命令函数
