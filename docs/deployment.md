# HASHTEAM Security Lab 生产 CI/CD

生产站点由 `.github/workflows/ci.yml` 自动发布。服务器初始化是一次性运维，
日常 workflow 不拥有 sudo，也不修改 Nginx 或证书。

## 安全边界

```text
pull_request ──> verify（无生产 Secret）──> 不部署

main push ─────> verify（无生产 Secret）
                     │
                     └─ SHA-256 固化的短期 artifact
                                      │
                                      v
                       production deploy（专用 SSH Secret）
                                      │
                                      v
                         原子切换；失败自动回滚
```

- workflow 的 `GITHUB_TOKEN` 只有 `contents: read`。
- 所有 Action 都固定到完整 Git commit SHA。
- `production` Environment 只允许 `main` 分支，不设置逐次人工 reviewer。
- SSH 私钥只注入最后一个 shell 步骤；写入 `0600` 临时文件后立即从子进程环境
  删除，步骤退出时再删除文件。密钥创建后不运行任何第三方 Action。
- 私钥指纹必须与 Environment Variable 一致；服务器 Host Key 必须出现在固定的
  `known_hosts` Secret 中，SSH 强制 `StrictHostKeyChecking=yes`。
- 服务器使用无 sudo 的 `hashteam-deploy` 系统账号。`authorized_keys` 的
  `restrict` 禁止 PTY、端口转发、agent 转发和 X11 转发。
- 账号仅对 `/var/www/hashteam` 发布树拥有写权限。Nginx、证书和系统软件仍由
  手工运维账号管理。
- 同一时刻只允许一个 production job；正在发布的 job 不会被新提交取消。
  服务器端另有原子发布锁作为第二道并发保护。

## GitHub Environment

Environment 名称为 `production`。

Secrets：

- `DEPLOY_SSH_PRIVATE_KEY`：专用 Ed25519 私钥；
- `DEPLOY_SSH_KNOWN_HOSTS`：从可信服务器通道取得的固定 SSH Host Key。

Variables：

- `DEPLOY_KEY_FINGERPRINT`
- `DEPLOY_HOSTNAME`
- `DEPLOY_PORT`
- `DEPLOY_USER`
- `DEPLOY_PATH`
- `DEPLOY_URL`

不要把私钥放入仓库、artifact、缓存、workflow output 或命令行参数。使用
GitHub CLI 更新时从文件标准输入读取：

```bash
gh secret set DEPLOY_SSH_PRIVATE_KEY \
  --repo H4SHTE4M/HASHTEAM-SecLab \
  --env production \
  < /安全临时目录/id_ed25519
```

GitHub API 和 UI 只能列出 Secret 名称及更新时间，不能读回 Secret 内容。

## 一次性服务器初始化

先在受控设备生成只供 Actions 使用的密钥，不要复用个人 SSH 密钥：

```bash
key_dir="$(mktemp -d)"
chmod 0700 "$key_dir"
ssh-keygen -t ed25519 -N '' \
  -C github-actions-hashteam \
  -f "$key_dir/id_ed25519"
ssh-keygen -lf "$key_dir/id_ed25519.pub"
```

将公钥和不含任何凭据的初始化脚本传到服务器的明确临时路径，并在可信 SSH
会话中执行：

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

初始化脚本会拒绝非 Ed25519 公钥、错误指纹、异常账号配置、sudo 组成员和过宽的
部署路径。完成后会删除服务器上的暂存公钥。

## 发布过程

1. `verify` 安装锁定依赖并运行 `scripts/verify-build.sh`；
2. 生成 GPL/LGPL 对应源码目录；
3. 创建确定性 release tar，计算 SHA-256 后上传为保留一天的 artifact；
4. `deploy` 下载 artifact，重新校验 SHA-256、路径穿越和符号链接；
5. `scripts/deploy-release.sh` 再校验产物、Git source ID 和远端账号权限；
6. 获取远端发布锁，上传共享内容寻址资产与独立 release；
7. 校验远端文件后原子切换 `current`；
8. 逐字节比对线上首页、VM 清单、法律声明和 VM 资产；
9. 任一健康检查失败时自动把 `current` 切回上一 release。

## 手工触发与故障恢复

具有仓库写权限的用户可以从 Actions 页面运行 `workflow_dispatch`，但仅允许选择
`main`。这不会绕过测试、Environment 分支限制或线上健康检查。

如果进程被强制终止并遗留 `/var/www/hashteam/.deploy-lock`，先确认没有部署仍在
运行，再通过手工运维账号核对锁内 `owner`，只删除该锁文件和空锁目录。不要对
部署根目录使用递归通配删除。

Actions Secret 无法读回。密钥疑似泄露时，应立即：

1. 在服务器撤销 `hashteam-deploy/.ssh/authorized_keys` 中的旧公钥；
2. 生成新的专用密钥对并核对指纹；
3. 安装新公钥并更新 `DEPLOY_SSH_PRIVATE_KEY` 与
   `DEPLOY_KEY_FINGERPRINT`；
4. 运行一次 `workflow_dispatch` 验证完整链路；
5. 删除所有受控设备上的旧私钥副本。
