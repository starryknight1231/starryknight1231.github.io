/* ============ Raft Lab 应用框架 ============ */
(function () {
  'use strict';

  const RL = {
    esc(s) {
      return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
    toast(msg, ok) {
      const el = document.getElementById('toast');
      el.textContent = msg;
      el.className = 'toast show' + (ok ? ' ok' : '');
      clearTimeout(RL._toastTimer);
      RL._toastTimer = setTimeout(() => { el.className = 'toast'; }, 1800);
    },
    _cleanups: [],
    interval(fn, ms) {
      const id = setInterval(fn, ms);
      RL._cleanups.push(() => clearInterval(id));
      return id;
    },
    activeId: null,
  };

  const DEMOS = [];
  function registerDemo(d) { DEMOS.push(d); }

  function renderNav() {
    const nav = document.getElementById('nav');
    nav.innerHTML = `<div class="nav-group-title">交互演示</div>` + DEMOS.map(d => `
      <div class="nav-item ${d.id === RL.activeId ? 'active' : ''}" data-id="${d.id}">
        <span class="nav-ico">${d.icon}</span>
        <span class="nav-name">${RL.esc(d.name)}</span>
      </div>`).join('');
    nav.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => { location.hash = '#/' + item.dataset.id; });
    });
  }

  function showDemo(id) {
    const d = DEMOS.find(x => x.id === id) || DEMOS[0];
    if (!d) return;
    RL._cleanups.forEach(fn => { try { fn(); } catch (e) {} });
    RL._cleanups = [];
    RL.activeId = d.id;
    try { localStorage.setItem('raftlab:last', d.id); } catch (e) {}

    document.getElementById('tool-icon').innerHTML = d.icon;
    document.getElementById('tool-title').textContent = d.name;
    document.getElementById('tool-desc').textContent = d.desc;
    document.title = `${d.name} · Raft Lab`;

    const body = document.getElementById('tool-body');
    body.innerHTML = '';
    try { d.render(body); }
    catch (err) {
      body.innerHTML = `<div class="card"><pre class="out"><span class="err">演示渲染出错：${RL.esc(err.message)}</span></pre></div>`;
      console.error(err);
    }
    renderNav();
  }

  function route() {
    const m = location.hash.match(/^#\/([\w-]+)/);
    let id = m ? m[1] : null;
    if (!id) { try { id = localStorage.getItem('raftlab:last'); } catch (e) {} }
    showDemo(id || DEMOS[0].id);
  }

  document.addEventListener('DOMContentLoaded', function () {
    route();
    window.addEventListener('hashchange', route);
  });

  window.RL = RL;
  window.registerDemo = registerDemo;
})();
