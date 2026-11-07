/* ============ QA Part 3 · Redis 五题 + 框架三题 ============
   Redis 为什么快 / RDB-AOF / 过期删除与淘汰 / 分布式锁 / 缓存一致性 /
   IOC-AOP / Bean 生命周期与循环依赖 / Spring 事务失效。
   纯数据 + SVG 字符串，不碰 DOM；画图助手复用 qa-deck.js 暴露的 w.__qaHelpers。
   每题 figure.draw(n)：第 0..n 层显影（opacity 1），之后降 0.15；图层数与 steps 一一对应。 */
(function (w) {
  'use strict';
  const { C, SANS, MONO, box, txt, arrow, chip, layers } = w.__qaHelpers;

  /* ============ 1. Redis 为什么这么快？ ============ */
  function qFast() {
    const band = (y, color, label) => box(48, y, 168, 42, label, { stroke: color, color: color, fs: 12.5 });
    const L = [
      () => band(24, C.accent, '① 纯内存操作') +
        txt(236, 42, '数据全在内存，读写不碰磁盘随机 IO', { fs: 12.5, fw: 600 }) +
        txt(236, 62, '磁盘寻址毫秒级、内存纳秒级——差好几个数量级', { fs: 12, color: C.muted }),
      () => band(88, C.blue, '② 高效数据结构') +
        txt(236, 106, 'SDS 动态字符串、zset 跳表、压缩列表', { fs: 12.5, fw: 600 }) +
        txt(236, 126, '每种类型都为访问模式定制：预分配、多层索引、紧凑存储', { fs: 12, color: C.muted }),
      () => band(144, C.teal, '③ 单线程执行') +
        txt(236, 162, '命令执行单线程：没有锁竞争、没有上下文切换', { fs: 12.5, fw: 600 }) +
        txt(236, 182, 'Redis 6.0 起网络 IO 可多线程，命令执行仍是单线程', { fs: 12, color: C.accent, fw: 600 }),
      () => band(200, C.moss, '④ IO 多路复用') +
        txt(236, 218, 'epoll：一个线程盯着成千上万个连接，谁就绪处理谁', { fs: 12.5, fw: 600 }) +
        txt(236, 238, '事件驱动不空转，单线程也撑得起海量连接', { fs: 12, color: C.muted }),
      () => band(256, C.clay, '⑤ 也有慢的时候') +
        txt(236, 274, 'bigkey（超大 value）耗时、热 key 把单个节点打满', { fs: 12.5, fw: 600, color: C.clay }) +
        txt(236, 294, 'keys * 这类 O(N) 命令独占执行线程，全场排队——用 scan 替代', { fs: 12, color: C.muted }),
    ];
    return {
      id: 'redis-fast', cat: 'Redis', level: '入门', hot: true,
      q: 'Redis 为什么这么快？',
      answer: 'Redis 快在四件事：一是纯内存操作，读写不碰磁盘随机 IO，这是数量级的差距；二是数据结构为访问模式定制——SDS、跳表、压缩列表；三是命令执行单线程，没有锁竞争和上下文切换；四是 IO 多路复用，一个线程盯着海量连接。注意表述：6.0 起网络 IO 可多线程，命令执行仍单线程。慢场景：bigkey、热 key、keys *。',
      steps: [
        { title: '纯内存：数量级的差距', text: 'Redis 把数据全放在内存里，读写完全不碰磁盘随机 IO——磁盘寻址是毫秒级、内存访问是纳秒级，差好几个数量级。这是快的第一因，其他优化都是锦上添花。' },
        { title: '数据结构为访问模式定制', text: 'SDS（简单动态字符串：记录长度、O(1) 取长度、预分配减少重分配）、跳表（zset 底层，链表加多层索引，范围查询快）、压缩列表（小数据量的紧凑省内存结构）——每种类型都按访问模式挑结构。' },
        { title: '单线程：无锁无切换', text: '命令执行始终单线程：没有锁竞争、没有线程上下文切换，还天然原子。注意版本表述：Redis 6.0 起网络读写可以多线程，但命令执行仍是单线程——这个细节说出来显专业。' },
        { title: 'IO 多路复用：epoll', text: 'IO 多路复用（一个线程同时盯一大批连接，谁的读写就绪就处理谁，Linux 上靠 epoll 实现）加事件驱动，单线程也能撑起海量连接，不用每个连接配一个线程干等。' },
        { title: '它也有慢的时候', text: 'bigkey（超大 value）读写删除都耗时；热 key 把单个节点打满；keys * 这类 O(N) 命令会独占唯一的执行线程，全场跟着排队——线上用 scan 分批遍历代替。' },
      ],
      figure: { vb: '0 0 760 314', draw: n => layers(n, L, '0 0 760 314') },
      followups: [
        ['单线程为什么反而快？', '省掉锁竞争和线程切换；瓶颈本来就在内存和网络，CPU 从来不是瓶颈。'],
        ['6.0 的多线程干什么？', '只负责读写网络包和协议解析，命令执行仍单线程——保住每个命令的原子性。'],
        ['keys * 为什么危险？', 'O(N) 遍历还独占唯一的执行线程，线上阻塞秒级起步；用 scan 分批游标遍历。'],
        ['bigkey 怎么排查？', 'redis-cli --bigkeys 扫描；删除用 unlink 异步删，别用 del 阻塞主线程。'],
      ],
      points: '四件套：纯内存、好结构、单线程、epoll——按这个顺序报。\n6.0 的多线程只管网络 IO，命令执行仍单线程——版本细节说出来显专业。\n慢场景主动交代：bigkey、热 key、keys *（用 scan 替代）。',
    };
  }

  /* ============ 2. RDB 和 AOF 两种持久化怎么选？ ============ */
  function qPersistence() {
    const L = [
      () => chip(48, 22, 'RDB · 定时快照', C.blue) +
        txt(380, 38, '两次快照之间宕机 → 中间的数据全丢', { anchor: 'middle', color: C.clay, fs: 12, fw: 600 }) +
        `<line x1="56" y1="74" x2="704" y2="74" stroke="${C.lineS}" stroke-width="2"/>` +
        box(108, 60, 72, 28, '快照 t1', { fs: 11, stroke: C.blue, color: C.blue }) +
        box(392, 60, 72, 28, '快照 t2', { fs: 11, stroke: C.blue, color: C.blue }) +
        box(648, 60, 72, 28, '快照 t3', { fs: 11, stroke: C.blue, color: C.blue }) +
        txt(380, 108, 'bgsave：fork 子进程写盘（写时复制），主进程几乎不阻塞', { anchor: 'middle', fs: 12 }),
      () => box(56, 122, 310, 44, '账：恢复快 · 文件紧凑小', { stroke: C.moss, color: C.moss, fs: 12.5 }) +
        box(394, 122, 310, 44, '账：宕机最多丢一整个间隔', { stroke: C.clay, color: C.clay, dashed: true, fs: 12.5 }),
      () => chip(48, 182, 'AOF · 命令日志', C.teal) +
        `<line x1="56" y1="216" x2="704" y2="216" stroke="${C.lineS}" stroke-width="2"/>` +
        [120, 176, 232, 288, 344, 400, 456, 512, 568, 624, 680].map(x =>
          `<line x1="${x}" y1="208" x2="${x}" y2="224" stroke="${C.teal}" stroke-width="1.6"/>`).join('') +
        txt(380, 246, '每条写命令都追加；fsync（强制把缓冲刷进磁盘）时机三选一', { anchor: 'middle', fs: 12 }) +
        box(52, 258, 216, 40, 'always 每条刷 · 最安全最慢', { fs: 11 }) +
        box(272, 258, 216, 40, 'everysec 默认 · 最多丢 1 秒', { fs: 11, stroke: C.accent, color: C.accent }) +
        box(492, 258, 216, 40, 'no 交给操作系统', { fs: 11 }),
      () => box(56, 312, 226, 44, 'AOF 越攒越大', { fs: 12.5 }) +
        arrow(286, 334, 330, 334, { color: C.muted }) +
        box(334, 312, 370, 44, '重写：fork 子进程按当前数据生成最小命令集', { fs: 12, stroke: C.teal, color: C.teal }) +
        txt(380, 380, '替换旧文件：效果等价、体积大幅缩水', { anchor: 'middle', fs: 12 }),
      () => txt(380, 404, '混合持久化（Redis 4.0+）：重写时前半 RDB 全量 + 后半 AOF 增量', { anchor: 'middle', fs: 12.5, fw: 600, color: C.accent }) +
        box(56, 414, 648, 40, '', { fill: C.surface2 }) +
        `<rect x="60" y="418" width="330" height="32" rx="6" fill="${C.blue}"/>` +
        txt(225, 439, 'RDB 全量快照（前半）', { anchor: 'middle', color: '#f2efe8', fs: 12, fw: 600 }) +
        `<rect x="394" y="418" width="306" height="32" rx="6" fill="${C.teal}"/>` +
        txt(547, 439, 'AOF 增量命令（后半）', { anchor: 'middle', color: '#f2efe8', fs: 12, fw: 600 }) +
        txt(380, 472, '恢复快 + 丢得少——当内存库用就开混合；纯缓存甚至可以都不开', { anchor: 'middle', fs: 12.5, fw: 600 }),
    ];
    return {
      id: 'redis-persistence', cat: 'Redis', level: '进阶', hot: true,
      q: 'RDB 和 AOF 两种持久化怎么选？',
      answer: 'RDB 是定时快照：bgsave fork 子进程写紧凑二进制文件，写时复制让主进程不阻塞；恢复快、文件小，但快照间隔里宕机就丢数据。AOF 是命令日志：每条写命令追加，fsync 默认 everysec，最多丢约 1 秒，日志大了靠重写瘦身。4.0 起有混合持久化：前半 RDB 全量、后半 AOF 增量，恢复快丢得少；纯缓存可以不开。',
      steps: [
        { title: 'RDB：定时快照', text: 'RDB 把某一时刻的内存数据整体写成紧凑的二进制文件。用 bgsave 触发：主进程 fork 出子进程去写盘，fork 后内存页父子共享、谁改才复制谁（写时复制），主进程几乎不阻塞。' },
        { title: 'RDB 的账', text: '好处：文件小、恢复快，直接载入内存就能跑。代价：两次快照之间的数据不在线——这个间隔里宕机，中间的写入全丢，最坏丢一整个间隔。所以 RDB 适合做备份容灾，不适合当唯一防线。' },
        { title: 'AOF：命令日志', text: 'AOF 把每条写命令追加进日志文件，重启时重放。fsync（强制把缓冲刷进磁盘）三档：always 每条都刷，最安全最慢；everysec 每秒刷，默认档，最多丢约 1 秒；no 交给操作系统，最快最不稳。' },
        { title: 'AOF 重写：日志瘦身', text: '按命令记账，同一个 key 改一百次就攒一百条，文件越滚越大。重写：fork 子进程按当前内存数据生成一份最小命令集，替换旧文件——效果等价、体积大幅缩水，期间主进程照常服务。' },
        { title: '混合持久化与选型', text: 'Redis 4.0 起支持混合持久化：重写时前半段存 RDB 全量、后半段存增量 AOF——恢复快、丢得少，当内存库用就开它。纯缓存场景甚至可以都不开，别为用不到的持久化付性能税。' },
      ],
      figure: { vb: '0 0 760 492', draw: n => layers(n, L, '0 0 760 492') },
      followups: [
        ['bgsave 时主进程写数据会怎样？', 'fork 后父子共享内存页，主进程改哪页就复制哪页（写时复制），互不干扰。'],
        ['AOF 文件损坏怎么办？', '用 redis-check-aof 修复（截掉损坏尾部），修好再重启恢复。'],
        ['everysec 最多丢多少？', '约 1 秒：刷盘由后台线程每秒执行一次，宕机最多丢上一个周期的写入。'],
        ['恢复太慢怎么办？', '上 4.0 混合持久化：恢复走前半段 RDB 全量，速度提上来、丢失又可控。'],
      ],
      points: 'RDB=快照：恢复快文件小，代价是丢一个间隔；AOF=命令日志：丢得少文件大。\neverysec 是默认，最多丢约 1 秒；重写解决日志膨胀。\n4.0 混合持久化两头都要；纯缓存可以都不开。',
    };
  }

  /* ============ 3. Redis 的过期删除和内存淘汰策略？ ============ */
  function qEviction() {
    const cell = (x, y, name, hot) =>
      `<rect x="${x}" y="${y}" width="170" height="38" rx="8" fill="${hot ? C.surface2 : C.surface}" stroke="${hot ? C.accent : C.lineS}" stroke-width="${hot ? 1.8 : 1.4}"/>` +
      txt(x + 85, y + 24, name, { anchor: 'middle', fs: 11, fw: hot ? 700 : 600, mono: true, color: hot ? C.clay : C.ink });
    const L = [
      () => box(48, 24, 310, 42, '过期删除：到期的 key 怎么删', { stroke: C.teal, color: C.teal, fs: 12.5 }) +
        box(402, 24, 310, 42, '内存淘汰：内存满了踢谁', { stroke: C.accent, color: C.accent, fs: 12.5 }) +
        txt(380, 90, '两件事别混——面试先拆概念，再分别作答', { anchor: 'middle', fs: 12.5, fw: 600 }),
      () => box(48, 104, 140, 40, '惰性删除', { stroke: C.blue, color: C.blue, fs: 12.5 }) +
        txt(200, 118, '访问时才检查：过期就删，平时不管', { fs: 12 }) +
        txt(200, 138, '缺点：没人访问的过期 key 堆积占内存', { fs: 11.5, color: C.clay }) +
        box(428, 104, 140, 40, '定期删除', { stroke: C.teal, color: C.teal, fs: 12.5 }) +
        txt(580, 118, '周期性随机抽查，删掉过期的', { fs: 12 }) +
        txt(580, 138, '兜住惰性删不完的堆积', { fs: 11.5, color: C.faint }) +
        txt(380, 166, '为什么不精确到点：给每个 key 挂定时器，开销大到不现实', { anchor: 'middle', fs: 12, fw: 600 }),
      () => chip(48, 180, '内存满 → 淘汰', C.accent) +
        txt(260, 195, 'maxmemory 到线才触发；按「范围 × 算法」记 8 种', { fs: 12 }) +
        cell(25, 206, 'noeviction 默认', true) + cell(205, 206, 'allkeys-lru') + cell(385, 206, 'volatile-lru') + cell(565, 206, 'allkeys-lfu') +
        cell(25, 252, 'volatile-lfu') + cell(205, 252, 'allkeys-random') + cell(385, 252, 'volatile-random') + cell(565, 252, 'volatile-ttl') +
        txt(380, 312, 'LRU 最久未用 · LFU 最不常用（4.0+）· random 随机 · ttl 越早到期越先踢', { anchor: 'middle', fs: 12 }),
      () => box(120, 326, 220, 40, '随机采样 N 个 key', { fs: 12 }) +
        arrow(344, 346, 392, 346, { color: C.muted, label: '比一比' }) +
        box(396, 326, 244, 40, '踢掉其中最久未访问的', { fs: 12, stroke: C.accent, color: C.accent }) +
        txt(380, 392, '近似 LRU：省掉维护精确链表的开销——这是 Redis 的取舍', { anchor: 'middle', fs: 12.5, fw: 600 }),
      () => box(56, 406, 320, 44, '缓存场景：allkeys-lru / allkeys-lfu', { stroke: C.moss, color: C.moss, fs: 12 }) +
        box(404, 406, 300, 44, '默认 noeviction：满了写报错', { stroke: C.clay, color: C.clay, fs: 12 }) +
        txt(380, 474, '生产必配 maxmemory——不配等于把淘汰开关关掉', { anchor: 'middle', fs: 12.5, fw: 600, color: C.accent }),
    ];
    return {
      id: 'redis-eviction', cat: 'Redis', level: '进阶', hot: false,
      q: 'Redis 的过期删除和内存淘汰策略？',
      answer: '两件事分开答。过期删除管「到期 key 怎么删」：惰性删除（访问时才删）加定期删除（周期随机抽查）——不精确到点，给每个 key 挂定时器太贵。内存淘汰管「满了踢谁」：maxmemory 触发，8 种策略，默认 noeviction 满了写报错，缓存常用 allkeys-lru 或 lfu；LRU 是近似实现——随机采样，淘汰最久未用的。',
      steps: [
        { title: '先拆成两件事', text: '面试先把概念拆开：过期删除管的是「key 到期了怎么删」，由访问和后台周期触发；内存淘汰管的是「内存满了踢谁」，由 maxmemory 触发。两套机制、两个触发条件，混着答必扣分。' },
        { title: '过期删除：惰性加定期', text: '惰性删除：访问时才检查，过期就删，没人访问就先赖着；定期删除：后台周期性随机抽查一批 key，把过期的删掉兜底。为什么不精确到点：给每个 key 挂定时器，开销大到不现实。' },
        { title: '内存淘汰：8 种策略', text: 'maxmemory（内存上限）到线才触发。8 种：noeviction 默认，满了写报错；allkeys-lru 全空间；volatile-lru 只碰带过期的；lfu 两种按频率（4.0+）；random 随机；volatile-ttl 越早到期越先踢。' },
        { title: 'LRU 是近似实现', text: 'Redis 的 LRU 不是精确链表，是近似实现：随机采样若干个 key（默认 5 个），淘汰其中最久未访问的——省掉维护全局链表的内存开销，效果够用；LFU（最不常用，4.0+）同样按采样统计。' },
        { title: '生产怎么配', text: '生产必配 maxmemory：不配等于关掉淘汰开关，满了要么写报错、要么吃光机器内存。缓存场景选 allkeys-lru 或 allkeys-lfu；注意 volatile 系列只碰设了过期时间的 key，没设的它不碰。' },
      ],
      figure: { vb: '0 0 760 494', draw: n => layers(n, L, '0 0 760 494') },
      followups: [
        ['LRU 和 LFU 区别？', 'LRU 看最近有没有用，LFU 看用得勤不勤；偶发批量扫库会把 LRU 的热点冲掉，LFU 抗这种干扰。'],
        ['没设过期时间的 key 会被 volatile 策略淘汰吗？', '不会。volatile 系列只碰设了 TTL 的 key；一个都没有时表现同 noeviction。'],
        ['惰性删除的缺点？', '没人访问的过期 key 会堆积占内存，必须靠定期删除周期抽查兜底。'],
      ],
      points: '先拆概念：过期删除（惰性+定期）≠ 内存淘汰（maxmemory + 8 策略）。\n默认 noeviction 满了写报错——线上必须显式配。\n缓存场景 allkeys-lru / lfu；volatile 系列不碰没设过期的 key。',
    };
  }

  /* ============ 4. Redis 怎么实现分布式锁？有哪些坑？ ============ */
  function qLock() {
    const life = x => `<line x1="${x}" y1="104" x2="${x}" y2="488" stroke="${C.line}" stroke-dasharray="4 4"/>`;
    const L = [
      () => box(80, 24, 140, 44, '实例 A') +
        box(310, 24, 140, 44, 'Redis · 锁', { stroke: C.teal, color: C.teal }) +
        box(540, 24, 140, 44, '实例 B') +
        life(150) + life(380) + life(610) +
        txt(380, 92, '多实例抢同一个任务：单机锁管不了跨进程，得找公认的裁判', { anchor: 'middle', fs: 12.5, fw: 600 }),
      () => arrow(154, 132, 376, 132, { color: C.blue, label: '① SET lock uuid NX EX 30', mono: true }) +
        arrow(606, 158, 384, 158, { color: C.clay, label: '② B：NX 失败，锁已存在', dashed: true }) +
        txt(380, 186, '一条命令原子完成：不存在才设置 + 挂 30 秒过期', { anchor: 'middle', fs: 12 }),
      () => txt(380, 208, '坑一：A 执行太慢，锁先过期了', { anchor: 'middle', color: C.clay, fs: 12.5, fw: 700 }) +
        arrow(606, 236, 384, 236, { color: C.moss, label: 'B 抢到锁（锁已自动过期）' }) +
        arrow(154, 264, 376, 264, { color: C.clay, label: 'A 回来直接 DEL——删了 B 的锁 ✗', dashed: true }),
      () => txt(380, 292, '解法：value 存唯一标识 uuid，释放用 Lua 脚本校验', { anchor: 'middle', fs: 12.5, fw: 600, color: C.moss }) +
        box(96, 304, 320, 40, 'Lua：比对 value 是自己 → 才 DEL', { mono: true, fs: 11.5, stroke: C.moss, color: C.moss }) +
        txt(380, 368, '比对 + 删除两步必须原子，否则又有人插队', { anchor: 'middle', fs: 12 }),
      () => txt(380, 396, '坑二：业务没跑完，锁先过期 → 看门狗续期', { anchor: 'middle', fs: 12.5, fw: 600, color: C.teal }) +
        arrow(154, 424, 376, 424, { color: C.teal, label: '看门狗：每 10 秒把 TTL 续回 30 秒', dashed: true }) +
        txt(380, 452, 'Redisson watchdog：默认 30 秒租约，到 1/3 就续', { anchor: 'middle', fs: 11.5, color: C.faint }),
      () => txt(380, 480, '坑三：主挂了锁没同步到从，新主上别人又能拿锁——Redlock 有争议', { anchor: 'middle', fs: 12, color: C.clay }) +
        box(48, 492, 320, 42, '能用 ZooKeeper / etcd 就用强一致锁', { fs: 12 }) +
        box(392, 492, 320, 42, '锁只做效率优化，正确性靠幂等兜底', { fs: 12, stroke: C.accent, color: C.accent }),
    ];
    return {
      id: 'redis-lock', cat: 'Redis', level: '进阶', hot: true,
      q: 'Redis 怎么实现分布式锁？有哪些坑？',
      answer: '单机锁管不了跨进程，要用 Redis 当裁判。加锁一条命令原子完成：SET key uuid NX EX 30。释放用 Lua 脚本先比对 value 是自己的再删，防止误删别人的锁；业务没跑完靠看门狗续期（Redisson 默认 30 秒、每 10 秒续）。主从切换可能丢锁，Redlock 有争议——锁只做效率优化，正确性靠幂等兜底。',
      steps: [
        { title: '需求：跨进程的锁', text: '订单去重、任务防重跑，服务是多实例部署，单机里的锁（synchronized 这类语言级锁）只管自己进程——需要所有实例公认的裁判，这就是分布式锁。' },
        { title: '第一版：一条命令加锁', text: 'SETNX 加锁、EXPIRE 设过期是两步操作，中间宕机就是死锁；反过来锁提前被别人拿走也会互相删。正确姿势一条命令原子完成：SET lock uuid NX EX 30——不存在才设置、带 30 秒过期。' },
        { title: '坑一：误删别人的锁', text: 'A 执行太慢锁先过期，B 拿到锁，A 回来一句 DEL 把 B 的锁删了。解法：value 存唯一标识 uuid，释放用 Lua 脚本（把多条命令打包成一步原子执行的脚本）先比对是自己才删——比对加删除必须原子。' },
        { title: '坑二：锁先过期', text: '业务没跑完、锁先到期，照样并发。解法是看门狗：加锁成功的线程由后台定期把 TTL 续回去，业务跑完才真正释放——Redisson 的 watchdog 默认 30 秒租约、每 10 秒续一次。' },
        { title: '坑三：主从切换', text: '主节点挂了，锁还没异步同步到从节点，新主上没有这条锁记录，别人又能加锁。Redlock（向多个独立节点加锁、过半成功才算赢）试图解决但争议很大——Martin Kleppmann 和 antirez 有过著名论战，答出名字即可。' },
        { title: '结论：三条铁律', text: '能用 ZooKeeper、etcd 这种强一致组件做锁就用。Redis 锁记三条：SET NX EX 原子加锁、Lua 验身份再删、看门狗防过期。更实在的一句：锁只做效率优化，正确性靠幂等兜底。' },
      ],
      figure: { vb: '0 0 760 554', draw: n => layers(n, L, '0 0 760 554') },
      followups: [
        ['Lua 脚本为什么必须？', '「比对 value」和「删除」两步要原子，拆开就有人插队；Redis 执行 Lua 期间不插入其他命令。'],
        ['Redisson 看门狗默认多久？', '默认 30 秒租约，后台每 10 秒（三分之一处）续期一次，业务跑完才真正释放。'],
        ['Redlock 争议是什么？', 'Martin Kleppmann 质疑其安全性（时钟跳变、进程停顿），antirez 反驳——答出这场论战即可。'],
        ['锁粒度怎么设计？', '按业务键加锁（如订单号），别锁全局；粒度越细并发越高，同一资源要防重复加锁。'],
      ],
      points: '三条铁律：SET NX EX 原子加、Lua 验身份再删、看门狗防过期。\n坑三主从切换丢锁——Redlock（Kleppmann vs antirez）答出名字即可。\n格局句：锁只做效率优化，正确性靠幂等兜底。',
    };
  }

  /* ============ 5. 缓存和数据库的双写一致性怎么保证？ ============ */
  function qConsistency() {
    const L = [
      () => txt(380, 34, '先定调：缓存和 DB 是两个存储，追的是最终一致——强一致要上分布式事务，不值', { anchor: 'middle', fs: 12.5, fw: 700 }) +
        txt(380, 58, '读多写少才配缓存；下面对比两种写路径，看谁会留脏数据', { anchor: 'middle', fs: 12, color: C.faint }),
      () => chip(48, 74, '方案一 · 先删缓存再更 DB', C.clay) +
        txt(280, 89, '并发交错 → 旧值回填驻留', { fs: 12, fw: 600, color: C.clay }) +
        box(48, 102, 190, 42, '① A：删掉缓存', { fs: 12 }) +
        box(254, 102, 262, 42, '② B 读 miss：从 DB 拿旧值回填', { fs: 11.5, stroke: C.clay, color: C.clay, dashed: true }) +
        box(532, 102, 180, 42, '③ A：才更新 DB', { fs: 11.5 }) +
        txt(380, 168, '结果：缓存里躺着旧值，一直住到过期——顺序反了，窗口必然出现', { anchor: 'middle', fs: 12, fw: 600, color: C.clay }),
      () => chip(48, 182, '方案二 · 先更 DB 再删缓存', C.moss) +
        txt(290, 197, 'Cache Aside 标准姿势', { fs: 12, fw: 600, color: C.moss }) +
        box(48, 210, 200, 42, '① 先更新数据库', { fs: 12, stroke: C.moss, color: C.moss }) +
        box(264, 210, 200, 42, '② 再删掉缓存', { fs: 12, stroke: C.moss, color: C.moss }) +
        box(480, 210, 232, 42, '③ 读：miss 才回填新值', { fs: 11.5 }) +
        txt(380, 276, '理论窗口：读方 miss 后、写方删缓存前回填——要求「读比写慢」，概率极小', { anchor: 'middle', fs: 12 }),
      () => txt(380, 298, '为什么是「删缓存」，不是「更新缓存」？', { anchor: 'middle', fs: 12.5, fw: 700 }) +
        box(56, 312, 310, 44, '并发写：到达顺序不受控，旧值可能覆盖新值', { fs: 11.5 }) +
        box(394, 312, 310, 44, '冷数据：更新了没人读，纯浪费', { fs: 12 }),
      () => txt(380, 380, '加强：延迟双删（更新完睡几百毫秒再删一次，清掉并发窗口的脏回填）', { anchor: 'middle', fs: 12.5, fw: 600, color: C.accent }) +
        box(48, 394, 220, 42, 'TTL 必设：超时自然收敛', { fs: 12, stroke: C.moss, color: C.moss }) +
        box(292, 394, 240, 42, 'canal 订阅 binlog 异步删', { fs: 11.5, stroke: C.blue, color: C.blue }) +
        box(556, 394, 156, 42, '删失败可重试', { fs: 11.5 }) +
        txt(380, 458, '口诀：先更新 DB，再删缓存——背下来就能用的标准答案', { anchor: 'middle', fs: 12.5, fw: 600 }),
    ];
    return {
      id: 'redis-consistency', cat: 'Redis', level: '进阶', hot: true,
      q: '缓存和数据库的双写一致性怎么保证？',
      answer: '先定调：缓存和 DB 是两个存储，追的是最终一致，强一致要上分布式事务、不值。标准姿势 Cache Aside：读 miss 才回填；写先更新 DB、再删缓存。先删后更会让并发的 B 把旧值回填；更新缓存又乱序覆盖、浪费。加强：延迟双删清脏回填，TTL 必设，讲究点用 canal 订阅 binlog 异步删。',
      steps: [
        { title: '先定调：最终一致', text: '缓存和 DB 是两个独立存储，不存在免费的强一致——除非上分布式事务，成本远超收益。工程上追的是最终一致：允许短暂不一致，但要想办法尽快收敛。开口先定这个调，答案的骨架就对了。' },
        { title: '反例：先删缓存再更 DB', text: '并发下交错：A 删完缓存、还没来得及更新 DB，B 的读请求 miss、从 DB 拿到旧值回填缓存，A 才把新值写进 DB——旧值在缓存里住到过期为止。顺序反了，这个窗口必然出现。' },
        { title: '标准：Cache Aside', text: '标准姿势 Cache Aside：读——miss 才查 DB 回填；写——先更新 DB，再删缓存。它也有理论窗口（读方 miss 后、写方删缓存前回填旧值），但那要求「读比写还慢」，实际概率极小，是可接受的最优解。' },
        { title: '为什么删而不是更', text: '更新缓存的两个坑：并发写时，两个更新到达缓存的顺序不受控，旧值可能后到覆盖新值；冷数据白白更新了却没人读。删除最简单：下次读时按需回填，懒加载、不浪费。' },
        { title: '加强：双删加 binlog', text: '延迟双删：更新完 DB 睡几百毫秒（覆盖一次读耗时）再删一次缓存，清掉并发窗口里的脏回填。TTL 必设，超时自然收敛；再讲究点用 canal（伪装成 MySQL 从库的组件）订阅 binlog，数据一变就异步删。' },
      ],
      figure: { vb: '0 0 760 478', draw: n => layers(n, L, '0 0 760 478') },
      followups: [
        ['延迟双删的延迟设多久？', '经验值几百毫秒：覆盖「读请求拿到旧值还没回填」的窗口，读慢的业务适当加大。'],
        ['为什么不用更新缓存？', '并发写到达顺序不受控会乱序覆盖，冷数据白更新；删缓存懒加载最省心。'],
        ['canal 是什么架构？', '伪装成 MySQL 从库拉 binlog，解析变更后异步删缓存——对业务零侵入，最终一致。'],
      ],
      points: '标准答案：先更新 DB，再删缓存（Cache Aside），TTL 兜底。\n进阶点：延迟双删、canal 订阅 binlog 异步删。\n开口先定调「最终一致」——基调稳，后面都对。',
    };
  }

  /* ============ 6. IOC 和 AOP 到底解决什么问题？ ============ */
  function qIocAop() {
    const L = [
      () => box(40, 26, 320, 46, '裸 new：用谁自己造，写死在代码里', { stroke: C.clay, color: C.clay, fs: 12 }) +
        box(400, 26, 320, 46, 'IOC：容器造好、按需注入', { stroke: C.moss, color: C.moss, fs: 12 }) +
        arrow(364, 49, 396, 49, { color: C.muted }) +
        txt(380, 96, '控制反转：创建与装配的权力反转给容器；DI（依赖注入）是它的实现手段', { anchor: 'middle', fs: 12.5, fw: 600 }),
      () => box(44, 110, 212, 42, '面向接口：不关心实现', { fs: 12 }) +
        box(274, 110, 212, 42, '换实现：不改业务代码', { fs: 12 }) +
        box(504, 110, 212, 42, '测试：随手塞 mock', { fs: 12 }) +
        txt(380, 176, 'DI：把依赖当参数从外面塞进来——依赖可换，测试可控', { anchor: 'middle', fs: 12, color: C.muted }),
      () => txt(380, 198, 'AOP：日志、事务、权限这类横切逻辑，从业务代码里抽出来', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(120, 212, 140, 40, '日志', { stroke: C.brass, color: C.brass, fs: 13 }) +
        box(310, 212, 140, 40, '事务', { stroke: C.blue, color: C.blue, fs: 13 }) +
        box(500, 212, 140, 40, '权限', { stroke: C.mauve, color: C.mauve, fs: 13 }) +
        txt(380, 276, '框架在方法前后统一织入——业务代码里只剩纯业务', { anchor: 'middle', fs: 12, color: C.muted }),
      () => box(250, 290, 260, 36, '① 前置：开事务 / 记日志', { stroke: C.accent, color: C.accent, fs: 12 }) +
        arrow(380, 328, 380, 346, { color: C.muted }) +
        box(250, 348, 260, 36, '② 目标方法：纯业务', { fs: 12 }) +
        arrow(380, 386, 380, 404, { color: C.muted }) +
        box(250, 406, 260, 36, '③ 后置：提交 / 回滚', { stroke: C.accent, color: C.accent, fs: 12 }) +
        txt(380, 470, '动态代理：有接口走 JDK（实现同一接口），没接口走 CGLIB（生成子类）——Boot 2.x 起默认 CGLIB', { anchor: 'middle', fs: 12, fw: 600 }),
      () => txt(380, 494, '名场面：同类 this.method() 自调用不走代理——@Transactional / @Async 直接失效', { anchor: 'middle', fs: 12.5, fw: 700, color: C.clay }) +
        box(96, 508, 280, 42, '解法：拆类 / 注入自身代理', { fs: 12, stroke: C.moss, color: C.moss }) +
        box(404, 508, 260, 42, 'AopContext.currentProxy() 也行', { mono: true, fs: 10.5, stroke: C.moss }),
    ];
    return {
      id: 'spring-ioc-aop', cat: '框架', level: '入门', hot: true,
      q: 'IOC 和 AOP 到底解决什么问题？',
      answer: 'IOC 把对象的创建和装配从「自己 new」反转给容器，DI（依赖注入）是实现手段：面向接口、换实现不改代码、测试塞 mock。AOP 把日志、事务、权限抽出来，用动态代理在方法前后织入：有接口走 JDK 代理，没接口走 CGLIB 子类，Boot 2.x 起默认 CGLIB。注意：this 自调用不走代理，注解全失效。',
      steps: [
        { title: 'IOC：权力反转', text: 'IOC（控制反转）把「什么时候创建对象、依赖塞给谁」从你的代码里反转给容器统一管理，DI（依赖注入，把依赖当参数塞进来）是它的实现手段。你只声明要什么，不关心它从哪来、怎么造。' },
        { title: '三个直接好处', text: '面向接口，调用方拿到接口不关心实现类；换实现只改装配配置，业务代码不动；单测时塞个 mock（替身对象）顶替真实依赖，不连数据库也能把逻辑测干净。' },
        { title: 'AOP：横切抽离', text: '日志、事务、权限这类逻辑每个方法都要来一遍，散落各处叫横切关注点。AOP（面向切面）把它们抽成切面，由框架在方法执行前后统一织入——业务代码里只剩纯业务。' },
        { title: '实现：动态代理', text: 'AOP 的身体是动态代理：目标有接口走 JDK 动态代理（代理实现同一接口），没接口走 CGLIB（运行时生成子类）。Spring Boot 2.x 起默认全用 CGLIB；final 方法不能被子类覆写，代理不了。' },
        { title: '名场面：自调用失效', text: '同一个类里 this.method() 是对象内部直调，走的是原始对象不是代理——代理的增强全不发生，@Transactional、@Async 直接失效。解法：拆类，或注入自身代理、用 AopContext.currentProxy()。' },
      ],
      figure: { vb: '0 0 760 570', draw: n => layers(n, L, '0 0 760 570') },
      followups: [
        ['IOC 和 DI 的区别？', 'IOC 是思想（控制权反转给容器），DI 是实现手段（依赖当参数注入）——思想与落地。'],
        ['JDK 代理和 CGLIB 区别？', 'JDK 要求目标实现接口、代理实现同一接口；CGLIB 生成子类，final 方法与 final 类没法代理。'],
        ['自调用失效怎么解？', '拆类最干净；或注入自身代理、AopContext.currentProxy()（要开 exposeProxy）。'],
        ['@Component 和 @Bean 区别？', '前者标在类上靠组件扫描，后者标在方法上手工造对象，适合装配第三方库的类。'],
      ],
      points: 'IOC 管对象的「生」（创建+装配），AOP 管行为的「绕」（织入横切）。\n代理是 AOP 的身体：JDK 走接口、CGLIB 走子类，Boot 2.x 默认 CGLIB。\n自调用不走代理 = 所有注解失效问题的总根源。',
    };
  }

  /* ============ 7. Bean 的生命周期？循环依赖怎么解决？ ============ */
  function qBean() {
    const st = ['实例化', '属性填充', 'Aware 回调', 'BPP 前置', '初始化', 'BPP 后置', '销毁回调'];
    const seg = (i, hot) => {
      const x = 22 + i * 103;
      return `<rect x="${x}" y="24" width="95" height="42" rx="8" fill="${hot ? C.surface2 : C.surface}" stroke="${hot ? C.accent : C.lineS}" stroke-width="${hot ? 1.8 : 1.4}"/>` +
        txt(x + 47.5, 49, st[i], { anchor: 'middle', fs: 11, fw: hot ? 700 : 600, color: hot ? C.accent : C.ink });
    };
    const L = [
      () => st.map((_, i) => seg(i, i === 5)).join('') +
        txt(380, 90, 'AOP 代理一般在「BPP 后置」生成；初始化里 @PostConstruct 先于 afterPropertiesSet', { anchor: 'middle', fs: 12, fw: 600, color: C.accent }),
      () => box(150, 104, 200, 42, 'A 创建中：缺 B', { stroke: C.accent, color: C.accent, fs: 12.5 }) +
        box(410, 104, 200, 42, 'B 创建中：缺 A', { stroke: C.blue, color: C.blue, fs: 12.5 }) +
        arrow(352, 116, 408, 116, { color: C.accent, label: '要 B' }) +
        arrow(408, 138, 352, 138, { color: C.blue, label: '也要 A' }) +
        txt(380, 170, '鸡生蛋：都卡在等对方先造好', { anchor: 'middle', fs: 12 }),
      () => box(36, 184, 224, 46, '一级缓存：成品 Bean', { stroke: C.moss, color: C.moss, fs: 12 }) +
        box(268, 184, 224, 46, '二级缓存：半成品引用', { stroke: C.blue, color: C.blue, fs: 12 }) +
        box(500, 184, 224, 46, '三级缓存：代理工厂', { stroke: C.brass, color: C.brass, fs: 12 }) +
        txt(380, 254, '二级放「刚实例化、属性没填」的半成品；三级放「必要时生成代理」的工厂', { anchor: 'middle', fs: 12 }),
      () => box(35, 268, 210, 44, 'A 实例化：工厂进三级缓存', { fs: 11 }) +
        arrow(247, 290, 273, 290, { color: C.muted }) +
        box(275, 268, 210, 44, 'A 填属性要 B → B 开始创建', { fs: 11 }) +
        arrow(487, 290, 513, 290, { color: C.muted }) +
        box(515, 268, 210, 44, 'B 要 A：从三级拿到早期引用', { fs: 11 }) +
        txt(380, 336, 'B 完工进一级缓存；A 拿回 B 的引用也完工——两个都成', { anchor: 'middle', fs: 12, fw: 600 }),
      () => box(36, 350, 224, 46, '构造器注入：无解，直接报错', { stroke: C.clay, color: C.clay, fs: 11.5 }) +
        box(268, 350, 224, 46, 'prototype：不处理', { fs: 11.5 }) +
        box(500, 350, 224, 46, 'Boot 2.6+：默认禁止', { stroke: C.accent, color: C.accent, fs: 11.5 }) +
        txt(380, 420, '提前暴露半成品是唯一解法——前提：单例 + setter / 字段注入', { anchor: 'middle', fs: 12.5, fw: 600, color: C.accent }),
    ];
    return {
      id: 'spring-bean', cat: '框架', level: '进阶', hot: true,
      q: 'Bean 的生命周期？循环依赖怎么解决？',
      answer: '生命周期：实例化 → 属性填充 → Aware → BeanPostProcessor 前置 → 初始化 → 后置（AOP 代理在这生成）→ 使用 → 销毁。循环依赖 A 要 B、B 要 A，靠三级缓存：成品池、半成品池（提前暴露）、工厂池（造代理）——B 从三级拿到 A 的早期引用。边界：构造器注入无解，Boot 2.6+ 默认禁止。',
      steps: [
        { title: '生命周期一条线', text: '实例化 → 属性填充（依赖注入）→ Aware 回调（容器递部件）→ BPP（BeanPostProcessor，后处理钩子）前置 → 初始化（@PostConstruct 先于 afterPropertiesSet）→ BPP 后置 → 使用 → 销毁回调。' },
        { title: '循环依赖：鸡生蛋', text: 'A 创建时发现依赖 B，B 创建时又依赖 A——都卡在等对方先造好，谁也完不成。只有单例 + 字段/setter 注入才有解，思路一句话：先把「刚出生的半成品」提前暴露出去。' },
        { title: '三级缓存：三个池子', text: '三个池子：一级缓存放成品 Bean；二级缓存放提前暴露的半成品（刚实例化、属性还没填）；三级缓存放工厂，需要代理时由工厂统一生成，保证注入出去的代理全局唯一。' },
        { title: '流程走一遍', text: 'A 实例化后把「造自己的工厂」放进三级缓存 → 填属性发现要 B → B 实例化后也要 A → 从 A 的三级缓存拿到早期引用 → B 完工进一级缓存 → A 拿到 B、继续完工。环就解开了。' },
        { title: '边界：哪些无解', text: '构造器注入的循环依赖无解——实例都没造出来，没有任何引用可暴露，Spring 直接报错；prototype（每次获取都新建的 Scope）不处理。Spring Boot 2.6 起默认禁止循环依赖，要显式开启——两个边界答出来很稳。' },
      ],
      figure: { vb: '0 0 760 440', draw: n => layers(n, L, '0 0 760 440') },
      followups: [
        ['为什么三级不是两级？', '三级放工厂：需要代理时统一生成并放二级，保证所有地方注入的都是同一个代理对象。'],
        ['@Lazy 怎么打断循环？', '先注入一个懒加载代理，真正用时才实例化目标——把创建时机推后，环就断了。'],
        ['构造器循环依赖为什么无解？', '实例还没 new 出来，没有任何引用可暴露——「提前暴露半成品」的前提是先有对象。'],
        ['@PostConstruct 和 afterPropertiesSet 顺序？', '@PostConstruct 先执行，然后 afterPropertiesSet，最后自定义 init-method。'],
      ],
      points: '生命周期一句话：实例化→填属性→Aware→BPP 前置→初始化→BPP 后置→销毁。\n循环依赖靠提前暴露半成品：三级缓存 = 成品池+半成品池+工厂池。\n两个边界：构造器注入无解；Boot 2.6+ 默认禁止。',
    };
  }

  /* ============ 8. Spring 事务在哪些情况下会失效？ ============ */
  function qTx() {
    const L = [
      () => box(56, 24, 180, 44, '调用方') +
        box(296, 24, 200, 44, '代理：事务入口', { stroke: C.accent, color: C.accent }) +
        box(556, 24, 148, 44, '目标方法') +
        arrow(238, 46, 294, 46, { color: C.muted }) +
        arrow(498, 46, 554, 46, { color: C.muted }) +
        txt(380, 92, '@Transactional 靠 AOP 代理：调用必须经过代理，事务才会开', { anchor: 'middle', fs: 12.5, fw: 600 }),
      () => box(40, 106, 330, 44, '外部调用 a.method()：先进代理 ✓', { stroke: C.moss, color: C.moss, fs: 12 }) +
        box(390, 106, 330, 44, '同类 this.method()：绕过代理 ✗', { stroke: C.clay, color: C.clay, dashed: true, fs: 12 }) +
        txt(380, 174, '失效一（最高频）：事务、@Async、@Cacheable 全跟着失效', { anchor: 'middle', fs: 12, fw: 600, color: C.clay }),
      () => box(56, 188, 310, 44, '失效二：方法不是 public', { stroke: C.clay, color: C.clay, fs: 12.5 }) +
        box(394, 188, 310, 44, '事务增强默认只作用在 public 上', { fs: 12 }) +
        txt(380, 256, 'protected / 包私有上写注解：静默失效，不报错也不生效', { anchor: 'middle', fs: 12 }),
      () => box(56, 270, 310, 44, '失效三：异常被 try-catch 吞掉', { stroke: C.clay, color: C.clay, fs: 12 }) +
        box(394, 270, 310, 44, '受检异常默认不回滚', { stroke: C.accent, color: C.accent, fs: 12.5 }) +
        txt(380, 338, '默认只回滚 RuntimeException / Error；要兜住就 rollbackFor = Exception.class', { anchor: 'middle', fs: 11.5 }),
      () => box(56, 352, 310, 44, '失效四：REQUIRES_NEW 挂起外层另开', { stroke: C.blue, color: C.blue, fs: 11.5 }) +
        box(394, 352, 310, 44, '失效五：子线程不共享事务', { stroke: C.clay, color: C.clay, fs: 12 }) +
        txt(380, 420, '事务连接绑在 ThreadLocal 上；子线程里的写不在同一个事务里', { anchor: 'middle', fs: 12 }),
      () => box(76, 434, 290, 44, '排查① 代理在场吗：$Proxy / CGLIB 子类', { mono: true, fs: 10.5, stroke: C.teal, color: C.teal }) +
        box(394, 434, 290, 44, '排查② 异常类型、传播配置对吗', { fs: 12, stroke: C.teal, color: C.teal }) +
        txt(380, 502, '口诀：自调用、非 public、异常吞、受检异常、线程穿越', { anchor: 'middle', fs: 12.5, fw: 700 }),
    ];
    return {
      id: 'spring-tx', cat: '框架', level: '进阶', hot: true,
      q: 'Spring 事务在哪些情况下会失效？',
      answer: '@Transactional 靠 AOP 代理：调用必须经过代理，事务才开。失效五连：同类自调用（最高频）；方法不是 public；异常被 try-catch 吞掉；抛受检异常——默认只回滚 RuntimeException/Error，配 rollbackFor 兜；传播行为配错、子线程不共享事务。排查先看代理在不在场，再看异常与传播。',
      steps: [
        { title: '前提：事务活在代理里', text: '@Transactional 本质是 AOP：代理对象在目标方法前开事务、方法返回后提交、抛异常时回滚。铁的前提是方法调用必须经过代理对象——任何让代理「不在场」的写法都是失效现场。' },
        { title: '失效一：同类自调用', text: '同类里 this.save() 是对象内部直调，走的是原始对象、不是代理，注解形同虚设——这是最高频的失效。@Async、@Cacheable、@Transactional 全是同一个病根。' },
        { title: '失效二：非 public', text: '事务增强默认只作用在 public 方法上：protected、包私有方法上写 @Transactional 会静默失效——不报错也不生效，最阴的一类，靠单测和集成测试兜住。' },
        { title: '失效三：异常没递对', text: '异常被 try-catch 吞掉，代理感知不到，事务照常提交；抛的是受检异常（如 IOException）也不回滚——默认只回滚 RuntimeException 和 Error，要兜住就标 rollbackFor = Exception.class。' },
        { title: '失效四：传播与线程', text: '传播行为配错：REQUIRES_NEW 把外层事务挂起、另开新事务，外层回滚它未必跟着回；NESTED 用保存点做部分回滚。多线程：事务连接绑在 ThreadLocal（线程私有的变量槽）上，子线程里的写不在同一个事务里。' },
        { title: '排查思路', text: '先确认代理在场：对象是不是 $Proxy 或被 CGLIB 增强，调用是不是从外面进来；再核对异常类型与 rollbackFor；最后查传播行为和多线程。口诀：自调用、非 public、异常吞、受检异常、线程穿越。' },
      ],
      figure: { vb: '0 0 760 522', draw: n => layers(n, L, '0 0 760 522') },
      followups: [
        ['自调用失效的解法？', '拆类最干净；或注入自身代理、AopContext.currentProxy()（要开 exposeProxy）。'],
        ['REQUIRED 和 REQUIRES_NEW 区别？', 'REQUIRED 加入当前事务，一起提交回滚；REQUIRES_NEW 挂起外层另开新事务，各自独立。'],
        ['注解加在类上和方法上的区别？', '类上对全部 public 方法生效，方法上只管自己；方法上的配置覆盖类上的默认。'],
        ['数据库层还有什么坑？', '表引擎得支持事务（MySQL 用 InnoDB，MyISAM 不支持），不然注解配对也白搭。'],
      ],
      points: '失效口诀：自调用、非 public、异常吞、受检异常、线程穿越。\n根因一句话：事务活在代理里，代理不在场就失效。\n排查顺序：代理在场吗 → 异常类型对吗 → 传播/多线程对吗。',
    };
  }

  /* 8 题；由门户或测试拼进完整题库（QA_PART_3） */
  w.QA_PART_3 = [qFast(), qPersistence(), qEviction(), qLock(), qConsistency(), qIocAop(), qBean(), qTx()];
})(typeof window !== 'undefined' ? window : globalThis);
