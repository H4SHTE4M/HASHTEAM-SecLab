(function () {
  'use strict';

  // 第 3 关：Vigenere，重复的加法密钥
  var CryptoLab = window.CryptoLab = window.CryptoLab || {};
  CryptoLab.levels = CryptoLab.levels || {};

  var KEY = 'KEY';
  var PLAIN = 'MEET AT THE RIVER AT SEVEN MEET AT THE OLD TREE TONIGHT';
  var PUZZLE_CIPHER = 'QPMU{ITKQBRCI}'; // vigenereEncrypt('flag{vigenere}', 'lemon')
  var PUZZLE_PLAIN = 'flag{vigenere}';

  CryptoLab.levels.level03 = {
    init: function (panel) {
      var app = CryptoLab.app;
      var el = app.el;
      var core = CryptoLab.core;

      panel.appendChild(app.buildInfoBands(
        ['Vigenere 的方法', '密文'],
        ['密钥词 KEY（长度 3）']
      ));

      var letters = core.lettersOnly(PLAIN);
      var keyStream = '';
      for (var i = 0; i < letters.length; i += 1) keyStream += KEY.charAt(i % KEY.length);
      var cipher = core.vigenereEncrypt(letters, KEY);

      // --- 第一步：明文、密钥、密文同时显示 ---
      var card = el('div', { className: 'card' }, [
        el('h3', { text: '第一步：密钥词 KEY 循环铺开，逐格加法' }),
        el('p', { html: 'Vigenere 就是「一串轮流使用的 Caesar 密钥」。密钥词 <code>KEY</code> 只有 3 个字母，它会一遍遍循环，对准明文逐格做模 26 加法。下面同时摆出明文、密钥和密文（默认前 15 格，可展开全部），密钥行用不同颜色的边框把每个重复单元框出来。点「下一格」观察每一格的加法；走到省略号时会自动展开。' })
      ]);

      var PREVIEW = 15;
      var expanded = false;
      var stepIdx = -1;
      var stripsBox = el('div', { id: 'l3-strips' });
      var demoLine = el('p', { className: 'mono demo-line', text: '点击「下一格」开始。' });

      function stripRow(label, text, isKey) {
        var limit = expanded ? text.length : Math.min(text.length, PREVIEW);
        var row = el('div', { className: 'strip strip--l3' });
        for (var j = 0; j < limit; j += 1) {
          // 密钥行：每个重复单元（KEY 的一次完整展开）用不同颜色的边框区分（15 色循环）
          var groupCls = isKey ? ' key-group-' + (Math.floor(j / KEY.length) % 15) : '';
          var cell = el('div', { className: 'strip__cell' + groupCls + (j === stepIdx ? ' is-highlight' : '') }, [
            el('strong', { text: text.charAt(j) }),
            el('span', { className: 'muted', text: String(core.charToNum(text.charAt(j))) })
          ]);
          row.appendChild(cell);
        }
        if (!expanded) row.appendChild(el('span', { className: 'muted', text: ' …' }));
        return el('div', { className: 'mb-1' }, [el('span', { className: 'muted', text: label }), row]);
      }
      function renderStrips() {
        stripsBox.innerHTML = '';
        stripsBox.appendChild(stripRow('明文：', letters, false));
        stripsBox.appendChild(stripRow('密钥：', keyStream, true));
        stripsBox.appendChild(stripRow('密文：', cipher, false));
      }
      renderStrips();

      var expandBtn = el('button', { className: 'btn', text: '展开完整密文' });
      function syncExpandBtn() {
        expandBtn.textContent = expanded ? '收起' : '展开完整密文';
      }
      expandBtn.addEventListener('click', function () {
        expanded = !expanded;
        if (!expanded && stepIdx >= PREVIEW) stepIdx = -1; // 收起后高亮格超出预览范围，清除高亮
        syncExpandBtn();
        renderStrips();
      });

      var stepBtn = el('button', { className: 'btn', text: '下一格' });
      stepBtn.addEventListener('click', function () {
        stepIdx += 1;
        if (!expanded && stepIdx >= PREVIEW) { // 走到省略号：自动展开完整密文
          expanded = true;
          syncExpandBtn();
        }
        if (stepIdx >= letters.length) stepIdx = 0;
        renderStrips();
        var p = core.charToNum(letters.charAt(stepIdx));
        var kCh = keyStream.charAt(stepIdx);
        var k = core.charToNum(kCh);
        var c = core.mod(p + k, 26);
        demoLine.textContent = '第 ' + (stepIdx + 1) + ' 格：' + letters.charAt(stepIdx) + '(' + p + ') + ' +
          kCh + '(' + k + ') = ' + core.numToChar(c) + '(' + c + ')';
      });
      card.appendChild(stripsBox);
      card.appendChild(el('div', { className: 'flex gap-1' }, [stepBtn, expandBtn]));
      card.appendChild(demoLine);
      card.appendChild(el('p', { className: 'muted', text: '注意：同一个明文字母遇到不同的密钥字母时，会得到不同的密文字母。' }));
      panel.appendChild(card);

      // --- 攻击者攻击 ---
      var atkCard = el('div', { className: 'card' }, [
        el('h3', { text: '切换到攻击者：找重复 → 猜周期 → 分列' }),
        el('p', { text: '真实密钥被隐藏，但方法公开。短密钥反复循环，会在密文中留下特征。' })
      ]);

      // 找出密文中所有长度 ≥ 3 的重复片段（取每个起点上的最长者，过滤其子串）
      function findRepeats(s) {
        var frags = [];
        for (var a = 0; a + 3 <= s.length; a += 1) {
          for (var L = s.length - a; L >= 3; L -= 1) {
            var frag = s.slice(a, a + L);
            var b = s.indexOf(frag, a + 1);
            if (b < 0) continue;
            var isSub = frags.some(function (f) { return f.frag.indexOf(frag) >= 0; });
            if (!isSub) {
              var pos = [a];
              while (b > 0) { pos.push(b); b = s.indexOf(frag, b + 1); }
              frags.push({ frag: frag, pos: pos });
            }
            break; // 每个起点只取最长重复
          }
        }
        return frags;
      }

      // 单列重合指数：随机抽两个字母相同的概率
      function columnIC(s) {
        var counts = core.letterFrequency(s);
        var n = s.length;
        if (n < 2) return 0;
        var sum = 0;
        for (var i = 0; i < 26; i += 1) sum += counts[i] * (counts[i] - 1);
        return sum / (n * (n - 1));
      }

      // 1. 找重复片段
      var repeatBtn = el('button', { className: 'btn btn--danger', text: '① 在密文中找重复片段' });
      var repeatBox = el('div', { id: 'l3-repeat' });
      repeatBtn.addEventListener('click', function () {
        repeatBox.innerHTML = '';
        var frags = findRepeats(cipher);

        // 同步给出带颜色标注的密文：同一片段的每次出现用同一种颜色标出
        var colorAt = [];
        var i;
        for (i = 0; i < cipher.length; i += 1) colorAt.push(-1);
        frags.forEach(function (f, fi) {
          f.pos.forEach(function (p) {
            for (var t = 0; t < f.frag.length; t += 1) {
              if (colorAt[p + t] < 0) colorAt[p + t] = fi % 4;
            }
          });
        });
        var annotated = el('div', { className: 'mono channel__payload' });
        for (i = 0; i < cipher.length; i += 1) {
          if (colorAt[i] >= 0) {
            annotated.appendChild(el('span', { className: 'frag-' + colorAt[i], text: cipher.charAt(i) }));
          } else {
            annotated.appendChild(document.createTextNode(cipher.charAt(i)));
          }
        }
        repeatBox.appendChild(el('div', { className: 'channel' }, [
          el('div', { className: 'channel__title', text: '📡 截获的密文（重复片段已标色）' }),
          annotated
        ]));

        frags.forEach(function (f, fi) {
          repeatBox.appendChild(el('p', { className: 'mono', html: '片段 <strong class="frag-' + (fi % 4) + '">' + f.frag + '</strong> 出现在位置 ' + f.pos.join(' 和 ') + '，间距 <strong>' + (f.pos[1] - f.pos[0]) + '</strong>' }));
        });

        // 周期必为间距的因数：汇总所有间距的因数作为候选
        var cands = {};
        frags.forEach(function (f) {
          var gap = f.pos[1] - f.pos[0];
          for (var d = 2; d < gap; d += 1) if (gap % d === 0) cands[d] = true;
        });
        var candList = Object.keys(cands).sort(function (x, y) { return x - y; });
        var gapText = frags.map(function (f) { return String(f.pos[1] - f.pos[0]); }).join('、');
        repeatBox.appendChild(el('p', { className: 'muted', html: '重复片段的间距是 <strong>' + gapText + '</strong>——密钥周期必为间距的因数，候选周期：<strong>' + candList.join('、') + '</strong>。拖动下面的滑块，对照评分把 2（与间距无关）、6（3 的倍数）等也试一遍。' }));
        guessBox.classList.remove('hidden');
        renderColumns(Number(periodSlider.value));
      });
      atkCard.appendChild(repeatBtn);
      atkCard.appendChild(repeatBox);

      // 2. 猜周期：先介绍重合指数，再用滑块选周期（1~7）
      var guessBox = el('div', { className: 'hidden mt-2', id: 'l3-guess' });
      guessBox.appendChild(el('p', { html: '<strong>② 猜一个周期，查看分列与评分：</strong>' }));
      guessBox.appendChild(el('p', { text: '评分用的是重合指数（IC）：从一段文字里随机抽两个字母，它们相同的概率。周期猜对时，每一列只剩同一把 Caesar 偏移，字母分布保留英文特有的不均匀性；猜错时每列是多把偏移的混合，分布被抹平。' }));
      guessBox.appendChild(el('div', { className: 'mono' , text: '参考重合指数：英文 ≈ 0.066 · 随机文本 ≈ 0.038'}));
      var periodLabel = el('strong', { className: 'mono', text: '周期 = 2' });
      var periodSlider = el('input', { type: 'range', min: '1', max: '7', value: '2', id: 'l3-period' });
      periodSlider.addEventListener('input', function () {
        periodLabel.textContent = '周期 = ' + periodSlider.value;
        renderColumns(Number(periodSlider.value));
      });
      guessBox.appendChild(el('div', { className: 'flex items-center slider-row' }, [periodLabel, periodSlider]));
      atkCard.appendChild(guessBox);

      // 3. 分列 + 评分依据（重合指数）+ 逐列恢复
      var colBox = el('div', { id: 'l3-cols' });
      function renderColumns(period) {
        colBox.innerHTML = '';
        var cols = [];
        var i;
        for (i = 0; i < period; i += 1) cols.push('');
        for (i = 0; i < cipher.length; i += 1) cols[i % period] += cipher.charAt(i);
        // 每列的重合指数直接写进对应列的框内
        var ics = cols.map(columnIC);
        var COL_PREVIEW = 30; // 过长的列（如周期 1 的整段密文）用省略号截断，避免窄屏溢出
        var wrap = el('div', { className: 'l3-cols' });
        cols.forEach(function (col, idx) {
          wrap.appendChild(el('div', { className: 'card card--flat' }, [
            el('strong', { text: '第 ' + (idx + 1) + ' 列' }),
            el('div', { className: 'mono', text: col.length > COL_PREVIEW ? col.slice(0, COL_PREVIEW) + ' …' : col, title: col }),
            el('div', { className: 'mono muted', text: 'IC = ' + ics[idx].toFixed(3) })
          ]));
        });
        colBox.appendChild(wrap);

        // 评分依据：各列 IC 的平均值。周期正确时每列只剩一把 Caesar 偏移，
        // 字母分布保留英文的不均匀性，IC 接近英文；周期错误时每列是
        // 多把偏移的混合，分布被抹平，IC 滑向随机文本。
        var avgIc = ics.reduce(function (s, v) { return s + v; }, 0) / ics.length;
        colBox.appendChild(el('p', { className: 'mono', html: '各列平均重合指数 IC = <strong>' + avgIc.toFixed(3) + '</strong>' }));

        if (avgIc >= 0.066) {
          colBox.appendChild(el('p', { html: '✅ 平均 IC 达到英文水平、明显高于随机：每一列很可能只剩同一把 Caesar 偏移——周期 ' + period + '猜对了，继续 ③ 用解密结果做最终验证。' }));
          var recoverBtn = el('button', { className: 'btn btn--danger', text: '③ 逐列恢复偏移，拼回密钥' });
          // 依据先行说明：按钮下方先讲清楚，再直接展示每列结果
          var basis = el('p', { className: 'muted', text: '依据：对每一列穷举全部 26 个 Caesar 偏移，把试出的字母分布与英文频率表对比（卡方距离），差距最小的偏移就是这一列的密钥字母。' });
          var keyOut = el('div', { id: 'l3-keyout' });
          recoverBtn.addEventListener('click', function () {
            keyOut.innerHTML = '';
            var keyGuess = '';
            cols.forEach(function (col, idx) {
              // 逐列穷举 26 个偏移，用卡方距离对照明文频率
              var best = 0, bestScore = Infinity;
              for (var s = 0; s < 26; s += 1) {
                var sc = core.chiSquare(core.caesarDecrypt(col, s));
                if (sc < bestScore) { bestScore = sc; best = s; }
              }
              keyGuess += core.numToChar(best);
              keyOut.appendChild(el('p', { className: 'mono', html: '第 ' + (idx + 1) + ' 列：偏移 = ' + best + ' → 密钥字母 <strong>' + core.numToChar(best) + '</strong>' }));
            });
            keyOut.appendChild(el('p', { className: 'mono demo-line', html: '拼回密钥：<strong>' + keyGuess + '</strong>' }));
            var decrypted = core.vigenereDecrypt(cipher, keyGuess);
            keyOut.appendChild(el('p', { className: 'mono', text: '解密验证：' + decrypted }));
            if (decrypted === letters) {
              if (keyGuess === KEY) {
                keyOut.appendChild(el('p', { text: '✅ 与发送者的真实密钥 KEY 完全一致！' }));
              } else {
                keyOut.appendChild(el('p', { html: '✅ 解密完全正确！拼出的 <strong>' + keyGuess + '</strong> 只是 KEY 重复了几遍——周期 ' + period + ' 是 3 的倍数，同样成立，约定取最短的 3 作为周期。' }));
              }
            } else {
              keyOut.appendChild(el('p', { text: '❌ 解密结果读不通：密文较短时 IC 噪声大，这次统计指错了方向。真正的周期要同时通过「评分」和「解密验证」两关，换个候选再试。' }));
            }
          });
          colBox.appendChild(recoverBtn);
          colBox.appendChild(basis);
          colBox.appendChild(keyOut);
        } else {
          colBox.appendChild(el('p', { className: 'muted', text: '❌ 平均 IC 未达到英文水平，更接近随机：每列仍是多把 Caesar 偏移的混合体，看不出 Caesar 的特征。周期 ' + period + ' 很可能不对，换个周期再猜。' }));
        }
      }
      atkCard.appendChild(colBox);

      // 深入思考：重合指数与互重合指数
      atkCard.appendChild(el('details', { className: 'deep-dive mt-2' }, [
        el('summary', { text: '深入思考：重合指数' }),
        el('p', { text: '上面 ② 的评分就是重合指数（IC）：度量「随机抽两个字母相同的概率」。周期正确时每列只剩一把 Caesar 偏移，IC 接近英文的 0.066；周期错误时接近随机文本的 0.038。密文越短噪声越大，所以短密文里 IC 只能指路，最终要靠解密验证。' }),
        el('p', { text: '逐列恢复偏移时，还可以比较「两列字母分布相差几格」（统计上叫互重合指数），先把各列对齐，再整体平移出密钥；本关用的「每列试 26 个偏移、对照英文频率」是它的简化版。密文越长，这些统计方法越可靠。' })
      ]));
      panel.appendChild(atkCard);

      // 不再附「下一关问题」：生硬衔接后续关卡，结论本身已足够
      panel.appendChild(app.buildTakeaway(
        '短密钥反复循环并没有变强——它把周期写进了密文：找重复定出候选周期，用重合指数评分分列，Vigenere 就拆回了一个个 Caesar。重复，就是泄密。'
      ));

      // --- 过关谜题 ---
      var puzzleCard = app.buildPuzzle(panel, {
        question: '思考题：如果明文中的某些单词被猜出，对猜密钥有没有帮助？<br/>攻击者截获密文 <code>' + PUZZLE_CIPHER + '</code>，并打听到<strong>明文以 flag 开头</strong>。请利用这个线索推出密钥并还原，输入完整明文（含花括号）。',
        placeholder: 'flag{...}',
        normalize: function (s) { return String(s).trim().toLowerCase(); },
        check: function (s) { return s === PUZZLE_PLAIN; },
        solvedText: '正确！已知 f→Q、l→P、a→M、g→U 四个明密文对，就能反推密钥字母 l、e、m、o，密钥 lemon 随之暴露。'
      });

      // Vigenere 解密计算器：用已知明密文对反推密钥字母（k = C − P mod 26），
      // 学生可据此算出密钥前 4 位，第 5 位逐个尝试。
      // 与第 0、1 关的字母表一致：默认收起，点击按钮展开 / 收起。
      if (puzzleCard && puzzleCard.querySelector('.puzzle__input')) {
        var calcKey = el('input', { className: 'input mono', type: 'text', placeholder: '猜测的密钥，如 lemo', id: 'l3-calc-key' });
        var calcCipher = el('input', { className: 'input mono', type: 'text', value: PUZZLE_CIPHER, id: 'l3-calc-cipher' });
        var calcOut = el('p', { className: 'mono demo-line', text: '结果会显示在这里。', id: 'l3-calc-out' });
        var calcBtn = el('button', { className: 'btn', text: '解密' });
        calcBtn.addEventListener('click', function () {
          var k = core.lettersOnly(calcKey.value);
          if (!k) {
            calcOut.textContent = '先输入一个猜测的密钥（字母）。';
            return;
          }
          calcOut.textContent = '密钥 ' + k.toLowerCase() + ' → ' + core.vigenereDecrypt(calcCipher.value, k);
        });
        var calcBox = el('div', { className: 'hidden mt-1' }, [
          el('p', { className: 'muted', html: '已知明文字母 P 与对应密文字母 C，就能反推密钥字母：<code>k = C − P (mod 26)</code>。明文以 f(5) 开头、密文以 Q(16) 开头 → 16 − 5 = 11 = l。<code>flag</code> 四个字母可以推出密钥前 4 位；第 5 位没有线索，把 26 个字母逐个填进计算器试，看哪个解出通顺的内容。' }),
          el('div', { className: 'field' }, [el('label', { text: '密钥' }), calcKey]),
          el('div', { className: 'field' }, [el('label', { text: '密文' }), calcCipher]),
          calcBtn,
          calcOut
        ]);
        var calcToggle = el('button', { className: 'btn mt-1', text: '🔧 Vigenere 解密计算器' });
        calcToggle.addEventListener('click', function () {
          var show = calcBox.classList.contains('hidden');
          calcBox.classList.toggle('hidden', !show);
          calcToggle.textContent = show ? '🔧 收起计算器' : '🔧 Vigenere 解密计算器';
        });
        puzzleCard.appendChild(el('div', {}, [calcToggle]));
        puzzleCard.appendChild(calcBox);
      }
    }
  };
})();
