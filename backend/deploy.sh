#!/usr/bin/env bash
#
# 在腾讯云服务器上部署遥测后端服务。
#
# 用法（在 cn-tencent 上执行）：
#   sudo bash deploy.sh
#
# - Node.js >= 20 与 pnpm 10 已安装
# - 从完整仓库执行；脚本需要同级 backend 文件与 ../vm/profiles/production.json
set -euo pipefail

INSTALL_DIR="/opt/hashteam-telemetry"
DATA_DIR="/var/lib/hashteam-telemetry"
SERVICE_USER="hashteam-telemetry"
SERVICE_FILE="/etc/systemd/system/hashteam-telemetry.service"
ENV_FILE="/etc/hashteam-telemetry/env"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "==> 1/6 创建服务用户与数据目录"
if ! id "$SERVICE_USER" &>/dev/null; then
    useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi
mkdir -p "$DATA_DIR"
chown "$SERVICE_USER:$SERVICE_USER" "$DATA_DIR"
chmod 750 "$DATA_DIR"

echo "==> 2/6 安装服务文件"
mkdir -p "$INSTALL_DIR"
cp "$SCRIPT_DIR/server.js" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/package.json" "$SCRIPT_DIR/pnpm-lock.yaml" "$INSTALL_DIR/"
cp "$SCRIPT_DIR/set-admin-password.sh" "$INSTALL_DIR/"
# 遥测 activity 白名单与前端/rootfs 共用同一 production profile。
PROFILE_FILE="$SCRIPT_DIR/../vm/profiles/production.json"
[ -f "$PROFILE_FILE" ] || {
    echo "ERROR: 缺少 $PROFILE_FILE；请从完整仓库 checkout 执行部署" >&2
    exit 1
}
cp "$PROFILE_FILE" "$INSTALL_DIR/production.json"
# Dashboard 静态资源（公开数据页 + 管理页）
rm -rf "$INSTALL_DIR/public"
cp -r "$SCRIPT_DIR/public" "$INSTALL_DIR/public"
cd "$INSTALL_DIR"
# 只使用仓库约定的 pnpm，并由锁文件固定生产依赖。
command -v pnpm >/dev/null || {
    echo "ERROR: 缺少 pnpm 10，请先通过 corepack 安装" >&2
    exit 1
}
pnpm install --prod --frozen-lockfile
chown -R "root:$SERVICE_USER" "$INSTALL_DIR"
chmod -R go-w "$INSTALL_DIR"

echo "==> 3/6 生成共享密钥与管理密码（如不存在）"
mkdir -p "$(dirname "$ENV_FILE")"
if [ ! -f "$ENV_FILE" ]; then
    SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    cat > "$ENV_FILE" <<EOF
TELEMETRY_PORT=7841
TELEMETRY_DB_PATH=$DATA_DIR/telemetry.db
TELEMETRY_EDGE_SECRET=$SECRET
EOF
    chmod 640 "$ENV_FILE"
    chown "root:$SERVICE_USER" "$ENV_FILE"
    echo "  已生成 $ENV_FILE；通过受控 root 会话读取后配置到 EdgeOne，密钥不打印到部署日志"
else
    echo "  $ENV_FILE 已存在，保留现有密钥"
fi

# 管理页密码：env 中只存 scrypt 哈希。密码仅此一次打印到交互式部署会话，
# 请立即保存；后续轮换使用 set-admin-password.sh。
if ! grep -q '^TELEMETRY_ADMIN_PASSWORD_HASH=' "$ENV_FILE"; then
    ADMIN_PASSWORD=$(node -e "console.log(require('crypto').randomBytes(15).toString('base64url'))")
    ADMIN_HASH=$(echo "$ADMIN_PASSWORD" | node -e '
        const crypto = require("crypto")
        let password = ""
        process.stdin.on("data", (c) => (password += c)).on("end", () => {
            const salt = crypto.randomBytes(16).toString("hex")
            const hash = crypto.scryptSync(password.trim(), Buffer.from(salt, "hex"), 32, { N: 16384, r: 8, p: 1 }).toString("hex")
            console.log(`scrypt:16384:8:1:${salt}:${hash}`)
        })
    ')
    echo "TELEMETRY_ADMIN_PASSWORD_HASH=$ADMIN_HASH" >> "$ENV_FILE"
    echo "  ┌──────────────────────────────────────────────────────────┐"
    echo "  │ 管理页初始密码（仅此一次显示，请妥善保存）:                │"
    echo "  │ $ADMIN_PASSWORD"
    echo "  └──────────────────────────────────────────────────────────┘"
else
    echo "  管理页密码已配置，保留现有哈希"
fi

echo "==> 4/6 安装 systemd unit"
cp "$SCRIPT_DIR/hashteam-telemetry.service" "$SERVICE_FILE"
systemctl daemon-reload

echo "==> 5/6 启动服务"
systemctl enable hashteam-telemetry
systemctl restart hashteam-telemetry

echo "==> 6/6 健康检查"
sleep 1
if systemctl is-active --quiet hashteam-telemetry; then
    echo "  ✓ hashteam-telemetry 服务已启动"
else
    echo "  ✗ 服务启动失败，请检查 journalctl -u hashteam-telemetry"
    exit 1
fi

echo
echo "部署完成。"
echo "  服务监听: 127.0.0.1:7841（仅本机，由 nginx 反代到 EdgeOne）"
echo "  数据库:   $DATA_DIR/telemetry.db"
echo "  密钥文件: $ENV_FILE"
echo "  数据看板: https://<域名>/telemetry-backend/dashboard/（公开）"
echo "  管理页:   https://<域名>/telemetry-backend/dashboard/admin.html（需登录）"
echo
echo "下一步："
echo "  1. 将 $ENV_FILE 中的 TELEMETRY_EDGE_SECRET 配置到 EdgeOne Makers 控制台环境变量"
echo "  2. 配置 nginx 反代 /telemetry-backend/* -> 127.0.0.1:7841（见 docs/telemetry.md）"
echo "  3. 管理密码轮换: sudo bash $INSTALL_DIR/set-admin-password.sh"
