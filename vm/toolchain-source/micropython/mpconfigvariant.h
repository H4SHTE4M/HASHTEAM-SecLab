/*
 * MicroPython unix port 变体 htlab:HASHTEAM 课程定制解释器配置。
 * 基于 variants/minimal,面向零基础教学启用:struct/random(含 EXTRA_FUNCS)/time/
 * io/json/uctypes/binascii(base64)/bytearray(含切片赋值)/f-string/dir/help/
 * os.urandom/hashlib.sha256/切片/任意精度整数/双精度浮点/CPython 兼容方法。
 * 网络、SSL、VFS、FFI、re、md5/sha1 全部关闭(VM 无网卡,教学不需要)。
 * 构建见 vm/binary-tools/build-micropython.sh,锁定参数见同目录 toolchain.lock。
 *
 * 上游许可:MicroPython 为 MIT License, Copyright (c) 2013-2026 Damien P. George
 * 及贡献者;本文件为配置改写,沿用 MIT。
 */
/*
 * This file is part of the MicroPython project, http://micropython.org/
 *
 * The MIT License (MIT)
 *
 * Copyright (c) 2015 Damien P. George
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

// options to control how MicroPython is built

#define MICROPY_CONFIG_ROM_LEVEL (MICROPY_CONFIG_ROM_LEVEL_MINIMUM)

// Disable native emitters.
#define MICROPY_EMIT_X86 (0)
#define MICROPY_EMIT_X64 (0)
#define MICROPY_EMIT_THUMB (0)
#define MICROPY_EMIT_ARM (0)

// Tune the parser to use less RAM by default.
#define MICROPY_ALLOC_QSTR_CHUNK_INIT (64)
#define MICROPY_ALLOC_PARSE_RULE_INIT (8)
#define MICROPY_ALLOC_PARSE_RULE_INC  (8)
#define MICROPY_ALLOC_PARSE_RESULT_INIT (8)
#define MICROPY_ALLOC_PARSE_RESULT_INC (8)
#define MICROPY_ALLOC_PARSE_CHUNK_INIT (64)

// Enable features that are not enabled by default with the minimum config.
#define MICROPY_COMP_CONST_FOLDING (1)
#define MICROPY_COMP_CONST_LITERAL (1)
#define MICROPY_COMP_CONST_TUPLE (1)
#define MICROPY_COMP_DOUBLE_TUPLE_ASSIGN (1)
#define MICROPY_ENABLE_COMPILER (1)
#define MICROPY_ENABLE_EXTERNAL_IMPORT (1)
#define MICROPY_STACK_CHECK (1)
#define MICROPY_FULL_CHECKS (1)
#define MICROPY_HELPER_REPL (1)
#define MICROPY_KBD_EXCEPTION (1)
#define MICROPY_MODULE_GETATTR (1)
#define MICROPY_MULTIPLE_INHERITANCE (1)
#define MICROPY_PY_ASSIGN_EXPR (1)
#define MICROPY_PY_ASYNC_AWAIT (1)
#define MICROPY_PY_ATTRTUPLE (1)
#define MICROPY_PY_BUILTINS_DICT_FROMKEYS (1)
#define MICROPY_PY_BUILTINS_RANGE_ATTRS (1)
#define MICROPY_PY_GENERATOR_PEND_THROW (1)

// Add just the os built-in module.
#define MICROPY_PY_OS (1)

// 课程定制：payload 构造、种子复现、进制与时间概念
#define MICROPY_PY_STRUCT (1)
#define MICROPY_PY_RANDOM (1)
#define MICROPY_PY_BUILTINS_BYTES_HEX (1)
#define MICROPY_PY_MATH (1)
#define MICROPY_PY_BUILTINS_FLOAT (1)
#define MICROPY_FLOAT_IMPL (MICROPY_FLOAT_IMPL_DOUBLE)

// i386 无 SSE2，关闭原生 _Float16
#define MICROPY_FLOAT_USE_NATIVE_FLT16 (0)

// 切片是 bytes 教学必需
#define MICROPY_PY_BUILTINS_SLICE (1)
#define MICROPY_PY_BUILTINS_SLICE_ATTRS (1)

// 32 位地址与回绕算术必需任意精度整数
#define MICROPY_LONGINT_IMPL (MICROPY_LONGINT_IMPL_MPZ)

#define MICROPY_PY_RANDOM_EXTRA_FUNCS (1)


// time 三件套必须一起开(helper 在 INCLUDEFILE 里)
#define MICROPY_PY_TIME (1)
#define MICROPY_PY_TIME_TIME_TIME_NS (1)
#define MICROPY_PY_TIME_INCLUDEFILE "ports/unix/modtime.c"
#define MICROPY_PY_TIME_CUSTOM_SLEEP (1)

// 第二批：json/base64/结构体视图/内省/真随机对比/sha256
#define MICROPY_PY_JSON (1)
#define MICROPY_PY_UCTYPES (1)
#define MICROPY_PY_BINASCII (1)
#define MICROPY_PY_BUILTINS_BYTEARRAY (1)
#define MICROPY_PY_FSTRINGS (1)
#define MICROPY_PY_BUILTINS_DIR (1)
#define MICROPY_PY_BUILTINS_HELP (1)
#define MICROPY_PY_BUILTINS_HELP_MODULES (1)
#define MICROPY_PY_OS_URANDOM (1)
#define MICROPY_PY_HASHLIB (1)
#define MICROPY_PY_HASHLIB_SHA256 (1)
#define MICROPY_PY_IO (1)
#define MICROPY_PY_ARRAY_SLICE_ASSIGN (1)
#define MICROPY_CPYTHON_COMPAT (1)
