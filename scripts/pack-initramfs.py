#!/usr/bin/env python3
"""把 vm/rootfs-overlay 打包为 newc 格式的 initramfs cpio（gzip 压缩）。

/mnt 挂载点不支持 exec 位，因此本脚本显式记录每个条目的权限，
不依赖文件系统上的 mode。
"""
from __future__ import annotations

import argparse
import gzip
import json
import os
import re
import stat
import sys

TRAILER = "TRAILER!!!"


def mode_for(rel: str, is_dir: bool) -> int:
    """按路径约定决定权限位。"""
    if is_dir:
        if rel == "tmp":
            return stat.S_IFDIR | 0o1777
        if rel == "root":
            return stat.S_IFDIR | 0o700
        return stat.S_IFDIR | 0o755
    # 可执行文件规则
    if (
        rel == "init"
        or rel.startswith("usr/local/bin/")
        or (rel.startswith("opt/hashteam/levels/") and rel.endswith(".sh"))
        or (rel.startswith("opt/pwnhub/labs/") and not rel.endswith((".json", ".txt", ".sha256")))
        or rel == "bin/busybox"
    ):
        return stat.S_IFREG | 0o755
    return stat.S_IFREG | 0o644


def normalize_overlay_data(data: bytes) -> bytes:
    """文本资源统一为 LF；ELF 和含 NUL 的二进制保持逐字节不变。"""
    if data.startswith(b"\x7fELF") or b"\x00" in data:
        return data
    return data.replace(b"\r\n", b"\n")

def owner_for(rel: str) -> tuple[int, int]:
    if rel == "home/guest" or rel.startswith("home/guest/"):
        return (1000, 1000)
    return (0, 0)


class Entry:
    def __init__(self, name: str, mode: int, uid: int, gid: int, data: bytes = b"", linkname: str = ""):
        self.name = name
        self.mode = mode
        self.uid = uid
        self.gid = gid
        self.data = data
        self.linkname = linkname


