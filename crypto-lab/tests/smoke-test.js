'use strict';

// 无头冒烟测试：用极简 DOM stub 加载 app.js 与全部关卡，验证每个
// level 的 init(panel) 不抛异常，并模拟点击所有按钮与滑杆。

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var assert = require('assert');

// ---------------- 极简 DOM ----------------

function matches(node, sel) {
  if (!node.classList) return false; // 文本节点不匹配任何选择器
  if (sel.charAt(0) === '#') return node.id === sel.slice(1);
  if (sel.charAt(0) === '.') return node.classList.contains(sel.slice(1));
  var typeMatch = sel.match(/^([a-z]+)(?:\[type=([a-z]+)\])?$/i);
  if (typeMatch) {
    if (node.tagName.toLowerCase() !== typeMatch[1]) return false;
    if (typeMatch[2] && node.attributes.type !== typeMatch[2]) return false;
    return true;
  }
  return false;
}

function walk(node, visit) {
  node.children.forEach(function (c) {
    visit(c);
    walk(c, visit);
  });
}

function queryAll(node, sel) {
  var out = [];
  // 仅支持后代选择器（空格分隔）
  var parts = sel.trim().split(/\s+/);
  function find(n, idx) {
    n.children.forEach(function (c) {
      if (matches(c, parts[idx])) {
        if (idx === parts.length - 1) out.push(c);
        else find(c, idx + 1);
      }
      find(c, idx);
    });
  }
  if (parts.length === 1) {
    walk(node, function (c) { if (matches(c, sel)) out.push(c); });
  } else {
    find(node, 0);
  }
  return out;
}

function Element(tag) {
  this.tagName = tag.toUpperCase();
  this.children = [];
  this.parentNode = null;
  this.attributes = {};
  this.listeners = {};
  this.style = {};
  this._textContent = '';
  this._innerHTML = '';
  this.hidden = false;
  this.disabled = false;
  this.checked = false;
  this.value = '';
  this.title = '';
  this.id = '';
  var self = this;
  var classes = [];
  this.classList = {
    add: function (c) { if (classes.indexOf(c) < 0) classes.push(c); },
    remove: function (c) { var i = classes.indexOf(c); if (i >= 0) classes.splice(i, 1); },
    toggle: function (c, force) {
      var has = classes.indexOf(c) >= 0;
      var want = force === undefined ? !has : !!force;
      if (want && !has) classes.push(c);
      if (!want && has) classes.splice(classes.indexOf(c), 1);
    },
    contains: function (c) { return classes.indexOf(c) >= 0; }
  };
  Object.defineProperty(this, 'className', {
    get: function () { return classes.join(' '); },
    set: function (v) { classes.length = 0; String(v).split(/\s+/).forEach(function (c) { if (c) classes.push(c); }); }
  });
  Object.defineProperty(this, 'textContent', {
    get: function () {
      var t = self._textContent;
      self.children.forEach(function (c) { t += c.textContent; });
      return t;
    },
    set: function (v) { self._textContent = String(v); self.children = []; }
  });
  Object.defineProperty(this, 'innerHTML', {
    get: function () { return self._innerHTML; },
    set: function (v) { self._innerHTML = String(v); self.children = []; }
  });
}

Element.prototype.appendChild = function (child) {
  if (typeof child === 'string') child = document.createTextNode(child);
  child.parentNode = this;
  this.children.push(child);
  return child;
};
Element.prototype.setAttribute = function (k, v) {
  this.attributes[k] = String(v);
  if (k === 'id') this.id = String(v);
  if (k === 'type') this.attributes.type = String(v);
};
Element.prototype.getAttribute = function (k) { return this.attributes[k]; };
Element.prototype.addEventListener = function (type, fn) {
  (this.listeners[type] = this.listeners[type] || []).push(fn);
};
Element.prototype.dispatch = function (type) {
  var self = this;
  (this.listeners[type] || []).forEach(function (fn) { fn.call(self, { target: self }); });
};
Element.prototype.click = function () { this.dispatch('click'); };
Element.prototype.querySelector = function (sel) { return queryAll(this, sel)[0] || null; };
Element.prototype.querySelectorAll = function (sel) { return queryAll(this, sel); };

