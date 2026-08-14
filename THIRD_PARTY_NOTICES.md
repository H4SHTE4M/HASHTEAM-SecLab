# Third-party notices

HASHTEAM Security Lab includes the following third-party components.

Release source and build instructions:
<https://github.com/H4SHTE4M/HASHTEAM-SecLab/tree/{{SOURCE_ID}}>

| Component | Distributed version | License | Corresponding source |
| --- | --- | --- | --- |
| Linux kernel | 6.12.98 | GPL-2.0-only | `linux-6.12.98.tar.xz` and the exact `tinyconfig` overrides in `vm/build.sh` |
| BusyBox userland | Debian 1.38.0-3, i386 static | GPL-2.0-only | `busybox_1.38.0.orig.tar.bz2`, Debian patch archive, and the fixed release configuration |
| BusyBox `su` helper | 1.38.0, i386 static | GPL-2.0-only | `busybox_1.38.0.orig.tar.bz2` plus `vm/busybox-suid.config` |
| GNU C Library in BusyBox userland | Debian 2.42-17, statically linked | LGPL-2.1-or-later | `glibc_2.42.orig.tar.xz`, `glibc_2.42-17.debian.tar.xz`, and `glibc_2.42-17.dsc`; exact version is declared by the Debian binary's `Built-Using` metadata |
| GNU C Library in `su` helper | AOSC `glibc+32` 2.42, statically linked | LGPL-2.1-or-later | `glibc-2.42.tar.xz` plus `vm/toolchain-source/aosc-glibc32/` |
| `htcheck` i386 signer toolchain | Ubuntu 24.04 cross GCC 13.3 / binutils 2.42 / glibc 2.39 | GPL-3.0-or-later / LGPL-2.1-or-later | Exact package versions, compiler and linker hashes, flags, and output hash in `vm/toolchain-source/htcheck/toolchain.lock`; signer source is `vm/toolchain-source/htcheck/htcheck.c` |
| PwnHub i386 `ptrace` debugger and static runtime | Project debugger v1; Ubuntu 24.04 cross GCC 13.3 / binutils 2.42 / glibc 2.39 | Project source / GPL-3.0-or-later with GCC Runtime Library Exception / LGPL-2.1-or-later | Debugger source in `vm/toolchain-source/debugger/debugger.c`; exact toolchain, flags and output hash in `vm/toolchain-source/debugger/toolchain.lock`; build via `vm/binary-tools/build-debugger.sh`; corresponding GCC/glibc sources are listed in `SOURCE_CODE.md` |
| pwn/ROP lab sample toolchain | Ubuntu 24.04 `gcc-multilib` i686-linux-gnu-gcc 13.3.0 / binutils 2.42, `-nostdlib -static` | GPL-3.0-or-later (with GCC Runtime Library Exception; no runtime library is linked) | Exact compiler version and binary hash plus full flags in each `vm/binary-profile/*/toolchain.lock`; sources in `vm/binary-profile/<labId>/`; builds via `vm/binary-profile/build-pwn-lab.sh` and `build-ret2win.sh` |
| GNU Binutils `readelf`, `nm`, and `objdump` | 2.42, i386 static and stripped | GPL-3.0-or-later | `binutils-2.42.tar.xz`, `vm/binary-tools/build-binutils.sh`, and `vm/binary-tools/binutils-2.42.lock` |
| GNU C Library in the Binutils frontends | Ubuntu 2.39-0ubuntu8, statically linked | LGPL-2.1-or-later | `glibc_2.39.orig.tar.xz`, `glibc_2.39-0ubuntu8.debian.tar.xz`, and `glibc_2.39-0ubuntu8.dsc`; exact version is locked from `libc6-dev-i386-cross` |
| GNU GDB native fallback | 15.1, i386 static and stripped; Python, gdbserver, TUI and debuginfod disabled | GPL-3.0-or-later | `gdb-15.1.tar.xz`, `vm/binary-tools/gdb-15.1-ascii-casefold.patch`, `vm/binary-tools/build-gdb.sh`, `vm/binary-tools/gdb-15.1.lock`, and `/etc/pwnhub/gdbinit` |
| Libraries in the GDB fallback | Ubuntu cross glibc 2.39 and GCC 13 runtime; i386 GMP 6.3.0, MPFR 4.2.1, Expat 2.6.1, ncurses 6.4 and zlib 1.3 archives | LGPL-2.1-or-later / GPL-3.0-or-later with GCC Runtime Library Exception / LGPL-3.0-or-later / MIT / X11 / Zlib | Exact binary package versions are enforced by `vm/binary-tools/build-gdb.sh` and recorded in `vm/binary-tools/gdb-15.1.lock`; pristine sources, Ubuntu patches and signed-source metadata are retrieved by `scripts/prepare-corresponding-source.sh` |
| SeaBIOS | Debian 1.16.3-2 | LGPL-3.0-or-later | `seabios_1.16.3.orig.tar.gz` and Debian patch archive |
| v86 | 0.5.424 | BSD-2-Clause | Project source/archive and <https://github.com/copy/v86> |
| Vue | 3.5.40 | MIT | <https://github.com/vuejs/core> |
| xterm.js / addon-fit | 5.5.0 / 0.10.0 | MIT | <https://github.com/xtermjs/xterm.js> |

The exact source URLs, SHA-256 values, source retrieval procedure, license
locations, and build-specific materials are documented in
[SOURCE_CODE.md](./SOURCE_CODE.md) and the fixed release source.

The BusyBox, Binutils, and GDB executables are conveyed with complete, modifiable source,
build configuration, and the corresponding glibc source. This permits recipients
to modify glibc and rebuild/relink the static executables.

## v86 — BSD 2-Clause License

Copyright (c) 2012, The v86 contributors

All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

## Vue — MIT License

Copyright (c) 2018-present, Yuxi (Evan) You

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

## xterm.js — MIT License

Copyright (c) 2017-2019, The xterm.js authors (https://github.com/xtermjs/xterm.js)

Copyright (c) 2014-2016, SourceLair Private Company (https://www.sourcelair.com)

Copyright (c) 2012-2013, Christopher Jeffrey (https://github.com/chjj/)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

## xterm.js addon-fit — MIT License

Copyright (c) 2019, The xterm.js authors (https://github.com/xtermjs/xterm.js)

The MIT permission and warranty terms immediately above apply to addon-fit.
