/* ============ RegexVis 页面逻辑 ============ */
(function () {
  'use strict';

  const EXAMPLES = {
    email: { re: '[\\w.+-]+@[\\w-]+\\.[\\w.]{2,}', input: 'dev.team-7@example.com.cn' },
    phone: { re: '1[3-9]\\d{9}', input: '她的手机号是 13812345678' },
    ipv4: { re: '(\\d{1,3}\\.){3}\\d{1,3}', input: '服务地址 192.168.10.104 端口 8080' },
    date: { re: '\\d{4}-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\\d|3[01])', input: '上线日期 2026-11-06，复习 2025-1-9' },
    url: { re: 'https?://[\\w.-]+(/\\w*)*', input: '文档在 https://example.com/docs/api 上' },
    pwd: { re: '(?=.*\\d)(?=.*[a-z])(?=.*[A-Z])\\w{8,}', input: 'Passw0rd_2026' },
    hex: { re: '#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})', input: '主题色 #4f8ef7 和 #fff' },
  };

  const $ = id => document.getElementById(id);
  const regexIn = $('rv-regex'), inputIn = $('rv-input'), status = $('rv-status');
  const segsEl = $('rv-segs'), cellsEl = $('rv-cells'), verdictEl = $('rv-verdict');
  const canvas = $('rv-canvas');

  let nfa = null, layout = null, sim = null, stepIdx = 0, timer = null;

  /* ---------- 构建流程 ---------- */
  function rebuild() {
    stopPlay();
    sim = null; stepIdx = 0;
    const src = regexIn.value;
    if (!src.trim()) {
      status.textContent = '输入一个正则试试，或从右上角选个示例';
      status.className = 'hint';
      segsEl.innerHTML = '<span class="hint">输入正则后，这里逐段给出中文解释</span>';
      nfa = null;
      const { ctx, w } = fit();
      RV.drawNFA(ctx, { states: [], edges: [], start: -1, accept: -1 }, 1000, layout ? layout.H : 320, {});
      renderCells();
      setVerdict('等待正则…', '');
      return;
    }
    try {
      const ast = RV.parse(src);
      nfa = RV.buildNFA(ast);
      layout = RV.layoutNFA(nfa);
      status.textContent = `解析成功：${nfa.states.length} 个状态 · ${nfa.edges.length} 条转移边`;
      status.className = 'hint ok';
      renderSegs(ast, src);
    } catch (e) {
      nfa = null;
      status.textContent = '✗ ' + (e instanceof RV.ParseError ? '语法错误：' : '') + e.message;
      status.className = 'hint err';
      segsEl.innerHTML = '<span class="hint">修正语法后重新解析</span>';
      const { ctx } = fit();
      RV.drawNFA(ctx, { states: [], edges: [], start: -1, accept: -1 }, 1000, layout ? layout.H : 320, {});
      renderCells();
      setVerdict('正则语法有误，无法模拟', 'err');
      return;
    }
    runSim();
    fitAndDraw();
  }

  function renderSegs(ast, src) {
    const segs = RV.segments(ast);
    segsEl.innerHTML = segs.map(s => {
      const code = src.slice(s.start, s.end) || '(空)';
      const detail = s.detail ? `<span class="detail">↳ ${s.detail.map(d => RV.desc.length ? d : d).join('；')}</span>` : '';
      return `<div class="seg-item"><span class="seg-src">${esc(code)}</span><span class="seg-desc">${esc(s.desc)}${detail}</span></div>`;
    }).join('');
  }

  /* ---------- 匹配模拟 ---------- */
  function runSim() {
    if (!nfa) return;
    const input = inputIn.value;
    try {
      sim = RV.simulate(nfa, input, { i: $('rv-ci').checked });
    } catch (e) {
      sim = null;
      setVerdict('✗ ' + e.message, 'err');
      return;
    }
    stepIdx = 0;
    renderCells();
    applyStep();
  }

  function renderCells() {
    const input = inputIn.value;
    cellsEl.innerHTML = [...input].map((c, i) => {
      const disp = c === ' ' ? '␣' : c;
      return `<div class="cell" data-i="${i}">${esc(disp)}<span class="idx">${i}</span></div>`;
    }).join('') || '<span class="hint" style="margin:0">测试字符串为空 —— 正则若可匹配空串，初始闭包里就会出现接受态</span>';
  }

  function applyStep() {
    if (!sim) return;
    const st = sim.steps[stepIdx];
    const cells = cellsEl.querySelectorAll('.cell');
    cells.forEach(c => { c.className = 'cell'; });
    for (let i = 0; i < st.pos && i < cells.length; i++) cells[i].classList.add('done');
    if (!sim.accepted && st.closure.length === 0 && cells[st.pos - 1]) cells[st.pos - 1].classList.add('fail');
    else if (st.pos < cells.length && stepIdx > 0) cells[st.pos].classList.add('cur');
    // 画图
    const { ctx } = fit();
    RV.drawNFA(ctx, nfa, 1000, layout.H, {
      active: new Set(st.closure), used: st.used,
      highlight: stepIdx > 0,
    });
    // 结论
    if (stepIdx >= sim.steps.length - 1) {
      if (sim.accepted) setVerdict(`✓ 匹配成功！在第 ${st.pos} 个字符后到达接受态 #${nfa.accept}（当前活跃状态 ${st.closure.length} 个）`, 'ok');
      else setVerdict(`✗ 匹配失败：${st.note}`, 'err');
    } else {
      setVerdict(`步骤 ${stepIdx}/${sim.steps.length - 1} · ${st.note} · 活跃状态 {${st.closure.join(', ') || '空'}}`, '');
    }
  }

  function setVerdict(text, cls) {
    verdictEl.textContent = text;
    verdictEl.className = 'verdict' + (cls ? ' ' + cls : '');
  }

  /* ---------- 播放控制 ---------- */
  function stopPlay() {
    if (timer) { clearInterval(timer); timer = null; }
    $('rv-play').textContent = '▶ 播放';
  }
  $('rv-play').addEventListener('click', () => {
    if (!sim) return;
    if (timer) { stopPlay(); return; }
    if (stepIdx >= sim.steps.length - 1) stepIdx = 0;
    $('rv-play').textContent = '⏸ 暂停';
    timer = setInterval(() => {
      if (stepIdx >= sim.steps.length - 1) { stopPlay(); return; }
      stepIdx++;
      applyStep();
    }, 850);
  });
  $('rv-step').addEventListener('click', () => {
    if (!sim) return;
    stopPlay();
    if (stepIdx < sim.steps.length - 1) { stepIdx++; applyStep(); }
  });
  $('rv-reset').addEventListener('click', () => { stopPlay(); stepIdx = 0; applyStep(); });

  /* ---------- 画布自适应 ---------- */
  function fit() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.parentElement.clientWidth || 900;
    const scale = w / 1000;
    const H = layout ? layout.H : 320;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(H * scale * dpr);
    canvas.style.height = (H * scale) + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    return { ctx, w };
  }
  function fitAndDraw() {
    const { ctx } = fit();
    const st = sim ? sim.steps[stepIdx] : { closure: [], used: [] };
    if (nfa) RV.drawNFA(ctx, nfa, 1000, layout.H, { active: new Set(st.closure), used: st.used, highlight: stepIdx > 0 });
    else RV.drawNFA(ctx, { states: [], edges: [], start: -1, accept: -1 }, 1000, layout ? layout.H : 320, {});
  }
  const onResize = debounce(fitAndDraw, 200);
  window.addEventListener('resize', onResize);

  /* ---------- 输入绑定 ---------- */
  regexIn.addEventListener('input', debounce(rebuild, 250));
  inputIn.addEventListener('input', debounce(runSim, 250));
  $('rv-ci').addEventListener('change', () => { rebuild(); });

  $('rv-example').addEventListener('change', e => {
    const ex = EXAMPLES[e.target.value];
    if (!ex) return;
    regexIn.value = ex.re;
    inputIn.value = ex.input;
    rebuild();
  });

  // 源码链接
  const m = location.hostname.match(/^([\w-]+)\.github\.io$/);
  if (m) $('gh-link').href = `https://github.com/${m[1]}/${m[1]}.github.io`;
  else $('gh-link').style.display = 'none';

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  // 初始示例
  regexIn.value = EXAMPLES.date.re;
  inputIn.value = EXAMPLES.date.input;
  rebuild();
})();
