(function (global) {
  'use strict';

  // ============================================================
  // CryptoLab.rsa · 教学用小整数 RSA 与周期查找（纯函数）
  //
  // - 内部全部使用 BigInt 防止溢出；接口同时接受 Number 和 BigInt。
  // - 玩具参数：p=5, q=11, n=55, e=3, d=27。
  // - period(12, 55)：12^1..12^4 mod 55 = 12, 34, 23, 1 → r = 4。
  // - ⚠️ 仅用于教学演示（textbook RSA 玩具），不要用于真实加密。
  // ============================================================

  var CryptoLab = global.CryptoLab = global.CryptoLab || {};

  function B(x) { return BigInt(x); }

  function gcd(a, b) {
    a = B(a); b = B(b);
    if (a < 0n) a = -a;
    if (b < 0n) b = -b;
    while (b !== 0n) {
      var t = a % b;
      a = b;
      b = t;
    }
    return a;
  }

  // (base^exp) mod m，exp >= 0
  function modpow(base, exp, m) {
    base = B(base); exp = B(exp); m = B(m);
    if (m === 1n) return 0n;
    var result = 1n;
    base = ((base % m) + m) % m;
    while (exp > 0n) {
      if (exp & 1n) result = (result * base) % m;
      exp >>= 1n;
      base = (base * base) % m;
    }
    return result;
  }

  // 扩展欧几里得求 a 在模 m 下的逆元；gcd(a, m) !== 1 时返回 null
  function modInverse(a, m) {
    a = B(a); m = B(m);
    var old_r = ((a % m) + m) % m;
    var r = m;
    var old_s = 1n;
    var s = 0n;
    while (r !== 0n) {
      var q = old_r / r;
      var t;
      t = old_r - q * r; old_r = r; r = t;
      t = old_s - q * s; old_s = s; s = t;
    }
    if (old_r !== 1n) return null;
    return ((old_s % m) + m) % m;
  }

  function isPrime(n) {
    n = Number(n);
    if (!Number.isInteger(n) || n < 2) return false;
    if (n < 4) return true;
    if (n % 2 === 0) return false;
    for (var i = 3; i * i <= n; i += 2) {
      if (n % i === 0) return false;
    }
    return true;
  }

  // 试除分解，返回 [p, q]（p <= q）；n 为素数或无法分解为两因子时返回 null
  function factor(n) {
    n = Number(n);
    for (var i = 2; i * i <= n; i += 1) {
      if (n % i === 0) return [i, n / i];
    }
    return null;
  }

  // Shor 主线用的周期查找：观察 a^1, a^2, ... mod n 的循环。
  // 返回 { r, residues }，residues[i] = a^(i+1) mod n，直到首次回到 1。
  // a 与 n 不互素时返回 null。
  function period(a, n) {
    a = B(a); n = B(n);
    if (gcd(a, n) !== 1n) return null;
    var residues = [];
    var value = 1n;
    for (var i = 0; i < 100000; i += 1) {
      value = (value * a) % n;
      residues.push(value);
      if (value === 1n) {
        return { r: residues.length, residues: residues };
      }
    }
    return null;
  }

  CryptoLab.rsa = {
    gcd: gcd,
    modpow: modpow,
    modInverse: modInverse,
    isPrime: isPrime,
    factor: factor,
    period: period
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CryptoLab.rsa;
  }
})(typeof window !== 'undefined' ? window : globalThis);
