#!/usr/bin/env bash
#
# 轮换遥测管理页密码。
#
# 用法（在 cn-tencent 上执行）：
#   sudo bash set-admin-password.sh [新密码]
#
# - 不传参数则生成 20 位随机密码并打印一次（仅此一次显示）
# - 传入参数则使用该密码（建议用引号包裹避免 shell 特殊字符）
# - env 文件中只保存 scrypt 哈希，更新后自动重启服务生效
set -euo pipefail

ENV_FILE="/etc/hashteam-telemetry/env"
SERVICE_NAME="hashteam-telemetry"

if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: $ENV_FILE 不存在，请先运行 deploy.sh" >&2
    exit 1
fi

if [ $# -ge 1 ]; then
    PASSWORD="$1"
    if [ ${#PASSWORD} -lt 12 ]; then
        echo "ERROR: 密码长度至少 12 位" >&2
        exit 1
    fi
    echo "使用提供的密码（长度 ${#PASSWORD}）"
else
    PASSWORD=$(node -e "console.log(require('crypto').randomBytes(15).toString('base64url'))")
fi

HASH=$(echo "$PASSWORD" | node -e '
    const crypto = require("crypto")
    let password = ""
    process.stdin.on("data", (c) => (password += c)).on("end", () => {
        const salt = crypto.randomBytes(16).toString("hex")
        const hash = crypto.scryptSync(password.trim(), Buffer.from(salt, "hex"), 32, { N: 16384, r: 8, p: 1 }).toString("hex")
        console.log(`scrypt:16384:8:1:${salt}:${hash}`)
    })
')

# 移除旧哈希行并追加新哈希（保留其他配置）
grep -v '^TELEMETRY_ADMIN_PASSWORD_HASH=' "$ENV_FILE" > "$ENV_FILE.tmp"
echo "TELEMETRY_ADMIN_PASSWORD_HASH=$HASH" >> "$ENV_FILE.tmp"
chmod 640 "$ENV_FILE.tmp"
chown root:hashteam-telemetry "$ENV_FILE.tmp"
mv "$ENV_FILE.tmp" "$ENV_FILE"

systemctl restart "$SERVICE_NAME"
sleep 1
if ! systemctl is-active --quiet "$SERVICE_NAME"; then
    echo "ERROR: 服务重启失败，请检查 journalctl -u $SERVICE_NAME" >&2
    exit 1
fi

echo "管理页密码已更新并重启服务。"
if [ $# -lt 1 ]; then
    echo "新密码（仅此一次显示，请妥善保存）: $PASSWORD"
fi
