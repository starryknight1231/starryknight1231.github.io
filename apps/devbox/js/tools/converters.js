/* ============ 转换类工具 ============ */
(function () {
  'use strict';
  const E = TB.esc;

  /* ---------- 时间戳转换 ---------- */
  registerTool({
    id: 'timestamp', cat: '转换', name: '时间戳转换',
    desc: 'Unix 时间戳与日期互转，自动识别秒/毫秒，实时当前时间',
    keywords: 'timestamp unix time date 时间戳 日期 转换 epoch',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
    render(body) {
      body.innerHTML = `
        <div class="card">
          <div class="card-title">当前时间 <button class="btn sm" id="t-copy-now">复制当前时间戳</button></div>
          <div class="live-ts" id="t-now-ts">—</div>
          <div class="live-date" id="t-now-date">—</div>
        </div>
        <div class="card">
          <div class="card-title">时间戳 → 日期</div>
          <div class="row">
            <input type="text" id="t-in" placeholder="输入时间戳，如 1700000000 或 1700000000000">
            <button class="btn primary fix" id="t-go">转换</button>
          </div>
          <div style="margin-top:10px">${TB.outBlock('t-out', '转换结果')}</div>
        </div>
        <div class="card">
          <div class="card-title">日期 → 时间戳</div>
          <div class="row">
            <input type="datetime-local" id="t-dt" step="1">
            <button class="btn primary fix" id="t-go2">转换</button>
          </div>
          <div style="margin-top:10px">${TB.outBlock('t-out2', '转换结果')}</div>
        </div>`;

      function fmt(ms) {
        const d = new Date(ms);
        const pad = n => String(n).padStart(2, '0');
        const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        const utc = d.toISOString().slice(0, 19).replace('T', ' ');
        const week = '日一二三四五六'[d.getDay()];
        return [
          `本地时间：${local}（周${week}）`,
          `UTC 时间：${utc}`,
          `ISO 8601：${d.toISOString()}`,
          `秒级：${Math.floor(ms / 1000)}　毫秒级：${ms}`,
          `相对：${ms > Date.now() ? '距今 ' : '已过去 '}${Math.abs(ms - Date.now()) / 86400000 < 1
            ? (Math.abs(ms - Date.now()) / 3600000).toFixed(2) + ' 小时'
            : (Math.abs(ms - Date.now()) / 86400000).toFixed(2) + ' 天'}`,
        ].join('\n');
      }

      // 实时时钟
      function tick() {
        const d = new Date();
        const tEl = body.querySelector('#t-now-ts');
        if (!tEl) return;
        tEl.textContent = Math.floor(d.getTime() / 1000);
        const pad = n => String(n).padStart(2, '0');
        tEl.nextElementSibling.textContent =
          `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}（本地）`;
      }
      tick();
      TB.interval(tick, 1000);

      body.querySelector('#t-copy-now').onclick = () => TB.copy(String(Math.floor(Date.now() / 1000)));

      const inp = body.querySelector('#t-in');
      const out = body.querySelector('#t-out');
      function convTs() {
        const v = inp.value.trim();
        if (!v) return;
        if (!/^-?\d+$/.test(v)) { out.innerHTML = '<span class="err">✗ 请输入纯数字时间戳</span>'; return; }
        let n = Number(v);
        if (Math.abs(n) < 1e11) n *= 1000; // 秒 → 毫秒
        const d = new Date(n);
        if (isNaN(d.getTime())) { out.innerHTML = '<span class="err">✗ 超出日期范围</span>'; return; }
        out.textContent = fmt(d.getTime());
      }
      body.querySelector('#t-go').onclick = convTs;
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') convTs(); });

      const out2 = body.querySelector('#t-out2');
      body.querySelector('#t-go2').onclick = () => {
        const v = body.querySelector('#t-dt').value;
        if (!v) { out2.innerHTML = '<span class="dim">请先选择日期时间</span>'; return; }
        const ms = new Date(v).getTime();
        out2.textContent = fmt(ms);
      };
      // 默认填当前
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      body.querySelector('#t-dt').value =
        `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    }
  });

  /* ---------- 进制转换 ---------- */
  registerTool({
    id: 'radix', cat: '转换', name: '进制转换',
    desc: '2/8/10/16 进制及任意 2-36 进制互转',
    keywords: 'radix binary hex octal decimal base 进制 二进制 十六进制',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M4 7v10M9 12h6M12 9v6M20 7v10"/><path d="M4 17h16"/></svg>',
    render(body) {
      body.innerHTML = `
        <div class="card">
          <div class="row">
            <div style="flex:2">
              <label class="fld">输入值</label>
              <input type="text" id="r-in" placeholder="如 255、0xFF、0b1010" spellcheck="false">
            </div>
            <div>
              <label class="fld">识别为</label>
              <select id="r-base">
                <option value="auto">自动识别</option>
                <option value="2">二进制 (0b)</option>
                <option value="8">八进制 (0o)</option>
                <option value="10">十进制</option>
                <option value="16">十六进制 (0x)</option>
              </select>
            </div>
          </div>
          <div class="hint">自动识别支持前缀 0b / 0o / 0x，不带前缀按十进制处理。支持 BigInt 大数。</div>
        </div>
        <div class="card">
          <div class="card-title">常用进制</div>
          <table class="tb"><tbody id="r-out"></tbody></table>
        </div>
        <div class="card">
          <div class="card-title">任意进制</div>
          <div class="row">
            <div>
              <label class="fld">目标进制（2-36）</label>
              <input type="number" id="r-custom" min="2" max="36" value="32">
            </div>
          </div>
          <div style="margin-top:10px">${TB.outBlock('r-cout', '结果')}</div>
        </div>`;

      const inp = body.querySelector('#r-in');
      const sel = body.querySelector('#r-base');

      function parse() {
        let v = inp.value.trim().toLowerCase().replace(/^0([box])([0-9a-f]+)/, (m, p, d) => p + d);
        const raw = inp.value.trim().toLowerCase();
        let base;
        const mode = sel.value;
        if (mode === 'auto') {
          if (raw.startsWith('0b')) { base = 2; v = raw.slice(2); }
          else if (raw.startsWith('0o')) { base = 8; v = raw.slice(2); }
          else if (raw.startsWith('0x')) { base = 16; v = raw.slice(2); }
          else { base = 10; v = raw; }
        } else {
          base = Number(mode);
          v = raw.replace(/^0[box]/, '');
        }
        if (!v) return null;
        const re = base === 2 ? /^[01]+$/ : base === 8 ? /^[0-7]+$/ : base === 10 ? /^\d+$/ : base === 16 ? /^[0-9a-f]+$/ : null;
        if (re && !re.test(v)) return { err: `「${v}」不是合法的 ${base} 进制数` };
        try { return { big: BigInt((base === 10 ? '' : '') + '0b' + toBinary(v, base)) }; }
        catch { return { err: '数值超出范围' }; }
      }

      // 任意进制 → 二进制字符串（支持大数）
      const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
      function toBinary(v, base) {
        if (base === 2) return v;
        let n = 0n, b = BigInt(base);
        for (const ch of v) {
          const d = DIGITS.indexOf(ch);
          if (d < 0 || d >= base) throw new Error('invalid digit');
          n = n * b + BigInt(d);
        }
        return n.toString(2);
      }

      function render() {
        const rows = body.querySelector('#r-out');
        const cout = body.querySelector('#r-cout');
        const r = parse();
        if (!r) {
          rows.innerHTML = '<tr><td class="dim" style="color:var(--faint)">输入后自动转换</td></tr>';
          cout.innerHTML = '<span class="dim">结果</span>';
          return;
        }
        if (r.err) {
          rows.innerHTML = `<tr><td><span class="err" style="color:var(--red)">✗ ${E(r.err)}</span></td></tr>`;
          return;
        }
        const n = r.big;
        const lines = [['二进制 (2)', '0b' + n.toString(2)], ['八进制 (8)', '0o' + n.toString(8)], ['十进制 (10)', n.toString(10)], ['十六进制 (16)', '0x' + n.toString(16).toUpperCase()]];
        rows.innerHTML = lines.map(l => `<tr><td style="color:var(--muted);width:110px">${l[0]}</td><td><code class="inline">${E(l[1])}</code></td></tr>`).join('');
        const cb = Number(body.querySelector('#r-custom').value);
        if (cb >= 2 && cb <= 36) {
          cout.textContent = n.toString(cb).toUpperCase();
        } else {
          cout.innerHTML = '<span class="err" style="color:var(--red)">✗ 进制范围 2-36</span>';
        }
      }
      inp.addEventListener('input', render);
      sel.addEventListener('change', render);
      body.querySelector('#r-custom').addEventListener('input', render);
      inp.value = '255';
      render();
    }
  });

  /* ---------- 颜色工具 ---------- */
  registerTool({
    id: 'color', cat: '转换', name: '颜色转换',
    desc: 'HEX / RGB / HSL 互转，取色器，自动生成明暗色阶',
    keywords: 'color hex rgb hsl picker palette 颜色 取色 色阶',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.7s6.5 6.6 6.5 11.1a6.5 6.5 0 0 1-13 0C5.5 9.3 12 2.7 12 2.7z"/></svg>',
    render(body) {
      body.innerHTML = `
        <div class="card">
          <div class="row">
            <div style="flex:2">
              <label class="fld">输入颜色（支持 HEX / RGB / HSL）</label>
              <input type="text" id="c-in" placeholder="如 #4f8ef7 或 rgb(79,142,247) 或 hsl(215,92%,64%)" spellcheck="false">
            </div>
            <div>
              <label class="fld">取色器</label>
              <input type="color" class="cpick" id="c-pick" value="#4f8ef7">
            </div>
          </div>
        </div>
        <div class="card">
          <div class="swatch" id="c-swatch">点击色阶可复制对应色值</div>
          <table class="tb" style="margin-top:14px"><tbody id="c-out"></tbody></table>
        </div>
        <div class="card">
          <div class="card-title">明暗色阶（点击复制）</div>
          <div class="shade-row" id="c-shades"></div>
          <div style="height:22px"></div>
        </div>`;

      const inp = body.querySelector('#c-in');
      const pick = body.querySelector('#c-pick');

      function parseColor(s) {
        s = s.trim().toLowerCase();
        let m;
        if ((m = s.match(/^#?([0-9a-f]{3})$/))) {
          return hex2rgb(m[1].split('').map(c => c + c).join(''));
        }
        if ((m = s.match(/^#?([0-9a-f]{6})$/))) return hex2rgb(m[1]);
        if ((m = s.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/))) {
          const r = [Number(m[1]), Number(m[2]), Number(m[3])];
          if (r.some(v => v > 255)) return null;
          return r;
        }
        if ((m = s.match(/^hsla?\(\s*([\d.]+)(?:deg)?[,\s]+([\d.]+)%?[,\s]+([\d.]+)%?/))) {
          const rgb = hsl2rgb(Number(m[1]), Number(m[2]), Number(m[3]));
          return rgb;
        }
        return null;
      }
      function hex2rgb(hex) {
        return [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
      }
      function rgb2hex([r, g, b]) {
        return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
      }
      function rgb2hsl([r, g, b]) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h = 0, s = 0, l = (max + min) / 2;
        if (max !== min) {
          const d = max - min;
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
          else if (max === g) h = (b - r) / d + 2;
          else h = (r - g) / d + 4;
          h *= 60;
        }
        return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
      }
      function hsl2rgb(h, s, l) {
        s /= 100; l /= 100;
        const k = n => (n + h / 30) % 12;
        const a = s * Math.min(l, 1 - l);
        const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
        return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
      }

      function render(rgb) {
        const hex = rgb2hex(rgb);
        const hsl = rgb2hsl(rgb);
        const sw = body.querySelector('#c-swatch');
        sw.style.background = hex;
        sw.style.color = (rgb[0] * 0.299 + rgb[1] * 0.587 + rgb[2] * 0.114) > 150 ? '#0b0f14' : '#fff';
        sw.textContent = hex + '　' + `rgb(${rgb.join(', ')})`;
        sw.style.textShadow = 'none';
        body.querySelector('#c-out').innerHTML = [
          ['HEX', hex.toUpperCase()], ['RGB', `rgb(${rgb.join(', ')})`],
          ['HSL', `hsl(${hsl[0]}, ${hsl[1]}%, ${hsl[2]}%)`],
          ['明亮度 L', hsl[2] + '%'],
        ].map(l => `<tr><td style="color:var(--muted);width:110px">${l[0]}</td><td><code class="inline" style="cursor:pointer" data-copy-text="${E(l[1])}">${E(l[1])}</code></td></tr>`).join('');
        TB.bindCopy(body.querySelector('#c-out'));

        // 色阶
        const shades = body.querySelector('#c-shades');
        shades.innerHTML = '';
        for (let i = 5; i >= -5; i--) {
          const l = Math.min(97, Math.max(3, hsl[2] + i * 7));
          const c = hsl2rgb(hsl[0], hsl[1], l);
          const h = rgb2hex(c);
          const d = document.createElement('div');
          d.className = 'shade';
          d.style.background = h;
          d.innerHTML = `<i>${l}%</i>`;
          d.title = h;
          d.onclick = () => TB.copy(h);
          shades.appendChild(d);
        }
        pick.value = hex;
      }

      inp.addEventListener('input', TB.debounce(() => {
        const rgb = parseColor(inp.value);
        if (rgb) render(rgb);
      }, 200));

      pick.addEventListener('input', () => {
        inp.value = pick.value;
        render(hex2rgb(pick.value.slice(1)));
      });

      inp.value = '#4f8ef7';
      render(hex2rgb('4f8ef7'));
    }
  });
})();
