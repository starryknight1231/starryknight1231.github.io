/* ============ QA Part 1 · 网络七题 ============
   TIME_WAIT / 可靠传输 / 粘包拆包 / UDP vs TCP / HTTP 状态码 / HTTPS / Cookie-Session-JWT。
   纯数据 + SVG 字符串，不碰 DOM；画图助手复用 qa-deck.js 暴露的 w.__qaHelpers。
   每题 figure.draw(n)：第 0..n 层显影（opacity 1），之后降 0.15；图层数与 steps 一一对应。 */
(function (w) {
  'use strict';
  const { C, SANS, MONO, box, txt, arrow, chip, layers } = w.__qaHelpers;

  /* ============ 1. TIME_WAIT 为什么要等 2MSL？ ============ */
  function q2msl() {
    const L = [
      () => box(50, 24, 150, 46, '主动关闭方 C') + box(560, 24, 150, 46, '被动关闭方 S') +
        `<line x1="125" y1="70" x2="125" y2="334" stroke="${C.line}" stroke-dasharray="4 4"/>` +
        `<line x1="635" y1="70" x2="635" y2="334" stroke="${C.line}" stroke-dasharray="4 4"/>` +
        arrow(132, 94, 628, 94, { color: C.blue, label: '① FIN：我发完了' }) +
        arrow(628, 118, 132, 118, { color: C.teal, label: '② ACK：收到（我还没完）' }) +
        txt(380, 146, 'S 可能还有数据没发完，所以「确认」和它自己的 FIN 分两次发', { anchor: 'middle', fs: 12 }),
      () => arrow(628, 182, 132, 182, { color: C.blue, label: '③ FIN：我也发完了' }) +
        arrow(132, 206, 628, 206, { color: C.accent, label: '④ ACK：挥手完成' }) +
        chip(50, 220, 'C：TIME_WAIT', C.accent) + chip(560, 220, 'S：CLOSED', C.moss) +
        txt(380, 266, 'C 发完最后的 ACK 并不直接关闭，而是停在 TIME_WAIT 站岗——为什么？看下面两步', { anchor: 'middle', fs: 12.5, fw: 600, color: C.accent }),
      () => arrow(628, 300, 132, 300, { color: C.clay, label: 'S 重传 FIN（没等到 ACK）', dashed: true }) +
        arrow(132, 326, 628, 326, { color: C.moss, label: 'C 重发 ACK（还停在 TIME_WAIT）', dashed: true }) +
        txt(380, 352, '只有停在 TIME_WAIT 的 C 能接住 FIN、补发 ACK；已经关了的话，S 只能收到 RST，报「连接异常」', { anchor: 'middle', fs: 12 }),
      () => box(50, 380, 190, 44, '旧连接的迟到报文', { stroke: C.clay, color: C.clay }) +
        box(520, 380, 190, 44, '复用四元组的新连接', { stroke: C.moss, color: C.moss }) +
        arrow(242, 402, 518, 402, { color: C.clay, label: '迟到报文串进来 ✗', dashed: true }) +
        txt(380, 448, 'MSL（报文最大生存时间）：一个报文在网络里允许存活的最长时间；等足 2MSL，旧报文必死', { anchor: 'middle', fs: 12 }),
      () => box(70, 478, 280, 44, 'RFC 793 建议：MSL = 2 分钟', { fs: 12.5 }) +
        box(410, 478, 280, 44, 'Linux 实现：TIME_WAIT = 60 秒', { fs: 12.5, stroke: C.accent, color: C.accent }) +
        txt(380, 546, '教科书答 2MSL ≈ 4 分钟，工程上 Linux 固定 60 秒——两个都提，说明既读过书也上过机', { anchor: 'middle', fs: 12.5, fw: 600 }),
      () => txt(380, 572, '大量 TIME_WAIT 的锅在主动关闭方——谁先 close 谁站岗；危害是占内存、占本地端口', { anchor: 'middle', fs: 12 }) +
        box(36, 588, 228, 40, '① 连接池 / 长连接复用', { stroke: C.moss, color: C.moss, fs: 12 }) +
        box(270, 588, 228, 40, '② tcp_tw_reuse（仅主动连接方）', { fs: 12 }) +
        box(504, 588, 228, 40, '③ 扩大 ip_local_port_range', { fs: 12 }) +
        txt(380, 650, '首选连接池复用；tcp_tw_recycle 因 NAT 下误杀连接已在 Linux 4.12 移除——别再推荐它', { anchor: 'middle', fs: 12 }),
    ];
    return {
      id: 'tcp-2msl', cat: '网络', level: '进阶', hot: true,
      q: 'TIME_WAIT 为什么要等 2MSL？',
      answer: 'TIME_WAIT 等 2MSL 干两件事：一是最后的 ACK 若丢失，还能接住对端重传的 FIN、补发 ACK，让双方体面关闭；二是等本连接的旧报文在网络里自然消亡，避免串进复用同四元组的新连接。RFC 建议 MSL 为 2 分钟，Linux 实现是 60 秒。',
      steps: [
        { title: '先回顾四次挥手（上）', text: '主动关闭方 C 先发 FIN 说「我发完了」，被动方 S 回 ACK 确认——但 S 自己可能还有数据没发完，所以确认和它的 FIN 是分开的两次，此时 S 停在 CLOSE_WAIT 继续干活。' },
        { title: 'TIME_WAIT 登场', text: 'S 把剩余数据发完后也发 FIN，C 回最后一个 ACK：四次挥手完成。注意 C 发完这个 ACK 并不立刻关闭，而是进入 TIME_WAIT，原地站岗一段时间——本题的主角就是这段站岗时间。' },
        { title: '最后的 ACK 丢了怎么办', text: '最后一个 ACK 在路上丢了，S 收不到，会重传 FIN。只有还停在 TIME_WAIT 的 C 能接住它、再补一个 ACK；若 C 已经关闭，只能回 RST（连接被异常重置），S 拿到的是报错而不是安静的关闭。' },
        { title: '让旧报文自然消亡', text: 'MSL（报文最大生存时间，一个报文在网络里允许存活的最长时间）。TIME_WAIT 要撑过一个 MSL（自己的 ACK 可能飞多久）加一个 MSL（对端重传的 FIN 还能活多久）；等足这段时间，才敢让新连接复用同一个四元组（通信双方的 IP 和端口组合）。' },
        { title: '到底等多久', text: 'RFC 793 建议 MSL 取 2 分钟，所以教科书答案是 2MSL ≈ 4 分钟；但 Linux 的实现是固定的 60 秒。面试两个都答：先给理论值，再补一句「Linux 实际 60 秒」，说明你既读过书也踩过机器。' },
        { title: 'TIME_WAIT 泛滥的锅', text: '只有主动关闭的一方才进 TIME_WAIT，满屏 TIME_WAIT 说明你们在疯狂主动断连——典型是短连接、每请求一断。危害是占用内存和本地端口；缓解首选连接池、长连接复用，其次 tcp_tw_reuse 和扩大本地端口范围。' },
      ],
      figure: { vb: '0 0 760 676', draw: n => layers(n, L, '0 0 760 676') },
      followups: [
        ['TIME_WAIT 过多怎么排查？', 'ss -ant 统计状态分布；确认谁在主动关闭——改长连接/连接池，其次 tcp_tw_reuse。'],
        ['CLOSE_WAIT 堆积说明什么？', '被动方收到了 FIN、回了 ACK，但代码一直没调 close()——九成是程序 bug 或资源泄漏。'],
        ['服务端大量 TIME_WAIT 正常吗？', '看谁主动断：短连接网关主动关就会有；更该改的是客户端复用，服务端硬调参数收益有限。'],
        ['同时关闭是什么流程？', '两边同时发 FIN，多出一个 CLOSING 状态，最终仍各自进 TIME_WAIT 等 2MSL。'],
      ],
      lab: { href: 'apps/wire-lab/#/tcp', label: 'Wire Lab · TCP 握手/挥手仿真，TIME_WAIT 有专门观测卡' },
      points: '口诀：等 2MSL =「可靠地关完」（ACK 丢了能重发）+「干净地退场」（旧报文死光）。\n谁主动关闭谁 TIME_WAIT；CLOSE_WAIT 堆积是代码没调 close。\nLinux 实际 60 秒，不是 4 分钟——说出来是加分项。',
    };
  }

  /* ============ 2. TCP 是如何保证可靠传输的？ ============ */
  function qReliable() {
    const L = [
      () => box(150, 26, 210, 44, '发送方：对首部+数据算校验和', { fs: 12 }) + box(400, 26, 210, 44, '接收方：重算并比对', { fs: 12 }) +
        arrow(362, 48, 398, 48, { color: C.blue }) +
        txt(380, 96, '差一位都对不上 → 报文直接丢弃，交给重传机制兜底', { anchor: 'middle', fs: 12.5 }),
      () => box(50, 118, 110, 40, '发送方', { fs: 12 }) + box(600, 118, 110, 40, '接收方', { fs: 12 }) +
        arrow(162, 178, 598, 178, { color: C.blue, label: 'seq = 1001：100 字节数据', mono: true }) +
        arrow(598, 204, 162, 204, { color: C.moss, label: 'ACK = 1101（我还要从 1101 起）', mono: true }) +
        txt(380, 232, '序号给每个字节编号；确认号 = 期望的下一个字节序号（累积确认）', { anchor: 'middle', fs: 12.5 }),
      () => box(60, 258, 300, 46, '超时重传：RTO 到点还没等到 ACK', { fs: 12 }) + box(400, 258, 300, 46, '快速重传：3 个重复 ACK 就重传', { fs: 12 }) +
        txt(380, 330, 'RTO 按 RTT 平滑估计再加裕量，自适应、不拍脑袋；快重传不等超时，抢回时间', { anchor: 'middle', fs: 12.5 }),
      () => `<line x1="215" y1="372" x2="490" y2="372" stroke="${C.accent}" stroke-width="2"/>` +
        txt(352, 366, '发送窗口（对方通告的接收能力）', { anchor: 'middle', color: C.accent, fs: 12, fw: 600 }) +
        box(46, 384, 668, 56, '') +
        `<rect x="50" y="390" width="165" height="44" fill="${C.moss}"/>` +
        `<rect x="215" y="390" width="165" height="44" fill="${C.brass}"/>` +
        `<rect x="380" y="390" width="110" height="44" fill="${C.blue}"/>` +
        `<rect x="490" y="390" width="220" height="44" fill="${C.surface2}"/>` +
        `<line x1="215" y1="390" x2="215" y2="434" stroke="${C.bg}" stroke-width="2"/>` +
        `<line x1="380" y1="390" x2="380" y2="434" stroke="${C.bg}" stroke-width="2"/>` +
        `<line x1="490" y1="390" x2="490" y2="434" stroke="${C.bg}" stroke-width="2"/>` +
        txt(380, 464, '绿 = 已发已确认 · 棕 = 已发未确认 · 蓝 = 可发送 · 灰 = 不可发；收到 ACK，窗口右滑', { anchor: 'middle', fs: 12 }),
      () => txt(380, 492, '拥塞控制四件套：慢启动（指数爬升）→ 拥塞避免（线性 +1）→ 丢包后快重传、快恢复', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        `<path d="M100 555 C 130 551 150 517 195 509 L 300 501 L 300 553 C 340 550 400 537 470 528 L 650 517" fill="none" stroke="${C.moss}" stroke-width="2.4"/>` +
        `<line x1="300" y1="501" x2="300" y2="553" stroke="${C.clay}" stroke-width="1.6" stroke-dasharray="4 3"/>` +
        txt(380, 580, '丢包（虚线处）砍半再恢复；流控防「对方收不下」，拥塞控制防「网络扛不住」', { anchor: 'middle', fs: 12.5, fw: 600, color: C.accent }),
    ];
    return {
      id: 'tcp-reliable', cat: '网络', level: '进阶', hot: true,
      q: 'TCP 是如何保证可靠传输的？',
      answer: 'TCP 靠五大件：校验和检差错、序号+确认对账（确认号 = 期望的下一个字节）、超时重传与快速重传兜底、滑动窗口做流量控制不让对方爆缓冲、拥塞控制防把网络压垮。一句话收尾：流控管「对方收不下」，拥塞控制管「网络扛不住」。',
      steps: [
        { title: '校验和：先检差错', text: '发送方对首部和数据算校验和填进首部，接收方重算比对。比特在链路上可能被干扰翻转，校验对不上就整段丢弃——检错这一层先把「坏数据」拦在门外，丢了的部分交给重传补。' },
        { title: '序号与确认：对账', text: '每个字节都有序号，接收方做累积确认：确认号 = 期望收到的下一个字节序号，含义是「这之前的我全收到了」。发送方迟迟收不到、或者收到一串重复确认，就说明中间出了岔子。' },
        { title: '重传：超时与快速', text: '超时重传：RTO（重传超时时间）到点还没等到确认就重发，RTO 按 RTT（往返时延）平滑估计再加裕量，网络变了它跟着变。快速重传：收到 3 个重复 ACK 就立刻重传，不用干等超时，抢回一整个 RTO 的时间。' },
        { title: '滑动窗口：流量控制', text: '接收方在 ACK 里通告自己的剩余缓冲（窗口），发送方保证「已发未确认 + 待发」不超出这个窗口——对方处理得快就多发，处理不过来就把窗口收窄甚至收到 0。滑动窗口就是发送节奏的刹车。' },
        { title: '拥塞控制：别堵死网络', text: '流量控制看对端，拥塞控制看网络：慢启动让发送量指数爬升，过了阈值转线性加一；丢包后快重传、快恢复砍半重来。它和流量控制的区别一句话：流控防「对方收不下」，拥塞控制防「网络扛不住」。' },
      ],
      figure: { vb: '0 0 760 610', draw: n => layers(n, L, '0 0 760 610') },
      followups: [
        ['RTO 是怎么算出来的？', '按 RTT 的平滑均值 + 波动量加裕量（RFC 6298），超时一次指数退避——自适应，不拍脑袋。'],
        ['流控和拥塞控制的区别？', '流控看接收方通告的窗口，防「对方收不下」；拥塞控制看网络，防「路上堵死」——一个对端、一个网。'],
        ['快重传为什么是 3 个重复 ACK？', '少于 3 个可能只是乱序重排，凑够 3 个基本能断定丢包——阈值是及时性和误判率的折中。'],
        ['UDP 有这些机制吗？', '都没有：无确认、无重传、无拥塞控制，校验和倒是保留了——可靠性和节奏要应用层自己搭。'],
      ],
      lab: { href: 'apps/wire-lab/#/tcp', label: 'Wire Lab · 打开丢包开关，亲眼看快速重传' },
      points: '口诀：校验、序号确认、重传、流控、拥塞控制——五大件按序报。\n流控防「对方收不下」，拥塞控制防「网络扛不住」，一句话分清。\n加分细节：累积确认、RTO 自适应、3 个重复 ACK 触发快重传。',
    };
  }

  /* ============ 3. TCP 粘包/拆包是怎么回事？怎么解决？ ============ */
  function qSticky() {
    const L = [
      () => txt(380, 36, '应用想发三条消息：A、B、C——进了 TCP 就是一段无边界字节流', { anchor: 'middle', fs: 12 }) +
        `<rect x="60" y="46" width="640" height="44" rx="8" fill="${C.surface2}" stroke="${C.lineS}" stroke-width="1.4"/>` +
        `<rect x="72" y="54" width="170" height="28" rx="5" fill="${C.moss}"/>` +
        `<rect x="242" y="54" width="160" height="28" rx="5" fill="${C.blue}"/>` +
        `<rect x="402" y="54" width="286" height="28" rx="5" fill="${C.brass}"/>` +
        txt(157, 73, '消息 A', { anchor: 'middle', color: '#f2efe8', fs: 12, fw: 600 }) +
        txt(322, 73, '消息 B', { anchor: 'middle', color: '#f2efe8', fs: 12, fw: 600 }) +
        txt(545, 73, '消息 C', { anchor: 'middle', color: '#f2efe8', fs: 12, fw: 600 }) +
        `<line x1="560" y1="42" x2="560" y2="94" stroke="${C.clay}" stroke-width="1.8" stroke-dasharray="5 4"/>` +
        txt(380, 112, '一次 read 读到「A + B + 半条 C」：粘着来、拆着来都正常——TCP 只认字节，不认消息', { anchor: 'middle', fs: 12.5, fw: 600 }),
      () => box(50, 146, 170, 40, '应用：write(A)', { mono: true, fs: 12 }) + box(50, 196, 170, 40, '应用：write(B)', { mono: true, fs: 12 }) +
        box(400, 152, 300, 44, '攒批 + Nagle：合成一段发出', { fs: 12.5, stroke: C.blue, color: C.blue }) +
        arrow(222, 166, 398, 166, { color: C.blue }) +
        arrow(222, 216, 398, 186, { color: C.blue }) +
        txt(380, 260, 'Nagle：没被确认的小数据先攒着，凑够一批或确认到了再发——小消息就这么粘上了', { anchor: 'middle', fs: 12 }),
      () => box(60, 296, 180, 44, '正好一条', { stroke: C.moss, color: C.moss }) +
        box(300, 296, 180, 44, '半条', { stroke: C.clay, color: C.clay }) +
        box(540, 296, 180, 44, '一条半', { stroke: C.clay, color: C.clay }) +
        txt(380, 368, '接收缓冲区到多少读多少：read 的返回长度和消息边界没有任何关系', { anchor: 'middle', fs: 12 }),
      () => box(40, 412, 224, 48, '定长：每条固定 N 字节', { fs: 12.5 }) +
        box(272, 412, 224, 48, '分隔符：约定结束符（\\n）', { fs: 12.5 }) +
        box(504, 412, 224, 48, '长度前缀：头写 body 长度', { fs: 12.5, stroke: C.accent, color: C.accent }) +
        txt(380, 484, '都是应用层自定义边界；长度前缀最通用，是二进制协议的首选', { anchor: 'middle', fs: 12 }),
      () => box(60, 520, 300, 48, 'HTTP：Content-Length + 空行', { fs: 12.5, stroke: C.blue, color: C.blue }) +
        box(430, 520, 270, 48, 'Redis RESP：用 \\r\\n 划界', { fs: 12.5, stroke: C.teal, color: C.teal }) +
        txt(380, 592, '文本协议爱分隔符，二进制协议爱长度前缀——按场景对号入座', { anchor: 'middle', fs: 12 }),
    ];
    return {
      id: 'tcp-sticky', cat: '网络', level: '进阶', hot: false,
      q: 'TCP 粘包/拆包是怎么回事？怎么解决？',
      answer: 'TCP 是字节流，只保证字节按序到达，不维护消息边界——「粘包」是应用层把字节流当消息流用才踩的坑，不是 TCP 的 bug。解决思路是在应用层自定义边界：定长消息、特殊分隔符（如 \n）、长度前缀（header 写明 body 长度），其中长度前缀最通用。',
      steps: [
        { title: '本质：字节流无边界', text: 'TCP 是字节流协议：只保证字节一个不漏、按序到达，不维护应用「一条消息」的边界。你写三次，对面可能一次读到、分两次读到、或者半条——「粘包」不是 TCP 的 bug，是把字节流当消息流用才会踩的坑。' },
        { title: '发送端为什么粘', text: 'Nagle 算法：连接上还有没被确认的小数据时，先把后面的小写入攒在发送缓冲区，凑够一批或收到确认再发。本意是省带宽、别为几个字节单发一个包，代价就是两条消息粘成一段到达。' },
        { title: '接收端为什么拆', text: '接收端从 socket 缓冲区 read：数据到多少就读多少。可能只读到半条消息，也可能一口气读到一条半。read 的返回长度和「消息边界」之间没有任何关系，这就是拆包的来源。' },
        { title: '解决：三板斧', text: '在应用层自定义边界，三选一：定长（每条固定 N 字节，简单但浪费空间）；分隔符（如 \n，文本协议常用）；长度前缀（header 里写明 body 长度，先读头再按长度读体），最通用，二进制协议首选。' },
        { title: '真实协议对号入座', text: 'HTTP/1.1 用长度前缀：Content-Length 告诉你 body 多长，头部用空行收尾；分块传输则是每块自带长度。Redis 的 RESP 协议用 \r\n 划界。选哪种，取决于协议是给人看的还是给机器解析的。' },
      ],
      figure: { vb: '0 0 760 620', draw: n => layers(n, L, '0 0 760 620') },
      followups: [
        ['UDP 有粘包吗？', '没有。UDP 是数据报协议，一次 send 对应一次 recv，天然有边界，丢也是整条丢。'],
        ['Nagle 和延迟确认为什么互相拖累？', '发端攒包等 ACK，收端延迟确认又拖着不回，双方互等延迟飙升——实时场景关 Nagle（TCP_NODELAY）。'],
        ['长度前缀一般几个字节？', '常见 2 或 4 字节写 body 长度（网络字节序），也可以加 magic number 校验协议合法性。'],
      ],
      points: '先纠正词：TCP 没有「包」，只有字节流——粘拆是应用层视角的问题。\n解决 = 应用层自定义边界：定长、分隔符、长度前缀（最通用）。\nread 到多少算多少；别指望一次 read 恰好一条消息。',
    };
  }

  /* ============ 4. UDP 和 TCP 的区别？分别用在什么场景？ ============ */
  function qUdpTcp() {
    const row = (y, label, tcp, udp) =>
      txt(170, y + 27, label, { anchor: 'end', fs: 12.5, fw: 600 }) +
      box(180, y, 268, 44, tcp, { stroke: C.blue, fs: 12 }) +
      box(468, y, 248, 44, udp, { stroke: C.teal, fs: 12 });
    const L = [
      () => txt(314, 44, 'TCP（传输控制协议）', { anchor: 'middle', fs: 13.5, fw: 700, color: C.blue }) +
        txt(592, 44, 'UDP（用户数据报协议）', { anchor: 'middle', fs: 13.5, fw: 700, color: C.teal }) +
        row(62, '① 连接', '三次握手建连，内核里有状态机', '无连接，拿起就发'),
      () => row(122, '② 可靠', '确认 + 重传 + 按序交付', '尽力而为，丢了不补'),
      () => row(182, '③ 开销', '首部 20~60 字节 + 状态维护', '首部固定 8 字节，几乎裸奔'),
      () => row(242, '④ 节奏', '拥塞控制：网络堵了主动让路', '火力全开，限速靠自己'),
      () => txt(380, 312, '要完整找 TCP，要实时找 UDP', { anchor: 'middle', fs: 13, fw: 700, color: C.accent }) +
        box(40, 324, 340, 50, 'TCP：网页 / 文件 / 邮件 / 数据库', { stroke: C.blue, fs: 12.5 }) +
        box(410, 324, 310, 50, 'UDP：直播 / 游戏 / DNS / QUIC', { stroke: C.teal, fs: 12.5 }) +
        txt(380, 396, 'QUIC（HTTP/3 的底座）跑在 UDP 上：可靠、有序、加密全部自己实现', { anchor: 'middle', fs: 12 }),
    ];
    return {
      id: 'udp-vs-tcp', cat: '网络', level: '入门', hot: true,
      q: 'UDP 和 TCP 的区别？分别用在什么场景？',
      answer: '五个维度比：连接（握手建连 vs 无连接）、可靠（确认重传有序 vs 尽力而为）、开销（首部 20~60 字节+状态 vs 固定 8 字节）、节奏（拥塞控制让路 vs 火力全开）。场景：要完整选 TCP——网页、文件、邮件；要实时选 UDP——直播、游戏、DNS，QUIC 也是跑在 UDP 上。',
      steps: [
        { title: '连接：有状态 vs 无连接', text: 'TCP 通信前要三次握手，建立连接、交换序号，内核里挂着一套连接状态机；UDP 无连接，拿到对方 IP 和端口拿起就发，发完不留痕迹，服务器甚至可以不认识你。' },
        { title: '可靠：要不要认账', text: 'TCP 给字节编号、要确认、丢了的自动重传、到达后按序排好再交给应用；UDP 只管发，网络里的丢包、乱序、重复都原样交给上层——要可靠，应用自己实现。' },
        { title: '开销：头部与状态', text: 'TCP 首部最少 20 字节、带选项最多 60 字节，两端还要维护缓冲区和状态；UDP 首部固定 8 字节（源端口、目的端口、长度、校验和），几乎裸奔——实时场景就爱这份轻。' },
        { title: '节奏：让路 vs 火力全开', text: 'TCP 内置拥塞控制：网络一堵就主动降速让路，这是它「可靠」的另一半代价；UDP 没有这层闸门，想发多快发多快——所以 UDP 应用要自己做限速，否则容易压垮链路。' },
        { title: '场景对号入座', text: '要完整：网页、文件传输、邮件、数据库连接——选 TCP。要实时：直播视频（丢一帧比卡半秒强）、游戏对战、DNS 查询——选 UDP。另外 QUIC（HTTP/3 的底座）名义上跑在 UDP 上，可靠性它自己造。' },
      ],
      figure: { vb: '0 0 760 420', draw: n => layers(n, L, '0 0 760 420') },
      followups: [
        ['QUIC 为什么基于 UDP 重造？', 'TCP 在内核和中间设备里，难升级难改造；UDP 是几乎不设防的通道，QUIC 在用户态把可靠、有序、加密全部自己实现。'],
        ['直播用 TCP 会怎样？', '丢包触发重传和降速，画面越攒越旧、延迟越滚越大——观众宁可看丢帧的实时画面，也不要延迟累积。'],
        ['DNS 为什么用 UDP？', '一次查询一次响应，一个往返就完事，UDP 最省；超时了客户端重发即可，区域传输这类大报文才用 TCP。'],
      ],
      points: '对比口诀：连接、可靠、开销、节奏，再加场景——四个维度逐个过。\n要完整找 TCP，要实时找 UDP；DNS、QUIC 是 UDP 的招牌场景。\nQUIC = 跑在 UDP 上的「自制 TCP + TLS」，说明 UDP 的定位是一条轻通道。',
    };
  }

  /* ============ 5. 常见 HTTP 状态码有哪些？ ============ */
  function qStatus() {
    const seg = (x, y, w2, t, hot) =>
      `<rect x="${x}" y="${y}" width="${w2}" height="44" rx="8" fill="${C.surface}" stroke="${hot ? C.accent : C.lineS}" stroke-width="${hot ? 1.8 : 1.4}"/>` +
      txt(x + w2 / 2, y + 26, t, { anchor: 'middle', fs: 12, fw: hot ? 700 : 600, color: hot ? C.accent : C.ink });
    const L = [
      () => ['1xx 信息|' + C.faint, '2xx 成功|' + C.moss, '3xx 重定向|' + C.blue, '4xx 客户端错|' + C.clay, '5xx 服务端错|' + C.mauve].map((s, i) => {
        const parts = s.split('|'), x = 40 + i * 137;
        return `<rect x="${x}" y="36" width="132" height="48" rx="8" fill="${parts[1]}"/>` +
          txt(x + 66, 64, parts[0], { anchor: 'middle', color: '#f2efe8', fs: 12, fw: 600 });
      }).join('') +
        txt(380, 106, '先记分段再记成员：忘了具体码，也能从第一位推出问题出在哪边', { anchor: 'middle', fs: 12 }),
      () => chip(40, 141, '2xx', C.moss) +
        box(130, 130, 180, 44, '200 成功', { stroke: C.moss }) +
        box(326, 130, 200, 44, '204 成功但无内容', { fs: 12 }) +
        box(542, 130, 178, 44, '206 断点续传', { fs: 12 }) +
        txt(380, 200, '204：删除/更新类常用，没有 body；206：Range 请求，断点续传就靠它', { anchor: 'middle', fs: 12 }),
      () => chip(40, 233, '3xx', C.blue) +
        box(130, 222, 190, 44, '301 永久重定向', { fs: 12 }) +
        box(336, 222, 150, 44, '302 临时重定向', { fs: 12 }) +
        box(502, 222, 218, 44, '304 协商缓存命中', { stroke: C.moss, color: C.moss, fs: 12 }) +
        txt(380, 292, '301 搬家、搜索引擎换权重；304 不是错误——「用你本地的副本」', { anchor: 'middle', fs: 12 }),
      () => chip(40, 325, '4xx', C.clay) +
        seg(130, 314, 110, '400 参数错', 0) + seg(248, 314, 110, '401 未认证', 1) + seg(366, 314, 110, '403 无权限', 1) +
        seg(484, 314, 110, '404 不存在', 0) + seg(602, 314, 110, '429 太频繁', 0) +
        txt(380, 388, '401 是「还没验证你是谁」，403 是「知道你是谁，但这里不让进」——高频混淆点', { anchor: 'middle', fs: 12, color: C.accent, fw: 600 }),
      () => chip(40, 423, '5xx', C.mauve) +
        seg(130, 412, 138, '500 代码异常', 0) + seg(276, 412, 138, '502 上游无效', 1) +
        seg(422, 412, 138, '503 暂不可用', 0) + seg(568, 412, 138, '504 上游超时', 1) +
        txt(380, 486, '502 vs 504：上游「炸了」还是「太慢」——网关视角的两种失败，排查先看上游死没死', { anchor: 'middle', fs: 12, color: C.accent, fw: 600 }),
    ];
    return {
      id: 'http-status', cat: '网络', level: '入门', hot: true,
      q: '常见 HTTP 状态码有哪些？',
      answer: '先记分段：1xx 信息、2xx 成功、3xx 重定向、4xx 客户端错、5xx 服务端错。高频成员：200/204/206；301 永久、302 临时、304 缓存命中；400/401/403/404/429——401 未认证、403 无权限；500/502/503/504——502 上游炸了、504 上游太慢。',
      steps: [
        { title: '状态码分五段', text: '状态码是服务器对请求的一句话回复，第一位数字定段：1xx 信息提示、2xx 成功、3xx 重定向、4xx 客户端有错、5xx 服务端有错。先记分段再记成员——忘了具体码，也能从第一位推出问题在哪边。' },
        { title: '2xx：成功这一家', text: '200 万能成功；204 成功但没有 body，删除、更新类操作常返回它；206 只返回一部分，Range 请求用它——断点续传、视频拖进度条都靠它。' },
        { title: '3xx：重定向与缓存', text: '301 永久搬家，搜索引擎会把权重换到新地址；302 临时借道，权重不动。304 不是错误：带着 If-None-Match 去问，服务器说没变，就用你本地缓存的那份，不用重新传。' },
        { title: '4xx：客户端的锅', text: '400 参数有问题；401 没有身份凭证（没登录、Token 失效）；403 身份认了但没权限——401 vs 403 是高频混淆点；404 资源不存在；429 请求太频繁，被限流了。' },
        { title: '5xx：服务端的锅', text: '500 代码抛异常；502 网关收到上游的无效响应——上游炸了；503 暂时不可用，过载或维护；504 网关等上游等超时——上游太慢。502 和 504 的区别就一句话：炸了还是慢了。' },
      ],
      figure: { vb: '0 0 760 512', draw: n => layers(n, L, '0 0 760 512') },
      followups: [
        ['301 和 302 对 SEO 的影响？', '301 会把旧地址的搜索权重转移给新地址；302 只临时跳转，权重留在旧地址——改版迁移要用 301。'],
        ['304 是怎么触发的？', '带 If-None-Match/If-Modified-Since 再问一次，服务器比对没变就回 304、不带 body。'],
        ['线上大量 502 先查什么？', '先看上游进程死没死（OOM/崩溃/重启）、端口通不通，再看网关到上游的连接数；502 说明上游给的响应无效。'],
      ],
      points: '分段记：2 成功 · 3 重定向 · 4 客户端 · 5 服务端。\n401 未认证 vs 403 无权限；502 上游炸 vs 504 上游慢。\n304 不是错误，是协商缓存命中——省流量的功臣。',
    };
  }

  /* ============ 6. HTTPS 为什么安全？加密是怎么做的？ ============ */
  function qHttps() {
    const L = [
      () => box(60, 30, 180, 46, '窃听：被偷看', { stroke: C.clay, color: C.clay }) +
        box(290, 30, 180, 46, '篡改：被改包', { stroke: C.clay, color: C.clay }) +
        box(520, 30, 180, 46, '冒充：装成真网站', { stroke: C.clay, color: C.clay }) +
        txt(380, 100, 'HTTP 明文裸奔：链路上的中间人三件事全能干——HTTPS 就为封死它们', { anchor: 'middle', fs: 12.5 }),
      () => box(50, 126, 330, 46, '非对称（RSA/ECDHE）：只用来送钥匙', { fs: 12.5, stroke: C.brass, color: C.brass }) +
        box(430, 126, 280, 46, '对称（AES）：负责传所有数据', { fs: 12.5, stroke: C.moss, color: C.moss }) +
        arrow(382, 149, 428, 149, { color: C.brass }) +
        txt(380, 198, '非对称慢两个数量级：先用它安全地把对称密钥送到对端，之后全走对称', { anchor: 'middle', fs: 12 }),
      () => box(50, 222, 310, 46, '证书 = 域名 + 公钥 + CA 私钥签名', { fs: 12.5, stroke: C.blue, color: C.blue }) +
        box(470, 222, 240, 46, '浏览器：内置 CA 公钥验签', { fs: 12.5, stroke: C.blue }) +
        arrow(362, 245, 468, 245, { color: C.blue }) +
        txt(380, 294, '一级级验到根 CA，对不上就弹警告——假网站在握手时现形', { anchor: 'middle', fs: 12 }),
      () => box(80, 320, 280, 46, '发送：报文 + 摘要（MAC/AEAD）', { fs: 12.5 }) +
        box(420, 320, 260, 46, '接收：重算比对，对不上就丢', { fs: 12.5 }) +
        txt(380, 390, '摘要由会话密钥参与计算：中间人改一个字节都会被当场发现——防篡改', { anchor: 'middle', fs: 12 }),
      () => arrow(132, 424, 628, 424, { color: C.blue, label: '① ClientHello：候选算法 + 随机数' }) +
        arrow(628, 448, 132, 448, { color: C.moss, label: '② 证书 + 密钥交换材料' }) +
        box(170, 462, 420, 40, '④ 对称加密通信（同一个会话密钥）', { stroke: C.moss, color: C.moss, fill: C.surface2, fs: 12.5 }) +
        txt(380, 526, '③ 双方独立算出同一个会话密钥，交换 Finished 互验', { anchor: 'middle', fs: 12 }) +
        txt(380, 550, 'TLS 1.2 完整握手 2 个 RTT；1.3 并进第一个飞行包，只要 1 个 RTT', { anchor: 'middle', fs: 12, fw: 600, color: C.accent }),
    ];
    return {
      id: 'https', cat: '网络', level: '进阶', hot: true,
      q: 'HTTPS 为什么安全？加密是怎么做的？',
      answer: 'HTTPS 在 HTTP 和 TCP 之间加了 TLS 层，封死明文的三大风险：混合加密——非对称（RSA/ECDHE）只用来安全交换密钥，之后全走对称（AES）；证书——CA 私钥签名、浏览器用内置根公钥验签，防冒充；摘要（MAC/AEAD）防篡改。TLS 1.2 完整握手 2 个 RTT，1.3 压到 1 个。',
      steps: [
        { title: '明文的三大风险', text: 'HTTP 裸奔在链路上，中间人可以对它做三件事：窃听（账号密码被看光）、篡改（往页面里插广告、改转账账号）、冒充（假网站装成真网站）。HTTPS 就是逐一封死这三件事。' },
        { title: '混合加密：各干各的', text: '非对称加密（RSA/ECDHE）安全但慢两个数量级；对称加密（AES）快，但要先把密钥安全送到对端。HTTPS 的答案：用非对称把对称密钥安全交换过去，之后所有数据都走对称加密。' },
        { title: '证书：防冒充', text: '服务器出示证书：域名、公钥，以及 CA（证书颁发机构）用自己私钥做的签名。浏览器用内置的 CA 公钥验签，一级级验到根——对不上就弹安全警告，假网站在握手时就会现形。' },
        { title: '摘要：防篡改', text: '每个报文附带用会话密钥参与计算的校验值（MAC/AEAD 认证加密）：接收方重算比对，中间人篡改一个字节都会被当场发现——改不了，改了也藏不住。' },
        { title: 'TLS 握手串一遍', text: '流程：协商算法 → 验证书 → 交换密钥材料 → 双方算出同一个会话密钥 → 对称加密通信。TLS 1.2 完整握手要两个 RTT，1.3 把密钥协商并进第一个飞行包，一个 RTT 就能发请求。' },
      ],
      figure: { vb: '0 0 760 576', draw: n => layers(n, L, '0 0 760 576') },
      followups: [
        ['对称和非对称加密的区别？', '对称一把钥匙又加密又解密（AES，快）；非对称公钥加密、私钥解密（RSA/ECDHE，慢但省去送钥匙）。'],
        ['中间人攻击在哪一步被拦住？', '证书验签：假网站拿不出 CA 签名的证书，浏览器验签失败直接警告，密钥交换根本走不下去。'],
        ['证书链是怎么验证的？', '站点证书由中间 CA 签、中间 CA 由根 CA 签；浏览器用内置根公钥逐级验到根，还要核对域名和有效期。'],
        ['TLS 1.3 为什么快一个 RTT？', 'ClientHello 就带上密钥交换材料，一个 RTT 内完成协商；并砍掉了 RSA 静态交换等一票旧算法。'],
      ],
      lab: { href: 'apps/wire-lab/#/tls', label: 'Wire Lab · TLS 1.2/1.3/QUIC 握手轮次与首字节时间对比' },
      points: '口诀：非对称换钥匙、对称传数据、证书防冒充、摘要防篡改。\nCA 验签链条到根——别编具体位数，记住机制。\nTLS 1.2 完整握手 2 个 RTT，1.3 只要 1 个——版本差异是加分项。',
    };
  }

  /* ============ 7. Cookie、Session、Token(JWT) 的区别？ ============ */
  function qCsj() {
    const L = [
      () => box(40, 36, 110, 40, '请求 1', { fs: 12 }) + box(40, 96, 110, 40, '请求 2', { fs: 12 }) +
        box(360, 62, 180, 44, '服务器（无记忆）', { stroke: C.clay, color: C.clay }) +
        arrow(152, 56, 358, 74, { color: C.muted }) +
        arrow(152, 116, 358, 96, { color: C.muted }) +
        txt(380, 158, 'HTTP 无状态：每个请求都是陌生人——三个方案都在回答「你是谁」', { anchor: 'middle', fs: 12.5 }),
      () => box(50, 198, 190, 44, '浏览器：存 Cookie', { fs: 12.5 }) +
        box(480, 198, 230, 44, '服务器：Set-Cookie 下发', { fs: 12.5 }) +
        arrow(478, 214, 242, 214, { color: C.teal, label: '下发' }) +
        arrow(242, 240, 478, 240, { color: C.blue, label: '之后每次自动带上' }) +
        txt(380, 286, '把登录态直接写进 Cookie？能跑，但裸奔：用户能看能改，脚本也能偷', { anchor: 'middle', fs: 12 }),
      () => box(50, 326, 230, 44, 'Cookie 里只放 sessionId', { mono: true, fs: 12 }) +
        box(430, 326, 280, 44, 'Session：登录态存在服务端', { fs: 12.5, stroke: C.moss, color: C.moss }) +
        arrow(282, 348, 428, 348, { color: C.blue, label: '凭号牌来取' }) +
        txt(380, 394, '安全了；但多台机器要共享——粘性路由，或集中存一份在 Redis', { anchor: 'middle', fs: 12 }),
      () => box(50, 434, 310, 44, 'JWT = Header.Payload.Signature', { mono: true, fs: 12, stroke: C.accent, color: C.accent }) +
        box(440, 434, 270, 44, '服务端只验签，不查存储', { fs: 12.5, stroke: C.accent, color: C.accent }) +
        arrow(362, 456, 438, 456, { color: C.accent, label: '验签' }) +
        txt(380, 502, '登录态签名后由客户端自存，天然分布式；代价：签发后收不回', { anchor: 'middle', fs: 12 }),
      () => box(50, 542, 320, 44, '单体 / 小集群：Session + Redis 够用', { fs: 12, stroke: C.moss }) +
        box(430, 542, 280, 44, '多端 / 微服务 / 跨域：JWT 顺手', { fs: 12, stroke: C.accent }) +
        txt(380, 610, '一句话：Cookie 是载体，Session 是服务端记账，JWT 是客户端自证', { anchor: 'middle', fs: 12.5, fw: 600 }),
    ];
    return {
      id: 'cookie-session-jwt', cat: '网络', level: '进阶', hot: true,
      q: 'Cookie、Session、Token(JWT) 的区别？',
      answer: 'HTTP 无状态，三个方案是三种记账位置：Cookie 把状态放浏览器、每次自动带上，裸奔不安全；Session 把登录态存服务端、Cookie 只放号牌，安全但集群要共享；JWT 把登录态签名后交给客户端，验签即用、天然分布式，代价是签发后无法主动作废。',
      steps: [
        { title: '起点：HTTP 无状态', text: 'HTTP 的每个请求互相独立，服务器天生记不住「你是谁」——上一秒登录、下一秒就不认识你。Cookie、Session、JWT 三个方案都在补「维持登录态」这个洞，只是记账的位置不同。' },
        { title: 'Cookie：小纸条', text: '服务器用 Set-Cookie 下发，浏览器存起来，之后每次请求自动带上。把登录态直接写在 Cookie 里行不行？能跑，但等于裸奔：用户能看能改，脚本也能偷——客户端的东西不能信。' },
        { title: 'Session：服务端记账', text: '登录态存在服务端的 Session 里，Cookie 只放一个 sessionId 号牌。安全多了，但状态在服务端：多台机器负载均衡时要共享——要么粘性路由（同一用户固定打到一台），要么集中存 Redis。' },
        { title: 'JWT：客户端自证', text: '登录态签名后整个发给客户端存，格式三段：Header.Payload.Signature（头部.载荷.签名）。服务端只验签名、不查存储，天然适合分布式和多端；代价是签发后收不回——想提前作废只能等过期或上黑名单。' },
        { title: '选型对号入座', text: '单体或小集群：Session + Redis 最省心，能随时踢人下线；多端（App/小程序/Web）、微服务网关鉴权、跨域场景：JWT 顺手，无状态横向扩容不头疼。两者混用也常见：短 JWT + refresh token。' },
      ],
      figure: { vb: '0 0 760 636', draw: n => layers(n, L, '0 0 760 636') },
      followups: [
        ['JWT 的 payload 能放敏感信息？', '不能。它只是 Base64URL 编码不是加密，谁拿到谁就能解开——只放 id、角色这类非敏感声明。'],
        ['Session 集群共享怎么做？', '粘性路由（ip_hash）或集中存 Redis，各节点读同一份；Spring Session 可透明接管。'],
        ['JWT 怎么实现退出登录？', 'JWT 天生无法主动作废：要么短过期 + refresh token 换发，要么服务端维护黑名单（但又要查存储，两难）。'],
        ['Cookie 的 HttpOnly 是干嘛的？', '禁止 JS 通过 document.cookie 读它，XSS 偷不走；配合 Secure 只走 HTTPS，更稳。'],
      ],
      points: '一句话：Cookie 是载体，Session 是服务端记账，JWT 是客户端自证。\nJWT 的坑 = 签发后不能撤——短过期 + refresh token 或黑名单。\n多端/微服务选 JWT，单体选 Session + Redis；「能踢人下线」是 Session 的独门优势。',
    };
  }

  /* 7 题；由门户或测试拼进完整题库（QA_PART_1） */
  w.QA_PART_1 = [q2msl(), qReliable(), qSticky(), qUdpTcp(), qStatus(), qHttps(), qCsj()];
})(typeof window !== 'undefined' ? window : globalThis);
