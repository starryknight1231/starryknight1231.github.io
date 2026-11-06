/* ============ System Lab 应用框架 ============ */
(function () {
  'use strict';

  const SL = {
    esc(s) {
      return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },

    toast(msg, ok) {
      const el = document.getElementById('toast');
      el.textContent = msg;
      el.className = 'toast show' + (ok ? ' ok' : '');
      clearTimeout(SL._toastTimer);
      SL._toastTimer = setTimeout(() => { el.className = 'toast'; }, 1800);
    },

    async copy(text) {
      if (!text) return;
      try { await navigator.clipboard.writeText(text); }
      catch {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      SL.toast('已复制到剪贴板', true);
    },

    debounce(fn, ms) {
      let t;
      return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), ms);
      };
    },

    /** 当前演示的 RAF / 定时器清理队列 */
    _cleanups: [],
    interval(fn, ms) {
      const id = setInterval(fn, ms);
      SL._cleanups.push(() => clearInterval(id));
      return id;
    },
    raf(fn) {
      // 持续 requestAnimationFrame 循环，返回停止句柄并自动纳入清理
      let alive = true;
      function loop(t) {
        if (!alive) return;
        fn(t);
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);
      SL._cleanups.push(() => { alive = false; });
    },

    /** FNV-1a 32 位字符串哈希 + murmur3 finalizer（确定性、跨端一致）。
     *  纯 FNV-1a 雪崩性弱：仅末字符不同的短串会线性传播差异，
     *  导致哈希环节点聚集，故追加 murmur3 雪崩处理。 */
    fnv1a(str) {
      let h = 0x811c9dc5;
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
      h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
      h ^= h >>> 16;
      return h >>> 0;
    },

    /** 高分辨率画布：按容器尺寸与 devicePixelRatio 设置，返回 2d ctx（已 scale） */
    fitCanvas(canvas, height) {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.parentElement.clientWidth || canvas.clientWidth || 600;
      const h = height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.height = h + 'px';
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { ctx, w, h };
    },

    /** 演示用调色板（节点着色） */
    PALETTE: ['#4f8ef7', '#2dd4bf', '#fbbf24', '#f87171', '#a78bfa', '#f472b6', '#34d399', '#60a5fa'],

    activeId: null,
  };

  const DEMOS = [];
  function registerDemo(d) { DEMOS.push(d); }

  function renderNav() {
    const nav = document.getElementById('nav');
    nav.innerHTML = `<div class="nav-group-title">交互演示</div>` + DEMOS.map(d => `
      <div class="nav-item ${d.id === SL.activeId ? 'active' : ''}" data-id="${d.id}">
        <span class="nav-ico">${d.icon}</span>
        <span class="nav-name">${SL.esc(d.name)}</span>
      </div>`).join('');
    nav.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => { location.hash = '#/' + item.dataset.id; });
    });
  }

  function showDemo(id) {
    const d = DEMOS.find(x => x.id === id) || DEMOS[0];
    if (!d) return;
    SL._cleanups.forEach(fn => { try { fn(); } catch {} });
    SL._cleanups = [];
    SL.activeId = d.id;
    try { localStorage.setItem('slab:last', d.id); } catch {}

    document.getElementById('tool-icon').innerHTML = d.icon;
    document.getElementById('tool-title').textContent = d.name;
    document.getElementById('tool-desc').textContent = d.desc;
    document.title = `${d.name} · System Lab`;

    const body = document.getElementById('tool-body');
    body.innerHTML = '';
    try { d.render(body); }
    catch (err) {
      body.innerHTML = `<div class="card"><pre class="out"><span class="err">演示渲染出错：${SL.esc(err.message)}</span></pre></div>`;
      console.error(err);
    }
    renderNav();
  }

  function route() {
    const m = location.hash.match(/^#\/([\w-]+)/);
    showDemo(m ? m[1] : (localStorage.getItem('slab:last') || DEMOS[0].id));
  }

  function init() {
    // GitHub 源码链接（部署到 github.io 后自动指向本仓库）
    const m = location.hostname.match(/^(.+)\.github\.io$/);
    if (m) document.getElementById('gh-link').href = `https://github.com/${m[1]}/${m[1]}.github.io`;
    else if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      document.getElementById('gh-link').parentElement.innerHTML = '本地预览模式';
    }
    route();
    window.addEventListener('hashchange', route);
  }

  window.SL = SL;
  window.registerDemo = registerDemo;
  document.addEventListener('DOMContentLoaded', init);
})();
