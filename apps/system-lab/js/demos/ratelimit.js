/* ============ 限流算法对比演示 ============ */
(function () {
  'use strict';

  registerDemo({
    id: 'ratelimit', cat: '分布式', name: '限流算法对比',
    desc: '固定窗口 / 滑动窗口 / 令牌桶 / 漏桶，同一条流量喂给四种算法看谁能扛住突发',
    keywords: 'rate limit 限流 令牌桶 漏桶 滑动窗口 固定窗口 sentinel guava',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 20v-6M4 10V4M12 20v-9M12 7V4M20 20v-4M20 12V4"/><path d="M2.5 14h3M10.5 7h3M18.5 16h3"/></svg>',
    render(body) {
      body.innerHTML = `
        <div class="info-note">
          <b>结论先行：</b>把流量模式切到「突发」，再看四种算法的拒绝率——固定窗口会在窗口边界放过 <b>2 倍</b>流量；
          滑动窗口严格但没突发余量；<b>令牌桶</b>平时攒令牌、突发时放行；<b>漏桶</b>给下游的永远是匀速。
        </div>
        <div class="card">
          <div class="card-title">控制台</div>
          <div class="row">
            <div>
              <label class="fld">流量模式</label>
              <select id="rl-pattern">
                <option value="uniform">均匀流量</option>
                <option value="burst">周期性突发（每 4 秒一波）</option>
                <option value="sine">正弦波动</option>
              </select>
            </div>
            <div>
              <label class="fld">平均流量：<b id="rl-r-v" style="color:var(--accent)">30 req/s</b></label>
              <input type="range" id="rl-r" min="5" max="100" value="30">
            </div>
            <div>
              <label class="fld">限流阈值：<b id="rl-n-v" style="color:var(--accent)">20 req/s</b></label>
              <input type="range" id="rl-n" min="5" max="50" value="20">
            </div>
            <div>
              <label class="fld">桶容量：<b id="rl-c-v" style="color:var(--accent)">40</b></label>
              <input type="range" id="rl-c" min="10" max="100" value="40">
            </div>
          </div>
          <div class="btn-row">
            <button class="btn teal" id="rl-play">⏸ 暂停</button>
            <button class="btn" id="rl-reset">重置</button>
            <span style="align-self:center;font-size:12px;color:var(--muted)">速度</span>
            <div class="seg" id="rl-speed">
              <button data-v="0.5">×0.5</button>
              <button class="on" data-v="1">×1</button>
              <button data-v="2">×2</button>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="stage"><canvas id="rl-canvas"></canvas></div>
          <div class="legend">
            <span><i style="background:var(--green)"></i>放行</span>
            <span><i style="background:var(--red)"></i>拒绝</span>
            <span>右侧竖条 = 各算法当前状态量（窗口计数 / 令牌余量 / 队列深度）</span>
          </div>
        </div>
        <div class="card">
          <div class="card-title">累计统计</div>
          <table class="tb">
            <thead><tr><th>算法</th><th>放行</th><th>拒绝</th><th>拒绝率</th><th style="width:34%">当前状态</th></tr></thead>
            <tbody id="rl-stats"></tbody>
          </table>
        </div>
        <div class="card">
          <div class="card-title">面试要点</div>
          <pre class="out" style="white-space:pre-wrap">固定窗口计数器：一分钟一个桶。边界问题——上一秒末尾 + 这一秒开头各打满，实际瞬时可达 2×阈值。实现最简单，Redis INCR + EXPIRE 就够。

滑动窗口（日志/滚动窗口）：记录每个请求时间戳，统计最近 1s 内的个数。精确但内存与请求量成正比；工程上常用「滑动窗口计数」：把 1 分钟切 6 个 10s 格子（Sentinel 的做法），统计精度与内存折中。

令牌桶：以 N/s 往桶里放令牌，桶容量 C。请求拿到令牌才放行。平时流量小于 N 时桶会攒令牌，突发来了可以一波放出去 → 「平均速率 + 允许突发」。Guava RateLimiter、Nginx burst 的思路。

漏桶：请求先进队列，以恒定 N/s 漏出给下游，桶满即拒。不管进来多猛，下游永远匀速 → 「整形流量」，但无法利用空闲时段的下游容量。常用于调用下游写接口、消息队列削峰。</pre>
        </div>`;

      /* ---------- 配置与状态 ---------- */
      let pattern = 'uniform';
      let R = 30, N = 20, C = 40;
      let speed = 1, running = true;
      let t = 0, acc = 0, lastFrame = 0;
      const WINDOW = 10000; // 画布时间跨度 ms

      function mkAlgo() {
        return {
          fixed: { bucket: -1, count: 0 },
          sliding: { ts: [] },
          token: { tokens: C },
          leaky: { q: 0 },
          hist: [],                    // {t, ok, algoId}
          stat: { ok: [0, 0, 0, 0], no: [0, 0, 0, 0] },
        };
      }
      let st = mkAlgo();
      const ALGOS = [
        { id: 0, name: '固定窗口', color: '#4e6478' },
        { id: 1, name: '滑动窗口', color: '#2f6b60' },
        { id: 2, name: '令牌桶', color: '#6f5a68' },
        { id: 3, name: '漏桶', color: '#8a6a1f' },
      ];

      function rateAt(tt) {
        if (pattern === 'uniform') return R;
        if (pattern === 'sine') return R * (0.55 + 0.45 * Math.sin(tt / 2500));
        // burst：基础低流量，每 4s 顶部来一波 300ms 的高峰
        const phase = tt % 4000;
        return phase < 300 ? R * 12 : R * 0.35;
      }

      function reset() {
        st = mkAlgo();
        t = 0; acc = 0;
        renderStats(true);
      }

      function tryAlgo(a, id) {
        if (id === 0) {
          const bucket = Math.floor(t / 1000);
          if (a.fixed.bucket !== bucket) { a.fixed.bucket = bucket; a.fixed.count = 0; }
          if (a.fixed.count < N) { a.fixed.count++; return true; }
          return false;
        }
        if (id === 1) {
          const s = a.sliding;
          while (s.ts.length && s.ts[0] <= t - 1000) s.ts.shift();
          if (s.ts.length < N) { s.ts.push(t); return true; }
          return false;
        }
        if (id === 2) {
          if (a.token.tokens >= 1) { a.token.tokens -= 1; return true; }
          return false;
        }
        if (id === 3) {
          if (a.leaky.q < C) { a.leaky.q += 1; return true; }
          return false;
        }
      }

      function step(dt) {
        // 状态量随时间演化
        st.token.tokens = Math.min(C, st.token.tokens + N * dt / 1000);
        st.leaky.q = Math.max(0, st.leaky.q - N * dt / 1000);

        // 请求生成（泊松近似：速率 × dt）
        acc += rateAt(t) * dt / 1000;
        let gen = Math.floor(acc);
        acc -= gen;
        gen = Math.min(gen, 60);
        while (gen--) {
          for (const al of ALGOS) {
            const ok = tryAlgo(st, al.id);
            st.hist.push({ t, ok, id: al.id });
            if (ok) st.stat.ok[al.id]++; else st.stat.no[al.id]++;
          }
        }
        // 修剪历史
        while (st.hist.length && st.hist[0].t < t - WINDOW - 2000) st.hist.shift();
        t += dt;
      }

      /* ---------- 绘图 ---------- */
      const canvas = body.querySelector('#rl-canvas');
      let layout, laneH = 56, meterW = 96, padL = 76;
      function draw() {
        const H = laneH * 4 + 16;
        layout = SL.fitCanvas(canvas, H);
        const { ctx, w, h } = layout;
        const plotW = w - padL - meterW - 14;
        ctx.clearRect(0, 0, w, h);
        ctx.font = '12px ' + getComputedStyle(document.body).getPropertyValue('--mono');

        ALGOS.forEach(al => {
          const y0 = al.id * laneH + 8;
          // 泳道底
          ctx.fillStyle = 'rgba(31,28,25,0.035)';
          ctx.fillRect(padL, y0, plotW, laneH - 8);
          // 秒刻度
          const tStart = t - WINDOW;
          ctx.strokeStyle = 'rgba(31,28,25,0.10)';
          ctx.fillStyle = '#6f675d';
          for (let s = Math.ceil(tStart / 1000) * 1000; s <= t; s += 1000) {
            const x = padL + (s - tStart) / WINDOW * plotW;
            ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + laneH - 8); ctx.stroke();
          }
          // 阈值参考线（每秒 N 个 = 绿色虚线高度按密度不画，改为文字）
          // 请求点
          st.hist.forEach(r => {
            if (r.id !== al.id) return;
            if (r.t < tStart) return;
            const x = padL + (r.t - tStart) / WINDOW * plotW;
            const y = y0 + (laneH - 8) / 2;
            ctx.fillStyle = r.ok ? '#4f7038' : '#a8452f';
            ctx.globalAlpha = r.ok ? 0.9 : 1;
            ctx.fillRect(x - 1.5, y - 5, 3, 10);
            ctx.globalAlpha = 1;
          });
          // 右侧状态条
          const mx = padL + plotW + 14, mw = meterW, my = y0 + (laneH - 8) / 2 - 5;
          let frac = 0, col = al.color, label = '';
          if (al.id === 0) { frac = st.fixed.count / N; label = st.fixed.count + '/' + N; }
          if (al.id === 1) { frac = st.sliding.ts.length / N; label = st.sliding.ts.length + '/' + N; }
          if (al.id === 2) { frac = st.token.tokens / C; label = Math.floor(st.token.tokens) + '/' + C; }
          if (al.id === 3) { frac = st.leaky.q / C; label = Math.floor(st.leaky.q) + '/' + C; }
          frac = Math.max(0, Math.min(1, frac));
          ctx.fillStyle = '#e3ddd1';
          ctx.fillRect(mx, my, mw, 10);
          ctx.fillStyle = col;
          ctx.fillRect(mx, my, mw * frac, 10);
          ctx.strokeStyle = 'rgba(31,28,25,0.18)';
          ctx.strokeRect(mx + 0.5, my + 0.5, mw - 1, 9);
          ctx.fillStyle = '#5f5850';
          ctx.fillText(label, mx + mw / 2 - ctx.measureText(label).width / 2, my + 24);
          // 左侧标签
          ctx.fillStyle = al.color;
          ctx.fillText(al.name, 8, y0 + (laneH - 8) / 2 + 4);
        });
      }

      function renderStats(force) {
        const now = performance.now();
        if (!force && now - (renderStats._last || 0) < 200) return;
        renderStats._last = now;
        body.querySelector('#rl-stats').innerHTML = ALGOS.map(al => {
          const ok = st.stat.ok[al.id], no = st.stat.no[al.id];
          const rate = (ok + no) ? Math.round(no / (ok + no) * 100) : 0;
          const cls = rate > 30 ? 'b-red' : rate > 10 ? 'b-amber' : 'b-green';
          return `<tr>
            <td style="color:${al.color};font-weight:600">${al.name}</td>
            <td style="font-family:var(--mono)">${ok}</td>
            <td style="font-family:var(--mono)">${no}</td>
            <td><span class="badge ${cls}">${rate}%</span></td>
            <td style="color:var(--muted);font-size:12px">${
              al.id === 0 ? '当前窗口计数 ' + st.fixed.count : ''}${
              al.id === 1 ? '最近 1s 已放行 ' + st.sliding.ts.length : ''}${
              al.id === 2 ? '令牌余量 ' + Math.floor(st.token.tokens) : ''}${
              al.id === 3 ? '队列深度 ' + Math.floor(st.leaky.q) : ''}</td>
          </tr>`;
        }).join('');
      }

      SL.raf(now => {
        if (!running) { lastFrame = now; return; }
        const dt = Math.min(50, now - (lastFrame || now));
        lastFrame = now;
        if (dt > 0) {
          step(dt * speed);
          draw();
          renderStats();
        }
      });

      /* ---------- 控件 ---------- */
      body.querySelector('#rl-r').addEventListener('input', e => {
        R = Number(e.target.value);
        body.querySelector('#rl-r-v').textContent = R + ' req/s';
      });
      body.querySelector('#rl-n').addEventListener('input', e => {
        N = Number(e.target.value);
        body.querySelector('#rl-n-v').textContent = N + ' req/s';
      });
      body.querySelector('#rl-c').addEventListener('input', e => {
        C = Number(e.target.value);
        st.token.tokens = Math.min(C, st.token.tokens);
        body.querySelector('#rl-c-v').textContent = C;
      });
      body.querySelector('#rl-pattern').addEventListener('change', e => { pattern = e.target.value; reset(); });
      body.querySelector('#rl-play').addEventListener('click', e => {
        running = !running;
        e.target.textContent = running ? '⏸ 暂停' : '▶ 播放';
      });
      body.querySelector('#rl-reset').addEventListener('click', reset);
      body.querySelectorAll('#rl-speed button').forEach(b => {
        b.addEventListener('click', () => {
          body.querySelectorAll('#rl-speed button').forEach(x => x.classList.remove('on'));
          b.classList.add('on');
          speed = Number(b.dataset.v);
        });
      });

      const onResize = SL.debounce(draw, 200);
      window.addEventListener('resize', onResize);
      SL._cleanups.push(() => window.removeEventListener('resize', onResize));

      draw();
      renderStats(true);
    }
  });
})();
