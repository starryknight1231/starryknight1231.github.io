/* ============ 演示一：领导选举 ============ */
(function () {
  'use strict';

  registerDemo({
    id: 'election', cat: '共识协议', name: '领导选举',
    desc: '随机化超时怎么避免活锁，分区里会发生什么',
    keywords: 'raft election timeout split vote livelock 选举 活锁',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="6" r="3"/><circle cx="5" cy="18" r="2.4"/><circle cx="19" cy="18" r="2.4"/><path d="M12 9v3M12 12l-5 4M12 12l5 4"/></svg>',
    render(body) {
      const state = {
        cfg: { nodes: 5, seed: 7, fixedElection: 0, electionMin: 150, electionMax: 300, heartbeat: 50, latency: 20 },
        cluster: null, focus: null, run: null
      };

      body.innerHTML = `
        <div class="info-note"><b>这一页在跑什么：</b>一个事件驱动的 Raft 集群模型。节点各自倒计时，先到期的变成候选者并拉票；
        收到心跳就重置计时。所有时间都是虚拟时钟，同一个种子必然得到同一条轨迹。</div>

        <div class="card">
          <div class="card-title">控制
            <span class="card-hint">点击节点可选中，再做宕机 / 隔离</span>
          </div>
          <div class="sim-bar">
            <button class="btn primary" id="el-play">播放</button>
            <button class="btn" id="el-step1">单步事件</button>
            <button class="btn" id="el-step100">推进 100ms</button>
            <span class="sim-sep"></span>
            <div class="seg" id="el-speed">
              <button data-v="0.5">0.5×</button><button data-v="1" class="on">1×</button>
              <button data-v="2">2×</button><button data-v="4">4×</button>
            </div>
            <button class="btn" id="el-reset">重置</button>
          </div>
          <div class="row cfg-row">
            <div>
              <label class="fld">节点数</label>
              <div class="seg" id="el-n">
                <button data-v="3">3</button><button data-v="5" class="on">5</button><button data-v="7">7</button>
              </div>
            </div>
            <div>
              <label class="fld">选举超时</label>
              <div class="seg" id="el-timeout">
                <button data-v="rand" class="on">随机 150–300ms</button><button data-v="fixed">固定 300ms</button>
              </div>
            </div>
            <div>
              <label class="fld">随机种子（决定超时抽签）</label>
              <input type="number" id="el-seed" value="7" min="1" max="9999" style="width:110px">
            </div>
            <div class="fix">
              <label class="fld">虚拟时刻</label>
              <div class="clock" id="el-clock">0 ms</div>
            </div>
          </div>
          <div class="btn-row">
            <button class="btn sm" id="el-kill">选中节点宕机</button>
            <button class="btn sm" id="el-revive">选中节点重启</button>
            <button class="btn sm" id="el-isolate">选中节点隔离</button>
            <button class="btn sm" id="el-heal">恢复全部网络</button>
            <button class="btn sm" id="el-split">对半分区</button>
          </div>
        </div>

        <div class="card">
          <div class="card-title">集群</div>
          <div class="stage" id="el-stage"></div>
          <div class="legend">
            <span><i style="background:var(--accent)"></i>领导者</span>
            <span><i style="background:var(--amber)"></i>候选者</span>
            <span><i style="background:var(--border-strong)"></i>跟随者</span>
            <span><i style="background:#4e6478"></i>RV 拉票</span>
            <span><i style="background:var(--teal)"></i>AE 心跳</span>
          </div>
        </div>

        <div class="card"><div class="card-title">指标</div><div id="el-stats"></div></div>
        <div class="card"><div class="card-title">事件流</div><div id="el-trace"></div></div>
        <div class="card"><div class="card-title">安全不变量（每帧重算）</div><div id="el-inv"></div></div>

        <div class="card">
          <div class="card-title">面试要点</div>
          <pre class="out" style="white-space:pre-wrap">超时必须随机化：固定超时下两个节点会同时变成候选者、互相把票投给自己，票被拆开，谁也到不了多数派——只能把 term 加一再投一次，这就是活锁。切到「固定 300ms」再播放，看 term 涨而领导者为空。
随机区间取 [150ms, 300ms]：区间要明显大于心跳周期，否则心跳还没到，超时先触发，领导者会被无谓地推翻。
选举成功只需要「多数派 + 自己的票」，不需要全部节点同意；这也意味着两个互不可达的分区里，最多只有一个能凑够多数派。
候选者拉票时带上的不是日志内容，而是 lastLogTerm / lastLogIndex 两个数字——这是投票限制的全部依据。</pre>
        </div>`;

      const stage = body.querySelector('#el-stage');
      const statsEl = body.querySelector('#el-stats');
      const traceEl = body.querySelector('#el-trace');
      const invEl = body.querySelector('#el-inv');
      const clockEl = body.querySelector('#el-clock');

      function redraw() {
        const c = state.cluster;
        stage.innerHTML = RaftView.clusterSvg(c, { focus: state.focus });
        stage.querySelectorAll('.node').forEach(g => {
          g.addEventListener('click', () => { state.focus = g.dataset.id; redraw(); });
        });
        statsEl.innerHTML = RaftView.statsRow(c);
        traceEl.innerHTML = RaftView.traceList(c, 16);
        invEl.innerHTML = RaftView.invariantPanel(c);
        clockEl.textContent = Math.round(c.now) + ' ms';
        traceEl.querySelector('.log-list').scrollTop = 1e6;
      }

      function build() {
        if (state.run) { state.run.play(false); }
        state.cluster = new RaftCluster(state.cfg);
        state.focus = null;
        state.run = RaftView.runner(state.cluster, redraw);
        redraw();
      }

      function seg(id, onPick) {
        const el = body.querySelector(id);
        el.addEventListener('click', e => {
          const b = e.target.closest('button');
          if (!b) return;
          el.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
          onPick(b.dataset.v);
        });
        return el;
      }

      body.querySelector('#el-play').addEventListener('click', e => {
        const on = !state.run.playing;
        state.run.play(on);
        e.currentTarget.textContent = on ? '暂停' : '播放';
        e.currentTarget.classList.toggle('teal', on);
      });
      body.querySelector('#el-step1').addEventListener('click', () => state.run.stepOnce());
      body.querySelector('#el-step100').addEventListener('click', () => state.run.stepMs(100));
      body.querySelector('#el-reset').addEventListener('click', () => {
        build();
        body.querySelector('#el-play').textContent = '播放';
      });
      seg('#el-speed', v => state.run.setSpeed(Number(v)));
      seg('#el-n', v => { state.cfg.nodes = Number(v); build(); });
      seg('#el-timeout', v => {
        state.cfg.fixedElection = v === 'fixed' ? 300 : 0;
        build();
      });
      body.querySelector('#el-seed').addEventListener('change', e => {
        state.cfg.seed = Number(e.target.value) || 1;
        build();
      });

      const selected = () => state.focus ? state.cluster.node(state.focus) : null;
      body.querySelector('#el-kill').addEventListener('click', () => {
        const n = selected();
        if (!n) return RL.toast('先点击一个节点');
        state.cluster.kill(n.id); redraw();
      });
      body.querySelector('#el-revive').addEventListener('click', () => {
        const n = selected();
        if (!n) return RL.toast('先点击一个节点');
        state.cluster.revive(n.id); redraw();
      });
      body.querySelector('#el-isolate').addEventListener('click', () => {
        const n = selected();
        if (!n) return RL.toast('先点击一个节点');
        state.cluster.isolate(n.id); redraw();
      });
      body.querySelector('#el-heal').addEventListener('click', () => { state.cluster.heal(); redraw(); });
      body.querySelector('#el-split').addEventListener('click', () => {
        const ids = state.cluster.nodes.map(n => n.id);
        const half = Math.floor(ids.length / 2);
        state.cluster.setPartition([ids.slice(0, half), ids.slice(half)]);
        redraw();
      });

      build();
    }
  });
})();
