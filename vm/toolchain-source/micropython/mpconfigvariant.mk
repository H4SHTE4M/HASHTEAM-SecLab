# MicroPython htlab 变体:在 minimal 基础上开启内置行编辑(readline 为上游内建实现,
# 无外部依赖);btree/ffi/socket/thread/termios/ssl 与 VFS 全部关闭。
# 详见同目录 mpconfigvariant.h 与 vm/binary-tools/build-micropython.sh。
# build the htlab teaching interpreter

FROZEN_MANIFEST =

MICROPY_PY_BTREE = 0
MICROPY_PY_FFI = 0
MICROPY_PY_SOCKET = 0
MICROPY_PY_THREAD = 0
MICROPY_PY_TERMIOS = 0
MICROPY_PY_SSL = 0
MICROPY_USE_READLINE = 1

MICROPY_VFS_FAT = 0
MICROPY_VFS_LFS1 = 0
MICROPY_VFS_LFS2 = 0
