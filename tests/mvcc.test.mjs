/* MVCC 内核测试：PG 风格快照可见性判定、优先图环检测，
   以及脏读 / 不可重复读 / 幻读 / 丢失更新 / 写偏斜由执行历史判出。
   内核加载自 apps/mvcc-lab/js/mvcc-core.js，UI 从不预置结论。 */
import { loadMvcc } from './_load.mjs';
const { MVCC } = loadMvcc();

const clone = sc => Object.assign({}, sc, {
  items: JSON.parse(JSON.stringify(sc.items)),
  script: JSON.parse(JSON.stringify(sc.script)),
});

function run(level, sc) {
  const R = MVCC.createRun(sc, level);
  MVCC.runAll(R);
  return R;
}

/* ---------- 1) PG Read View 快照可见性 ---------- */
function visibility(t) {
  const view = { xmin: 101, xmax: 105, xip: [101, 103] };
  const st = { 100: 'committed', 101: 'committed', 102: 'committed', 103: 'committed', 104: 'committed', 106: 'committed' };
  const statusOf = id => st[id] || 'committed';

  t.eq('xmin 在 xip 内 → 不可见（快照时它还在运行）',
    MVCC.isVisible({ xmin: 103, xmax: 0, status: 'committed' }, view, 106, statusOf), false);
  t.eq('xmin < xmax 且不在 xip → 可见', MVCC.isVisible({ xmin: 102, xmax: 0, status: 'committed' }, view, 106, statusOf), true);
  t.eq('xmin ≥ xmax（快照之后才分配）→ 不可见', MVCC.isVisible({ xmin: 107, xmax: 0, status: 'committed' }, view, 106, statusOf), false);
  t.eq('xmax 在 xip 内 → 删除未生效，仍可见',
    MVCC.isVisible({ xmin: 100, xmax: 103, status: 'committed' }, view, 106, id => id === 103 ? 'active' : 'committed'), true);
  t.eq('xmax 已提交且早于快照 → 不可见', MVCC.isVisible({ xmin: 100, xmax: 102, status: 'committed' }, view, 106, statusOf), false);
  t.eq('xmin 事务回滚 → 版本从未生效，不可见',
    MVCC.isVisible({ xmin: 102, xmax: 0, status: 'aborted' }, view, 106, id => id === 102 ? 'aborted' : 'committed'), false);
  t.eq('自己的写入永远可见', MVCC.isVisible({ xmin: 106, xmax: 0, status: 'active' }, view, 106, statusOf), true);
}

/* ---------- 2) 冲突优先图 + 环检测 ---------- */
function graph(t) {
  const g1 = MVCC.conflictGraph([
    { t: 'T1', k: 'r', item: 'a' }, { t: 'T2', k: 'w', item: 'a' },
    { t: 'T2', k: 'r', item: 'b' }, { t: 'T1', k: 'w', item: 'b' },
  ]);
  const cyc = MVCC.findCycle(g1.nodes, MVCC.adjOf(g1.nodes, g1.edges));
  t.ok('RW + WR 交叉 → 成环（不可串行化）', !!cyc,
    { edges: g1.edges.map(e => e.from + '→' + e.to), cyc });

  const g2 = MVCC.conflictGraph([
    { t: 'T1', k: 'r', item: 'a' }, { t: 'T2', k: 'r', item: 'a' }, { t: 'T1', k: 'w', item: 'a' },
  ]);
  t.eq('读读不建边 → 无环', MVCC.findCycle(g2.nodes, MVCC.adjOf(g2.nodes, g2.edges)), null);

  const g3 = MVCC.conflictGraph([
    { t: 'T1', k: 'w', item: 'a' }, { t: 'T2', k: 'r', item: 'a' }, { t: 'T2', k: 'w', item: 'b' },
  ]);
  t.ok('无环 → 存在等价串行顺序', !!MVCC.topoSort(g3.nodes, MVCC.adjOf(g3.nodes, g3.edges)));
}

/* ---------- 3) 脏读 ---------- */
function dirtyRead(t) {
  const sc = {
    table: 't', items: { A: { val: 10, k: 10 } },
    script: [
      { t: 'A', op: 'begin' }, { t: 'B', op: 'begin' },
      { t: 'A', op: 'write', item: 'A', val: 20, valText: '20' },
      { t: 'B', op: 'read', item: 'A' },
      { t: 'A', op: 'abort' },
      { t: 'B', op: 'read', item: 'A' },
      { t: 'B', op: 'commit' },
    ],
  };
  const ru = run('RU', clone(sc));
  t.ok('RU 复现脏读：B 读到 A 回滚前写入的 20',
    MVCC.anomalies(ru).some(a => a.kind === 'dirty'),
    MVCC.anomalies(ru).filter(a => a.kind === 'dirty').map(a => a.why));
  const rc = run('RC', clone(sc));
  t.eq('RC 读已提交，脏读消失', MVCC.anomalies(rc).filter(a => a.kind === 'dirty').length, 0);
}

/* ---------- 4) 不可重复读 ---------- */
function nonRepeat(t) {
  const sc = {
    table: 't', items: { A: { val: 10, k: 10 } },
    script: [
      { t: 'A', op: 'begin' }, { t: 'B', op: 'begin' },
      { t: 'B', op: 'read', item: 'A' },
      { t: 'A', op: 'write', item: 'A', val: 20, valText: '20' },
      { t: 'A', op: 'commit' },
      { t: 'B', op: 'read', item: 'A' },
      { t: 'B', op: 'commit' },
    ],
  };
  const rc = run('RC', clone(sc));
  const reads = rc.hist.filter(h => h.op === 'read' && h.t === 'B').map(h => h.val);
  t.eq('RC 两次读不同值', reads.join(','), '10,20');
  t.ok('RC 判定出不可重复读', MVCC.anomalies(rc).some(a => a.kind === 'nonrepeat'));

  const rr = run('RR', clone(sc));
  const rrReads = rr.hist.filter(h => h.op === 'read' && h.t === 'B').map(h => h.val);
  t.eq('RR 两次读同值（语句间快照稳定）', rrReads[0] === rrReads[1], true);
  t.eq('RR 无不可重复读', MVCC.anomalies(rr).filter(a => a.kind === 'nonrepeat').length, 0);
}

