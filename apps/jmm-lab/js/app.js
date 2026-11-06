/* ============ JMM Lab 应用框架 ============ */
(function () {
  'use strict';

  const JL = {
    esc(s) {
      return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
    toast(msg, ok) {
      const el = document.getElementById('toast');
      el.textContent = msg;
      el.className = 'toast show' + (ok ? ' ok' : '');
      clearTimeout(JL._toastTimer);
      JL._toastTimer = setTimeout(() => { el.className = 'toast'; }, 1800);
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
      JL.toast('已复制到剪贴板', true);
    },
    debounce(fn, ms) {
      let t;
      return function (...args) {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), ms);
      };
    },
    _cleanups: [],
    interval(fn, ms) {
      const id = setInterval(fn, ms);
      JL._cleanups.push(() => clearInterval(id));
      return id;
    },
    raf(fn) {
      let alive = true;
      function loop(t) { if (!alive) return; fn(t); requestAnimationFrame(loop); }
      requestAnimationFrame(loop);
      JL._cleanups.push(() => { alive = false; });
    },
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
    activeId: null,
  };

  const DEMOS = [];
  function registerDemo(d) { DEMOS.push(d); }

  function renderNav() {
    const nav = document.getElementById('nav');
    nav.innerHTML = `<div class="nav-group-title">交互演示</div>` + DEMOS.map(d => `
      <div class="nav-item ${d.id === JL.activeId ? 'active' : ''}" data-id="${d.id}">
        <span class="nav-ico">${d.icon}</span>
        <span class="nav-name">${JL.esc(d.name)}</span>
      </div>`).join('');
    nav.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => { location.hash = '#/' + item.dataset.id; });
    });
  }

  function showDemo(id) {
    const d = DEMOS.find(x => x.id === id) || DEMOS[0];
    if (!d) return;
    JL._cleanups.forEach(fn => { try { fn(); } catch {} });
    JL._cleanups = [];
    JL.activeId = d.id;
    try { localStorage.setItem('jmmlab:last', d.id); } catch {}

    document.getElementById('tool-icon').innerHTML = d.icon;
    document.getElementById('tool-title').textContent = d.name;
    document.getElementById('tool-desc').textContent = d.desc;
    document.title = `${d.name} · JMM Lab`;

    const body = document.getElementById('tool-body');
    body.innerHTML = '';
    try { d.render(body); }
    catch (err) {
      body.innerHTML = `<div class="card"><pre class="out"><span class="err">演示渲染出错：${JL.esc(err.message)}</span></pre></div>`;
      console.error(err);
    }
    renderNav();
  }

  function route() {
    const m = location.hash.match(/^#\/([\w-]+)/);
    showDemo(m ? m[1] : (localStorage.getItem('jmmlab:last') || DEMOS[0].id));
  }

  function init() {
    const m = location.hostname.match(/^([\w-]+)\.github\.io$/);
    if (m) document.getElementById('gh-link').href = `https://github.com/${m[1]}/${m[1]}.github.io`;
    else document.getElementById('gh-link').parentElement.innerHTML = '本地预览模式';
    route();
    window.addEventListener('hashchange', route);
  }

  window.JL = JL;
  window.registerDemo = registerDemo;
  document.addEventListener('DOMContentLoaded', init);
})();
