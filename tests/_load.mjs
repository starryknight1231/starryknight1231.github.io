/* 测试共享内核加载器：把挂在 window 全局上的内核装进 Node。
   内核与 UI 分层，因此 Raft / MVCC / 正则 NFA 都可以脱离浏览器单独验证。 */
import { readFileSync } from 'node:fs';

const APPS = new URL('../apps/', import.meta.url);

function loadKernel(files) {
  for (const f of files) {
    const src = readFileSync(new URL(f, APPS), 'utf8') + `\n//# sourceURL=${f}`;
    new Function('window', src)(globalThis);
  }
}

export function loadRaft() {
  loadKernel(['raft-lab/js/raft-core.js']);
  if (!globalThis.RaftCluster) throw new Error('raft-core.js 未挂载 RaftCluster');
  return { Cluster: globalThis.RaftCluster };
}

export function loadMvcc() {
  loadKernel(['mvcc-lab/js/mvcc-core.js']);
  if (!globalThis.MVCC) throw new Error('mvcc-core.js 未挂载 MVCC');
  return { MVCC: globalThis.MVCC };
}

export function loadRegex() {
  // nfa.js 依赖 parser.js 先挂好 window.RV
  loadKernel(['regexvis/js/parser.js', 'regexvis/js/nfa.js']);
  if (!globalThis.RV) throw new Error('regexvis 内核未挂载 RV');
  return { RV: globalThis.RV };
}
