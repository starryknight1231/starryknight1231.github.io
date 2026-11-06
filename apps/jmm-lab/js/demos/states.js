/* ============ 线程状态机 ============ */
(function () {
  'use strict';

  const NODES = [
    { id: 'NEW', x: 110, y: 52, desc: '刚 new 出来，还没调用 start()。此刻它只是一个普通的 Java 对象。' },
    { id: 'RUNNABLE', x: 340, y: 52, desc: '可运行：可能在跑，也可能在等 CPU 时间片（就绪）。Java 没有区分「运行中」和「就绪」。' },
    { id: 'TIMED_WAITING', x: 585, y: 52, desc: '限时等待：sleep(n)、wait(n)、join(n)、parkNanos。到点自己醒来。' },
    { id: 'BLOCKED', x: 110, y: 210, desc: '被 synchronized 挡在门外：锁被人拿着，排队等锁。这是唯一一个和 monitor 锁绑定的状态。' },
    { id: 'WAITING', x: 585, y: 210, desc: '无限期等待：wait()/join()/park()。不占到点醒它，就一直睡。' },
    { id: 'TERMINATED', x: 340, y: 210, desc: 'run() 执行完毕。线程对象还活着（还能 join），但不能再 start()。' },
  ];
  const EDGES = [
    { f: 0, t: 1, label: 'start()', dx: 0, dy: -16 },
    { f: 1, t: 2, label: 'sleep(n) / wait(n)', dx: 0, dy: -16 },
    { f: 2, t: 1, label: '超时 / notify', dx: 0, dy: 14 },
    { f: 1, t: 3, label: 'wait() / join() / park()', dx: 0, dy: -14 },
    { f: 3, t: 1, label: 'notify / unpark', dx: 0, dy: 14 },
    { f: 1, t: 4, label: '进 synchronized 失败', dx: 0, dy: -18 },
    { f: 4, t: 1, label: '获得锁', dx: 0, dy: 16 },
    { f: 1, t: 5, label: 'run() 返回', dx: 0, dy: -16 },
  ];
  const DETAILS = {
    NEW: { enter: 'Thread t = new Thread(runnable);', exit: 't.start()（只能调一次，二次调用抛 IllegalThreadStateException）', pitfall: '误区：new 完调用 run() 不是启动线程，只是普通方法调用，永远到不了 RUNNABLE。' },
    RUNNABLE: { enter: 'start() 后 / 阻塞结束醒来后', exit: '进入任意阻塞；或 run() 返回进入 TERMINATED', pitfall: 'RUNNABLE ≠ 正在占 CPU —— 500 个线程同时 RUNNABLE 也只有 8 个核在跑。线程池的核心工作就是让线程尽量待在这个状态、少进阻塞态。' },
    BLOCKED: { enter: '想进 synchronized 块但锁被别的线程持有', exit: '拿到锁 → RUNNABLE', pitfall: '误区：Lock.lock() 等锁时不是 BLOCKED 而是 WAITING（AQS 用 park 实现）。所以 jstack 排查 synchronized 死锁容易，排查 ReentrantLock 死锁要会看 WAITING。' },
    WAITING: { enter: 'wait() / join() / LockSupport.park()', exit: '被 notify()/unpark() 唤醒 → 通常是先去抢锁（BLOCKED）', pitfall: 'wait() 必须持有 monitor 才能调，否则抛 IllegalMonitorStateException；它等待时会释放锁，sleep() 则一直抱着锁睡。' },
    TIMED_WAITING: { enter: 'sleep(n) / wait(n) / join(n) / parkNanos(n)', exit: '时间到 / 提前被唤醒', pitfall: 'sleep(n) 的 n 不是精确时间——醒来后还要等 CPU 调度，真实误差随负载变大。做超时控制别依赖它。' },
    TERMINATED: { enter: 'run() 正常返回或抛出未捕获异常', exit: '没有出口（终态）', pitfall: '线程对象可以继续用：isAlive()=false、join() 立即返回。线程池里的工作线程死掉后会被池自动补建（corePoolSize 语义）。' },
  };

  registerDemo({
    id: 'states', cat: '并发理论', name: '线程状态机',
    desc: '六状态流转图：点任意状态看进入/离开代码与常见误区',
    keywords: 'thread state 线程状态 blocked waiting timed runnable jstack',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8 7.5l2.5 8M16 7.5l-2.5 8M8.5 6h7"/></svg>',
    render(body) {
      body.innerHTML = `
        <div class="info-note">
          <b>看图方法：</b>箭头上的字就是触发转移的动作。<b>BLOCKED 只属于 synchronized</b>，Lock 体系排队全是 WAITING —— 这是 jstack 分析时最重要的分水岭。
        </div>
        <div class="card">
          <div class="card-title">六状态流转图（点击状态节点）</div>
          <div id="ts-svg"></div>
        </div>
        <div class="card">
          <div class="card-title" id="ts-title">状态详情</div>
          <div id="ts-detail"><span class="hint">点击上方任意状态节点</span></div>
        </div>
        <div class="card">
          <div class="card-title">面试要点</div>
          <pre class="out" style="white-space:pre-wrap">jstack 实战：大量 BLOCKED + 锁等待链 → 查 synchronized 热点；大量 WAITING(park) → 看 AQS 队列（锁/线程池队列堆积）。
「线程卡住」的三个去向：BLOCKED（抢 monitor）、WAITING（主动等事件）、TIMED_WAITING（限时等）——top -H 看到线程不动的第一件事就是 dump 状态。
高频追问：wait 和 sleep 的区别？—— ①wait 释放锁、sleep 不释放；②wait 必须持有 monitor；③wait 靠 notify 唤醒、sleep 靠时间；
  本质：wait 是协作工具（对象等待集），sleep 只是定时器。</pre>
        </div>`;

      const W = 700, H = 280;
      let svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:760px;display:block;margin:0 auto">`;
      // 边
      EDGES.forEach(e => {
        const a = NODES[e.f], b = NODES[e.t];
        const x1 = a.x + (b.x - a.x) * 0.18, y1 = a.y + (b.y - a.y) * 0.22;
        const x2 = b.x - (b.x - a.x) * 0.18, y2 = b.y - (b.y - a.y) * 0.22;
        svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(31,28,25,0.32)" stroke-width="1.4"/>`;
        svg += `<polygon points="${x2},${y2} ${x2 - 5},${y2 - 8} ${x2 + 5},${y2 - 8}" fill="rgba(31,28,25,0.45)" transform="rotate(${Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI} ${x2} ${y2})"/>`;
        svg += `<text class="edge-label" x="${(x1 + x2) / 2 + e.dx}" y="${(y1 + y2) / 2 + e.dy}" text-anchor="middle">${e.label}</text>`;
      });
      // 节点
      NODES.forEach((n, i) => {
        const w = n.id === 'TIMED_WAITING' ? 132 : 108;
        svg += `<g class="state-node" data-i="${i}">
          <rect x="${n.x - w / 2}" y="${n.y - 22}" width="${w}" height="44" rx="10"/>
          <text x="${n.x}" y="${n.y + 4}">${n.id}</text>
        </g>`;
      });
      svg += '</svg>';
      body.querySelector('#ts-svg').innerHTML = svg;

      body.querySelector('#ts-svg').addEventListener('click', e => {
        const g = e.target.closest('.state-node');
        if (!g) return;
        const i = Number(g.dataset.i);
        body.querySelectorAll('.state-node').forEach(n => n.classList.toggle('on', n === g));
        const n = NODES[i], d = DETAILS[n.id];
        body.querySelector('#ts-title').textContent = '状态详情 · ' + n.id;
        body.querySelector('#ts-detail').innerHTML = `
          <div class="step-row"><span>${JL.esc(n.desc)}</span></div>
          <div class="codeblock">${JL.esc(d.enter)}</div>
          <div class="step-row"><b style="color:var(--teal)">离开：</b><span>${JL.esc(d.exit)}</span></div>
          <div class="step-row"><b style="color:var(--amber)">⚠ 误区：</b><span>${JL.esc(d.pitfall)}</span></div>`;
      });
    }
  });
})();
