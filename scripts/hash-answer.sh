#!/usr/bin/env bash
# 按 tests/fixtures/level-answers.json 重新生成全部 answer.sha256。
# 新增/修改关卡答案的流程：
#   1. 把明文答案写入 tests/fixtures/level-answers.json（唯一可见明文位置）
#   2. 运行本脚本生成对应加盐哈希
#   3. pnpm validate:challenges 会校验夹具与哈希一致、且无明文 answer 文件
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LEVELS="$ROOT/vm/rootfs-overlay/opt/hashteam/levels"
FIXTURE="$ROOT/tests/fixtures/level-answers.json"

python3 - "$FIXTURE" "$LEVELS" <<'EOF'
import hashlib
import json
import sys

fixture_path, levels_root = sys.argv[1], sys.argv[2]
with open(fixture_path, encoding="utf-8") as fh:
    answers = json.load(fh)
count = 0
level_answers = ((level, answer) for level, answer in answers.items() if not level.startswith("$"))
for level, answer in sorted(level_answers, key=lambda item: int(item[0])):
    digest = hashlib.sha256(
        f"hashteam-lab answer v1 level-{level}:{answer}".encode("utf-8")
    ).hexdigest()
    target = f"{levels_root}/level-{level}/answer.sha256"
    with open(target, "w", encoding="utf-8") as fh:
        fh.write(digest + "\n")
    print(f"level-{level}: {digest}")
    count += 1
print(f"已生成 {count} 个 answer.sha256")
EOF
