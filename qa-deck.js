/* ============ QA Deck · 门户题解数据层 ============
   门户首页「高频面试题」的内容与图解全部来自本文件：纯数据 + SVG 字符串，不碰 DOM。
   每题 figure.draw(n) 返回完整 SVG：第 0..n 层显影（opacity 1），之后的层降为 0.15，
   步进时「图是长出来的」——与实验室里 tcp.js 的按步显影同一套模式。
   难度从低到高排序；每个图层的层序与 steps 的步序一一对应。 */
(function (w) {
  'use strict';

  /* ---------- 调色板（与门户内联 CSS 同源） ---------- */
  const C = {
    ink: '#1f1c19', muted: '#5f5850', faint: '#6f675d',
    line: '#dcd5c7', lineS: '#bdb3a1',
    surface: '#faf8f3', surface2: '#f6f2ea', bg: '#f2efe8',
    accent: '#a8442c', accentDeep: '#8d3620',
    blue: '#4e6478', moss: '#4f7038', teal: '#2f6b60',
    brass: '#8a6a1f', mauve: '#6f5a68', clay: '#a8452f',
  };
  const SANS = '-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif';
  const MONO = '"SF Mono",Menlo,Consolas,monospace';

  /* ---------- SVG 画法助手 ---------- */
  let seq = 0;
  function mark(color) { // 每张图独立的箭头 marker，避免同页 id 冲突
    const id = 'qa-arw-' + (++seq);
    return { id, html: `<defs><marker id="${id}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${color || C.muted}"/></marker></defs>` };
  }
  function box(x, y, w2, h2, label, o) {
    o = o || {};
    const stroke = o.stroke || C.lineS, fill = o.fill || C.surface;
    return `<rect x="${x}" y="${y}" width="${w2}" height="${h2}" rx="9" fill="${fill}" stroke="${stroke}" stroke-width="${o.sw || 1.4}" ${o.dashed ? 'stroke-dasharray="5 4"' : ''}/>` +
      `<text x="${x + w2 / 2}" y="${y + h2 / 2 + (o.dy || 0)}" text-anchor="middle" font-size="${o.fs || 13}" font-weight="${o.fw || 600}" fill="${o.color || C.ink}" font-family="${o.mono ? MONO : SANS}">${label}</text>`;
  }
  function txt(x, y, t, o) {
    o = o || {};
    return `<text x="${x}" y="${y}" ${o.anchor ? 'text-anchor="' + o.anchor + '"' : ''} font-size="${o.fs || 12}" font-weight="${o.fw || 400}" fill="${o.color || C.muted}" font-family="${o.mono ? MONO : SANS}">${t}</text>`;
  }
  function arrow(x1, y1, x2, y2, o) {
    o = o || {};
    const m = mark(o.color);
    return m.html +
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${o.color || C.muted}" stroke-width="${o.sw || 1.8}" ${o.dashed ? 'stroke-dasharray="6 4"' : ''} marker-end="url(#${m.id})"/>` +
      (o.label ? txt((x1 + x2) / 2, (y1 + y2) / 2 - 7, o.label, { anchor: 'middle', color: o.color || C.muted, fs: 11.5, fw: 600, mono: o.mono }) : '');
  }
  function layers(n, fns, vb, extra) { // 分层显影的通用组装
    const body = fns.map((f, i) => `<g opacity="${i <= n ? 1 : 0.15}">${f()}</g>`).join('');
    return `<svg viewBox="${vb}" role="img">${body}${extra || ''}</svg>`;
  }
  function chip(x, y, t, color) { // 状态小标签
    const w2 = t.length * 12 + 18;
    return `<rect x="${x}" y="${y}" width="${w2}" height="22" rx="11" fill="${color}"/><text x="${x + w2 / 2}" y="${y + 15}" text-anchor="middle" font-size="11" font-weight="600" fill="#f2efe8" font-family="${SANS}">${t}</text>`;
  }

  /* ============ 1. TCP 三次握手，为什么两次不行？ ============ */
  function qTcp() {
    const L = [
      () => box(60, 46, 130, 52, '客户端 C') + box(570, 46, 130, 52, '服务器 S') +
        `<line x1="125" y1="104" x2="125" y2="196" stroke="${C.line}" stroke-dasharray="4 4"/>` +
        `<line x1="635" y1="104" x2="635" y2="196" stroke="${C.line}" stroke-dasharray="4 4"/>` +
        txt(380, 66, '传数据之前，先对齐两件事：各自的起始序号 ISN、双方都具备收发能力', { anchor: 'middle', fs: 12.5 }),
      () => arrow(132, 122, 628, 122, { color: C.blue, label: '① SYN，seq = x', mono: true }) +
        chip(60, 140, 'C：SYN_SENT', C.blue),
      () => arrow(628, 158, 132, 158, { color: C.moss, label: '② SYN+ACK，seq = y，ack = x+1', mono: true }) +
        chip(570, 176, 'S：SYN_RCVD', C.moss) +
        txt(380, 214, '此时 S 只证明了「C 能发」；「C 能不能收」还没有证据', { anchor: 'middle', color: C.faint, fs: 12 }),
      () => arrow(132, 240, 628, 240, { color: C.accent, label: '③ ACK，ack = y+1（可携带数据）', mono: true }) +
        chip(60, 258, 'C：ESTABLISHED', C.moss) + chip(570, 258, 'S：ESTABLISHED', C.moss) +
        txt(380, 300, 'S 收到 ③ 才确认：双向收发全部验证通过 —— 这就是为什么最少三次', { anchor: 'middle', color: C.accent, fs: 12.5, fw: 600 }),
      () => txt(380, 322, '两次的反例：② 若丢失（或这是迟到的旧 SYN），S 单方面开着连接干等，C 却毫不知情 → 半连接被白占', { anchor: 'middle', color: C.clay, fs: 12 }),
    ];
    return {
      id: 'tcp', cat: '网络', level: '入门', hot: true,
      q: 'TCP 三次握手，为什么两次不行？',
      answer: 'SYN → SYN+ACK → ACK。三次是「确认双方收发能力 + 交换初始序号」的最小次数：只有两次时，服务器发完 SYN+ACK 就单方面认为连接已建立，若该报文丢失（或那是一个迟到的旧 SYN），它会对着一个不存在的连接白白等待。',
      steps: [
        { title: '握手在解决什么', text: 'TCP 在传数据前要对齐两件事：双方的初始序号 ISN（后面的每个字节按序号编号），以及「你我都能收、也都能发」的双向能力。握手的本质就是一次互相确认。' },
        { title: '第一次：C → S 的 SYN', text: '客户端发出 SYN，携带自己的初始序号 x，进入 SYN_SENT。这一步之后，服务器只知道「有人想连我」。' },
        { title: '第二次：S → C 的 SYN+ACK', text: '服务器把自己的初始序号 y 和对 x 的确认打包返回，进入 SYN_RCVD。注意此刻的盲区：S 只证明了「C 能发」，它还不知道自己发的东西 C 能不能收到。' },
        { title: '第三次：C → S 的 ACK', text: '客户端确认收到 SYN+ACK。服务器收到这一包，才终于拿到「我发 → C 能收」的证据。至此双向能力全部确认，双方进入 ESTABLISHED，第三次 ACK 可以顺便携带请求数据。' },
        { title: '两次会怎样：半连接白占', text: '假设只有两次：S 发出 SYN+ACK 就当连接建成。如果这个报文在路上丢了，S 会开着连接、分配缓冲区等数据，而 C 根本不认这个连接——资源被单方面占用，这就是两次握手结构上修不掉的漏洞。' },
      ],
      figure: { vb: '0 0 760 340', draw: n => layers(n, L, '0 0 760 340') },
      followups: [
        ['第三次握手能带数据吗？', '能。前两次的 SYN/SYN+ACK 不能带，第三次 ACK 允许携带，TCP Fast Open 更是把它做成常规能力。'],
        ['四次挥手为什么多一次？', '收到 FIN 时本端可能还有数据没发完，所以 ACK 先单独确认，等数据发完再发自己的 FIN——中间隔一个 CLOSE_WAIT。'],
        ['SYN Flood 攻击怎么防？', 'syncookies：服务器把连接信息编码进序号本身，不分配半连接队列；或缩短 SYN_RCVD 超时、调大 backlog。'],
        ['ISN 为什么是随机的？', '防止上一个相同四元组连接的旧报文串进新连接，也增加伪造难度。'],
      ],
      lab: { href: 'apps/wire-lab/#/tcp', label: '打开 Wire Lab · TCP 握手/挥手仿真，丢包、同时打开都能演' },
      points: '口诀：SYN → SYN+ACK → ACK，确认的是「双向收发能力」并交换 ISN。\n两次的问题本质：服务器对「客户端能不能收」没有任何证据。\n状态机：C 收到 SYN+ACK 即 ESTABLISHED；S 要等到第三次 ACK。',
    };
  }

  /* ============ 2. 从输入网址到页面显示，发生了什么？ ============ */
  function qUrl() {
    const st = ['URL 解析', 'DNS 查询', 'TCP 握手', 'TLS 握手', 'HTTP 请求', '渲染流水线'];
    const boxAt = i => box(30 + i * 118, 108, 104, 64, '', { fill: C.surface });
    const nameAt = (i, color) => `<text x="${30 + i * 118 + 52}" y="145" text-anchor="middle" font-size="12.5" font-weight="600" fill="${color || C.ink}" font-family="${SANS}">${st[i]}</text>`;
    const base = () => st.map((_, i) => i < 5 ? arrow(30 + i * 118 + 106, 140, 30 + (i + 1) * 118 + 2, 140, {}) : '').join('');
    const L = [
      () => base() + boxAt(0) + nameAt(0, C.blue) + txt(82, 196, '先查本地缓存：浏览器 → hosts → 系统缓存', { anchor: 'middle', fs: 11.5 }),
      () => boxAt(1) + nameAt(1, C.teal) + txt(200, 196, '域名 → IP：缓存未命中则递归查询 根 → 顶级 → 权威', { anchor: 'middle', fs: 11.5 }),
      () => boxAt(2) + nameAt(2, C.moss) + txt(318, 196, '与服务器三次握手建立连接（上一题）', { anchor: 'middle', fs: 11.5 }),
      () => boxAt(3) + nameAt(3, C.brass) + txt(436, 196, 'HTTPS 才有：交换证书与密钥，TLS 1.3 一次 RTT', { anchor: 'middle', fs: 11.5 }),
      () => boxAt(4) + nameAt(4, C.accent) + txt(554, 196, '发送 GET，服务器返回 HTML（可能 301 / 304）', { anchor: 'middle', fs: 11.5 }),
      () => boxAt(5) + nameAt(5, C.mauve) + txt(672, 196, 'HTML→DOM，CSS→CSSOM，布局绘制；JS 默认阻塞', { anchor: 'middle', fs: 11.5 }) +
        txt(380, 236, '每一步都有缓存在工作；子资源（CSS/JS/图片）重复走 3-5 步，HTTP/2 下多路复用', { anchor: 'middle', color: C.faint, fs: 11.5 }),
    ];
    return {
      id: 'url', cat: '网络', level: '入门', hot: true,
      q: '从输入网址到页面显示，中间发生了什么？',
      answer: 'URL 解析 → DNS 把域名换成 IP → TCP 三次握手 → TLS 握手（HTTPS）→ 发 HTTP 请求、收响应 → 浏览器渲染流水线（DOM/CSSOM → 布局 → 绘制）→ 递归加载子资源。回答的关键是分层说清、每层点名一个细节（如 DNS 有缓存层级、TLS 1.3 只握手一次 RTT）。',
      steps: [
        { title: 'URL 解析与缓存检查', text: '浏览器先补全协议、看 HSTS，然后依次查浏览器缓存、操作系统缓存与 hosts 文件。绝大多数请求在这里就结束了——这就是强缓存的意义。' },
        { title: 'DNS：域名换成 IP', text: '缓存未命中就发起递归查询：本机 → 运营商递归服务器 → 根域名服务器 → 顶级域（.com）→ 权威服务器。DNS 查询通常走 UDP 53，响应过大或区域传输才用 TCP。' },
        { title: 'TCP 三次握手', text: '拿到 IP 后与服务器三次握手建立连接。这一步的细节就是上一题；如果目标端口不通，这里直接失败。' },
        { title: 'TLS 握手（HTTPS）', text: '协商 cipher、验证证书链、交换密钥材料。TLS 1.2 需要两次 RTT，1.3 把它压缩到一次，且 1.3 砍掉了一票老旧算法。' },
        { title: 'HTTP 请求与响应', text: '发送 GET（带 Cookie、Accept-Encoding 等），服务器返回状态行 + 头 + 体。301/302 会重定向，304 说明协商缓存命中，直接用本地副本。' },
        { title: '渲染流水线与子资源', text: 'HTML 解析成 DOM，CSS 解析成 CSSOM，合成渲染树后布局、绘制；同步 <script> 会阻塞解析（defer/async 可避）。CSS、图片、JS 各自再走一遍握手之后的请求，HTTP/2 用一条连接多路复用它们。' },
      ],
      figure: { vb: '0 0 760 250', draw: n => layers(n, L, '0 0 760 250') },
      followups: [
        ['DNS 用 UDP 还是 TCP？', '查询基本是 UDP 53；响应超过报文上限或做区域传输用 TCP。DoH/DoT 则是加密版的 DNS。'],
        ['强缓存和协商缓存的区别？', '强缓存（Cache-Control/Expires）不发请求；协商缓存（ETag/Last-Modified）问一下服务器「变了没」，变了 200，没变 304。'],
        ['TLS 1.3 为什么快一个 RTT？', '把密钥协商合并进第一个飞行包（ClientHello 就带上 key share），并删掉了 RSA 静态密钥交换。'],
        ['HTTP/2 在这一步改变了什么？', '一条 TCP 连接多路复用所有资源，队头从 HTTP 层挪到了 TCP 层——这也是 QUIC 出现的理由。'],
      ],
      lab: { href: 'apps/wire-lab/#/tls', label: '打开 Wire Lab · TLS 握手轮次与首字节时间对比' },
      points: '骨架句式：「先查缓存 → DNS 拿 IP → TCP 握手 → TLS 握手 → HTTP 请求 → 渲染」。\n加分点在每层挑一个细节：DNS 层级、TLS 1.3 一次 RTT、304、defer/async。\n说到底这是考你对分层的理解，不是背流程图。',
    };
  }

  /* ============ 3. MySQL 四个隔离级别，各解决什么问题？ ============ */
  function qIso() {
    const txA = y => box(50, y, 130, 42, '事务 A', { color: C.ink });
    const txB = y => box(580, y, 130, 42, '事务 B', { color: C.ink });
    const row = (x, y, val, color) => box(x, y, 100, 40, 'v = ' + val, { fill: C.surface, stroke: color || C.lineS, color: color || C.ink, mono: true });
    const L = [
      () => txA(24) + txB(24) + row(330, 25, 10) +
        txt(380, 96, '一行数据初始值 10，两个事务并发读写它 —— 三条读问题都发生在这张图里', { anchor: 'middle', fs: 12 }),
      () => txA(112) + txB(112) + row(330, 113, 10) +
        arrow(184, 133, 326, 133, { color: C.blue, label: 'A 改 20（未提交）', mono: true }) +
        arrow(576, 152, 434, 152, { color: C.clay, label: 'B 读到 20 ✗', mono: true }) +
        txt(380, 196, '脏读：A 回滚后 20 从未存在过 —— 只有读未提交（RU）有此问题', { anchor: 'middle', color: C.clay, fs: 12, fw: 600 }),
      () => txA(212) + txB(212) + row(330, 213, 10) +
        arrow(576, 232, 434, 232, { color: C.teal, label: 'B 读 v = 10', mono: true }) +
        arrow(184, 252, 326, 252, { color: C.blue, label: 'A 改 20 并提交', mono: true }) +
        arrow(576, 272, 434, 272, { color: C.clay, label: 'B 再读 v = 20 ✗', mono: true }) +
        txt(380, 300, '不可重复读：同一事务两次读同一行，值变了 —— 读已提交（RC）仍会发生', { anchor: 'middle', fs: 12, fw: 600 }),
      () => txt(380, 326, '幻读：两次相同的范围查询，行数 1 → 2（多的那行是别人插的）——「行数」变了而不是「值」', { anchor: 'middle', fs: 12 }) +
        box(300, 336, 150, 36, '查到 1 行', { mono: true }) + box(470, 336, 150, 36, '再查 2 行', { mono: true, stroke: C.mauve, color: C.mauve }),
      () => ['RU', 'RC', 'RR', 'SER'].map((s, i) =>
        box(70 + i * 158, 396, 130, 40, s, { fill: i === 2 ? C.surface : C.surface2, stroke: i === 2 ? C.accent : C.lineS, color: i === 2 ? C.accent : C.ink, mono: true, fs: 13 }) +
        txt(70 + i * 158 + 65, 452, ['啥都不防', '防脏读', '再防不可重复读', '全防 + 排队'][i], { anchor: 'middle', fs: 11 }) +
        (i < 3 ? arrow(70 + i * 158 + 132, 416, 70 + (i + 1) * 158 - 2, 416, {}) : '')
      ).join('') + txt(380, 482, '隔离级别阶梯：MySQL/InnoDB 默认 RR，每上一级防住一类问题', { anchor: 'middle', color: C.accent, fs: 12, fw: 600 }),
      () => txt(380, 508, 'InnoDB RR 的底牌：MVCC 版本链 + ReadView 快照（防住快照读的幻读）', { anchor: 'middle', fs: 12 }) +
        txt(380, 528, '当前读（for update）另走一套：间隙锁锁住范围 —— 两套机制合起来基本防住幻读', { anchor: 'middle', color: C.faint, fs: 11.5 }),
    ];
    return {
      id: 'isolation', cat: '数据库', level: '进阶', hot: true,
      q: 'MySQL 的四个隔离级别，分别解决什么问题？',
      answer: '读未提交（啥都不防）→ 读已提交（防脏读）→ 可重复读（再防不可重复读，InnoDB 默认）→ 串行化（全防）。核心是三件事的递进：脏读、不可重复读、幻读。InnoDB 的 RR 并不是纯锁：普通读走 MVCC 快照，当前读（for update）才加锁，幻读靠「快照读 + 间隙锁」两套机制共同防住。',
      steps: [
        { title: '先记住三条读问题', text: '并发事务只有三个经典坑：脏读（读到别人回滚前的值）、不可重复读（同一行两次读值不同）、幻读（同一范围两次数行数不同）。隔离级别就是「防到哪一级」的档位。' },
        { title: '脏读：读未提交的特产', text: 'A 把值改成 20 还没提交，B 读到了 20，然后 A 回滚——B 拿着一个数据库里从未存在过的值去做了业务判断。只有读未提交（RU）会有这个问题，实践中没人用它。' },
        { title: '不可重复读：RC 的边界', text: '读已提交（RC）保证读到的都是提交过的值，但同一事务里两次读同一行，中间别人提交了修改，B 就看到 10 → 20 的跳变。对账单、报表类逻辑怕的就是这个。' },
        { title: '幻读：一行 vs 一批', text: '不可重复读针对「同一行」的值，幻读针对「同一批」的行数：两次 count(*) 或范围查询，中间别人插入了新行，多出来的行像幽灵。这是它俩最容易混的点，答题时先分开说。' },
        { title: '四个级别 = 防护阶梯', text: 'RU 什么都不防；RC 防脏读；RR 再防不可重复读（InnoDB 默认）；串行化全防但要排队。级别越高越安全也越慢，RR 是 MySQL 给出的性价比平衡点。' },
        { title: 'RR 凭什么够用：MVCC', text: 'InnoDB 每行藏着版本链，事务第一条普通查询生成 ReadView，之后全程看同一个快照——这防住了快照读的幻读；select ... for update 这类当前读则靠间隙锁锁住范围。两套机制合起来，RR 实际上基本防住了幻读。' },
      ],
      figure: { vb: '0 0 760 370', draw: n => layers(n, L, '0 0 760 370') },
      followups: [
        ['RC 和 RR 的 ReadView 有什么区别？', 'RC 每条语句生成一次（所以语句间会看到新提交），RR 只在第一条查询时生成并复用到底。'],
        ['MVCC 的版本链长什么样？', '每行隐藏字段 trx_id + roll_pointer 串起 undo log 里的历史版本；可见性由 ReadView 的 xmin/xmax/xip 判定。'],
        ['RR 什么时候仍会幻读？', '混用快照读和当前读：先普通 select 再 update 别人刚插入的行，能看到并更新到「幻影行」。'],
        ['为什么很多公司线上用 RC？', 'RC 无间隙锁、并发更好，且 binlog 用 row 格式后主从安全；互联网公司常见，金融保守场景留 RR。'],
      ],
      lab: { href: 'apps/mvcc-lab/', label: '打开 MVCC Lab · 五个隔离级别下亲手复现每类异常' },
      points: '先答三级问题（脏读/不可重复读/幻读），再答四级阶梯，最后主动抛 MVCC + 间隙锁——这是把题答出深度的顺序。\nMySQL 默认 RR；RC 每语句换 ReadView，RR 首次生成。\n幻读两套防法：快照读靠 MVCC，当前读靠间隙锁。',
    };
  }

  /* ============ 4. 缓存穿透、击穿、雪崩的区别与防法 ============ */
  function qCache() {
    const path = (y, reqLabel, reqColor, hitText, hitColor, missLabel) =>
      arrow(40, y, 268, y, { color: reqColor || C.blue, label: reqLabel }) +
      box(272, y - 27, 140, 54, 'Redis 缓存', { stroke: C.moss, color: C.moss }) +
      arrow(416, y, 540, y, { color: missLabel ? C.clay : C.lineS, label: missLabel }) +
      box(544, y - 27, 140, 54, '数据库 DB', { stroke: C.lineS }) +
      (hitText ? txt(342, y + 46, hitText, { anchor: 'middle', color: hitColor || C.moss, fs: 11.5 }) : '');
    const L = [
      () => path(52, 'GET key', C.blue, '命中 ✓ 直接返回') +
        txt(614, 90, '未命中才回源，回填缓存', { anchor: 'middle', color: C.faint, fs: 11.5 }),
      () => path(140, 'GET id=-1（不存在）', C.clay, '缓存里永远没有 ✗', C.clay, '每次都直达 DB') +
        txt(614, 178, 'DB 也没有 → 下次还来', { anchor: 'middle', color: C.clay, fs: 11.5 }) +
        txt(380, 210, '穿透：数据「根本不存在」，缓存无法命中，恶意伪造 id 会打穿 DB', { anchor: 'middle', color: C.clay, fs: 12.5, fw: 600 }),
      () => box(120, 236, 190, 44, '布隆过滤器（入口）', { stroke: C.teal, color: C.teal, fs: 12 }) +
        txt(215, 300, '「一定没有」直接拦截，「可能有」才放行', { anchor: 'middle', fs: 11.5 }) +
        box(360, 236, 180, 44, '空值缓存（查无也存）', { stroke: C.teal, color: C.teal, fs: 12 }) +
        txt(450, 300, '短 TTL，挡住重复的「查无」', { anchor: 'middle', fs: 11.5 }) +
        txt(380, 326, '防穿透两板斧', { anchor: 'middle', color: C.teal, fs: 12, fw: 600 }),
      () => path(352, '热点 key 到期瞬间 · 1w QPS', C.brass, '恰好过期 ✗', C.brass, '1w 个请求同时回源') +
        txt(380, 418, '击穿：单个热点 key 过期的瞬间，高并发全部砸向 DB', { anchor: 'middle', color: C.brass, fs: 12.5, fw: 600 }),
      () => txt(380, 444, '防击穿：互斥锁（只放一人重建，其余短等）/ 逻辑过期（异步重建，永远有旧值可用）', { anchor: 'middle', fs: 12 }) +
        txt(380, 470, '雪崩：大批 key 相同 TTL 同时失效，或缓存宕机 —— 防 TTL 加随机、多级缓存、集群高可用', { anchor: 'middle', color: C.mauve, fs: 12, fw: 600 }),
      () => txt(380, 500, '一句话区分：穿透 = 不存在｜击穿 = 一瞬间｜雪崩 = 一整片', { anchor: 'middle', color: C.accent, fs: 12.5, fw: 600 }),
    ];
    return {
      id: 'cache', cat: '数据库', level: '进阶', hot: true,
      q: '缓存穿透、击穿、雪崩有什么区别？分别怎么防？',
      answer: '三兄弟都是「请求绕过缓存打到数据库」，区别在时机和范围：穿透——查根本不存在的数据，缓存永远拦不住，防法是布隆过滤器 + 空值缓存；击穿——单个热点 key 过期的瞬间高并发回源，防互斥重建 / 逻辑过期；雪崩——大批 key 同时过期或缓存宕机，防 TTL 加随机、多级缓存、集群高可用。',
      steps: [
        { title: '正常的缓存读写', text: '读请求先问 Redis：命中直接返回；未命中才查库并回填缓存。所有事故都发生在「未命中」这个岔路口——三兄弟只是三种不同的走岔方式。' },
        { title: '穿透：数据根本不存在', text: '请求的 id 在数据库里也没有，缓存里自然永远没有。攻击者用一堆乱造的 id 打过来，每次都穿透到 DB。识别特征：同一个「查无」被反复地问。' },
        { title: '防穿透：入口拦截 + 空值缓存', text: '布隆过滤器站在缓存前面：它说「一定没有」就真没有，直接拒绝；说「可能有」才往下走（会误判存在性，不会误判不存在）。再配合把 DB 查无的结果缓存成空值、给个短 TTL，双保险。' },
        { title: '击穿：热点 key 过期瞬间', text: '一个被高频访问的 key 恰好过期，那一瞬间成千上万请求同时未命中、同时回源、同时回填。识别特征：平时好好的，只在过期时刻尖刺。' },
        { title: '防击穿：只让一个人重建', text: '互斥锁：拿到分布式锁的那一个请求去查库回填，其他人短暂等待后读新缓存。或者干脆逻辑过期：value 里带过期时间，过期后异步重建，用户永远读旧值而不是排队。' },
        { title: '雪崩与一句话总结', text: '雪崩是范围放大版：大批 key 同 TTL 同时失效、或缓存实例挂了。TTL 加随机抖动错开、多级缓存（本地+Redis）、限流降级兜底。总结：穿透对「不存在」，击穿对「一瞬间」，雪崩对「一整片」。' },
      ],
      figure: { vb: '0 0 760 380', draw: n => layers(n, L, '0 0 760 380') },
      followups: [
        ['布隆过滤器为什么不能删元素？', '多个 key 共享同一些位，删某一位会误伤别人；要删得换计数布隆或定期重建。'],
        ['缓存和数据库双写一致性怎么做？', '常见答案：先更新 DB 再删缓存（Cache Aside），配合短 TTL 兜底；要求更高就上订阅 binlog 异步删。'],
        ['怎么发现热点 key？', 'redis-cli --hotkeys、客户端埋点统计、代理层计数；业务上大 V/秒杀类 key 提前做逻辑过期。'],
        ['互斥锁等待的请求会不会堆积？', '会，所以要设等待超时，拿不到锁直接读旧值或快速失败——别把 DB 的压力变成 Redis 的阻塞。'],
      ],
      lab: { href: 'apps/system-lab/#/bloom', label: '打开 System Lab · 布隆过滤器：理论 vs 实测误判率' },
      points: '区分三兄弟的一句话：穿透=数据不存在，击穿=单点过期瞬间，雪崩=成片失效。\n防法关键词：布隆过滤器/空值缓存、互斥重建/逻辑过期、TTL 随机/多级缓存/高可用。\n布隆过滤器「可能误判存在、绝不误判不存在」——这句话说对就赢了。',
    };
  }

  /* ============ 5. 为什么需要一致性哈希？ ============ */
  function qHash() {
    const nodes3 = () => [80, 300, 520].map((x, i) => box(x, 40, 120, 44, 'node ' + (i + 1), { stroke: C.blue, color: C.blue })).join('');
    const L = [
      () => nodes3() + txt(380, 118, '普通取模：node = hash(key) % 3 —— 数据分布均匀，代码一行', { anchor: 'middle', fs: 12 }),
      () => nodes3() + box(590, 100, 120, 44, 'node 4（新）', { stroke: C.clay, color: C.clay, dashed: true }) +
        txt(380, 176, '扩到 4 台后 mod 4：绝大多数 key 的落点全部改变 → 缓存几乎全量失效', { anchor: 'middle', color: C.clay, fs: 12, fw: 600 }),
      () => `<circle cx="380" cy="240" r="86" fill="none" stroke="${C.line}" stroke-width="10"/>` +
        [210, 330, 450].map((a, i) => {
          const rad = (a - 90) * Math.PI / 180, x = 380 + 86 * Math.cos(rad), y = 240 + 86 * Math.sin(rad);
          return `<circle cx="${x}" cy="${y}" r="13" fill="${C.blue}"/>` + txt(x, y + 30, 'node ' + (i + 1), { anchor: 'middle', color: C.blue, fs: 11, fw: 600 });
        }).join('') +
        txt(380, 130, '换思路：把节点和 key 都映射到 0 ~ 2³² 的环上', { anchor: 'middle', fs: 12 }),
      () => {
        const rad = (160 - 90) * Math.PI / 180, x = 380 + 86 * Math.cos(rad), y = 240 + 86 * Math.sin(rad);
        return `<circle cx="380" cy="240" r="86" fill="none" stroke="${C.line}" stroke-width="10"/>` +
          `<circle cx="${x}" cy="${y}" r="6" fill="${C.accent}"/>` + txt(x + 14, y - 6, 'key', { color: C.accent, fs: 11, fw: 600 }) +
          `<path d="M ${x} ${y} A 86 86 0 0 1 466 240" fill="none" stroke="${C.moss}" stroke-width="3" stroke-dasharray="6 4"/>` +
          `<circle cx="466" cy="240" r="13" fill="${C.moss}"/>` + txt(466, 272, '命中 node', { anchor: 'middle', color: C.moss, fs: 11, fw: 600 }) +
          txt(380, 130, 'key 顺时针找最近的节点 —— 节点和 key 用同一个哈希空间', { anchor: 'middle', fs: 12 });
      },
      () => `<circle cx="380" cy="240" r="86" fill="none" stroke="${C.line}" stroke-width="10"/>` +
        [150, 270, 390].map(a => {
          const rad = (a - 90) * Math.PI / 180;
          return `<circle cx="${380 + 86 * Math.cos(rad)}" cy="${240 + 86 * Math.sin(rad)}" r="13" fill="${C.blue}"/>`;
        }).join('') +
        `<circle cx="${380 + 86 * Math.cos((345 - 90) * Math.PI / 180)}" cy="${240 + 86 * Math.sin((345 - 90) * Math.PI / 180)}" r="13" fill="${C.clay}"/>` +
        `<path d="M ${380 + 86 * Math.cos((270 - 90) * Math.PI / 180)} ${240 + 86 * Math.sin((270 - 90) * Math.PI / 180)} A 86 86 0 0 1 ${380 + 86 * Math.cos((345 - 90) * Math.PI / 180)} ${240 + 86 * Math.sin((345 - 90) * Math.PI / 180)}" fill="none" stroke="${C.clay}" stroke-width="5"/>` +
        txt(660, 240, '只有这一段', { color: C.clay, fs: 11, fw: 600 }) +
        txt(380, 130, '新节点上环：只有「逆时针相邻段」的 key 要搬家 —— 迁移量 ≈ K/N', { anchor: 'middle', fs: 12 }),
      () => `<circle cx="380" cy="240" r="86" fill="none" stroke="${C.line}" stroke-width="10"/>` +
        [30, 80, 130, 180, 230, 280, 330, 380, 430].map(a => {
          const rad = (a - 90) * Math.PI / 180;
          return `<circle cx="${380 + 86 * Math.cos(rad)}" cy="${240 + 86 * Math.sin(rad)}" r="6" fill="${[C.blue, C.moss, C.brass, C.mauve][a / 50 % 4 | 0]}"/>`;
        }).join('') +
        txt(380, 130, '数据倾斜？每个物理节点挂 100~200 个虚拟节点，环上分布立刻均匀', { anchor: 'middle', fs: 12 }) +
        txt(380, 356, 'Redis Cluster 的 16384 个 slot 是同一思想的离散版； consistency hash 也用于负载均衡、分库分表', { anchor: 'middle', color: C.faint, fs: 11.5 }),
    ];
    return {
      id: 'hash-ring', cat: '分布式', level: '进阶', hot: true,
      q: '为什么需要一致性哈希？',
      answer: '普通取模 hash(key) % N 在 N 变化时几乎所有 key 的落点都会改变——扩容瞬间缓存全量失效。一致性哈希把节点和 key 映射到同一个 0~2³² 的环上，key 顺时针找最近节点：增删节点只影响相邻一段，迁移量约 K/N；再引入虚拟节点解决节点少时的数据倾斜。',
      steps: [
        { title: '普通取模：好用到扩容那一刻', text: 'hash(key) % N 简单均匀。但 N 从 3 改 4，几乎所有 key 的模都变了：缓存场景下等于一夜之间全量失效，数据库被回源打爆。' },
        { title: '问题的本质', text: '取模把「节点的数量」织进了每一个 key 的落点里。想要平滑扩缩容，就必须让 key 的落点与节点数量解耦。' },
        { title: '把万物放到环上', text: '一致性哈希用 0 ~ 2³² 的环：节点按 hash(节点名) 上环，key 也按 hash(key) 上环，key 顺时针遇到的第一个节点就是它的归属。落点只与「环上的相对位置」有关，与节点个数无关。' },
        { title: '顺时针找主', text: 'key 落在环上之后沿顺时针走，碰到的第一个节点收下它。因为节点和 key 用的是同一个哈希函数，整个过程不需要任何全局表。' },
        { title: '扩容只搬一段', text: '新节点上环，只会接管「它与逆时针方向相邻节点之间」那一段弧上的 key——理论上恰好迁移 K/N。摘节点同理，数据移交下一个顺时针节点。' },
        { title: '虚拟节点与真实世界', text: '节点少时环会被切得不均匀（数据倾斜）：给每个物理节点挂 100~200 个虚拟节点（哈希字符串后缀），环上分布立刻均匀。Redis Cluster 的 16384 个 slot、分库分表中间件，都是这套思想。' },
      ],
      figure: { vb: '0 0 760 380', draw: n => layers(n, L, '0 0 760 380') },
      followups: [
        ['虚拟节点为什么能解决倾斜？', '物理节点少时各自分到的弧段长短随机、方差大；虚拟节点把每个物理节点拆成上百个落点，大数定律把分布抹平。'],
        ['Redis Cluster 为什么用 slot 不直接用环？', '16384 个 slot 是离散化：key→slot→节点两级映射，迁移以 slot 为单位，运维可控、实现简单。'],
        ['节点宕机数据去哪了？', '顺时针移交下一个节点；生产上必须配副本（每个数据落在 N 个顺时针节点）否则单点即丢数据。'],
        ['一致性哈希还有哪些用途？', '负载均衡（请求粘住同一后端）、分布式存储（Dynamo/Cassandra）、CDN 边缘节点选择。'],
      ],
      lab: { href: 'apps/system-lab/#/hash-ring', label: '打开 System Lab · 一致性哈希 vs 取模的迁移率实测' },
      points: '答题主线：取模的问题（全量搬家）→ 环 + 顺时针 → 迁移量 K/N → 虚拟节点防倾斜。\n数字要背：2³² 环、迁移量 ≈ K/N、Redis Cluster 16384 slot。\n那句「key 的落点与节点数量解耦」是整个算法的灵魂。',
    };
  }

  /* ============ 5. 为什么需要一致性哈希？ ============ */
  function qHash() {
    const RING = { cx: 380, cy: 252, r: 86 };
    const pt = a => { const rad = (a - 90) * Math.PI / 180; return [RING.cx + RING.r * Math.cos(rad), RING.cy + RING.r * Math.sin(rad)]; };
    const ring = () => `<circle cx="${RING.cx}" cy="${RING.cy}" r="${RING.r}" fill="none" stroke="${C.line}" stroke-width="10"/>`;
    const nodeAt = (a, color, name) => {
      const [x, y] = pt(a);
      const [lx, ly] = [RING.cx + (RING.r + 26) * Math.cos((a - 90) * Math.PI / 180), RING.cy + (RING.r + 26) * Math.sin((a - 90) * Math.PI / 180)];
      return `<circle cx="${x}" cy="${y}" r="13" fill="${color}"/>` +
        txt(lx, ly + 4, name, { anchor: 'middle', color, fs: 11.5, fw: 600 });
    };
    const arc = (a1, a2, color, w2) => `<path d="M ${pt(a1).join(' ')} A ${RING.r} ${RING.r} 0 0 1 ${pt(a2).join(' ')}" fill="none" stroke="${color}" stroke-width="${w2 || 3}" stroke-dasharray="6 4"/>`;
    const mod = (n) => [80, 300, 520].slice(0, n).map((x, i) => box(x, 28, 110, 42, 'node ' + (i + 1), { stroke: C.blue, color: C.blue })).join('') +
      (n === 4 ? box(632, 28, 110, 42, 'node 4', { stroke: C.clay, color: C.clay, dashed: true }) : '') +
      txt(380, n === 4 ? 112 : 90, n === 3 ? 'hash(key) % 3 —— 简单、均匀，一行代码' : '扩到 4 台：mod 4，几乎每个 key 的落点都变了', { anchor: 'middle', fs: 12, color: n === 4 ? C.clay : C.muted, fw: n === 4 ? 600 : 400 });
    const L = [
      () => mod(3),
      () => mod(4) + txt(380, 134, '缓存场景下 = 一夜之间全量失效 —— key 的落点和「节点个数」耦合死了', { anchor: 'middle', fs: 12, color: C.clay, fw: 600 }),
      () => ring() + nodeAt(100, C.blue, 'node 1') + nodeAt(220, C.moss, 'node 2') + nodeAt(340, C.brass, 'node 3') +
        txt(380, 368, '换思路：节点和 key 都哈希到 0 ~ 2³² 的环上', { anchor: 'middle', fs: 12, fw: 600 }),
      () => ring() + nodeAt(100, C.blue, 'node 1') + nodeAt(220, C.moss, 'node 2') + nodeAt(340, C.brass, 'node 3') +
        (() => { const [x, y] = pt(160); return `<circle cx="${x}" cy="${y}" r="6.5" fill="${C.accent}"/>` + arc(160, 220, C.moss) +
          txt(x - 66, y + 4, 'key', { color: C.accent, fs: 11, fw: 600 }); })() +
        txt(380, 390, 'key 上环后顺时针走，碰到的第一个节点就是归属', { anchor: 'middle', fs: 12 }),
      () => ring() + nodeAt(100, C.blue, 'node 1') + nodeAt(220, C.moss, 'node 2') + nodeAt(340, C.brass, 'node 3') +
        `<circle cx="${pt(290)[0]}" cy="${pt(290)[1]}" r="13" fill="${C.clay}"/>` + txt(pt(290)[0] + 22, pt(290)[1] + 4, 'new', { color: C.clay, fs: 11, fw: 600 }) +
        `<path d="M ${pt(220).join(' ')} A ${RING.r} ${RING.r} 0 0 1 ${pt(290).join(' ')}" fill="none" stroke="${C.clay}" stroke-width="5"/>` +
        txt(380, 412, '新节点上环：只接管它与逆时针相邻节点之间那段弧的 key —— 迁移量 ≈ K/N', { anchor: 'middle', fs: 12 }),
      () => ring() + [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((a, i) => {
        const [x, y] = pt(a);
        return `<circle cx="${x}" cy="${y}" r="6" fill="${[C.blue, C.moss, C.brass][i % 3]}"/>`;
      }).join('') +
      txt(380, 436, '节点少会倾斜：每个物理节点挂 100~200 个虚拟节点，分布立刻均匀', { anchor: 'middle', fs: 12 }) +
      txt(380, 458, 'Redis Cluster 的 16384 个 slot 是同一思想的离散版；负载均衡、分库分表也都在用', { anchor: 'middle', color: C.faint, fs: 11.5 }),
    ];
    return {
      id: 'hash-ring', cat: '分布式', level: '进阶', hot: true,
      q: '为什么需要一致性哈希？',
      answer: '普通取模 hash(key) % N 在 N 变化时几乎所有 key 的落点都会改变——扩容瞬间缓存全量失效。一致性哈希把节点和 key 映射到同一个 0~2³² 的环上，key 顺时针找最近节点：增删节点只影响相邻一段弧，迁移量约 K/N；再引入虚拟节点解决节点少时的数据倾斜。',
      steps: [
        { title: '普通取模：好用到扩容那一刻', text: 'hash(key) % N 简单、均匀。但 N 从 3 改成 4，几乎所有 key 的模都变了：缓存场景等于一夜全量失效，数据库被回源打爆。' },
        { title: '问题的本质', text: '取模把「节点的个数」织进了每一个 key 的落点。想平滑扩缩容，必须让落点与节点数量解耦——记住这句话，整个算法都是它的推论。' },
        { title: '把万物放到环上', text: '0 ~ 2³² 的哈希环：节点按 hash(节点名) 上环，key 也按 hash(key) 上环，同一个函数、同一个空间。' },
        { title: '顺时针找主', text: 'key 沿顺时针走，碰到的第一个节点就是归属。落点只取决于环上的相对位置，与节点个数无关。' },
        { title: '扩容只搬一段', text: '新节点上环，只接管它与逆时针相邻节点之间那一段弧的 key——理论迁移量恰好 K/N；摘节点同理，数据顺时针移交。' },
        { title: '虚拟节点与真实世界', text: '节点少时环被切得不均匀（数据倾斜）：给每个物理节点挂 100~200 个虚拟节点，大数定律把分布抹平。Redis Cluster 的 16384 个 slot、一致性负载均衡、分库分表中间件，都是这套思想。' },
      ],
      figure: { vb: '0 0 760 480', draw: n => layers(n, L, '0 0 760 480') },
      followups: [
        ['虚拟节点为什么能解决倾斜？', '物理节点少时各自分到的弧段长短随机、方差大；拆成上百个落点后大数定律抹平分布。'],
        ['Redis Cluster 为什么用 slot 不直接用环？', '16384 个 slot 是离散化：key→slot→节点两级映射，迁移以 slot 为单位，实现简单、运维可控。'],
        ['节点宕机数据怎么办？', '顺时针移交下一个节点；生产必须配副本（数据落在顺时针 N 个节点），否则单点即丢数据。'],
        ['除了缓存还有哪里用？', '负载均衡（请求粘住同一后端）、Dynamo/Cassandra 分布式存储、CDN 节点选择。'],
      ],
      lab: { href: 'apps/system-lab/#/hash-ring', label: '打开 System Lab · 一致性哈希 vs 取模，迁移率当场实测' },
      points: '答题主线：取模的问题（全量搬家）→ 环 + 顺时针 → 迁移量 ≈ K/N → 虚拟节点防倾斜。\n要背的数字：2³² 环、迁移量 ≈ K/N、Redis Cluster 16384 slot。\n灵魂句：「让 key 的落点与节点数量解耦」。',
    };
  }

  /* ============ 6. 雪花 ID 为什么这样设计位段？ ============ */
  function qSnow() {
    const BAR = { x: 100, y: 40, h: 46 };
    const seg = [
      { w: 16, label: '1', name: '符号位', color: C.blue },
      { w: 280, label: '41', name: '毫秒时间戳', color: C.accent },
      { w: 120, label: '10', name: '机器位', color: C.moss },
      { w: 144, label: '12', name: '序列号', color: C.brass },
    ];
    let bx = BAR.x;
    const segBox = seg.map(s => {
      const x = bx; bx += s.w;
      return `<rect x="${x}" y="${BAR.y}" width="${s.w}" height="${BAR.h}" fill="${C.surface2}" stroke="${s.color}" stroke-width="1.6"/>` +
        `<text x="${x + s.w / 2}" y="${BAR.y + 28}" text-anchor="middle" font-size="15" font-weight="700" fill="${s.color}" font-family="${MONO}">${s.label}</text>` +
        `<text x="${x + s.w / 2}" y="${BAR.y - 10}" text-anchor="middle" font-size="11.5" fill="${C.muted}">${s.name}</text>`;
    }).join('');
    const hi = (x, w2, color) => `<rect x="${x}" y="${BAR.y - 5}" width="${w2}" height="${BAR.h + 10}" fill="none" stroke="${color}" stroke-width="2.4" rx="4"/>`;
    const note = (y, t, color) => txt(380, y, t, { anchor: 'middle', fs: 12, color: color || C.muted });
    const L = [
      () => segBox + note(120, '一个 64 位的 long：从高位到低位分四段，每段管一件事', C.accent),
      () => hi(100, 16, C.blue) + note(146, '符号位恒为 0：ID 永远是正数（顺手兼容对负数 ID 敏感的系统）', C.blue),
      () => hi(116, 280, C.accent) + note(172, '41 位毫秒时间戳：2⁴¹ ms ≈ 69 年，起点是自定义纪元（项目上线日），ID 天然趋势递增', C.accent),
      () => hi(396, 120, C.moss) + note(198, '10 位机器位：最多 1024 台发号器（常拆 机房 5 + 机器 5）；对比 UUID：无序、太长、索引页分裂', C.moss),
      () => hi(516, 144, C.brass) + note(224, '12 位序列号：同毫秒同机自增 4096 个，用尽自旋等下一毫秒 —— 单机峰值 ≈ 409 万/秒', C.brass),
      () => note(250, '唯一的坑：时钟回拨 —— NTP 把时间拨回去就可能重号', C.clay) +
        arrow(430, 246, 330, 246, { color: C.clay, label: '时间被拨回', mono: true }) +
        note(274, '对策：小幅回拨自旋等待；大幅拒绝发号并告警；或预留备用机位', C.faint),
    ];
    return {
      id: 'snowflake', cat: '分布式', level: '进阶', hot: false,
      q: '雪花 ID 为什么这样设计位段？',
      answer: '64 位 = 1 符号位 + 41 位毫秒时间戳（约 69 年，趋势递增）+ 10 位机器位（1024 台发号器）+ 12 位序列号（同一毫秒单机 4096 个）。本地按位生成、不依赖网络、趋势递增对索引友好；设计上唯一要处理的硬问题是时钟回拨。',
      steps: [
        { title: '先看整体：一条 64 位的位段图', text: '雪花 ID 是一个 long：1 位符号 + 41 位时间戳 + 10 位机器 + 12 位序列。位段不是拍的——每一段的长度都是一道算术题。' },
        { title: '符号位：为什么占 1 位', text: '恒为 0，保证 ID 永远是正数。这一位是「语言兼容税」：有些系统/协议对负数 ID 敏感，牺牲 1 位买平安。' },
        { title: '41 位时间戳：约 69 年', text: '2⁴¹ 毫秒 ≈ 69.7 年。关键细节：起点是自定义纪元（如项目上线日）而非 1970，等于把 69 年用在真正会发号的岁月里。ID 按时间拼在高位，天然趋势递增——这对 B+ 树索引极其友好。' },
        { title: '10 位机器位：1024 台', text: '标识「谁来发号」，常拆成 5 位机房 + 5 位机器。对比：UUID 无序且太长（索引页分裂）；号段/DB 自增要联网、是单点。雪花 ID 本地生成，这是它成为分库分表标配的原因。' },
        { title: '12 位序列号：单毫秒 4096 个', text: '同一毫秒内从 0 自增；4096 用尽就自旋等到下一毫秒再发。单机理论上限 ≈ 409 万 ID/秒——绝大多数业务到不了这个天花板。' },
        { title: '唯一的硬问题：时钟回拨', text: '机器时间被 NTP 拨回过去，就可能发出与历史重复的 ID。对策按回拨幅度分级：小回拨自旋等待追上；大回拨拒绝发号并告警；激进方案用备用位/逻辑时钟。答出这题，面试官就知道你真用过。' },
      ],
      figure: { vb: '0 0 760 296', draw: n => layers(n, L, '0 0 760 296') },
      followups: [
        ['41 位为什么从自定义纪元算？', '时间戳存的是「与起点的差值」，起点选项目上线日，69 年全部用在发号期，不浪费在 1970~今年。'],
        ['雪花 ID 和 UUID 怎么选？', '要趋势递增、要作主键、要短——雪花；只求全局唯一、不经数据库索引——UUID 也行。核心差异是有序性。'],
        ['机器位怎么分配才不会撞？', '静态配置（配置中心下发）或 ZooKeeper 顺序节点分配；容器环境用 StatefulSet 序号。撞了才会重 ID，必须严防。'],
        ['单毫秒 4096 个不够用怎么办？', '位段整体左移一位给序列（牺牲机器位），或直接上号段/Leaf 方案；先测再改，别背答案。'],
      ],
      lab: { href: 'apps/system-lab/#/snowflake', label: '打开 System Lab · 雪花 ID 位级拆解 + 时钟回拨模拟' },
      points: '位段口诀：1 符号 + 41 时间 + 10 机器 + 12 序列。\n每段是一道算术题：69 年、1024 台、4096/毫秒、409 万/秒。\n必须主动提时钟回拨与对策——这是区分「背过」和「用过」的分水岭。',
    };
  }

  /* ============ 7. volatile 到底保证什么、不保证什么？ ============ */
  function qVol() {
    const mem = (v) => box(320, 24, 120, 46, '主存 stop=' + v, { stroke: C.lineS, mono: true, fs: 12 });
    const t1 = (y) => box(60, y, 130, 46, '线程 A', { stroke: C.blue, color: C.blue });
    const t2 = (y) => box(570, y, 130, 46, '线程 B', { stroke: C.mauve, color: C.mauve });
    const L = [
      () => mem(false) + t1(120) + t2(120) +
        txt(380, 200, 'Java 内存模型：每个线程有自己的工作内存，共享变量以主存为准', { anchor: 'middle', fs: 12 }),
      () => mem(false) + t1(120) + t2(120) +
        box(90, 210, 130, 40, '副本 stop=false', { dashed: true, fs: 11.5, mono: true }) +
        arrow(125, 166, 150, 206, { color: C.blue }) +
        txt(380, 280, 'A 把 stop=true 只写进了自己的工作内存，B 仍在读自己的旧副本', { anchor: 'middle', fs: 12 }) +
        txt(380, 302, '→ B 的 while(!stop) 永远转下去：可见性问题，普通变量不承诺及时同步', { anchor: 'middle', color: C.clay, fs: 12, fw: 600 }),
      () => mem(true) + t1(120) + t2(120) +
        arrow(190, 143, 318, 60, { color: C.accent, label: '写 → 立即刷主存' }) +
        arrow(566, 143, 444, 60, { color: C.accent, label: '读 → 直达主存' }) +
        txt(380, 330, '加 volatile 后：写立即刷回主存、读绕过副本，B 马上看到 true，循环退出', { anchor: 'middle', fs: 12 }),
      () => txt(380, 364, '底层依据：volatile 写 happens-before 后续的 volatile 读 —— 这是 JMM 规则，不是玄学', { anchor: 'middle', fs: 12, fw: 600 }) +
        arrow(230, 386, 530, 386, { color: C.moss, label: 'A 的写 ═══➤ B 的读（先行发生）' }),
      () => txt(380, 420, '但 volatile 不保证原子性：i++ 是「读-改-写」三步，两个线程交错就丢更新', { anchor: 'middle', color: C.clay, fs: 12, fw: 600 }) +
        ['读 i=5', '+1', '写 i=6'].map((s, i) => box(200 + i * 90, 432, 76, 34, s, { fs: 11, mono: true })).join('') +
        ['读 i=5', '+1', '写 i=6'].map((s, i) => box(470 + i * 90, 432, 76, 34, s, { fs: 11, mono: true, stroke: C.clay, color: C.clay })).join('') +
        txt(380, 492, '两次 +1，结果却是 6 而不是 7 —— 要原子性请用 synchronized / AtomicInteger', { anchor: 'middle', fs: 12 }),
      () => txt(380, 524, 'DCL 单例里的 volatile：new 不是原子的 —— ①分配内存 ②初始化 ③引用指向，②③可能重排', { anchor: 'middle', fs: 12 }) +
        txt(380, 546, '重排后别的线程可能拿到「已指向、但还没初始化」的半成品对象 → volatile 禁止这次重排', { anchor: 'middle', color: C.faint, fs: 11.5 }),
    ];
    return {
      id: 'volatile', cat: 'Java 并发', level: '进阶', hot: true,
      q: 'volatile 到底保证什么、不保证什么？',
      answer: '保证两件事：可见性（写立即刷主存、读绕过工作内存副本，靠 happens-before 兜底）和有序性（内存屏障禁止指令重排，DCL 单例的正确性就靠它）；另外附赠 long/double 的原子性。不保证复合操作的原子性——i++ 三步交错照样丢更新，要原子用锁或 CAS。',
      steps: [
        { title: '问题起点：工作内存副本', text: 'JMM 里每个线程用自己的工作内存，共享变量要靠主存同步。普通变量不承诺「什么时候同步」——这就是可见性问题的温床。' },
        { title: '没有 volatile 会怎样', text: '线程 A 把 stop=true 写在自己工作内存里，B 读不到，while(!stop) 永远转下去。不是 bug 的 bug：单线程看代码毫无问题，并发一跑就停不下来。' },
        { title: 'volatile 的可见性', text: '写 volatile 变量立即刷回主存；读它绕过副本直达主存。A 一写、B 立刻看见——循环能正常退出了。' },
        { title: '这不是魔法，是 happens-before', text: 'JMM 白纸黑字：volatile 写先行发生于后续的 volatile 读。答题时点出这一条，比说「立即刷主存」高一个段位——前者是规则，后者只是它的效果。' },
        { title: '不保证原子性：i++ 的教训', text: 'i++ 是读、改、写三步。两个线程同时读到 5，各自 +1 再写回，结果是 6 而不是 7——volatile 管不了交错。要原子性：synchronized、AtomicInteger（CAS）或锁。' },
        { title: '有序性：DCL 为什么需要它', text: 'new 一个对象分三步：分配内存 → 初始化 → 引用指向；② ③ 可能被重排。DCL 双重检查里，别的线程可能拿到「引用非空但对象还没初始化完」的半成品。volatile 禁止这次重排，DCL 从此正确。' },
      ],
      figure: { vb: '0 0 760 570', draw: n => layers(n, L, '0 0 760 570') },
      followups: [
        ['volatile 和 synchronized 怎么选？', '只要可见性/有序性且变量独立写就用 volatile（轻）；有复合操作或需要互斥就 synchronized（重）。'],
        ['happens-before 能说几条？', '程序顺序、监视器锁、volatile、线程 start/join、传递性……至少说出「volatile 写-读」和「解锁先行于加锁」两条并会用。'],
        ['CAS 是什么？ABA 问题呢？', 'Compare-And-Swap 硬件原子指令；ABA 用版本号（AtomicStampedReference）解——值回来了但中间变过。'],
        ['long/double 为什么特殊？', '64 位变量在 32 位 JVM 上读写可能撕裂，volatile 附赠这两类的原子性——少有人知道的加分点。'],
      ],
      lab: { href: 'apps/jmm-lab/', label: '打开 JMM Lab · 可见性动画 + 20 万次交错重排实验' },
      points: '两保一送两不保：保可见性、保有序性，送 long/double 原子性；不保复合原子、不保互斥。\n正确场景：状态标志、DCL、独立写入。\n把「立即刷主存」升级成「volatile 写 happens-before 后续读」，答案立刻高一档。',
    };
  }

  /* ============ 8. 线程池 7 个参数怎么配？任务怎么走？ ============ */
  function qPool() {
    const cell = (x, y, t, color, filled) => `<rect x="${x}" y="${y}" width="64" height="44" rx="8" fill="${filled ? color : C.surface}" stroke="${color}" stroke-width="1.5" ${filled ? '' : 'stroke-dasharray="5 4"'}/>` +
      `<text x="${x + 32}" y="${y + 26}" text-anchor="middle" font-size="11.5" font-weight="600" fill="${filled ? '#f2efe8' : C.faint}" font-family="${SANS}">${t}</text>`;
    const queueBox = (n, full) => box(330, 108, 110, 46, full ? '队列 满满' : '队列排队', { stroke: full ? C.brass : C.muted, color: full ? C.brass : C.muted, fs: 12 });
    const L = [
      () => arrow(50, 60, 240, 60, { color: C.blue, label: '提交任务 submit()' }) +
        box(244, 34, 120, 52, '线程池', { stroke: C.accent, color: C.accent }) +
        txt(380, 118, '池化的意义：线程复用省掉创建销毁的开销，也把并发度攥在自己手里', { anchor: 'middle', fs: 12 }),
      () => ['核心', '核心', '核心'].map((t, i) => cell(244 + i * 70, 150, t, C.moss, true)).join('') +
        txt(380, 224, '第一站：corePoolSize（核心线程）—— 来了就常驻，默认不回收', { anchor: 'middle', fs: 12, fw: 600 }),
      () => ['核心', '核心', '核心'].map((t, i) => cell(244 + i * 70, 150, t, C.moss, true)).join('') +
        arrow(448, 172, 460, 172, { color: C.muted }) +
        box(462, 150, 96, 44, '队列排队', { stroke: C.muted, color: C.muted, fs: 11.5 }) +
        txt(380, 248, '核心满了？先排队（workQueue）—— 注意：不是先开新线程', { anchor: 'middle', fs: 12 }),
      () => ['核心', '核心', '核心'].map((t, i) => cell(244 + i * 70, 150, t, C.moss, true)).join('') +
        box(462, 150, 96, 44, '队列 满', { stroke: C.brass, color: C.brass, fs: 11.5 }) +
        arrow(558, 172, 574, 172, { color: C.blue }) +
        ['非核心', '非核心'].map((t, i) => cell(578 + i * 70, 150, t, C.blue, true)).join('') +
        txt(380, 272, '队列也满了？才开非核心线程，直到 maximumPoolSize —— 90% 的人这里答反', { anchor: 'middle', color: C.accent, fs: 12, fw: 600 }),
      () => txt(380, 306, '全满 → 拒绝策略 handler 四选一', { anchor: 'middle', fs: 12 }) +
        ['Abort 抛异常', 'CallerRuns 自己跑', 'Discard 丢弃', 'DiscardOldest 丢最老'].map((t, i) =>
          box(120 + i * 136, 318, 124, 36, t, { fs: 10.5, stroke: C.clay, color: C.clay })).join('') +
        txt(380, 382, 'keepAliveTime：非核心线程空闲多久被回收（allowCoreThreadTimeOut 可连核心一起）', { anchor: 'middle', color: C.faint, fs: 11.5 }),
      () => txt(380, 414, '参数怎么估：CPU 密集 ≈ N+1；IO 密集 ≈ N × (1 + 等待/计算)，然后压测修正', { anchor: 'middle', fs: 12, fw: 600 }) +
        txt(380, 440, 'Executors 快捷方法别用：newFixedThreadPool 是无界队列 → max 形同虚设，OOM 等着你', { anchor: 'middle', color: C.clay, fs: 12 }),
    ];
    return {
      id: 'thread-pool', cat: 'Java 并发', level: '进阶', hot: true,
      q: '线程池 7 个参数怎么配？任务来了怎么走？',
      answer: '7 参数：corePoolSize、maximumPoolSize、keepAliveTime + unit、workQueue、threadFactory、handler。提交流程背熟这个顺序：核心线程 → 队列 → 非核心线程 → 拒绝策略——注意是「队列满了才开非核心」，不是先开满线程。参数估算：CPU 密集 N+1，IO 密集 N×(1+等待比)，然后压测修正。',
      steps: [
        { title: '为什么要有线程池', text: '线程的创建销毁是系统调用，贵；无限制开线程会拖垮内存和调度。池化 = 复用 + 把并发度变成一个可控的参数。' },
        { title: '第一站：核心线程', text: '任务提交，池里线程数还没到 corePoolSize 就直接建核心线程执行，核心线程默认常驻不回收。这是最常用的容量，对应「日常流量」。' },
        { title: '第二站：先排队', text: '核心满了，任务进 workQueue 排队等待。注意顺序：是先排队、不是先扩线程——很多人这一步答反。队列选有界还是无界，直接决定池的行为（见最后一步）。' },
        { title: '第三站：队列满才扩到 max', text: '队列也满了，才创建非核心线程，直到 maximumPoolSize 封顶。core=3、max=5 的池，最多同时 5 个线程在跑。keepAliveTime 管非核心线程闲多久被回收。' },
        { title: '第四站：拒绝策略', text: '线程满 + 队列满，触发 handler 四选一：AbortPolicy 抛异常（默认，快速失败）、CallerRunsPolicy 让提交者自己跑（天然限流）、Discard 静默丢、DiscardOldest 丢队首。选哪种是业务问题：金融场景宁可慢不能丢。' },
        { title: '参数怎么估 + 为什么别用 Executors', text: '经验公式：CPU 密集 ≈ N+1，IO 密集 ≈ N×(1+等待/计算)，再用压测修正。newFixedThreadPool 用无界 LinkedBlockingQueue——队列永远不满，max 形同虚设，任务堆积到 OOM；这也是《阿里规约》要求手动 new ThreadPoolExecutor 的原因。' },
      ],
      figure: { vb: '0 0 760 470', draw: n => layers(n, L, '0 0 760 470') },
      followups: [
        ['shutdown 和 shutdownNow 区别？', 'shutdown 停止接新活、把队列跑完；shutdownNow 中断正在跑的并返回未执行任务。'],
        ['怎么监控线程池健康？', 'getActiveCount/getQueue().size()/completedTaskCount + 拒绝次数计数；接 Micrometer，池要起名字（threadFactory）。'],
        ['无界队列为什么危险？', '永远不会满 → max 和拒绝策略全部失效，任务无限堆积直到 OOM；高峰流量回落后还占着内存。'],
        ['动态调参怎么实现？', 'setCorePoolSize/setMaximumPoolSize 运行时可调（美团的动态线程池方案），配合配置中心推送。'],
      ],
      lab: { href: 'apps/jmm-lab/#/states', label: '打开 JMM Lab · 线程六状态机：线程在池里的生命周期' },
      points: '流程口诀：核心 → 队列 → 非核心 → 拒绝（先排队后扩容，最常考的反直觉点）。\n7 参数 = 3 个数量（core/max/queue）+ 1 个时间 + 1 个工厂 + 1 个拒绝策略。\n结尾主动说「不用 Executors」和无界队列的 OOM 风险——工程素养分。',
    };
  }

  w.QA_DECK = [qTcp(), qUrl(), qIso(), qCache(), qHash(), qSnow(), qVol(), qPool()];
})(typeof window !== 'undefined' ? window : globalThis);