Object.defineProperty(Element.prototype, 'dataset', {
  get: function () {
    var attrs = this.attributes;
    var d = {};
    Object.keys(attrs).forEach(function (k) {
      if (k.indexOf('data-') === 0) {
        var key = k.slice(5).replace(/-([a-z])/g, function (m, c) { return c.toUpperCase(); });
        d[key] = attrs[k];
      }
    });
    return d;
  }
});

function TextNode(text) {
  this.tagName = '#text';
  this.children = [];
  this._textContent = String(text);
}
Object.defineProperty(TextNode.prototype, 'textContent', {
  get: function () { return this._textContent; },
  set: function (v) { this._textContent = String(v); }
});

var documentListeners = {};
var documentElement = new Element('html');
var document = {
  documentElement: documentElement,
  createElement: function (tag) { return new Element(tag); },
  createTextNode: function (t) { return new TextNode(t); },
  addEventListener: function (type, fn) {
    (documentListeners[type] = documentListeners[type] || []).push(fn);
  },
  querySelector: function (sel) { return queryAll(documentRoot, sel)[0] || null; },
  querySelectorAll: function (sel) { return queryAll(documentRoot, sel); }
};

var documentRoot = new Element('body');

var storage = {};
storage['hashteam-theme-v1'] = 'dark';
storage['hashteam-cryptolab-progress-v1'] = JSON.stringify({
  schemaVersion: 1,
  currentLevel: 'unknown-level',
  unlocked: { level00: true, level01: false, 'unknown-level': true },
  solved: { level00: false, 'unknown-level': true }
});
var windowObj = {
  location: { hash: '' },
  scrollTo: function () {},
  console: console,
  localStorage: {
    getItem: function (k) { return k in storage ? storage[k] : null; },
    setItem: function (k, v) { storage[k] = String(v); },
    removeItem: function (k) { delete storage[k]; }
  }
};

var sandbox = {
  window: windowObj,
  document: document,
  console: console,
  Array: Array, Object: Object, String: String, Number: Number, Math: Math,
  Boolean: Boolean, BigInt: BigInt, JSON: JSON, Error: Error, RegExp: RegExp,
  parseInt: parseInt, parseFloat: parseFloat, isNaN: isNaN,
  setTimeout: setTimeout, clearTimeout: clearTimeout,
  encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent,
  escape: escape, unescape: unescape
};
windowObj.CryptoLab = undefined;
vm.createContext(sandbox);

function load(rel) {
  var code = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
  vm.runInContext(code, sandbox, { filename: rel });
}

// ---------------- 加载页面脚本（与 index.html 同序） ----------------

['crypto/english-ngrams.js', 'crypto/core.js', 'crypto/aes.js', 'crypto/rsa.js',
 'levels/level00.js', 'levels/level01.js', 'levels/level02.js',
 'levels/level03.js', 'levels/level04.js', 'levels/level04b.js',
 'levels/level05.js', 'levels/level07.js',
 'levels/sideA.js', 'levels/sideB.js', 'levels/sideC.js',
 'app.js'].forEach(load);

// 提供 index.html 中的骨架元素
['level-map', 'intro', 'level-container'].forEach(function (cls) {
  var div = new Element('div');
  div.className = cls;
  div.id = cls;
  documentRoot.appendChild(div);
});
var startBtn = new Element('button');
startBtn.id = 'btn-start';
documentRoot.appendChild(startBtn);
var themeBtn = new Element('button');
themeBtn.id = 'theme-toggle';
documentRoot.appendChild(themeBtn);
var navToggle = new Element('button');
navToggle.id = 'nav-toggle';
documentRoot.appendChild(navToggle);

