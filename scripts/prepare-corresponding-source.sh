#!/usr/bin/env bash
# Optionally download and verify the source set corresponding to the VM build.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT="${1:-$ROOT/vm/.cache/corresponding-source}"
archives_only="${SOURCE_ARCHIVES_ONLY:-0}"

case "$archives_only" in
  0|1) ;;
  *) echo "ERROR: SOURCE_ARCHIVES_ONLY 必须是 0 或 1" >&2; exit 2 ;;
esac

commit=""
source_id="archives-only"
working_tree="not-applicable"
if [[ "$archives_only" == "0" ]]; then
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
      if ! curl -fSL --retry 3 --retry-all-errors --connect-timeout 20 \
        -o "$destination.part" "$url"; then
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

# The static Binutils frontends use the locked Ubuntu i386 cross glibc.
download_verified \
  "https://ftp.gnu.org/gnu/binutils/binutils-2.42.tar.xz" \
  "binutils-2.42.tar.xz" \
  "f6e4d41fd5fc778b06b7891457b3620da5ecea1006c6a4a41ae998109f85a800" \
  "$ROOT/vm/.cache/binutils-2.42.tar.xz"
download_verified \
  "https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/glibc/2.39-0ubuntu8/glibc_2.39.orig.tar.xz" \
  "glibc_2.39.orig.tar.xz" \
  "f77bd47cf8170c57365ae7bf86696c118adb3b120d3259c64c502d3dc1e2d926"
download_verified \
  "https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/glibc/2.39-0ubuntu8/glibc_2.39-0ubuntu8.debian.tar.xz" \
  "glibc_2.39-0ubuntu8.debian.tar.xz" \
  "24d8627f34850f05554158b085499d255c67af27be9762d6a911b168852c1dd2"
download_verified \
  "https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/glibc/2.39-0ubuntu8/glibc_2.39-0ubuntu8.dsc" \
  "glibc_2.39-0ubuntu8.dsc" \
  "af44b50b4aba75916f920337523d89698c465fafb720268bb87b2555000bea7a"

# Native GDB fallback (Python, gdbserver, TUI and network support are disabled).
download_verified \
  "https://ftp.gnu.org/gnu/gdb/gdb-15.1.tar.xz" \
  "gdb-15.1.tar.xz" \
  "38254eacd4572134bca9c5a5aa4d4ca564cbbd30c369d881f733fb6b903354f2" \
  "$ROOT/vm/.cache/gdb-15.1.tar.xz"

# GDB is statically linked with the locked Ubuntu cross glibc/GCC runtime and
# native i386 development archives. Keep every pristine source and Ubuntu patch
# archive needed to rebuild or relink the distributed executable.
download_verified \
  "https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/gcc-13/13.3.0-6ubuntu2%7E24.04.1/gcc-13_13.3.0.orig.tar.gz" \
  "gcc-13_13.3.0.orig.tar.gz" \
  "3b85d91bf38d1b858d9d01134f4046b3359731968ed4e6e912d29717a35d1a46"
download_verified \
  "https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/gcc-13/13.3.0-6ubuntu2%7E24.04.1/gcc-13_13.3.0-6ubuntu2%7E24.04.1.debian.tar.xz" \
  "gcc-13_13.3.0-6ubuntu2~24.04.1.debian.tar.xz" \
  "5523658f272ad6d15a83b6e26d178fbd5cb7709ec7ce2ca52b0c843e19c228e3"
download_verified \
  "https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/gcc-13/13.3.0-6ubuntu2%7E24.04.1/gcc-13_13.3.0-6ubuntu2%7E24.04.1.dsc" \
  "gcc-13_13.3.0-6ubuntu2~24.04.1.dsc" \
  "86b4012c312ac13e3e092877719a62a5b5dbab082ae7e9680780a25c6a13ddc6"
download_verified \
  "https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/gmp/2%3A6.3.0%2Bdfsg-2ubuntu6.1/gmp_6.3.0%2Bdfsg.orig.tar.xz" \
  "gmp_6.3.0+dfsg.orig.tar.xz" \
  "bd2966e6d277f79328e894a5a9f3ba3fbf2ed2be81def5f48623e30c23fb1572"
download_verified \
  "https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/gmp/2%3A6.3.0%2Bdfsg-2ubuntu6.1/gmp_6.3.0%2Bdfsg-2ubuntu6.1.debian.tar.xz" \
  "gmp_6.3.0+dfsg-2ubuntu6.1.debian.tar.xz" \
  "0a7592ee94876fcc0dba60c9a9fba806a72752c104c04d553803e1b7a97026a3"
download_verified \
  "https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/gmp/2%3A6.3.0%2Bdfsg-2ubuntu6.1/gmp_6.3.0%2Bdfsg-2ubuntu6.1.dsc" \
  "gmp_6.3.0+dfsg-2ubuntu6.1.dsc" \
  "7fdd2464ee453296e33598dad6f84dd489640c08f50552389469bcf90537582e"
download_verified \
  "https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/mpfr4/4.2.1-1build1.1/mpfr4_4.2.1.orig.tar.xz" \
  "mpfr4_4.2.1.orig.tar.xz" \
  "277807353a6726978996945af13e52829e3abd7a9a5b7fb2793894e18f1fcbb2"
download_verified \
  "https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/mpfr4/4.2.1-1build1.1/mpfr4_4.2.1-1build1.1.debian.tar.xz" \
  "mpfr4_4.2.1-1build1.1.debian.tar.xz" \
  "55770c471715c710690129e45c627d77da05547a8f6faee81dd420a9b2b5fded"
