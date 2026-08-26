(function () {
  'use strict';

  // 第 4 关：⊕，模 2 的不进位加法
  var CryptoLab = window.CryptoLab = window.CryptoLab || {};
  CryptoLab.levels = CryptoLab.levels || {};

  function bitRow(bits, cls, clickable, onToggle) {
    var app = CryptoLab.app;
    var el = app.el;
    var row = el('div', { className: 'flex gap-1 items-center ' + (cls || '') });
    bits.forEach(function (b, i) {
      var cell = el('div', { className: 'bit-cell' + (b ? ' is-on' : ''), text: String(b) });
      if (clickable) {
        cell.addEventListener('click', function () { onToggle(i); });
      }
      row.appendChild(cell);
    });
    return row;
  }

  CryptoLab.levels.level04 = {
    init: function (panel) {
      var app = CryptoLab.app;
      var el = app.el;
      var core = CryptoLab.core;

      panel.appendChild(app.buildInfoBands(
        ['⊕ 的真值表', '密文比特'],
        ['密钥比特 K']
      ));

      // --- 并排对照 ---
      panel.appendChild(el('div', { className: 'card' }, [
        el('h3', { text: '第一步：古典 vs 比特并排对照' }),
        el('p', { html: '比特世界的加号写作 <strong>⊕</strong>。它和计算机教科书里的「XOR （异或）」是同一种运算的两种写法。' }),
        el('table', { className: 'table' }, [
          el('tr', {}, [el('th', { text: '古典密码' }), el('th', { text: '比特世界' })]),
          el('tr', {}, [el('td', { text: '字母编号只有 0..25' }), el('td', { text: '一个比特只有 0, 1' })]),
          el('tr', {}, [el('td', { text: '超过 25 就绕回 0' }), el('td', { text: '超过 1 就绕回 0' })]),
          el('tr', {}, [el('td', { html: '(P + K) mod 26' }), el('td', { html: 'p ⊕ k' })]),
          el('tr', {}, [el('td', { text: '每个密钥字母决定一次加法' }), el('td', { text: '每个密钥比特决定一次加法' })])
        ])
      ]));

      // --- 不进位加法板 ---
      var boardCard = el('div', { className: 'card' }, [
        el('h3', { text: '第二步：不进位加法板' }),
        el('p', { text: '点击两个比特，观察四种结果。注意：1 ⊕ 1 = 0，结果绕回 0，不向旁边进位。' })
      ]);
      var ba = 0, bb = 0;
      var aCell = el('div', { className: 'bit-cell', text: '0' });
      var bCell = el('div', { className: 'bit-cell', text: '0' });
      var rCell = el('div', { className: 'bit-cell bit-cell--result', text: '0' });
      var revealBtn = el('button', { className: 'btn', text: '把四种结果汇成一张表' });
      var revealBox = el('div', { id: 'l4-reveal' });
      function refreshBoard() {
        aCell.textContent = String(ba); aCell.classList.toggle('is-on', ba === 1);
        bCell.textContent = String(bb); bCell.classList.toggle('is-on', bb === 1);
        var r = ba ^ bb;
        rCell.textContent = String(r); rCell.classList.toggle('is-on', r === 1);
      }
      aCell.addEventListener('click', function () { ba = 1 - ba; refreshBoard(); });
      bCell.addEventListener('click', function () { bb = 1 - bb; refreshBoard(); });
      revealBtn.addEventListener('click', function () {
        revealBox.innerHTML = '';
        revealBox.appendChild(el('table', { className: 'table' }, [
          el('tr', {}, [el('th', { text: 'p' }), el('th', { text: 'k' }), el('th', { text: 'p ⊕ k' })]),
          el('tr', {}, [el('td', { text: '0' }), el('td', { text: '0' }), el('td', { text: '0' })]),
          el('tr', {}, [el('td', { text: '0' }), el('td', { text: '1' }), el('td', { text: '1' })]),
          el('tr', {}, [el('td', { text: '1' }), el('td', { text: '0' }), el('td', { text: '1' })]),
          el('tr', {}, [el('td', { text: '1' }), el('td', { text: '1' }), el('td', { text: '0' })])
        ]));
        revealBox.appendChild(el('p', { html: '这四行就是 ⊕ 的真值表——「逐位模 2 加法」与 ⊕ 是同一件事。' }));
      });
      boardCard.appendChild(el('div', { className: 'flex gap-1 items-center' }, [
        aCell, el('span', { className: 'mono', text: '⊕' }), bCell,
        el('span', { className: 'mono', text: '= ' }), rCell
      ]));
      boardCard.appendChild(revealBtn);
      boardCard.appendChild(revealBox);
      panel.appendChild(boardCard);

      // --- C = P ⊕ K 演示 ---
      var xorCard = el('div', { className: 'card' }, [
        el('h3', { text: '第三步：加密与解密用的是同一把钥匙' }),
        el('p', { html: '点击明文 P 或密钥 K 的比特，观察 C = P ⊕ K；再对密文用同一把 K，就得到 P = C ⊕ K。' })
      ]);
      var P = [0, 1, 1, 0, 1, 0, 0, 1];
      var Kb = [1, 0, 1, 1, 0, 1, 0, 0];
      var stage = el('div', { id: 'l4-stage' });
      function xorBits(x, y) {
        var out = [];
        for (var i = 0; i < x.length; i += 1) out.push(x[i] ^ y[i]);
        return out;
      }
      function renderStage() {
        stage.innerHTML = '';
        var C = xorBits(P, Kb);
        stage.appendChild(el('p', { className: 'mono mb-1', text: '明文 P（点我翻转）' }));
        stage.appendChild(bitRow(P, '', true, function (i) { P[i] = 1 - P[i]; renderStage(); }));
        stage.appendChild(el('p', { className: 'mono mb-1 mt-1', text: '密钥 K（点我翻转——只有对应的结果位会变）' }));
        stage.appendChild(bitRow(Kb, '', true, function (i) { Kb[i] = 1 - Kb[i]; renderStage(); }));
        stage.appendChild(el('p', { className: 'mono mb-1 mt-1', text: '密文 C = P ⊕ K' }));
        stage.appendChild(bitRow(C));
        stage.appendChild(el('p', { className: 'mono mb-1 mt-1', text: '解密：C ⊕ K = ?' }));
        stage.appendChild(bitRow(xorBits(C, Kb)));
        stage.appendChild(el('p', { className: 'muted mt-1', text: '解密结果与明文完全一致。' }));
      }
      renderStage();
      xorCard.appendChild(stage);

      var kkBtn = el('button', { className: 'btn', text: '为什么同一把钥匙能开锁？K ⊕ K = 0' });
      var kkBox = el('div', { id: 'l4-kk', className: 'mt-1' });
      kkBtn.addEventListener('click', function () {
        kkBox.innerHTML = '';
        kkBox.appendChild(el('p', { className: 'mono', text: 'C ⊕ K = (P ⊕ K) ⊕ K = P ⊕ (K ⊕ K) = P ⊕ 0 = P' }));
        var zeros = [0, 0, 0, 0, 0, 0, 0, 0];
        kkBox.appendChild(el('p', { className: 'mono mb-1', text: 'K ⊕ K：' }));
        kkBox.appendChild(bitRow(zeros));
        kkBox.appendChild(el('p', { className: 'muted mt-1', text: '同一把密钥会把自己的影响抵消。' }));
      });
      xorCard.appendChild(kkBtn);
      xorCard.appendChild(kkBox);
      panel.appendChild(xorCard);

      panel.appendChild(el('div', { className: 'card card--warning' }, [
        el('p', { html: '<strong>必须避免的误解：</strong>⊕ 只是运算，不会自动产生安全性。若密钥比特很短、可预测或重复，问题会和 Vigenere 的重复密钥相似。' })
      ]));

      // --- 过关谜题：三元方程组 ---
      var eqCard = el('div', { className: 'card puzzle' }, [
        el('h3', { text: '🧩 过关谜题' }),
        el('p', { html: '比特 x、y、z 满足：<br/><code>x ⊕ y = 1</code><br/><code>y ⊕ z = 0</code><br/><code>x ⊕ z = 1</code><br/>三个未知数中，哪两个一定相等？' })
      ]);
      var eqDone = false;
      ['x 和 y', 'y 和 z', 'x 和 z', '两两都相等'].forEach(function (opt, i) {
        var btn = el('button', { className: 'btn puzzle__choice', text: opt });
        btn.addEventListener('click', function () {
          if (eqDone) return;
          if (i === 1) {
            eqDone = true;
            btn.classList.add('is-correct');
            eqCard.appendChild(el('p', { className: 'puzzle__solved', text: '✅ 正确：a ⊕ b = 0 说明 a = b，结果为 1 则说明两者不同——三条方程里只有 y 和 z 一定相等。' }));
            app.finishLevel('level04', panel);
          } else {
            btn.classList.add('is-wrong');
          }
        });
        eqCard.appendChild(btn);
        eqCard.appendChild(document.createTextNode(' '));
      });
      panel.appendChild(eqCard);
    }
  };
})();
