/* ============ volatile 可见性与重排序 ============ */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);

  registerDemo({
    id: 'volatile-demo', cat: '并发理论', name: 'volatile 与重排序',
    desc: '主存 / 工作内存的可见性动画 + 20 万次交错实验：volatile 到底挡住了什么',
    keywords: 'volatile 可见性 内存屏障 重排序 工作内存 jmm',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4 14h6l-1 8 9-12h-6z"/></svg>',
    render(body) {
      body.innerHTML = `
        <div class="info-note">
          <b>结论先行：</b>volatile 做两件事——① <b>可见性</b>：写立即刷主存、其他副本失效；
          ② <b>有序性</b>：禁止与它前后的读写重排（内存屏障）。下面两块分别演示。
        </div>

        <div class="card">
          <div class="card-title">① 可见性动画 · 三块内存的同步过程
            <span class="seg" id="vm-seg"><button class="on" data-v="plain">普通变量</button><button data-v="volatile">volatile</button></span>
          </div>
          <div class="mem-grid">
            <div class="mem-box main"><h4>主内存 x</h4><div class="mem-val v-main" id="vm-main">0</div><div class="mem-note" id="vm-main-note">权威副本</div></div>
            <div class="mem-box"><h4>线程 A 工作内存</h4><div class="mem-val v-a" id="vm-a">0</div><div class="mem-note" id="vm-a-note">A 的私有副本</div></div>
            <div class="mem-box"><h4>线程 B 工作内存</h4><div class="mem-val v-b" id="vm-b">0</div><div class="mem-note" id="vm-b-note">B 的私有副本</div></div>
          </div>
          <div class="bus-note" id="vm-bus">总线空闲</div>
          <div class="btn-row">
            <button class="btn primary" id="vm-next">下一步 ▸</button>
            <button class="btn" id="vm-reset">重置</button>
            <span class="hint" id="vm-step-note" style="margin:0"></span>
          </div>
        </div>

        <div class="card">
          <div class="card-title">② 重排序交错实验（20 万次虚拟调度，概率模型）</div>
          <div class="codeblock">线程 T1                    线程 T2
─────────────────────    ─────────────────────
<span class="hl">a = 1</span>;      <span class="cmt">// 普通写</span>
<span class="hl">b = true</span>;   <span class="cmt">// <span id="vm-code-tag">普通写</span></span>      <span class="hl">r1 = b</span>;  <span class="cmt">// 先读 b</span>
                         <span class="hl">r2 = a</span>;  <span class="cmt">// 再读 a</span>
<span class="cmt">// 直觉：若 r1==true，a 应该 ==1 —— 真的吗？</span></div>
          <div class="btn-row">
            <button class="btn primary" id="vm-run">跑 20 万次交错</button>
            <span class="chk"><input type="checkbox" id="vm-vol"> b 是 volatile</span>
          </div>
          <table class="tb" style="margin-top:10px"><tbody>
            <tr><td style="width:60%">r1==true 且 r2==0（直觉被打破）</td><td style="text-align:right;font-family:var(--mono)" id="vm-bad">—</td></tr>
            <tr><td>r1==true 且 r2==1（符合直觉）</td><td style="text-align:right;font-family:var(--mono)" id="vm-good">—</td></tr>
            <tr><td>r1==false（T2 根本没看见 b）</td><td style="text-align:right;font-family:var(--mono)" id="vm-skip">—</td></tr>
          </tbody></table>
          <div class="hint" id="vm-run-note">模型说明：普通写存在「仍在写缓冲区、尚未对外可见」的窗口；volatile 写会清空缓冲并对后续读立即可见（这也是模拟，不是真 JVM 的精确频率）。</div>
        </div>

        <div class="card">
          <div class="card-title">面试要点</div>
          <pre class="out" style="white-space:pre-wrap">volatile 的两个语义：可见性（写立即全局可见 + 读不走旧副本）与有序性（内存屏障禁止重排）。
volatile 不保证原子性：i++ 依然会丢更新——要原子用 AtomicInteger / 锁。
 Happens-Before 视角：volatile 写 HB 后续 volatile 读；再加上程序顺序规则 + 传递性，
  才推出「volatile 写之前的所有写，对 volatile 读之后的代码可见」——这就是它当「发布闸门」的用法。
典型应用：状态标志位、DCL 单例、AQS 的 state 字段（LockSupport/队列的可见性基石）。</pre>
        </div>`;

      /* ---------- ① 可见性动画 ---------- */
      let mode = 'plain';
      let st = reset1();
      function reset1() { return { main: 0, a: 0, b: 0, aDirty: false, bStale: false, flushed: false, step: 0 }; }
      const STEPS_PLAIN = [
        { note: '线程 A 执行 x++（只改自己工作内存里的副本）', act() { st.a = 1; st.aDirty = true; st.bus = 'A 修改了私有副本，主内存仍是 0'; } },
        { note: '普通写不承诺立即刷回——刷回时机对程序员不可见', act() { st.bus = '刷回窗口…（真实 JVM 里可能几纳秒，也可能更久）'; } },
        { note: '线程 B 读取 x —— 它读的是自己副本', act() { st.b = st.bStale ? 0 : 0; st.bStale = true; st.bus = 'B 读到自己副本的 0 —— A 的修改不可见！'; } },
        { note: '（某时刻 A 的写终于刷回主存，JMM 不给任何时间承诺）', act() { st.main = 1; st.aDirty = false; st.bus = '此刻才刷回——但 B 什么时候重读，同样没有保证'; } },
      ];
      const STEPS_VOL = [
        { note: '线程 A 执行 volatile 写 x=1', act() { st.a = 1; st.aDirty = true; st.bus = 'volatile 写：锁定缓存行 → 立即刷回主存'; } },
        { note: '写立即冲刷主内存，同时使所有其他核心的副本失效', act() { st.main = 1; st.aDirty = false; st.bStale = true; st.bus = '主内存已更新 ✓  B 的副本被标记失效 ✓'; } },
        { note: '线程 B 读取 x —— 副本失效，强制回主内存拿最新值', act() { st.b = 1; st.bStale = false; st.bus = 'B 从主内存读到 1 —— 可见性由 HB 规则背书'; } },
      ];
      function paint1() {
        $('vm-main').textContent = st.main;
        $('vm-a').textContent = st.a;
        $('vm-b').textContent = st.b;
        $('vm-a').parentElement.classList.toggle('dirty', st.aDirty);
        $('vm-b').parentElement.classList.toggle('stale', st.bStale);
        $('vm-bus').textContent = st.bus || '总线空闲';
        $('vm-bus').classList.toggle('flash', !!st.bus && st.bus !== '总线空闲');
        const steps = mode === 'plain' ? STEPS_PLAIN : STEPS_VOL;
        const idx = st.step - 1;
        $('vm-step-note').textContent = idx >= 0 && steps[idx] ? '第 ' + st.step + ' 步：' + steps[idx].note : '点「下一步」开始';
      }
      $('vm-next').addEventListener('click', () => {
        const steps = mode === 'plain' ? STEPS_PLAIN : STEPS_VOL;
        if (st.step >= steps.length) { JL.toast('已经到最后一步，点「重置」再来', true); return; }
        const s = steps[st.step];
        s.act();
        st.step++;
        paint1();
      });
      $('vm-reset').addEventListener('click', () => { st = reset1(); paint1(); });
      $('vm-seg').querySelectorAll('button').forEach(b => {
        b.addEventListener('click', () => {
          $('vm-seg').querySelectorAll('button').forEach(x => x.classList.remove('on'));
          b.classList.add('on');
          mode = b.dataset.v;
          $('vm-code-tag').textContent = mode === 'plain' ? '普通写' : 'volatile 写';
          st = reset1(); paint1();
        });
      });
      paint1();

      /* ---------- ② 交错实验 ---------- */
      $('vm-run').addEventListener('click', () => {
        const vol = $('vm-vol').checked;
        const N = 200000;
        let bad = 0, good = 0, skip = 0;
        for (let i = 0; i < N; i++) {
          // T1: a=1（普通写，可见性延迟概率 4%）; b=true（普通写延迟 4% / volatile 写立即可见并清空缓冲）
          const aVis = Math.random() > 0.04;
          const bVis = vol ? true : Math.random() > 0.04;
          // volatile 写还会把之前的普通写一起刷出去
          const aFlushedByB = vol;
          const aSeen = aVis || aFlushedByB;
          // T2 先读 b
          if (!bVis) { skip++; continue; }
          if (aSeen) good++; else bad++;
        }
        $('vm-bad').textContent = bad + ' 次';
        $('vm-bad').style.color = bad ? 'var(--red)' : 'var(--green)';
        $('vm-good').textContent = good + ' 次';
        $('vm-skip').textContent = skip + ' 次';
        const note = $('vm-run-note');
        note.textContent = vol
          ? '✓ 20 万次全部符合直觉 —— volatile 写保证 a=1 对后续读 b 的线程可见（HB 链生效）。'
          : (bad > 0
            ? `✗ 出现 ${bad} 次「b=true 但 a=0」——没有 HB 链时，JMM 允许写缓冲延迟，直觉就是错的。`
            : '这一次没抓到（概率性事件），多跑几次或去掉 volatile 再看。');
        note.style.color = vol || !bad ? 'var(--green)' : 'var(--amber)';
      });
    }
  });
})();
