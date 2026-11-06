/* ============ 集群视图：SVG 拓扑 + 日志矩阵 + 播放控制 ============ */
(function () {
  'use strict';

  const TERM_HUES = ['t1', 't2', 't3', 't4', 't5'];
  const ROLE_CN = { leader: '领导者', candidate: '候选者', follower: '跟随者' };

  function hue(term) { return TERM_HUES[(Math.max(1, term) - 1) % TERM_HUES.length]; }

  const NODE_Y = 46, NODE_H = 84, SVG_H = 142, SVG_W = 720;

  function positions(cluster, W) {
    const n = cluster.nodes.length;
    const pad = 14;
    const step = (W - pad * 2) / n;
    const pos = {};
    cluster.nodes.forEach((nd, i) => { pos[nd.id] = { x: pad + step * i + step / 2, y: NODE_Y, w: Math.min(step - 10, 112) }; });
    return pos;
  }

  function zoneHulls(cluster, pos, W) {
    const groups = {};
    cluster.nodes.forEach(nd => { (groups[nd.zone] = groups[nd.zone] || []).push(nd.id); });
    const keys = Object.keys(groups);
    if (keys.length < 2) return '';
    const names = 'ABCDEF';
    return keys.map((k, gi) => {
      const xs = groups[k].map(id => pos[id]);
      const x1 = Math.min.apply(null, xs.map(p => p.x - p.w / 2)) - 8;
      const x2 = Math.max.apply(null, xs.map(p => p.x + p.w / 2)) + 8;
      return `<rect class="hull" x="${x1}" y="14" width="${x2 - x1}" height="${NODE_Y + NODE_H + 11 - 14}" rx="12"/>
        <text class="hull-label" x="${x1 + 8}" y="${NODE_Y + NODE_H + 6}">分区 ${names[gi] || gi}</text>`;
    }).join('');
  }

  function clusterSvg(cluster, opts) {
    opts = opts || {};
    const W = SVG_W, H = SVG_H;
    const pos = positions(cluster, W);
    let s = `<svg class="raft-svg" viewBox="0 0 ${W} ${H}" style="width:100%" role="img" aria-label="Raft 集群状态">`;
    s += zoneHulls(cluster, pos, W);

    // 在途消息
    const flights = cluster.flights();
    const perPair = {};
    flights.forEach(f => {
      const key = [f.from, f.to].sort().join('-');
      perPair[key] = (perPair[key] || 0) + 1;
      const a = pos[f.from], b = pos[f.to];
      if (!a || !b) return;
      const lift = 30 + (perPair[key] % 3) * 10;
      const x1 = a.x, x2 = b.x;
      const y = NODE_Y - 3;
      const cy = y - lift;
      const apex = (y + cy) / 2;
      const cls = f.type === 'rv' ? 'fl-rv' : f.type === 'ae' ? 'fl-ae' : f.type === 'rvr' ? 'fl-rvr' : 'fl-aer';
      s += `<path class="flight ${cls}" d="M${x1} ${y} Q ${(x1 + x2) / 2} ${cy} ${x2} ${y}"/>`;
      s += `<text class="fl-label ${cls}-t" x="${(x1 + x2) / 2}" y="${apex + 4}" text-anchor="middle">${f.type === 'rv' ? 'RV' : f.type === 'ae' ? 'AE' : f.type === 'rvr' ? 'RV✓' : 'AE✓'}</text>`;
    });

    // 节点
    cluster.nodes.forEach(nd => {
      const p = pos[nd.id];
      const cls = [
        'node', 'role-' + nd.role,
        nd.alive ? '' : 'is-dead',
        opts.focus === nd.id ? 'is-focus' : ''
      ].join(' ');
      const x = p.x - p.w / 2, y = NODE_Y, w = p.w, h = NODE_H;
      s += `<g class="${cls}" data-id="${nd.id}">`;
      s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/>`;
      s += `<text class="n-id" x="${p.x}" y="${y + 20}" text-anchor="middle">${nd.id}</text>`;
      s += `<text class="n-role" x="${p.x}" y="${y + 36}" text-anchor="middle">${nd.alive ? ROLE_CN[nd.role] : '已宕机'}</text>`;
      s += `<text class="n-term" x="${x + 8}" y="${y + 58}">term ${nd.term}</text>`;
      s += `<text class="n-vote" x="${x + 8}" y="${y + 72}">${nd.votedFor ? '已投 ' + nd.votedFor : '未投票'}</text>`;
      if (nd.role === 'candidate') {
        s += `<text class="n-votes" x="${x + w - 8}" y="${y + 58}" text-anchor="end">${nd.votes.length} 票</text>`;
      }
      if (nd.role !== 'leader' && nd.alive) {
        const left = Math.max(0, nd.timeoutAt - cluster.now);
        const pct = Math.min(100, (left / Math.max(1, cluster.cfg.electionMax)) * 100);
        s += `<rect class="to-bar" x="${x + 8}" y="${y + h - 8}" width="${w - 16}" height="3" rx="1.5"/>`;
        s += `<rect class="to-fill" x="${x + 8}" y="${y + h - 8}" width="${(w - 16) * pct / 100}" height="3" rx="1.5"/>`;
      }
      if (!nd.alive) s += `<path class="dead-mark" d="M${p.x - 9} ${y + 44} l18 18 M${p.x + 9} ${y + 44} l-18 18"/>`;
      s += '</g>';
    });
    s += '</svg>';
    return s;
  }

  function entryCell(e, committed) {
    if (!e) return '<td class="lg-empty">—</td>';
    return `<td class="${committed ? 'lg-committed' : 'lg-pending'}"><span class="term-chip ${hue(e.term)}">${RL.esc(e.key)}=${RL.esc(e.val)}</span><i class="tc-term">t${e.term}</i></td>`;
  }

  function logGrid(cluster, opts) {
    opts = opts || {};
    const maxLen = Math.max(1, cluster.nodes.reduce((m, n) => Math.max(m, n.log.length), 0));
    const rows = opts.rows || maxLen;
    let h = '<div class="lg-wrap"><table class="tb lg-table"><thead><tr><th>index</th>';
    cluster.nodes.forEach(n => { h += `<th>${n.id}${n.role === 'leader' && n.alive ? ' <span class="lg-lead">★</span>' : ''}</th>`; });
    h += '</tr></thead><tbody>';
    for (let i = 0; i < rows; i++) {
      h += `<tr><td class="lg-idx">${i + 1}</td>`;
      cluster.nodes.forEach(n => {
        const e = n.log[i];
        h += e ? entryCell(e, i < n.commit) : '<td class="lg-empty">—</td>';
      });
      h += '</tr>';
    }
    if (opts.showCommit !== false) {
      h += '<tr class="lg-mark"><td>commit</td>';
      cluster.nodes.forEach(n => { h += `<td>${n.commit}</td>`; });
      h += '</tr><tr class="lg-mark"><td>applied</td>';
      cluster.nodes.forEach(n => { h += `<td>${n.applied}</td>`; });
      h += '</tr>';
    }
    h += '</tbody></table></div>';
    return h;
  }

  function statsRow(cluster) {
    const s = cluster.stats(), m = cluster.metrics;
    const viol = cluster.checkInvariants();
    return `<div class="stat-grid">
      <div class="stat c-accent"><b>${s.leader}</b><span>当前领导者</span></div>
      <div class="stat"><b>${s.term}</b><span>最大 term</span></div>
      <div class="stat"><b>${s.commit}</b><span>已提交条目</span></div>
      <div class="stat"><b>${s.entries}</b><span>日志长度</span></div>
      <div class="stat"><b>${m.messages}</b><span>消息投递</span></div>
      <div class="stat c-red"><b>${viol.length}</b><span>安全违规</span></div>
    </div>`;
  }

  function traceList(cluster, limit) {
    const rows = cluster.trace.slice(-(limit || 14));
    if (!rows.length) return '<div class="log-list"><span class="l-dim">— 尚无事件 —</span></div>';
    return '<div class="log-list">' + rows.map(r =>
      `<div class="${r.cls === 'err' ? 'l-err' : r.cls === 'ok' ? 'l-ok' : r.cls === 'warn' ? 'l-warn' : 'l-dim'}">${String(r.t).padStart(5, ' ')}ms ${RL.esc(r.text)}</div>`
    ).join('') + '</div>';
  }

  function invariantPanel(cluster) {
    const rules = [
      { key: '选举安全', text: '每个 term 至多一个领导者' },
      { key: '领导完整性', text: '领导者日志包含全部已提交条目' },
      { key: '日志匹配', text: '同 index 同 term 的条目内容一致' },
      { key: '状态机安全', text: '同一 index 的已提交条目在所有节点上相同' }
    ];
    const viol = cluster.checkInvariants();
    return '<div class="inv-list">' + rules.map(r => {
      const hits = viol.filter(v => v.rule === r.key);
      return `<div class="inv ${hits.length ? 'inv-bad' : 'inv-ok'}">
        <span class="inv-dot"></span><b>${r.key}</b><span class="inv-desc">${r.text}</span>
        ${hits.length ? `<span class="inv-detail">${RL.esc(hits[0].detail)}</span>` : ''}
      </div>`;
    }).join('') + '</div>';
  }

  function runner(cluster, redraw, hostEl) {
    const r = { playing: false, speed: 1 };
    r.timer = RL.interval(() => {
      if (!r.playing) return;
      cluster.step(90 * r.speed);
      redraw();
    }, 110);
    r.play = on => { r.playing = on; redraw(); };
    r.stepOnce = () => { cluster.tick(); redraw(); };
    r.stepMs = ms => { cluster.step(ms); redraw(); };
    r.setSpeed = v => { r.speed = v; };
    return r;
  }

  window.RaftView = {
    clusterSvg, logGrid, statsRow, traceList, invariantPanel, runner, hue,
    ROLE_CN
  };
})(window);
