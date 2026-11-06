/* ============ 演示三：安全规则（投票限制 / 提交规则） ============ */
(function () {
  'use strict';

  const E = (t, k, v) => ({ term: t, key: k, val: v });
  const fmtLog = n => n.log.map(e => `${e.term}:${e.key}${e.val}`).join(' ') || '∅';

  const SCENARIOS = {
    vote: {
      name: '场景 A · 缺少已提交条目的候选者',
      brief: 'index 3 上的 (3,d) 已被多数派提交。S1 的 index 3 还是更旧的 (2,c)，它能不能被选成领导者？',
      phases: ['搭建初始日志', '切断 S4 / S5（只剩 S1 S2 S3 可通信）', '让 S1 发起选举', '让 S3 发起选举', '新领导者提交一条命令']
    },
    commit: {
      name: '场景 B · 旧 term 条目已在多数派上',
      brief: 'S1 是 term 4 的领导者，它 index 3 上的 (2,c) 来自 term 2，此刻已经在 S1/S2/S3 上一致存在（多数派），而 S4/S5 在另一侧收不到心跳。要不要现在提交？',
      phases: ['搭建初始日志，并把 S4 / S5 分到另一侧', '领导者发一轮心跳与确认（看 commitIndex 是否推进）', '追加一条当前 term 的命令并提交', '恢复网络，看 S4 / S5 如何被补齐']
    }
  };

  registerDemo({
    id: 'safety', cat: '共识协议', name: '安全规则',
    desc: '关掉投票限制或提交规则，看已提交的数据怎么被覆盖掉',
    keywords: 'raft safety election restriction commit rule state machine safety 安全性',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3l7 3v6c0 4.2-2.9 7.4-7 9-4.1-1.6-7-4.8-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
    render(body) {
      const state = {
        key: 'vote',
        rules: { voteUpToDate: true, commitCurrentTermOnly: true },
        cluster: null, phase: 0, focus: null
      };

      body.innerHTML = `
        <div class="info-note"><b>Raft 的两条安全规则，这里都可以关掉。</b>它们不是形式主义的约束：
        关掉之后集群照常选主、照常提交，只是已经提交的数据会在某个时刻被覆盖。违规由模型的不变量检查当场报出来。</div>

        <div class="card">
          <div class="card-title">安全规则</div>
          <div class="rule-toggle">
            <label class="rt"><input type="checkbox" id="sf-vote" checked>
              <span><b>投票限制</b><i>候选者的日志必须不落后于自己（比较 lastLogTerm / lastLogIndex）才投给它</i></span></label>
            <label class="rt"><input type="checkbox" id="sf-commit" checked>
              <span><b>只直接提交当前 term</b><i>领导者只按多数派计数提交自己的 term 的条目，旧 term 条目靠提交新条目间接提交</i></span></label>
          </div>
        </div>

        <div class="card">
          <div class="card-title">场景</div>
          <div class="seg" id="sf-scenario">
            <button data-k="vote" class="on">场景 A · 投票限制</button>
            <button data-k="commit">场景 B · 提交规则</button>
          </div>
          <p class="sc-brief" id="sf-brief"></p>
          <div class="phase-row" id="sf-phases"></div>
          <div class="btn-row">
            <button class="btn primary" id="sf-next">下一阶段</button>
            <button class="btn" id="sf-rerun">按当前规则重跑</button>
            <button class="btn" id="sf-advance">推进 1500ms</button>
          </div>
        </div>

        <div class="card">
          <div class="card-title">结果判定</div>
          <div id="sf-verdict"></div>
        </div>

        <div class="card">
          <div class="card-title">集群</div>
          <div class="stage" id="sf-stage"></div>
        </div>

        <div class="card">
          <div class="card-title">各节点日志</div>
          <div id="sf-grid"></div>
        </div>

        <div class="card"><div class="card-title">安全不变量</div><div id="sf-inv"></div></div>
        <div class="card"><div class="card-title">事件流</div><div id="sf-trace"></div></div>

        <div class="card">
          <div class="card-title">面试要点</div>
          <pre class="out" style="white-space:pre-wrap">投票限制保证「新领导者一定带着所有已提交条目」：已提交意味着多数派持有，任何多数派与之相交，相交的那个节点不会把票投给日志落后的候选者。
但仅有它还不够——领导者不能只按多数派计数就提交旧 term 的条目。因为「多数派上有一致条目」这件事，可能在另一个互不可达的分区里对应着不同的内容。
所以提交规则要求：只有当前 term 的条目能直接提交，旧 term 条目必须等一条当前 term 的条目被提交时顺带提交；而要让当前 term 的条目落到多数派，就必须先说服持有已提交条目的那些节点，日志匹配会强制领导者接受它们的内容。
工程上的意义：客户端拿到「已提交」回执后，这条数据就不会再被推翻——共识算法给的不是「大概率不丢」，而是不变量级别的下限。</pre>
        </div>`;

      const stage = body.querySelector('#sf-stage');
      const grid = body.querySelector('#sf-grid');
      const invEl = body.querySelector('#sf-inv');
      const traceEl = body.querySelector('#sf-trace');
      const verdict = body.querySelector('#sf-verdict');
      const phasesEl = body.querySelector('#sf-phases');
      const briefEl = body.querySelector('#sf-brief');

      function nodesA() {
        return [
          { id: 'S1', role: 'follower', term: 2, log: [E(1, 'a', 'a'), E(2, 'b', 'b'), E(2, 'c', 'c')], commit: 2, alive: true },
          { id: 'S2', role: 'follower', term: 2, log: [E(1, 'a', 'a'), E(2, 'b', 'b')], commit: 2, alive: true },
          { id: 'S3', role: 'follower', term: 3, log: [E(1, 'a', 'a'), E(2, 'b', 'b'), E(3, 'd', 'd')], commit: 3, alive: true },
          { id: 'S4', role: 'follower', term: 3, log: [E(1, 'a', 'a'), E(2, 'b', 'b'), E(3, 'd', 'd')], commit: 3, alive: true },
          { id: 'S5', role: 'follower', term: 3, log: [E(1, 'a', 'a'), E(2, 'b', 'b'), E(3, 'd', 'd')], commit: 3, alive: true }
        ];
      }
      function nodesB() {
        return [
          { id: 'S1', role: 'leader', term: 4, log: [E(1, 'a', 'a'), E(2, 'b', 'b'), E(2, 'c', 'c')], commit: 2, alive: true },
          { id: 'S2', role: 'follower', term: 4, log: [E(1, 'a', 'a'), E(2, 'b', 'b'), E(2, 'c', 'c')], commit: 2, alive: true },
          { id: 'S3', role: 'follower', term: 4, log: [E(1, 'a', 'a'), E(2, 'b', 'b'), E(2, 'c', 'c')], commit: 2, alive: true },
          { id: 'S4', role: 'follower', term: 2, log: [E(1, 'a', 'a'), E(2, 'b', 'b')], commit: 2, alive: true },
          { id: 'S5', role: 'follower', term: 2, log: [E(1, 'a', 'a'), E(2, 'b', 'b')], commit: 2, alive: true }
        ];
      }
      function recordA() {
        return {
          1: { sig: '1|a|a', term: 1, at: 0 },
          2: { sig: '2|b|b', term: 2, at: 0 },
          3: { sig: '3|d|d', term: 3, at: 0 }
        };
      }
      function recordB() {
        return {
          1: { sig: '1|a|a', term: 1, at: 0 },
          2: { sig: '2|b|b', term: 2, at: 0 }
        };
      }

      function newCluster() {
        return new RaftCluster({
          nodes: 5, seed: 21, heartbeat: 50, latency: 20,
          voteUpToDate: state.rules.voteUpToDate,
          commitCurrentTermOnly: state.rules.commitCurrentTermOnly
        });
      }

      function redraw() {
        const c = state.cluster;
        stage.innerHTML = RaftView.clusterSvg(c, { focus: state.focus });
        grid.innerHTML = RaftView.logGrid(c, { rows: 5 });
        invEl.innerHTML = RaftView.invariantPanel(c);
        traceEl.innerHTML = RaftView.traceList(c, 18);
        verdict.innerHTML = verdictHtml();
        phasesEl.innerHTML = SCENARIOS[state.key].phases.map((p, i) => `
          <div class="step-row ${i <= state.phase ? 'on' : ''}">
            <span class="step-dot ${i === state.phase ? 'on' : ''}">${i + 1}</span>
            <span>${RL.esc(p)}</span>
          </div>`).join('');
      }

      function verdictHtml() {
        const c = state.cluster;
        const l = c.leader();
        const viol = c.checkInvariants();
        const committed3 = () => {
          const sigs = new Set();
          c.nodes.forEach(n => {
            const e = n.log[2];
            if (e && n.commit >= 3) sigs.add(`${e.term}:${e.key}${e.val}`);
          });
          return sigs.size ? [...sigs].join(' 与 ') + (sigs.size > 1 ? '（冲突）' : '（唯一）') : '尚未提交';
        };
        const rows = state.key === 'vote'
          ? [
              ['当前领导者', l ? `${l.id}（term ${l.term}）` : '无'],
              ['领导者日志', l ? fmtLog(l) : '—'],
              ['S3 的 index 3', (c.node('S3').log[2] || {}).term === 3 ? '3:d（已提交的那条）' : '2:c（旧领导者那条）'],
              ['commitIndex', l ? l.commit : Math.max.apply(null, c.nodes.map(n => n.commit))],
              ['各节点已提交的 index 3', committed3()]
            ]
          : [
              ['当前领导者', l ? `${l.id}（term ${l.term}）` : '无'],
              ['领导者 commitIndex', l ? l.commit : '—'],
              ['index 3（旧的 term 2 条目）', c.node('S1').commit >= 3 ? '已提交' : '尚未提交'],
              ['S4 的日志', fmtLog(c.node('S4'))],
              ['S4 的 commitIndex', c.node('S4').commit]
            ];
        rows.push(['投票限制', state.rules.voteUpToDate ? '开' : '关']);
        rows.push(['提交规则', state.rules.commitCurrentTermOnly ? '只直接提交当前 term' : '按多数派计数直接提交']);
        rows.push(['安全违规', viol.length ? viol.length + ' 条' : '无']);
        const table = '<table class="tb"><tbody>' + rows.map(r =>
          `<tr><td style="width:170px;color:var(--muted)">${r[0]}</td><td><b>${RL.esc(String(r[1]))}</b></td></tr>`).join('') + '</tbody></table>';
        const note = viol.length
          ? `<div class="warn-note">已提交的数据被推翻了：${RL.esc(viol.map(v => v.rule + ' — ' + v.detail).join('；'))}</div>`
          : `<div class="hint">${state.key === 'vote'
              ? '所有不变量成立。把「投票限制」关掉再重跑，看同一个候选者能否当选。'
              : '没有违规——这里比的是提交时机：多数派上已经一致的旧条目，要不要现在就承诺它。'}</div>`;
        return table + note;
      }

      /* ---------- 场景脚本 ---------- */
      function setupVote() {
        const c = newCluster();
        c.loadState({ now: 0, committedRecord: recordA(), nodes: nodesA() });
        state.cluster = c; state.phase = 0;
        c.log('初始：index 3 的 (3,d) 已在 S3/S4/S5 提交；S1 的 index 3 还是更旧的 (2,c)', 'dim');
        redraw();
      }
      function stepVote(p) {
        const c = state.cluster;
        if (p === 1) {
          c.kill('S4'); c.kill('S5');
          c.setPartition([['S1', 'S2', 'S3']]);
        } else if (p === 2) {
          const s1 = c.node('S1');
          c.nodes.forEach(n => { if (n.alive && n !== s1) c.armElectionIn(n, 9000); });
          c.armElectionIn(s1, 10);
          c.step(140);            // 一轮拉票：RV 发出、RVR 回来
          c.armElectionIn(s1, 9000); // 冻结，把结论留到判定
          c.step(160);
        } else if (p === 3) {
          const s3 = c.node('S3');
          if (!c.leader() && s3.alive) {
            c.nodes.forEach(n => { if (n.alive && n !== s3) c.armElectionIn(n, 9000); });
            c.armElectionIn(s3, 10);
            c.untilLeader(1200);
            c.step(200);
          } else {
            c.step(200);
          }
        } else if (p === 4) {
          c.submit('e', 'e');
          c.settle(1200, 200000);
        }
        redraw();
      }

      function setupCommit() {
        const c = newCluster();
        c.loadState({ now: 0, committedRecord: recordB(), nodes: nodesB() });
        c.isolate('S4'); c.isolate('S5');
        state.cluster = c; state.phase = 0;
        c.log('初始：(2,c) 已在 S1/S2/S3 上一致（多数派）但未提交；S4/S5 收不到心跳', 'dim');
        redraw();
      }
      function stepCommit(p) {
        const c = state.cluster;
        if (p === 1) {
          c.step(400);
          c.log(`心跳一轮后领导者 commitIndex = ${c.node('S1').commit}`, 'dim');
        } else if (p === 2) {
          c.submit('e', 'e');
          c.step(500);
        } else if (p === 3) {
          c.heal();
          c.settle(1500, 200000);
        }
        redraw();
      }

      function setup() {
        if (state.key === 'vote') setupVote(); else setupCommit();
      }
      function advance() {
        const total = SCENARIOS[state.key].phases.length;
        if (state.phase >= total - 1) return RL.toast('已经是最后一个阶段，点「重跑」再来一次');
        state.phase++;
        if (state.key === 'vote') stepVote(state.phase); else stepCommit(state.phase);
      }

      body.querySelector('#sf-vote').addEventListener('change', e => {
        state.rules.voteUpToDate = e.target.checked; setup();
      });
      body.querySelector('#sf-commit').addEventListener('change', e => {
        state.rules.commitCurrentTermOnly = e.target.checked; setup();
      });
      body.querySelector('#sf-scenario').addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        body.querySelector('#sf-scenario').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
        state.key = b.dataset.k;
        briefEl.textContent = SCENARIOS[state.key].brief;
        setup();
      });
      body.querySelector('#sf-next').addEventListener('click', advance);
      body.querySelector('#sf-rerun').addEventListener('click', setup);
      body.querySelector('#sf-advance').addEventListener('click', () => { state.cluster.settle(1500, 200000); redraw(); });

      briefEl.textContent = SCENARIOS.vote.brief;
      setup();
    }
  });
})();
