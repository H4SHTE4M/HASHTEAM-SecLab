(function () {
  'use strict';

  // 第 0 关：一条被截获的消息 —— Kerckhoffs 原则
  var CryptoLab = window.CryptoLab = window.CryptoLab || {};
  CryptoLab.levels = CryptoLab.levels || {};

  var DEFAULT_MSG = 'MEET BY THE RIVER AT SEVEN';
  var PUZZLE_PLAIN = 'HELLOCRYPTO';

  function reverseText(s) { return s.split('').reverse().join(''); }

  // 隔位读取：先取第 1、3、5… 个字符，再取第 2、4、6… 个字符
  function alternateText(s) {
    var even = '', odd = '';
    for (var i = 0; i < s.length; i += 1) {
      if (i % 2 === 0) even += s.charAt(i); else odd += s.charAt(i);
    }
    return even + odd;
  }

  function alternateUndo(s) {
    var half = Math.ceil(s.length / 2);
    var evenPart = s.slice(0, half), oddPart = s.slice(half);
    var out = '';
    for (var i = 0; i < s.length; i += 1) {
      out += i % 2 === 0 ? evenPart.charAt(i / 2) : oddPart.charAt((i - 1) / 2);
    }
    return out;
  }

  CryptoLab.levels.level00 = {
    init: function (panel) {
      var app = CryptoLab.app;
      var el = app.el;
      var core = CryptoLab.core;

      panel.appendChild(app.buildInfoBands(
        ['公共信道（如互联网）上的一切内容'],
        ['（本关还没有任何秘密密钥）']
      ));

      // --- 第一步：明文过公共信道 ---
      var step1 = el('div', { className: 'card' }, [
        el('h3', { text: '第一步：把消息发出去' }),
        el('p', { text: '发送者要把「MEET BY THE RIVER AT SEVEN」（今晚七点河边见）发给接收者，但消息必须经过攻击者能够监听的公共信道。' })
      ]);
      var input = el('input', { className: 'input', type: 'text', value: DEFAULT_MSG, id: 'l0-msg' });
      var sendBtn = el('button', { className: 'btn btn--primary', text: '发送到公共信道' });
      var channel1 = el('div', { className: 'channel hidden', id: 'l0-channel1' });
      step1.appendChild(el('div', { className: 'field' }, [el('label', { text: '消息内容' }), input]));
      step1.appendChild(sendBtn);
      step1.appendChild(channel1);
      panel.appendChild(step1);

      sendBtn.addEventListener('click', function () {
        channel1.classList.remove('hidden');
        channel1.innerHTML = '';
        channel1.appendChild(el('div', { className: 'channel__title', text: '📡 公共信道（攻击者正在监听）' }));
        channel1.appendChild(el('div', { className: 'mono channel__payload', text: input.value }));
        channel1.appendChild(el('p', { className: 'channel__note', text: '攻击者直接读到了正文。试试给它加一层「方法」。' }));
      });

      // --- 第二步：选一种方法，看攻击者如何反推 ---
      var step2 = el('div', { className: 'card' }, [
        el('h3', { text: '第二步：选一种「方法」保护消息' })
      ]);
      var methods = [
        {
          name: '倒序',
          desc: '把整段消息倒过来写，例如「MEET」变成「TEEM」。',
          fn: reverseText,
          undo: reverseText,
          kind: 'transpose',
          // 明文第 i 位的字符来自密文第 len-1-i 位
          srcIndex: function (i, len) { return len - 1 - i; }
        },
        {
          name: '隔位读取',
          desc: '先写第 1、3、5… 个字符，再接着写第 2、4、6… 个字符，例如「MEET」变成「METE」。',
          fn: alternateText,
          undo: alternateUndo,
          kind: 'transpose',
          // 明文第 i 位：偶位来自密文前半段，奇位来自后半段
          srcIndex: function (i, len) {
            var half = Math.ceil(len / 2);
            return i % 2 === 0 ? i / 2 : half + (i - 1) / 2;
          }
        },
        {
          name: '固定后移 3 格',
          desc: '每个字母在字母表中固定向后挪 3 格：A → D，B → E，C → F，…… 挪过 Z 就绕回 A。它对每个字母都移同样多的格数，没有可以选择的秘密。',
          fn: function (s) { return core.caesarEncrypt(s, 3); },
          undo: function (s) { return core.caesarDecrypt(s, 3); },
          kind: 'shift',
          shift: 3
        }
      ];
      var btnRow = el('div', { className: 'flex gap-1 wrap' });
      var resultBox = el('div', { id: 'l0-result' });
      methods.forEach(function (m) {
        var btn = el('button', { className: 'btn', text: m.name });
        btn.addEventListener('click', function () {
          resultBox.innerHTML = '';
          var msg = input.value;
          var cipher = m.fn(msg);
          resultBox.appendChild(el('p', { html: '<strong>方法：</strong>' + m.name + ' —— ' + m.desc }));
          resultBox.appendChild(el('div', { className: 'channel' }, [
            el('div', { className: 'channel__title', text: '📡 公共信道上的密文' }),
            el('div', { className: 'mono channel__payload', text: cipher })
          ]));
          resultBox.appendChild(buildReverseAnim(cipher, m));
          takeaway.classList.remove('hidden'); // 反推之后才亮出结论
        });
        btnRow.appendChild(btn);
      });
      step2.appendChild(btnRow);
      step2.appendChild(resultBox);
      panel.appendChild(step2);

      // 攻击者的反推：自动播放动画——密文逐步变回明文，播完停留几秒再循环。
      // 换位类（倒序/隔位）：字母从错误位置回到正确位置；
      // 移位类（后移 3 格）：字母沿字母表逐格回退。
      function buildReverseAnim(cipher, m) {
        var recovered = m.undo(cipher);
        var box = el('div', { className: 'attacker-move' }, [
          el('strong', { text: '攻击者的反推（自动播放）' }),
          el('p', { text: '方法一旦泄漏或被猜出，攻击者照着它反着做，密文就一步步变回明文：' })
        ]);
        var display = el('div', { className: 'mono channel__payload' });
        var note = el('p', { className: 'muted' });
        box.appendChild(display);
        box.appendChild(note);
        box.appendChild(el('p', { className: 'muted', text: '一旦方法泄漏，整个方法都要重新设计，而且过去被记录的密文都可以被解密。' }));

        var len = cipher.length;
        var TICK = 450; // 每步间隔（毫秒）
        var HOLD = 7;   // 播完停留约 3 秒再循环

        // 换位类：明文第 i 位的字符来自密文第 srcIndex[i] 位
        var srcIndex = null;
        if (m.kind === 'transpose') {
          srcIndex = [];
          for (var i = 0; i < len; i += 1) srcIndex.push(m.srcIndex(i, len));
        }

        var step = 0;      // 已归位的字符数
        var sub = 0;       // 移位类：当前字符已回退的格数
        var holdTicks = 0;
        var remaining = []; // 换位类：尚未归位的密文下标
        for (var j = 0; j < len; j += 1) remaining.push(j);

        // 换位时空格不可见，直接归位不占步数
        function skipSpaces() {
          if (!srcIndex) return;
          while (step < len && recovered.charAt(step) === ' ') {
            var idx = remaining.indexOf(srcIndex[step]);
            if (idx >= 0) remaining.splice(idx, 1);
            step += 1;
          }
        }

        function render() {
          display.innerHTML = '';
          display.appendChild(document.createTextNode(recovered.slice(0, step)));
          if (step >= len) { note.textContent = '全部还原。'; return; }
          if (srcIndex) {
            // 换位：当前字符从密文中的错误位置「回到」正确位置，未归位的字符仍在后面
            var from = srcIndex[step];
            display.appendChild(el('span', { className: 'diff-letter', text: recovered.charAt(step) }));
            var rest = '';
            remaining.forEach(function (ci) { if (ci !== from) rest += cipher.charAt(ci); });
            display.appendChild(el('span', { className: 'muted', text: rest }));
            note.textContent = '「' + recovered.charAt(step) + '」从密文第 ' + (from + 1) +
              ' 位回到第 ' + (step + 1) + ' 位';
          } else {
            // 移位：当前字符沿字母表逐格回退
            var ch = cipher.charAt(step);
            var isLetter = /[A-Za-z]/.test(ch);
            var shown = isLetter ? core.caesarDecrypt(ch, sub) : ch;
            display.appendChild(el('span', { className: 'diff-letter', text: shown }));
            display.appendChild(el('span', { className: 'muted', text: cipher.slice(step + 1) }));
            note.textContent = isLetter
              ? '「' + ch + '」沿字母表往前回退 ' + m.shift + ' 格 → 「' + recovered.charAt(step) + '」'
              : '';
          }
        }

        function tick() {
          if (display.isConnected === false) { clearInterval(timer); return; } // 关卡已切换，停止播放
          if (step >= len) {
            holdTicks += 1;
            if (holdTicks >= HOLD) {
              step = 0; sub = 0; holdTicks = 0;
              remaining = [];
              for (var j = 0; j < len; j += 1) remaining.push(j);
              skipSpaces();
              render();
            }
            return;
          }
          if (srcIndex) {
            var idx = remaining.indexOf(srcIndex[step]);
            if (idx >= 0) remaining.splice(idx, 1);
            step += 1;
            skipSpaces();
          } else if (/[A-Za-z]/.test(cipher.charAt(step)) && sub < m.shift) {
            sub += 1;
          } else {
            step += 1;
            sub = 0;
          }
          render();
        }

        skipSpaces();
        render();
        if (typeof setInterval === 'function') {
          var timer = setInterval(tick, TICK);
        } else {
          // 无定时器的环境（如测试）：直接显示还原结果
          step = len;
          render();
        }
        return box;
      }

      // --- 结论先隐藏：等攻击者的反推演示出现后再亮出 ---
      var takeaway = app.buildTakeaway(
        '好的密码不怕攻击者知道方法；没有密钥时，他仍不该读出正文。',
        '如果方法公开，但把「向后移动几格」变成一把秘密钥匙呢？'
      );
      takeaway.classList.add('hidden');
      panel.appendChild(takeaway);

      // --- 过关谜题：随机选用三种方法中的一种加密明文 ---
      var puzzleMethod = methods[Math.floor(Math.random() * methods.length)];
      var puzzleCipher = puzzleMethod.fn(PUZZLE_PLAIN);

      var puzzleCard = app.buildPuzzle(panel, {
        question: '攻击者截获了一条密文：<code>' + puzzleCipher + '</code>。它用了本关三种方法中的一种保护。请还原并输入明文。<br><i style="color: gray;">忽略大小写</i>',
        placeholder: '输入明文',
        normalize: function (s) { return core.lettersOnly(s); },
        check: function (s) { return s === PUZZLE_PLAIN.replace(/ /g, ''); },
        solvedText: '还原成功！（它用的是「' + puzzleMethod.name + '」。）'
      });

      // 字母表：输入框下方的按钮，点击展开 / 收起 A-Z
      if (puzzleCard.querySelector('.puzzle__input')) {
        var alphabetStrip = el('div', { className: 'strip strip--center hidden' });
        for (var i = 0; i < 26; i += 1) {
          alphabetStrip.appendChild(el('span', { className: 'strip__cell', text: String.fromCharCode(65 + i) }));
        }
        var alphabetBtn = el('button', { className: 'btn mt-1', text: '🅰️ 字母表' });
        alphabetBtn.addEventListener('click', function () {
          var show = alphabetStrip.classList.contains('hidden');
          alphabetStrip.classList.toggle('hidden', !show);
          alphabetBtn.textContent = show ? '🅰️ 收起字母表' : '🅰️ 字母表';
        });
        puzzleCard.appendChild(el('div', {}, [alphabetBtn]));
        puzzleCard.appendChild(alphabetStrip);
      }
    }
  };
})();
