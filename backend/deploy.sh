#!/usr/bin/env bash
#
# 在腾讯云服务器上部署遥测后端服务。
#
# 用法（在 cn-tencent 上执行）：
#   sudo bash deploy.sh
#
# - Node.js >= 20、pnpm 10 与 systemd 已安装
# - 从完整仓库执行；脚本需要同级 backend 文件与 ../vm/profiles/production.json
set -euo pipefail
umask 077

INSTALL_DIR="${TELEMETRY_INSTALL_DIR:-/opt/hashteam-telemetry}"
RELEASES_DIR="$INSTALL_DIR/releases"
CURRENT_LINK="$INSTALL_DIR/current"
PREVIOUS_LINK="$INSTALL_DIR/previous"
DATA_DIR="${TELEMETRY_DATA_DIR:-/var/lib/hashteam-telemetry}"
SERVICE_USER="${TELEMETRY_SERVICE_USER:-hashteam-telemetry}"
SERVICE_NAME="${TELEMETRY_SERVICE_NAME:-hashteam-telemetry}"
SERVICE_FILE="${TELEMETRY_SERVICE_FILE:-/etc/systemd/system/hashteam-telemetry.service}"
ENV_FILE="${TELEMETRY_ENV_FILE:-/etc/hashteam-telemetry/env}"
RELEASE_OWNER="${TELEMETRY_RELEASE_OWNER:-root:$SERVICE_USER}"
ENV_OWNER="${TELEMETRY_ENV_OWNER:-root:root}"
UNIT_OWNER="${TELEMETRY_UNIT_OWNER:-root:root}"
HEALTH_DELAY="${TELEMETRY_HEALTH_DELAY:-1}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROFILE_FILE="${TELEMETRY_PROFILE_FILE:-$SCRIPT_DIR/../vm/profiles/production.json}"
RELEASE_ID="${TELEMETRY_RELEASE_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$$}"

case "$RELEASE_ID" in
  *[!A-Za-z0-9._-]*|'')
    echo "ERROR: release ID 只能包含字母、数字、点、下划线和连字符" >&2
    exit 1
    ;;
esac

for source_path in \
  "$SCRIPT_DIR/server.js" \
  "$SCRIPT_DIR/package.json" \
  "$SCRIPT_DIR/pnpm-lock.yaml" \
  "$SCRIPT_DIR/set-admin-password.sh" \
  "$SCRIPT_DIR/hashteam-telemetry.service" \
  "$SCRIPT_DIR/public" \
  "$PROFILE_FILE"; do
  if [ ! -e "$source_path" ]; then
    echo "ERROR: 缺少 $source_path；请从完整仓库 checkout 执行部署" >&2
    exit 1
  fi
done

for command_name in node pnpm systemctl systemd-analyze flock; do
  command -v "$command_name" >/dev/null || {
    echo "ERROR: 缺少 $command_name" >&2
    exit 1
  }
done

STAGING_DIR=""
NEW_RELEASE=""
PREVIOUS_TARGET=""
CURRENT_CHANGED=0
UNIT_CHANGED=0
UNIT_EXISTED=0
UNIT_BACKUP=""
UNIT_TEMP=""
ENV_CHANGED=0
ENV_EXISTED=0
ENV_BACKUP=""
ENV_TEMP=""
ADMIN_PASSWORD=""

atomic_symlink() {
  local target="$1"
  local link_path="$2"
  local temp_link="${link_path}.new.$$.$RANDOM"
  ln -s -- "$target" "$temp_link"
  if ! mv -Tf -- "$temp_link" "$link_path"; then
    rm -f -- "$temp_link"
    return 1
  fi
}

