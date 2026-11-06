# Backend Lab · 后端工程实验室

> 把系统设计变成可以动手玩的演示。一组**纯前端、零依赖、数据本地计算**的在线工具与交互式演示，
> 用于替代那些只会躺在博客里的「XX 原理详解」。

## 在线应用

| 应用 | 直达 | 内容 |
|------|------|------|
| **DevBox** 开发者工具箱 | [`/apps/devbox/`](apps/devbox/) | 16 个高频工具：JSON 格式化（错误定位行列）、Base64 / URL / HTML 实体、JWT 解码、正则测试（高亮+捕获组+替换）、SHA 哈希、时间戳、进制、颜色（含色阶）、UUID、密码熵值、Markdown 预览、HTTP 状态码速查… |
| **System Lab** 系统设计实验室 | [`/apps/system-lab/`](apps/system-lab/) | 4 个交互演示：一致性哈希（CH vs 取模迁移率实测、虚拟节点）、四种限流算法同屏对比（固定窗口/滑动窗口/令牌桶/漏桶）、雪花 ID（位级拆解+时钟回拨模拟）、布隆过滤器（理论 vs 实测误判率） |
| **RegexVis** 正则可视化 | [`/apps/regexvis/`](apps/regexvis/) | 正则 → 逐段中文解释 + Thompson NFA 状态机图 + 逐字符匹配动画（ε-闭包可视化、贪婪/懒惰分支走向、前瞻断言） |
| **JMM Lab** Java 并发实验室 | [`/apps/jmm-lab/`](apps/jmm-lab/) | 8 条 happens-before 规则图解、volatile 可见性动画（主存/工作内存同步过程）、20 万次交错重排实验、线程六状态机（点击看代码与误区）、DCL 单例步进推演 |
| **LogLens** 日志时间线分析器 | [`/apps/loglens/`](apps/loglens/) | 粘贴多行分布式日志：自动识别 3 种时间戳格式、按线程/服务分泳道渲染瀑布图、标记可疑 gap、按时长画横条、ERROR 按模板聚类 |

**规划中**：curl2code（curl ↔ Java/Go/Python 代码互转）。
做完才上线，不放占位假链接。

## 设计原则

- **纯前端**：没有任何后端，静态资源 + 浏览器。所有计算在本地完成，数据不出设备。
- **零依赖**：不引入任何第三方库/框架，哈希是手写的 FNV-1a，动画是原生 Canvas 和 requestAnimationFrame。
- **演示即结论**：每个演示开头给「结论先行」，结尾给「面试要点」——但这不是八股背诵页，
  参数拖一下、节点删一个，数字是自己算出来的。
- **诚实生长**：应用矩阵随时间自然增加，commit 历史即开发史，不刷格子。

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
    └── system-lab/         # 系统设计实验室
        └── js/demos/       # 每个演示一个文件，互不影响
```

## License

[MIT](LICENSE)
