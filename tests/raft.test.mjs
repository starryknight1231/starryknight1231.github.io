/* Raft 内核测试：选举收敛、日志复制、分区/愈合，以及两条安全规则的开关对照。
   全部场景在虚拟时钟上运行，内核加载自 apps/raft-lab/js/raft-core.js。 */
import { loadRaft } from './_load.mjs';
const { Cluster } = loadRaft();

const STEP = 200000;               // settle 的最大事件步数上限
const settle = (c, ms) => c.settle(ms, STEP);
const fmtLog = n => n.log.map(e => `${e.term}:${e.key}${e.val}`).join(',');
const committedPrefix = n => fmtLog(n).split(',').slice(0, n.commit).join(',');

/* ---------- 基线 ---------- */
function baseline(t) {
  const c = new Cluster({ nodes: 5, seed: 7 });
  settle(c, 400);
  t.ok('5 节点基线：选出唯一 leader', c.leader() !== null && c.aliveNodes().filter(n => n.role === 'leader').length === 1);
  t.eq('基线不变量为空', c.checkInvariants().length, 0);

  for (let i = 1; i <= 4; i++) c.submit('k' + i, 'v' + i);
  settle(c, 400);
  t.ok('提交 4 条命令：多数派状态机已应用', c.nodes.filter(n => n.applied >= 4).length >= c.majority);
  t.eq('复制与提交过程不变量为空', c.checkInvariants().length, 0);
}

/* ---------- 选举超时对照 ---------- */
function electionTimeout(t) {
  const electWith = fixed => {
    const c = new Cluster({ nodes: 3, seed: 11, fixedElection: fixed, electionMin: 150, electionMax: 300 });
    settle(c, 2000);
    return { leader: !!c.leader(), elections: c.metrics.elections, term: Math.max(...c.nodes.map(n => n.term)) };
  };
  const fixed = electWith(300), rand = electWith(0);
  t.ok('固定选举超时 → 活锁（2s 内选不出主，发起选举次数明显更多）',
    !fixed.leader && fixed.elections > rand.elections,
    { fixed: fixed.elections, random: rand.elections });
  t.ok('随机选举超时 → 收敛选出 leader', rand.leader, { elections: rand.elections, term: rand.term });
}

/* ---------- 分区 ---------- */
function partition(t) {
  const c = new Cluster({ nodes: 5, seed: 3 });
  settle(c, 400);
  const l = c.leader();
  c.submit('a', '1');
  settle(c, 200);
  const before = l.commit;
  c.setPartition([[l.id, 'S2'], ['S3', 'S4', 'S5']]);
  c.submit('b', '2');
  settle(c, 1200);
  t.eq('少数派一侧 leader 的 commitIndex 无法推进', l.commit, before);
  t.ok('新条目只追加到本地日志、始终未被提交', l.log.length === before + 1, { logLen: l.log.length, commit: l.commit });
  t.ok('多数派一侧已选出更高 term 的新主', c.aliveNodes().some(n => n.role === 'leader' && n !== l && n.term > l.term),
    { leaders: c.aliveNodes().filter(n => n.role === 'leader').map(n => n.id + '@' + n.term) });
  t.eq('分区期间不变量为空', c.checkInvariants().length, 0);

  c.heal();
  settle(c, 1500);
  t.eq('愈合后不变量为空（未提交后缀被安全处理）', c.checkInvariants().length, 0);
  c.submit('c', '3');
  settle(c, 400);
  t.ok('愈合后集群恢复写入与提交', c.leader() !== null && c.leader().commit >= before + 1,
    { leader: c.leader() && c.leader().id, commit: c.leader() && c.leader().commit });
  t.ok('分区期间未提交的条目 b 被安全截断，不在任何已提交前缀里',
    c.nodes.every(n => n.log.slice(0, n.commit).every(e => e.key !== 'b')));
}

/* ---------- 杀 leader ---------- */
function killLeader(t) {
  const c = new Cluster({ nodes: 5, seed: 5 });
  settle(c, 400);
  const old = c.leader();
  for (let i = 1; i <= 3; i++) { c.submit('x', String(i)); settle(c, 200); }
  const committed = committedPrefix(old);
  t.eq('杀 leader 前 3 条命令已提交', old.commit, 3);

  c.kill(old.id);
  settle(c, 1200);
  const next = c.leader();
  t.ok('杀掉 leader 后集群重新选出新主', !!next, { newLeader: next && next.id });
  t.eq('新 leader 的已提交前缀与旧 leader 完全一致（日志不丢）', next ? committedPrefix(next) : '', committed);
  t.eq('接管过程不变量为空', c.checkInvariants().length, 0);
}

