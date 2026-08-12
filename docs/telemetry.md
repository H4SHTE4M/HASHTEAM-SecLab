# HASHTEAM SecLab 遥测系统

SecLab 仅收集预定义的**匿名聚合使用统计**，不会向遥测服务发送原始终端输入、命令参数、答案内容、账号、Cookie 或设备指纹。

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

1. **前端**（`src/telemetry/`）是独立、可复用的 service module。调用方只需 `telemetry.trackCommand()` / `trackLevelComplete()` / `trackHint()` / `trackReset()`，不关心 batching、session、HTTP、retry、seq、EdgeOne API。
2. **Edge Function**（`edge-functions/api/telemetry/*.js`）运行在 EdgeOne 边缘节点，做基础校验后通过 HMAC 签名转发到后端。前端统一调用同源 `/api/telemetry/*`，EdgeOne 细节不暴露给业务。
3. **后端**（`backend/server.js`）运行在腾讯云 VM 上，Node + SQLite WAL。负责 session 管理、seq 重放保护、allowlist 校验、聚合写入、stats 查询。

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

### 事件 schema（版本化，v=1）

```json
{
  "v": 1,
  "module": "seclab",
  "session": "<anonymous-token>",
  "seq": 12,
  "events": [
    { "type": "command", "command": "find" },
    { "type": "level_complete", "level": 5, "path": "challenge" },
    { "type": "hint", "level": 3 },
    { "type": "reset", "level": 2 }
  ]
}
```

### 事件类型

| type             | 维度                     | 说明                         |
|------------------|--------------------------|------------------------------|
| `command`        | `command` (allowlist)    | 某命令实际执行一次           |
| `level_complete` | `level`, `path`          | 关卡首次完成（guided/mixed/challenge） |
| `hint`           | `level`                  | 提示使用                     |
| `reset`          | `level`                  | 关卡重置                     |

### Module 概念

事件携带 `module` 字段（当前只有 `"seclab"`）。未来新增 Lab 只需注册新 module，不需要修改数据模型或创建新表。

### 聚合表结构

```sql
aggregates(module, metric, dimension, count)
```

示例数据：

```
seclab | command       | find                 | 271
seclab | command       | grep                 | 184
seclab | complete      | level-5              | 42
seclab | complete_path | level-5:challenge    | 18
seclab | complete_path | level-5:guided       | 15
seclab | complete_path | level-5:mixed        | 9
seclab | hint          | level-3              | 67
seclab | reset         | level-2              | 23
```

### 事件明细表（时间序列）

除了聚合 counter，后端还维护一张事件明细表用于按时间统计：

```sql
event_log(id, module, event_type, dimension, ts)
```

- `module`：事件所属 module（session 创建事件为空串）
- `event_type`：`session_create` / `command` / `level_complete` / `hint` / `reset`
- `dimension`：事件维度（如命令名 `find`、关卡 `level-3`）；session 创建为空串
- `ts`：事件到达后端的时间戳（ms epoch）

明细表不含 token_hash、IP 或任何身份信息，与聚合表同属匿名统计。保留 90 天，过期后定期删除。

`GET /api/public/stats` 和 `GET /api/admin/overview` 的响应中新增 `timeseries` 字段，返回最近 30 天的按天聚合数据：

```json
[
  { "day": 1723334400000, "session_create": 3, "command": 15, "level_complete": 2, "hint": 1, "reset": 0 },
  ...
]
```

每天的结构补零：没有事件的天也会出现，方便前端直接画趋势图。Dashboard 和管理页均渲染"近 30 天活动趋势"堆叠柱状图。

### 命令 allowlist

VM wrapper 只上报预定义命令（`src/telemetry/schema.ts` 的 `SECLAB_COMMAND_ALLOWLIST`）：

```
find grep chmod ls cat cd pwd whoami check help su
```

`hint` 和 `reset-level` 有独立的遥测事件类型（`hint` / `reset`），不经 command wrapper。

### 扩展性

扩展性来自**明确 schema 演进**，而不是允许客户端上传任意字段。事件是判别联合（discriminated union），每个事件类型有固定的维度字段。新增事件类型需要：
1. 在 `schema.ts` 的 `TelemetryEvent` 联合中添加类型
2. 在对应 module 的 `events` allowlist 中注册
3. 在后端 `processEvent` 中添加处理逻辑

## 收集什么 / 不收集什么

### 收集

