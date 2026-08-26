(function () {
  'use strict';

  // 第 7 关：终极挑战 —— 发现撞车的计数器，亲手恢复 flag
  var CryptoLab = window.CryptoLab = window.CryptoLab || {};
  CryptoLab.levels = CryptoLab.levels || {};

  // 三块已知明文（各 16 字节），CTR 计数器从 1 递增；flag 的计数器被错误设为 2
  var P1 = 'MEET AT SEVEN!!!';
  var P2 = 'BRING MAPS ASAP!';
  var P3 = 'SEE YOU TONIGHT!';
  var FLAG = 'FLAG{CTR_PLUS_1}'; // 16 字节
  var CHALLENGE_KEY_HEX = '63727970746f6c616276326b65792121'; // 16 字节（不对学生公开）

  CryptoLab.levels.level07 = {
    init: function (panel) {
      var app = CryptoLab.app;
      var el = app.el;
      var core = CryptoLab.core;
      var aes = CryptoLab.aes;

      var key = core.hexToBytes(CHALLENGE_KEY_HEX);
      var keyStream = aes.ctrKeystream(key, 1, 3); // 计数器 1、2、3
      var S1 = keyStream.slice(0, 16);
      var S2 = keyStream.slice(16, 32);
      var S3 = keyStream.slice(32, 48);
      var C1 = core.xorBytes(core.textToBytes(P1), S1);
      var C2 = core.xorBytes(core.textToBytes(P2), S2);
      var C3 = core.xorBytes(core.textToBytes(P3), S3);
      var Cflag = core.xorBytes(core.textToBytes(FLAG), S2); // 计数器错误地设为 2

      panel.appendChild(app.buildInfoBands(
        ['三条消息的明文与密文', 'flag 的密文', 'CTR 模式与各消息的计数器'],
        ['AES 密钥', 'flag 明文', '密钥流']
      ));

      panel.appendChild(el('div', { className: 'card' }, [
        el('h3', { text: '挑战' }),
        el('p', { html: '发送者吸取了教训，这次计数器从 1 开始递增——但加密 flag 时手滑了：计数器本应是 4，却错把加密消息的条数当作了加密次数，计数器停在了 2。攻击者截获了一条含有三块消息的明文和密文，以及 flag 的密文。这次没有一键攻击按钮——⊕ 计算器交给你，你要找出哪两段密钥流撞了车。' })
      ]));

      // --- 图形化加密过程（照搬第 5 关的约定：明文 → AES → 密文，密钥从上方输入） ---
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
      panel.appendChild(el('div', { className: 'card' }, [
        el('h3', { text: '加密过程（图形化回顾）' }),
        aesStage('计数器块', '已知', '密钥流 K', '未知'),
        el('div', { className: 'ctr-flow__row mt-1' }, [
          valueBox('明文块', '…', '#20c997'),
          el('span', { className: 'ctr-flow__op', text: '⊕' }),
          valueBox('密钥流 K', '未知', '#fd7e14'),
          el('span', { className: 'ctr-flow__op', text: '=' }),
          valueBox('密文块', '…', '#dc3545')
        ]),
        el('p', { className: 'muted', text: '计数器相同 ⇒ 密钥流相同。' }),
        el('p', { className: 'muted', text: '找出哪两块用了同一个计数器，就找到了突破口。' })
      ]));

      // --- 截获的数据（十六进制字节直接展示，一键复制后粘贴进计算器） ---
      var dataCard = el('div', { className: 'card' }, [
        el('h3', { text: '攻击者截获的数据' })
      ]);
      // 复制到剪贴板（与第 5 关同一写法：clipboard API + execCommand 兜底）
      function copyButton(label, getText) {
        var btn = el('button', { className: 'btn', text: label });
        btn.addEventListener('click', function () {
          var text = getText();
          if (!text) return; // 还没有内容时不复制
          function done() {
            btn.textContent = '已复制 ✓';
            if (typeof setTimeout === 'function') {
              setTimeout(function () { btn.textContent = label; }, 1200);
            }
          }
          try {
            if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(text).then(done, function () { /* 剪贴板被拒绝时静默 */ });
            } else if (typeof document.execCommand === 'function') {
              // 兜底：临时 textarea + execCommand（旧浏览器 / 非安全上下文）
              var ta = el('textarea', { text: text });
              document.body.appendChild(ta);
              ta.select();
              document.execCommand('copy');
              document.body.removeChild(ta);
              done();
            }
          } catch (e) { /* 剪贴板不可用时静默 */ }
        });
        return btn;
      }
      function dataRow(title, plainText, cBytes, counter) {
        var row = el('div', { className: 'card card--flat' }, [
          el('strong', { text: title + '（计数器 ' + counter + '）' })
        ]);
        if (plainText != null) {
          row.appendChild(el('p', { className: 'mono mb-1', text: '明文 ' + plainText }));
          row.appendChild(el('p', { className: 'mono mb-1', text: '明文（十六进制）' + core.bytesToHex(core.textToBytes(plainText)) }));
        }
        row.appendChild(el('p', { className: 'mono mb-1', text: '密文（十六进制）' + core.bytesToHex(cBytes) }));
        row.appendChild(copyButton('复制密文（十六进制）', function () { return core.bytesToHex(cBytes); }));
        if (plainText != null) {
          row.appendChild(copyButton('复制明文（十六进制）', function () { return core.bytesToHex(core.textToBytes(plainText)); }));
        }
        return row;
      }
      dataCard.appendChild(dataRow('消息 1', P1, C1, 1));
      dataCard.appendChild(dataRow('消息 2', P2, C2, 2));
      dataCard.appendChild(dataRow('消息 3', P3, C3, 3));
      dataCard.appendChild(dataRow('flag 消息', null, Cflag, 2));
      panel.appendChild(dataCard);

      // --- ⊕ 计算器 ---
      var calcCard = el('div', { className: 'card' }, [
        el('h3', { text: '⊕ 异或计算器' }),
        el('p', { className: 'muted', text: '复制或粘贴两段等长的十六进制字节串，逐字节做 ⊕。' })
      ]);
      var in1 = el('input', { className: 'input mono', type: 'text', placeholder: '第一段十六进制字节' });
      var in2 = el('input', { className: 'input mono', type: 'text', placeholder: '第二段十六进制字节' });
      var calcOut = el('p', { className: 'mono demo-line', style: 'flex:1;margin:0;', text: '结果会显示在这里' });
      var lastHex = ''; // 最近一次计算结果的十六进制字节，供「复制」按钮使用
      // 「作为文本」单独一行：同样带复制按钮，默认禁用，只有结果是可打印文本才可点击
      var textOut = el('p', { className: 'mono demo-line', style: 'flex:1;margin:0;', text: '作为文本：—' });
      var lastText = ''; // 最近一次结果的可打印文本（不可打印时为空），供文本「复制」按钮使用
      var textCopyBtn = copyButton('复制', function () { return lastText; });
      textCopyBtn.disabled = true;
      var calcBtn = el('button', { className: 'btn btn--primary', text: '⊕ 计算' });
      var progress = el('p', { className: 'muted' });
      var gotStream = false;
      var gotFlag = false;
      function printable(s) {
        for (var i = 0; i < s.length; i += 1) {
          var c = s.charCodeAt(i);
          if (c < 32 || c > 126) return '（不是可打印文本）';
        }
        return s;
      }
      calcBtn.addEventListener('click', function () {
        try {
          var a = core.hexToBytes(in1.value);
          var b = core.hexToBytes(in2.value);
          if (a.length !== b.length) {
            calcOut.textContent = '两段长度不一致：' + a.length + ' 字节 vs ' + b.length + ' 字节';
            lastHex = '';
            textOut.textContent = '作为文本：—';
            lastText = '';
            textCopyBtn.disabled = true;
            return;
          }
          var r = core.xorBytes(a, b);
          var rHex = core.bytesToHex(r);
          lastHex = rHex;
          calcOut.textContent = rHex;
          var asText = printable(core.bytesToText(r));
          textOut.textContent = '作为文本：' + asText;
          if (asText === '（不是可打印文本）') {
            lastText = '';
            textCopyBtn.disabled = true;
          } else {
            lastText = asText;
            textCopyBtn.disabled = false;
          }
          if (!gotStream && rHex === core.bytesToHex(S2)) {
            gotStream = true;
            progress.textContent = '✅ 第 1 步完成：这是计数器 2 的密钥流 S₂！第 2 步：把 flag 密文 ⊕ S₂。';
          } else if (gotStream && !gotFlag && core.bytesToText(r) === FLAG) {
            gotFlag = true;
            progress.textContent = '✅ 第 2 步完成：flag 明文出现了！填到上面的提交框通关。';
          } else if (!gotStream) {
            progress.textContent = '这组结果暂时看不出意义。提示：flag 的计数器是 2，哪条已知消息也用计数器 2？先算 明文₂ ⊕ 密文₂。';
          } else {
            progress.textContent = '还没对上。提示：flag 字节 = flag 密文 ⊕ 上一步得到的 S₂。';
          }
        } catch (e) {
          calcOut.textContent = '十六进制格式错误：' + e.message;
          lastHex = '';
          textOut.textContent = '作为文本：—';
          lastText = '';
          textCopyBtn.disabled = true;
        }
      });
      calcCard.appendChild(el('div', { className: 'flex gap-1' }, [in1, in2, calcBtn]));
      // 输出与第 5 关的「字母 → 十六进制字节转换器」同款式：结果 + 复制按钮一行
      calcCard.appendChild(el('div', { className: 'flex gap-1 items-center mt-1' }, [
        calcOut,
        copyButton('复制', function () { return lastHex; })
      ]));
      calcCard.appendChild(el('div', { className: 'flex gap-1 items-center mt-1' }, [
        textOut,
        textCopyBtn
      ]));
      calcCard.appendChild(progress);

      // --- 提交 flag（默认展开，不再隐藏；异或计算器放在其下方） ---
      var flagCard = el('div', { className: 'card' }, [
        el('h3', { text: '最后一步：提交 flag' }),
        el('p', { text: '用下方的 ⊕ 计算器恢复 flag 明文（计算结果后面的「作为文本」就是），原样填入：' })
      ]);
      var flagInput = el('input', { className: 'input mono', type: 'text', placeholder: 'FLAG{...}' });
      var flagBtn = el('button', { className: 'btn btn--primary', text: '提交' });
      var flagOut = el('p', { className: 'mt-1' });
      flagBtn.addEventListener('click', function () {
        if (flagInput.value.trim() === FLAG) {
          flagOut.innerHTML = '';
          flagOut.appendChild(el('span', { className: 'win-banner', text: '🎉 通关！你发现 flag 与消息 2 撞了同一条密钥流，用 K₂ = 明文₂ ⊕ 密文₂ 就解开了它——攻击者全程没有碰到 AES 密钥。' }));
          app.finishLevel('level07', panel);
        } else {
          flagOut.textContent = '还不对，检查大小写和每个字符。';
        }
      });
      flagCard.appendChild(el('div', { className: 'field' }, [flagInput]));
      flagCard.appendChild(flagBtn);
      flagCard.appendChild(flagOut);
      panel.appendChild(flagCard);
      panel.appendChild(calcCard);

      panel.appendChild(app.buildTakeaway(
        '密钥流重用面前，再强的 AES 也帮不上忙：K = 明文 ⊕ 密文，剩下的只是一次 ⊕。把 AES 密钥安全交给对方，靠的是另一类工具（支线 C 的公钥密码）。',''
      ));

      // 已通关后再次进入本关：直接补跳转到支线 C 的按钮（与支线 B 的写法一致）
      if (app.state && app.state.solved && app.state.solved.level07) {
        app.finishLevel('level07', panel);
      }
    }
  };
})();
