/* ============ RegexVis · 正则解析器 ============
 * 递归下降解析 JS 风格正则 → AST，每个节点携带源码区间，
 * 并为每个顶层片段生成中文解释。
 */
(function () {
  'use strict';

  const RV = window.RV = {};

  /* ---------- 节点类型 ----------
     alt / cat / rep / group / cls / dot / char / esc / anchor / backref
     每个节点: { t, start, end, ... }                                  */

  class ParseError extends Error {}
  RV.ParseError = ParseError;

  function parse(src) {
    let i = 0;
    let groupIdx = 0;
    const n = src.length;

    function peek() { return src[i]; }
    function eat(c) { if (src[i] === c) { i++; return true; } return false; }
    function expect(c) {
      if (src[i] !== c) throw new ParseError(`期望「${c}」但遇到「${src[i] ?? '结尾'}」（位置 ${i}）`);
      i++;
    }

    function parseAlt() {
      const start = i;
      const parts = [parseCat()];
      while (eat('|')) parts.push(parseCat());
      if (parts.length === 1) return parts[0];
      return { t: 'alt', start, end: i, parts };
    }

    function parseCat() {
      const start = i;
      const parts = [];
      while (i < n && peek() !== '|' && peek() !== ')') {
        const a = parseRepeat();
        if (a) parts.push(a);
      }
      if (!parts.length) return { t: 'empty', start, end: i };
      if (parts.length === 1) return parts[0];
      return { t: 'cat', start, end: i, parts };
    }

    function parseRepeat() {
      const atom = parseAtom();
      if (!atom) return null;
      let node = atom;
      for (;;) {
        const qStart = i;
        let min = -1, max = -1;
        if (eat('*')) { min = 0; max = Infinity; }
        else if (eat('+')) { min = 1; max = Infinity; }
        else if (eat('?')) { min = 0; max = 1; }
        else if (peek() === '{') {
          const save = i;
          i++;
          const m = /^\s*(\d+)(\s*,\s*(\d*)\s*)?\}/.exec(src.slice(i));
          if (!m) { i = save; break; } // 普通字面量 { 不是量词
          min = Number(m[1]);
          max = m[2] === undefined ? min : (m[3] === '' ? Infinity : Number(m[3]));
          if (max < min) throw new ParseError(`重复区间 {${min},${max}} 无效（位置 ${i}）`);
          i += m[0].length;
        } else break;
        const lazy = eat('?'); // a? 懒惰模式（占有量词 a+ 不支持，报错即可）
        node = { t: 'rep', start: node.start, end: i, min, max, lazy, child: node, qStart };
        // 连续量词如 a** 直接报错
        if (peek() === '*' || peek() === '+' || peek() === '?') {
          throw new ParseError(`「${peek()}」前缺少可量词的内容（位置 ${i}）`);
        }
      }
      return node;
    }

    function parseAtom() {
      const start = i;
      const c = peek();
      if (c === undefined) return null;
      if (c === '(') {
        i++;
        let kind = 'cap', name = null;
        if (eat('?')) {
          if (eat(':')) kind = 'non';
          else if (eat('=')) kind = 'look';
          else if (eat('!')) kind = 'nlook';
          else if (eat('<')) {
            const m = /^([^>]+)>/.exec(src.slice(i));
            if (!m) throw new ParseError(`命名分组语法错误（位置 ${i}）`);
            name = m[1]; i += m[0].length; kind = 'cap';
          } else throw new ParseError(`不支持的 (?...) 语法（位置 ${i}）`);
        }
        if (kind === 'cap') groupIdx++;
        const child = parseAlt();
        expect(')');
        return { t: 'group', start, end: i, kind, name, idx: kind === 'cap' ? groupIdx : 0, child };
      }
      if (c === '[') return parseClass();
      if (c === '.') { i++; return { t: 'dot', start, end: i }; }
      if (c === '^') { i++; return { t: 'anchor', start, end: i, k: '^' }; }
      if (c === '$') { i++; return { t: 'anchor', start, end: i, k: '$' }; }
      if (c === '\\') return parseEsc(false);
      if (c === '*' || c === '+' || c === '?') throw new ParseError(`「${c}」前缺少可量词的内容（位置 ${i}）`);
      if (c === ')') return null; // 交给上层 expect
      if (c === '{') { // 不是合法量词就当字面量
        if (!/^\{\d+(\,\d*)?\}/.test(src.slice(i))) { i++; return { t: 'char', start, end: i, c }; }
        return null;
      }
      i++;
      return { t: 'char', start, end: i, c };
    }

    function parseEsc(inClass) {
      const start = i;
      i++; // 反斜杠
      const c = peek();
      if (c === undefined) throw new ParseError(`反斜杠后没有字符（位置 ${i}）`);
      i++;
      if ('dDwWsS'.includes(c)) return { t: 'esc', start, end: i, k: c };
      if (c === 'b') return inClass
        ? { t: 'char', start, end: i, c: '\b' }
        : { t: 'anchor', start, end: i, k: 'b' };
      if (c === 'B') return { t: 'anchor', start, end: i, k: 'B' };
      if (c === 'n') return { t: 'char', start, end: i, c: '\n' };
      if (c === 't') return { t: 'char', start, end: i, c: '\t' };
      if (c === 'r') return { t: 'char', start, end: i, c: '\r' };
      if (c === 'u') {
        const m = /^[0-9a-fA-F]{4}/.exec(src.slice(i));
        if (!m) throw new ParseError(`\\u 需要四位十六进制（位置 ${i}）`);
        const ch = String.fromCharCode(parseInt(m[0], 16));
        i += 4;
        return { t: 'char', start, end: i, c: ch };
      }
      if (c === 'x') {
        const m = /^[0-9a-fA-F]{2}/.exec(src.slice(i));
        if (!m) throw new ParseError(`\\x 需要两位十六进制（位置 ${i}）`);
        const ch = String.fromCharCode(parseInt(m[0], 16));
        i += 2;
        return { t: 'char', start, end: i, c: ch };
      }
      if (/[1-9]/.test(c)) return { t: 'backref', start, end: i, n: Number(c) };
      return { t: 'char', start, end: i, c }; // \. \\ \[ 等字面量
    }

    function parseClass() {
      const start = i;
      i++; // [
      const neg = eat('^');
      const items = [];
      let first = true;
      for (;;) {
        if (i >= n) throw new ParseError(`字符类 [ 未闭合（位置 ${start}）`);
        if (peek() === ']' && !first) { i++; break; }
        first = false;
        const itemStart = i;
        let lo;
        if (peek() === '\\') lo = parseEsc(true);
        else { lo = { t: 'char', start: itemStart, end: i + 1, c: peek() }; i++; }
        // 范围 a-z
        if (peek() === '-' && i + 1 < n && src[i + 1] !== ']') {
          i++; // -
          let hi;
          if (peek() === '\\') hi = parseEsc(true);
          else { hi = { t: 'char', start: i, end: i + 1, c: peek() }; i++; }
          if (lo.t !== 'char' || hi.t !== 'char') throw new ParseError(`范围端点必须是字面字符（位置 ${i}）`);
          if (lo.c > hi.c) throw new ParseError(`范围 ${lo.c}-${hi.c} 起止颠倒（位置 ${i}）`);
          items.push({ t: 'range', start: itemStart, end: i, lo: lo.c, hi: hi.c });
        } else {
          items.push(lo);
        }
      }
      return { t: 'cls', start, end: i, neg, items };
    }

    const ast = parseAlt();
    if (i < n) throw new ParseError(`多余的「${peek()}」（位置 ${i}）`);
    return ast;
  }
  RV.parse = parse;

  /* ---------- 中文解释 ---------- */
  const ESC_NAME = { d: '数字 0-9', D: '非数字', w: '字母/数字/下划线', W: '非字母数字下划线', s: '空白字符', S: '非空白字符' };

  function clsText(node) {
    const parts = node.items.map(it => {
      if (it.t === 'range') return `${it.lo}–${it.hi}`;
      if (it.t === 'esc') return ESC_NAME[it.k];
      return it.c === ' ' ? '空格' : `「${it.c}」`;
    });
    return (node.neg ? '除 ' : '') + parts.join('、') + (node.neg ? ' 以外' : '') + ' 中任意一个';
  }

  /** 单个节点的中文描述 */
  function desc(node) {
    switch (node.t) {
      case 'char': return node.c === ' ' ? '空格' : `字符「${node.c}」`;
      case 'esc': return ESC_NAME[node.k];
      case 'dot': return '任意字符（换行除外）';
      case 'cls': return clsText(node);
      case 'anchor':
        return { '^': '行首锚点', '$': '行尾锚点', b: '单词边界', B: '非单词边界' }[node.k];
      case 'backref': return `反向引用第 ${node.n} 个捕获组`;
      case 'empty': return '空（匹配空串）';
      case 'group': {
        const inner = desc(node.child);
        if (node.kind === 'cap') return `捕获组 #${node.idx}${node.name ? '（' + node.name + '）' : ''}：${inner}`;
        if (node.kind === 'non') return `分组（不捕获）：${inner}`;
        if (node.kind === 'look') return `肯定前瞻：后面必须紧跟 ${inner}`;
        return `否定前瞻：后面不能是 ${inner}`;
      }
      case 'rep': {
        const q = node.max === Infinity
          ? (node.min === 0 ? '重复 0 次或更多' : '重复 1 次或更多')
          : node.min === node.max ? `恰好重复 ${node.min} 次`
            : node.min === 0 ? `出现 0 到 ${node.max} 次` : `重复 ${node.min} 到 ${node.max} 次`;
        const inner = desc(node.child);
        return `${q}：${wrap(node.child, inner)}`;
      }
      case 'alt':
        return node.parts.map(p => wrap(p, desc(p))).join(' 或 ');
      case 'cat':
        return node.parts.map(p => desc(p)).join('，紧跟 ');
    }
  }
  function wrap(child, text) {
    return (child.t === 'cat' || child.t === 'alt') ? `(${text})` : text;
  }

  /** 顶层逐段解释：[{src, desc, start, end}]，分组会展开一层内部要点 */
  function segments(ast) {
    const out = [];
    function top(node) {
      if (node.t === 'cat') node.parts.forEach(top);
      else out.push(node);
    }
    top(ast);
    return out.map(node => {
      const seg = { start: node.start, end: node.end, desc: desc(node) };
      if (node.t === 'group' && node.child.t === 'alt') {
        seg.detail = node.child.parts.map(p => wrap(p, desc(p)));
      }
      return seg;
    });
  }
  RV.segments = segments;
  RV.desc = desc;
})();