- 受支持命令的执行次数（命令名，不含参数）
- 每关成功完成次数（含通关路径 guided/mixed/challenge）
- 提示使用次数
- 关卡重置次数
- 事件时间序列（按天聚合的 session 创建数 + 各事件类型计数，保留 90 天明细）

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

- 近 30 天活动趋势堆叠柱状图（会话创建 / 命令 / 通关 / 提示 / 重置，按天）
- 命令排行榜（各命令执行次数与占比）、总览卡片、关卡通关榜（含 guided/mixed/challenge 细分）、提示与重置榜
- 数据源：`GET /api/public/stats`（返回聚合数据 + `timeseries` 时间序列，无需 HMAC）
- 公开接口已聚合、不含任何 session 级数据；限流 30 次/分钟/IP

### 管理页（需登录）

详细数据（`GET /api/admin/overview`，需管理 cookie）：

- 近 30 天活动趋势堆叠柱状图（会话创建 / 命令 / 通关 / 提示 / 重置，按天）
- 完整聚合表、关卡 × 通关路径矩阵、提示/重置明细
- 最近 50 个匿名 session（仅 SHA-256 哈希前 8 位、创建/过期时间、事件数、seq）
- 通关记录总数与独立通关会话数

### 管理认证设计

- 单管理员密码，服务端只存 scrypt 哈希（`scrypt:N:r:p:salt:hash`，N=16384）
- `deploy.sh` 首次部署生成 20 位随机密码并**只在部署会话打印一次**；轮换用 `sudo bash /opt/hashteam-telemetry/set-admin-password.sh [新密码]`
- 登录（`POST /api/admin/login`）成功后下发 32 字节随机 token 的 cookie：`HttpOnly; Secure; SameSite=Strict; Path=/telemetry-backend/api/admin`，12 小时固定过期（不滑动）
- 后端只存 token 的 SHA-256 哈希（`admin_sessions` 表），与匿名 session 同一清理周期
- 登录限流：5 次/5 分钟/IP + 30 次/5 分钟全局；overview 60 次/分钟/IP
- 会话固定 12h 过期 + SameSite=Strict + 仅 JSON API（无表单提交，CSP `form-action 'none'`），CSRF 面最小

### Dashboard 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `TELEMETRY_ADMIN_PASSWORD_HASH` | （空） | 管理密码 scrypt 哈希；为空时登录返回 503，公开页不受影响 |
| `TELEMETRY_PUBLIC_PREFIX` | `/telemetry-backend` | nginx 反代前缀，用于 `/dashboard` 尾斜杠 302 的 Location |
| `TELEMETRY_COOKIE_PATH` | `/telemetry-backend/api/admin` | 管理 cookie 的 Path；前缀变更时同步调整 |
| `TELEMETRY_DASHBOARD_DIR` | `<backend>/public` | 静态资源目录（启动时加载进内存） |

修改 nginx 反代前缀时，以上三个变量需同步修改并重启服务。

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
- `backend/` 目录下的 `server.js`、`package.json`、`pnpm-lock.yaml`、`hashteam-telemetry.service`、`deploy.sh`

### 部署步骤

```bash
# 1. 将 backend/ 上传到服务器
scp -r backend/ cn-tencent:/tmp/hashteam-telemetry/

# 2. 在服务器上执行部署脚本
ssh cn-tencent sudo bash /tmp/hashteam-telemetry/deploy.sh

# 3. 部署脚本会：
#    - 创建 hashteam-telemetry 系统用户
#    - 安装到 /opt/hashteam-telemetry/
#    - 生成 TELEMETRY_EDGE_SECRET（记录此密钥）
#    - 安装 systemd unit 并启动服务
#    - 服务监听 127.0.0.1:7841（仅本机）

# 4. 为后端 HTTPS 域名配置 nginx 反代（Edge 节点无法直连 127.0.0.1）
#    location /telemetry-backend/ {
#        proxy_pass http://127.0.0.1:7841/;
#        proxy_set_header Host $host;
#        proxy_set_header X-Real-IP $remote_addr;
#    }
#    使用受信任证书，仅开放 443；7841 始终只监听 127.0.0.1。
#    无 HMAC 的直接请求会被 backend 拒绝。

# 5. 在 EdgeOne 配置：
#    TELEMETRY_BACKEND_URL=https://<后端 HTTPS 域名>/telemetry-backend
#    TELEMETRY_EDGE_SECRET=<从受控 root 会话读取的共享密钥>
```

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
- 只保留聚合 counter，不保留 raw event log
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
| 管理密码爆破          | scrypt + 登录限流（5 次/5 分钟/IP + 全局限流） |
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
