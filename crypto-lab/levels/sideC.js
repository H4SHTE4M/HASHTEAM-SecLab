(function () {
  'use strict';

  // 支线 C：拆开 RSA，今天截获、未来解开
  var CryptoLab = window.CryptoLab = window.CryptoLab || {};
  CryptoLab.levels = CryptoLab.levels || {};

  // 20-bit 演示素数（python3 getPrime(20) 生成后硬编码）
  var P = 1007819, Q = 748829;
  var N = 754684093951;            // P * Q
  var PHI = 754682337304;          // (P-1)(Q-1)
  var E = 65537;
  var D = 560544834449;            // modInverse(E, PHI)

  // 计时器：浏览器用 performance.now()；冒烟测试沙箱没有计时 API 时退化为 0
  function nowMs() {
    if (typeof performance !== 'undefined' && performance.now) return performance.now();
    if (typeof Date !== 'undefined') return Date.now();
    return 0;
  }

  // BigInt 分批试除分解：C.4 的随机 n 超出 Number 精确范围（2^53），必须走 BigInt。
  // 每枚举一批候选就用 setTimeout 让出主线程一次，进度条才能随枚举实时前进，
  // 而不是一次同步循环把页面卡死。target 是预期的最小因子（本页自己生成了素数，
  // 所以知道答案），用于把「已枚举 / 总需枚举」换算成进度。
  function bigFactorChunked(n, target, onProgress, onDone) {
    n = BigInt(n);
    var targetB = BigInt(target);
    var i = 2n;
    var CHUNK = 5000000n; // 每批枚举 500 万个候选（约 20ms），随后让出主线程
    (function step() {
      var end = i + CHUNK;
      for (; i < end && i <= targetB; i += 1n) {
        if (n % i === 0n) {
          onProgress(1);
          onDone([i, n / i]);
          return;
        }
      }
      onProgress(Number((i - 2n) * 1000n / (targetB - 2n)) / 1000);
      if (i > targetB) { onDone(null); return; }
      setTimeout(step, 0);
    })();
  }

  CryptoLab.levels.sideC = {
    init: function (panel) {
      var app = CryptoLab.app;
      var el = app.el;
      var rsa = CryptoLab.rsa;

      panel.appendChild(app.buildInfoBands(
        ['公钥 (n, e)', '密文', '全部公式'],
        ['私钥 d', 'p、q、φ(n)']
      ));

      // ================= 序幕：说悄悄话的日子结束了 =================
      panel.appendChild(el('div', { className: 'card' }, [
        el('h3', { text: '序幕：说悄悄话的日子结束了' }),
        el('p', { text: '豹拉搬走了，搬去了草原另一头。从前，牛来和豹拉传悄悄话，都是先凑到一起，把钥匙当面说定，再各回各家；可如今相隔两地，新钥匙没法再靠说悄悄话来约定——更要命的是，豹拉不知道之前的发送方法有问题，他发送到每一份新密文，牛二都能破解。牛来抱着脑袋想了三天，只好回家问妈妈。' }),
        el('p', { text: '妈妈听完笑了：傻孩子，钥匙不一定要整把递来递去。造一把「公开一半、藏起一半」的钥匙，让豹拉用公开的那半上锁，你用藏起的那半开锁——牛二就算把公开的那半抄走，也开不了锁。下面三节，就是妈妈教牛来的全过程。' }),
        el('p', { className: 'muted', text: '角色对照：豹拉 = 发送者，牛来 = 接收者，牛二 = 攻击者。' })
      ]));

      // ================= C.0 妈妈造钥匙 =================
      var c0 = el('div', { className: 'card' }, [
        el('h3', { text: 'C.0 造钥匙' }),
        el('p', { text: '妈妈没有直接回答，现在在一些复杂操作之后，生成了两个很复杂的整数 p 和 q，然后计算 n = p × q，把 n 写了下来' }),
        el('div', { className: 'calc-chain' }, [
          el('div', { className: 'calc-box mono', text: '秘密数字：p（妈妈没有告诉牛来）' }),
          el('div', { className: 'calc-box mono', text: '秘密数字：q（同上）' }),
          el('div', { className: 'calc-box mono', html: 'n = p × q = <strong>' + N + '</strong>（这个公开）' })
        ]),
        el('p', { html: '牛来尝试自己恢复这两个神秘数字，但猜了好几个 p ，发现 n / p 都不是整数，只好作罢。这时，牛妈妈又用 p 和 q 悄悄算出另一个数字 <strong>φ</strong>，并且小心翼翼收了起来。接着，她挑了一个公开指数 <code>e = ' + E + '</code>，把 <code>(n, e)</code> 并附上了一份加密流程，广播给草原上的所有动物：' }),
        el('div', { className: 'chain' }, [
          el('div', { className: 'chain__node mono', text: '加密：秘密被当作 0 到 n−1 之间的编号 m' }),
          el('div', { className: 'chain__arrow', text: '↓' }),
          el('div', { className: 'chain__node mono', text: '把 m 自乘 e 次' }),
          el('div', { className: 'chain__arrow', text: '↓' }),
          el('div', { className: 'chain__node mono', text: '除以 n 取余数' }),
          el('div', { className: 'chain__arrow', text: '↓' }),
          el('div', { className: 'chain__node mono', html: '密文 c = m<sup>e</sup> mod n' })
        ]),
        el('p', { html: '不一会，草原的另一边豹拉喊出了一个数字。这时牛来发现，他不知道怎么解密！好在等待的功夫，妈妈用之前收起来的神秘数字，又埋头演算了一个新数字 <code>d = ' + D + '</code>，并且叮嘱牛来不要泄露出去，解密的流程是这样：' }),
        el('div', { className: 'chain' }, [
          el('div', { className: 'chain__node mono', text: '解密：拿到密文 c' }),
          el('div', { className: 'chain__arrow', text: '↓' }),
          el('div', { className: 'chain__node mono', text: '把 c 自乘 d 次' }),
          el('div', { className: 'chain__arrow', text: '↓' }),
          el('div', { className: 'chain__node mono', text: '除以 n 取余数' }),
          el('div', { className: 'chain__arrow', text: '↓' }),
          el('div', { className: 'chain__node mono', html: '声称恰好回到 m = c<sup>d</sup> mod n' })
        ]),
        el('div', { className: 'two-col' }, [
          el('div', { className: 'card card--flat' }, [
            el('strong', { text: '公开钥匙（贴出来，豹拉、牛二都看得见）' }),
            el('p', { className: 'mono', text: '(n, e) = (' + N + ', ' + E + ')' })
          ]),
          el('div', { className: 'card card--flat' }, [
            el('strong', { text: '秘密钥匙（牛来收好）' }),
            el('p', { className: 'mono', text: '(n, d) = (' + N + ', ' + D + ')' }),
            el('p', { className: 'mono muted', text: '妈妈的秘密 p、q、φ，连牛来都没给看' })
          ])
        ]),
        el('p', { text: '牛来根据这个方法，果然算出来一个不一样的数。但牛来半信半疑，决定自己动手验一验。' })
      ]);
      panel.appendChild(c0);

      // ================= C.1 牛来亲手验证 =================
      var c1 = el('div', { className: 'card' }, [
        el('h3', { text: 'C.1 牛来的验证' }),
        el('p', { html: '牛来把滑杆捏在手里，从头拖到尾：给秘密随便选一个编号 m，页面立刻算出密文 <code>c = m^e mod n</code>，再用妈妈的秘密钥匙算回 <code>c^d mod n</code>——看是不是每次都恰好回到 m。' })
      ]);
      var mSlider = el('input', { type: 'range', min: '0', max: '9999', value: '2026' });
      var mLabel = el('strong', { className: 'mono', text: 'm = 2026' });
      var mOut = el('div', { className: 'calc-chain', id: 'sc-m' });
      function refreshM() {
        var m = Number(mSlider.value);
        mLabel.textContent = 'm = ' + m;
        var c = rsa.modpow(m, E, N);
        var back = rsa.modpow(c, D, N);
        mOut.innerHTML = '';
        // 只展示最终结果，不把数字代入公式
        mOut.appendChild(el('div', { className: 'calc-box mono', html: '<strong>加密</strong>：c = m<sup>e</sup> mod n = <strong>' + c + '</strong>' }));
        mOut.appendChild(el('div', { className: 'calc-box mono', html: '<strong>解密</strong>：m = c<sup>d</sup> mod n = <strong>' + back + '</strong>' + (String(back) === String(m) ? ' ✔ 回到 m' : ' ✗') }));
      }
      mSlider.addEventListener('input', refreshM);
      c1.appendChild(el('div', { className: 'flex gap-1 items-center' }, [
        el('span', { text: '选一个秘密编号' }), mSlider, mLabel
      ]));
      c1.appendChild(mOut);
      c1.appendChild(el('p', { html: '换任何一个 m，✔ 从不缺席：加密把编号打得面目全非，解密却分毫不差地还原。牛来服气了，还想明白一件更要紧的事：<strong>从头到尾，豹拉只需要公开钥匙 (n, e)，d 根本不用交出去</strong>。旧钥匙那种递来递去的麻烦没了——牛二就算把整条草原公共信道听个底朝天，也碰不到 d 的影子。' }));
      c1.appendChild(el('p', { text: 'n、e、c 和全部公式，牛二随便抄；真正要保密的只有 d。这正是 Kerckhoffs 原则：安全目标不是藏住公式，而是让攻击者难以从公开信息算出秘密钥匙。' }));
      c1.appendChild(el('p', { className: 'muted', text: '注意加密后的 c 与 m 看不出任何关系——同一把锁对相邻的编号也会给出相距甚远的密文，这正是「锁」的意义。' }));
      panel.appendChild(c1);

      // ================= C.2 妈妈的摊牌：找出数字间的暗号 =================
      var c2 = el('div', { className: 'card' }, [
        el('h3', { text: 'C.2 原理揭晓' }),
        el('p', { text: '牛来用顺手了，疑问却越来越大：d 为什么要经过那通「复杂操作」？它和 n、e 之间到底什么关系？架不住牛来天天追问，妈妈终于摊牌，把其他几个数字全写了出来：' }),
        el('div', { className: 'calc-chain' }, [
          el('div', { className: 'calc-box mono', text: 'p = ' + P + '（妈妈当时写的秘密数字）' }),
          el('div', { className: 'calc-box mono', text: 'q = ' + Q + '（妈妈当时写的秘密数字）' }),
          el('div', { className: 'calc-box mono', text: 'φ = (p−1)(q−1) = ' + PHI })
        ]),
        el('p', { html: '牛来一验算，发现p × q果然等于n。但盯着 φ 追问：它到底是什么？为什么要按 <code>(p−1)(q−1)</code> 来算？妈妈没有直接回答，反而抛回一个问题：先想明白——为什么加密、解密会恰好抵消？答案，要从余数循环讲起。' }),
        el('p', { html: 'RSA 的核心运算是「幂运算再除以 n 取余数」：观察 <code>a<sup>x</sup> mod n</code>，x 不断增大时，余数最多只有 n 种取值，所以余数列一定会重复——它以某个周期 T ≤ n 在循环。' }),
        el('p', { html: '先用比较小的合数 <code>n = 15</code> 亲手看一眼。拖动滑杆选择底数 <code>a</code> 和指数 <code>x</code>，观察余数列：' })
      ]);
      // n = 15 小实验：滑杆选 a 和 x，逐条输出 a^1..a^x mod 15 的余数列
      var aSlider = el('input', { type: 'range', min: '0', max: '14', value: '5' });
      var aLabel = el('strong', { className: 'mono', text: 'a = 5' });
      var xSlider = el('input', { type: 'range', min: '1', max: '18', value: '8' });
      var xLabel = el('strong', { className: 'mono', text: 'x = 8' });
      var cycleOut = el('div', { className: 'calc-chain' });
      function refreshCycle() {
        var a = Number(aSlider.value);
        var x = Number(xSlider.value);
        aLabel.textContent = 'a = ' + a;
        xLabel.textContent = 'x = ' + x;
        cycleOut.innerHTML = '';
        for (var i = 1; i <= x; i += 1) {
          cycleOut.appendChild(el('div', { className: 'calc-box mono', html: a + '<sup>' + i + '</sup> mod 15 = <strong>' + rsa.modpow(a, i, 15) + '</strong>' }));
        }
      }
      aSlider.addEventListener('input', refreshCycle);
      xSlider.addEventListener('input', refreshCycle);
      // 底数、指数各自成组（组内不换行），宽度不足时整组折到第二行
      c2.appendChild(el('div', { className: 'flex gap-2 items-center wrap' }, [
        el('div', { className: 'flex gap-1 items-center' }, [
          el('span', { text: '底数' }), aSlider, aLabel
        ]),
        el('div', { className: 'flex gap-1 items-center' }, [
          el('span', { text: '指数' }), xSlider, xLabel
        ])
      ]));
      c2.appendChild(cycleOut);
      c2.appendChild(el('p', { html: 'x 一路增大，余数却始终在少数几个值之间打转——数列必然进入循环。如果加密（自乘 e 次）和解密（自乘 d 次）要恰好互相抵消，就需要 e 和 d 在「循环一圈」的尺度上互为倒数。欧拉定理给出这个精确长度：只要 a 与 n 互质，自乘转满整整一圈，余数恰好回到 1——<code>a<sup>φ(n)</sup> mod n = 1</code>。<strong>「循环一圈」的长度，正是 φ(n)</strong>——这就是 φ 为什么是主角。' }));
      c2.appendChild(el('p', { html: '那 φ(n) 这个数怎么算？欧拉函数的定义是：1 到 n 之间与 n 互质的整数的个数。n = p × q（p、q 都是素数）时，与 n 互质的，就是那些既不是 p 的倍数、也不是 q 的倍数的数，直接数：' }));
      c2.appendChild(el('div', { className: 'calc-chain' }, [
        el('div', { className: 'calc-box calc-box--wrap', text: '1 到 n 之间：p 的倍数有 q 个，q 的倍数有 p 个，两批重叠的只有 n 本身 1 个' }),
        el('div', { className: 'calc-box mono', text: '与 n 不互质的数 = q + p − 1 = ' + (P + Q - 1) + ' 个' }),
        el('div', { className: 'calc-box mono', text: '与 n 互质的数 = n − (q + p − 1) = (p−1)(q−1)' }),
        el('div', { className: 'calc-box mono', text: 'φ(n) = (p−1)(q−1) = ' + PHI })
      ]));
      c2.appendChild(el('p', { text: '妈妈当时写在纸上的那条公式，来历就在这四格里。' }));
      c2.appendChild(el('p', { html: '有了 φ，就能看出 e 和 d 该满足什么关系了。假如 <code>e × d = k·φ(n) + 1</code>（也就是 <code>e × d mod φ(n) = 1</code>），那么加密、解密合起来：' }));
      c2.appendChild(el('div', { className: 'calc-chain' }, [
        el('div', { className: 'calc-box mono', html: 'a<sup>e × d</sup> mod n' }),
        el('div', { className: 'calc-box mono', html: '= a<sup>k·φ(n) + 1</sup> mod n' }),
        el('div', { className: 'calc-box mono', html: '= a · (a<sup>φ(n)</sup>)<sup>k</sup> mod n' }),
        el('div', { className: 'calc-box mono', html: '= a · 1<sup>k</sup> mod n' }),
        el('div', { className: 'calc-box mono', html: '= <strong>a</strong>' })
      ]));
      c2.appendChild(el('p', { html: '第四步用到的正是刚说的循环：转满 φ(n) 一整圈，余数回到 1。所以只要 e 和 d 在模 φ(n) 的意义下互为倒数，加密自乘 e 次、解密再自乘 d 次，合起来恰好绕整数圈，<code>a<sup>e × d</sup> mod n = a</code>，明文原样回来——C.1 滑杆上的每一次 ✔，都是这条规律的一个实例。那么，妈妈给的那组数字真的满足这条关系吗？点下面的按钮，亲手找出 e 和 d 之间的暗号：' }));
      var edBtn = el('button', { className: 'btn btn--primary', text: '找出 e 和 d 的关系' });
      var edBox = el('div', { id: 'sc-ed', className: 'mt-1' });
      edBtn.addEventListener('click', function () {
        edBox.innerHTML = '';
        // e × d ≈ 3.7×10^16 超出 Number 精确范围，必须用 BigInt 计算
        var prod = BigInt(E) * BigInt(D);
        var k = (prod - 1n) / BigInt(PHI);
        edBox.appendChild(el('div', { className: 'calc-chain' }, [
          el('div', { className: 'calc-box mono', text: 'e × d = ' + k + ' × φ(n) + 1' }),
          el('div', { className: 'calc-box mono', html: '所以 e × d mod φ(n) = <strong>1</strong> ✔' })
        ]));
      });
      c2.appendChild(edBtn);
      c2.appendChild(edBox);
      c2.appendChild(el('p', { html: '真相大白：妈妈那通「复杂操作」，就是照着 <code>e × d mod φ(n) = 1</code> 找出 d；而 φ 只有知道 p、q 才算得出来。牛二手里只有 <code>(n, e)</code>——想算出 d，就得先把 n 拆回 p × q。怎么拆？下一节 C.3 见。' }));
      c2.appendChild(el('p', { className: 'muted', text: '若 m 恰好是 p 或 q 的倍数，欧拉定理的前提不满足，但结论仍然成立——这类 m 只占 n 分之 p + q − 1，实际选到几乎不可能。' }));
      panel.appendChild(c2);

      // ================= C.3 攻击者从哪里下手 =================
      var c3 = el('div', { className: 'card' }, [
        el('h3', { text: 'C.3 攻击者从哪里下手：分解 n' }),
        el('p', { html: '攻击者已经拥有 (n, e)。在当前实验室环境中，p 和 q 都比较小，试除就能分解 n：' })
      ]);
      var factorBtn = el('button', { className: 'btn btn--danger', text: '试除分解 ' + N });
      var factorBox = el('div', { id: 'sc-factor', className: 'mt-1' });
      factorBtn.addEventListener('click', function () {
        factorBox.innerHTML = '';
        var c0 = rsa.modpow(2026, E, N);
        var opened = rsa.modpow(c0, D, N);
        factorBox.appendChild(el('div', { className: 'chain' }, [
          el('div', { className: 'chain__node mono', text: N + ' = ' + P + ' × ' + Q }),
          el('div', { className: 'chain__arrow', text: '↓' }),
          el('div', { className: 'chain__node mono', text: 'φ(n) = ' + PHI }),
          el('div', { className: 'chain__arrow', text: '↓' }),
          el('div', { className: 'chain__node mono', html: '由 e = ' + E + '</br>求出 d = ' + D }),
          el('div', { className: 'chain__arrow', text: '↓' }),
          el('div', { className: 'chain__node mono', html: '解开 c = ' + c0 + '，</br>恢复秘密 m = ' + opened })
        ]));
      });
      c3.appendChild(factorBtn);
      c3.appendChild(factorBox);
      c3.appendChild(el('p', { className: 'muted mt-2', text: '分解 n 是恢复 RSA 私钥的一条有效路径；RSA 的实用安全性依赖现实中难以完成这种大整数分解。' }));
      panel.appendChild(c3);

      // ================= C.4 经典 vs 量子 =================
      var c4 = el('div', { className: 'card' }, [
        el('h3', { text: 'C.4 因子分解有多难？经典 vs 量子' }),
        el('h4', { text: '先看一个简单的脆弱性例子' }),
        el('p', { html: '如果造钥匙的人偷懒，选了两个<strong>相邻的素数</strong>，比如 p = 101、q = 103，得到 n = 10403。攻击者甚至不用从 2 开始试除：对 n 开个平方（√10403 ≈ 102），在 102 附近一试，101 和 103 立刻现身。' })
      ]);
      var adjBtn = el('button', { className: 'btn btn--danger', text: '在 √n 附近试除分解 10403' });
      var adjBox = el('div', { id: 'sc-adj' });
      adjBtn.addEventListener('click', function () {
        var pq = rsa.factor(10403);
        adjBox.innerHTML = '';
        adjBox.appendChild(el('p', { className: 'mono', text: '√10403 ≈ 102 → 试 101：10403 = ' + pq[0] + ' × ' + pq[1] + '，秒破。' }));
        adjBox.appendChild(el('p', { className: 'muted', text: '教训：p、q 不但要够大，还要选得「没有规律」。' }));
      });
      c4.appendChild(adjBtn);
      c4.appendChild(adjBox);

      c4.appendChild(el('h4', { text: '两条计算路线的代价' }));
      c4.appendChild(el('p', { html: '但即使 p、q 选得毫无规律，因子分解这条路始终存在——问题只剩「算得够不够快」。下面这个 n 是本页刚刚随机生成的两个素数之积，公钥里公开的正是这样的 n。点击按钮，让你的浏览器真的去分解它（需要几秒钟，进度条会实时显示试除进度）：' }));

      // 随机生成一对「数秒才能试除分解」的素数；n 超出 2^53，用 BigInt 试除
      function randomBigPrime() {
        var lo = 350000000, hi = 600000000;
        for (;;) {
          var cand = lo + Math.floor(Math.random() * (hi - lo));
          if (cand % 2 === 0) cand += 1;
          if (cand <= hi && rsa.isPrime(cand)) return cand;
        }
      }
      var expP = randomBigPrime();
      var expQ = randomBigPrime();
      while (expQ === expP) expQ = randomBigPrime();
      var expN = BigInt(expP) * BigInt(expQ);

      var slowBtn = el('button', { className: 'btn btn--danger', text: '让经典计算机试除分解这个 n' });
      var progressBar = el('div', { className: 'solver-progress__bar' });
      var progressWrap = el('div', { className: 'solver-progress', style: 'display:none' }, [progressBar]);
      var slowBox = el('div', { className: 'mt-1' });
      var slowDone = null;      // 结果缓存：重复点击不必再等几秒
      var slowRunning = false;  // 分解进行中，忽略重复点击
      function renderSlowResult() {
        slowBox.appendChild(el('p', { className: 'mono', text: '分解结果：' + expN + ' = ' + slowDone.p + ' × ' + slowDone.q + '，试除用时约 ' + slowDone.secs.toFixed(1) + ' 秒。' }));
      }
      slowBtn.addEventListener('click', function () {
        if (slowRunning) return;
        slowBox.innerHTML = '';
        if (slowDone) { renderSlowResult(); return; }
        slowRunning = true;
        slowBtn.disabled = true;
        progressWrap.style.display = '';
        progressBar.style.width = '0%';
        // 分批试除（与支线 A 分析按钮同款进度条）：每枚举一批就更新一次进度
        var t0 = nowMs();
        bigFactorChunked(expN, Math.min(expP, expQ),
          function (frac) { progressBar.style.width = Math.round(frac * 100) + '%'; },
          function (pq) {
            slowDone = { p: pq[0], q: pq[1], secs: (nowMs() - t0) / 1000 };
            progressBar.style.width = '100%';
            slowRunning = false;
            slowBtn.disabled = false;
            renderSlowResult();
          });
      });
      // 按下按钮前先展示待分解的 n
      c4.appendChild(el('p', { className: 'mono', text: 'n = ' + expN + '（' + String(expN).length + ' 位十进制，两个随机素数之积）' }));
      c4.appendChild(slowBtn);
      c4.appendChild(progressWrap);
      c4.appendChild(slowBox);

      c4.appendChild(el('div', { className: 'calc-chain mt-2' }, [
        el('div', { className: 'calc-box calc-box--wrap', html: '<strong>🐢 经典计算机</strong>：本质上只能挨个或成批地尝试可能的因数。刚才这个十几位的 n 就花掉了几秒钟；位数每增加一点，要试的数量就翻好几番。放大到 617 位的真实 RSA 模数，已知最快的经典方法也需要远超宇宙年龄的运算量——全地球的计算机一起上也算不完。' }),
        el('div', { className: 'calc-box calc-box--wrap', html: '<strong>⚡ 量子计算机</strong>：足够强的量子计算机结合 Shor 算法，能很快完成同样的分解——刚才让经典计算机算上好几秒的 n，它几乎瞬间就能解开；即使放大到真实 RSA 模数，也落在可实际操作的范围内。' })
      ]));
      c4.appendChild(el('p', { className: 'muted', text: '这个优势意味着：一旦有可实用的量子计算机，「分解 n 很难」这个假设就不再成立。今天被截获保存的密文，到那天就能破解。' }));
      panel.appendChild(c4);

      // ================= C.5 命门与出路 =================
      panel.appendChild(el('div', { className: 'card' }, [
        el('h3', { text: 'C.5 RSA 的命门与抗量子的出路' }),
        el('p', { text: 'RSA 能被 Shor 算法威胁，根本原因是它的安全完全押在一个假设上：「大整数因子分解很难」。这个假设一旦被量子计算攻破，整套系统就失去地基——不是实现出了 bug，也不是方法被公开。' }),
        el('p', { text: '现代公钥密码的应对，是改押更难的问题：用对经典和量子攻击都更有抵抗力的数学问题来构建新的公钥密码，也就是「后量子密码」。它们运行在普通计算机上，不等同于「用量子信道通信」。' })
      ]));

      panel.appendChild(app.buildTakeaway(
        'RSA 的实用安全性依赖大模数在现实中难以分解；未来足够强的量子计算机若能运行 Shor 算法，这个难题就不再适合作为长期保险箱。',
        null
      ));

      // --- 过关谜题：随机生成 200 以内的小素数，不重用示例 ---
      function randomSmallPrime() {
        var cand;
        do {
          cand = 3 + Math.floor(Math.random() * 197); // 3～199
        } while (!rsa.isPrime(cand));
        return cand;
      }
      var pp = randomSmallPrime();
      var pq = randomSmallPrime();
      while (pq === pp) pq = randomSmallPrime();
      var nn = pp * pq;
      var phiN = (pp - 1) * (pq - 1);
      app.buildPuzzle(panel, {
        question: '攻击者分解了一个公钥模数：' + nn + ' = ' + pp + ' × ' + pq + '。请算出 φ(n) = (p−1)(q−1)。',
        placeholder: 'φ(n) = ?',
        normalize: function (s) { return String(s).replace(/\s+/g, ''); },
        check: function (s) { return s === String(phiN); },
        solvedText: '正确：φ(n) = (' + pp + '−1) × (' + pq + '−1) = ' + phiN + '，下一步就能由 e 求出 d。'
      });

      refreshCycle();
      refreshM();
    }
  };
})();
