/* ============ 生成器工具 ============ */
(function () {
  'use strict';
  const E = TB.esc;

  /* ---------- UUID 生成 ---------- */
  registerTool({
    id: 'uuid', cat: '生成器', name: 'UUID 生成',
    desc: '批量生成 UUID v4（加密安全随机数），多种格式可选',
    keywords: 'uuid guid v4 random 生成 标识符',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9h4M7 13h2M7 16h4" opacity=".8"/><path d="M14 9h3M15 13h2M14 16h3" opacity=".8"/></svg>',
    render(body) {
      body.innerHTML = `
        <div class="card">
          <div class="row">
            <div>
              <label class="fld">生成数量</label>
              <input type="number" id="u-n" min="1" max="500" value="5">
            </div>
            <div class="fix" style="align-self:flex-end">
              <button class="btn primary" id="u-go">生成</button>
              <button class="btn" id="u-copyall">复制全部</button>
            </div>
          </div>
          <div class="chk-row">
            <label class="chk"><input type="checkbox" id="u-upper"> 大写</label>
            <label class="chk"><input type="checkbox" id="u-nodash"> 去除连字符</label>
            <label class="chk"><input type="checkbox" id="u-brace"> 花括号包裹</label>
          </div>
        </div>
        <div class="card">
          <div class="card-title">结果</div>
          ${TB.outBlock('u-out', '点击「生成」')}
        </div>`;

      function uuidv4() {
        const b = crypto.getRandomValues(new Uint8Array(16));
        b[6] = (b[6] & 0x0f) | 0x40;
        b[8] = (b[8] & 0x3f) | 0x80;
        const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
        return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
      }

      function gen() {
        const n = Math.min(500, Math.max(1, Number(body.querySelector('#u-n').value) || 1));
        const upper = body.querySelector('#u-upper').checked;
        const nodash = body.querySelector('#u-nodash').checked;
        const brace = body.querySelector('#u-brace').checked;
        const list = [];
        for (let i = 0; i < n; i++) {
          let u = uuidv4();
          if (nodash) u = u.replace(/-/g, '');
          if (upper) u = u.toUpperCase();
          if (brace) u = '{' + u + '}';
          list.push(u);
        }
        body.querySelector('#u-out').textContent = list.join('\n');
      }
      body.querySelector('#u-go').onclick = gen;
      ['#u-upper', '#u-nodash', '#u-brace'].forEach(s => body.querySelector(s).addEventListener('change', gen));
      body.querySelector('#u-copyall').onclick = () => TB.copy(body.querySelector('#u-out').textContent);
      gen();
    }
  });

  /* ---------- 哈希计算 ---------- */
  registerTool({
    id: 'hash', cat: '生成器', name: '哈希计算',
    desc: '计算文本的 SHA-1 / SHA-256 / SHA-384 / SHA-512 摘要',
    keywords: 'hash sha sha256 sha512 digest 哈希 摘要 校验',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 4v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V7z"/><path d="M9 12l2 2 4-4"/></svg>',
    render(body) {
      body.innerHTML = `
        <div class="card">
          <div class="card-title">输入文本</div>
          <textarea id="hs-in" placeholder="输入要计算摘要的文本…" spellcheck="false"></textarea>
          <div class="chk-row">
            <label class="chk"><input type="checkbox" id="hs-upper"> 输出大写</label>
            <label class="chk"><input type="checkbox" id="hs-live" checked> 输入时自动计算</label>
          </div>
          ${crypto && crypto.subtle ? '' : '<div class="warn-note">当前环境不支持 WebCrypto（需通过 http/https 访问），请部署后使用。</div>'}
        </div>
        <div class="card">
          <div class="card-title">摘要结果</div>
          ${TB.outBlock('hs-out', '结果将实时计算')}
        </div>`;

      const inp = body.querySelector('#hs-in');
      const out = body.querySelector('#hs-out');
      const algos = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];

      async function calc() {
        if (!crypto || !crypto.subtle) return;
        const v = inp.value;
        if (!v) { out.innerHTML = '<span class="dim">结果将实时计算</span>'; return; }
        const upper = body.querySelector('#hs-upper').checked;
        const data = new TextEncoder().encode(v);
        const parts = [];
        for (const a of algos) {
          const d = await crypto.subtle.digest(a, data);
          const hex = [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join('');
          parts.push(`${a.padEnd(8)}  ${upper ? hex.toUpperCase() : hex}`);
        }
        out.textContent = parts.join('\n');
      }
      body.querySelector('#hs-upper').addEventListener('change', calc);
      body.querySelector('#hs-live').addEventListener('change', e => {
        inp.oninput = e.target.checked ? TB.debounce(calc, 300) : null;
        if (e.target.checked) calc();
      });
      inp.oninput = TB.debounce(calc, 300);
      if (crypto && crypto.subtle) calc();
    }
  });

  /* ---------- 密码生成 ---------- */
  registerTool({
    id: 'password', cat: '生成器', name: '密码生成',
    desc: '加密安全随机密码，自定义长度与字符集，显示熵值强度',
    keywords: 'password random secure 密码 随机 强度 entropy',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="10" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v3"/></svg>',
    render(body) {
      body.innerHTML = `
        <div class="card">
          <div class="row">
            <div>
              <label class="fld">长度：<b id="p-len-v" style="color:var(--accent)">16</b></label>
              <input type="range" id="p-len" min="6" max="64" value="16" style="width:100%;accent-color:var(--accent)">
            </div>
            <div>
              <label class="fld">生成数量</label>
              <input type="number" id="p-n" min="1" max="50" value="3">
            </div>
            <div class="fix" style="align-self:flex-end">
              <button class="btn primary" id="p-go">生成</button>
            </div>
          </div>
          <div class="chk-row">
            <label class="chk"><input type="checkbox" id="p-upper" checked> 大写字母</label>
            <label class="chk"><input type="checkbox" id="p-lower" checked> 小写字母</label>
            <label class="chk"><input type="checkbox" id="p-digit" checked> 数字</label>
            <label class="chk"><input type="checkbox" id="p-symbol" checked> 符号</label>
            <label class="chk"><input type="checkbox" id="p-noambig" checked> 排除易混淆 (0O1lI)</label>
          </div>
          <div class="strength"><i id="p-bar" style="width:0"></i></div>
          <div class="hint" id="p-strength">—</div>
        </div>
        <div class="card">
          <div class="card-title">结果 <span style="font-weight:400">（点击单条复制）</span></div>
          ${TB.outBlock('p-out', '点击「生成」')}
        </div>`;

      const SETS = {
        upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        lower: 'abcdefghijklmnopqrstuvwxyz',
        digit: '0123456789',
        symbol: '!@#$%^&*()-_=+[]{};:,.<>?',
      };

      function gen() {
        const len = Number(body.querySelector('#p-len').value);
        body.querySelector('#p-len-v').textContent = len;
        const n = Math.min(50, Math.max(1, Number(body.querySelector('#p-n').value) || 1));
        let pool = '';
        ['upper', 'lower', 'digit', 'symbol'].forEach(k => {
          if (body.querySelector('#p-' + k).checked) pool += SETS[k];
        });
        const out = body.querySelector('#p-out');
        if (!pool) { out.innerHTML = '<span class="err" style="color:var(--red)">✗ 至少选择一种字符集</span>'; return; }
        if (body.querySelector('#p-noambig').checked) {
          pool = pool.replace(/[0O1lI]/g, '');
        }
        const list = [];
        for (let i = 0; i < n; i++) {
          const bytes = crypto.getRandomValues(new Uint32Array(len));
          list.push([...bytes].map(v => pool[Math.floor(v * pool.length / 4294967296)]).join(''));
        }
        out.textContent = list.join('\n');
        out.style.cursor = 'pointer';
        out.onclick = e => {
          const line = e.target.closest('pre');
          if (line) {
            const first = list[0];
            TB.copy(first, true);
            TB.toast('已复制第一条密码', true);
          }
        };

        const entropy = Math.round(len * Math.log2(pool.length));
        const bar = body.querySelector('#p-bar');
        const label = body.querySelector('#p-strength');
        const pct = Math.min(100, entropy / 128 * 100);
        let cls, name;
        if (entropy < 40) { cls = 'var(--red)'; name = '弱'; }
        else if (entropy < 60) { cls = 'var(--amber)'; name = '一般'; }
        else if (entropy < 90) { cls = 'var(--teal)'; name = '强'; }
        else { cls = 'var(--green)'; name = '非常强'; }
        bar.style.width = pct + '%';
        bar.style.background = cls;
        label.innerHTML = `熵值约 <b style="color:${cls}">${entropy} bits</b>（字符集 ${pool.length} 种 × 长度 ${len}）· 强度：<b style="color:${cls}">${name}</b>`;
      }
      body.querySelector('#p-len').addEventListener('input', gen);
      body.querySelector('#p-go').onclick = gen;
      body.querySelectorAll('.chk input').forEach(c => c.addEventListener('change', gen));
      gen();
    }
  });
})();