/* ---------- Raft Figure 8：两条安全规则的开关对照 ---------- */
function figure8(voteUpToDate, commitCurrentTermOnly) {
  const c = new Cluster({ nodes: 5, seed: 9, voteUpToDate, commitCurrentTermOnly });
  const E = (term, key, val) => ({ term, key, val });
  const base = [E(1, 'a', 'a'), E(2, 'b', 'b')];
  // (a) S1 在 term 2 当 leader，(2,c) 只复制到 S2；随后 S1、S2 崩溃
  c.loadState({
    now: 0,
    nodes: [
      { id: 'S1', role: 'leader', term: 2, log: base.concat([E(2, 'c', 'c')]), commit: 2, alive: true },
      { id: 'S2', role: 'follower', term: 2, log: base.concat([E(2, 'c', 'c')]), commit: 2, alive: true },
      { id: 'S3', role: 'follower', term: 2, log: base, commit: 2, alive: true },
      { id: 'S4', role: 'follower', term: 2, log: base, commit: 2, alive: true },
      { id: 'S5', role: 'follower', term: 2, log: base, commit: 2, alive: true },
    ],
  });
  c.kill('S1'); c.kill('S2');
  settle(c, 1500);                                     // (b) term 3 选举
  const l3 = c.leader();
  if (l3) { c.submit('d', 'd'); settle(c, 1500); }     // (c) 复制并提交 (3,d)
  const committedBy3 = l3 ? l3.commit : 0;
  if (l3) c.kill(l3.id);                               // (d) 新主也崩溃
  c.revive('S1'); settle(c, 1500);                     // S1 以更高 term 重新当选
  const l4 = c.leader();
  if (l4) { c.replicateAllTo(l4, 'S3'); settle(c, 1200); }  // 旧条目 (2,c) 落到 S3，未提交
  if (l4) c.kill(l4.id);
  c.revive('S2'); c.revive('S3'); c.revive('S4'); c.revive('S5');
  settle(c, 2500);                                     // (e) term 5 选举
  const l5 = c.leader();
  if (l5) { c.submit('e', 'e'); settle(c, 2500); }
  return {
    committedBy3,
    l5log: l5 ? fmtLog(l5) : '—',
    violations: c.checkInvariants().map(v => v.rule + '：' + v.detail),
  };
}

function safetyRules(t) {
  const on = figure8(true, true);
  t.eq('Figure 8 · 规则全开：完整时间线走完无违例', on.violations.length, 0, JSON.stringify(on));
  t.ok('Figure 8 · 未提交的旧条目 (2,c) 不混进任何已提交前缀',
    on.l5log.includes('5:dd') && !on.l5log.includes('2:cc'), { term5Log: on.l5log });
}

/* ---------- 安全规则场景夹具（手工布好的现场） ---------- */
function scenarioA(voteUpToDate) {
  // S3 上已提交 index 3（3|d|d）；多数派 {S4,S5} 失联，S1 的日志缺这一条
  const c = new Cluster({ nodes: 5, seed: 21, voteUpToDate, commitCurrentTermOnly: true });
  const E = (term, key, val) => ({ term, key, val });
  c.loadState({
    now: 0,
    committedRecord: {
      1: { sig: '1|a|a', term: 1, at: 0 },
      2: { sig: '2|b|b', term: 2, at: 0 },
      3: { sig: '3|d|d', term: 3, at: 0 },
    },
    nodes: [
      { id: 'S1', role: 'follower', term: 2, log: [E(1, 'a', 'a'), E(2, 'b', 'b'), E(2, 'c', 'c')], commit: 2, alive: true },
      { id: 'S2', role: 'follower', term: 2, log: [E(1, 'a', 'a'), E(2, 'b', 'b')], commit: 2, alive: true },
      { id: 'S3', role: 'follower', term: 3, log: [E(1, 'a', 'a'), E(2, 'b', 'b'), E(3, 'd', 'd')], commit: 3, alive: true },
      { id: 'S4', role: 'follower', term: 3, log: [E(1, 'a', 'a'), E(2, 'b', 'b'), E(3, 'd', 'd')], commit: 3, alive: true },
      { id: 'S5', role: 'follower', term: 3, log: [E(1, 'a', 'a'), E(2, 'b', 'b'), E(3, 'd', 'd')], commit: 3, alive: true },
    ],
  });
  c.kill('S4'); c.kill('S5');
  c.setPartition([['S1', 'S2', 'S3']]);
  const s1 = c.node('S1');
  c.nodes.forEach(n => { if (n !== s1 && n.alive) c.armElectionIn(n, 5000); });
  c.armElectionIn(s1, 10);
  const l = c.untilLeader(4000);
  const first = l ? { winner: l.id, log: fmtLog(l) } : { winner: null, log: '—' };
  if (l) { c.submit('e', 'e'); settle(c, 1500); }
  else {
    const s3 = c.node('S3');
    c.nodes.forEach(n => { if (n.alive && n !== s3) c.armElectionIn(n, 9000); });
    c.armElectionIn(s3, 10);
    const l2 = c.untilLeader(4000);
    if (l2) { first.winner = l2.id; first.log = fmtLog(l2); c.submit('e', 'e'); settle(c, 1500); }
  }
  return { ...first, violations: c.checkInvariants().map(v => v.rule + '：' + v.detail) };
}

