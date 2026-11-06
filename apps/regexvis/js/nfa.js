/* ============ RegexVis · Thompson NFA 构建 / 渲染 / 模拟 ============ */
(function () {
  'use strict';
  const RV = window.RV;
  const isWord = c => /[A-Za-z0-9_]/.test(c);

  /* ---------- Thompson 构建 ----------
     状态坐标 x 取「源码偏移 + 展开偏移」，保证前向边单调向右，
     循环回边自然向左弯曲。                                  */
  RV.buildNFA = function (ast) {
    const states = [], edges = [];
    let xoff = 0;

    function S(x) { const s = { id: states.length, x: x + xoff }; states.push(s); return s; }
    function E(from, to, m) { edges.push({ from: from.id, to: to.id, m: m || { k: 'eps' } }); }

    function frag(node) {
      switch (node.t) {
        case 'char': case 'esc': case 'dot': case 'cls': {
          const s = S(node.start), e = S(node.end);
          const m = node.t === 'char' ? { k: 'char', c: node.c }
            : node.t === 'esc' ? { k: 'esc', k2: node.k }
              : node.t === 'dot' ? { k: 'any' }
                : { k: 'cls', neg: node.neg, items: node.items };
          E(s, e, m);
          return { s, e };
        }
        case 'empty': {
          const s = S(node.start), e = S(node.end);
          E(s, e);
          return { s, e };
        }
        case 'anchor': {
          const s = S(node.start), e = S(node.end);
          E(s, e, { k: 'anchor', a: node.k });
          return { s, e };
        }
        case 'backref':
          throw new Error('演示器暂不支持反向引用 \\1，请从正则中去掉它');
        case 'cat': {
          let f = null;
          for (const p of node.parts) {
            const g = frag(p);
            if (f) E(f.e, g.s);
            else f = { s: g.s, e: g.e };
            f.e = g.e;
          }
          return f;
        }
        case 'alt': {
          const S0 = S(node.start), E0 = S(node.end);
          for (const p of node.parts) {
            const g = frag(p);
            E(S0, g.s); E(g.e, E0);
          }
          return { s: S0, e: E0 };
        }
        case 'group': {
          if (node.kind === 'look' || node.kind === 'nlook') {
            const S0 = S(node.start), E0 = S(node.end);
            const sub = RV.buildNFA(node.child);
            E(S0, E0, { k: 'assert', sub, neg: node.kind === 'nlook' });
            return { s: S0, e: E0 };
          }
          return frag(node.child);
        }
        case 'rep': {
          const span = Math.max(6, node.end - node.start + 2);
          const { min, max } = node;
          // 太大的展开直接拒绝
          const copies = (min === Infinity ? 0 : min) + (max === Infinity ? 1 : Math.max(0, max - min));
          if (copies > 16) throw new Error(`重复 {${min},${max === Infinity ? '' : max}} 需展开 ${copies} 份，超出演示上限 16，请简化`);
          const S0 = S(node.start);
          let cur = S0;
          for (let k = 0; k < min; k++) {
            const g = frag(node.child);
            E(cur, g.s); cur = g.e;
            if (k < min - 1) xoff += span;
          }
          if (max === Infinity) {
            const g = frag(node.child);
            E(cur, g.s); E(g.e, g.s); // 循环
            const E0 = S(node.end);
            E(cur, E0); E(g.e, E0);
            if (min === 0) E(S0, E0); // 跳过整段重复（min=0 才允许，否则 a+ 会误接受空串）
            cur = E0;
          } else {
            for (let k = 0; k < max - min; k++) {
              xoff += span;
              const g = frag(node.child);
              const skip = S(node.end - 1);
              E(cur, g.s); E(cur, skip); E(g.e, skip); cur = skip;
            }
          }
          return { s: S0, e: cur };
        }
        default:
          throw new Error('未知的节点类型 ' + node.t);
      }
    }

    const f = frag(ast);
    if (states.length > 400) throw new Error(`状态数 ${states.length} 超过演示上限 400，请简化正则`);
    return { states, edges, start: f.s.id, accept: f.e.id };
  };

  /* ---------- 匹配器 ---------- */
  function matchCls(m, ch, ci) {
    const c = ci ? ch.toLowerCase() : ch;
    for (const it of m.items) {
      if (it.t === 'range') {
        const lo = ci ? it.lo.toLowerCase() : it.lo, hi = ci ? it.hi.toLowerCase() : it.hi;
        if (c >= lo && c <= hi) return !m.neg;
      } else if (it.t === 'esc') {
        const ok = (it.k === 'd' && /\d/.test(ch)) || (it.k === 'w' && isWord(ch)) || (it.k === 's' && /\s/.test(ch))
          || (it.k === 'D' && !/\d/.test(ch)) || (it.k === 'W' && !isWord(ch)) || (it.k === 'S' && !/\s/.test(ch));
        if (ok) return !m.neg;
      } else {
        const cc = ci ? it.c.toLowerCase() : it.c;
        if (c === cc) return !m.neg;
      }
    }
    return !!m.neg;
  }
  function matchM(m, ch, ci) {
    switch (m.k) {
      case 'any': return ch !== '\n';
      case 'char': return ci ? ch.toLowerCase() === m.c.toLowerCase() : ch === m.c;
      case 'esc':
        return ({
          d: c => /\d/.test(c), w: isWord, s: c => /\s/.test(c),
          D: c => !/\d/.test(c), W: c => !isWord(c), S: c => !/\s/.test(c),
        })[m.k2](ch);
      case 'cls': return matchCls(m, ch, ci);
      default: return false;
    }
  }
  RV.matchM = matchM;

  /* ---------- ε-闭包（含锚点与前瞻断言） ---------- */
  function closure(nfa, set, pos, input, ci, memo) {
    const stack = [...set];
    const inSet = new Set(set);
    while (stack.length) {
      const id = stack.pop();
      for (const e of nfa.edges) {
        if (e.from !== id || e.m.k !== 'eps' && e.m.k !== 'anchor' && e.m.k !== 'assert') continue;
        if (e.m.k === 'anchor') {
          const a = e.m.a;
          let ok;
          if (a === '^') ok = pos === 0;
          else if (a === '$') ok = pos === input.length;
          else if (a === 'b') ok = (pos === 0 || !isWord(input[pos - 1])) !== (pos === input.length || !isWord(input[pos]));
          else ok = !((pos === 0 || !isWord(input[pos - 1])) !== (pos === input.length || !isWord(input[pos])));
          if (!ok) continue;
        }
        if (e.m.k === 'assert') {
          const key = e.to + ':' + pos;
          if (memo.has(key)) { if (!memo.get(key)) continue; }
          else {
            const ok = subMatch(e.m.sub, input, pos, ci) !== e.m.neg;
            memo.set(key, ok);
            if (!ok) continue;
          }
        }
        if (!inSet.has(e.to)) { inSet.add(e.to); stack.push(e.to); }
      }
    }
    return inSet;
  }

  function subMatch(sub, input, pos, ci) {
    // 子 NFA 能否从 input[pos..] 的开头匹配出一段前缀
    const memo = new Map();
    let cur = closure(sub, new Set([sub.start]), pos, input, ci, memo);
    if (cur.has(sub.accept)) return true;
    for (let p = pos; p < input.length; p++) {
      const next = new Set();
      for (const id of cur) for (const e of sub.edges) {
        if (e.from === id && e.m.k !== 'eps' && e.m.k !== 'anchor' && e.m.k !== 'assert'
          && matchM(e.m, input[p], ci)) next.add(e.to);
      }
      if (!next.size) return false;
      cur = closure(sub, next, p + 1, input, ci, memo);
      if (cur.has(sub.accept)) return true;
    }
    return false;
  }

  /* ---------- 逐字符模拟 ---------- */
  RV.simulate = function (nfa, input, flags) {
    const ci = !!flags.i;
    const memo = new Map();
    const steps = [];
    let cur = closure(nfa, new Set([nfa.start]), 0, input, ci, memo);
    steps.push({ pos: 0, closure: [...cur], used: [], note: '初始 ε-闭包' });
    for (let p = 0; p < input.length; p++) {
      const next = new Set(), used = [];
      for (const id of cur) for (let ei = 0; ei < nfa.edges.length; ei++) {
        const e = nfa.edges[ei];
        if (e.from === id && e.m.k !== 'eps' && e.m.k !== 'anchor' && e.m.k !== 'assert'
          && matchM(e.m, input[p], ci)) { next.add(e.to); used.push(ei); }
      }
      if (!next.size) {
        steps.push({ pos: p + 1, closure: [], used: [], note: `「${input[p]}」无路可走` });
        return { steps, accepted: false };
      }
      cur = closure(nfa, next, p + 1, input, ci, memo);
      steps.push({ pos: p + 1, closure: [...cur], used, note: `吃掉「${input[p]}」` });
      if (!cur.size) { steps[steps.length - 1].note += '，闭包为空'; return { steps, accepted: false }; }
    }
    const accepted = cur.has(nfa.accept);
    return { steps, accepted };
  };

  /* ---------- 布局 + 渲染 ---------- */
  RV.layoutNFA = function (nfa) {
    // x 聚类成列
    const xs = [...new Set(nfa.states.map(s => s.x))].sort((a, b) => a - b);
    const cols = [];
    for (const x of xs) {
      if (cols.length && x - cols[cols.length - 1][cols[cols.length - 1].length - 1] <= 1) cols[cols.length - 1].push(x);
      else cols.push([x]);
    }
    const colOf = new Map();
    cols.forEach((group, ci) => group.forEach(x => colOf.set(x, ci)));
    const byCol = new Map();
    nfa.states.forEach(s => {
      const ci = colOf.get(s.x);
      s.col = ci;
      if (!byCol.has(ci)) byCol.set(ci, []);
      byCol.get(ci).push(s);
    });
    const maxRow = Math.max(...[...byCol.values()].map(a => a.length));
    const H = Math.max(320, maxRow * 58 + 70);
    const W = 1000; // 逻辑宽度，绘制时按容器缩放
    const W0 = 46, W1 = W - 46;
    byCol.forEach((arr, ci) => {
      const x = cols.length === 1 ? W / 2 : W0 + (W1 - W0) * ci / (cols.length - 1);
      arr.sort((a, b) => a.id - b.id).forEach((s, i) => {
        s.px = x;
        s.py = H / 2 + (i - (arr.length - 1) / 2) * 54;
      });
    });
    return { W, H };
  };

  const M_LABEL = m => {
    switch (m.k) {
      case 'eps': return 'ε';
      case 'any': return '.';
      case 'char': return m.c === '\n' ? '\\n' : m.c === '\t' ? '\\t' : m.c === ' ' ? '␣' : m.c;
      case 'esc': return '\\' + m.k2;
      case 'cls': return (m.neg ? '[^…]' : '[…]');
      case 'anchor': return m.a === '^' ? '^' : m.a === '$' ? '$' : m.a;
      case 'assert': return m.neg ? '(?!…)' : '(?=…)';
      default: return '?';
    }
  };
  RV.M_LABEL = M_LABEL;

  RV.drawNFA = function (ctx, nfa, W, H, view) {
    const { active = new Set(), used = [], highlight = true } = view || {};
    ctx.clearRect(0, 0, W, H);
    const usedSet = new Set(used);

    // 边
    nfa.edges.forEach((e, ei) => {
      const a = nfa.states[e.from], b = nfa.states[e.to];
      const back = b.px < a.px - 1;
      const same = Math.abs(b.px - a.px) < 1;
      let mx, my;
      ctx.beginPath();
      if (back) {
        const k = 70 + (ei % 4) * 26;
        mx = (a.px + b.px) / 2;
        my = Math.min(a.py, b.py) - k * (ei % 2 ? 1 : 1.4);
        ctx.moveTo(a.px, a.py);
        ctx.quadraticCurveTo(mx, my, b.px, b.py - 12);
      } else if (same) {
        const k = 46 + (ei % 3) * 22;
        mx = a.px + k;
        my = (a.py + b.py) / 2;
        ctx.moveTo(a.px, a.py);
        ctx.quadraticCurveTo(mx, my, b.px, b.py);
      } else {
        ctx.moveTo(a.px, a.py);
        ctx.quadraticCurveTo((a.px + b.px) / 2, (a.py + b.py) / 2 + (ei % 2 ? 8 : -8), b.px, b.py);
      }
      const hot = usedSet.has(ei) && highlight;
      const eps = e.m.k === 'eps';
      ctx.strokeStyle = hot ? '#4e6478' : eps ? 'rgba(31,28,25,0.22)' : 'rgba(31,28,25,0.45)';
      ctx.lineWidth = hot ? 2.6 : 1.3;
      ctx.setLineDash(eps ? [4, 4] : []);
      ctx.stroke();
      ctx.setLineDash([]);
      // 箭头
      const ang = Math.atan2(b.py - my, b.px - mx);
      ctx.save();
      ctx.translate(b.px, b.py);
      ctx.rotate(ang);
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(-9, -4); ctx.lineTo(-9, 4); ctx.closePath();
      ctx.fillStyle = hot ? '#4e6478' : 'rgba(31,28,25,0.45)';
      ctx.fill();
      ctx.restore();
      // 标签
      const lx = back ? mx : (a.px + b.px) / 2;
      const ly = back ? my + 2 : (a.py + b.py) / 2 + (ei % 2 ? 16 : -10);
      ctx.font = '11px ' + getComputedStyle(document.body).getPropertyValue('--mono');
      ctx.fillStyle = hot ? '#3c4f60' : e.m.k === 'assert' ? '#6f5a68' : eps ? 'rgba(31,28,25,0.38)' : '#5f5850';
      ctx.fillText(M_LABEL(e.m), lx - ctx.measureText(M_LABEL(e.m)).width / 2, ly);
    });

    // 状态
    nfa.states.forEach(s => {
      const act = active.has(s.id);
      ctx.beginPath();
      ctx.arc(s.px, s.py, 12, 0, Math.PI * 2);
      ctx.fillStyle = act ? '#4e6478' : '#faf8f3';
      ctx.fill();
      ctx.lineWidth = act ? 2.4 : 1.4;
      ctx.strokeStyle = act ? '#3c4f60' : 'rgba(31,28,25,0.45)';
      ctx.stroke();
      if (s.id === nfa.accept) {
        ctx.beginPath();
        ctx.arc(s.px, s.py, 16.5, 0, Math.PI * 2);
        ctx.strokeStyle = act ? '#3c4f60' : '#4f7038';
        ctx.stroke();
      }
      ctx.fillStyle = act ? '#faf8f3' : '#5f5850';
      ctx.font = '10.5px ' + getComputedStyle(document.body).getPropertyValue('--mono');
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(s.id, s.px, s.py + 0.5);
      ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
      if (s.id === nfa.start) {
        ctx.fillStyle = '#4f7038';
        ctx.font = '600 11px ' + getComputedStyle(document.body).getPropertyValue('--mono');
        ctx.fillText('start', s.px - 14, s.py - 18);
      }
    });
  };
})();
