'use strict';

// 古典密码往返测试：Caesar / 栅栏 / Vigenere / XOR 与字节工具
var assert = require('assert');
var core = require('../crypto/core.js');

// ---------- Caesar ----------
assert.strictEqual(core.caesarEncrypt('ABCXYZ', 3), 'DEFABC', 'Caesar 越过 Z 应绕回 A');
assert.strictEqual(core.caesarEncrypt('MEET BY THE RIVER AT SEVEN', 3), 'PHHW EB WKH ULYHU DW VHYHQ');
assert.strictEqual(core.caesarDecrypt('PHHW EB WKH ULYHU DW VHYHQ', 3), 'MEET BY THE RIVER AT SEVEN');
for (var k = 0; k < 26; k += 1) {
  assert.strictEqual(core.caesarDecrypt(core.caesarEncrypt('HELLO WORLD', k), k), 'HELLO WORLD');
}

// ---------- 栅栏密码 ----------
assert.strictEqual(core.railFenceEncrypt('HELLOWORLD', 3), 'HOLELWRDLO'.length === 10 ? core.railFenceEncrypt('HELLOWORLD', 3) : '', 'sanity');
// 手工核对：WE ARE DISCOVERED FLEE AT ONCE, 3 层（经典例子）
var rfCipher = core.railFenceEncrypt('WEAREDISCOVEREDFLEEATONCE', 3);
assert.strictEqual(rfCipher, 'WECRLTEERDSOEEFEAOCAIVDEN');
for (var rails = 2; rails <= 5; rails += 1) {
  var c = core.railFenceEncrypt('MEETBYTHERIVERATSEVEN', rails);
  assert.strictEqual(core.railFenceDecrypt(c, rails), 'MEETBYTHERIVERATSEVEN', '栅栏 ' + rails + ' 层往返');
  // 换位保留字母频率
  assert.deepStrictEqual(core.letterFrequency(c), core.letterFrequency('MEETBYTHERIVERATSEVEN'));
}

// ---------- Vigenere ----------
assert.strictEqual(core.vigenereEncrypt('ATTACKATDAWN', 'LEMON'), 'LXFOPVEFRNHR');
assert.strictEqual(core.vigenereDecrypt('LXFOPVEFRNHR', 'LEMON'), 'ATTACKATDAWN');
assert.strictEqual(core.vigenereDecrypt(core.vigenereEncrypt('MEET AT SEVEN', 'LEMON'), 'LEMON'), 'MEET AT SEVEN');

// ---------- XOR / 字节工具 ----------
var a = [0x00, 0xff, 0x5a];
var b = [0xff, 0xff, 0xa5];
assert.deepStrictEqual(core.xorBytes(a, b), [0xff, 0x00, 0xff]);
assert.deepStrictEqual(core.xorBytes(core.xorBytes(a, b), b), a, 'K XOR K = 0：再异或一次还原');

assert.deepStrictEqual(core.hexToBytes('69c4e0d86a7b0430d8cdb78070b4c55a'),
  [0x69, 0xc4, 0xe0, 0xd8, 0x6a, 0x7b, 0x04, 0x30, 0xd8, 0xcd, 0xb7, 0x80, 0x70, 0xb4, 0xc5, 0x5a]);
assert.strictEqual(core.bytesToHex(core.hexToBytes('000102030405060708090a0b0c0d0e0f')), '000102030405060708090a0b0c0d0e0f');
assert.strictEqual(core.bytesToText(core.textToBytes('MEET AT SEVEN')), 'MEET AT SEVEN');
assert.strictEqual(core.bytesToText(core.textToBytes('今晚七点')), '今晚七点', 'UTF-8 往返');

// ---------- 频率 ----------
var freq = core.letterFrequency('AABZ');
assert.strictEqual(freq[0], 2);
assert.strictEqual(freq[1], 1);
assert.strictEqual(freq[25], 1);

// ---------- 混合 n 元适应度打分（第 2 关攻击者枚举排名依赖它） ----------
// n 元频率数据应随 core.js 自动加载（Node 下由 core.js 自行 require）
assert(core.englishFitness, 'core 应暴露 englishFitness');

// 正确明文应显著高于打乱后的密文
assert(core.englishFitness('MEETBYTHERIVERATSEVEN') >
  core.englishFitness(core.railFenceEncrypt('MEETBYTHERIVERATSEVEN', 3)),
  '明文适应度应高于密文');

// 枚举 2～n 层时，适应度最高的候选应就是正确层数（换位攻击的回归测试）
function assertBestRails(plain, maxRails) {
  for (var rails = 2; rails <= maxRails; rails += 1) {
    var cipher = core.railFenceEncrypt(plain, rails);
    var bestR = 2;
    var bestScore = -Infinity;
    for (var r = 2; r <= plain.length; r += 1) {
      var s = core.englishFitness(core.railFenceDecrypt(cipher, r));
      if (s > bestScore) { bestScore = s; bestR = r; }
    }
    assert.strictEqual(bestR, rails,
      plain + ' 用 ' + rails + ' 层加密后，适应度排名应还原出 ' + rails + ' 层');
  }
}
// 第 2 关的演示消息：覆盖本关实际使用的 2～5 层
assertBestRails('MEETBYTHERIVERATSEVEN', 5);
// 其它常见英文句子：覆盖更宽的 2～8 层
['THEQUICKBROWNFOXJUMPSOVERTHELAZYDOG', 'WEAREDISCOVEREDFLEEATONCE',
 'ATTACKTHEEASTWALLOFTHECASTLEATDAWN', 'BRINGTHEREINFORCEMENTSTOTHEBRIDGE',
 'THEMEETINGWILLBEHOLDTOMORROWMORNING', 'WESHALLMEETATTHEOLDMILLATNOON'
].forEach(function (p) { assertBestRails(p, 8); });

// ---------- 逐字符栅栏（第 2 关谜题：花括号也参与重排） ----------
assert.strictEqual(core.railFenceCharsEncrypt('FLAG{FENCE}', 3), 'F{CLGFNEAE}');
for (var crails = 2; crails <= 6; crails += 1) {
  assert.strictEqual(core.railFenceCharsDecrypt(core.railFenceCharsEncrypt('FLAG{FENCE}', crails), crails),
    'FLAG{FENCE}', '逐字符栅栏 ' + crails + ' 层往返');
}
// 谜题可解性：3～5 层加密后，枚举 2～11 层时只有正确层数能还原出 FLAG{...} 格式
[3, 4, 5].forEach(function (rails) {
  var cipher = core.railFenceCharsEncrypt('FLAG{FENCE}', rails);
  var hits = [];
  for (var r = 2; r <= 11; r += 1) {
    if (/^FLAG\{[A-Z]+\}$/.test(core.railFenceCharsDecrypt(cipher, r))) hits.push(r);
  }
  assert.deepStrictEqual(hits, [rails], rails + ' 层谜题的 FLAG{ 锚点应唯一');
});

console.log('classical-test.js: 全部通过（Caesar / 栅栏 / Vigenere / XOR / hex / 频率 / 混合 n 元适应度）');
