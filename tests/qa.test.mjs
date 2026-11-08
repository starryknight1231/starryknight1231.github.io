/* QA Deck 数据完整性测试：门户题库的每道题必须有齐全字段、
   步数与图层数对齐（分步显影才成立）、深链的实验室页面真实存在。 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const w = {};
new Function('window', readFileSync(new URL('../qa-deck.js', import.meta.url), 'utf8'))(w);
const partDir = new URL('../qa-parts/', import.meta.url);
const parts = readdirSync(partDir).filter(f => f.endsWith('.js')).sort();
for (const f of parts) {
  new Function('window', readFileSync(new URL(f, partDir), 'utf8'))(w);
}
new Function('window', readFileSync(new URL('../notes-data.js', import.meta.url), 'utf8'))(w);
const deck = (w.QA_DECK = (() => {
  const all = (w.QA_BUILTIN || []).concat(
    w.QA_PART_1 || [], w.QA_PART_2 || [], w.QA_PART_3 || [],
    w.QA_PART_4 || [], w.QA_PART_5 || [], w.QA_PART_6 || [],
    w.QA_PART_7 || [], w.QA_PART_8 || [],
  );
  const order = w.QA_ORDER || [];
  const byId = {};
  all.forEach(e => { byId[e.id] = e; });
  return order.length ? order.map(id => byId[id]).filter(Boolean) : all;
})());

/* 学习日志（notes.html 的数据层）：时间线的日期必须真实规范、倒序排列、sha 可指向真实提交 */
const log = (w.STUDY_LOG || []).slice().sort((a, b) => b.date.localeCompare(a.date));
const LOG_TAGS = ['里程碑', '学习笔记', '面试复盘'];
const ROOT = fileURLToPath(new URL('../', import.meta.url));

const CATS = ['网络', '数据库', 'Redis', '分布式', 'Java 并发', 'Java 基础', '框架', '操作系统'];

export default {
  name: 'QA Deck · 题库数据完整性',
  test(t) {
    t.eq('题库共 62 题', deck.length, 62);
    t.eq('id 全部唯一', new Set(deck.map(e => e.id)).size, deck.length);
    t.eq('分类覆盖 8 大类', new Set(deck.map(e => e.cat)).size, 8);
    t.eq('QA_ORDER 覆盖全部 62 题且无多余', (w.QA_ORDER || []).length === 62 && (w.QA_ORDER || []).every(id => deck.some(e => e.id === id)) && deck.every(e => (w.QA_ORDER || []).includes(e.id)), true);
    t.eq('学习顺序从基础开始（第一题=进程与线程）', deck[0].id, 'process-thread');
    t.eq('学习顺序以综合设计收尾（最后一题=秒杀）', deck[deck.length - 1].id, 'seckill');

    // 题间互链：相关题的 id 必须真实存在，且互链表覆盖主要知识连线
    const relMap = w.QA_RELATED || {};
    const ids = new Set(deck.map(e => e.id));
    const relIds = Object.values(relMap).flat();
    t.ok('互链目标全部真实存在', relIds.every(id => ids.has(id)),
      relIds.filter(id => !ids.has(id)).join(',') || 'ok');
    t.ok('互链覆盖 ≥ 45 题', Object.keys(relMap).length >= 45, Object.keys(relMap).length + ' 题');
    t.ok('有实验室深链的题也进互链（tcp/raft）', (relMap['tcp'] || []).includes('tcp-2msl') && Array.isArray(relMap['raft-election']));

    t.head('学习日志 · 时间线数据');
    t.ok('日志至少 110 条（当前 ' + log.length + ' 条，含印象笔记学习笔记）', log.length >= 110);
    t.ok('时间跨度 ≥ 2017（九年笔记习惯）', log[log.length - 1].date <= '2017-12-31');
    t.ok('日期格式全部为 YYYY-MM-DD', log.every(e => /^\d{4}-\d{2}-\d{2}$/.test(e.date)));
    t.ok('按日期倒序（时间线最新在前）', log.every((e, i) => i === 0 || log[i - 1].date >= e.date));
    t.ok('tag 全部合法', log.every(e => LOG_TAGS.includes(e.tag)));
    t.ok('标题与正文齐全（标题≥4 · 正文≥20）', log.every(e => e.title && e.title.length >= 4 && e.body && e.body.length >= 20));
    t.ok('sha 格式合法（可指向真实 commit）', log.filter(e => e.sha).every(e => /^[0-9a-f]{7,40}$/.test(e.sha)));

    for (const e of deck) {
      const tag = `[${e.id}]`;
      t.ok(`${tag} 分类合法（${e.cat}）`, CATS.includes(e.cat));
      t.ok(`${tag} 30 秒答案非空`, typeof e.answer === 'string' && e.answer.length >= 40);
      t.ok(`${tag} 步数 ≥ 5（${e.steps.length} 步）`, e.steps.length >= 5);
      t.ok(`${tag} 每步都有标题与正文`, e.steps.every(s => s.title && s.text && s.text.length >= 30));
      t.ok(`${tag} 追问链 ≥ 3 条（${e.followups.length} 条）`, Array.isArray(e.followups) && e.followups.length >= 3
        && e.followups.every(f => f[0] && f[1]));
      t.ok(`${tag} 面试要点非空`, typeof e.points === 'string' && e.points.length >= 30);

      // 分步显影：步数必须等于图层数，且最后一层的显影数 = 步数
      const last = e.figure.draw(e.steps.length - 1);
      const layerCount = (last.match(/opacity="/g) || []).length;
      const shown = (last.match(/opacity="1"/g) || []).length;
      t.eq(`${tag} 图层数 = 步数（分步显影成立）`, layerCount, e.steps.length);
      t.eq(`${tag} 末步显影全部打开`, shown, e.steps.length);
      t.ok(`${tag} 首步其余层降为 0.15`, e.figure.draw(0).includes('opacity="0.15"'));
      t.ok(`${tag} SVG 合法（含 <svg 与 viewBox）`, last.includes('<svg') && last.includes('viewBox'));

      // 动手实验深链的页面必须真实存在（没有合适实验室的题可省略）
      if (e.lab && e.lab.href) {
        const file = e.lab.href.split('#')[0].replace(/\/$/, '') + '/index.html';
        t.ok(`${tag} 实验室深链存在（${e.lab.href}）`, existsSync(ROOT + file));
      }
    }
  },
};
