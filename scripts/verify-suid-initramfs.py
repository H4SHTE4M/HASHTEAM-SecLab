#!/usr/bin/env python3
"""Verify initramfs overlay contents, permissions, and BusyBox trust boundaries."""

from __future__ import annotations

import gzip
import hashlib
import runpy
import stat
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Entry:
    mode: int
    uid: int
    gid: int
    data: bytes


def parse_newc(payload: bytes) -> tuple[dict[str, Entry], bytes]:
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
            return entries, payload[offset:]
        if name in entries:
            raise ValueError(f"duplicate initramfs entry: {name}")
        entries[name] = Entry(mode, uid, gid, data)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def describe(entry: Entry) -> str:
    return f"{stat.filemode(entry.mode)} uid={entry.uid} gid={entry.gid}"


def read_locked_checksum(path: Path, member: str) -> str:
    fields = path.read_text(encoding="utf-8").split()
    require(
        len(fields) == 2 and fields[1] == member,
        f"{path.name} 格式无效，应锁定 {member}",
    )
    return fields[0]


def verify_overlay_manifest(entries: dict[str, Entry], repository: Path) -> None:
    packer = runpy.run_path(str(repository / "scripts" / "pack-initramfs.py"))
    expected_entries = packer["collect_entries"](
        str(repository / "vm" / "rootfs-overlay"), None, None
    )
    expected = {entry.name: entry for entry in expected_entries}
    expected_names = set(expected) | {"bin/busybox", "bin/busybox-suid"}
    actual_names = set(entries)
    missing = sorted(expected_names - actual_names)
    unexpected = sorted(actual_names - expected_names)
    require(not missing, f"initramfs 缺少 overlay 条目：{missing[:8]}")
    require(not unexpected, f"initramfs 出现未跟踪条目：{unexpected[:8]}")

    for name, expected_entry in expected.items():
        actual = entries[name]
        require(
            (actual.mode, actual.uid, actual.gid)
            == (expected_entry.mode, expected_entry.uid, expected_entry.gid),
            f"{name} 权限或属主与 overlay 打包规则不一致：{describe(actual)}",
        )
        require(actual.data == expected_entry.data, f"{name} 内容与当前 overlay 不一致")


def main() -> int:
    if len(sys.argv) != 2:
        print(f"用法：{sys.argv[0]} public/vm/rootfs.cpio.gz", file=sys.stderr)
        return 2

    repository = Path(__file__).resolve().parents[1]
    initramfs = Path(sys.argv[1])
    entries, trailing = parse_newc(gzip.decompress(initramfs.read_bytes()))
    require(
        trailing.strip(b"\0") == b"",
        "initramfs 在首个 CPIO 归档后仍有非零内容；拒绝未检查的串联归档",
    )
    verify_overlay_manifest(entries, repository)

    main_busybox = entries.get("bin/busybox")
    suid_busybox = entries.get("bin/busybox-suid")
    shell_link = entries.get("bin/sh")
    init = entries.get("init")
    passwd = entries.get("etc/passwd")
    group = entries.get("etc/group")
    require(main_busybox is not None, "initramfs 缺少 bin/busybox")
    require(suid_busybox is not None, "initramfs 缺少 bin/busybox-suid")
    require(shell_link is not None, "initramfs 缺少 bin/sh")
    require(init is not None, "initramfs 缺少 init")
    require(passwd is not None, "initramfs 缺少 etc/passwd")
    require(group is not None, "initramfs 缺少 etc/group")

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
    privileged = [
        name
        for name, entry in entries.items()
        if stat.S_IFMT(entry.mode) == stat.S_IFREG
        and stat.S_IMODE(entry.mode) & (stat.S_ISUID | stat.S_ISGID)
    ]
    require(
        privileged == ["bin/busybox-suid"],
        f"initramfs 出现未授权的 SUID/SGID 文件：{privileged}",
    )
    require(
        b"ln -sf /bin/busybox-suid /bin/su" in init.data
        and b"busybox-suid /bin/passwd" not in init.data,
        "init 必须只把 su 路由到最小 SUID helper",
    )
    require(
        passwd.data
        == (
            b"root:x:0:0:root:/root:/bin/sh\n"
            b"guest:x:1000:1000:guest:/home/guest:/bin/sh\n"
        )
        and group.data == b"root:x:0:\nguest:x:1000:\n"
        and "etc/shadow" not in entries,
        "root/guest 账号、组或锁定边界与审核基线不一致",
    )

    elf = suid_busybox.data
    require(elf[:7] == b"\x7fELF\x01\x01\x01", "SUID helper 不是 32 位小端 ELF")
    require(int.from_bytes(elf[18:20], "little") == 3, "SUID helper 不是 i386 ELF")

    main_busybox_sha256 = hashlib.sha256(main_busybox.data).hexdigest()
    require(
        main_busybox_sha256
        == read_locked_checksum(repository / "vm" / "busybox.sha256", "bin/busybox"),
        f"普通 BusyBox 未通过审核锁定哈希：{main_busybox_sha256}",
    )
    actual_sha256 = hashlib.sha256(elf).hexdigest()
    require(
        actual_sha256
        == read_locked_checksum(
            repository / "vm" / "busybox-suid.sha256", "bin/busybox-suid"
        ),
        f"SUID helper 未通过审核锁定哈希：{actual_sha256}",
    )
    print(
        "✓ initramfs：overlay 清单/内容/权限一致，普通 busybox 0755，"
        "helper 4755 root:root，唯一特权文件与 su-only 审核哈希一致"
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (AssertionError, OSError, ValueError) as error:
        print(f"✗ initramfs 校验失败：{error}", file=sys.stderr)
        sys.exit(1)
