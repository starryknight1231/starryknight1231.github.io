/* ============ 拥塞控制：Reno / NewReno / CUBIC，逐 RTT 推演 ============ */
(function () {
  'use strict';

  const BETA = 0.7, CUBIC_C = 0.4;

  registerDemo({
    id: 'cwnd', cat: '传输层', name: '拥塞控制',
    desc: '慢启动 / 拥塞避免 / 快重传快恢复 / 超时重传，逐 RTT 计算 cwnd 与 ssthresh 并画曲线',
    keywords: 'tcp 拥塞控制 reno newreno cubic cwnd ssthresh 慢启动 拥塞避免 快恢复',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20l4-9 4 5 4-11 5 15"/></svg>',
    render(body) {
      const cfg = { algo: 'reno', rtt: 60, bw: 100, ss0: 64, mss: 1460 };
      let st = null;
      let sched = [];
      let autoId = null, running = false;

      function newState() {
        return {
          round: 0, cwnd: 1, ssthresh: cfg.ss0, phase: '慢启动', loss: 0,
          Wmax: 0, cubicK: 0, cubicT0: 0, inRecovery: false, lastEvt: null,
          samples: [{ r: 0, cwnd: 1, ss: cfg.ss0, phase: '慢启动', evt: null }],
        };
      }

      /* ---- 拥塞事件：快重传 / 超时 ---- */
      function applyEvent(type) {
        st.loss++;
        if (type === 'timeout') {
          st.ssthresh = Math.max(2, Math.floor(st.cwnd / 2));
          st.cwnd = 1; st.inRecovery = false; st.Wmax = 0; st.cubicT0 = st.round;
          st.phase = '超时重传'; st.lastEvt = 'timeout';
          return;
        }
        // fast retransmit (3× DupACK)
        if (cfg.algo === 'cubic') {
          st.Wmax = st.cwnd;
          st.ssthresh = Math.max(2, st.cwnd * BETA);
          st.cwnd = st.ssthresh;
          st.cubicK = Math.cbrt(st.Wmax * (1 - BETA) / CUBIC_C);
          st.cubicT0 = st.round;
          st.inRecovery = true;
        } else if (cfg.algo === 'newreno' && st.inRecovery) {
          // NewReno：同一 RTT 内后续丢包不重复减窗（只在首个丢包处减窗一次）
          st.phase = '快恢复';
        } else {
          st.ssthresh = Math.max(2, Math.floor(st.cwnd / 2));
          st.cwnd = st.ssthresh;
          st.inRecovery = true;
        }
        st.phase = '快恢复'; st.lastEvt = 'fast';
      }

      /* ---- 正常增长一轮 ---- */
      function grow() {
        if (cfg.algo === 'cubic' && st.Wmax > 0) {
          const t = (st.round - st.cubicT0) * cfg.rtt / 1000;   // 秒
          const W = st.Wmax * BETA + CUBIC_C * Math.pow(t - st.cubicK, 3);
          st.cwnd = Math.max(1, W);
          if (st.cwnd >= st.ssthresh) st.inRecovery = false;
          st.phase = st.inRecovery ? '快恢复' : (st.cwnd < st.ssthresh ? '慢启动' : '拥塞避免');
        } else if (st.cwnd < st.ssthresh) {
          st.cwnd = Math.min(st.cwnd * 2, st.ssthresh);          // 慢启动：每 RTT 翻倍
          st.inRecovery = false; st.phase = '慢启动';
        } else {
          st.cwnd = st.cwnd + 1;                                 // 拥塞避免：每 RTT +1 MSS
          st.inRecovery = false; st.phase = '拥塞避免';
        }
      }

      function advance() {
        st.round++;
        const due = sched.filter(e => e.r === st.round);
        if (due.length) { due.forEach(e => applyEvent(e.type)); sched = sched.filter(e => e.r > st.round); }
        else { grow(); st.lastEvt = null; }
        st.samples.push({ r: st.round, cwnd: st.cwnd, ss: st.ssthresh, phase: st.phase, evt: st.lastEvt });
        if (st.round >= 600) stopAuto();
      }

      function triggerNow(type) {
        applyEvent(type);
        st.samples.push({ r: st.round, cwnd: st.cwnd, ss: st.ssthresh, phase: st.phase, evt: st.lastEvt });
        render();
      }

      /* ---- 派生指标 ---- */
      function metrics() {
        const cwndBytes = st.cwnd * cfg.mss;
        const thr = cwndBytes * 8 / (cfg.rtt / 1000) / 1e6;   // Mbps
        const bdp = cfg.bw * 1e6 / 8 * (cfg.rtt / 1000);       // bytes
        return { cwndBytes, thr, bdp };
      }

      /* ---- 标记与画布 ---- */
      body.innerHTML = `
        <div class="info-note">
          <b>模型口径：</b>每一「轮」= 一个 RTT。慢启动每轮 cwnd 翻倍，拥塞避免每轮 +1 MSS；
          快重传把窗口乘性减到 <code class="inline">ssthresh</code>，超时重传直接回到 1。阶段标签取自模型状态机，不是脚本写的。
        </div>
        <div class="card">
          <div class="card-title">控制台</div>
          <div class="row">
            <div>
              <label class="fld">算法</label>
              <div class="seg" id="cw-algo">
                <button class="on" data-v="reno">Reno</button>
                <button data-v="newreno">NewReno</button>
                <button data-v="cubic">CUBIC</button>
              </div>
            </div>
            <div><label class="fld">RTT：<b id="cw-rtt-v">60 ms</b></label><input type="range" id="cw-rtt" min="5" max="300" value="60"></div>
            <div><label class="fld">带宽：<b id="cw-bw-v">100 Mbps</b></label><input type="range" id="cw-bw" min="1" max="1000" value="100"></div>
            <div><label class="fld">初始 ssthresh：<b id="cw-ss0-v">64 MSS</b></label><input type="range" id="cw-ss0" min="2" max="512" value="64"></div>
            <div><label class="fld">MSS：<b id="cw-mss-v">1460 B</b></label><input type="range" id="cw-mss" min="500" max="1500" value="1460"></div>
          </div>
          <div class="btn-row">
            <button class="btn teal sm" id="cw-step">推进 1 轮 ▶</button>
            <button class="btn sm" id="cw-auto">▶ 自动</button>
            <button class="btn sm" id="cw-reset">重置</button>
            <button class="btn sm" id="cw-f3">丢包（3×DupACK）</button>
            <button class="btn sm" id="cw-rto">超时（RTO）</button>
            <span style="align-self:center;color:var(--muted);font-size:12px">预定丢包：第</span>
            <input type="number" id="cw-sched-r" value="8" min="1" style="width:64px;align-self:center">
            <select id="cw-sched-type" style="width:96px;align-self:center"><option value="fast">丢包</option><option value="timeout">超时</option></select>
            <button class="btn sm" id="cw-sched">安排</button>
          </div>
        </div>
        <div class="card">
          <div class="card-title"><span>cwnd / ssthresh 曲线</span><span class="phase-tag" id="cw-phase" data-phase="">—</span></div>
          <div class="stage"><canvas id="cw-canvas"></canvas></div>
          <div class="legend">
            <span><i style="background:var(--accent)"></i>cwnd</span>
            <span><i style="background:var(--amber)"></i>ssthresh（阶梯）</span>
            <span><i style="background:var(--amber)"></i>3×Dup 快恢复</span>
            <span><i style="background:var(--red)"></i>RTO 超时</span>
          </div>
        </div>
        <div class="card">
          <div class="card-title">实时指标</div>
          <div class="stat-grid">
            <div class="stat"><b id="cw-round">0</b><span>RTT 轮次</span></div>
            <div class="stat c-accent"><b id="cw-cwnd">1</b><span>cwnd (MSS)</span></div>
            <div class="stat c-amber"><b id="cw-ss">64</b><span>ssthresh (MSS)</span></div>
            <div class="stat c-red"><b id="cw-loss">0</b><span>丢包次数</span></div>
            <div class="stat"><b id="cw-win">1.4 KB</b><span>发送窗口</span></div>
            <div class="stat c-teal"><b id="cw-thr">0 Mbps</b><span>估算吞吐</span></div>
            <div class="stat"><b id="cw-bdp">0.7 MB</b><span>BDP（带宽×RTT）</span></div>
          </div>
          <div class="hint" id="cw-bdpnote"></div>
          <div id="cw-metrics" data-state="" style="display:none"></div>
        </div>
        <div class="card">
          <div class="card-title">面试要点</div>
          <pre class="out" style="white-space:pre-wrap">慢启动不是「慢慢来」，而是指数增长：每收到一个 ACK cwnd+1，一个 RTT 内收到 cwnd 个 ACK → cwnd 翻倍，所以 n 轮无丢包约到 2^n MSS。真正保守的是拥塞避免（每 RTT 只 +1）。

Reno vs NewReno：丢包后 Reno 减窗一半；若一个窗口里有多个段丢失，Reno 会对每个丢包都做减窗（多次砍半，吞吐塌方）。NewReno 只在「该轮首次丢包」减窗一次，后续用部分确认继续恢复——这就是二者差别，本模型在恢复期内再次注入丢包可对比。

CUBIC：W(t)=Wmax·β + C·(t−K)^3，K=∛(Wmax·(1−β)/C)。减窗后先回到 Wmax·β，再按三次曲线爬升并越过 Wmax，高带宽下比 AIMD 更激进、又对 RTT 不敏感。

超时(RTO) 比 3×DupACK 快恢复 惩罚重得多：RTO 直接 cwnd=1 重回慢启动，而快恢复只砍半——所以「快速重传」的意义是别把一次丢包升级成整段塌方。</pre>
        </div>`;
      const canvas = body.querySelector('#cw-canvas');

      function render() {
        const m = metrics();
        body.querySelector('#cw-round').textContent = st.round;
        body.querySelector('#cw-cwnd').textContent = st.cwnd.toFixed(st.cwnd % 1 ? 1 : 0);
        body.querySelector('#cw-ss').textContent = Math.round(st.ssthresh);
        body.querySelector('#cw-loss').textContent = st.loss;
        const ph = body.querySelector('#cw-phase');
        ph.textContent = st.phase;
        ph.dataset.phase = st.phase;
        body.querySelector('#cw-win').textContent = WL.fmtBytes(m.cwndBytes);
        body.querySelector('#cw-thr').textContent = m.thr.toFixed(1) + ' Mbps';
        const bb = m.cwndBytes > m.bdp;
        body.querySelector('#cw-bdp').textContent = WL.fmtBytes(m.bdp);
        body.querySelector('#cw-bdpnote').innerHTML = bb
          ? '<span style="color:var(--red)">窗口已超过 BDP：正在填路由器缓冲，排队时延上升（bufferbloat）。</span>'
          : '<span style="color:var(--green)">窗口低于 BDP：链路未被填满，仍有带宽余量。</span>';
        // 供测试读取的机器态
        body.querySelector('#cw-metrics').dataset.state = JSON.stringify({
          round: st.round, cwnd: Math.round(st.cwnd * 10) / 10, ssthresh: Math.round(st.ssthresh),
          loss: st.loss, phase: st.phase, algo: cfg.algo,
        });
        draw();
      }

      function draw() {
        const H = 300, L = layout();
        const { ctx, w } = L;
        const padL = 46, padR = 16, padT = 16, padB = 26;
        const pw = w - padL - padR, phh = H - padT - padB;
        const xMax = Math.max(16, st.round + 2);
        let yMax = 4;
        st.samples.forEach(s => { yMax = Math.max(yMax, s.cwnd, s.ss); });
        yMax = Math.ceil(yMax * 1.12);
        const X = r => padL + r / xMax * pw;
        const Y = v => padT + phh - Math.min(1, v / yMax) * phh;
        ctx.clearRect(0, 0, w, H);
        ctx.font = '11px ' + getComputedStyle(document.body).getPropertyValue('--mono');
        // 网格
        ctx.strokeStyle = 'rgba(31,28,25,0.10)'; ctx.fillStyle = '#6f675d'; ctx.lineWidth = 1;
        for (let g = 0; g <= 4; g++) {
          const val = Math.round(yMax * g / 4), y = Y(val);
          ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
          ctx.fillText(val, 6, y + 3);
        }
        ctx.fillStyle = '#6f675d';
        ctx.fillText('轮次 →', padL, H - 8);
        ctx.fillText('cwnd / ssthresh (MSS) ↑', padL, padT - 4);
        // ssthresh 阶梯
        ctx.strokeStyle = 'var(--amber)'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.6;
        ctx.beginPath();
        st.samples.forEach((s, i) => {
          const x = X(s.r), y = Y(s.ss);
          if (i === 0) ctx.moveTo(x, y); else { ctx.lineTo(x, Y(st.samples[i - 1].ss)); ctx.lineTo(x, y); }
        });
        ctx.stroke(); ctx.setLineDash([]);
        // cwnd 曲线
        ctx.strokeStyle = 'var(--accent)'; ctx.lineWidth = 2.2;
        ctx.beginPath();
        st.samples.forEach((s, i) => { const x = X(s.r), y = Y(s.cwnd); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.stroke();
        // 丢包事件标记
        st.samples.forEach(s => {
          if (!s.evt) return;
          const x = X(s.r);
          ctx.strokeStyle = s.evt === 'timeout' ? 'var(--red)' : 'var(--amber)';
          ctx.setLineDash([3, 3]); ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, H - padB); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = ctx.strokeStyle;
          ctx.fillText(s.evt === 'timeout' ? 'RTO' : '3×Dup', x - 10, padT + 8);
        });
        // 端点
        const last = st.samples[st.samples.length - 1];
        ctx.fillStyle = 'var(--accent)';
        ctx.beginPath(); ctx.arc(X(last.r), Y(last.cwnd), 3.2, 0, 7); ctx.fill();
      }
      let _w = 0;
      function layout() {
        const L = WL.fitCanvas(canvas, 300);
        _w = L.w; return L;
      }

      /* ---- 控件 ---- */
      body.querySelectorAll('#cw-algo button').forEach(b => {
        b.addEventListener('click', () => {
          body.querySelectorAll('#cw-algo button').forEach(x => x.classList.remove('on'));
          b.classList.add('on'); cfg.algo = b.dataset.v; reset();
        });
      });
      const sliders = [
        ['#cw-rtt', 'rtt', '#cw-rtt-v', v => v + ' ms'],
        ['#cw-bw', 'bw', '#cw-bw-v', v => v + ' Mbps'],
        ['#cw-ss0', 'ss0', '#cw-ss0-v', v => v + ' MSS'],
        ['#cw-mss', 'mss', '#cw-mss-v', v => v + ' B'],
      ];
      sliders.forEach(([sel, key, out, fmt]) => {
        body.querySelector(sel).addEventListener('input', e => {
          cfg[key] = Number(e.target.value);
          body.querySelector(out).textContent = fmt(cfg[key]);
          if (key === 'ss0') st.ssthresh = Math.max(st.ssthresh, 2);
          render();
        });
      });
      body.querySelector('#cw-step').addEventListener('click', () => { advance(); render(); });
      body.querySelector('#cw-reset').addEventListener('click', reset);
      body.querySelector('#cw-f3').addEventListener('click', () => triggerNow('fast'));
      body.querySelector('#cw-rto').addEventListener('click', () => triggerNow('timeout'));
      body.querySelector('#cw-sched').addEventListener('click', () => {
        const r = Math.max(1, Number(body.querySelector('#cw-sched-r').value) || st.round + 1);
        const type = body.querySelector('#cw-sched-type').value;
        sched.push({ r, type });
        sched.sort((a, b) => a.r - b.r);
        WL.toast('已安排在第 ' + r + ' 轮' + (type === 'timeout' ? '超时' : '丢包') + '，推进到该轮自动生效', true);
      });
      body.querySelector('#cw-auto').addEventListener('click', e => {
        if (running) { stopAuto(); e.target.textContent = '▶ 自动'; return; }
        running = true; e.target.textContent = '⏸ 暂停';
        autoId = WL.interval(() => { advance(); render(); }, 240);
      });
      function stopAuto() {
        if (autoId) { clearInterval(autoId); autoId = null; }
        running = false;
        const b = body.querySelector('#cw-auto'); if (b) b.textContent = '▶ 自动';
      }
      function reset() { st = newState(); sched = []; render(); }

      const onResize = WL.debounce(() => draw(), 200);
      window.addEventListener('resize', onResize);
      WL._cleanups.push(() => window.removeEventListener('resize', onResize));
      WL._cleanups.push(stopAuto);

      reset();
    }
  });
})();
