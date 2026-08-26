(function () {
  'use strict';

  // 支线 A：一次一密，理论上完美但很难用
  var CryptoLab = window.CryptoLab = window.CryptoLab || {};
  CryptoLab.levels = CryptoLab.levels || {};

  // 伪密钥示例：同一份密文对应两条各自有意义的明文
  var FAKE_P1 = 'MEETATSEVEN';
  var FAKE_P2 = 'STAYHOMENOW';
  var FAKE_K1 = 'XQJVMZKAPWT';
  var FAKE_K2 = 'RBNQFEQAXMK';
  var FAKE_CIPHER = 'JUNOMSCEKAG';

  // 过关谜题数据：五条等长明文（各 10 个字母）。
  // 多次一密设定：密钥带与消息等长（10 个字母）、被复用五次，init 时随机生成。
  // 单条太短会被求解器直接拒绝；五条拼接后在周期 10 下可稳定解出
  // （每列 5 个样本，真实偏移在各列候选中排名前二的结论与密钥取值无关，已验证）。
  var PUZZLE_PLAINS = [
    'MEETATNOON',
    'DONTBELATE',
    'TRUSTNOONE',
    'HIDETHINGS',
    'SEEYOUSOON'
  ];
  var PUZZLE_KEY_LEN = 10;

  CryptoLab.levels.sideA = {
    init: function (panel) {
      var app = CryptoLab.app;
      var el = app.el;
      var core = CryptoLab.core;

      panel.appendChild(app.buildInfoBands(
        ['逐格加法方法（和 Vigenere 相同）', '密文'],
        ['一次性密钥带（与消息等长、真正随机）']
      ));

      // --- 逻辑链：从 Vigenere 的漏洞说起 ---
      panel.appendChild(el('div', { className: 'card' }, [
        el('h3', { text: '回顾：Vigenere 为什么会被分析？' }),
        el('p', { html: '第 3 关的密钥词只有 3 个字母，消息却有几十个字母——<strong>消息远长于密钥</strong>，同一小段密钥被一遍遍重用，密文里就出现了重复的节奏。攻击者正是抓住「重用」下手的：找重复片段 → 猜周期 → 分列。' }),
        el('p', { html: '顺着这个逻辑反推：如果密钥<strong>和消息一样长</strong>，每个字母都配一把全新的偏移，<strong>任何一段都不重复</strong>——周期、分列、重复片段全都无从谈起。这就是<strong>一次一密</strong>。' })
      ]));

      // --- 等长随机密钥演示 ---
      var card = el('div', { className: 'card' }, [
        el('h3', { text: '第一幕：等长随机密钥' })
      ]);
      var msgInput = el('input', { className: 'input', type: 'text', value: 'MEET AT SEVEN', id: 'sa-msg' });
      var genBtn = el('button', { className: 'btn btn--primary', text: '生成一次性密钥并加密' });
      var outBox = el('div', { id: 'sa-out', className: 'mt-1' });
      var lastKey = '';
      genBtn.addEventListener('click', function () {
        var msg = core.lettersOnly(msgInput.value);
        if (!msg.length) return;
        lastKey = '';
        for (var i = 0; i < msg.length; i += 1) {
          lastKey += core.numToChar(Math.floor(Math.random() * 26));
        }
        var cipher = core.vigenereEncrypt(msg, lastKey);
        outBox.innerHTML = '';
        function row(label, text) {
          var strip = el('div', { className: 'strip' });
          for (var j = 0; j < text.length; j += 1) {
            strip.appendChild(el('div', { className: 'strip__cell' }, [el('strong', { text: text.charAt(j) })]));
          }
          return el('div', { className: 'mb-1' }, [el('span', { className: 'muted', text: label }), strip]);
        }
        outBox.appendChild(row('明文：', msg));
        outBox.appendChild(row('一次性密钥（与消息等长、真正随机）：', lastKey));
        outBox.appendChild(row('密文：', cipher));
      });
      card.appendChild(el('div', { className: 'field' }, [el('label', { text: '消息' }), msgInput]));
      card.appendChild(genBtn);
      card.appendChild(outBox);
      panel.appendChild(card);

      // --- 伪密钥：单份密文无法确定唯一明文 ---
      panel.appendChild(el('div', { className: 'card' }, [
        el('h3', { text: '为什么攻击者无法确定唯一明文？' }),
        el('p', { text: '攻击者只拿到一份密文时，任何一个等长的明文都对应一条「能把密文解成它」的密钥。例如同一份密文：' }),
        el('p', { className: 'mono', text: '密文 = ' + FAKE_CIPHER }),
        el('p', { className: 'mono', html: '用密钥 <code>' + FAKE_K1 + '</code> 解密 → <strong>' + FAKE_P1 + '</strong>（七点见）' }),
        el('p', { className: 'mono', html: '用密钥 <code>' + FAKE_K2 + '</code> 解密 → <strong>' + FAKE_P2 + '</strong>（待在家）' }),
        el('p', { className: 'muted', text: '两条「伪密钥」各自都解出通顺的明文。攻击者无法判断哪条是真密钥——一次一密下，单份密文不含任何能区分它们的信息。' })
      ]));

      // --- 条件卡 ---
      panel.appendChild(el('div', { className: 'card condition-card' }, [
        el('h3', { text: '条件卡：一次一密必须同时满足' }),
        el('ul', {}, [
          el('li', { html: '<strong>真正随机</strong>：密钥带不能由可预测的规律生成' }),
          el('li', { html: '<strong>与消息等长</strong>：不能循环使用一小段密钥' }),
          el('li', { html: '<strong>保持秘密</strong>：密钥带本身不能泄露' }),
          el('li', { html: '<strong>只使用一次</strong>：用完就销毁' })
        ])
      ]));

      // --- 反例：密钥不够随机 ---
      var weakCard = el('div', { className: 'card' }, [
        el('h3', { text: '反例：为什么必须「真正随机」？' }),
        el('p', { text: '密钥带必须不可预测。看看两个「不够随机」的密钥会出什么事：' })
      ]);
      var weakBox = el('div', { id: 'sa-weak' });
      function showWeak(kind) {
        var msg = core.lettersOnly(msgInput.value);
        if (!msg.length) return;
        var key, label;
        var i;
        if (kind === 'allC') {
          key = '';
          for (i = 0; i < msg.length; i += 1) key += 'C';
          label = '全 C 密钥（每个字母固定偏移 2）';
        } else {
          key = '';
          for (i = 0; i < msg.length; i += 1) key += core.numToChar(i % 3); // A B C A B C …
          label = '有规律地重复的密钥 ABCABC…';
        }
        var cipher = core.vigenereEncrypt(msg, key);
        weakBox.innerHTML = '';
        weakBox.appendChild(el('p', { className: 'mono', text: label }));
        weakBox.appendChild(el('p', { className: 'mono', text: '密钥：' + key }));
        weakBox.appendChild(el('p', { className: 'mono', text: '密文：' + cipher }));
        if (kind === 'allC') {
          weakBox.appendChild(el('p', { className: 'muted', text: '每个字母都偏移同样的 2 格——这正好退回了第 1 关的 Caesar 密码（K = 2），攻击者试 26 把钥匙就能破。' }));
        } else {
          weakBox.appendChild(el('p', { className: 'muted', text: '密钥每 3 格重复一次，就又变回了第 3 关的 Vigenere：找重复 → 猜周期 → 分列，整套攻击原样适用。只要密钥的规律能被猜中。' }));
        }
        weakBox.appendChild(el('p', { className: 'muted', text: '这些密钥都可以称为「弱密钥」，只不过在「真正随机」的情况下，选中这些密钥的概率很低，对安全性的影响可以忽略不计。' }));
      }
      var w1 = el('button', { className: 'btn', text: '试试全 C 密钥' });
      var w2 = el('button', { className: 'btn', text: '试试 ABCABC… 密钥' });
      w1.addEventListener('click', function () { showWeak('allC'); });
      w2.addEventListener('click', function () { showWeak('pattern'); });
      weakCard.appendChild(el('div', { className: 'flex gap-1' }, [w1, w2]));
      weakCard.appendChild(weakBox);
      panel.appendChild(weakCard);

      // --- 重复使用演示 ---
      var reuseCard = el('div', { className: 'card' }, [
        el('h3', { text: '第二幕：故意违反「只使用一次」' }),
        el('p', { text: '发送者图省事，用同一条密钥带加密了三条等长消息。看看攻击者能直接看出什么。' })
      ]);
      var reuseMsgs = ['ATTACKATDAWN', 'RETREATNOWOK', 'HOLDPOSITION'];
      var reuseBtn = el('button', { className: 'btn btn--danger', text: '用同一条密钥带加密三条消息' });
      var reuseOut = el('div', { id: 'sa-reuse', className: 'mt-1' });
      reuseBtn.addEventListener('click', function () {
        var key = lastKey && lastKey.length >= reuseMsgs[0].length ? lastKey.slice(0, reuseMsgs[0].length) : 'XJRTQPZMOWLE';
        var ciphers = reuseMsgs.map(function (m) { return core.vigenereEncrypt(m, key); });
        reuseOut.innerHTML = '';
        ciphers.forEach(function (c, idx) {
          var strip = el('div', { className: 'strip' });
          for (var j = 0; j < c.length; j += 1) {
            strip.appendChild(el('div', { className: 'strip__cell' }, [el('strong', { text: c.charAt(j) })]));
          }
          reuseOut.appendChild(el('div', { className: 'mb-1' }, [
            el('span', { className: 'muted', text: '密文 ' + (idx + 1) + '：' }), strip
          ]));
        });
        var alignBtn = el('button', { className: 'btn btn--danger', text: '攻击者：用分析 Vigenere 的方法恢复密钥' });
        reuseOut.appendChild(alignBtn);
        alignBtn.addEventListener('click', function () {
          alignBtn.disabled = true;
          // 第 3 关的方法：已知周期（= 密钥带长度），分列后逐列按对数频率选最优偏移
          var recovered = '';
          for (var j = 0; j < ciphers[0].length; j += 1) {
            var col = ciphers[0].charAt(j) + ciphers[1].charAt(j) + ciphers[2].charAt(j);
            var best = -Infinity, bi = 0;
            for (var sh = 0; sh < 26; sh += 1) {
              var sc = 0;
              for (var k = 0; k < col.length; k += 1) sc += LOG_FREQ[core.mod(core.charToNum(col.charAt(k)) - sh, 26)];
              if (sc > best) { best = sc; bi = sh; }
            }
            recovered += core.numToChar(bi);
          }
          var hits = 0;
          for (var h = 0; h < key.length; h += 1) if (recovered.charAt(h) === key.charAt(h)) hits += 1;
          reuseOut.appendChild(el('p', { className: 'mono mt-1', text: '三条密文都是 ' + ciphers[0].length + ' 个字母 → 密钥带长度 = ' + key.length + '，周期根本不用猜' }));
          reuseOut.appendChild(el('p', { className: 'mono', text: '逐列频率分析恢复密钥 = ' + recovered }));
          reuseOut.appendChild(el('p', { className: 'mono', text: '真实密钥带　　　　　 = ' + key + '（猜对 ' + hits + '/' + key.length + ' 格）' }));
          reuseOut.appendChild(el('p', { text: '每一列都加了同一个密钥字母，就是一个 Caesar；按列做频率分析，密钥就被逐格恢复出来。只复用三次时每列只有 3 个样本，所以会猜错几格——但密钥带每多用一次，每列就多一个样本，猜得越准。一次一密的「完美」，在重用的瞬间就退回了第 3 关的老问题。' }));
        });
      });
      reuseCard.appendChild(reuseBtn);
      reuseCard.appendChild(reuseOut);
      panel.appendChild(reuseCard);

      // --- 思考题：密钥比明文还长 ---
      panel.appendChild(el('div', { className: 'card' }, [
        el('h3', { text: '思考题' }),
        el('details', { className: 'deep-dive' }, [
          el('summary', { text: '如果密钥比明文还长，会发生什么？' }),
          el('p', { text: '安全性上没有任何额外好处：明文只有 n 格，密钥前 n 格参与运算，后面多出来的部分根本用不上，白白浪费。真正的麻烦在分发——密钥越长，安全地把密钥带交给对方就越难、越贵。一次一密的关键不是「越长越好」，而是「不短于明文、真正随机、只用一次」。' })
        ])
      ]));

      // --- 过关谜题：Vigenere 求解器 + 五条同密钥带短密文（多次一密） ---
      // 密钥带与消息等长、被复用五次，每次进入关卡时随机生成；
      // 排除全部字母相同的退化密钥（否则密文即明文）
      var puzzleKey = '';
      do {
        puzzleKey = '';
        for (var ki = 0; ki < PUZZLE_KEY_LEN; ki += 1) {
          puzzleKey += core.numToChar(Math.floor(Math.random() * 26));
        }
      } while (/^([A-Z])\1{9}$/.test(puzzleKey));
      var puzzleCiphers = PUZZLE_PLAINS.map(function (p) { return core.vigenereEncrypt(p, puzzleKey); });
      var puzzleCard = el('div', { className: 'card puzzle' }, [
        el('h3', { text: '🧩 过关谜题' }),
        el('p', { text: '攻击者截获了五条短密文（长度均为 10 个字母）。它们用的是同一条密钥——密钥和消息一样长，却被复用了五次。用每条密文旁的「添加到求解器」把它拼接到求解器输入框，再填入正确的周期，求解器会自动给出最优解。现在你要利用求解器，分析出 5 条密文对应的明文，分别填对即过关。' })
      ]);
      var solverIn = el('input', { className: 'input mono', type: 'text', placeholder: '用下方按钮逐条添加密文' });
      var periodIn = el('input', { className: 'input', type: 'number', min: '1', max: '50', placeholder: '周期', id: 'sa-solver-period' });
      var solverBtn = el('button', { className: 'btn', text: '分析' });
      var progressBar = el('div', { className: 'solver-progress__bar' });
      var progressWrap = el('div', { className: 'solver-progress', style: 'display:none' }, [progressBar]);
      var solverOut = el('div', { className: 'mono', id: 'sa-solver-out' });
      solverBtn.addEventListener('click', function () {
        var s = core.lettersOnly(solverIn.value);
        var p = parseInt(periodIn.value, 10);
        solverOut.innerHTML = '';
        if (s.length < 20) {
          solverOut.textContent = '分析失败：密文太短，统计方法没有足够的数据。';
          return;
        }
        if (!p || p < 1 || p > 50) {
          solverOut.textContent = '分析失败：请先填入周期（1～50 的整数）。';
          return;
        }
        progressWrap.style.display = '';
        progressBar.style.width = '0%';
        var result = solveWithPeriod(s, p);
        solverOut.appendChild(el('p', { text: '周期 = ' + p + '，最优密钥 = ' + result.key }));
        solverOut.appendChild(el('p', { text: '明文（每 10 个字母一行）：' }));
        for (var i = 0; i < result.plain.length; i += 10) {
          solverOut.appendChild(el('p', { className: 'mono', text: result.plain.slice(i, i + 10) }));
        }
        // 计算本身很快，进度条用 CSS 过渡平滑走到 100%
        setTimeout(function () { progressBar.style.width = '100%'; }, 30);
      });
      puzzleCard.appendChild(el('div', { className: 'flex gap-1' }, [solverIn, periodIn, solverBtn]));
      puzzleCard.appendChild(progressWrap);
      puzzleCard.appendChild(solverOut);

      var solvedCount = 0;
      var done = {};
      puzzleCiphers.forEach(function (c, idx) {
        var row = el('div', { className: 'mt-2' }, [

        ]);
        var addBtn = el('button', { className: 'btn', text: '添加到求解器' });
        addBtn.addEventListener('click', function () {
          solverIn.value = core.lettersOnly(solverIn.value) + c;
        });
        row.appendChild(el('div', { className: 'flex gap-1 mb-1' }, [
          el('p', { className: 'mono mb-1', text: '密文 ' + (idx + 1) + ' = ' + c }),
          addBtn
        ]));
        var ans = el('input', { className: 'input mono puzzle__input', type: 'text', placeholder: '输入明文 ' + (idx + 1) });
        var btn = el('button', { className: 'btn btn--primary', text: '验证' });
        var out = el('span', { className: 'muted' });
        btn.addEventListener('click', function () {
          if (done[idx]) return;
          var expect = PUZZLE_PLAINS[idx];
          if (core.lettersOnly(ans.value) === expect) {
            done[idx] = true;
            solvedCount += 1;
            out.textContent = ' ✅';
            ans.disabled = true;
            btn.disabled = true;
            if (solvedCount === 5) {
              app.finishLevel('sideA', panel);
              puzzleCard.classList.add('puzzle--solved');
            }
          } else {
            out.textContent = ' 还不对，用求解器再核一下。';
          }
        });
        row.appendChild(el('div', { className: 'flex gap-1 items-center' }, [ans, btn, out]));
        puzzleCard.appendChild(row);
      });
      panel.appendChild(puzzleCard);

      // 简易 Vigenere 求解器：周期由使用者给定（多次一密时周期 = 密钥带长度），不再自动猜测。
      // 先逐列按对数频率给 26 个偏移打分、留下每列前 topN 个候选，
      // 再穷搜各列候选拼出的密钥字；打分时按每 10 个字母一条消息分别计算英文适应度再求和
      // （跨消息边界的 n 元组合是噪声，整体打分会把正确密钥埋掉），总分最高者即最优解。
      // topN 随周期自适应，穷搜组合数不超过 COMBO_BUDGET。
      var LOG_FREQ = [8.17, 1.49, 2.78, 4.25, 12.70, 2.23, 2.02, 6.09, 6.97, 0.15,
        0.77, 4.03, 2.41, 6.75, 7.51, 1.93, 0.10, 5.99, 6.33, 9.06,
        2.76, 0.98, 2.36, 0.15, 1.97, 0.07].map(function (f) { return Math.log(f / 100); });
      var COMBO_BUDGET = 32768;
      function solveWithPeriod(cipher, p) {
        var s = core.lettersOnly(cipher);
        var topN = Math.max(1, Math.min(4, Math.floor(Math.pow(COMBO_BUDGET, 1 / p))));
        var cand = [];
        for (var j = 0; j < p; j += 1) {
          var col = '';
          for (var i = j; i < s.length; i += p) col += s.charAt(i);
          var scored = [];
          for (var sh = 0; sh < 26; sh += 1) {
            var sc = 0;
            for (var k = 0; k < col.length; k += 1) sc += LOG_FREQ[core.mod(core.charToNum(col.charAt(k)) - sh, 26)];
            scored.push({ sh: sh, sc: sc });
          }
          scored.sort(function (a, b) { return b.sc - a.sc; });
          cand.push(scored.slice(0, topN).map(function (x) { return x.sh; }));
        }
        var best = -Infinity, bestKey = '';
        var total = Math.pow(topN, p);
        for (var t = 0; t < total; t += 1) {
          var x = t, key = '';
          for (var j2 = 0; j2 < p; j2 += 1) {
            key += core.numToChar(cand[j2][x % topN]);
            x = Math.floor(x / topN);
          }
          var plain = core.vigenereDecrypt(s, key);
          var fit = 0;
          for (var r = 0; r < plain.length; r += 10) fit += core.englishFitness(plain.slice(r, r + 10));
          if (fit > best) { best = fit; bestKey = key; }
        }
        return { p: p, key: bestKey, plain: core.vigenereDecrypt(s, bestKey) };
      }

      panel.appendChild(app.buildTakeaway(
        '一次一密展示了理论安全的苛刻条件：真正随机、与消息等长、保密、只用一次。'
      ));
    }
  };
})();