/* ---------- 5) 写偏斜：SI 允许，SER 拦住 ---------- */
function writeSkew(t) {
  const sc = {
    table: 'doctor', items: { onA: { val: 1, k: 1 }, onB: { val: 1, k: 1 } },
    invariant: v => ({ ok: v.onA + v.onB >= 1, expr: 'onA + onB >= 1' }),
    script: [
      { t: 'A', op: 'begin' }, { t: 'B', op: 'begin' },
      { t: 'A', op: 'read', item: 'onA' }, { t: 'A', op: 'read', item: 'onB' },
      { t: 'B', op: 'read', item: 'onA' }, { t: 'B', op: 'read', item: 'onB' },
      { t: 'A', op: 'write', item: 'onA', val: 0, valText: '0', check: s => s.onA + s.onB >= 2 },
      { t: 'B', op: 'write', item: 'onB', val: 0, valText: '0', check: s => s.onA + s.onB >= 2 },
      { t: 'A', op: 'commit' }, { t: 'B', op: 'commit' },
    ],
  };
  const si = run('SI', clone(sc));
  const siInv = MVCC.invariantState(si);
  t.ok('SI 下写偏斜发生：两人同时请假，值班约束被打破', siInv.ok === false,
    { vals: siInv.vals, anomalies: MVCC.anomalies(si).map(a => a.kind) });
  t.ok('SI 判定出写偏斜', MVCC.anomalies(si).some(a => a.kind === 'skew'));

  const ser = run('SER', clone(sc));
  const serInv = MVCC.invariantState(ser);
  t.ok('SER 守住约束：至少一位值班医生在岗', serInv.ok !== false, { vals: serInv.vals });
  const aborts = ser.hist.filter(h => h.kind === 'abort').map(h => h.t);
  t.eq('SER 恰好回滚一个事务（死锁环检测牺牲者）', aborts.length, 1, ser.notes);
}

/* ---------- 6) 丢失更新 ---------- */
function lostUpdate(t) {
  const script = [
    { t: 'A', op: 'begin' }, { t: 'B', op: 'begin' },
    { t: 'A', op: 'read', item: 'A' }, { t: 'B', op: 'read', item: 'A' },
    { t: 'A', op: 'write', item: 'A', mode: 'app', delta: 10, valText: 'v+10' },
    { t: 'B', op: 'write', item: 'A', mode: 'app', delta: -10, valText: 'v-10' },
    { t: 'A', op: 'commit' }, { t: 'B', op: 'commit' },
  ];
  const app = run('RR', { table: 'acct', items: { A: { val: 100, k: 100 } }, script: JSON.parse(JSON.stringify(script)) });
  t.ok('RR + 应用侧 read-modify-write → 丢失更新（100-10 而非 100）',
    MVCC.anomalies(app).some(a => a.kind === 'lost'),
    { vals: MVCC.committedVals(app), kinds: MVCC.anomalies(app).map(a => a.kind) });

  const db = run('RR', { table: 'acct', items: { A: { val: 100, k: 100 } },
    script: script.map(s => s.op === 'write' ? Object.assign({}, s, { mode: 'db' }) : s) });
  t.ok('RR + UPDATE v=v+1 → 行锁把两次更新串行化，金额正确',
    !MVCC.anomalies(db).some(a => a.kind === 'lost') && MVCC.committedVals(db).A === 100,
    { vals: MVCC.committedVals(db), kinds: MVCC.anomalies(db).map(a => a.kind) });
}

/* ---------- 7) 幻读 ---------- */
function phantom(t) {
  const sc = {
    table: 't', items: { r1: { val: 5, k: 5 } },
    script: [
      { t: 'A', op: 'begin' }, { t: 'B', op: 'begin' },
      { t: 'A', op: 'range', lo: 1, hi: 10, label: 'v∈[1,10]' },
      { t: 'B', op: 'insert', item: 'r2', val: 7, k: 7 },
      { t: 'B', op: 'commit' },
      { t: 'A', op: 'range', lo: 1, hi: 10, label: 'v∈[1,10]' },
      { t: 'A', op: 'commit' },
    ],
  };
  const rc = run('RC', clone(sc));
  t.ok('RC 复现幻读：两次范围查询行数不同', MVCC.anomalies(rc).some(a => a.kind === 'phantom'));
  const si = run('SI', clone(sc));
  t.eq('SI 无幻读（快照不含 B 插入的新行）', MVCC.anomalies(si).filter(a => a.kind === 'phantom').length, 0);
}

export default {
  name: 'MVCC 内核 · 可见性判定与异常判出',
  test(t) {
    t.head('PG Read View 快照可见性');
    visibility(t);
    t.head('冲突优先图与环检测');
    graph(t);
    t.head('脏读');
    dirtyRead(t);
    t.head('不可重复读');
    nonRepeat(t);
    t.head('写偏斜（SI vs SER）');
    writeSkew(t);
    t.head('丢失更新');
    lostUpdate(t);
    t.head('幻读');
    phantom(t);
  },
};
