/* ============ 演示二：日志复制与提交 ============ */
(function () {
  'use strict';

  registerDemo({
    id: 'replication', cat: '共识协议', name: '日志复制与提交',
    desc: '客户端命令如何变成已提交，分区里的写为什么提交不了',
    keywords: 'raft log replication commit index majority partition 提交 未提交',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/></svg>',
    render(body) {
      const state = {
        cfg: { nodes: 5, seed: 12, fixedElection: 0, electionMin: 150, electionMax: 300, heartbeat: 50, latency: 20 },
        cluster: null, focus: null, run: null, auto: false, counter: 1
      };

      body.innerHTML = `
        <div class="info-note"><b>提交的下限是多数派。</b>领导者把条目追加到本地日志只是第一步；
        只有当某个 index 在多数派上一致出现，commitIndex 才允许推进，节点才会把它交给状态机执行。</div>

        <div class="card">
          <div class="card-title">控制</div>
          <div class="sim-bar">
            <button class="btn primary" id="rp-play">播放</button>
            <button class="btn" id="rp-step100">推进 100ms</button>
            <div class="seg" id="rp-speed">
              <button data-v="0.5">0.5×</button><button data-v="1" class="on">1×</button><button data-v="2">2×</button>
            </div>
            <button class="btn" id="rp-reset">重置</button>
            <span class="sim-sep"></span>
            <label class="chk"><input type="checkbox" id="rp-auto">自动压命令（每 400ms 一条）</label>
          </div>
          <div class="row">
            <div>
              <label class="fld">命令 key</label>
              <input type="text" id="rp-key" value="x">
            </div>
            <div>
              <label class="fld">命令 value</label>
              <input type="text" id="rp-val" value="1">
            </div>
            <div class="fix"><button class="btn teal" id="rp-send">客户端提交</button></div>
          </div>
          <div class="btn-row">
            <button class="btn sm" id="rp-kill">选中节点宕机</button>
            <button class="btn sm" id="rp-revive">选中节点重启</button>
            <button class="btn sm" id="rp-iso-lead">把领导者分到少数派</button>
            <button class="btn sm" id="rp-heal">恢复全部网络</button>
          </div>
        </div>

        <div class="card">
          <div class="card-title">集群<span class="card-hint" id="rp-focus-hint">点击节点可选中</span></div>
          <div class="stage" id="rp-stage"></div>
        </div>

        <div class="card">
          <div class="card-title">各节点日志<span class="card-hint">深色=已提交，浅色=已复制未提交</span></div>
          <div id="rp-grid"></div>
          <div class="legend" id="rp-legend"></div>
        </div>

        <div class="card"><div class="card-title">指标</div><div id="rp-stats"></div></div>
        <div class="card">
          <div class="card-title">状态机（只执行已提交条目）</div>
          <div id="rp-sm"></div>
        </div>
        <div class="card"><div class="card-title">事件流</div><div id="rp-trace"></div></div>

        <div class="card">
          <div class="card-title">面试要点</div>
          <pre class="out" style="white-space:pre-wrap">「已复制」和「已提交」是两件事：复制到多数派才叫提交，复制到一个节点随时可能被新领导者截断。
把领导者分到少数派后，它仍然能接受客户端写、仍然在发心跳，但 commitIndex 一动不动——这就是分区期间 Raft 表现为不可用的原因，也是它不违反一致性的原因。
领导者崩溃前已复制但未提交的条目，新领导者既可能把它补齐再提交，也可能直接截断掉；客户端只应在收到「已提交」回执后再认为写成功。
日志匹配性质让增量复制只需要传 prevLogTerm / prevLogIndex 两个数字做校验，不必整份对比。</pre>
        </div>`;

      const stage = body.querySelector('#rp-stage');
      const grid = body.querySelector('#rp-grid');
      const statsEl = body.querySelector('#rp-stats');
      const traceEl = body.querySelector('#rp-trace');
      const smEl = body.querySelector('#rp-sm');
      const legend = body.querySelector('#rp-legend');

      function redraw() {
        const c = state.cluster;
        stage.innerHTML = RaftView.clusterSvg(c, { focus: state.focus });
        stage.querySelectorAll('.node').forEach(g => {
          g.addEventListener('click', () => {
            state.focus = g.dataset.id;
            body.querySelector('#rp-focus-hint').textContent = '已选中 ' + g.dataset.id;
            redraw();
          });
        });
        grid.innerHTML = RaftView.logGrid(c, { rows: Math.max(3, c.nodes.reduce((m, n) => Math.max(m, n.log.length), 0)) });
        const terms = {};
        c.nodes.forEach(n => n.log.forEach(e => { terms[e.term] = true; }));
        legend.innerHTML = Object.keys(terms).map(t =>
          `<span><i style="background:var(--h-${RaftView.hue(t)})"></i>term ${t}</span>`).join('');
        statsEl.innerHTML = RaftView.statsRow(c);
        traceEl.innerHTML = RaftView.traceList(c, 14);
        smEl.innerHTML = '<div class="sm-row">' + c.nodes.map(n => {
          const keys = Object.keys(n.sm);
          return `<div class="sm-cell ${n.applied === c.leader()?.commit ? 'same' : ''}">
            <b>${n.id}</b><span>${keys.length ? keys.map(k => k + '=' + n.sm[k]).join(' ') : '（空）'}</span>
            <i>applied ${n.applied}</i></div>`;
        }).join('') + '</div>';
        traceEl.querySelector('.log-list').scrollTop = 1e6;
      }

      function build() {
        if (state.run) state.run.play(false);
        state.cluster = new RaftCluster(state.cfg);
        state.cluster.settle(400, 200000);
        state.focus = null;
        state.run = RaftView.runner(state.cluster, redraw);
        redraw();
      }

      body.querySelector('#rp-play').addEventListener('click', e => {
        const on = !state.run.playing;
        state.run.play(on);
        e.currentTarget.textContent = on ? '暂停' : '播放';
      });
      body.querySelector('#rp-step100').addEventListener('click', () => { state.cluster.step(100); redraw(); });
      body.querySelector('#rp-speed').addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b) return;
        body.querySelector('#rp-speed').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
        state.run.setSpeed(Number(b.dataset.v));
      });
      body.querySelector('#rp-reset').addEventListener('click', () => {
        state.counter = 1; build();
        body.querySelector('#rp-play').textContent = '播放';
      });
      body.querySelector('#rp-send').addEventListener('click', () => {
        const key = body.querySelector('#rp-key').value.trim() || 'x';
        const val = body.querySelector('#rp-val').value.trim() || String(state.counter++);
        const r = state.cluster.submit(key, val);
        if (!r.ok) RL.toast('客户端请求被拒：当前无主', false);
        else RL.toast(`已追加 index ${r.index}（领导者 ${r.leader}）`, true);
        if (!state.run.playing && r.ok) state.cluster.step(200);
        redraw();
      });
      body.querySelector('#rp-auto').addEventListener('change', e => {
        state.auto = e.target.checked;
      });
      RL.interval(() => {
        if (!state.auto) return;
        state.cluster.submit('k' + (state.counter++), String(state.counter));
        redraw();
      }, 400);

      const selected = () => state.focus ? state.cluster.node(state.focus) : null;
      body.querySelector('#rp-kill').addEventListener('click', () => {
        const n = selected(); if (!n) return RL.toast('先点击一个节点');
        state.cluster.kill(n.id); redraw();
      });
      body.querySelector('#rp-revive').addEventListener('click', () => {
        const n = selected(); if (!n) return RL.toast('先点击一个节点');
        state.cluster.revive(n.id); redraw();
      });
      body.querySelector('#rp-iso-lead').addEventListener('click', () => {
        const c = state.cluster;
        const l = c.leader();
        if (!l) return RL.toast('当前没有领导者');
        const others = c.nodes.filter(n => n.id !== l.id).map(n => n.id);
        const keep = Math.max(0, c.majority - 2);   // 领导者所在一侧凑不满多数派
        c.setPartition([[l.id].concat(others.slice(0, keep)), others.slice(keep)]);
        redraw();
      });
      body.querySelector('#rp-heal').addEventListener('click', () => { state.cluster.heal(); redraw(); });

      build();
    }
  });
})();
