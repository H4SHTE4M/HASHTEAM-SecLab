# Corresponding source code

The production site distributes a Linux kernel, BusyBox userland, a minimal
BusyBox `su` helper, the two glibc builds statically linked into those
executables, SeaBIOS, and the v86 runtime.

The exact project source for this production release, including the VM build
configuration, initramfs overlay, challenge data, build scripts, dependency
lockfile, and the audited static-link toolchain recipe, is fixed at:

<https://github.com/H4SHTE4M/HASHTEAM-SecLab/tree/{{SOURCE_ID}}>

A downloadable archive of that immutable Git commit is available at:

<https://github.com/H4SHTE4M/HASHTEAM-SecLab/archive/{{SOURCE_ID}}.tar.gz>

The release commit contains `scripts/prepare-corresponding-source.sh`, which
downloads and verifies the complete third-party source set used by the build.
Run it from a checkout of the release commit:

```bash
git clone https://github.com/H4SHTE4M/HASHTEAM-SecLab.git
cd HASHTEAM-SecLab
git checkout --detach {{SOURCE_ID}}
bash scripts/prepare-corresponding-source.sh corresponding-source
```

The helper retrieves the following exact archives and refuses any file whose
SHA-256 does not match:

| File | SHA-256 | Upstream URL |
| --- | --- | --- |
| `linux-6.12.98.tar.xz` | `a62b6a2d207ff72510e5f47156b7078e1e71797357412411b8e4fff97fc8f4c7` | <https://mirrors.aliyun.com/linux-kernel/v6.x/linux-6.12.98.tar.xz> |
| `busybox_1.38.0.orig.tar.bz2` | `34f9ea6ff8636f2c9241153b9114eefa9e65674a45318ae1ef95bb5f31c53bb2` | <https://deb.debian.org/debian/pool/main/b/busybox/busybox_1.38.0.orig.tar.bz2> |
| `busybox_1.38.0-3.debian.tar.xz` | `9493090e7456abb7707a356ab71a810065b555fdeddc6f71d4dd1dc09ebc342f` | <https://deb.debian.org/debian/pool/main/b/busybox/busybox_1.38.0-3.debian.tar.xz> |
| `busybox_1.38.0-3.dsc` | `7c3b52b1dd3792b57681b26adfdaefab77de25f1d453e8ffb78187624a3bc57c` | <https://deb.debian.org/debian/pool/main/b/busybox/busybox_1.38.0-3.dsc> |
| `glibc_2.42.orig.tar.xz` | `69c1e915c8edd75981cbfc6b7654e8fc4e52a48d06b9f706f463492749a9b6fb` | <https://deb.debian.org/debian/pool/main/g/glibc/glibc_2.42.orig.tar.xz> |
| `glibc_2.42-17.debian.tar.xz` | `89b79a67661b89a4160ef1b2f01a1eb7b428c686f18de463581b408ba9765e62` | <https://deb.debian.org/debian/pool/main/g/glibc/glibc_2.42-17.debian.tar.xz> |
| `glibc_2.42-17.dsc` | `d004ab83368dec1f86aec110d13d1eaf21b261416e5f7c74f18c8b9ce2d02b79` | <https://deb.debian.org/debian/pool/main/g/glibc/glibc_2.42-17.dsc> |
| `glibc-2.42.tar.xz` | `d1775e32e4628e64ef930f435b67bb63af7599acb6be2b335b9f19f16509f17f` | <https://ftp.gnu.org/gnu/glibc/glibc-2.42.tar.xz> |
| `seabios_1.16.3.orig.tar.gz` | `374dd8f6938e1673b084de4b2964514f7f9fd1b60eca1c12066c484d26286272` | <https://deb.debian.org/debian/pool/main/s/seabios/seabios_1.16.3.orig.tar.gz> |
| `seabios_1.16.3-2.debian.tar.xz` | `237583c39828f9f5f7bb6f40ba2321f632911ea9891ddc79f54d5e4f0c7b726d` | <https://deb.debian.org/debian/pool/main/s/seabios/seabios_1.16.3-2.debian.tar.xz> |
| `seabios_1.16.3-2.dsc` | `1a95960c0f7e5c5a4c04bed1b5c3359b7518099b15a4ab8e8d37f50b8c3f6b36` | <https://deb.debian.org/debian/pool/main/s/seabios/seabios_1.16.3-2.dsc> |

`vm/build.sh` records the exact Linux `tinyconfig` plus every `scripts/config`
override and the reproducible assembly process. The minimal helper configuration
is `vm/busybox-suid.config`; its resulting checksum is locked in
`vm/busybox-suid.sha256`.
The audited SUID helper toolchain is recorded in `vm/suid-toolchain.lock`.
The exact AOSC glibc recipe and security patches are stored under
`vm/toolchain-source/aosc-glibc32/`, with its files locked by
`vm/toolchain-source/aosc-glibc32/SHA256SUMS`. BusyBox source and configuration
are provided in modifiable form so either static executable can be rebuilt and
relinked against a modified glibc.

To rebuild the VM and static web release from the fixed commit:

```bash
pnpm install --frozen-lockfile
bash vm/build.sh
SOURCE_ID={{SOURCE_ID}} pnpm build
pnpm verify:dist
```

The source download is provided at no charge and does not require running the
browser lab.