cleanup() {
  local status=$?
  trap - EXIT
  set +e

  [ -z "$UNIT_TEMP" ] || rm -f -- "$UNIT_TEMP"
  [ -z "$ENV_TEMP" ] || rm -f -- "$ENV_TEMP"
  if [ -n "$STAGING_DIR" ] && [ -d "$STAGING_DIR" ]; then
    rm -rf -- "$STAGING_DIR"
  fi

  if [ "$status" -ne 0 ]; then
    if [ "$CURRENT_CHANGED" -eq 1 ]; then
      if [ -n "$PREVIOUS_TARGET" ]; then
        atomic_symlink "$PREVIOUS_TARGET" "$CURRENT_LINK"
      else
        rm -f -- "$CURRENT_LINK"
      fi
    fi

    if [ "$UNIT_CHANGED" -eq 1 ]; then
      if [ "$UNIT_EXISTED" -eq 1 ] && [ -f "$UNIT_BACKUP" ]; then
        mv -Tf -- "$UNIT_BACKUP" "$SERVICE_FILE"
      else
        rm -f -- "$SERVICE_FILE"
      fi
    fi

    if [ "$ENV_CHANGED" -eq 1 ]; then
      if [ "$ENV_EXISTED" -eq 1 ] && [ -f "$ENV_BACKUP" ]; then
        mv -Tf -- "$ENV_BACKUP" "$ENV_FILE"
      else
        rm -f -- "$ENV_FILE"
      fi
    fi

    if [ "$UNIT_CHANGED" -eq 1 ]; then
      systemctl daemon-reload >/dev/null 2>&1
    fi
    if [ "$CURRENT_CHANGED" -eq 1 ] && [ -n "$PREVIOUS_TARGET" ]; then
      systemctl restart "$SERVICE_NAME" >/dev/null 2>&1
    fi
    if [ -n "$NEW_RELEASE" ] && [ -d "$NEW_RELEASE" ]; then
      if [ ! -L "$CURRENT_LINK" ] ||
         [ "$(readlink "$CURRENT_LINK")" != "$NEW_RELEASE" ]; then
        rm -rf -- "$NEW_RELEASE"
      fi
    fi
  fi

  [ -z "$UNIT_BACKUP" ] || rm -f -- "$UNIT_BACKUP"
  [ -z "$ENV_BACKUP" ] || rm -f -- "$ENV_BACKUP"
  exit "$status"
}
trap cleanup EXIT

hash_password() {
  local password="$1"
  printf '%s' "$password" | node -e '
    const crypto = require("crypto")
    let password = ""
    process.stdin.setEncoding("utf8")
    process.stdin.on("data", (chunk) => (password += chunk)).on("end", () => {
      const salt = crypto.randomBytes(16).toString("hex")
      const hash = crypto.scryptSync(password, Buffer.from(salt, "hex"), 32, {
        N: 16384,
        r: 8,
        p: 1,
      }).toString("hex")
      process.stdout.write(`scrypt:16384:8:1:${salt}:${hash}`)
    })
  '
}

echo "==> 1/7 创建服务用户与版本目录"
if ! id "$SERVICE_USER" &>/dev/null; then
  useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
fi
mkdir -p "$INSTALL_DIR" "$RELEASES_DIR" "$DATA_DIR"
chown "$RELEASE_OWNER" "$INSTALL_DIR" "$RELEASES_DIR"
chmod 750 "$INSTALL_DIR" "$RELEASES_DIR"
chown "$SERVICE_USER:$SERVICE_USER" "$DATA_DIR"
chmod 750 "$DATA_DIR"

exec 9>"$INSTALL_DIR/.deploy.lock"
if ! flock -n 9; then
  echo "ERROR: 另一进程正在部署 $SERVICE_NAME" >&2
  exit 75
fi

if [ -L "$CURRENT_LINK" ]; then
  PREVIOUS_TARGET="$(readlink "$CURRENT_LINK")"
elif [ -e "$CURRENT_LINK" ]; then
  echo "ERROR: $CURRENT_LINK 必须是符号链接" >&2
  exit 1
elif [ -f "$INSTALL_DIR/server.js" ]; then
  # 从旧的非版本化安装首次迁移；失败时 current 可重新指回旧目录。
  PREVIOUS_TARGET="$INSTALL_DIR"
fi

NEW_RELEASE="$RELEASES_DIR/$RELEASE_ID"
if [ -e "$NEW_RELEASE" ]; then
  echo "ERROR: release 已存在: $NEW_RELEASE" >&2
  exit 1
fi

echo "==> 2/7 在同一文件系统构建 staging release"
STAGING_DIR="$(mktemp -d "$RELEASES_DIR/.staging.$RELEASE_ID.XXXXXX")"
cp "$SCRIPT_DIR/server.js" "$STAGING_DIR/"
cp "$SCRIPT_DIR/package.json" "$SCRIPT_DIR/pnpm-lock.yaml" "$STAGING_DIR/"
cp "$SCRIPT_DIR/set-admin-password.sh" "$STAGING_DIR/"
cp "$PROFILE_FILE" "$STAGING_DIR/production.json"
cp -R "$SCRIPT_DIR/public" "$STAGING_DIR/public"