download_verified \
  "https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/mpfr4/4.2.1-1build1.1/mpfr4_4.2.1-1build1.1.dsc" \
  "mpfr4_4.2.1-1build1.1.dsc" \
  "9adabba2fbe45f0705b630b9b225752d945718ed4742b1c5b9fb1aa0fbcd0766"
download_verified \
  "https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/expat/2.6.1-2ubuntu0.4/expat_2.6.1.orig.tar.gz" \
  "expat_2.6.1.orig.tar.gz" \
  "14113ed69357172a0bf5a268793c8b5b01afc77c7a2e5fb8dd0b06cb87c02c4a"
download_verified \
  "https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/expat/2.6.1-2ubuntu0.4/expat_2.6.1-2ubuntu0.4.debian.tar.xz" \
  "expat_2.6.1-2ubuntu0.4.debian.tar.xz" \
  "8a24bd6c87fe292a2f00a2df71f7d2bbe3713fa63b1952c8552cdac4288d10fd"
download_verified \
  "https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/expat/2.6.1-2ubuntu0.4/expat_2.6.1-2ubuntu0.4.dsc" \
  "expat_2.6.1-2ubuntu0.4.dsc" \
  "a25d3fde103454ad5d34d4770bd5adb60bb5872da775df74cad193b5c4de1dff"
download_verified \
  "https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/ncurses/6.4%2B20240113-1ubuntu2.1/ncurses_6.4%2B20240113.orig.tar.gz" \
  "ncurses_6.4+20240113.orig.tar.gz" \
  "37a12a0f8ae2605012c9a164dd286b0cfa02b51b5055836d09eb3d597fc351b1"
download_verified \
  "https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/ncurses/6.4%2B20240113-1ubuntu2.1/ncurses_6.4%2B20240113-1ubuntu2.1.debian.tar.xz" \
  "ncurses_6.4+20240113-1ubuntu2.1.debian.tar.xz" \
  "5d86811c8c9c3fab79c9d644a00ee31b4113b969d32b0bb05b5d3e7c2bcea9ac"
download_verified \
  "https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/ncurses/6.4%2B20240113-1ubuntu2.1/ncurses_6.4%2B20240113-1ubuntu2.1.dsc" \
  "ncurses_6.4+20240113-1ubuntu2.1.dsc" \
  "87d71c553da108e83c4985e0bca8b944db2dd7931105e511a61e77faf1b415b7"
download_verified \
  "https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/zlib/1%3A1.3.dfsg-3.1ubuntu2.1/zlib_1.3.dfsg.orig.tar.xz" \
  "zlib_1.3.dfsg.orig.tar.xz" \
  "5eea0322c1c21c75cad3b607ac1c43ff5c71e014b8ac4a34300b5e2b80d02e70"
download_verified \
  "https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/zlib/1%3A1.3.dfsg-3.1ubuntu2.1/zlib_1.3.dfsg-3.1ubuntu2.1.debian.tar.xz" \
  "zlib_1.3.dfsg-3.1ubuntu2.1.debian.tar.xz" \
  "958c7031c02f894516492954153c8d760d94e20a4039e48ca7231880b913ae26"
download_verified \
  "https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/zlib/1%3A1.3.dfsg-3.1ubuntu2.1/zlib_1.3.dfsg-3.1ubuntu2.1.dsc" \
  "zlib_1.3.dfsg-3.1ubuntu2.1.dsc" \
  "d083d6e1eb6f7f0dc5b107b0cc6b898f097947e1317769553f1c5c5d71ea5073"

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

source_archives=(
  linux-6.12.98.tar.xz
  busybox_1.38.0.orig.tar.bz2
  busybox_1.38.0-3.debian.tar.xz
  busybox_1.38.0-3.dsc
  glibc_2.42.orig.tar.xz
  glibc_2.42-17.debian.tar.xz
  glibc_2.42-17.dsc
  glibc-2.42.tar.xz
  binutils-2.42.tar.xz
  gdb-15.1.tar.xz
  gcc-13_13.3.0.orig.tar.gz
  gcc-13_13.3.0-6ubuntu2~24.04.1.debian.tar.xz
  gcc-13_13.3.0-6ubuntu2~24.04.1.dsc
  gmp_6.3.0+dfsg.orig.tar.xz
  gmp_6.3.0+dfsg-2ubuntu6.1.debian.tar.xz
  gmp_6.3.0+dfsg-2ubuntu6.1.dsc
  mpfr4_4.2.1.orig.tar.xz
  mpfr4_4.2.1-1build1.1.debian.tar.xz
  mpfr4_4.2.1-1build1.1.dsc
  expat_2.6.1.orig.tar.gz
  expat_2.6.1-2ubuntu0.4.debian.tar.xz
  expat_2.6.1-2ubuntu0.4.dsc
  ncurses_6.4+20240113.orig.tar.gz
  ncurses_6.4+20240113-1ubuntu2.1.debian.tar.xz
  ncurses_6.4+20240113-1ubuntu2.1.dsc
  zlib_1.3.dfsg.orig.tar.xz
  zlib_1.3.dfsg-3.1ubuntu2.1.debian.tar.xz
  zlib_1.3.dfsg-3.1ubuntu2.1.dsc
  glibc_2.39.orig.tar.xz
  glibc_2.39-0ubuntu8.debian.tar.xz
  glibc_2.39-0ubuntu8.dsc
  seabios_1.16.3.orig.tar.gz
  seabios_1.16.3-2.debian.tar.xz
  seabios_1.16.3-2.dsc
)

if [[ "$archives_only" == "1" ]]; then
  (
    cd "$OUTPUT"
    sha256sum "${source_archives[@]}" > SHA256SUMS-archives-only
  )
  echo "✓ 第三方对应源码归档已下载并校验：$OUTPUT"
  exit 0
fi

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
  sha256sum "${source_archives[@]}" \
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
