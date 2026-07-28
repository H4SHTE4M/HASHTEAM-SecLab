# AOSC glibc+32 corresponding build recipe

This directory is the complete `runtime-optenv32/glibc+32` recipe from
`AOSC-Dev/aosc-os-abbs` commit
`1ad214e98e26cc3cc3bcfcf240a3fc2fbf18a83e` (recipe tree
`cc85b5bac4c55cf5b58ef475c0b2df4ea42a1947`).

That commit is the last recipe change before the installed `glibc+32` 2.42
package build timestamp (2026-01-17) and adds the two security patches present
in the package used to link `bin/busybox-suid`. The matching pristine GNU
glibc source is published as `/sources/glibc-2.42.tar.xz`; its SHA-256 is
`d1775e32e4628e64ef930f435b67bb63af7599acb6be2b335b9f19f16509f17f`.

The exact installed package metadata and compiler/library file hashes are
recorded in `vm/suid-toolchain.lock`. Together with the BusyBox source,
`vm/busybox-suid.config`, and `vm/build.sh`, these files permit rebuilding and
relinking the statically linked helper with a modified glibc.
