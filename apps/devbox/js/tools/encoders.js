/* ============ 编码解码类工具 ============ */
(function () {
  'use strict';
  const E = TB.esc;

  /* ---------- JSON 格式化 ---------- */
  registerTool({
    id: 'json', cat: '编码解码', name: 'JSON 格式化',
    desc: '格式化、压缩、校验 JSON，错误精确定位到行列',
    keywords: 'json 格式化 压缩 校验 pretty minify parser',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4c-2 0-3 1-3 3v2c0 1.5-1 2-2 3 1 1 2 1.5 2 3v2c0 2 1 3 3 3"/><path d="M16 4c2 0 3 1 3 3v2c0 1.5 1 2 2 3-1 1-2 1.5-2 3v2c0 2-1 3-3 3"/></svg>',
    render(body) {
      body.innerHTML = `
        <div class="card">
          <div class="card-title">输入 <button class="btn sm" id="j-sample">填入示例</button></div>
          <textarea id="j-in" placeholder="粘贴 JSON 字符串…" spellcheck="false"></textarea>
          <div class="btn-row">
            <button class="btn primary" id="j-pretty">格式化</button>
            <button class="btn" id="j-min">压缩</button>
            <button class="btn" id="j-check">仅校验</button>
            <span class="chk"><label class="chk">缩进 <select id="j-indent" style="width:auto"><option value="2">2 空格</option><option value="4">4 空格</option></select></label></span>
          </div>
        </div>
        <div class="card">
          <div class="card-title">结果</div>
          ${TB.outBlock('j-out')}
        </div>`;

      const inp = body.querySelector('#j-in');
      const out = body.querySelector('#j-out');

      function locate(text, pos) {
        const before = text.slice(0, pos);
        const line = before.split('\n').length;
        const col = pos - before.lastIndexOf('\n');
        return `第 ${line} 行 第 ${col} 列`;
      }

      function run(mode) {
        const src = inp.value.trim();
        if (!src) { out.innerHTML = '<span class="dim">请先输入 JSON</span>'; return; }
        try {
          const obj = JSON.parse(src);
          if (mode === 'check') {
            out.innerHTML = `<span class="ok">✓ 合法的 JSON</span>\n<span class="dim">类型：${
              Array.isArray(obj) ? 'Array(' + obj.length + ')' : obj === null ? 'null' : typeof obj
            }　大小：${new Blob([src]).size} 字节</span>`;
          } else {
            const indent = mode === 'min' ? 0 : Number(body.querySelector('#j-indent').value);
            out.textContent = JSON.stringify(obj, null, indent);
          }
        } catch (err) {
          let where = '';
          const m = err.message.match(/position (\d+)/);
          if (m) where = `（${locate(src, Number(m[1]))}）`;
          out.innerHTML = `<span class="err">✗ 解析失败：${E(err.message)}${where}</span>`;
        }
      }
      body.querySelector('#j-pretty').onclick = () => run('pretty');
      body.querySelector('#j-min').onclick = () => run('min');
      body.querySelector('#j-check').onclick = () => run('check');
      body.querySelector('#j-sample').onclick = () => {
        inp.value = JSON.stringify({ name: 'DevBox', version: '1.0.0', tools: ['json', 'base64', 'regex'], config: { theme: 'dark', plugins: null }, tags: ['dev', 'tools', 'local-first'] }, null, 2);
        inp.dispatchEvent(new Event('input'));
      };
    }
  });

  /* ---------- Base64 ---------- */
  registerTool({
    id: 'base64', cat: '编码解码', name: 'Base64 编解码',
    desc: '文本与 Base64 互转（UTF-8 安全），支持 URL-Safe 与文件转 Data URI',
    keywords: 'base64 encode decode base64url file datauri data uri',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h13M14 5l3 3-3 3"/><path d="M20 16H7M10 13l-3 3 3 3"/></svg>',
    render(body) {
      body.innerHTML = `
        <div class="card">
          <div class="row">
            <div>
              <label class="fld">方向</label>
              <div class="seg" id="b-dir">
                <button class="on" data-v="enc">文本 → Base64</button>
                <button data-v="dec">Base64 → 文本</button>
              </div>
            </div>
            <div>
              <label class="fld">字符集</label>
              <div class="seg" id="b-safe">
                <button class="on" data-v="std">标准 (+/)</button>
                <button data-v="url">URL-Safe (-_)</button>
              </div>
            </div>
          </div>
          <label class="fld">输入</label>
          <textarea id="b-in" placeholder="输入文本或 Base64…" spellcheck="false"></textarea>
          <div class="btn-row">
            <button class="btn" id="b-swap">⇅ 交换到输出</button>
            <label class="btn sm" style="cursor:pointer">选择文件转 Data URI<input id="b-file" type="file" style="display:none"></label>
          </div>
        </div>
        <div class="card">
          <div class="card-title">输出</div>
          ${TB.outBlock('b-out')}
        </div>`;

      const inp = body.querySelector('#b-in');
      const out = body.querySelector('#b-out');
      let dir = 'enc', safe = 'std';

      body.querySelectorAll('.seg').forEach(seg => {
        seg.querySelectorAll('button').forEach(btn => {
          btn.onclick = () => {
            seg.querySelectorAll('button').forEach(b => b.classList.remove('on'));
            btn.classList.add('on');
            if (seg.id === 'b-dir') dir = btn.dataset.v; else safe = btn.dataset.v;
            convert();
          };
        });
      });

      function b64encode(str) {
        const bytes = new TextEncoder().encode(str);
        let bin = '';
        bytes.forEach(b => { bin += String.fromCharCode(b); });
        let b64 = btoa(bin);
        if (safe === 'url') b64 = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        return b64;
      }
      function b64decode(b64) {
        let s = b64.trim().replace(/\s+/g, '');
        if (safe === 'url' || /[-_]/.test(s)) s = s.replace(/-/g, '+').replace(/_/g, '/');
        while (s.length % 4) s += '=';
        const bin = atob(s); // 非法字符会抛异常
        const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes); // 非法 UTF-8 抛异常
      }

      function convert() {
        const v = inp.value;
        if (!v.trim()) { out.innerHTML = '<span class="dim">结果将显示在这里</span>'; return; }
        try {
          out.textContent = dir === 'enc' ? b64encode(v) : b64decode(v);
        } catch (err) {
          out.innerHTML = `<span class="err">✗ 转换失败：${E(err.message)}</span>`;
        }
      }
      inp.addEventListener('input', convert);

      body.querySelector('#b-swap').onclick = () => {
        if (out.textContent) {
          inp.value = out.textContent;
          dir = dir === 'enc' ? 'dec' : 'enc';
          body.querySelectorAll('#b-dir button').forEach(b => b.classList.toggle('on', b.dataset.v === dir));
          convert();
        }
      };
      body.querySelector('#b-file').addEventListener('change', e => {
        const f = e.target.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = () => {
          out.textContent = r.result;
          TB.toast(`已读取 ${f.name}（${(f.size / 1024).toFixed(1)} KB）`, true);
        };
        r.readAsDataURL(f);
      });
    }
  });

  /* ---------- URL 编解码 ---------- */
  registerTool({
    id: 'urlcodec', cat: '编码解码', name: 'URL 编解码',
    desc: 'URL 与查询参数的编码、解码，区分组件模式与完整 URL 模式',
    keywords: 'url encode decode uri percent 百分号 query',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4.5 4.5 0 0 0 6.4.4l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.5 1.5"/><path d="M14 10a4.5 4.5 0 0 0-6.4-.4l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.5-1.5"/></svg>',
    render(body) {
      body.innerHTML = `
        <div class="card">
          <div class="row">
            <div>
              <label class="fld">方向</label>
              <div class="seg" id="u-dir">
                <button class="on" data-v="enc">编码</button>
                <button data-v="dec">解码</button>
              </div>
            </div>
            <div>
              <label class="fld">模式</label>
              <div class="seg" id="u-mode">
                <button class="on" data-v="comp">组件 Component</button>
                <button data-v="full">完整 URI</button>
              </div>
            </div>
          </div>
          <label class="fld">输入</label>
          <textarea id="u-in" placeholder="例如：https://example.com/search?q=你好世界&page=2" spellcheck="false"></textarea>
          <div class="btn-row">
            <button class="btn" id="u-parse">解析 URL 结构</button>
          </div>
        </div>
        <div class="card">
          <div class="card-title">输出</div>
          ${TB.outBlock('u-out')}
        </div>
        <div class="card" id="u-parts" style="display:none">
          <div class="card-title">URL 结构</div>
          <table class="tb"><tbody id="u-tb"></tbody></table>
        </div>`;

      const inp = body.querySelector('#u-in');
      const out = body.querySelector('#u-out');
      let dir = 'enc', mode = 'comp';

      body.querySelectorAll('.seg').forEach(seg => {
        seg.querySelectorAll('button').forEach(btn => {
          btn.onclick = () => {
            seg.querySelectorAll('button').forEach(b => b.classList.remove('on'));
            btn.classList.add('on');
            if (seg.id === 'u-dir') dir = btn.dataset.v; else mode = btn.dataset.v;
            convert();
          };
        });
      });

      function convert() {
        const v = inp.value;
        if (!v.trim()) { out.innerHTML = '<span class="dim">结果将显示在这里</span>'; return; }
        try {
          let r;
          if (dir === 'enc') r = mode === 'comp' ? encodeURIComponent(v) : encodeURI(v);
          else r = mode === 'comp' ? decodeURIComponent(v) : decodeURI(v);
          out.textContent = r;
        } catch (err) {
          out.innerHTML = `<span class="err">✗ 解码失败：输入包含不合法的百分号序列</span>`;
        }
      }
      inp.addEventListener('input', convert);

      body.querySelector('#u-parse').onclick = () => {
        try {
          const u = new URL(inp.value.trim());
          const rows = [
            ['协议', u.protocol], ['主机', u.hostname], ['端口', u.port || '（默认）'],
            ['路径', u.pathname], ['哈希', u.hash || '（无）'],
          ];
          let qs = '';
          u.searchParams.forEach((v, k) => { qs += `<tr><td style="color:var(--muted)">参数</td><td><code class="inline">${E(k)}</code> = <code class="inline">${E(v)}</code></td></tr>`; });
          body.querySelector('#u-tb').innerHTML = rows.map(r => `<tr><td style="color:var(--muted);width:80px">${r[0]}</td><td><code class="inline">${E(r[1])}</code></td></tr>`).join('') + qs;
          body.querySelector('#u-parts').style.display = '';
        } catch {
          out.innerHTML = '<span class="err">✗ 无法解析：请输入完整 URL（含协议）</span>';
          body.querySelector('#u-parts').style.display = 'none';
        }
      };
    }
  });

  /* ---------- HTML 实体 ---------- */
  registerTool({
    id: 'htmlentity', cat: '编码解码', name: 'HTML 实体编解码',
    desc: 'HTML 特殊字符与实体互转，防止 XSS 或还原富文本',
    keywords: 'html entity escape unescape xss 实体 转义',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 8l-5 4 5 4"/><path d="M15 8l5 4-5 4"/><path d="M13 5l-2 14"/></svg>',
    render(body) {
      body.innerHTML = `
        <div class="card">
          <div class="row">
            <div>
              <label class="fld">方向</label>
              <div class="seg" id="h-dir">
                <button class="on" data-v="enc">转义 Escape</button>
                <button data-v="dec">还原 Unescape</button>
              </div>
            </div>
            <div>
              <label class="fld">范围</label>
              <div class="seg" id="h-ext">
                <button class="on" data-v="basic">仅特殊符号</button>
                <button data-v="all">含非 ASCII 字符</button>
              </div>
            </div>
          </div>
          <label class="fld">输入</label>
          <textarea id="h-in" placeholder='例如：<div class="title">你好 & 再见</div>' spellcheck="false"></textarea>
        </div>
        <div class="card">
          <div class="card-title">输出</div>
          ${TB.outBlock('h-out')}
        </div>`;

      const inp = body.querySelector('#h-in');
      const out = body.querySelector('#h-out');
      let dir = 'enc', ext = 'basic';

      body.querySelectorAll('.seg').forEach(seg => {
        seg.querySelectorAll('button').forEach(btn => {
          btn.onclick = () => {
            seg.querySelectorAll('button').forEach(b => b.classList.remove('on'));
            btn.classList.add('on');
            if (seg.id === 'h-dir') dir = btn.dataset.v; else ext = btn.dataset.v;
            convert();
          };
        });
      });

      function encodeHtml(s) {
        let r = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        if (ext === 'all') {
          r = r.replace(/[\u0080-\uFFFF]/g, ch => `&#x${ch.codePointAt(0).toString(16)};`);
        }
        return r;
      }
      function decodeHtml(s) {
        const ta = document.createElement('textarea');
        ta.innerHTML = s;
        return ta.value;
      }

      function convert() {
        const v = inp.value;
        if (!v) { out.innerHTML = '<span class="dim">结果将显示在这里</span>'; return; }
        out.textContent = dir === 'enc' ? encodeHtml(v) : decodeHtml(v);
      }
      inp.addEventListener('input', convert);
    }
  });

  /* ---------- JWT 解码 ---------- */
  registerTool({
    id: 'jwt', cat: '编码解码', name: 'JWT 解码',
    desc: '解码 JWT 的 Header 与 Payload，查看算法和声明（不校验签名）',
    keywords: 'jwt token decode auth jwt 解码 令牌',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="14" r="4"/><path d="M11 11L21 1M16 6l3 3M13 9l2 2"/></svg>',
    render(body) {
      body.innerHTML = `
        <div class="card">
          <div class="card-title">Token <button class="btn sm" id="w-sample">填入示例</button></div>
          <textarea id="w-in" placeholder="粘贴 JWT（eyJhbGciOi… 格式）" spellcheck="false"></textarea>
          <div class="warn-note">⚠️ 此工具仅在本地解码内容，<b>不会也不应校验签名</b>。请勿粘贴包含敏感信息的真实生产 Token。</div>
        </div>
        <div class="card">
          <div class="card-title">Header</div>
          ${TB.outBlock('w-head')}
        </div>
        <div class="card">
          <div class="card-title">Payload</div>
          ${TB.outBlock('w-pay')}
        </div>`;

      const inp = body.querySelector('#w-in');

      function b64url(s) {
        s = s.replace(/-/g, '+').replace(/_/g, '/');
        while (s.length % 4) s += '=';
        const bin = atob(s);
        return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
      }

      function convert() {
        const head = body.querySelector('#w-head');
        const pay = body.querySelector('#w-pay');
        const parts = inp.value.trim().replace(/^Bearer\s+/i, '').split('.');
        if (!inp.value.trim()) {
          head.innerHTML = pay.innerHTML = '<span class="dim">结果将显示在这里</span>';
          return;
        }
        if (parts.length !== 3) {
          head.innerHTML = `<span class="err">✗ 不是有效的 JWT 结构（应有 3 段，用 . 分隔，实际 ${parts.length} 段）</span>`;
          pay.innerHTML = '<span class="dim">—</span>';
          return;
        }
        const dec = (seg, el) => {
          try { el.textContent = JSON.stringify(JSON.parse(b64url(seg)), null, 2); }
          catch { el.innerHTML = `<span class="err">✗ 该段无法解析为 JSON</span><span class="dim">\n原文：${E(seg)}</span>`; }
        };
        dec(parts[0], head);
        dec(parts[1], pay);
      }
      inp.addEventListener('input', convert);
      body.querySelector('#w-sample').onclick = () => {
        inp.value = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IuW5D-W5t-W5tCIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoxOTAwMDAwMDAwLCJyb2xlIjpbImFkbWluIiwiZGV2Il19.dQw4w9WgXcQ_dummy_signature_for_demo_only_1234567890';
        convert();
      };
    }
  });
})();
