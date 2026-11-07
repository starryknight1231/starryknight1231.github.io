/* ============ QA Part 7 · Java 基础三题 + Java 并发两题 ============
   equals/hashCode / 异常体系 / 泛型擦除 / AQS / CountDownLatch·CyclicBarrier·Semaphore。
   纯数据 + SVG 字符串，不碰 DOM；画图助手复用 qa-deck.js 暴露的 w.__qaHelpers。
   每题 figure.draw(n)：第 0..n 层显影（opacity 1），之后降 0.15；图层数与 steps 一一对应。 */
(function (w) {
  'use strict';
  const { C, SANS, MONO, box, txt, arrow, chip, layers } = w.__qaHelpers;

  /* ============ 1. == 与 equals 的区别？为什么重写 equals 必须重写 hashCode？ ============ */
  function qEqHc() {
    const L = [
      () => box(60, 32, 280, 46, '基本类型：比值（a == 10）', { fs: 12.5 }) +
        box(420, 32, 280, 46, '引用类型：比地址（同一个？）', { fs: 12.5 }) +
        txt(380, 104, '== 是最底层的比较；引用比的是「内存里是不是同一个对象」', { anchor: 'middle', fs: 12 }),
      () => box(50, 130, 320, 44, 'Object.equals：默认就是 ==', { mono: true, fs: 12 }) +
        box(410, 130, 300, 44, 'String 等重写：比内容', { mono: true, fs: 12 }) +
        txt(380, 200, '没重写 equals 的类，== 和 equals 结果永远相同——这是追问的高频点', { anchor: 'middle', fs: 12 }),
      () => txt(380, 228, 'hashCode 契约：equals 相等 ⇒ hashCode 必须相等；反之不成立', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(110, 244, 200, 42, 'equals = true', { mono: true, fs: 12, stroke: C.moss, color: C.moss }) +
        arrow(314, 265, 380, 265, { color: C.accent, label: '⇒ 必须' }) +
        box(384, 244, 210, 42, 'hashCode 相等', { mono: true, fs: 12, stroke: C.moss, color: C.moss }),
      () => txt(380, 312, '反例推演：只重写 equals —— put 成功，get 却失败', { anchor: 'middle', fs: 12.5, fw: 600, color: C.accent }) +
        box(70, 328, 300, 44, 'put(a)：hash 103 → 桶 3', { mono: true, fs: 12 }) +
        box(420, 328, 280, 44, 'get(b)：hash 297 → 桶 9', { mono: true, fs: 12, stroke: C.clay, color: C.clay }) +
        txt(380, 400, 'a 与 b equals 相等、hashCode 不同 → b 被引到别的桶，a 永远取不回', { anchor: 'middle', fs: 12 }),
      () => txt(380, 428, '重写 equals 也要守约（Java 规范白纸黑字）', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        chip(70, 444, '自反', C.blue) + chip(150, 444, '对称', C.teal) + chip(230, 444, '传递', C.brass) + chip(310, 444, '一致', C.mauve) + chip(390, 444, '对 null 为 false', C.clay) +
        txt(380, 496, '自己比自己是真 · 互相比结果一致 · 传递成链 · 多次比结果不变', { anchor: 'middle', fs: 12 }),
      () => txt(380, 524, '实践铁律：equals 和 hashCode 成对重写，且基于同一批字段', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(110, 540, 260, 42, 'IDE 生成：一键成对', { fs: 12, stroke: C.moss, color: C.moss }) +
        box(410, 540, 260, 42, 'Objects.hash(name, age)', { mono: true, fs: 11.5, stroke: C.moss, color: C.moss }) +
        txt(380, 610, '答题线：== 比值/地址 → equals 比内容 → 等值必同 hash → HashMap 反例收尾', { anchor: 'middle', fs: 12, color: C.faint }),
    ];
    return {
      id: 'equals-hashcode', cat: 'Java 基础', level: '入门', hot: true,
      q: '== 与 equals 的区别？为什么重写 equals 必须重写 hashCode？',
      answer: '== 对基本类型比值，对引用类型比地址（同一个对象吗）。equals 不重写就和 == 等价，String 等重写成比内容。契约：equals 相等 ⇒ hashCode 必须相等，反之不要求。只重写 equals 不重写 hashCode，两个「相等」的对象散进不同哈希桶——HashMap 里 put 进去，get 就取不回来。',
      steps: [
        { title: '== 比的是什么', text: '先分对象：基本类型（int、double 这类）比值本身；引用类型比地址——判断两个变量是不是内存里同一个对象。new 出来的两个对象哪怕内容一模一样，== 也是 false。' },
        { title: 'equals 默认就是 ==', text: 'equals 是 Object 的方法，默认实现就一句 return this == obj——不重写它和 == 没区别。String、Integer 这些类把它重写成比内容，所以两个内容相同的字符串 equals 为真、== 为假。' },
        { title: 'hashCode 是什么', text: 'hashCode 返回对象的一个整数「指纹」，HashMap 这类哈希容器拿它先定位桶。官方契约：equals 相等的两个对象，hashCode 必须相等；反过来不要求——hashCode 相等不代表相等，那叫哈希碰撞。' },
        { title: 'put 进去，get 不出来', text: '只重写 equals 不重写 hashCode：两个「相等」的对象指纹不同，被算进不同桶。put(a) 存进桶 3，再用内容相同的 b 去 get，定位到桶 9——那里什么都没有，返回 null。存进去的东西取不回来。' },
        { title: 'equals 也要守规矩', text: '重写 equals 要满足四条约定：自反（x.equals(x) 为真）、对称（A 比 B 与 B 比 A 结果一致）、传递（A=B 且 B=C 则 A=C）、一致（内容不变结果就不变）；另外 x.equals(null) 必须是 false。' },
        { title: '实践：成对重写', text: '铁律：重写 equals 必须同时重写 hashCode，且两者基于同一批字段。字段多就用 IDE 一键生成，或者一行 Objects.hash(name, age)；比较字段改了，hashCode 要同步跟着改。' },
      ],
      figure: { vb: '0 0 760 630', draw: n => layers(n, L, '0 0 760 630') },
      followups: [
        ['什么时候 == 和 equals 结果相同？', '类没重写 equals 时：默认实现就是 ==，比地址——不重写，两者永远等价。'],
        ['Integer 缓存 -128~127 是什么坑？', 'valueOf 缓存 -128~127：区间内 == 是 true，区间外 false——包装类型用 equals。'],
        ['hashCode 相等 equals 一定相等吗？', '不一定。不同对象可能落进同一个桶（哈希碰撞），所以桶内还要用 equals 做最终确认。'],
      ],
      points: '契约一句话：equals 相等 ⇒ hashCode 必须相等，反之不成立（允许哈希碰撞）。\nHashMap 反例要会现场推：只重写 equals，put 进去就 get 不出来。\nInteger 缓存 -128~127：区间内 == 为 true、区间外为 false——包装类型比较用 equals。',
    };
  }

  /* ============ 2. Java 异常体系？checked 和 unchecked 有什么区别？ ============ */
  function qException() {
    const L = [
      () => txt(380, 20, '异常家族树：只有 Throwable 和它的子类能被 throw 或 catch', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(280, 34, 200, 44, 'Throwable（根）', { mono: true, fs: 13, stroke: C.accent, color: C.accent }),
      () => arrow(340, 80, 250, 114, { color: C.muted }) +
        arrow(420, 80, 530, 114, { color: C.muted }) +
        box(120, 118, 220, 44, 'Error：JVM 级致命', { fs: 12.5, stroke: C.clay, color: C.clay }) +
        box(450, 118, 240, 44, 'Exception：程序可处理', { fs: 12.5, stroke: C.moss, color: C.moss }) +
        txt(120, 190, 'Error：OOM、StackOverflowError——别接', { fs: 11.5, color: C.clay }),
      () => arrow(520, 166, 460, 210, { color: C.muted }) +
        arrow(630, 166, 650, 210, { color: C.muted }) +
        box(330, 214, 230, 42, 'RuntimeException', { mono: true, fs: 11.5, stroke: C.clay, color: C.clay }) +
        box(580, 214, 160, 42, '其他 Exception', { fs: 11.5, stroke: C.brass, color: C.brass }) +
        txt(380, 288, 'unchecked（NPE · 越界 · 强转）编译器不管；checked（IO / SQL）必须 try-catch 或 throws', { anchor: 'middle', fs: 12 }),
      () => box(60, 326, 210, 42, 'finally：一定执行', { fs: 12.5, stroke: C.moss, color: C.moss }) +
        box(300, 326, 210, 42, '例外：System.exit', { mono: true, fs: 12, stroke: C.clay, color: C.clay }) +
        box(540, 326, 190, 42, 'try-with-resources', { mono: true, fs: 11.5, stroke: C.moss, color: C.moss }) +
        txt(380, 396, 'finally 负责释放资源；实现 AutoCloseable 的对象放进 try(…) 括号，异常也自动 close', { anchor: 'middle', fs: 12 }),
      () => txt(380, 424, '两条红线：别 catch(Exception) 一把梭吞异常；别拿异常当流程控制', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(110, 440, 250, 42, 'catch 具体类型 + 记日志', { fs: 11.5, stroke: C.moss, color: C.moss }) +
        box(400, 440, 250, 42, '可预判的用 if，别 throw 当 return', { fs: 11.5, stroke: C.clay, color: C.clay }) +
        txt(380, 510, '答题线：家族树 → checked / unchecked 分界 → finally 与 try-with-resources → 两条红线', { anchor: 'middle', fs: 12, color: C.faint }),
    ];
    return {
      id: 'exception', cat: 'Java 基础', level: '入门', hot: false,
      q: 'Java 异常体系？checked 和 unchecked 有什么区别？',
      answer: 'Throwable 是根：Error 是 JVM 级致命（OOM），别接；Exception 分 unchecked（RuntimeException 及子类，编译器不管）和 checked（其余，编译器管）。unchecked 是 bug 改代码，checked 是外部依赖失败该降级。finally 关资源，try-with-resources 优先。',
      steps: [
        { title: '家族树：Throwable', text: '能被 throw 和 catch 的只有 Throwable 家族。根下两支：Error 表示 JVM 级致命问题——OOM、StackOverflowError，接住也没法恢复，规范的态度就是别接；Exception 才是程序要处理的。' },
        { title: 'unchecked 的分界', text: 'Exception 里 RuntimeException 及子类（NPE、越界、强转失败）是 unchecked，编译器不管；其余 IOException、SQLException 是 checked——不 try-catch 也不 throws，编译不过。' },
        { title: '设计逻辑：为什么这样分', text: 'unchecked 多是编程 bug——空指针该改代码，接住它只会掩盖问题；checked 多是外部依赖的失败——文件不在、网络断了，你必须面对：重试、降级或提示用户。一个管代码质量，一个管环境风险。' },
        { title: 'finally 释放资源', text: 'finally 几乎一定执行（System.exit、JVM 崩溃除外），传统上用它关资源。Java 7 起优先 try-with-resources：把实现 AutoCloseable 的对象放进 try(…) 括号，正常结束或异常都自动 close。' },
        { title: '两条实践红线', text: '别 catch(Exception) 一把梭再什么都不做——异常被吞，线上只剩日志空白；别拿异常当流程控制——new 异常要抓调用栈，比普通 if 判断贵得多。能 if 预判就预判，要抛就抛具体类型。' },
      ],
      figure: { vb: '0 0 760 530', draw: n => layers(n, L, '0 0 760 530') },
      followups: [
        ['try-with-resources 好在哪？', '实现 AutoCloseable 的对象放进 try(…)：结束自动 close、异常也关，且保留被抑制的异常。'],
        ['throw 和 throws 区别？', 'throw 在方法体内真的抛一个异常对象；throws 在方法签名上声明「可能抛这些」，交给调用者处理。'],
        ['finally 一定执行吗？', '几乎一定：连 return 都拦不住。只有 System.exit()、JVM 崩溃这种「进程直接没了」才不执行。'],
      ],
      points: '家族树两句：Error 别接；Exception 分 checked（编译器管）和 unchecked（自己管）。\n释放资源优先 try-with-resources（AutoCloseable 自动关）；finally 兜底，System.exit 除外。\n别 catch(Exception) 一把梭、别拿异常当流程控制——new 异常要抓栈，贵。',
    };
  }

  /* ============ 3. 什么是泛型擦除？带来哪些限制？ ============ */
  function qErase() {
    const L = [
      () => box(80, 30, 210, 44, 'List<String>', { mono: true, fs: 13, stroke: C.blue, color: C.blue }) +
        box(470, 30, 210, 44, 'List<Integer>', { mono: true, fs: 13, stroke: C.teal, color: C.teal }) +
        txt(380, 100, '编译期：类型检查 + 取值免强转——泛型的全部好处都发生在编译这一步', { anchor: 'middle', fs: 12 }),
      () => arrow(185, 78, 320, 122, { color: C.accent }) +
        arrow(575, 78, 440, 122, { color: C.accent }) +
        box(230, 126, 300, 44, '运行时：同一个 List.class', { mono: true, fs: 12.5, stroke: C.accent, color: C.accent }) +
        txt(380, 196, '泛型实参被抹掉，字节码只剩原始类型；桥方法（bridge method）是编译器补的兼容补丁', { anchor: 'middle', fs: 12 }),
      () => txt(380, 222, '为什么擦除：泛型 JDK 5 才有——新旧字节码要能无缝互操作（向后兼容）', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(120, 238, 220, 42, 'JDK 5 前的老代码', { fs: 12, stroke: C.faint, color: C.faint }) +
        arrow(344, 259, 396, 259, { color: C.moss, label: '可混用' }) +
        box(400, 238, 220, 42, 'JDK 5 后的泛型代码', { fs: 12, stroke: C.moss, color: C.moss }),
      () => txt(380, 308, '限制一：运行时没有 T 的真实类型——T.class、new T() 都编不过', { anchor: 'middle', fs: 12.5, fw: 600, color: C.clay }) +
        box(120, 324, 260, 42, '解法：方法传 Class<T> 参数', { mono: true, fs: 12, stroke: C.moss, color: C.moss }) +
        txt(400, 350, '拿到 Class 就能建对象、做校验——框架反序列化同思路', { fs: 11.5 }),
      () => txt(380, 392, '限制二连发：new T[] ✗ · 静态成员用 T ✗ · List<int> ✗', { anchor: 'middle', fs: 12.5, fw: 600, color: C.clay }) +
        box(110, 408, 170, 40, 'new T[10] ✗', { mono: true, fs: 12, stroke: C.clay, color: C.clay }) +
        box(300, 408, 170, 40, 'static T field ✗', { mono: true, fs: 12, stroke: C.clay, color: C.clay }) +
        box(490, 408, 170, 40, 'List<int> ✗', { mono: true, fs: 12, stroke: C.clay, color: C.clay }) +
        txt(380, 474, '静态属于类不属于实例，天生没有 T；擦除后 T 变成 Object，int 装不进引用容器——用包装类', { anchor: 'middle', fs: 11.5 }),
      () => txt(380, 500, '通配符一句带过（PECS）：生产者 extends、消费者 super', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(90, 516, 290, 42, '? extends Fruit：只取不存（生产者）', { fs: 11.5, stroke: C.blue, color: C.blue }) +
        box(420, 516, 290, 42, '? super Apple：只存不取（消费者）', { fs: 11.5, stroke: C.teal, color: C.teal }) +
        txt(380, 586, '答题线：编译期检查 · 运行时擦除 · 擦除为兼容 · 三条限制 · PECS 收尾', { anchor: 'middle', fs: 12, color: C.faint }),
    ];
    return {
      id: 'generic-erasure', cat: 'Java 基础', level: '进阶', hot: false,
      q: '什么是泛型擦除？带来哪些限制？',
      answer: 'Java 泛型是编译期检查、运行时擦除：List<String> 和 List<Integer> 编译后是同一个 List.class，泛型实参基本被抹掉（桥方法是兼容补丁）。为的是兼容 JDK 5 之前的老字节码。代价：运行时拿不到 T——T.class、new T() 不行，也不能 new T[]，静态成员不能用 T，基本类型得换包装类。',
      steps: [
        { title: '泛型的表面：编译期好戏', text: 'List<String> 里塞不进 Integer，编译器直接报错；取出来就是 String，不用强转。泛型的全部好处——类型安全 + 免强转——都发生在编译期。记住这句，擦除就好理解了。' },
        { title: '擦除的真相', text: '编译之后泛型信息基本被抹掉：List<String> 和 List<Integer> 在运行时是同一个 List.class，字节码里只剩原始类型。「泛型只存在于编译期」——运行时没法问这个 List 装的到底是不是 String。' },
        { title: '为什么选择擦除', text: '不是做不了，是为了兼容：泛型是 JDK 5（2004）才加入的，擦除让新代码编译出的字节码和旧的非泛型字节码长得一样，能无缝混用——迁移期不用全量重编译。' },
        { title: '限制一：运行时没有 T', text: 'T 只存在于编译期，运行时 JVM 不知道 T 是谁——所以 T.class、new T() 都编不过。通用解法：把类型当参数传进来，方法签名带 Class<T>，拿它建对象、做校验；框架反序列化走的是同一思路。' },
        { title: '限制二：三连禁', text: '不能 new T[]（数组要记元素类型，运行时不知道 T 是谁）；泛型类里静态成员不能用 T（静态属于类，不属于某个实例的 T）；List<int> 不行——擦除后 T 是 Object，int 这种原始值装不进引用容器，用包装类。' },
        { title: '通配符：PECS 一句话', text: '? extends X 表示「X 或它的子类，具体未知」——只能读不能写；? super X 表示「X 或它的父类」——只能写，读出来是 Object。口诀 PECS：生产者（往外供数）用 extends，消费者（往里塞数）用 super。' },
      ],
      figure: { vb: '0 0 760 606', draw: n => layers(n, L, '0 0 760 606') },
      followups: [
        ['运行时怎么拿到泛型类型？', '反射抓「声明处」的泛型实参（getGenericSuperclass）；或方法直接传 Class<T>。'],
        ['List<?> 和 List<Object> 区别？', 'List<?> 未知类型、只读；List<Object> 能存能取——List<String> 却不是它的子类。'],
        ['PECS 具体怎么用？', '参数只往外供数用 ? extends T，只往里塞数用 ? super T；又读又写就别用通配符。'],
      ],
      points: '一句话：泛型是编译期检查、运行时擦除——List<String> 和 List<Integer> 是同一个 class。\n三限制：运行时无 T（传 Class<T> 绕开）、不能 new T[]、静态不能用 T；基本类型用包装类。\n擦除的理由是向后兼容（JDK 5 互操作）——主动答出这条有深度；通配符记 PECS。',
    };
  }

  /* ============ 4. AQS 是什么？它是怎么工作的？ ============ */
  function qAqs() {
    const L = [
      () => box(40, 30, 210, 44, 'ReentrantLock', { mono: true, fs: 12.5, stroke: C.blue, color: C.blue }) +
        box(290, 30, 180, 44, 'Semaphore', { mono: true, fs: 12.5, stroke: C.teal, color: C.teal }) +
        box(510, 30, 210, 44, 'CountDownLatch', { mono: true, fs: 12.5, stroke: C.brass, color: C.brass }) +
        txt(380, 96, 'JUC 三大同步工具（锁 / 信号量 / 门闩）的地基都是 AQS（AbstractQueuedSynchronizer）', { anchor: 'middle', fs: 12 }),
      () => arrow(380, 104, 380, 120, { color: C.accent, sw: 2.2 }) +
        box(110, 126, 540, 48, 'AQS：volatile int state + CLH 变体等待队列', { mono: true, fs: 13, stroke: C.accent, color: C.accent }) +
        txt(380, 200, 'state 的语义子类说了算：ReentrantLock 里是重入次数，Semaphore 里是剩余许可——全靠 CAS 修改', { anchor: 'middle', fs: 12 }),
      () => txt(380, 226, '抢锁失败的线程包装成 Node 进双向队列排队；头节点 release 时唤醒后继', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(80, 242, 110, 40, 'head', { mono: true, fs: 11.5, stroke: C.faint, color: C.faint }) +
        box(260, 242, 110, 40, 'Node A', { mono: true, fs: 11.5 }) +
        box(440, 242, 110, 40, 'Node B', { mono: true, fs: 11.5 }) +
        arrow(194, 262, 256, 262, { color: C.moss, label: 'next', mono: true }) +
        arrow(436, 262, 374, 262, { color: C.brass, label: 'prev', mono: true }) +
        txt(380, 306, 'Node 记着前后指针和等待状态；线程 park 挂起，轮到了才唤醒', { anchor: 'middle', fs: 12 }),
      () => txt(380, 332, '两种模式：独占一次放一个，共享一次放一批', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(70, 348, 300, 42, '独占：ReentrantLock（一次一个）', { fs: 12, stroke: C.blue, color: C.blue }) +
        box(410, 348, 290, 42, '共享：Semaphore / latch（一批）', { fs: 12, stroke: C.teal, color: C.teal }) +
        txt(380, 416, '独占实现 tryAcquire / tryRelease；共享实现 tryAcquireShared / tryReleaseShared', { anchor: 'middle', fs: 11.5 }),
      () => txt(380, 442, '模板方法模式：排队、阻塞（park）、唤醒这些难活 AQS 全包了', { anchor: 'middle', fs: 12.5, fw: 600 }) +
        box(90, 458, 280, 42, '子类只写：state 怎么算拿到/释放', { fs: 11.5, stroke: C.moss, color: C.moss }) +
        box(410, 458, 260, 42, 'AQS 全包：入队 · park · 唤醒', { fs: 11.5, stroke: C.accent, color: C.accent }) +
        txt(380, 528, '这就是它撑起半个 JUC 的原因——说出「模板方法模式」是加分词', { anchor: 'middle', fs: 12, color: C.faint }),
    ];
    return {
      id: 'aqs', cat: 'Java 并发', level: '进阶', hot: true,
      q: 'AQS 是什么？它是怎么工作的？',
      answer: 'AQS 是 JUC 锁体系的底座：ReentrantLock、Semaphore、CountDownLatch 全建在它上面。核心三件套：volatile int state 用 CAS 改，语义子类定义；CLH 变体的双向等待队列，抢锁失败入队、释放唤醒后继；独占 / 共享两种模式。它是模板方法：排队阻塞唤醒全包，子类只定义 state 怎么算拿到。',
      steps: [
        { title: '定位：JUC 的地基', text: 'AQS 全称 AbstractQueuedSynchronizer（抽象队列同步器）。ReentrantLock、Semaphore、CountDownLatch、线程池里的同步控制，底层都是它——学会 AQS，半个 JUC 的源码都能看懂。' },
        { title: '核心一：volatile', text: 'AQS 内部就一个 volatile int state，用 CAS（比较并交换的原子操作）修改。state 的含义由子类定义：ReentrantLock 里是重入次数，Semaphore 里是剩余许可数，CountDownLatch 里是还剩的计数。' },
        { title: '核心二：等待队列', text: '抢锁失败的线程被包装成 Node，挂进一条 CLH 变体的双向队列排队，线程 park（挂起，让出 CPU）等通知；持锁线程 release 时，由队头唤醒后继节点——排队、叫号，全在这条队列里。' },
        { title: '独占与共享两种模式', text: '独占模式一次只放一个线程：ReentrantLock，实现 tryAcquire / tryRelease。共享模式一次放一批：Semaphore、CountDownLatch，实现 tryAcquireShared / tryReleaseShared。' },
        { title: '模板方法：撑起半个 JUC', text: '排队、阻塞、唤醒、CAS 重试这些最难最容易错的部分，AQS 全部写好；子类只需重写「state 怎么算拿到、怎么算释放」几个钩子方法。这是典型的模板方法模式——钩子极简，所以 JUC 工具层出不穷。' },
      ],
      figure: { vb: '0 0 760 548', draw: n => layers(n, L, '0 0 760 548') },
      followups: [
        ['ReentrantLock 怎么基于 AQS？', 'state 就是重入次数：CAS 0→1 拿锁，重入 +1，解锁减到 0 才释放；再记 owner 判断是不是自己。'],
        ['公平锁和非公平锁差在哪？', '非公平上来先 CAS 抢一次，失败才入队——插队但吞吐高；公平锁先看队列里有没有人在等。默认非公平。'],
        ['Condition 是什么？', 'await() 释放锁进条件队列，signal() 把节点转回同步队列抢锁——wait/notify 的 Lock 版。'],
      ],
      points: '公式：AQS = volatile state（CAS 改）+ Node 双向等待队列 + 独占 / 共享两模式。\n子类只做一件事：定义 state 语义（重入次数 / 剩余许可 / 倒计时）。\n说「模板方法模式」和「CLH 变体队列」是加分词；独占 tryAcquire，共享 tryAcquireShared。',
    };
  }

  /* ============ 5. CountDownLatch、CyclicBarrier、Semaphore 各用在什么场景？ ============ */
  function qHelpers() {
    const L = [
      () => txt(380, 28, 'CountDownLatch：倒计时门闩 ——「一等多」', { anchor: 'middle', fs: 12.5, fw: 600, color: C.blue }) +
        box(70, 44, 210, 40, '主线程 await() 等归零', { fs: 11.5, stroke: C.blue, color: C.blue }) +
        arrow(284, 64, 336, 64, { color: C.blue, label: '等归零' }) +
        box(340, 44, 210, 40, '子任务 countDown() 减一', { fs: 11.5 }) +
        txt(380, 112, '计数到 0 才放行；不能重置——一次性工具', { anchor: 'middle', fs: 12 }),
      () => txt(380, 140, 'CyclicBarrier：循环栅栏 ——「多等人」', { anchor: 'middle', fs: 12.5, fw: 600, color: C.teal }) +
        box(70, 156, 210, 40, 'N 个线程互相等', { fs: 11.5, stroke: C.teal, color: C.teal }) +
        arrow(284, 176, 336, 176, { color: C.teal, label: '人齐' }) +
        box(340, 156, 210, 40, '一起放行 · 可复用', { fs: 11.5, stroke: C.teal, color: C.teal }) +
        txt(380, 224, '对比：latch 是主线程等任务（一等多），barrier 是同伴互等（多等人）', { anchor: 'middle', fs: 12 }),
      () => txt(380, 252, 'Semaphore：信号量 —— 管并发名额', { anchor: 'middle', fs: 12.5, fw: 600, color: C.brass }) +
        box(70, 268, 200, 40, 'acquire()：拿一个', { mono: true, fs: 11.5, stroke: C.brass, color: C.brass }) +
        arrow(274, 288, 330, 288, { color: C.brass }) +
        box(334, 268, 92, 40, '许可 ×N', { fs: 11.5, stroke: C.brass, color: C.brass }) +
        arrow(486, 288, 430, 288, { color: C.moss }) +
        box(490, 268, 200, 40, 'release()：还一个', { mono: true, fs: 11.5, stroke: C.moss, color: C.moss }) +
        txt(380, 336, '数据库连接池、接口并发上限——拿不到许可就排队或拒绝', { anchor: 'middle', fs: 12 }),
      () => txt(380, 364, '选型口诀：等任务完成用 latch · 等人齐开会用 barrier · 限并发数量用 semaphore', { anchor: 'middle', fs: 12.5, fw: 600, color: C.accent }) +
        chip(80, 380, 'latch：一等多', C.blue) + chip(240, 380, 'barrier：多等人', C.teal) + chip(420, 380, 'semaphore：管名额', C.brass),
      () => txt(380, 430, '两个坑：latch 计数差一永远不归零；barrier 参与线程数配错就死等', { anchor: 'middle', fs: 12.5, fw: 600, color: C.clay }) +
        box(100, 446, 280, 42, '都配超时：await(3, TimeUnit)', { mono: true, fs: 11.5, stroke: C.moss, color: C.moss }) +
        box(410, 446, 250, 42, '拿不到就 tryAcquire / 快速失败', { fs: 11.5, stroke: C.moss, color: C.moss }) +
        txt(380, 516, '答题线：一句话分清三者 → 各配一个场景 → 主动补「我会配超时防死等」', { anchor: 'middle', fs: 12, color: C.faint }),
    ];
    return {
      id: 'juc-helpers', cat: 'Java 并发', level: '进阶', hot: true,
      q: 'CountDownLatch、CyclicBarrier、Semaphore 各用在什么场景？',
      answer: 'latch 倒计时门闩：countDown 减一，await 等归零——主线程等子任务，一次性。barrier 栅栏：人齐放行，可复用——latch 一等多，barrier 多等人。Semaphore：N 个许可 acquire 拿 release 还，管限流。口诀：等任务 latch，等人齐 barrier，限数量 semaphore，都配超时防死等。',
      steps: [
        { title: 'latch：倒计时门闩', text: '构造时给个计数 N，子任务每完成一个调 countDown() 减一，主线程 await() 卡住等计数归零——「等 N 件事都做完」。计数只能减不能加，到 0 不能重置，一次性工具。' },
        { title: 'barrier：循环栅栏', text: 'N 个线程各自干到某个点后 await() 互相等，最后一个到齐的触发栅栏打开，所有人一起继续——「人齐了再开会」。Cyclic 是循环的意思：栅栏复位可重复用，还能挂一个栅栏动作（barrierAction）。' },
        { title: '一等多 vs 多等人', text: '两者最容易混：latch 是「一等多」——等待者等的是任务完成，计数说了算；barrier 是「多等人」——参与者彼此互等，人数说了算。场景对比：主线程汇总结果用 latch，分片计算汇合用 barrier。' },
        { title: 'semaphore：管名额', text: '维护 N 个许可：acquire() 拿一个（没了就排队或失败），release() 用完归还——可回收的并发计数器。典型用途：数据库连接池、接口并发上限、限流。公平模式可选，默认非公平。' },
        { title: '陷阱：都会死等', text: 'latch 计数差一个没 countDown，await() 永远卡着；barrier 人数配错就全场死等。保命符：都用带超时的版本——await(3, TimeUnit.SECONDS)、tryAcquire(timeout)，超时走降级。' },
      ],
      figure: { vb: '0 0 760 536', draw: n => layers(n, L, '0 0 760 536') },
      followups: [
        ['latch 和 barrier 的核心区别？', '一次性 vs 可复用；一等多 vs 多等人。latch 计数驱动，barrier 人数驱动，还能挂栅栏动作。'],
        ['Semaphore 限流的原理？', '上限设成 permits：先 acquire，拿不到要么排队、要么 tryAcquire 快速失败——可归还计数器。'],
        ['这三个的底层实现？', 'latch、semaphore：AQS 共享模式；barrier：Lock + Condition——都通向 AQS。'],
      ],
      points: '三句口诀：latch 等归零（一次性）、barrier 等人齐（可循环）、semaphore 管名额。\nlatch 一等多、barrier 多等人；barrier 可挂栅栏动作，latch 到 0 不能重置。\n超时是保命符：await(timeout) / tryAcquire——计数差一、人数配错就是永久死等。',
    };
  }

  /* 5 题；由门户或测试拼进完整题库（QA_PART_7） */
  w.QA_PART_7 = [qEqHc(), qException(), qErase(), qAqs(), qHelpers()];
})(typeof window !== 'undefined' ? window : globalThis);
