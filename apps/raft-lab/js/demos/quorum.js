/* ============ 演示四：法定人数与可用性 ============ */
(function () {
  'use strict';

  registerDemo({
    id: 'quorum', cat: '共识协议', name: '法定人数与可用性',
    desc: 'N 台机器到底要几台同意，分区时哪一侧还能写',
    keywords: 'raft quorum majority availability partition read write quorum 法定人数',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="7" cy="7" r="2.6"/><circle cx="17" cy="7" r="2.6"/><circle cx="7" cy="17" r="2.6"/><circle cx="17" cy="17" r="2.6"/><path d="M9.6 7h4.8M7 9.6v4.8M17 9.6v4.8M9.6 17h4.8"/></svg>',
    render(body) {
      const state = {
        n: 5, alive: 5, split: 'none',
        cluster: null, focus: null,
        rwN: 5, rwW: 3, rwR: 3
      };

      body.innerHTML = `
        <div class="info-note"><b>多数派不是「超过一半的机器」，而是「任何两个多数派必然相交」。</b>
        这个相交性质同时解释了 Raft 为什么能挡住脑裂，以及它为什么在分区时宁可不可用。</div>

        <div class="card">
          <div class="card-title">拓扑</div>
          <div class="row cfg-row">
            <div>
              <label class="fld">集群规模 N</label>
              <div class="seg" id="q-n">
                <button data-v="1">1</button><button data-v="3">3</button><button data-v="5" class="on">5</button><button data-v="7">7</button>
              </div>
            </div>
            <div>
              <label class="fld">存活节点 <b id="q-alive-v">5</b> 台</label>
              <input type="range" id="q-alive" min="0" max="7" value="5">
            </div>
            <div>
              <label class="fld">网络分区</label>
              <div class="seg" id="q-split">
                <button data-v="none" class="on">不分区</button><button data-v="half">对半</button><button data-v="third">三组</button>
              </div>
            </div>
          </div>
          <div class="btn-row">
            <button class="btn primary" id="q-run">按此配置实跑</button>
            <button class="btn sm" id="q-write">客户端写一条</button>
            <button class="btn sm" id="q-heal">恢复网络</button>
          </div>
        </div>

        <div class="card">
          <div class="card-title">算出来的结论</div>
          <div id="q-calc"></div>
          <div class="hint">「能否选主 / 能否提交」不是查表，是把这条拓扑交给模型跑 3000ms 之后的实际结果。</div>
        </div>

        <div class="card">
          <div class="card-title">集群</div>
          <div class="stage" id="q-stage"></div>
        </div>

        <div class="card">
          <div class="card-title">分区明细</div>
          <div id="q-groups"></div>
        </div>

        <div class="card">
          <div class="card-title">对照：读写法定人数（R + W &gt; N）</div>
          <div class="row cfg-row">
            <div><label class="fld">副本数 N</label><input type="range" id="q-rwn" min="1" max="9" value="5"></div>
            <div><label class="fld">写成功份数 W</label><input type="range" id="q-rww" min="1" max="9" value="3"></div>
            <div><label class="fld">读确认份数 R</label><input type="range" id="q-rwr" min="1" max="9" value="3"></div>
          </div>
          <div id="q-rw"></div>
        </div>

        <div class="card">
          <div class="card-title">面试要点</div>
          <pre class="out" style="white-space:pre-wrap">为什么总是奇数台：3 台和 4 台的多数派都是 2，容忍故障却都是 1 台，多出来的那台只增加通信开销。
N=5 时任意两个多数派必有公共节点，这个节点不会同时承认两条不同的已提交记录——脑裂被数学挡住，不需要外部仲裁。
分区时少数派一侧选不出主、提交不了写，表现为不可用；这是 CP 的取舍。要在那一侧继续写，只能放宽成「本地多数派」，代价是愈合后要冲突解决。
读写多数派 R+W&gt;N 保证读到最新写，但它不解决并发写的先后；Raft 用单一领导者把写串行化，代价是没有领导者的时候完全不能写。</pre>
        </div>`;

      const calcEl = body.querySelector('#q-calc');
      const stage = body.querySelector('#q-stage');
      const groupsEl = body.querySelector('#q-groups');
      const rwEl = body.querySelector('#q-rw');

      function groups() {
        const ids = [];
        for (let i = 0; i < state.n; i++) ids.push('S' + (i + 1));
        if (state.split === 'none') return [ids];
        if (state.split === 'half') {
          const h = Math.round(ids.length / 2);
          return [ids.slice(0, h), ids.slice(h)];
        }
        const a = Math.ceil(ids.length / 3), b = Math.ceil((ids.length * 2) / 3);
        return [ids.slice(0, a), ids.slice(a, b), ids.slice(b)];
      }

      function build() {
        const c = new RaftCluster({ nodes: state.n, seed: 31, heartbeat: 50, latency: 20 });
        const aliveIds = [];
        for (let i = 0; i < state.alive; i++) aliveIds.push('S' + (i + 1));
        c.nodes.filter(n => !aliveIds.includes(n.id)).forEach(n => c.kill(n.id));
        const gs = groups();
        if (gs.length > 1) c.setPartition(gs.map(g => g.filter(id => aliveIds.includes(id))));
        c.settle(3000, 300000);
        state.cluster = c;
        state.aliveIds = aliveIds;
        probe();
      }

      /* 真写一条命令，看 commit 是否推进——结论来自模型，不是查表 */
      function probe() {
        const c = state.cluster;
        const l = c.leader();
        const before = l ? l.commit : -1;
        const r = c.submit('probe', '1');
        c.settle(1500, 300000);
        const l2 = c.leader();
        state.probe = {
          accepted: r.ok,
          before,
          after: l2 ? l2.commit : -1,
          canCommit: !!l2 && l2.commit > before
        };
        redraw();
      }

      function redraw() {
        const c = state.cluster;
        const majority = Math.floor(state.n / 2) + 1;
        const f = Math.floor((state.n - 1) / 2);
        const l = c.leader();
        const p = state.probe;

        stage.innerHTML = RaftView.clusterSvg(c, { focus: state.focus });
        calcEl.innerHTML = `<div class="stat-grid">
          <div class="stat c-accent"><b>${majority}</b><span>多数派（⌊N/2⌋+1）</span></div>
          <div class="stat"><b>${f}</b><span>可容忍故障台数</span></div>
          <div class="stat"><b>${state.alive}</b><span>当前存活</span></div>
          <div class="stat ${l ? 'c-teal' : 'c-red'}"><b>${l ? l.id : '无'}</b><span>实跑选出的领导者</span></div>
          <div class="stat ${p ? (p.canCommit ? 'c-teal' : 'c-red') : ''}"><b>${p ? (p.canCommit ? '能提交' : '不能提交') : '未测试'}</b><span>写一条命令的结果</span></div>
          <div class="stat"><b>${p ? (p.accepted ? '已接受' : '被拒绝') : '—'}</b><span>请求是否到达领导者</span></div>
        </div>`;

        const gs = groups();
        groupsEl.innerHTML = '<table class="tb"><thead><tr><th>分区</th><th>成员</th><th>存活</th><th>是否 ≥ 多数派</th><th>实跑结果</th></tr></thead><tbody>' +
          gs.map((g, i) => {
            const aliveIn = g.filter(id => (state.aliveIds || []).includes(id));
            const hasLeader = c.nodes.some(n => g.includes(n.id) && n.role === 'leader' && n.alive);
            const leader = c.nodes.find(n => g.includes(n.id) && n.role === 'leader' && n.alive);
            return `<tr><td>${String.fromCharCode(65 + i)}</td>
              <td><code class="inline">${g.join(' ') || '—'}</code></td>
              <td>${aliveIn.length} / ${g.length}</td>
              <td>${aliveIn.length >= majority ? '<span class="badge b-green">是</span>' : '<span class="badge b-red">否</span>'}</td>
              <td>${hasLeader ? `领导者 ${leader.id}，commit ${leader.commit}` : '选不出主'}</td></tr>`;
          }).join('') + '</tbody></table>';

        renderRw();
      }

      function renderRw() {
        const N = state.rwN, W = state.rwW, R = state.rwR;
        const overlap = W + R > N;
        const liveOk = N - Math.floor((N - 1) / 2);
        rwEl.innerHTML = `<div class="stat-grid">
          <div class="stat"><b>${W}+${R}</b><span>W + R</span></div>
          <div class="stat"><b>${N}</b><span>N</span></div>
          <div class="stat ${overlap ? 'c-teal' : 'c-red'}"><b>${overlap ? '必然相交' : '可能不相交'}</b><span>读写集合</span></div>
          <div class="stat ${overlap ? 'c-teal' : 'c-red'}"><b>${overlap ? '读到最新写' : '可能读到旧值'}</b><span>结论</span></div>
          <div class="stat"><b>${N - W + 1}</b><span>最多容忍宕机后仍可写</span></div>
          <div class="stat"><b>${N - R + 1}</b><span>最多容忍宕机后仍可读</span></div>
        </div>
        <div class="hint">${overlap
          ? `写 ${W} 份、读 ${R} 份时，任意读集合与任意写集合至少共享 1 个副本，因此读到的版本里一定包含最新已确认的写（还要用时间戳挑最新的那个）。`
          : `W + R ≤ N 时存在互不相交的读写集合，读可能完全绕开已确认的写，返回旧值。`}</div>`;
      }

      function clampAlive() {
        const slider = body.querySelector('#q-alive');
        slider.max = state.n;
        if (state.alive > state.n) state.alive = state.n;
        slider.value = state.alive;
        body.querySelector('#q-alive-v').textContent = state.alive;
      }

      body.querySelector('#q-n').addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        body.querySelector('#q-n').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
        state.n = Number(b.dataset.v); clampAlive(); build();
      });
      body.querySelector('#q-alive').addEventListener('input', e => {
        state.alive = Number(e.target.value);
        body.querySelector('#q-alive-v').textContent = state.alive;
      });
      body.querySelector('#q-alive').addEventListener('change', e => {
        state.alive = Number(e.target.value);
        body.querySelector('#q-alive-v').textContent = state.alive;
        build();
      });
      body.querySelector('#q-split').addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        body.querySelector('#q-split').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
        state.split = b.dataset.v; build();
      });
      body.querySelector('#q-run').addEventListener('click', build);
      body.querySelector('#q-write').addEventListener('click', () => { probe(); });
      body.querySelector('#q-heal').addEventListener('click', () => { state.cluster.heal(); state.cluster.settle(2500, 300000); redraw(); });
      body.querySelector('#q-rwn').addEventListener('input', e => { state.rwN = Number(e.target.value); renderRw(); });
      body.querySelector('#q-rww').addEventListener('input', e => { state.rwW = Number(e.target.value); renderRw(); });
      body.querySelector('#q-rwr').addEventListener('input', e => { state.rwR = Number(e.target.value); renderRw(); });

      clampAlive();
      build();
    }
  });
})();
