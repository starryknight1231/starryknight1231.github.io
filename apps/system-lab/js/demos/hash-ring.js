/* ============ 一致性哈希演示 ============ */
(function () {
  'use strict';

  registerDemo({
    id: 'hash-ring', cat: '分布式', name: '一致性哈希',
    desc: '看懂为什么扩容时一致性哈希只迁移少量数据，而简单取模会全量洗牌',
    keywords: 'consistent hashing 一致性哈希 虚拟节点 分片 扩容 迁移',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><circle cx="19.5" cy="12" r="2.4" fill="currentColor" stroke="none"/><circle cx="8" cy="5.5" r="2.4" fill="currentColor" stroke="none"/></svg>',
    render(body) {
      body.innerHTML = `
        <div class="info-note">
          <b>结论先行：</b>3 个节点扩到 4 个时，<b>简单取模</b>要让约 <b>75%</b> 的 key 换节点（缓存大面积失效），
          而<b>一致性哈希</b>只迁移约 <b>25%</b>。加<b>虚拟节点</b>还能解决数据倾斜。右侧数字就是实时算出来的两种方案迁移率，动手试试。
        </div>
        <div class="card">
          <div class="card-title">控制台 <span style="font-weight:400">提示：直接点击环上的彩色节点可移除它</span></div>
          <div class="row">
            <div class="fix btn-row" style="margin:0">
              <button class="btn primary" id="hr-add">＋ 添加节点</button>
              <button class="btn" id="hr-del">－ 移除节点</button>
              <button class="btn" id="hr-reset">重置</button>
            </div>
            <div>
              <label class="fld">虚拟节点数 / 物理节点：<b id="hr-vn-v" style="color:var(--accent)">100</b></label>
              <input type="range" id="hr-vn" min="0" max="200" step="10" value="100">
            </div>
          </div>
        </div>
        <div class="card">
          <div class="stage"><canvas id="hr-canvas"></canvas></div>
          <div class="legend" id="hr-legend"></div>
        </div>
        <div class="grid2">
          <div class="card">
            <div class="card-title">最近一次变更的迁移对比</div>
            <div class="stat-grid">
              <div class="stat c-teal"><b id="hr-m-ch">—</b><span>一致性哈希迁移率</span></div>
              <div class="stat c-red"><b id="hr-m-mod">—</b><span>简单取模迁移率</span></div>
              <div class="stat c-accent"><b id="hr-n-nodes">3</b><span>节点数</span></div>
              <div class="stat"><b id="hr-n-keys">200</b><span>key 数</span></div>
            </div>
            <div class="hint" id="hr-memo">添加或移除节点后，这里会显示两种方案各有多少 key 换了主人。</div>
          </div>
          <div class="card">
            <div class="card-title">每节点负责的 key 数（均衡性）</div>
            <div id="hr-bars"></div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">面试要点</div>
          <pre class="out" style="white-space:pre-wrap">普通取模：node = hash(key) % N。N 从 3 变 4，几乎所有 key 的模都变了 → 全量重新映射，缓存雪崩。

一致性哈希：把节点和 key 都映射到 [0, 2^32) 环上，key 顺时针找第一个节点。
N 变化时，只有「新节点与它的环上前驱之间」那段弧上的 key 会换主人 → 理论迁移量 ≈ K/N。

虚拟节点：物理节点少时，环上落点稀疏 → 各节点管到的弧长差异巨大（数据倾斜）。
每个物理节点映射成 V 个虚拟节点落环，负载标准差显著下降 → 这就是为什么 Redis Cluster 用 16384 个 slot、Memcached 客户端用 ketama（每个节点 160 个 vnode）。</pre>
        </div>`;

      /* ---------- 状态 ---------- */
      const KEY_N = 200;
      const keys = [];           // {name, hash}
      let nodes = [];            // {name, color}
      let vnode = 100;
      let movedSet = new Set();  // 最近一次变更中换了主人的 key（CH 方案）
      let memoText = '';

      function reset() {
        nodes = [];
        ['A', 'B', 'C'].forEach(n => addNode(n));
        keys.length = 0;
        for (let i = 1; i <= KEY_N; i++) {
          const name = 'key-' + i;
          keys.push({ name, hash: SL.fnv1a(name) });
        }
        movedSet = new Set();
        memoText = '';
      }

      function addNode(name) {
        if (!name) {
          let i = nodes.length;
          do { name = String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : ''); i++; }
          while (nodes.some(n => n.name === name) && i < 500);
        }
        nodes.push({ name, color: SL.PALETTE[nodes.length % SL.PALETTE.length] });
      }

      /* ---------- 归属计算 ---------- */
      // 一致性哈希：返回 vnode 位置数组 [{pos, nodeIdx}]（按 pos 排序）
      function buildRing() {
        const ring = [];
        nodes.forEach((n, ni) => {
          if (vnode === 0) {
            ring.push({ pos: SL.fnv1a('node-' + n.name), ni });
          } else {
            for (let v = 0; v < vnode; v++) ring.push({ pos: SL.fnv1a(`${n.name}#v${v}`), ni });
          }
        });
        ring.sort((a, b) => a.pos - b.pos);
        return ring;
      }
      function ownerCH(hash, ring) {
        if (!ring.length) return -1;
        let lo = 0, hi = ring.length - 1;
        if (hash > ring[hi].pos) return ring[0].ni;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (ring[mid].pos >= hash) hi = mid; else lo = mid + 1;
        }
        return ring[lo].ni;
      }
      const ownerMod = (hash, n) => n ? hash % n : -1;

      function ownersCH() {
        const ring = buildRing();
        return keys.map(k => ownerCH(k.hash, ring));
      }
      function ownersMod() {
        return keys.map(k => ownerMod(k.hash, nodes.length));
      }

      /* ---------- 迁移统计 ---------- */
      function applyChange(oldCH, oldMod) {
        const newCH = ownersCH();
        const newMod = ownersMod();
        movedSet = new Set();
        newCH.forEach((o, i) => { if (o !== oldCH[i]) movedSet.add(i); });
        const pctCH = keys.length ? Math.round(movedSet.size / keys.length * 1000) / 10 : 0;
        let movedMod = 0;
        newMod.forEach((o, i) => { if (o !== oldMod[i]) movedMod++; });
        const pctMod = keys.length ? Math.round(movedMod / keys.length * 1000) / 10 : 0;
        body.querySelector('#hr-m-ch').textContent = pctCH + '%';
        body.querySelector('#hr-m-mod').textContent = pctMod + '%';
        body.querySelector('#hr-n-nodes').textContent = nodes.length;
        memoText = `上次变更：${movedSet.size}/${keys.length} 个 key 换了节点（CH）vs ${movedMod}/${keys.length}（取模）`;
        body.querySelector('#hr-memo').textContent = memoText;
      }

      /* ---------- 绘图 ---------- */
      const canvas = body.querySelector('#hr-canvas');
      let layout;
      function draw() {
        const H = Math.min(460, Math.max(360, window.innerHeight * 0.42));
        layout = SL.fitCanvas(canvas, H);
        const { ctx, w, h } = layout;
        const cx = w / 2, cy = h / 2;
        const R_NODE = Math.min(w, h) / 2 - 34;
        const R_KEY = R_NODE - 42;

        ctx.clearRect(0, 0, w, h);

        // 参考环
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        [R_NODE, R_KEY].forEach(r => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); });

        // 虚拟节点小点
        if (vnode > 0 && nodes.length) {
          const ring = buildRing();
          ctx.globalAlpha = 0.28;
          ring.forEach(p => {
            const a = p.pos / 4294967296 * Math.PI * 2 - Math.PI / 2;
            const x = cx + R_NODE * Math.cos(a), y = cy + R_NODE * Math.sin(a);
            ctx.fillStyle = nodes[p.ni].color;
            ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
          });
          ctx.globalAlpha = 1;
        }

        // key 点（按主人着色）
        const ch = ownersCH();
        keys.forEach((k, i) => {
          const a = k.hash / 4294967296 * Math.PI * 2 - Math.PI / 2;
          const x = cx + R_KEY * Math.cos(a), y = cy + R_KEY * Math.sin(a);
          ctx.fillStyle = ch[i] >= 0 ? nodes[ch[i]].color : '#55637a';
          ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
          if (movedSet.has(i)) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.4;
            ctx.beginPath(); ctx.arc(x, y, 5.5, 0, Math.PI * 2); ctx.stroke();
          }
        });

        // 物理节点
        const ring0 = buildRing();
        nodes.forEach((n, ni) => {
          // 用第一个 vnode 的位置代表物理节点
          const own = ring0.find(p => p.ni === ni);
          if (!own) return;
          const a = own.pos / 4294967296 * Math.PI * 2 - Math.PI / 2;
          const x = cx + (R_NODE + 16) * Math.cos(a), y = cy + (R_NODE + 16) * Math.sin(a);
          ctx.fillStyle = n.color;
          ctx.beginPath(); ctx.arc(x, y, 7.5, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.85)';
          ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.arc(x, y, 7.5, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = n.color;
          ctx.font = '600 12px ' + getComputedStyle(document.body).getPropertyValue('--mono');
          const lxRaw = cx + (R_NODE + 30) * Math.cos(a), lyRaw = cy + (R_NODE + 30) * Math.sin(a);
          // 钳制标签位置，避免贴边被裁剪
          const lx = Math.max(38, Math.min(w - 38, lxRaw));
          const ly = Math.max(12, Math.min(h - 8, lyRaw));
          ctx.textAlign = Math.cos(a) > 0.2 ? 'left' : Math.cos(a) < -0.2 ? 'right' : 'center';
          ctx.textBaseline = Math.sin(a) > 0.2 ? 'top' : Math.sin(a) < -0.2 ? 'bottom' : 'middle';
          ctx.fillText('节点 ' + n.name, lx, ly);
        });
      }

      /* ---------- 负载条 ---------- */
      function drawBars() {
        const ch = ownersCH();
        const counts = nodes.map(() => 0);
        ch.forEach(o => { if (o >= 0) counts[o]++; });
        const max = Math.max(1, ...counts);
        body.querySelector('#hr-bars').innerHTML = nodes.map((n, i) => `
          <div class="meter" style="margin:7px 0">
            <span style="min-width:74px">节点 ${SL.esc(n.name)}</span>
            <div class="meter-bar"><i style="width:${counts[i] / max * 100}%;background:${n.color}"></i></div>
            <span class="meter-val">${counts[i]}</span>
          </div>`).join('') || '<span class="hint">暂无节点</span>';
        body.querySelector('#hr-legend').innerHTML =
          `<span><i style="background:#fff"></i>白圈 = 本次变更换了主人的 key</span>` +
          nodes.map(n => `<span><i style="background:${n.color}"></i>节点 ${SL.esc(n.name)}</span>`).join('');
      }

      function refresh() {
        body.querySelector('#hr-vn-v').textContent = vnode;
        body.querySelector('#hr-n-keys').textContent = keys.length;
        draw();
        drawBars();
      }

      /* ---------- 交互 ---------- */
      body.querySelector('#hr-add').addEventListener('click', () => {
        const oldCH = ownersCH(), oldMod = ownersMod();
        addNode();
        applyChange(oldCH, oldMod);
        refresh();
      });
      body.querySelector('#hr-del').addEventListener('click', () => {
        if (nodes.length <= 1) { SL.toast('至少保留一个节点', false); return; }
        const oldCH = ownersCH(), oldMod = ownersMod();
        nodes.pop();
        applyChange(oldCH, oldMod);
        refresh();
      });
      body.querySelector('#hr-reset').addEventListener('click', () => { reset(); refresh(); });
      body.querySelector('#hr-vn').addEventListener('input', e => {
        vnode = Number(e.target.value);
        movedSet = new Set();
        refresh();
      });

      // 点击节点移除
      canvas.addEventListener('click', e => {
        if (!layout) return;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left, my = e.clientY - rect.top;
        const { w, h } = layout;
        const cx = w / 2, cy = h / 2;
        const R_NODE = Math.min(w, h) / 2 - 34;
        const ring0 = buildRing();
        let hit = -1, hd = 16;
        nodes.forEach((n, ni) => {
          const own = ring0.find(p => p.ni === ni);
          if (!own) return;
          const a = own.pos / 4294967296 * Math.PI * 2 - Math.PI / 2;
          const x = cx + (R_NODE + 16) * Math.cos(a), y = cy + (R_NODE + 16) * Math.sin(a);
          const d = Math.hypot(mx - x, my - y);
          if (d < hd) { hd = d; hit = ni; }
        });
        if (hit >= 0) {
          if (nodes.length <= 1) { SL.toast('至少保留一个节点', false); return; }
          const oldCH = ownersCH(), oldMod = ownersMod();
          const name = nodes[hit].name;
          nodes.splice(hit, 1);
          applyChange(oldCH, oldMod);
          refresh();
          SL.toast(`已移除节点 ${name}`, true);
        }
      });

      const onResize = SL.debounce(() => { draw(); }, 200);
      window.addEventListener('resize', onResize);
      SL._cleanups.push(() => window.removeEventListener('resize', onResize));

      reset();
      refresh();
    }
  });
})();
