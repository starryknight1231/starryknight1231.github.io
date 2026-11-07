/* ============ QA Part 2 · 数据库七题 ============
   InnoDB vs MyISAM / B+ 树 / 聚簇索引与回表 / 索引失效与慢 SQL / ACID / 主从复制 / 分库分表。
   纯数据 + SVG 字符串，不碰 DOM；画图助手复用 qa-deck.js 暴露的 w.__qaHelpers。
   每题 figure.draw(n)：第 0..n 层显影（opacity 1），之后降 0.15；图层数与 steps 一一对应。 */
(function (w) {
  'use strict';
  const { C, SANS, MONO, box, txt, arrow, chip, layers } = w.__qaHelpers;

  /* ============ 1. InnoDB 和 MyISAM 有什么区别？ ============ */
  function qEngine() {
    const L = [
      () => txt(100, 52, '对比维度', { anchor: 'middle', fs: 12.5, fw: 700, color: C.muted }) +
        txt(320, 52, 'InnoDB', { anchor: 'middle', fs: 14, fw: 700, color: C.accent }) +
        txt(595, 52, 'MyISAM', { anchor: 'middle', fs: 14, fw: 700, color: C.muted }) +
        `<line x1="40" y1="64" x2="720" y2="64" stroke="${C.lineS}" stroke-width="1.6"/>` +
        box(40, 78, 130, 44, '事务', { fs: 12.5, fill: C.surface2 }) +
        box(180, 78, 280, 44, '支持，完整 ACID', { stroke: C.accent, color: C.accent, fs: 12.5 }) +
        box(470, 78, 250, 44, '不支持', { fs: 12.5 }) +
        txt(380, 148, '分水岭：业务要「要么全成要么全不成」，InnoDB 是唯一答案', { anchor: 'middle', fs: 11.5, color: C.faint }),
      () => box(40, 166, 130, 44, '锁粒度', { fs: 12.5, fill: C.surface2 }) +
        box(180, 166, 280, 44, '行级锁，并发写互不阻塞', { stroke: C.accent, color: C.accent, fs: 12.5 }) +
        box(470, 166, 250, 44, '只有表锁，写一把全锁', { fs: 12.5 }) +
        txt(380, 236, '行级锁加在索引记录上；MyISAM 一个写进来，全表读写都排队', { anchor: 'middle', fs: 11.5, color: C.faint }),
      () => box(40, 254, 130, 44, '崩溃恢复', { fs: 12.5, fill: C.surface2 }) +
        box(180, 254, 280, 44, 'redo log，崩溃安全', { stroke: C.accent, color: C.accent, fs: 12.5 }) +
        box(470, 254, 250, 44, '可能表损坏，要修复', { fs: 12.5 }) +
        txt(380, 324, '掉电后 InnoDB 重放日志恢复；MyISAM 索引和数据可能对不上', { anchor: 'middle', fs: 11.5, color: C.faint }),
      () => box(40, 342, 130, 44, '外键 / 索引', { fs: 12.5, fill: C.surface2 }) +
        box(180, 342, 280, 44, '支持外键 · 聚簇索引', { stroke: C.accent, color: C.accent, fs: 12.5 }) +
        box(470, 342, 250, 44, '不支持 · 非聚簇', { fs: 12.5 }) +
        txt(380, 412, 'InnoDB 表即主键 B+ 树（叶子存整行）；MyISAM 索引、数据分开存', { anchor: 'middle', fs: 11.5, color: C.faint }),
      () => box(40, 430, 130, 44, '默认引擎', { fs: 12.5, fill: C.surface2 }) +
        box(180, 430, 280, 44, 'MySQL 5.5 起默认', { stroke: C.accent, color: C.accent, fs: 12.5 }) +
        box(470, 430, 250, 44, '5.5 之前的默认', { fs: 12.5 }) +
        txt(380, 506, '新项目没有理由再选 MyISAM —— 它的价值就是当对比对象', { anchor: 'middle', fs: 12.5, fw: 700, color: C.accent }),
    ];
    return {
      id: 'mysql-engine', cat: '数据库', level: '入门', hot: false,
      q: 'InnoDB 和 MyISAM 有什么区别？',
      answer: '四条主差异：InnoDB 支持事务（MyISAM 不支持）、支持行级锁（MyISAM 只有表锁）、有 redo log 崩溃安全（MyISAM 崩溃后表可能损坏）、支持外键且表即聚簇索引（MyISAM 反之）。MySQL 5.5 起默认引擎就是 InnoDB，新项目没有理由选 MyISAM——它唯一的面试价值就是当对比对象。',
      steps: [
        { title: '事务：分水岭', text: 'InnoDB 支持事务（ACID：原子、一致、隔离、持久），MyISAM 完全不支持——这是两种引擎的分水岭。现在业务动不动就是「下单扣款要么全成要么全不成」，没有事务寸步难行，选型从这条就定了。' },
        { title: '锁：行级 vs 表锁', text: 'InnoDB 支持行级锁：锁加在索引记录上，只锁碰到的行，并发写互不阻塞；MyISAM 只有表锁，一个写进来，全表读写全部排队。高并发写入的场景下，这个差距是数量级的。' },
        { title: '崩溃恢复：日志兜底', text: 'InnoDB 有 redo log（重做日志）：崩溃后重放已提交的变更，数据不丢不乱；MyISAM 没有这套机制，掉电后表可能损坏、索引和数据对不上，只能靠修复或备份救。服务器崩过一次就懂它的分量。' },
        { title: '外键与索引结构', text: '外键只有 InnoDB 真生效（MyISAM 写了也被忽略）。索引结构也不同：InnoDB 是聚簇索引——表数据本身就按主键组织成 B+ 树，叶子存整行；MyISAM 索引和数据分开存，叶子存的是数据地址。' },
        { title: '默认引擎与答题姿势', text: 'MySQL 5.5 起默认引擎就是 InnoDB，新项目没有理由再选 MyISAM。但面试仍爱考：用对比表逐条答——事务、行锁、崩溃恢复、聚簇索引，最后补一句「MyISAM 唯一的价值就是当对比对象」，收得漂亮。' },
      ],
      figure: { vb: '0 0 760 526', draw: n => layers(n, L, '0 0 760 526') },
      followups: [
        ['什么场景还会用 MyISAM？', '基本只剩老系统和纯读的日志/报表表；只读场景 InnoDB 性能也不差——除非历史包袱，没有新选它的理由。'],
        ['count(*) 谁快？', 'MyISAM 存了总行数，不带 where 直接返回；InnoDB 要扫——MVCC（多版本）下每个事务看到的行数可能不同，没有唯一正确的总数可存。'],
        ['聚簇索引是谁特有的？', '是 InnoDB 的存储结构（表即主键 B+ 树）；MyISAM 索引与数据分离，叶子存数据地址——细节见「聚簇索引」那道题。'],
        ['MyISAM 还剩什么优势？', 'count(*) 无 where 直接读总数、表级锁开销极小、历史上独有全文索引（InnoDB 5.6 起也支持了）——优势基本被追平。'],
      ],
      points: '记四件事：事务、行锁、崩溃恢复、默认引擎（5.5 起 InnoDB）。\nMyISAM 只剩 count(*)（无 where）快；MVCC 下 InnoDB 连「总数」都没有唯一答案。\n聚簇索引是 InnoDB 特有；新项目没有理由选 MyISAM，它的价值就是当对比对象。',
    };
  }

  /* ============ 2. 为什么 MySQL 索引用 B+ 树？ ============ */
  function qBtree() {
    const L = [
      () => box(70, 24, 260, 44, '等值：where user_id = ?', { mono: true, fs: 12 }) +
        box(430, 24, 260, 44, '范围：between / order by', { mono: true, fs: 12 }) +
        txt(380, 96, '索引要同时干这两件事 —— 选型就看谁两头都兼顾', { anchor: 'middle', fs: 12.5, fw: 600 }),
      () => box(120, 122, 100, 38, 'key', { mono: true, fs: 12 }) +
        arrow(224, 141, 256, 141, { color: C.muted }) +
        box(260, 122, 120, 38, 'hash(key)', { mono: true, fs: 12 }) +
        arrow(384, 141, 416, 141, { color: C.muted }) +
        box(420, 122, 120, 38, '桶 → 值', { mono: true, fs: 12 }) +
        txt(380, 192, '等值 O(1) 极快；但范围只能全扫、排序也帮不上 —— 自适应哈希只是 InnoDB 的内部优化', { anchor: 'middle', fs: 11.5 }),
      () => `<circle cx="380" cy="236" r="15" fill="${C.surface}" stroke="${C.mauve}" stroke-width="1.5"/>` +
        `<circle cx="310" cy="280" r="15" fill="${C.surface}" stroke="${C.mauve}" stroke-width="1.5"/>` +
        `<circle cx="450" cy="280" r="15" fill="${C.surface}" stroke="${C.mauve}" stroke-width="1.5"/>` +
        `<line x1="380" y1="251" x2="316" y2="267" stroke="${C.lineS}" stroke-width="1.4"/>` +
        `<line x1="380" y1="251" x2="444" y2="267" stroke="${C.lineS}" stroke-width="1.4"/>` +
        txt(380, 240, '20', { anchor: 'middle', mono: true, fs: 11, color: C.mauve }) +
        txt(310, 284, '10', { anchor: 'middle', mono: true, fs: 11, color: C.mauve }) +
        txt(450, 284, '30', { anchor: 'middle', mono: true, fs: 11, color: C.mauve }) +
        txt(380, 322, '二叉/红黑树：一节点一键 = 一次磁盘 IO；千万行树高 20+，IO 次数爆炸', { anchor: 'middle', fs: 12, color: C.clay, fw: 600 }),
      () => box(210, 344, 340, 46, '| 12 | 45 | 78 | 96 |', { mono: true, fs: 12, stroke: C.brass, color: C.brass }) +
        txt(380, 418, 'B 树：一页装几百个键（多路），树高骤降；但数据在每个节点，范围查询中序来回跳', { anchor: 'middle', fs: 12 }),
      () => box(330, 436, 100, 34, '| 30 | 60 |', { mono: true, fs: 11, stroke: C.teal, color: C.teal }) +
        `<line x1="380" y1="470" x2="195" y2="502" stroke="${C.lineS}" stroke-width="1.4"/>` +
        `<line x1="380" y1="470" x2="565" y2="502" stroke="${C.lineS}" stroke-width="1.4"/>` +
        box(120, 502, 150, 38, '数据行', { stroke: C.moss, color: C.moss, fs: 11.5 }) +
        box(305, 502, 150, 38, '数据行', { stroke: C.moss, color: C.moss, fs: 11.5 }) +
        box(490, 502, 150, 38, '数据行', { stroke: C.moss, color: C.moss, fs: 11.5 }) +
        arrow(272, 521, 303, 521, { color: C.moss, sw: 1.6 }) +
        arrow(457, 521, 488, 521, { color: C.moss, sw: 1.6 }) +
        txt(380, 566, 'B+ 树：非叶只存键，数据全沉到叶子；叶子串成有序链表 —— 范围查询顺链扫', { anchor: 'middle', fs: 12, color: C.moss, fw: 600 }),
      () => box(50, 590, 210, 46, '内页：一页 ~1200 键', { fs: 12 }) +
        box(280, 590, 200, 46, '叶子：一页 15~20 行', { fs: 12 }) +
        box(500, 590, 210, 46, '3 层 ≈ 2000 万行', { stroke: C.accent, color: C.accent, fs: 12.5, fw: 700 }) +
        txt(380, 664, '推导：1200 × 1200 × 15 ≈ 2160 万 —— 量级估算；说出推导过程比背结论强', { anchor: 'middle', fs: 11.5, color: C.faint }),
    ];
    return {
      id: 'index-btree', cat: '数据库', level: '进阶', hot: true,
      q: '为什么 MySQL 索引用 B+ 树而不是哈希表、二叉树或 B 树？',
      answer: '索引要同时干两件事：等值查询和范围/排序。哈希表等值 O(1) 但范围只能全扫；二叉/红黑树一节点一键，千万行树高 20+，IO 爆炸；B 树多路降树高，但数据散在各层、范围要来回跳；B+ 树非叶只存键、数据全在叶子并串成有序链表，两头兼顾——按 16KB 页估算 3 层约 2000 万行（量级推导）。',
      steps: [
        { title: '索引要干两件事', text: '索引（帮数据库快速找数据的额外数据结构）面对的查询有两种：等值 where id = ?，和范围/排序 between、order by。选型第一问：哪种结构能把两件事都干好？后面四个候选逐一过堂。' },
        { title: '哈希表：等值极快', text: '哈希表把键算个哈希值直接定位桶，等值查询平均 O(1)。但范围查询只能全表扫，排序也帮不上。InnoDB 有自适应哈希（对热点索引页自动建的内存优化，不能手动声明），但主索引从来不用它。' },
        { title: '二叉树：输在 IO', text: '磁盘场景的成本单位是一次 IO。二叉/红黑树每个节点只存一个键，读一个节点 = 一次 IO；红黑树靠旋转保持平衡，改变不了「每层一个键」。千万行数据树高 20 多层，一次查询几十次 IO，直接爆炸。' },
        { title: 'B 树：多路立功', text: 'B 树让一个节点（一个 16KB 页）装几百个键，树高从 20 骤降到 3~4 层——多路的威力。但它把数据存在每个节点里，范围查询要走中序遍历，在上下层之间来回跳，顺序性打了折扣。' },
        { title: 'B+ 树：叶子链表', text: 'B+ 树再改一步：非叶子节点只存键（只做路由），数据全部下沉到叶子，叶子之间串成有序链表。等值查询照样沿树往下走；范围查询定位到起点后顺着链表扫就行——两大需求全部兼顾，这就是答案。' },
        { title: '3 层 ≈ 2000 万', text: '按 16KB 页量级估算：内页一个键加指针约十几字节，一页约装 1200 个键；叶子页约 15~20 行。三层 = 1200 × 1200 × 15 ≈ 2000 万行。注意这是量级推导不是精确值——面试把推导讲出来，比背结论值钱。' },
      ],
      figure: { vb: '0 0 760 684', draw: n => layers(n, L, '0 0 760 684') },
      followups: [
        ['一个 InnoDB 页多大？', '16KB（innodb_page_size 默认值），一次磁盘 IO 至少读一页——所有树高估算都从它出发。'],
        ['树高怎么估？', '内页键数 × 内页键数 × 叶子行数：1200 × 1200 × 15~20 ≈ 两千万——量级推导，别当精确值背。'],
        ['为什么不是跳表？', '跳表和二叉树一样每节点只存一个键，磁盘场景每跳一次就是一次 IO；多路的 B+ 树一层定几百键。内存场景（Redis zset）才用跳表。'],
        ['自适应哈希是什么？', 'InnoDB 观察到某索引页被等值查询高频命中，就在内存自动给它建哈希表加速——由参数 innodb_adaptive_hash_index 控制开关，用户不能按表声明。'],
      ],
      points: '答题主线：磁盘 IO 次数 = 树高 → 多路矮胖；范围查询 → 叶子有序链表。\n估算：16KB 页 × 内页 ~1200 键 × 叶子 15~20 行 → 3 层 ≈ 2000 万行（量级推导）。\n哈希输在范围、二叉输在树高、B 树输在来回跳——说出推导比背结论强。',
    };
  }

  /* ============ 3. 聚簇索引、回表、覆盖索引、最左前缀 ============ */
  function qCluster() {
    const L = [
      () => txt(185, 34, '聚簇索引（主键 B+ 树）', { anchor: 'middle', fs: 12.5, fw: 700, color: C.blue }) +
        box(130, 44, 110, 30, '| 10 | 40 |', { mono: true, fs: 10.5 }) +
        `<line x1="185" y1="74" x2="110" y2="104" stroke="${C.lineS}" stroke-width="1.4"/>` +
        `<line x1="185" y1="74" x2="260" y2="104" stroke="${C.lineS}" stroke-width="1.4"/>` +
        box(52, 104, 116, 38, 'id 10 · 整行', { fs: 11 }) +
        box(202, 104, 116, 38, 'id 40 · 整行', { fs: 11 }) +
        txt(380, 172, 'InnoDB 表本身就是按主键组织的 B+ 树，叶子存整行 —— 「索引即数据」', { anchor: 'middle', fs: 12, color: C.blue, fw: 600 }),
      () => txt(575, 34, '二级索引 idx_name', { anchor: 'middle', fs: 12.5, fw: 700, color: C.teal }) +
        box(520, 44, 110, 30, '| 李 | 王 |', { mono: true, fs: 10.5 }) +
        `<line x1="575" y1="74" x2="500" y2="104" stroke="${C.lineS}" stroke-width="1.4"/>` +
        `<line x1="575" y1="74" x2="650" y2="104" stroke="${C.lineS}" stroke-width="1.4"/>` +
        box(442, 104, 116, 38, '李 → id 10', { fs: 11 }) +
        box(592, 104, 116, 38, '王 → id 40', { fs: 11 }) +
        txt(380, 196, '二级索引（非主键索引）：叶子存「索引列值 + 主键」，不是整行', { anchor: 'middle', fs: 12 }),
      () => arrow(440, 123, 322, 123, { color: C.accent, label: '拿主键回表', sw: 2 }) +
        txt(380, 220, '回表：拿着二级索引查到的主键，再回聚簇索引把整行读一遍 —— 多一次树查找', { anchor: 'middle', fs: 12, color: C.accent, fw: 600 }),
      () => `<rect x="434" y="98" width="282" height="50" rx="10" fill="none" stroke="${C.moss}" stroke-width="2.2"/>` +
        txt(380, 248, '覆盖索引：查询要的列全在这个二级索引里，免回表 —— explain 的 Extra 显示 Using index', { anchor: 'middle', fs: 12, color: C.moss, fw: 600 }),
      () => box(90, 268, 130, 40, 'where a ✓', { mono: true, fs: 11.5, stroke: C.moss, color: C.moss }) +
        box(250, 268, 150, 40, 'a and b ✓', { mono: true, fs: 11.5, stroke: C.moss, color: C.moss }) +
        box(430, 268, 170, 40, 'a and b and c ✓', { mono: true, fs: 11.5, stroke: C.moss, color: C.moss }) +
        arrow(222, 288, 248, 288, { color: C.moss, sw: 1.6 }) +
        arrow(402, 288, 428, 288, { color: C.moss, sw: 1.6 }) +
        txt(380, 334, '联合索引 (a,b,c)：先按 a 排序，a 相同再按 b…… 查询必须从最左列开始连续命中', { anchor: 'middle', fs: 12 }) +
        txt(380, 356, 'where b=2 ✗ 完全不走；where a=1 and c=3 ✗ 只用到 a', { anchor: 'middle', fs: 11.5, color: C.clay }),
    ];
    return {
      id: 'index-cluster', cat: '数据库', level: '进阶', hot: true,
      q: '聚簇索引、回表、覆盖索引、最左前缀分别是什么？',
      answer: 'InnoDB 表本身就是按主键组织的 B+ 树，叶子存整行——这叫聚簇索引。二级索引（如 name 列）的叶子只存「索引列值 + 主键」，拿它查整行就要回表——再查一次聚簇索引。查询的列全在二级索引里就免回表，叫覆盖索引（Extra 显示 Using index）。联合索引 (a,b,c) 按 a→b→c 排序，查询必须从最左列连续命中，否则失效。',
      steps: [
        { title: '聚簇索引：索引即数据', text: 'InnoDB 的表本身就是一棵按主键组织的 B+ 树，叫聚簇索引（数据和索引长在一起），叶子节点存整行。「索引即数据」——主键查找快就因为少一层跳转，这也是后面一切话题的地基。' },
        { title: '二级索引：列值加主键', text: '给非主键列（如 name）建的索引叫二级索引，是另一棵 B+ 树：叶子存「索引列的值 + 对应主键」，不存整行。为什么？每份索引都存整行的话，一次更新要改所有树，空间和维护成本都受不了。' },
        { title: '回表：多一次树查找', text: '二级索引查到主键后，还要拿着主键回聚簇索引把整行读一遍——这就是回表。查一行多一次树查找，查一万行就回表一万次——很多慢 SQL 的根源，就是没意识到自己在大批量回表。' },
        { title: '覆盖索引：免回表', text: '要查的列恰好全在二级索引里（如 select id, name where name = ?），直接返回、不用回树——覆盖索引（索引覆盖了查询所需的所有列）。explain 的 Extra 显示 Using index，这是 SQL 优化的重要终点。' },
        { title: '最左前缀：从左连续', text: '联合索引 (a,b,c) 的排序规则：先按 a 排，a 相同再按 b，再按 c。所以查询必须从最左列开始连续命中：where b = 2 完全不走；where a = 1 and c = 3 只用到 a——a 后面断了，c 在索引里就是无序的。' },
      ],
      figure: { vb: '0 0 760 376', draw: n => layers(n, L, '0 0 760 376') },
      followups: [
        ['为什么二级索引存主键而不是行地址？', '页分裂时数据会挪位置，行地址会失效；主键不变——二级索引只存主键，分裂时自己一个都不用改。'],
        ['主键为什么建议自增？', '自增保证顺序插入总落在最右叶子，写满才开新页；随机主键到处插入会频繁页分裂，还留碎片。'],
        ['覆盖索引举个实战例子？', '高频查询「按 user_id 查状态」建 (user_id, status)：两列都在索引里免回表；避免 select *，它逼你回表。'],
        ['(a,c) 联合索引，where a=1 and c=3 用到 c 吗？', '用不到。a 确定后 c 在索引里是无序的，只能用到 a 过滤；需要 c 就建连续列的联合索引或单独建 c。'],
      ],
      points: '链条一句话：主键索引=数据本身 → 二级索引存主键 → 回表 → 覆盖索引是优化终点。\n最左前缀：从最左列连续命中；遇到范围查询，后面的列收不住扫描范围。\n看到 select * 先想回表；Extra 出现 Using index 才是真覆盖。',
    };
  }

  /* ============ 4. 索引失效与慢 SQL 排查 ============ */
  function qInvalid() {
    const L = [
      () => txt(24, 38, '失效场景清单', { fs: 12.5, fw: 700, color: C.clay }) +
        box(24, 48, 342, 36, '① 函数/运算：date(create_time)、a+1=1', { fs: 11 }) +
        box(24, 96, 342, 36, '② 隐式类型转换：字符串列 phone = 138…', { fs: 11 }) +
        box(400, 48, 344, 36, 'EXPLAIN：type · key · rows · Extra', { fs: 11.5, fw: 700, fill: C.surface2 }),
      () => box(24, 144, 342, 36, '③ 前导模糊：like \'%xx\' 查不到起点', { fs: 11 }) +
        box(24, 192, 342, 36, '④ 隐式字符集转换：join 两表 charset 不同', { fs: 11 }) +
        box(400, 96, 344, 36, 'ALL · NULL · 986310 · Using where', { mono: true, fs: 11, stroke: C.clay, color: C.clay }),
      () => box(24, 240, 342, 36, '⑤ 优化器视角：回表成本高于全扫时直接弃用', { fs: 11, stroke: C.brass, color: C.brass, dashed: true }) +
        box(400, 144, 344, 36, 'ref · idx_phone · 1 · Using index', { mono: true, fs: 11, stroke: C.moss, color: C.moss }) +
        txt(380, 310, '为什么失效：函数/转换让索引列失去有序性；优化器按成本决策，索引不是必走', { anchor: 'middle', fs: 12, fw: 600 }),
      () => `<rect x="394" y="90" width="356" height="48" rx="10" fill="none" stroke="${C.clay}" stroke-width="2" stroke-dasharray="5 4"/>` +
        `<rect x="394" y="138" width="356" height="48" rx="10" fill="none" stroke="${C.moss}" stroke-width="2"/>` +
        txt(380, 338, 'explain 四看：type（const > ref > range > index > ALL）· key · rows · Extra', { anchor: 'middle', fs: 12 }),
      () => txt(380, 366, '优化三连：函数挪到常量侧改写 SQL → 建覆盖索引 → 深分页改游标 where id > ? limit n', { anchor: 'middle', fs: 12, color: C.accent, fw: 600 }),
    ];
    return {
      id: 'index-invalid', cat: '数据库', level: '进阶', hot: true,
      q: '哪些写法会让索引失效？慢 SQL 怎么排查？',
      answer: '失效四大场景：对索引列做函数或运算、隐式类型转换（字符串列拿数字比）、前导模糊 like %xx、join 两表字符集不一致。本质都是让「有序结构」失去有序性。另外索引不是必走——优化器按成本可能主动弃用。排查用 explain：先看 type（出现 ALL 就是全表扫）和 rows，再看 key 与 Extra；优化：改写 SQL、建覆盖索引、深分页改游标。',
      steps: [
        { title: '失效场景先报菜名', text: '对索引列做函数或运算（date(create_time)、a+1=1）；隐式类型转换——phone 是字符串列却拿数字 138 去比；前导模糊 like \'%xx\'；join 两表字符集不一致引发隐式转换。线上事故九成是这几类。' },
        { title: '为什么失效：有序没了', text: 'B+ 树快，靠的是索引列在树里有序。对列做函数/运算，等于拿算完的结果去比，树里的顺序帮不上忙；字符串列和数字比较会触发隐式转换（MySQL 偷偷改类型），同样打乱有序性——逐行计算不如全表扫。' },
        { title: '优化器不是必走索引', text: '索引写了不代表就走：优化器（挑执行方案的组件）按统计信息算成本——回表次数太多、选择性太差（如性别列）、数据量太小，它判定全表扫描更快就直接弃用。这不是 bug，是成本决策。' },
        { title: 'explain 是体检单', text: '慢 SQL 第一步加 explain：type 看访问类型，从好到差 const > ref > range > index > ALL，ALL 就是全表扫；key 看实际用的索引；rows 看预估扫描行数；Extra 看 Using filesort、Using temporary、Using index。' },
        { title: '优化动作三连', text: '能改写就改写：把函数挪到常量一侧（create_time >= 今日零点）；建覆盖索引免回表；深分页改游标：where id > 上页最大 id limit n——offset 写 100 万，前 100 万行也要扫完再扔掉。' },
      ],
      figure: { vb: '0 0 760 386', draw: n => layers(n, L, '0 0 760 386') },
      followups: [
        ['like \'xx%\' 走索引吗？', '走。前缀固定后缀自由，依然能定位有序起点，是 range 访问；%xx 和 %xx% 才失效。'],
        ['not in、!= 一定失效吗？', '不一定。优化器按选择性和成本决定，!= 也可能走 range；背「必失效」不如答「看成本」。'],
        ['深分页为什么慢？', 'limit 1000000, 10 要把前 100 万行读出来再丢掉；游标 where id > ? 让起点直接定位，只扫 10 行。'],
        ['建索引的通用原则？', '区分度高、查询频繁、尽量覆盖常用列、控制数量（每个索引都拖慢写入）——别给性别列建单列索引。'],
      ],
      points: '失效口诀：函数运算、隐式转换、前导模糊、左列缺失（+ join 字符集不一致）。\nexplain 先看 type 和 rows：ALL 就是全表扫；Extra 认 filesort / temporary / index。\n索引是建议不是命令——优化器按成本拍板，先 explain 再动手改。',
    };
  }

  /* ============ 5. 事务的 ACID 分别靠什么保证？ ============ */
  function qAcid() {
    const cell = (x, y, color, dashed) => `<rect x="${x}" y="${y}" width="300" height="112" rx="9" fill="${C.surface}" stroke="${color}" stroke-width="1.5" ${dashed ? 'stroke-dasharray="6 4"' : ''}/>`;
    const L = [
      () => txt(380, 24, '每个字母问一句：靠什么保证？', { anchor: 'middle', fs: 12.5, fw: 600, color: C.muted }) +
        cell(50, 40, C.blue) +
        txt(200, 68, 'A · 原子性', { anchor: 'middle', fs: 14, fw: 700, color: C.blue }) +
        txt(200, 96, '机制：undo log（回滚日志）', { anchor: 'middle', fs: 12, color: C.ink }) +
        txt(200, 122, '先记旧值，失败逆序执行反向操作', { anchor: 'middle', fs: 11, color: C.muted }),
      () => cell(410, 40, C.accent, true) +
        txt(560, 68, 'C · 一致性', { anchor: 'middle', fs: 14, fw: 700, color: C.accent }) +
        txt(560, 94, '目的，而非一种独立机制', { anchor: 'middle', fs: 12, fw: 600, color: C.clay }) +
        txt(560, 118, '由 A/I/D + 约束与应用逻辑共同达成', { anchor: 'middle', fs: 11, color: C.muted }),
      () => cell(50, 184, C.teal) +
        txt(200, 212, 'I · 隔离性', { anchor: 'middle', fs: 14, fw: 700, color: C.teal }) +
        txt(200, 240, '机制：锁 + MVCC', { anchor: 'middle', fs: 12, color: C.ink }) +
        txt(200, 266, '多版本并发控制：读不堵写', { anchor: 'middle', fs: 11, color: C.muted }),
      () => cell(410, 184, C.moss) +
        txt(560, 212, 'D · 持久性', { anchor: 'middle', fs: 14, fw: 700, color: C.moss }) +
        txt(560, 240, '机制：redo log + WAL', { anchor: 'middle', fs: 12, color: C.ink }) +
        txt(560, 266, '先写日志再改数据页，崩溃重放', { anchor: 'middle', fs: 11, color: C.muted }),
      () => txt(380, 330, 'undo 保原子 · 锁 + MVCC 保隔离 · redo 保持久 —— 三者共同达成一致', { anchor: 'middle', fs: 13, fw: 700, color: C.accent }) +
        txt(380, 356, '面试钩子：C 不是独立机制而是目的 —— 这句一出口就高一个段位', { anchor: 'middle', fs: 11.5, color: C.faint }),
    ];
    return {
      id: 'acid', cat: '数据库', level: '入门', hot: true,
      q: '事务的 ACID 分别靠什么保证？',
      answer: 'A 原子性靠 undo log：记反向操作，失败逆序回滚。I 隔离性靠锁 + MVCC：写写排队，读写走多版本快照互不阻塞。D 持久性靠 redo log + WAL：先顺序写日志再改数据页，崩溃后重放恢复。C 一致性是目的不是机制——由 A、I、D 加数据库约束和应用逻辑共同达成，这句是满分钩子。',
      steps: [
        { title: 'A 原子性：undo log', text: '全成或全不成。靠 undo log（回滚日志）：改动前先把旧值记下来，事务失败或手动回滚时逆序执行反向操作，把数据退回原样。它同时是 MVCC 版本链的原料——一物两用，后面还会见到。' },
        { title: 'C 一致性：是目的', text: '一致性 = 事务前后数据都满足业务约束（转账总额不变、库存不为负）。它不靠某一个日志保证，而是 A、I、D 加上主键、外键等约束和应用逻辑共同达成的结果——把它说成独立机制是高频失分点。' },
        { title: 'I 隔离性：锁+MVCC', text: '并发事务互不干扰。写与写的冲突靠锁排队；读与写靠 MVCC（多版本并发控制：每行保留历史版本，事务按规则看自己的快照）做到读不堵写、写不堵读。两者配合撑起四个隔离级别。' },
        { title: 'D 持久性：redo+WAL', text: '一旦提交绝不丢。靠 redo log（重做日志）和 WAL（Write-Ahead Logging，先写日志再写数据页）：默认配置下提交时 redo 顺序落盘，数据页可以慢慢改；崩溃后重放 redo，已提交的变更全部补回。' },
        { title: '一句话串四个字母', text: 'undo 保原子、锁 + MVCC 保隔离、redo 保持久；一致性是前三者加上数据库约束、应用逻辑共同达成的目的。背的时候每个字母对应一个机制名，最后补上「C 是目的不是机制」——满分答案的钩子。' },
      ],
      figure: { vb: '0 0 760 376', draw: n => layers(n, L, '0 0 760 376') },
      followups: [
        ['undo 和 redo 的区别？', 'undo 是逻辑日志，记「怎么撤销」，管回滚和 MVCC 旧版本；redo 是物理日志，记页级改动，管崩溃恢复。'],
        ['redo 为什么能保持久？', 'WAL 先顺序写日志再随机写数据页：顺序写快得多；提交只需日志落盘，数据页异步慢慢刷。'],
        ['binlog 和 redo log 的区别？', 'binlog 在 Server 层，管归档和主从复制；redo 在 InnoDB 层，管崩溃恢复；两者靠两阶段提交保持一致。'],
      ],
      lab: { href: 'apps/mvcc-lab/', label: 'MVCC Lab · 亲眼看隔离性与异常判定' },
      points: '一个字母一个机制：A=undo、I=锁+MVCC、D=redo（WAL 先写日志）。\nC 是目的不是机制——由 A/I/D + 数据库约束 + 应用逻辑共同达成，这句是满分钩子。\nundo 逻辑反操作管回滚；redo 物理页级管恢复；binlog 在 Server 层管复制归档。',
    };
  }

  /* ============ 6. MySQL 主从复制的原理？ ============ */
  function qReplication() {
    const L = [
      () => box(90, 26, 220, 50, '主库（写入）', { stroke: C.accent, color: C.accent, fs: 13.5 }) +
        box(450, 26, 220, 50, '从库（重放）', { stroke: C.blue, color: C.blue, fs: 13.5 }) +
        arrow(314, 51, 446, 51, { color: C.muted, label: 'binlog 流向', dashed: true }) +
        txt(380, 104, 'binlog：记录变更的逻辑日志；复制 = 从库把主库的变更重放一遍', { anchor: 'middle', fs: 12 }),
      () => box(90, 126, 220, 46, '① log dump 线程（主库）', { fs: 12 }) +
        box(450, 126, 220, 46, '② IO 线程（从库）', { fs: 12 }) +
        arrow(314, 149, 446, 149, { color: C.blue, label: '发送 binlog' }) +
        txt(380, 200, 'dump 读主库 binlog 发送；IO 线程接收 —— 主从各管一段，互不阻塞', { anchor: 'middle', fs: 12 }),
      () => arrow(560, 176, 560, 218, { color: C.blue }) +
        box(450, 222, 220, 46, 'relay log（中继日志）', { fs: 12 }) +
        arrow(560, 272, 560, 290, { color: C.blue }) +
        box(450, 294, 220, 46, '③ SQL 线程（重放）', { fs: 12 }) +
        txt(380, 368, 'IO 收到的先落 relay log 暂存；SQL 线程逐条重放 —— 数据就此追上主库', { anchor: 'middle', fs: 12 }),
      () => box(50, 392, 210, 46, 'statement：记 SQL 语句', { fs: 11.5 }) +
        box(280, 392, 210, 46, 'row：记行变更 · 8.0 默认', { fs: 11.5, stroke: C.moss, color: C.moss }) +
        box(510, 392, 200, 46, 'mixed：自动切换', { fs: 11.5 }) +
        txt(380, 466, 'statement 小但 now()/uuid() 重放会变味；row 大而安全（默认）—— 量与安全的折中', { anchor: 'middle', fs: 11.5 }),
      () => box(50, 490, 210, 46, '异步（默认）：主不等从', { fs: 11.5 }) +
        box(280, 490, 210, 46, '半同步：≥1 从确认收到', { fs: 11.5 }) +
        box(510, 490, 200, 46, '并行复制：多线程重放', { fs: 11.5 }) +
        txt(380, 564, '三种复制模式：默认异步；半同步至少等一个从库确认收到；并行复制缓解延迟', { anchor: 'middle', fs: 11.5 }),
      () => txt(380, 592, '主从延迟：重放追不上写高峰；读写分离「写后立刻读」会读旧 —— 关键读走主库或等 GTID', { anchor: 'middle', fs: 12, color: C.clay, fw: 600 }),
    ];
    return {
      id: 'mysql-replication', cat: '数据库', level: '进阶', hot: false,
      q: 'MySQL 主从复制的原理？',
      answer: '主库把变更写进 binlog（逻辑日志），从库拉取重放，三线程一条线：主库 log dump 线程发送 binlog；从库 IO 线程接收、写 relay log（中继日志）；SQL 线程读 relay log 逐条重放。binlog 三格式默认 row；复制默认异步，半同步至少等一个从库确认收到，并行复制缓解延迟。读写分离最大的坑：写后立刻读可能读到旧数据。',
      steps: [
        { title: '角色：主写从追', text: '主库把所有变更记进 binlog（逻辑日志：记录「发生了什么变更」），从库拉过去重放一遍，两边就同步了。复制默认单向：只有主 → 从——这也是读写分离能成立的原因。' },
        { title: '线程一：dump→IO', text: '主库侧 log dump 线程：从库来连时，负责读 binlog 往外推。从库侧 IO 线程：专门接收，收到就写进本地 relay log（中继日志：暂存还没重放的 binlog）。主从各管一段，互不阻塞。' },
        { title: '线程二：SQL 重放', text: '从库 SQL 线程读 relay log 逐条重放，数据就这样追上主库。dump 和 IO 是网络搬运，SQL 重放才是真正执行——延迟多半卡在最后一段，这也给并行复制埋下伏笔。' },
        { title: 'binlog 三种格式', text: 'statement 记 SQL 语句：日志小，但 now()、uuid() 这类不确定函数重放会变味；row 记每行的实际变更：日志大但安全，MySQL 8.0 默认；mixed 在两者间自动切换。答出「默认 row」是基本分。' },
        { title: '三种复制模式', text: '异步（默认）：主库提交完不等从库，最快但主挂了可能丢；半同步：至少一个从库确认收到 binlog 才返回，性能与安全折中；并行复制：从库多线程重放，专治单线程追不上写高峰。' },
        { title: '延迟与读写分离', text: '读写分离的坑：写完立刻读，请求路由到从库，可能读到旧数据。缓解：关键读强制走主库、按 GTID（全局事务标识，能判断从库追到哪）等追平再读、并行复制缩小延迟窗口。坑和对策要一起说。' },
      ],
      figure: { vb: '0 0 760 616', draw: n => layers(n, L, '0 0 760 616') },
      followups: [
        ['主从延迟怎么缓解？', '从库并行复制、拆掉大事务（一个巨大的事务只能单线程重放）、升级硬件；要求更高就上半同步，用性能换一致。'],
        ['有了 redo log 为什么还要 binlog？', 'redo 是 InnoDB 物理日志只管崩溃恢复；binlog 在 Server 层、所有引擎通用，管复制和归档——职责不同，缺一不可。'],
        ['怎么判断延迟多少？', 'show slave status 看 Seconds_Behind_Master；更准的做法比对主从同一 GTID 的执行位置。'],
        ['从库为什么慢？', '重放默认单线程、大事务整段重放、从库还扛着读流量——先开并行复制，再拆大事务。'],
      ],
      points: '三线程一条线：dump 发送 → IO 接收写 relay log → SQL 重放。\nbinlog 三格式默认 row（statement 有不确定函数坑）；复制默认异步。\n读写分离必考落地题：写后立刻读可能读旧——关键读走主库，或等 GTID 追平。',
    };
  }

  /* ============ 7. 什么时候分库分表？怎么做？ ============ */
  function qSharding() {
    const L = [
      () => box(270, 26, 220, 48, '单库单表 · 快扛不住', { stroke: C.clay, color: C.clay, fs: 13 }) +
        txt(380, 102, '先穷尽单机手段：索引优化、读写分离、缓存、归档历史 —— 都不行再分', { anchor: 'middle', fs: 12 }),
      () => `<line x1="380" y1="122" x2="380" y2="300" stroke="${C.lineS}" stroke-width="1" stroke-dasharray="5 5"/>` +
        box(50, 130, 150, 40, '用户库', { stroke: C.moss, color: C.moss, fs: 12 }) +
        box(50, 182, 150, 40, '订单库', { stroke: C.moss, color: C.moss, fs: 12 }) +
        box(50, 234, 150, 40, '商品库', { stroke: C.moss, color: C.moss, fs: 12 }) +
        txt(220, 150, '垂直拆分：按业务拆库', { fs: 12, fw: 600, color: C.moss }) +
        txt(220, 174, '宽表再按列拆冷热', { fs: 11, color: C.faint }),
      () => box(430, 130, 130, 40, 'orders_0', { mono: true, fs: 11.5, stroke: C.blue, color: C.blue }) +
        box(575, 130, 130, 40, 'orders_1', { mono: true, fs: 11.5, stroke: C.blue, color: C.blue }) +
        box(430, 182, 130, 40, 'orders_2', { mono: true, fs: 11.5, stroke: C.blue, color: C.blue }) +
        box(575, 182, 130, 40, 'orders_3', { mono: true, fs: 11.5, stroke: C.blue, color: C.blue }) +
        txt(430, 250, '水平：同结构按 user_id % 4 拆 4 片', { fs: 12, fw: 600, color: C.blue }) +
        txt(430, 274, '真正的扩容量手段', { fs: 11, color: C.faint }),
      () => txt(380, 324, '分片键 = 最高频查询维度：订单按 user_id（查我的订单）或 order_id（查详情）', { anchor: 'middle', fs: 12, fw: 600 }) +
        txt(380, 348, '两难时：基因映射（把 user_id 编进订单号）或两个维度各存一份（冗余双写）', { anchor: 'middle', fs: 11.5, color: C.faint }),
      () => box(50, 376, 210, 44, '跨片查询：聚合/分页难', { stroke: C.clay, color: C.clay, fs: 11.5 }) +
        box(275, 376, 210, 44, '跨片事务：分布式事务', { stroke: C.clay, color: C.clay, fs: 11.5 }) +
        box(500, 376, 210, 44, '全局唯一 ID：雪花 ID', { stroke: C.clay, color: C.clay, fs: 11.5 }) +
        txt(380, 450, '扩容：成倍扩（2→4→8）迁移量最小，或一致性哈希思想 —— 分片解决容量，制造分布式问题', { anchor: 'middle', fs: 12, color: C.accent, fw: 600 }),
    ];
    return {
      id: 'sharding', cat: '数据库', level: '进阶', hot: false,
      q: '什么时候分库分表？怎么做？',
      answer: '顺序别乱：先穷尽单机手段（索引、SQL 优化、读写分离、缓存、归档），再分片——复杂度不可逆。垂直拆分按业务拆库、按列拆表，先做；水平拆分按分片键拆 N 张同构表，才是真扩容。分片键选最高频查询维度（订单常按 user_id）。分片解决容量，制造三件套：跨片查询、跨片事务、全局唯一 ID（雪花）。扩容优先成倍扩或一致性哈希。',
      steps: [
        { title: '先穷尽单机手段', text: '分片（把一份大表按规则拆到多个库/表）是不可逆的复杂度，动手前先把单机招数用尽：索引与慢 SQL 优化、读写分离、缓存扛读、归档历史数据瘦身。都试过还扛不住，才轮到分库分表。' },
        { title: '垂直先做水平后做', text: '垂直拆分：按业务边界拆库（用户、订单、商品各一个库），大宽表按列拆冷热——本质是业务梳理，难度低先做。水平拆分：同结构的表按分片键拆成 N 张，数据真正分散——这才是扩容量的手段。' },
        { title: '分片键=最高频查询', text: '分片键（决定一行落到哪个分片的字段）要选最高频的查询维度：订单按 user_id 查「我的订单」最常见，按 order_id 查详情也要快。两难时用基因映射（把 user_id 编进订单号）或冗余双写。' },
        { title: '拆完的三件套', text: '跨片查询：聚合、排序、分页要各片查完再归并；跨片事务：下单扣库存可能落在两个库，引出分布式事务；全局唯一 ID：各片自增会撞，引出雪花 ID（站内专题）。拆之前先想好这三个答案。' },
        { title: '扩容要留后路', text: '分片数尽量留成倍扩展的余地：2→4→8，旧分片各拆一半到新片，迁移量约一半、路由规则简单；或一开始就用一致性哈希思想，扩缩容只动相邻段。分片方案的价值，扩容那天才真正体现。' },
      ],
      figure: { vb: '0 0 760 470', draw: n => layers(n, L, '0 0 760 470') },
      followups: [
        ['单表多少行该分？', '经验值 500 万~2000 万，看行宽和写入压力，不是铁律——行太宽叶子页装得少，B+ 树层高涨得快。'],
        ['跨片分页怎么做？', '各片取前 N 条归并排序；更好是禁止深跳页，改游标（按分片键 + 时间排序的下一页）。'],
        ['不分片还能撑吗？', '先归档 + 压缩（历史表/冷备）、再加缓存和读写分离；很多「必须分」的库归档后只剩零头。'],
        ['分片键选错了怎么办？', '很难改：要全量迁移、双写切换；所以选型前先列 TOP 查询，按最高频维度定，两难就冗余双写。'],
      ],
      lab: { href: 'apps/system-lab/#/hash-ring', label: 'System Lab · 一致性哈希 vs 取模，扩容迁移率实测' },
      points: '顺序口诀：先单机优化，再垂直，后水平——分片是不可逆的复杂度。\n分片键 = 最高频查询路径；两难用基因映射或冗余双写。\n分片解决容量、制造分布式问题——三件套：跨片查询、跨片事务、分布式 ID。',
    };
  }

  /* 7 题；由门户或测试拼进完整题库（QA_PART_2） */
  w.QA_PART_2 = [qEngine(), qBtree(), qCluster(), qInvalid(), qAcid(), qReplication(), qSharding()];
})(typeof window !== 'undefined' ? window : globalThis);
