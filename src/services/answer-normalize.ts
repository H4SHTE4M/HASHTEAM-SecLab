/**
 * 学生输入归一化：先 NFKC 再 trim。
 * 中文输入法容易带出全角字符（全角空格 U+3000、全角引号＂、全角字母数字），
 * NFKC 会把它们折叠为半角等价物，避免肉眼相同的答案被判错。
 */
export function normalizeAnswer(input: string): string {
  return input.normalize('NFKC').trim()
}
