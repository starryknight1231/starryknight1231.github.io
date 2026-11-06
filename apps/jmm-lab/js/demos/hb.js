/* ============ happens-before 规则图解 ============ */
(function () {
  'use strict';

  const RULES = [
    {
      id: 'po', name: '程序顺序规则', brief: '单线程内：前面的操作 happens-before 后面的操作',
      lanes: ['线程 A'],
      ops: [{ l: 0, x: 0, t: 'a = 1' }, { l: 0, x: 1, t: '读 a（一定是 1）' }],
      arrows: [{ f: 0, to: 1, type: 'hb', label: '程序顺序 HB' }],
      note: 'JIT 可以重排，但重排结果必须「如同串行」——单线程永远观察不到重排，这是 as-if-serial 语义。',
    },
    {
      id: 'lock', name: '监视器锁规则', brief: '对同一把锁：解锁 happens-before 后续的加锁',
      lanes: ['线程 A', '线程 B'],
      ops: [
        { l: 0, x: 0, t: 'synchronized(m){ a=1 }' }, { l: 0, x: 1, t: 'unlock m' },
        { l: 1, x: 2, t: 'lock m' }, { l: 1, x: 3, t: '读 a（保证 =1）' },
      ],
      arrows: [{ f: 1, to: 2, type: 'hb', label: 'unlock HB lock' }],
      note: '这是 synchronized 保证可见性的根源：临界区里写的一切，对下一个进入同一把锁的线程全部可见。',
    },
    {
      id: 'vol', name: 'volatile 规则', brief: 'volatile 写 happens-before 后续的 volatile 读',
      lanes: ['线程 A', '线程 B'],
      ops: [
        { l: 0, x: 0, t: 'a = 1（普通写）' }, { l: 0, x: 1, t: 'v = true（volatile 写）' },
        { l: 1, x: 2, t: '读 v（=true）' }, { l: 1, x: 3, t: '读 a（保证 =1）' },
      ],
      arrows: [{ f: 1, to: 2, type: 'hb', label: 'volatile 写 HB 读' }],
      note: 'volatile 的真正威力：写 volatile 时会把「之前所有普通写」一起刷出去；读 volatile 后全都能看见——它是全量刷新点，不是只管自己。',
    },
    {
      id: 'start', name: '线程启动规则', brief: 'Thread.start() happens-before 新线程里的所有操作',
      lanes: ['主线程', '线程 t'],
      ops: [
        { l: 0, x: 0, t: 'a = 1' }, { l: 0, x: 1, t: 't.start()' },
        { l: 1, x: 2, t: 'run() 里读 a（=1）' },
      ],
      arrows: [{ f: 1, to: 2, type: 'hb', label: 'start HB run 全部' }],
      note: '在 start() 之前做的事，新线程全部可见。反过来不成立：run() 里的写对主线程没有这条保证。',
    },
    {
      id: 'join', name: '线程终止规则', brief: '线程中的所有操作 happens-before join() 的返回',
      lanes: ['线程 t', '主线程'],
      ops: [
        { l: 0, x: 0, t: 'a = 1' }, { l: 0, x: 1, t: 'run() 结束' },
        { l: 1, x: 2, t: 't.join() 返回' }, { l: 1, x: 3, t: '读 a（=1）' },
      ],
      arrows: [{ f: 1, to: 2, type: 'hb', label: '终止 HB join 返回' }],
      note: 'join() 是最朴素的「等待结果」同步手段——不需要任何锁和 volatile，结果天然可见。',
    },
    {
      id: 'trans', name: '传递性', brief: 'A HB B 且 B HB C ⇒ A HB C（规则能用是因为有它）',
      lanes: ['线程 A', '线程 B'],
      ops: [
        { l: 0, x: 0, t: 'a = 1' }, { l: 0, x: 1, t: 'v = true（volatile 写）' },
        { l: 1, x: 2, t: '读 v' }, { l: 1, x: 3, t: '读 a（传递性保证 =1）' },
      ],
      arrows: [
        { f: 0, to: 1, type: 'hb', label: '程序顺序' },
        { f: 1, to: 2, type: 'hb', label: 'volatile' },
        { f: 2, to: 3, type: 'hb', label: '程序顺序' },
      ],
      note: 'happens-before 的 8 条规则本身只提供「相邻关系」，靠传递性才能串成跨线程的可见性链。',
    },
    {
      id: 'interrupt', name: '线程中断规则', brief: 'interrupt() 调用 happens-before 被中断线程检测到中断',
      lanes: ['线程 A', '线程 t'],
      ops: [
        { l: 0, x: 0, t: 'flag = 1' }, { l: 0, x: 1, t: 't.interrupt()' },
        { l: 1, x: 2, t: 'isInterrupted() 检测到' }, { l: 1, x: 3, t: '读 flag（=1）' },
      ],
      arrows: [{ f: 1, to: 2, type: 'hb', label: 'interrupt HB 检测' }],
      note: '用中断传业务标志位是可靠的——检测到中断时，interrupt() 之前的写全部可见。',
    },
    {
      id: 'final', name: 'final 字段规则', brief: '构造函数里的 final 写 happens-before 对象引用外泄后的读',
      lanes: ['线程 A', '线程 B'],
      ops: [
        { l: 0, x: 0, t: 'ctor: this.x = 1 (final)' }, { l: 0, x: 1, t: '共享 obj 引用' },
        { l: 1, x: 2, t: '读 obj.x（保证 =1）' },
      ],
      arrows: [{ f: 0, to: 2, type: 'hb', label: '构造 HB 读（final 特殊保证）' }],
      note: '前提是 this 不能在构造函数里逸出。这就是「不可变对象天然线程安全」的理论基础。',
    },
  ];

  registerDemo({
    id: 'hb', cat: '并发理论', name: 'happens-before 规则',
    desc: '点开 8 条规则，看可见性链条怎么在两个线程之间搭起来',
    keywords: 'happens-before jmm volatile synchronized 可见性 顺序',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h10M4 7l3-3M4 7l3 3"/><path d="M20 17H10M20 17l-3-3M20 17l-3 3"/></svg>',
    render(body) {
      body.innerHTML = `
        <div class="info-note">
          <b>一句话：</b>happens-before 不是「时间上先发生」，而是<b>可见性承诺</b>——A HB B 意味着 A 的结果对 B 可见。
          JMM 的全部规则都在回答一个问题：什么时候你能指望另一个线程看见你写的数据。
        </div>
        <div class="card">
          <div class="card-title">八条规则（点击看图解）</div>
          <div class="rule-grid" id="hb-rules"></div>
        </div>
        <div class="card">
          <div class="card-title" id="hb-title">图解</div>
          <div id="hb-svg"></div>
          <div class="hint" id="hb-note"></div>
        </div>
        <div class="card">
          <div class="card-title">面试要点</div>
          <pre class="out" style="white-space:pre-wrap">反直觉点：happens-before 与时间先后无关。A 在物理时间上先写、B 后读，若无任何 HB 规则覆盖，B 仍可能读到旧值。
「没有同步就看不到最新值」这句话不准确——你可能看到、也可能看不到，JMM 只保证有 HB 链时的下限。
答题模板：先说两条操作之间有没有哪条 HB 规则能覆盖 → 没有则无保证 → 有则沿着传递性把链条搭到头。
工程等价物：JUC 里所有工具（AQS、ConcurrentHashMap、线程池提交任务）都是靠这 8 条规则组合出可见性保证的。</pre>
        </div>`;

      const grid = body.querySelector('#hb-rules');
      grid.innerHTML = RULES.map((r, i) =>
        `<div class="rule-card" data-i="${i}"><b>${r.name}</b><span>${r.brief}</span></div>`).join('');
      grid.addEventListener('click', e => {
        const card = e.target.closest('.rule-card');
        if (!card) return;
        select(Number(card.dataset.i));
      });

      function select(i) {
        grid.querySelectorAll('.rule-card').forEach((c, j) => c.classList.toggle('on', i === j));
        const r = RULES[i];
        body.querySelector('#hb-title').textContent = '图解 · ' + r.name;
        body.querySelector('#hb-svg').innerHTML = svgFor(r);
        body.querySelector('#hb-note').textContent = '💡 ' + r.note;
      }

      function svgFor(r) {
        const W = 660, rowH = 64, top = 34;
        const H = top + r.lanes.length * rowH + 14;
        const xAt = (x) => 130 + x * 148;
        const yAt = (l) => top + l * rowH + rowH / 2;
        let s = `<svg class="hb-svg" viewBox="0 0 ${W} ${H}" style="width:100%">`;
        // 泳道
        r.lanes.forEach((name, l) => {
          s += `<rect class="lane-bg" x="8" y="${top + l * rowH}" width="${W - 16}" height="${rowH - 10}" rx="8"/>`;
          s += `<text class="lane-title" x="20" y="${top + l * rowH + 18}">${name}</text>`;
        });
        // 操作连线 + 盒子
        r.ops.forEach((op, oi) => {
          const x = xAt(op.x), y = yAt(op.l);
          if (oi > 0 && r.ops[oi - 1].l === op.l) {
            s += `<line class="op-line" x1="${xAt(r.ops[oi - 1].x) + 56}" y1="${y}" x2="${x - 60}" y2="${y}"/>`;
          }
          s += `<rect class="op-box" x="${x - 62}" y="${y - 17}" width="124" height="34" rx="7"/>`;
          s += `<text class="op-text" x="${x}" y="${y + 4}" text-anchor="middle">${esc(shorten(op.t))}</text>`;
        });
        // HB 箭头
        r.arrows.forEach(a => {
          const o = r.ops[a.f], d = r.ops[a.to];
          const x1 = xAt(o.x), y1 = yAt(o.l) + 17;
          const x2 = xAt(d.x), y2 = yAt(d.l) - 17;
          const cls = a.type === 'hb' ? 'hb-arrow' : 'no-arrow';
          s += `<path class="${cls}" d="M${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}"/>`;
          s += `<polygon points="${x2},${y2} ${x2 - 5},${y2 - 8} ${x2 + 5},${y2 - 8}" fill="${a.type === 'hb' ? 'var(--teal)' : 'var(--red)'}"/>`;
          s += `<text class="arrow-label ${a.type === 'hb' ? 'lbl-teal' : 'lbl-red'}" x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 2}" text-anchor="middle">${a.label}</text>`;
        });
        s += '</svg>';
        return s;
      }
      function shorten(t) { return t.length > 15 ? t.slice(0, 14) + '…' : t; }
      function esc(s) { return JL.esc(s); }

      select(2); // 默认 volatile
    }
  });
})();
