(function () {
  'use strict';

  // 第 2 关：栅栏密码，只换位置会留下什么
  var CryptoLab = window.CryptoLab = window.CryptoLab || {};
  CryptoLab.levels = CryptoLab.levels || {};

  // 每条栅栏行用一种颜色（边框）标记
  var ROW_COLORS = ['#0d6efd', '#fd7e14', '#20c997', '#6f42c1', '#dc3545'];

  CryptoLab.levels.level02 = {
    init: function (panel) {
      var app = CryptoLab.app;
      var el = app.el;
      var core = CryptoLab.core;

      panel.appendChild(app.buildInfoBands(
        ['栅栏摆放规则', '密文'],
        ['栅栏层数（本关的「钥匙」）']
      ));

      // --- 摆放演示 ---
      var card = el('div', { className: 'card' }, [
        el('h3', { text: '第一步：沿栅栏摆放，再按行读出' }),
        el('p', { text: '把字母卡片沿栅栏上下摆放，每一行用一种颜色的框标记；再一行一行读出来，密文的每一段也带着对应的颜色。' })
      ]);
      var input = el('input', { className: 'input', type: 'text', value: 'MEET BY THE RIVER AT SEVEN', id: 'l2-msg' });
      var railsSlider = el('input', { type: 'range', min: '2', max: '5', value: '3', id: 'l2-rails' });
      var railsLabel = el('strong', { className: 'mono', text: '3 层' });
      var fenceBox = el('div', { className: 'fence', id: 'l2-fence' });
      var cipherBox = el('div', { className: 'channel__payload mono', id: 'l2-cipher' });

      function render() {
        var rails = Number(railsSlider.value);
        var text = core.lettersOnly(input.value);
        railsLabel.textContent = rails + ' 层';
        fenceBox.innerHTML = '';
        cipherBox.innerHTML = '';
        if (!text.length) return;
        var pattern = core.railFencePattern(text.length, rails);
        var grid = el('div', { className: 'fence__grid', style: 'grid-template-columns: repeat(' + text.length + ', 0.95rem)' });
        for (var r = 0; r < rails; r += 1) {
          for (var i = 0; i < text.length; i += 1) {
            if (pattern[i] === r) {
              var cell = el('div', { className: 'fence__cell', text: text.charAt(i) });
              cell.style.borderColor = ROW_COLORS[r];
              grid.appendChild(cell);
            } else {
              grid.appendChild(el('div', { className: 'fence__cell fence__cell--empty' }));
            }
          }
        }
        fenceBox.appendChild(grid);
        // 按行读出的密文，各段用同色框标出
        var cipher = core.railFenceEncrypt(text, rails);
        var counts = [];
        for (r = 0; r < rails; r += 1) counts.push(0);
        pattern.forEach(function (row) { counts[row] += 1; });
        var pos = 0;
        for (r = 0; r < rails; r += 1) {
          var seg = el('span', { className: 'cipher-segment', text: cipher.slice(pos, pos + counts[r]) });
          seg.style.borderColor = ROW_COLORS[r];
          cipherBox.appendChild(seg);
          pos += counts[r];
        }
        // 第二步的扫描结果已展示过时，跟随明文/层数同步刷新
        if (bigramShown) showBigrams(false);
      }

      input.addEventListener('input', render);
      railsSlider.addEventListener('input', render);

      card.appendChild(el('div', { className: 'field' }, [el('label', { text: '明文' }), input]));
      card.appendChild(el('div', { className: 'field' }, [el('label', {}, [document.createTextNode('栅栏层数 '), railsLabel]), railsSlider]));
      card.appendChild(fenceBox);
      card.appendChild(el('div', { className: 'channel' }, [
        el('div', { className: 'channel__title', text: '📡 按行读出的密文（颜色 = 来自哪一行）' }),
        cipherBox
      ]));
      panel.appendChild(card);

      // 字母扫描行：二元组合命中扫描与篡改演示共用。
      // 返回 { node, spans, counter, hits, s }；withCounter 为 true 时行尾带命中计数。
      function letterRow(labelText, s, withCounter) {
        var spans = [];
        var children = [el('span', { className: 'letter-row__label', text: labelText })];
        for (var i = 0; i < s.length; i += 1) {
          var sp = el('span', { className: 'letter-ch', text: s.charAt(i) });
          spans.push(sp);
          children.push(sp);
        }
        var counter = null;
        if (withCounter) {
          counter = el('strong', { className: 'letter-row__count', text: '命中 0 次' });
          children.push(counter);
        }
        return { node: el('div', { className: 'letter-row mono' }, children), spans: spans, counter: counter, hits: 0, s: s };
      }

      // --- 弱点：没有混淆，看二元统计 ---
      var teachCard = el('div', { className: 'card' }, [
        el('h3', { text: '第二步：换位留下的统计痕迹' }),
        el('p', { text: '栅栏密码只搬位置，没有「混淆」：每个字母的数量完全不变，单字母频率派不上用场。真正的线索藏在相邻字母里——英语里有一些特别常见的二元组合（相邻字母搭档）：' }),
        el('p', { className: 'mono', text: core.COMMON_BIGRAMS.join('　') }),
        el('p', { className: 'muted', text: '通顺的英文会反复命中这些搭档；栅栏把它们拆散后，密文就很少命中。反过来说：哪种「拆法还原」能让命中数升回去，哪种就大概率是对的——这正好给攻击者一个自动打分的办法。播放动画，看这些搭档在示例明文里哪里命中、在密文里又剩多少。' })
      ]);
      var bigramBtn = el('button', { className: 'btn', text: '▶ 播放：扫描明文与密文，看组合在哪里命中' });
      var bigramBox = el('div', { id: 'l2-bigram' });
      var bigramTimer = null;
      var bigramShown = false; // 展示过后，明文/层数一变就同步刷新
      function showBigrams(animate) {
        var rails = Number(railsSlider.value);
        var text = core.lettersOnly(input.value);
        var cipher = core.railFenceEncrypt(text, rails);
        bigramBox.innerHTML = '';
        if (bigramTimer) { clearInterval(bigramTimer); bigramTimer = null; }
        if (!text.length) { bigramShown = false; return; }
        bigramShown = true;

        var rowP = letterRow('明文', text, true);
        var rowC = letterRow('密文', cipher, true);
        var summary = el('p', { className: 'mono mt-1' });
        bigramBox.appendChild(rowP.node);
        bigramBox.appendChild(rowC.node);
        bigramBox.appendChild(summary);

        // 扫描状态机：两个字母宽的窗口逐格右移，先扫明文行、再扫密文行
        var rows = [rowP, rowC];
        var cursor = { row: 0, i: 0 };
        function clearScan(row) {
          row.spans.forEach(function (sp) { sp.classList.remove('is-scan'); });
        }
        function finish() {
          summary.textContent = '扫描结果：常见二元组合命中——明文 ' + rowP.hits + ' 次，密文 ' + rowC.hits + ' 次。';
        }
        function step() {
          var row = rows[cursor.row];
          if (cursor.i + 1 >= row.s.length) {
            clearScan(row);
            cursor.row += 1;
            cursor.i = 0;
            if (cursor.row >= rows.length) { finish(); return false; }
            return true;
          }
          clearScan(row);
          var pair = row.s.slice(cursor.i, cursor.i + 2);
          row.spans[cursor.i].classList.add('is-scan');
          row.spans[cursor.i + 1].classList.add('is-scan');
          if (core.COMMON_BIGRAMS.indexOf(pair) >= 0) {
            row.hits += 1;
            row.spans[cursor.i].classList.add('is-hit');
            row.spans[cursor.i + 1].classList.add('is-hit');
            row.counter.textContent = '命中 ' + row.hits + ' 次';
          }
          cursor.i += 1;
          return true;
        }

        if (animate && typeof setInterval === 'function') {
          bigramTimer = setInterval(function () {
            if (bigramBox.isConnected === false) { clearInterval(bigramTimer); bigramTimer = null; return; } // 关卡已切换，停止播放
            if (!step()) { clearInterval(bigramTimer); bigramTimer = null; }
          }, 180);
        } else {
          // 无定时器的环境（如测试）或跟随输入刷新：直接播完
          while (step()) { /* 同步跑完 */ }
        }
      }
      bigramBtn.addEventListener('click', function () { showBigrams(true); });
      teachCard.appendChild(bigramBtn);
      teachCard.appendChild(bigramBox);
      panel.appendChild(teachCard);

      // --- 攻击者：尝试所有可能层数（上限由明文长度界定） ---
      var atkCard = el('div', { className: 'card' }, [
        el('h3', { text: '切换到攻击者：尝试所有可能层数' }),
        el('p', { text: '排列方法公开，只隐藏栅栏层数。注意：层数再多也多不过明文字母的个数——n 个字母最多铺 n 层（每层只剩一个字母），所以攻击者的枚举范围由明文长度界定。先猜一个层数，再看结果。' })
      ]);
      var atkBtn = el('button', { className: 'btn btn--danger', text: '枚举所有可能层数（自动评分）' });
      var atkBox = el('div', { id: 'l2-atk' });
      atkBtn.addEventListener('click', function () {
        atkBox.innerHTML = '';
        var text = core.lettersOnly(input.value);
        var n = text.length;
        var cipher = core.railFenceEncrypt(text, Number(railsSlider.value));
        var bestR = 2;
        var bestScore = -Infinity; // 适应度是负的 log 概率，初始值必须比任何得分都低
        var cands = [];
        for (var r = 2; r <= n; r += 1) {
          var cand = core.railFenceDecrypt(cipher, r);
          var score = core.englishFitness(cand);
          cands.push({ r: r, cand: cand, score: score });
          if (score > bestScore) { bestScore = score; bestR = r; }
        }
        atkBox.appendChild(el('p', { className: 'muted', text: '明文长度 n = ' + n + '，共枚举 ' + (n - 1) + ' 种层数（2～' + n + '）。' }));
        cands.forEach(function (c) {
          var btn = el('button', {
            className: 'candidate mono' + (c.r === bestR ? ' is-best' : '')
          });
          btn.appendChild(el('span', {
            className: 'candidate__text',
            text: c.r + ' 层 ' + c.cand + '（适应度 ' + c.score.toFixed(0) + '）'
          }));
          // 「★ 评分最好」是独立徽章：宽度不足时整体换到下一行，不会从中间断开
          if (c.r === bestR) btn.appendChild(el('span', { className: 'candidate__best', text: '★ 评分最好' }));
          btn.addEventListener('click', function () {
            if (c.r === Number(railsSlider.value)) btn.classList.add('is-correct');
          });
          atkBox.appendChild(btn);
        });
        atkBox.appendChild(el('details', { className: 'deep-dive mt-2' }, [
          el('summary', { text: '支线知识：评分的原理' }),
          el('p', { text: '换位密码保留单字母频率，所以数 E 有几个没用；要看相邻字母的组合。做法是从大量英文书籍里统计组合频率：二元组合（TH、HE…）用全部 676 项，三元（THE、ING…）和四元（THER、TION…）取最常见的几千项。对每种层数的还原结果，把它出现的每个组合按频率换算成分数相加——组合越常见加分越多，越罕见减分越多，三种长度的分数合起来叫「适应度」。只看二元组合在短消息上仍会认错，混合三元、四元之后，正确层数几乎总是排在最上面。' })
        ]));
      });
      atkCard.appendChild(atkBtn);
      atkCard.appendChild(atkBox);
      panel.appendChild(atkCard);

      // --- 攻击者篡改：SEVEN → EIGHT ---
      var tamperCard = el('div', { className: 'card' }, [
        el('h3', { text: '第三步：攻击者篡改消息——七点变八点' }),
        el('p', { text: '攻击者已经枚举起出层数、读出了明文，知道约会时间是 SEVEN（七点）。换位密码只搬位置，他只要换掉密文里对应的几个字母，接收者解密出的时间就变成了 EIGHT（八点）。播放动画，看密文的改动怎样一个个落到明文上。' })
      ]);
      var tamperBtn = el('button', { className: 'btn btn--danger', text: '▶ 把 SEVEN 篡改成 EIGHT' });
      var tamperBox = el('div', { id: 'l2-tamper' });
      var tamperTimer = null;
      tamperBtn.addEventListener('click', function () {
        var rails = Number(railsSlider.value);
        var text = core.lettersOnly(input.value);
        tamperBox.innerHTML = '';
        if (tamperTimer) { clearInterval(tamperTimer); tamperTimer = null; }
        var start = text.indexOf('SEVEN');
        if (start < 0) {
          tamperBox.appendChild(el('p', { className: 'muted mt-1', text: '这一步需要明文里包含 SEVEN——把上面的明文改回默认消息再来试试。' }));
          return;
        }
        var n = text.length;
        var cipher = core.railFenceEncrypt(text, rails);

        // 换位是纯粹的排列：先算出明文第 i 个字母住在密文的哪个位置
        var pattern = core.railFencePattern(n, rails);
        var counts = [];
        var rowSeen = [];
        var r;
        for (r = 0; r < rails; r += 1) { counts.push(0); rowSeen.push(0); }
        pattern.forEach(function (row) { counts[row] += 1; });
        var rowStart = [0];
        for (r = 1; r < rails; r += 1) rowStart.push(rowStart[r - 1] + counts[r - 1]);
        var cipherPos = [];
        for (var i = 0; i < n; i += 1) {
          cipherPos.push(rowStart[pattern[i]] + rowSeen[pattern[i]]);
          rowSeen[pattern[i]] += 1;
        }

        var tampered = cipher.split('');
        var target = 'EIGHT';
        var cipherRow = letterRow('密文', cipher, false);
        var plainRow = letterRow('明文', text, false);
        var note = el('p', { className: 'muted' });
        tamperBox.appendChild(el('div', { className: 'channel mt-1' }, [
          el('div', { className: 'channel__title', text: '📡 信道上的密文（攻击者换掉 SEVEN 对应的字母）' }),
          cipherRow.node
        ]));
        tamperBox.appendChild(el('div', { className: 'channel' }, [
          el('div', { className: 'channel__title', text: '📥 接收者解密得到的明文' }),
          plainRow.node
        ]));
        tamperBox.appendChild(note);

        // 逐字母篡改：每步换掉一个密文字母，对应的明文字母立即跟着变
        var k = 0;
        function step() {
          if (k > 0) {
            cipherRow.spans[cipherPos[start + k - 1]].classList.remove('is-flash');
            plainRow.spans[start + k - 1].classList.remove('is-flash');
          }
          if (k >= target.length) {
            note.textContent = '攻击者只改了 ' + target.length + ' 个密文字母，约会时间就从七点变成了八点——换位密码没有任何办法发现消息被改动过。';
            return false;
          }
          var ci = cipherPos[start + k];
          tampered[ci] = target.charAt(k);
          cipherRow.spans[ci].textContent = target.charAt(k);
          cipherRow.spans[ci].classList.add('is-changed');
          cipherRow.spans[ci].classList.add('is-flash');
          // 解密是同一排列的逆：这个位置回到明文的 start + k
          plainRow.spans[start + k].textContent = target.charAt(k);
          plainRow.spans[start + k].classList.add('is-changed');
          plainRow.spans[start + k].classList.add('is-flash');
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
      tamperCard.appendChild(tamperBtn);
      tamperCard.appendChild(tamperBox);
      panel.appendChild(tamperCard);

      panel.appendChild(app.buildTakeaway(
        '密钥的可能性还是太少，只换位置会保留字符数量和大量结构，攻击者仍能利用这些弱点。',
        '还有没有更加复杂的密码，能够抵御这种穷举攻击？'
      ));

      // --- 过关谜题：flag 整体（含花括号）经 3～5 层栅栏重排 ---
      // 花括号跟着字母一起换位置，在密文里留下 flag{...} 的格式线索
      var PUZZLE_PLAIN = 'FLAG{FENCE}';
      var puzzleRails = 3 + Math.floor(Math.random() * 3); // 3～5 层
      var puzzleCipher = core.railFenceCharsEncrypt(PUZZLE_PLAIN, puzzleRails);
      app.buildPuzzle(panel, {
        question: '攻击者截获到一条短密文：<code>' + puzzleCipher + '</code>。栅栏重排把所有字符都搬了位置，但 <code>{}</code> 这对花括号暴露了答案格式 <code>FLAG{...}</code>。枚举层数还原它，输入完整答案。',
        placeholder: 'flag{...}',
        normalize: function (s) { return String(s).trim().toLowerCase(); },
        check: function (s) { return s === 'flag{fence}'; },
        solvedText: '破解成功！它用的是 ' + puzzleRails + ' 层栅栏。密文里散落的 {} 提示了 flag 格式，以 FLAG{ 为锚点逐层试排，答案立刻现身。'
      });

      render();
    }
  };
})();
