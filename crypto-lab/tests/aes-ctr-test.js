'use strict';

// AES-128 标准测试向量 + CTR 密钥流重用攻击（复现 example.py 的机制）
var assert = require('assert');
var aes = require('../crypto/aes.js');
var core = require('../crypto/core.js');

// ---------- FIPS-197 标准向量 ----------
var key = core.hexToBytes('000102030405060708090a0b0c0d0e0f');
var plain = core.hexToBytes('00112233445566778899aabbccddeeff');
var expectedCipher = '69c4e0d86a7b0430d8cdb78070b4c55a';

var cipher = aes.encryptBlock(plain, key);
assert.strictEqual(core.bytesToHex(cipher), expectedCipher, 'AES-128 标准向量');

// 全零向量（NIST SP 800-38A 用例）
assert.strictEqual(
  core.bytesToHex(aes.encryptBlock(new Array(16).fill(0), new Array(16).fill(0))),
  '66e94bd4ef8a2c3b884cfa59ca342b2e'
);

// trace 的最后一步状态必须等于密文；共 40 步（1 + 9*4 + 3）
var trace = aes.encryptBlockTrace(plain, key);
assert.strictEqual(trace.steps.length, 40);
assert.deepStrictEqual(trace.steps[trace.steps.length - 1].state, cipher);
assert.strictEqual(trace.steps[0].step, 'AddRoundKey');
assert.strictEqual(trace.steps[trace.steps.length - 1].round, 10);

// ---------- CTR：计数块 = 8 字节全零 nonce + 大端计数器 ----------
// NIST SP 800-38A F.5.1 CTR-AES128 第一段：init counter f0f1...ff 不适用；
// 这里校验我们自建的"全零 nonce + counter 0"机制与 PyCryptodome 约定一致：
// counter block(0) = 00..00 → S0 = AES_K(0)。
var key2 = core.hexToBytes('2b7e151628aed2a6abf7158809cf4f3c');
var s0 = aes.ctrKeystream(key2, 0, 1);
assert.deepStrictEqual(s0, aes.encryptBlock(new Array(16).fill(0), key2), 'S0 必须等于 AES_K(0)');
assert.strictEqual(aes.ctrKeystream(key2, 0, 3).length, 48);

// CTR 加解密往返
var message = core.textToBytes('MEET BY THE RIVER AT SEVEN');
var ct = aes.ctrCrypt(key2, 0, message);
assert.deepStrictEqual(aes.ctrCrypt(key2, 0, ct), message, 'CTR 往返');

// ---------- 复现 example.py Demo 1：全零 nonce 重用 ----------
function encryptWithZeroNonce(k, p) { return aes.ctrCrypt(k, 0, p); }

function recoverWithKnownPlaintext(knownP, knownC, targetC) {
  var n = targetC.length;
  assert(knownP.length >= n && knownC.length >= n, '已知明文必须覆盖目标密文长度');
  var keystream = core.xorBytes(knownP.slice(0, n), knownC.slice(0, n));
  return core.xorBytes(targetC, keystream);
}

var knownPlaintext = core.textToBytes('6205310112078088160,919217,019f1942-4000-7949-9bfd-7500971996b8');
var targetPlaintext = core.textToBytes('6205310516257486639,751066,019f1942-4000-7bc9-bd9e-a00303e8f3fc');
assert.strictEqual(knownPlaintext.length, targetPlaintext.length);

var randomKey = core.hexToBytes('0123456789abcdeffedcba9876543210');
var knownCiphertext = encryptWithZeroNonce(randomKey, knownPlaintext);
var targetCiphertext = encryptWithZeroNonce(randomKey, targetPlaintext);

// 攻击函数不接收 AES 密钥，只用 p1、c1、c2
var recovered = recoverWithKnownPlaintext(knownPlaintext, knownCiphertext, targetCiphertext);
assert.deepStrictEqual(recovered, targetPlaintext, '密钥流重用攻击应完整恢复目标明文');

// 换一把密钥也必须成立（确认不依赖特定密钥）
var otherKey = core.hexToBytes('00112233445566778899aabbccddeeff');
var c1b = encryptWithZeroNonce(otherKey, knownPlaintext);
var c2b = encryptWithZeroNonce(otherKey, targetPlaintext);
assert.deepStrictEqual(recoverWithKnownPlaintext(knownPlaintext, c1b, c2b), targetPlaintext);

// ---------- 复现 example.py Demo 2：起始计数不同但计数块重叠 ----------
function encryptFromCounter(k, start, p) {
  var blocks = Math.ceil(p.length / 16);
  var stream = aes.ctrKeystream(k, start, blocks).slice(0, p.length);
  return core.xorBytes(p, stream);
}

function learnKeystream(known, initialCounter, p, c) {
  assert.strictEqual(p.length, c.length);
  var offset = initialCounter * 16;
  core.xorBytes(p, c).forEach(function (value, index) {
    var pos = offset + index;
    if (known[pos] !== undefined && known[pos] !== value) {
      throw new Error('密钥流不一致');
    }
    known[pos] = value;
  });
}

function recoverKnownPositions(known, initialCounter, c) {
  var offset = initialCounter * 16;
  var result = [];
  var count = 0;
  c.forEach(function (value, index) {
    var s = known[offset + index];
    if (s === undefined) {
      result.push(0x3f); // '?'
    } else {
      result.push((value ^ s) & 0xff);
      count += 1;
    }
  });
  return { bytes: result, recovered: count };
}

var p1 = core.textToBytes('6205310112078088160,919217,019f1942-4000-7949-9bfd-7500971996b8');
var p2 = core.textToBytes('6205310516257486639,751066,019f1942-4000-7bc9-bd9e-a00303e8f3fc');
var p3 = core.textToBytes('6205310676960063091,009214,019f1942-4000-7680-b9218127def0a2cb0');

var demoKey = core.hexToBytes('feedfacecafebeef0011223344556677');
var c1 = encryptFromCounter(demoKey, 0, p1);
var c2 = encryptFromCounter(demoKey, 1, p2);
var c3 = encryptFromCounter(demoKey, 2, p3);

var knownStream = {};
learnKeystream(knownStream, 0, p1, c1);
learnKeystream(knownStream, 1, p2, c2);
var res = recoverKnownPositions(knownStream, 2, c3);

assert.strictEqual(res.recovered, 47, '应恢复 47 字节');
assert.strictEqual(core.bytesToText(res.bytes.slice(0, 47)), core.bytesToText(p3.slice(0, 47)));
assert.deepStrictEqual(res.bytes.slice(47), new Array(16).fill(0x3f), '未知部分必须是 ?');

console.log('aes-ctr-test.js: 全部通过（标准向量 / trace / CTR / 两个密钥流重用攻击案例）');
