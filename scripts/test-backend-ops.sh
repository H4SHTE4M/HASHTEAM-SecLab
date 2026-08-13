#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY="$ROOT/backend/deploy.sh"
SET_PASSWORD="$ROOT/backend/set-admin-password.sh"
TEST_ROOT="$(mktemp -d /tmp/hashteam-backend-ops-test.XXXXXX)"
FAKE_BIN="$TEST_ROOT/bin"
REAL_GREP="$(command -v grep)"

cleanup() {
  local status=$?
  rm -rf -- "$TEST_ROOT"
  exit "$status"
}
trap cleanup EXIT

expect_status() {
  local expected="$1"
  shift
  local status
  if "$@"; then
    status=0
  else
    status=$?
  fi
  if [ "$status" -ne "$expected" ]; then
    echo "ERROR: expected status $expected, got $status: $*" >&2
    exit 1
  fi
}

mkdir -p "$FAKE_BIN"
cat > "$FAKE_BIN/pnpm" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [ -n "${PNPM_OBSERVE_CURRENT:-}" ]; then
  if [ -L "${TELEMETRY_INSTALL_DIR}/current" ]; then
    readlink "${TELEMETRY_INSTALL_DIR}/current" > "$PNPM_OBSERVE_CURRENT"
  else
    printf 'missing\n' > "$PNPM_OBSERVE_CURRENT"
  fi
fi
if [ "${PNPM_FAIL:-0}" -eq 1 ]; then
  exit 42
fi
mkdir -p node_modules
EOF
cat > "$FAKE_BIN/systemctl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [ "${1:-}" = "restart" ] && [ "${SYSTEMCTL_FAIL_RESTART:-0}" -eq 1 ]; then
  exit 1
fi
if [ "${1:-}" = "is-active" ] && [ "${SYSTEMCTL_FAIL_ACTIVE:-0}" -eq 1 ]; then
  exit 1
fi
exit 0
EOF
cat > "$FAKE_BIN/systemd-analyze" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [ -n "${SYSTEMD_ANALYZE_OBSERVE_CURRENT:-}" ]; then
  readlink "${TELEMETRY_INSTALL_DIR}/current" > "$SYSTEMD_ANALYZE_OBSERVE_CURRENT"
fi
exit "${SYSTEMD_ANALYZE_STATUS:-0}"
EOF
cat > "$FAKE_BIN/chown" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat > "$FAKE_BIN/grep" <<EOF
#!/usr/bin/env bash
set -euo pipefail
if [ -n "\${OBSERVE_ENV_DIR:-}" ]; then
  for candidate in "\$OBSERVE_ENV_DIR"/.env.new.*; do
    if [ -e "\$candidate" ]; then
      stat -c '%a' "\$candidate" > "\$OBSERVE_ENV_DIR/temp-mode"
    fi
  done
