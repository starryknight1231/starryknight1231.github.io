/* Starry Lab 内核测试 runner —— 零依赖，Node 18+ 直接运行：
     node tests/run.mjs
   三个套件（Raft / MVCC / 正则）串行执行，失败时退出码非 0。 */
import raftSuite from './raft.test.mjs';
import mvccSuite from './mvcc.test.mjs';
import regexSuite from './regex.test.mjs';

const suites = [raftSuite, mvccSuite, regexSuite];
const t0 = Date.now();
let pass = 0, fail = 0;
const failed = [];

const t = {
  head(label) { console.log(`\n  — ${label}`); },
  ok(name, cond, extra) {
    if (cond) { pass++; console.log(`  PASS  ${name}`); }
    else {
      fail++;
      failed.push(name);
      console.log(`  FAIL  ${name}${extra !== undefined ? `\n        ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`);
    }
  },
  eq(name, got, want, extra) {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g === w) { pass++; console.log(`  PASS  ${name}`); }
    else {
      fail++;
      failed.push(name);
      console.log(`  FAIL  ${name}\n        got  ${g}\n        want ${w}${extra !== undefined ? `\n        ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`);
    }
  },
};

console.log('Starry Lab 内核测试\n');
for (const s of suites) {
  console.log(`\n══ ${s.name} ══`);
  try {
    s.test(t);
  } catch (e) {
    fail++;
    failed.push(`${s.name}（套件异常）`);
    console.log(`  SUITE ERROR  ${e && e.stack || e}`);
  }
}

const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\n──────────────────────────────`);
console.log(`  ${pass} passed · ${fail} failed · ${secs}s`);
if (fail) { console.log(`\n  失败项:\n    - ${failed.join('\n    - ')}`); process.exitCode = 1; }
