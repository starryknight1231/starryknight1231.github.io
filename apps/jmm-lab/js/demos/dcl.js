/* ============ DCL 单例推演 ============ */
(function () {
  'use strict';

  const CODE = [
    'public class Singleton {',
    '  private static <span id="dc-vol" class="cmt">/* volatile */</span> Singleton instance;',
    '  public static Singleton get() {',
    '    if (instance == null) {                     // ① 首次检查',
    '      synchronized (Singleton.class) {',
    '      if (instance == null) {                   // ② 二次检查',
    '        instance = new Singleton();             // ③ 拆成三步',
    '      }',
    '      }',
    '    }',
    '    return instance;                            // ④ 使用',
    '  }',
    '}',
  ];

  // 两种执行序
  const SEQ_PLAIN = [
    { lines: [6], state: 'instance=null, m=—', text: '线程 T1 持锁进入，开始执行 instance = new Singleton()。' },
    { lines: [6], state: 'instance=null, m=已分配(未初始化)', text: '3a 分配内存：m 指向一块新内存，字段还是默认值。' },
    { lines: [6], state: 'instance=m（但对象未初始化！）', text: '3c 引用赋值先执行了 —— 编译器/CPU 允许把「构造」排到「赋值」后面（无屏障阻止重排）。此刻 instance 已经非 null！', bad: true },
    { lines: [6], state: 'm 内容初始化完成', text: '3b 构造函数这时才真正执行。' },
    { lines: [3], state: 'instance=m（半成品）', text: '线程 T2 首次检查：instance != null，跳过同步块直接返回。' },
    { lines: [10], state: 'T2 拿到半初始化对象', text: 'T2 开始使用 —— 💥 字段全是默认值，任何非空检查都救不了它。这就是没有 volatile 的 DCL 的著名漏洞。', bad: true },
  ];
  const SEQ_VOL = [
    { lines: [6], state: 'instance=null, m=—', text: '线程 T1 持锁进入，执行 instance = new Singleton()。' },
    { lines: [6], state: 'instance=null, m=已分配(未初始化)', text: '3a 分配内存。' },
    { lines: [6], state: 'm 初始化完成', text: '3b 构造函数执行。volatile 写 3c 禁止与它重排（StoreStore 屏障），所以 3b 必须先完成。' },
    { lines: [6], state: 'instance=m（完全初始化）', text: '3c volatile 写：连同之前的所有写一起刷出，随后发布。' },
    { lines: [3], state: 'T2 读 instance', text: '线程 T2 首检读到非 null —— volatile 读带 acquire 语义，保证能看到 3b 的全部写入。' },
    { lines: [10], state: 'T2 拿到完全初始化的对象', text: '✓ 安全使用。这就是《Effective Java》《并发编程实战》坚持 DCL 必须 volatile 的原因。', ok: true },
  ];

  registerDemo({
    id: 'dcl', cat: '并发理论', name: 'DCL 单例推演',
    desc: '单步走一遍双重检查锁：没有 volatile 时，对象是怎么「未初始化就发布」的',
    keywords: 'dcl singleton double checked locking volatile 单例 内存屏障',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></svg>',
    render(body) {
      body.innerHTML = `
        <div class="info-note">
          <b>问题背景：</b>双重检查锁（DCL）单例的 ③ <code>instance = new Singleton()</code> 不是原子操作，
          它是「分配内存 → 构造初始化 → 引用赋值」三步。<b>没有 volatile 时 ②③ 可以重排</b>——推演一遍看看后果。
        </div>
        <div class="card">
          <div class="card-title">执行开关
            <span class="seg" id="dc-seg"><button class="on" data-v="plain">instance 无 volatile</button><button data-v="vol">加 volatile</button></span>
          </div>
          <div class="codeblock" id="dc-code"></div>
          <div class="btn-row">
            <button class="btn" id="dc-prev">◂ 上一步</button>
            <button class="btn primary" id="dc-next">下一步 ▸</button>
            <button class="btn" id="dc-reset">重置</button>
            <span class="hint" id="dc-pos" style="margin:0"></span>
          </div>
        </div>
        <div class="card">
          <div class="card-title">当前内存状态与观察</div>
          <table class="tb"><tbody>
            <tr><td style="width:180px;color:var(--muted)">instance</td><td style="font-family:var(--mono)" id="dc-state">null</td></tr>
            <tr><td style="color:var(--muted)">正在发生</td><td id="dc-text" style="color:var(--muted)">点「下一步」开始推演</td></tr>
          </tbody></table>
        </div>
        <div class="card">
          <div class="card-title">面试要点</div>
          <pre class="out" style="white-space:pre-wrap">标准答案顺序：先指出 ③ 是三步（这个细节直接体现你懂底层）→ 指出无 volatile 时 ②③ 重排导致「半初始化发布」→
  volatile 写插入 StoreStore 屏障禁止重排 → 读侧 acquire 保证看到全部初始化。
追加深水区：为什么不直接给 get() 加 synchronized？—— 每次读都要抢锁，高并发下自旋严重；
  为什么不用静态内部类 Holder？—— 可以！它利用类初始化锁（JLS 12.4）天然安全，DCL 是「字段延迟初始化」场景的通用解法；
  枚举单例为什么无敌？—— JVM 保证反射与序列化都无法破坏。</pre>
        </div>`;

      let mode = 'plain', seq = SEQ_PLAIN, idx = -1;

      function renderCode(hl) {
        body.querySelector('#dc-code').innerHTML = CODE.map((l, i) => {
          const tag = i === 1
            ? (mode === 'vol' ? '  private static <span class="k">volatile</span> Singleton instance;'
              : '  private static <span class="cmt">/* volatile */</span> Singleton instance;')
            : l;
          return `<div class="${hl.includes(i) ? (seq[idx] && seq[idx].bad ? 'bad' : 'hl') : ''}">${String(i + 1).padStart(2)}  ${tag}</div>`;
        }).join('');
      }
      function paint() {
        const at = idx >= 0 && idx < seq.length ? seq[idx] : null;
        renderCode(at ? at.lines : []);
        body.querySelector('#dc-state').textContent = at ? at.state : 'null';
        body.querySelector('#dc-state').style.color = at && at.bad ? 'var(--red)' : at && at.ok ? 'var(--green)' : 'var(--text)';
        body.querySelector('#dc-text').textContent = at ? at.text : '点「下一步」开始推演';
        body.querySelector('#dc-text').style.color = at && at.bad ? 'var(--red)' : 'var(--text)';
        body.querySelector('#dc-pos').textContent = seq ? `步骤 ${Math.max(0, idx + 1)} / ${seq.length}` : '';
      }
      function setMode(m) {
        mode = m;
        seq = m === 'vol' ? SEQ_VOL : SEQ_PLAIN;
        idx = -1;
        paint();
      }
      body.querySelector('#dc-seg').querySelectorAll('button').forEach(b => {
        b.addEventListener('click', () => {
          body.querySelector('#dc-seg').querySelectorAll('button').forEach(x => x.classList.remove('on'));
          b.classList.add('on');
          setMode(b.dataset.v);
        });
      });
      body.querySelector('#dc-next').addEventListener('click', () => {
        if (idx < seq.length - 1) { idx++; paint(); }
        else JL.toast('推演结束，换个开关再来一遍', true);
      });
      body.querySelector('#dc-prev').addEventListener('click', () => {
        if (idx > -1) { idx--; paint(); }
      });
      body.querySelector('#dc-reset').addEventListener('click', () => { idx = -1; paint(); });

      setMode('plain');
    }
  });
})();