def collect_entries(
    root: str,
    busybox_path: str | None,
    busybox_suid_path: str | None = None,
    htcheck_path: str | None = None,
    debugger_path: str | None = None,
    pwnhub_labs_root: str | None = None,
    pwnhub_lab_ids: tuple[str, ...] = (),
    binary_tools_root: str | None = None,
    binary_tools: tuple[str, ...] = (),
) -> list[Entry]:
    entries: list[Entry] = []
    dir_added: set[str] = set()

    def ensure_dir(rel: str) -> None:
        """确保 rel 及其所有祖先目录都有目录条目。

        内核解包 initramfs 时不会自动创建父目录：若 bin/ 没有目录条目，
        bin/busybox 文件就无法落地，init 的 shebang #!/bin/busybox sh 会失败，
        内核报 "No working init found"。
        """
        if rel == "." or rel == "" or rel in dir_added:
            return
        parent = rel.rsplit("/", 1)[0] if "/" in rel else "."
        ensure_dir(parent)
        uid, gid = owner_for(rel)
        entries.append(Entry(rel, mode_for(rel, True), uid, gid))
        dir_added.add(rel)

    def add(rel: str, mode: int, uid: int, gid: int, data: bytes = b"", linkname: str = "") -> None:
        parent = rel.rsplit("/", 1)[0] if "/" in rel else "."
        ensure_dir(parent)
        if (mode & 0o170000) == stat.S_IFDIR:
            dir_added.add(rel)
        entries.append(Entry(rel, mode, uid, gid, data, linkname))

    # 根目录必须最先出现
    add(".", stat.S_IFDIR | 0o755, 0, 0)

    # overlay 上的目录与文件（按字典序，保证可重现）
    items: list[tuple[str, str]] = []  # (abs, rel)
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames.sort()
        filenames.sort()
        for d in dirnames:
            ap = os.path.join(dirpath, d)
            items.append((ap, os.path.relpath(ap, root)))
        for f in filenames:
            ap = os.path.join(dirpath, f)
            items.append((ap, os.path.relpath(ap, root)))

    for ap, rel in items:
        rel = rel.replace(os.sep, "/")
        if os.path.isdir(ap):
            uid, gid = owner_for(rel)
            add(rel, mode_for(rel, True), uid, gid)
        else:
            # debugger 也是显式注入、缓存校验过的资产：保留 overlay 中的审计副本
            # 供 manifest 校验，但构建运行时归档时只发射注入的字节。
            if debugger_path is not None and rel == "usr/local/bin/debugger":
                continue
            uid, gid = owner_for(rel)
            with open(ap, "rb") as fh:
                add(rel, mode_for(rel, False), uid, gid, normalize_overlay_data(fh.read()))

    def add_tree(source_root: str, destination_root: str) -> None:
        for dirpath, dirnames, filenames in os.walk(source_root):
            dirnames.sort()
            filenames.sort()
            relative_dir = os.path.relpath(dirpath, source_root)
            destination_dir = (
                destination_root
                if relative_dir == "."
                else f"{destination_root}/{relative_dir.replace(os.sep, '/')}"
            )
            ensure_dir(destination_dir)
            for filename in filenames:
                source = os.path.join(dirpath, filename)
                destination = f"{destination_dir}/{filename}"
                uid, gid = owner_for(destination)
                with open(source, "rb") as fh:
                    add(
                        destination,
                        mode_for(destination, False),
                        uid,
                        gid,
                        normalize_overlay_data(fh.read()),
                    )

    if pwnhub_labs_root is not None:
        for lab_id in pwnhub_lab_ids:
            source = os.path.join(pwnhub_labs_root, lab_id)
            if not os.path.isdir(source):
                raise FileNotFoundError(f"生产 profile 中的实验不存在：{source}")
            add_tree(source, f"opt/pwnhub/labs/{lab_id}")

    if binary_tools_root is not None:
        for tool in binary_tools:
            source = os.path.join(binary_tools_root, tool)
            if not os.path.isfile(source):
                raise FileNotFoundError(f"生产 profile 中的工具不存在：{source}")
            with open(source, "rb") as fh:
                add(
                    f"usr/local/bin/{tool}",
                    stat.S_IFREG | 0o755,
                    0,
                    0,
                    fh.read(),
                )

    # busybox 二进制与 /bin/sh 链接（bin/ 目录由 ensure_dir 自动补齐）
    if busybox_path is not None:
        with open(busybox_path, "rb") as fh:
            add("bin/busybox", stat.S_IFREG | 0o755, 0, 0, fh.read())
    add("bin/sh", stat.S_IFLNK | 0o777, 0, 0, b"busybox", "")

    # 最小 SUID busybox：只含 su，权限 4755，放在独立路径
    if busybox_suid_path is not None:
        with open(busybox_suid_path, "rb") as fh:
            add("bin/busybox-suid", stat.S_IFREG | 0o4755, 0, 0, fh.read())

    # SUID 签名评分检查器：4755 root:root；只有经它验证通过的 check 结果
    # 才会得到 root-only 密钥的签名（详见 htcheck.c 头部注释）
    if htcheck_path is not None:
        with open(htcheck_path, "rb") as fh:
            add("usr/local/bin/htcheck", stat.S_IFREG | 0o4755, 0, 0, fh.read())

    if debugger_path is not None:
        with open(debugger_path, "rb") as fh:
            add("usr/local/bin/debugger", stat.S_IFREG | 0o755, 0, 0, fh.read())

    # 空的挂载点/系统目录：没有文件所以 os.walk 看不到、git 也不跟踪空目录，
    # 但 init 需要 /dev /proc /sys /tmp /root 存在才能 mount 成功。
    for empty_dir in ("dev", "proc", "root", "sys", "tmp"):
        if empty_dir not in dir_added:
            uid, gid = owner_for(empty_dir)
            add(empty_dir, mode_for(empty_dir, True), uid, gid)

    return entries