(cd "$STAGING_DIR" && pnpm install --prod --frozen-lockfile)

echo "==> 3/7 检查 staging 语法与权限"
node --check "$STAGING_DIR/server.js"
bash -n "$STAGING_DIR/set-admin-password.sh"
node -e '
  const fs = require("fs")
  JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
' "$STAGING_DIR/production.json"
chown -R "$RELEASE_OWNER" "$STAGING_DIR"
chmod -R u+rwX,g+rX,o-rwx "$STAGING_DIR"
chmod 750 "$STAGING_DIR" "$STAGING_DIR/set-admin-password.sh"

if [ "$(stat -c '%U:%G' "$STAGING_DIR")" != "$RELEASE_OWNER" ]; then
  echo "ERROR: staging owner 检查失败" >&2
  exit 1
fi
if [ "$(stat -c '%a' "$STAGING_DIR")" != "750" ]; then
  echo "ERROR: staging 根目录权限检查失败" >&2
  exit 1
fi
if [ -n "$(find "$STAGING_DIR" ! -type l -perm /022 -print -quit)" ]; then
  echo "ERROR: staging 中存在可被 group/other 写入的文件" >&2
  exit 1
fi
if [ -n "$(find "$STAGING_DIR" -type d ! -perm -g+x -print -quit)" ] ||
   [ -n "$(find "$STAGING_DIR" -type f ! -perm -g+r -print -quit)" ]; then
  echo "ERROR: staging 中存在服务用户不可读取的路径" >&2
  exit 1
fi

echo "==> 4/7 安全准备环境文件"
mkdir -p "$(dirname "$ENV_FILE")"
if [ ! -f "$ENV_FILE" ]; then
  ENV_EXISTED=0
  ENV_TEMP="$(mktemp "$(dirname "$ENV_FILE")/.env.new.XXXXXX")"
  SECRET="$(node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))")"
  ADMIN_PASSWORD="$(node -e "process.stdout.write(require('crypto').randomBytes(15).toString('base64url'))")"
  ADMIN_HASH="$(hash_password "$ADMIN_PASSWORD")"
  {
    printf 'TELEMETRY_PORT=7841\n'
    printf 'TELEMETRY_DB_PATH=%s/telemetry.db\n' "$DATA_DIR"
    printf 'TELEMETRY_EDGE_SECRET=%s\n' "$SECRET"
    printf 'TELEMETRY_ADMIN_PASSWORD_HASH=%s\n' "$ADMIN_HASH"
  } > "$ENV_TEMP"
  chmod 600 "$ENV_TEMP"
  chown "$ENV_OWNER" "$ENV_TEMP"
  mv -Tf -- "$ENV_TEMP" "$ENV_FILE"
  ENV_TEMP=""
  ENV_CHANGED=1
  unset SECRET ADMIN_HASH
  echo "  已生成 $ENV_FILE；共享密钥不打印到部署日志"
elif ! grep -q '^TELEMETRY_ADMIN_PASSWORD_HASH=' "$ENV_FILE"; then
  ENV_EXISTED=1
  ENV_BACKUP="$(mktemp "$(dirname "$ENV_FILE")/.env.backup.XXXXXX")"
  cp -- "$ENV_FILE" "$ENV_BACKUP"
  chmod 600 "$ENV_BACKUP"
  chown "$ENV_OWNER" "$ENV_BACKUP"

  ADMIN_PASSWORD="$(node -e "process.stdout.write(require('crypto').randomBytes(15).toString('base64url'))")"
  ADMIN_HASH="$(hash_password "$ADMIN_PASSWORD")"
  ENV_TEMP="$(mktemp "$(dirname "$ENV_FILE")/.env.new.XXXXXX")"
  grep -v '^TELEMETRY_ADMIN_PASSWORD_HASH=' "$ENV_FILE" > "$ENV_TEMP"
  printf 'TELEMETRY_ADMIN_PASSWORD_HASH=%s\n' "$ADMIN_HASH" >> "$ENV_TEMP"
  chmod 600 "$ENV_TEMP"
  chown "$ENV_OWNER" "$ENV_TEMP"
  mv -Tf -- "$ENV_TEMP" "$ENV_FILE"
  ENV_TEMP=""
  ENV_CHANGED=1
  unset ADMIN_HASH
