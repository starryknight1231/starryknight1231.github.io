/* ============ LogLens 页面逻辑 ============ */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const canvas = $('ll-canvas'), tip = $('ll-tip');
  const LEVEL_COLOR = { ERROR: '#f87171', FATAL: '#f87171', WARN: '#fbbf24', INFO: '#4f8ef7', DEBUG: '#7e8ea3', TRACE: '#55637a' };

  /* ---------- 排查样例：一次跨服务超时的完整现场 ---------- */
  const SAMPLE = `2026-11-06 14:03:20.100 [gateway-http-3] INFO  gateway - POST /api/order uid=9527 received
2026-11-06 14:03:20.104 [gateway-http-3] INFO  gateway - route to order-service took 2ms
2026-11-06 14:03:20.110 [order-wrk-1] INFO  order - create order begin, uid=9527
2026-11-06 14:03:20.115 [order-wrk-1] INFO  order - deduct rpc start
2026-11-06 14:03:20.190 [inv-wrk-2] INFO  inventory - deduct sku=8829 qty=1
2026-11-06 14:03:20.240 [inv-wrk-2] INFO  inventory - mysql begin
2026-11-06 14:03:21.680 [inv-wrk-2] WARN  inventory - slow sql detected took 1440ms
2026-11-06 14:03:21.690 [inv-wrk-2] ERROR inventory - lock wait timeout exceeded, rollback
2026-11-06 14:03:21.700 [inv-wrk-2] INFO  inventory - rpc response error to caller
2026-11-06 14:03:21.705 [order-wrk-1] ERROR order - deduct failed, retry 1
2026-11-06 14:03:21.712 [order-wrk-1] INFO  order - deduct rpc start
2026-11-06 14:03:21.780 [inv-wrk-3] INFO  inventory - deduct sku=8829 qty=1
2026-11-06 14:03:22.010 [inv-wrk-3] INFO  inventory - mysql begin
2026-11-06 14:03:23.900 [inv-wrk-3] WARN  inventory - slow sql detected took 1880ms
2026-11-06 14:03:23.910 [inv-wrk-3] ERROR inventory - lock wait timeout exceeded, rollback
2026-11-06 14:03:23.920 [order-wrk-1] ERROR order - deduct failed, retry 2
2026-11-06 14:03:23.928 [gateway-http-3] WARN  gateway - upstream slow, elapsed 3820ms
2026-11-06 14:03:23.932 [gateway-http-3] ERROR gateway - upstream order-service timeout took 3830ms
2026-11-06 14:03:23.938 [gateway-http-3] INFO  gateway - return 504 to client
2026-11-06 14:03:24.010 [monitor-1] ERROR monitor - api 5xx spike detected: /api/order`;

  /* ---------- 解析 ---------- */
  function parse(text) {
    const entries = [];
    let failed = 0;
    const lines = text.split('\n');
    for (const raw0 of lines) {
      const raw = raw0.trimEnd();
      if (!raw.trim()) continue;
      const e = parseLine(raw);
      if (e) entries.push(e);
      else if (entries.length) entries[entries.length - 1].raw += '\n' + raw; // 续行
      else failed++;
    }
    entries.sort((a, b) => a.ts - b.ts);
    return { entries, failed };
  }

  function parseLine(raw) {
    let m, ts = null, rest = raw;
    // ISO 8601（含 Z / 时区）
    if ((m = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?)(Z|[+-]\d{2}:?\d{2})?/.exec(raw))) {
      ts = Date.parse(m[0]);
      rest = raw.slice(m.index + m[0].length);
    }
    // 标准格式 2026-11-06 14:03:21.123
    if (ts === null && (m = /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})[.,](\d{1,3})/.exec(raw))) {
      ts = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], +String(m[7]).padEnd(3, '0').slice(0, 3)).getTime();
      rest = raw.slice(m.index + m[0].length);
    }
    // 纯时间 14:03:21.123（按今天算）
    if (ts === null && (m = /(?:^|\s)(\d{2}):(\d{2}):(\d{2})[.,](\d{1,3})/.exec(raw))) {
      const d = new Date();
      ts = new Date(d.getFullYear(), d.getMonth(), d.getDate(), +m[1], +m[2], +m[3], +String(m[4]).padEnd(3, '0').slice(0, 3)).getTime();
      rest = raw.slice(m.index + m[0].length);
    }
    if (ts === null || isNaN(ts)) return null;

    const lv = /\b(TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL)\b/i.exec(raw);
    const level = lv ? lv[1].toUpperCase().replace('WARNING', 'WARN') : 'INFO';
    // 泳道：时间戳后第一个 [方括号]，否则取 "xxx - msg" 的 xxx，否则 "未知"
    let lane = '未知';
    const br = /\[([^\]\[]{1,40})\]/.exec(rest);
    if (br) lane = br[1];
    else {
      const sv = rest.match(/^\s*([A-Za-z0-9_.-]{2,30})\s+-\s/);
      if (sv) lane = sv[1];
    }
    const msg = rest.replace(/^\s*\[([^\]\[]{1,40})\]\s*/, '').replace(/^\s*[A-Za-z0-9_.-]+\s+-\s*/, '').trim();
    const durM = /(?:took|cost|elapsed[=:\s]|耗时|花费)[=:\s]*(\d+(?:\.\d+)?)\s*(ms|毫秒|s|秒)/i.exec(raw);
    let dur = null;
    if (durM) {
      dur = Number(durM[1]);
      if (/^s$|^秒$/i.test(durM[2])) dur *= 1000;
    }
    return { ts, level, lane, msg, raw, dur };
  }

  /* ---------- 渲染 ---------- */
  function render() {
    const text = $('ll-in').value;
    const { entries, failed } = parse(text);
    const errOnly = $('ll-err-only').checked;
    const showGaps = $('ll-gaps').checked;
    const kw = $('ll-q').value.trim().toLowerCase();
    let list = entries.filter(e =>
      (!errOnly || e.level === 'WARN' || e.level === 'ERROR' || e.level === 'FATAL')
      && (!kw || e.raw.toLowerCase().includes(kw)));

    renderStats(entries, list, failed);
    drawTimeline(list, showGaps);
    renderCluster(list);
    return list;
  }

  function renderStats(all, list, failed) {
    if (!all.length) {
      $('ll-stats').innerHTML = '<div class="stat"><b>—</b><span>粘贴日志或点「填入排查样例」</span></div>';
      return;
    }
    const span = all.length ? (all[all.length - 1].ts - all[0].ts) : 0;
    const errs = list.filter(e => e.level === 'ERROR' || e.level === 'FATAL').length;
    const warns = list.filter(e => e.level === 'WARN').length;
    const durs = list.filter(e => e.dur !== null);
    const slowest = durs.length ? Math.max(...durs.map(e => e.dur)) : null;
    const lanes = new Set(list.map(e => e.lane)).size;
    $('ll-stats').innerHTML = [
      ['条目', list.length, 'c-teal'], ['泳道(线程/服务)', lanes, ''],
      ['时间跨度', (span / 1000).toFixed(2) + 's', 'c-blue'],
      [failed ? `ERROR (${failed}行未解析)` : 'ERROR', errs, 'c-red'],
      ['WARN', warns, 'c-amber'],
      ['最慢耗时', slowest !== null ? slowest + 'ms' : '—', 'c-amber'],
    ].map(s => `<div class="stat ${s[2]}"><b>${s[1]}</b><span>${s[0]}</span></div>`).join('');
  }

  let hitList = [];   // 悬停命中用
  function drawTimeline(list, showGaps) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.parentElement.clientWidth || 900;
    const GAP_MS = 400;
    const lanes = [];
    for (const e of list) if (!lanes.includes(e.lane)) lanes.push(e.lane);
    const shown = lanes.slice(0, 16);
    const overflow = lanes.length - shown.length;
    const laneH = 36, head = 30;
    const H = list.length ? head + shown.length * laneH + 14 : 120;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, H);
    hitList = [];

    if (!list.length) {
      ctx.fillStyle = '#55637a';
      ctx.font = '13px ' + getComputedStyle(document.body).getPropertyValue('--sans');
      ctx.fillText('没有可解析的日志 —— 粘贴含时间戳的日志行，或点「填入排查样例」', 20, 60);
      $('ll-legend').innerHTML = '';
      return;
    }

    const t0 = list[0].ts, t1 = Math.max(list[list.length - 1].ts, t0 + 1);
    const L = 138, R = 16;
    const X = t => L + (t - t0) / (t1 - t0) * (w - L - R);

    // 时间轴刻度（相对 t0 的毫秒）
    const steps = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 30000, 60000];
    const span = t1 - t0;
    const step = steps.find(s => span / s <= 12) || 60000;
    ctx.font = '10.5px ' + getComputedStyle(document.body).getPropertyValue('--mono');
    for (let t = 0; t <= span + 1; t += step) {
      const x = X(t0 + t);
      ctx.strokeStyle = 'rgba(255,255,255,0.055)';
      ctx.beginPath(); ctx.moveTo(x, head - 6); ctx.lineTo(x, H - 8); ctx.stroke();
      ctx.fillStyle = '#55637a';
      ctx.fillText(t === 0 ? 'T+0' : '+' + t + 'ms', x + 3, head - 10);
    }
    // 泳道底色与标签
    shown.forEach((lane, i) => {
      const y = head + i * laneH;
      if (i % 2 === 0) { ctx.fillStyle = 'rgba(255,255,255,0.02)'; ctx.fillRect(L, y, w - L - R, laneH); }
      ctx.fillStyle = '#9fb3c8';
      ctx.font = '11.5px ' + getComputedStyle(document.body).getPropertyValue('--mono');
      const label = lane.length > 17 ? lane.slice(0, 16) + '…' : lane;
      ctx.fillText(label, 10, y + laneH / 2 + 4);
    });
    if (overflow > 0) {
      ctx.fillStyle = '#55637a';
      ctx.fillText(`…还有 ${overflow} 条泳道未显示`, 10, H - 2);
    }

    // 条目
    let gapCount = 0;
    shown.forEach((lane, li) => {
      const y = head + li * laneH + laneH / 2;
      const laneEntries = list.filter(e => e.lane === lane);
      let prev = null;
      for (const e of laneEntries) {
        const x = X(e.ts);
        // 大间隔标记
        if (showGaps && prev && e.ts - prev.ts > GAP_MS) {
          gapCount++;
          const x1 = X(prev.ts), x2 = x;
          ctx.strokeStyle = 'rgba(251,191,36,0.4)';
          ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#fbbf24';
          ctx.font = '10px ' + getComputedStyle(document.body).getPropertyValue('--mono');
          const label = '⏱ +' + (e.ts - prev.ts) + 'ms';
          ctx.fillText(label, (x1 + x2) / 2 - ctx.measureText(label).width / 2, y - 9);
        }
        // 时长条
        if (e.dur !== null && e.dur > 0) {
          const w2 = Math.max(3, X(e.ts + e.dur) - x);
          ctx.fillStyle = (LEVEL_COLOR[e.level] || '#4f8ef7') + '55';
          roundRect(ctx, x, y - 5, w2, 10, 4);
          ctx.fill();
          ctx.strokeStyle = (LEVEL_COLOR[e.level] || '#4f8ef7') + '99';
          ctx.stroke();
        }
        // 事件点
        ctx.beginPath();
        ctx.arc(x, y, e.level === 'ERROR' || e.level === 'FATAL' ? 5 : 3.6, 0, Math.PI * 2);
        ctx.fillStyle = LEVEL_COLOR[e.level] || '#4f8ef7';
        ctx.fill();
        if (e.level === 'ERROR' || e.level === 'FATAL') {
          ctx.strokeStyle = 'rgba(248,113,113,0.45)';
          ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke();
        }
        hitList.push({ x, y, e });
        prev = e;
      }
    });
    $('ll-legend').innerHTML = ['ERROR', 'WARN', 'INFO', 'DEBUG'].map(l =>
      `<span><i style="background:${LEVEL_COLOR[l]}"></i>${l}</span>`).join('')
      + `<span><i style="background:none;border:1px solid var(--muted)"></i>横条 = 有时长的事件（took/cost/耗时）</span>`
      + (gapCount ? `<span style="color:var(--amber)">⏱ ${gapCount} 处大间隔待排查</span>` : '');
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function renderCluster(list) {
    const errs = list.filter(e => e.level === 'ERROR' || e.level === 'FATAL');
    if (!errs.length) { $('ll-cluster').innerHTML = '<span class="hint">没有 ERROR</span>'; return; }
    const groups = new Map();
    for (const e of errs) {
      const tpl = e.msg.replace(/\b[0-9a-f-]{8,}\b/gi, 'H').replace(/\d+/g, 'N').replace(/\s+/g, ' ').slice(0, 90);
      if (!groups.has(tpl)) groups.set(tpl, { n: 0, first: e });
      groups.get(tpl).n++;
    }
    const rows = [...groups.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8);
    $('ll-cluster').innerHTML = rows.map(([tpl, g]) =>
      `<div class="cluster-row"><span class="cluster-n">×${g.n}</span><span class="cluster-t">${esc(tpl)}<span class="hint">　最早出现 T+${g.first.ts - list[0].ts}ms</span></span></div>`).join('');
  }

  /* ---------- 悬停 ---------- */
  canvas.addEventListener('mousemove', ev => {
    const rect = canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
    let best = null, bd = 12;
    for (const h of hitList) {
      const d = Math.hypot(h.x - mx, h.y - my);
      if (d < bd) { bd = d; best = h; }
    }
    if (best) {
      tip.style.display = 'block';
      tip.innerHTML = `<span style="color:${LEVEL_COLOR[best.e.level]}">${best.e.level}</span> <span style="color:var(--faint)">${laneOf(best.e)}</span><br>${esc(best.e.raw)}`;
      const px = Math.min(ev.clientX + 14, window.innerWidth - 500);
      tip.style.left = px + 'px';
      tip.style.top = (ev.clientY + 14) + 'px';
    } else tip.style.display = 'none';
  });
  canvas.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  canvas.addEventListener('click', ev => {
    const rect = canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
    let best = null, bd = 12;
    for (const h of hitList) {
      const d = Math.hypot(h.x - mx, h.y - my);
      if (d < bd) { bd = d; best = h; }
    }
    if (best && navigator.clipboard) {
      navigator.clipboard.writeText(best.e.raw).then(() => toast('已复制该行日志'));
    }
  });
  function laneOf(e) { return e.lane; }

  /* ---------- 绑定 ---------- */
  let deb;
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 1600);
  }

  $('ll-in').addEventListener('input', debounce(render, 250));
  $('ll-err-only').addEventListener('change', render);
  $('ll-gaps').addEventListener('change', render);
  $('ll-q').addEventListener('input', debounce(render, 200));
  $('ll-sample').addEventListener('click', () => { $('ll-in').value = SAMPLE; render(); });
  $('ll-clear').addEventListener('click', () => { $('ll-in').value = ''; render(); });
  window.addEventListener('resize', debounce(render, 200));

  // 源码链接
  const m = location.hostname.match(/^([\w-]+)\.github\.io$/);
  if (m) $('gh-link').href = `https://github.com/${m[1]}/${m[1]}.github.io`;
  else $('gh-link').style.display = 'none';

  render();
  $('ll-in').value = SAMPLE;
  render();
})();
