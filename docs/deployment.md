# HASHTEAM Security Lab CI/CD

`.github/workflows/ci.yml` 围绕两个环境运行：

- **实验性部署（staging）**：同仓库 PR 通过全部验证后，自动部署到腾讯云 Nginx
  `https://labtest.lwzheng.tech`，用于合并前人工验收。
- **生产部署（production）**：合并进 `main` 后只发布到 EdgeOne Makers
  `https://lab.lwzheng.tech`。

两条路径使用同一个已验证、SHA-256 固定的静态 artifact 和同一只只读校验脚本。

## 发布拓扑与安全边界

```text
pull_request（同仓库）                fork PR：只跑 verify，拿不到 Secret
        │
        v
verify：测试、audit、构建、verify-dist、确定性 tar + SHA-256
        │
        v
staging / Nginx（腾讯云）
SSH 原子切换，失败自动回滚
        │
labtest.lwzheng.tech（实验验收）

main push / workflow_dispatch
        │
        v
verify：同上，重新独立运行一次
        │
        v
production / EdgeOne
直接发布 Production，失败人工恢复
        │
lab.lwzheng.tech（生产）
```

- workflow 的 `GITHUB_TOKEN` 只有 `contents: read`，所有 Action 固定到完整 commit。
- 两个部署 job 都只依赖 `verify`，各自设置独立 concurrency，
  `cancel-in-progress: false`。
- fork PR 的 `deploy_staging` 被 job 级 `if` 跳过，引用不到任何 Environment
  Secret；GitHub 默认也不向 fork PR 注入 Secret，形成双保险。
- Nginx SSH 私钥只在 `staging` Environment,EO Token 只在 `production`
  Environment；都只注入各自最后一个 shell 步骤，之后不再运行第三方 Action。
- artifact 下载后统一由 `scripts/verify-release-archive.sh` 检查 SHA-256、路径
  穿越、符号链接、Makers 配额、`verify-dist` 和完整 Git SHA。
- `dist/` 不包含 `sources/`。法律声明指向该 release 的固定 Git commit；
  `scripts/prepare-corresponding-source.sh` 仅作为用户可选的源码下载与校验工具。
  服务器已有的历史 `/sources/` 不由 CI 同步、检查或删除。

## GitHub Environment：`staging`（腾讯云 Nginx 实验性部署）

供同仓库 PR 的 `deploy_staging` job 使用。GitHub Environment 的分支保护规则无法
匹配 PR 的 `refs/pull/*` 引用，因此保持「允许所有分支」即可：真正的防线是
workflow 中的 job 级 `if`（只允许 `pull_request` 事件且 head 仓库与本仓库相同），
加上 GitHub 默认不向 fork PR 发放 Secret。请注意，对仓库有写权限的账号发起的 PR
可以触达本 Environment，staging 专用 SSH 账号的最小权限（见下文初始化脚本）是
这一信任边界的一部分。

Secrets：

- `DEPLOY_SSH_PRIVATE_KEY`
- `DEPLOY_SSH_KNOWN_HOSTS`

Variables：

- `DEPLOY_KEY_FINGERPRINT`
- `DEPLOY_HOSTNAME`
- `DEPLOY_PORT`
- `DEPLOY_USER`
- `DEPLOY_PATH`
- `DEPLOY_URL`（`https://labtest.lwzheng.tech`）

## GitHub Environment：`production`（EdgeOne 生产部署）

仅允许 `main`，无 required reviewer。

Secrets：

- `EDGEONE_API_TOKEN`：EdgeOne Makers API Token。

EO job 不使用 `TENCENTCLOUD_SECRET_ID` 或 `TENCENTCLOUD_SECRET_KEY`，也不再引用
任何 SSH 部署凭据（Nginx 部署已整体移入 `staging`）。其余值固定在 workflow 中：

| 配置 | 固定值 |
| --- | --- |
| API region | `china` |
| 项目名 | `seclabtest` |
| 项目 ID | `makers-iehfqellwnxf` |
| 项目类型 | Direct Upload |
| Environment URL | `https://lab.lwzheng.tech` |

Environment 必须在 GitHub 仓库设置中配置 deployment branch rule，只允许
`main`。不要把 Token 放入仓库、artifact、缓存或 workflow output。

## 发布过程

1. `verify` 安装 lockfile 中的依赖，运行 `scripts/verify-build.sh`，包括完整测试、
   浏览器生产依赖的 `pnpm audit --prod --audit-level low`、构建和
   `verify-dist`。精确锁定的 EO CLI 是只在隔离部署 job 使用的
   devDependency，不进入浏览器产物。
2. Vite 将根目录 `edgeone.json` 原样输出到 `dist/edgeone.json`，同时把完整 Git
   SHA 写入 `vm-assets.json.sourceId` 和两份法律声明。
3. workflow 直接把 `dist/` 打成确定性 tar，计算 SHA-256，上传保留一天的
   verified artifact（main 发布与同仓库 PR 实验性部署共用同一名称与格式）。
4. 部署 job 下载同名 artifact，并调用同一只读校验脚本。
5. Nginx staging job（仅同仓库 PR）校验专用 SSH 账号最小权限，上传共享内容寻址
   VM 资产和独立 release，原子切换 `current`，逐字节验收；失败自动切回上一
   release。多个 PR 连续触发时后到的发布覆盖先前的实验环境，这是预期行为：
   staging 永远承载「最近一次通过 verify 的 PR 内容」。
