/* ============ MVCC Lab 共享内核 ============
   1) PostgreSQL 风格快照可见性判定（带逐步判定过程）
   2) 事务执行引擎：隔离级别语义 + 行锁 / 谓词锁 + 锁等待 + 死锁检测
   3) 异常判定：脏读 / 不可重复读 / 幻读 / 丢失更新 / 写偏斜（全部由执行历史算出）
   4) 冲突优先图 + 环检测 + 拓扑序 + 严格 2PL 模拟
   UI 只展示本文件的计算结果，不预先写入任何结论。
*/
(function (root) {
  'use strict';

  /* ---------- 隔离级别 ---------- */
  const LEVELS = [
    { id: 'RU', name: '读未提交', short: 'RU', snap: 'none',
      note: '无快照：普通读直接取物理最新版本，可能读到别人未提交的值' },
    { id: 'RC', name: '读已提交', short: 'RC', snap: 'stmt',
      note: '每条语句重新生成 Read View：语句内稳定，语句之间可能变' },
    { id: 'RR', name: '可重复读', short: 'RR', snap: 'first',
      note: '快照在事务第一条语句生成，之后所有普通读复用' },
    { id: 'SI', name: '快照隔离', short: 'SI', snap: 'begin',
      note: '快照在 BEGIN 就生成，整个事务只看得到那一刻的世界' },
    { id: 'SER', name: '串行化', short: 'SER', snap: 'begin', ssi: true,
      note: '快照 + 读写加锁 + 谓词锁；行锁冲突等待，谓词冲突直接回滚' },
  ];
  const byId = id => LEVELS.find(l => l.id === id) || LEVELS[0];

  /* ---------- 快照可见性（对应 tqual.c 的 HeapTupleSatisfiesMVCC） ---------- */
  function cmpXid(xid, view) {
    if (view.xip.indexOf(xid) >= 0) return { r: 'in', txt: '在 xip 里：取快照时它还在运行' };
    if (xid < view.xmin) return { r: 'old', txt: '小于 xmin：快照开始前就已提交（无需再查状态）' };
    if (xid >= view.xmax) return { r: 'future', txt: '不小于 xmax：快照之后才分配的事务号' };
    return { r: 'gone', txt: '落在 [xmin, xmax) 且不在 xip：取快照前已结束并提交' };
  }

  /** ver {xmin, xmax} · view {xmin, xmax, xip} · self 观察者 xid · statusOf(xid) */
  function traceVisible(ver, view, self, statusOf) {
    const S = [];
    const info = txt => S.push({ mark: '·', txt, cls: 'info' });
    const pass = txt => S.push({ mark: '+', txt, cls: 'pass' });
    const fail = txt => S.push({ mark: '−', txt, cls: 'fail' });
    info(`判定版本 (xmin=${ver.xmin}, xmax=${ver.xmax || '0/未删除'})，观察者 xid=${self}`);
    info(`Read View：xmin=${view.xmin}，xmax=${view.xmax}，xip=[${view.xip.join(', ') || '空'}]`);

    if (ver.xmin === self) {
      if (ver.status === 'aborted') { fail('本事务写过它，但已回滚，版本作废'); return out(false); }
      pass('xmin 就是自己：事务永远看得见自己的写入，快照检查直接跳过');
      if (ver.xmax === self) { fail('但本事务又删除/取代了它，旧版本不再可见'); return out(false); }
      return out(true);
    }
    const cx = cmpXid(ver.xmin, view);
    info(`① 先看 xmin=${ver.xmin} —— ${cx.txt}`);
    if (cx.r === 'in') { fail('创建者在快照时仍活跃 → 不可见（即使它后来提交了）'); return out(false); }
    if (cx.r === 'future') { fail('创建者在快照之后才开始 → 不可见'); return out(false); }
    if (statusOf && statusOf(ver.xmin) === 'aborted') {
      fail(`xmin=${ver.xmin} 虽然早于快照，但它最终回滚了（PG 在版本上打了 hint 位，这类判定不必比较快照）→ 这个版本从未生效`);
      return out(false);
    }
    pass('创建者在快照时已提交 → 这一步通过');

    if (ver.xmax) {
      if (ver.xmax === self) { fail('xmax 是自己：本事务已经删过/改过这一行，旧版本不可见'); return out(false); }
      const st = statusOf ? statusOf(ver.xmax) : 'committed';
      if (st === 'aborted') { pass(`xmax=${ver.xmax} 的事务已回滚 → 删除没有生效，本版本仍是当前版本`); return out(true); }
      const cy = cmpXid(ver.xmax, view);
      info(`② 再看 xmax=${ver.xmax} —— ${cy.txt}`);
      if (cy.r === 'in') { pass('删除者取快照时还在运行，这次删除在快照里还没生效 → 本版本仍可见'); return out(true); }
      if (cy.r === 'future') { pass('删除者在快照之后才开始 → 快照里这一行还没被删，本版本仍可见'); return out(true); }
      fail('删除者在取快照前已经提交 → 快照里这一行已被取代，本版本不可见');
      return out(false);
    }
    pass('xmax 为 0：没有更新或删除取代它，它是版本链的最新版本');
    return out(true);

    function out(visible) { return { visible, steps: S }; }
  }
  const isVisible = (ver, view, self, statusOf) => traceVisible(ver, view, self, statusOf).visible;

  /* ---------- 图：环检测 / 拓扑序 / 冲突图 ---------- */
  function findCycle(nodes, adj) {
    const color = {}, parent = {};
    let cyc = null;
    function dfs(u) {
      color[u] = 1;
      for (const v of (adj[u] || [])) {
        if (cyc) return true;
        if (color[v] === 1) {
          const seg = [u];
          let cur = u;
          while (cur !== v && cur !== undefined) {
            cur = parent[cur];
            if (cur !== undefined && cur !== v) seg.push(cur);
          }
          seg.push(v);
          cyc = seg.reverse().concat([v]);
          return true;
        }
        if (!color[v]) { parent[v] = u; if (dfs(v)) return true; }
      }
      color[u] = 2;
      return false;
    }
    nodes.forEach(n => { if (!color[n] && !cyc) dfs(n); });
    return cyc;
  }

  function topoSort(nodes, adj) {
    const indeg = {}, out = {};
    nodes.forEach(n => { indeg[n] = 0; out[n] = []; });
    nodes.forEach(n => (adj[n] || []).forEach(m => { out[n].push(m); indeg[m] = (indeg[m] || 0) + 1; }));
    const q = nodes.filter(n => !indeg[n]);
    const order = [];
    while (q.length) {
      const n = q.shift();
      order.push(n);
      out[n].forEach(m => { if (!--indeg[m]) q.push(m); });
    }
    return order.length === nodes.length ? order : null;
  }

  /** seq = [{t, k:'r'|'w', item}] → 优先图 */
  function conflictGraph(seq) {
    const nodes = [];
    seq.forEach(s => { if (s.t && nodes.indexOf(s.t) < 0) nodes.push(s.t); });
    const edges = [], index = {};
    for (let i = 0; i < seq.length; i++) {
      for (let j = i + 1; j < seq.length; j++) {
        const a = seq[i], b = seq[j];
        if (!a.t || !b.t || a.t === b.t || a.item !== b.item) continue;
        if (a.k === 'r' && b.k === 'r') continue;
        const type = a.k === 'w' && b.k === 'w' ? 'WW' : a.k === 'w' ? 'WR' : 'RW';
        const key = a.t + '>' + b.t;
        if (!index[key]) { index[key] = { from: a.t, to: b.t, types: [], item: a.item, pairs: [] }; edges.push(index[key]); }
        if (index[key].types.indexOf(type) < 0) index[key].types.push(type);
        index[key].pairs.push({ i, j, type, item: a.item });
      }
    }
    return { nodes, edges };
  }
  function adjOf(nodes, edges) {
    const a = {};
    nodes.forEach(n => (a[n] = []));
    edges.forEach(e => { if (a[e.from] && a[e.from].indexOf(e.to) < 0) a[e.from].push(e.to); });
    return a;
  }

  /** 严格 2PL 模拟：seq 里 k==='c' 表示提交（释放全部锁） */
  function twoPL(seq) {
    const locks = {}, held = {}, shrinking = {}, blocks = [], violations = [];
    seq.forEach((s, i) => {
      if (s.k === 'c') { shrinking[s.t] = true; held[s.t] = []; Object.keys(locks).forEach(it => { if (locks[it] && locks[it].by === s.t) locks[it] = null; }); return; }
      const mode = s.k === 'w' ? 'X' : 'S';
      if (shrinking[s.t]) violations.push({ i, t: s.t, item: s.item, why: '已过收缩期，释放锁后重新申请' });
      (held[s.t] = held[s.t] || []).push(item2(s.item));
      const cur = locks[s.item];
      if (cur && cur.by !== s.t && (cur.mode === 'X' || mode === 'X')) { blocks.push({ i, t: s.t, item: s.item, wait: cur.by, mode }); return; }
      if (!cur || (mode === 'X' && cur.mode === 'S')) locks[s.item] = { by: s.t, mode };
    });
    function item2(x) { return x; }
    return { blocks, violations, ok: !blocks.length && !violations.length };
  }

  /* =====================================================================
     事务引擎
     ===================================================================== */
  const fmt = v => (v === null || v === undefined ? '∅' : String(v));

  function createRun(sc, levelId, opts) {
    const R = {
      sc, level: byId(levelId), opts: opts || {},
      xid: {}, nameOf: {}, order: [], tx: {},
      items: {}, locks: {}, preds: [], hist: [], notes: [],
      seq: 0, ip: 0, nextXid: sc.nextXid || 601, frozen: sc.frozen || 600,
      done: false,
    };
    Object.keys(sc.items).forEach(key => {
      const v = sc.items[key];
      R.items[key] = { key, vers: [{ val: v.val, k: v.k === undefined ? v.val : v.k, xmin: R.frozen, xmax: 0, status: 'committed' }] };
    });
    return R;
  }

  function begin(R, t) {
    if (R.tx[t]) return R.tx[t];
    const x = R.nextXid++;
    R.xid[t] = x; R.nameOf[x] = t; R.order.push(t);
    const tx = R.tx[t] = { xid: x, status: 'active', view: null, lastRead: {}, reads: [], writes: [], blockedOnce: false };
    if (R.level.snap === 'begin') tx.view = makeView(R, x);
    return tx;
  }

  function statusOf(R, xid) {
    if (xid === R.frozen) return 'committed';
    const t = R.nameOf[xid];
    if (!t) return 'committed';
    const s = R.tx[t].status;
    return s === 'active' || s === 'blocked' ? 'active' : s;
  }

  function makeView(R, self) {
    // PG 的 GetSnapshotData 不把快照自身的事务放进 xip：自己的写入靠 xmin === self 判定
    const xip = R.order
      .filter(t => R.xid[t] !== self && R.tx[t].status !== 'committed' && R.tx[t].status !== 'aborted')
      .map(t => R.xid[t]).sort((a, b) => a - b);
    return { xmin: xip.length ? xip[0] : R.nextXid, xmax: R.nextXid, xip, by: self };
  }

  /** cur=true：current read（UPDATE / FOR UPDATE 的即时读），总是新取一个视图 */
  function viewFor(R, t, cur) {
    const tx = R.tx[t];
    if (cur || R.level.snap === 'stmt') return makeView(R, tx.xid);
    if (!tx.view) tx.view = makeView(R, tx.xid);
    return tx.view;
  }

  const versions = (R, item) => (R.items[item] ? R.items[item].vers : []);
  function head(R, item) { const v = versions(R, item); return v.length ? v[v.length - 1] : null; }
  /** 物理最新且未回滚的版本（RU 的读法） */
  function rawHead(R, item) {
    const v = versions(R, item);
    for (let i = v.length - 1; i >= 0; i--) if (v[i].status !== 'aborted') return v[i];
    return null;
  }
  /** 快照里可见的最新版本 */
  function pick(R, item, view, self) {
    const v = versions(R, item);
    for (let i = v.length - 1; i >= 0; i--) {
      const x = v[i];
      if (x.status === 'aborted') continue;
      if (isVisible(x, view, self, id => statusOf(R, id))) return x;
    }
    return null;
  }
  /** 当前最新存活版本（不查快照） */
  function pickLatest(R, item, self) {
    const v = versions(R, item);
    for (let i = v.length - 1; i >= 0; i--) {
      const x = v[i];
      if (x.status === 'aborted') continue;
      if (x.status === 'active' && x.xmin !== self) continue;
      if (x.xmax && statusOf(R, x.xmax) !== 'aborted') continue;
      return x;
    }
    return null;
  }

  function push(R, rec) { rec.seq = R.seq++; rec.sp = R.ip; R.hist.push(rec); return rec; }

  /* ---------- 锁表 ---------- */
  function lockConflict(R, item, mode, t) {
    const lk = R.locks[item];
    if (!lk) return [];
    const out = [];
    if (lk.X && lk.X !== t) out.push(lk.X);
    if (mode === 'X') (lk.S || []).forEach(x => { if (x !== t && out.indexOf(x) < 0) out.push(x); });
    return out.filter(x => R.tx[x] && (R.tx[x].status === 'active' || R.tx[x].status === 'blocked'));
  }
  function giveLock(R, item, mode, t) {
    const lk = R.locks[item] || (R.locks[item] = { S: [], X: null });
    if (mode === 'X') { lk.X = t; lk.S = (lk.S || []).filter(x => x === t); }
    else if ((lk.S || []).indexOf(t) < 0) lk.S.push(t);
  }
  function releaseLocks(R, t) {
    Object.keys(R.locks).forEach(it => {
      const lk = R.locks[it];
      if (lk.X === t) lk.X = null;
      lk.S = (lk.S || []).filter(x => x !== t);
      if (!lk.X && !lk.S.length) delete R.locks[it];
    });
    R.preds = R.preds.filter(p => p.t !== t);
  }
  function predCovering(R, k, self) {
    return R.preds.filter(p => p.t !== self && k >= p.lo && k <= p.hi &&
      R.tx[p.t] && (R.tx[p.t].status === 'active' || R.tx[p.t].status === 'blocked'));
  }

  /* ---------- 等待 / 死锁 ---------- */
  function abortWith(R, t, why, code) {
    const tx = R.tx[t];
    push(R, { t, op: 'abort', kind: 'abort', short: 'ROLLBACK', sql: 'ROLLBACK', res: `${code || '40001'} ${why}`, state: 'error' });
    R.notes.push(`${t} 被回滚：${why}`);
    finish(R, t, 'abort');
  }
  function checkDeadlock(R, t) {
    const adj = {};
    R.order.forEach(x => { const w = R.tx[x].waiting; if (w) adj[x] = [w.on]; });
    const cyc = findCycle(Object.keys(adj), adj);
    if (!cyc) return false;
    const victim = R.tx[t].waiting ? t : cyc[cyc.length - 2];
    R.notes.push(`死锁环 ${cyc.join(' → ')}（等待图环检测），牺牲者 ${victim}`);
    abortWith(R, victim, `死锁：等待环 ${cyc.join(' → ')}`, '40006');
    return true;
  }
  function blockOn(R, t, on, pending, why) {
    const tx = R.tx[t];
    tx.status = 'blocked';
    tx.waiting = { on, pending: Object.assign({}, pending) };
    tx.blockedOnce = true;
    push(R, { t, op: pending.op, item: pending.item, kind: 'blocked', sql: pending.sql, short: pending.short,
      res: `等待 ${on}`, state: 'blocked', why });
    if (!checkDeadlock(R, t)) return null;
    return R.hist[R.hist.length - 1];
  }
  function freeWaiters(R, ended) {
    for (let guard = 0; guard < 6; guard++) {
      const nxt = R.order.filter(t => R.tx[t].waiting && R.tx[t].waiting.on === ended);
      if (!nxt.length) return;
      const t = nxt[0];
      const pending = R.tx[t].waiting.pending;
      R.tx[t].status = 'active';
      R.tx[t].waiting = null;
      push(R, { t, op: pending.op, item: pending.item, kind: 'unblocked', sql: pending.sql, short: pending.short,
        res: `${ended} 已结束，锁已释放`, state: 'ok', why: '阻塞解除，被挂起的语句继续执行' });
      exec(R, t, pending);
      if (R.tx[t].waiting) continue;
      return;
    }
  }

  /* ---------- 语句执行 ---------- */
  /** 挂起时保留完整 op，被唤醒后重放才能得到同样的 val/mode/delta/check */
  function pendingOf(R, t, op) {
    return Object.assign({}, op, { sql: sqlOf(R, t, op), short: shortOf(op) });
  }

  function exec(R, t, op) {
    begin(R, t);
    const tx = R.tx[t], L = R.level, self = tx.xid;

    if (op.op === 'begin') {
      return push(R, { t, op: 'begin', kind: 'begin', sql: 'BEGIN', short: 'BEGIN',
        res: tx.view ? `xid=${self}，快照 xmin=${tx.view.xmin}` : `xid=${self}`, state: 'ok' });
    }
    if (op.op === 'commit' || op.op === 'abort') {
      if (tx.status === 'blocked') {
        return push(R, { t, op: op.op, kind: 'queued', sql: op.op === 'commit' ? 'COMMIT' : 'ROLLBACK',
          short: op.op === 'commit' ? 'COMMIT' : 'ROLLBACK', res: '仍在等锁', state: 'queued' });
      }
      push(R, { t, op: op.op, kind: op.op, sql: op.op === 'commit' ? 'COMMIT' : 'ROLLBACK',
        short: op.op === 'commit' ? 'COMMIT' : 'ROLLBACK', res: tx.view ? `快照 xmin=${tx.view.xmin}` : '', state: 'ok' });
      finish(R, t, op.op);
      return R.hist[R.hist.length - 1];
    }
    if (tx.status === 'blocked') {
      return push(R, { t, op: op.op, item: op.item, kind: 'queued', sql: sqlOf(R, t, op), short: shortOf(op),
        res: '仍在等锁', state: 'queued' });
    }

    /* --- 点读 / FOR UPDATE --- */
    if (op.op === 'read' || op.op === 'forUpdate') {
      const item = op.item;
      const cur = op.op === 'forUpdate';
      if (L.ssi || cur) {
        const conf = lockConflict(R, item, cur ? 'X' : 'S', t);
        if (conf.length) return blockOn(R, t, conf[0], pendingOf(R, t, op),
          cur ? 'SELECT FOR UPDATE：该行被其他事务锁定' : '串行化：该行的读锁与别人的写锁冲突');
      }
      let v, view = null, dirty = false;
      if (L.snap === 'none' && !cur) {
        v = rawHead(R, item);
        dirty = !!(v && v.status === 'active' && v.xmin !== self);
      } else if (cur) {
        view = viewFor(R, t, true);
        v = pickLatest(R, item, self);
      } else {
        view = viewFor(R, t, false);
        v = pick(R, item, view, self);
      }
      const val = v ? v.val : null;
      tx.lastRead[item] = val;
      if (tx.reads.indexOf(item) < 0) tx.reads.push(item);
      if (L.ssi || cur) giveLock(R, item, cur ? 'X' : 'S', t);
      return push(R, { t, op: op.op, item, kind: 'read', sql: sqlOf(R, t, op), short: shortOf(op),
        res: `→ ${fmt(val)}` + (dirty ? '　读到未提交值' : ''), state: 'ok', val, ver: v, dirty,
        view: view ? { xmin: view.xmin, xmax: view.xmax, xip: view.xip } : null });
    }

    /* --- 范围读 --- */
    if (op.op === 'range') {
      let list, view = null;
      if (L.snap === 'none') {
        list = Object.keys(R.items).filter(k => { const h = rawHead(R, k); return h && h.k >= op.lo && h.k <= op.hi; });
      } else {
        view = viewFor(R, t, false);
        list = Object.keys(R.items).filter(k => { const v = pick(R, k, view, self); return v && v.k >= op.lo && v.k <= op.hi; });
      }
      if (L.ssi) {
        let conf = [];
        list.forEach(k => lockConflict(R, k, 'S', t).forEach(x => { if (conf.indexOf(x) < 0) conf.push(x); }));
        if (conf.length) return blockOn(R, t, conf[0], pendingOf(R, t, op),
          '串行化：范围内有别人的写锁');
        list.forEach(k => giveLock(R, k, 'S', t));
        R.preds.push({ t, lo: op.lo, hi: op.hi, name: op.label || '' });
      }
      return push(R, { t, op: 'range', item: 'range', kind: 'read', sql: sqlOf(R, t, op), short: shortOf(op),
        res: `→ n=${list.length} [${list.join(',') || '空'}]`, state: 'ok', list,
        view: view ? { xmin: view.xmin, xmax: view.xmax, xip: view.xip } : null });
    }

    /* --- 写 / 插入 / 删除 --- */
    if (op.op === 'write' || op.op === 'insert' || op.op === 'delete') {
      const item = op.item;
      if (op.op === 'insert') R.items[item] = { key: item, vers: [] };
      if (!R.items[item]) return push(R, { t, op: op.op, item, kind: 'error', sql: sqlOf(R, t, op), short: shortOf(op), res: '对象不存在', state: 'error' });

      const h = head(R, item);
      let conf = [], predHit = null;
      if (L.ssi) {
        conf = lockConflict(R, item, 'X', t);
        if (op.op === 'insert') {
          const ps = predCovering(R, op.k === undefined ? op.val : op.k, self);
          if (ps.length) predHit = ps[0].t;
        }
      } else if (h && h.status === 'active' && h.xmin !== self && !R.opts.noRowLock) conf = [R.nameOf[h.xmin]];
      if (predHit) {
        push(R, { t, op: op.op, item, kind: 'blocked', sql: sqlOf(R, t, op), short: shortOf(op),
          res: `与 ${predHit} 的谓词锁冲突`, state: 'blocked', why: '串行化：插入落在别人的谓词锁范围内' });
        abortWith(R, t, `序列化冲突：插入落在 ${predHit} 的谓词锁范围内（SG 冲突）`, '40001');
        return R.hist[R.hist.length - 1];
      }
      if (conf.length) {
        return blockOn(R, t, conf[0], pendingOf(R, t, op),
          L.ssi ? '串行化：该行已被其他事务锁定' : '同一行的写锁未释放：等持有者给出结果');
      }

      let val, base = null, how = '';
      const prevLive = L.snap === 'none' ? rawHead(R, item) : pickLatest(R, item, self);
      if (op.op === 'delete') { val = null; }
      else if (op.mode === 'db') { base = prevLive ? prevLive.val : null; val = (base === null || base === undefined ? 0 : base) + (op.delta || 0); how = '库内表达式 v=v+1，基于当前最新值'; }
      else if (op.mode === 'app') { base = tx.lastRead[item]; val = (base === null || base === undefined ? 0 : base) + (op.delta || 0); how = '应用侧 read-modify-write，基于本事务之前读到的值'; }
      else { val = op.val; }

      if (op.check && !op.check(tx.lastRead)) {
        const seen = Object.keys(tx.lastRead).map(k => `${k}=${fmt(tx.lastRead[k])}`).join(', ');
        return push(R, { t, op: op.op, item, kind: 'noop', sql: sqlOf(R, t, op), short: shortOf(op),
          res: '条件不满足，未写入', state: 'noop', why: `约束检查用的是本事务读到的值（${seen}），这次 UPDATE 没有执行` });
      }

      if (op.op === 'delete') {
        const v = pick(R, item, viewFor(R, t, true), self) || rawHead(R, item);
        if (v) v.xmax = self;
      } else {
        const before = head(R, item);
        if (before) before.xmax = self;
        R.items[item].vers.push({ val, k: op.k === undefined ? val : op.k, xmin: self, xmax: 0, status: 'active', born: R.seq });
      }
      tx.writes.push({ item, val, base, seq: R.seq, mode: op.mode, how });
      if (L.ssi || !R.opts.noLockRecord) giveLock(R, item, 'X', t);
      return push(R, { t, op: op.op, item, kind: 'write', sql: sqlOf(R, t, op), short: shortOf(op),
        res: op.op === 'delete' ? '标记删除（未提交）' : `写 ${fmt(val)}`, state: 'ok', val, base, how, mode: op.mode,
        dirty: false });
    }

    return push(R, { t, op: op.op, kind: 'error', sql: '—', short: '?', res: '未知操作：' + op.op, state: 'error' });
  }

  function finish(R, t, kind) {
    const tx = R.tx[t], ab = kind === 'abort';
    tx.status = ab ? 'aborted' : 'committed';
    tx.waiting = null;
    Object.keys(R.items).forEach(k => {
      const vs = R.items[k].vers;
      vs.forEach(v => {
        if (v.xmin === tx.xid) v.status = ab ? 'aborted' : 'committed';
        if (ab && v.xmax === tx.xid) v.xmax = 0;
      });
    });
    releaseLocks(R, t);
    freeWaiters(R, t);
  }

  function finalizeRun(R) {
    R.order.forEach(t => {
      if (R.tx[t].status === 'active' && R.tx[t].writes.length) {
        push(R, { t, op: 'commit', kind: 'commit', sql: 'COMMIT', short: 'COMMIT', res: '脚本结束，自动提交', state: 'ok' });
        finish(R, t, 'commit');
      } else if (R.tx[t].status === 'active') {
        push(R, { t, op: 'abort', kind: 'abort', sql: 'ROLLBACK', short: 'ROLLBACK', res: '脚本结束，只读事务直接结束', state: 'ok' });
        finish(R, t, 'abort');
      }
    });
    R.done = true;
    return R;
  }

  function stepRun(R) {
    if (R.ip >= R.sc.script.length) { finalizeRun(R); return null; }
    const op = R.sc.script[R.ip++];
    begin(R, op.t);
    const tx = R.tx[op.t];
    if (tx.status === 'aborted' || tx.status === 'committed') {
      return push(R, { t: op.t, op: op.op, item: op.item, kind: 'skip', sql: sqlOf(R, op.t, op), short: shortOf(op),
        res: '事务已结束', state: 'skip', why: '该事务此前已被回滚/结束，这条语句不再执行' });
    }
    const pend = tx.waiting ? tx.waiting.pending : null;
    return exec(R, op.t, Object.assign({}, op, pend ? {} : {}));
  }

  function runAll(R) { while (!R.done) { if (R.ip >= R.sc.script.length) { finalizeRun(R); break; } stepRun(R); } return R; }

  /* ---------- 文案 ---------- */
  function sqlOf(R, t, op) {
    const tb = R.sc.table || 't';
    switch (op.op) {
      case 'begin': return 'BEGIN';
      case 'read': return `SELECT v FROM ${tb} WHERE id='${op.item}'`;
      case 'forUpdate': return `SELECT v FROM ${tb} WHERE id='${op.item}' FOR UPDATE`;
      case 'range': return `SELECT * FROM ${tb} WHERE v BETWEEN ${op.lo} AND ${op.hi}`;
      case 'write': return op.mode === 'db' ? `UPDATE ${tb} SET v = v + ${op.delta} WHERE id='${op.item}'`
        : `UPDATE ${tb} SET v = ${op.valText === undefined ? '?' : op.valText} WHERE id='${op.item}'`;
      case 'insert': return `INSERT INTO ${tb} VALUES ('${op.item}', ${op.val})`;
      case 'delete': return `DELETE FROM ${tb} WHERE id='${op.item}'`;
      case 'commit': return 'COMMIT';
      case 'abort': return 'ROLLBACK';
      default: return op.sqlText || op.op;
    }
  }
  function shortOf(op) {
    switch (op.op) {
      case 'begin': return 'BEGIN';
      case 'read': return `读 ${op.item}`;
      case 'forUpdate': return `锁 ${op.item}`;
      case 'range': return '范围读';
      case 'write': return `写 ${op.item}`;
      case 'insert': return `插入 ${op.item}`;
      case 'delete': return `删 ${op.item}`;
      case 'commit': return 'COMMIT';
      case 'abort': return 'ROLLBACK';
      default: return op.op;
    }
  }

  /* ---------- 终态与异常判定 ---------- */
  function committedVals(R) {
    const out = {};
    Object.keys(R.items).forEach(k => {
      const vs = R.items[k].vers;
      out[k] = null;
      for (let i = vs.length - 1; i >= 0; i--) {
        const v = vs[i];
        if (v.status !== 'committed') continue;
        if (v.xmax && statusOf(R, v.xmax) === 'committed') continue;
        out[k] = v.val; break;
      }
    });
    return out;
  }
  function invariantState(R) {
    if (!R.sc.invariant) return null;
    const vals = committedVals(R);
    const inv = R.sc.invariant(vals);
    return Object.assign({ vals }, inv, { live: R.order.filter(t => R.tx[t].status === 'active').length });
  }

  const ANOMALY_KINDS = [
    { kind: 'dirty', name: '脏读' },
    { kind: 'nonrepeat', name: '不可重复读' },
    { kind: 'phantom', name: '幻读' },
    { kind: 'lost', name: '丢失更新' },
    { kind: 'skew', name: '写偏斜' },
  ];

  function anomalies(R) {
    const A = [], H = R.hist;
    const committed = t => R.tx[t] && R.tx[t].status === 'committed';
    const reads = h => h.kind === 'read' && h.state === 'ok';

    H.filter(h => reads(h) && h.dirty).forEach(h => {
      const w = h.ver ? R.nameOf[h.ver.xmin] : null;
      A.push({ kind: 'dirty', name: '脏读', seqs: [h.seq], t: h.t, item: h.item,
        why: `${h.t} 在第 ${h.seq + 1} 步读到 ${w} 尚未提交的 ${fmt(h.val)}${committed(w) ? '' : '，而该事务随后回滚 —— 这个值在数据库里从来没有存在过'}` });
    });

    const grp = {};
    H.filter(h => reads(h) && h.op === 'read').forEach(h => {
      const k = h.t + '|' + h.item;
      (grp[k] = grp[k] || []).push(h);
    });
    Object.keys(grp).forEach(k => {
      const l = grp[k];
      for (let i = 1; i < l.length; i++) {
        if (l[i].val === l[i - 1].val) continue;
        const ws = H.filter(h => h.kind === 'write' && h.state === 'ok' && h.item === l[i].item &&
          h.t !== l[i].t && h.seq > l[i - 1].seq && h.seq <= l[i].seq && committed(h.t));
        // 中间没有「已提交的写」时值的变化来自回滚或未提交读，那是脏读，不是不可重复读
        if (!ws.length) continue;
        A.push({ kind: 'nonrepeat', name: '不可重复读', seqs: [l[i - 1].seq, l[i].seq], t: l[i].t, item: l[i].item,
          why: `${l[i].t} 对 ${l[i].item} 两次读到的值分别是 ${fmt(l[i - 1].val)} 和 ${fmt(l[i].val)}，中间 ${ws.map(w => w.t).join('、')} 提交了写入` });
      }
    });

    const rg = {};
    H.filter(h => reads(h) && h.op === 'range').forEach(h => {
      const k = h.t + '|' + h.sql;
      (rg[k] = rg[k] || []).push(h);
    });
    Object.keys(rg).forEach(k => {
      const l = rg[k];
      for (let i = 1; i < l.length; i++) {
        const a = l[i - 1].list || [], b = l[i].list || [];
        const add = b.filter(x => a.indexOf(x) < 0), del = a.filter(x => b.indexOf(x) < 0);
        if (!add.length && !del.length) continue;
        A.push({ kind: 'phantom', name: '幻读', seqs: [l[i - 1].seq, l[i].seq], t: l[i].t,
          why: `${l[i].t} 第二次执行同一范围查询多出 ${add.length} 行 [${add.join(',') || '—'}]、少 ${del.length} 行 [${del.join(',') || '—'}]；两次读之间有别的读写事务提交了满足条件的行` });
      }
    });

    const pw = {};
    H.filter(h => h.kind === 'write' && h.state === 'ok' && h.item !== 'range' && committed(h.t)).forEach(h => {
      (pw[h.item] = pw[h.item] || []).push(h);
    });
    Object.keys(pw).forEach(item => {
      const l = pw[item];
      for (let i = 1; i < l.length; i++) {
        if (l[i].base === null || l[i].base === undefined) continue;
        if (l[i].base !== l[i - 1].val && l[i].t !== l[i - 1].t) {
          A.push({ kind: 'lost', name: '丢失更新', seqs: [l[i - 1].seq, l[i].seq], item,
            why: `${l[i].t} 基于它读到的 ${fmt(l[i].base)} 写出 ${fmt(l[i].val)}，直接盖掉了 ${l[i - 1].t} 已提交的 ${fmt(l[i - 1].val)}：后一次写没有建立在前一次写之上` });
        }
      }
    });

    const cs = R.order.filter(t => committed(t) && R.tx[t].writes.length);
    for (let i = 0; i < cs.length; i++) {
      for (let j = i + 1; j < cs.length; j++) {
        const a = cs[i], b = cs[j];
        const wa = R.tx[a].writes.map(w => w.item), wb = R.tx[b].writes.map(w => w.item);
        const ra = R.tx[a].reads, rb = R.tx[b].reads;
        const inter = ra.filter(x => rb.indexOf(x) >= 0);
        if (!inter.length) continue;
        if (wa.filter(x => wb.indexOf(x) >= 0).length) continue;
        const lastR = Math.max(Math.max.apply(null, ra.map(x => Math.max.apply(null, H.filter(h => reads(h) && h.item === x && (h.t === a || h.t === b)).map(h => h.seq).concat([-1])))),
          -1);
        const firstW = Math.min(Math.min.apply(null, R.tx[a].writes.concat(R.tx[b].writes).map(w => w.seq)));
        if (lastR > firstW) continue;
        const inv = R.sc.invariant ? R.sc.invariant(committedVals(R)) : null;
        if (!inv || inv.ok !== false) continue;
        A.push({ kind: 'skew', name: '写偏斜', seqs: R.tx[a].writes.concat(R.tx[b].writes).map(w => w.seq), t: `${a}/${b}`,
          why: `${a} 与 ${b} 读了同一组数据（${inter.join('、')}）却各写自己那一行（${wa.join('、')} / ${wb.join('、')}），两个写互不冲突都提交了，结果约束「${inv.expr}」被破坏` });
      }
    }
    return dedup(A);
  }
  function dedup(list) {
    const seen = {}, out = [];
    list.forEach(x => { const k = x.kind + '|' + (x.seqs || []).join(','); if (!seen[k]) { seen[k] = 1; out.push(x); } });
    return out;
  }

  root.MVCC = {
    LEVELS, byId, cmpXid, traceVisible, isVisible,
    findCycle, topoSort, conflictGraph, adjOf, twoPL,
    createRun, stepRun, runAll, finalizeRun, anomalies, committedVals, invariantState,
    makeView, statusOf, viewFor, pick, pickLatest, head, rawHead, versions,
    sqlOf, shortOf, fmt, ANOMALY_KINDS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
