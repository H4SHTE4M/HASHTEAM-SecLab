# Corresponding source code

The production site distributes a Linux kernel, BusyBox userland, a minimal
BusyBox `su` helper, static GNU Binutils `readelf`, `nm`, and `objdump` frontends, a static
native GDB fallback, a project-authored static i386 `ptrace` debugger, the glibc and other
libraries linked into those executables, SeaBIOS, and the v86 runtime.

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
| `binutils-2.42.tar.xz` | `f6e4d41fd5fc778b06b7891457b3620da5ecea1006c6a4a41ae998109f85a800` | <https://ftp.gnu.org/gnu/binutils/binutils-2.42.tar.xz> |
| `gdb-15.1.tar.xz` | `38254eacd4572134bca9c5a5aa4d4ca564cbbd30c369d881f733fb6b903354f2` | <https://ftp.gnu.org/gnu/gdb/gdb-15.1.tar.xz> |
| `gcc-13_13.3.0.orig.tar.gz` | `3b85d91bf38d1b858d9d01134f4046b3359731968ed4e6e912d29717a35d1a46` | <https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/gcc-13/13.3.0-6ubuntu2%7E24.04.1/gcc-13_13.3.0.orig.tar.gz> |
| `gcc-13_13.3.0-6ubuntu2~24.04.1.debian.tar.xz` | `5523658f272ad6d15a83b6e26d178fbd5cb7709ec7ce2ca52b0c843e19c228e3` | <https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/gcc-13/13.3.0-6ubuntu2%7E24.04.1/gcc-13_13.3.0-6ubuntu2%7E24.04.1.debian.tar.xz> |
| `gcc-13_13.3.0-6ubuntu2~24.04.1.dsc` | `86b4012c312ac13e3e092877719a62a5b5dbab082ae7e9680780a25c6a13ddc6` | <https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/gcc-13/13.3.0-6ubuntu2%7E24.04.1/gcc-13_13.3.0-6ubuntu2%7E24.04.1.dsc> |
| `gmp_6.3.0+dfsg.orig.tar.xz` | `bd2966e6d277f79328e894a5a9f3ba3fbf2ed2be81def5f48623e30c23fb1572` | <https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/gmp/2%3A6.3.0%2Bdfsg-2ubuntu6.1/gmp_6.3.0%2Bdfsg.orig.tar.xz> |
| `gmp_6.3.0+dfsg-2ubuntu6.1.debian.tar.xz` | `0a7592ee94876fcc0dba60c9a9fba806a72752c104c04d553803e1b7a97026a3` | <https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/gmp/2%3A6.3.0%2Bdfsg-2ubuntu6.1/gmp_6.3.0%2Bdfsg-2ubuntu6.1.debian.tar.xz> |
| `gmp_6.3.0+dfsg-2ubuntu6.1.dsc` | `7fdd2464ee453296e33598dad6f84dd489640c08f50552389469bcf90537582e` | <https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/gmp/2%3A6.3.0%2Bdfsg-2ubuntu6.1/gmp_6.3.0%2Bdfsg-2ubuntu6.1.dsc> |
| `mpfr4_4.2.1.orig.tar.xz` | `277807353a6726978996945af13e52829e3abd7a9a5b7fb2793894e18f1fcbb2` | <https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/mpfr4/4.2.1-1build1.1/mpfr4_4.2.1.orig.tar.xz> |
| `mpfr4_4.2.1-1build1.1.debian.tar.xz` | `55770c471715c710690129e45c627d77da05547a8f6faee81dd420a9b2b5fded` | <https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/mpfr4/4.2.1-1build1.1/mpfr4_4.2.1-1build1.1.debian.tar.xz> |
| `mpfr4_4.2.1-1build1.1.dsc` | `9adabba2fbe45f0705b630b9b225752d945718ed4742b1c5b9fb1aa0fbcd0766` | <https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/mpfr4/4.2.1-1build1.1/mpfr4_4.2.1-1build1.1.dsc> |
| `expat_2.6.1.orig.tar.gz` | `14113ed69357172a0bf5a268793c8b5b01afc77c7a2e5fb8dd0b06cb87c02c4a` | <https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/expat/2.6.1-2ubuntu0.4/expat_2.6.1.orig.tar.gz> |
| `expat_2.6.1-2ubuntu0.4.debian.tar.xz` | `8a24bd6c87fe292a2f00a2df71f7d2bbe3713fa63b1952c8552cdac4288d10fd` | <https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/expat/2.6.1-2ubuntu0.4/expat_2.6.1-2ubuntu0.4.debian.tar.xz> |
| `expat_2.6.1-2ubuntu0.4.dsc` | `a25d3fde103454ad5d34d4770bd5adb60bb5872da775df74cad193b5c4de1dff` | <https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/expat/2.6.1-2ubuntu0.4/expat_2.6.1-2ubuntu0.4.dsc> |
| `ncurses_6.4+20240113.orig.tar.gz` | `37a12a0f8ae2605012c9a164dd286b0cfa02b51b5055836d09eb3d597fc351b1` | <https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/ncurses/6.4%2B20240113-1ubuntu2.1/ncurses_6.4%2B20240113.orig.tar.gz> |
| `ncurses_6.4+20240113-1ubuntu2.1.debian.tar.xz` | `5d86811c8c9c3fab79c9d644a00ee31b4113b969d32b0bb05b5d3e7c2bcea9ac` | <https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/ncurses/6.4%2B20240113-1ubuntu2.1/ncurses_6.4%2B20240113-1ubuntu2.1.debian.tar.xz> |
| `ncurses_6.4+20240113-1ubuntu2.1.dsc` | `87d71c553da108e83c4985e0bca8b944db2dd7931105e511a61e77faf1b415b7` | <https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/ncurses/6.4%2B20240113-1ubuntu2.1/ncurses_6.4%2B20240113-1ubuntu2.1.dsc> |
| `zlib_1.3.dfsg.orig.tar.xz` | `5eea0322c1c21c75cad3b607ac1c43ff5c71e014b8ac4a34300b5e2b80d02e70` | <https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/zlib/1%3A1.3.dfsg-3.1ubuntu2.1/zlib_1.3.dfsg.orig.tar.xz> |
| `zlib_1.3.dfsg-3.1ubuntu2.1.debian.tar.xz` | `958c7031c02f894516492954153c8d760d94e20a4039e48ca7231880b913ae26` | <https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/zlib/1%3A1.3.dfsg-3.1ubuntu2.1/zlib_1.3.dfsg-3.1ubuntu2.1.debian.tar.xz> |
| `zlib_1.3.dfsg-3.1ubuntu2.1.dsc` | `d083d6e1eb6f7f0dc5b107b0cc6b898f097947e1317769553f1c5c5d71ea5073` | <https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/zlib/1%3A1.3.dfsg-3.1ubuntu2.1/zlib_1.3.dfsg-3.1ubuntu2.1.dsc> |
| `glibc_2.39.orig.tar.xz` | `f77bd47cf8170c57365ae7bf86696c118adb3b120d3259c64c502d3dc1e2d926` | <https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/glibc/2.39-0ubuntu8/glibc_2.39.orig.tar.xz> |
| `glibc_2.39-0ubuntu8.debian.tar.xz` | `24d8627f34850f05554158b085499d255c67af27be9762d6a911b168852c1dd2` | <https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/glibc/2.39-0ubuntu8/glibc_2.39-0ubuntu8.debian.tar.xz> |
| `glibc_2.39-0ubuntu8.dsc` | `af44b50b4aba75916f920337523d89698c465fafb720268bb87b2555000bea7a` | <https://launchpad.net/ubuntu/+archive/primary/+sourcefiles/glibc/2.39-0ubuntu8/glibc_2.39-0ubuntu8.dsc> |
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
The static `htcheck` signer uses the separate i386 cross toolchain recorded in
`vm/toolchain-source/htcheck/toolchain.lock`; that lock includes the compiler,
linker, package versions, flags, and audited output hash.
The project-authored debugger source is `vm/toolchain-source/debugger/debugger.c`.
`vm/binary-tools/build-debugger.sh` builds it with the AOSC optenv(32) i686 cross
toolchain, statically links glibc, strips the result, and verifies the output against
`vm/toolchain-source/debugger/toolchain.lock`. The same AOSC optenv(32) GCC 14.3
toolchain (with the audited glibc source set) is shared with `htcheck`.
The static Binutils tools use the locked two-stage build in
`vm/binary-tools/build-binutils.sh`: libraries are built with static linker flags,
then the selected frontends are relinked with Libtool `-all-static` and stripped.
Exact source, compiler, linker, output hashes, and configuration flags are recorded
in `vm/binary-tools/binutils-2.42.lock`.
The native GDB fallback uses `vm/binary-tools/build-gdb.sh` and
`vm/binary-tools/gdb-15.1.lock`. That lock records Ubuntu i386 compiler/linker
versions, static library package versions, the fmod compatibility shim, all
configure flags, and the output hash. Its lock explicitly records that Pwndbg was
excluded after the size and no-pwntools audit; the course therefore documents native
GDB commands as the guaranteed route. The corresponding source set also includes
the exact GCC 13 runtime, GMP, MPFR, Expat, ncurses and zlib source packages selected
by that lock. `vm/binary-tools/gdb-15.1-ascii-casefold.patch` is applied to the
pristine GDB source so ASCII C/C++ symbols do not require runtime UTF-32 gconv
modules in the reduced initramfs; the patch is distributed with the build materials.

