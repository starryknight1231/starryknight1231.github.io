/* 正则引擎测试：parser → Thompson NFA → 全串匹配仿真。
   覆盖量词、字符类、转义、锚点、前瞻断言与非法正则报错。
   内核加载自 apps/regexvis/js/parser.js 与 nfa.js。 */
import { loadRegex } from './_load.mjs';
const { RV } = loadRegex();

/** 全串匹配：buildNFA + simulate 的薄封装 */
function acc(pattern, input, flags) {
  return RV.simulate(RV.buildNFA(RV.parse(pattern)), input, flags || {}).accepted;
}

export default {
  name: 'RegexVis · 正则解析与 NFA 匹配',
  test(t) {
    t.head('字面量与量词');
    t.ok('abc 接受 abc', acc('abc', 'abc'));
    t.ok('abc 拒绝 abd', !acc('abc', 'abd'));
    t.ok('a+ 接受 aaa', acc('a+', 'aaa'));
    t.ok('a* 接受空串', acc('a*', ''));
    t.ok('a+ 拒绝空串', !acc('a+', ''));
    t.ok('a{2,3} 接受 aa 与 aaa', acc('a{2,3}', 'aa') && acc('a{2,3}', 'aaa'));
    t.ok('a{2,3} 拒绝 a', !acc('a{2,3}', 'a'));

    t.head('或 · 分组 · 字符类');
    t.ok('(a|b)+c 接受 ababc', acc('(a|b)+c', 'ababc'));
    t.ok('(a|b)+c 拒绝 abcabc（引擎是全串匹配）', !acc('(a|b)+c', 'abcabc'));
    t.ok('[a-c]x 接受 bx', acc('[a-c]x', 'bx'));
    t.ok('[a-c]x 拒绝 dx', !acc('[a-c]x', 'dx'));
    t.ok('[^a-c]x 接受 dx（否定字符类）', acc('[^a-c]x', 'dx'));

    t.head('转义与简写类');
    t.ok('\\d+ 接受 123', acc('\\d+', '123'));
    t.ok('\\d+ 拒绝 12a', !acc('\\d+', '12a'));
    t.ok('a\\.b 接受 a.b（点已转义）', acc('a\\.b', 'a.b'));
    t.ok('a\\.b 拒绝 axb', !acc('a\\.b', 'axb'));
    t.ok('忽略大小写：abc 接受 ABC', acc('abc', 'ABC', { i: true }));
    t.ok('默认大小写敏感：abc 拒绝 ABC', !acc('abc', 'ABC'));

    t.head('锚点与前瞻断言');
    t.ok('ab\\b 接受 ab（词尾边界）', acc('ab\\b', 'ab'));
    t.ok('ab\\b 拒绝 abc（b 与 c 之间没有边界）', !acc('ab\\b', 'abc'));
    t.ok('a(?=b)b 正向前瞻放行 ab', acc('a(?=b)b', 'ab'));
    t.ok('a(?=b)b 拒绝 ac（前瞻没看到 b）', !acc('a(?=b)b', 'ac'));
    t.ok('a(?!b)x 负向前瞻放行 ax', acc('a(?!b)x', 'ax'));
    t.ok('a(?!b)x 拒绝 ab（前瞻挡住了 b）', !acc('a(?!b)x', 'ab'));
    t.ok('a{2,} 拒绝空串（min>1 同样不允许跳过）', !acc('a{2,}', ''));

    t.head('解析与逐段解释');
    t.ok('(ab|cd)+ 正常解析并匹配', acc('(ab|cd)+', 'abcd'));
    let err = null;
    try { RV.parse('(ab'); } catch (e) { err = e; }
    t.ok('未闭合的 ( 抛 ParseError', err instanceof RV.ParseError, err && err.message);
    err = null;
    try { RV.parse('[z-a]'); } catch (e) { err = e; }
    t.ok('起止颠倒的范围 [z-a] 抛 ParseError', err instanceof RV.ParseError, err && err.message);
    err = null;
    try { RV.parse('*a'); } catch (e) { err = e; }
    t.ok('悬空量词 *a 抛 ParseError', err instanceof RV.ParseError, err && err.message);
    const segs = RV.segments(RV.parse('a|b'));
    t.ok('segments 对 a|b 给出含「或」的逐段中文解释',
      segs.length === 1 && segs[0].desc.includes('或'), segs[0] && segs[0].desc);
  },
};
