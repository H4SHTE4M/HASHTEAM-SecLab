# Third-party notices

HASHTEAM Security Lab includes the following third-party components.

| Component | Distributed version | License | Corresponding source |
| --- | --- | --- | --- |
| Linux kernel | 6.12.98 | GPL-2.0-only | `/sources/linux-6.12.98.tar.xz` plus this project's kernel build configuration |
| BusyBox userland | Debian 1.38.0-3, i386 static | GPL-2.0-only | `/sources/busybox_1.38.0.orig.tar.bz2`, Debian patch archive, and this project's configuration |
| BusyBox `su` helper | 1.38.0, i386 static | GPL-2.0-only | `/sources/busybox_1.38.0.orig.tar.bz2` plus `vm/busybox-suid.config` in `/sources/hashteam-seclab-project-source-{{SOURCE_ID}}.tar.gz` |
| GNU C Library in BusyBox userland | Debian 2.42-17, statically linked | LGPL-2.1-or-later | `/sources/glibc_2.42.orig.tar.xz`, `/sources/glibc_2.42-17.debian.tar.xz`, and `/sources/glibc_2.42-17.dsc`; exact version is declared by the Debian binary's `Built-Using` metadata |
| GNU C Library in `su` helper | AOSC `glibc+32` 2.42, statically linked | LGPL-2.1-or-later | `/sources/glibc-2.42.tar.xz` plus the exact AOSC recipe in the versioned project archive under `vm/toolchain-source/aosc-glibc32/` |
| SeaBIOS | Debian 1.16.3-2 | LGPL-3.0-or-later | `/sources/seabios_1.16.3.orig.tar.gz` and Debian patch archive |
| v86 | 0.5.424 | BSD-2-Clause | Project source/archive and <https://github.com/copy/v86> |
| Vue | 3.5.40 | MIT | <https://github.com/vuejs/core> |
| xterm.js / addon-fit | 5.5.0 / 0.10.0 | MIT | <https://github.com/xtermjs/xterm.js> |

The full GPL/LGPL license texts and build-specific copyright files are present
inside the corresponding source archives. The complete source delivery process
is documented in [SOURCE_CODE.md](./SOURCE_CODE.md).

Both BusyBox executables are conveyed with complete, modifiable BusyBox source,
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
