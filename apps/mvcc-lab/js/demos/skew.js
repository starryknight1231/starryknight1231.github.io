/* ============ 快照隔离下的写偏斜 ============ */
(function () {
  'use strict';

  const invariant = vals => {
    const s = (vals.alice === null || vals.alice === undefined ? 0 : vals.alice) +
      (vals.bob === null || vals.bob === undefined ? 0 : vals.bob);
    return { ok: s >= 1, expr: 'on_call(alice) + on_call(bob) >= 1', sum: s };
  };
  const enough = lr => (lr.alice || 0) + (lr.bob || 0) >= 2;

  const plain = [
    { t: 'T1', op: 'begin' }, { t: 'T2', op: 'begin' },
    { t: 'T1', op: 'read', item: 'alice' }, { t: 'T1', op: 'read', item: 'bob' },
    { t: 'T2', op: 'read', item: 'alice' }, { t: 'T2', op: 'read', item: 'bob' },
    { t: 'T1', op: 'write', item: 'alice', val: 0, valText: 0, check: enough },
    { t: 'T2', op: 'write', item: 'bob', val: 0, valText: 0, check: enough },
    { t: 'T1', op: 'commit' }, { t: 'T2', op: 'commit' },
  ];
  const locked = [
    { t: 'T1', op: 'begin' },
    { t: 'T1', op: 'forUpdate', item: 'alice' }, { t: 'T1', op: 'forUpdate', item: 'bob' },
    { t: 'T2', op: 'begin' },
    { t: 'T2', op: 'forUpdate', item: 'alice' },
    { t: 'T1', op: 'write', item: 'alice', val: 0, valText: 0, check: enough },
    { t: 'T1', op: 'commit' },
    { t: 'T2', op: 'forUpdate', item: 'bob' },
    { t: 'T2', op: 'write', item: 'bob', val: 0, valText: 0, check: enough },
    { t: 'T2', op: 'commit' },
  ];

  const MODES = [
    { id: 'si', name: '快照隔离（默认）', level: 'SI', script: plain, sql: 'SELECT on_call FROM doctor WHERE name=?',
      brief: '检查用的是快照读，写的是不同行 —— 谁也不挡谁' },
    { id: 'fu', name: 'SI + SELECT FOR UPDATE', level: 'SI', script: locked, sql: 'SELECT on_call FROM doctor WHERE name=? FOR UPDATE',
      brief: '检查改为对当前版本加行锁：第二个会话必须排队，且重新读到最新值' },
    { id: 'ser', name: '串行化', level: 'SER', script: plain, sql: 'SET TRANSACTION ISOLATION LEVEL SERIALIZABLE',
      brief: '读也要加锁（模型：2PL + 谓词锁），两边互相等 → 等待图成环' },
  ];

  registerDemo({
    id: 'skew', cat: '事务引擎', name: '快照隔离下的写偏斜',
    desc: '经典当班医生场景：两个会话各自检查「至少留一人」再各自下班，看哪种手段能堵住这个洞',
    keywords: 'write skew 写偏斜 snapshot isolation select for update serialization failure 谓词锁',
    modes: MODES,
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 20V8l5 3 6-5 5 3v11z"/><circle cx="9" cy="5" r="2.4"/><path d="M15 15l3-3" stroke-dasharray="2 2"/></svg>',
    render(body) {
      let mode = MODES[0];
      let run = null;
      let timer = null;
      const results = {};

      body.innerHTML = `
        <div class="info-note">
          <b>约束：</b>任何时候至少要有一名医生在岗 ——
          <code class="inline">on_call(alice) + on_call(bob) &gt;= 1</code>。
          两个会话各自「先检查、再下班」，检查与写落在<b>不同的行</b>上：这就是写偏斜的标准形状。
        </div>
        <div class="card">
          <div class="card-title"><span>方案</span><span class="badge b-accent" id="sk-tag"></span></div>
          <div class="case-grid" id="sk-modes"></div>
        </div>
        <div class="card">
          <div class="card-title">两侧会话</div>
          <div class="grid2">
            <div class="codeblock"><span class="cmt">-- 会话 T1（Alice）</span>
<span class="k">BEGIN</span>;
<span class="t">SELECT</span> on_call <span class="k">FROM</span> doctor;   <span class="cmt">-- 检查：两人在岗</span>
<span class="t">UPDATE</span> doctor <span class="k">SET</span> on_call = 0
  <span class="k">WHERE</span> name = <span class="hl">'alice'</span>;         <span class="cmt">-- 我下班</span>
<span class="k">COMMIT</span>;</div>
            <div class="codeblock"><span class="cmt">-- 会话 T2（Bob）</span>
<span class="k">BEGIN</span>;
<span class="t">SELECT</span> on_call <span class="k">FROM</span> doctor;   <span class="cmt">-- 检查：两人在岗</span>
<span class="t">UPDATE</span> doctor <span class="k">SET</span> on_call = 0
  <span class="k">WHERE</span> name = <span class="hl">'bob'</span>;             <span class="cmt">-- 我也下班</span>
<span class="k">COMMIT</span>;</div>
          </div>
        </div>
        <div class="card">
          <div class="card-title"><span>时间线</span><span id="sk-pos" class="hint" style="margin:0"></span></div>
          <div class="btn-row" style="margin-top:0;margin-bottom:10px">
            <button class="btn primary" id="sk-step">单步执行</button>
            <button class="btn" id="sk-auto">自动播放</button>
            <button class="btn" id="sk-toend">一次跑完</button>
            <button class="btn sm" id="sk-reset">重置</button>
          </div>
          <div class="stage" id="sk-lanes"></div>
          <div class="legend">
            <span><i style="background:rgba(79,112,56,.25);border:1px solid var(--green)"></i>约束仍成立</span>
            <span><i style="background:rgba(168,69,47,.15);border:1px solid var(--red)"></i>约束被破坏</span>
            <span><i style="background:rgba(138,106,31,.16);border:1px dashed var(--amber)"></i>锁等待 / 未执行</span>
          </div>
        </div>
        <div class="grid2">
          <div class="card">
            <div class="card-title">两行的版本链</div>
            <div id="sk-chain"></div>
            <div class="meter" style="margin-top:10px"><span>在岗人数</span>
              <span class="meter-bar"><i id="sk-meter" style="width:100%"></i></span>
              <span class="meter-val" id="sk-sum"></span></div>
            <div class="hint" id="sk-inv"></div>
          </div>
          <div class="card">
            <div class="card-title">锁表与等待</div>
            <div id="sk-locks"></div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">结论</div>
          <div id="sk-verdict"></div>
        </div>
        <div class="card">
          <div class="card-title"><span>三种方案对照</span><span class="hint" style="margin:0">跑完哪个填哪个</span></div>
          <div style="overflow-x:auto"><table class="tb" id="sk-cmp"></table></div>
        </div>
        <div class="card">
          <div class="card-title">执行日志</div>
          <div class="log-list" id="sk-log"></div>
        </div>
        <div class="card">
          <div class="card-title">面试要点</div>
          <pre class="out" style="white-space:pre-wrap">SI 不防写偏斜的原因不是「锁不够」，而是<b>两个写作用在不同行</b>：版本链上互不覆盖，写写冲突判不出来；读又走各自 BEGIN 时的快照，看不见对方未提交的写 —— 引擎没有任何一处会等待或报错，只有全局约束被破坏了。
<b>SELECT FOR UPDATE 为什么能补上这个洞</b>：它把「检查」从快照读换成对<b>当前最新已提交版本</b>的加锁读（current read）。第二个会话要么排队等到第一个提交，要么在醒来后读到已经变化的值，于是 <code class="inline">count</code> 不再等于 2，条件不成立，UPDATE 走不到。等价做法：把两个检查项写进同一条语句的 WHERE 里，让检查与写落在同一把行锁上。
串行化（PG 的 SSI）不是「什么都串行执行」，它仍然并行读写，只在危险结构（读写依赖成环）出现时牺牲一个事务，报 <code class="inline">40001 serialization_failure</code> —— 所以业务侧必须写重试。
写偏斜的判定条件是可复述的：<b>读集合相交、写集合不相交、两个事务都提交、终态违反约束</b>。少任何一条都不算写偏斜（例如写同一行就叫丢失更新）。</pre>
        </div>`;

      const $ = s => body.querySelector(s);
      $('#sk-modes').innerHTML = MODES.map(m =>
        `<button class="case-card" data-id="${m.id}"><b>${ML.esc(m.name)}</b><span>${ML.esc(m.brief)}</span></button>`).join('');
      $('#sk-modes').addEventListener('click', e => {
        const b = e.target.closest('.case-card');
        if (!b) return;
        mode = MODES.find(m => m.id === b.dataset.id);
        reset();
      });
      $('#sk-step').addEventListener('click', () => doStep());
      $('#sk-toend').addEventListener('click', () => { stopAuto(); while (!run.done) MVCC.stepRun(run); finishOnce(); draw(); });
      $('#sk-reset').addEventListener('click', () => { reset(); ML.toast('已重置'); });
      $('#sk-auto').addEventListener('click', () => {
        if (timer) { stopAuto(); return; }
        if (run.done) reset();
        $('#sk-auto').textContent = '暂停';
        timer = ML.interval(() => { if (run.done) stopAuto(); else doStep(); }, 700);
      });

      function stopAuto() { if (timer) { clearInterval(timer); timer = null; } $('#sk-auto').textContent = '自动播放'; }
      function reset() { stopAuto(); run = MVCC.createRun(scenario(), mode.level); draw(); }
      function scenario() { return { table: 'doctor', items: { alice: { val: 1 }, bob: { val: 1 } }, invariant, script: mode.script }; }
      function finishOnce() {
        if (!run.done || run.counted) return;
        run.counted = true;
        const inv = invariant(MVCC.committedVals(run));
        results[mode.id] = {
          inv, anom: MVCC.anomalies(run).map(a => a.name),
          blocks: run.hist.filter(h => h.state === 'blocked').length,
          aborts: run.order.filter(t => run.tx[t].status === 'aborted'),
          notes: run.notes.slice(),
        };
      }
      function doStep() { if (run.done) return; MVCC.stepRun(run); finishOnce(); draw(); }

      /* ---------- 时间线 ---------- */
      function lanes() {
        const names = [];
        mode.script.forEach(s => { if (names.indexOf(s.t) < 0) names.push(s.t); });
        const hits = {};
        MVCC.anomalies(run).forEach(a => (a.seqs || []).forEach(s => { hits[s] = a.name; }));
        const cells = run.hist.map(h => ({ t: h.t, h }));
        for (let i = run.ip; i < mode.script.length; i++) cells.push({ t: mode.script[i].t, ghost: mode.script[i] });
        const bw = 92, step = 100, left = 92, top = 30, rowH = 66;
        const W = left + Math.max(cells.length, 4) * step + 20;
        const H = top + names.length * rowH + 12;
        const mid = li => top + li * rowH + (rowH - 14) / 2;
        let s = `<svg class="lanes-svg" viewBox="0 0 ${W} ${H}" style="width:100%" role="img" aria-label="写偏斜时间线">`;
        names.forEach((nm, li) => {
          const y = top + li * rowH;
          s += `<rect class="lane-bg" x="8" y="${y}" width="${W - 16}" height="${rowH - 14}" rx="8"/>`;
          const who = nm === 'T1' ? 'Alice' : 'Bob';
          const st = run.tx[nm] ? run.tx[nm].status : '未开始';
          s += `<text class="lane-title" x="16" y="${y + 20}">${nm} ${who}</text>`;
          s += `<text class="op-pending" x="16" y="${y + 36}">${ML.esc(run.xid[nm] ? 'xid ' + run.xid[nm] : '未开始')}${st === 'blocked' ? ' · 等锁' : st === 'aborted' ? ' · 回滚' : ''}</text>`;
          s += `<line class="lane-line" x1="${left}" y1="${mid(li)}" x2="${W - 12}" y2="${mid(li)}"/>`;
        });
        cells.forEach((c, i) => {
          const li = names.indexOf(c.t);
          const x = left + i * step + bw / 2, y = mid(li);
          if (c.ghost) {
            s += `<rect x="${x - bw / 2}" y="${y - 21}" width="${bw}" height="42" rx="7" fill="rgba(95,88,80,.06)" stroke="var(--border)" stroke-dasharray="4 3"/>`;
            s += `<text class="op-pending" x="${x}" y="${y - 2}" text-anchor="middle">${ML.esc(clip(MVCC.shortOf(c.ghost), 10))}</text>`;
            s += `<text class="op-pending" x="${x}" y="${y + 12}" text-anchor="middle">待执行</text>`;
            return;
          }
          const h = c.h;
          let cls = 'op-box', rcls = 'op-res';
          if (h.state === 'blocked' || h.state === 'queued' || h.state === 'noop' || h.state === 'skip') cls = 'op-box wait';
          if (h.state === 'error') cls = 'op-box err';
          if (hits[h.seq] !== undefined) cls = 'op-box bad';
          if (i === run.hist.length - 1) cls += ' cur';
          if (h.state === 'error' || h.state === 'skip') rcls = 'op-res r-bad';
          if (h.state === 'blocked' || h.state === 'queued' || h.state === 'noop') rcls = 'op-res r-wait';
          s += `<rect class="${cls}" x="${x - bw / 2}" y="${y - 21}" width="${bw}" height="42" rx="7"/>`;
          s += `<text class="op-sql" x="${x}" y="${y - 4}" text-anchor="middle">${ML.esc(clip(h.short || '', 10))}</text>`;
          s += `<text class="${rcls}" x="${x}" y="${y + 12}" text-anchor="middle">${ML.esc(clip(h.res || '', 13))}</text>`;
          if (hits[h.seq] !== undefined) s += `<text class="op-res r-bad" x="${x}" y="${y - 26}" text-anchor="middle">${ML.esc(hits[h.seq])}</text>`;
        });
        run.hist.forEach((h, i) => {
          if (h.state !== 'blocked') return;
          const j = run.hist.findIndex(x => x.seq > h.seq && x.t === h.t && x.op === h.op &&
            (x.kind === 'write' || x.kind === 'read' || x.kind === 'unblocked'));
          if (j < 0) return;
          const y = mid(names.indexOf(h.t)) + 21;
          const x1 = left + i * step + bw / 2, x2 = left + j * step + bw / 2;
          s += `<path d="M${x1} ${y} Q ${(x1 + x2) / 2} ${y + 24} ${x2} ${y}" fill="none" stroke="var(--amber)" stroke-width="1.4" stroke-dasharray="4 3"/>`;
          s += `<text class="tick-t" x="${(x1 + x2) / 2}" y="${y + 30}" text-anchor="middle">锁等待</text>`;
        });
        s += '</svg>';
        return s;
      }
      function clip(t, n) { const x = String(t); return x.length > n ? x.slice(0, n - 1) + '…' : x; }

      function chain() {
        return ['alice', 'bob'].map(k => {
          const vs = MVCC.versions(run, k);
          return `<div class="chain-row"><span class="k" style="flex:0 0 52px;font-family:var(--mono);font-size:12px;color:var(--muted)">${k}</span>` +
            vs.map(v => {
              const cls = v.status === 'aborted' ? 'abort' : v.status === 'committed' ? 'vis' : '';
              return `<span class="vchip ${cls}" style="min-width:96px"><b>on_call=${ML.esc(MVCC.fmt(v.val))}</b>` +
                `<span>xmin ${v.xmin}${v.xmax ? ' · xmax ' + v.xmax : ''}</span>` +
                `<span class="badge ${v.status === 'committed' ? 'b-green' : v.status === 'active' ? 'b-amber' : 'b-red'}">${v.status === 'committed' ? '已提交' : v.status === 'active' ? '未提交' : '已回滚'}</span></span>`;
            }).join('<span class="varrow">←</span>') + '</div>';
        }).join('');
      }
      function locks() {
        const rows = [];
        Object.keys(run.locks).forEach(it => {
          const lk = run.locks[it];
          if (lk.X) rows.push(`<div class="tbl-line"><span class="k">${ML.esc(it)}</span><span class="lockpill lk-x">X 锁 · ${ML.esc(lk.X)}</span></div>`);
          if (lk.S && lk.S.length) rows.push(`<div class="tbl-line"><span class="k"></span><span class="lockpill">S 锁 · ${ML.esc(lk.S.join(', '))}</span></div>`);
        });
        run.preds.forEach(p => rows.push(`<div class="tbl-line"><span class="k">谓词</span><span class="lockpill lk-p">${ML.esc(p.t)} 锁住范围 ${p.lo}..${p.hi}</span></div>`));
        run.order.forEach(t => {
          const w = run.tx[t].waiting;
          if (w) rows.push(`<div class="tbl-line"><span class="k">等待</span><span class="lockpill lk-w">${ML.esc(t)} → ${ML.esc(w.on)}</span></div>`);
        });
        if (!rows.length) return '<div class="hint">此刻没有任何行锁或谓词锁：两个会话在各自的世界里运行，这正是 SI 的表现。</div>';
        return `<div class="tbl-state">${rows.join('')}</div>` +
          `<div class="hint">模型里：SI 的普通读不加锁（所以表是空的）；FOR UPDATE 与串行化会登记锁，冲突语句进入等待。</div>`;
      }
      function verdict() {
        if (!run.hist.length) return '<div class="hint">点「单步执行」开始。</div>';
        if (!run.done) return `<div class="verdict v-wait"><h4>进行中（第 ${run.hist.length} 步）</h4><ul>` +
          run.hist.filter(h => h.state === 'blocked').slice(-2).map(h => `<li>${ML.esc(h.t)} 的 ${ML.esc(h.short)}：${ML.esc(h.why || '')}</li>`).join('') +
          '</ul></div>';
        const list = MVCC.anomalies(run);
        const inv = invariant(MVCC.committedVals(run));
        const bad = inv.ok === false;
        if (list.length || bad) {
          return `<div class="verdict v-bad"><h4>${ML.esc(mode.name)}：写偏斜发生，约束被破坏</h4><ul>` +
            list.map(a => `<li><b>${ML.esc(a.name)}</b>：${ML.esc(a.why)}</li>`).join('') +
            `</ul><div class="v-why">终态 on_call：${ML.esc(Object.entries(MVCC.committedVals(run)).map(([k, v]) => `${k}=${v}`).join(', '))} → ${ML.esc(inv.expr)} 不成立</div></div>`;
        }
        const notes = run.notes.slice();
        const blocks = run.hist.filter(h => h.state === 'blocked').length;
        const noop = run.hist.filter(h => h.kind === 'noop');
        return `<div class="verdict v-ok"><h4>${ML.esc(mode.name)}：约束守住了</h4><ul>` +
          (blocks ? `<li>出现 ${blocks} 处锁等待${notes.length ? '（' + ML.esc(notes.join('；')) + '）' : ''}</li>` : '') +
          noop.map(x => `<li>${ML.esc(x.t)} 的 ${ML.esc(x.short)} 没有执行：${ML.esc(x.why || '')}</li>`).join('') +
          `<li>终态 ${ML.esc(inv.expr)} 成立，在岗 ${inv.sum} 人</li></ul>` +
          `<div class="v-why">${ML.esc(mode.brief)}</div></div>`;
      }
      function cmpTable() {
        const rows = MODES.map(m => {
          const r = results[m.id];
          return `<tr${m.id === mode.id ? ' style="background:var(--accent-soft)"' : ''}>` +
            `<td class="mx-row-h">${ML.esc(m.name)}<div class="hint" style="margin:0">${ML.esc(m.level)}${m.script === locked ? ' + FOR UPDATE' : ''}</div></td>` +
            (r ? `<td>${r.anom.length ? `<span class="badge b-red">${ML.esc(r.anom.join('、'))}</span>` : '<span class="badge b-green">无异常</span>'}</td>` +
              `<td>${r.inv.ok ? '<span class="badge b-green">成立</span>' : '<span class="badge b-red">被破坏</span>'} 在岗 ${r.inv.sum}</td>` +
              `<td>${r.blocks || 0} 处等待${r.aborts.length ? `，回滚 ${ML.esc(r.aborts.join(','))}` : ''}</td>` +
              `<td>${ML.esc(r.notes.join('；') || (r.anom.length ? '没有任何一处等待或报错，所以异常畅通无阻' : '锁与快照共同挡住了这次交错'))}</td>`
              : '<td colspan="4" style="color:var(--faint)">尚未运行该方案</td>') + '</tr>';
        }).join('');
        return '<thead><tr><th>方案</th><th>引擎判定</th><th>约束</th><th>阻塞情况</th><th>原因</th></tr></thead><tbody>' + rows + '</tbody>';
      }
      function log() {
        if (!run.hist.length) return '<span class="l-dim">等待执行</span>';
        return run.hist.map(h => {
          const cls = h.state === 'error' ? 'l-err' : (h.state === 'blocked' || h.state === 'queued' || h.state === 'noop' || h.state === 'skip') ? 'l-warn' : h.op === 'commit' && h.state === 'ok' ? 'l-ok' : '';
          return `<div class="${cls}">#${h.seq + 1} [${ML.esc(h.t)}] ${ML.esc(h.sql || '')} ${ML.esc(h.res || '')}${h.why ? '　// ' + ML.esc(h.why) : ''}</div>`;
        }).join('');
      }

      function draw() {
        $('#sk-modes').querySelectorAll('.case-card').forEach(b => b.classList.toggle('on', b.dataset.id === mode.id));
        $('#sk-tag').textContent = `${mode.name} · ${mode.level}`;
        $('#sk-pos').textContent = `脚本 ${Math.min(run.ip, mode.script.length)}/${mode.script.length} · 已执行 ${run.hist.length} 步${run.done ? ' · 已收尾' : ''}`;
        $('#sk-lanes').innerHTML = lanes();
        $('#sk-chain').innerHTML = chain();
        $('#sk-locks').innerHTML = locks();
        $('#sk-verdict').innerHTML = verdict();
        $('#sk-cmp').innerHTML = cmpTable();
        $('#sk-log').innerHTML = log();
        const inv = invariant(MVCC.committedVals(run));
        $('#sk-meter').style.width = (inv.sum / 2 * 100) + '%';
        $('#sk-meter').style.background = inv.ok ? 'var(--green)' : 'var(--red)';
        $('#sk-sum').textContent = `${inv.sum} / 2`;
        $('#sk-inv').innerHTML = `<span class="inv">${ML.esc(inv.expr)} → <b class="${inv.ok ? '' : 'no'}">${inv.ok ? '成立' : '不成立'}</b></span>`;
      }

      reset();
    },
  });
})();
