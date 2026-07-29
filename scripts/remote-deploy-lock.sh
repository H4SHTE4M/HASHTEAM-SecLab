#!/usr/bin/env bash
# Remote lease used by deploy-release.sh. This file is streamed to the
# deployment host over SSH; it is not installed on the server.
set -euo pipefail

usage() {
  echo "usage: remote-deploy-lock.sh <acquire|refresh|release> ROOT TOKEN [STALE_SECONDS]" >&2
  exit 2
}

[[ "$#" -ge 3 ]] || usage
ACTION="$1"
ROOT="$2"
TOKEN="$3"
STALE_SECONDS="${4:-}"
LOCK="$ROOT/.deploy-lock"

if [[ "${DEPLOY_LOCK_TEST_ROOT:-}" == "1" ]]; then
  case "$ROOT" in
    /tmp/*) ;;
    *) echo "ERROR: test deploy lock root must be below /tmp" >&2; exit 2 ;;
  esac
else
  case "$ROOT" in
    /var/www/*) ;;
    *) echo "ERROR: deploy lock root must be below /var/www" >&2; exit 2 ;;
  esac
fi
case "$ROOT" in
  *[!A-Za-z0-9._/-]*) echo "ERROR: deploy lock root contains invalid characters" >&2; exit 2 ;;
esac
[[ "$TOKEN" =~ ^[a-f0-9]{40}-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}-[0-9]+$ ]] || {
  echo "ERROR: invalid deploy lock token" >&2
  exit 2
}

read_owner() {
  local directory="$1"
  [[ -f "$directory/owner" && ! -L "$directory/owner" ]] || return 1
  cat "$directory/owner"
}

read_heartbeat() {
  local directory="$1"
  local heartbeat
  if [[ -f "$directory/heartbeat" && ! -L "$directory/heartbeat" ]]; then
    heartbeat="$(cat "$directory/heartbeat")"
    [[ "$heartbeat" =~ ^[0-9]+$ ]] || return 1
    printf '%s\n' "$heartbeat"
    return
  fi
  if [[ -f "$directory/owner" && ! -L "$directory/owner" ]]; then
    stat -c '%Y' "$directory/owner"
    return
  fi
  stat -c '%Y' "$directory"
}

write_heartbeat() {
  local now
  now="$(date +%s)"
  printf '%s\n' "$now" > "$LOCK/heartbeat.next"
  chmod 0660 "$LOCK/heartbeat.next"
  [[ "$(read_owner "$LOCK")" == "$TOKEN" ]]
  mv -f "$LOCK/heartbeat.next" "$LOCK/heartbeat"
}

remove_known_lock_directory() {
  local directory="$1"
  local entry
  local name
  for entry in "$directory"/* "$directory"/.[!.]* "$directory"/..?*; do
    [[ -e "$entry" || -L "$entry" ]] || continue
    name="${entry##*/}"
    case "$name" in
      owner|heartbeat|heartbeat.next)
        [[ -f "$entry" && ! -L "$entry" ]] || {
          echo "ERROR: deploy lock contains a non-regular $name entry" >&2
          return 1
        }
        ;;
      *)
        echo "ERROR: deploy lock contains unexpected entry: $name" >&2
        return 1
        ;;
    esac
  done
  for name in heartbeat.next heartbeat owner; do
    if [[ -e "$directory/$name" ]]; then
      unlink "$directory/$name"
    fi
  done
  rmdir "$directory"
}

create_lock() {
  local candidate="${LOCK}.candidate-${TOKEN}"
  local now
  [[ ! -e "$candidate" && ! -L "$candidate" ]] || return 1
  mkdir "$candidate" || return 1
  if ! chmod 2770 "$candidate" ||
    ! printf '%s\n' "$TOKEN" > "$candidate/owner" ||
    ! chmod 0660 "$candidate/owner"; then
    remove_known_lock_directory "$candidate" 2>/dev/null || true
    return 1
  fi
  now="$(date +%s)"
  if ! printf '%s\n' "$now" > "$candidate/heartbeat" ||
    ! chmod 0660 "$candidate/heartbeat"; then
    remove_known_lock_directory "$candidate" 2>/dev/null || true
    return 1
  fi
  if mv -T "$candidate" "$LOCK" 2>/dev/null; then
    return
  fi
  remove_known_lock_directory "$candidate"
  return 1
}