// 触发 DOMContentLoaded → app init
(documentListeners.DOMContentLoaded || []).forEach(function (fn) { fn(); });
var CryptoLab = windowObj.CryptoLab;
var core = CryptoLab.core;
var rsa = CryptoLab.rsa;
assert(CryptoLab && CryptoLab.app, 'app.js 应暴露 CryptoLab.app');
assert(CryptoLab.levels, '关卡应注册到 CryptoLab.levels');
assert.strictEqual(documentElement.getAttribute('data-theme'), 'dark', '应复用主站深色主题');
assert.strictEqual(CryptoLab.app.state.currentLevel, null, '未知 currentLevel 应被忽略');
assert.deepStrictEqual(Object.keys(CryptoLab.app.state.unlocked), ['level00'], '未知或非 true 解锁状态应被忽略');
assert.deepStrictEqual(Object.keys(CryptoLab.app.state.solved), [], '未知或非 true 通关状态应被忽略');

var IDS = ['level00', 'level01', 'level02', 'level03', 'sideA', 'level04',
  'level04b', 'sideB', 'level05', 'level07', 'sideC'];

// 解锁链：0→1→2→3→[4,A]，4→4.5，4.5→[5,B]，5→[7,C]，7→C（C 为终点）
// 每关完成后已解锁的导航按钮总数
var EXPECT_UNLOCKED = {
  level00: 2, level01: 3, level02: 4, level03: 6, sideA: 6, level04: 7,
  level04b: 9, sideB: 9, level05: 11, level07: 11, sideC: 11
};

function unlockedCount() {
  return document.querySelectorAll('.level-map__btn')
    .filter(function (b) { return !b.disabled; }).length;
}

var navBtns0 = document.querySelectorAll('.level-map__btn');
assert.strictEqual(navBtns0.length, 11, '导航应有 11 个关卡按钮');
assert.strictEqual(unlockedCount(), 1, '初始只有第 0 关解锁');

// 侧边栏：默认收起，☰ 按钮展开 / 收起，选关后自动收起
var levelMapEl = document.querySelector('.level-map');
assert(!levelMapEl.classList.contains('is-open'), '侧边栏默认应收起');
navToggle.click();
assert(levelMapEl.classList.contains('is-open'), '点击 ☰ 应展开侧边栏');
navToggle.click();
assert(!levelMapEl.classList.contains('is-open'), '再次点击 ☰ 应收起侧边栏');
navToggle.click();
assert(levelMapEl.classList.contains('is-open'), '侧边栏应再次展开');
queryAll(levelMapEl, '.level-map__close')[0].click();
assert(!levelMapEl.classList.contains('is-open'), '侧边栏 ✕ 按钮应收起');

function findByPlaceholder(node, ph) {
  var out = [];
  walk(node, function (c) {
    if (c.tagName === 'INPUT' && c.getAttribute && c.getAttribute('placeholder') === ph) out.push(c);
  });
  return out;
}

function findButtonsByText(node, text) {
  return queryAll(node, 'button').filter(function (b) { return b.textContent === text; });
}

// 在过关谜题卡中填入答案并提交（buildPuzzle 与支线 B 的自定义卡同构）
function submitPuzzle(container, answer) {
  var card = queryAll(container, '.puzzle')[0];
  assert(card, '缺少谜题卡');
  var input = queryAll(card, '.puzzle__input')[0];
  assert(input, '谜题卡缺少输入框');
  input.value = answer;
  findButtonsByText(card, '提交')[0].click();
  return card;
}

