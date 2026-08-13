#!/usr/bin/env bash
# Streamed into the remote release assembly shell and sourced by its fixture test.

validate_content_addressed_artifacts() {
  local root="$1"
  local label="$2"
  local entry relative expected actual
  local file_count=0

  [[ -d "$root" && ! -L "$root" ]] || {
    echo "ERROR: ${label} artifact 根目录无效：$root" >&2
    return 1
  }
  while IFS= read -r -d '' entry; do
    relative="${entry#"$root"/}"
    if [[ -L "$entry" ]]; then
      echo "ERROR: ${label} artifact 包含符号链接：$relative" >&2
      return 1
    elif [[ -d "$entry" ]]; then
      [[ "$relative" =~ ^[a-f0-9]{64}$ ]] || {
        echo "ERROR: ${label} artifact 目录不是 SHA-256：$relative" >&2
        return 1
      }
    elif [[ -f "$entry" ]]; then
      [[ "$relative" =~ ^([a-f0-9]{64})/[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || {
        echo "ERROR: ${label} artifact 路径未内容寻址：$relative" >&2
        return 1
      }
      expected="${BASH_REMATCH[1]}"
      actual="$(sha256sum -- "$entry")"
      actual="${actual%% *}"
      [[ "$actual" == "$expected" ]] || {
        echo "ERROR: ${label} artifact 内容哈希不匹配：$relative" >&2
        return 1
      }
      ((file_count += 1))
    else
      echo "ERROR: ${label} artifact 包含非普通文件：$relative" >&2
      return 1
    fi
  done < <(find "$root" -mindepth 1 -print0)
  ((file_count > 0)) || {
    echo "ERROR: ${label} artifact 根目录为空" >&2
    return 1
  }
}

snapshot_release_artifacts() {
  local shared_root="$1"
  local destination="$2"

  [[ ! -e "$destination" && ! -L "$destination" ]] || {
    echo "ERROR: release artifact 目标已存在：$destination" >&2
    return 1
  }
  validate_content_addressed_artifacts "$shared_root" "共享" || return 1

  mkdir "$destination"
  if ! cp -al "$shared_root/." "$destination/"; then
    rm -rf -- "$destination"
    mkdir "$destination"
    if ! cp -a --reflink=auto "$shared_root/." "$destination/"; then
      rm -rf -- "$destination"
      echo "ERROR: 无法建立 release artifact 快照" >&2
      return 1
    fi
  fi

  if ! validate_content_addressed_artifacts "$destination" "release"; then
    rm -rf -- "$destination"
    return 1
  fi
}
