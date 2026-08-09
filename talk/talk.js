/* 《电脑的另一层》新生分享 · 运行时
   职责：Reveal 初始化、终端逐字动画、QR 生成、链接统一配置。 */
(function () {
  'use strict'

  /* ---------- 统一配置：实验室公网地址（CDN） ---------- */
  var LAB_URL = 'https://lab.lwzheng.tech'

  document.documentElement.classList.add('js')

  var PRINT_MODE = /print-pdf/i.test(window.location.search)
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  /* ---------- 链接与二维码 ---------- */
  function fillLinks() {
    var nodes = document.querySelectorAll('.js-lab-url')
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = LAB_URL
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

  /* ---------- 终端逐字动画 ----------
     标记约定：
       .term[data-autoplay]  进入所在页时自动播放
       .term-body > .t-cmd   一条命令（内容会被逐字打出）
       .term-body > .t-out   命令输出（整段淡入；.t-hl 重点行 / .t-ok 成功行）
     无 JS、打印导出、系统减弱动效时：全部静态完整显示。 */
  var PROMPT = '<span class="t-prompt"><span class="u">guest@hashteam</span>:' +
    '<span class="p">~</span> <span class="s">$</span></span> '

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

  function renderStatic(term) {
    var outs = term.querySelectorAll('.t-out')
    for (var i = 0; i < outs.length; i++) outs[i].classList.add('shown')
  }

  function play(term, token) {
    var body = term.querySelector('.term-body')
    if (!body) return
    var steps = Array.prototype.slice.call(body.querySelectorAll('.t-cmd, .t-out'))

    // 复位：命令清空、输出隐藏、移除上次的空闲提示符
    steps.forEach(function (el) {
      if (el.classList.contains('t-cmd')) {
        if (!el.dataset.text) el.dataset.text = el.textContent.trim()
        el.innerHTML = ''
      } else {
        el.classList.remove('shown')
      }
    })
    var idles = body.querySelectorAll('.t-idle')
    for (var k = 0; k < idles.length; k++) idles[k].remove()

    var t = 260
    steps.forEach(function (el) {
      if (el.classList.contains('t-cmd')) {
        var text = el.dataset.text
        later(function () {
          if (token !== runToken) return
          el.innerHTML = PROMPT + '<span class="t-typing"></span><span class="t-cursor"></span>'
          var target = el.querySelector('.t-typing')
          var i = 0
          var tick = function () {
            if (token !== runToken) return
            if (i < text.length) {
              target.textContent = text.slice(0, i + 1)
              i += 1
              later(tick, 38)
            } else {
              var cursor = el.querySelector('.t-cursor')
              if (cursor) cursor.remove()
            }
          }
          tick()
        }, t)
        t += 38 * text.length + 340
      } else {
        later(function () {
          if (token !== runToken) return
          el.classList.add('shown')
        }, t)
        t += 260
      }
    })

    later(function () {
      if (token !== runToken) return
      var idle = document.createElement('p')
      idle.className = 't-cmd t-idle'
      idle.innerHTML = PROMPT + '<span class="t-cursor"></span>'
      body.appendChild(idle)
    }, t + 200)
  }

  function playCurrentSlide() {
    cancelRun()
    var current = document.querySelector('.reveal .slides section.present')
    if (!current) return
    var terms = current.querySelectorAll('.term[data-autoplay]')
    for (var i = 0; i < terms.length; i++) {
      if (PRINT_MODE || REDUCED) renderStatic(terms[i])
      else play(terms[i], runToken)
    }
  }

  /* 非自动播放的静态终端：直接补提示符，内容原样完整显示 */
  function decorateStaticTerms() {
    var cmds = document.querySelectorAll('.term:not([data-autoplay]) .t-cmd')
    for (var i = 0; i < cmds.length; i++) {
      cmds[i].innerHTML = PROMPT + cmds[i].innerHTML
    }
  }

  /* ---------- 启动 ---------- */
  fillLinks()
  renderQrcodes()
  decorateStaticTerms()

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
  }).then(function () {
    playCurrentSlide()
    window.Reveal.on('slidechanged', playCurrentSlide)
  })
})()
