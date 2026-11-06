/* ============ 四类异常复现台 ============ */
(function () {
  'use strict';

  const onCall = vals => {
    const s = (vals.alice === null ? 0 : vals.alice) + (vals.bob === null ? 0 : vals.bob);
    return { ok: s >= 1, expr: `on_call(alice)+on_call(bob) >= 1（当前 ${s}）` };
  };

  const CASES = [
    {
      id: 'dirty', name: '脏读', probe: ['dirty'], table: 'acc',
      brief: 'T1 写了没提交，T2 读走；T1 回滚',
      items: { A: { val: 100 } },
      script: [
        { t: 'T1', op: 'begin' },
        { t: 'T1', op: 'write', item: 'A', val: 200, valText: 200 },
        { t: 'T2', op: 'begin' },
        { t: 'T2', op: 'read', item: 'A' },
        { t: 'T1', op: 'abort' },
        { t: 'T2', op: 'read', item: 'A' },
      ],
    },
    {
      id: 'nonrepeat', name: '不可重复读', probe: ['nonrepeat'], table: 'acc',
      brief: '同一事务两次读同一行，中间别人提交了 UPDATE',
      items: { A: { val: 100 } },
      script: [
        { t: 'T2', op: 'begin' },
        { t: 'T2', op: 'read', item: 'A' },
        { t: 'T1', op: 'begin' },
        { t: 'T1', op: 'write', item: 'A', val: 200, valText: 200 },
        { t: 'T1', op: 'commit' },
        { t: 'T2', op: 'read', item: 'A' },
      ],
    },
    {
      id: 'phantom', name: '幻读', probe: ['phantom'], table: 'emp',
      brief: '范围谓词命中行数在两次读之间变了（新插入的行）',
      items: { e1: { val: 100 }, e2: { val: 200 } },
      script: [
        { t: 'Tr', op: 'begin' },
        { t: 'Tr', op: 'range', lo: 0, hi: 300 },
        { t: 'Tw', op: 'begin' },
        { t: 'Tw', op: 'insert', item: 'e3', val: 250 },
        { t: 'Tw', op: 'commit' },
        { t: 'Tr', op: 'range', lo: 0, hi: 300 },
      ],
    },
    {
      id: 'lost', name: '丢失更新', probe: ['lost'], table: 'acc',
      brief: '应用侧 read-modify-write：两人都基于 1 算出 2',
      items: { A: { val: 1 } },
      script: [
        { t: 'T1', op: 'begin' },
        { t: 'T2', op: 'begin' },
        { t: 'T1', op: 'read', item: 'A' },
        { t: 'T2', op: 'read', item: 'A' },
        { t: 'T2', op: 'write', item: 'A', mode: 'app', delta: 1, valText: '读到的值+1' },
        { t: 'T2', op: 'commit' },
        { t: 'T1', op: 'write', item: 'A', mode: 'app', delta: 1, valText: '读到的值+1' },
        { t: 'T1', op: 'commit' },
      ],
    },
    {
      id: 'skew', name: '写偏斜', probe: ['skew'], table: 'doctor',
      brief: '两人各读对方的状态，各自决定下班，写的是不同的行',
      items: { alice: { val: 1 }, bob: { val: 1 } },
      invariant: onCall,
      script: [
        { t: 'T1', op: 'begin' },
        { t: 'T2', op: 'begin' },
        { t: 'T1', op: 'read', item: 'alice' },
        { t: 'T1', op: 'read', item: 'bob' },
        { t: 'T2', op: 'read', item: 'alice' },
        { t: 'T2', op: 'read', item: 'bob' },
        { t: 'T1', op: 'write', item: 'alice', val: 0, valText: 0, check: lr => (lr.alice || 0) + (lr.bob || 0) >= 2 },
        { t: 'T2', op: 'write', item: 'bob', val: 0, valText: 0, check: lr => (lr.alice || 0) + (lr.bob || 0) >= 2 },
        { t: 'T1', op: 'commit' },
        { t: 'T2', op: 'commit' },
      ],
    },
    {
      id: 'snaptime', name: '快照生成时机', probe: ['nonrepeat'], table: 'acc',
      brief: '提交发生在 BEGIN 与第一条语句之间，RR 与 SI 分开',
      items: { A: { val: 100 } },
      script: [
        { t: 'T2', op: 'begin' },
        { t: 'T1', op: 'begin' },
        { t: 'T1', op: 'write', item: 'A', val: 200, valText: 200 },
        { t: 'T1', op: 'commit' },
        { t: 'T2', op: 'read', item: 'A' },
        { t: 'T3', op: 'begin' },
        { t: 'T3', op: 'write', item: 'A', val: 300, valText: 300 },
        { t: 'T3', op: 'commit' },
        { t: 'T2', op: 'read', item: 'A' },
      ],
    },
  ];

  const KIND = {};
  MVCC.ANOMALY_KINDS.forEach(k => { KIND[k.kind] = k.name; });

  /** 场景标题：探查的异常名与场景名重复时不再罗列 */
  function sceneTag(sc) {
    const extra = sc.probe.map(k => KIND[k]).filter(n => n && n !== sc.name);
    return extra.length ? `${sc.name} · 探查 ${extra.join(' / ')}` : sc.name;
  }

  registerDemo({
    id: 'anomaly', cat: '事务引擎', name: '四类异常复现台',
    desc: '选定隔离级别，一步一步跑交错脚本，引擎现场判定脏读 / 不可重复读 / 幻读 / 写偏斜是否真的发生',
    keywords: '隔离级别 脏读 不可重复读 幻读 写偏斜 snapshot isolation anomaly',
    cases: CASES,
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 5h18M3 12h11M3 19h18"/><circle cx="19" cy="12" r="2.6"/></svg>',
    render(body) {
      let sc = CASES[0];
      let level = 'RC';
      let run = null;
      let timer = null;
      const matrix = {};

      body.innerHTML = `
        <div class="info-note">
          <b>玩法：</b>选一个异常场景 + 一个隔离级别，逐步执行。脚本是固定的交错顺序，
          <b>异常会不会发生由引擎按该级别的语义算出来</b>，换一个级别结论就变。
          跑完一次，右下角矩阵对应格子自动填色。
        </div>
        <div class="card">
          <div class="card-title"><span>场景</span><span class="badge b-accent" id="an-scene-tag"></span></div>
          <div class="case-grid" id="an-cases"></div>
        </div>
        <div class="card">
          <div class="card-title"><span>隔离级别</span><span id="an-lvl-note" class="hint" style="margin:0"></span></div>
          <div class="seg" id="an-levels"></div>
          <div class="btn-row">
            <button class="btn primary" id="an-step">单步执行</button>
            <button class="btn" id="an-auto">自动播放</button>
            <button class="btn" id="an-toend">一次跑完</button>
            <button class="btn sm" id="an-reset">重置脚本</button>
            <span class="hint" style="margin:0 0 0 auto" id="an-pos"></span>
          </div>
        </div>
        <div class="card">
          <div class="card-title"><span>事务时间线</span><span id="an-verdict-tag"></span></div>
          <div class="stage" id="an-lanes"></div>
          <div class="legend">
            <span><i style="background:var(--plate);border:1px solid var(--border-strong)"></i>已执行语句</span>
            <span><i style="background:var(--accent-soft);border:1px solid var(--accent)"></i>当前语句</span>
            <span><i style="background:rgba(168,69,47,.14);border:1px solid var(--red)"></i>触发异常的语句</span>
            <span><i style="background:rgba(138,106,31,.14);border:1px dashed var(--amber)"></i>锁等待 / 未执行</span>
            <span><i style="background:rgba(95,88,80,.1)"></i>脚本中尚未走到</span>
          </div>
        </div>
        <div class="card">
          <div class="card-title">当前结论</div>
          <div id="an-verdict"></div>
        </div>
        <div class="grid2">
          <div class="card">
            <div class="card-title">表与版本链（引擎实时状态）</div>
            <div id="an-table"></div>
          </div>
          <div class="card">
            <div class="card-title">各事务的 Read View</div>
            <div id="an-views"></div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">执行日志</div>
          <div class="log-list" id="an-log"></div>
        </div>
        <div class="card">
          <div class="card-title"><span>级别 × 异常矩阵</span><span class="hint" style="margin:0">每跑完一个场景自动填一格</span></div>
          <div style="overflow-x:auto"><table class="mx" id="an-mx"></table></div>
          <div class="hint">「触发」= 该级别下该异常确实发生；「未触发」= 该场景在这个级别跑完且引擎没找到该异常；灰点 = 还没验证过。</div>
        </div>
        <div class="card">
          <div class="card-title">面试要点</div>
          <pre class="out" style="white-space:pre-wrap">RC 与 RR 的差别不是「加了什么锁」，只有<b>一件事</b>：Read View 的生成时机。RC 每条语句重取一次，RR 整个事务只在第一条语句取一次 —— 「不可重复读」正是这个时机差带来的。
PG 的 RR 实现就是 SI；ANSI 教科书里的 RR 仍允许幻读，而 MVCC 快照把纯读场景下的幻读也一起挡住了（幻读只在「写 + current read」时才漏出来）。
SI 挡不住写偏斜的原因：两个事务写的是<b>不同的行</b>，版本链上谁也覆盖不到谁，写写冲突判不出来；而读的是快照，又看不见对方未提交的写 —— 于是没有任何一处会等待或报错，只有全局约束被破坏了。
所以 ANSI 那句「RR 及以上能防止幻读」并不等于「能防止所有异常」，剩下的洞要靠谓词锁（串行化）或应用层显式加锁。</pre>
        </div>`;

      const $ = sel => body.querySelector(sel);
      const elCases = $('#an-cases'), elLevels = $('#an-levels');

      elCases.innerHTML = CASES.map(c =>
        `<button class="case-card" data-id="${c.id}"><b>${ML.esc(c.name)}</b><span>${ML.esc(c.brief)}</span></button>`).join('');
      elLevels.innerHTML = MVCC.LEVELS.map(l =>
        `<button data-id="${l.id}">${ML.esc(l.name)} · ${ML.esc(l.short)}</button>`).join('');

      elCases.addEventListener('click', e => {
        const b = e.target.closest('.case-card');
        if (!b) return;
        sc = CASES.find(c => c.id === b.dataset.id);
        reset();
      });
      elLevels.addEventListener('click', e => {
        const b = e.target.closest('button');
        if (!b) return;
        level = b.dataset.id;
        reset();
      });
      $('#an-step').addEventListener('click', () => { doStep(); });
      $('#an-toend').addEventListener('click', () => { stopAuto(); while (!run.done) MVCC.stepRun(run); finishOnce(); draw(); });
      $('#an-reset').addEventListener('click', () => { reset(); ML.toast('脚本已重置'); });
      $('#an-auto').addEventListener('click', () => {
        if (timer) { stopAuto(); return; }
        if (run.done) reset();
        $('#an-auto').textContent = '暂停';
        timer = ML.interval(() => {
          if (run.done) { stopAuto(); return; }
          doStep();
        }, 620);
      });

      function stopAuto() {
        if (timer) { clearInterval(timer); timer = null; }
        $('#an-auto').textContent = '自动播放';
      }
      function reset() {
        stopAuto();
        run = MVCC.createRun(sc, level);
        draw();
      }
      function finishOnce() {
        if (run.done && !run.counted) { run.counted = true; afterRun(); }
      }
      function doStep() {
        if (run.done) return;
        MVCC.stepRun(run);
        finishOnce();
        draw();
      }

      /* 跑完一次：填矩阵 */
      function afterRun() {
        const list = MVCC.anomalies(run);
        const hit = {};
        list.forEach(a => { hit[a.kind] = true; });
        const m = matrix[sc.id] = matrix[sc.id] || {};
        const cell = {};
        sc.probe.forEach(k => { cell[k] = hit[k] ? 'hit' : 'clean'; });
        m[level] = cell;
      }

      /* ---------- 时间线 ---------- */
      function timeline() {
        const lanes = [];
        sc.script.forEach(s => { if (lanes.indexOf(s.t) < 0) lanes.push(s.t); });
        const hits = {};
        MVCC.anomalies(run).forEach(a => (a.seqs || []).forEach(s => { hits[s] = a.name; }));

        const cells = run.hist.map(h => ({ t: h.t, h }));
        for (let i = run.ip; i < sc.script.length; i++) cells.push({ t: sc.script[i].t, ghost: sc.script[i] });
        const n = Math.max(cells.length, 4);
        const bw = 84, step = 92, left = 96, top = 30, rowH = 62;
        const W = left + n * step + 20;
        const H = top + lanes.length * rowH + 12;
        let s = `<svg class="lanes-svg" viewBox="0 0 ${W} ${H}" style="width:100%" role="img" aria-label="事务时间线">`;
        lanes.forEach((nm, li) => {
          const y = top + li * rowH;
          s += `<rect class="lane-bg" x="8" y="${y}" width="${W - 16}" height="${rowH - 12}" rx="8"/>`;
          const st = run.tx[nm] ? run.tx[nm].status : '未开始';
          s += `<text class="lane-title" x="18" y="${y + 20}">${ML.esc(nm)}</text>`;
          s += `<text class="op-pending" x="18" y="${y + 36}">${ML.esc(run.xid[nm] ? 'xid ' + run.xid[nm] : '未开始')}${st === 'aborted' ? ' · 已回滚' : st === 'committed' ? ' · 已提交' : st === 'blocked' ? ' · 等锁' : ''}</text>`;
          s += `<line class="lane-line" x1="${left}" y1="${y + (rowH - 12) / 2}" x2="${W - 12}" y2="${y + (rowH - 12) / 2}"/>`;
        });
        const lastIdx = run.hist.length ? run.hist.length - 1 : -1;
        cells.forEach((c, i) => {
          const li = lanes.indexOf(c.t);
          const x = left + i * step + bw / 2;
          const y = top + li * rowH + (rowH - 12) / 2;
          let boxCls = 'op-box', resCls = 'op-res', short = '', res = '';
          if (c.ghost) {
            boxCls = 'op-box ghost';
            resCls = 'op-pending';
            short = MVCC.shortOf(c.ghost);
            res = '待执行';
            s += `<rect class="${boxCls}" x="${x - bw / 2}" y="${y - 20}" width="${bw}" height="40" rx="7" fill="rgba(95,88,80,.07)" stroke="var(--border)" stroke-dasharray="4 3"/>`;
            s += `<text class="op-pending" x="${x}" y="${y - 3}" text-anchor="middle">${ML.esc(clip(short, 9))}</text>`;
            s += `<text class="op-pending" x="${x}" y="${y + 11}" text-anchor="middle">${ML.esc(res)}</text>`;
            return;
          }
          const h = c.h;
          short = h.short || '';
          res = h.res || '';
          if (h.state === 'blocked' || h.state === 'queued') boxCls = 'op-box wait';
          else if (h.state === 'error') boxCls = 'op-box err';
          else if (h.state === 'noop' || h.state === 'skip') boxCls = 'op-box wait';
          if (hits[h.seq] !== undefined) boxCls = 'op-box bad';
          if (h.state === 'ok' && (h.op === 'commit')) resCls = 'op-res r-ok';
          if (h.state === 'blocked' || h.state === 'queued' || h.state === 'noop') resCls = 'op-res r-wait';
          if (h.state === 'error' || h.state === 'skip') resCls = 'op-res r-bad';
          if (i === lastIdx) boxCls += ' cur';
          s += `<rect class="${boxCls}" x="${x - bw / 2}" y="${y - 20}" width="${bw}" height="40" rx="7"/>`;
          s += `<text class="op-sql" x="${x}" y="${y - 4}" text-anchor="middle">${ML.esc(clip(short, 9))}</text>`;
          s += `<text class="${resCls}" x="${x}" y="${y + 11}" text-anchor="middle">${ML.esc(clip(res, 11))}</text>`;
          if (hits[h.seq] !== undefined) {
            s += `<text class="op-res r-bad" x="${x}" y="${y - 25}" text-anchor="middle">${ML.esc(hits[h.seq])}</text>`;
          }
        });
        // 阻塞 → 解除 的连线
        run.hist.forEach((h, i) => {
          if (h.state !== 'blocked') return;
          const j = run.hist.findIndex(x => x.seq > h.seq && x.t === h.t && x.op === h.op && (x.kind === 'write' || x.kind === 'read' || x.kind === 'unblocked'));
          if (j < 0) return;
          const li = lanes.indexOf(h.t);
          const x1 = left + i * step + bw / 2, x2 = left + j * step + bw / 2;
          const y = top + li * rowH + (rowH - 12) / 2;
          s += `<path d="M${x1} ${y + 20} Q ${(x1 + x2) / 2} ${y + 44} ${x2} ${y + 20}" fill="none" stroke="var(--amber)" stroke-width="1.4" stroke-dasharray="4 3"/>`;
        });
        s += '</svg>';
        return s;
      }
      function clip(t, n) { const x = String(t); return x.length > n ? x.slice(0, n - 1) + '…' : x; }

      /* ---------- 其他面板 ---------- */
      function tablePanel() {
        const keys = Object.keys(run.items);
        if (!keys.length) return '<div class="hint">无</div>';
        return '<div class="tbl-state">' + keys.map(k => {
          const vs = MVCC.versions(run, k);
          if (!vs.length) return '';
          return `<div class="chain-row"><span class="k">${ML.esc(k)}</span>` +
            vs.map(v => {
              const cls = v.status === 'aborted' ? 'abort' : v.status === 'active' ? '' : 'vis';
              const tag = v.status === 'committed' ? '已提交' : v.status === 'active' ? '未提交' : '已回滚';
              return `<span class="vchip ${cls}" style="min-width:80px"><b>v=${ML.esc(MVCC.fmt(v.val))}</b>` +
                `<span>xmin ${v.xmin}${v.xmax ? ' · xmax ' + v.xmax : ''}</span>` +
                `<span class="badge ${v.status === 'committed' ? 'b-green' : v.status === 'active' ? 'b-amber' : 'b-red'}">${tag}</span></span>`;
            }).join('<span class="varrow">←</span>') + '</div>';
        }).join('') + '</div>';
      }

      function viewsPanel() {
        const list = run.order.map(t => {
          const tx = run.tx[t];
          const v = tx.view;
          return `<tr><td>${ML.esc(t)}<span class="badge b-accent" style="margin-left:6px">${tx.xid}</span></td>` +
            `<td>${ML.esc(statusText(tx.status))}</td>` +
            `<td>${v ? `${v.xmin} / ${v.xmax} / [${v.xip.join(', ') || '空'}]` : '—（尚未取快照）'}</td></tr>`;
        });
        return `<table class="tb"><thead><tr><th>事务</th><th>状态</th><th>Read View（xmin / xmax / xip）</th></tr></thead><tbody>${list.join('') || '<tr><td colspan="3">尚未开始</td></tr>'}</tbody></table>`;
      }
      function statusText(s) {
        return s === 'active' ? '运行中' : s === 'committed' ? '已提交' : s === 'aborted' ? '已回滚' : s === 'blocked' ? '等锁中' : s;
      }

      function logPanel() {
        if (!run.hist.length) return '<span class="l-dim">点「单步执行」开始</span>';
        return run.hist.map(h => {
          const cls = h.state === 'error' ? 'l-err' : h.state === 'blocked' || h.state === 'queued' || h.state === 'noop' || h.state === 'skip' ? 'l-warn' :
            h.state === 'ok' ? (h.op === 'commit' ? 'l-ok' : '') : '';
          return `<div class="${cls}">#${h.seq + 1} [${ML.esc(h.t)}] ${ML.esc(h.sql || '')} ${ML.esc(h.res || '')}${h.why ? '　// ' + ML.esc(h.why) : ''}</div>`;
        }).join('');
      }

      function verdictPanel() {
        const list = MVCC.anomalies(run);
        const tag = $('#an-verdict-tag');
        if (!run.hist.length) { tag.textContent = ''; return '<div class="hint">脚本尚未执行，没有结论。</div>'; }
        if (!run.done) {
          tag.innerHTML = '<span class="badge b-gray">执行中</span>';
          const blocks = run.hist.filter(h => h.state === 'blocked' || h.state === 'queued');
          return `<div class="verdict v-wait"><h4>进行到第 ${run.hist.length} 步，结论待脚本跑完</h4><ul>` +
            (blocks.length ? blocks.slice(-2).map(b => `<li>[${ML.esc(b.t)}] ${ML.esc(b.short || '')} 被 ${ML.esc(b.why || '')} 挂起</li>`).join('') : '') +
            `</ul></div>`;
        }
        const notes = run.notes.slice();
        if (!list.length) {
          tag.innerHTML = '<span class="badge b-green">未出现异常</span>';
          return `<div class="verdict v-ok"><h4>在${ML.esc(MVCC.byId(level).name)}下，这份交错没有出现${ML.esc(sc.probe.map(k => KIND[k]).join(' / '))}</h4>` +
            (notes.length ? `<ul>${notes.map(x => `<li>${ML.esc(x)}</li>`).join('')}</ul>` : '') +
            `<div class="v-why">${ML.esc(whyClean())}</div></div>`;
        }
        tag.innerHTML = '<span class="badge b-red">出现异常</span>';
        return `<div class="verdict v-bad"><h4>触发的异常：${ML.esc(list.map(a => a.name).join('、'))}</h4>` +
          `<ul>${list.map(a => `<li><b>${ML.esc(a.name)}</b>：${ML.esc(a.why)}</li>`).join('')}</ul>` +
          (notes.length ? `<ul>${notes.map(x => `<li>${ML.esc(x)}</li>`).join('')}</ul>` : '') +
          `<div class="v-why">${ML.esc(MVCC.byId(level).note)}</div></div>`;
      }
      function whyClean() {
        const L = MVCC.byId(level);
        if (sc.id === 'dirty') return L.snap === 'none' ? '本级别允许读未提交，不该出现「未触发」' : '普通读只走快照，未提交版本被跳过：' + L.note;
        if (sc.id === 'phantom') return '范围读两次都用同一份快照（或谓词锁把插入者挡在外面），行数不会变：' + L.note;
        if (sc.id === 'nonrepeat') return '两次复用同一份 Read View，别人的提交看不见：' + L.note;
        if (sc.id === 'lost') return '后一个写被行锁/读锁挂起或被回滚，没有形成「基于旧值覆盖新值」：' + L.note;
        if (sc.id === 'skew') return '写同一行的锁冲突或谓词锁让其中一个事务没能提交，约束没有被破坏：' + L.note;
        return L.note;
      }

      function mxPanel() {
        const cols = MVCC.LEVELS;
        let h = '<thead><tr><th class="mx-row-h">异常 \\ 级别</th>' +
          cols.map(l => `<th>${ML.esc(l.short)}</th>`).join('') + '</tr></thead><tbody>';
        MVCC.ANOMALY_KINDS.forEach(k => {
          h += `<tr><td class="mx-row-h">${ML.esc(k.name)}</td>`;
          cols.forEach(l => {
            let val = '', cls = 'c-na';
            Object.keys(matrix).forEach(cid => {
              const csc = CASES.find(c => c.id === cid);
              if (!csc || csc.probe.indexOf(k.kind) < 0) return;
              const cell = matrix[cid][l.id];
              if (!cell) return;
              if (cell[k.kind] === 'hit') { val = csc.name; cls = 'c-hit'; }
              else if (cls !== 'c-hit') { val = '未触发'; cls = 'c-clean'; }
            });
            h += `<td class="${cls}" title="${ML.esc(k.name + ' / ' + l.short)}">${ML.esc(val || '·')}</td>`;
          });
          h += '</tr>';
        });
        h += '</tbody>';
        $('#an-mx').innerHTML = h;
      }

      function draw() {
        $('#an-cases').querySelectorAll('.case-card').forEach(b => b.classList.toggle('on', b.dataset.id === sc.id));
        $('#an-levels').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.id === level));
        $('#an-scene-tag').textContent = sceneTag(sc);
        $('#an-lvl-note').textContent = MVCC.byId(level).note;
        $('#an-pos').textContent = `脚本位置 ${Math.min(run.ip, sc.script.length)} / ${sc.script.length}　已执行 ${run.hist.length} 步${run.done ? '　已收尾' : ''}`;
        $('#an-lanes').innerHTML = timeline();
        $('#an-table').innerHTML = tablePanel();
        $('#an-views').innerHTML = viewsPanel();
        $('#an-log').innerHTML = logPanel();
        $('#an-verdict').innerHTML = verdictPanel();
        mxPanel();
      }

      reset();
    },
  });
})();