// ---------- 各关的过关操作 ----------
var SOLVERS = {
  level00: function (container) { submitPuzzle(container, 'HELLO CRYPTO'); },
  level01: function (container) {
    // 谜题的密文字母与 K 是随机的：从谜题卡题干中取出后计算答案
    var card = queryAll(container, '.puzzle')[0];
    var cipherChar = null, puzzleK = null;
    walk(card, function (c) {
      if (cipherChar || typeof c.innerHTML !== 'string') return;
      var m = c.innerHTML.match(/密文字母 <code>([A-Z])<\/code>，并打听到密钥 <code>🔑 = (\d+)<\/code>/);
      if (m) { cipherChar = m[1]; puzzleK = Number(m[2]); }
    });
    assert(cipherChar, 'level01 谜题应给出随机密文字母与密钥');
    submitPuzzle(container, core.caesarDecrypt(cipherChar, puzzleK));
  },
  level02: function (container) {
    // 谜题给出含花括号的逐字符栅栏密文：枚举层数，以 FLAG{...} 格式为锚点还原
    var card = queryAll(container, '.puzzle')[0];
    var cipher = null;
    walk(card, function (c) {
      if (cipher || typeof c.innerHTML !== 'string') return;
      var m = c.innerHTML.match(/<code>([A-Z{}]+)<\/code>/);
      if (m) cipher = m[1];
    });
    assert(cipher && cipher.indexOf('{') >= 0, 'level02 谜题应给出带花括号的密文');
    var solved = null;
    for (var r = 2; r <= cipher.length; r += 1) {
      var cand = core.railFenceCharsDecrypt(cipher, r);
      if (/^FLAG\{[A-Z]+\}$/.test(cand)) { solved = cand; break; }
    }
    assert(solved, 'level02 枚举应还原出 FLAG{...} 格式');
    submitPuzzle(container, solved.toLowerCase());
    assert(card.classList.contains('puzzle--solved'), 'level02 谜题应被枚举破解');
  },
  level03: function (container) { submitPuzzle(container, 'flag{vigenere}'); },

  sideA: function (container) {
    // 自定义五输入卡：五条 10 字母短密文各自太短、求解器直接拒绝；
    // 玩家路径是用「添加到求解器」把五条同密钥带密文拼进求解器，
    // 填入周期 10（多次一密：周期 = 密钥带长度 = 密文长度）求解，明文每 10 字母一行
    var card = queryAll(container, '.puzzle')[0];
    var solverIn = findByPlaceholder(card, '用下方按钮逐条添加密文')[0];
    var periodIn = queryAll(card, '#sa-solver-period')[0];
    assert(periodIn, 'sideA 求解器应有周期输入框');
    var solverBtn = findButtonsByText(card, '分析')[0];
    var solverOut = queryAll(card, '#sa-solver-out')[0];
    var cipherInfos = [];
    walk(card, function (c) {
      var m = c.tagName === 'P' && c.textContent.match(/^密文 \d = ([A-Z]+)$/);
      if (m) cipherInfos.push({ cipher: m[1] });
    });
    assert.strictEqual(cipherInfos.length, 5, 'sideA 应有五条谜题密文');
    cipherInfos.forEach(function (ci) {
      assert(10 === ci.cipher.length, 'sideA 每条截获密文应为 10 个字母');
    });
    // 单条直接分析应被拒绝
    solverIn.value = cipherInfos[0].cipher;
    solverBtn.click();
    assert(/分析失败/.test(solverOut.textContent), '单条密文太短，求解器应拒绝分析');
    // 逐条「添加到求解器」拼成 50 字母长密文，填周期 10 求解
    var addBtns = findButtonsByText(card, '添加到求解器');
    assert.strictEqual(addBtns.length, 5, 'sideA 每条密文应有「添加到求解器」按钮');
    solverIn.value = '';
    addBtns.forEach(function (b) { b.click(); });
    assert.strictEqual(solverIn.value, cipherInfos.map(function (ci) { return ci.cipher; }).join(''),
      '五个添加按钮应按顺序拼出完整密文');
    periodIn.value = '10';
    solverBtn.click();
    // 输出应每 10 个字母一行，共五行
    var lines = [];
    walk(solverOut, function (c) {
      if (c.tagName === 'P' && /^[A-Z]{10}$/.test(c.textContent)) lines.push(c.textContent);
    });
    assert.strictEqual(lines.length, 5, '求解器应输出五行明文（每 10 个字母一行）');
    var ansIns = queryAll(card, '.puzzle__input');
    assert.strictEqual(ansIns.length, 5, 'sideA 应有五个答案输入框');
    ansIns.forEach(function (inp, i) { inp.value = lines[i]; });
    findButtonsByText(card, '验证').forEach(function (b) { b.click(); });
    ansIns.forEach(function (inp) {
      assert(inp.disabled, 'sideA 答对的输入框应被禁用');
    });
    assert(card.classList.contains('puzzle--solved'), 'sideA 谜题应被拼接求解破解');
  },

  level04: function (container) {
    var btns = findButtonsByText(container, 'y 和 z');
    assert.strictEqual(btns.length, 1, 'level04 应有该选项');
    btns[0].click();
    assert(btns[0].classList.contains('is-correct'), 'level04 正确选项应高亮');
  },

  level04b: function () { /* noPuzzle：loadLevel 时自动过关 */ },

  sideB: function (container) { submitPuzzle(container, '128'); },

  level05: function (container) {
    // 从「改写密文小实验」卡的 html 中取出原密文，改写 SEVEN→THREE 对应的 5 字节
    var hex = null;
    walk(container, function (c) {
      if (hex || typeof c.innerHTML !== 'string') return;
      var m = c.innerHTML.match(/<code>([0-9a-f]{26})<\/code>/);
      if (m) hex = m[1];
    });
    assert(hex, 'level05 应给出原密文十六进制字节');
    var bytes = core.hexToBytes(hex);
    var delta = core.xorBytes(core.textToBytes('SEVEN'), core.textToBytes('THREE'));
    for (var i = 0; i < 5; i += 1) bytes[8 + i] ^= delta[i];
    var card = submitPuzzle(container, core.bytesToHex(bytes));
    assert(card.classList.contains('puzzle--solved'), 'level05 改写密文应被判对');
  },

  sideC: function (container) {
    // 谜题随机生成 200 以内的小素数：从题干解析 n = p × q，计算 φ(n) = (p−1)(q−1)
    var card = queryAll(container, '.puzzle')[0];
    var pq = null;
    walk(card, function (c) {
      if (pq || typeof c.innerHTML !== 'string') return;
      var m = c.innerHTML.match(/(\d+) = (\d+) × (\d+)/);
      if (m) pq = [Number(m[2]), Number(m[3])];
    });
    assert(pq, 'sideC 谜题应给出随机分解 n = p × q');
    assert(rsa.isPrime(pq[0]) && rsa.isPrime(pq[1]), 'sideC 谜题两个因子应都是素数');
    assert(pq[0] < 200 && pq[1] < 200, 'sideC 谜题素数应在 200 以内');
    assert.notStrictEqual(pq[0], pq[1], 'sideC 谜题两个素数应不同');
    submitPuzzle(container, String((pq[0] - 1) * (pq[1] - 1)));
  },

  level07: function (container) {
    // 复制按钮存在（4 个密文 + 3 个明文）；无头环境没有剪贴板，
    // 直接从「攻击者截获的数据」各行的十六进制文本取值，模拟复制-粘贴进计算器
    var copyC = findButtonsByText(container, '复制密文（十六进制）');
    var copyP = findButtonsByText(container, '复制明文（十六进制）');
    assert.strictEqual(copyC.length, 4, 'level07 应有 4 个复制密文按钮');
    assert.strictEqual(copyP.length, 3, 'level07 应有 3 个复制明文按钮');
    function hexOf(rowTitle, prefix) {
      var hex = null;
      walk(container, function (row) {
        if (hex || !row.classList || !row.classList.contains('card--flat')) return;
        var title = row.querySelector('strong');
        if (!title || title.textContent.indexOf(rowTitle) !== 0) return;
        walk(row, function (p) {
          if (hex || p.tagName !== 'P') return;
          if (p.textContent.indexOf(prefix) === 0) hex = p.textContent.slice(prefix.length);
        });
      });
      assert(hex, 'level07 应能从「' + rowTitle + '」行读出 ' + prefix.trim());
      return hex;
    }
    var in1 = findByPlaceholder(container, '第一段十六进制字节')[0];
    var in2 = findByPlaceholder(container, '第二段十六进制字节')[0];
    var calcBtn = findButtonsByText(container, '⊕ 计算')[0];
    // 第 1 步：消息 2 的明文 ⊕ 密文 = 密钥流 S₂
    in1.value = hexOf('消息 2', '密文（十六进制）');
    in2.value = hexOf('消息 2', '明文（十六进制）');
    calcBtn.click();
    var calcOut = queryAll(container, '.demo-line')[0];
    var m = calcOut.textContent.match(/^([0-9a-f]{32})/);
    assert(m, '第 1 步应算出 S₂');
    var s2 = m[1];
    // 第 2 步：flag 密文 ⊕ S₂ = flag 明文
    in1.value = hexOf('flag 消息', '密文（十六进制）');
    in2.value = s2;
    calcBtn.click();
    var flagInput = findByPlaceholder(container, 'FLAG{...}')[0];
    assert(flagInput, '第 2 步后应出现 flag 提交框');
    flagInput.value = 'FLAG{CTR_PLUS_1}';
    findButtonsByText(container, '提交')[0].click();
    assert(queryAll(container, '.win-banner').length === 1, 'level07 应出现通关横幅');
  }
};

