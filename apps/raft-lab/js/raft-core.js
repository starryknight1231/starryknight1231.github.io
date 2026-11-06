/* ============ Raft 模拟内核：虚拟时钟 + 事件驱动 ============ */
(function (global) {
  'use strict';

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const DEFAULTS = {
    nodes: 5, seed: 7,
    electionMin: 150, electionMax: 300, fixedElection: 0,
    heartbeat: 50, latency: 20, loss: 0,
    voteUpToDate: true, commitCurrentTermOnly: true
  };

  class Cluster {
    constructor(cfg) {
      this.cfg = Object.assign({}, DEFAULTS, cfg || {});
      this.reset();
    }

    get majority() { return Math.floor(this.cfg.nodes / 2) + 1; }

    reset() {
      const c = this.cfg;
      this.rand = mulberry32(c.seed >>> 0);
      this.now = 0;
      this.seq = 0;
      this.events = [];
      this.trace = [];
      this.committedRecord = {};   // index -> { sig, term, at }
      this.violations = [];
      this.metrics = {
        messages: 0, dropped: 0, elections: 0, leaderChanges: 0,
        commits: 0, rejectedVotes: 0, stepdowns: 0, clientRejected: 0,
        clientOk: 0, truncated: 0
      };
      this.nodes = [];
      for (let i = 0; i < c.nodes; i++) {
        this.nodes.push({
          idx: i, id: 'S' + (i + 1), role: 'follower', term: 0, votedFor: null,
          log: [], commit: 0, applied: 0, sm: {},
          alive: true, zone: 0, token: 0, timeoutAt: 0, votes: [], hbToken: 0
        });
      }
      this.nodes.forEach(n => this.armElection(n));
      return this;
    }

    node(id) { return this.nodes.find(n => n.id === id); }
    leader() { return this.nodes.find(n => n.alive && n.role === 'leader') || null; }
    aliveNodes() { return this.nodes.filter(n => n.alive); }

    /* ---------- 事件队列 ---------- */
    push(t, ev) { ev.t = t; ev.seq = ++this.seq; this.events.push(ev); }

    pop() {
      let bi = 0;
      for (let i = 1; i < this.events.length; i++) {
        const a = this.events[i], b = this.events[bi];
        if (a.t < b.t || (a.t === b.t && a.seq < b.seq)) bi = i;
      }
      return this.events.splice(bi, 1)[0];
    }

    armElection(n) {
      const c = this.cfg;
      const span = c.fixedElection > 0 ? 0 : (c.electionMax - c.electionMin);
      const ms = (c.fixedElection > 0 ? c.fixedElection : c.electionMin) + span * this.rand();
      return this.armElectionIn(n, ms);
    }

    armElectionIn(n, ms) {
      n.token++;
      n.timeoutAt = this.now + ms;
      this.push(n.timeoutAt, { kind: 'timeout', id: n.id, token: n.token });
      return n;
    }

    untilLeader(maxMs) {
      const until = this.now + maxMs;
      let guard = 0;
      while (!this.leader() && this.events.length && guard++ < 200000) {
        if (this.peekTime() > until) break;
        this.tick();
      }
      return this.leader();
    }

    armHeartbeat(n) {
      n.hbToken++;
      this.push(this.now + this.cfg.heartbeat, { kind: 'hb', id: n.id, token: n.hbToken });
    }

    /* ---------- 推进 ---------- */
    tick() {
      if (!this.events.length) return false;
      const ev = this.pop();
      if (ev.t > this.now) this.now = ev.t;
      const n = this.node(ev.id);
      if (!n || !n.alive) return true;
      if (ev.kind === 'timeout') {
        if (ev.token !== n.token || n.role === 'leader') return true;
        this.startElection(n);
      } else if (ev.kind === 'hb') {
        if (ev.token !== n.hbToken || n.role !== 'leader' || !n.alive) return true;
        this.heartbeat(n);
        this.armHeartbeat(n);
      } else if (ev.kind === 'msg') {
        this.onMessage(n, ev.msg);
      }
      this.nodes.forEach(x => this.applyEntries(x));
      return true;
    }

    step(ms) {
      const until = this.now + ms;
      let guard = 0;
      while (this.events.length && guard++ < 20000) {
        const next = this.peekTime();
        if (next > until) { this.now = until; break; }
        this.tick();
      }
      return guard;
    }

    peekTime() {
      let best = Infinity;
      for (const e of this.events) if (e.t < best) best = e.t;
      return best;
    }

    settle(ms, maxEvents) {
      let g = maxEvents || 4000;
      const until = this.now + ms;
      while (this.events.length && g-- > 0 && this.peekTime() <= until) this.tick();
      return this;
    }

    /* ---------- 网络 ---------- */
    canTalk(from, to) {
      if (!to.alive) return false;
      if (from.zone !== to.zone) return false;
      if (this.cfg.loss > 0 && this.rand() < this.cfg.loss) return false;
      return true;
    }

    send(from, toId, msg) {
      msg.from = from.id; msg.term = from.term;
      const to = this.node(toId);
      if (!to || !this.canTalk(from, to)) { this.metrics.dropped++; return false; }
      this.push(this.now + this.cfg.latency, { kind: 'msg', id: toId, msg });
      this.metrics.messages++;
      return true;
    }

    broadcast(from, msgFactory) {
      this.nodes.forEach(to => {
        if (to === from) return;
        this.send(from, to.id, msgFactory());
      });
    }

    setPartition(groups) {
      this.nodes.forEach(n => { n.zone = 0; });
      (groups || []).forEach((g, i) => g.forEach(id => { const n = this.node(id); if (n) n.zone = i + 1; }));
      this.log('网络分区：' + (groups || []).map(g => g.join('+')).join(' | '), 'warn');
      return this;
    }

    isolate(id) { const n = this.node(id); if (n) { n.zone = 90 + n.idx; this.log(n.id + ' 被隔离', 'warn'); } return this; }
    heal() { this.nodes.forEach(n => { n.zone = 0; }); this.log('网络恢复', 'ok'); return this; }
    kill(id) {
      const n = this.node(id); if (!n) return this;
      n.alive = false; n.role = 'follower'; n.token++; n.hbToken++;
      this.events = this.events.filter(e => !(e.kind === 'msg' && e.id === id));
      this.log(n.id + ' 宕机', 'err');
      return this;
    }
    revive(id, wipe) {
      const n = this.node(id); if (!n) return this;
      n.alive = true; n.role = 'follower'; n.votedFor = null; n.votes = [];
      if (wipe) { n.log = []; n.commit = 0; n.applied = 0; n.sm = {}; }
      this.armElection(n);
      this.log(n.id + (wipe ? ' 以空日志重启' : ' 重启'), 'ok');
      return this;
    }

    /* ---------- 日志工具 ---------- */
    lastTerm(n) { return n.log.length ? n.log[n.log.length - 1].term : 0; }
    lastIndex(n) { return n.log.length; }
    logUpToDate(aTerm, aIndex, bTerm, bIndex) {
      return aTerm > bTerm || (aTerm === bTerm && aIndex >= bIndex);
    }

    /* ---------- 选举 ---------- */
    startElection(n) {
      if (n.role === 'leader') return;
      n.role = 'candidate';
      n.term++;
      n.votedFor = n.id;
      n.votes = [n.id];
      this.metrics.elections++;
      this.armElection(n);
      this.log(`${n.id} 发起 term ${n.term} 选举（超时 ${Math.round(n.timeoutAt - this.now)}ms）`, 'dim');
      this.broadcast(n, () => ({
        type: 'rv',
        lastLogTerm: this.lastTerm(n),
        lastLogIndex: this.lastIndex(n),
        candidate: n.id
      }));
    }

    becomeLeader(n) {
      n.role = 'leader';
      n.votes = [];
      this.armHeartbeat(n);
      this.metrics.leaderChanges++;
      this.log(`${n.id} 当选 term ${n.term} 领导者（${n.votes.length ? n.votes.length : 1} 票）`, 'ok');
      // 领导完整性：新领导者必须携带所有已提交条目
      for (const key of Object.keys(this.committedRecord)) {
        const i = Number(key), rec = this.committedRecord[i];
        const e = n.log[i - 1];
        if (!e || e.term + '|' + e.key + '|' + e.val !== rec.sig) {
          this.flag('领导完整性', `term ${n.term} 新领导者 ${n.id} 的日志缺少已提交的 index ${i}（${rec.sig}）`, i);
        }
      }
      this.heartbeat(n);
    }

    heartbeat(n) {
      this.broadcast(n, () => ({
        type: 'ae',
        leaderId: n.id,
        prevLogTerm: n.log.length ? n.log[n.log.length - 1].term : 0,
        prevLogIndex: n.log.length,
        entries: [],
        leaderCommit: n.commit
      }));
    }

    /* ---------- 客户端 ---------- */
    submit(key, val) {
      const l = this.leader();
      if (!l) { this.metrics.clientRejected++; this.log(`客户端请求 set ${key}=${val} 被拒（无主）`, 'err'); return { ok: false, reason: '无主' }; }
      const entry = { term: l.term, key, val };
      l.log.push(entry);
      this.metrics.clientOk++;
      this.log(`${l.id} 追加 index ${l.log.length}（term ${l.term}）set ${key}=${val}`, 'dim');
      this.replicate(l);
      return { ok: true, index: l.log.length, term: l.term, leader: l.id };
    }

    replicate(l) {
      this.broadcast(l, () => {
        const prev = l.log.length > 1 ? l.log[l.log.length - 2] : null;
        return {
          type: 'ae', leaderId: l.id,
          prevLogTerm: prev ? prev.term : 0,
          prevLogIndex: l.log.length - 1,
          entries: [l.log[l.log.length - 1]],
          leaderCommit: l.commit
        };
      });
    }

    /* ---------- 提交与状态机 ---------- */
    tryCommit(l) {
      let advanced = false;
      for (let i = l.commit + 1; i <= l.log.length; i++) {
        const e = l.log[i - 1];
        if (this.cfg.commitCurrentTermOnly && e.term !== l.term) continue;
        let count = 0;
        this.nodes.forEach(n => {
          const x = n.log[i - 1];
          if (x && x.term === e.term && x.key === e.key && x.val === e.val) count++;
        });
        if (count >= this.majority) { l.commit = i; this.metrics.commits++; advanced = true; }
      }
      if (advanced) {
        for (let i = l.commit; i > 0; i--) {
          const e = l.log[i - 1];
          if (!e) break;
          const sig = e.term + '|' + e.key + '|' + e.val;
          const prev = this.committedRecord[i];
          if (!prev) this.committedRecord[i] = { sig, term: e.term, at: this.now };
          else if (prev.sig !== sig) {
            this.flag('状态机安全', `index ${i} 先后提交了不同条目：${prev.sig} 与 ${sig}`, i);
          }
        }
        this.log(`commitIndex 推进到 ${l.commit}（${l.id}）`, 'ok');
      }
      return advanced;
    }

    applyEntries(n) {
      while (n.applied < n.commit && n.log[n.applied]) {
        const e = n.log[n.applied];
        n.sm[e.key] = e.val;
        n.applied++;
      }
    }

    flag(rule, detail, index) {
      const hit = this.violations.find(v => v.rule === rule && v.index === index && v.detail === detail);
      if (hit) return;
      this.violations.push({ rule, detail, index, at: this.now });
      this.log(`安全违规 · ${rule}：${detail}`, 'err');
    }

    checkInvariants() {
      const out = [];
      const byTerm = {};
      this.nodes.forEach(n => { if (n.role === 'leader') (byTerm[n.term] = byTerm[n.term] || []).push(n.id); });
      Object.keys(byTerm).forEach(t => {
        if (byTerm[t].length > 1) out.push({ rule: '选举安全', detail: `term ${t} 同时有 ${byTerm[t].length} 个领导者：${byTerm[t].join(', ')}` });
      });
      const seen = {};
      this.nodes.forEach(n => n.log.forEach((e, i) => {
        const k = (i + 1) + ':' + e.term, sig = e.key + '=' + e.val;
        if (seen[k] && seen[k] !== sig) out.push({ rule: '日志匹配', detail: `index ${i + 1} / term ${e.term} 内容不一致：${seen[k]} vs ${sig}` });
        else seen[k] = sig;
      }));
      const committed = {};
      this.nodes.forEach(n => {
        for (let i = 1; i <= n.commit; i++) {
          const e = n.log[i - 1]; if (!e) continue;
          const sig = e.term + '|' + e.key + '|' + e.val;
          (committed[i] = committed[i] || new Set()).add(sig);
        }
      });
      Object.keys(committed).forEach(i => {
        if (committed[i].size > 1) out.push({ rule: '状态机安全', detail: `index ${i} 在不同节点上提交了不同条目`, fatal: true });
      });
      return out.concat(this.violations.filter(v => v.rule !== '状态机安全'));
    }

    /* ---------- 消息处理 ---------- */
    onMessage(n, m) {
      if (m.type === 'rv') return this.onRequestVote(n, m);
      if (m.type === 'rvr') return this.onVoteResponse(n, m);
      if (m.type === 'ae') return this.onAppend(n, m);
      if (m.type === 'aer') return this.onAppendResponse(n, m);
    }

    bumpTerm(n, term) {
      if (term <= n.term) return false;
      n.term = term;
      n.votedFor = null;
      if (n.role === 'leader') {
        n.role = 'follower'; n.hbToken++;
        this.metrics.stepdowns++;
        this.log(`${n.id} 发现更高 term ${term}，主动下台`, 'warn');
      }
      if (n.role === 'candidate') n.votes = [];
      return true;
    }

    onRequestVote(n, m) {
      this.bumpTerm(n, m.term);
      let grant = false, why = '';
      if (m.term < n.term) why = 'term 过旧';
      else if (n.votedFor && n.votedFor !== m.candidate) why = `本 term 已投票给 ${n.votedFor}`;
      else if (this.cfg.voteUpToDate && !this.logUpToDate(m.lastLogTerm, m.lastLogIndex, this.lastTerm(n), this.lastIndex(n))) {
        why = `候选者日志不领先（${m.lastLogTerm}/${m.lastLogIndex} vs ${this.lastTerm(n)}/${this.lastIndex(n)}）`;
      } else grant = true;
      if (!grant) {
        this.metrics.rejectedVotes++;
        this.log(`${n.id} 拒绝投票给 ${m.candidate}：${why}`, 'err');
      } else {
        n.votedFor = m.candidate;
        this.armElection(n);
        this.log(`${n.id} 投票给 ${m.candidate}（term ${m.term}）`, 'ok');
      }
      this.send(n, m.candidate, { type: 'rvr', voteGranted: grant, candidate: m.candidate });
    }

    onVoteResponse(n, m) {
      if (n.role !== 'candidate' || m.term !== n.term) return;
      if (!m.voteGranted) return;
      if (!n.votes.includes(m.from)) n.votes.push(m.from);
      if (n.votes.length >= this.majority) this.becomeLeader(n);
      else this.log(`${n.id} 已获 ${n.votes.length}/${this.majority} 票`, 'dim');
    }

    onAppend(n, m) {
      if (m.term < n.term) {
        this.send(n, m.from, { type: 'aer', success: false, matchIndex: 0, leaderId: m.leaderId });
        return;
      }
      this.bumpTerm(n, m.term);
      let ok = false, matchIndex = 0;
      const prevEntry = m.prevLogIndex > 0 ? n.log[m.prevLogIndex - 1] : null;
      if (m.prevLogIndex > 0 && (!prevEntry || prevEntry.term !== m.prevLogTerm)) {
        this.log(`${n.id} 拒绝 ${m.leaderId} 的追加：index ${m.prevLogIndex} 与 term 不匹配`, 'err');
      } else {
        n.role = 'follower';
        this.armElection(n);
        // 冲突截断
        for (let i = m.prevLogIndex; i < n.log.length; i++) {
          const inc = m.entries[i - m.prevLogIndex];
          if (!inc || inc.term !== n.log[i].term) {
            const removed = n.log.length - i;
            n.log.length = i;
            this.metrics.truncated += removed;
            this.log(`${n.id} 截断 ${removed} 条与 ${m.leaderId} 冲突的条目（从 index ${i + 1} 起）`, 'warn');
            break;
          }
        }
        m.entries.forEach((e, k) => {
          const at = m.prevLogIndex + k;
          if (!n.log[at]) n.log[at] = { term: e.term, key: e.key, val: e.val };
        });
        if (m.leaderCommit > n.commit) n.commit = Math.min(m.leaderCommit, n.log.length);
        ok = true; matchIndex = n.log.length;
      }
      this.send(n, m.from, { type: 'aer', success: ok, matchIndex, leaderId: m.leaderId });
    }

    onAppendResponse(n, m) {
      if (n.role !== 'leader') return;
      if (m.term > n.term) { this.bumpTerm(n, m.term); return; }
      if (m.term < n.term) return;
      if (m.success) {
        if (this.tryCommit(n)) this.heartbeat(n);
      } else {
        this.log(`${n.id} 收到 ${m.from} 的拒绝，回退 nextIndex 重发`, 'dim');
        this.replicateAllTo(n, m.from);
      }
    }

    replicateAllTo(l, targetId) {
      const to = this.node(targetId);
      if (!to) return;
      let p = 0;
      while (p < l.log.length && to.log[p] && to.log[p].term === l.log[p].term) p++;
      const prev = p > 0 ? l.log[p - 1] : null;
      this.send(l, targetId, {
        type: 'ae', leaderId: l.id,
        prevLogTerm: prev ? prev.term : 0,
        prevLogIndex: p,
        entries: l.log.slice(p),
        leaderCommit: l.commit
      });
    }

    /* ---------- 记录与视图 ---------- */
    log(text, cls) {
      this.trace.push({ t: Math.round(this.now), text, cls: cls || '' });
      if (this.trace.length > 240) this.trace.shift();
    }

    flights() {
      return this.events.filter(e => e.kind === 'msg').map(e => ({
        from: e.msg.from, to: e.id, type: e.msg.type, at: e.t
      }));
    }

    snapshot() {
      return {
        now: this.now,
        committedRecord: Object.assign({}, this.committedRecord),
        nodes: this.nodes.map(n => ({
          id: n.id, role: n.role, term: n.term, votedFor: n.votedFor,
          log: n.log.map(e => Object.assign({}, e)), commit: n.commit,
          alive: n.alive, zone: n.zone
        }))
      };
    }

    loadState(state) {
      this.events = [];
      this.now = state.now || 0;
      this.violations = [];
      this.committedRecord = Object.assign({}, state.committedRecord || {});
      state.nodes.forEach((s, i) => {
        const n = this.nodes[i];
        n.role = s.role; n.term = s.term; n.votedFor = s.votedFor;
        n.log = (s.log || []).map(e => Object.assign({}, e));
        n.commit = s.commit || 0; n.applied = 0; n.sm = {};
        n.alive = s.alive !== false; n.zone = s.zone || 0;
        n.votes = [];
      });
      this.nodes.forEach(n => {
        if (!n.alive) return;
        if (n.role === 'leader') this.armHeartbeat(n); else this.armElection(n);
      });
      this.nodes.forEach(n => this.applyEntries(n));
      return this;
    }

    stats() {
      const l = this.leader();
      return {
        leader: l ? l.id : '—',
        term: Math.max.apply(null, this.nodes.map(n => n.term).concat([0])),
        commit: l ? l.commit : 0,
        entries: l ? l.log.length : Math.max.apply(null, this.nodes.map(n => n.log.length)),
        alive: this.aliveNodes().length
      };
    }
  }

  global.RaftCluster = Cluster;
  global.RaftUtil = { mulberry32 };
})(typeof window !== 'undefined' ? window : globalThis);
