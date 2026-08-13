#!/usr/bin/env bash
# One-time, root-only bootstrap for the production SSH deployment account.
# Run this script on the server; routine GitHub Actions deployments never use sudo.
set -euo pipefail

DEPLOY_USER="${1:-hashteam-deploy}"
EXPECTED_KEY_FINGERPRINT="${2:-}"
STAGED_PUBLIC_KEY="${3:-/tmp/hashteam-actions-key.pub}"
DEPLOY_ROOT="${4:-/var/www/hashteam}"
MANUAL_DEPLOY_USER="${5:-lwzheng}"

[[ "$(id -u)" -eq 0 ]] || {
  echo "ERROR: provision-deploy-user.sh 必须以 root 运行" >&2
  exit 1
}
case "$DEPLOY_USER" in
  *[!A-Za-z0-9._-]*|'') echo "ERROR: 部署用户名无效" >&2; exit 2 ;;
esac
case "$MANUAL_DEPLOY_USER" in
  *[!A-Za-z0-9._-]*|'') echo "ERROR: 手工发布用户名无效" >&2; exit 2 ;;
esac
[[ "$EXPECTED_KEY_FINGERPRINT" =~ ^SHA256:[A-Za-z0-9+/]+$ ]] || {
  echo "ERROR: 缺少有效的部署公钥指纹" >&2
  exit 2
}
case "$DEPLOY_ROOT" in
  /var/www/*) ;;
  *) echo "ERROR: 部署根目录必须位于 /var/www/ 下" >&2; exit 2 ;;
esac
[[ "$DEPLOY_ROOT" != "/var/www" && "$DEPLOY_ROOT" != "/var/www/" ]] || {
  echo "ERROR: 拒绝使用过宽的部署根目录" >&2
  exit 2
}
[[ -f "$STAGED_PUBLIC_KEY" && ! -L "$STAGED_PUBLIC_KEY" ]] || {
  echo "ERROR: 暂存部署公钥不存在或不是普通文件" >&2
  exit 1
}

read -r key_type key_material key_comment key_extra < "$STAGED_PUBLIC_KEY"
[[ "$key_type" == "ssh-ed25519" ]] || {
  echo "ERROR: 部署公钥必须使用 Ed25519" >&2
  exit 1
}
[[ "$key_material" =~ ^[A-Za-z0-9+/=]+$ ]] || {
  echo "ERROR: 部署公钥编码无效" >&2
  exit 1
}
[[ "$key_comment" == "github-actions-hashteam" && -z "${key_extra:-}" ]] || {
  echo "ERROR: 部署公钥注释或字段数量不符合预期" >&2
  exit 1
}
actual_fingerprint="$(ssh-keygen -lf "$STAGED_PUBLIC_KEY" | awk '{print $2}')"
[[ "$actual_fingerprint" == "$EXPECTED_KEY_FINGERPRINT" ]] || {
  echo "ERROR: 暂存部署公钥的指纹不匹配" >&2
  exit 1
}

if ! getent group "$DEPLOY_USER" >/dev/null; then
  groupadd --system "$DEPLOY_USER"
fi

if ! getent passwd "$DEPLOY_USER" >/dev/null; then
  useradd \
    --system \
    --create-home \
    --home-dir "/home/$DEPLOY_USER" \
    --gid "$DEPLOY_USER" \
    --shell /bin/bash \
    "$DEPLOY_USER"
fi

deploy_home="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"
deploy_shell="$(getent passwd "$DEPLOY_USER" | cut -d: -f7)"
deploy_group="$(id -gn "$DEPLOY_USER")"
[[ "$deploy_home" == "/home/$DEPLOY_USER" ]] || {
  echo "ERROR: 已有部署账号的 home 不符合预期" >&2
  exit 1
}
[[ "$deploy_shell" == "/bin/bash" ]] || {
  echo "ERROR: 已有部署账号的 shell 不符合预期" >&2
  exit 1
}
[[ "$deploy_group" == "$DEPLOY_USER" ]] || {
  echo "ERROR: 已有部署账号的主组不符合预期" >&2
  exit 1
}
if id -nG "$DEPLOY_USER" | tr ' ' '\n' | grep -qx sudo; then
  echo "ERROR: 部署账号不得属于 sudo 组" >&2
  exit 1
fi

passwd --lock "$DEPLOY_USER" >/dev/null
install -d -m 0750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$deploy_home"
install -d -m 0700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$deploy_home/.ssh"

authorized_keys_tmp="$deploy_home/.ssh/.authorized_keys.new"
printf 'restrict %s %s %s\n' \
  "$key_type" \
  "$key_material" \
  "$key_comment" \
  > "$authorized_keys_tmp"
chown "$DEPLOY_USER:$DEPLOY_USER" "$authorized_keys_tmp"
chmod 0600 "$authorized_keys_tmp"
mv -f "$authorized_keys_tmp" "$deploy_home/.ssh/authorized_keys"

getent passwd "$MANUAL_DEPLOY_USER" >/dev/null || {
  echo "ERROR: 手工发布账号不存在：$MANUAL_DEPLOY_USER" >&2
  exit 1
}
usermod -aG "$DEPLOY_USER" "$MANUAL_DEPLOY_USER"

install -d -m 2775 \
  -o "$MANUAL_DEPLOY_USER" \
  -g "$DEPLOY_USER" \
  "$DEPLOY_ROOT/artifacts"

for path in \
  "$DEPLOY_ROOT" \
  "$DEPLOY_ROOT/releases" \
  "$DEPLOY_ROOT/vm-assets" \
  "$DEPLOY_ROOT/artifacts"; do
  [[ -d "$path" && ! -L "$path" ]] || {
    echo "ERROR: 部署目录不存在或不是普通目录：$path" >&2
    exit 1
  }
  chgrp "$DEPLOY_USER" "$path"
  chmod 2775 "$path"
done

# Existing shared VM assets and downloadable artifacts may have been created by
# the manual account. Grant the deploy group access without touching sources/.
for shared_path in "$DEPLOY_ROOT/vm-assets" "$DEPLOY_ROOT/artifacts"; do
  chgrp -R "$DEPLOY_USER" "$shared_path"
  chmod -R g+rwX "$shared_path"
  find "$shared_path" -type d -exec chmod g+s {} +
done

unlink "$STAGED_PUBLIC_KEY"

echo "✓ 专用部署账号已初始化"
id "$DEPLOY_USER"
for path in \
  "$DEPLOY_ROOT" \
  "$DEPLOY_ROOT/releases" \
  "$DEPLOY_ROOT/vm-assets" \
  "$DEPLOY_ROOT/artifacts"; do
  stat -c '%A %U:%G %n' "$path"
done
