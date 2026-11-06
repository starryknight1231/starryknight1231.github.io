/* ============ 版本链与 Read View ============ */
(function () {
  'use strict';

  /* 事务事件表：每个 tick 可能开始 / 首次读 / 写 / 结束。所有可见性由此推导。 */
  const TXS = [
    { xid: 600, begin: 0, read: 0, end: 0, outcome: 'committed', write: { tick: 0, val: 100 } },
    { xid: 601, begin: 2, read: 2, end: 4, outcome: 'aborted', write: { tick: 3, val: 110 } },
    { xid: 602, begin: 2, read: 3, end: null, outcome: null, write: null },
    { xid: 603, begin: 5, read: 5, end: 6, outcome: 'committed', write: { tick: 5, val: 120 } },
    { xid: 604, begin: 6, read: 6, end: 10, outcome: 'committed', write: { tick: 9, val: 130 } },
    { xid: 605, begin: 7, read: 7, end: 8, outcome: 'aborted', write: { tick: 7, val: 140 } },
    { xid: 606, begin: 9, read: 9, end: 12, outcome: 'committed', write: { tick: 11, val: 150 } },
    { xid: 607, begin: 13, read: 13, end: null, outcome: null, write: null },
  ];
  const TICKS = 14;
  const findTx = xid => TXS.find(x => x.xid === xid);
  const W = TXS.filter(x => x.write).sort((a, b) => a.write.tick - b.write.tick);

  const startedAt = (x, t) => x.begin <= t;
  const endedAt = (x, t) => x.end !== null && t >= x.end;
  function statusAt(x, t) {
    if (!x) return 'committed';
    if (!startedAt(x, t)) return 'future';
    return endedAt(x, t) ? x.outcome : 'active';
  }
  const statusOfXid = (xid, t) => statusAt(findTx(xid), t);

  function nextXidAt(t) {
    const st = TXS.filter(x => x.begin <= t).map(x => x.xid);
    return st.length ? Math.max.apply(null, st) + 1 : TXS[0].xid + 1;
  }
  /** 在 rTick 时刻生成的 Read View（self=0 表示不属于任何事务） */
  function viewAt(rTick, self) {
    const xip = TXS.filter(x => x.xid !== self && startedAt(x, rTick) && !endedAt(x, rTick))
      .map(x => x.xid).sort((a, b) => a - b);
    return { xmin: xip.length ? xip[0] : nextXidAt(rTick), xmax: nextXidAt(rTick), xip, at: rTick, self };
  }
  const observerView = (obs, t) => obs === 'now' ? viewAt(t, 0) : viewAt(findTx(Number(obs)).read, Number(obs));

  /* 每次写入取代「写入当时仍然存活」的那个版本 —— 回滚掉的历史版本不在活跃链上 */
  function targetOf(i, t) {
    const w = W[i];
    const tt = t === null ? w.write.tick : t;
    for (let j = i - 1; j >= 0; j--) {
      if (W[j].write.tick > tt) continue;
      if (statusAt(findTx(W[j].xid), tt) === 'committed') return W[j];
    }
    return null;
  }

  function versionsAt(t) {
    const idxs = [];
    W.forEach((x, i) => { if (x.write.tick <= t) idxs.push(i); });
    const vers = idxs.map(i => ({
      xmin: W[i].xid, xmax: 0, val: W[i].write.val, status: statusAt(W[i], t), born: W[i].write.tick,
    }));
    idxs.forEach(i => {
      const tgt = targetOf(i, t);
      if (!tgt) return;
      const tv = vers.find(v => v.xmin === tgt.xid);
      if (tv) tv.xmax = W[i].xid;
    });
    return vers;
  }

  function visibleVers(t, obs) {
    const view = observerView(obs, t), self = obs === 'now' ? 0 : Number(obs);
    return versionsAt(t).filter(v => MVCC.isVisible(v, view, self, x => statusOfXid(x, t)));
  }

  registerDemo({
    id: 'version', cat: '事务引擎', name: '版本链与 Read View',
    desc: '拖动时间轴看一行数据的版本链生长，用 PG 的快照规则逐步判定每个版本对某事务是否可见',
    keywords: 'MVCC read view xmin xmax xip 版本链 可见性 heap Pruning vacuum',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="7" cy="6" r="2.6"/><circle cx="7" cy="12" r="2.6"/><circle cx="7" cy="18" r="2.6"/><path d="M12 6h8M12 12h5M12 18h8"/><path d="M17.5 9.5V12" stroke-dasharray="2 2"/></svg>',
    render(body) {
      let tick = 8;
      let obs = '602';
      let cmp = 'none';
      let picked = null;

      body.innerHTML = `
        <div class="info-note">
          <b>规则：</b>一行数据在表里物理上可以有多个版本，每个版本记着 <code class="inline">xmin</code>（谁创建）和
          <code class="inline">xmax</code>（谁删除/取代）。事务读到的那一版由它的 Read View
          <code class="inline">{xmin, xmax, xip}</code> 决定。下面每个结论都是按这套规则现算的。
        </div>
        <div class="card">
          <div class="card-title"><span>时间轴</span><span class="badge b-accent" id="vv-tick-tag"></span></div>
          <input type="range" id="vv-slider" min="0" max="${TICKS}" step="1" value="${tick}">
          <div class="hint" id="vv-events"></div>
          <div class="row" style="margin-top:10px">
            <div>
              <label class="fld">观察者（读视图取自它的第一条语句）</label>
              <select id="vv-obs"></select>
            </div>
            <div>
              <label class="fld">对比另一个快照</label>
              <select id="vv-cmp"></select>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-title"><span>版本链（只画当前时刻已存在的版本）</span><span id="vv-count"></span></div>
          <div class="stage" id="vv-chain"></div>
          <div class="legend">
            <span><i style="background:rgba(79,112,56,.25);border:1px solid var(--green)"></i>对观察者可见</span>
            <span><i style="background:var(--plate);border:1px solid var(--border-strong)"></i>不可见</span>
            <span><i style="background:rgba(168,69,47,.15);border:1px dashed var(--red)"></i>创建者已回滚</span>
            <span><i style="background:rgba(138,106,31,.16);border:1px solid var(--amber)"></i>创建者还在跑</span>
          </div>
          <div class="hint">点任意一个版本，右侧给出完整判定过程。</div>
        </div>
        <div class="grid2">
          <div class="card">
            <div class="card-title">判定过程</div>
            <div id="vv-trace"></div>
          </div>
          <div class="card">
            <div class="card-title">当前可见结果</div>
            <div id="vv-res"></div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">读视图对照表（按当前 tick 实时算出）</div>
          <div style="overflow-x:auto"><table class="tb" id="vv-views"></table></div>
          <div class="hint">xip = 生成快照那一刻仍在运行的其他事务号；xmin = min(xip)（空则为 nextXid）；xmax = 当时的 nextXid。</div>
        </div>
        <div class="card">
          <div class="card-title">面试要点</div>
          <pre class="out" style="white-space:pre-wrap">比较顺序有捷径：<b>xmin &lt; 快照.xmin</b> 说明创建者在快照前就结束，不必再查它是否提交 —— 但仍要处理「它回滚了」这一种情况（PG 在版本上记 hint 位，回滚过的直接判死）。
<b>xmax</b> 的判定方向相反：删除者只要「在快照之后才提交」或「快照时还在跑」，这一行在快照里就还活着。所以长事务能一直读到它开始时的旧版本 —— 这就是表膨胀，也是 vacuum 只能清理「对所有活跃快照都不再可见」的版本的原因。
xip 是快照的真实成本：取快照要把当时所有在跑的事务号拷进数组，活跃事务越多、数组越长、比较越贵。
读视图只管「看得见哪些版本」，不管锁。写操作要用 current read（取最新已提交版本），与快照读是两套读法 —— 一个事务里混用这两套，才让写偏斜有洞可钻。</pre>
        </div>`;

      const $ = sel => body.querySelector(sel);
      const obsOptions = () => [{ v: 'now', n: `当前时刻（t=${tick}）新取的读视图` }]
        .concat(TXS.filter(x => x.begin <= tick).map(x => ({ v: String(x.xid), n: `xid=${x.xid}（快照取自 t=${x.read}）` })));

      function fillSelect(sel, cur, list) {
        const keep = list.some(o => o.v === cur);
        sel.innerHTML = list.map(o => `<option value="${ML.esc(o.v)}">${ML.esc(o.n)}</option>`).join('');
        if (!keep) cur = list[0].v;
        sel.value = cur;
        return cur;
      }

      function chainSVG() {
        const vers = versionsAt(tick);
        const vis = visibleVers(tick, obs).map(v => v.xmin);
        if (!vers.length) return '<div class="hint" style="padding:10px">这一行还没有任何版本。</div>';
        const bw = 118, step = 152, left = 30, top = 30, H = 150;
        const Wd = left + vers.length * step + 10;
        const cx = i => left + i * step + bw / 2;
        let s = `<svg class="lanes-svg" viewBox="0 0 ${Wd} ${H}" style="width:100%" role="img" aria-label="版本链">`;
        s += `<defs><marker id="vvarr" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8z" fill="var(--border-strong)"/></marker></defs>`;
        vers.forEach((v, i) => {
          const x = cx(i), y = top + 56;
          const isVisible = vis.indexOf(v.xmin) >= 0;
          const stroke = v.status === 'aborted' ? 'var(--red)' : v.status === 'active' ? 'var(--amber)' : isVisible ? 'var(--green)' : 'var(--border-strong)';
          const fill = v.status === 'aborted' ? 'rgba(168,69,47,.1)' : v.status === 'active' ? 'rgba(138,106,31,.12)' : isVisible ? 'rgba(79,112,56,.12)' : 'var(--plate)';
          const dash = v.status === 'aborted' ? ' stroke-dasharray="5 4"' : '';
          s += `<g class="vnode" data-x="${v.xmin}" style="cursor:pointer">`;
          s += `<rect x="${x - bw / 2}" y="${y - 30}" width="${bw}" height="64" rx="9" fill="${fill}" stroke="${stroke}" stroke-width="${picked === v.xmin ? 3.2 : 1.6}"${dash}/>`;
          s += `<text class="op-sql" x="${x}" y="${y - 12}" text-anchor="middle">v = ${ML.esc(v.val)}</text>`;
          s += `<text class="op-pending" x="${x}" y="${y + 6}" text-anchor="middle">xmin ${v.xmin}</text>`;
          s += `<text class="op-pending" x="${x}" y="${y + 21}" text-anchor="middle">xmax ${v.xmax || '0'}</text>`;
          s += `<text class="tick-t" x="${x}" y="${y - 38}" text-anchor="middle">t=${v.born} 写入</text>`;
          s += '</g>';
          if (i < vers.length - 1) {
            const x1 = x + bw / 2 + 2, x2 = cx(i + 1) - bw / 2 - 2;
            s += `<path d="M${x1} ${y} L${x2} ${y}" stroke="var(--border-strong)" stroke-width="1.4" marker-end="url(#vvarr)"/>`;
          }
        });
        s += '</svg>';
        return s;
      }

      function tracePanel() {
        const vers = versionsAt(tick);
        if (picked === null || !vers.some(v => v.xmin === picked)) picked = vers.length ? vers[vers.length - 1].xmin : null;
        if (picked === null) return '<div class="hint">暂无版本。</div>';
        const v = vers.find(x => x.xmin === picked);
        const mk = o => {
          const view = observerView(o, tick), self = o === 'now' ? 0 : Number(o);
          const tr = MVCC.traceVisible(v, view, self, x => statusOfXid(x, tick));
          const who = o === 'now' ? `当前时刻新读视图` : `事务 ${o}`;
          return `<div class="trace"><div class="chain-row" style="margin-bottom:6px"><b>${ML.esc(who)}</b>` +
            `<span class="badge ${tr.visible ? 'b-green' : 'b-red'}">${tr.visible ? '可见' : '不可见'}</span></div>` +
            tr.steps.map(s => `<div class="tr-step"><span class="tr-mark ${s.cls}">${s.mark}</span><span class="tr-txt">${ML.esc(s.txt)}</span></div>`).join('') +
            `<div class="verdict-line ${tr.visible ? 'v-ok' : 'v-no'}">${tr.visible ? `结论：${ML.esc(who)} 读到的就是这一版（v=${v.val}）` : '结论：这一版被跳过，继续往链下找一个可见版本'}</div></div>`;
        };
        let out = mk(obs);
        if (cmp !== 'none') out = `<div class="grid2">${`<div>${mk(obs)}</div><div>${mk(cmp)}</div>`}</div>`;
        return out;
      }

      function resPanel() {
        const vis = visibleVers(tick, obs);
        const who = obs === 'now' ? '当前时刻' : `事务 ${obs}`;
        const rows = versionsAt(tick).map(v => {
          const s = statusAt(findTx(v.xmin), tick);
          return `<tr><td>v=${ML.esc(v.val)}</td><td>${v.xmin}</td><td>${v.xmax || '0'}</td>` +
            `<td>${ML.esc(s === 'active' ? '仍在运行' : s === 'committed' ? '已提交' : s === 'aborted' ? '已回滚' : '尚未开始')}</td>` +
            `<td>${vis.some(x => x.xmin === v.xmin) ? '<span class="badge b-green">可见</span>' : '<span class="badge b-gray">跳过</span>'}</td></tr>`;
        }).join('');
        return `<div class="stat-grid" style="margin-bottom:10px">` +
          `<div class="stat c-accent"><b>${vis.length}</b><span>${ML.esc(who)} 可见版本数</span></div>` +
          `<div class="stat ${vis.length ? 'c-green' : 'c-red'}"><b>${vis.length ? vis[0].val : '∅'}</b><span>实际读到的值</span></div>` +
          `<div class="stat"><b>${versionsAt(tick).length}</b><span>已生成的物理版本</span></div></div>` +
          `<table class="tb"><thead><tr><th>版本</th><th>xmin</th><th>xmax</th><th>创建者状态</th><th>对 ${ML.esc(who)}</th></tr></thead><tbody>${rows || '<tr><td colspan="5">暂无</td></tr>'}</tbody></table>` +
          `<div class="hint">读的是「 newest → oldest 第一个可见版本」，所以上面读到的值取自已排序后的第一个命中版本。</div>`;
      }

      function viewsTable() {
        const head = '<thead><tr><th>xid</th><th>开始</th><th>取快照</th><th>结束</th><th>xmin / xmax / xip（按各自快照时刻）</th><th>当前状态</th><th>可见版本</th></tr></thead>';
        const rows = TXS.map(x => {
          if (!startedAt(x, tick)) return `<tr><td>${x.xid}</td><td colspan="6" style="color:var(--faint)">t=${x.begin} 才开始，此刻尚不存在</td></tr>`;
          const v = viewAt(x.read, x.xid);
          const seen = versionsAt(tick).filter(ve => MVCC.isVisible(ve, v, x.xid, id => statusOfXid(id, tick))).map(ve => `v=${ve.val}`);
          const s = statusAt(x, tick);
          return `<tr${obs === String(x.xid) ? ' style="background:var(--accent-soft)"' : ''}><td><b>${x.xid}</b></td><td>${x.begin}</td><td>${x.read}</td>` +
            `<td>${x.end === null ? '还没结束' : x.end + (x.outcome === 'aborted' ? ' 回滚' : ' 提交')}</td>` +
            `<td>${v.xmin} / ${v.xmax} / [${v.xip.join(', ') || '空'}]</td>` +
            `<td>${ML.esc(s === 'active' ? '运行中' : s === 'committed' ? '已提交' : '已回滚')}</td>` +
            `<td>${ML.esc(seen.join(' ← ') || '无')}${seen.length ? `<span class="hint" style="margin:0 0 0 6px">读到 ${seen[0]}</span>` : ''}</td></tr>`;
        }).join('');
        return head + '<tbody>' + rows + '</tbody>';
      }

      function draw() {
        $('#vv-slider').value = tick;
        $('#vv-tick-tag').textContent = `t = ${tick}`;
        const ev = TXS.filter(x => x.begin === tick).map(x => `${x.xid} 开始`)
          .concat(TXS.filter(x => x.write && x.write.tick === tick).map(x => `${x.xid} 写入 v=${x.write.val}`))
          .concat(TXS.filter(x => x.end === tick).map(x => `${x.xid} ${x.outcome === 'aborted' ? '回滚' : '提交'}`));
        $('#vv-events').textContent = ev.length ? `第 ${tick} 拍发生了：${ev.join('；')}` : `第 ${tick} 拍没有新事件，状态与上一拍相同`;
        const list = obsOptions();
        obs = fillSelect($('#vv-obs'), obs, list);
        cmp = fillSelect($('#vv-cmp'), cmp, [{ v: 'none', n: '不对比' }].concat(list.filter(o => o.v !== obs)));
        $('#vv-chain').innerHTML = chainSVG();
        $('#vv-chain').querySelectorAll('.vnode').forEach(g => {
          g.addEventListener('click', () => { picked = Number(g.dataset.x); draw(); });
        });
        const vis = visibleVers(tick, obs);
        $('#vv-count').innerHTML = `<span class="badge ${vis.length ? 'b-green' : 'b-red'}">${vis.length ? '可见 ' + vis.length + ' 版，读到 v=' + vis[0].val : '无可见版本'}</span>`;
        $('#vv-trace').innerHTML = tracePanel();
        $('#vv-res').innerHTML = resPanel();
        $('#vv-views').innerHTML = viewsTable();
      }

      $('#vv-slider').addEventListener('input', ML.debounce(e => { tick = Number(e.target.value); draw(); }, 40));
      $('#vv-obs').addEventListener('change', e => { obs = e.target.value; picked = null; draw(); });
      $('#vv-cmp').addEventListener('change', e => { cmp = e.target.value; draw(); });
      draw();
    },
  });
})();
