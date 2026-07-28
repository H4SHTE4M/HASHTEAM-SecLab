# Corresponding source code

The production site distributes a Linux kernel, BusyBox userland, a minimal
BusyBox `su` helper, the two glibc builds statically linked into those
executables, SeaBIOS, and the v86 runtime.

For this production release, the deployment process publishes the complete
corresponding source archives and a release-specific checksum list at:

<https://labtest.lwzheng.tech/sources/SHA256SUMS-{{SOURCE_ID}}>

The source directory contains:

- the exact Linux 6.12.98 source archive;
- BusyBox 1.38.0 upstream source and the Debian 1.38.0-3 patch set;
- Debian glibc 2.42-17 source named by `busybox-static`'s `Built-Using`
  metadata;
- pristine GNU glibc 2.42 source plus the exact AOSC `glibc+32` recipe and
  security patches used to statically link the `su` helper;
- SeaBIOS 1.16.3 upstream source and the Debian 1.16.3-2 patch set;
- `hashteam-seclab-project-source-{{SOURCE_ID}}.tar.gz`, a deterministic
  archive of this exact project release, including the VM configuration,
  initramfs overlay, challenge data, build scripts, and an embedded
  `.hashteam-source-id` used when rebuilding outside Git;
- `SHA256SUMS-{{SOURCE_ID}}` covering every archive corresponding to this
  release.

`{{SOURCE_ID}}` is replaced with the exact Git commit during a production
build. Release-specific project archives and checksum lists are never
overwritten by later deployments.

The project source is also available from:

<https://github.com/H4SHTE4M/HASHTEAM-SecLab>

To rebuild the VM, install the prerequisites documented in `README.md`, verify
the checksums in `vm/build.sh`, and run:

```bash
pnpm install --frozen-lockfile
bash vm/build.sh
```

The audited SUID helper toolchain is recorded in `vm/suid-toolchain.lock`.
`vm/build.sh` verifies the AOSC package versions and glibc build metadata, the
compiler, compiler backend, linker, and final helper hash before accepting the
rebuilt initramfs. The exact AOSC glibc recipe is stored under
`vm/toolchain-source/aosc-glibc32/`. BusyBox source and configuration are
provided in modifiable form so either static executable can be rebuilt and
relinked against a modified glibc.

To rebuild and verify the static web release from the extracted project archive:

```bash
pnpm build
pnpm verify:dist
```

Vite reads the embedded `.hashteam-source-id`, so the legal notices and
`vm-assets.json` retain the original release identity even without `.git`.

The source download is provided at no charge and does not require running the
browser lab.