6. EO job（仅 main）先通过 China Makers API 精确查询项目，名称、ID 或
   Direct Upload 类型任一不符即 fail closed。CLI 进程还加载
   `scripts/guard-edgeone-project.mjs`，禁止 `CreatePagesProject` 和 Global API
   fallback，并再次核对名称查询响应，因此不会自动创建或切换到别的同名项目。
7. EO CLI 精确使用 lockfile 中的 `edgeone@1.6.18`，直接发布 Production：

   ```bash
   pnpm exec edgeone makers deploy dist \
     -n seclabtest \
     -e production \
     -t "$EDGEONE_API_TOKEN"
   ```

8. CLI 成功后立即清除步骤内 Token，再轮询自定义域名直到
   `vm-assets.json.sourceId` 等于 workflow Git SHA。
9. EO 验收逐字节比对首页、VM 清单、两份法律声明和六个 VM 文件，并验证所有安全
   头、缓存策略、WASM MIME、Range 以及法律声明中的固定 Git commit URL。

## EdgeOne 响应策略

根目录 `edgeone.json` 对所有路径设置与 Nginx 相同的 CSP、HSTS、`nosniff`、
Referrer-Policy、Permissions-Policy、X-Frame-Options、COOP 和 CORP。

- `/`、`/index.html`、`/vm-assets.json`、`/legal/*`：`Cache-Control: no-store`
- `/assets/*`、`/vm-assets/*`：
  `Cache-Control: public, max-age=31536000, immutable`

`verify-dist` 同时拒绝超过 20,000 个文件、超过 25 MiB 的单文件、符号链接、
`dist/sources/`、未替换 source ID 和不一致的 `edgeone.json`。

## Nginx 一次性服务器初始化

先在受控设备生成只供 Actions 使用的 Ed25519 密钥，不要复用个人密钥：

```bash
key_dir="$(mktemp -d)"
chmod 0700 "$key_dir"
ssh-keygen -t ed25519 -N '' \
  -C github-actions-hashteam \
  -f "$key_dir/id_ed25519"
ssh-keygen -lf "$key_dir/id_ed25519.pub"
```

把公钥和初始化脚本传到服务器的明确临时路径，在可信 SSH 会话中执行：

```bash
scp "$key_dir/id_ed25519.pub" \
  cn-tencent:/tmp/hashteam-actions-key.pub
scp scripts/provision-deploy-user.sh \
  cn-tencent:/tmp/hashteam-provision-deploy-user.sh

ssh cn-tencent sudo bash /tmp/hashteam-provision-deploy-user.sh \
  hashteam-deploy \
  'SHA256:<核对过的公钥指纹>' \
  /tmp/hashteam-actions-key.pub \
  /var/www/hashteam \
  lwzheng
```

专用账号无 sudo，只对 release 树和共享 VM 资产拥有写权限。Nginx、证书、历史
`sources/` 和系统软件仍由手工运维账号管理。

## 首次切换与故障恢复

从旧拓扑（main 同时发布 Nginx + EO）切换到本拓扑时：

1. 在仓库设置中新建 `staging` Environment，把原 `production` Environment 里的
   `DEPLOY_SSH_*` Secret 和 `DEPLOY_*` Variable 移入（值不变，服务器侧无需改动）。
2. `production` Environment 只保留 `EDGEONE_API_TOKEN`，其余条目删除。
3. 用一个同仓库 PR 验证 staging 链路：verify 通过后 `deploy_staging` 应把
   `labtest.lwzheng.tech` 切到该 PR 的内容。
4. 合并该 PR，确认 `main` 上只有 `deploy_edgeone` 运行且验收通过，此后
   `lab.lwzheng.tech` 为唯一生产站点，`labtest.lwzheng.tech` 仅作实验验收。

Nginx staging 健康检查失败会自动回滚。若进程被强制终止并遗留
`/var/www/hashteam/.deploy-lock`，后续发布会等待租约过期并按下述规则安全回收。

EO 没有在本项目中使用未公开的自动回滚 API。CLI、项目预检或上线验收失败时，
整个 workflow 失败，staging（Nginx）不受影响。恢复步骤：

1. 打开 EdgeOne Makers 控制台；
2. 进入 `seclabtest` 的 Production 部署记录；
3. 找到上一成功版本并手工执行重新部署；
4. 重新运行失败 workflow，确认自定义域名验收通过。

发布锁是带租约的远端目录：部署期间每 30 秒刷新一次 `heartbeat`，180 秒没有
心跳才视为过期。新发布遇到有效租约时最多等待 300 秒；确认过期后会先把锁原子
移动到本次 token 对应的隔离目录，重新核对 owner、租约和目录内容，再只删除
`owner`、`heartbeat`、`heartbeat.next` 与空目录。出现未知文件、符号链接、
owner 变化或心跳恢复时一律拒绝自动删除。

workflow 的部署 job 硬上限为 45 分钟，部署脚本另有 42 分钟软上限。软上限先发送
`TERM`，为信号 trap 释放租约和 SSH 凭据预留三分钟；即使 runner 直接失联、来不及
执行 trap，下一次发布也会在租约过期后自动恢复。

如果锁结构损坏而无法自动恢复，先确认没有部署仍在运行，再通过手工运维账号核对
锁内 owner 和 heartbeat，只删除已确认的锁文件和空锁目录。不要对部署根目录使用
递归通配删除。

Token 或 SSH 私钥疑似泄露时，应先在对应平台撤销，再生成新凭据、更新 Environment
Secret，并通过一次 `workflow_dispatch` 验证完整链路。
