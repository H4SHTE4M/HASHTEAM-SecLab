#!/usr/bin/env bash
#
# 轮换遥测管理页密码。
#
# 用法（在 cn-tencent 上执行）：
#   sudo bash set-admin-password.sh
#   sudo bash set-admin-password.sh --generate
#
# - 默认从 /dev/tty 隐式读取两次；密码不会进入 argv 或 shell history
# - --generate 生成 20 位随机密码并仅打印一次
# - 首尾空白是密码的有效组成部分，会原样保留；换行符不可作为密码内容
# - env 文件中只保存 scrypt 哈希，更新后自动重启服务生效
set -euo pipefail
umask 077

ENV_FILE="${TELEMETRY_ENV_FILE:-/etc/hashteam-telemetry/env}"
ENV_OWNER="${TELEMETRY_ENV_OWNER:-root:root}"
SERVICE_NAME="${TELEMETRY_SERVICE_NAME:-hashteam-telemetry}"
PASSWORD_TTY="${TELEMETRY_PASSWORD_TTY:-/dev/tty}"
HEALTH_DELAY="${TELEMETRY_HEALTH_DELAY:-1}"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE 不存在，请先运行 deploy.sh" >&2
  exit 1
fi

GENERATED=0
case "$#" in
  0)
    if ! exec 3<"$PASSWORD_TTY"; then
      echo "ERROR: 无法读取 $PASSWORD_TTY；交互轮换需要 TTY，自动生成请使用 --generate" >&2
      exit 1
    fi
    printf '输入新管理密码（至少 12 位，首尾空白会保留）: ' >&2
    if ! IFS= read -r -s PASSWORD <&3; then
      printf '\nERROR: 无法读取密码\n' >&2
      exit 1
    fi
    printf '\n再次输入新管理密码: ' >&2
    if ! IFS= read -r -s PASSWORD_CONFIRM <&3; then
      printf '\nERROR: 无法读取确认密码\n' >&2
      exit 1
    fi
    printf '\n' >&2
    exec 3<&-
    if [ "$PASSWORD" != "$PASSWORD_CONFIRM" ]; then
      echo "ERROR: 两次输入的密码不一致" >&2
      exit 1
    fi
    unset PASSWORD_CONFIRM
    ;;
  1)
    if [ "$1" != "--generate" ]; then
      echo "ERROR: 禁止通过 argv 传入密码；请无参数交互运行，或使用 --generate" >&2
      exit 64
    fi
    PASSWORD="$(node -e "process.stdout.write(require('crypto').randomBytes(15).toString('base64url'))")"
    GENERATED=1
    ;;
  *)
    echo "ERROR: 用法: set-admin-password.sh [--generate]" >&2
    exit 64
    ;;
esac

if [ "${#PASSWORD}" -lt 12 ]; then
  echo "ERROR: 密码实际长度至少 12 位" >&2
  exit 1
fi

HASH="$(
  printf '%s' "$PASSWORD" | node -e '
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
)"

ENV_DIR="$(dirname "$ENV_FILE")"
ENV_BACKUP=""
ENV_TEMP=""
REPLACED=0

cleanup() {
  local status=$?
  trap - EXIT
  set +e
  if [ "$status" -ne 0 ] && [ "$REPLACED" -eq 1 ] &&
     [ -n "$ENV_BACKUP" ] && [ -f "$ENV_BACKUP" ]; then
    if mv -Tf -- "$ENV_BACKUP" "$ENV_FILE"; then
      ENV_BACKUP=""
      REPLACED=0
    fi
  fi
  [ -z "$ENV_TEMP" ] || rm -f -- "$ENV_TEMP"
  if [ "$REPLACED" -eq 0 ]; then
    [ -z "$ENV_BACKUP" ] || rm -f -- "$ENV_BACKUP"
  fi
  unset PASSWORD HASH
  exit "$status"
}
trap cleanup EXIT
ENV_BACKUP="$(mktemp "$ENV_DIR/.env.backup.XXXXXX")"
ENV_TEMP="$(mktemp "$ENV_DIR/.env.new.XXXXXX")"

# 两个临时 inode 都由 umask 077 以 0600 创建；在原子替换前不放宽权限。
cp -- "$ENV_FILE" "$ENV_BACKUP"
grep -v '^TELEMETRY_ADMIN_PASSWORD_HASH=' "$ENV_FILE" > "$ENV_TEMP"
printf 'TELEMETRY_ADMIN_PASSWORD_HASH=%s\n' "$HASH" >> "$ENV_TEMP"
chmod 600 "$ENV_BACKUP" "$ENV_TEMP"
chown "$ENV_OWNER" "$ENV_BACKUP" "$ENV_TEMP"
mv -Tf -- "$ENV_TEMP" "$ENV_FILE"
ENV_TEMP=""
REPLACED=1
unset HASH

restore_previous_env() {
  if [ "$REPLACED" -eq 1 ] && [ -f "$ENV_BACKUP" ]; then
    mv -Tf -- "$ENV_BACKUP" "$ENV_FILE"
    ENV_BACKUP=""
    REPLACED=0
  fi
}

if ! systemctl restart "$SERVICE_NAME"; then
  echo "ERROR: 服务重启失败，恢复原管理密码" >&2
  restore_previous_env
  systemctl restart "$SERVICE_NAME" >/dev/null 2>&1 || true
  exit 1
fi
sleep "$HEALTH_DELAY"
if ! systemctl is-active --quiet "$SERVICE_NAME"; then
  echo "ERROR: 服务未保持 active，恢复原管理密码" >&2
  restore_previous_env
  systemctl restart "$SERVICE_NAME" >/dev/null 2>&1 || true
  exit 1
fi

[ -z "$ENV_BACKUP" ] || rm -f -- "$ENV_BACKUP"
ENV_BACKUP=""
REPLACED=0

echo "管理页密码已更新并重启服务。"
if [ "$GENERATED" -eq 1 ]; then
  echo "新密码（仅此一次显示，请妥善保存）: $PASSWORD"
fi
unset PASSWORD
