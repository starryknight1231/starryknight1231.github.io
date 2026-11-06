/* ============ 文本类工具 ============ */
(function () {
  'use strict';
  const E = TB.esc;

  /* ---------- 文本处理与统计 ---------- */
  registerTool({
    id: 'texttool', cat: '文本', name: '文本处理',
    desc: '字数/字节统计，大小写转换、去重、排序、Trim 等一键处理',
    keywords: 'text count word 统计 字数 大小写 去重 排序 trim',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h10M4 18h7"/></svg>',
    render(body) {
      body.innerHTML = `
        <div class="card">
          <div class="card-title">输入文本</div>
          <textarea id="x-in" style="min-height:160px" placeholder="粘贴文本，实时统计…" spellcheck="false"></textarea>
        </div>
        <div class="card">
          <div class="card-title">统计</div>
          <div class="stat-grid" id="x-stats"></div>
        </div>
        <div class="card">
          <div class="card-title">一键处理（直接修改上方文本）</div>
          <div class="btn-row" id="x-acts">
            <button class="btn sm" data-op="upper">全部大写</button>
            <button class="btn sm" data-op="lower">全部小写</button>
            <button class="btn sm" data-op="cap">首字母大写</button>
            <button class="btn sm" data-op="trim">去除首尾空白</button>
            <button class="btn sm" data-op="noblank">去除空行</button>
            <button class="btn sm" data-op="dedup">去除重复行</button>
            <button class="btn sm" data-op="sort">行排序 A→Z</button>
            <button class="btn sm" data-op="rsort">行排序 Z→A</button>
            <button class="btn sm" data-op="reverse">反转文本</button>
            <button class="btn sm" data-op="clear">清空</button>
          </div>
        </div>`;

      const inp = body.querySelector('#x-in');
      const stats = body.querySelector('#x-stats');

      function render() {
        const v = inp.value;
        const bytes = new TextEncoder().encode(v).length;
        const words = v.trim() ? (v.trim().match(/[\p{Script=Han}]+|[a-zA-Z0-9_'\-]+/gu) || []).length : 0;
        const lines = v ? v.split('\n').length : 0;
        const chars = [...v].length;
        const paras = v.trim() ? v.trim().split(/\n\s*\n/).length : 0;
        const rows = [['字符', chars], ['单词', words], ['行数', lines], ['字节数', bytes], ['段落', paras]];
        stats.innerHTML = rows.map(r => `<div class="stat"><b>${r[1]}</b><span>${r[0]}</span></div>`).join('');
      }
      inp.addEventListener('input', render);
      render();

      body.querySelector('#x-acts').addEventListener('click', e => {
        const op = e.target.dataset.op;
        if (!op) return;
        const v = inp.value;
        const apply = nv => { inp.value = nv; inp.dispatchEvent(new Event('input')); TB.toast('已处理', true); };
        switch (op) {
          case 'upper': apply(v.toUpperCase()); break;
          case 'lower': apply(v.toLowerCase()); break;
          case 'cap': apply(v.replace(/(^|[^\p{L}\p{N}'])(\p{L})/gu, (m, p, c) => p + c.toUpperCase())); break;
          case 'trim': apply(v.split('\n').map(l => l.trim()).join('\n')); break;
          case 'noblank': apply(v.split('\n').filter(l => l.trim()).join('\n')); break;
          case 'dedup': apply([...new Set(v.split('\n'))].join('\n')); break;
          case 'sort': apply(v.split('\n').sort((a, b) => a.localeCompare(b, 'zh')).join('\n')); break;
          case 'rsort': apply(v.split('\n').sort((a, b) => b.localeCompare(a, 'zh')).join('\n')); break;
          case 'reverse': apply([...v].reverse().join('')); break;
          case 'clear': inp.value = ''; inp.dispatchEvent(new Event('input')); break;
        }
      });
    }
  });

  /* ---------- Markdown 预览 ---------- */
  registerTool({
    id: 'markdown', cat: '文本', name: 'Markdown 预览',
    desc: '本地渲染 Markdown，支持标题、列表、表格、代码块、引用等',
    keywords: 'markdown md preview 渲染 预览 文档',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15V9l2.5 3L12 9v6"/><path d="M16.5 9v4M14.5 11l2 2 2-2"/></svg>',
    render(body) {
      body.innerHTML = `
        <div class="card">
          <div class="card-title">Markdown 源文 <button class="btn sm" id="md-sample">填入示例</button></div>
          <textarea id="md-in" style="min-height:220px" spellcheck="false"></textarea>
        </div>
        <div class="card">
          <div class="card-title">预览</div>
          <div class="md-view" id="md-view"></div>
        </div>`;

      const inp = body.querySelector('#md-in');
      const view = body.querySelector('#md-view');

      /* --- 迷你 Markdown 渲染器（先转义再解析，天然防 XSS）--- */
      function inline(s) {
        const codes = [];
        s = s.replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
        s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1">');
        s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
        s = s.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
        s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
        s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
        s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => '<code>' + codes[Number(i)] + '</code>');
        return s;
      }

      function render(src) {
        const lines = E(src).split('\n');
        let html = '', i = 0;
        const flushP = buf => { if (buf.length) html += '<p>' + inline(buf.join('\n')).replace(/\n/g, '<br>') + '</p>'; };

        while (i < lines.length) {
          const line = lines[i];

          // 代码围栏
          const fence = line.match(/^```\s*(\S*)\s*$/);
          if (fence) {
            const buf = [];
            i++;
            while (i < lines.length && !/^```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
            i++;
            html += `<pre><code class="lang">${buf.join('\n')}</code></pre>`;
            continue;
          }
          // 标题
          const h = line.match(/^(#{1,6})\s+(.+)$/);
          if (h) { html += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`; i++; continue; }
          // 分割线
          if (/^\s*([-*_]\s*){3,}$/.test(line)) { html += '<hr>'; i++; continue; }
          // 引用（源文先转义，故 > 已变为 &gt;）
          if (/^(?:>|&gt;)\s?/.test(line)) {
            const buf = [];
            while (i < lines.length && /^(?:>|&gt;)\s?/.test(lines[i])) { buf.push(lines[i].replace(/^(?:>|&gt;)\s?/, '')); i++; }
            html += `<blockquote>${inline(buf.join('\n')).replace(/\n/g, '<br>')}</blockquote>`;
            continue;
          }
          // 表格
          if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1]) && lines[i + 1].includes('-')) {
            const split = r => r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());
            const head = split(line);
            const aligns = split(lines[i + 1]).map(c => c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : 'left');
            i += 2;
            let rowsHtml = '';
            while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
              rowsHtml += '<tr>' + split(lines[i]).map((c, ci) => `<td style="text-align:${aligns[ci] || 'left'}">${inline(c)}</td>`).join('') + '</tr>';
              i++;
            }
            html += `<table><thead><tr>${head.map((c, ci) => `<th style="text-align:${aligns[ci] || 'left'}">${inline(c)}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
            continue;
          }
          // 列表（支持嵌套缩进）
          const li = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
          if (li) {
            html += buildList(lines, i);
            i = lastListEnd;
            continue;
          }
          // 空行
          if (!line.trim()) { flushP(pbuf); pbuf = []; i++; continue; }
          // 普通段落
          pbuf.push(line);
          i++;
        }
        flushP(pbuf);
        return html;
      }
      let pbuf = [], lastListEnd = 0;

      function buildList(lines, start) {
        function collect(indent) {
          const items = [];
          let j = start;
          while (j < lines.length) {
            const m = lines[j].match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
            if (!m || m[1].length < indent) break;
            if (m[1].length > indent && items.length) {
              // 子列表
              const sub = buildList(lines, j);
              items[items.length - 1].sub += sub;
              j = lastListEnd;
              continue;
            }
            if (m[1].length > indent) break;
            items.push({ text: m[3], sub: '', ordered: /\d/.test(m[2]) });
            j++;
          }
          lastListEnd = j;
          return items;
        }
        const top = collect(lines[start].match(/^(\s*)/)[1].length);
        const type = top[0] && top[0].ordered ? 'ol' : 'ul';
        return `<${type}>` + top.map(it =>
          `<li>${inline(it.text)}${it.sub}</li>`).join('') + `</${type}>`;
      }

      const SAMPLE = `# DevBox 示例文档

这是一个 **Markdown 预览** 演示，支持 *斜体*、~~删除线~~、[链接](https://example.com) 和 \`行内代码\`。

## 列表

- 无序列表项
  - 嵌套子项
  - 另一个子项
- 编号也行

1. 第一件事
2. 第二件事

## 表格

| 工具 | 用途 | 推荐 |
|:-----|:----:|-----:|
| JSON | 格式化 | ★★★ |
| 正则 | 测试 | ★★★★ |

## 代码块

\`\`\`js
const box = { name: 'DevBox', local: true };
console.log(\`Hello \${box.name}\`);
\`\`\`

> 引用：预览支持标题、列表、表格、代码块与行内代码。

---

就这样，试试修改左侧文本吧。`;

      inp.addEventListener('input', TB.debounce(() => {
        view.innerHTML = render(inp.value);
      }, 150));
      body.querySelector('#md-sample').onclick = () => {
        inp.value = SAMPLE;
        inp.dispatchEvent(new Event('input'));
      };
      inp.value = SAMPLE;
      view.innerHTML = render(SAMPLE);
    }
  });

  /* ---------- 中文占位文 ---------- */
  registerTool({
    id: 'lorem', cat: '文本', name: '中文占位文生成',
    desc: '生成中文排版测试用的假文段落，模拟真实语感',
    keywords: 'lorem ipsum 假文 占位 排版 测试 dummy text',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16"/><path d="M6 16c0-6 1-10 6-10s6 4 6 10"/><path d="M9 12h6"/></svg>',
    render(body) {
      body.innerHTML = `
        <div class="card">
          <div class="row">
            <div>
              <label class="fld">段落数</label>
              <input type="number" id="l-count" min="1" max="20" value="3">
            </div>
            <div>
              <label class="fld">每段句数</label>
              <input type="number" id="l-sent" min="1" max="20" value="4">
            </div>
            <div class="fix" style="align-self:flex-end">
              <button class="btn primary" id="l-go">重新生成</button>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">输出</div>
          ${TB.outBlock('l-out', '点击「重新生成」')}
        </div>`;

      const ADJ = ['清晨', '安静的', '辽阔的', '细碎的', '温柔', '明亮', '旧旧的', '缓慢', '透明', '温热'];
      const NOUN = ['图书馆', '海岸线', '路口', '笔记本', '电线杆', '便利店', '屋顶', '火车', '公园长椅', '旧照片'];
      const NOUN2 = ['风声', '城市', '季节', '光线', '故事', '记忆', '时间', '汽笛', '人群', '远方'];
      const VERB = ['掠过', '路过', '写下', '收藏', '数着', '追赶', '守着', '翻阅', '梦见', '打捞'];
      const TAIL = ['像一场没有结尾的电影。', '安静得几乎可以听见回声。', '一切仿佛才刚刚开始。', '于是我们继续往前走。', '那些细小的部分悄悄发亮。', '直到天色慢慢暗下来。', '留下一点微不足道的痕迹。', '所有的答案都变得不重要了。'];

      const pick = a => a[Math.floor(Math.random() * a.length)];
      function sentence() {
        const tpl = [
          `${pick(NOUN)}的${pick(NOUN2)}${pick(VERB)}了${pick(ADJ)}${pick(NOUN)}，`,
          `我们在${pick(ADJ)}${pick(NOUN)}旁${pick(VERB)}${pick(NOUN2)}，`,
          `${pick(NOUN2)}沿着${pick(ADJ)}${pick(NOUN)}缓缓展开，`,
        ];
        return pick(tpl) + pick(TAIL);
      }
      function para(n) {
        const out = [];
        for (let i = 0; i < n; i++) out.push(sentence());
        return '　　' + out.join('');
      }

      body.querySelector('#l-go').onclick = () => {
        const n = Math.min(20, Math.max(1, Number(body.querySelector('#l-count').value) || 3));
        const s = Math.min(20, Math.max(1, Number(body.querySelector('#l-sent').value) || 4));
        const ps = [];
        for (let i = 0; i < n; i++) ps.push(para(s));
        body.querySelector('#l-out').textContent = ps.join('\n\n');
      };
      body.querySelector('#l-go').click();
    }
  });
})();
