(function (global) {
  'use strict';

  // ============================================================
  // CryptoLab.core · 古典密码与字节工具（纯函数，无 DOM 依赖）
  // 供各关卡与 Node 测试复用。⚠️ 仅用于教学演示。
  // ============================================================

  var CryptoLab = global.CryptoLab = global.CryptoLab || {};

  var A_CODE = 'A'.charCodeAt(0);

  function mod(n, m) {
    return ((n % m) + m) % m;
  }

  // 只保留 A-Z 并转大写
  function lettersOnly(text) {
    return String(text == null ? '' : text).toUpperCase().replace(/[^A-Z]/g, '');
  }

  function charToNum(ch) {
    return ch.toUpperCase().charCodeAt(0) - A_CODE;
  }

  function numToChar(n) {
    return String.fromCharCode(A_CODE + mod(n, 26));
  }

  // ---------- Caesar ----------

  // 对 A-Z 字母做模 26 移位，其余字符原样保留
  function caesarShift(text, k) {
    var out = '';
    var s = String(text == null ? '' : text);
    for (var i = 0; i < s.length; i += 1) {
      var ch = s.charAt(i);
      if (/[A-Za-z]/.test(ch)) {
        out += numToChar(charToNum(ch) + k);
      } else {
        out += ch;
      }
    }
    return out;
  }

  function caesarEncrypt(text, k) { return caesarShift(text, k); }
  function caesarDecrypt(text, k) { return caesarShift(text, -k); }

  // ---------- 栅栏密码（rail fence，zigzag） ----------

  function railFenceEncrypt(text, rails) {
    var s = lettersOnly(text);
    rails = Math.max(2, rails | 0);
    if (s.length === 0) return '';
    var rows = [];
    var r, i;
    for (r = 0; r < rails; r += 1) rows.push([]);
    var row = 0;
    var dir = 1;
    for (i = 0; i < s.length; i += 1) {
      rows[row].push(s.charAt(i));
      row += dir;
      if (row === rails - 1 || row === 0) dir = -dir;
    }
    var out = '';
    for (r = 0; r < rails; r += 1) out += rows[r].join('');
    return out;
  }

  // 返回每个明文字符所在的层号，供摆放可视化复用
  function railFencePattern(length, rails) {
    var pattern = [];
    var row = 0;
    var dir = 1;
    for (var i = 0; i < length; i += 1) {
      pattern.push(row);
      row += dir;
      if (row === rails - 1 || row === 0) dir = -dir;
    }
    return pattern;
  }

  function railFenceDecrypt(cipher, rails) {
    var s = lettersOnly(cipher);
    rails = Math.max(2, rails | 0);
    var n = s.length;
    if (n === 0) return '';
    var pattern = railFencePattern(n, rails);
    // 每层有多少字符
    var counts = [];
    var r, i;
    for (r = 0; r < rails; r += 1) counts.push(0);
    for (i = 0; i < n; i += 1) counts[pattern[i]] += 1;
    // 把密文按层切开
    var rows = [];
    var pos = 0;
    for (r = 0; r < rails; r += 1) {
      rows.push(s.slice(pos, pos + counts[r]));
      pos += counts[r];
    }
    // 按 zigzag 顺序读回
    var rowPos = [];
    for (r = 0; r < rails; r += 1) rowPos.push(0);
    var out = '';
    for (i = 0; i < n; i += 1) {
      var row = pattern[i];
      out += rows[row].charAt(rowPos[row]);
      rowPos[row] += 1;
    }
    return out;
  }

  // 逐字符变体：所有字符（含 {} 等符号）都参与重排，用于带提示标记的谜题。
  // 例如 railFenceCharsEncrypt('FLAG{FENCE}', 3) === 'F{CLGFNEAE}'
  function railFenceCharsEncrypt(text, rails) {
    var s = String(text == null ? '' : text);
    rails = Math.max(2, rails | 0);
    if (s.length === 0) return '';
    var rows = [];
    var r, i;
    for (r = 0; r < rails; r += 1) rows.push([]);
    var pattern = railFencePattern(s.length, rails);
    for (i = 0; i < s.length; i += 1) rows[pattern[i]].push(s.charAt(i));
    var out = '';
    for (r = 0; r < rails; r += 1) out += rows[r].join('');
    return out;
  }

  function railFenceCharsDecrypt(cipher, rails) {
    var s = String(cipher == null ? '' : cipher);
    rails = Math.max(2, rails | 0);
    var n = s.length;
    if (n === 0) return '';
    var pattern = railFencePattern(n, rails);
    var counts = [];
    var r, i;
    for (r = 0; r < rails; r += 1) counts.push(0);
    for (i = 0; i < n; i += 1) counts[pattern[i]] += 1;
    var rows = [];
    var pos = 0;
    for (r = 0; r < rails; r += 1) {
      rows.push(s.slice(pos, pos + counts[r]));
      pos += counts[r];
    }
    var rowPos = [];
    for (r = 0; r < rails; r += 1) rowPos.push(0);
    var out = '';
    for (i = 0; i < n; i += 1) {
      var row = pattern[i];
      out += rows[row].charAt(rowPos[row]);
      rowPos[row] += 1;
    }
    return out;
  }

  // ---------- Vigenere ----------

  function vigenereCrypt(text, key, decrypt) {
    var s = String(text == null ? '' : text).toUpperCase();
    var k = lettersOnly(key);
    if (k.length === 0) return s;
    var out = '';
    var ki = 0;
    for (var i = 0; i < s.length; i += 1) {
      var ch = s.charAt(i);
      if (/[A-Z]/.test(ch)) {
        var shift = charToNum(k.charAt(ki % k.length));
        out += numToChar(charToNum(ch) + (decrypt ? -shift : shift));
        ki += 1;
      } else {
        out += ch;
      }
    }
    return out;
  }

  function vigenereEncrypt(text, key) { return vigenereCrypt(text, key, false); }
  function vigenereDecrypt(text, key) { return vigenereCrypt(text, key, true); }

  // ---------- XOR / 字节工具 ----------

  function xorBytes(a, b) {
    var n = Math.min(a.length, b.length);
    var out = new Array(n);
    for (var i = 0; i < n; i += 1) out[i] = (a[i] ^ b[i]) & 0xff;
    return out;
  }

  function bytesToHex(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i += 1) {
      var h = (bytes[i] & 0xff).toString(16);
      s += (h.length < 2 ? '0' : '') + h;
    }
    return s;
  }

  function hexToBytes(hex) {
    var s = String(hex == null ? '' : hex).replace(/\s+/g, '').toLowerCase();
    if (/^0x/.test(s)) s = s.slice(2);
    if (s.length === 0 || s.length % 2 !== 0 || /[^0-9a-f]/.test(s)) {
      throw new Error('需要偶数长度的 0-9a-f 十六进制字符');
    }
    var out = [];
    for (var i = 0; i < s.length; i += 2) out.push(parseInt(s.slice(i, i + 2), 16));
    return out;
  }

  // 教学页面里的消息均为 ASCII；非 ASCII 字符按 UTF-8 编码
  function textToBytes(text) {
    var s = String(text == null ? '' : text);
    var out = [];
    for (var i = 0; i < s.length; i += 1) {
      var code = s.charCodeAt(i);
      if (code < 0x80) {
        out.push(code);
      } else {
        var encoded = unescape(encodeURIComponent(s.charAt(i)));
        for (var j = 0; j < encoded.length; j += 1) out.push(encoded.charCodeAt(j));
      }
    }
    return out;
  }

  function bytesToText(bytes) {
    var raw = '';
    for (var i = 0; i < bytes.length; i += 1) raw += String.fromCharCode(bytes[i] & 0xff);
    try {
      return decodeURIComponent(escape(raw));
    } catch (e) {
      return raw;
    }
  }

  // ---------- 字母频率统计 ----------

  // 返回长度为 26 的计数数组（只统计 A-Z）
  function letterFrequency(text) {
    var counts = new Array(26);
    for (var i = 0; i < 26; i += 1) counts[i] = 0;
    var s = String(text == null ? '' : text).toUpperCase();
    for (var j = 0; j < s.length; j += 1) {
      var c = s.charCodeAt(j) - A_CODE;
      if (c >= 0 && c < 26) counts[c] += 1;
    }
    return counts;
  }

  // ---------- 英文评分（供穷举攻击打分） ----------

  // 英文字母频率（百分比），ETAOIN 顺序
  var ENGLISH_FREQ = [
    8.17, 1.49, 2.78, 4.25, 12.70, 2.23, 2.02, 6.09, 6.97, 0.15,
    0.77, 4.03, 2.41, 6.75, 7.51, 1.93, 0.10, 5.99, 6.33, 9.06,
    2.76, 0.98, 2.36, 0.15, 1.97, 0.07
  ];

  var COMMON_WORDS = ['THE', 'AND', 'OF', 'TO', 'IN', 'IS', 'THAT', 'FOR', 'ON', 'WITH', 'AS', 'AT', 'BE', 'IT'];

  // 常见英文二元组（bigram），换位密码会破坏它们
  var COMMON_BIGRAMS = ['TH', 'HE', 'IN', 'ER', 'AN', 'RE', 'ON', 'AT', 'EN', 'ND',
    'TI', 'ES', 'OR', 'TE', 'OF', 'ED', 'IS', 'IT', 'AL', 'AR', 'ST', 'TO', 'NT', 'NG'];

  // 与英语频率表的卡方距离；越小越像英文。无字母时返回 Infinity。
  function chiSquare(text) {
    var counts = letterFrequency(text);
    var n = 0;
    var i;
    for (i = 0; i < 26; i += 1) n += counts[i];
    if (n === 0) return Infinity;
    var chi2 = 0;
    for (i = 0; i < 26; i += 1) {
      var expected = (ENGLISH_FREQ[i] / 100) * n;
      if (expected > 0) {
        var diff = counts[i] - expected;
        chi2 += (diff * diff) / expected;
      }
    }
    return chi2;
  }

  // 英文评分：卡方距离减去常见短词加分；越低越像英文。
  function scoreEnglish(text) {
    var chi2 = chiSquare(text);
    if (chi2 === Infinity) return Infinity;
    var upper = ' ' + String(text == null ? '' : text).toUpperCase().replace(/[^A-Z]+/g, ' ') + ' ';
    var bonus = 0;
    COMMON_WORDS.forEach(function (word) {
      var needle = ' ' + word + ' ';
      var idx = upper.indexOf(needle);
      while (idx >= 0) {
        bonus += word.length * 8;
        idx = upper.indexOf(needle, idx + 1);
      }
    });
    return chi2 - bonus;
  }

  // 二元语言统计：常见 bigram 命中次数；越高越像通顺英文。
  // 换位密码不改变单字母频率，但会破坏相邻字母的组合。
  function scoreBigrams(text) {
    var s = lettersOnly(text);
    var hits = 0;
    for (var i = 0; i + 1 < s.length; i += 1) {
      if (COMMON_BIGRAMS.indexOf(s.slice(i, i + 2)) >= 0) hits += 1;
    }
    return hits;
  }

  // ---------- 英文适应度：二元组 log 概率 ----------
  // 语料来源：practicalcryptography.com 的 english_bigrams.txt
  // （英文书籍语料中 676 个字母组合的出现次数，按 AA..ZZ 行优先排列）。
  // 适应度 = 所有相邻字母对的 log10(P(组合)) 之和：命中常见组合加分、
  // 命中罕见组合减分，比「只数 24 个常见组合的命中次数」可靠得多。
  var BIGRAM_COUNTS = [
    // A*
    1721143, 8775582, 17904683, 14877234, 815963, 5702567, 8809266, 2225270, 13974919, 870262, 5137311, 38211584, 15975981, 69775179, 749566, 8553911, 315068, 42353262, 37773878, 48274564, 4884168, 8288885, 3918960, 660826, 11523416, 768359,
    // B*
    8867461, 689158, 320380, 141752, 19468489, 75352, 40516, 154489, 4356462, 282608, 26993, 6941044, 191807, 106125, 8172395, 115161, 5513, 4621080, 1409672, 428276, 8113271, 120081, 140189, 3021, 5232074, 8132,
    // C*
    19930754, 298053, 3026492, 358435, 19803619, 267630, 181590, 20132750, 8446084, 41526, 7205091, 5683204, 285942, 188046, 26737101, 382923, 157546, 5514347, 1381608, 11888752, 4604045, 94224, 257253, 5300, 1145316, 57914,
    // D*
    17584055, 6106719, 3782481, 4001275, 27029835, 4033878, 2442139, 4585765, 21673998, 799366, 525744, 3050945, 3544905, 2840522, 13120322, 3145043, 283314, 5701879, 10429887, 15759673, 5861311, 1238565, 4906814, 27413, 2218040, 98038,
    // E*
    43329810, 9738798, 25775798, 46647960, 18497942, 13252227, 8286463, 7559141, 16026915, 1256993, 2411639, 23092248, 18145294, 48991276, 13524186, 14024377, 1461436, 77134382, 57070453, 32872552, 3674130, 10574011, 14776406, 5649363, 7528342, 465466,
    // F*
    8357929, 888155, 1570791, 748027, 8529289, 6085519, 637758, 1507604, 11993833, 269865, 228905, 2890839, 1251312, 534362, 18923772, 1199845, 47504, 8339376, 2047416, 13696078, 3138900, 244685, 1005903, 19313, 789961, 31186,
    // G*
    11239788, 1184377, 1299541, 879792, 14425023, 1465290, 1468286, 9880399, 7103140, 176947, 163830, 2576787, 1178511, 2426429, 8188708, 1215204, 59750, 6989963, 3920675, 7347990, 3768430, 186777, 1567991, 14778, 979804, 28514,
    // H*
    35971841, 1014004, 1441057, 828755, 100689263, 834284, 429607, 1329998, 27495342, 189906, 210385, 1169468, 1353001, 1383958, 19729026, 978649, 101241, 3843001, 2462026, 8351551, 2771830, 197539, 1403223, 7526, 1446451, 37066,
    // I*
    10002012, 2598444, 21468412, 12896787, 12505546, 5740414, 9530574, 610683, 607124, 219128, 2585124, 17877600, 10544422, 87674002, 21210160, 3348621, 291635, 11681353, 37349981, 37938534, 576683, 9129232, 922059, 879360, 98361, 1865802,
    // J*
    1712763, 19380, 24770, 21903, 1487348, 12640, 12023, 20960, 357577, 16085, 13967, 12149, 22338, 14452, 2721345, 34520, 722, 80471, 39326, 20408, 2924815, 8925, 16083, 747, 5723, 2859,
    // K*
    2833038, 457860, 420017, 277982, 10650670, 537342, 209266, 650095, 5814357, 76816, 118811, 846309, 485617, 1903836, 1758001, 375653, 13905, 507020, 3227333, 1443985, 506618, 73184, 719633, 5083, 553296, 11192,
    // L*
    23178317, 2463693, 2328063, 10245579, 30383262, 2702522, 926472, 1274048, 23291169, 218362, 1164186, 24636875, 2216514, 752316, 15596310, 2543957, 77148, 1505092, 8675452, 6817273, 4402940, 1238287, 1836811, 15467, 13742031, 57314,
    // M*
    21828378, 4121764, 1101727, 481126, 27237733, 715087, 285133, 710864, 12168944, 134263, 111041, 478528, 3730508, 558397, 12950768, 7835172, 21358, 660619, 3922855, 3055946, 3755834, 136314, 937621, 14250, 1949129, 18271,
    // N*
    23547524, 3602692, 15214623, 46194306, 27331675, 4950333, 38567365, 3915410, 17452104, 1342735, 3043200, 3692985, 3796928, 5180899, 18894111, 2968126, 217422, 2393580, 21306421, 50701084, 3732602, 2194534, 4215967, 74844, 4343290, 266461,
    // O*
    6554221, 6212512, 7646952, 7610214, 2616308, 30540904, 4163126, 3254659, 5336616, 661082, 3397570, 13726491, 21066156, 56915252, 10168856, 10459455, 122677, 45725191, 13596265, 20088048, 31112284, 7350014, 14610429, 650078, 1932892, 228556,
    // P*
    12068709, 369336, 400308, 273162, 15573318, 418168, 211133, 2825344, 5559210, 47043, 83017, 9812226, 931225, 131645, 11917535, 4873393, 18607, 13191182, 2377036, 3812475, 3858148, 48105, 530411, 6814, 396147, 9697,
    // Q*
    73527, 27307, 10667, 8678, 6020, 8778, 2567, 12273, 73387, 1342, 2023, 9603, 12315, 3808, 9394, 6062, 2499, 5975, 20847, 16914, 4169424, 4212, 34669, 765, 4557, 280,
    // R*
    28645577, 3346212, 6974063, 9025637, 60923600, 3436232, 4645938, 2968706, 27634643, 518157, 4491400, 4803246, 7377989, 7064635, 29230770, 3588188, 156933, 5896212, 21237259, 21456059, 5330557, 2692445, 3348005, 38654, 8788539, 113432,
    // S*
    30080131, 5553684, 10800636, 3842250, 31532272, 6073995, 2043770, 16773127, 25758841, 704442, 2321888, 4965012, 5580755, 4157990, 23903631, 10570626, 800346, 3513808, 18915696, 54018399, 10031005, 882083, 8673234, 50975, 2214270, 79840,
    // T*
    26147593, 3815459, 5196817, 2346516, 42295813, 3368452, 1530045, 116997844, 42888666, 559473, 610333, 5403137, 3759861, 1782119, 46115188, 3070427, 159111, 15821226, 18922522, 19367472, 8477495, 698150, 8910254, 28156, 8008918, 280007,
    // U*
    4589997, 2990868, 5742385, 3499535, 4927837, 701892, 4832325, 339341, 3481482, 88168, 514873, 10173468, 4389720, 15237699, 649906, 5306948, 23386, 17341717, 15699353, 15137169, 63043, 212051, 352732, 144814, 531960, 153736,
    // V*
    4111375, 29192, 59024, 85611, 29320973, 28090, 25585, 30203, 9380037, 11432, 11469, 49032, 35024, 33082, 2253292, 62577, 1488, 96416, 204093, 62912, 82830, 22329, 45608, 3192, 233082, 2633,
    // W*
    16838794, 394820, 448394, 432646, 13185116, 336213, 139890, 11852909, 15213018, 99435, 148964, 657782, 505687, 3649615, 9106647, 321746, 16245, 1226755, 1988727, 1301293, 180884, 63930, 674610, 4678, 553647, 52836,
    // X*
    904148, 94041, 697995, 60101, 653947, 113031, 39289, 166599, 1024736, 10629, 13651, 59585, 127492, 34734, 211173, 1840696, 5416, 90046, 154347, 1509969, 147533, 31117, 119322, 35052, 94329, 2082,
    // Y*
    7239548, 2696786, 3128053, 2122337, 6499305, 2305244, 1049082, 2291273, 4461214, 378679, 391953, 2013939, 2516273, 1485655, 9088497, 2581863, 87953, 2021939, 7539621, 6714151, 695512, 411487, 3379064, 16945, 332973, 78281,
    // Z*
    929119, 50652, 41037, 32906, 1709871, 28658, 26369, 107639, 644035, 7167, 24262, 80039, 46034, 24241, 424016, 30389, 5773, 32685, 94993, 56955, 113538, 14339, 68865, 2463, 105871, 221275
  ];

  // 预计算每个二元组的 log10 概率
  var BIGRAM_LOG = (function () {
    var total = 0;
    var i;
    for (i = 0; i < BIGRAM_COUNTS.length; i += 1) total += BIGRAM_COUNTS[i];
    var logs = [];
    for (i = 0; i < BIGRAM_COUNTS.length; i += 1) {
      logs.push(Math.log10(BIGRAM_COUNTS[i] / total));
    }
    return logs;
  })();

  // 适应度 = 相邻字母对的 log 概率之和；越高越像通顺英文。
  // 换位密码保留单字母频率，必须用相邻关系才能区分还原质量。
  function bigramFitness(text) {
    var s = lettersOnly(text);
    var sum = 0;
    for (var i = 0; i + 1 < s.length; i += 1) {
      var a = s.charCodeAt(i) - A_CODE;
      var b = s.charCodeAt(i + 1) - A_CODE;
      sum += BIGRAM_LOG[a * 26 + b];
    }
    return sum;
  }

  // ---------- 混合 n 元适应度（二元 + 三元 + 四元） ----------
  // 更长的组合提供更多线索：纯二元打分在短消息或高层数栅栏上仍会认错，
  // 叠加三元 / 四元组合的 log 概率后明显更稳。数据在 english-ngrams.js，
  // 浏览器由 <script> 先行加载，Node 下在此直接 require。
  var ENGLISH_NGRAMS = global.CryptoLabEnglishNgrams;
  if (!ENGLISH_NGRAMS && typeof module !== 'undefined' && module.exports) {
    ENGLISH_NGRAMS = require('./english-ngrams.js');
  }

  // 把「组合 次数」列表解析成 log10 概率表；表外组合用地板值兜底
  function buildNgramLog(str, total) {
    var logs = {};
    var parts = String(str).split(/\s+/);
    for (var i = 0; i + 1 < parts.length; i += 2) {
      logs[parts[i]] = Math.log10(Number(parts[i + 1]) / total);
    }
    return { logs: logs, floor: Math.log10(0.01 / total) };
  }

  var TRIGRAM_LOG = null;
  var QUADGRAM_LOG = null;
  if (ENGLISH_NGRAMS) {
    TRIGRAM_LOG = buildNgramLog(ENGLISH_NGRAMS.trigrams, ENGLISH_NGRAMS.trigramTotal);
    QUADGRAM_LOG = buildNgramLog(ENGLISH_NGRAMS.quadgrams, ENGLISH_NGRAMS.quadgramTotal);
  }

  // 混合适应度：二元全表 + 三元 top 2000 + 四元 top 3000 的 log 概率之和。
  // 数据缺失时退化为纯二元打分，不影响页面其它功能。
  function englishFitness(text) {
    var s = lettersOnly(text);
    var sum = bigramFitness(s);
    if (!TRIGRAM_LOG) return sum;
    var i, v;
    for (i = 0; i + 2 < s.length; i += 1) {
      v = TRIGRAM_LOG.logs[s.slice(i, i + 3)];
      sum += v === undefined ? TRIGRAM_LOG.floor : v;
    }
    for (i = 0; i + 3 < s.length; i += 1) {
      v = QUADGRAM_LOG.logs[s.slice(i, i + 4)];
      sum += v === undefined ? QUADGRAM_LOG.floor : v;
    }
    return sum;
  }

  CryptoLab.core = {
    mod: mod,
    lettersOnly: lettersOnly,
    charToNum: charToNum,
    numToChar: numToChar,
    caesarEncrypt: caesarEncrypt,
    caesarDecrypt: caesarDecrypt,
    railFenceEncrypt: railFenceEncrypt,
    railFenceDecrypt: railFenceDecrypt,
    railFenceCharsEncrypt: railFenceCharsEncrypt,
    railFenceCharsDecrypt: railFenceCharsDecrypt,
    railFencePattern: railFencePattern,
    vigenereEncrypt: vigenereEncrypt,
    vigenereDecrypt: vigenereDecrypt,
    xorBytes: xorBytes,
    bytesToHex: bytesToHex,
    hexToBytes: hexToBytes,
    textToBytes: textToBytes,
    bytesToText: bytesToText,
    letterFrequency: letterFrequency,
    chiSquare: chiSquare,
    scoreEnglish: scoreEnglish,
    scoreBigrams: scoreBigrams,
    bigramFitness: bigramFitness,
    englishFitness: englishFitness,
    COMMON_BIGRAMS: COMMON_BIGRAMS
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CryptoLab.core;
  }
})(typeof window !== 'undefined' ? window : globalThis);