function scenarioB(commitCurrentTermOnly) {
  // 旧 term 的 (2,c) 已在多数派上；S4/S5 隔离后各自持有已提交的 (3,d)
  const c = new Cluster({ nodes: 5, seed: 22, voteUpToDate: true, commitCurrentTermOnly });
  const E = (term, key, val) => ({ term, key, val });
  c.loadState({
    now: 0,
    committedRecord: {
      1: { sig: '1|a|a', term: 1, at: 0 },
      2: { sig: '2|b|b', term: 2, at: 0 },
      3: { sig: '3|d|d', term: 3, at: 0 },
    },
    nodes: [
      { id: 'S1', role: 'leader', term: 4, log: [E(1, 'a', 'a'), E(2, 'b', 'b'), E(2, 'c', 'c')], commit: 2, alive: true },
      { id: 'S2', role: 'follower', term: 4, log: [E(1, 'a', 'a'), E(2, 'b', 'b'), E(2, 'c', 'c')], commit: 2, alive: true },
      { id: 'S3', role: 'follower', term: 4, log: [E(1, 'a', 'a'), E(2, 'b', 'b'), E(2, 'c', 'c')], commit: 2, alive: true },
      { id: 'S4', role: 'follower', term: 3, log: [E(1, 'a', 'a'), E(2, 'b', 'b'), E(3, 'd', 'd')], commit: 3, alive: true },
      { id: 'S5', role: 'follower', term: 3, log: [E(1, 'a', 'a'), E(2, 'b', 'b'), E(3, 'd', 'd')], commit: 3, alive: true },
    ],
  });
  c.isolate('S4'); c.isolate('S5');
  settle(c, 400);
  const s1 = c.node('S1');
  return {
    commitIndex: s1.commit,
    violations: c.checkInvariants().map(v => v.rule + '：' + v.detail),
  };
}

function safetyScenarios(t) {
  const on = scenarioA(true);
  t.ok('投票限制开启：缺已提交条目的候选者永远选不上，S3 胜出且无违例',
    on.winner === 'S3' && on.log.includes('3:dd') && on.violations.length === 0, JSON.stringify(on));

  const off = scenarioA(false);
  t.ok('投票限制关闭：候选者带着不完整日志当选，引擎判出领导完整性 + 状态机安全双重违例',
    off.winner !== null && !off.log.includes('3:dd')
      && off.violations.some(v => v.includes('领导完整性'))
      && off.violations.some(v => v.includes('状态机安全')), JSON.stringify(off));

  const bOn = scenarioB(true);
  t.eq('只提交当前 term：旧 term 条目虽已在多数派，commitIndex 也不推进', bOn.commitIndex, 2, JSON.stringify(bOn));
  t.eq('该过程不变量为空', bOn.violations.length, 0);

  const bOff = scenarioB(false);
  t.ok('按计数提交：旧条目被错误提交（commitIndex 推到 3），引擎判出状态机安全违例',
    bOff.commitIndex === 3 && bOff.violations.some(v => v.includes('状态机安全')), JSON.stringify(bOff));
}

export default {
  name: 'Raft 内核 · 选举 / 复制 / 安全规则',
  test(t) {
    t.head('基线：选主与复制');
    baseline(t);
    t.head('选举超时：固定 vs 随机');
    electionTimeout(t);
    t.head('网络分区与愈合');
    partition(t);
    t.head('杀掉 leader');
    killLeader(t);
    t.head('Raft Figure 8 · 安全规则开关对照');
    safetyRules(t);
    t.head('安全规则场景夹具');
    safetyScenarios(t);
  },
};
