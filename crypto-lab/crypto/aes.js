(function (global) {
  'use strict';

  // ============================================================
  // CryptoLab.aes · AES-128 分组加密（教学用，无 DOM 依赖）
  //
  // - state 为 16 字节普通数组（0..255），按 AES 标准列主序 4×4：
  //   state[r + 4*c] 表示第 r 行第 c 列。
  // - encryptBlock(input16, key16) -> 16 字节密文。
  // - encryptBlockTrace 返回每一步的中间状态，供支线 B 逐轮可视化。
  // - CTR 工具与 example.py 的机制一致：计数块 = 8 字节全零 nonce
  //   拼接 8 字节大端计数器，从 0 开始递增。
  // - ⚠️ 仅用于教学演示，不要用于真实加密。
  // ============================================================

  var SBOX = [
    0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
    0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
    0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
    0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
    0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
    0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
    0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
    0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
    0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
    0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
    0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
    0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
    0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
    0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
    0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
    0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16
  ];

  var RCON = [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

  // GF(2^8) 上乘 2
  function xtime(a) {
    a = (a << 1) & 0x1ff;
    if (a & 0x100) a ^= 0x11b;
    return a & 0xff;
  }

  function gfMul(a, b) {
    a &= 0xff; b &= 0xff;
    var r = 0;
    while (b > 0) {
      if (b & 1) r ^= a;
      a = xtime(a);
      b >>= 1;
    }
    return r & 0xff;
  }

  function requireBlock(arr, name) {
    if (!Array.isArray(arr) || arr.length !== 16) {
      throw new Error(name + ' 必须是 16 字节数组');
    }
    for (var i = 0; i < 16; i += 1) {
      if (!Number.isInteger(arr[i]) || arr[i] < 0 || arr[i] > 255) {
        throw new Error(name + ' 的元素必须是 0..255 的整数');
      }
    }
  }

  // ---------- 密钥扩展 ----------

  function keyExpansion(keyBytes) {
    requireBlock(keyBytes, '密钥');
    var words = [];
    var i, j;
    for (i = 0; i < 4; i += 1) words.push(keyBytes.slice(4 * i, 4 * i + 4));
    for (i = 4; i < 44; i += 1) {
      var temp = words[i - 1].slice();
      if (i % 4 === 0) {
        temp = [SBOX[temp[1]], SBOX[temp[2]], SBOX[temp[3]], SBOX[temp[0]]];
        temp[0] ^= RCON[i / 4];
      }
      var out = new Array(4);
      for (j = 0; j < 4; j += 1) out[j] = temp[j] ^ words[i - 4][j];
      words.push(out);
    }
    var roundKeys = [];
    for (i = 0; i < 11; i += 1) {
      var rk = [];
      for (j = 0; j < 4; j += 1) rk = rk.concat(words[4 * i + j]);
      roundKeys.push(rk);
    }
    return roundKeys;
  }

  // ---------- 轮变换（就地修改 state） ----------

  function addRoundKey(state, roundKey) {
    for (var i = 0; i < 16; i += 1) state[i] ^= roundKey[i];
  }

  function subBytes(state) {
    for (var i = 0; i < 16; i += 1) state[i] = SBOX[state[i]];
  }

  function shiftRows(state) {
    var s = state.slice();
    for (var r = 0; r < 4; r += 1) {
      for (var c = 0; c < 4; c += 1) {
        state[r + 4 * c] = s[r + 4 * ((c + r) % 4)];
      }
    }
  }

  function mixColumns(state) {
    for (var c = 0; c < 4; c += 1) {
      var s0 = state[4 * c], s1 = state[4 * c + 1], s2 = state[4 * c + 2], s3 = state[4 * c + 3];
      state[4 * c] = xtime(s0) ^ (xtime(s1) ^ s1) ^ s2 ^ s3;
      state[4 * c + 1] = s0 ^ xtime(s1) ^ (xtime(s2) ^ s2) ^ s3;
      state[4 * c + 2] = s0 ^ s1 ^ xtime(s2) ^ (xtime(s3) ^ s3);
      state[4 * c + 3] = (xtime(s0) ^ s0) ^ s1 ^ s2 ^ xtime(s3);
    }
  }

  // ---------- 加密（带 trace） ----------

  // 返回 { ciphertext, steps }。steps 中每一项：
  // { round, step, name, state } —— state 为该步骤完成后的 16 字节状态。
  // round = 0 表示入口的初始 AddRoundKey。
  function encryptBlockTrace(plainBytes, keyBytes) {
    requireBlock(plainBytes, '明文');
    requireBlock(keyBytes, '密钥');
    var roundKeys = keyExpansion(keyBytes);
    var state = plainBytes.slice();
    var steps = [];

    function record(round, step, name) {
      steps.push({ round: round, step: step, name: name, state: state.slice() });
    }

    addRoundKey(state, roundKeys[0]);
    record(0, 'AddRoundKey', '初始轮密钥加');
    var round;
    for (round = 1; round <= 9; round += 1) {
      subBytes(state); record(round, 'SubBytes', '字节代换');
      shiftRows(state); record(round, 'ShiftRows', '行移位');
      mixColumns(state); record(round, 'MixColumns', '列混合');
      addRoundKey(state, roundKeys[round]); record(round, 'AddRoundKey', '轮密钥加');
    }
    subBytes(state); record(10, 'SubBytes', '字节代换');
    shiftRows(state); record(10, 'ShiftRows', '行移位');
    addRoundKey(state, roundKeys[10]); record(10, 'AddRoundKey', '轮密钥加');

    return { ciphertext: state.slice(), steps: steps, roundKeys: roundKeys };
  }

  function encryptBlock(plainBytes, keyBytes) {
    return encryptBlockTrace(plainBytes, keyBytes).ciphertext;
  }

  // ---------- CTR 工具（与 example.py 机制一致） ----------

  // 计数块：8 字节全零 nonce + 8 字节大端计数器
  function counterBlock(counter) {
    var block = new Array(16);
    var i;
    for (i = 0; i < 16; i += 1) block[i] = 0;
    var c = counter;
    for (i = 15; i >= 8; i -= 1) {
      block[i] = c & 0xff;
      c = Math.floor(c / 256);
    }
    return block;
  }

  // 从 startCounter 开始生成 blocks 个 16 字节密钥流块，返回扁平字节数组
  function ctrKeystream(keyBytes, startCounter, blocks) {
    var out = [];
    for (var i = 0; i < blocks; i += 1) {
      out = out.concat(encryptBlock(counterBlock(startCounter + i), keyBytes));
    }
    return out;
  }

  // nonce 固定全零、计数器从 0 开始的 CTR 加解密（对称）
  function ctrCrypt(keyBytes, nonceZeroStart, data) {
    if (nonceZeroStart !== 0 && nonceZeroStart !== undefined) {
      throw new Error('教学演示中计数器固定从 0 开始');
    }
    var blocks = Math.ceil(data.length / 16);
    var stream = ctrKeystream(keyBytes, 0, blocks).slice(0, data.length);
    var out = new Array(data.length);
    for (var i = 0; i < data.length; i += 1) out[i] = (data[i] ^ stream[i]) & 0xff;
    return out;
  }

  // ---------- 差异统计 ----------

  function popcount8(v) {
    var n = 0;
    for (var i = 0; i < 8; i += 1) n += (v >> i) & 1;
    return n;
  }

  // 比较两个等长字节数组：不同字节数、不同比特数（汉明距离）、不同字节下标
  function diffBytes(a, b) {
    var indices = [];
    var bits = 0;
    for (var i = 0; i < a.length; i += 1) {
      var d = (a[i] ^ b[i]) & 0xff;
      if (d !== 0) {
        indices.push(i);
        bits += popcount8(d);
      }
    }
    return { bytes: indices.length, bits: bits, indices: indices };
  }

  var CryptoLab = global.CryptoLab = global.CryptoLab || {};
  CryptoLab.aes = {
    SBOX: SBOX,
    RCON: RCON,
    xtime: xtime,
    gfMul: gfMul,
    keyExpansion: keyExpansion,
    encryptBlock: encryptBlock,
    encryptBlockTrace: encryptBlockTrace,
    counterBlock: counterBlock,
    ctrKeystream: ctrKeystream,
    ctrCrypt: ctrCrypt,
    diffBytes: diffBytes
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CryptoLab.aes;
  }
})(typeof window !== 'undefined' ? window : globalThis);