fi
exec "$REAL_GREP" "\$@"
EOF
chmod 755 "$FAKE_BIN"/*

CURRENT_USER="$(id -un)"
CURRENT_GROUP="$(id -gn)"
INSTALL_DIR="$TEST_ROOT/install"
DATA_DIR="$TEST_ROOT/data"
ENV_DIR="$TEST_ROOT/etc"
ENV_FILE="$ENV_DIR/env"
SERVICE_FILE="$TEST_ROOT/systemd/hashteam-telemetry.service"
OLD_RELEASE="$INSTALL_DIR/releases/old"
mkdir -p "$OLD_RELEASE" "$ENV_DIR" "$(dirname "$SERVICE_FILE")"
printf 'old active release bytes\n' > "$OLD_RELEASE/server.js"
printf 'old unit bytes\n' > "$SERVICE_FILE"
printf '%s\n' \
  'TELEMETRY_PORT=7841' \
  'TELEMETRY_EDGE_SECRET=existing-secret' \
  'TELEMETRY_ADMIN_PASSWORD_HASH=scrypt:16384:8:1:0011:2233' > "$ENV_FILE"
ln -s "$OLD_RELEASE" "$INSTALL_DIR/current"
cp "$OLD_RELEASE/server.js" "$TEST_ROOT/old-server.snapshot"
cp "$SERVICE_FILE" "$TEST_ROOT/old-unit.snapshot"
cp "$ENV_FILE" "$TEST_ROOT/old-env.snapshot"

run_deploy() {
  local release_id="$1"
  shift
  env \
    PATH="$FAKE_BIN:$PATH" \
    TELEMETRY_INSTALL_DIR="$INSTALL_DIR" \
    TELEMETRY_DATA_DIR="$DATA_DIR" \
    TELEMETRY_SERVICE_USER="$CURRENT_USER" \
    TELEMETRY_RELEASE_OWNER="$CURRENT_USER:$CURRENT_GROUP" \
    TELEMETRY_ENV_OWNER="$CURRENT_USER:$CURRENT_GROUP" \
    TELEMETRY_UNIT_OWNER="$CURRENT_USER:$CURRENT_GROUP" \
    TELEMETRY_SERVICE_FILE="$SERVICE_FILE" \
    TELEMETRY_ENV_FILE="$ENV_FILE" \
    TELEMETRY_HEALTH_DELAY=0 \
    TELEMETRY_RELEASE_ID="$release_id" \
    "$@" \
    bash "$DEPLOY" >/dev/null 2>&1
}

# Dependency installation failure must not mutate the active target or any byte
# in the active release.
expect_status 42 run_deploy install-failure PNPM_FAIL=1
[ "$(readlink "$INSTALL_DIR/current")" = "$OLD_RELEASE" ]
cmp "$OLD_RELEASE/server.js" "$TEST_ROOT/old-server.snapshot"
cmp "$SERVICE_FILE" "$TEST_ROOT/old-unit.snapshot"
cmp "$ENV_FILE" "$TEST_ROOT/old-env.snapshot"
[ ! -e "$INSTALL_DIR/releases/install-failure" ]

# A failure after the atomic switch must roll current, unit, and env back and
# remove the rejected release.
expect_status 1 run_deploy restart-failure SYSTEMCTL_FAIL_RESTART=1
[ "$(readlink "$INSTALL_DIR/current")" = "$OLD_RELEASE" ]
cmp "$OLD_RELEASE/server.js" "$TEST_ROOT/old-server.snapshot"
cmp "$SERVICE_FILE" "$TEST_ROOT/old-unit.snapshot"
cmp "$ENV_FILE" "$TEST_ROOT/old-env.snapshot"
[ ! -e "$INSTALL_DIR/releases/restart-failure" ]

# pnpm and the final pre-switch unit validation both observe the old current
# target. Only a fully checked release is made active, and the old target
# remains available through previous.
OBSERVED_INSTALL_CURRENT="$TEST_ROOT/current-during-install"
OBSERVED_VALIDATION_CURRENT="$TEST_ROOT/current-during-unit-validation"
run_deploy successful \
  PNPM_OBSERVE_CURRENT="$OBSERVED_INSTALL_CURRENT" \
  SYSTEMD_ANALYZE_OBSERVE_CURRENT="$OBSERVED_VALIDATION_CURRENT"
[ "$(cat "$OBSERVED_INSTALL_CURRENT")" = "$OLD_RELEASE" ]
[ "$(cat "$OBSERVED_VALIDATION_CURRENT")" = "$OLD_RELEASE" ]
NEW_RELEASE="$(readlink "$INSTALL_DIR/current")"
[ "$NEW_RELEASE" = "$INSTALL_DIR/releases/successful" ]
[ "$(readlink "$INSTALL_DIR/previous")" = "$OLD_RELEASE" ]
cmp "$NEW_RELEASE/server.js" "$ROOT/backend/server.js"

PASSWORD_ENV_DIR="$TEST_ROOT/password-env"
PASSWORD_ENV="$PASSWORD_ENV_DIR/env"
mkdir -p "$PASSWORD_ENV_DIR"
printf '%s\n' \
  'TELEMETRY_PORT=7841' \
  'TELEMETRY_EDGE_SECRET=password-test-secret' \
  'TELEMETRY_ADMIN_PASSWORD_HASH=old-hash' > "$PASSWORD_ENV"
cp "$PASSWORD_ENV" "$TEST_ROOT/password-env.snapshot"

run_password() {
  local fail_restart="$1"
  shift
  env \
    PATH="$FAKE_BIN:$PATH" \
    SYSTEMCTL_FAIL_RESTART="$fail_restart" \
    TELEMETRY_ENV_FILE="$PASSWORD_ENV" \
    TELEMETRY_ENV_OWNER="$CURRENT_USER:$CURRENT_GROUP" \
    TELEMETRY_HEALTH_DELAY=0 \
    bash "$SET_PASSWORD" "$@" >/dev/null 2>&1
}

# Positional password input is rejected before touching the env file.
expect_status 64 run_password 0 bash-history-password
cmp "$PASSWORD_ENV" "$TEST_ROOT/password-env.snapshot"

# The interactive path preserves leading and trailing whitespace exactly, and
# the replacement inode is already 0600 when grep first opens it.
PASSWORD='  twelve-visible-chars  '
printf '%s\n%s\n' "$PASSWORD" "$PASSWORD" > "$PASSWORD_ENV_DIR/tty-input"
env \
  PATH="$FAKE_BIN:$PATH" \
  OBSERVE_ENV_DIR="$PASSWORD_ENV_DIR" \
  TELEMETRY_ENV_FILE="$PASSWORD_ENV" \
  TELEMETRY_ENV_OWNER="$CURRENT_USER:$CURRENT_GROUP" \
  TELEMETRY_PASSWORD_TTY="$PASSWORD_ENV_DIR/tty-input" \
  TELEMETRY_HEALTH_DELAY=0 \
  bash "$SET_PASSWORD" >/dev/null 2>&1
[ "$(cat "$PASSWORD_ENV_DIR/temp-mode")" = "600" ]
HASH_LINE="$($REAL_GREP '^TELEMETRY_ADMIN_PASSWORD_HASH=' "$PASSWORD_ENV")"
PASSWORD_HASH="${HASH_LINE#TELEMETRY_ADMIN_PASSWORD_HASH=}"
TEST_PASSWORD="$PASSWORD" TEST_PASSWORD_HASH="$PASSWORD_HASH" node -e '
  const crypto = require("crypto")
  const parts = process.env.TEST_PASSWORD_HASH.split(":")
  const actual = crypto.scryptSync(
    process.env.TEST_PASSWORD,
    Buffer.from(parts[4], "hex"),
    32,
    { N: Number(parts[1]), r: Number(parts[2]), p: Number(parts[3]) },
  ).toString("hex")
  if (actual !== parts[5]) process.exit(1)
'

# Restart failure restores the exact previous env bytes and removes every temp.
cp "$PASSWORD_ENV" "$TEST_ROOT/password-before-failure.snapshot"
expect_status 1 run_password 1 --generate
cmp "$PASSWORD_ENV" "$TEST_ROOT/password-before-failure.snapshot"
if compgen -G "$PASSWORD_ENV_DIR/.env.new.*" >/dev/null || \
   compgen -G "$PASSWORD_ENV_DIR/.env.backup.*" >/dev/null; then
  echo 'ERROR: password rotation left temporary files behind' >&2
  exit 1
fi

echo '✓ backend release switching, rollback, password secrecy, and secure env replacement'
