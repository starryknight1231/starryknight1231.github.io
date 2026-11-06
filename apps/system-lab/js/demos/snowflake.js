/* ============ 雪花 ID 生成器演示 ============ */
(function () {
  'use strict';

  registerDemo({
    id: 'snowflake', cat: '分布式', name: '雪花 ID',
    desc: '看懂 64 位 ID 的位分配、单调性来源，以及时钟回拨为什么是雪花方案的头号问题',
    keywords: 'snowflake 雪花 id 分布式 主键 时钟回拨 leaf uuid',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v18M12 12l6-3.5M12 12l6 3.5M12 12L6 8.5M12 12l-6 3.5M12 12l4 4M12 12L8 8M12 12l-4 4M12 12l4-4"/></svg>',
    render(body) {
      body.innerHTML = `
        <div class="info-note">
          <b>结论先行：</b>雪花 ID = <b>1 位符号 + 41 位毫秒时间戳 + 10 位机器 ID + 12 位序列号</b>。
          时间戳在高位，所以同机生成的 ID 天然<b>趋势递增</b>——这正是它作为数据库主键最值钱的性质（B+ 树顺序写，不页分裂）。
        </div>
        <div class="card">
          <div class="card-title">64 位结构 <span style="font-weight:400">鼠标悬停看每一段的作用</span></div>
          <div class="bitmap" id="sf-bits">
            <div class="bitseg s-sign" data-tip="符号位：恒为 0，保证 ID 为正数"><b>1 bit</b><span>符号</span></div>
            <div class="bitseg s-ts" data-tip="当前毫秒数 − 起始纪元(常用 2016-01-01)。41 位约可用 69 年"><b>41 bit</b><span>毫秒时间戳</span></div>
            <div class="bitseg s-wid" data-tip="机器/进程编号。10 位 = 最多 1024 个节点，可拆成 5 位机房 + 5 位机器"><b>10 bit</b><span>机器 ID</span></div>
            <div class="bitseg s-seq" data-tip="同一毫秒内的递增序号，4096 后等待下一毫秒。单机单毫秒上限 4096 个 ID（约 409 万 QPS）"><b>12 bit</b><span>序列号</span></div>
          </div>
          <div class="hint" id="sf-tip">悬停上方任意一段查看说明。</div>
        </div>
        <div class="card">
          <div class="card-title">生成器 <span style="font-weight:400">机器 ID
            <select id="sf-wid" style="width:auto;padding:2px 6px"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="7">7</option><option value="1023">1023</option></select></span></div>
          <div class="row">
            <div class="fix btn-row" style="margin:0">
              <button class="btn teal" id="sf-gen">生成一个</button>
              <button class="btn" id="sf-batch">批量生成 20 个</button>
              <button class="btn" id="sf-rollback">⚡ 模拟时钟回拨 5 秒</button>
              <div class="seg" id="sf-strategy">
                <button class="on" data-v="wait">策略：等待追平</button>
                <button data-v="throw">策略：直接抛异常</button>
              </div>
            </div>
          </div>
          <div style="margin-top:12px">
            <table class="tb"><tbody id="sf-out"><tr><td class="hint">点击「生成一个」看 ID 的位级拆解</td></tr></tbody></table>
          </div>
          <div class="log-list" id="sf-log" style="margin-top:12px"><span class="l-dim">事件日志…</span></div>
        </div>
        <div class="card">
          <div class="card-title">ID 解码器</div>
          <div class="row">
            <input type="text" id="sf-dec-in" placeholder="粘贴任意雪花 ID（十进制）" spellcheck="false">
            <button class="btn fix" id="sf-dec-go">解码</button>
          </div>
          <div style="margin-top:12px"><pre class="out" id="sf-dec-out">解码结果</pre></div>
        </div>
        <div class="card">
          <div class="card-title">面试要点</div>
          <pre class="out" style="white-space:pre-wrap">为什么不用 UUID？36 字符、无序，作为 InnoDB 主键会导致页分裂与缓存命中率低；分布式场景还可能重复（MAC 地址伪造/机器克隆）。

为什么不用数据库自增？单点瓶颈、步长扩展要停机、分库分表后区间管理复杂（号段模式是另一种解法）。

时钟回拨怎么办？
  ① 等待：回拨 ≤ 数百 ms 时自旋等待追平（本演示的策略 A）
  ② 拒绝：超过阈值直接抛异常，由上层降级（策略 B，美团 Leaf 的 default）
  ③ 备用位：把 sequence 或机器位里抠几位做「回拨序号」（Leaf segment 方案 / 百度 UidGenerator 的做法）
工程细节：workerId 从 ZooKeeper / 数据库 / K8s StatefulSet 序号分配，重启不漂移；纪元选项目上线日，把 41 位寿命用在刀刃上。</pre>
        </div>`;

      const EPOCH = new Date('2016-01-01T00:00:00Z').getTime();
      const TS_BITS = 41n, SEQ_BITS = 12n;
      const TS_MAX = (1n << 41n) - 1n;
      const WID_MAX = (1n << 10n) - 1n;
      const SEQ_MAX = (1n << 12n) - 1n;

      let lastTs = 0n, seq = 0n;
      let fakeClock = null;          // 回拨模拟：非 null 时用它当当前时间
      let strategy = 'wait';
      let wid = 1n;

      function log(msg, cls) {
        const el = body.querySelector('#sf-log');
        if (el.querySelector('.l-dim')) el.innerHTML = '';
        const line = document.createElement('div');
        line.className = cls || 'l-dim';
        line.textContent = msg;
        el.appendChild(line);
        while (el.children.length > 40) el.firstChild.remove();
        el.scrollTop = el.scrollHeight;
      }

      function nowMs() {
        return BigInt(fakeClock ?? Date.now());
      }

      function nextId() {
        let ts = nowMs();
        if (ts < lastTs) {
          const back = lastTs - ts;
          if (strategy === 'throw') {
            log(`✗ 检测到时钟回拨 ${back}ms，按策略直接抛出异常，拒绝生成`, 'l-err');
            return null;
          }
          log(`⚠ 时钟回拨 ${back}ms，自旋等待系统追上…`, 'l-warn');
          // 演示用虚拟等待：直接推进假时钟到 lastTs
          if (fakeClock !== null) fakeClock = Number(lastTs);
          ts = nowMs();
          log(`✓ 已追平（ waited ${back}ms ），恢复发号`, 'l-ok');
        }
        if (ts === lastTs) {
          seq = (seq + 1n) & SEQ_MAX;
          if (seq === 0n) {
            // 本毫秒 4096 个用尽，虚拟推进到下一毫秒
            if (fakeClock !== null) fakeClock += 1;
            ts = nowMs();
            while (ts <= lastTs) { if (fakeClock !== null) fakeClock += 1; ts = nowMs(); }
          }
        } else {
          seq = 0n;
        }
        lastTs = ts;
        const tsPart = (ts - BigInt(EPOCH)) & TS_MAX;
        return (tsPart << 22n) | (wid << 12n) | seq;
      }

      const TS_COLOR = '#4e6478', WID_COLOR = '#2f6b60', SEQ_COLOR = '#8a6a1f';

      function rowFor(id) {
        const tsPart = (id >> 22n) & TS_MAX;
        const w = (id >> 12n) & WID_MAX;
        const s = id & SEQ_MAX;
        const date = new Date(Number(BigInt(EPOCH) + tsPart)).toISOString().replace('T', ' ').replace('Z', ' UTC');
        const bin = id.toString(2).padStart(64, '0');
        const colored = `<span style="color:${TS_COLOR}">${bin.slice(1, 42)}</span><span style="color:${WID_COLOR}">${bin.slice(42, 52)}</span><span style="color:${SEQ_COLOR}">${bin.slice(52)}</span>`;
        return `<tr>
          <td style="font-family:var(--mono);font-size:12.5px;word-break:break-all">${id.toString()}</td>
          <td style="font-family:var(--mono);font-size:11px;word-break:break-all">0${colored}</td>
          <td style="font-family:var(--mono);font-size:12px;white-space:nowrap">${date}</td>
          <td style="font-family:var(--mono)">w${w} · s${s}</td>
        </tr>`;
      }

      body.querySelector('#sf-gen').addEventListener('click', () => {
        const id = nextId();
        if (id === null) return;
        const tb = body.querySelector('#sf-out');
        if (tb.querySelector('.hint')) tb.innerHTML = '';
        tb.insertAdjacentHTML('afterbegin', rowFor(id));
        while (tb.children.length > 5) tb.lastChild.remove();
        SL.copy(id.toString(), true);
        log(`✓ 生成 ${id.toString()}（已复制）`, 'l-ok');
      });
      body.querySelector('#sf-batch').addEventListener('click', () => {
        const tb = body.querySelector('#sf-out');
        if (tb.querySelector('.hint')) tb.innerHTML = '';
        const ids = [];
        for (let i = 0; i < 20; i++) {
          const id = nextId();
          if (id === null) break;
          ids.push(id);
          tb.insertAdjacentHTML('afterbegin', rowFor(id));
        }
        while (tb.children.length > 20) tb.lastChild.remove();
        if (ids.length) {
          log(`✓ 批量生成 ${ids.length} 个。观察序列号：同毫秒内 +1，跨毫秒归零`, 'l-ok');
          SL.copy(ids.map(String).join('\n'), true);
        }
      });
      body.querySelector('#sf-rollback').addEventListener('click', () => {
        fakeClock = Number(lastTs) - 5000;
        log(`⚡ 注入模拟：系统时钟被回拨 5 秒（当前策略：${strategy === 'wait' ? '等待追平' : '直接抛异常'}）`, 'l-warn');
        setTimeout(() => {
          // 用真实时钟继续，消除 fakeClock
          const id = nextId();
          if (id !== null) log(`✓ 回拨处理完成，恢复正常发号`, 'l-ok');
          fakeClock = null;
        }, 30);
        setTimeout(() => { fakeClock = null; }, 200);
      });
      body.querySelectorAll('#sf-strategy button').forEach(b => {
        b.addEventListener('click', () => {
          body.querySelectorAll('#sf-strategy button').forEach(x => x.classList.remove('on'));
          b.classList.add('on');
          strategy = b.dataset.v;
        });
      });
      body.querySelector('#sf-wid').addEventListener('change', e => {
        wid = BigInt(e.target.value);
        log(`ℹ 机器 ID 切换为 w${wid}`, 'l-dim');
      });

      // 位段提示
      body.querySelectorAll('#sf-bits .bitseg').forEach(seg => {
        seg.addEventListener('mouseenter', () => {
          body.querySelector('#sf-tip').innerHTML = `<b style="color:var(--accent)">${seg.querySelector('b').textContent}</b> · ${seg.dataset.tip}`;
        });
      });

      // 解码器
      body.querySelector('#sf-dec-go').addEventListener('click', () => {
        const out = body.querySelector('#sf-dec-out');
        const v = body.querySelector('#sf-dec-in').value.trim();
        if (!/^\d{1,20}$/.test(v)) { out.innerHTML = '<span class="err">✗ 请输入纯数字 ID</span>'; return; }
        try {
          const id = BigInt(v);
          if (id < 0n || id >= (1n << 64n)) throw new Error('range');
          const tsPart = (id >> 22n) & TS_MAX;
          const w = (id >> 12n) & WID_MAX;
          const s = id & SEQ_MAX;
          const ts = Number(BigInt(EPOCH) + tsPart);
          const d = new Date(ts);
          out.textContent =
            `时间戳部分：${tsPart}（${d.toISOString().replace('T', ' ').replace('Z', ' UTC')}）\n` +
            `机器 ID：${w}　序列号：${s}\n` +
            `纪元假设：2016-01-01（如果你的纪元不同，时间会整体平移）\n` +
            `符号位：${id >> 63n}（应为 0）`;
        } catch (e) {
          out.innerHTML = '<span class="err">✗ 解析失败：ID 超出 64 位范围</span>';
        }
      });
      body.querySelector('#sf-dec-in').addEventListener('keydown', e => {
        if (e.key === 'Enter') body.querySelector('#sf-dec-go').click();
      });

      // 预填一个示例
      (function seed() {
        wid = 1n; lastTs = 0n; seq = 0n;
        body.querySelector('#sf-gen').click();
      })();
    }
  });
})();
