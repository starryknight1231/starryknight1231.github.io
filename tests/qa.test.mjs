/* QA Deck 数据完整性测试：门户题库的每道题必须有齐全字段、
   步数与图层数对齐（分步显影才成立）、深链的实验室页面真实存在。 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = readFileSync(new URL('../qa-deck.js', import.meta.url), 'utf8');
const w = {};
new Function('window', src)(w);
const deck = w.QA_DECK || [];
const ROOT = fileURLToPath(new URL('../', import.meta.url));

const CATS = ['网络', '数据库', '分布式', 'Java 并发'];

export default {
  name: 'QA Deck · 题库数据完整性',
  test(t) {
    t.eq('题库首批共 8 题', deck.length, 8);
    t.eq('id 全部唯一', new Set(deck.map(e => e.id)).size, deck.length);

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

      // 动手实验深链的页面必须真实存在
      if (e.lab && e.lab.href) {
        const file = e.lab.href.split('#')[0].replace(/\/$/, '') + '/index.html';
        t.ok(`${tag} 实验室深链存在（${e.lab.href}）`, existsSync(ROOT + file));
      } else {
        t.ok(`${tag} 有动手实验入口`, false);
      }
    }
  },
};
