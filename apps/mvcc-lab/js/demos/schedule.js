/* ============ 冲突可串行化判定 ============ */
(function () {
  'use strict';

  const ITEMS = ['A', 'B', 'C'];
  const TXNS = ['T1', 'T2', 'T3'];

  function S(t, k, item) { return { t, k, item }; }
  const PRESETS = [
    {
      id: 'cycle2', name: '两事务成环', note: '各读对方要写的行 —— 读写依赖成环的经典形状',
      seq: [S('T1', 'r', 'A'), S('T2', 'r', 'B'), S('T1', 'w', 'B'), S('T1', 'c'), S('T2', 'w', 'A'), S('T2', 'c')],
    },
    {
      id: 'ok', name: '交错但可串行化', note: '所有冲突边指向同一方向，等价串行序 T1 → T2',
      seq: [S('T1', 'r', 'A'), S('T1', 'w', 'A'), S('T2', 'r', 'A'), S('T2', 'w', 'A'), S('T1', 'c'), S('T2', 'c')],
    },
    {
      id: 'cycle3', name: '三事务成环', note: 'T1→T2→T3→T1，三个事务互相咬住',
      seq: [S('T1', 'r', 'A'), S('T2', 'r', 'B'), S('T3', 'r', 'C'),
        S('T1', 'w', 'B'), S('T2', 'w', 'C'), S('T3', 'w', 'A'),
        S('T1', 'c'), S('T2', 'c'), S('T3', 'c')],
    },
    {
      id: 'ww', name: '只有 WW 冲突', note: '两个事务写同一行，没有读 —— 算不算边取决于定义',
      seq: [S('T1', 'w', 'A'), S('T2', 'w', 'A'), S('T1', 'c'), S('T2', 'c')],
    },
    {
      id: 'rr', name: '只读交错', note: '全程只有 r-r，永远不建边，所以怎么交错都安全',
      seq: [S('T1', 'r', 'A'), S('T2', 'r', 'A'), S('T1', 'r', 'B'), S('T2', 'r', 'C'), S('T1', 'c'), S('T2', 'c')],
    },
  ];

  function opText(s) {
    if (s.k === 'c') return `${s.t} 提交`;
    return `${s.t} ${s.k === 'r' ? '读' : '写'} ${s.item}`;
  }
  function mathText(s, idx) {
    const i = s.t.slice(1);
    if (s.k === 'c') return `c${i}`;
    return `${s.k}${i}[${s.item}]`;
  }

  function allTopoOrders(nodes, edges) {
    const out = [];
    const preds = {};
    nodes.forEach(n => (preds[n] = []));
    edges.forEach(e => { if (preds[e.to]) preds[e.to].push(e.from); });
    (function go(used) {
      if (used.length === nodes.length) { out.push(used.slice()); return; }
      nodes.forEach(n => {
        if (used.indexOf(n) >= 0) return;
        if (preds[n].some(p => used.indexOf(p) < 0)) return;
        go(used.concat([n]));
      });
    })([]);
    return out;
  }

  registerDemo({
    id: 'schedule', cat: '理论与判定', name: '冲突可串行化判定',
    desc: '自己搭一个交错调度，引擎实时构造优先图、做真正的环检测，成环就判不可串行化',
    keywords: 'serializability precedence graph conflict cycle detection 2PL schedule 可串行化',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="6" cy="7" r="2.6"/><circle cx="18" cy="7" r="2.6"/><circle cx="12" cy="18" r="2.6"/><path d="M8.4 8.4l7.2 0M16.4 9.2l-3.2 6.2M7.6 9.2l3.2 6.2"/></svg>',
    render(body) {
      let seq = PRESETS[0].seq.slice();
      let cur = seq.length;
      let useWW = true;

      body.innerHTML = `
        <div class="info-note">
          <b>判定算法只有两步：</b>① 扫所有操作对，同一数据项、至少一方是写、时间上在后 → 建一条 <code class="inline">Ti → Tj</code> 边；
          ② 对这张优先图做环检测。<b>无环 ⇔ 冲突可串行化</b>，有环就标出环上的边。下面全部实时算。
        </div>
        <div class="card">
          <div class="card-title"><span>调度序列</span><span class="hint" style="margin:0" id="sc-pos"></span></div>
          <div id="sc-add"></div>
          <div class="btn-row">
            <button class="btn sm" id="sc-back">回退一步</button>
            <button class="btn sm" id="sc-fwd">前进一步</button>
            <button class="btn sm" id="sc-all">全部纳入</button>
            <button class="btn sm" id="sc-clear">清空</button>
            <label class="chk fix" style="margin-left:auto"><input type="checkbox" id="sc-ww" checked>把 WW 冲突也记为边</label>
          </div>
          <div class="hint">预设调度：</div>
          <div class="btn-row" id="sc-presets"></div>
          <div class="sq" id="sc-sq" style="margin-top:12px"></div>
        </div>
        <div class="grid2">
          <div class="card">
            <div class="card-title"><span>优先图</span><span id="sc-gtag"></span></div>
            <div class="stage" id="sc-graph"></div>
            <div class="hint">红边 = 判定环上的边；边上标的是冲突类型与数据项。</div>
          </div>
          <div class="card">
            <div class="card-title">判定结论</div>
            <div id="sc-verdict"></div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">冲突对 → 边的来源</div>
          <div style="overflow-x:auto"><table class="tb" id="sc-cf"></table></div>
        </div>
        <div class="card">
          <div class="card-title"><span>2PL 视角</span><span class="hint" style="margin:0">读上 S 锁、写上 X 锁，提交时一次性释放</span></div>
          <div id="sc-2pl"></div>
        </div>
        <div class="card">
          <div class="card-title">面试要点</div>
          <pre class="out" style="white-space:pre-wrap">冲突可串行化是<b>充分不必要</b>条件：图无环 ⇒ 一定能等价重排成某个串行序；有环 ⇒ 这个交错必定不等价。代价是 O(n²) 求冲突对 + O(V+E) 查环，n 是语句数 —— 数据库不会真去跑它，它只是理论底线。
<b>r-r 永远不建边</b>，所以两个只读事务怎么交错都安全；这也是快照隔离下只读查询几乎不需要重试的根本原因。
WW 边算不算取决于定义：冲突可串行化算，PG 的 SSI 判定的却是<b>读写依赖环</b>（rw / dw），WW 由行锁直接挡掉，不进图。
2PL 是「产生可串行化调度」的充分机制：只要所有加锁都发生在解锁之前（增长期 → 收缩期），调度必无环。反过来不成立 —— 可串行化的调度可以来自非 2PL，所以图判定和锁协议是两件事，别混着答。
被边咬住的那一行往往就是业务里的热点行：把 <code class="inline">w1[A]</code> 与 <code class="inline">w2[A]</code> 放一起看，能直观理解为什么「同一行的并发更新」要么排队要么丢更新。</pre>
        </div>`;

      const $ = s => body.querySelector(s);
      $('#sc-presets').innerHTML = PRESETS.map(p => `<button class="btn sm" data-id="${p.id}">${ML.esc(p.name)}</button>`).join('');
      $('#sc-presets').addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        const p = PRESETS.find(x => x.id === b.dataset.id);
        seq = p.seq.slice();
        cur = seq.length;
        draw();
        ML.toast(p.note);
      });

      /* 添加操作 */
      function addPanel() {
        const used = TXNS.filter(t => seq.some(s => s.t === t));
        const list = used.length ? used : ['T1', 'T2'];
        const rows = list.map(t => {
          const btns = [];
          ITEMS.forEach(it => btns.push(`<button class="btn sm" data-t="${t}" data-k="r" data-i="${it}">读 ${it}</button>`));
          ITEMS.forEach(it => btns.push(`<button class="btn sm primary" data-t="${t}" data-k="w" data-i="${it}">写 ${it}</button>`));
          btns.push(`<button class="btn sm teal" data-t="${t}" data-k="c">提交</button>`);
          return `<div class="tbl-line"><span class="k" style="flex:0 0 40px;font-weight:700;color:var(--muted)">${t}</span>
            <span style="display:flex;flex-wrap:wrap;gap:6px">${btns.join('')}</span></div>`;
        }).join('');
        const extra = TXNS.filter(t => list.indexOf(t) < 0);
        return `<div class="tbl-state">${rows}</div>` +
          (extra.length ? `<div class="btn-row"><button class="btn sm" id="sc-more" data-t="${extra[0]}">引入 ${ML.esc(extra[0])}（先加一条读）</button></div>` : '');
      }
      function bindAdd() {
        $('#sc-add').querySelectorAll('button[data-t]').forEach(b => {
          b.addEventListener('click', () => {
            const rec = { t: b.dataset.t, k: b.dataset.k };
            if (rec.k !== 'c') rec.item = b.dataset.i;
            seq = seq.slice(0, cur).concat([rec], seq.slice(cur));
            cur++;
            draw();
          });
        });
        const m = $('#sc-more');
        if (m) m.addEventListener('click', () => {
          const t = m.dataset.t;
          const it = ITEMS[seq.filter(s => s.item === 'C').length ? 0 : 2];
          seq = seq.slice(0, cur).concat([{ t, k: 'r', item: it }], seq.slice(cur));
          cur++;
          draw();
        });
      }

      function sqPanel() {
        if (!seq.length) return '<div class="hint">序列为空，点上面的按钮加操作，或选一个预设调度。</div>';
        const graph = build();
        const preToSeq = [];
        seq.slice(0, cur).forEach((s, i) => { if (s.k !== 'c') preToSeq.push(i); });
        const cfIdx = new Set();
        graph.pairs.forEach(p => { cfIdx.add(preToSeq[p.i]); cfIdx.add(preToSeq[p.j]); });
        return seq.map((s, i) => {
          const faded = i >= cur;
          return `<div class="sq-row${i === cur - 1 ? ' on' : ''}" style="${faded ? 'opacity:.38' : ''}">` +
            `<span class="sq-i">${i + 1}</span>` +
            `<span class="sq-t ${s.t.toLowerCase()}">${s.t}</span>` +
            `<span class="sq-op">${ML.esc(mathText(s))} <span style="color:var(--faint)">· ${ML.esc(opText(s))}</span></span>` +
            `<span class="sq-cf">${faded ? '<span class="badge b-gray">未纳入</span>' : (cfIdx.has(i) ? '<span class="badge b-blue">参与冲突</span>' : '<span class="badge b-gray">无冲突</span>')}</span>` +
            `<span class="sq-btns">` +
            `<button data-act="up" data-i="${i}"${i === 0 ? ' disabled' : ''}>↑</button>` +
            `<button data-act="down" data-i="${i}"${i === seq.length - 1 ? ' disabled' : ''}>↓</button>` +
            `<button data-act="del" data-i="${i}">删</button></span></div>`;
        }).join('');
      }
      function bindSq() {
        $('#sc-sq').querySelectorAll('button[data-act]').forEach(b => {
          b.addEventListener('click', () => {
            const i = Number(b.dataset.i), act = b.dataset.act;
            if (!Number.isInteger(i) || i < 0 || i >= seq.length) return;
            const s = seq.slice();
            if (act === 'del') s.splice(i, 1);
            else {
              const j = act === 'up' ? i - 1 : i + 1;
              if (j < 0 || j >= s.length) return;
              const tmp = s[i]; s[i] = s[j]; s[j] = tmp;
            }
            seq = s;
            cur = Math.min(cur, seq.length);
            draw();
          });
        });
      }

      function build() {
        const pre = seq.slice(0, cur).filter(s => s.k !== 'c');
        const g = MVCC.conflictGraph(pre);
        const edges = useWW ? g.edges : g.edges.filter(e => e.types.indexOf('WW') < 0 || e.types.length > 1);
        const pairs = [];
        edges.forEach(e => e.pairs.forEach(p => { if (useWW || p.type !== 'WW') pairs.push(Object.assign({ edge: e }, p)); }));
        const nodes = [];
        seq.slice(0, cur).forEach(s => { if (nodes.indexOf(s.t) < 0) nodes.push(s.t); });
        const adj = MVCC.adjOf(nodes, edges);
        const cyc = MVCC.findCycle(nodes, adj);
        const cycEdges = [];
        if (cyc) for (let i = 0; i < cyc.length - 1; i++) {
          const e = edges.find(x => x.from === cyc[i] && x.to === cyc[i + 1]);
          if (e) cycEdges.push(e);
        }
        return { pre, nodes, edges, pairs, cyc, cycEdges, adj, orders: cyc ? [] : allTopoOrders(nodes, edges) };
      }

      function graphSVG(b) {
        const nodes = b.nodes;
        if (!nodes.length) return '<div class="hint" style="padding:10px">还没有操作。</div>';
        const W = 420, H = 260, cx = W / 2, cy = H / 2 + 6, R = nodes.length > 2 ? 96 : 84;
        const pos = {};
        nodes.forEach((n, i) => {
          const a = -Math.PI / 2 + i * 2 * Math.PI / nodes.length;
          pos[n] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
        });
        let s = `<svg class="pg-svg" viewBox="0 0 ${W} ${H}" style="width:100%" role="img" aria-label="优先图">`;
        s += `<defs><marker id="pg-a" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0 0L9 4.5L0 9z" fill="var(--teal)"/></marker>` +
          `<marker id="pg-ac" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0 0L9 4.5L0 9z" fill="var(--red)"/></marker></defs>`;
        b.edges.forEach(e => {
          const p1 = pos[e.from], p2 = pos[e.to];
          if (!p1 || !p2) return;
          const inCyc = b.cycEdges.indexOf(e) >= 0;
          const single = e.from === e.to;
          const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
          const dx = p2.x - p1.x, dy = p2.y - p1.y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len, ny = dx / len;
          const bow = nodes.length > 2 ? 10 : 14;
          const sx = p1.x + dx / len * 26, sy = p1.y + dy / len * 26;
          const ex = p2.x - dx / len * 28, ey = p2.y - dy / len * 28;
          const ccx = mx + nx * bow, ccy = my + ny * bow;
          if (single) return;
          s += `<path class="ce${inCyc ? ' cyc' : ''}" d="M${sx} ${sy} Q ${ccx} ${ccy} ${ex} ${ey}" marker-end="url(#${inCyc ? 'pg-ac' : 'pg-a'})"/>`;
          const lx = (sx + 2 * ccx + ex) / 4, ly = (sy + 2 * ccy + ey) / 4;
          s += `<text class="ce-lbl${inCyc ? ' cyc' : ''}" x="${lx}" y="${ly}" text-anchor="middle">${ML.esc(e.types.join('+') + ' · ' + e.item)}</text>`;
        });
        nodes.forEach(n => {
          const p = pos[n];
          const inCyc = b.cyc && b.cyc.indexOf(n) >= 0;
          s += `<g class="nd${inCyc ? ' on' : ''}"><circle cx="${p.x}" cy="${p.y}" r="24"/>` +
            `<text x="${p.x}" y="${p.y + 5}">${ML.esc(n)}</text></g>`;
        });
        s += '</svg>';
        return s;
      }

      function verdict(b) {
        const tag = $('#sc-gtag');
        if (!b.pre.length) { tag.textContent = ''; return '<div class="hint">加几条操作就有结论了。</div>'; }
        if (!b.edges.length) {
          tag.innerHTML = '<span class="badge b-green">无冲突</span>';
          return `<div class="verdict v-ok"><h4>冲突可串行化</h4><ul><li>参与的操作里没有任何同数据项的读写冲突（全为 r-r，或数据项互不相同）</li>` +
            `<li>优先图 ${b.nodes.length} 个顶点、0 条边，环检测直接通过</li></ul>` +
            `<div class="v-why">串行等价顺序：${ML.esc(b.orders.slice(0, 4).map(o => o.join(' → ')).join(' ｜ '))}</div></div>`;
        }
        if (b.cyc) {
          tag.innerHTML = '<span class="badge b-red">有环</span>';
          return `<div class="verdict v-bad"><h4>不可冲突串行化</h4><ul>` +
            `<li>环检测在优先图里找到环：<b>${ML.esc(b.cyc.join(' → '))}</b></li>` +
            b.cycEdges.map(e => `<li>边 ${ML.esc(e.from)} → ${ML.esc(e.to)}（${ML.esc(e.types.join('+'))} 冲突，数据项 ${ML.esc(e.item)}，第 ${e.pairs[0].i + 1} 与第 ${e.pairs[0].j + 1} 个操作）</li>`).join('') +
            `<li>顶点数 ${b.nodes.length}，边数 ${b.edges.length}，冲突对 ${b.pairs.length} 组</li></ul>` +
            `<div class="v-why">任何串行顺序都无法产生同样的读写结果；数据库要拦它，只能靠锁等待或回滚其中一个事务。</div></div>`;
        }
        tag.innerHTML = '<span class="badge b-green">无环</span>';
        const ord = b.orders[0];
        return `<div class="verdict v-ok"><h4>冲突可串行化</h4><ul>` +
          `<li>拓扑排序成功，等价串行序之一：<b>${ML.esc((ord || []).join(' → '))}</b>${b.orders.length > 1 ? `（共 ${b.orders.length} 个可行串行序）` : ''}</li>` +
          `<li>边数 ${b.edges.length}，冲突对 ${b.pairs.length} 组，全部指向同一方向，没有回路</li></ul>` +
          `<div class="v-why">引擎用 DFS 三色标记查环：找到回边即判不可串行化，找不到则回边为空、给出拓扑序。</div></div>`;
      }

      function cfTable(b) {
        if (!b.pairs.length) return '<thead></thead><tbody><tr><td colspan="5" style="color:var(--faint)">当前前缀里没有冲突对</td></tr></tbody>';
        const head = '<thead><tr><th>#</th><th>数据项</th><th>在先的操作</th><th>在后的操作</th><th>冲突类型 → 边</th></tr></thead>';
        const rows = b.pairs.slice(0, 24).map((p, i) => {
          const a = b.pre[p.i], c = b.pre[p.j];
          return `<tr><td>${i + 1}</td><td>${ML.esc(p.item)}</td>` +
            `<td>${ML.esc(mathText(a))} <span style="color:var(--faint)">（第 ${p.i + 1} 步）</span></td>` +
            `<td>${ML.esc(mathText(c))} <span style="color:var(--faint)">（第 ${p.j + 1} 步）</span></td>` +
            `<td><span class="badge ${p.type === 'RW' ? 'b-amber' : p.type === 'WR' ? 'b-blue' : 'b-accent'}">${p.type}</span> ${ML.esc(p.edge.from)} → ${ML.esc(p.edge.to)}</td></tr>`;
        }).join('');
        return head + '<tbody>' + rows + '</tbody>' +
          (b.pairs.length > 24 ? `<tbody><tr><td colspan="5" class="hint">另有 ${b.pairs.length - 24} 组同类冲突，已合并到同一条边上</td></tr></tbody>` : '');
      }

      function plPanel(b) {
        const full = seq.slice(0, cur);
        const r = MVCC.twoPL(full);
        const head = '<thead><tr><th>类别</th><th>结果</th><th>说明</th></tr></thead>';
        const serializable = !b.cyc && !!b.pre.length;
        const rows = [
          `<tr><td class="mx-row-h">是否遵守 2PL</td><td>${r.ok ? '<span class="badge b-green">遵守</span>' : '<span class="badge b-red">违反</span>'}</td>` +
          `<td>${r.blocks.length ? r.blocks.map(x => `第 ${x.i + 1} 步 ${ML.esc(mathText(full[x.i]))} 想上 ${x.mode} 锁，但 ${ML.esc(x.item)} 被 ${ML.esc(x.wait)} 占着 → 真实系统在这里<b>阻塞</b>`).join('<br>') : '没有锁请求彼此冲突，也没有在释放锁后再申请'}</td></tr>`,
          `<tr><td class="mx-row-h">收缩期违规</td><td>${r.violations.length ? `<span class="badge b-amber">${r.violations.length} 处</span>` : '<span class="badge b-green">无</span>'}</td>` +
          `<td>${r.violations.length ? r.violations.map(v => `第 ${v.i + 1} 步 ${ML.esc(v.t)} 在 ${ML.esc(v.why)}`).join('<br>') : '所有加锁都在解锁之前完成（增长期 → 收缩期）'}</td></tr>`,
          `<tr><td class="mx-row-h">两件事的关系</td><td colspan="2">${serializable && r.ok ? '这个调度既可串行化又来自 2PL —— 2PL 是可串行化的<b>充分</b>机制' :
            serializable && !r.ok ? '调度本身可串行化，但这个交错不可能由 2PL 产生（锁会先把它挡住）' :
              !serializable && r.ok ? '奇怪：无环判定不成立但 2PL 没挡住 —— 说明模型里锁粒度与实际读写集不一致' :
                '不可串行化且 2PL 会在冲突处阻塞 —— 现实中就是靠这个阻塞把环掐死在形成之前'}</td></tr>`,
        ].join('');
        return `<div style="overflow-x:auto"><table class="tb">${head}<tbody>${rows}</tbody></table></div>` +
          `<div class="hint">模拟规则：读上 S 锁、写上 X 锁；S-S 兼容，其他组合冲突；提交语句一次性释放该事务的全部锁。</div>`;
      }

      function draw() {
        const b = build();
        $('#sc-add').innerHTML = addPanel();
        bindAdd();
        $('#sc-pos').textContent = `已纳入前 ${cur} / ${seq.length} 步参与判定`;
        $('#sc-sq').innerHTML = sqPanel();
        bindSq();
        $('#sc-graph').innerHTML = graphSVG(b);
        $('#sc-verdict').innerHTML = verdict(b);
        $('#sc-cf').innerHTML = cfTable(b);
        $('#sc-2pl').innerHTML = plPanel(b);
      }

      $('#sc-back').addEventListener('click', () => { cur = Math.max(0, cur - 1); draw(); });
      $('#sc-fwd').addEventListener('click', () => { cur = Math.min(seq.length, cur + 1); draw(); });
      $('#sc-all').addEventListener('click', () => { cur = seq.length; draw(); });
      $('#sc-clear').addEventListener('click', () => { seq = []; cur = 0; draw(); });
      $('#sc-ww').addEventListener('change', e => { useWW = e.target.checked; draw(); });
      draw();
    },
  });
})();
