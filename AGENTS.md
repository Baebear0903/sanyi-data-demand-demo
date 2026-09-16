# AGENTS.md —— demo（项目级补充）

> 本文件是根目录 [`../AGENTS.md`](../AGENTS.md)（通用工程规范）的**下位补充**，不是全局指导文件。
> 它只解决两件事：① 通用规范第 3 条「不要跑 E2E」在本仓库的**例外清单**；
> ② 执行期的**防卡死 / 防僵死 / 防幻觉 SOP**。冲突时以本文件为准。

本目录是**纯前端只读演示系统**（Vue 3 + TypeScript + Element Plus + Vite），用于产品功能验收。

---

## 一、E2E 例外：这些情况必须走浏览器核验

通用规范第 3 条的豁免条件（"verification requires a real browser"）在本仓库**经常成立**：
本系统没有后端、没有单元测试、没有任何测试框架（`package.json` 中不存在 `test` 脚本）；
`demo/src` 有 2.7 万行、29 个业务页面，**正确性只能由真实浏览器证明**。因此以下清单由本文件接管：

| # | 触发场景 | 命令（均在仓库根目录执行） |
| --- | --- | --- |
| E1 | 改动 P0 状态流转：`stores/demo.ts`、角色兜底、权限判定、路由 | `node .tooling/audit-run.mjs --script=e2e/cdp-smoke --port=9335` |
| E2 | 改写操作、字段级审计、审计中心 | `node .tooling/audit-run.mjs --script=verify-audit-chain` |
| E3 | 任一 UI 改动（版式 / 表格 / 溢出均属验收要点） | `node .tooling/audit-run.mjs --script=audit-layout --pages=<中文页名>`（尺寸默认只跑 1920x1080，多尺寸另加 `--sizes=`） |
| E4 | 右上角信息入口抽屉（功能点覆盖表）、"上次看到哪儿"缓存 | `node .tooling/audit-run.mjs --script=verify-drawer` |
| E5 | 交付/发版前，或改动 `vite.config.offline.ts` | 双击 `demo/offline/数据需求管理-演示系统.html`（`file://` 语义与 `dist/` 不同，必须实测） |
| E6 | 需要给验收方出证据截图 | `node .tooling/audit-run.mjs --script=e2e/capture-proof --port=9334` |
| E7 | 核查"某条验收要点是否真的可达" | `node .tooling/audit-run.mjs --script=e2e/verify-gaps --port=9336` |

**哪一页归哪条脚本覆盖，查 [`CODEMAP.md`](CODEMAP.md) 的「额外核验」列**——不要凭记忆猜页名。

## 二、反向纪律：不在例外清单里就不许跑 E2E

通用规范说"不要动辄跑全量"，本仓库照此执行，且更严：

- **版式核验必须显式给范围**：`--pages=<中文页名>` 收窄，或 `--all` 全量；两者都不给，运行器与 `audit-layout` 以退出码 2 拒绝执行——**不默认跑全量**。
- **受影响的页面 ≤ 3 个**时，必须用 `--pages=<中文页名>` 收窄，不许跑全量。
- **只改文案、样式或单个组件**时，只跑对应页那一行。
- **全量（29 页 × 9 尺寸，命令写 `--all`）只用于交付前，或在 UI 框架层（`styles/`、`AppShell.vue`）改动时。**
- 不在上表 E1–E7 触发范围内的改动，**不跑**浏览器核验。

## 三、执行纪律：只用运行器，不自建浏览器

```bash
cd demo && ./node_modules/.bin/vite preview --port 4173 --strictPort   # 先起 preview（终端 A）
node .tooling/audit-run.mjs --script=<脚本名> [--pages=审计中心 | --all] [--sizes=1920x1080] [--port=9334]
```

- **必须**经 `audit-run.mjs`，不要手工 `spawn` Chrome，也不要复用旧实例。
- 不要假设 CDP 端口（9333）上有活着的 Chrome——它随时可能僵死且不自愈。
- 运行器负责：检查 preview、清理端口上的旧 Chrome、起全新 headless Chrome、健康检查、跑完收尾关浏览器，
  并把 `DEMO_BASE` / `DEMO_CDP` 注入子脚本。**同一端口只允许一个消费者**，冲突时显式换端口。