// ---------- 逐关加载、乱点、过关 ----------
IDS.forEach(function (id) {
  assert(CryptoLab.levels[id], id + ' 未注册');
  CryptoLab.app.loadLevel(id);
  var savedProgress = JSON.parse(storage['hashteam-cryptolab-progress-v1']);
  assert.strictEqual(savedProgress.schemaVersion, 1, '进度 schemaVersion 应为 1');
  assert.strictEqual(savedProgress.currentLevel, id, '进度应记录当前关卡');
  assert(!Object.prototype.hasOwnProperty.call(savedProgress.unlocked, 'unknown-level'),
    '保存时不应保留未知关卡');
  var container = document.querySelector('#level-container');
  assert(container.children.length > 0, id + ' 应有内容');

  // 模拟点击关卡内所有按钮（跳过过关后才出现的跳转按钮与重玩/重置工具按钮，否则会中途跳关或清空进度）、拨动所有滑杆若干次
  var clickable = function () {
    return queryAll(container, 'button').filter(function (b) {
      return !b.classList.contains('next-level-btn') && !b.classList.contains('level-tool-btn');
    });
  };
  clickable().forEach(function (b) { b.click(); });
  queryAll(container, 'input[type=range]').forEach(function (s) {
    ['2', '3', '5', '27'].forEach(function (v) {
      s.value = v;
      s.dispatch('input');
    });
  });
  clickable().forEach(function (b) { b.click(); });
  queryAll(container, 'input[type=checkbox]').forEach(function (c) {
    c.checked = true;
    c.dispatch('change');
  });

  // 每关都应渲染两类信息带，且不再有「教学透视」带；
  // 除第 1、4 关外每关都应有带走一句话（第 1 关的结论并入攻击者穷举判定语，第 4 关不设总结）
  assert.strictEqual(queryAll(container, '.info-band--public').length, 1, id + ' 缺少公开信息带');
  assert.strictEqual(queryAll(container, '.info-band--secret').length, 1, id + ' 缺少秘密信息带');
  assert.strictEqual(queryAll(container, '.info-band--teach').length, 0, id + ' 不应再有教学透视信息带');
  if (id === 'level01' || id === 'level04') {
    assert.strictEqual(queryAll(container, '.takeaway').length, 0, id + ' 不应再有 takeaway');
  } else {
    assert(queryAll(container, '.takeaway').length >= 1, id + ' 缺少带走一句话');
  }

  // 解开本关谜题（noPuzzle 关自动过关），并断言解锁数量
  SOLVERS[id](container);
  assert.strictEqual(unlockedCount(), EXPECT_UNLOCKED[id],
    id + ' 过关后解锁数应为 ' + EXPECT_UNLOCKED[id]);
  // 过关后应出现「下一关」按钮（链条末端除外）
  var nexts = queryAll(container, '.next-level-btn');
  var expectNext = { level00: 1, level01: 1, level02: 1, level03: 2, sideA: 1,
    level04: 1, level04b: 2, sideB: 1, level05: 2, level07: 1, sideC: 0 };
  assert.strictEqual(nexts.length, expectNext[id], id + ' 下一关按钮数不对');
  console.log('冒烟通过：' + id);
});

