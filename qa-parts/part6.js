/* ============ QA Part 6 · Java 基础四题 + 操作系统四题 ============
   HashMap / JVM 内存区域 / 垃圾回收 / 类加载 / String 不可变 / 进程线程 / 虚拟内存 / IO 多路复用。
   纯数据 + SVG 字符串，不碰 DOM；画图助手复用 qa-deck.js 暴露的 w.__qaHelpers。
   每题 figure.draw(n)：第 0..n 层显影（opacity 1），之后降 0.15；图层数与 steps 一一对应。 */
(function (w) {
  'use strict';
  const { C, SANS, MONO, box, txt, arrow, chip, layers } = w.__qaHelpers;

  /* ============ 1. HashMap 的底层原理？put 一个值的流程？ ============ */
  function qHashmap() {
    const L = [
      () => txt(380, 24, 'JDK 1.8 结构：数组 + 链表 + 红黑树 —— 链长 ≥8 且数组 ≥64 才树化，退化阈值 6', { anchor: 'middle', fs: 12, fw: 600 }) +
        `<rect x="50" y="38" width="560" height="40" rx="8" fill="${C.surface}" stroke="${C.lineS}" stroke-width="1.4"/>` +
        [1, 2, 3, 4, 5, 6, 7].map(i => `<line x1="${50 + i * 70}" y1="38" x2="${50 + i * 70}" y2="78" stroke="${C.line}" stroke-width="1.2"/>`).join('') +
        `<line x1="225" y1="78" x2="225" y2="98" stroke="${C.lineS}" stroke-width="1.4"/>` +
        `<line x1="575" y1="78" x2="575" y2="86" stroke="${C.lineS}" stroke-width="1.4"/>` +
        box(185, 100, 80, 34, 'K-V', { mono: true, fs: 11 }) +
        box(285, 100, 80, 34, 'K-V', { mono: true, fs: 11 }) +
        box(385, 100, 80, 34, 'K-V', { mono: true, fs: 11 }) +
        arrow(267, 117, 283, 117, { sw: 1.5 }) +
        arrow(367, 117, 383, 117, { sw: 1.5 }) +
        box(537, 88, 76, 30, '树根', { mono: true, fs: 11, stroke: C.accent, color: C.accent }) +
        `<line x1="575" y1="118" x2="515" y2="130" stroke="${C.lineS}" stroke-width="1.4"/>` +
        `<line x1="575" y1="118" x2="635" y2="130" stroke="${C.lineS}" stroke-width="1.4"/>` +
        box(480, 130, 70, 26, '节点', { mono: true, fs: 10.5, stroke: C.accent }) +
        box(600, 130, 70, 26, '节点', { mono: true, fs: 10.5, stroke: C.accent }) +
        txt(305, 156, '同一桶串成链表（1.8 尾插）', { anchor: 'middle', fs: 11.5 }) +
        txt(575, 176, '红黑树：链太长时升级，查询 O(logn)', { anchor: 'middle', fs: 11.5, color: C.accent }),
      () => txt(380, 198, 'hash 计算：h ^ (h >>> 16) —— 高 16 位异或到低 16 位（扰动），让高位也参与定位', { anchor: 'middle', fs: 12, fw: 600 }) +
        box(150, 212, 130, 34, '高 16 位', { mono: true, fs: 11.5 }) +
        txt(306, 233, '⊕', { anchor: 'middle', fs: 15, fw: 700, color: C.accent }) +
        box(332, 212, 110, 34, '低 16 位', { mono: true, fs: 11.5 }) +
        arrow(446, 229, 486, 229, { color: C.moss }) +
        box(490, 212, 130, 34, 'hash', { mono: true, fs: 12, stroke: C.moss, color: C.moss }),
      () => txt(380, 274, 'put 流程：定位 → 放置 → 检查扩容', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(40, 288, 110, 40, '① 算 hash', { fs: 12 }) +
        arrow(154, 308, 172, 308, {}) +
        box(176, 288, 150, 40, '② (n-1)&hash 定位桶', { mono: true, fs: 11 }) +
        arrow(330, 308, 348, 308, {}) +
        box(352, 288, 160, 40, '③ 空桶直放 / 尾插 / 树插', { fs: 10.5 }) +
        arrow(516, 308, 534, 308, {}) +
        box(538, 288, 140, 40, '④ 超阈值扩容', { fs: 11.5 }) +
        txt(380, 348, '空桶直接放；撞桶挂到链表尾；已是红黑树就按树插入；key 相同则覆盖', { anchor: 'middle', fs: 11.5, color: C.faint }),
      () => txt(380, 374, '扩容：容量翻倍；JDK 1.8 不重算 hash —— 按一个 bit 拆成高低两条链', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(40, 402, 120, 44, '旧桶 j', { mono: true, fs: 12 }) +
        arrow(166, 414, 250, 408, { color: C.moss, label: 'bit=0' }) +
        box(254, 388, 180, 40, '新位置：原下标 j', { fs: 11.5, stroke: C.moss, color: C.moss }) +
        arrow(166, 436, 250, 442, { color: C.brass, label: 'bit=1' }) +
        box(254, 432, 200, 40, '新位置：原下标 + 旧容量', { fs: 11.5, stroke: C.brass, color: C.brass }) +
        txt(480, 404, '判断式：e.hash & oldCap', { mono: true, fs: 11 }) +
        txt(480, 428, '= 0 留原位；≠ 0 挪走', { fs: 11 }),
      () => txt(380, 500, 'JDK 1.7 头插法：并发扩容把链表接成环 → get 死循环 CPU 100%（1.8 改尾插已修复）', { anchor: 'middle', fs: 12, fw: 600, color: C.clay }) +
        box(130, 516, 100, 36, '节点 A', { mono: true, fs: 11.5 }) +
        arrow(234, 527, 296, 527, { sw: 1.6 }) +
        box(300, 516, 100, 36, '节点 B', { mono: true, fs: 11.5 }) +
        arrow(296, 543, 234, 543, { color: C.accent, sw: 1.6 }) +
        chip(430, 514, '成环 ✗', C.clay) +
        txt(430, 550, '两个线程同时扩容，头插让 next 指回前面的节点', { fs: 11.5 }),
      () => txt(380, 576, '为什么容量是 2 的幂：定位一次与运算搞定；扩容拆链只看一个 bit', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(150, 590, 160, 36, '(n-1) & hash', { mono: true, fs: 12, stroke: C.moss, color: C.moss }) +
        txt(330, 612, '等价于', { anchor: 'middle', fs: 11.5 }) +
        box(368, 590, 150, 36, 'hash % n', { mono: true, fs: 12, dashed: true }) +
        txt(534, 612, '位运算更快', { fs: 11.5 }),
    ];
    return {
      id: 'hashmap', cat: 'Java 基础', level: '进阶', hot: true,
      q: 'HashMap 的底层原理？put 一个值的流程？',
      answer: 'JDK 1.8 的 HashMap 是「数组 + 链表 + 红黑树」：hash 高低位异或扰动后，用 (n-1)&hash 定位桶——空桶直接放，撞桶就尾插链表，链长到 8 且数组到 64 就升级红黑树。put 完检查 size 超过「容量 × 0.75」就扩容翻倍：元素要么留在原下标、要么挪到原下标加旧容量，不用重算 hash。它线程不安全，并发场景换 ConcurrentHashMap。',
      steps: [
        { title: '结构：数组+链表+红黑树', text: 'JDK 1.8 起是「数组 + 链表 + 红黑树」：数组是主体，hash 相同的元素在同一个桶里串成链表。链表长度到 8 且数组长度到 64 才转红黑树（一种自平衡二叉树，查询从 O(n) 提到 O(logn)），链短回 6 退化回链表——数组太小就树化不划算，先扩容。' },
        { title: 'hash：高低位异或扰动', text: '拿到 key.hashCode() 后做一次扰动：高 16 位异或（⊕，不同得 1）低 16 位，作为最终 hash。因为定位只用低几位，不扰动的话高位形同虚设、更容易撞桶——一次异或，让高位也参与定位。' },
        { title: 'put：四步走', text: '① 算 hash；② 用 (n-1) & hash 定位桶下标——容量是 2 的幂，位运算等价取模且快；③ 桶空直接放；撞桶就沿链表找，key 相等就覆盖，否则尾插；已是树就按树插入；④ 最后看 size 是否超过阈值（容量 × 0.75），超了就扩容。' },
        { title: '扩容：拆高低两条链', text: '容量翻倍。JDK 1.8 的巧思：看 e.hash & 旧容量 那一位是 0 还是 1，把桶拆成两条链——0 的留在原下标，1 的挪到「原下标 + 旧容量」。不用重算 hash，一次遍历搬完。' },
        { title: '1.7 头插成环名场面', text: 'JDK 1.7 用头插法，并发扩容时两个线程互相接手链表，会把链接成环——之后 get 到这个桶就死循环，CPU 100%（经典名场面）。1.8 改尾插解决了成环，但 HashMap 依旧线程不安全，并发 put 仍会丢数据——并发场景直接换 ConcurrentHashMap。' },
        { title: '为什么容量是 2 的幂', text: '两个原因：定位快——(n-1) & hash 一次与运算等价于取模；扩容稳——容量翻倍只多一个高位 bit，元素去留看这一位就够，高低两条链一次拆完。加载因子 0.75 也是折中：太小浪费空间，太大碰撞多。' },
      ],
      figure: { vb: '0 0 760 646', draw: n => layers(n, L, '0 0 760 646') },
      followups: [
        ['为什么负载因子是 0.75？', '空间与碰撞的折中经验值：太小浪费内存，太大碰撞变多、链表变长；扩容阈值 = 容量 × 0.75。'],
        ['树化为什么还要求数组 ≥64？', '小数组本身冲突概率就高，扩容稀释一下往往就解决了——先扩容比先树化划算。'],
        ['重写 equals 为什么必须重写 hashCode？', '否则两个 equals 相等的对象 hash 不同、定位到不同桶——put 找不到旧的，get 也取不回。'],
      ],
      points: '结构：数组 + 链表 + 红黑树（8 树化、6 退化，数组 ≥64 才树化）。\n1.7 头插并发成环死循环，1.8 改尾插；HashMap 依旧线程不安全。\n并发直接换 ConcurrentHashMap；扩容不重算 hash，按一个 bit 拆两条链。',
    };
  }

  /* ============ 2. JVM 内存区域怎么划分？ ============ */
  function qJvmMemory() {
    const L = [
      () => txt(380, 28, '① 线程私有：每个线程一份', { anchor: 'middle', fs: 12.5, fw: 600, color: C.blue }) +
        box(50, 44, 200, 40, '程序计数器', { fs: 12.5 }) +
        box(280, 44, 200, 40, '虚拟机栈', { fs: 12.5 }) +
        box(510, 44, 200, 40, '本地方法栈', { fs: 12.5 }) +
        txt(150, 104, '当前字节码行号；唯一不会 OOM', { anchor: 'middle', fs: 11 }) +
        txt(380, 104, '栈帧：局部变量表 + 操作数栈', { anchor: 'middle', fs: 11 }) +
        txt(610, 104, '为 native 方法服务', { anchor: 'middle', fs: 11 }),
      () => txt(380, 134, '② 线程共享：堆 —— 对象老家、GC 主战场（Eden : S0 : S1 = 8 : 1 : 1）', { anchor: 'middle', fs: 12.5, fw: 600, color: C.moss }) +
        box(60, 148, 640, 98, '', { fill: C.surface2 }) +
        box(78, 162, 280, 38, 'Eden（新对象第一站）', { fs: 12 }) +
        box(368, 162, 156, 38, 'Survivor 0', { mono: true, fs: 11.5 }) +
        box(534, 162, 148, 38, 'Survivor 1', { mono: true, fs: 11.5 }) +
        box(78, 206, 604, 38, '老年代 Old：大对象直入 · 长寿对象住这里', { fs: 11.5 }),
      () => txt(380, 270, '③ 方法区：类信息 · 运行时常量池 · 静态变量', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(40, 286, 300, 44, 'JDK 8 前：永久代（挤在堆里，易 OOM）', { fs: 11, stroke: C.clay, color: C.clay }) +
        arrow(346, 308, 404, 308, { color: C.accent, label: 'JDK 8' }) +
        box(410, 286, 310, 44, 'JDK 8 起：元空间 Metaspace（用本地内存）', { fs: 11, stroke: C.accent, color: C.accent }) +
        txt(380, 348, '不再占堆的空间；动态生成类过多时照样会元空间 OOM', { anchor: 'middle', fs: 11.5, color: C.faint }),
      () => txt(380, 376, '④ 对象分配主线', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(40, 392, 150, 40, '新对象进 Eden', { fs: 11.5 }) +
        arrow(194, 412, 292, 412, { color: C.blue, label: 'Minor GC' }) +
        box(296, 392, 160, 40, 'Survivor：年龄 +1', { fs: 11.5 }) +
        arrow(460, 412, 558, 412, { color: C.brass, label: '到阈值' }) +
        box(562, 392, 168, 40, '晋升老年代（默认 15）', { fs: 11, stroke: C.brass }) +
        txt(380, 452, '大对象直接进老年代；动态年龄判定：同龄对象超 Survivor 一半就集体晋升', { anchor: 'middle', fs: 11.5, color: C.faint }),
      () => txt(380, 480, '⑤ OOM 对照：先分清是哪个区域报的错', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(40, 496, 220, 40, '堆：Java heap space 最常见', { fs: 11 }) +
        box(270, 496, 220, 40, '元空间：动态类生成过多', { fs: 11, stroke: C.brass }) +
        box(500, 496, 230, 40, '栈：StackOverflowError', { mono: true, fs: 11, stroke: C.clay }) +
        txt(380, 556, '复现：堆溢出就 new 大量对象不放手；栈溢出就写无限递归', { anchor: 'middle', fs: 11.5 }),
    ];
    return {
      id: 'jvm-memory', cat: 'Java 基础', level: '进阶', hot: true,
      q: 'JVM 内存区域怎么划分？',
      answer: '分线程私有和共享两半：私有的是程序计数器（当前字节码行号，唯一不 OOM）、虚拟机栈（方法栈帧，递归太深栈溢出）、本地方法栈；共享的是堆（对象老家、GC 主战场，分新生代和老年代）和方法区——JDK 8 起叫元空间、用本地内存。对象一般进 Eden，熬过几次 GC 就晋升老年代。',
      steps: [
        { title: '线程私有三兄弟', text: '程序计数器：记录当前执行到哪条字节码，是唯一不会 OOM 的区域。虚拟机栈：方法调用压入栈帧（局部变量表 + 操作数栈），递归太深抛 StackOverflowError。本地方法栈：为 native 方法（C 实现的本地代码）服务。' },
        { title: '堆：对象老家', text: '线程共享，几乎所有对象在这分配，GC 的主战场。内部再分新生代（Eden + 两块 Survivor，默认 8:1:1）和老年代：新生代对象死得快、回收频繁，老年代对象活得久、回收少。' },
        { title: '方法区：永久代→元空间', text: '存类信息、运行时常量池、静态变量。JDK 8 是分水岭：之前用永久代实现、挤在堆里容易 OOM；JDK 8 起改成元空间（Metaspace），用本地内存、不占堆——动态生成类过多时会报元空间 OOM。' },
        { title: '对象的分配路线', text: '新对象先在 Eden 分配；Eden 满触发 Minor GC，活下来的进 Survivor 且年龄 +1；年龄到阈值（默认 15，另有动态年龄判定）晋升老年代；特别大的对象（超长数组之类）直接进老年代，免得在 Survivor 间来回倒手。' },
        { title: '各区域 OOM 对照', text: '堆 OOM 最常见：对象堆积或内存泄漏，报 Java heap space。元空间 OOM：动态代理等大量生成类的场景。栈是另一种错：StackOverflowError。排查第一步：看清是哪个区域、哪种错，复现路径完全不同。' },
      ],
      figure: { vb: '0 0 760 564', draw: n => layers(n, L, '0 0 760 564') },
      followups: [
        ['Eden 和 Survivor 的默认比例？', '8:1:1（-XX:SurvivorRatio=8）：Eden 占新生代 8 份，两块 Survivor 各 1 份。'],
        ['为什么要有两块 Survivor？', '复制算法需要一块干净空间做中转：Eden 和一块 Survivor 的活对象，统一复制到另一块，来回倒手。'],
        ['栈溢出和堆溢出怎么区分？', 'StackOverflowError：递归太深、栈帧堆满；OutOfMemoryError: Java heap space：堆装不下——报错名一眼可辨。'],
      ],
      points: '三私三共：计数器 / 虚拟机栈 / 本地栈私有，堆 + 元空间共享。\nJDK 8 分水岭：永久代退场，元空间用本地内存上位。\n对象路线：Eden → Survivor 年龄 +1 → 老年代，大对象走绿色通道。',
    };
  }

  /* ============ 3. 垃圾回收是怎么工作的？ ============ */
  function qGc() {
    const cells = (x0, holes) => [0, 1, 2, 3, 4, 5].map(i => {
      const hole = holes.indexOf(i) >= 0;
      return `<rect x="${x0 + i * 30}" y="210" width="20" height="18" rx="3" fill="${hole ? C.surface : C.moss}" stroke="${hole ? C.clay : C.moss}" stroke-width="1.2" ${hole ? 'stroke-dasharray="3 2"' : ''}/>`;
    }).join('');
    const L = [
      () => txt(380, 28, '第一步判死：可达性分析 —— 从 GC Roots 出发，摸不到的就是垃圾', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(40, 46, 130, 40, 'GC Roots', { mono: true, fs: 12, stroke: C.blue, color: C.blue }) +
        arrow(174, 56, 340, 50, { color: C.moss, label: '摸得到 → 活' }) +
        box(344, 32, 120, 36, '存活对象', { stroke: C.moss, color: C.moss, fs: 11.5 }) +
        arrow(174, 78, 340, 98, { color: C.clay, dashed: true, label: '摸不到 → 回收' }) +
        box(344, 84, 120, 36, '垃圾（回收）', { stroke: C.clay, color: C.clay, dashed: true, fs: 11.5 }) +
        txt(40, 110, 'GC Roots = 栈内引用 · 静态变量 · 常量 · JNI 引用', { fs: 11, color: C.faint }) +
        txt(510, 54, '引用计数法防不住循环引用', { fs: 11, color: C.faint }),
      () => box(30, 166, 220, 34, '标记-清除', { fs: 12, stroke: C.blue, color: C.blue }) + cells(46, [1, 3]) +
        txt(140, 250, '直接删，留碎片', { anchor: 'middle', fs: 11 }) +
        box(270, 166, 220, 34, '标记-复制（新生代）', { fs: 12, stroke: C.teal, color: C.teal }) +
        `<rect x="286" y="210" width="80" height="18" rx="3" fill="${C.surface}" stroke="${C.teal}" stroke-width="1.2"/>` +
        `<rect x="292" y="214" width="16" height="10" fill="${C.moss}"/>` +
        `<rect x="314" y="214" width="16" height="10" fill="${C.moss}"/>` +
        arrow(370, 219, 398, 219, { color: C.teal, sw: 1.5 }) +
        `<rect x="402" y="210" width="80" height="18" rx="3" fill="${C.surface}" stroke="${C.teal}" stroke-width="1.2" stroke-dasharray="4 3"/>` +
        txt(380, 250, '存活少，整体复制走人', { anchor: 'middle', fs: 11 }) +
        box(510, 166, 220, 34, '标记-整理（老年代）', { fs: 12, stroke: C.brass, color: C.brass }) + cells(526, [1, 3]) +
        arrow(700, 236, 540, 236, { color: C.brass, sw: 1.5 }) +
        txt(620, 250, '往一头挪，无碎片', { anchor: 'middle', fs: 11 }),
      () => txt(380, 278, '分代假说：绝大多数对象朝生夕死 —— 按年龄分区，各用各的算法', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(70, 294, 270, 40, '新生代：标记-复制（存活少）', { fs: 11.5, stroke: C.teal, color: C.teal }) +
        box(420, 294, 270, 40, '老年代：标记-整理（存活多）', { fs: 11.5, stroke: C.brass, color: C.brass }),
      () => txt(380, 360, '收集器演进', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(60, 384, 160, 34, 'Parallel', { mono: true, fs: 12, stroke: C.blue }) +
        box(220, 384, 160, 34, 'CMS', { mono: true, fs: 12, stroke: C.mauve }) +
        box(380, 384, 160, 34, 'G1', { mono: true, fs: 12, stroke: C.accent, color: C.accent }) +
        box(540, 384, 160, 34, 'ZGC', { mono: true, fs: 12 }) +
        `<line x1="80" y1="430" x2="680" y2="430" stroke="${C.lineS}" stroke-width="2"/>` +
        [140, 300, 460, 620].map(x => `<circle cx="${x}" cy="430" r="5" fill="${C.accent}"/>`).join('') +
        txt(140, 456, '吞吐优先', { anchor: 'middle', fs: 11 }) +
        txt(300, 456, '低停顿 · JDK 14 移除', { anchor: 'middle', fs: 11 }) +
        txt(460, 456, 'JDK 9+ 默认 · Region', { anchor: 'middle', fs: 11 }) +
        txt(620, 456, '停顿亚毫秒级', { anchor: 'middle', fs: 11 }) +
        txt(380, 478, 'G1 把堆切成一个个 Region（分区）独立回收，还能设定停顿目标', { anchor: 'middle', fs: 11.5, color: C.faint }),
      () => txt(380, 506, '调优观：先定指标（吞吐还是停顿），再动手', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(40, 522, 210, 40, '调堆大小 / 换收集器', { fs: 12, stroke: C.moss }) +
        box(275, 522, 210, 40, 'GC 日志 · jstat 看现场', { mono: true, fs: 11.5 }) +
        box(510, 522, 210, 40, '别上来就背参数', { fs: 12, stroke: C.clay, color: C.clay }) +
        txt(380, 582, '吞吐 = 干活时间占比；停顿 = 用户卡的那一下 —— 先想清楚要哪个', { anchor: 'middle', fs: 11.5 }),
    ];
    return {
      id: 'gc', cat: 'Java 基础', level: '进阶', hot: true,
      q: '垃圾回收是怎么工作的？',
      answer: '先判死：JVM 用可达性分析——从 GC Roots（栈里的引用、静态变量、常量、JNI 引用）出发，摸不到的就是垃圾。回收按代选算法：新生代用标记-复制（对象死得快，复制活的就走），老年代用标记-整理（活得多，压实免碎片）。收集器记住现役：G1 是 JDK 9+ 默认，ZGC 停顿亚毫秒级。',
      steps: [
        { title: '判死：可达性分析', text: '从 GC Roots（垃圾回收的起点集合：栈里的引用、静态变量、常量、JNI 引用）出发顺着引用摸，摸得到的是活对象，摸不到的判死刑。引用计数法（被引用就 +1）防不住循环引用，主流 JVM 不用。' },
        { title: '三种清扫算法', text: '标记-清除：标出垃圾直接删，简单但留碎片。标记-复制：把活对象整体搬去一块干净空间，适合存活少的新生代。标记-整理：活对象往一头挪、压实，适合存活多的老年代，无碎片。' },
        { title: '分代假说', text: '经验规律：绝大多数对象朝生夕死。所以堆分两代：新生代存活少，复制算法最快；老年代对象顽强，整理算法免得反复搬家。于是 Minor GC（只收新生代）又快又频繁，整堆回收少而慢。' },
        { title: '收集器演进', text: 'Parallel：吞吐优先，停顿长。CMS：低停顿、并发清理，但有碎片，JDK 14 已移除。G1：把堆切成 Region 分区管理、可设停顿目标，JDK 9 起默认。ZGC：停顿亚毫秒级，大堆也不怕。' },
        { title: '调优观：指标先行', text: '先定指标：要吞吐还是要低停顿，二者不可兼得。常见动作是调堆大小、换对收集器，用 GC 日志和 jstat 看现场。别上来就背参数——先有数据再有动作，这是背书和实战的分水岭。' },
      ],
      figure: { vb: '0 0 760 602', draw: n => layers(n, L, '0 0 760 602') },
      followups: [
        ['对象怎么进老年代？', '三条路：年龄到阈值（默认 15）、动态年龄判定提前晋升、大对象直接分配。'],
        ['Minor GC 和 Full GC 的区别？', 'Minor GC 只收新生代，快而频繁；Full GC 整堆回收，停顿长——线上最怕频繁 Full GC。'],
        ['线上 GC 问题从哪查起？', '先开 GC 日志（JDK 8 用 -XX:+PrintGCDetails，JDK 9+ 用 -Xlog:gc*），再用 jstat -gcutil 看各代占用和回收频率。'],
      ],
      points: '判死靠可达性分析；算法对号：新生代复制、老年代整理。\n收集器一句话：G1 是 JDK 9+ 默认，ZGC 是停顿天花板，CMS 已成历史。\n调优先定指标再动手：吞吐和停顿不可兼得。',
    };
  }

  /* ============ 4. 类加载过程与双亲委派机制？ ============ */
  function qClassloader() {
    const L = [
      () => txt(380, 28, '.class 文件 → 可用的类：五步流程', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(40, 44, 120, 40, '加 载', { fs: 12.5 }) +
        box(180, 44, 120, 40, '验 证', { fs: 12.5 }) +
        box(320, 44, 120, 40, '准 备', { fs: 12.5, stroke: C.accent, color: C.accent }) +
        box(460, 44, 120, 40, '解 析', { fs: 12.5 }) +
        box(600, 44, 120, 40, '初始化', { fs: 12.5, stroke: C.accent, color: C.accent }) +
        arrow(163, 64, 177, 64, {}) + arrow(303, 64, 317, 64, {}) +
        arrow(443, 64, 457, 64, {}) + arrow(583, 64, 597, 64, {}) +
        txt(100, 106, '读字节码建 Class 对象', { anchor: 'middle', fs: 11 }) +
        txt(240, 106, '格式与语义检查', { anchor: 'middle', fs: 11 }) +
        txt(380, 106, '静态变量先赋零值', { anchor: 'middle', fs: 11, color: C.accent, fw: 600 }) +
        txt(520, 106, '符号引用 → 直接引用', { anchor: 'middle', fs: 11 }) +
        txt(660, 106, '执行 static（clinit）', { anchor: 'middle', fs: 11, color: C.accent, fw: 600 }),
      () => txt(380, 140, '三层类加载器（自下而上委托）', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(300, 156, 260, 42, 'Application：classpath 的类', { fs: 11.5, stroke: C.blue }) +
        box(300, 210, 260, 42, 'Platform / Extension：扩展', { fs: 11.5, stroke: C.teal }) +
        box(300, 264, 260, 42, 'Bootstrap：核心库（顶层）', { fs: 11.5, stroke: C.accent, color: C.accent }) +
        arrow(590, 270, 590, 162, { color: C.accent, label: '先问爹' }) +
        txt(60, 180, '你写的类在这层', { fs: 11 }) +
        txt(60, 234, 'JDK 8 叫 Extension，9 起叫 Platform', { fs: 11 }) +
        txt(60, 288, 'C++ 实现，Java 里拿不到', { fs: 11 }),
      () => txt(380, 326, '双亲委派的两个目的', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(100, 342, 260, 40, '① 防篡改：核心类冒充不了', { fs: 11.5, stroke: C.moss, color: C.moss }) +
        box(420, 342, 260, 40, '② 防重复：一个类只加载一次', { fs: 11.5, stroke: C.teal, color: C.teal }) +
        txt(380, 402, '自定义 java.lang.String？委派到顶层，加载的还是 JDK 自己那份', { anchor: 'middle', fs: 11.5, color: C.faint }),
      () => txt(380, 422, '打破场景：SPI / JDBC 的反向委托', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(40, 438, 220, 40, '核心库：Driver 接口（父）', { fs: 11.5, stroke: C.blue }) +
        arrow(266, 458, 420, 458, { color: C.accent, label: '线程上下文类加载器' }) +
        box(424, 438, 250, 40, 'classpath：驱动实现（子）', { fs: 11.5, stroke: C.moss }) +
        txt(380, 498, '父加载器够不着子加载器的类，只能托线程上下文类加载器「反向」去找', { anchor: 'middle', fs: 11.5, color: C.faint }),
      () => txt(380, 518, '打破双亲委派的三个典型场景', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(50, 534, 200, 40, 'SPI / JDBC', { mono: true, fs: 12, stroke: C.accent }) +
        box(280, 534, 200, 40, '热部署：改完类重新加载', { fs: 11.5 }) +
        box(510, 534, 210, 40, 'Tomcat：应用间隔离', { fs: 11.5 }) +
        txt(380, 594, 'Tomcat 每个应用一个加载器：同名类可共存，公共库还能共享', { anchor: 'middle', fs: 11.5, color: C.faint }),
    ];
    return {
      id: 'classloader', cat: 'Java 基础', level: '进阶', hot: false,
      q: '类加载过程与双亲委派机制？',
      answer: '类从 .class 到能用走五步：加载（读字节码生成 Class 对象）→ 验证 → 准备（静态变量分配内存、赋零值）→ 解析 → 初始化（执行 static 块）。加载器分三层：Bootstrap、Platform/Extension、Application，收到请求先委托父加载器——为了防核心类被篡改、防重复加载。SPI、热部署、Tomcat 是打破它的典型场景。',
      steps: [
        { title: '五步：字节码到可用', text: '加载：读 .class 生成 Class 对象。验证：查格式与语义，防恶意字节码。准备：给静态变量分配内存并赋「零值」——此刻 int 是 0 不是你写的值。解析：符号引用转直接引用。初始化：执行 static 块与静态赋值（clinit 方法），真值这时才生效。' },
        { title: '三层类加载器', text: 'Bootstrap（顶层，加载核心库，C++ 实现）；Platform / Extension（JDK 9 叫平台加载器，JDK 8 叫扩展加载器）；Application（加载 classpath 上你写的类）。层级分明，各管一段。' },
        { title: '双亲委派：先问爹', text: '收到加载请求不自己动手，先一层层委托父加载器；父加载器找不到（搞不定）才轮到自己。于是核心类永远归 Bootstrap 加载，你的类归 Application——秩序就是这么来的。' },
        { title: '为什么这么设计', text: '① 安全：你写个同名 java.lang.String 也没用，请求会委派到顶层，加载的是 JDK 自己那份，核心类冒充不了；② 唯一：同一个类只加载一次，不会出现多个「同名不同源」的类互不相认。' },
        { title: '打破双亲委派', text: 'SPI（如 JDBC）：接口在核心库、实现在 classpath，父加载器只能靠线程上下文类加载器「反向委托」去找实现。热部署：改过的类要重新加载。Tomcat：每个应用独立加载器，隔离且共享公共库。' },
      ],
      figure: { vb: '0 0 760 614', draw: n => layers(n, L, '0 0 760 614') },
      followups: [
        ['准备和初始化的区别？', '准备赋零值，初始化才执行 static 赋值和静态块；例外：static final 编译期常量在准备期就直接赋真值。'],
        ['怎么自定义类加载器？', '继承 ClassLoader 重写 findClass（别动 loadClass，保住双亲委派），字节码读进来交给 defineClass。'],
        ['Tomcat 为什么要打破？', '应用间隔离：同名类不同版本能共存；公共库共享：共用加载器只加载一份——默认委派做不到。'],
      ],
      points: '五阶段最常挖：准备 = 零值、初始化 = clinit。\n双亲委派两目的：防篡改、防重复。\n打破三场景：SPI 反向委托、热部署、容器隔离。',
    };
  }

  /* ============ 5. String 为什么设计成不可变？ ============ */
  function qString() {
    const L = [
      () => txt(380, 28, 'String 不可变：final 类 + 内部数组不外露 + 没有修改方法', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(40, 44, 210, 40, 'final：不能被继承', { fs: 11.5 }) +
        box(275, 44, 210, 40, 'char[]（8）→ byte[]（9 起）', { mono: true, fs: 10.5 }) +
        box(510, 44, 210, 40, 'replace / concat 返回新对象', { fs: 11 }) +
        txt(380, 104, '所谓「改」字符串，都是造一个新的，旧的永远不变', { anchor: 'middle', fs: 11.5, color: C.faint }),
      () => txt(380, 132, '好处一 常量池复用：字面量全局一份', { anchor: 'middle', fs: 12.5, fw: 600, color: C.moss }) +
        box(50, 148, 110, 36, 's1 = "abc"', { mono: true, fs: 11 }) +
        box(50, 196, 110, 36, 's2 = "abc"', { mono: true, fs: 11 }) +
        arrow(164, 166, 226, 180, { color: C.moss }) +
        arrow(164, 214, 226, 196, { color: C.moss }) +
        box(230, 168, 180, 40, '常量池：一份 "abc"', { fs: 11.5, stroke: C.moss, color: C.moss, fill: C.surface2 }) +
        txt(440, 180, '字符串遍地都是', { fs: 11.5 }) +
        txt(440, 204, '共享一份省内存', { fs: 11.5, color: C.moss }),
      () => txt(380, 260, '好处二 hashCode 缓存：算一次，反复用', { anchor: 'middle', fs: 12.5, fw: 600, color: C.blue }) +
        box(80, 276, 230, 40, 'String 内部缓存 hash 字段', { fs: 11.5, stroke: C.blue }) +
        arrow(316, 296, 380, 296, { color: C.blue, label: '做 key' }) +
        box(384, 276, 200, 40, 'HashMap.get 免重算', { mono: true, fs: 11.5, stroke: C.accent }) +
        txt(600, 300, '又快又稳', { fs: 11.5, color: C.faint }),
      () => txt(380, 332, '好处三：安全 + 线程安全', { anchor: 'middle', fs: 12.5, fw: 600, color: C.teal }) +
        box(60, 348, 290, 40, '安全：URL / 路径校验后改不了', { fs: 11.5, stroke: C.teal, color: C.teal }) +
        box(410, 348, 290, 40, '线程安全：随便共享不用锁', { fs: 11.5, stroke: C.teal, color: C.teal }) +
        txt(380, 406, '可变的话：校验时是好的，用的时候已经被换掉了', { anchor: 'middle', fs: 11.5, color: C.faint }),
      () => txt(380, 424, '代价：拼接产生大量中间对象 —— 循环拼接用 StringBuilder', { anchor: 'middle', fs: 12.5, fw: 600, color: C.clay }) +
        box(50, 440, 180, 40, '循环 s += x ✗', { mono: true, fs: 11.5, stroke: C.clay, color: C.clay }) +
        arrow(236, 460, 296, 460, { color: C.clay }) +
        box(300, 440, 190, 40, '每次都 new 新串', { fs: 11.5 }) +
        box(520, 440, 200, 40, 'StringBuilder ✓', { mono: true, fs: 12, stroke: C.moss, color: C.moss }) +
        txt(380, 500, '编译期能确定的常量拼接（"a"+"b"）会被编译器直接合并成 "ab"', { anchor: 'middle', fs: 11.5, color: C.faint }),
    ];
    return {
      id: 'string-immutable', cat: 'Java 基础', level: '入门', hot: true,
      q: 'String 为什么设计成不可变？',
      answer: '三个核心好处：① 常量池复用——字面量全局唯一，字符串遍地都是，共享省内存；② hashCode 算一次缓存起来，做 HashMap 的 key 时不用反复计算；③ 安全——校验过的路径、URL 不会被偷偷改掉，而且天然线程安全可随便共享。代价是拼接产生大量中间对象，循环里拼接要用 StringBuilder。',
      steps: [
        { title: '不可变长什么样', text: 'String 被 final 修饰、不能继承；内部数组（JDK 8 是 char[]，JDK 9 起改 byte[]，纯英文更省内存）不外露；没有任何方法能改它的内容——replace、concat 都返回新对象，原来的纹丝不动。' },
        { title: '好处一：常量池复用', text: '字面量 "abc" 在字符串常量池里全局只有一份，谁用谁引用。字符串是程序里出现最多的数据，共享一份省大量内存——这也是为什么两个字面量比较 s1 == s2 常常是 true。' },
        { title: '好处二：hashCode 缓存', text: '内容不变，hash 就永远不变，所以 String 算一次就把它缓存在对象里（内部有个 hash 字段）。HashMap 里大量 key 是字符串：每次 get 免重算哈希，桶位置也稳定。' },
        { title: '好处三：安全 + 线程安全', text: '若 String 可变：文件路径、URL 校验时是好的，真正使用时可能已被改成恶意值——不可变封死这个口子。状态永不改变，多线程随便共享，不需要任何同步措施。' },
        { title: '代价与正确姿势', text: '拼接每次都造新对象，循环里 s += x 会产生一堆中间垃圾。正确姿势：循环拼接用 StringBuilder（内部可变缓冲区）；编译期能确定的常量拼接（"a"+"b"）会被编译器直接合并。' },
      ],
      figure: { vb: '0 0 760 520', draw: n => layers(n, L, '0 0 760 520') },
      followups: [
        ['String / StringBuilder / StringBuffer 区别？', 'String 不可变；StringBuilder 可变、非线程安全、单线程首选；StringBuffer 方法加了 synchronized，线程安全但慢。'],
        ['new String("abc") 创建几个对象？', '最多两个：常量池一份 + 堆上一份；池里已有 "abc" 就只 new 堆上那个——经典陷阱题。'],
        ['intern() 是干嘛的？', '把字符串入池并返回池内引用；JDK 7 起常量池从永久代挪到堆，intern 的行为细节也随之变化。'],
      ],
      points: '不可变三收益：常量池复用、hash 缓存、安全 + 线程安全。\n循环拼接必须 StringBuilder；常量拼接编译期自动合并。\nnew String("abc") 的对象数是经典陷阱——最多两个，看池里有没有。',
    };
  }

  /* ============ 6. 进程和线程的区别？ ============ */
  function qProcThread() {
    const L = [
      () => txt(380, 28, '一句话：进程 = 资源分配的最小单位，线程 = CPU 调度的最小单位', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(100, 44, 260, 40, '进程：管资源、管隔离', { fs: 12, stroke: C.blue, color: C.blue }) +
        box(400, 44, 260, 40, '线程：管执行、管效率', { fs: 12, stroke: C.moss, color: C.moss }) +
        txt(380, 106, '打个比方：进程是独立的工厂，线程是厂里的工人', { anchor: 'middle', fs: 11.5, color: C.faint }),
      () => txt(380, 136, '内存：进程互相隔离，线程共享堆', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(50, 152, 180, 40, '进程 A（独立地址空间）', { fs: 11.5, stroke: C.blue, color: C.blue }) +
        box(50, 204, 180, 40, '进程 B（独立地址空间）', { fs: 11.5, stroke: C.mauve, color: C.mauve }) +
        `<line x1="42" y1="198" x2="238" y2="198" stroke="${C.clay}" stroke-width="1.6" stroke-dasharray="6 4"/>` +
        box(320, 152, 400, 92, '', { fill: C.surface2 }) +
        box(332, 162, 120, 34, '线程 1（栈）', { fs: 11 }) +
        box(460, 162, 120, 34, '线程 2（栈）', { fs: 11 }) +
        box(588, 162, 120, 34, '线程 3（栈）', { fs: 11 }) +
        box(332, 202, 376, 34, '共享：堆 / 全局区 / 打开的文件', { fs: 11.5, stroke: C.moss, color: C.moss }) +
        txt(140, 264, '进程之间：一堵墙', { anchor: 'middle', fs: 11.5, color: C.clay }) +
        txt(520, 264, '线程之间：一个屋檐（但要防互踩）', { anchor: 'middle', fs: 11.5, color: C.moss }),
      () => txt(380, 292, '切换开销：一个连锅端，一个只换随身物品', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(50, 304, 290, 40, '进程切换：换页表 + 刷 TLB（贵）', { fs: 11.5, stroke: C.clay, color: C.clay }) +
        box(420, 304, 290, 40, '线程切换：只换栈和寄存器（轻）', { fs: 11.5, stroke: C.moss, color: C.moss }) +
        txt(380, 362, 'TLB = 地址翻译缓存，进程一换就作废、缓存全冷——贵的根源在这', { anchor: 'middle', fs: 11.5, color: C.faint }),
      () => txt(380, 386, '通信：进程靠 IPC，线程共享内存', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(30, 402, 120, 36, '管道', { fs: 12 }) +
        box(170, 402, 120, 36, '消息队列', { fs: 12 }) +
        box(310, 402, 120, 36, '共享内存', { fs: 12, stroke: C.moss, color: C.moss }) +
        box(450, 402, 120, 36, '信号', { fs: 12 }) +
        box(590, 402, 120, 36, '套接字', { fs: 12 }) +
        txt(380, 458, 'IPC（进程间通信）五件套：共享内存最快——免拷贝；线程天然共享，靠锁保平安', { anchor: 'middle', fs: 11.5, color: C.faint }),
      () => txt(380, 480, '崩溃隔离', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(60, 496, 280, 40, '进程崩：不连累别人（浏览器多进程）', { fs: 11.5, stroke: C.moss, color: C.moss }) +
        box(420, 496, 280, 40, '线程崩：整个进程陪葬', { fs: 11.5, stroke: C.clay, color: C.clay }) +
        txt(380, 556, 'Chrome 一个标签页崩了，其他标签页照常活——多进程隔离的经典应用', { anchor: 'middle', fs: 11.5, color: C.faint }),
    ];
    return {
      id: 'process-thread', cat: '操作系统', level: '入门', hot: true,
      q: '进程和线程的区别？',
      answer: '一句话：进程是资源分配的最小单位，线程是 CPU 调度的最小单位。进程之间地址空间相互隔离，一个崩了不连累别人；同一进程的线程共享堆和全局区、各有自己的栈，通信容易但要靠锁。切换开销进程大（要换页表刷 TLB）、线程小；通信进程靠 IPC，线程直接共享内存。',
      steps: [
        { title: '定义：两句话记牢', text: '进程是资源分配的最小单位——操作系统给它独立的内存、文件句柄；线程是 CPU 调度的最小单位——真正被调度上 CPU 的是线程。一个进程可以开多个线程，共享进程的家当。' },
        { title: '内存：隔离 vs 共享', text: '进程各有一套地址空间，互相看不见；同一进程的线程共享堆、全局区、打开的文件，但各有自己的栈和寄存器。「共享堆、私有栈」正是并发 bug 的根源：多个线程改同一块内存。' },
        { title: '切换：贵 vs 便宜', text: '进程切换要换整套页表（虚拟地址到物理地址的映射表）、刷掉 TLB（翻译结果的小缓存）——缓存全冷，代价大。线程共享地址空间，切换只换栈和寄存器，轻量得多。' },
        { title: '通信：IPC vs 共享内存', text: '进程间通信（IPC）五件套：管道、消息队列、共享内存、信号、套接字——共享内存最快，数据不用拷贝。线程天生共享内存，传个变量就行，但要用锁防止互相踩踏。' },
        { title: '崩溃：影响半径', text: '进程崩了只死自己：Chrome 一个标签页崩掉、其他照常活，就是多进程隔离。线程没有这层保护——进程一旦崩溃（段错误、被 OOM 杀掉），所有线程陪葬，一损俱损。' },
      ],
      figure: { vb: '0 0 760 576', draw: n => layers(n, L, '0 0 760 576') },
      followups: [
        ['协程是什么？', '用户态调度的轻量「线程」：切换不进内核、开销极小，一个线程能挂成千上万个协程；Go、Kotlin 都有。'],
        ['上下文切换具体切什么？', '寄存器、程序计数器、栈指针；跨进程还要换页表、刷 TLB——所以进程切换更贵。'],
        ['为什么浏览器用多进程？', '崩溃隔离：一个页面崩不连累其他页；再加安全沙箱，站点之间互相隔离、权限受限。'],
      ],
      points: '一句话：进程管隔离，线程管效率。\nIPC 五件套，共享内存最快——免拷贝。\n线程共享堆、私有栈——并发问题的根源就在「共享」二字。',
    };
  }

  /* ============ 7. 虚拟内存是什么？为什么需要？ ============ */
  function qVirtMem() {
    const L = [
      () => txt(380, 28, '没有虚拟内存：程序直接用物理地址 —— 互踩、不够用', { anchor: 'middle', fs: 12.5, fw: 600, color: C.clay }) +
        box(70, 44, 240, 40, '程序 A 写物理地址 0x1000', { mono: true, fs: 11, stroke: C.clay }) +
        arrow(316, 64, 400, 64, { color: C.clay, label: '互踩' }) +
        box(406, 44, 250, 40, '程序 B 的数据被踩 ✗', { fs: 11.5, stroke: C.clay, color: C.clay }) +
        txt(380, 104, '地址写死没法共处 —— 需要一层「翻译」', { anchor: 'middle', fs: 11.5, color: C.faint }),
      () => txt(380, 132, '虚拟内存：每进程一套虚拟地址，MMU 查页表翻译', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(40, 150, 170, 44, '虚拟地址', { fs: 12, stroke: C.blue, color: C.blue }) +
        arrow(214, 172, 280, 172, { color: C.blue, label: 'CPU 发出' }) +
        box(284, 146, 160, 52, 'MMU + 页表', { fs: 12.5, stroke: C.accent, color: C.accent, fill: C.surface2 }) +
        arrow(448, 172, 514, 172, { color: C.moss, label: '翻译' }) +
        box(518, 150, 200, 44, '物理地址（真实内存）', { fs: 11.5, stroke: C.moss, color: C.moss }) +
        txt(380, 208, '每个进程一张页表：同一个虚拟地址，各进程翻到不同物理页', { anchor: 'middle', fs: 11.5, color: C.faint }),
      () => txt(380, 236, '分页：内存切成 4KB 的页，页表记录映射', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(70, 254, 150, 34, '虚拟页 #3', { mono: true, fs: 11.5 }) +
        arrow(224, 271, 320, 271, { color: C.moss }) +
        box(324, 254, 150, 34, '物理页 #7', { mono: true, fs: 11.5, stroke: C.moss, color: C.moss }) +
        box(70, 298, 150, 34, '虚拟页 #9', { mono: true, fs: 11.5, dashed: true, stroke: C.clay }) +
        arrow(224, 315, 320, 315, { color: C.clay, dashed: true, label: '缺页' }) +
        box(324, 298, 150, 34, '从磁盘调入', { fs: 11.5, dashed: true, stroke: C.clay, color: C.clay }) +
        txt(510, 264, '页：内存管理的最小单位', { fs: 11.5 }) +
        txt(510, 292, '缺页中断：访问没映射的页', { fs: 11.5, color: C.clay }) +
        txt(510, 316, 'OS 把页搬进内存，程序无感', { fs: 11.5, color: C.faint }),
      () => txt(380, 358, '四个好处：隔离 · 超卖 · 按需加载 · 共享库', { anchor: 'middle', fs: 12.5, fw: 600, color: C.moss }) +
        box(25, 374, 170, 44, '① 隔离：页表各自独立', { fs: 11 }) +
        box(205, 374, 170, 44, '② 超卖：冷页换出 swap', { fs: 11 }) +
        box(385, 374, 170, 44, '③ 按需加载：用到才装入', { fs: 11 }) +
        box(565, 374, 170, 44, '④ 共享库：libc 一份', { fs: 11 }) +
        txt(380, 438, 'swap：磁盘上的交换区，内存吃紧时把冷页挪过去腾地方', { anchor: 'middle', fs: 11.5, color: C.faint }),
      () => txt(380, 466, '代价：页表占内存、缺页风暴会颠簸', { anchor: 'middle', fs: 12.5, fw: 600, color: C.clay }) +
        box(60, 482, 290, 40, '页表占内存 → 多级页表按需分配', { fs: 11.5, stroke: C.brass, color: C.brass }) +
        box(410, 482, 290, 40, '缺页太频繁 → 颠簸（换页风暴）', { fs: 11.5, stroke: C.clay, color: C.clay }) +
        txt(380, 542, '颠簸：CPU 全在搬页、正事不干 —— 根治靠加内存', { anchor: 'middle', fs: 11.5, color: C.accent, fw: 600 }),
    ];
    return {
      id: 'virtual-memory', cat: '操作系统', level: '进阶', hot: false,
      q: '虚拟内存是什么？为什么需要？',
      answer: '虚拟内存给每个进程一套独立的虚拟地址空间，CPU 里的 MMU 通过页表把虚拟地址翻译成物理地址。四个好处：进程隔离（页表各自独立）、内存超卖（冷页换出到磁盘）、按需加载（只装入用到的页）、共享库只存一份。代价是页表占内存、缺页太频繁会颠簸——CPU 全在搬页不干活。',
      steps: [
        { title: '没有它会怎样', text: '程序直接用物理地址：两个程序可能踩进同一块内存互相破坏；机器 8G 内存就只能跑装得下 8G 的程序。病根是「地址写死」——所以要在程序和内存之间加一层翻译。' },
        { title: '虚拟内存：一层翻译', text: '每个进程看到独立的虚拟地址空间，真正访问时由 CPU 的 MMU（内存管理单元，负责地址翻译的硬件）查页表——虚拟页到物理页的映射表——换算成物理地址。各查各的表，天然隔离。' },
        { title: '分页与缺页中断', text: '内存切成固定大小的页（常见 4KB），页表记录虚拟页 → 物理页。访问没映射的页触发缺页中断：操作系统暂停程序，从磁盘把这一页搬进内存、补好页表，再继续执行——对程序几乎透明。' },
        { title: '四个好处', text: '① 进程隔离：页表独立，摸不到别人的内存；② 内存超卖：物理内存不够就把冷页换出到 swap（磁盘交换区）；③ 按需加载：启动只装入用到的页；④ 共享库：libc 这类库物理内存只放一份，多进程映射同一页。' },
        { title: '代价：页表与颠簸', text: '页表本身也占内存——64 位地址空间直接存全量表大得离谱，所以用多级页表，没涉及的地址范围就不建表。另一个坑是颠簸：缺页太频繁，CPU 全在换页搬运、正事不干，根治靠加内存。' },
      ],
      figure: { vb: '0 0 760 562', draw: n => layers(n, L, '0 0 760 562') },
      followups: [
        ['页表为什么用多级？', '全量表太大；多级让没涉及的地址范围根本不建页表页，按需分配，省内存。'],
        ['什么是缺页中断？', '访问的页不在物理内存（页表无映射）时触发：OS 从磁盘调入该页、更新页表，再恢复执行。'],
        ['swap 和 OOM killer 什么关系？', '内存耗尽先换页腾地方；换无可换时内核 OOM killer 挑占用最大的进程杀掉保命。'],
      ],
      points: '虚拟内存三件套：隔离、超卖、按需加载。\n翻译靠 MMU + 页表，缺页 = 从磁盘搬一页。\n颠簸 = 换页风暴，加内存才是根治，调参只是缓解。',
    };
  }

  /* ============ 8. select/poll/epoll 的区别？ ============ */
  function qIoMux() {
    const L = [
      () => txt(380, 28, 'BIO：一个连接一个线程阻塞读 —— 高并发直接崩', { anchor: 'middle', fs: 12.5, fw: 600, color: C.clay }) +
        box(70, 44, 180, 36, '1 万个连接', { mono: true, fs: 11.5 }) +
        arrow(160, 82, 160, 96, { color: C.clay }) +
        box(70, 100, 180, 36, '1 万个线程干等 ✗', { fs: 11.5, stroke: C.clay, color: C.clay }) +
        txt(300, 56, 'read() 没数据就一直阻塞', { fs: 11.5 }) +
        txt(300, 82, '线程内存 + 切换开销全爆', { fs: 11.5, color: C.clay, fw: 600 }) +
        txt(300, 118, '连接数 = 线程数，线性烧内存', { fs: 11.5, color: C.faint }),
      () => txt(380, 166, 'select / poll：一个线程盯一批 fd（文件描述符，socket 的句柄）', { anchor: 'middle', fs: 12.5, fw: 600, color: C.brass }) +
        box(40, 186, 120, 44, '应用', { fs: 12 }) +
        arrow(166, 208, 252, 208, { color: C.brass, label: '全量拷贝 fd' }) +
        box(256, 186, 150, 44, '内核逐个查', { fs: 12, stroke: C.brass }) +
        arrow(412, 208, 500, 208, { color: C.clay, label: '返回后扫描' }) +
        box(504, 186, 150, 44, '谁就绪？逐个问', { fs: 11.5 }) +
        txt(380, 250, '缺陷：每次全量拷贝 + 线性扫描 O(n)；select 有 1024 上限，poll 没有上限', { anchor: 'middle', fs: 11.5, color: C.accent }),
      () => txt(380, 276, 'epoll 三件套：create 建实例 → ctl 注册（一次）→ wait 拿就绪', { anchor: 'middle', fs: 12.5, fw: 600, color: C.accent }) +
        box(40, 292, 160, 40, 'epoll_create', { mono: true, fs: 12 }) +
        arrow(204, 312, 240, 312, {}) +
        box(244, 292, 170, 40, 'epoll_ctl 注册一次', { mono: true, fs: 11.5, stroke: C.moss }) +
        arrow(418, 312, 454, 312, {}) +
        box(458, 292, 150, 40, 'epoll_wait', { mono: true, fs: 12, stroke: C.accent, color: C.accent }) +
        box(80, 346, 170, 36, '内核红黑树存 fd', { fs: 11.5, stroke: C.moss }) +
        arrow(256, 364, 330, 364, { color: C.accent, label: '回调' }) +
        box(334, 346, 140, 36, '就绪链表', { fs: 11.5, stroke: C.accent, color: C.accent }) +
        arrow(480, 364, 540, 364, { color: C.moss, label: '只拿就绪' }) +
        txt(546, 368, 'O(1)', { mono: true, fs: 13, fw: 700, color: C.accent }) +
        txt(380, 396, '注册一次长期留在内核；事件到了内核回调挂上就绪链表——应用只处理就绪的', { anchor: 'middle', fs: 11.5, color: C.faint }),
      () => txt(380, 424, 'LT vs ET：默认的省心，与高效的高压', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(50, 440, 290, 40, 'LT 水平触发：没处理完会一直提醒（默认）', { fs: 11, stroke: C.blue }) +
        box(420, 440, 290, 40, 'ET 边缘触发：只报一次，读到 EAGAIN', { fs: 11, stroke: C.accent, color: C.accent }) +
        txt(380, 500, 'ET 必须配非阻塞 IO 循环读——高效但容易写错，多数场景 LT 起步', { anchor: 'middle', fs: 11.5, color: C.faint }),
      () => txt(380, 528, '谁在用：Redis · Nginx · Netty', { anchor: 'middle', fs: 12.5, fw: 600, color: C.moss }) +
        box(50, 544, 200, 40, 'Redis：单线程 + epoll', { mono: true, fs: 11.5, stroke: C.clay }) +
        box(280, 544, 200, 40, 'Nginx：多 worker 进程', { fs: 11.5, stroke: C.moss }) +
        box(510, 544, 210, 40, 'Netty：NIO 的底座', { fs: 11.5, stroke: C.blue }) +
        txt(380, 604, '跨平台对应：macOS kqueue · Windows IOCP —— 思路一致：注册一次、事件回调', { anchor: 'middle', fs: 11.5, color: C.faint }),
    ];
    return {
      id: 'io-multiplexing', cat: '操作系统', level: '进阶', hot: true,
      q: 'select/poll/epoll 的区别？为什么 Redis 和 Nginx 都用 epoll？',
      answer: '三代模型：BIO 一个连接一个线程，1 万连接 1 万线程，崩。select/poll 让一个线程管一批 fd，但每次全量拷贝进内核、返回后还要线性扫描，O(n)，select 还有 1024 上限。epoll 三件套：create 建实例、ctl 注册（一次，内核红黑树保存）、wait 拿就绪列表——内核回调把就绪 fd 挂链表，应用只处理就绪的。所以 Redis、Nginx、Netty 都靠它扛高并发。',
      steps: [
        { title: '起点：BIO', text: '一个连接一个线程，read() 没数据就一直阻塞干等。1 万个连接就要 1 万个线程：内存吃不消、上下文切换把 CPU 打满。连接越多越崩，高并发下这条路走不通。' },
        { title: 'select/poll：一拖 N', text: '一个线程把一批 fd（文件描述符，socket 的句柄编号）交给内核盯着。两大缺陷：每次调用把整个 fd 集合拷进内核；返回后还得从头扫一遍才知道谁就绪，都是 O(n)。select 还有 1024 个的上限；poll 没有这个上限，但扫描照旧。' },
        { title: 'epoll：三件套', text: 'epoll_create 建实例；epoll_ctl 注册 fd——只注册一次，内核用红黑树保存；epoll_wait 只等就绪列表。数据到达时内核回调把就绪 fd 挂上链表，应用拿到的直接是就绪清单——免全量拷贝、免线性扫描。' },
        { title: 'LT 与 ET', text: '水平触发 LT（默认）：还有数据没处理完，每次 wait 都继续提醒——好写。边缘触发 ET：状态变化时只报一次，必须配非阻塞 IO 一次读到 EAGAIN（读完了的信号）——高效但容易写错。' },
        { title: '谁在用', text: 'Redis：单线程命令执行 + epoll 盯海量连接，撑起十万级 QPS；Nginx：多个 worker 进程各自跑事件循环；Netty 的 NIO 也是这套（Linux 上还能换原生 epoll 传输）。对应物：macOS 的 kqueue、Windows 的 IOCP。' },
      ],
      figure: { vb: '0 0 760 624', draw: n => layers(n, L, '0 0 760 624') },
      followups: [
        ['epoll 为什么快？', 'fd 注册一次长期有效（内核红黑树），就绪靠内核回调挂链表——省掉全量拷贝和 O(n) 扫描。'],
        ['LT 和 ET 的使用差异？', 'LT 默认、好写；ET 必须非阻塞 + 循环读到 EAGAIN，漏读就卡死——高效但难写。'],
        ['Redis 6.0 多线程和 epoll 什么关系？', 'epoll 管连接就绪没变；6.0 多线程只负责网络读写和协议解析，命令执行仍是单线程。'],
      ],
      points: '三代演进：一连接一线程 → 全量拷贝 + 扫描 → 回调就绪 O(1)。\nepoll 三步：create / ctl / wait，fd 注册一次内核保存。\nLT 默认省心，ET 高效但难写——必须配非阻塞循环读。',
    };
  }

  /* 8 题；由门户或测试拼进完整题库（QA_PART_6） */
  w.QA_PART_6 = [qHashmap(), qJvmMemory(), qGc(), qClassloader(), qString(), qProcThread(), qVirtMem(), qIoMux()];
})(typeof window !== 'undefined' ? window : globalThis);
