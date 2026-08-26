(function () {
  'use strict';

  // 支线 B：打开 AES，看一位变化如何铺满全局
  var CryptoLab = window.CryptoLab = window.CryptoLab || {};
  CryptoLab.levels = CryptoLab.levels || {};

  // AES 状态按列填充：矩阵第 r 行第 c 列 = 字节数组第 c*4+r 个。
  // 传入 otherBytes 时，有差分的格子把底色竖着分成 8 条，
  // 从左到右对应 b7..b0，红色条表示该比特不同。
  function stateMatrix(el, bytes, otherBytes, highlightIdx, compact) {
    var m = el('div', { className: 'byte-matrix' + (compact ? ' byte-matrix--compact' : '') });
    for (var r = 0; r < 4; r += 1) {
      for (var c = 0; c < 4; c += 1) {
        var i = c * 4 + r;
        var diff = otherBytes ? (bytes[i] ^ otherBytes[i]) & 0xff : 0;
        var cell = el('div', {
          className: 'byte-matrix__cell' +
            (diff ? ' has-bitdiff' : '') +
            (highlightIdx === i ? ' is-highlight' : '')
        });
        if (diff) {
          var strip = el('div', { className: 'byte-matrix__bitstrip' });
          for (var b = 7; b >= 0; b -= 1) {
            strip.appendChild(el('span', { className: (diff & (1 << b)) ? 'is-on' : '' }));
          }
          cell.appendChild(strip);
        }
        cell.appendChild(el('span', {
          className: 'byte-matrix__val',
          text: (bytes[i] & 0xff).toString(16).padStart(2, '0')
        }));
        m.appendChild(cell);
      }
    }
    return m;
  }

  CryptoLab.levels.sideB = {
    init: function (panel) {
      var app = CryptoLab.app;
      var el = app.el;
      var core = CryptoLab.core;
      var aes = CryptoLab.aes;

      panel.appendChild(app.buildInfoBands(
        ['AES 每一步的定义'],
        ['AES 主密钥']
      ));

      panel.appendChild(el('p', { className: 'muted', text: '一段 10～15 分钟的可视化探索：不求手算 AES，只看见多轮操作怎样形成混淆、扩散和雪崩效应。' }));

      // ================= B.1 一行字节怎样排成 4×4 方阵 =================
      var b1 = el('div', { className: 'card' }, [
        el('h3', { text: 'B.1 一行字节怎样排成 4×4 方阵' }),
        el('p', { text: 'AES 的输入是一行按顺序排列的 16 个字节。它把这行字节按「列」填进方阵：先填满第 1 列的 4 格，再填第 2 列……点「放入下一个字节」看看。' })
      ]);
      var demoBytes = core.hexToBytes('00112233445566778899aabbccddeeff');
      var fillCount = 0;
      var seqBox = el('div', { className: 'strip' });
      var matBox = el('div', { className: 'mt-1' });
      function renderFill() {
        seqBox.innerHTML = '';
        for (var i = 0; i < 16; i += 1) {
          seqBox.appendChild(el('div', {
            className: 'strip__cell' + (i === fillCount - 1 ? ' is-highlight' : ''),
            text: demoBytes[i].toString(16).padStart(2, '0')
          }));
        }
        matBox.innerHTML = '';
        var shown = demoBytes.map(function () { return null; });
        for (var k = 0; k < fillCount; k += 1) shown[k] = demoBytes[k];
        var m = el('div', { className: 'byte-matrix' });
        for (var r = 0; r < 4; r += 1) {
          for (var c = 0; c < 4; c += 1) {
            var idx = c * 4 + r;
            m.appendChild(el('div', {
              className: 'byte-matrix__cell' + (shown[idx] == null ? ' byte-matrix__cell--empty' : (idx === fillCount - 1 ? ' is-highlight' : '')),
              text: shown[idx] == null ? '·' : shown[idx].toString(16).padStart(2, '0')
            }));
          }
        }
        matBox.appendChild(m);
      }
      var fillBtn = el('button', { className: 'btn btn--primary', text: '放入下一个字节' });
      var fillReset = el('button', { className: 'btn', text: '重来' });
      var fillTimer = null;
      function stopFillTimer() {
        if (fillTimer) { clearInterval(fillTimer); fillTimer = null; }
      }
      // 窄屏（移动端）连点不便：第一次点击「放入下一个字节」后开始自动逐格播放，
      // 播完、切换关卡或点「重来」都会停止
      function maybeStartFillTimer() {
        if (fillTimer) return;
        if (typeof window.matchMedia !== 'function' || !window.matchMedia('(max-width: 640px)').matches) return;
        if (typeof setInterval !== 'function') return;
        fillTimer = setInterval(function () {
          if (fillBtn.isConnected === false || fillCount >= 16) { stopFillTimer(); return; }
          fillCount += 1;
          renderFill();
        }, 350);
      }
      fillBtn.addEventListener('click', function () {
        if (fillCount < 16) { fillCount += 1; renderFill(); }
        maybeStartFillTimer();
      });
      fillReset.addEventListener('click', function () { stopFillTimer(); fillCount = 0; renderFill(); });
      b1.appendChild(el('div', { className: 'b1-controls flex gap-1 mt-1' }, [seqBox, fillBtn, fillReset]));
      b1.appendChild(matBox);
      b1.appendChild(el('p', { className: 'muted mt-1', text: '注意是竖着填：前 4 个字节在第 1 列。' }));
      panel.appendChild(b1);
      renderFill();

      // ================= 轮密钥：一把主密钥扩展成十一把 =================
      panel.appendChild(el('div', { className: 'takeaway' }, [
        el('h3', { text: '轮密钥：一把主密钥扩展成十一把' }),
        el('p', { text: 'AES-128 不会直接用原始主密钥去搅拌数据。它先把 16 字节主密钥通过公开的密钥扩展算法，生成 11 个 16 字节的轮密钥（round key）。' }),
        el('p', { text: '每个轮密钥只用一次，而且都和状态一样长，因此可以逐字节做 ⊕，把秘密信息一层层混进去。' }),
        el('p', { text: '密钥扩展规则完全公开，攻击者也知道；但他没有主密钥，就无法算出这些轮密钥。下面的 B.2 会逐步展示这些步骤怎样把一处微小差分搅匀。' })
      ]));

      // ================= B.2 1 bit 的变化怎样被搅匀 =================
      var b2 = el('div', { className: 'card' }, [
        el('h3', { text: 'B.2 1 bit 的变化怎样被搅匀' }),
        el('p', { text: '用同一把密钥加密两条几乎一样的消息：右边这条只翻了 1 个 bit。逐步观察这一处差分怎样先铺满一列、再铺满整个方阵。点「随机换一对」可以换两条新消息再看一次。' }),
        el('p', { text: '入口先做一次「轮密钥加」，接着 10 轮变换；前 9 轮各含四个步骤，最后一轮省略「列混合」。每一步并排显示这一步完成后两侧的状态。' }),
        el('ul', {}, [
          el('li', { html: '<strong>字节代换</strong>：每个字节查同一张公开的 S 盒替换表' }),
          el('li', { html: '<strong>行移位</strong>：四行分别循环向左移动不同距离——把不同列字节进行组合' }),
          el('li', { html: '<strong>列混合</strong>：每列四个字节通过线性代数重新混合——字节之间产生相互作用' }),
          el('li', { html: '<strong>轮密钥加</strong>：状态与本轮轮密钥做 ⊕ ——每轮混入主密钥派生的秘密信息' })
        ])
      ]);
      var keyB = core.hexToBytes('2b7e151628aed2a6abf7158809cf4f3c');
      var plainA, traceA, traceB;
      var stepIdx = 0;
      var stepBox = el('div', { className: 'step-view--stacked' });
      var flipLine = el('p', { className: 'mono muted mt-1' });
      var diffLine = el('p', { className: 'mono muted mt-1' });
      // 随机生成一对只差 1 个 bit 的消息，重算两条 trace 并回到第 1 步
      function newPair() {
        plainA = [];
        for (var i = 0; i < 16; i += 1) plainA.push(Math.floor(Math.random() * 256));
        var byteIdx = Math.floor(Math.random() * 16);
        var bitInByte = Math.floor(Math.random() * 8);
        var plainB = plainA.slice();
        plainB[byteIdx] ^= (1 << bitInByte);
        traceA = aes.encryptBlockTrace(plainA, keyB).steps;
        traceB = aes.encryptBlockTrace(plainB, keyB).steps;
        stepIdx = 0;
        flipLine.textContent = '本次只翻转了第 ' + (byteIdx + 1) + ' 个字节的 b' + bitInByte + '（其余 127 bit 完全相同）';
        renderStep();
      }
      function stepCounterText() {
        return '第 ' + (stepIdx + 1) + ' / ' + traceA.length + ' 步（第 ' + traceA[stepIdx].round + ' 轮）';
      }
      function renderStep() {
        var step = traceA[stepIdx];
        var stateB = traceB[stepIdx].state;
        stepCounter.textContent = stepCounterText();
        stepName.textContent = step.name;
        stepBox.innerHTML = '';
        stepBox.appendChild(el('div', { className: 'step-view__pane' }, [
          el('div', { className: 'step-view__pane-label', text: '变化前' }),
          stateMatrix(el, step.state, null, null, true)
        ]));
        stepBox.appendChild(el('div', { className: 'step-view__pane' }, [
          el('div', { className: 'step-view__pane-label', text: '变化后' }),
          stateMatrix(el, stateB, step.state, null, true)
        ]));
        var d = aes.diffBytes(step.state, stateB);
        diffLine.textContent = '本步之后：' + d.bytes + ' / 16 个字节不同，共 ' + d.bits + ' 个 bit 不同';
      }
      var stepPrev = el('button', { className: 'btn', text: '← 上一步' });
      var stepNext = el('button', { className: 'btn', text: '下一步 →' });
      var rerollBtn = el('button', { className: 'btn', text: '换一对消息试试' });
      var stepCounter = el('div', { className: 'step-view__counter', text: '' });
      var stepName = el('div', { className: 'step-view__mid' });
      stepPrev.addEventListener('click', function () { if (stepIdx > 0) { stepIdx -= 1; renderStep(); } });
      stepNext.addEventListener('click', function () { if (stepIdx < traceA.length - 1) { stepIdx += 1; renderStep(); } });
      rerollBtn.addEventListener('click', newPair);
      b2.appendChild(el('div', { className: 'step-view__nav flex gap-1 items-center' }, [stepPrev, stepCounter, stepNext]));
      b2.appendChild(stepName);
      b2.appendChild(stepBox);
      b2.appendChild(flipLine);
      b2.appendChild(diffLine);
      b2.appendChild(el('p', { className: 'muted mt-1', text: '右侧有差分的格子把底色竖着分成 8 条，从左到右对应最高位到最低位：哪一位不同，哪一条就是红色。' }));
      b2.appendChild(el('div', { style: 'text-align:center' }, [rerollBtn]));
      panel.appendChild(b2);
      newPair();

      // ================= B.3 雪崩效应统计 =================
      var raceCard = el('div', { className: 'card' }, [
        el('h3', { text: 'B.3 雪崩效应统计' }),
        el('p', { text: '随机选一条消息和一把密钥，只在指定位置翻一个比特，再比较两次加密结果。多次运行后，观察“两个输出有几位不同”的分布。' })
      ]);

      var bitIndexInput = el('input', { className: 'input', type: 'number', min: '1', max: '128', value: '1', style: 'max-width:8rem' });
      bitIndexInput.value = '1';
      var targetSelect = el('select', { className: 'input', style: 'max-width:12rem' }, [
        el('option', { value: 'plain', text: '明文' }),
        el('option', { value: 'key', text: '密钥' })
      ]);
      targetSelect.value = 'plain';

      raceCard.appendChild(el('div', { className: 'field' }, [
        el('label', { text: '选择翻转第几个比特（1~128）：' }),
        bitIndexInput
      ]));
      raceCard.appendChild(el('div', { className: 'field' }, [
        el('label', { text: '选择翻转位置：' }),
        targetSelect
      ]));

      var measurements = [];
      var chartBox = el('div', { className: 'freq-chart', style: 'margin-top:0.75rem' });
      var summaryBox = el('p', { className: 'mono mt-1', text: '已运行 0 次' });

      function renderChart() {
        chartBox.innerHTML = '';
        var bins = new Array(16).fill(0);
        measurements.forEach(function (bits) {
          var bin = Math.min(15, Math.floor(bits / 8));
          bins[bin] += 1;
        });
        var maxCount = Math.max(1, Math.max.apply(null, bins));
        bins.forEach(function (count, idx) {
          var bar = el('div', { className: 'freq-bar', style: 'height:' + (count / maxCount * 100) + '%' });
          bar.appendChild(el('span', { className: 'freq-bar__label', text: String(idx * 8) }));
          chartBox.appendChild(bar);
        });
      }
      function renderSummary() {
        var last = measurements.length ? measurements[measurements.length - 1] : '—';
        var sum = measurements.reduce(function (a, b) { return a + b; }, 0);
        var avg = measurements.length ? (sum / measurements.length).toFixed(1) : '—';
        summaryBox.textContent = '已运行 ' + measurements.length + ' 次：最近一次有 ' + last + ' 位不同，平均 ' + avg + ' 位。';
      }
      function runBatch(n) {
        var bit = Number(bitIndexInput.value) || 1;
        if (bit < 1) bit = 1;
        if (bit > 128) bit = 128;
        bitIndexInput.value = String(bit);
        for (var t = 0; t < n; t += 1) {
          var p = [], k = [];
          for (var i = 0; i < 16; i += 1) {
            p.push(Math.floor(Math.random() * 256));
            k.push(Math.floor(Math.random() * 256));
          }
          var out1 = aes.encryptBlock(p, k);
          var byteIdx = Math.floor((bit - 1) / 8);
          var bitInByte = (bit - 1) % 8;
          if (targetSelect.value === 'key') {
            k[byteIdx] ^= (1 << bitInByte);
          } else {
            p[byteIdx] ^= (1 << bitInByte);
          }
          var out2 = aes.encryptBlock(p, k);
          measurements.push(aes.diffBytes(out1, out2).bits);
        }
        renderSummary();
        renderChart();
      }
      function clearMeasurements() {
        measurements.length = 0;
        renderSummary();
        renderChart();
      }

      var runBtn = el('button', { className: 'btn btn--primary', text: '运行' });
      var run10Btn = el('button', { className: 'btn', text: '运行10次' });
      var run100Btn = el('button', { className: 'btn', text: '运行100次' });
      runBtn.addEventListener('click', function () { runBatch(1); });
      run10Btn.addEventListener('click', function () { runBatch(10); });
      run100Btn.addEventListener('click', function () { runBatch(100); });
      bitIndexInput.addEventListener('change', clearMeasurements);
      targetSelect.addEventListener('change', clearMeasurements);
      raceCard.appendChild(el('div', { className: 'flex gap-1 wrap' }, [runBtn, run10Btn, run100Btn]));
      raceCard.appendChild(chartBox);
      raceCard.appendChild(summaryBox);
      raceCard.appendChild(el('p', { className: 'muted mt-1', text: '柱状图横轴是“不同的位数”，纵轴是出现的次数。运行次数越多，越能看出结果大多落在中间附近——这就是雪崩效应的统计表现。' }));
      panel.appendChild(raceCard);

      renderChart();
      renderSummary();

      // ================= 过关谜题：-log₂ p =================
      var puzzleCard = el('div', { className: 'card puzzle' }, [
        el('h3', { text: '🧩 过关谜题' }),
        el('p', { html: '如果 AES 的输入完全随机，两次加密输出<strong>完全相等</strong>的概率 p 有多大？请计算 <strong>−log<sub>2</sub> p</strong>（输入一个整数）。' }),
        el('details', { className: 'deep-dive mt-1 mb-1' }, [
          el('summary', { text: '提示：古典概型' }),
          el('p', { html: '两次输出一共有 2<sup>256</sup> 种等可能情况，而「两次输出完全相等」只有 2<sup>128</sup> 种情况（第一次任意，第二次必须和第一次相同）。' })
        ])
      ]);
      var ansIn = el('input', { className: 'input mono puzzle__input', type: 'text', placeholder: '−log₂ p = ?' });
      var ansBtn = el('button', { className: 'btn btn--primary', text: '提交' });
      var linked = el('div', { className: 'flow-box', style: 'border-color:#0dcaf0' }, [
        el('span', { className: 'flow-box__label', text: '联动：−log₁₀ p' }),
        el('span', { className: 'mono', text: '（随输入同步计算）' })
      ]);
      var verdict = el('p', { className: 'muted mt-1' });
      ansIn.addEventListener('input', function () {
        var v = Number(ansIn.value);
        linked.querySelectorAll('span')[1].textContent =
          ansIn.value.trim() === '' || isNaN(v) ? '（随输入同步计算）' : '≈ ' + (v * Math.log10(2)).toFixed(1);
      });
      ansBtn.addEventListener('click', function () {
        if (Number(ansIn.value.trim()) === 128) {
          var log10p = 128 * Math.log10(2);
          var secondsPerYear = 365.25 * 24 * 3600;
          var n = (log10p - 12 - Math.log10(secondsPerYear)).toFixed(1);
          verdict.innerHTML = '✅ 正确：−log₂(2⁻¹²⁸) = 128。<br>' +
            '这相当于要在约 10<sup>' + log10p.toFixed(1) + '</sup>次尝试中才能遇到一次重复密钥。<br>' +
            '假设一台计算机每秒能搜索 10¹² 个密钥，它也需要约 10<sup>' + n + '</sup>年——远超宇宙年龄（约 10<sup>10</sup> 年）。<br>' +
            '因此在实际中可以认为这种情况<strong>不可能发生</strong>。';
          ansIn.disabled = true;
          ansBtn.disabled = true;
          app.finishLevel('sideB', panel);
        } else {
          verdict.textContent = '还不对。回到古典概型：p = 2¹²⁸ / 2²⁵⁶，先把 p 写成 2 的幂。';
        }
      });
      puzzleCard.appendChild(el('div', { className: 'flex gap-1 items-center wrap' }, [ansIn, ansBtn, linked]));
      puzzleCard.appendChild(verdict);
      panel.appendChild(puzzleCard);

      if (app.state && app.state.solved && app.state.solved.sideB) {
        app.finishLevel('sideB', panel);
      }

      panel.appendChild(app.buildTakeaway(
        'AES 用多轮扩散和混淆，与扩展的轮密钥混合，形成雪崩效应。',
        null
      ));
    }
  };
})();
