/* ============ QA Part 8 · 七题 ============
   Redis zset 跳表 / 哨兵与集群 / HTTP 1.1-2-3 / WebSocket / 限流算法 / 布隆过滤器 / 零拷贝。
   纯数据 + SVG 字符串，不碰 DOM；画图助手复用 qa-deck.js 暴露的 w.__qaHelpers。
   每题 figure.draw(n)：第 0..n 层显影（opacity 1），之后降 0.15；图层数与 steps 一一对应。 */
(function (w) {
  'use strict';
  const { C, SANS, MONO, box, txt, arrow, chip, layers } = w.__qaHelpers;

  /* ============ 1. zset 为什么用跳表而不是红黑树？ ============ */
  function qZset() {
    const lvl = (y, xs, color) =>
      `<line x1="${xs[0]}" y1="${y}" x2="${xs[xs.length - 1]}" y2="${y}" stroke="${C.lineS}" stroke-width="2"/>` +
      xs.map(x => `<circle cx="${x}" cy="${y}" r="7" fill="${color}"/>`).join('');
    const L = [
      () => box(48, 28, 220, 42, 'zset：成员 + 分数', { fs: 12.5 }) +
        box(300, 28, 200, 42, '按成员查分 ZSCORE', { fs: 12 }) +
        box(524, 28, 188, 42, '按分数段取 ZRANGE', { fs: 12 }) +
        txt(380, 96, '这两个高频动作决定选型：查分要 O(1) 级别的快，按排名/分数段取一段也要高效', { anchor: 'middle', fs: 12.5 }),
      () => txt(380, 126, '跳表：有序链表 + 多层稀疏索引——上层是下层的快车道', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        lvl(154, [90, 250, 410], C.blue) +
        lvl(186, [90, 170, 250, 330, 410], C.teal) +
        lvl(218, [90, 130, 170, 210, 250, 290, 330, 370, 410], C.moss) +
        arrow(97, 154, 243, 154, { color: C.accent, label: '先在顶层跑' }) +
        arrow(250, 162, 250, 178, { color: C.accent }) +
        txt(380, 248, '查找：从顶层往右走，下一个比目标大就下沉一层——平均 O(logN)；新节点的层数随机决定', { anchor: 'middle', fs: 12 }),
      () => box(48, 272, 290, 46, '跳表：起点之后顺链表走', { stroke: C.moss, color: C.moss, fs: 12.5 }) +
        box(422, 272, 290, 46, '红黑树：中序遍历来回爬', { stroke: C.clay, color: C.clay, fs: 12.5 }) +
        txt(380, 348, '范围查询是 zset 的日常（排行榜取前 100）：底层链表顺序输出天然高效——树要在上下层之间反复跳', { anchor: 'middle', fs: 12 }),
      () => box(48, 372, 290, 46, '跳表：只改前后指针', { stroke: C.moss, color: C.moss, fs: 12.5 }) +
        box(422, 372, 290, 46, '红黑树：旋转 + 变色保平衡', { stroke: C.clay, color: C.clay, fs: 12.5 }) +
        txt(380, 448, '跳表层数靠「抛硬币」，无需旋转；整条链表打印出来一眼看懂——实现简单、调试直观，工程上更省心', { anchor: 'middle', fs: 12 }),
      () => box(48, 472, 300, 46, 'dict 哈希：成员 → 分数 O(1)', { stroke: C.blue, color: C.blue, fs: 12.5 }) +
        box(412, 472, 300, 46, 'zskiplist：排序 + 范围', { stroke: C.accent, color: C.accent, fs: 12.5 }) +
        txt(380, 546, 'ZSCORE 走哈希、ZRANGE 走跳表——双结构各管一摊；层高上限 32、每层晋升概率 1/4', { anchor: 'middle', fs: 12.5, fw: 600 }),
    ];
    return {
      id: 'redis-zset', cat: 'Redis', level: '进阶', hot: true,
      q: 'Redis 的 zset 为什么用跳表而不是红黑树？',
      answer: 'zset 要按分数排序、还要按排名取一段，跳表在它的核心场景全面够用：范围查询找到起点后顺着底层有序链表走就行，红黑树要中序遍历来回爬；插入删除只改前后指针，不用旋转；链表打印出来线性可见，调试直观。所以 Redis 用「哈希表 + 跳表」双结构：哈希管成员查分 O(1)，跳表管排序和范围。',
      steps: [
        { title: 'zset 的两个高频动作', text: 'zset 是带分数的有序集合：既要「按成员查分数」，也要「按排名或分数段取一段」，排行榜取 Top 100 就是后者。结构选型就看谁把这两件事都干得漂亮。' },
        { title: '跳表：链表加多层索引', text: '跳表是有序链表加多层稀疏索引：上层是下层的「跳站快车」，查找从顶层往右走、下一个比目标大就下沉一层，平均 O(logN)。新节点的层数随机决定，不用维护严格平衡。' },
        { title: '范围查询：链表完胜', text: '找到起点后，跳表的底层就是一条有序链表，顺链表往后走就能取出整段——ZRANGE 就这么干活。红黑树取范围要中序遍历，在树的上下层之间来回爬，指针跳来跳去。' },
        { title: '实现简单，调试直观', text: '插入删除时跳表只改前后指针；红黑树要靠旋转加变色维持平衡，代码复杂、容易写错。跳表结构是线性的，打印出来一眼能看懂，出问题好排查——可维护性上跳表赢。' },
        { title: '双结构：跳表加哈希', text: 'Redis 的 zset 是「哈希表 + 跳表」双结构：dict 管成员到分数的映射，ZSCORE 是 O(1)；zskiplist 管排序，范围和排名靠它。实现参数：层高上限 32、每层晋升概率 1/4。' },
      ],
      figure: { vb: '0 0 760 576', draw: n => layers(n, L, '0 0 760 576') },
      followups: [
        ['跳表查找怎么走？', '从顶层出发往右走，下一个节点比目标大就下沉一层，到底层还没到就顺链表走——平均 O(logN)。'],
        ['为什么还要配个哈希表？', '查分数 O(1) 走哈希，排序范围 O(logN) 走跳表——各管一摊，单靠跳表查分也要 O(logN)。'],
        ['晋升概率 1/4 意味着什么？', '期望每层节点数是下层的 1/4，层高期望约 log₄N——索引稀疏，空间开销可控。'],
        ['为什么不用 B+ 树？', 'B+ 树为磁盘页设计、追求省 IO；Redis 全在内存，B+ 树的优势发挥不出来，跳表实现又更简单。'],
      ],
      points: '核心答案三连：范围查询顺链表走、插入删除不旋转、链表调试直观——红黑树这三条都输。\nzset = 跳表（排序+范围）+ 哈希（成员查分 O(1)）双结构。\n数字要背：层高上限 32、晋升概率 1/4、查找平均 O(logN)。',
    };
  }

  /* ============ 2. 哨兵和集群的区别？ ============ */
  function qSentinel() {
    const L = [
      () => box(56, 28, 160, 44, '主（读写）', { stroke: C.blue, color: C.blue }) +
        box(544, 28, 160, 44, '从（只读）') +
        arrow(218, 50, 542, 50, { color: C.blue, label: '异步复制' }) +
        txt(380, 96, '短板：主挂了没人顶——只能人工把从提升为主，恢复以分钟计，高可用缺位', { anchor: 'middle', fs: 12.5 }),
      () => box(48, 124, 220, 40, 'Sentinel ×3（独立进程）', { stroke: C.teal, color: C.teal, fs: 12.5 }) +
        box(48, 208, 220, 46, '主（当前 master）', { stroke: C.blue, color: C.blue }) +
        box(492, 208, 220, 46, '从 ×2') +
        arrow(158, 168, 158, 204, { color: C.teal, label: '心跳探活' }) +
        arrow(272, 231, 488, 231, { color: C.blue, label: '异步复制' }) +
        txt(380, 284, '哨兵三件事：监控探活、通知运维与程序、主挂了自动故障转移——人工的活它全包了', { anchor: 'middle', fs: 12.5 }),
      () => box(48, 312, 180, 44, '主：挂了 ✗', { stroke: C.clay, color: C.clay, dashed: true }) +
        box(300, 312, 180, 44, '从 1 → 提升为新主', { stroke: C.moss, color: C.moss, fs: 12 }) +
        box(552, 312, 160, 44, '从 2 → 改挂新主', { fs: 12 }) +
        arrow(296, 334, 232, 334, { color: C.moss, label: '提升' }) +
        txt(380, 386, '领导哨兵执行转移；选新主比三样：replica-priority 小者 → 复制偏移量大者 → runid 小者', { anchor: 'middle', fs: 12 }),
      () => box(48, 414, 270, 44, '主观下线：一个哨兵说挂了', { stroke: C.clay, color: C.clay, fs: 12.5 }) +
        arrow(322, 436, 386, 436, { color: C.accent, label: 'quorum' }) +
        box(390, 414, 322, 44, '客观下线：quorum 个都确认', { stroke: C.accent, color: C.accent, fs: 12.5 }) +
        txt(380, 486, 'quorum 是配置值（比如 2）——防单点误判；注意选领导要「多数派」，和 quorum 不是一回事', { anchor: 'middle', fs: 12 }),
      () => box(48, 514, 330, 46, '哨兵：只管高可用（监控+通知+转移）', { fs: 12.5 }) +
        box(382, 514, 330, 46, '集群：16384 slot 分片 + 自带主从', { stroke: C.accent, color: C.accent, fs: 12.5 }) +
        txt(380, 586, '数据量大到单机放不下才上集群——容量，是集群相对哨兵的独门价值', { anchor: 'middle', fs: 12.5, fw: 600 }),
    ];
    return {
      id: 'redis-sentinel', cat: 'Redis', level: '进阶', hot: false,
      q: 'Redis 高可用怎么做？哨兵和集群的区别？',
      answer: '主从复制只解决读扩展和备份，主挂了还得人肉切换——哨兵补上这一环：独立进程盯着主从，干监控、通知、自动故障转移三件事。一个哨兵说主挂了只是主观下线，quorum 个都确认才算客观下线，防误判。集群是另一条路：16384 个 slot 分片、每片自带主从——数据量大到单机放不下才上集群。',
      steps: [
        { title: '主从的短板', text: '主从复制解决了读扩展和数据冗余，但主挂了谁来拍板把从提升为主？答案是没人——只能人工操作，恢复以分钟计。高可用缺的就是这最后一环。' },
        { title: '哨兵：不存数据的监工', text: 'Sentinel 是独立进程，自己不存数据，专职干三件事：监控（心跳探活）、通知（出事告诉运维和程序）、自动故障转移（主挂了自动选从提主）。' },
        { title: '选主：领导加三把尺子', text: '哨兵之间先投票选出一个「领导」来执行转移（要多数派同意）。挑新主按三把尺子排：replica-priority 数字小的优先、再比复制偏移量（数据更全的赢）、最后比 runid。' },
        { title: '主观下线与客观下线', text: '一个哨兵 ping 不通主，只是它的主观下线；凑够 quorum 个（配置值，比如 2）都确认，才算客观下线，这才触发转移——防的是单点误判，网络抖一下不至于瞎切换。' },
        { title: '集群：另一条路线', text: 'Cluster 不只管高可用：数据切成 16384 个 slot 分摊到多节点，每个分片自带主从、自己故障转移。哨兵解决「挂了怎么办」，集群同时解决「单机装不下」——容量才是它的独门价值。' },
      ],
      figure: { vb: '0 0 760 612', draw: n => layers(n, L, '0 0 760 612') },
      followups: [
        ['主观下线和客观下线的区别？', '单哨兵判断是主观，quorum 个确认是客观——多票防误判，客观下线才触发故障转移。'],
        ['哨兵为什么至少 3 个？', '选领导要多数派投票：2 个挂 1 个就凑不够多数；3 个容忍 1 个挂，还能防脑裂。'],
        ['上了集群还要哨兵吗？', '不用。集群自带故障转移，节点挂了分片内部自己切换——两套方案不混用。'],
        ['quorum 和多数派是一回事吗？', '不是。quorum 是判定客观下线的票数门槛，可以配 2；选领导必须过半数——两个门槛互不替代。'],
      ],
      points: '哨兵三件事：监控、通知、自动故障转移——一句话开场。\n客观下线要 quorum 票，选领导要多数派——两个「多数」不是一回事。\n哨兵管高可用，集群管高可用+分片容量；数据量单机放不放得下，决定上不上集群。',
    };
  }

  /* ============ 3. HTTP/1.1、2、3 的演进？队头阻塞解决了吗？ ============ */
  function qHttp23() {
    const L = [
      () => chip(48, 42, 'HTTP/1.1 · keep-alive', C.blue) +
        box(330, 30, 104, 40, 'req1', { fs: 11.5 }) +
        box(452, 30, 104, 40, 'req2', { fs: 11.5 }) +
        box(574, 30, 104, 40, 'req3', { fs: 11.5 }) +
        txt(380, 106, '一条连接同时只能有一个请求在飞；想并发就开 6 条连接——费资源，队头阻塞在应用层', { anchor: 'middle', fs: 12.5 }),
      () => chip(48, 128, '管道化 pipelining', C.mauve) +
        box(330, 122, 104, 40, 'req1 慢', { stroke: C.clay, color: C.clay, fs: 11.5 }) +
        box(452, 122, 104, 40, 'req2 ✗', { dashed: true, fs: 11.5 }) +
        box(574, 122, 104, 40, 'req3 ✗', { dashed: true, fs: 11.5 }) +
        txt(380, 190, '请求能一口气发出，响应却必须按序返回——一个慢的全堵，浏览器干脆禁用了它', { anchor: 'middle', fs: 12.5 }),
      () => chip(48, 218, 'HTTP/2 · 二进制分帧', C.teal) +
        `<line x1="48" y1="276" x2="712" y2="276" stroke="${C.lineS}" stroke-width="3"/>` +
        box(150, 258, 110, 36, '流A 帧', { stroke: C.moss, color: C.moss, fs: 11.5 }) +
        box(330, 258, 110, 36, '流B 帧', { stroke: C.blue, color: C.blue, fs: 11.5 }) +
        box(510, 258, 110, 36, '流A 帧', { stroke: C.moss, color: C.moss, fs: 11.5 }) +
        txt(380, 322, '一条 TCP 连接上多个流交错传输，并行成真；还有 HPACK 头部压缩、服务器推送', { anchor: 'middle', fs: 12.5 }),
      () => chip(48, 348, '但 2 没根治', C.clay) +
        box(280, 342, 180, 40, 'TCP 丢了一个包', { stroke: C.clay, color: C.clay }) +
        arrow(464, 362, 496, 362, { color: C.clay }) +
        box(500, 342, 212, 40, '所有流一起等重传 ✗', { stroke: C.clay, color: C.clay, dashed: true }) +
        txt(380, 414, 'TCP 只认字节序、不认识流：一个包丢了，复用这条连接的所有流都得等——队头阻塞搬进了传输层', { anchor: 'middle', fs: 12 }),
      () => chip(48, 442, 'HTTP/3 · QUIC', C.moss) +
        box(48, 466, 210, 46, '流之间独立重传', { stroke: C.moss, color: C.moss }) +
        box(276, 466, 210, 46, '0/1-RTT + TLS 1.3 内置', { fs: 12 }) +
        box(504, 466, 208, 46, '连接迁移：换网不断线', { fs: 12 }) +
        txt(380, 542, '底座换成 UDP：一条流丢包不拖累别人；代价：UDP 过中间设备不都友好、CPU 开销略高', { anchor: 'middle', fs: 12.5 }),
    ];
    return {
      id: 'http2-3', cat: '网络', level: '进阶', hot: true,
      q: 'HTTP/1.1、2、3 的演进？队头阻塞解决了吗？',
      answer: 'HTTP/1.1 一条连接一次一个请求，队头阻塞在应用层；管道化响应要按序返回，没人用。HTTP/2 二进制分帧加多路复用，一条连接多个流并行——但 TCP 丢一个包所有流都得等，队头阻塞搬到传输层。HTTP/3 换底座 QUIC：跑在 UDP 上，流独立重传，握手 0/1 RTT、内置 TLS 1.3、连接迁移，基本解决。',
      steps: [
        { title: '1.1 的痛：排队', text: 'keep-alive 能复用连接，但一条连接同时只能有一个请求在飞：后面的必须排队。想并发就开 6 条连接，服务器资源又吃不消——队头阻塞在应用层。' },
        { title: '管道化为什么没人用', text: 'pipelining 允许请求一口气全发出去，但响应必须严格按请求顺序返回：第一个请求慢，后面全堵着。收益小、坑多，浏览器默认禁用——等于没解决。' },
        { title: 'HTTP/2：分帧多路复用', text: '二进制把报文切成帧（Frame，小数据块），多个流（Stream，一条连接里的独立双向序列）的帧在同一条 TCP 连接上交错传输——并行成真。附赠 HPACK 头部压缩和服务器推送。' },
        { title: '2 没根治：阻塞下沉', text: 'TCP 只认字节序、不认识流：中间丢一个包，内核得等它重传回来才能把字节交给应用，复用这条连接的所有流一起卡住——队头阻塞从应用层搬进了传输层。' },
        { title: 'HTTP/3：QUIC 底座', text: 'QUIC 跑在 UDP 上，可靠性自己实现：流之间独立重传，一条流丢包不拖累别人；握手 0/1 RTT、TLS 1.3 内置、连接迁移（换 Wi-Fi 不断线）。代价：UDP 过中间设备不都友好、CPU 开销略高。' },
      ],
      figure: { vb: '0 0 760 572', draw: n => layers(n, L, '0 0 760 572') },
      followups: [
        ['队头阻塞在 1.1/2/3 各在哪层？', '1.1 在应用层排队；2 挪到 TCP 层丢包阻塞；3 的 QUIC 流独立重传，基本解决。'],
        ['多路复用和 keep-alive 差在哪？', 'keep-alive 是串行复用：上一条响应没完不能发下一个；多路复用是帧交错，多个流真正并行。'],
        ['为什么挑 UDP 当底座？', 'TCP 在内核和中间设备里改不动；UDP 几乎不设防，QUIC 在用户态把可靠、有序、加密全部自己实现，迭代快。'],
        ['0-RTT 是什么？', '复用过的连接带着此前的密钥材料直接发数据，省一个 RTT；有被重放的风险，所以只用于幂等请求。'],
      ],
      points: '演进主线：1.1 应用层排队 → 2 分帧复用但 TCP 队头还在 → 3 QUIC 流独立。\nHTTP/3 = QUIC（UDP 上的可靠传输）+ TLS 1.3 + 原有 HTTP 语义。\n按「队头阻塞搬了几次家」讲：应用层 → 传输层 → 基本消灭，这题就赢了大半。',
    };
  }

  /* ============ 4. WebSocket 是什么？和轮询有什么区别？ ============ */
  function qWebsocket() {
    const L = [
      () => box(56, 28, 170, 44, '浏览器（客户端）') +
        box(534, 28, 170, 44, '服务器', { stroke: C.blue, color: C.blue }) +
        txt(380, 96, '实时性的老问题：服务器有新数据怎么告诉浏览器？HTTP 只能客户端问一次答一次', { anchor: 'middle', fs: 12.5 }),
      () => chip(48, 118, '短轮询', C.brass) +
        arrow(230, 142, 540, 142, { color: C.blue, label: '定时问：有新的吗？' }) +
        arrow(540, 172, 230, 172, { color: C.clay, label: '大多：没有（白跑）' }) +
        txt(380, 200, '间隔多小延迟就多大，绝大多数是无效空转；长轮询让服务器 hold 住有数据才回（仍要全套握手）；SSE：单向流只下行', { anchor: 'middle', fs: 12 }),
      () => chip(48, 216, 'WebSocket', C.accent) +
        arrow(230, 240, 540, 240, { color: C.blue, label: 'HTTP 握手：Upgrade → 101 换协议' }) +
        `<line x1="232" y1="288" x2="538" y2="288" stroke="${C.moss}" stroke-width="3"/>` +
        `<line x1="232" y1="302" x2="538" y2="302" stroke="${C.teal}" stroke-width="3"/>` +
        txt(380, 326, '握手后协议切换：同一条 TCP 变全双工，双向随时发、帧头只有几字节', { anchor: 'middle', fs: 12.5, fw: 600 }),
      () => box(48, 348, 320, 46, '高频双向：聊天 / 行情 / 协同 / 游戏', { stroke: C.accent, color: C.accent, fs: 12 }) +
        box(392, 348, 320, 46, '低频或只下行：SSE / 推送更省', { stroke: C.moss, color: C.moss, fs: 12 }) +
        txt(380, 420, '按「要不要双向、多频繁」选型——别为三条通知拉一条全双工长连接', { anchor: 'middle', fs: 12 }),
      () => box(48, 444, 330, 46, '心跳：ping/pong 保活，防中间设备掐线', { fs: 12 }) +
        box(402, 444, 310, 46, '断线重连：指数退避 + 心跳超时判定', { fs: 12 }) +
        txt(380, 516, '这两件是工程标配——不做，用户切个 Wi-Fi 连接就悄悄死了', { anchor: 'middle', fs: 12.5, fw: 600 }),
    ];
    return {
      id: 'websocket', cat: '网络', level: '进阶', hot: false,
      q: 'WebSocket 是什么？和轮询有什么区别？',
      answer: '服务器要主动通知浏览器，HTTP 做不到——只能客户端问一次答一次。演进三步：短轮询定时刷，延迟大、全是无效请求；长轮询服务器 hold 住请求有数据才回，省空转但每次都有握手开销；WebSocket 借 HTTP 握手带 Upgrade 头，同意后协议切换成全双工——同一条 TCP 双向随时发，帧头只有几字节，心跳加重连是工程标配。',
      steps: [
        { title: '老问题：服务器开口', text: 'HTTP 是一问一答：客户端不问，服务器有新数据也只能憋着。聊天、行情这种要实时推的场景，就得想办法让服务器能主动说话——三代方案都在解这一题。' },
        { title: '轮询进化史', text: '短轮询：定时就问，延迟取决于间隔，绝大多数是无效空转。长轮询：服务器 hold 住请求，有数据才回，空转少了但每次都要重新发起、带全套握手。SSE：HTTP 单向流，只下行，够用但推不了上行。' },
        { title: 'WebSocket：协议切换', text: '握手借 HTTP：请求头带 Upgrade: websocket，服务器回 101 Switching Protocols，之后就不是 HTTP 了——同一条 TCP 变成全双工通道，双向随时发，帧头只有几字节。' },
        { title: '按场景选型', text: '高频双向：聊天、行情、协同编辑、多人游戏——WebSocket 的主场。低频或只要下行：SSE 或系统推送更省——别为三条通知拉一条全双工长连接。' },
        { title: '心跳与重连：工程标配', text: '中间设备（NAT、代理、负载均衡）会掐空闲连接：定时 ping/pong 保活。连接断了要能发现并重连：心跳超时判定 + 指数退避重试，别硬撞服务器。' },
      ],
      figure: { vb: '0 0 760 542', draw: n => layers(n, L, '0 0 760 542') },
      followups: [
        ['握手和 HTTP 什么关系？', '借 HTTP 101 Switching Protocols 升级，之后就不是 HTTP——80/443 可穿防火墙。'],
        ['SSE 和 WebSocket 怎么选？', '只要服务器到客户端的单向流，选 SSE：文本协议、自动重连、HTTP 基建全兼容；要双向才上 WebSocket。'],
        ['断线重连怎么设计？', '心跳超时判定连接死活；重连用指数退避加随机抖动，避免服务恢复瞬间被集中重连打垮。'],
        ['生产环境要 wss 吗？', '要。wss（TLS）防中间人窃听篡改，也避免运营商代理对裸 ws 流量的干扰。'],
      ],
      points: '三代实时方案：短轮询（傻快）、长轮询（省空转、握手贵）、WebSocket（全双工一条道）。\nWS 握手借 HTTP 的 101 协议升级，之后就不是 HTTP 了——帧头只有几字节。\n心跳 ping/pong + 指数退避重连是工程标配，面试主动提是加分项。',
    };
  }

  /* ============ 5. 常见的限流算法有哪些？ ============ */
  function qRateLimit() {
    const L = [
      () => box(48, 28, 300, 46, '固定窗口：每分钟最多 N 次') +
        box(412, 28, 300, 46, '缺陷：窗口边界突刺', { stroke: C.clay, color: C.clay }) +
        txt(380, 100, '计数器一行代码；但上一分钟末 + 下一分钟初可能瞬间放行 2N——边界突刺', { anchor: 'middle', fs: 12.5 }),
      () => box(48, 128, 300, 46, '滑动窗口：统计「最近 60 秒」') +
        box(412, 128, 300, 46, '窗口随时间滑动，消掉突刺', { stroke: C.moss, color: C.moss }) +
        txt(380, 200, '把窗口切成小格子滚动统计：格子越细越准，统计开销也越大', { anchor: 'middle', fs: 12.5 }),
      () => box(48, 228, 190, 56, '请求先进桶排队') +
        arrow(250, 256, 330, 256, { color: C.teal, label: '恒速流出' }) +
        box(332, 228, 150, 56, '匀速处理', { stroke: C.teal, color: C.teal }) +
        box(514, 228, 198, 56, '输出绝对平滑', { stroke: C.moss, color: C.moss }) +
        txt(380, 312, '强制整流：突发流量要么排队要么被拒——下游要绝对平滑用它；要「快速响应尖峰」它就太死板', { anchor: 'middle', fs: 12 }),
      () => box(48, 340, 190, 56, '恒定速率放令牌') +
        arrow(250, 368, 330, 368, { color: C.moss, label: '拿令牌' }) +
        box(332, 340, 150, 56, '有令牌才放行', { stroke: C.moss, color: C.moss }) +
        box(514, 340, 198, 56, '允许突发：攒的令牌', { stroke: C.moss, fs: 12 }) +
        txt(380, 424, '网关限流的主流选择：平均速率受限、合理突发放行——Guava 的 RateLimiter 就是令牌桶', { anchor: 'middle', fs: 12 }),
      () => box(48, 452, 220, 46, '多实例各记各的？不准', { stroke: C.clay, color: C.clay, fs: 12 }) +
        box(292, 452, 240, 46, 'Redis + Lua：判断+扣减原子', { stroke: C.accent, color: C.accent, fs: 12 }) +
        box(556, 452, 156, 46, '或网关统一限', { fs: 12 }) +
        txt(380, 526, '算法是本地的，分布式靠共享存储——Lua 把「查计数再扣减」打包成一步原子操作', { anchor: 'middle', fs: 12.5 }),
      () => box(48, 554, 210, 46, '防突发：令牌桶', { stroke: C.moss, color: C.moss, fs: 12.5 }) +
        box(276, 554, 210, 46, '要平滑：漏桶', { stroke: C.teal, color: C.teal, fs: 12.5 }) +
        box(504, 554, 208, 46, '简单统计：滑动窗口', { fs: 12.5 }) +
        txt(380, 628, '先想清楚限「平均」还是「瞬时」、允不允许突发——再挑算法，没有万能解', { anchor: 'middle', fs: 12.5, fw: 600 }),
    ];
    return {
      id: 'rate-limit', cat: '分布式', level: '进阶', hot: true,
      q: '常见的限流算法有哪些？',
      answer: '四个经典算法：固定窗口每分钟最多 N 次，最简单，但窗口边界会出 2N 突刺；滑动窗口把窗口切小格子随时间滑，消掉突刺；漏桶请求进桶、恒定速率流出，输出绝对平滑但不容突发；令牌桶恒速放令牌、拿到令牌才放行，允许攒出来的突发——网关限流的主流。分布式场景用 Redis + Lua 原子地判断加扣减。',
      steps: [
        { title: '固定窗口：最简单', text: '一分钟一个计数器，超了就拒。实现一行代码，但边界有突刺：上一分钟末打满 N 次、下一分钟初又打满 N 次，两秒内放行 2N——限流形同虚设的瞬间。' },
        { title: '滑动窗口：消突刺', text: '把窗口切成小格子，统计范围随时间滑动，永远是「最近 60 秒」。边界突刺没了；精度由格子粗细决定，格子越细越准、开销也越大。' },
        { title: '漏桶：强制整流', text: '请求先进桶排队，桶以恒定速率流出处理——不管进来多颠簸，出去绝对平滑。代价是突发流量只能排队或被拒：对要「快速响应尖峰」的场景太死板。' },
        { title: '令牌桶：允许突发', text: '恒定速率往桶里放令牌，请求拿到令牌才放行。平时限住平均速率，桶里攒下的令牌又容得下合理突发——Guava 的 RateLimiter、常见网关都是它。' },
        { title: '分布式：靠共享存储', text: '算法都是本地的，多实例部署后各记各的计数就不准了。要么 Redis + Lua 把「查计数再扣减」打包成原子操作，要么在网关层统一限流。' },
        { title: '怎么选', text: '防突发、保体验：令牌桶；下游娇贵要绝对平滑：漏桶；简单统计防刷：滑动窗口。先想清楚限「平均」还是「瞬时」、允不允许突发，再挑算法。' },
      ],
      figure: { vb: '0 0 760 658', draw: n => layers(n, L, '0 0 760 658') },
      followups: [
        ['突刺是怎么来的？', '两个相邻窗口边界各打满配额，叠加瞬间放行 2N——固定窗口的固有问题，滑动窗口就是冲它去的。'],
        ['令牌桶和漏桶的本质区别？', '令牌桶限「平均速率」且允许突发；漏桶限「恒定输出」，突发一律整形掉——一个容突发、一个削突发。'],
        ['Redis+Lua 为什么必须原子？', '「读计数、判断、写回」拆开就有并发窗口，会超放限流额度；Redis 执行 Lua 期间不插入其他命令。'],
        ['单机限流用什么？', 'Guava RateLimiter（令牌桶）、Sentinel（滑动窗口统计）；单机限流还兼当多机限流失效时的兜底。'],
      ],
      lab: { href: 'apps/system-lab/#/ratelimit', label: 'System Lab · 四种限流算法同屏对比，参数随手调' },
      points: '四件套顺序：固定窗口（有突刺）→ 滑动窗口（消突刺）→ 漏桶（恒定输出）→ 令牌桶（允许突发）。\n令牌桶是网关主流：平均限速 + 容忍突发；漏桶输在太死板。\n分布式限流 = 共享存储 + Lua 原子判断扣减，或网关层统一做。',
    };
  }

  /* ============ 6. 布隆过滤器的原理？为什么会有误判？ ============ */
  function qBloom() {
    const X = { fill: C.accent, stroke: C.accent }, Y = { fill: C.blue, stroke: C.blue };
    const X0 = 58, CW = 44, STEP = 46;
    const bits = (state, y) => {
      let s = '';
      for (let i = 0; i < 14; i++) {
        const x = X0 + i * STEP, st = state[i];
        s += `<rect x="${x}" y="${y}" width="${CW}" height="30" rx="4" fill="${st ? st.fill : C.surface2}" stroke="${st ? st.stroke : C.lineS}" stroke-width="${st ? 1.6 : 1.2}"/>` +
          txt(x + CW / 2, y + 20, st ? '1' : '0', { anchor: 'middle', fs: 11, mono: true, color: st ? '#f2efe8' : C.faint });
      }
      return s;
    };
    const ringAt = (i, y, color) =>
      `<rect x="${X0 + i * STEP - 3}" y="${y - 3}" width="${CW + 6}" height="36" rx="6" fill="none" stroke="${color}" stroke-width="2.2"/>`;
    const L = [
      () => box(56, 28, 300, 46, '海量数据判断「存不存在」') +
        box(404, 28, 300, 46, 'Set 全存太贵、DB 查询太慢') +
        txt(380, 100, '既要快又要省内存——布隆过滤器：一个位数组加 K 个哈希函数的存在性摘要', { anchor: 'middle', fs: 12.5 }),
      () => txt(380, 130, '插入 x：把它哈希到的 K 个位全置 1（图中 K=2）', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        txt(58, 138, '位数组（m 位）', { fs: 11 }) +
        bits({ 1: X, 12: X }, 146) +
        box(300, 202, 160, 40, '插入 x', { stroke: C.accent, color: C.accent }) +
        arrow(320, 200, 126, 180, { color: C.accent }) +
        arrow(440, 200, 632, 180, { color: C.accent }),
      () => bits({ 1: X, 5: Y, 12: X }, 268) + ringAt(12, 268, C.clay) +
        box(56, 324, 170, 40, '再插入 y', { stroke: C.blue, color: C.blue }) +
        arrow(228, 334, 302, 304, { color: C.blue }) +
        arrow(228, 354, 624, 304, { color: C.clay, label: '撞上 x 置过的位' }) +
        txt(380, 392, '数组只记 0/1、不记「谁置的」：y 的一个哈希位恰好是 x 置过的——位是共享的', { anchor: 'middle', fs: 12 }),
      () => bits({ 1: X, 5: Y, 12: X }, 414) + ringAt(1, 414, C.clay) + ringAt(5, 414, C.clay) +
        box(40, 470, 180, 40, '查询 z（没插入过）', { stroke: C.clay, color: C.clay, fs: 12 }) +
        arrow(222, 480, 132, 452, { color: C.clay }) +
        arrow(222, 498, 308, 452, { color: C.clay }) +
        txt(380, 536, 'z 的 K 个位恰好全被别人置过 1 → 误判「可能存在」；但凡有一位是 0 → 一定不存在', { anchor: 'middle', fs: 12.5, fw: 600 }),
      () => box(48, 560, 220, 46, '误判率：m/n 越大越低', { fs: 12 }) +
        box(286, 560, 230, 46, '最优哈希数 k ≈ m/n·ln2', { fs: 12 }) +
        box(534, 560, 178, 46, '不能删：位共享', { stroke: C.clay, color: C.clay, fs: 12 }) +
        txt(380, 634, '要删换计数布隆（每位存计数）或定期重建；Guava / Redisson / RedisBloom 都有现成实现', { anchor: 'middle', fs: 12.5, fw: 600 }),
    ];
    return {
      id: 'bloom-filter', cat: '分布式', level: '进阶', hot: false,
      q: '布隆过滤器的原理？为什么会有误判？',
      answer: '布隆过滤器是一个很长的位数组加 K 个独立哈希函数：插入时把元素的 K 个哈希位全置 1；查询时 K 个位全 1 就说「可能存在」，任一位是 0 就「一定不存在」。误判来自位共享：别人置过的 1 被你「凑齐」了。它可能误判存在、绝不误判不存在——这个不对称正好守住缓存穿透的入口。代价：不能删除。',
      steps: [
        { title: '问题：便宜的存在性判断', text: '海量数据里判断「一个东西存不存在」：Set 全存内存吃不消，DB 查询太慢。要一个又快又省的摘要结构——布隆过滤器，位数组加 K 个哈希函数。' },
        { title: '插入与查询的动作', text: '插入：把元素的 K 个哈希位置全置 1。查询：K 个位置全 1 → 「可能存在」；任何一个位是 0 → 「一定不存在」——0 说明从没人置过这个位，铁证。' },
        { title: '为什么会误判', text: '位是共享的：别的元素把这几个位置过 1，查询元素明明没插入过，K 个位却恰好被「凑齐」了。数组只记 0/1、不记谁置的，分不清就只好往「存在」里算。' },
        { title: '不对称性才是价值', text: '它可能把不存在的说成存在（false positive），绝不把存在的说成不存在（false negative）。缓存穿透场景里，「一定没有」直接拒绝——宁可偶尔放错，绝不漏放。' },
        { title: '参数与边界', text: '位数组相对元素数（m/n）越大误判率越低；哈希个数有最优值 k ≈ m/n·ln2，多了少了都更差。不能删除：位共享，清 0 会误伤别人——要删用计数布隆或定期重建。' },
      ],
      figure: { vb: '0 0 760 664', draw: n => layers(n, L, '0 0 760 664') },
      followups: [
        ['能删除元素吗？', '不能：多个元素共享位，清 0 会误伤别人。要删换计数布隆（每位存计数）或布谷鸟过滤器，或定期重建。'],
        ['误判率怎么控？', '由 m/n（每位摊到几个元素）和哈希个数 k 决定；k 取最优值 m/n·ln2 时误判率最低。'],
        ['缓存穿透里怎么接？', '入口先问布隆：「一定没有」直接拒绝，不碰缓存和 DB；「可能有」再走正常链路——呼应缓存三兄弟。'],
        ['落地用什么库？', 'Guava/Redisson 的 BloomFilter 都能用；Redis 另有 RedisBloom 模块。'],
      ],
      lab: { href: 'apps/system-lab/#/bloom', label: 'System Lab · 布隆过滤器：理论 vs 实测误判率' },
      points: '一句话：K 个哈希置位——全 1 是「可能存在」（会误判），有 0 是「一定不存在」（绝不误判）。\n不能删除：位共享会误伤别人；要删换计数布隆或定期重建。\n缓存穿透的入口守门员：「一定没有」直接拒绝，替 DB 挡住恶意查询。',
    };
  }

  /* ============ 7. 什么是零拷贝？Kafka 和 Nginx 为什么快？ ============ */
  function qZeroCopy() {
    const L = [
      () => box(160, 24, 440, 34, '① DMA 拷贝：磁盘 → 内核缓冲（页缓存）', { fs: 12 }) +
        box(160, 66, 440, 34, '②③ CPU 拷贝：内核缓冲 → 用户缓冲 → socket 缓冲', { stroke: C.clay, color: C.clay, fs: 12 }) +
        box(160, 108, 440, 34, '④ DMA 拷贝：socket 缓冲 → 网卡', { fs: 12 }) +
        txt(380, 170, 'read 与 write 各要切入切出内核：合计 4 次拷贝 + 4 次状态切换，CPU 全程当搬运工', { anchor: 'middle', fs: 12.5 }),
      () => box(56, 210, 150, 46, '磁盘') +
        box(290, 210, 170, 46, '内核缓冲', { stroke: C.blue, color: C.blue }) +
        box(550, 210, 162, 46, 'socket 缓冲', { fs: 12.5 }) +
        arrow(210, 233, 286, 233, { color: C.blue, label: 'DMA' }) +
        arrow(464, 233, 546, 233, { color: C.clay, label: 'CPU' }) +
        txt(380, 284, 'sendfile：数据不进用户态，内核缓冲直接到 socket 缓冲——拷贝 4→3、切换 4→2', { anchor: 'middle', fs: 12.5, fw: 600 }),
      () => box(56, 312, 150, 46, '内核缓冲（数据在）', { stroke: C.blue, color: C.blue, fs: 11.5 }) +
        box(336, 312, 170, 46, 'socket：只挂描述符', { dashed: true, fs: 11.5 }) +
        box(568, 312, 144, 46, '网卡', { stroke: C.teal, color: C.teal }) +
        arrow(210, 335, 332, 335, { color: C.clay, label: '只附描述符' }) +
        arrow(510, 335, 564, 335, { color: C.moss, label: 'DMA' }) +
        txt(380, 386, 'CPU 把描述符（地址+长度）挂到 socket，数据由 DMA 从内核缓冲直达网卡——CPU 零参与，这就是零拷贝', { anchor: 'middle', fs: 12.5, fw: 600 }),
      () => box(48, 414, 230, 46, 'Kafka：消费拉取走 sendfile', { fs: 12 }) +
        box(296, 414, 200, 46, 'Nginx：静态文件直出', { fs: 12 }) +
        box(514, 414, 198, 46, 'CPU 几乎不碰数据', { stroke: C.moss, color: C.moss, fs: 12 }) +
        txt(380, 488, '共同点：大文件、纯转发、中间不改数据——正好是 sendfile 的主场', { anchor: 'middle', fs: 12.5 }),
      () => box(48, 516, 330, 46, 'FileChannel.transferTo() 封装 sendfile', { mono: true, stroke: C.accent, color: C.accent, fs: 12 }) +
        box(402, 516, 310, 46, 'mmap：文件映射进用户地址空间', { fs: 12 }) +
        txt(380, 590, '要改数据、小文件走 mmap（RocketMQ 的 CommitLog）；纯转发大文件走 sendfile（Kafka）', { anchor: 'middle', fs: 12.5, fw: 600 }),
    ];
    return {
      id: 'zero-copy', cat: '操作系统', level: '进阶', hot: true,
      q: '什么是零拷贝？Kafka 和 Nginx 为什么快？',
      answer: '传统 read+write 搬四趟：磁盘→内核→用户→socket→网卡，4 拷贝 4 切换，CPU 全程当搬运工。sendfile 让数据不进用户态，降到 3 拷贝 2 切换；网卡支持 scatter-gather 时 CPU 只挂描述符、DMA 直达网卡——CPU 拷贝归零，即零拷贝。Kafka 消费、Nginx 静态文件都在吃红利。',
      steps: [
        { title: '传统 IO 的搬运账', text: 'read 再 write：磁盘 → 内核缓冲 → 用户缓冲 → socket 缓冲 → 网卡，四次拷贝里两次是 CPU 干的，外加四次用户态/内核态切换。CPU 全程当搬运工，正经业务一行代码没跑。' },
        { title: '第一步：sendfile', text: 'sendfile 是一条系统调用：数据不进用户态，内核缓冲直接拷到 socket 缓冲——用户缓冲这一站被删掉，拷贝 4→3、切换 4→2。省的就是中转和来回切换。' },
        { title: 'DMA gather 直达', text: '网卡支持 scatter-gather 时更狠：CPU 只把「描述符」（数据地址+长度）挂到 socket，数据由 DMA（外设不经 CPU 直接搬内存的机制）从内核缓冲直达网卡——CPU 拷贝归零，这才是零拷贝。' },
        { title: '谁在吃红利', text: 'Kafka 消费者拉消息走 sendfile，broker 的 CPU 几乎不碰数据；Nginx 静态文件直出也是它。共同点：大文件、纯转发、中间不改数据——正好是 sendfile 的主场。' },
        { title: 'Java 落点与 mmap', text: 'Java 里 FileChannel.transferTo() 就是 sendfile 的封装。另一条减少拷贝的路是 mmap（内存映射，把文件映射进用户地址空间），适合要改数据或小文件——RocketMQ 的 CommitLog 用的就是它。' },
      ],
      figure: { vb: '0 0 760 620', draw: n => layers(n, L, '0 0 760 620') },
      followups: [
        ['传统 IO 几次拷贝几次切换？', '4 次拷贝（2 次 DMA + 2 次 CPU）、4 次用户态/内核态切换——账要当场算清楚。'],
        ['mmap 和 sendfile 怎么选？', '要改数据、随机访问、小文件用 mmap；纯转发大文件用 sendfile——一个进用户态可写，一个根本不进。'],
        ['Kafka 为什么快？', '组合拳：顺序写、页缓存、批量加压缩、零拷贝——零拷贝只是其中一块，别只答一个。'],
        ['零拷贝是完全没有拷贝吗？', '不是：DMA 拷贝还在（2 次），「零」指的是 CPU 不参与数据拷贝，CPU 省下来干正事。'],
      ],
      points: '账要会算：传统 4 拷贝 4 切换 → sendfile 3 拷贝 2 切换 → DMA gather 后 CPU 零参与。\nJava 封装是 FileChannel.transferTo()；另一条路是 mmap——RocketMQ 用它。\nKafka 快是组合拳：顺序写、页缓存、批量、零拷贝——只答零拷贝会显得单薄。',
    };
  }

  /* 7 题；由门户或测试拼进完整题库（QA_PART_8） */
  w.QA_PART_8 = [qZset(), qSentinel(), qHttp23(), qWebsocket(), qRateLimit(), qBloom(), qZeroCopy()];
})(typeof window !== 'undefined' ? window : globalThis);
