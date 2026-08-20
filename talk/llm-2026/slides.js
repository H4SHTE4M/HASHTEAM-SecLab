/* 《一个会猜下一个词的机器》新生分享 · 运行时
   职责：Reveal 初始化、输入法打字动画、token 生成动画、QR 生成、链接统一配置。 */
(function () {
  'use strict'

  /* ---------- 统一配置：实验室公网地址 ---------- */
  var LAB_URL = 'https://lab.lwzheng.tech'

  document.documentElement.classList.add('js')

  var PRINT_MODE = /print-pdf/i.test(window.location.search)
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  var STATIC = PRINT_MODE || REDUCED
if (STATIC) document.documentElement.classList.add('static-mode')

  /* ---------- 链接与二维码 ---------- */
  function fillLinks() {
    var nodes = document.querySelectorAll('.js-lab-url')
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = LAB_URL.replace(/^https?:\/\//, '')
  }

  function renderQrcodes() {
    if (typeof window.qrcode !== 'function') return
    var boxes = document.querySelectorAll('.qr')
    for (var i = 0; i < boxes.length; i++) {
      try {
        var qr = window.qrcode(0, 'M')
        qr.addData(LAB_URL)
        qr.make()
        boxes[i].innerHTML = qr.createSvgTag(6, 2)
      } catch (err) {
        boxes[i].textContent = LAB_URL
      }
    }
  }

  /* ---------- 通用逐字动画 ----------
     .typewrite[data-text]  进入所在页时逐字打出 data-text
     无 JS、打印导出、系统减弱动效时：直接显示全文。 */
  var runToken = 0
  var timers = []

  function later(fn, ms) {
    var id = window.setTimeout(fn, ms)
    timers.push(id)
  }

  function cancelRun() {
    runToken += 1
    for (var i = 0; i < timers.length; i++) window.clearTimeout(timers[i])
    timers = []
  }

  function escapeHtml(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  /* ---------- 输入法动画 ----------
     .phone[data-ime] 内：
       .screen .typed   逐字出现的已输入文字
       .imebar          候选栏，打完字后弹出 */
  function playPhone(phone, token) {
    var typed = phone.querySelector('.typed')
    var bar = phone.querySelector('.imebar')
    if (!typed) return
    if (!typed.dataset.text) typed.dataset.text = typed.textContent.trim()
    var full = typed.dataset.text

    if (STATIC) {
      typed.textContent = full
      if (bar) bar.classList.add('on')
      return
    }
    typed.textContent = ''
    if (bar) bar.classList.remove('on')

    var i = 0
    function tick() {
      if (token !== runToken) return
      if (i < full.length) {
        typed.textContent = full.slice(0, ++i)
        later(tick, 320)
      } else if (bar) {
        later(function () { if (token === runToken) bar.classList.add('on') }, 420)
      }
    }
    later(tick, 500)
  }

  /* ---------- Transformer 简化动画 ----------
     手动分步演示:Tokenizer -> token/位置向量 -> Self-Attention + FFN -> 词表概率 -> 接回上下文。
     注意力强弱与概率都是教学示意,不冒充真实模型测量值。 */
  function playTransformer(box, token) {
    var seq = box.querySelector('.tf-seq-tokens')
    var raw = box.querySelector('.tf-raw-text')
    var vectors = box.querySelector('.tf-vector-list')
    var attention = box.querySelector('.tf-attn-list')
    var probs = box.querySelector('.tf-prob-list')
    var picked = box.querySelector('.tf-picked strong')
    var output = box.querySelector('.tf-output strong')
    var cycle = box.querySelector('.tf-cycle')
    var nextButton = box.querySelector('.tf-next')
    var resetButton = box.querySelector('.tf-reset')
    var stepLabel = box.querySelector('.tf-step-label')
    if (!seq || !raw || !vectors || !attention || !probs || !picked || !output || !cycle || !nextButton || !resetButton || !stepLabel) return

    var base = ['山东', '大学', '位于']
    var generated = []
    var phases = ['phase-tokenize', 'phase-input', 'phase-attention', 'phase-predict', 'phase-picked']
    var rounds = [
      {
        next: '济',
        attention: [['山东', 88], ['大学', 48], ['位于', 72]],
        probs: [['济', 64], ['青', 12], ['北', 8], ['其他', 16]],
      },
      {
        next: '南',
        attention: [['大学', 35], ['位于', 66], ['济', 95]],
        probs: [['南', 79], ['宁', 8], ['州', 5], ['其他', 8]],
      },
      {
        next: '市',
        attention: [['位于', 34], ['济', 76], ['南', 96]],
        probs: [['市', 71], ['校', 11], ['省', 7], ['其他', 11]],
      },
    ]

    function setPhase(name) {
      for (var i = 0; i < phases.length; i++) box.classList.remove(phases[i])
      if (name) box.classList.add(name)
    }

    function renderSequence(tokens, newest) {
      var html = ''
      for (var i = 0; i < tokens.length; i++) {
        var generatedClass = i >= base.length ? ' is-generated' : ''
        var newestClass = newest && i === tokens.length - 1 ? ' is-new' : ''
        html += '<span class="tf-token' + generatedClass + newestClass + '">' + escapeHtml(tokens[i]) + '</span>'
      }
      seq.innerHTML = html
      raw.textContent = tokens.join('')
      output.textContent = raw.textContent
    }

    function renderVectors(tokens) {
      var html = ''
      var visibleTokens = tokens.slice(-4)
      for (var i = 0; i < visibleTokens.length; i++) {
        html += '<div class="tf-vector-row"><span>' + escapeHtml(visibleTokens[i]) + '</span>'
        var code = visibleTokens[i].charCodeAt(0)
        for (var j = 0; j < 5; j++) {
          var opacity = (0.3 + ((code + i * 11 + j * 7) % 8) * 0.09).toFixed(2)
          html += '<i style="--o:' + opacity + '"></i>'
        }
        html += '</div>'
      }
      vectors.innerHTML = html
    }

    function renderAttention(items) {
      var html = ''
      for (var i = 0; i < items.length; i++) {
        html += '<div class="tf-attn-row"><span>' + escapeHtml(items[i][0]) + '</span>' +
          '<div class="tf-attn-track"><div class="tf-attn-fill" style="--weight:' + items[i][1] + '%"></div></div></div>'
      }
      attention.innerHTML = html
    }

    function renderProbabilities(items) {
      var html = ''
      for (var i = 0; i < items.length; i++) {
        html += '<div class="tf-prob-row"><b>' + escapeHtml(items[i][0]) + '</b>' +
          '<div class="tf-prob-track"><div class="tf-prob-fill" style="--prob:' + items[i][1] + '%"></div></div>' +
          '<span>' + items[i][1] + '%</span></div>'
      }
      probs.innerHTML = html
    }

    function renderRound(round) {
      var context = base.concat(generated)
      renderSequence(context, false)
      renderVectors(context)
      renderAttention(round.attention)
      renderProbabilities(round.probs)
      picked.textContent = '—'
      cycle.textContent = '接回去，再算一轮'
      setPhase('phase-tokenize')
    }

    function finishRound(round) {
      generated.push(round.next)
      renderSequence(base.concat(generated), true)
      picked.textContent = round.next
      setPhase('phase-picked')
    }

    function updateControls(status, nextText, disabled) {
      stepLabel.textContent = status
      nextButton.textContent = nextText
      nextButton.disabled = !!disabled
    }

    var roundIndex = 0
    var phaseIndex = -1

    function resetManual() {
      generated = []
      roundIndex = 0
      phaseIndex = -1
      box.classList.remove('is-complete')
      renderRound(rounds[0])
      setPhase(null)
      updateControls('等待手动演示', '开始演示', false)
    }

    function advanceManual() {
      var round = rounds[roundIndex]

      if (phaseIndex < 0) {
        phaseIndex = 0
        setPhase('phase-tokenize')
        updateControls('01 · 文本切成 token', '显示 Token 与位置', false)
        return
      }
      if (phaseIndex === 0) {
        phaseIndex = 1
        setPhase('phase-input')
        updateControls('02 · 加入向量与位置', '计算注意力', false)
        return
      }
      if (phaseIndex === 1) {
        phaseIndex = 2
        setPhase('phase-attention')
        updateControls('03 · 汇总上下文', '计算词表概率', false)
        return
      }
      if (phaseIndex === 2) {
        phaseIndex = 3
        setPhase('phase-predict')
        updateControls('04 · 得到词表概率', '选中并接回', false)
        return
      }
      if (phaseIndex === 3) {
        phaseIndex = 4
        finishRound(round)
        if (roundIndex === rounds.length - 1) {
          box.classList.add('is-complete')
          cycle.textContent = '新 token 已接回上下文 · 循环继续…'
          updateControls('演示完成 · 生成“济南市”', '演示完成', true)
        } else {
          updateControls('已选中“' + round.next + '”并接回', '继续下一轮', false)
        }
        return
      }

      roundIndex += 1
      phaseIndex = 0
      renderRound(rounds[roundIndex])
      updateControls('01 · 文本切成 token', '显示 Token 与位置', false)
    }

    box.classList.remove('is-complete')
    if (STATIC) {
      generated = ['济', '南']
      renderRound(rounds[2])
      finishRound(rounds[2])
      box.classList.add('is-complete')
      cycle.textContent = '新 token 已接回上下文 · 循环继续…'
      return
    }

    nextButton.onclick = function (ev) {
      ev.stopPropagation()
      advanceManual()
    }
    resetButton.onclick = function (ev) {
      ev.stopPropagation()
      resetManual()
    }
    resetManual()
  }


  /* ---------- 进入页面时播放该页动画 ---------- */
  function playCurrentSlide() {
    cancelRun()
    var token = runToken
    var slide = window.Reveal.getCurrentSlide()
    if (!slide) return

    var phones = slide.querySelectorAll('.phone[data-ime]')
    for (var i = 0; i < phones.length; i++) playPhone(phones[i], token)

    var transformers = slide.querySelectorAll('.transformer-demo[data-transformer]')
    for (var j = 0; j < transformers.length; j++) playTransformer(transformers[j], token)
  }

  /* ---------- 启动 ---------- */
  fillLinks()
  renderQrcodes()

  var plugins = []
  if (window.RevealNotes) plugins.push(window.RevealNotes)

  window.Reveal.initialize({
    width: 1280,
    height: 720,
    margin: 0.05,
    minScale: 0.2,
    maxScale: 2.2,
    center: true,
    hash: true,
    progress: true,
    slideNumber: 'c/t',
    transition: 'slide',
    transitionSpeed: 'default',
    backgroundTransition: 'none',
    controlsTutorial: false,
    plugins: plugins,
  }).then(function () { boot() })

  /* 这份 vendor 构建里 ready 事件/then 可能静默不触发,双通道启动,幂等 */
  var booted = false
  function boot() {
    if (booted) return
    booted = true

    if (STATIC) {
      /* 打印/减弱动效:全部页的动画元素直接渲染终态,不等翻到 */
      var allTransformers = document.querySelectorAll('.transformer-demo[data-transformer]')
      for (var ti = 0; ti < allTransformers.length; ti++) playTransformer(allTransformers[ti], runToken)
      var allPhones = document.querySelectorAll('.phone[data-ime]')
      for (var pi = 0; pi < allPhones.length; pi++) playPhone(allPhones[pi], runToken)
    }

    window.Reveal.on('slidechanged', playCurrentSlide)
  }
  if (window.Reveal.isReady && window.Reveal.isReady()) boot()
  else {
    window.Reveal.on('ready', boot)
    var bootTimer = window.setInterval(function () {
      if (window.Reveal.isReady && window.Reveal.isReady()) {
        boot()
        window.clearInterval(bootTimer)
      }
    }, 200)
    window.setTimeout(function () { window.clearInterval(bootTimer) }, 15000)
  }
})()

