(function () {
  'use strict';

  // 第 1 关：Caesar，字母也可以做加法
  var CryptoLab = window.CryptoLab = window.CryptoLab || {};
  CryptoLab.levels = CryptoLab.levels || {};

  CryptoLab.levels.level01 = {
    init: function (panel) {
      var app = CryptoLab.app;
      var el = app.el;
      var core = CryptoLab.core;

      panel.appendChild(app.buildInfoBands(
        ['Caesar 密码的方法', '字母编号 A=0…Z=25', '密文'],
        ['秘密偏移量 🔑']
      ));

      // --- 字母编号表（每行 13 个字母，紧凑样式保证 500px 宽度下只占两行） ---
      function buildNumberedAlphabet() {
        var box = el('div');
        [0, 13].forEach(function (start) {
          var strip = el('div', { className: 'strip strip--compact' });
          for (var i = start; i < start + 13; i += 1) {
            strip.appendChild(el('div', { className: 'strip__cell' }, [
              el('strong', { text: core.numToChar(i) }),
              el('span', { className: 'muted', text: String(i) })
            ]));
          }
          box.appendChild(strip);
        });
        return box;
      }

      var stripCard = el('div', { className: 'card' }, [
        el('h3', { text: '第一步：给字母编号' }),
        el('p', { text: '把字母表标为 A=0, B=1, …, Z=25，字母就可以像数字一样做加法。' })
      ]);
      stripCard.appendChild(buildNumberedAlphabet());
      panel.appendChild(stripCard);

      // --- 转动圆盘 ---
      var K = 3;
      var wheelCard = el('div', { className: 'card' }, [
        el('h3', { text: '第二步：转动字母圆盘' })
      ]);
      var wheelDesc = el('div', { id: 'l1-wheel-desc' }, [
        el('p', { html: '把字母表想成一个圆环：走过 Z 时会绕回 A。给字母加上偏移量 🔑 时，如果编号超过 25，就用「小学除法」取余数：把编号除以 26，<strong>商丢掉、余数留下</strong>。例如 25 + 3 = 28，28 ÷ 26 = 1 余 2，所以 Z 再往后 3 格就绕回到编号 2，也就是 C。' }),
        el('p', { text: '这种「绕回来」的加法就叫模 26 加法。' })
      ]);
      var toggleBtn = el('button', { className: 'btn', text: '收起说明' });
      var collapsed = false;
      toggleBtn.addEventListener('click', function () {
        collapsed = !collapsed;
        wheelDesc.classList.toggle('hidden', collapsed);
        toggleBtn.textContent = collapsed ? '展开说明' : '收起说明';
      });
      var slider = el('input', { type: 'range', min: '0', max: '25', value: '3', id: 'l1-k' });
      var kLabel = el('strong', { className: 'mono', text: '秘密偏移量 🔑 = 3' });
      var demo = el('p', { className: 'mono demo-line', id: 'l1-demo' });
      function refreshDemo() {
        // 固定例子：P(15) + 🔑 = ?
        var r = core.mod(15 + K, 26);
        demo.textContent = 'P(15) + 🔑(' + K + ') = ' + core.numToChar(r) + '(' + r + ')';
        kLabel.textContent = '秘密偏移量 🔑 = ' + K;
      }
      slider.addEventListener('input', function () {
        K = Number(slider.value);
        if (!collapsed) {
          collapsed = true;
          wheelDesc.classList.add('hidden');
          toggleBtn.textContent = '展开说明';
        }
        refreshDemo();
        refreshCipher();
      });
      // slider 与 🔑 值同一行：slider 靠左、🔑 值靠右
      wheelCard.appendChild(el('div', { className: 'flex items-center slider-row' }, [slider, kLabel]));
      wheelCard.appendChild(demo);
      wheelCard.appendChild(wheelDesc);
      wheelCard.appendChild(toggleBtn);
      wheelCard.appendChild(el('p', { className: 'muted mt-1', html: '数学表达：<br>加密 <code>C = (P + 🔑) mod 26</code><br>解密 <code>P = (C - 🔑) mod 26</code>' }));
      panel.appendChild(wheelCard);

      // --- 加密 ---
      var encCard = el('div', { className: 'card' }, [
        el('h3', { text: '第三步：用 🔑 加密' })
      ]);
      var encInput = el('input', { className: 'input', type: 'text', value: 'MEET BY THE RIVER AT SEVEN', id: 'l1-msg' });
      var cipherOut = el('div', { className: 'mono channel__payload', id: 'l1-cipher' });
      function refreshCipher() {
        cipherOut.textContent = core.caesarEncrypt(encInput.value, K);
      }
      encInput.addEventListener('input', refreshCipher);
      encCard.appendChild(el('div', { className: 'field' }, [el('label', { text: '明文' }), encInput]));
      encCard.appendChild(el('div', { className: 'channel' }, [
        el('div', { className: 'channel__title', text: '📡 公共信道上的密文（方法公开，🔑 保密）' }),
        cipherOut
      ]));
      panel.appendChild(encCard);

      // --- 思考题：Kerckhoffs 原则（第三步之后、穷举之前） ---
      panel.appendChild(el('div', { className: 'card' }, [
        el('h3', { text: '思考题' }),
        el('details', { className: 'deep-dive' }, [
          el('summary', { text: '为什么密码设计要遵循 Kerckhoffs 原则——方法可以公开，安全只依赖密钥保密？' }),
          el('p', { text: '方法很难永远保密：代码会被逆向、文档会泄漏、人员会流动，一个被广泛使用的系统注定被无数双眼睛研究，还可能被人直接猜出来。如果把安全寄托在「别人不知道方法」上，泄漏一次就全线崩溃，还无法更换。' }),
          el('p', { text: '密钥则不同：它很小、可以定期更换、可以只存在两个人手里。' }),
          el('p', { text: '方法公开还有一个好处——全世界的高手都能帮忙找漏洞，经得起公开检验的设计才值得信任。' }),
          el('p', { text: '所以：密码系统不能依靠隐藏方法获得安全；即使设计、方法和实现全部公开，只要密钥没泄漏，它仍应保持安全。' })
        ])
      ]));

      // --- 攻击者：穷举 + 评分 ---
      var atkCard = el('div', { className: 'card' }, [
        el('h3', { text: '切换到攻击者：一键穷举 26 把钥匙' }),
        el('p', { text: '方法、编号方式和密文全部公开，只有 🔑 保密。但 🔑 只有 26 种可能，全部试一遍即可。' })
      ]);
      var bruteBtn = el('button', { className: 'btn btn--danger', text: '尝试全部 26 个 🔑' });
      var candBox = el('div', { id: 'l1-cands' });
      var verdict = el('p', { className: 'muted', id: 'l1-verdict' });
      bruteBtn.addEventListener('click', function () {
        candBox.innerHTML = '';
        var cipher = core.caesarEncrypt(encInput.value, K);
        var bestK = 0;
        var bestScore = Infinity;
        var cands = [];
        for (var k = 0; k < 26; k += 1) {
          var cand = core.caesarDecrypt(cipher, k);
          var score = core.scoreEnglish(cand);
          cands.push({ k: k, cand: cand, score: score });
          if (score < bestScore) { bestScore = score; bestK = k; }
        }
        cands.forEach(function (c) {
          var btn = el('button', {
            className: 'candidate mono' + (c.k === bestK ? ' is-best' : ''),
            text: '🔑=' + c.k + ' → ' + c.cand + (c.k === bestK ? '　★ 评分最好' : '')
          });
          btn.addEventListener('click', function () {
            if (c.k === K) {
              btn.classList.add('is-correct');
              verdict.textContent = '✅ 这就是正常句子！Caesar 的运算很清楚，但只有 26 把钥匙，方法公开后可以全部试完。';
            } else {
              verdict.textContent = '这句读起来不像正常的话，再试试别的候选（评分最高的那个往往就是答案）。';
            }
          });
          candBox.appendChild(btn);
        });
        candBox.appendChild(el('details', { className: 'deep-dive mt-2' }, [
          el('summary', { text: '支线知识：评分是怎么打出来的？' }),
          el('p', { text: '英文里每个字母出现的频率很不均匀（E 最常见，Z 很罕见）。把候选明文里各字母的数量和真实英文的频率表对比，差距越小（统计上叫卡方距离），越像正常英文；命中 THE、AND 这类常见短词还会额外加分。26 个候选里评分最好的，通常就是真正的明文——机器就是这样自动认出答案的。' })
        ]));
      });
      atkCard.appendChild(bruteBtn);
      atkCard.appendChild(candBox);
      atkCard.appendChild(verdict);
      panel.appendChild(atkCard);

      // --- 过关谜题：随机密文字母与随机密钥（K=0 不产生位移，排除） ---
      // 本关不再单独放 takeaway：结论已出现在攻击者穷举的判定语中，
      // 「下一关问题」并入过关提示，由谜题直接衔接后续关卡。
      var puzzleK = 1 + Math.floor(Math.random() * 25);
      var puzzleCipherChar = core.numToChar(Math.floor(Math.random() * 26));
      var puzzlePlainChar = core.caesarDecrypt(puzzleCipherChar, puzzleK);
      var puzzleCard = app.buildPuzzle(panel, {
        question: '攻击者截获了一个密文字母 <code>' + puzzleCipherChar + '</code>，并打听到密钥 <code>🔑 = ' + puzzleK + '</code>。请输入对应的明文字母（单个字母）。',
        placeholder: '输入单个明文字母',
        normalize: function (s) { return core.lettersOnly(s); },
        check: function (s) { return s === puzzlePlainChar; },
        solvedText: '正确：' + puzzleCipherChar + '(' + core.charToNum(puzzleCipherChar) + ') − 🔑(' + puzzleK + ') = ' +
          puzzlePlainChar + '(' + core.charToNum(puzzlePlainChar) + ')。<br>下一关问题：如果不做加法，只把字母的位置打乱，会发生什么？'
      });

      // 字母表：与「第一步：给字母编号」形式一致的编号字母表，点击展开 / 收起
      if (puzzleCard && puzzleCard.querySelector('.puzzle__input')) {
        var alphabetBox = buildNumberedAlphabet();
        alphabetBox.classList.add('hidden');
        var alphabetBtn = el('button', { className: 'btn mt-1', text: '🅰️ 字母表' });
        alphabetBtn.addEventListener('click', function () {
          var show = alphabetBox.classList.contains('hidden');
          alphabetBox.classList.toggle('hidden', !show);
          alphabetBtn.textContent = show ? '🅰️ 收起字母表' : '🅰️ 字母表';
        });
        puzzleCard.appendChild(el('div', {}, [alphabetBtn]));
        puzzleCard.appendChild(alphabetBox);
      }

      refreshDemo();
      refreshCipher();
    }
  };
})();
