/* ============ DevBox 应用框架 ============ */
(function () {
  'use strict';

  /* ---------- 公共工具函数 ---------- */
  const TB = {
    /** HTML 转义 */
    esc(s) {
      return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    /** 复制文本到剪贴板，带 Toast 反馈 */
    async copy(text, silent) {
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // file:// 等场景的降级方案
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      if (!silent) TB.toast('已复制到剪贴板', true);
    },

    /** Toast 提示 */
    toast(msg, ok) {
      const el = document.getElementById('toast');
      el.textContent = msg;
      el.className = 'toast show' + (ok ? ' ok' : '');
      clearTimeout(TB._toastTimer);
      TB._toastTimer = setTimeout(() => { el.className = 'toast'; }, 1800);
    },

    /** 防抖 */
    debounce(fn, ms) {
      let t;
      return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), ms);
      };
    },

    /** 为当前工具注册定时器，切换工具时自动清理 */
    interval(fn, ms) {
      const id = setInterval(fn, ms);
      TB._cleanups.push(() => clearInterval(id));
      return id;
    },

    /** 当前工具的清理函数队列 */
    _cleanups: [],
    _runCleanups() {
      TB._cleanups.forEach(fn => { try { fn(); } catch {} });
      TB._cleanups = [];
    },

    /** 给容器里所有 [data-copy] 按钮绑定复制：data-copy 为目标选择器或直接文本 */
    bindCopy(root) {
      root.querySelectorAll('[data-copy]').forEach(btn => {
        btn.addEventListener('click', () => {
          const sel = btn.getAttribute('data-copy');
          const target = sel ? root.querySelector(sel) : null;
          const text = target ? target.textContent : btn.getAttribute('data-copy-text');
          TB.copy(text);
        });
      });
    },

    /** 标准输出块 */
    outBlock(id, placeholder) {
      return `<div class="out-wrap">
        <pre class="out" id="${id}"><span class="dim">${TB.esc(placeholder || '结果将显示在这里')}</span></pre>
        <button class="copy-btn" data-copy="#${id}">复制</button>
      </div>`;
    },

    /** 当前激活工具 id */
    activeId: null,
  };

  /* ---------- 工具注册表 ---------- */
  const TOOLS = [];
  function registerTool(t) {
    TOOLS.push(t);
  }

  /* ---------- 侧栏渲染 ---------- */
  function renderNav(filter) {
    const nav = document.getElementById('nav');
    const f = (filter || '').trim().toLowerCase();
    const groups = [];
    TOOLS.forEach(t => {
      if (f) {
        const hay = (t.name + t.desc + t.id + (t.keywords || '')).toLowerCase();
        if (!hay.includes(f)) return;
      }
      let g = groups.find(x => x.cat === t.cat);
      if (!g) { g = { cat: t.cat, items: [] }; groups.push(g); }
      g.items.push(t);
    });

    if (!groups.length) {
      nav.innerHTML = `<div class="nav-empty">没有匹配「${TB.esc(filter)}」的工具</div>`;
      return;
    }
    nav.innerHTML = groups.map(g => `
      <div class="nav-group-title">${TB.esc(g.cat)}</div>
      ${g.items.map(t => `
        <div class="nav-item ${t.id === TB.activeId ? 'active' : ''}" data-id="${t.id}">
          <span class="nav-ico">${t.icon}</span>
          <span class="nav-name">${TB.esc(t.name)}</span>
        </div>`).join('')}
    `).join('');

    nav.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        location.hash = '#/' + item.dataset.id;
        if (window.innerWidth <= 820) {
          const sb = document.getElementById('sidebar');
          if (sb.style.display === 'none') sb.style.display = '';
        }
      });
    });
  }

  /* ---------- 工具渲染 ---------- */
  function showTool(id) {
    const t = TOOLS.find(x => x.id === id) || TOOLS[0];
    if (!t) return;
    TB._runCleanups();
    TB.activeId = t.id;
    try { localStorage.setItem('devbox:last', t.id); } catch {}

    document.getElementById('tool-icon').innerHTML = t.icon;
    document.getElementById('tool-title').textContent = t.name;
    document.getElementById('tool-desc').textContent = t.desc;
    document.title = `${t.name} · DevBox`;

    const body = document.getElementById('tool-body');
    body.innerHTML = '';
    try {
      t.render(body);
    } catch (err) {
      body.innerHTML = `<div class="card"><pre class="out"><span class="err">工具渲染出错：${TB.esc(err.message)}</span></pre></div>`;
      console.error(err);
    }
    TB.bindCopy(body);

    // 高亮侧栏
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.id === t.id);
    });
    // 滚动到侧栏可见位置
    const active = document.querySelector('.nav-item.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  /* ---------- 路由 ---------- */
  function route() {
    const m = location.hash.match(/^#\/([\w-]+)/);
    if (m) showTool(m[1]);
    else showTool(localStorage.getItem('devbox:last') || TOOLS[0].id);
  }

  /* ---------- 初始化 ---------- */
  function init() {
    // 恢复上次工具
    route();
    window.addEventListener('hashchange', route);

    // 搜索
    const search = document.getElementById('search');
    search.addEventListener('input', TB.debounce(() => renderNav(search.value), 120));
    search.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        // 回车跳到第一个结果
        const first = document.querySelector('.nav-item');
        if (first) { location.hash = '#/' + first.dataset.id; search.blur(); }
      }
      if (e.key === 'Escape') {
        search.value = '';
        renderNav('');
        search.blur();
      }
    });

    // 快捷键：/ 聚焦搜索
    document.addEventListener('keydown', e => {
      if (e.key !== '/' ) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
      e.preventDefault();
      search.focus();
      search.select();
    });

    renderNav('');
  }

  window.TB = TB;
  window.registerTool = registerTool;
  document.addEventListener('DOMContentLoaded', init);
})();
