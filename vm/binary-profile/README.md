# Binary Profile Build

This directory contains source and locked build metadata for offline i386 teaching samples.
It is compiled in a temporary Linux workspace and then audited artifacts are copied back to
the physical repository. The project itself is not mirrored to the VM.

The profile currently locks the staged `pwn-ret2win-01`, eleven earlier production ELF
packages, four production GDB lab packages that share one audited runtime ELF, and two
external reverse-engineering labs that share one downloadable audited ELF.
`pwn-ret2win-01` remains controlled and hidden until its payload tooling and replay curriculum
are complete; the native GDB profile itself is already verified.
`memory-addresses-01`, `memory-register-stack-01`, `asm-registers-01`,
`asm-arithmetic-01`, `asm-stack-ops-01`, `asm-branches-01`, `asm-call-stack-01`,
`elf-bytes-01`, `elf-sections-01`, `elf-symbols-01`, and `elf-disassembly-01` are production ELF course labs: their web snapshots are
tied to deterministic bytes or output from the audited ELF files, and their checks read or replay
those ELF files before accepting observations. The production `memory-layout-01` lab instead
locks a small observation script and rereads the current process's `/proc` mappings during every
check. The first ELF lab uses BusyBox `od`, `xxd`, and
`strings`; it does not claim that full binutils are present. None of the samples uses libc,
networking, a shell, privilege, or file-system side effects. The current VM exposes BusyBox
userland plus locked static GNU Binutils `readelf`, `nm`, and `objdump`, and a native static
i386 GDB fallback; Pwndbg is not shipped. The GDB labs cover breakpoints and instruction
stepping, registers and memory, stack frames, redirected input, and a controlled SIGSEGV.
Each package copies the locked ELF, matching source, and an interactive `session.gdb` to HOME;
the checker starts a fresh real GDB session to verify the submitted runtime observations.
The external reverse labs copy the same sample and an objdump-based equivalent route to HOME.
The first follows `ACCESS-GRANTED` to its data reference; the second records a function boundary,
comparison constant, and conditional branch after a local semantic rename. IDA and Ghidra remain
optional host tools. The VM checker rereads the locked sample with audited `nm` and `objdump`, and
the browser download is required to match the VM artifact hash.

The profile also contains a native, static i386 GDB 15.1 fallback. It is deliberately built
without Python, gdbserver, TUI, networking, or debuginfod; the checked-in `/etc/pwnhub/gdbinit`
adds only a small `context` command for the course. Pwndbg was evaluated against this profile
but is excluded: the audited Ubuntu package and Python closure exceed the release size gate and
bundle pwntools, which is outside the course boundary. Every dynamic-debugging lesson therefore
has a native GDB route.

The SUID protocol checker is built separately from the BusyBox SUID helper. Its compiler,
linker, package versions, flags, and output hash are locked in
`vm/toolchain-source/htcheck/toolchain.lock`, so an Ubuntu i386 cross toolchain cannot be
silently substituted for the AOSC BusyBox profile.

Build from the repository root with the locked Linux toolchain:

```sh
bash vm/binary-profile/build-ret2win.sh
bash vm/binary-profile/build-memory-addresses.sh
bash vm/binary-profile/build-memory-register-stack.sh
bash vm/binary-profile/build-asm-registers.sh
bash vm/binary-profile/build-asm-arithmetic.sh
bash vm/binary-profile/build-asm-stack-ops.sh
bash vm/binary-profile/build-asm-branches.sh
bash vm/binary-profile/build-asm-call-stack.sh
bash vm/binary-profile/build-elf-bytes.sh
bash vm/binary-profile/build-elf-sections.sh
bash vm/binary-profile/build-elf-symbols.sh
bash vm/binary-profile/build-elf-disassembly.sh
bash vm/binary-profile/build-gdb-runtime.sh
bash vm/binary-profile/build-reverse-companion.sh
bash vm/binary-tools/build-binutils.sh
bash vm/binary-tools/build-gdb.sh
```

The output is placed in the sample's isolated initramfs directory. The build script refuses
unexpected compiler versions, dynamic loaders, executable stacks, stack canaries, and a small
set of unrelated syscall symbols.

Run the repository-level checks after copying the Linux-built ELF back to the physical host:

```sh
node scripts/validate-binary-profile.mjs
npm run test:binary-profile
```

On the physical Windows host the replay portion is intentionally skipped. The Linux smoke
test replays correct, incorrect, and oversized payloads and runs a native GDB check when GDB
is installed (or when `BINARY_PROFILE_REQUIRE_GDB=1` is set).
