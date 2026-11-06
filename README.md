# Starry Lab · 系统设计交互式演示集

> 把系统设计变成可以动手玩的演示。一组在线工具与交互式演示，
> 用于替代那些只会躺在博客里的「XX 原理详解」。

## 在线应用

| 应用 | 直达 | 内容 |
|------|------|------|
| **DevBox** 开发者工具箱 | [`/apps/devbox/`](apps/devbox/) | 16 个高频工具：JSON 格式化（错误定位行列）、Base64 / URL / HTML 实体、JWT 解码、正则测试（高亮+捕获组+替换）、SHA 哈希、时间戳、进制、颜色（含色阶）、UUID、密码熵值、Markdown 预览、HTTP 状态码速查… |
| **System Lab** 系统设计实验室 | [`/apps/system-lab/`](apps/system-lab/) | 4 个交互演示：一致性哈希（CH vs 取模迁移率实测、虚拟节点）、四种限流算法同屏对比（固定窗口/滑动窗口/令牌桶/漏桶）、雪花 ID（位级拆解+时钟回拨模拟）、布隆过滤器（理论 vs 实测误判率） |
| **RegexVis** 正则可视化 | [`/apps/regexvis/`](apps/regexvis/) | 正则 → 逐段中文解释 + Thompson NFA 状态机图 + 逐字符匹配动画（ε-闭包可视化、贪婪/懒惰分支走向、前瞻断言） |
| **JMM Lab** Java 并发实验室 | [`/apps/jmm-lab/`](apps/jmm-lab/) | 8 条 happens-before 规则图解、volatile 可见性动画（主存/工作内存同步过程）、20 万次交错重排实验、线程六状态机（点击看代码与误区）、DCL 单例步进推演 |
| **LogLens** 日志时间线分析器 | [`/apps/loglens/`](apps/loglens/) | 粘贴多行分布式日志：自动识别 3 种时间戳格式、按线程/服务分泳道渲染瀑布图、标记可疑 gap、按时长画横条、ERROR 按模板聚类 |
| **Raft Lab** 共识协议实验室 | [`/apps/raft-lab/`](apps/raft-lab/) | 4 个事件驱动的 Raft 演示：领导选举（随机 vs 固定超时的活锁对照）、日志复制与提交（多数派计数、commitIndex 推进）、可以逐条关掉的安全规则（up-to-date 限制、只提交当前 term）、分区后哪一侧还能写 |
| **MVCC Lab** 事务隔离实验室 | [`/apps/mvcc-lab/`](apps/mvcc-lab/) | 5 个隔离级别（RU/RC/RR/SI/SER）下的真实语义：PG 快照可见性逐步判定、脏读/不可重复读/幻读/丢失更新由引擎按执行历史判出、写偏斜的三种堵法、优先图环检测与严格 2PL |
| **Wire Lab** 网络传输实验室 | [`/apps/wire-lab/`](apps/wire-lab/) | 4 个时序仿真：TCP 握手/挥手的 seq 与 ACK 实时推导（TIME_WAIT、同时关闭）、逐 RTT 的 cwnd 曲线（Reno/NewReno/CUBIC、快恢复与快重传）、五种投递模型的页面加载对比、TLS 1.2/1.3/QUIC 的握手轮次与首字节时间 |

**规划中**：curl2code（curl ↔ Java/Go/Python 代码互转）。
做完才上线，不放占位假链接。

## 设计原则

- **零依赖**：不引入任何第三方库/框架，哈希是手写的 FNV-1a，动画是原生 Canvas 和 requestAnimationFrame。
- **演示即结论**：每个演示开头一句话给结论或口诀，结尾给「面试要点」——但这不是八股背诵页，
  参数拖一下、节点删一个，数字是自己算出来的。
- **诚实生长**：应用矩阵随时间自然增加，做完才放上来，不刷格子。

## 本地运行

无构建步骤，任选其一：

```bash
# 直接双击 index.html
# 或
python3 -m http.server 8080
# 访问 http://localhost:8080
```

## 目录结构

```
├── index.html              # 门户导航页
└── apps/
    ├── devbox/             # 开发者工具箱
    ├── system-lab/         # 系统设计实验室（每个演示一个文件，互不影响）
    ├── regexvis/           # 正则可视化
    ├── jmm-lab/            # Java 并发实验室
    ├── loglens/            # 日志时间线分析器
    ├── raft-lab/           # 共识协议实验室
    ├── mvcc-lab/           # 事务隔离实验室
    └── wire-lab/           # 网络传输实验室
```

## License

[MIT](LICENSE)
