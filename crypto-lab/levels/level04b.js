(function () {
  'use strict';

  // 介绍章：现代分组密码（第 4 关之后、第 5 关之前，无过关谜题）
  var CryptoLab = window.CryptoLab = window.CryptoLab || {};
  CryptoLab.levels = CryptoLab.levels || {};

  CryptoLab.levels.level04b = {
    init: function (panel) {
      var app = CryptoLab.app;
      var el = app.el;
      var core = CryptoLab.core;
      var aes = CryptoLab.aes;

      panel.appendChild(app.buildInfoBands(
        ['AES 的全部细节（标准公开）', '输入、输出'],
        ['128 位密钥']
      ));

      // --- 什么是字节：比特 ↔ 十六进制小交互 ---
      var byteCard = el('div', { className: 'card' }, [
        el('h3', { text: '什么是字节？' }),
        el('p', { html: '计算机把 <strong>8 个比特</strong>打包成一个<strong>字节</strong>。8 个比特能表示 0～255 共 256 种值，写起来太长，于是把 8 个比特分成两组 4 比特，每组正好写成一个<strong>十六进制数字</strong>（0-9, a-f 表示 10-15）：所以一个字节 = 8 比特 = 2 个十六进制字符。' }),
        el('p', { html: '例如大写字母 A 在计算机里的编号是 65：二进制 <code>01000001</code>，分成 <code>0100</code> 和 <code>0001</code>，即十六进制的 <code>4</code> 和 <code>1</code>，写作 <code>0x41</code>。' })
      ]);
      // 点击拨动 8 个比特，三种写法同步变化（初始值 65 = 'A'）。
      // 高半字节（b7..b4）与低半字节（b3..b0）使用蓝 / 青分色。
      var byteVal = 65;
      var bitCells = [];
      var bitRow = el('div', { className: 'byte-editor__bits' });
      var decOut = el('div', { className: 'byte-editor__control byte-editor__dec' });
      var hexHighChar = el('span', { className: 'byte-editor__hex-high' });
      var hexLowChar = el('span', { className: 'byte-editor__hex-low' });
      var hexHigh = el('div', { className: 'byte-editor__control byte-editor__control--high' });
      var hexLow = el('div', { className: 'byte-editor__control byte-editor__control--low' });
      var charOut = el('div', { className: 'byte-editor__control byte-editor__char' });
      function refreshByte() {
        bitCells.forEach(function (b) {
          var on = (byteVal >> b.index) & 1;
          b.cell.textContent = String(on);
          b.cell.classList.toggle('is-on', on === 1);
        });
        var hex = byteVal.toString(16).padStart(2, '0');
        decOut.textContent = String(byteVal);
        hexHighChar.textContent = hex.charAt(0);
        hexLowChar.textContent = hex.charAt(1);
        hexHigh.textContent = hex.charAt(0);
        hexLow.textContent = hex.charAt(1);
        charOut.textContent = byteVal >= 32 && byteVal <= 126 ? String.fromCharCode(byteVal) : '不可见';
      }
      for (var bi = 7; bi >= 0; bi -= 1) {
        (function (bitIndex) {
          var cell = el('div', { className: 'bit-cell ' + (bitIndex >= 4 ? 'bit-cell--high' : 'bit-cell--low'), text: '0' });
          cell.addEventListener('click', function () {
            byteVal ^= (1 << bitIndex);
            refreshByte();
          });
          bitCells.push({ index: bitIndex, cell: cell });
          bitRow.appendChild(cell);
          if (bitIndex === 4) bitRow.appendChild(el('span', { className: 'muted', text: ' ' }));
        })(bi);
      }
      refreshByte();
      // 位开关 + 半字节色标 + 十进制 / 十六进制字段（含组合展示）。
      byteCard.appendChild(el('div', { className: 'byte-editor' }, [
        el('div', { className: 'field' }, [el('label', { text: '点击拨动任意一个比特，三种写法同步变化' }), bitRow]),
        el('div', { className: 'byte-editor__nibble-labels' }, [
          el('span', { className: 'byte-editor__nibble-label--high', text: '高半字节 · b7..b4' }),
          el('span', { className: 'byte-editor__nibble-label--low', text: '低半字节 · b3..b0' })
        ]),
        el('div', { className: 'byte-editor__fields' }, [
          el('div', { className: 'byte-editor__field' }, [
            el('div', { className: 'byte-editor__field-label' }, [
              el('span', { text: '十进制' }),
              el('span', { className: 'muted', text: '0..255' })
            ]),
            decOut,
            el('div', { className: 'byte-editor__sub' }, [
              el('div', { className: 'byte-editor__field-label' }, [el('span', { text: 'ASCII 字符' })]),
              charOut
            ])
          ]),
          el('div', { className: 'byte-editor__field' }, [
            el('div', { className: 'byte-editor__field-label' }, [
              el('span', { text: '十六进制' }),
              el('span', { className: 'muted', text: '00..FF' })
            ]),
            el('div', { className: 'byte-editor__control byte-editor__combined' }, [
              el('span', { className: 'muted', text: '0x' }), hexHighChar, hexLowChar
            ]),
            el('div', { className: 'byte-editor__nibbles' }, [
              el('div', {}, [
                el('div', { className: 'byte-editor__nibble-label byte-editor__nibble-label--high', text: '高半字节' }),
                hexHigh
              ]),
              el('div', {}, [
                el('div', { className: 'byte-editor__nibble-label byte-editor__nibble-label--low', text: '低半字节' }),
                hexLow
              ])
            ])
          ])
        ])
      ]));
      byteCard.appendChild(el('p', { className: 'muted', html: '一段文字在计算机眼里就是一串字节：英文每字母一个字节（<code>MEET</code> = <code>4d 45 45 54</code>）。' }));
      panel.appendChild(byteCard);

      // --- 什么是 AES：图形化接口 ---
      var plainBox = el('div', { className: 'flow-box', style: 'border-color:#20c997' }, [
        el('span', { className: 'flow-box__label', text: '明文块' }),
        el('span', { className: 'flow-box__label', text: '（16 字节）' })
      ]);
      var cipherBox = el('div', { className: 'flow-box', style: 'border-color:#dc3545' }, [
        el('span', { className: 'flow-box__label', text: '密文块' }),
        el('span', { className: 'flow-box__label', text: '（16 字节）' })
      ]);
      var aesRow = el('div', { className: 'aes-diagram__row' }, [
        plainBox,
        el('span', { className: 'ctr-flow__op', text: '→' }),
        el('div', { className: 'flow-box aes-diagram__box', style: 'border-color:#6f42c1' }, [
          el('span', { className: 'flow-box__label', text: 'AES-128' }),
          el('span', { className: 'flow-box__label', text: '十轮搅拌' })
        ]),
        el('span', { className: 'ctr-flow__op', text: '→' }),
        cipherBox
      ]);
      panel.appendChild(el('div', { className: 'card' }, [
        el('h3', { text: '什么是 AES？' }),
        el('p', { html: 'AES 是现代最广泛使用的<strong>分组密码</strong>：把数据切成固定大小的小组来处理。AES-128 一次处理 16 字节（128 位）：' }),
        el('div', { className: 'aes-diagram' }, [
          el('div', { className: 'flow-box aes-diagram__box', style: 'border-color:#198754;margin-bottom:0.0rem' }, [
            el('span', { className: 'flow-box__label', text: '密钥' }),
             el('span', { className: 'flow-box__label', text: '（16 字节，保密）' })
          ]),
          el('div', { className: 'ctr-flow__op', text: '↓' }),
          aesRow
        ]),
        el('p', { html: '密钥块和明文块一样长——这正好符合支线 A 里一次一密的直觉：等长的密钥盖在等长的数据上。' }),
        el('p', { html: '不同的是，AES 内部会做十轮「替换、移位、混合」，而不是简单的一次 ⊕。' }),
        el('p', { html: '它的全部设计都是公开标准，攻击者也知道每个细节；秘密只有那把 128 位密钥。' })
      ]));

      // --- 思考题：穷举密钥是否可行 ---
      panel.appendChild(el('div', { className: 'card' }, [
        el('h3', { text: '思考题' }),
        el('details', { className: 'deep-dive' }, [
          el('summary', { text: '不破解算法，直接穷举 128 位密钥碰运气，可行吗？' }),
          el('p', { html: '不可行，时间开销说明一切。128 位密钥一共有 2<sup>128</sup> ≈ 3.4 × 10<sup>38</sup> 种可能；平均要试一半，约 1.7 × 10<sup>38</sup> 把。假设攻击者有一台每秒能试 10<sup>12</sup>（一万亿）把密钥的超级计算机，也要约 5 × 10<sup>18</sup> 年——宇宙年龄才约 1.4 × 10<sup>10</sup> 年。就算动用十亿台这样的计算机并行穷举，仍需约 5 × 10<sup>9</sup> 年。所以攻击者只能放弃穷举，转去寻找算法在使用上的漏洞——这正是下一关的故事。' })
        ])
      ]));

      // --- 混淆与扩散：雪崩小实验 ---
      var expCard = el('div', { className: 'card' }, [
        el('h3', { text: '混淆与扩散：翻一个比特试试' }),
        el('p', { text: '好的分组密码有两个追求：混淆（密钥和密文之间的关系尽量复杂，让人无法追踪）与扩散（输入的一点变化要蔓延到整个输出）。这两点合起来的外在表现，叫作雪崩效应。' })
      ]);
      var key = core.hexToBytes('2b7e151628aed2a6abf7158809cf4f3c');
      var input = core.hexToBytes('00112233445566778899aabbccddeeff');
      var expBox = el('div', { id: 'l4b-exp' });
      var btnFlipIn = el('button', { className: 'btn', text: '固定密钥，翻明文的一个比特' });
      var btnFlipKey = el('button', { className: 'btn', text: '固定明文，翻密钥的一个比特' });
      function hexLine(label, bytes, diffIndices) {
        var line = el('div', { className: 'hex-line' }, [el('span', { className: 'hex-line__label', text: label })]);
        for (var i = 0; i < bytes.length; i += 1) {
          line.appendChild(el('span', {
            className: 'hex-line__byte' + (diffIndices && diffIndices.indexOf(i) >= 0 ? ' is-diff' : ''),
            text: (bytes[i] & 0xff).toString(16).padStart(2, '0')
          }));
          if (i < bytes.length - 1) line.appendChild(document.createTextNode(' '));
        }
        return line;
      }
      function run(flipKey) {
        expBox.innerHTML = '';
        var out1 = aes.encryptBlock(input, key);
        var k2 = key.slice(), p2 = input.slice();
        if (flipKey) k2[0] ^= 1; else p2[0] ^= 1;
        var out2 = aes.encryptBlock(p2, k2);
        var diff = aes.diffBytes(out1, out2);
        expBox.appendChild(el('p', { className: 'muted mt-1 mb-1', text: '原始：' }));
        expBox.appendChild(hexLine('明文', input, null));
        expBox.appendChild(hexLine('密钥', key, null));
        expBox.appendChild(hexLine('输出', out1, null));
        expBox.appendChild(el('p', { className: 'muted mt-1 mb-1', text: (flipKey ? '固定明文，翻转密钥的第 1 个比特后' : '固定密钥，翻转明文的第 1 个比特后') + '（红字 = 与原始值相比发生变化的字节）：' }));
        expBox.appendChild(hexLine(flipKey ? '密钥' : '明文', flipKey ? k2 : p2, [0]));
        expBox.appendChild(hexLine('输出', out2, diff.indices));
        expBox.appendChild(el('p', { className: 'mono mt-1', text: '128 位中有 ' + diff.bits + ' 位不同（约一半）。' }));
        expBox.appendChild(el('p', { className: 'muted', text: '回想栅栏密码「一个字符只是搬家」——这里一个比特的变化铺满了整个输出。想看清内部怎样做到？本章结束后可以去支线 B。' }));
      }
      btnFlipIn.addEventListener('click', function () { run(false); });
      btnFlipKey.addEventListener('click', function () { run(true); });
      expCard.appendChild(el('div', { className: 'flex gap-1 wrap' }, [btnFlipIn, btnFlipKey]));
      expCard.appendChild(expBox);
      panel.appendChild(expCard);

      panel.appendChild(app.buildTakeaway(
        '现代分组密码（如 AES）把 16 字节当作一个整体搅拌：输入或密钥只翻 1 比特，输出约一半的比特都会改变。',
        null
      ));

      // 结尾：回到主线
      panel.appendChild(el('div', { className: 'card' }, [
        el('h3', { text: '回到主线：一个简单的扩展密钥方法' }),
        el('p', { text: 'AES 一次只搅拌 16 字节，而一条消息远不止 16 字节。下一关介绍一种简单的办法：让 AES 反复搅拌一串公开的计数器值，把每次的输出当作一个「一次性密钥块」分配给对应的消息分块——短密钥就这样被扩展成了足够多的密钥材料。' })
      ]));
    }
  };
})();
