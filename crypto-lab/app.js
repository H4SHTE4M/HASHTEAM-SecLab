(function () {
  'use strict';

  var CryptoLab = window.CryptoLab = window.CryptoLab || {};

  // 关卡顺序：主线与支线穿插。第 6 关已删除（公钥概念并入支线 C）。
  var levels = [
    { id: 'level00', label: '0', title: '一条被截获的消息', type: 'main' },
    { id: 'level01', label: '1', title: 'Caesar', type: 'main' },
    { id: 'level02', label: '2', title: '栅栏密码', type: 'main' },
    { id: 'level03', label: '3', title: 'Vigenere', type: 'main' },
    { id: 'sideA', label: 'A', title: '一次一密', type: 'side' },
    { id: 'level04', label: '4', title: 'XOR', type: 'main' },
    { id: 'level04b', label: '4.5', title: '现代分组密码', type: 'main', noPuzzle: true },
    { id: 'sideB', label: 'B', title: 'AES 雪崩', type: 'side' },
    { id: 'level05', label: '5', title: 'AES-CTR', type: 'main' },
    { id: 'level07', label: '7', title: '终极挑战', type: 'main' },
    { id: 'sideC', label: 'C', title: 'RSA 与量子', type: 'side' }
  ];

  var knownLevelIds = {};
  levels.forEach(function (level) { knownLevelIds[level.id] = true; });

  // 解锁规则：过关谜题通过后解锁哪些关。
  // 支线不解锁新关，但给出回到主线的跳转按钮（sideB → 第 5 关已有先例）：
  // sideA 在第 3 关后解锁，主线继续第 4 关；sideC 仍在第 5 关后解锁，
  // 但顺序上排在第 7 关之后（5 → 7 → C），由第 7 关的过关按钮跳入；
  // C 为终点，若先于第 7 关完成则给出跳回第 7 关的按钮（见 finishLevel）
  var UNLOCKS = {
    level00: ['level01'],
    level01: ['level02'],
    level02: ['level03'],
    level03: ['level04', 'sideA'],
    sideA: ['level04'],
    level04: ['level04b'],
    level04b: ['level05', 'sideB'],
    sideB: ['level05'],
    level05: ['level07', 'sideC'],
    level07: ['sideC'],
    sideC: []
  };

  var PROGRESS_KEY = 'hashteam-cryptolab-progress-v1';
  var THEME_KEY = 'hashteam-theme-v1';

  var state = {
    currentLevel: null,
    unlocked: { level00: true },
    solved: {}
  };

  function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function isKnownLevelId(value) {
    return typeof value === 'string' &&
      Object.prototype.hasOwnProperty.call(knownLevelIds, value);
  }

  function knownFlags(value) {
    var result = {};
    if (!isRecord(value)) return result;
    Object.keys(value).forEach(function (id) {
      if (isKnownLevelId(id) && value[id] === true) result[id] = true;
    });
    return result;
  }

  function loadProgress() {
    try {
      var saved = JSON.parse(window.localStorage.getItem(PROGRESS_KEY) || '{}');
      if (isRecord(saved) && saved.schemaVersion === 1) {
        state.unlocked = knownFlags(saved.unlocked);
        state.solved = knownFlags(saved.solved);
        state.unlocked.level00 = true;
        if (isKnownLevelId(saved.currentLevel) && state.unlocked[saved.currentLevel]) {
          state.currentLevel = saved.currentLevel;
        }
      }
    } catch (e) { /* 忽略损坏的存档 */ }
    state.unlocked.level00 = true;
  }

  function saveProgress() {
    try {
      var unlocked = knownFlags(state.unlocked);
      unlocked.level00 = true;
      window.localStorage.setItem(PROGRESS_KEY, JSON.stringify({
        schemaVersion: 1,
        currentLevel: isKnownLevelId(state.currentLevel) ? state.currentLevel : null,
        unlocked: unlocked,
        solved: knownFlags(state.solved)
      }));
    } catch (e) { /* localStorage 不可用时静默 */ }
  }

  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.from(document.querySelectorAll(sel)); }
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'className') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    if (children) {
      children.forEach(function (c) {
        if (c == null) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return node;
  }

  // ---------- 浅色 / 深色主题 ----------

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var btn = $('#theme-toggle');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  function initTheme() {
    var saved = null;
    try { saved = window.localStorage.getItem(THEME_KEY); } catch (e) { /* 忽略 */ }
    applyTheme(saved === 'dark' ? 'dark' : 'light');
    var btn = $('#theme-toggle');
    if (btn) {
      btn.addEventListener('click', function () {
        var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        try { window.localStorage.setItem(THEME_KEY, next); } catch (e) { /* 忽略 */ }
      });
    }
  }

  // ---------- 关卡导航（可展开 / 收起的侧边栏） ----------

  function toggleNav(force) {
    var nav = $('.level-map');
    if (nav) nav.classList.toggle('is-open', force);
  }

  function renderLevelMap() {
    var nav = $('.level-map');
    nav.innerHTML = '';

    var closeBtn = el('button', { className: 'btn level-map__close', text: '✕' });
    closeBtn.addEventListener('click', function () { toggleNav(false); });
    nav.appendChild(el('div', { className: 'level-map__head' }, [
      el('strong', { text: '关卡导航' }),
      closeBtn
    ]));

    levels.forEach(function (lvl) {
      var btn = el('button', {
        className: 'level-map__btn' + (lvl.type === 'side' ? ' is-side' : ''),
        'data-level': lvl.id,
        text: lvl.label + ' · ' + lvl.title
      });
      btn.title = lvl.title;
      btn.addEventListener('click', function () {
        if (state.unlocked[lvl.id]) {
          toggleNav(false); // 选关后自动收起侧边栏
          loadLevel(lvl.id);
        }
      });
      nav.appendChild(btn);
    });

    // 「重置所有进度」收在关卡导航底部
    var resetBtn = el('button', { className: 'btn level-map__reset', text: '🗑 重置所有进度' });
    resetBtn.addEventListener('click', resetProgress);
    nav.appendChild(resetBtn);

    updateLevelMap(state.currentLevel);
  }

  function updateLevelMap(activeId) {
    $$('.level-map__btn').forEach(function (btn) {
      var id = btn.dataset.level;
      btn.classList.toggle('is-active', id === activeId);
      var locked = !state.unlocked[id];
      btn.disabled = locked;
      btn.classList.toggle('is-locked', locked);
      btn.title = locked ? '未解锁：先通过前面的关卡' : levels.find(function (l) { return l.id === id; }).title;
    });
  }

  // ---------- 信息带（公开 / 秘密 两类） ----------

  function buildInfoBands(publicItems, secretItems) {
    function band(cls, label, items) {
      return el('div', { className: 'info-band info-band--' + cls }, [
        el('span', { className: 'info-band__label', text: label }),
        el('div', { text: items.join('、') || '无' })
      ]);
    }
    return el('div', { className: 'info-bands' }, [
      band('public', '公开 / 攻击者可见', publicItems),
      band('secret', '秘密 / 持有者可见', secretItems)
    ]);
  }

  function buildTakeaway(quote, nextQuestion) {
    var children = [el('blockquote', { text: quote })];
    if (nextQuestion) {
      children.push(el('p', { className: 'muted mt-1', html: '<strong>下一关问题：</strong>' + nextQuestion }));
    }
    return el('section', { className: 'takeaway' }, children);
  }

  // ---------- 过关与跳转 ----------

  function levelOf(id) {
    return levels.find(function (l) { return l.id === id; });
  }

  // 重玩本关：清除本关的过关记录并重新加载（不影响已解锁的关卡）
  function replayLevel(id) {
    delete state.solved[id];
    saveProgress();
    loadLevel(id);
  }

  // 重置所有进度：清空存档，回到只解锁第 0 关的初始状态
  function resetProgress() {
    if (typeof window.confirm === 'function' &&
        !window.confirm('确定要清空全部进度、回到第 0 关吗？')) return;
    state.unlocked = { level00: true };
    state.solved = {};
    state.currentLevel = null;
    saveProgress();
    updateLevelMap(null);
    $('#intro').hidden = false;
    var container = $('#level-container');
    container.hidden = true;
    container.innerHTML = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // 过关：解锁后续关卡并在 panel 末尾放跳转按钮
  function finishLevel(id, panel) {
    state.solved[id] = true;
    var nextIds = UNLOCKS[id] || [];
    // 支线 C 是终点（UNLOCKS 为空）；若它先于第 7 关完成，仍给出跳回第 7 关的按钮
    if (id === 'sideC' && !state.solved.level07) nextIds = ['level07'];
    nextIds.forEach(function (nextId) { state.unlocked[nextId] = true; });
    saveProgress();
    updateLevelMap(state.currentLevel);

    if (!nextIds.length || panel.querySelector('.next-level')) return;
    var row = el('div', { className: 'next-level' });
    nextIds.forEach(function (nextId) {
      var next = levelOf(nextId);
      var btn = el('button', {
        className: 'btn btn--primary next-level-btn',
        text: (next.type === 'side' ? '进入支线 ' + next.label : '继续主线：第 ' + next.label + ' 关') +
          ' · ' + next.title + ' →'
      });
      btn.addEventListener('click', function () { loadLevel(nextId); });
      row.appendChild(btn);
    });
    panel.appendChild(row);
  }

  // 统一的过关谜题面板：check(answer) 返回 true 即过关。
  // cfg: { question(html), placeholder, check, solvedText, normalize?,
  //        wrongText?（固定字符串，或 (answer) => 字符串 的动态提示） }
  function buildPuzzle(panel, cfg) {
    var id = state.currentLevel;
    var card = el('div', { className: 'card puzzle' });
    card.appendChild(el('h3', { text: '🧩 过关谜题' }));
    card.appendChild(el('div', { html: cfg.question }));

    if (state.solved[id]) {
      card.appendChild(el('p', { className: 'puzzle__solved', html: '✅ ' + (cfg.solvedText || '已通过') }));
      panel.appendChild(card);
      finishLevel(id, panel);
      return card;
    }

    var input = el('input', { className: 'input mono puzzle__input', type: 'text', placeholder: cfg.placeholder || '输入答案' });
    var submit = el('button', { className: 'btn btn--primary', text: '提交' });
    var verdict = el('p', { className: 'muted mt-1' });
    submit.addEventListener('click', function () {
      var answer = input.value;
      if (cfg.normalize) answer = cfg.normalize(answer);
      if (cfg.check(answer)) {
        card.classList.add('puzzle--solved');
        verdict.innerHTML = '✅ ' + (cfg.solvedText || '回答正确，过关！');
        input.disabled = true;
        submit.disabled = true;
        finishLevel(id, panel);
      } else {
        verdict.textContent = typeof cfg.wrongText === 'function'
          ? cfg.wrongText(answer)
          : (cfg.wrongText || '还不对，再想想。');
      }
    });
    input.addEventListener('keydown', function (e) {
      if (e && e.key === 'Enter') submit.click();
    });
    card.appendChild(el('div', { className: 'flex gap-1 puzzle__row' }, [input, submit]));
    card.appendChild(verdict);
    panel.appendChild(card);
    return card;
  }

  // ---------- 加载关卡 ----------

  function loadLevel(id) {
    var lvl = levelOf(id);
    if (!lvl || !CryptoLab.levels || !CryptoLab.levels[id]) {
      console.warn('Level not registered:', id);
      return;
    }

    state.currentLevel = id;
    saveProgress();
    updateLevelMap(id);

    $('#intro').hidden = true;
    var container = $('#level-container');
    container.hidden = false;
    container.innerHTML = '';
    window.location.hash = lvl.label;

    // 「重玩本关」与关卡标题同行，靠右对齐
    var replayBtn = el('button', { className: 'btn level-tool-btn', text: '↻ 重玩本关' });
    replayBtn.addEventListener('click', function () { replayLevel(id); });
    var header = el('header', { className: 'level-header' }, [
      el('div', { className: 'level-header__row' }, [
        el('h2', { text: '第 ' + lvl.label + ' 关 · ' + lvl.title }),
        replayBtn
      ]),
      el('p', { className: 'level-header__subtitle', text: lvl.type === 'side' ? '可选支线' : '主线' })
    ]);
    container.appendChild(header);

    var panel = el('div', { className: 'level-panel', id: 'level-panel-' + id });
    container.appendChild(panel);

    try {
      CryptoLab.levels[id].init(panel);
    } catch (err) {
      panel.appendChild(el('div', { className: 'card', html: '<strong>关卡加载出错：</strong> ' + (err && err.message) }));
      console.error(err);
    }

    // 免谜题的介绍章：访问即完成
    if (lvl.noPuzzle) finishLevel(id, panel);

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function init() {
    loadProgress();
    initTheme();
    renderLevelMap();

    var navToggle = $('#nav-toggle');
    if (navToggle) {
      navToggle.addEventListener('click', function () { toggleNav(); });
    }

    $('#btn-start').addEventListener('click', function () {
      loadLevel('level00');
    });

    // Expose shared helpers
    CryptoLab.app = {
      levels: levels,
      loadLevel: loadLevel,
      state: state,
      buildInfoBands: buildInfoBands,
      buildTakeaway: buildTakeaway,
      buildPuzzle: buildPuzzle,
      finishLevel: finishLevel,
      $: $,
      $$: $$,
      el: el
    };

    // Auto-start if hash present: support both level id (#level05) and level label (#5, #A, #4.5)
    function resolveLevelId(hash) {
      if (!hash) return null;
      if (levels.some(function (l) { return l.id === hash; })) return hash;
      var byLabel = levels.find(function (l) { return l.label === hash; });
      return byLabel ? byLabel.id : null;
    }
    var hash = window.location.hash.replace(/^#/, '');
    var targetId = resolveLevelId(hash);
    if (targetId && state.unlocked[targetId]) {
      loadLevel(targetId);
    } else if (!hash && state.currentLevel && state.unlocked[state.currentLevel]) {
      loadLevel(state.currentLevel);
    }
    // locked or unknown hash: keep the intro page visible
  }

  document.addEventListener('DOMContentLoaded', init);
})();