def write_cpio(entries: list[Entry], out) -> None:
    def pad4() -> None:
        pos = out.tell()
        out.write(b"\x00" * ((4 - pos % 4) % 4))

    ino = 1
    for e in entries:
        name = e.name.encode() + b"\x00"
        data = e.data
        fields = [
            ino,
            e.mode,
            e.uid,
            e.gid,
            1,
            0,  # mtime 固定为 0，保证可重现构建
            len(data),
            0,
            0,
            0,
            0,
            len(name),
            0,
        ]
        header = b"070701" + b"".join(f"{f:08x}".encode("ascii") for f in fields)
        out.write(header)
        out.write(name)
        pad4()
        out.write(data)
        pad4()
        ino += 1

    name = TRAILER.encode() + b"\x00"
    header = b"070701" + b"".join(
        f"{f:08x}".encode("ascii") for f in [ino, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, len(name), 0]
    )
    out.write(header)
    out.write(name)
    pad4()
    # 整体按 512 字节对齐
    out.write(b"\x00" * ((512 - out.tell() % 512) % 512))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, help="rootfs-overlay 目录")
    parser.add_argument("--busybox", default=None, help="busybox 静态二进制路径（完整的 applet 集合）")
    parser.add_argument("--busybox-suid", default=None, help="最小 SUID busybox 路径（仅含 su）")
    parser.add_argument("--htcheck", default=None, help="SUID 签名评分检查器路径")
    parser.add_argument("--debugger", default=None, help="原生 i386 ptrace debugger 路径")
    parser.add_argument("--profile", default=None, help="生产 rootfs 内容 allowlist JSON")
    parser.add_argument("--labs-root", default=None, help="PwnHub 实验源码根目录")
    parser.add_argument("--binary-tools-root", default=None, help="锁定二进制工具目录")
    parser.add_argument("--out", required=True, help="输出 .cpio.gz 路径")
    args = parser.parse_args()

    pwnhub_lab_ids: tuple[str, ...] = ()
    binary_tools: tuple[str, ...] = ()
    if args.profile is not None:
        if args.labs_root is None or args.binary_tools_root is None:
            parser.error("--profile 需要同时提供 --labs-root 与 --binary-tools-root")
        with open(args.profile, encoding="utf-8") as fh:
            profile = json.load(fh)
        raw_lab_ids = profile.get("pwnhubLabs")
        raw_tools = profile.get("binaryTools")
        if not isinstance(raw_lab_ids, list) or not isinstance(raw_tools, list):
            parser.error("profile 必须包含 pwnhubLabs 与 binaryTools 数组")
        lab_pattern = re.compile(r"^[a-z][a-z0-9-]{0,95}$")
        tool_pattern = re.compile(r"^[a-z][a-z0-9-]{0,63}$")
        if (
            any(not isinstance(item, str) or lab_pattern.fullmatch(item) is None for item in raw_lab_ids)
            or len(set(raw_lab_ids)) != len(raw_lab_ids)
        ):
            parser.error("profile.pwnhubLabs 含非法或重复 ID")
        if (
            any(not isinstance(item, str) or tool_pattern.fullmatch(item) is None for item in raw_tools)
            or len(set(raw_tools)) != len(raw_tools)
        ):
            parser.error("profile.binaryTools 含非法或重复工具名")
        pwnhub_lab_ids = tuple(raw_lab_ids)
        binary_tools = tuple(raw_tools)

    entries = collect_entries(
        args.root,
        args.busybox,
        args.busybox_suid,
        args.htcheck,
        args.debugger,
        args.labs_root,
        pwnhub_lab_ids,
        args.binary_tools_root,
        binary_tools,
    )
    with open(args.out, "wb") as raw:
        with gzip.GzipFile(fileobj=raw, mode="wb", compresslevel=9, mtime=0) as gz:
            write_cpio(entries, gz)
    size = os.path.getsize(args.out)
    print(f"initramfs: {args.out} ({size} bytes, {size / 1024 / 1024:.2f} MiB, {len(entries)} entries)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
