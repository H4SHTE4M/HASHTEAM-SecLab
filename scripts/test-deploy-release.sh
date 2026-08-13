#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HELPER="$ROOT/scripts/remote-artifact-snapshot.sh"
TEST_ROOT="$(mktemp -d /tmp/hashteam-deploy-release-test.XXXXXX)"
SHARED="$TEST_ROOT/artifacts"
CONTENT="content-addressed-sample"
HASH="$(printf '%s\n' "$CONTENT" | sha256sum | cut -d ' ' -f1)"
SOURCE="$SHARED/$HASH/sample"

cleanup() {
  local status=$?
  unset -f cp 2>/dev/null || true
  rm -rf -- "$TEST_ROOT"
  exit "$status"
}
trap cleanup EXIT

# shellcheck source=remote-artifact-snapshot.sh
source "$HELPER"
mkdir -p "$(dirname "$SOURCE")" "$TEST_ROOT/releases"
printf '%s\n' "$CONTENT" > "$SOURCE"

hardlink_snapshot="$TEST_ROOT/releases/hardlink/artifacts"
mkdir -p "$(dirname "$hardlink_snapshot")"
snapshot_release_artifacts "$SHARED" "$hardlink_snapshot"
cmp "$SOURCE" "$hardlink_snapshot/$HASH/sample"
[[ ! -L "$hardlink_snapshot/$HASH/sample" ]]
[[ "$(stat -c '%d:%i' "$SOURCE")" == "$(stat -c '%d:%i' "$hardlink_snapshot/$HASH/sample")" ]]

# Simulate a cross-filesystem hard-link failure and cover the reflink/copy fallback.
cp() {
  if [[ "${1:-}" == "-al" ]]; then
    return 1
  fi
  command cp "$@"
}
copy_snapshot="$TEST_ROOT/releases/copy/artifacts"
mkdir -p "$(dirname "$copy_snapshot")"
snapshot_release_artifacts "$SHARED" "$copy_snapshot"
unset -f cp
cmp "$SOURCE" "$copy_snapshot/$HASH/sample"
[[ ! -L "$copy_snapshot/$HASH/sample" ]]
[[ "$(stat -c '%d:%i' "$SOURCE")" != "$(stat -c '%d:%i' "$copy_snapshot/$HASH/sample")" ]]

# Both snapshot strategies failing must leave no release-visible partial tree.
cp() {
  return 1
}
failed_snapshot="$TEST_ROOT/releases/failed/artifacts"
mkdir -p "$(dirname "$failed_snapshot")"
if snapshot_release_artifacts "$SHARED" "$failed_snapshot" 2>/dev/null; then
  echo "ERROR: artifact snapshot ignored both copy failures" >&2
  exit 1
fi
unset -f cp
[[ ! -e "$failed_snapshot" && ! -L "$failed_snapshot" ]]

# Poisoned historical trees fail before a release-visible destination is created.
ln -s /etc/passwd "$SHARED/$HASH/unsafe"
unsafe_snapshot="$TEST_ROOT/releases/unsafe/artifacts"
mkdir -p "$(dirname "$unsafe_snapshot")"
if snapshot_release_artifacts "$SHARED" "$unsafe_snapshot" 2>/dev/null; then
  echo "ERROR: artifact snapshot accepted a source symlink" >&2
  exit 1
fi
[[ ! -e "$unsafe_snapshot" && ! -L "$unsafe_snapshot" ]]
unlink "$SHARED/$HASH/unsafe"
linked_hash="bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
ln -s "$HASH" "$SHARED/$linked_hash"
linked_directory_snapshot="$TEST_ROOT/releases/linked-directory/artifacts"
mkdir -p "$(dirname "$linked_directory_snapshot")"
if snapshot_release_artifacts "$SHARED" "$linked_directory_snapshot" 2>/dev/null; then
  echo "ERROR: artifact snapshot accepted a hash-directory symlink" >&2
  exit 1
fi
[[ ! -e "$linked_directory_snapshot" && ! -L "$linked_directory_snapshot" ]]
unlink "$SHARED/$linked_hash"

printf 'unscoped\n' > "$SHARED/unscoped"
unscoped_snapshot="$TEST_ROOT/releases/unscoped/artifacts"
mkdir -p "$(dirname "$unscoped_snapshot")"
if snapshot_release_artifacts "$SHARED" "$unscoped_snapshot" 2>/dev/null; then
  echo "ERROR: artifact snapshot accepted an unscoped regular file" >&2
  exit 1
fi
[[ ! -e "$unscoped_snapshot" && ! -L "$unscoped_snapshot" ]]
unlink "$SHARED/unscoped"

printf 'tampered\n' > "$SOURCE"
mismatched_snapshot="$TEST_ROOT/releases/mismatched/artifacts"
mkdir -p "$(dirname "$mismatched_snapshot")"
if snapshot_release_artifacts "$SHARED" "$mismatched_snapshot" 2>/dev/null; then
  echo "ERROR: artifact snapshot accepted content under the wrong SHA-256 directory" >&2
  exit 1
fi
[[ ! -e "$mismatched_snapshot" && ! -L "$mismatched_snapshot" ]]

echo "✓ deploy release artifact integrity, hard-link snapshot, copy fallback, failure cleanup, and poison rejection"