acquire_lock() {
  [[ "$STALE_SECONDS" =~ ^[0-9]+$ ]] &&
    (( STALE_SECONDS >= 1 && STALE_SECONDS <= 3600 )) || {
      echo "ERROR: invalid deploy lock stale interval" >&2
      exit 2
    }

  if [[ ! -e "$LOCK" && ! -L "$LOCK" ]]; then
    if create_lock; then
      return
    fi
    if [[ ! -e "$LOCK" && ! -L "$LOCK" ]]; then
      echo "ERROR: unable to create deploy lock" >&2
      exit 1
    fi
  fi
  [[ -d "$LOCK" && ! -L "$LOCK" ]] || {
    echo "ERROR: deploy lock path is not a regular directory" >&2
    exit 75
  }

  local observed_owner
  local observed_heartbeat
  local now
  local age
  observed_owner="$(read_owner "$LOCK")" || {
    echo "ERROR: existing deploy lock has no readable regular owner" >&2
    exit 75
  }
  [[ "$observed_owner" =~ ^[a-f0-9]{40}-[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}-[0-9]+$ ]] || {
    echo "ERROR: existing deploy lock owner is malformed" >&2
    exit 75
  }
  observed_heartbeat="$(read_heartbeat "$LOCK")" || {
    echo "ERROR: existing deploy lock heartbeat is malformed" >&2
    exit 75
  }
  now="$(date +%s)"
  if (( observed_heartbeat > now )); then
    age=0
  else
    age=$((now - observed_heartbeat))
  fi
  if (( age < STALE_SECONDS )); then
    echo "ERROR: active deploy lock owner=$observed_owner age=${age}s" >&2
    exit 75
  fi

  local quarantine="${LOCK}.reclaim-${TOKEN}"
  [[ ! -e "$quarantine" && ! -L "$quarantine" ]] || {
    echo "ERROR: deploy lock quarantine path already exists" >&2
    exit 75
  }
  mv "$LOCK" "$quarantine" || {
    echo "ERROR: deploy lock changed while attempting stale recovery" >&2
    exit 75
  }

  local quarantined_owner
  local quarantined_heartbeat
  quarantined_owner="$(read_owner "$quarantine")" || {
    echo "ERROR: quarantined deploy lock owner is unreadable; refusing automatic removal" >&2
    mv "$quarantine" "$LOCK" 2>/dev/null || true
    exit 75
  }
  quarantined_heartbeat="$(read_heartbeat "$quarantine")" || {
    echo "ERROR: quarantined deploy lock heartbeat is unreadable; refusing automatic removal" >&2
    mv "$quarantine" "$LOCK" 2>/dev/null || true
    exit 75
  }
  now="$(date +%s)"
  if (( quarantined_heartbeat > now )); then
    age=0
  else
    age=$((now - quarantined_heartbeat))
  fi
  if [[ "$quarantined_owner" != "$observed_owner" ]] ||
    (( age < STALE_SECONDS )); then
    echo "ERROR: deploy lock heartbeat changed during stale recovery" >&2
    mv "$quarantine" "$LOCK" 2>/dev/null || true
    exit 75
  fi
  remove_known_lock_directory "$quarantine" || {
    mv "$quarantine" "$LOCK" 2>/dev/null || true
    exit 75
  }
  echo "WARNING: reclaimed stale deploy lock owner=$observed_owner age=${age}s" >&2

  create_lock || exit 75
}

case "$ACTION" in
  acquire)
    acquire_lock
    ;;
  refresh)
    [[ -d "$LOCK" && ! -L "$LOCK" ]]
    [[ "$(read_owner "$LOCK")" == "$TOKEN" ]]
    write_heartbeat
    ;;
  release)
    [[ -d "$LOCK" && ! -L "$LOCK" ]]
    [[ "$(read_owner "$LOCK")" == "$TOKEN" ]]
    remove_known_lock_directory "$LOCK"
    ;;
  *)
    usage
    ;;
esac
