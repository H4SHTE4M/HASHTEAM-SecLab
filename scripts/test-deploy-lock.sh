#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HELPER="$ROOT/scripts/remote-deploy-lock.sh"
TEST_ROOT="$(mktemp -d /tmp/hashteam-deploy-lock-test.XXXXXX)"
TOKEN_ONE="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-20260729T100000Z-111111111111-100"
TOKEN_TWO="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb-20260729T100100Z-222222222222-200"

cleanup() {
  local status=$?
  if [[ -d "$TEST_ROOT" ]]; then
    rm -rf -- "$TEST_ROOT"
  fi
  exit "$status"
}
trap cleanup EXIT

run_helper() {
  DEPLOY_LOCK_TEST_ROOT=1 bash "$HELPER" "$@"
}

expect_status() {
  local expected="$1"
  shift
  local status
  if "$@"; then
    status=0
  else
    status=$?
  fi
  [[ "$status" -eq "$expected" ]] || {
    echo "ERROR: expected status $expected, got $status: $*" >&2
    exit 1
  }
}

mkdir -p "$TEST_ROOT/site"
run_helper acquire "$TEST_ROOT/site" "$TOKEN_ONE" 60
[[ "$(cat "$TEST_ROOT/site/.deploy-lock/owner")" == "$TOKEN_ONE" ]]
[[ "$(cat "$TEST_ROOT/site/.deploy-lock/heartbeat")" =~ ^[0-9]+$ ]]

expect_status 75 run_helper acquire "$TEST_ROOT/site" "$TOKEN_TWO" 60
run_helper refresh "$TEST_ROOT/site" "$TOKEN_ONE"
expect_status 1 run_helper release "$TEST_ROOT/site" "$TOKEN_TWO"
run_helper release "$TEST_ROOT/site" "$TOKEN_ONE"
[[ ! -e "$TEST_ROOT/site/.deploy-lock" ]]

# A legacy lock without a heartbeat uses owner mtime as its lease and can be
# recovered once stale.
mkdir "$TEST_ROOT/site/.deploy-lock"
printf '%s\n' "$TOKEN_ONE" > "$TEST_ROOT/site/.deploy-lock/owner"
touch -d '@1' "$TEST_ROOT/site/.deploy-lock/owner"
run_helper acquire "$TEST_ROOT/site" "$TOKEN_TWO" 1
[[ "$(cat "$TEST_ROOT/site/.deploy-lock/owner")" == "$TOKEN_TWO" ]]
run_helper release "$TEST_ROOT/site" "$TOKEN_TWO"

# A current-format lease is reclaimed from its explicit heartbeat.
run_helper acquire "$TEST_ROOT/site" "$TOKEN_ONE" 60
printf '1\n' > "$TEST_ROOT/site/.deploy-lock/heartbeat"
run_helper acquire "$TEST_ROOT/site" "$TOKEN_TWO" 1
[[ "$(cat "$TEST_ROOT/site/.deploy-lock/owner")" == "$TOKEN_TWO" ]]
run_helper release "$TEST_ROOT/site" "$TOKEN_TWO"

# Unknown entries fail closed and are never recursively deleted.
run_helper acquire "$TEST_ROOT/site" "$TOKEN_ONE" 60
printf '1\n' > "$TEST_ROOT/site/.deploy-lock/heartbeat"
printf 'preserve\n' > "$TEST_ROOT/site/.deploy-lock/unexpected"
expect_status 75 run_helper acquire "$TEST_ROOT/site" "$TOKEN_TWO" 1
[[ "$(cat "$TEST_ROOT/site/.deploy-lock/unexpected")" == "preserve" ]]
unlink "$TEST_ROOT/site/.deploy-lock/unexpected"
run_helper release "$TEST_ROOT/site" "$TOKEN_ONE"

echo "✓ deploy lock lease acquisition, refresh, recovery, and fail-closed cleanup"