else
  echo "  $ENV_FILE 已存在，保留现有共享密钥与管理密码哈希"
fi

echo "==> 5/7 校验并原子安装 systemd unit"
systemd-analyze verify "$SCRIPT_DIR/hashteam-telemetry.service"
mkdir -p "$(dirname "$SERVICE_FILE")"
if [ -f "$SERVICE_FILE" ]; then
  UNIT_EXISTED=1
  UNIT_BACKUP="$(mktemp "$(dirname "$SERVICE_FILE")/.hashteam-telemetry.service.backup.XXXXXX")"
  cp -p -- "$SERVICE_FILE" "$UNIT_BACKUP"
else
  UNIT_EXISTED=0
fi
UNIT_TEMP="$(mktemp "$(dirname "$SERVICE_FILE")/.hashteam-telemetry.service.new.XXXXXX")"
cp -- "$SCRIPT_DIR/hashteam-telemetry.service" "$UNIT_TEMP"
chmod 644 "$UNIT_TEMP"
chown "$UNIT_OWNER" "$UNIT_TEMP"
mv -Tf -- "$UNIT_TEMP" "$SERVICE_FILE"
UNIT_TEMP=""
UNIT_CHANGED=1
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"

echo "==> 6/7 完成 release 后原子切换 current"
mv -- "$STAGING_DIR" "$NEW_RELEASE"
STAGING_DIR=""
atomic_symlink "$NEW_RELEASE" "$CURRENT_LINK"
CURRENT_CHANGED=1
systemctl restart "$SERVICE_NAME"

echo "==> 7/7 健康检查并保留上一版本"
sleep "$HEALTH_DELAY"
if ! systemctl is-active --quiet "$SERVICE_NAME"; then
  echo "ERROR: 服务启动失败；将恢复上一 active release" >&2
  exit 1
fi

if [ -n "$PREVIOUS_TARGET" ] && [ "$PREVIOUS_TARGET" != "$NEW_RELEASE" ]; then
  atomic_symlink "$PREVIOUS_TARGET" "$PREVIOUS_LINK"
fi

[ -z "$UNIT_BACKUP" ] || rm -f -- "$UNIT_BACKUP"
[ -z "$ENV_BACKUP" ] || rm -f -- "$ENV_BACKUP"
UNIT_BACKUP=""
ENV_BACKUP=""
CURRENT_CHANGED=0
UNIT_CHANGED=0
ENV_CHANGED=0

echo
echo "部署完成。"
echo "  当前版本: $NEW_RELEASE"
if [ -n "$PREVIOUS_TARGET" ]; then
  echo "  上一版本: $PREVIOUS_TARGET（$PREVIOUS_LINK）"
fi
echo "  服务监听: 127.0.0.1:7841（仅本机，由 nginx 反代到 EdgeOne）"
echo "  数据库:   $DATA_DIR/telemetry.db"
echo "  密钥文件: $ENV_FILE"
if [ -n "$ADMIN_PASSWORD" ]; then
  echo "  ┌──────────────────────────────────────────────────────────┐"
  echo "  │ 管理页初始密码（仅此一次显示，请妥善保存）:                │"
  echo "  │ $ADMIN_PASSWORD"
  echo "  └──────────────────────────────────────────────────────────┘"
  unset ADMIN_PASSWORD
fi
echo "  数据看板: https://<域名>/telemetry-backend/dashboard/（公开）"
echo "  管理页:   https://<域名>/telemetry-backend/dashboard/admin.html（需登录）"
echo
echo "下一步："
echo "  1. 将 $ENV_FILE 中的 TELEMETRY_EDGE_SECRET 配置到 EdgeOne Makers 控制台环境变量"
echo "  2. 配置 nginx 反代 /telemetry-backend/* -> 127.0.0.1:7841（见 docs/telemetry.md）"
echo "  3. 管理密码轮换: sudo bash $CURRENT_LINK/set-admin-password.sh"
