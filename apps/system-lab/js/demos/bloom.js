/* ============ 布隆过滤器演示 ============ */
(function () {
  'use strict';

  registerDemo({
    id: 'bloom', cat: '分布式', name: '布隆过滤器',
    desc: '亲手点亮 bit 数组，实测误判率并与理论公式对比，看它如何用极小内存挡住缓存穿透',
    keywords: 'bloom filter 布隆过滤器 缓存穿透 bitmap 误判 去重',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M8 4v16M13 4v16M18 4v16" opacity=".5"/><rect x="13.5" y="9.5" width="4" height="4" fill="currentColor" stroke="none" rx="1"/></svg>',
    render(body) {
      body.innerHTML = `
        <div class="info-note">
          <b>结论先行：</b>布隆过滤器说「<b>不存在</b>」就绝对不存在，说「存在」可能有误判。
          1 万条数据、1% 误判率只需约 <b>12 KB</b>——这正是它挡缓存穿透、做海量去重的底气。
          代价：<b>不支持删除</b>（一个 bit 是多个元素共享的）。
        </div>
        <div class="card">
          <div class="card-title">参数</div>
          <div class="row">
            <div>
              <label class="fld">位数组大小 m</label>
              <select id="bl-m">
                <option value="256">256 bit</option>
                <option value="1024">1024 bit</option>
                <option value="8192" selected>8192 bit</option>
                <option value="32768">32768 bit</option>
              </select>
            </div>
            <div>
              <label class="fld">哈希函数个数 k</label>
              <select id="bl-k">
                ${[1,2,3,4,5,6,7,8].map(k => `<option value="${k}" ${k === 3 ? 'selected' : ''}>${k} 个</option>`).join('')}
              </select>
            </div>
            <div class="fix" style="align-self:flex-end">
              <button class="btn" id="bl-reset">清空重建</button>
            </div>
          </div>
          <div class="hint">
            最优参数：给定预期元素 n 与目标误判率 p，m = −n·ln p / (ln2)²，k = m/n·ln2。
            下面「误判实验」里会实时对照理论公式与实测值。
          </div>
        </div>
        <div class="card">
          <div class="stage"><canvas id="bl-canvas"></canvas></div>
          <div class="legend">
            <span><i style="background:var(--accent)"></i>已置 1 的 bit</span>
            <span><i style="background:var(--amber)"></i>本次查询命中的 bit</span>
            <span><i style="background:#e3ddd1"></i>尚未置位</span>
          </div>
        </div>
        <div class="grid2">
          <div class="card">
            <div class="card-title">添加元素</div>
            <div class="row">
              <input type="text" id="bl-add-in" placeholder="输入任意字符串，如 user-123 / url / 商品ID">
              <button class="btn primary fix" id="bl-add">添加</button>
            </div>
            <div class="btn-row">
              <button class="btn sm" id="bl-add-users">一键放入 100 个用户 ID</button>
              <button class="btn sm" id="bl-add-random">随机添加 50 个</button>
            </div>
            <div class="hint" id="bl-n-stat">当前已插入 0 个元素，占用 m 个 bit。</div>
          </div>
          <div class="card">
            <div class="card-title">查询</div>
            <div class="row">
              <input type="text" id="bl-q-in" placeholder="查询某元素是否「可能存在」">
              <button class="btn primary fix" id="bl-q">查询</button>
            </div>
            <div style="margin-top:12px"><pre class="out" id="bl-q-out">输入要查询的元素。没有加过的元素会得到「一定不存在」（绝不误报不存在）。</pre></div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">误判实验</div>
          <div class="btn-row">
            <button class="btn teal" id="bl-fp">用 5000 个陌生字符串实测误判率</button>
          </div>
          <div class="stat-grid" style="margin-top:12px">
            <div class="stat c-accent"><b id="bl-s-theory">—</b><span>理论误判率 (1−e^(−kn/m))^k</span></div>
            <div class="stat c-amber"><b id="bl-s-measured">—</b><span>实测误判率</span></div>
            <div class="stat"><b id="bl-s-n">0</b><span>已插入元素 n</span></div>
            <div class="stat c-teal"><b id="bl-s-mem">—</b><span>占用内存</span></div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">面试要点</div>
          <pre class="out" style="white-space:pre-wrap">原理：k 个相互独立的哈希函数把元素映射到 m 位 bit 数组；插入时把 k 个位置全部置 1；查询时检查 k 个位置——
  有一个 0 → 元素一定没插入过（无误报不存在）
  全是 1 → 「可能存在」，可能是别的元素恰好把这几个位都占了（误判来源）

为什么不支持删除？bit 是共享的，删 A 可能把 B 的位也清了 → 计数布隆过滤器（每位改 4-bit 计数器）、布谷鸟过滤器（可删除 + 更省内存）是进阶答案。

典型应用：缓存穿透防护（请求先过布隆过滤器，一定不存在的直接打回）、爬虫 URL 去重、推荐系统已读去重、
HBase/LevelDB/RocksDB 的 memtable 判断、Chrome 恶意网址检测。

工程注意：哈希函数要快且独立（Guava 用 murmur+双重哈希公式 hi = h1 + i·h2）；
误判率随元素增多逼近上限，容量要按「预期最大元素数」提前规划；Redis 场景用 bitmap 结构或 Redisson RBloomFilter。</pre>
        </div>`;

      /* ---------- 状态 ---------- */
      let m = 8192, k = 3;
      let bits = new Uint8Array(m);
      let n = 0;
      let lastAdded = [];     // 最近添加点亮的 bit
      let lastQuery = null;   // [{idx, on}]

      const h1 = s => SL.fnv1a(s);
      const h2 = s => SL.fnv1a(s + '~bloom~salt~');
      // 双重哈希公式 hi = h1 + i·h2（Guava 同款思路）
      function indexOf(s, i) {
        return (h1(s) + i * h2(s)) % m;
      }
      function idxsOf(s) {
        const out = [];
        for (let i = 0; i < k; i++) out.push(indexOf(s, i));
        return out;
      }

      function addStr(s) {
        const idxs = idxsOf(s);
        idxs.forEach(i => { bits[i] = 1; });
        lastAdded = idxs;
        n++;
        updateStats();
        draw();
        return idxs;
      }

      function queryStr(s) {
        const idxs = idxsOf(s);
        const on = idxs.map(i => bits[i] === 1);
        lastQuery = idxs.map((idx, i) => ({ idx, on: on[i] }));
        draw();
        return on.every(x => x);
      }

      /* ---------- 绘图 ---------- */
      const canvas = body.querySelector('#bl-canvas');
      function draw() {
        const H = 200;
        const { ctx, w, h } = SL.fitCanvas(canvas, H);
        ctx.clearRect(0, 0, w, h);
        const cols = Math.ceil(Math.sqrt(m * (w / h)));
        const rows = Math.ceil(m / cols);
        const cw = w / cols, ch = h / rows;
        const onSet = new Map();
        for (let i = 0; i < m; i++) if (bits[i]) onSet.set(i, 1);
        lastAdded.forEach(i => { if (bits[i]) onSet.set(i, 2); });
        if (lastQuery) lastQuery.forEach(q => { onSet.set(q.idx, q.on ? 3 : 4); });

        for (let i = 0; i < m; i++) {
          const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
          if (!onSet.has(i)) {
            ctx.fillStyle = '#e3ddd1';
            ctx.fillRect(x, y, Math.max(1, cw - 1), Math.max(1, ch - 1));
          }
        }
        onSet.forEach((type, i) => {
          const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
          ctx.fillStyle = type === 2 ? '#4e6478' : type === 1 ? '#2f6b60'
            : type === 3 ? '#8a6a1f' : 'rgba(79,112,56,0.55)';
          ctx.fillRect(x, y, Math.max(1, cw - 1), Math.max(1, ch - 1));
          if (type === 3 || type === 4) {
            ctx.strokeStyle = type === 3 ? '#faf8f3' : '#4f7038';
            ctx.lineWidth = 1;
            ctx.strokeRect(x - 0.5, y - 0.5, cw, ch);
          }
        });
      }

      function updateStats() {
        body.querySelector('#bl-n-stat').textContent =
          `当前已插入 ${n} 个元素，点亮了 ${bits.reduce((a, b) => a + b, 0)} / ${m} 个 bit。`;
        body.querySelector('#bl-s-n').textContent = n;
        body.querySelector('#bl-s-mem').textContent = (m / 8 / 1024).toFixed(1) + ' KB';
        if (n > 0) {
          const p = Math.pow(1 - Math.exp(-k * n / m), k);
          body.querySelector('#bl-s-theory').textContent = (p * 100).toFixed(2) + '%';
        } else {
          body.querySelector('#bl-s-theory').textContent = '—';
        }
      }

      /* ---------- 交互 ---------- */
      const addInput = body.querySelector('#bl-add-in');
      const doAdd = () => {
        const v = addInput.value.trim();
        if (!v) { SL.toast('先输入内容', false); return; }
        const idxs = addStr(v);
        body.querySelector('#bl-q-out').textContent =
          `已添加「${v}」：置位 bit [${idxs.join(', ')}]（蓝色）。注意这些 bit 现在被后续元素共享。`;
        addInput.value = '';
        addInput.focus();
      };
      body.querySelector('#bl-add').addEventListener('click', doAdd);
      addInput.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
      body.querySelector('#bl-add-users').addEventListener('click', () => {
        for (let i = 1; i <= 100; i++) addStr('user-' + i);
        SL.toast('已放入 user-1 ~ user-100', true);
      });
      body.querySelector('#bl-add-random').addEventListener('click', () => {
        for (let i = 0; i < 50; i++) addStr(Math.random().toString(36).slice(2) + Math.floor(Math.random() * 1e6));
        SL.toast('已随机添加 50 个', true);
      });

      const qInput = body.querySelector('#bl-q-in');
      const doQuery = () => {
        const v = qInput.value.trim();
        if (!v) { SL.toast('先输入要查询的内容', false); return; }
        const maybe = queryStr(v);
        const out = body.querySelector('#bl-q-out');
        const checked = lastQuery.map(q => `${q.idx}${q.on ? '(1)' : '(0)'}`).join(', ');
        if (!maybe) {
          out.innerHTML = `<span class="ok">✓ 「${SL.esc(v)}」一定不存在</span>\n检查 bit [${checked}]，至少一个为 0 —— 布隆过滤器从不误报「不存在」。`;
        } else {
          out.innerHTML = `<span class="err" style="color:var(--amber)">? 「${SL.esc(v)}」可能存在（有误判可能）</span>\n检查 bit [${checked}]，全部为 1 —— 但这些位可能是其他元素贡献的。`;
        }
        qInput.focus();
      };
      body.querySelector('#bl-q').addEventListener('click', doQuery);
      qInput.addEventListener('keydown', e => { if (e.key === 'Enter') doQuery(); });

      body.querySelector('#bl-fp').addEventListener('click', () => {
        if (n === 0) { SL.toast('先插入一些元素再测', false); return; }
        let fp = 0;
        const TEST = 5000;
        for (let i = 0; i < TEST; i++) {
          const s = 'probe-' + Math.random().toString(36).slice(2, 10) + '-' + i;
          if (queryStr(s)) fp++;
        }
        lastQuery = null;
        draw();
        const measured = fp / TEST * 100;
        body.querySelector('#bl-s-measured').textContent = measured.toFixed(2) + '%';
        body.querySelector('#bl-q-out').textContent =
          `用 ${TEST} 个确定未插入的字符串实测：${fp} 个被误判为「可能存在」，实测误判率 ${measured.toFixed(2)}%（理论值见左侧）。`;
        SL.toast('实验完成，结果已更新', true);
      });

      function rebuild() {
        m = Number(body.querySelector('#bl-m').value);
        k = Number(body.querySelector('#bl-k').value);
        bits = new Uint8Array(m);
        n = 0;
        lastAdded = [];
        lastQuery = null;
        body.querySelector('#bl-s-measured').textContent = '—';
        updateStats();
        draw();
      }
      body.querySelector('#bl-m').addEventListener('change', rebuild);
      body.querySelector('#bl-k').addEventListener('change', rebuild);
      body.querySelector('#bl-reset').addEventListener('click', () => { rebuild(); SL.toast('已清空重建', true); });

      const onResize = SL.debounce(draw, 200);
      window.addEventListener('resize', onResize);
      SL._cleanups.push(() => window.removeEventListener('resize', onResize));

      // 初始放几个元素，页面一打开就有内容
      ['user-1', 'user-2', 'user-3', 'order-9a2f', 'sku-88'].forEach(addStr);
      lastAdded = [];
    }
  });
})();
