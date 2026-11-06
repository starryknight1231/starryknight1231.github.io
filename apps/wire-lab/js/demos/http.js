/* ============ HTTP 页面加载调度：离散事件仿真 ============ */
(function () {
  'use strict';

  // 资源依赖图：HTML → CSS/JS →（CSS 引用）图片/字体、（JS 触发）数据/脚本
  const RES = [
    { id: 'html',  dep: [],          size: 8 * 1024,  type: 'doc',    name: 'index.html' },
    { id: 'css',   dep: ['html'],    size: 24 * 1024, type: 'style',  name: 'style.css' },
    { id: 'js',    dep: ['html'],    size: 48 * 1024, type: 'script', name: 'app.js' },
    { id: 'logo',  dep: ['css'],     size: 12 * 1024, type: 'img',    name: 'logo.png' },
    { id: 'bg',    dep: ['css'],     size: 60 * 1024, type: 'img',    name: 'bg.jpg' },
    { id: 'font',  dep: ['css'],     size: 30 * 1024, type: 'font',   name: 'font.woff' },
    { id: 'data',  dep: ['js'],      size: 16 * 1024, type: 'xhr',    name: 'data.json' },
    { id: 'track', dep: ['js'],      size: 20 * 1024, type: 'script', name: 'track.js' },
  ];
  const INIT_CWND = 10;                 // 现代浏览器/TCP 初始拥塞窗口（MSS）
  const TYPE_COLOR = { doc: '#2f5470', style: '#2f6b60', script: '#8a6a1f', img: '#6f5a68', font: '#8d4a5e', xhr: '#4f7038' };
  const TOTAL_BYTES = RES.reduce((a, r) => a + r.size, 0);

  function setupTime(cfg) { return 2 * cfg.rtt; }              // TCP 握手 + TLS1.3 握手（约 2 RTT）
  function bwm(cfg) { return cfg.bw * 125; }                    // Mbps → 字节/ms
  function ssRounds(bytes, cfg) {                               // 单连接慢启动轮数（指数爬升）
    return Math.max(1, Math.ceil(Math.log2(bytes / (INIT_CWND * cfg.mss) + 1)));
  }

  /* ---- 引擎 A：HTTP/1.1 系列（连接池 + 每连接串行）---- */
  function simH1(cfg, opt) {
    const hosts = opt.shard ? 4 : 1;
    const N = cfg.maxConns * hosts;
    const conns = [];
    for (let i = 0; i < N; i++) conns.push({ free: 0, est: false, served: 0 });
    const start = {}, finish = {}, setupDur = {};
    let setups = 0;
    for (const o of RES) {
      // 依赖完成时刻（父资源已按拓扑序处理）
      let base = 0;
      o.dep.forEach(d => { base = Math.max(base, finish[d]); });
      // 选最早空闲连接
      let c = conns[0];
      for (const cc of conns) if (cc.free < c.free) c = cc;
      const reuseLimit = opt.keepalive ? 6 : 0;
      const needSetup = !opt.keepalive || !c.est;
      if (needSetup) setups++;
      let sT = Math.max(base, c.free);
      const sDur = needSetup ? setupTime(cfg) : 0;
      sT += sDur;
      const rounds = ssRounds(o.size, cfg);
      const ser = o.size / bwm(cfg);
      const lossPen = opt.loss * rounds * cfg.rtt;             // 期望丢包重传（每对象独立）
      const dur = rounds * cfg.rtt + ser + lossPen;
      start[o.id] = sT; setupDur[o.id] = sDur; finish[o.id] = sT + dur;
      c.free = finish[o.id];
      if (opt.keepalive) {
        c.served++;
        if (reuseLimit && c.served >= reuseLimit) { c.est = false; c.served = 0; } else c.est = true;
      } else c.est = false;
    }
    return { start, finish, setupDur, setups, total: Math.max(...RES.map(o => finish[o.id])) };
  }

  /* ---- 引擎 B：HTTP/2（TCP 单连接多路复用，共享字节管道，TCP 队头阻塞） / HTTP/3（QUIC 每流独立丢包）---- */
  function simH2(cfg, quic) {
    const pipeRate = bwm(cfg);                                  // 单连接聚合字节速率
    const connSetup = setupTime(cfg) + ssRounds(TOTAL_BYTES, cfg) * cfg.rtt;  // 一次握手 + 一次连接级慢启动
    const p = cfg.loss / 1000;                                  // 丢包率（千分比 → 概率）
    const lossEvery = p > 0 ? cfg.mss / p : Infinity;
    const recovery = cfg.rtt;
    const start = {}, finish = {}, setupDur = {};
    const remaining = {}, lossAccum = {}, stall = {}, started = {};
    const done = new Set();
    RES.forEach(o => { remaining[o.id] = o.size; lossAccum[o.id] = 0; stall[o.id] = 0; setupDur[o.id] = 0; });
    let t = connSetup;
    let active = [];
    let sinceLoss = 0;                                          // HTTP/2：管道级丢包累计
    function eligible(now) {
      for (const o of RES) {
        if (started[o.id]) continue;
        if (!o.dep.every(d => done.has(d))) continue;
        const depMax = o.dep.length ? Math.max(...o.dep.map(d => finish[d])) : connSetup;
        const sT = Math.max(now, depMax, connSetup);
        if (sT > now) continue;                                 // 未来再启
        started[o.id] = true; start[o.id] = sT; active.push(o.id);
      }
    }
    RES.forEach(o => { start[o.id] = null; });
    eligible(t);
    let guard = 0;
    while (done.size < RES.length && guard++ < 200000) {
      if (active.length === 0) { eligible(t); if (active.length === 0) break; continue; }
      // 若服务速率恒定，最近一个流完成的耗时
      const share = pipeRate / active.length;
      let dt = Infinity, minId = null;
      for (const id of active) { const d = remaining[id] / share; if (d < dt) { dt = d; minId = id; } }
      dt = Math.max(dt, 1e-6);
      const served = share * dt;
      // 推进
      for (const id of active) {
        remaining[id] -= served;
        if (quic) {                                             // 每流独立：丢包只让该流停一个 RTT，不影响别流
          lossAccum[id] += served;
          while (lossAccum[id] >= lossEvery) { lossAccum[id] -= lossEvery; stall[id] += recovery; }
        }
      }
      t += dt;
      if (!quic) {                                              // 共享 TCP：丢一次全管道停一停（队头阻塞）
        sinceLoss += served * active.length;
        while (sinceLoss >= lossEvery) { sinceLoss -= lossEvery; t += recovery; }
      }
      active = active.filter(id => {
        if (remaining[id] <= 1e-6) { finish[id] = t + (quic ? stall[id] : 0); done.add(id); return false; }
        return true;
      });
      eligible(t);
    }
    return { start, finish, setupDur, setups: 1, connSetup, total: Math.max(...RES.map(o => finish[o.id] || 0)) };
  }

  function criticalPath(res, engine) {
    const last = res.reduce((a, b) => (engine.finish[a.id] >= engine.finish[b.id] ? a : b));
    const chain = [last.id];
    let cur = last;
    while (cur.dep.length) {
      cur = RES.find(r => r.id === cur.dep.reduce((a, b) => (engine.finish[a] >= engine.finish[b] ? a : b), cur.dep[0]));
      chain.push(cur.id);
    }
    return chain.reverse();
  }

  registerDemo({
    id: 'http', cat: '应用层', name: '页面加载调度',
    desc: '离散事件仿真：HTTP/1.1 / HTTP/2 / HTTP/3 三种投递模型在依赖图上的加载瀑布与队头阻塞',
    keywords: 'http http2 http3 quic 多路复用 队头阻塞 keep-alive 分域 慢启动 瀑布图 关键路径',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h3v12H4zM10 6h3v12h-3zM16 6h3v12h-3z" opacity=".35"/><path d="M4 6h16"/></svg>',
    render(body) {
      const cfg = { rtt: 100, bw: 50, mss: 1460, maxConns: 6, loss: 0 };
      let view = 'h1-none';

      body.innerHTML = `
        <div class="info-note">
          <b>仿真而非拍脑袋：</b>资源依赖图（HTML→CSS/JS→图片/字体、JS→数据）在给定 RTT/带宽/包大小/连接数/丢包率下，
          逐个事件算出每个资源的开始与完成时刻，总时长、关键路径、对比数字全部由仿真得出。
        </div>
        <div class="card">
          <div class="card-title">链路参数</div>
          <div class="row">
            <div><label class="fld">RTT：<b id="hp-rtt-v">100 ms</b></label><input type="range" id="hp-rtt" min="10" max="300" value="100"></div>
            <div><label class="fld">带宽：<b id="hp-bw-v">50 Mbps</b></label><input type="range" id="hp-bw" min="1" max="1000" value="50"></div>
            <div><label class="fld">包大小 MSS：<b id="hp-mss-v">1460 B</b></label><input type="range" id="hp-mss" min="500" max="1500" value="1460"></div>
            <div><label class="fld">每主机连接数：<b id="hp-conn-v">6</b></label><input type="range" id="hp-conn" min="1" max="12" value="6"></div>
            <div><label class="fld">丢包率：<b id="hp-loss-v">0.0%</b></label><input type="range" id="hp-loss" min="0" max="50" value="0"></div>
          </div>
          <div class="hint">丢包率刻度为 0.1%–5.0%；0 表示理想链路。</div>
        </div>
        <div class="card">
          <div class="card-title">对比（同一依赖图、同一链路参数，五种投递模型）</div>
          <table class="tb">
            <thead><tr><th>模型</th><th>总加载时间</th><th>关键路径</th><th>握手次数</th><th>说明</th></tr></thead>
            <tbody id="hp-cmp"></tbody>
          </table>
          <div class="hint" id="hp-cmpnote"></div>
        </div>
        <div class="card">
          <div class="card-title">
            <span>加载瀑布图</span>
            <div class="seg" id="hp-view">
              <button data-v="h1-none">H1 无keep-alive</button>
              <button data-v="h1-ka">H1 keep-alive</button>
              <button data-v="h1-shard">H1 分域</button>
              <button class="on" data-v="h2">HTTP/2</button>
              <button data-v="h3">HTTP/3</button>
            </div>
          </div>
          <div class="stage" id="hp-wf"></div>
          <div class="legend" id="hp-legend"></div>
          <div class="stat-grid" style="margin-top:12px">
            <div class="stat c-accent"><b id="hp-total">—</b><span>总加载时间</span></div>
            <div class="stat"><b id="hp-bytes">—</b><span>资源总量</span></div>
            <div class="stat c-red"><b id="hp-crit">—</b><span>关键路径长度</span></div>
            <div class="stat"><b id="hp-finish">—</b><span>最后完成资源</span></div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">面试要点</div>
          <pre class="out" style="white-space:pre-wrap">HTTP/1.1 的痛：无 keep-alive 每个资源都要 TCP+TLS 握手；即使 keep-alive，一条连接上请求串行、且浏览器每主机限连（约 6），后来者在连接上排队。分域（多主机）绕开限连、增并行，但握手与域名成本上升。

HTTP/2 为什么仍有队头阻塞：它在一条 TCP 上做「流」级多路复用，解决了应用层串行（一个慢资源不再挡住别的资源解析），但 TCP 要保证字节流按序交付——只要丢一个包，TCP 就得重传并在乱序缓冲里等待，所有复用在同一条连接上的流都被这一处丢包卡住。这是传输层（TCP）队头阻塞，不是应用层的。

HTTP/3/QUIC 怎么解：QUIC 把可靠性做到每条流独立，一条流丢包只重传该流、只阻塞该流，其余流照常交付。代价是握手内建，通常 1-RTT、恢复会话可 0-RTT。

小对象为什么 RTT 敏感：慢启动下窗口每 RTT 翻倍，一个对象要几个 RTT 才能填满窗口发完，带宽再高也压不下这个「握手 + 慢启动」的下限——这就是 HTTP/2 复用与连接预热真正省时间的地方。</pre>
        </div>`;

      const engines = () => ({
        'h1-none':  { e: simH1(cfg, { keepalive: false, shard: false, loss: cfg.loss / 1000 }) },
        'h1-ka':    { e: simH1(cfg, { keepalive: true, shard: false, loss: cfg.loss / 1000 }) },
        'h1-shard': { e: simH1(cfg, { keepalive: true, shard: true, loss: cfg.loss / 1000 }) },
        'h2':       { e: simH2(cfg, false) },
        'h3':       { e: simH2(cfg, true) },
      });
      const NAMES = {
        'h1-none': 'HTTP/1.1 无 keep-alive', 'h1-ka': 'HTTP/1.1 keep-alive', 'h1-shard': 'HTTP/1.1 分域',
        'h2': 'HTTP/2 多路复用', 'h3': 'HTTP/3 QUIC',
      };
      const NOTES = {
        'h1-none': '每个资源一次完整握手', 'h1-ka': '连接复用，仍受每主机限连', 'h1-shard': '多主机绕开限连',
        'h2': '单连接多流；TCP 丢包→全局队头阻塞', 'h3': '每流独立丢包恢复',
      };

      function render() {
        const eng = engines();
        // 对比表
        let best = Infinity;
        Object.values(eng).forEach(x => { best = Math.min(best, x.e.total); });
        body.querySelector('#hp-cmp').innerHTML = Object.keys(eng).map(k => {
          const x = eng[k], cp = criticalPath(RES, x.e);
          const isBest = Math.abs(x.e.total - best) < 1e-6;
          const hk = x.e.setups + (k === 'h2' || k === 'h3' ? '（1 连接多流）' : '');
          return `<tr data-model="${k}" data-ms="${x.e.total.toFixed(1)}">
            <td>${isBest ? '<span class="cmp-best">' + NAMES[k] + '</span>' : NAMES[k]}</td>
            <td class="num" style="color:${isBest ? 'var(--green)' : 'var(--text)'}">${WL.fmtMs(x.e.total)}</td>
            <td style="font-family:var(--mono);font-size:12px">${cp.map(id => RES.find(r => r.id === id).name).join(' → ')}</td>
            <td class="num">${hk}</td>
            <td style="font-size:12px;color:var(--muted)">${NOTES[k]}</td></tr>`;
        }).join('');
        const h2 = eng.h2.e.total, none = eng['h1-none'].e.total;
        body.querySelector('#hp-cmpnote').innerHTML =
          `同参数下 HTTP/2 比 HTTP/1.1 无 keep-alive 快 <b>${(((none - h2) / none) * 100).toFixed(0)}%</b>；`
          + `把丢包率拉高可见 HTTP/2 与 HTTP/3 差距被拉开（HTTP/2 全局队头阻塞，HTTP/3 每流恢复）。`;

        renderWaterfall(eng[view].e);
      }

      function renderWaterfall(e) {
        const cp = criticalPath(RES, e);
        const maxT = Math.max(e.total, 1);
        const W = 720, rowH = 26, top = 30, labelW = 130;
        const H = top + RES.length * rowH + 26;
        const X = t => labelW + t / maxT * (W - labelW - 16);
        let s = `<svg class="wf-svg" viewBox="0 0 ${W} ${H}" style="width:100%">`;
        // 时间网格
        for (let g = 0; g <= 5; g++) {
          const tv = maxT * g / 5, x = X(tv);
          s += `<line class="wf-grid" x1="${x}" y1="${top - 6}" x2="${x}" y2="${H - 20}"/>`;
          s += `<text class="wf-axis" x="${x}" y="${H - 8}" text-anchor="middle">${Math.round(tv)}ms</text>`;
        }
        s += `<text class="wf-axis" x="8" y="${top - 14}">资源 ↓ / 时间 →</text>`;
        if (e.connSetup) s += `<text class="wf-axis" x="${X(e.connSetup)}" y="${top - 14}" fill="var(--red)">conn setup ${Math.round(e.connSetup)}ms</text>`;
        RES.forEach((o, i) => {
          const y = top + i * rowH + 4;
          const st = e.start[o.id] || 0, fi = e.finish[o.id] || 0;
          const sDur = e.setupDur ? e.setupDur[o.id] : 0;
          const crit = cp.includes(o.id);
          s += `<text class="wf-label" x="6" y="${y + 12}">${WL.esc(o.name)}</text>`;
          if (sDur > 0) s += `<rect class="wf-setup" x="${X(st)}" y="${y}" width="${Math.max(1, X(st + sDur) - X(st))}" height="16" rx="3"/>`;
          s += `<rect class="wf-bar" fill="${TYPE_COLOR[o.type]}" x="${X(st + sDur)}" y="${y}" width="${Math.max(1, X(fi) - X(st + sDur))}" height="16" rx="3" opacity="${crit ? 1 : 0.62}"/>`;
          if (crit) s += `<rect class="wf-crit" x="${X(st) - 1}" y="${y - 1}" width="${Math.max(2, X(fi) - X(st)) + 2}" height="18" rx="4"/>`;
        });
        s += '</svg>';
        body.querySelector('#hp-wf').innerHTML = s;
        body.querySelector('#hp-legend').innerHTML = Object.keys(TYPE_COLOR).map(t =>
          `<span><i style="background:${TYPE_COLOR[t]}"></i>${({ doc: '文档', style: '样式', script: '脚本', img: '图片', font: '字体', xhr: '数据' })[t]}</span>`).join('')
          + '<span><i style="background:var(--red)"></i>红框=关键路径</span>';

        const lastRes = RES.reduce((a, b) => ((e.finish[a.id] || 0) >= (e.finish[b.id] || 0) ? a : b));
        body.querySelector('#hp-total').textContent = WL.fmtMs(e.total);
        body.querySelector('#hp-bytes').textContent = WL.fmtBytes(TOTAL_BYTES);
        body.querySelector('#hp-crit').textContent = cp.length + ' 段';
        body.querySelector('#hp-finish').textContent = lastRes.name;
      }

      /* ---- 控件 ---- */
      const sliders = [
        ['#hp-rtt', 'rtt', '#hp-rtt-v', v => v + ' ms'],
        ['#hp-bw', 'bw', '#hp-bw-v', v => v + ' Mbps'],
        ['#hp-mss', 'mss', '#hp-mss-v', v => v + ' B'],
        ['#hp-conn', 'maxConns', '#hp-conn-v', v => v],
        ['#hp-loss', 'loss', '#hp-loss-v', v => (v / 10).toFixed(1) + '%'],
      ];
      sliders.forEach(([sel, key, out, fmt]) => {
        body.querySelector(sel).addEventListener('input', e => {
          cfg[key] = Number(e.target.value);
          body.querySelector(out).textContent = fmt(cfg[key]);
          render();
        });
      });
      body.querySelectorAll('#hp-view button').forEach(b => {
        b.addEventListener('click', () => {
          body.querySelectorAll('#hp-view button').forEach(x => x.classList.remove('on'));
          b.classList.add('on'); view = b.dataset.v; render();
        });
      });

      render();
    },
  });
})();
