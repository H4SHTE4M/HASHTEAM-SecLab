#!/usr/bin/env bash
# Optionally download and verify the source set corresponding to the VM build.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT="${1:-$ROOT/vm/.cache/corresponding-source}"

commit="$(git -C "$ROOT" rev-parse HEAD)"
source_id="$commit"
working_tree="clean"
if [[ -n "$(git -C "$ROOT" status --porcelain --untracked-files=normal)" ]]; then
  working_tree="dirty"
  source_id="${commit}-dirty"
  if [[ "${ALLOW_DIRTY_SOURCE:-0}" != "1" ]]; then
    echo "ERROR: 对应源码要求工作区已提交且干净；仅本地验证可显式设置 ALLOW_DIRTY_SOURCE=1" >&2
    exit 1
  fi
fi
mkdir -p "$OUTPUT"

download_verified() {
  local url="$1"
  local name="$2"
  local expected="$3"
  local seed="${4:-}"
  local destination="$OUTPUT/$name"

  if ! printf '%s  %s\n' "$expected" "$destination" | sha256sum -c - >/dev/null 2>&1; then
    if [ -n "$seed" ] &&
      printf '%s  %s\n' "$expected" "$seed" | sha256sum -c - >/dev/null 2>&1; then
      cp "$seed" "$destination.part"
    else
      if ! curl -fSL --retry 3 -o "$destination.part" "$url"; then
        unlink "$destination.part" 2>/dev/null || true
        return 1
      fi
    fi
    if ! printf '%s  %s\n' "$expected" "$destination.part" | sha256sum -c -; then
      unlink "$destination.part" 2>/dev/null || true
      return 1
    fi
    mv "$destination.part" "$destination"
  fi
  chmod 0644 "$destination"
}

download_verified \
  "https://mirrors.aliyun.com/linux-kernel/v6.x/linux-6.12.98.tar.xz" \
  "linux-6.12.98.tar.xz" \
  "a62b6a2d207ff72510e5f47156b7078e1e71797357412411b8e4fff97fc8f4c7" \
  "$ROOT/vm/.cache/linux-6.12.98.tar.xz"

download_verified \
  "https://deb.debian.org/debian/pool/main/b/busybox/busybox_1.38.0.orig.tar.bz2" \
  "busybox_1.38.0.orig.tar.bz2" \
  "34f9ea6ff8636f2c9241153b9114eefa9e65674a45318ae1ef95bb5f31c53bb2" \
  "$ROOT/vm/.cache/busybox-1.38.0.tar.bz2"
download_verified \
  "https://deb.debian.org/debian/pool/main/b/busybox/busybox_1.38.0-3.debian.tar.xz" \
  "busybox_1.38.0-3.debian.tar.xz" \
  "9493090e7456abb7707a356ab71a810065b555fdeddc6f71d4dd1dc09ebc342f"
download_verified \
  "https://deb.debian.org/debian/pool/main/b/busybox/busybox_1.38.0-3.dsc" \
  "busybox_1.38.0-3.dsc" \
  "7c3b52b1dd3792b57681b26adfdaefab77de25f1d453e8ffb78187624a3bc57c"

# Debian busybox-static declares Built-Using: glibc (= 2.42-17).
download_verified \
  "https://deb.debian.org/debian/pool/main/g/glibc/glibc_2.42.orig.tar.xz" \
  "glibc_2.42.orig.tar.xz" \
  "69c1e915c8edd75981cbfc6b7654e8fc4e52a48d06b9f706f463492749a9b6fb"
download_verified \
  "https://deb.debian.org/debian/pool/main/g/glibc/glibc_2.42-17.debian.tar.xz" \
  "glibc_2.42-17.debian.tar.xz" \
  "89b79a67661b89a4160ef1b2f01a1eb7b428c686f18de463581b408ba9765e62"
download_verified \
  "https://deb.debian.org/debian/pool/main/g/glibc/glibc_2.42-17.dsc" \
  "glibc_2.42-17.dsc" \
  "d004ab83368dec1f86aec110d13d1eaf21b261416e5f7c74f18c8b9ce2d02b79"

# The reviewed AOSC glibc+32 static library used for busybox-suid is built
# from the pristine GNU tarball plus the recipe vendored in the project archive.
download_verified \
  "https://ftp.gnu.org/gnu/glibc/glibc-2.42.tar.xz" \
  "glibc-2.42.tar.xz" \
  "d1775e32e4628e64ef930f435b67bb63af7599acb6be2b335b9f19f16509f17f"

