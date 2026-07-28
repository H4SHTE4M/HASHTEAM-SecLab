#!/usr/bin/env python3
"""Verify the BusyBox SUID boundary embedded in the generated initramfs."""

from __future__ import annotations

import gzip
import os
import stat
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Entry:
    mode: int
    uid: int
    gid: int
    data: bytes


def parse_newc(payload: bytes) -> dict[str, Entry]:
    entries: dict[str, Entry] = {}
    offset = 0

    while True:
        header = payload[offset : offset + 110]
        if len(header) != 110 or header[:6] != b"070701":
            raise ValueError(f"invalid newc header at offset {offset}")
        fields = [int(header[pos : pos + 8], 16) for pos in range(6, 110, 8)]
        mode, uid, gid = fields[1], fields[2], fields[3]
        size, name_size = fields[6], fields[11]
        offset += 110

        raw_name = payload[offset : offset + name_size]
        if len(raw_name) != name_size or not raw_name.endswith(b"\0"):
            raise ValueError(f"invalid newc name at offset {offset}")
        name = raw_name[:-1].decode()
        offset += name_size
        offset = (offset + 3) & ~3

        data = payload[offset : offset + size]
        if len(data) != size:
            raise ValueError(f"truncated newc data for {name}")
        offset += size
        offset = (offset + 3) & ~3

        if name == "TRAILER!!!":
            return entries
        if name in entries:
            raise ValueError(f"duplicate initramfs entry: {name}")
        entries[name] = Entry(mode, uid, gid, data)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def describe(entry: Entry) -> str:
    return f"{stat.filemode(entry.mode)} uid={entry.uid} gid={entry.gid}"


def main() -> int:
    if len(sys.argv) != 2:
        print(f"用法：{sys.argv[0]} public/vm/rootfs.cpio.gz", file=sys.stderr)
        return 2

    initramfs = Path(sys.argv[1])
    entries = parse_newc(gzip.decompress(initramfs.read_bytes()))

    main_busybox = entries.get("bin/busybox")
    suid_busybox = entries.get("bin/busybox-suid")
    shell_link = entries.get("bin/sh")
    require(main_busybox is not None, "initramfs 缺少 bin/busybox")
    require(suid_busybox is not None, "initramfs 缺少 bin/busybox-suid")
    require(shell_link is not None, "initramfs 缺少 bin/sh")

    require(
        stat.S_IFMT(main_busybox.mode) == stat.S_IFREG
        and stat.S_IMODE(main_busybox.mode) == 0o755
        and (main_busybox.uid, main_busybox.gid) == (0, 0),
        f"bin/busybox 权限错误：{describe(main_busybox)}",
    )
    require(
        stat.S_IFMT(suid_busybox.mode) == stat.S_IFREG
        and stat.S_IMODE(suid_busybox.mode) == 0o4755
        and (suid_busybox.uid, suid_busybox.gid) == (0, 0),
        f"bin/busybox-suid 权限错误：{describe(suid_busybox)}",
    )
    require(
        stat.S_IFMT(shell_link.mode) == stat.S_IFLNK and shell_link.data == b"busybox",
        "bin/sh 必须是指向普通 busybox 的符号链接",
    )

    elf = suid_busybox.data
    require(elf[:7] == b"\x7fELF\x01\x01\x01", "SUID helper 不是 32 位小端 ELF")
    require(int.from_bytes(elf[18:20], "little") == 3, "SUID helper 不是 i386 ELF")

    with tempfile.TemporaryDirectory(prefix="hashteam-suid-") as tmp:
        binary = Path(tmp, "busybox-suid")
        binary.write_bytes(elf)
        os.chmod(binary, 0o755)
        applets = subprocess.run(
            [binary, "--list"],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        ).stdout.splitlines()

    require(applets == ["passwd", "su"], f"SUID applet 白名单错误：{applets}")
    print(
        "✓ SUID initramfs：普通 busybox 0755，helper 4755 root:root，"
        "且 applet 严格为 passwd/su"
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (AssertionError, OSError, ValueError, subprocess.SubprocessError) as error:
        print(f"✗ SUID initramfs 校验失败：{error}", file=sys.stderr)
        sys.exit(1)