- 临时几何取证：按需写**一次性探针**（`.tooling/tmp-*.mjs`，跑完即弃），不要固化成常驻脚本。
  常规版式缺陷由 `audit-layout` 报出（E3）；某个具体缺陷查清了就不再留探针。

## 四、防卡死与防幻觉

| 风险 | 症状 | 处置 |
| --- | --- | --- |
| **600s 硬上限** | 单次 `timeoutMs` 封顶 600000ms，传更大无效 | 实测约 120–180 秒/尺寸；**单次前台最多 2–3 个尺寸**；预估 >5 分钟一律 `run_in_background: true` 后轮询 |
| **静默 hang** | 长命令管道给 `tail` → 管道关闭前零输出，无法区分"在跑"和"已死" | **绝不** `\| tail -20`；先落盘再读：`node x.mjs > /tmp/out.log 2>&1; tail -20 /tmp/out.log`；核验脚本自身必须打印 `n/total` 心跳 |
| **渲染进程僵死** | WebSocket 连得上、`/json/version` 有响应，但 `Runtime.evaluate` 永不返回 | **重启浏览器，不要重试等待**（运行器已内置健康检查 `1+1`） |
| **缓存假象** | 浏览器缓存旧 `index.html` → 指向旧 chunk 哈希，断言基于假象 | 读任何页面数据前先 `Network.setCacheDisabled` |
| **产物过期** | 改了源码却在核验旧产物 | 改动后重建 `demo/dist/` 与 `demo/offline/*.html`，并确认产物晚于源码 |
| **僵尸进程** | 遗留 Chrome / 后台任务 | 收尾清理临时文件与后台进程，不留僵尸 Chrome |
| **命令转义歧义** | `node -e "…"` 里的 `\w`、`\.` 会先经 shell 一层处理，写在命令里与写在文件里是**两套规则**（实测把 `[\w-]` 吃成 `[w-]`，导致正则静默失效、误判四轮） | **含正则或多行的 Node 片段一律先落盘再跑**：写 `/tmp/x.mjs`（或 `.tooling/tmp-*.mjs`，传入 `--script=` 需落在 `.tooling/` 下）再 `node`；必须内联时用 heredoc `node <<'EOF'`（引号不可省）。**读脚本时同理：不要用 `awk` 概览含反斜杠的文件** |
| **包管理器缺失** | `pnpm: command not found` | 本机未装 pnpm：用 `COREPACK_HOME="$PWD/.tooling/corepack" corepack pnpm <命令>`（见 [`README.md`](README.md) §一「本机环境备忘」） |

## 五、通用规范第 4/5 条在本仓库的落地

- 取值顺序：`cd demo && pnpm build`（= `vue-tsc --noEmit` + 构建）→ `pnpm verify`（配方校验 + 类型检查）
  → 受影响的例外核验 → 不跑全量。
- 报告口径：列出**跑过的脚本名、页面数、尺寸、通过/失败项**；失败的写清失败项原文。
- 未跑的一律写"未跑"；**绝不声称跑过的检查通过了**。

## 六、代码索引地图：必须先读、必须同步

**协议（强制）**

1. **改前先读**：先在 [`CODEMAP.md`](CODEMAP.md) 找到所属行，拿到「中文页名 → 路由 → 文件」，**再读真实代码**。
   地图只用于定位，不替代阅读本体。
2. **改后同步**：新增/删除页面、路由、store 层、`core` 内核、`scripts`，或改变核验覆盖 → **同一次改动内**更新地图。
3. **以代码为准**：地图与实际代码不一致时，信代码，并在同一次改动内把地图改对，不许留 TODO 或延后。

**校验**：`node scripts/check-codemap.mjs`（在 `demo/` 下执行）做零歧义的结构对齐检查，
已挂进 `pnpm verify`。它只校验结构事实，不评判"一句话职责"的措辞。