The pwn/ROP lab samples (`pwn-overflow-offset-01`, `pwn-ret2win-01`,
`pwn-ret2win-args-01`, `rop-gadget-stack-01`, `rop-register-chain-01`,
`rop-call-chain-01`) are project-authored C sources under `vm/binary-profile/<labId>/`,
compiled by the Ubuntu `gcc-multilib` i686-linux-gnu-gcc 13.3.0 toolchain via
`vm/binary-profile/build-pwn-lab.sh` or `vm/binary-profile/build-ret2win.sh`.
Each lab directory carries a `toolchain.lock` with the exact compiler version,
compiler binary SHA-256, binutils version, compile flags and `SOURCE_DATE_EPOCH`;
the produced ELF is `-nostdlib -static`, so no third-party runtime library is
linked. The restricted payload teaching tools `p32`, `hex2bin`, `cyclic`,
`cyclic-find` and `payload-run` are project-authored POSIX shell scripts under
`vm/rootfs-overlay/usr/local/bin/`, audited with sizes and SHA-256 in
`vm/binary-profile/assets.json` (`scriptTools`).
The debugger-enabled memory and assembly samples are project-authored sources under
`vm/binary-profile/<labId>/`. Their build scripts invoke
`scripts/generate-debugger-index.sh` to derive the instruction and symbol indexes from
each locked ELF. The ELF, both indexes, `debugger.json`, and `debugger-check.sh` hashes
are recorded in the lab `toolchain.lock` and in `vm/binary-profile/assets.json`.

To rebuild the VM and static web release from the fixed commit:

```bash
pnpm install --frozen-lockfile
bash vm/build.sh
SOURCE_ID={{SOURCE_ID}} pnpm build
pnpm verify:dist
```

The source download is provided at no charge and does not require running the
browser lab.
