/* ============ TCP 连接与释放：状态机 + 真实序号推演 ============ */
(function () {
  'use strict';

  // 报文序列模型：SYN / FIN 各消耗 1 个序号，纯 ACK 不占序号。
  // 每条报文的确认号 = 发送方此刻从对端「已收到」的最大序号位置 rcv_nxt。
  // 所有 seq / ack 由运行时的序号空间实时算出，非硬编码。
  function buildTrace(cfg) {
    const cIs = cfg.cIsn, sIs = cfg.sIsn, Rq = cfg.Rq, Rs = cfg.Rs;
    const drop = cfg.dropped;           // Set<ideal-index>
    const msgs = [];
    let idx = 0;

    let cSnd = cIs, sSnd = sIs;         // 本端下一个要用的序号
    let cRcv = null, sRcv = null;       // 本端期望从对端收到的下一个序号（=要 ACK 的值）
    const st = { c: 'CLOSED', s: 'CLOSED' };

    function push(from, flags, seq, ack, len, note) {
      msgs.push({
        i: idx++, kind: 'data', from, flags, seq, ack: ack == null ? 0 : ack,
        len: len || 0, note: note || '', cs: st.c, ss: st.s,
      });
    }

    /* ---------- 三次握手 ---------- */
    function handshake3() {
      st.c = 'SYN-SENT';
      push('C', 'SYN', cSnd, 0, 0, '客户端主动打开：SYN 占 1 序号');
      cSnd += 1;
      st.s = 'SYN-RCVD';
      sRcv = cSnd;                       // 服务端已收到 SYN，期望 cIsn+1
      push('S', 'SYN,ACK', sSnd, sRcv, 0, '服务端 SYN 占 1 序号，ACK=cIsn+1');
      sSnd += 1;
      cRcv = sSnd;                       // 客户端已收到 SYN，期望 sIsn+1
      st.c = 'ESTABLISHED';
      push('C', 'ACK', cSnd, cRcv, 0, '第三次挥手：ACK=sIsn+1，纯确认不占序号');
      st.s = 'ESTABLISHED';
    }

    /* ---------- 数据段：让序号算术可见，ack 恒等于对端 rcv_nxt ---------- */
    function dataPhase() {
      if (Rq > 0) {
        push('C', 'PSH,ACK', cSnd, cRcv, Rq, '客户端发送请求 ' + Rq + ' 字节');
        cSnd += Rq;
        sRcv = cSnd;                     // 服务端期望收到 cSnd
      }
      if (Rs > 0) {
        push('S', 'PSH,ACK', sSnd, sRcv, Rs, '服务端发送响应 ' + Rs + ' 字节（顺带 ACK 客户端数据）');
        sSnd += Rs;
        cRcv = sSnd;
        push('C', 'ACK', cSnd, cRcv, 0, '客户端确认响应');
      }
    }

    /* ---------- 四次挥手（closer 决定谁进 TIME-WAIT） ---------- */
    function close4() {
      const a = cfg.closer === 'client' ? 'C' : 'S';
      const b = a === 'C' ? 'S' : 'C';
      const aName = a === 'C' ? '客户端' : '服务端', bName = b === 'C' ? '客户端' : '服务端';
      // a 主动发 FIN
      if (a === 'C') { st.c = 'FIN-WAIT-1'; } else { st.s = 'FIN-WAIT-1'; }
      push(a, 'FIN,ACK', a === 'C' ? cSnd : sSnd, a === 'C' ? cRcv : sRcv, 0, aName + '主动关闭：FIN 占 1 序号');
      if (a === 'C') { cSnd += 1; sRcv = cSnd; } else { sSnd += 1; cRcv = sSnd; }
      // b 回 ACK（CLOSE-WAIT，半关闭）
      if (b === 'C') st.c = 'CLOSE-WAIT'; else st.s = 'CLOSE-WAIT';
      push(b, 'ACK', b === 'C' ? cSnd : sSnd, b === 'C' ? cRcv : sRcv, 0, bName + '确认 FIN，进入 CLOSE-WAIT（半关闭）');
      // b 应用关闭后发 FIN（LAST-ACK）
      if (b === 'C') st.c = 'LAST-ACK'; else st.s = 'LAST-ACK';
      push(b, 'FIN,ACK', b === 'C' ? cSnd : sSnd, b === 'C' ? cRcv : sRcv, 0, bName + '也关闭：FIN 占 1 序号');
      if (b === 'C') { cSnd += 1; sRcv = cSnd; } else { sSnd += 1; cRcv = sSnd; }
      // a 回最后 ACK -> TIME-WAIT
      if (a === 'C') st.c = 'TIME-WAIT'; else st.s = 'TIME-WAIT';
      push(a, 'ACK', a === 'C' ? cSnd : sSnd, a === 'C' ? cRcv : sRcv, 0, aName + '确认 FIN，进入 TIME-WAIT，计时 2MSL');
      if (b === 'C') st.c = 'CLOSED'; else st.s = 'CLOSED';
      msgs.push({ i: idx++, kind: 'timer', from: a, twSide: a,
        note: '2MSL 后 ' + aName + ' 关闭该连接（被动方 ' + bName + ' 早已 CLOSED）', cs: st.c, ss: st.s });
      if (a === 'C') st.c = 'CLOSED'; else st.s = 'CLOSED';
    }

    /* ---------- 同时打开：双方几乎同时发 SYN，各自回 SYN,ACK ---------- */
    function simOpen() {
      st.c = 'SYN-SENT';
      push('C', 'SYN', cIs, 0, 0, '客户端发 SYN');
      cSnd += 1;
      st.s = 'SYN-SENT';
      push('S', 'SYN', sIs, 0, 0, '服务端几乎同时发 SYN（双方都主动打开）');
      sSnd += 1;
      cRcv = sSnd;                       // 客户端已见服务端 SYN
      st.c = 'SYN-RCVD';
      push('C', 'SYN,ACK', cIs, cRcv, 0, '客户端收到 SYN：回 SYN,ACK（重发自己的 SYN，序号仍为 cIsn）');
      sRcv = cSnd;
      st.s = 'SYN-RCVD';
      push('S', 'SYN,ACK', sIs, sRcv, 0, '服务端收到 SYN：回 SYN,ACK（序号仍为 sIsn，ack=cIsn+1）');
      st.c = 'ESTABLISHED';
      push('C', 'ACK', cSnd, cRcv, 0, '客户端确认服务端 SYN：ESTABLISHED');
      st.s = 'ESTABLISHED';
      msgs.push({ i: idx++, kind: 'recv', from: 'S',
        note: '服务端确认客户端 SYN：ESTABLISHED', cs: st.c, ss: st.s });
    }

    /* ---------- 同时关闭：两侧都主动关闭，各自可观察到 CLOSING 与 TIME-WAIT ---------- */
    function simClose() {
      handshake3();
      dataPhase();
      st.c = 'FIN-WAIT-1';
      push('C', 'FIN,ACK', cSnd, cRcv, 0, '客户端发 FIN');
      cSnd += 1; sRcv = cSnd;
      st.s = 'FIN-WAIT-1';
      push('S', 'ACK', sSnd, sRcv, 0, '服务端先确认客户端 FIN（尚未发自己的 FIN）');
      // 服务端应用也关闭 -> 发 FIN
      st.s = 'CLOSING';
      push('S', 'FIN,ACK', sSnd, sRcv, 0, '服务端也关闭，发 FIN：进入 CLOSING');
      sSnd += 1; cRcv = sSnd;
      st.c = 'CLOSING';
      push('C', 'ACK', cSnd, cRcv, 0, '客户端收到 FIN：回 ACK，进入 CLOSING');
      st.s = 'TIME-WAIT';
      push('S', 'ACK', sSnd, sRcv, 0, '服务端收到最后的 ACK：进入 TIME-WAIT');
      st.c = 'TIME-WAIT';
      msgs.push({ i: idx++, kind: 'timer', from: 'B',
        note: '双方均已收到对端最后的 ACK：各自进入 TIME-WAIT，计时 2MSL', cs: 'TIME-WAIT', ss: 'TIME-WAIT' });
      st.c = 'CLOSED'; st.s = 'CLOSED';
    }

    if (cfg.scenario === 'open3') {
      handshake3();
    } else if (cfg.scenario === 'close4') {
      handshake3(); dataPhase(); close4();
    } else if (cfg.scenario === 'sim_open') {
      simOpen();
    } else if (cfg.scenario === 'sim_close') {
      simClose();
    }

    /* ---------- 丢包注入：被标记报文首传丢弃，RTO 后以完全相同的序号重传 ---------- */
    const eff = [];
    msgs.forEach(m => {
      eff.push(m);
      if (m.kind === 'data' && m.flags && drop.has(m.i)) {
        m.dropped = true;
        eff.push({
          i: idx++, kind: 'data', from: m.from, flags: m.flags, seq: m.seq, ack: m.ack, len: m.len,
          retx: true, cs: m.cs, ss: m.ss,
          note: 'RTO 超时重传：序号与首传完全一致（' + m.flags + ' seq=' + m.seq + '）',
        });
      }
    });
    return eff;
  }

  // 独立复算：按「收到对端已交付报文的最大序号位置」维护 rcv_nxt，逐条核对 ack。
  // SYN/FIN 计 1、数据计长度、纯 ACK 计 0；重传因序号相同被自然去重。
  function checkAcks(trace, cfg) {
    let cMax = -1, sMax = -1, checked = 0, bad = 0;
    for (const m of trace) {
      if (m.kind !== 'data' || m.dropped) continue;   // 被丢的首传未送达
      const pos = m.seq + m.len + (/SYN/.test(m.flags) ? 1 : 0) + (/FIN/.test(m.flags) ? 1 : 0);
      if (m.ack) {
        checked++;
        const exp = m.from === 'C' ? sMax : cMax;      // 我要 ACK 的是「对端」的序号空间
        if (exp < 0 || m.ack !== exp) bad++;
      }
      if (m.from === 'C') cMax = Math.max(cMax, pos); else sMax = Math.max(sMax, pos);
    }
    void cfg;
    const pass = checked > 0 && bad === 0;
    return `<b>ACK 一致性自检：</b>独立累加对端 rcv_nxt（SYN/FIN 计 1、数据计长度），共比对 <b>${checked}</b> 个非零 ACK，`
      + (pass ? '<span style="color:var(--green)">全部满足 ack == 对端下一个期望序号</span>'
              : '<span style="color:var(--red)">' + bad + ' 处不符</span>')
      + '。说明确认号是算出来的，不是查表写死的。';
  }

  registerDemo({
    id: 'tcp', cat: '传输层', name: '连接与释放',
    desc: '三次握手 / 四次挥手 / 同时打开 / 同时关闭，序号与 ACK 全部按 rcv_nxt 实时计算',
    keywords: 'tcp 握手 挥手 time_wait seq ack 序号 isn 端口复用 连接池 四次挥手 2msl',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 8h11M15 8l-3-3M15 8l-3 3"/><path d="M20 16H9M9 16l3-3M9 16l3 3"/></svg>',
    render(body) {
      const cfg = {
        scenario: 'close4', closer: 'client',
        cIsn: 1000, sIsn: 5000, Rq: 100, Rs: 200,
        dropped: new Set(),
      };
      const STEP = { n: 0 };
      let trace = [];
      const PORT_LO = 49152, PORT_HI = 65535;
      let twPorts = [], twClock = 0, portReuse = false, nextPort = PORT_LO, MSLcur = 30000;

      body.innerHTML = `
        <div class="info-note">
          <b>核心口径：</b>SYN 与 FIN 各占 1 个序号，纯 ACK 不占序号；每条报文的确认号 = 接收方当前已交付的 <code class="inline">rcv_nxt</code>。
          下面所有 seq / ack 都由这套变量实时推出，不是写死的表。
        </div>
        <div class="card">
          <div class="card-title">场景与初值</div>
          <div class="row">
            <div>
              <label class="fld">场景</label>
              <div class="seg" id="tc-scenario">
                <button data-v="open3">三次握手</button>
                <button class="on" data-v="close4">四次挥手</button>
                <button data-v="sim_open">同时打开</button>
                <button data-v="sim_close">同时关闭</button>
              </div>
            </div>
            <div>
              <label class="fld">主动关闭方（四次挥手）</label>
              <div class="seg" id="tc-closer">
                <button class="on" data-v="client">客户端</button>
                <button data-v="server">服务端</button>
              </div>
            </div>
          </div>
          <div class="row" style="margin-top:12px">
            <div><label class="fld">客户端 ISN</label><input type="number" id="tc-cisn" value="1000" step="1"></div>
            <div><label class="fld">服务端 ISN</label><input type="number" id="tc-sisn" value="5000" step="1"></div>
            <div><label class="fld">请求字节 Rq</label><input type="number" id="tc-rq" value="100" step="1"></div>
            <div><label class="fld">响应字节 Rs</label><input type="number" id="tc-rs" value="200" step="1"></div>
          </div>
          <div class="btn-row">
            <button class="btn sm" id="tc-prev">◀ 上一步</button>
            <button class="btn teal sm" id="tc-next">下一步 ▶</button>
            <button class="btn sm" id="tc-auto">▶ 自动播放</button>
            <button class="btn sm" id="tc-reset">重置到首步</button>
            <button class="btn sm" id="tc-clear">清除全部丢包</button>
            <span class="hint" style="align-self:center">当前报文 <b id="tc-step">1</b> / <b id="tc-total">1</b></span>
          </div>
        </div>
        <div class="card">
          <div class="card-title">状态机与报文流（红=丢弃注入，琥珀=超时重传）</div>
          <div class="stat-grid" style="margin-bottom:10px">
            <div class="stat c-accent"><b id="tc-cstate">CLOSED</b><span>客户端状态</span></div>
            <div class="stat c-teal"><b id="tc-sstate">CLOSED</b><span>服务端状态</span></div>
          </div>
          <div class="stage" id="tc-svg"></div>
        </div>
        <div class="card">
          <div class="card-title">报文序列（点「丢」注入丢包，重传保持相同序号）</div>
          <table class="tb">
            <thead><tr><th>#</th><th>方向</th><th>标志</th><th class="num">seq</th><th class="num">ack</th><th class="num">长度</th><th>说明</th><th>丢包</th></tr></thead>
            <tbody id="tc-tbody"></tbody>
          </table>
          <div class="hint" id="tc-check"></div>
        </div>
        <div class="card">
          <div class="card-title">TIME_WAIT 观测台 <span style="font-weight:400;color:var(--faint);font-size:11px">（每次拨号走完整四次挥手，主动方挂起一个四元组）</span></div>
          <div class="row">
            <div><label class="fld">MSL（秒）：<b id="tc-msl-v">30</b></label><input type="range" id="tc-msl" min="1" max="60" value="30"></div>
            <div class="fix"><label class="fld">端口复用 / 连接池</label><label class="chk"><input type="checkbox" id="tc-reuse">复用同一连接（不进 TIME_WAIT）</label></div>
          </div>
          <div class="btn-row">
            <button class="btn sm" id="tc-dial1">拨 1 个短连接</button>
            <button class="btn sm" id="tc-dial50">批量拨 50 个</button>
            <button class="btn sm" id="tc-tick">时间前进 1 秒</button>
            <button class="btn sm" id="tc-clear-tw">清空计时</button>
          </div>
          <div class="stat-grid" style="margin-top:12px">
            <div class="stat c-amber"><b id="tc-tw-n">0</b><span>TIME_WAIT 套接字</span></div>
            <div class="stat c-accent"><b id="tc-tw-free">16384</b><span>剩余可用临时端口</span></div>
            <div class="stat"><b id="tc-tw-clock">0s</b><span>已推进时间</span></div>
            <div class="stat"><b id="tc-tw-expire">60s</b><span>每个 TW 停留 2MSL</span></div>
          </div>
          <div class="hint" id="tc-tw-note"></div>
        </div>
        <div class="card">
          <div class="card-title">面试要点</div>
          <pre class="out" style="white-space:pre-wrap">为什么 SYN/FIN 各占一个序号？——序号空间的规则是「每传一个字节占一个号」，SYN/FIN 是 0 字节但要被可靠确认、要超时重传，就必须占用一个可确认的序号，否则接收方无法用 ack 表达「我已收到这个 SYN/FIN」。第三次握手的 ACK 之所以不占序号，是因为它没携带新信息，只是确认。

TIME_WAIT 的两个理由（都能从模型里看到）：
1) 保证最后一个 ACK 可靠：若它丢失，被动方在 LAST-ACK 会重发 FIN，主动方必须仍停在 TIME-WAIT 才能再次确认；2MSL 覆盖「ACK 出网 + FIN 重传回网」一个来回。
2) 让本次连接的滞留报文在网络里自然消亡，避免相同四元组被下一条连接误认（老 SYN/ACK 串台）。

为什么端口复用 / 连接池有用——TIME_WAIT 按「四元组」存在，而临时端口是稀缺资源（默认约 16k）。频繁短连接不断占新端口堆积 TIME_WAIT，最终耗尽端口连不上；keep-alive / 连接池复用同一条连接，四元组一直 ESTABLISHED，根本不产生 TIME_WAIT。</pre>
        </div>`;

      /* ---------- 渲染 ---------- */
      function recompute(keepStep) {
        trace = buildTrace(cfg);
        if (!keepStep) STEP.n = trace.length ? trace.length - 1 : 0;
        else STEP.n = Math.min(STEP.n, trace.length - 1);
        render();
      }

      function render() {
        body.querySelector('#tc-total').textContent = trace.length;
        body.querySelector('#tc-step').textContent = trace.length ? Math.min(STEP.n + 1, trace.length) : 0;
        const tb = body.querySelector('#tc-tbody');
        tb.innerHTML = trace.map((m, n) => {
          const cur = n <= STEP.n ? 'msg-row-cur' : '';
          if (m.kind === 'timer') {
            return `<tr class="${cur}" data-row="${n}"><td class="num">${n + 1}</td><td>—</td>`
              + `<td style="color:var(--amber);font-family:var(--mono)">2MSL 定时</td>`
              + `<td colspan="3" class="num" style="color:var(--faint)">—</td><td>${WL.esc(m.note)}</td><td></td></tr>`;
          }
          if (m.kind === 'recv') {
            return `<tr class="${cur}" data-row="${n}"><td class="num">${n + 1}</td><td>收</td>`
              + `<td style="color:var(--faint);font-family:var(--mono)">收到 ACK</td>`
              + `<td colspan="3" class="num" style="color:var(--faint)">—</td><td>${WL.esc(m.note)}</td><td></td></tr>`;
          }
          const dir = m.from === 'C' ? 'C→S' : 'S→C';
          const fcls = m.dropped ? 'l-err' : m.retx ? 'l-warn' : '';
          const ftxt = m.flags + (m.retx ? ' (重传)' : '') + (m.dropped ? ' (丢)' : '');
          const dropCell = (m.retx) ? '' :
            `<button class="btn sm drop-btn ${cfg.dropped.has(m.i) ? 'on' : ''}" data-drop="${m.i}">${cfg.dropped.has(m.i) ? '丢' : '—'}</button>`;
          return `<tr class="${cur}" data-row="${n}" data-seq="${m.seq}" data-ack="${m.ack}" data-len="${m.len}" data-flags="${WL.esc(m.flags)}">`
            + `<td class="num">${n + 1}</td><td>${dir}</td>`
            + `<td class="${fcls}" style="font-family:var(--mono)">${WL.esc(ftxt)}</td>`
            + `<td class="num">${m.seq}</td><td class="num">${m.ack || '—'}</td><td class="num">${m.len || '—'}</td>`
            + `<td style="font-size:12px;color:var(--muted)">${WL.esc(m.note)}</td><td>${dropCell}</td></tr>`;
        }).join('');
        tb.querySelectorAll('[data-drop]').forEach(btn => {
          btn.addEventListener('click', () => {
            const i = Number(btn.dataset.drop);
            if (cfg.dropped.has(i)) cfg.dropped.delete(i); else cfg.dropped.add(i);
            recompute(true);
          });
        });
        const cur = trace[Math.max(0, Math.min(STEP.n, trace.length - 1))];
        body.querySelector('#tc-cstate').textContent = cur ? cur.cs : 'CLOSED';
        body.querySelector('#tc-sstate').textContent = cur ? cur.ss : 'CLOSED';
        body.querySelector('#tc-check').innerHTML = checkAcks(trace, cfg);
        renderSVG();
      }

      function renderSVG() {
        const W = 680, top = 46, rowH = 44;
        const xC = 150, xS = W - 150;
        const H = top + trace.length * rowH + 22;
        let s = `<svg class="tcp-svg" viewBox="0 0 ${W} ${H}" style="width:100%">`;
        s += `<text class="lane-title" x="${xC}" y="18" text-anchor="middle">客户端</text>`;
        s += `<text class="lane-title" x="${xS}" y="18" text-anchor="middle">服务端</text>`;
        s += `<line class="wire" x1="${xC}" y1="24" x2="${xC}" y2="${H - 12}"/>`;
        s += `<line class="wire" x1="${xS}" y1="24" x2="${xS}" y2="${H - 12}"/>`;
        trace.forEach((m, n) => {
          const y = top + n * rowH + rowH / 2;
          const op = n <= STEP.n ? 1 : 0.2;
          if (m.kind === 'timer') {
            const x = m.from === 'B' ? (xC + xS) / 2 : (m.from === 'S' ? xS : xC);
            s += `<g opacity="${op}"><rect class="state-box tw on" x="${x - 78}" y="${y - 13}" width="156" height="26" rx="6"/>`;
            s += `<text class="state-txt" x="${x}" y="${y + 4}">2MSL 定时到期</text></g>`;
            return;
          }
          if (m.kind === 'recv') {
            s += `<g opacity="${op}"><text class="state-txt" x="${xS}" y="${y + 4}">ESTABLISHED</text></g>`;
            return;
          }
          const x1 = m.from === 'C' ? xC : xS, x2 = m.from === 'C' ? xS : xC;
          let cls = 'msg-arrow';
          if (m.dropped) cls += ' lost'; else if (m.retx) cls += ' ret';
          const col = m.dropped ? 'var(--red)' : m.retx ? 'var(--amber)' : 'var(--accent)';
          const lx = (x1 + x2) / 2;
          const ah = x2 > x1 ? -1 : 1;
          s += `<g opacity="${op}">`;
          s += `<line class="${cls}" x1="${x1}" y1="${y}" x2="${x2 - ah * 8}" y2="${y}"/>`;
          s += `<polygon fill="${col}" points="${x2},${y} ${x2 + ah * 8},${y - 4} ${x2 + ah * 8},${y + 4}"/>`;
          if (m.dropped) s += `<text x="${lx}" y="${y + 5}" text-anchor="middle" font-size="15" fill="var(--red)">✕</text>`;
          s += `<text class="msg-label ${m.dropped ? 'lost' : ''}" x="${lx}" y="${y - 7}" text-anchor="middle">${m.flags}</text>`;
          if (n <= STEP.n) s += `<text class="msg-label" x="${lx}" y="${y + 16}" text-anchor="middle" font-size="10" fill="var(--faint)">seq=${m.seq}${m.ack ? ' ack=' + m.ack : ''}${m.len ? ' len=' + m.len : ''}</text>`;
          s += `</g>`;
        });
        s += '</svg>';
        body.querySelector('#tc-svg').innerHTML = s;
      }

      /* ---------- 控件 ---------- */
      function segWire(sel, key) {
        body.querySelectorAll(sel + ' button').forEach(b => {
          b.addEventListener('click', () => {
            body.querySelectorAll(sel + ' button').forEach(x => x.classList.remove('on'));
            b.classList.add('on');
            cfg[key] = b.dataset.v;
            cfg.dropped.clear();
            recompute(false);
          });
        });
      }
      segWire('#tc-scenario', 'scenario');
      segWire('#tc-closer', 'closer');

      const numWire = (id, key) => body.querySelector(id).addEventListener('input',
        WL.debounce(e => { cfg[key] = Math.max(0, Number(e.target.value) || 0); recompute(true); }, 150));
      numWire('#tc-cisn', 'cIsn'); numWire('#tc-sisn', 'sIsn');
      numWire('#tc-rq', 'Rq'); numWire('#tc-rs', 'Rs');

      body.querySelector('#tc-next').addEventListener('click', () => { STEP.n = Math.min(STEP.n + 1, trace.length - 1); render(); });
      body.querySelector('#tc-prev').addEventListener('click', () => { STEP.n = Math.max(0, STEP.n - 1); render(); });
      body.querySelector('#tc-reset').addEventListener('click', () => { STEP.n = 0; render(); });
      body.querySelector('#tc-clear').addEventListener('click', () => { cfg.dropped.clear(); recompute(true); });
      let autoId = null;
      body.querySelector('#tc-auto').addEventListener('click', e => {
        if (autoId) { WL.interval && clearInterval(autoId); autoId = null; e.target.textContent = '▶ 自动播放'; return; }
        e.target.textContent = '⏸ 暂停';
        autoId = WL.interval(() => {
          if (STEP.n >= trace.length - 1) {
            clearInterval(autoId); autoId = null;
            const b = body.querySelector('#tc-auto'); if (b) b.textContent = '▶ 自动播放';
            return;
          }
          STEP.n++; render();
        }, 900);
      });

      /* ---------- TIME_WAIT 观测 ---------- */
      function dial(n) {
        for (let k = 0; k < n; k++) {
          if (portReuse) continue;                       // 复用：不新建四元组
          if (nextPort > PORT_HI) break;                 // 临时端口耗尽
          twPorts.push({ port: nextPort++, expireAt: twClock + 2 * MSLcur });
        }
        renderTW();
      }
      function renderTW() {
        const live = portReuse ? 0 : twPorts.filter(p => p.expireAt > twClock).length;
        const free = portReuse ? (PORT_HI - PORT_LO + 1) : Math.max(0, PORT_HI - nextPort + 1);
        body.querySelector('#tc-tw-n').textContent = live;
        body.querySelector('#tc-tw-free').textContent = free;
        body.querySelector('#tc-tw-clock').textContent = twClock + 's';
        body.querySelector('#tc-tw-expire').textContent = (2 * MSLcur / 1000) + 's';
        const note = body.querySelector('#tc-tw-note');
        if (portReuse) {
          note.innerHTML = '端口复用 / 连接池已开启：短连接复用同一条 <b>ESTABLISHED</b> 连接，四元组不变，<b>不产生</b> TIME_WAIT。';
        } else if (nextPort > PORT_HI) {
          note.innerHTML = '<span style="color:var(--red)">临时端口已耗尽</span>：再拨号无法建立新连接——这正是短连接风暴的病根，靠 keep-alive / 连接池（或复用 TIME_WAIT 端口）解决。';
        } else if (live > 0) {
          note.innerHTML = `已堆积 <b>${live}</b> 个 TIME_WAIT，端口 ${twPorts[0] ? twPorts[0].port : ''}–${nextPort - 1} 被占用，各需 2MSL 才释放。`;
        } else {
          note.innerHTML = '拨号产生完整四次挥手，主动关闭方挂起一个四元组进入 TIME_WAIT；点「时间前进」观察 2MSL 到期后释放。';
        }
      }
      body.querySelector('#tc-msl').addEventListener('input', e => {
        MSLcur = Number(e.target.value) * 1000;
        body.querySelector('#tc-msl-v').textContent = Number(e.target.value);
        twPorts.forEach(p => { p.expireAt = twClock + 2 * MSLcur; });
        renderTW();
      });
      body.querySelector('#tc-reuse').addEventListener('change', e => { portReuse = e.target.checked; renderTW(); });
      body.querySelector('#tc-dial1').addEventListener('click', () => dial(1));
      body.querySelector('#tc-dial50').addEventListener('click', () => dial(50));
      body.querySelector('#tc-tick').addEventListener('click', () => { twClock += 1; renderTW(); });
      body.querySelector('#tc-clear-tw').addEventListener('click', () => {
        twClock = 0; nextPort = PORT_LO; twPorts = [];
        portReuse = false; body.querySelector('#tc-reuse').checked = false;
        renderTW();
      });

      recompute(false);
      renderTW();
    }
  });
})();
