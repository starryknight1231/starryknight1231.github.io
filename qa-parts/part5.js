/* ============ QA Part 5 · Java 并发六题（synchronized / 线程状态 / ThreadLocal / 死锁 / CAS / ConcurrentHashMap） ============
   画图助手复用 qa-deck.js 暴露的 __qaHelpers，保证全站视觉一致；纯数据 + SVG 字符串，不碰 DOM。
   每题 figure.draw(n)：第 0..n 层显影（opacity 1），之后降 0.15；图层数与 steps 一一对应。 */
(function (w) {
  'use strict';
  const { C, SANS, MONO, box, txt, arrow, chip, layers } = w.__qaHelpers;

  /* ============ 1. synchronized 的原理？锁是怎么升级的？ ============ */
  function qSync() {
    const L = [
      () => box(40, 28, 214, 44, '实例方法 → 锁 this') +
        box(268, 28, 224, 44, '静态方法 → 锁 Class 对象') +
        box(506, 28, 214, 44, '代码块 → 锁指定对象') +
        txt(380, 94, '三把锁对象互不干扰——先搞清「锁的是谁」，后面的一切才有讨论意义', { anchor: 'middle', fs: 12 }),
      () => box(50, 118, 330, 44, '同步代码块 → monitorenter / monitorexit', { fs: 12 }) +
        box(390, 118, 310, 44, '同步方法 → ACC_SYNCHRONIZED 标志', { fs: 12 }) +
        txt(380, 186, '字节码形态不同，本质一样：都要去获取对象关联的 Monitor（下一层拆开看）', { anchor: 'middle', fs: 12 }),
      () => txt(380, 212, 'Monitor（监视器锁）：重量级锁的「门禁」结构', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        `<rect x="130" y="218" width="500" height="76" rx="10" fill="${C.surface2}" stroke="${C.lineS}" stroke-width="1.4"/>` +
        box(148, 232, 148, 44, 'owner 持有者', { fs: 12 }) +
        box(306, 232, 148, 44, 'entryList 阻塞队列', { fs: 12 }) +
        box(464, 232, 148, 44, 'waitSet 等待队列', { fs: 12 }) +
        txt(380, 312, '同一时刻只有一个线程能当 owner；抢不到的去 entryList 排队，wait 过的线程挂在 waitSet', { anchor: 'middle', fs: 12 }),
      () => box(50, 366, 140, 42, '① 无锁') +
        box(296, 348, 156, 42, '② 偏向锁') +
        box(552, 330, 158, 42, '③ 轻量级锁') +
        arrow(192, 382, 294, 368, { color: C.muted }) +
        arrow(454, 366, 550, 350, { color: C.muted }) +
        txt(380, 434, '触发条件：一个线程反复进入 → 偏向（对象头记线程 ID）；出现交替竞争 → CAS 自旋 → 轻量级', { anchor: 'middle', fs: 12 }),
      () => box(250, 454, 260, 44, '④ 重量级锁：OS 互斥量，线程挂起', { stroke: C.accent, color: C.accent, fs: 12 }) +
        txt(380, 522, '竞争激烈 → 走操作系统互斥量，线程真的挂起 / 唤醒，开销最大；升级不可逆——常规路径只升不降', { anchor: 'middle', fs: 12 }),
      () => txt(380, 556, 'JDK 15 起（JEP 374）偏向锁默认禁用并废弃：撤销偏向是一笔昂贵操作，高并发下收益为负', { anchor: 'middle', fs: 12, fw: 600, color: C.accent }) +
        txt(380, 580, '答题线：锁的是谁 → 怎么进 Monitor → 升级四阶 → 只升不降 → 版本边界', { anchor: 'middle', fs: 12, color: C.faint }),
    ];
    return {
      id: 'synchronized', cat: 'Java 并发', level: '进阶', hot: true,
      q: 'synchronized 的原理？锁是怎么升级的？',
      answer: '三种用法对应三把锁：实例方法锁 this、静态方法锁 Class 对象、代码块锁指定对象。字节码上同步块是 monitorenter/monitorexit，同步方法是 ACC_SYNCHRONIZED 标志，本质都是获取对象的 Monitor。JDK 6 引入锁升级：无锁→偏向→轻量级→重量级，只升不降；JDK 15 起偏向锁默认废弃。',
      steps: [
        { title: '三种用法，三把锁对象', text: '先分清锁的是谁：实例方法锁当前对象 this，静态方法锁 Class 对象，同步代码块锁括号里指定的那个对象。三个对象就是三把独立的锁，互不干扰——锁错对象，同步就白做了。' },
        { title: '字节码：一指令一标志', text: '同步代码块编译成 monitorenter 和 monitorexit 两条指令；同步方法靠方法头的 ACC_SYNCHRONIZED 标志识别。形态不同本质一样：执行时都要去获取对象关联的 Monitor（监视器锁）。' },
        { title: 'Monitor：门禁结构', text: '重量级锁的实现叫 Monitor（监视器锁），三个关键部位：owner 是当前持锁线程；entryList 是抢锁失败的阻塞队列；waitSet 是调了 wait() 的线程的等待队列，同一时刻只有一个线程能当 owner。锁还在偏向/轻量级阶段时，信息放在对象头的 Mark Word 里，竞争升级「膨胀」成重量级后才挂上 Monitor。' },
        { title: '锁升级：四级台阶', text: 'JDK 6 引入分级优化，按竞争程度逐级升级：无锁 → 偏向锁（只有一个线程反复进入，对象头记个线程 ID 就放行）→ 轻量级锁（出现交替竞争，CAS 自旋抢一小会儿）→ 重量级锁（竞争激烈，走操作系统）。' },
        { title: '升级不可逆，只会加重', text: '锁只能逐级升级，不能从重量级降回去。设计逻辑：既然激烈竞争过，说明它是热点锁，保留重量级反而省去反复升降的开销。所以线上看到重量级锁，就该当竞争热点来治理，而不是指望它自己降级。' },
        { title: 'JDK 15：偏向锁谢幕', text: 'JDK 15 起（JEP 374）偏向锁默认禁用并废弃：撤销偏向是一笔昂贵操作，高并发下反复撤销得不偿失；而且现代应用大量使用自带并发的容器，偏向锁很难再帮上忙。主动说出这个版本边界，是实打实的加分项。' },
      ],
      figure: { vb: '0 0 760 600', draw: n => layers(n, L, '0 0 760 600') },
      followups: [
        ['偏向锁为什么被废弃？', '维护成本高、收益变少：撤销偏向很贵，现代应用多用并发容器，偏向场景稀少——JDK 15 默认禁用（JEP 374）。'],
        ['轻量级锁自旋多少次？', 'JDK 6 起是自适应自旋：次数不固定，看同一把锁上次自旋的成功率和 owner 状态动态调整——答「自适应」即可。'],
        ['Monitor 的 owner 是什么？', '当前持锁的线程；抢不到的进 entryList 排队，wait 的挂 waitSet。'],
        ['synchronized 和 ReentrantLock 怎么选？', '要可中断、超时、公平、多条件选 ReentrantLock；一般 synchronized 够用，1.6 后性能不差。'],
      ],
      points: '用法三式记锁对象：this、Class、括号指定对象——锁错对象同步白做。\n升级四阶不可逆：无锁→偏向→轻量级→重量级，只会加重不会降级。\nJDK 15 废弃偏向锁（JEP 374，撤销贵于收益）；Monitor = 每个对象自带的门禁。',
    };
  }

  /* ============ 2. 线程有哪几种状态？怎么流转？ ============ */
  function qStates() {
    const st = {
      NEW: () => box(50, 40, 130, 46, 'NEW', { mono: true }),
      RUN: () => box(300, 40, 170, 46, 'RUNNABLE', { mono: true, stroke: C.moss, color: C.moss }),
      TERM: () => box(590, 40, 140, 46, 'TERMINATED', { mono: true }),
      BLK: () => box(60, 180, 150, 44, 'BLOCKED', { mono: true, stroke: C.clay, color: C.clay }),
      WAI: () => box(320, 180, 170, 44, 'WAITING', { mono: true, stroke: C.blue, color: C.blue }),
      TIM: () => box(560, 180, 180, 44, 'TIMED_WAITING', { mono: true, stroke: C.brass, color: C.brass }),
    };
    const L = [
      () => st.NEW() + st.RUN() + st.TERM() +
        arrow(182, 60, 298, 60, { color: C.blue, label: 'start()' }) +
        arrow(472, 60, 588, 60, { color: C.muted, label: 'run() 跑完' }) +
        txt(380, 112, '六个状态都定义在 Thread.State 枚举里——这是 JVM 视角的线程状态', { anchor: 'middle', fs: 12 }),
      () => st.NEW() + st.RUN() + st.TERM() + st.BLK() +
        arrow(350, 88, 150, 178, { color: C.clay, label: '抢 synchronized 锁失败' }) +
        arrow(205, 180, 345, 88, { color: C.moss }) +
        txt(380, 268, 'BLOCKED：抢锁失败的排队区——拿到锁就回 RUNNABLE 继续跑', { anchor: 'middle', fs: 12 }),
      () => st.NEW() + st.RUN() + st.TERM() + st.BLK() + st.WAI() + st.TIM() +
        arrow(385, 88, 405, 178, { color: C.blue, label: 'wait() / join()' }) +
        arrow(465, 88, 640, 178, { color: C.brass, label: 'sleep(n) / wait(n)' }) +
        txt(380, 296, 'WAITING：主动放手，无限期等通知；TIMED_WAITING：限时等，到点自己醒', { anchor: 'middle', fs: 12 }),
      () => st.NEW() + st.RUN() + st.TERM() + st.BLK() + st.WAI() + st.TIM() +
        arrow(320, 250, 212, 250, { color: C.accent, sw: 2.6, label: 'notify() 后先回 BLOCKED 抢锁' }) +
        txt(380, 324, '90% 的人答漏：notify 醒来不是直接回 RUNNABLE——先抢锁，抢不到照样 BLOCKED', { anchor: 'middle', fs: 12, fw: 600, color: C.accent }),
      () => st.NEW() + st.RUN() + st.TERM() + st.BLK() + st.WAI() + st.TIM() +
        txt(380, 352, 'BLOCKED：被动——锁被别人拿着，我排队等门开', { anchor: 'middle', fs: 12.5, fw: 600, color: C.clay }) +
        txt(380, 376, 'WAITING：主动——自己 wait()/join() 让出 CPU，等通知再回来', { anchor: 'middle', fs: 12.5, fw: 600, color: C.blue }),
      () => st.NEW() + st.RUN() + st.TERM() + st.BLK() + st.WAI() + st.TIM() +
        txt(380, 404, 'JVM 没有「运行中」：RUNNABLE = 就绪 + 正在运行，跑不跑由操作系统调度决定', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        txt(380, 428, 'start 起步 · 抢锁失败 BLOCKED · 主动放手 WAITING · 限时 TIMED_WAITING · 跑完 TERMINATED', { anchor: 'middle', fs: 12, color: C.faint }),
    ];
    return {
      id: 'thread-states', cat: 'Java 并发', level: '入门', hot: true,
      q: '线程有哪几种状态？怎么流转？',
      answer: '六个状态：NEW 没启动；RUNNABLE 就绪+运行都在内；BLOCKED 等锁；WAITING 无限期等（wait/join）；TIMED_WAITING 限时等（sleep(n)）；TERMINATED 跑完。wait() 被 notify 醒来要先回 BLOCKED 抢锁；JVM 无「运行中」，RUNNABLE 含等 CPU 的。',
      steps: [
        { title: '六状态全家福', text: 'Thread.State 枚举六个值：NEW（创建了还没 start）、RUNNABLE（可运行：正在跑和等着 CPU 都算）、BLOCKED（等锁）、WAITING（无限期等）、TIMED_WAITING（限时等）、TERMINATED（跑完了）。' },
        { title: '和锁有关的流转', text: 'start() 让线程从 NEW 进 RUNNABLE。抢 synchronized 锁失败就进 BLOCKED 排队，拿到锁回到 RUNNABLE 继续跑——注意锁对象就是 synchronized 括号里指定的那一个。' },
        { title: '两种「等」', text: 'WAITING 是无限期等：wait()、join() 不带超时，不等到不罢休；TIMED_WAITING 是限时等：sleep(n)、wait(n)、join(n)，到点自己醒。区别就一个：有没有带时间参数。' },
        { title: 'notify 醒来先抢锁', text: '高频细节：wait() 被 notify 唤醒后，不是直接回 RUNNABLE——它得先重新抢锁，抢不到就进 BLOCKED 排队，抢到了才继续。90% 的人答漏这个「先回 BLOCKED」的中转步骤。' },
        { title: '等锁 vs 等通知', text: 'BLOCKED 是被动：锁被别人拿着，我只能排队等门开；WAITING 是主动：我自己调 wait()/join() 放下 CPU 等通知。一句话总结：一个在等锁，一个在等事件。' },
        { title: 'JVM 没有「运行中」', text: 'Java 线程状态里没有 RUNNING：RUNNABLE 同时涵盖就绪和运行中，线程到底跑没跑由操作系统调度说了算。所以「RUNNABLE 但 CPU 占用为 0」很正常——它在等 CPU，不在等锁。' },
      ],
      figure: { vb: '0 0 760 448', draw: n => layers(n, L, '0 0 760 448') },
      followups: [
        ['sleep 和 wait 的区别？', 'sleep 是 Thread 的静态方法，抱着锁睡；wait 是 Object 的方法，先持锁，进去就放锁。'],
        ['notify 和 notifyAll？', 'notify 唤醒一个，选错了可能全体干等；notifyAll 全唤醒再抢锁——拿不准就 notifyAll。'],
        ['直接调 run() 会怎样？', '就是普通方法调用，在当前线程栈里同步执行，没有新线程也没有异步——只有 start() 才会真正开线程。'],
        ['wait 为什么必须在 synchronized 里？', '没持锁就调 wait 会抛 IllegalMonitorStateException；持着锁才谈得上「放锁等通知」。'],
      ],
      lab: { href: 'apps/jmm-lab/#/states', label: 'JMM Lab · 线程六状态机，点状态看代码与误区' },
      points: '六状态背熟，三段重点：NEW→start、抢锁失败 BLOCKED、主动放手 WAITING。\nwait 被 notify 醒来要先回 BLOCKED 抢锁——90% 的人答漏这一步。\nJVM 无 RUNNING：RUNNABLE = 就绪 + 运行，调度归操作系统。',
    };
  }

  /* ============ 3. ThreadLocal 是什么？为什么会内存泄漏？ ============ */
  function qTl() {
    const L = [
      () => box(50, 30, 150, 44, '线程 A', { stroke: C.blue, color: C.blue }) +
        box(300, 30, 160, 44, 'ThreadLocal 变量', { stroke: C.accent, color: C.accent }) +
        box(560, 30, 150, 44, '线程 B', { stroke: C.mauve, color: C.mauve }) +
        arrow(298, 44, 202, 44, { color: C.blue, label: '副本 A' }) +
        arrow(462, 60, 558, 60, { color: C.mauve, label: '副本 B' }) +
        txt(380, 104, '同一个变量，每个线程摸到自己的那份——典型用途：用户上下文、DB 连接、日期格式化', { anchor: 'middle', fs: 12 }),
      () => box(50, 140, 140, 44, 'Thread 对象') +
        box(250, 140, 210, 44, 'ThreadLocalMap', { mono: true, fs: 12 }) +
        box(520, 140, 190, 44, 'entry：key + value', { fs: 12 }) +
        arrow(192, 162, 248, 162, { color: C.muted, label: '持有' }) +
        arrow(462, 162, 518, 162, { color: C.muted, label: '装着' }) +
        txt(380, 212, 'Map 挂在 Thread 身上（不在 ThreadLocal 里）；key 是 ThreadLocal 实例，value 是你放的值', { anchor: 'middle', fs: 12 }),
      () => box(80, 256, 220, 44, 'ThreadLocal 实例（栈上引用）', { fs: 12 }) +
        `<rect x="366" y="244" width="380" height="68" rx="9" fill="none" stroke="${C.lineS}" stroke-width="1.4"/>` +
        box(382, 256, 150, 44, 'key（弱引用）', { fs: 12, dashed: true, stroke: C.faint, color: C.faint }) +
        box(566, 256, 164, 44, 'value（强引用）', { fs: 12, stroke: C.clay, color: C.clay }) +
        arrow(302, 278, 380, 278, { color: C.faint, dashed: true, label: '弱引用' }) +
        txt(380, 326, '实线 = 强引用（GC 不敢动）；虚线 = 弱引用（下一次 GC 直接回收）——记住这条再看泄漏', { anchor: 'middle', fs: 12 }),
      () => chip(60, 356, 'key 被 GC → 变 null', C.clay) +
        chip(310, 356, 'value 还被 Thread 强引用', C.clay) +
        chip(586, 356, '线程池线程几乎不死', C.clay) +
        txt(380, 412, '实例被回收、key 成 null，value 却还有人攥着——线程池的线程几乎不死，这块内存就一直挂着', { anchor: 'middle', fs: 12 }),
      () => txt(380, 452, '为什么 key 用弱引用：至少 key 能被回收；get/set 时还会顺手清理一部分 key=null 的 entry——治标不治本', { anchor: 'middle', fs: 12, fw: 600 }) +
        txt(380, 478, '为什么 value 不用弱引用：只剩 Map 这一跳引用时会被立刻回收，存进去的值说没就没——必须强引用', { anchor: 'middle', fs: 12 }),
      () => box(80, 534, 260, 44, 'try { … } finally { remove() }', { mono: true, fs: 12, stroke: C.moss, color: C.moss }) +
        box(380, 534, 300, 44, '线程池场景：remove 是铁律不是建议', { fs: 12, stroke: C.moss, color: C.moss }) +
        txt(380, 606, '父子线程不共享：InheritableThreadLocal 只传一次，线程池复用会串台——要传就用 TransmittableThreadLocal', { anchor: 'middle', fs: 12 }),
    ];
    return {
      id: 'threadlocal', cat: 'Java 并发', level: '进阶', hot: true,
      q: 'ThreadLocal 是什么？为什么会内存泄漏？',
      answer: 'ThreadLocal 给每个线程独立副本，线程内随处可取。Thread 里有自己的 ThreadLocalMap：key 是 ThreadLocal 实例（弱引用），value 是放的值（强引用）。实例被回收后 key 变 null，value 还被线程引用着；线程池线程几乎不死，内存就一直挂着，必须 finally remove()。',
      steps: [
        { title: '它解决什么问题', text: '同一个对象（用户上下文、数据库连接、SimpleDateFormat），每个线程要一份自己的：存到 ThreadLocal 里，线程内随处可取，不用层层传参，也不会互相踩踏——不用加锁就做到线程隔离。' },
        { title: '结构：Map 在线程身上', text: '每个 Thread 对象里有一个 ThreadLocalMap，Map 挂在线程身上而不是 ThreadLocal 身上。entry 的 key 是 ThreadLocal 实例（弱引用），value 是你放进去的值（强引用）——记住这句，泄漏就好理解了。' },
        { title: '泄漏路径', text: '外面的 ThreadLocal 实例没了引用，下一次 GC 就回收它，entry 的 key 变成 null；但 value 还被 Thread 强引用着。线程池的线程几乎和进程同寿，value 就一直挂着收不回——泄漏成立。' },
        { title: 'key 为什么是弱引用', text: '弱引用（GC 看到就回收，不管有没有别人用）是无奈中的最优：至少 key 能被回收，get/set 时还会顺手清理一部分 key=null 的 entry。反过来 value 用弱引用？只剩 Map 这一跳时立刻被回收，数据说没就没。' },
        { title: '用完必须 remove()', text: '用完必须 remove()，而且放在 finally 里——异常路径也不漏。线程池场景是铁律不是建议：线程复用，上一单的 value 会被下一单读到，既是内存泄漏也是数据串台。' },
        { title: '父子线程怎么传', text: '默认不共享：子线程拿不到父线程的值。InheritableThreadLocal 能在创建线程时拷贝一份，但线程池里线程是复用的，会读到上一个任务的旧值——要跨线程池传上下文，用阿里开源的 TransmittableThreadLocal。' },
      ],
      figure: { vb: '0 0 760 630', draw: n => layers(n, L, '0 0 760 630') },
      followups: [
        ['弱引用和强引用的区别？', '强引用：只要还指着 GC 绝不回收；弱引用：下一次 GC 直接回收，不管有没有别人用——弱引用活不过一次 GC。'],
        ['为什么 key 弱、value 强？', 'value 弱了数据会凭空消失；key 弱至少让 entry 有被清理的机会，再配 remove() 才是完整答案。'],
        ['泄漏和溢出什么关系？', '泄漏是「该还的不还」，慢性病；OOM 是「不够用了」，急性发作。泄漏长期积累，最终往往表现成 OOM。'],
        ['key=null 的 entry 会自动清吗？', 'get/set/remove 时会顺手清一部分；线程一直不碰这个 Map 就永远不清——得自己 remove。'],
      ],
      points: '结构一句话：Map 挂在 Thread 身上，key 弱引用、value 强引用。\n泄漏根源 = 长命线程（线程池）+ 忘了 remove。\nfinally 里 remove() 是铁律；跨线程池传值用 TTL，InheritableThreadLocal 会串台。',
    };
  }

  /* ============ 4. 死锁产生的条件？怎么排查和避免？ ============ */
  function qDl() {
    const L = [
      () => chip(40, 28, '① 互斥', C.blue) +
        chip(150, 28, '② 持有并等待', C.teal) +
        chip(296, 28, '③ 不可剥夺', C.brass) +
        chip(430, 28, '④ 循环等待', C.accent) +
        txt(380, 84, '① 资源一次一人 ② 拿着 A 等 B ③ 不能硬抢 ④ A 等 B、B 等 A——四个同时满足才死锁', { anchor: 'middle', fs: 12 }) +
        txt(380, 108, '破坏任意一个就死不了；面试重点是「循环等待」——下面看经典现场', { anchor: 'middle', fs: 12, color: C.faint }),
      () => chip(50, 140, '线程 1：转 A→B', C.blue) +
        chip(50, 196, '线程 2：转 B→A', C.mauve) +
        box(300, 132, 170, 44, '锁 accountA', { mono: true, fs: 12 }) +
        box(300, 192, 170, 44, '锁 accountB', { mono: true, fs: 12 }) +
        arrow(190, 151, 298, 151, { color: C.blue, label: '已持有' }) +
        arrow(190, 207, 298, 207, { color: C.mauve, label: '已持有' }) +
        txt(380, 264, '两把锁两笔转账：线程 1 拿了 A 再要 B，线程 2 拿了 B 再要 A——顺序正好相反', { anchor: 'middle', fs: 12 }),
      () => chip(600, 140, '死锁 ✗', C.clay) +
        arrow(190, 158, 296, 212, { color: C.clay, dashed: true }) +
        arrow(190, 208, 296, 148, { color: C.clay, dashed: true }) +
        txt(380, 288, '虚线 = 被卡住的请求：再要对方手里的锁 ✗——两条虚线交叉绕成环，谁也不放、谁也拿不到', { anchor: 'middle', fs: 12.5, fw: 600, color: C.accent }),
      () => box(50, 314, 210, 44, 'jstack：直接标出死锁环', { fs: 12 }) +
        box(280, 314, 210, 44, 'jconsole：面板上检测', { fs: 12 }) +
        box(510, 314, 200, 44, 'Arthas：thread -b', { fs: 12 }) +
        txt(380, 388, 'jstack 末尾直接给出 "Found one Java-level deadlock" 和成环的线程与锁——线上排查第一工具', { anchor: 'middle', fs: 12 }),
      () => box(50, 412, 330, 44, '① 全项目统一加锁顺序（最常用）', { stroke: C.moss, color: C.moss }) +
        box(400, 412, 310, 44, '② tryLock 带超时，拿不到就放手', { fs: 12.5, stroke: C.blue, color: C.blue }) +
        txt(380, 486, '固定顺序破坏「循环等待」；tryLock 破坏「不可剥夺」；一次性申请全部资源破坏「持有并等待」', { anchor: 'middle', fs: 12 }),
      () => txt(380, 514, '数据库也一样：两个事务按相反顺序更新两行，行锁成环；InnoDB 等待图自动检测', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        txt(380, 540, '回滚 undo 量小（容易回滚）的事务，业务捕获死锁异常重试即可', { anchor: 'middle', fs: 12, color: C.faint }),
    ];
    return {
      id: 'deadlock', cat: 'Java 并发', level: '进阶', hot: true,
      q: '死锁产生的条件？怎么排查和避免？',
      answer: '四个必要条件缺一不可：互斥、持有并等待、不可剥夺、循环等待——破坏任意一个就死不了。经典现场是转账交叉持锁。排查三板斧：jstack 直接标出死锁环，jconsole、Arthas 也能现场检测。避免最常用的是全项目统一加锁顺序，破坏循环等待；其次 tryLock 带超时。数据库行锁也会死锁，InnoDB 会检测并回滚代价小的事务。',
      steps: [
        { title: '四个必要条件', text: '同时满足才会死锁：互斥（资源一次一人用）、持有并等待（拿着 A 等 B）、不可剥夺（不能硬抢）、循环等待（A 等 B、B 等 A 绕成圈）。四个缺一不可——所以防死锁就是破坏其中任意一个。' },
        { title: '经典现场：交叉持锁', text: '转账场景：线程 1 转 A→B，先锁 accountA 再要 accountB；线程 2 转 B→A，先锁 accountB 再要 accountA。两笔各自拿到第一把锁——此刻还没死，只是危险。' },
        { title: '互等成环，死锁成立', text: '线程 1 等 B（线程 2 攥着），线程 2 等 A（线程 1 攥着）——两条等待线交叉绕成一个圈。谁都不放手、谁也拿不到，这两个线程就永远停在 BLOCKED。' },
        { title: '排查：三板斧', text: 'jstack 线程转储的末尾直接给出 "Found one Java-level deadlock" 和成环的线程与锁；jconsole 面板能现场检测；Arthas 用 thread -b 找出阻塞别人的源头线程。' },
        { title: '避免：破坏一个条件', text: '最常用：全项目统一加锁顺序（比如都按账户 ID 排序再加锁），破坏循环等待；其次 tryLock 带超时，拿不到就放手并回滚，破坏不可剥夺；一次性申请所有资源，破坏持有并等待。' },
        { title: '数据库也有死锁', text: '两个事务按相反顺序更新两行，行锁照样成环。InnoDB 用等待图自动检测，回滚 undo 量小（容易回滚）的事务，业务层捕获死锁异常重试即可——思路和 Java 一脉相承：检测 + 挑一个牺牲者。' },
      ],
      figure: { vb: '0 0 760 560', draw: n => layers(n, L, '0 0 760 560') },
      followups: [
        ['哪个条件最容易破坏？', '循环等待：给资源定全局顺序、所有人按同一顺序加锁，环就绕不起来——改造成本最低，最常用。'],
        ['jstack 具体怎么用？', 'jps 找到 pid，jstack pid 导出转储；直接搜 deadlock 关键字，末尾会列出成环的线程和锁地址。'],
        ['tryLock 怎么破坏死锁？', 'tryLock(time, unit) 拿不到第二把就超时返回 false，释放手里那把再重试——等待有上限，环锁不住。'],
        ['死锁和活锁的区别？', '死锁：大家都卡死不动；活锁：都在动但谁也推进不了（比如互相让路再互相抢）——一个不动，一个白动。'],
      ],
      points: '四条件缺一不可 → 防死锁 = 破坏其一，最实用是全项目统一加锁顺序。\n排查三板斧：jstack（直接标出死锁环）、jconsole、Arthas thread -b。\n数据库同款：InnoDB 等待图检测 + 回滚小事务，业务捕获异常重试即可。',
    };
  }

  /* ============ 5. CAS 是什么？ABA 问题怎么解决？ ============ */
  function qCas() {
    const L = [
      () => box(50, 32, 160, 48, 'E：期望旧值') +
        box(260, 32, 160, 48, 'V：内存当前值', { stroke: C.accent, color: C.accent }) +
        box(530, 32, 180, 48, 'N：新值') +
        arrow(212, 50, 258, 50, { color: C.blue, label: '比对' }) +
        arrow(528, 62, 422, 62, { color: C.moss, label: '相等才写入' }) +
        txt(380, 108, 'V==E 才把 N 写进去；整步由 CPU 原子指令（x86 的 lock cmpxchg）一步完成，全程不加锁', { anchor: 'middle', fs: 12 }),
      () => box(60, 136, 300, 44, 'AtomicInteger.getAndIncrement()', { mono: true, fs: 12 }) +
        box(420, 136, 240, 44, 'CAS 失败 → 自旋重试', { fs: 12.5 }) +
        arrow(362, 158, 418, 158, { color: C.muted }) +
        txt(380, 208, 'Atomic 家族全是这套模板：读旧值 → 算新值 → CAS 提交，失败就循环重来', { anchor: 'middle', fs: 12 }),
      () => txt(380, 240, '代价：竞争激烈时一直失败一直转——自旋空转烧 CPU', { anchor: 'middle', fs: 12, fw: 600, color: C.clay }) +
        box(80, 256, 280, 44, 'LongAdder：分段累加分散热点', { fs: 12.5, stroke: C.moss, color: C.moss }) +
        box(400, 256, 280, 44, '写打散到 Cell[]，sum 时合并', { fs: 12, stroke: C.moss, color: C.moss }) +
        txt(380, 322, 'LongAdder 思想：热点拆小——后面 ConcurrentHashMap 的计数也是同款', { anchor: 'middle', fs: 12 }),
      () => box(50, 356, 180, 44, '线程 1 读到 A', { fs: 12.5 }) +
        box(280, 356, 200, 44, '线程 2：A → B → A', { fs: 12.5, stroke: C.clay, color: C.clay }) +
        box(530, 356, 190, 44, '线程 1 CAS：还是 A ✓', { fs: 12, stroke: C.clay, color: C.clay }) +
        txt(380, 428, 'CAS 只对比「当前值」：中间被改过又改回来，它一无所知——无锁栈里节点回收复用就出事', { anchor: 'middle', fs: 12.5, fw: 600, color: C.accent }),
      () => box(60, 452, 310, 44, 'AtomicStampedReference：值 + stamp', { mono: true, fs: 12 }) +
        box(410, 452, 290, 44, '每改一次 stamp+1，值和版本一起比', { fs: 12 }) +
        txt(380, 522, '数据库乐观锁的 version 字段同一个思想：update … set v=v+1 where v=旧版本', { anchor: 'middle', fs: 12 }),
      () => chip(50, 548, 'Atomic 原子类', C.moss) +
        chip(218, 548, 'AQS 的 state', C.blue) +
        chip(398, 548, 'CHM：casTabAt + sizeCtl', C.teal) +
        txt(380, 596, '一句话：CAS 是乐观并发——先试再改，失败重来；synchronized 是悲观并发——先挡住再操作', { anchor: 'middle', fs: 12.5, fw: 600 }),
    ];
    return {
      id: 'cas', cat: 'Java 并发', level: '进阶', hot: true,
      q: 'CAS 是什么？ABA 问题怎么解决？',
      answer: 'CAS：比较内存值 V 和期望值 E，相等才写入新值 N——由 CPU 原子指令保证，不加锁。Atomic 家族就是自旋 CAS，失败重试；竞争激烈空转烧 CPU，LongAdder 分段累加解决。ABA：值从 A 改回 A，CAS 看不出中间动过——解法=版本号：AtomicStampedReference / DB version。',
      steps: [
        { title: 'CAS 语义：V/E/N', text: '三个操作数：V 内存里的当前值、E 我期望的旧值、N 要写入的新值。V==E 说明没人动过，才把 N 写进去；整个动作由 CPU 原子指令（x86 的 lock cmpxchg）一步完成——不加锁的原子性。' },
        { title: 'Java 里的落点：自旋', text: 'AtomicInteger.getAndIncrement 就是自旋 CAS：读旧值 → 算新值 → CAS 提交，失败说明被人抢先，循环重来直到成功。整个 Atomic 家族都是这一套模板。' },
        { title: '代价：自旋烧 CPU', text: '竞争激烈时大家轮流失败、轮流重试，自旋空转白烧 CPU——一直失败一直转。LongAdder 的思路是分段：把一个计数拆成 base + Cell[] 多段，写打散、读汇总，热点不再互相顶。' },
        { title: 'ABA：值回来了，历史没了', text: '线程 1 读到 A，线程 2 把值改成 B 又改回 A，线程 1 的 CAS 一比：还是 A，通过——它看不出中间被动过。危险场景：无锁栈里节点被回收又复用，指针看着没变，链其实已经变了。' },
        { title: '解法：加版本号', text: 'AtomicStampedReference 在值之外带一个 stamp（版本戳），每改一次 stamp+1，比较时「值 + 版本」一起看——A→B→A 版本号已经变了，CAS 拒绝通过。数据库乐观锁的 version 字段是同一个思想。' },
        { title: '应用全景', text: 'Atomic 原子类、AQS 里 state 的更新（锁状态切换靠它）、ConcurrentHashMap 空桶插入的 casTabAt 和协助扩容的 sizeCtl——底层全是 CAS。选型口诀：冲突少用 CAS，冲突多不如阻塞。' },
      ],
      figure: { vb: '0 0 760 620', draw: n => layers(n, L, '0 0 760 620') },
      followups: [
        ['CAS 和锁怎么选？', '冲突少、临界区短用 CAS，没有挂起开销；冲突多时自旋空转不如阻塞让出 CPU——压测说话，别拍脑袋。'],
        ['LongAdder 为什么快？', '把计数拆成 base + Cell[]，线程打不同段，写不互顶；sum() 合并——空间换时间。'],
        ['乐观锁悲观锁对应什么？', '乐观 = 先试再改（CAS、DB version）；悲观 = 先锁再操作（synchronized）。'],
        ['CAS 只能保证单个变量？', '对。两个变量一起改它管不了：要么合成一个对象用 AtomicReference，要么老老实实上锁。'],
      ],
      points: 'CAS = CPU 原子指令 + 自旋重试：V==E 才写 N。\nABA 的本质是「只看值不看历史」，解法 = 版本号（AtomicStampedReference / DB version）。\n竞争激烈自旋不如阻塞——这是选型判断题，答出判断依据才加分。',
    };
  }

  /* ============ 6. ConcurrentHashMap 怎么保证线程安全？1.7 和 1.8 有什么不同？ ============ */
  function qChm() {
    const seg = k => `<rect x="${42 + k * 160}" y="38" width="160" height="44" rx="9" fill="none" stroke="${k === 0 ? C.blue : C.lineS}" stroke-width="${k === 0 ? 1.6 : 1.2}"/>`;
    const cell = i => `<rect x="${46 + i * 40}" y="42" width="36" height="32" rx="6" fill="${C.surface}" stroke="${C.lineS}" stroke-width="1"/>`;
    const bucket = i => `<rect x="${60 + i * 64}" y="142" width="58" height="40" rx="9" fill="${C.surface}" stroke="${C.lineS}" stroke-width="1.2"/>`;
    const L = [
      () => txt(380, 26, 'JDK 1.7：Segment 分段锁（Segment 继承 ReentrantLock）', { anchor: 'middle', fs: 13, fw: 700, color: C.blue }) +
        [0, 1, 2, 3].map(seg).join('') +
        Array.from({ length: 16 }, (_, i) => cell(i)).join('') +
        txt(380, 100, '默认 16 段（一框 = 一个 Segment）：并发度 = 段数——段间并行写，段内互斥', { anchor: 'middle', fs: 12 }),
      () => txt(380, 130, 'JDK 1.8：抛弃分段，回到数组 + 链表 + 红黑树', { anchor: 'middle', fs: 13, fw: 700, color: C.accent }) +
        [0, 1, 2, 4, 5, 6, 7, 8, 9].map(bucket).join('') +
        box(252, 142, 58, 40, '锁', { stroke: C.accent, fill: C.accent, color: '#f2efe8', fs: 12 }) +
        box(200, 196, 170, 36, 'synchronized 锁桶头', { stroke: C.accent, color: C.accent, fs: 11.5 }) +
        box(560, 196, 170, 36, 'CAS 写空桶', { stroke: C.moss, color: C.moss, fs: 11.5 }) +
        arrow(285, 196, 285, 182, { color: C.accent }) +
        arrow(610, 196, 610, 182, { color: C.moss }) +
        txt(380, 262, '锁粒度从「段」细化到「单桶」：并发度≈桶数——空桶 CAS 插入，非空桶 synchronized 锁桶头节点', { anchor: 'middle', fs: 12 }),
      () => box(60, 290, 240, 44, 'Node 的 val / next：volatile', { mono: true, fs: 12 }) +
        txt(330, 304, 'get 全程不加锁：写完立即可见，读靠 volatile 的可见性保证', { fs: 12 }) +
        txt(330, 328, '扩容迁移中的桶挂 ForwardingNode：读请求转发到新表，迁移期间读也不丢', { fs: 12, color: C.faint }),
      () => box(80, 364, 250, 44, 'size = baseCount + CounterCell[]', { mono: true, fs: 12 }) +
        box(380, 364, 240, 44, 'LongAdder 思想分散计数', { fs: 12.5, stroke: C.moss, color: C.moss }) +
        txt(380, 436, '写入时 CAS 打到不同 Cell，sum 时再合并——计数不成为写热点；读到的 size 是当下估值', { anchor: 'middle', fs: 12 }),
      () => box(40, 462, 260, 44, 'key 和 value 都不允许 null', { fs: 12.5, stroke: C.clay, color: C.clay }) +
        txt(320, 478, 'get 返回 null：是「不存在」还是「值就是 null」？分不清——干脆禁止', { fs: 12 }) +
        txt(320, 502, 'HashMap 能 containsKey 二次确认；CHM 两次调用之间状态可能已变', { fs: 12, fw: 600 }),
    ];
    return {
      id: 'chm', cat: 'Java 并发', level: '进阶', hot: true,
      q: 'ConcurrentHashMap 怎么保证线程安全？1.7 和 1.8 有什么不同？',
      answer: '1.7 分段锁 Segment，默认 16 段，并发度=段数；1.8：数组+链表+红黑树，空桶 CAS，非空桶 synchronized 锁桶头。get 无锁，靠 volatile 可见。size = baseCount + CounterCell[] 计数。key/value 不许 null：分不清「不存在」还是「值就是 null」。',
      steps: [
        { title: '1.7 分段锁', text: '把整表切成默认 16 段，每段一个 Segment（继承 ReentrantLock）：不同段可以并行写，段内互斥。并发度 = 段数，写死上限 16——粒度太粗，段内竞争依然激烈。' },
        { title: '1.8：CAS + 桶级锁', text: '重构回数组 + 链表 + 红黑树：桶是空的用 CAS 插入（casTabAt），非空桶用 synchronized 锁住桶头节点。锁粒度从「段」细化到「单桶」，并发度≈桶数——synchronized 优化后够用还省内存。' },
        { title: 'get 为什么不加锁', text: 'Node 的 val 和 next 都用 volatile 修饰：写完立即可见，读靠内存可见性保证，全程无锁。扩容迁移中的桶会挂 ForwardingNode，把读请求转发到新表——迁移期间读也不丢数据。' },
        { title: 'size 怎么算', text: 'baseCount + CounterCell[]：写入时 CAS 打到不同的 Cell 上，求和时 base 加所有 Cell——LongAdder 思想，计数不成为写热点。拿到的 size 是调用那一刻的估值，并发中随时会变。' },
        { title: '为什么不许 null', text: 'key 和 value 都不允许 null：并发下 get 返回 null，分不清是「key 不存在」还是「值就是 null」；HashMap 可以 containsKey 二次确认，但 CHM 两次调用之间状态可能已经变了——答理由，别背结论。' },
      ],
      figure: { vb: '0 0 760 525', draw: n => layers(n, L, '0 0 760 525') },
      followups: [
        ['1.8 还会扩容吗？', '会。多线程协助迁移：认领桶区间搬数据，CAS 改 sizeCtl 记账，搬完放 ForwardingNode。'],
        ['复合操作原子吗？', '不保证。get 后再 put 会被插队；putIfAbsent、computeIfAbsent 才是原子复合操作。'],
        ['为什么不用 ReentrantLock？', '粒度细到桶级后竞争小，synchronized 优化后不差还省内存（锁信息在对象头里）；锁升级按需膨胀，够用。'],
        ['红黑树什么时候登场？', '单桶链表长度到 8 且表容量 ≥ 64 才树化，退化回链表的阈值是 6——太短不值得，太长查询退化成 O(n)。'],
      ],
      points: '一句话：1.7 分段锁 16 段；1.8 桶级 CAS + synchronized，get 无锁靠 volatile。\nsize = baseCount + CounterCell[]（LongAdder 思想），读出来是估值不是精确账本。\nnull 之辩论理由：并发下 get 返回 null 有歧义，两次调用之间状态会变。',
    };
  }

  /* 6 题；由门户或测试拼进完整题库（QA_PART_5） */
  w.QA_PART_5 = [qSync(), qStates(), qTl(), qDl(), qCas(), qChm()];
})(typeof window !== 'undefined' ? window : globalThis);
