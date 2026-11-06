/* ============ Web 类工具 ============ */
(function () {
  'use strict';
  const E = TB.esc;

  /* ---------- 正则测试 ---------- */
  registerTool({
    id: 'regex', cat: 'Web', name: '正则测试',
    desc: '实时匹配高亮、捕获组展示、替换预览，含常用表达式速查',
    keywords: 'regex regexp regular 正则 匹配 替换 test match',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="17" cy="6" r="2.2"/><path d="M4 18c2.5 0 4-1.5 4-4V7"/><path d="M13 18h-1.5c-1 0-1.7-.8-1.7-1.8V14c0-.8-.6-1.4-1.3-1.5H9.2"/><path d="M4 7c0-.6.5-1 1-1"/></svg>',
    render(body) {
      const COMMON = [
        ['邮箱', '[\\w.+-]+@[\\w-]+\\.[\\w.]{2,}'],
        ['手机号', '1[3-9]\\d{9}'],
        ['URL', 'https?://[^\\s<>"\']+'],
        ['IPv4', '(\\d{1,3}\\.){3}\\d{1,3}'],
        ['日期 yyyy-MM-dd', '\\d{4}-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\\d|3[01])'],
        ['中文', '[\\u4e00-\\u9fa5]+'],
        ['HTML 标签', '<\\/?[a-zA-Z][^>]*>'],
        ['十六进制颜色', '#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\\b'],
      ];
      body.innerHTML = `
        <div class="card">
          <div class="row">
            <div style="flex:2">
              <label class="fld">正则表达式</label>
              <input type="text" id="re-pat" placeholder="如 \\d+ 或 (\\w+)@\\w+\\.com" spellcheck="false">
            </div>
            <div>
              <label class="fld">标志</label>
              <div class="chk-row" style="margin:0">
                <label class="chk"><input type="checkbox" id="re-g" checked> g</label>
                <label class="chk"><input type="checkbox" id="re-i"> i</label>
                <label class="chk"><input type="checkbox" id="re-m"> m</label>
                <label class="chk"><input type="checkbox" id="re-s"> s</label>
                <label class="chk"><input type="checkbox" id="re-u"> u</label>
              </div>
            </div>
          </div>
          <div class="btn-row" id="re-common">
            <span style="font-size:12px;color:var(--faint);align-self:center;margin-right:4px">常用：</span>
            ${COMMON.map((c, i) => `<button class="btn sm" data-i="${i}">${c[0]}</button>`).join('')}
          </div>
        </div>
        <div class="card">
          <div class="card-title">测试文本</div>
          <textarea id="re-in" style="min-height:130px" spellcheck="false"></textarea>
          <label class="fld">替换为（支持 $1 $2 捕获组）</label>
          <div class="row">
            <input type="text" id="re-rep" placeholder="如 <a href='$&'>$&</a>">
            <button class="btn fix" id="re-do-rep">执行替换</button>
          </div>
        </div>
        <div class="card">
          <div class="card-title">匹配高亮 <span id="re-count" style="font-weight:400"></span></div>
          <pre class="out" id="re-hl" style="max-height:200px"></pre>
        </div>
        <div class="card">
          <div class="card-title">匹配详情与捕获组</div>
          <table class="tb"><thead><tr><th>#</th><th>位置</th><th>匹配</th><th>捕获组</th></tr></thead><tbody id="re-list"></tbody></table>
        </div>
        <div class="card" id="re-rep-card" style="display:none">
          <div class="card-title">替换结果</div>
          ${TB.outBlock('re-rep-out')}
        </div>`;

      const pat = body.querySelector('#re-pat');
      const inp = body.querySelector('#re-in');
      const flags = () => ['g', 'i', 'm', 's', 'u'].filter(f => body.querySelector('#re-' + f).checked).join('');

      function build() {
        try {
          return { re: new RegExp(pat.value, flags()), err: null };
        } catch (e) {
          return { re: null, err: e.message };
        }
      }

      function run() {
        const out = body.querySelector('#re-hl');
        const list = body.querySelector('#re-list');
        const count = body.querySelector('#re-count');
        if (!pat.value) {
          out.innerHTML = '<span class="dim">输入正则与测试文本后实时高亮</span>';
          list.innerHTML = '<tr><td class="dim" style="color:var(--faint)">—</td></tr>';
          count.textContent = '';
          return;
        }
        const { re, err } = build();
        if (err) {
          out.innerHTML = `<span class="err">✗ 正则语法错误：${E(err)}</span>`;
          list.innerHTML = '';
          count.textContent = '';
          return;
        }
        const text = inp.value;
        if (!text) { out.innerHTML = '<span class="dim">请输入测试文本</span>'; return; }

        // 手动遍历（支持无 g 标志也只列第一个），防止零长度匹配死循环
        const matches = [];
        const re2 = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
        let m, guard = 0;
        while ((m = re2.exec(text)) !== null && guard++ < 1000) {
          matches.push({ m, idx: m.index });
          if (m[0] === '') re2.lastIndex++;
          if (!re.flags.includes('g')) break;
        }
        count.textContent = `${matches.length} 个匹配`;

        // 高亮
        let html = '', last = 0;
        matches.forEach(({ m, idx }) => {
          html += E(text.slice(last, idx)) + '<mark>' + E(m[0] || '') + '</mark>';
          last = idx + m[0].length;
        });
        html += E(text.slice(last));
        out.innerHTML = html.replace(/\n/g, '<br>');

        // 详情
        list.innerHTML = matches.map(({ m, idx }, i) => {
          const groups = m.slice(1).map((g, gi) => g === undefined
            ? `<span class="dim">(${gi + 1}) 未匹配</span>`
            : `<code class="inline">(${gi + 1}) ${E(g)}</code>`).join(' ');
          return `<tr><td style="color:var(--faint)">${i + 1}</td><td style="font-family:var(--mono);font-size:12px;color:var(--muted)">${idx}</td><td><mark style="background:var(--accent-soft);color:var(--accent);border-radius:3px;padding:0 2px">${E(m[0])}</mark></td><td>${groups || '<span class="dim">无</span>'}</td></tr>`;
        }).join('') || '<tr><td class="dim" style="color:var(--faint)">没有匹配</td></tr>';
      }

      body.querySelector('#re-do-rep').onclick = () => {
        const card = body.querySelector('#re-rep-card');
        const { re, err } = build();
        if (err) { TB.toast('正则语法错误', false); return; }
        const rep = body.querySelector('#re-rep').value;
        try {
          const r = inp.value.replace(re, rep);
          body.querySelector('#re-rep-out').textContent = r;
          card.style.display = '';
        } catch (e) {
          body.querySelector('#re-rep-out').innerHTML = `<span class="err">${E(e.message)}</span>`;
          card.style.display = '';
        }
      };

      body.querySelector('#re-common').addEventListener('click', e => {
        const btn = e.target.closest('button[data-i]');
        if (!btn) return;
        pat.value = COMMON[Number(btn.dataset.i)][1];
        run();
      });

      const runD = TB.debounce(run, 200);
      pat.addEventListener('input', runD);
      inp.addEventListener('input', runD);
      ['g', 'i', 'm', 's', 'u'].forEach(f => body.querySelector('#re-' + f).addEventListener('change', run));

      inp.value = `联系我们：
- 邮箱 support@devbox.tools，备用 admin@example.com
- 电话 13812345678 或 15987654321
- 主页 https://devbox.tools/docs?a=1
- 发布于 2026-11-05，颜色 #4f8ef7 与 #fff`;
      pat.value = COMMON[0][1];
      run();
    }
  });

  /* ---------- HTTP 状态码 ---------- */
  registerTool({
    id: 'httpcode', cat: 'Web', name: 'HTTP 状态码速查',
    desc: '常见 HTTP 状态码含义速查表，支持搜索过滤',
    keywords: 'http status code 状态码 404 500 web rest api',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.4 4 5.6 4 9s-1.5 6.6-4 9c-2.5-2.4-4-5.6-4-9s1.5-6.6 4-9z"/></svg>',
    render(body) {
      const CODES = [
        [100, 'Continue', '客户端应继续发送请求体（用于大请求的分阶段确认）'],
        [101, 'Switching Protocols', '切换协议，如升级为 WebSocket'],
        [200, 'OK', '请求成功，返回预期内容'],
        [201, 'Created', '资源创建成功，常用于 POST/PUT 新建'],
        [202, 'Accepted', '请求已接受但尚未处理完成（异步任务）'],
        [204, 'No Content', '成功但无返回体，常用于 DELETE'],
        [206, 'Partial Content', '返回部分内容，配合 Range 头做断点续传'],
        [301, 'Moved Permanently', '资源永久重定向到新地址，浏览器会缓存'],
        [302, 'Found', '临时重定向，不缓存'],
        [304, 'Not Modified', '协商缓存命中，内容未变化，用本地缓存'],
        [307, 'Temporary Redirect', '临时重定向，且保持原请求方法'],
        [308, 'Permanent Redirect', '永久重定向，且保持原请求方法'],
        [400, 'Bad Request', '请求语法错误或参数不合法，服务端无法理解'],
        [401, 'Unauthorized', '未认证：缺少或无效的登录凭证（Token）'],
        [403, 'Forbidden', '已认证但无权限访问该资源'],
        [404, 'Not Found', '资源不存在，或路径错误'],
        [405, 'Method Not Allowed', '请求方法不被允许（如对只读接口发 POST）'],
        [408, 'Request Timeout', '客户端请求超时'],
        [409, 'Conflict', '请求与资源当前状态冲突（如重复创建）'],
        [410, 'Gone', '资源已永久删除'],
        [413, 'Payload Too Large', '请求体超过服务端允许的大小'],
        [415, 'Unsupported Media Type', '不支持的 Content-Type'],
        [422, 'Unprocessable Entity', '语法正确但语义错误，常用于校验失败'],
        [429, 'Too Many Requests', '触发限流，请求过于频繁'],
        [500, 'Internal Server Error', '服务端内部错误，通常是代码异常'],
        [501, 'Not Implemented', '服务端不支持该功能'],
        [502, 'Bad Gateway', '网关收到上游服务的无效响应'],
        [503, 'Service Unavailable', '服务暂时不可用（过载或维护）'],
        [504, 'Gateway Timeout', '网关等待上游服务超时'],
        [505, 'HTTP Version Not Supported', '不支持的 HTTP 版本'],
      ];
      body.innerHTML = `
        <div class="card">
          <input type="text" id="hc-q" placeholder="搜索状态码、英文名或中文说明…（如 404 / redirect / 重定向）" spellcheck="false">
        </div>
        <div class="card">
          <table class="tb">
            <thead><tr><th style="width:80px">状态码</th><th style="width:200px">名称</th><th>含义</th></tr></thead>
            <tbody id="hc-list"></tbody>
          </table>
        </div>`;

      function render() {
        const q = body.querySelector('#hc-q').value.trim().toLowerCase();
        const rows = CODES.filter(c =>
          !q || String(c[0]).includes(q) || c[1].toLowerCase().includes(q) || c[2].includes(body.querySelector('#hc-q').value.trim()));
        const cls = c => 'b' + String(c[0])[0];
        body.querySelector('#hc-list').innerHTML = rows.map(c =>
          `<tr><td><span class="badge ${cls(c)}">${c[0]}</span></td><td style="font-family:var(--mono);font-size:12.5px">${c[1]}</td><td style="color:var(--muted)">${c[2]}</td></tr>`
        ).join('') || '<tr><td colspan="3" style="color:var(--faint)">没有匹配的状态码</td></tr>';
      }
      body.querySelector('#hc-q').addEventListener('input', TB.debounce(render, 120));
      render();
    }
  });
})();