// 全部访问一遍后，所有关卡应已解锁
assert.strictEqual(unlockedCount(), 11, '全部访问后应全部解锁');

// 跳转按钮的两个边界：
// 1) 支线 C 先于第 7 关完成时，过关 C 应给出跳回第 7 关的按钮；第 7 关已过后则没有
delete CryptoLab.app.state.solved.level07;
CryptoLab.app.loadLevel('sideC');
assert.strictEqual(
  findButtonsByText(document.querySelector('#level-container'), '继续主线：第 7 关 · 终极挑战 →').length,
  1, '第 7 关未通过时，支线 C 应给出跳回第 7 关的按钮');
CryptoLab.app.state.solved.level07 = true;
CryptoLab.app.loadLevel('sideC');
assert.strictEqual(queryAll(document.querySelector('#level-container'), '.next-level-btn').length, 0,
  '第 7 关已通过时，终点支线 C 不应再有跳转按钮');
// 2) 已通关的第 7 关重复访问时，应直接补出「进入支线 C」按钮
CryptoLab.app.loadLevel('level07');
assert.strictEqual(
  findButtonsByText(document.querySelector('#level-container'), '进入支线 C · RSA 与量子 →').length,
  1, '已通关的第 7 关重复访问时应补出进入支线 C 的按钮');