download_verified \
  "https://deb.debian.org/debian/pool/main/s/seabios/seabios_1.16.3.orig.tar.gz" \
  "seabios_1.16.3.orig.tar.gz" \
  "374dd8f6938e1673b084de4b2964514f7f9fd1b60eca1c12066c484d26286272"
download_verified \
  "https://deb.debian.org/debian/pool/main/s/seabios/seabios_1.16.3-2.debian.tar.xz" \
  "seabios_1.16.3-2.debian.tar.xz" \
  "237583c39828f9f5f7bb6f40ba2321f632911ea9891ddc79f54d5e4f0c7b726d"
download_verified \
  "https://deb.debian.org/debian/pool/main/s/seabios/seabios_1.16.3-2.dsc" \
  "seabios_1.16.3-2.dsc" \
  "1a95960c0f7e5c5a4c04bed1b5c3359b7518099b15a4ab8e8d37f50b8c3f6b36"

# Archive the exact current project sources, including reviewed working-tree
# changes, while excluding ignored build caches, dependencies and credentials.
project_archive="$OUTPUT/hashteam-seclab-project-source-${source_id}.tar.gz"
project_archive_part="${project_archive}.part"
project_tar_part="$OUTPUT/.project-source-${source_id}.tar.part"
file_list="$OUTPUT/.project-files"
source_id_file="$OUTPUT/.hashteam-source-id"
checksum_part="$OUTPUT/SHA256SUMS-${source_id}.part"
readme_part="$OUTPUT/README-${source_id}.txt.part"

cleanup_transient_files() {
  local transient
  for transient in \
    "$project_archive_part" \
    "$project_tar_part" \
    "$file_list" \
    "$source_id_file" \
    "$checksum_part" \
    "$readme_part"; do
    if [ -e "$transient" ] || [ -L "$transient" ]; then
      unlink "$transient"
    fi
  done
}
trap cleanup_transient_files EXIT

git -C "$ROOT" ls-files --cached --others --exclude-standard -z > "$file_list"
printf '%s\n' "$source_id" > "$source_id_file"
tar -C "$ROOT" \
  --null --files-from="$file_list" \
  --sort=name --mtime='@0' --owner=0 --group=0 --numeric-owner \
  --transform='s,^,hashteam-seclab/,' \
  -cf "$project_tar_part"
tar -C "$OUTPUT" \
  --mtime='@0' --owner=0 --group=0 --numeric-owner \
  --transform='s,^\.hashteam-source-id$,hashteam-seclab/.hashteam-source-id,' \
  -rf "$project_tar_part" .hashteam-source-id
gzip -n -9 < "$project_tar_part" > "$project_archive_part"
mv "$project_archive_part" "$project_archive"
chmod 0644 "$project_archive"
unlink "$file_list"
unlink "$source_id_file"
unlink "$project_tar_part"

(
  cd "$OUTPUT"
  sha256sum \
    linux-6.12.98.tar.xz \
    busybox_1.38.0.orig.tar.bz2 \
    busybox_1.38.0-3.debian.tar.xz \
    busybox_1.38.0-3.dsc \
    glibc_2.42.orig.tar.xz \
    glibc_2.42-17.debian.tar.xz \
    glibc_2.42-17.dsc \
    glibc-2.42.tar.xz \
    seabios_1.16.3.orig.tar.gz \
    seabios_1.16.3-2.debian.tar.xz \
    seabios_1.16.3-2.dsc \
    "hashteam-seclab-project-source-${source_id}.tar.gz" \
    > "$(basename "$checksum_part")"
  mv "$(basename "$checksum_part")" "SHA256SUMS-${source_id}"
  chmod 0644 "SHA256SUMS-${source_id}"
)

printf '%s\n' \
  "HASHTEAM Security Lab corresponding source" \
  "" \
  "Source ID: $source_id" \
  "Project commit: $commit" \
  "Working tree: $working_tree" \
  "The project archive embeds this value in .hashteam-source-id for verified rebuilds." \
  "Generated (UTC): $(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  "Verify with: sha256sum -c SHA256SUMS-$source_id" \
  > "$readme_part"
mv "$readme_part" "$OUTPUT/README-${source_id}.txt"
chmod 0644 "$OUTPUT/README-${source_id}.txt"

echo "✓ 对应源码已准备：$OUTPUT（source ID: $source_id）"
