'use strict';

// 玩具 RSA 全链 + Shor 周期查找测试（plan.md 支线 C 的数字必须全部对上）
var assert = require('assert');
var rsa = require('../crypto/rsa.js');

// ---------- 玩具钥匙工厂（C.0） ----------
var p = 5, q = 11, n = 55, phi = 40, e = 3, d = 27;

assert.strictEqual(String(rsa.gcd(12n, 55n)), '1', '12 与 55 互素');
assert.strictEqual(String(rsa.gcd(33, 55)), '11');
assert.strictEqual(String(rsa.gcd(35, 55)), '5');
assert.strictEqual(String(rsa.gcd(81, 40)), '1', '3×27=81 与 40 互素');
assert.strictEqual(81 % 40, 1, '3 × 27 = 81 = 2 × 40 + 1');

assert.strictEqual(String(rsa.modInverse(3, 40)), '27', '由 e=3 求 d=27');
assert.strictEqual(rsa.modInverse(2, 40), null, '不互素时没有逆元');

assert.ok(rsa.isPrime(5) && rsa.isPrime(11) && rsa.isPrime(97));
assert.ok(!rsa.isPrime(1) && !rsa.isPrime(55) && !rsa.isPrime(-7) && !rsa.isPrime(2.5));

assert.deepStrictEqual(rsa.factor(55), [5, 11], '试除分解 55 = 5 × 11');
assert.deepStrictEqual(rsa.factor(15), [3, 5]);
assert.strictEqual(rsa.factor(7), null, '素数无法分解为两个因子');

// ---------- 加解密全链（C.1） ----------
var m = 7n;
var c = rsa.modpow(m, 3, 55);
assert.strictEqual(String(c), '13', 'c = 7^3 mod 55 = 13');
var back = rsa.modpow(c, 27, 55);
assert.strictEqual(String(back), '7', 'm = 13^27 mod 55 = 7');

// 攻击者攻击链（C.3）：分解 n → φ → d → 解密
var pq = rsa.factor(n);
var phiAttack = (pq[0] - 1) * (pq[1] - 1);
assert.strictEqual(phiAttack, 40);
var dAttack = rsa.modInverse(e, phiAttack);
assert.strictEqual(String(dAttack), '27');
assert.strictEqual(String(rsa.modpow(c, dAttack, n)), '7', '攻击链完整恢复明文');

// ---------- 周期查找（C.4） ----------
var res = rsa.period(12, 55);
assert.strictEqual(res.r, 4, 'period(12, 55) = 4');
assert.deepStrictEqual(res.residues.map(String), ['12', '34', '23', '1'], '12^1..12^4 mod 55 = 12,34,23,1');

// 由周期分解：a^(r/2) = 12^2 mod 55 = 34 → gcd(34±1, 55)
var half = rsa.modpow(12, res.r / 2, 55);
assert.strictEqual(String(half), '34');
var f1 = Number(rsa.gcd(half - 1n, 55));
var f2 = Number(rsa.gcd(half + 1n, 55));
assert.strictEqual(f1 * f2, 55);
assert.deepStrictEqual([Math.min(f1, f2), Math.max(f1, f2)], [5, 11]);

// 不互素时 period 返回 null
assert.strictEqual(rsa.period(5, 55), null);

// 换一组玩具参数也要往返（确认不是只对 55 有效）
var c2 = rsa.modpow(42, 17, 3233);
assert.strictEqual(String(rsa.modpow(c2, 2753, 3233)), '42', '经典 RSA 教程向量 42 → 2557 → 42');
assert.strictEqual(String(c2), '2557');

// ---------- 支线 C 页面用的新链（p=1007819, q=748829） ----------
var P2 = 1007819, Q2 = 748829;
var N2 = 754684093951, PHI2 = 754682337304, E2 = 65537, D2 = 560544834449;
assert.ok(rsa.isPrime(P2) && rsa.isPrime(Q2), '新链两个因子都是素数');
assert.strictEqual(P2 * Q2, N2);
assert.strictEqual((P2 - 1) * (Q2 - 1), PHI2);
assert.deepStrictEqual(rsa.factor(N2), [Q2, P2], 'factor(n) 返回 [小, 大]');
assert.strictEqual(String(rsa.modInverse(E2, PHI2)), String(D2), 'modInverse(65537, φ(n)) = d');
var M2 = 2026n, C2B = 640821965517n;
assert.strictEqual(String(rsa.modpow(M2, E2, N2)), String(C2B), 'c = 2026^65537 mod n');
assert.strictEqual(String(rsa.modpow(C2B, D2, N2)), String(M2), '还原明文 2026');
// 攻击链：分解 → φ → d → 解密
var pq2 = rsa.factor(N2);
var dA2 = rsa.modInverse(E2, (pq2[0] - 1) * (pq2[1] - 1));
assert.strictEqual(String(rsa.modpow(C2B, dA2, N2)), '2026', '新链攻击链完整恢复明文');

console.log('rsa-test.js: 全部通过（玩具 RSA 全链×2 / 分解 / period(12,55)=4 / Shor 攻击链）');