// 已解决的关重复访问：谜题卡应显示已通过，且不报错
IDS.forEach(function (id) { CryptoLab.app.loadLevel(id); });

// 从关卡地图按钮进入也要正常
queryAll(documentRoot, '.level-map__btn').forEach(function (b) { b.click(); });

// ---------- 关卡工具：重玩本关 / 重置所有进度 ----------
CryptoLab.app.loadLevel('level00');
var toolContainer = document.querySelector('#level-container');
var replayBtn = findButtonsByText(toolContainer, '↻ 重玩本关')[0];
assert(replayBtn, 'level00 应有「重玩本关」按钮');
replayBtn.click();
toolContainer = document.querySelector('#level-container');
assert.strictEqual(queryAll(toolContainer, '.puzzle__input').length, 1, '重玩后谜题应可重新作答');
assert.strictEqual(unlockedCount(), 11, '重玩不应影响已解锁的关卡');

var resetBtn = findButtonsByText(document.querySelector('.level-map'), '🗑 重置所有进度')[0];
assert(resetBtn, '关卡导航侧边栏应有「重置所有进度」按钮');
resetBtn.click();
assert.strictEqual(unlockedCount(), 1, '重置后应只剩第 0 关解锁');
assert.strictEqual(document.querySelector('#intro').hidden, false, '重置后应回到介绍页');
assert.deepStrictEqual(JSON.parse(storage['hashteam-cryptolab-progress-v1']), {
  schemaVersion: 1,
  currentLevel: null,
  unlocked: { level00: true },
  solved: {}
}, '重置后应保存完整的初始进度 schema');
CryptoLab.app.loadLevel('level00');
assert.strictEqual(queryAll(document.querySelector('#level-container'), '.puzzle__input').length, 1,
  '重置后第 0 关谜题应可重新作答');

console.log('smoke-test.js: 全部通过（11 个关卡 init + 谜题作答 + 解锁链 + 两类信息带 + 全按钮/滑杆事件无异常 + 重玩/重置）');
