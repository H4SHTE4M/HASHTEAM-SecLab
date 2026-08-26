(function () {
  'use strict';

  // 第 5 关：AES-CTR，高强度搅拌与密钥流
  var CryptoLab = window.CryptoLab = window.CryptoLab || {};
  CryptoLab.levels = CryptoLab.levels || {};

  // 关卡固定演示密钥（界面上显示为「未知」）
  var DEMO_KEY_HEX = '4e49554c4149202642414f4c41212121'; // 16 字节

  CryptoLab.levels.level05 = {
    init: function (panel) {
      var app = CryptoLab.app;
      var el = app.el;
      var core = CryptoLab.core;
      var aes = CryptoLab.aes;
      var key = core.hexToBytes(DEMO_KEY_HEX);

      panel.appendChild(app.buildInfoBands(
        ['AES-128 的细节', 'CTR 工作模式', '起始计数值', '密文'],
        ['AES 密钥', '尚未泄漏的明文']
      ));

      panel.appendChild(el('div', { className: 'card' }, [
        el('h3', { text: 'AES-CTR：一种特殊的工作模式' }),
        el('p', { html: 'AES 一次只搅拌 16 字节。要加密任意长度的消息，需要一种<strong>工作模式</strong>。CTR（计数器模式）的思路正好回答了上一章结尾的问题：它不直接加密消息，而是让 AES 反复搅拌一串公开的计数器值 0、1、2…，把每次的输出当作一个「一次性密钥块」分配给对应的消息分块，再做第 4 关的 ⊕。一把短密钥就这样扩展出了足够多的密钥材料。' })
      ]));

      // ---------- 图形化流程组件（5.2 与 5.3 复用） ----------
      // 约定与介绍章一致：从左到右 明文块 → AES → 密文块，密钥从 AES 上方输入。
      // 计数器值作为 AES 的输入在明文位置，AES 输出（密钥流）再与明文 ⊕。
      function valueBox(label, text, color) {
        return el('div', { className: 'flow-box', style: 'border-color:' + color }, [
          el('span', { className: 'flow-box__label', text: label }),
          el('span', { className: 'mono flow-box__hex', text: text })
        ]);
      }
      function aesStage(inputLabel, inputText, outputLabel, outputText) {
        return el('div', { className: 'aes-diagram' }, [
          valueBox('密钥', '保密', '#198754'),
          el('div', { className: 'ctr-flow__op', text: '↓' }),
          el('div', { className: 'aes-diagram__row' }, [
            valueBox(inputLabel, inputText, '#0d6efd'),
            el('span', { className: 'ctr-flow__op', text: '→' }),
            valueBox('AES', '搅拌', '#6f42c1'),
            el('span', { className: 'ctr-flow__op', text: '→' }),
            valueBox(outputLabel, outputText, '#fd7e14')
          ])
        ]);
      }

      // ================= 5.1 先不拆开看 =================
      var s51 = el('div', { className: 'card' }, [
        el('h3', { text: '5.1 先不拆开看：AES 的外在表现' }),
        el('p', { className: 'mono', text: 'AES-128：16 字节输入 + 16 字节密钥 → AES → 16 字节输出' }),
        el('p', { text: 'AES 的标准和内部细节全部公开，攻击者也知道；这里只观察输入与输出的关系（想拆开看内部，可以去支线 B）。' })
      ]);
      var baseInput = core.hexToBytes('00112233445566778899aabbccddeeff');
      var expBox = el('div', { id: 'l5-exp' });
      function matrix(bytes, diffIndices) {
        // 与支线 B 一致用紧凑矩阵：移动端也能并排放下两个
        var m = el('div', { className: 'byte-matrix byte-matrix--compact' });
        for (var r = 0; r < 4; r += 1) {
          for (var c = 0; c < 4; c += 1) {
            var i = c * 4 + r;
            m.appendChild(el('div', {
              className: 'byte-matrix__cell' + (diffIndices && diffIndices.indexOf(i) >= 0 ? ' is-diff' : ''),
              text: (bytes[i] & 0xff).toString(16).padStart(2, '0')
            }));
          }
        }
        return m;
      }
      function runExperiment(flipKey) {
        expBox.innerHTML = '';
        var out1 = aes.encryptBlock(baseInput, key);
        var key2 = key.slice();
        var input2 = baseInput.slice();
        var desc;
        if (flipKey) {
          key2[0] ^= 0x01;
          desc = '实验：固定输入，只翻转密钥的第 1 个比特';
        } else {
          input2[0] ^= 0x01;
          desc = '实验：固定密钥，只翻转输入的第 1 个比特';
        }
        var out2 = aes.encryptBlock(input2, key2);
        var diff = aes.diffBytes(out1, out2);
        expBox.appendChild(el('p', { html: '<strong>' + desc + '</strong>' }));
        expBox.appendChild(el('div', { className: 'race-mats mt-1' }, [
          el('div', { className: 'race-mats__item' }, [el('p', { className: 'muted mb-1', text: '原输出' }), matrix(out1, null)]),
          el('div', { className: 'race-mats__item' }, [el('p', { className: 'muted mb-1', text: '翻转 1 比特后' }), matrix(out2, diff.indices)])
        ]));
        expBox.appendChild(el('p', { className: 'mono mt-1', text: '红色 = 变化的字节， 128 位中有 ' + diff.bits + ' 位不同（≈ 一半），' + diff.bytes + '/16 个字节变化。' }));
      }
      var btnFlipKey = el('button', { className: 'btn', text: '实验：翻密钥一比特' });
      var btnFlipIn = el('button', { className: 'btn', text: '实验：翻输入一比特' });
      btnFlipKey.addEventListener('click', function () { runExperiment(true); });
      btnFlipIn.addEventListener('click', function () { runExperiment(false); });
      s51.appendChild(el('div', { className: 'flex gap-1 wrap' }, [btnFlipKey, btnFlipIn]));
      s51.appendChild(expBox);
      panel.appendChild(s51);

      // ================= 5.2 CTR 图形化流程 =================
      var s52 = el('div', { className: 'card' }, [
        el('h3', { text: '5.2 用计数器不断调用 AES（CTR 模式）' }),
        el('p', { html: '消息按 16 字节分块（中文按 UTF-8 字节切分）。每一块走同样的路：计数器值进 AES 搅拌出密钥流块，再与明文块 ⊕。不足 16 字节的最后一块用 <code>00</code> 字节填满展示。' })
      ]);
      var msg52 = el('input', { className: 'input', type: 'text', value: '今晚七点河边见记得来!!', id: 'l5-msg' });
      var ctrBox = el('div', { id: 'l5-ctr' });
      function pad16(block) {
        var out = block.slice();
        while (out.length < 16) out.push(0);
        return out;
      }
      function renderCTR() {
        ctrBox.innerHTML = '';
        var data = core.textToBytes(msg52.value);
        var blocks = Math.max(1, Math.ceil(data.length / 16));
        var stream = aes.ctrKeystream(key, 0, blocks);
        for (var i = 0; i < blocks; i += 1) {
          var pBlock = data.slice(i * 16, i * 16 + 16);
          var padded = pBlock.length < 16;
          var sBlock = stream.slice(i * 16, i * 16 + 16);
          var cBlock = core.xorBytes(pBlock, sBlock);
          var flow = el('div', {}, [
            aesStage('计数器块', '00..0'+i, '密钥流 K' + i, truncated(core.bytesToHex(sBlock), 5)),
            el('div', { className: 'ctr-flow__row mt-1' }, [
              valueBox('明文 P' + i, truncated(core.bytesToHex(padded ? pad16(pBlock) : pBlock), 5), '#20c997'), // core.bytesToHex(padded ? pad16(pBlock) : pBlock)
              el('span', { className: 'ctr-flow__op', text: '⊕' }),
              valueBox('密钥流 K' + i, truncated(core.bytesToHex(sBlock), 5), '#fd7e14'),
              el('span', { className: 'ctr-flow__op', text: '=' }),
              valueBox('密文 C' + i, truncated(core.bytesToHex(padded ? pad16(cBlock) : cBlock), 5), '#dc3545') // core.bytesToHex(padded ? pad16(cBlock) : cBlock)
            ])
          ]);
          var det = el('details', { className: 'ctr-block' }, [
            el('summary', { html: '块 ' + i + '　<span class="muted">点开查看十六进制字节细节</span>' }),
            flow,
            el('p', { className: 'mono', text: '明文 P' + i + ' = ' + core.bytesToHex(padded ? pad16(pBlock) : pBlock)}),
            el('p', { className: 'mono', text: '密钥流 K' + i + ' = ' + core.bytesToHex(sBlock) }),
            el('p', { className: 'mono', text: '密文 C' + i + ' = ' + core.bytesToHex(padded ? pad16(cBlock) : cBlock)}),
            el('p', { className: 'muted', text: '解密走同一条路：C ⊕ K = P。' })
          ]);
          ctrBox.appendChild(det);
        }
      }
      msg52.addEventListener('input', renderCTR);
      s52.appendChild(el('div', { className: 'field' }, [el('label', { text: '要发送的消息（支持中文，尽量凑满整块）' }), msg52]));
      s52.appendChild(ctrBox);
      panel.appendChild(s52);

      // ================= 5.3 反转：两条消息撞车 =================
      var s53 = el('div', { className: 'card' }, [
        el('h3', { text: '5.3 反转：两条消息撞上了同一条密钥流' }),
        el('p', { text: '发送者用同一把 AES 密钥发送两条消息，并且两次都让计数器从 0 开始。消息上下排列，注意每一行的密钥流框颜色相同——它们是同一条密钥流：' })
      ]);
      var msgA = 'MEET AT RIVER AT SEVEN';
      var msgB = 'BRING MAPS AND LANTERN';
      var bytesA = core.textToBytes(msgA);
      var bytesB = core.textToBytes(msgB);
      var cipherA = aes.ctrCrypt(key, 0, bytesA);
      var cipherB = aes.ctrCrypt(key, 0, bytesB);
      var streamAB = aes.ctrKeystream(key, 0, 2);

      // 明文 / 密文过长时只显示前几个字符，后面用省略号代替（完整十六进制字节见 5.2 的块细节）
      function truncated(s, n) {
        return s.length > n ? s.slice(0, n) + '…' : s;
      }
      function msgRow(title, pBytes, cBytes, hideStream) {
        var row = el('div', { className: 'card card--flat' }, [
          el('h3', { text: title }),
          aesStage('计数器块', '00..00', '密钥流 K', '?????…')
        ]);
        var xorRow = el('div', { className: 'ctr-flow__row mt-1' }, [
          valueBox('明文', hideStream ? '未知' : truncated(core.bytesToText(pBytes), 5), '#20c997'),
          el('span', { className: 'ctr-flow__op', text: '⊕' }),
          valueBox('密钥流 K', '?????…', '#fd7e14'),
          el('span', { className: 'ctr-flow__op', text: '=' }),
          valueBox('密文', truncated(core.bytesToHex(cBytes), 5), '#dc3545')
        ]);
        row.appendChild(xorRow);
        return row;
      }
      s53.appendChild(msgRow('消息 A（攻击者已知明文）', bytesA, cipherA, false));
      // 密钥流重用的传递箭头
      s53.appendChild(el('div', { className: 'reuse-arrow', html: '⬆ 两条消息的密钥流是同一条 ⬇<br/><span class="muted reuse-arrow__sub">（计数器都从 0 开始 + 同一把密钥）</span>' }));
      s53.appendChild(msgRow('消息 B（攻击者只看到密文）', bytesB, cipherB, true));

      var atkBtn = el('button', { className: 'btn btn--danger', text: '攻击者：K = 明文A ⊕ 密文A，恢复密钥流' });
      var atkBox = el('div', { id: 'l5-atk', className: 'mt-1' });
      atkBtn.addEventListener('click', function () {
        atkBox.innerHTML = '';
        var n = bytesB.length;
        var stream = core.xorBytes(bytesA.slice(0, n), cipherA.slice(0, n));
        atkBox.appendChild(el('p', { className: 'mono', text: '恢复出的密钥流 K = 明文A ⊕ 密文A = ' + core.bytesToHex(stream) }));
        var decBtn = el('button', { className: 'btn btn--danger', text: '把 K 盖到消息 B 上：明文B = 密文B ⊕ K' });
        atkBox.appendChild(decBtn);
        decBtn.addEventListener('click', function () {
          var pB = core.xorBytes(cipherB, stream);
          atkBox.appendChild(el('div', { className: 'attacker-move mt-1' }, [
            el('p', { html: '<strong>目标明文出现：</strong>' }),
            el('p', { className: 'mono attacker-move__result', text: core.bytesToText(pB) }),
            el('p', { text: '攻击者没有破解 AES，也没有得到 AES 密钥；失败来自同一段密钥流被重复使用。' })
          ]));
          nonceCard.classList.remove('hidden');
        });
      });
      s53.appendChild(atkBtn);
      s53.appendChild(atkBox);
      panel.appendChild(s53);

      // ================= nonce：可以公开的起始随机数 =================
      var nonceCard = el('div', { className: 'card hidden' }, [
        el('h3', { text: '可以公开的起始随机数（nonce）' }),
        el('p', { html: '问题本质上出在<strong>计数器重用</strong>。修复办法：计数器未必要从 0 开始——发送方为每条消息随机选一个起始值（叫 <strong>nonce</strong>，「只用一次的数」），<strong>公开</strong>地和密文一起发出。攻击者知道 nonce 也没关系，密钥流仍由秘密密钥决定；唯一的红线是<strong>同一把密钥下 nonce 绝不能重复</strong>。' })
      ]);
      // 按钮版：每次点击随机选一个起始计数器（nonce），观察密钥流完全不同
      var nonceBtn = el('button', { className: 'btn', text: '试试不同的起始计数器🎲' });
      var nonceOut = el('p', { className: 'mono demo-line', text: '点按钮，随机选一个起始计数器。' });
      nonceBtn.addEventListener('click', function () {
        var start = Math.floor(Math.random() * 100000000);
        var s = aes.ctrKeystream(key, start, 1);
        nonceOut.innerHTML = '起始计数器 = ' + start + '（可以公开）</br>→ 密钥流第 1 块 = ' + core.bytesToHex(s).slice(0, 16) + '…</br>不同起点 → 完全不同的密钥流';
      });
      nonceCard.appendChild(nonceBtn);
      nonceCard.appendChild(nonceOut);
      panel.appendChild(nonceCard);

      // ================= 过关谜题：改写密文 =================
      var oldPlain = 'SEVEN';
      var targetPlain = 'EIGHT';
      var fullMsg = 'MEET AT ' + oldPlain;
      var fullBytes = core.textToBytes(fullMsg);
      var fullCipher = aes.ctrCrypt(key, 0, fullBytes);
      var puzzleCard = el('div', { className: 'card' }, [
        el('h3', { text: '改写密文小实验' }),
        el('p', { html: '发送者发送消息 <code>' + fullMsg + '</code> 的 CTR 密文（计数器从 0 开始）：<br/><code>' + core.bytesToHex(fullCipher) + '</code><br/>攻击者想把见面时间从 <code>' + oldPlain + '</code> 改成 <code>' + targetPlain + '</code>。⊕ 是可逐位改写的：把密文改成 <code>C\' = C ⊕ P<sub>old</sub> ⊕ P<sub>target</sub></code>（只涉及 "' + oldPlain + '" 对应的 5 个字节），接收者解密后就会看到目标明文。' }),
        el('p', { html: '播放动画，分两步看攻击者的改写：第一步逐字节算出 新字节 = C<sub>old</sub> ⊕ P<sub>old</sub> ⊕ P<sub>target</sub>（信道上的密文保持不变，蓝框标出参与计算的密文字节与对应明文）；第二步接收者收到被改写的密文，逐字节解密出明文：' })

      ]);
      // 动画演示（参考第 2 关第三步）：不再要求用户输入，分两步把 SEVEN 改写成 EIGHT
      var tamperDelta = core.xorBytes(core.textToBytes(oldPlain), core.textToBytes(targetPlain));
      var tamperStart = fullMsg.indexOf(oldPlain);
      // 每个 token 一个格子；spaced 为 true 时格子之间补空格（十六进制字节用）
      function tamperRow(labelText, tokens, spaced) {
        var spans = [];
        var children = [el('span', { className: 'letter-row__label', text: labelText })];
        tokens.forEach(function (t) {
          var sp = el('span', { className: 'letter-ch', text: t });
          spans.push(sp);
          children.push(sp);
          if (spaced) children.push(document.createTextNode(' '));
        });
        return { node: el('div', { className: 'letter-row mono' }, children), spans: spans };
      }
      // 每个位置的新字节 = C_old ⊕ P_old ⊕ P_target（预先算好，动画第一步展示由来、第二步替换）
      function hex8(b) { return (b & 0xff).toString(16).padStart(2, '0'); }
      var newBytes = [];
      for (var bi = 0; bi < targetPlain.length; bi += 1) {
        newBytes.push((fullCipher[tamperStart + bi] ^ tamperDelta[bi]) & 0xff);
      }
      var tamperBtn = el('button', { className: 'btn btn--danger', text: '▶ 分步演示：把 ' + oldPlain + ' 改写成 ' + targetPlain });
      var tamperBox = el('div', { id: 'l5-tamper' });
      var tamperTimer = null;
      tamperBtn.addEventListener('click', function () {
        tamperBox.innerHTML = '';
        if (tamperTimer) { clearInterval(tamperTimer); tamperTimer = null; }
        var pOldBytes = core.textToBytes(oldPlain);
        var pTargetBytes = core.textToBytes(targetPlain);
        var hexTokens = [];
        for (var i = 0; i < fullCipher.length; i += 1) {
          hexTokens.push(hex8(fullCipher[i]));
        }
        var cipherRow = tamperRow('密文', hexTokens, true);
        // 对照行：只在参与改写的 5 个位置给出原始明文与其十六进制字节，与密文字节逐格对齐
        // （十六进制每格 2 字符 + 1 空格，明文字符补一个不换行空格对齐；无关位置用 ·· 占位）
        function alignTokens(fn) {
          var tokens = [];
          for (var i = 0; i < fullCipher.length; i += 1) {
            tokens.push(i >= tamperStart && i < tamperStart + targetPlain.length ? fn(i - tamperStart) : '··');
          }
          return tokens;
        }
        var plainAlignRow = tamperRow('明文', alignTokens(function (j) { return fullMsg.charAt(tamperStart + j) + ' '; }), true);
        var hexAlignRow = tamperRow('明文', alignTokens(function (j) { return hex8(pOldBytes[j]); }), true);
        // 第一步的计算区：逐字节展示算式，结果逐个填进「新字节」行
        var calcLine = el('p', { className: 'mono mb-1' });
        var newRow = tamperRow('新字节', ['··', '··', '··', '··', '··'], true);
        // 接收者一侧：收到的密文十六进制与解密出的明文（初始还是原密文，第二步替换时才变）
        var recvCipherRow = tamperRow('密文', hexTokens.slice(), true);
        var recvPlainRow = tamperRow('明文', fullMsg.split(''), false);
        var note = el('p', { className: 'muted' });
        cipherRow.node.classList.add('letter-row--align');
        plainAlignRow.node.classList.add('letter-row--align');
        hexAlignRow.node.classList.add('letter-row--align');
        recvCipherRow.node.classList.add('letter-row--align');
        recvPlainRow.node.classList.add('letter-row--align');
        tamperBox.appendChild(el('div', { className: 'channel mt-1' }, [
          el('div', { className: 'channel__title', html: '📡 信道上的密文 C<sub>old</sub>（蓝框 = 正在参与计算的密文字节与对应明文；密文在此阶段保持不变，下方两行给出原始明文对照位置）' }),
          cipherRow.node,
          plainAlignRow.node,
          hexAlignRow.node
        ]));
        tamperBox.appendChild(el('div', { className: 'card card--flat mt-1' }, [
          el('p', { className: 'muted mb-1', html: '第一步：逐字节计算 新字节 = C<sub>old</sub> ⊕ P<sub>old</sub> ⊕ P<sub>target</sub>，结果逐个填进「新字节」行（信道上的密文此时不变）' }),
          calcLine,
          newRow.node
        ]));
        tamperBox.appendChild(el('div', { className: 'channel' }, [
          el('div', { className: 'channel__title', text: '📥 接收者（第二步：收到被改写的密文，逐字节解密）' }),
          recvCipherRow.node,
          recvPlainRow.node
        ]));
        tamperBox.appendChild(note);

        var rewritten = fullCipher.slice();
        var k = 0; // 0..4：第一步逐字节计算（信道密文保持不变，只标出参与计算的密文与明文）；5..9：第二步接收者逐字节解密；10：结束
        function step() {
          if (k < targetPlain.length) {
            // 第一步：蓝框同时标出参与计算的密文字节与对应明文，展示新字节的由来；信道上的密文不改变
            if (k > 0) {
              cipherRow.spans[tamperStart + k - 1].classList.remove('is-scan');
              plainAlignRow.spans[tamperStart + k - 1].classList.remove('is-scan');
              hexAlignRow.spans[tamperStart + k - 1].classList.remove('is-scan');
            }
            cipherRow.spans[tamperStart + k].classList.add('is-scan');
            plainAlignRow.spans[tamperStart + k].classList.add('is-scan');
            hexAlignRow.spans[tamperStart + k].classList.add('is-scan');
            calcLine.innerHTML = '位置 ' + (tamperStart + k) + '：' +
              hex8(fullCipher[tamperStart + k]) + ' ⊕ ' +
              hex8(pOldBytes[k]) + '（' + oldPlain.charAt(k) + '） ⊕ ' +
              hex8(pTargetBytes[k]) + '（' + targetPlain.charAt(k) + '） = <strong>' + hex8(newBytes[k]) + '</strong>';
            newRow.spans[k].textContent = hex8(newBytes[k]);
            newRow.spans[k].classList.add('is-hit');
            rewritten[tamperStart + k] = newBytes[k]; // 仅记录，供结尾展示与第二步接收者使用
            k += 1;
            return true;
          }
          var j = k - targetPlain.length; // 第二步的第几个字节
          if (j === 0) {
            cipherRow.spans[tamperStart + targetPlain.length - 1].classList.remove('is-scan');
            plainAlignRow.spans[tamperStart + targetPlain.length - 1].classList.remove('is-scan');
            hexAlignRow.spans[tamperStart + targetPlain.length - 1].classList.remove('is-scan');
          }
          if (j > 0) {
            recvCipherRow.spans[tamperStart + j - 1].classList.remove('is-flash');
            recvPlainRow.spans[tamperStart + j - 1].classList.remove('is-flash');
          }
          if (j >= targetPlain.length) {
            note.innerHTML = '第二步完成：攻击者只改写了 ' + targetPlain.length + ' 个密文字节，接收者解密出的约会时间就从七点变成了八点。改写后的完整密文：<code>' + core.bytesToHex(rewritten) + '</code>';
            return false;
          }
          // 第二步：接收者逐字节收到被改写的密文，解密出的明文字符立即跟着变
          recvCipherRow.spans[tamperStart + j].textContent = hex8(newBytes[j]);
          recvCipherRow.spans[tamperStart + j].classList.add('is-changed');
          recvCipherRow.spans[tamperStart + j].classList.add('is-flash');
          recvPlainRow.spans[tamperStart + j].textContent = targetPlain.charAt(j);
          recvPlainRow.spans[tamperStart + j].classList.add('is-changed');
          recvPlainRow.spans[tamperStart + j].classList.add('is-flash');
          k += 1;
          return true;
        }

        if (typeof setInterval === 'function') {
          tamperTimer = setInterval(function () {
            if (tamperBox.isConnected === false) { clearInterval(tamperTimer); tamperTimer = null; return; } // 关卡已切换，停止播放
            if (!step()) { clearInterval(tamperTimer); tamperTimer = null; }
          }, 450);
        } else {
          // 无定时器的环境（如测试）：直接播完
          while (step()) { /* 同步跑完 */ }
        }
      });
      puzzleCard.appendChild(tamperBtn);
      puzzleCard.appendChild(tamperBox);
      panel.appendChild(puzzleCard);

      // ================= 过关工具：字母 → 十六进制字节转换器 与 三输入 ⊕ 计算器 =================
      var toolsCard = el('div', { className: 'card' }, [
        el('h3', { text: '过关工具' }),
        el('p', { html: '参考上面的演示：先把 P<sub>old</sub> 和 P<sub>target</sub> 转成十六进制字节，再用计算器逐字节算出 新字节 = C<sub>old</sub> ⊕ P<sub>old</sub> ⊕ P<sub>target</sub>，最后替换原密文对应的 5 个字节。' })
      ]);
      // 字母 → 十六进制字节转换器（输出右侧带复制到剪贴板按钮）
      var letterIn = el('input', { className: 'input mono', type: 'text', placeholder: '输入字母，如 THREE' });
      var letterOut = el('p', { className: 'mono demo-line', style: 'flex:1;margin:0;', text: '十六进制字节会显示在这里' });
      var copyBtn = el('button', { className: 'btn', text: '复制' });
      letterIn.addEventListener('input', function () {
        letterOut.textContent = letterIn.value ? core.bytesToHex(core.textToBytes(letterIn.value)) : '十六进制字节会显示在这里';
        copyBtn.textContent = '复制';
      });
      copyBtn.addEventListener('click', function () {
        if (!letterIn.value) return;
        function done() {
          copyBtn.textContent = '已复制 ✓';
          if (typeof setTimeout === 'function') {
            setTimeout(function () { copyBtn.textContent = '复制'; }, 1200);
          }
        }
        try {
          if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(letterOut.textContent).then(done, function () { /* 剪贴板被拒绝时静默 */ });
          } else if (typeof document.execCommand === 'function') {
            // 兜底：临时 textarea + execCommand（旧浏览器 / 非安全上下文）
            var ta = el('textarea', { text: letterOut.textContent });
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            done();
          }
        } catch (e) { /* 剪贴板不可用时静默 */ }
      });
      toolsCard.appendChild(el('div', { className: 'field' }, [el('label', { text: '字母 → 十六进制字节 转换器' }), letterIn]));
      toolsCard.appendChild(el('div', { className: 'flex gap-1 items-center mt-1' }, [letterOut, copyBtn]));
      // 三输入一输出：C_old ⊕ P_old ⊕ P_target
      var xor1 = el('input', { className: 'input mono', type: 'text', placeholder: '原密文字节十六进制' });
      var xor2 = el('input', { className: 'input mono', type: 'text', placeholder: '原明文十六进制' });
      var xor3 = el('input', { className: 'input mono', type: 'text', placeholder: '目标明文十六进制' });
      var xorBtn = el('button', { className: 'btn', text: '⊕ 计算' });
      var xorOut = el('p', { className: 'mono demo-line', html: 'C<sub>old</sub> ⊕ P<sub>old</sub> ⊕ P<sub>target</sub> 的结果会显示在这里' });
      xorBtn.addEventListener('click', function () {
        try {
          var a = core.hexToBytes(xor1.value);
          var b = core.hexToBytes(xor2.value);
          var c = core.hexToBytes(xor3.value);
          if (a.length !== b.length || a.length !== c.length) { xorOut.textContent = '三段长度不一致。'; return; }
          xorOut.textContent = core.bytesToHex(core.xorBytes(core.xorBytes(a, b), c));
        } catch (e) { xorOut.textContent = '十六进制格式错误：' + e.message; }
      });
      toolsCard.appendChild(el('div', { className: 'field' }, [
        el('label', { text: '十六进制字节 ⊕ 计算器（三段一起 ⊕）' }),
        el('div', { className: 'flex gap-1 wrap' }, [xor1, xor2, xor3, xorBtn])
      ]));
      toolsCard.appendChild(xorOut);
      panel.appendChild(app.buildTakeaway(
        'AES 本身依然坚固：泄密的根源不是 ⊕，也不是 AES 被破解，而是同一条密钥流被用了两次——已知其中一条明文，另一条也就保不住了。',
        '这一关是攻击者动手。如果换成你：给你两条撞上同一条密钥流的消息，你能亲手恢复密钥流、读出藏起来的 flag 吗？'
      ));
      app.buildPuzzle(panel, {
        question: '发送者发送的还是上面那条消息 <code>' + fullMsg + '</code> 的密文。参考上面的演示过程，用工具算出改写后的密文，让接收者解密出的时间从 <code>' + oldPlain + '</code> 变成 <code>THREE</code>（三点）。输入改写后的完整密文（十六进制字节，长度与原密文一致）：',
        placeholder: '改写后的密文十六进制字节',
        normalize: function (s) { return String(s).replace(/\s+/g, '').toLowerCase(); },
        check: function (s) {
          try {
            var bytes = core.hexToBytes(s);
            if (bytes.length !== fullCipher.length) return false;
            var dec = aes.ctrCrypt(key, 0, bytes);
            return core.bytesToText(dec) === 'MEET AT THREE';
          } catch (e) { return false; }
        },
        solvedText: '改写成功！接收者解密得到「MEET AT THREE」。CTR 能保密，却不能发现密文被改——防篡改方法不在本课程展开。',
        wrongText: function (s) {
          // 解出的时间词只是大小写不对（如 three / Three）时，单独提示大小写问题
          try {
            var bytes = core.hexToBytes(s);
            if (bytes.length === fullCipher.length) {
              var dec = core.bytesToText(aes.ctrCrypt(key, 0, bytes));
              var word = dec.indexOf('MEET AT ') === 0 ? dec.slice('MEET AT '.length) : '';
              if (word !== 'THREE' && word.toUpperCase() === 'THREE') {
                return '解密得到「' + dec + '」——已经很接近了！注意大小写不同：目标明文是全大写的 THREE。';
              }
            }
          } catch (e) { /* 落到默认提示 */ }
          return '解密结果不是「MEET AT THREE」。检查：只有 5 个字节需要改，其余保持原样。';
        }
      });
      // 工具卡放在过关谜题下方，作答时随用随取
      panel.appendChild(toolsCard);

      renderCTR();
    }
  };
})();
