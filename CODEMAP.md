# CODEMAP.md —— 代码索引地图

> **强制协议见 [`AGENTS.md`](AGENTS.md) 第六节**：改动前先在本文件定位所属行，再读真实代码；
> 新增/删除页面、路由、store、`core` 内核、`scripts` 或核验覆盖时，**必须在同一次改动内更新本文件**。
> 本文件与代码不一致时**以代码为准**，并把本文件改对。
>
> 校验：`node scripts/check-codemap.mjs`（结构对齐，零歧义）。

**为什么需要这份地图**：同一页面在本仓库有**三套名字**——中文页名（核验脚本用 `--pages=` 寻址）、
路由、源码文件。三者此前没有任何一处对照记录，导致"要改 X 却定位不到文件"。
上方菜单名以 `router/index.ts` 的 `meta.title` 为真源。

真源文件：路由 `src/router/index.ts` · 菜单与角色 `src/core/config.ts` · 种子数据 `src/mock/seed.ts`

---

## 一、主页面（19）

| 中文页名 | 路由 | 视图文件 | 职责 | 额外核验 |
| --- | --- | --- | --- | --- |
| 运营看板 | `/workbench` | `WorkbenchView.vue` | 汇总需求受理交付、生产任务、运维事件的关键指标；待办与消息入口。**同时承载 `/coverage`**ⓐ | `cdp-smoke`、`verify-drawer` |
| 审计中心 | `/audit` | `AuditView.vue` | 只读的字段级留痕查询，承载 4 类审计覆盖 | **`verify-audit-chain`** |
| 系统配置 | `/admin` | `AdminView.vue` | 角色与权限矩阵、字典、演示配置 | — |
| 需求单管理 | `/demand/list` | `DemandListView.vue` | 需求单列表：筛选 + 表格 + 分页（**列表模式样板页**） | `cdp-smoke`、`verify-gaps` |
| 需求申请管理 | `/demand/apply` | `DemandApplyView.vue` | 4 步申请向导 | `cdp-smoke` |
| 需求变更管理 | `/change/list` | `ChangeListView.vue` | 变更单创建与审批、"调整实施计划"入口 | `cdp-smoke`、`verify-gaps` |
| 可视化变更窗口 | `/change/calendar` | `ChangeCalendarView.vue` | 变更窗口的可视化排期视图 | `verify-gaps` |
| 任务管理 | `/task/list` | `TaskListView.vue` | 任务单列表；**同时承载任务单详情**ⓐ | `cdp-smoke` |
| 工作流管理 | `/workflow` | `WorkflowView.vue` | 工单审批规则与自动化部署（产物生成） | `cdp-smoke`、`verify-gaps` |
| 交付与授权 | `/delivery` | `DeliveryView.vue` | 资源订阅与授权；**同时承载订阅单详情**ⓐ | `cdp-smoke` |
| 事件管理 | `/incident/list` | `IncidentListView.vue` | 事件录入、派发、处理 | — |
| 问题管理 | `/problem/list` | `ProblemListView.vue` | 问题根因分析、已知错误流程 | `verify-gaps` |
| 发布管理 | `/release/list` | `ReleaseListView.vue` | 发布包管理、升级、回滚 | `cdp-smoke`、`verify-gaps` |
| 知识库管理 | `/kb/list` | `KnowledgeListView.vue` | 知识条目增删改审；**同时承载知识条目详情**ⓐ | `cdp-smoke` |
| 知识问答管理 | `/kb/qna` | `KnowledgeQnaView.vue` | 征询问答，可归档为知识 | `cdp-smoke`、`verify-gaps` |
| 服务台管理 | `/service-desk` | `ServiceDeskView.vue` | 统一受理台 | `cdp-smoke`、`verify-gaps` |
| 自助服务管理 | `/selfservice` | `SelfServiceView.vue` | 服务目录自助申请 + 权限配置 | `cdp-smoke`、`verify-gaps`、`verify-audit-chain` |
| 评价管理 | `/evaluation` | `EvaluationView.vue` | 验收评价与反馈 | `verify-gaps` |
| 统计分析 | `/stats` | `StatsView.vue` | 多维度统计图表 | — |

## 二、详情页与隐藏页（11）

这些页面不经侧栏菜单进入，而是由页面内按钮跳转或直接访问 URL。

| 中文页名 | 路由 | 视图文件 | 职责 |
| --- | --- | --- | --- |
| 需求单详情 | `/demand/detail/:id` | `DemandDetailView.vue` | 全字段查看、8 步流转条、审批 / 交付 / 验收 / 评价入口 |
| 变更单详情 | `/change/detail/:id` | `ChangeDetailView.vue` | 变更单全貌、审批、调整实施计划 |
| 任务单详情 | `/task/detail/:id` | `TaskListView.vue` ⓐ | 任务接单 → 填报进度 → 提交验证 |
| 事件单详情 | `/incident/detail/:id` | `IncidentDetailView.vue` | 事件处理时间轴、关联知识 |
| 事件分类与模板 | `/incident/config` | `IncidentConfigView.vue` | 预定义事件分类（严重等级 / 模板）配置 |
| 问题单详情 | `/problem/detail/:id` | `ProblemDetailView.vue` | 根因分析、已知错误、临时方案 |
| 发布单详情 | `/release/detail/:id` | `ReleaseDetailView.vue` | 发布包与归档、回滚 |
| 知识条目详情 | `/kb/detail/:id` | `KnowledgeListView.vue` ⓐ | 知识条目详情抽屉 |
| 订阅单详情 | `/delivery/detail/:id` | `DeliveryView.vue` ⓐ | 订阅与授权详情 |
| 评价单 / 反馈单详情 | `/evaluation/detail/:id` | `EvaluationDetailView.vue` | 评价单与反馈单详情 |
| 功能点覆盖表（旧地址） | `/coverage` | `WorkbenchView.vue` ⓐ | 兼容路由：`beforeEnter` 打开右上角信息入口抽屉后回到看板（旧书签兼容） |

**ⓐ 视图复用陷阱（改前必看）**：`WorkbenchView.vue`、`TaskListView.vue`、`DeliveryView.vue`、`KnowledgeListView.vue`
各被**两条路由共用**（列表页 + 详情页）。改 `/task/detail` 时改的就是 `/task/list` 那个文件，不要去找不存在的 `TaskDetailView.vue`。

---

## 三、非页面层

### 状态与数据（改这里要连带核验 E1 状态流转）

| 文件 | 职责 | 额外核验 |
| --- | --- | --- |
| `src/stores/demo.ts` | 数据仓库：种子装载、localStorage 持久化、权限判定、字段级审计留痕、重置 | `cdp-smoke` |
| `src/stores/ui.ts` | 全局浮层状态（含覆盖表"上次看到哪儿"缓存） | `verify-drawer` |
| `src/mock/seed.ts` | 演示种子数据（约 2200 行），**示例编号的唯一真源** | `check-recipes` |

### 核心内核 `src/core/`

| 文件 | 职责 |
| --- | --- |
| `config.ts` | 全局配置：字典 / 角色与权限 / 菜单（`route` 必须与 `router/index.ts` 严格一致）/ 演示剧本 / 待办规则 |
| `types.ts` | 数据类型定义 |
| `roles.ts` | 角色与权限矩阵的类型定义与再导出（数据本体内联在 `config.ts`） |
| `utils.ts` | 日期 / 数字 / 集合 / 掩码 / **演示基准时间** |
| `storage.ts` | localStorage 适配层（受限环境降级为内存） |
| `artifacts.ts` | 自动化部署产物内核（生成 / 落库 / 历史重建） |
| `attachments.ts` | 知识条目附件内核（读文件 / 类型识别 / 文本抽取） |
| `changePlan.ts` | 变更"实施计划"可编辑规则与冲突分析 |
| `chart.ts` | 自绘 SVG 图表内核（不引 ECharts） |
| `featureList.ts` | **生成物**：功能清单真源，由 `scripts/gen-feature-list.mjs` 生成，**禁止手改** |
| `recipes.ts` | 功能点覆盖说明的类型与入口 |
| `recipesData.ts` | 69 行功能点的覆盖说明数据（纯数据） |
| `recipesExtra.ts` | 补齐遗漏的 4 个功能点配方（2.7、3.1–3.3） |
| `recipeHelpers.ts` | 覆盖说明的展示辅助（菜单路径、角色名） |
| `reference.ts` | 覆盖表数据（清单原文 + 实现说明 + 原文依据） |

### 公共组件 `src/components/`

`AppShell.vue`（应用外壳 / 侧栏 / 顶栏）· `ToolsDrawer.vue`（右上角信息入口抽屉）·
`ArtifactPanel.vue`（部署产物预览）· `ChangePlanEditor.vue`（调整实施计划抽屉）·
`ChartBox.vue`（图表容器）· `PageHead.vue` · `StatCards.vue` · `StatusTag.vue`

### 样式

`src/styles/tokens.css`（设计令牌，**唯一视觉可变层**）· `src/styles/base.css`（布局壳层与自研组件）

### 脚本 `scripts/`

| 脚本 | 职责 | 依赖 |
| --- | --- | --- |
| `check-recipes.mjs` | 覆盖表七项校验（69 行完备性 / 原文逐字一致 / 示例编号真实存在） | 纯静态，无外部依赖 |
| `check-codemap.mjs` | 本文件的结构对齐校验（视图文件 ↔ 路由 ↔ 地图行） | 纯静态，无外部依赖 |
| `gen-feature-list.mjs` | 由本地功能清单生成 `src/core/featureList.ts` | **需根目录迭代文档**，仅本地可跑 |
| `gen-recipes.mjs` | 由本地功能清单生成覆盖说明数据 | **需根目录迭代文档**，仅本地可跑 |
| `deploy-github.mjs` | 只把 `demo/` 内容推成远端仓库根 | GitHub 远端 |

### 核验脚本 `.tooling/`（已 gitignore，不进仓库）

**唯一入口**是运行器 `node .tooling/audit-run.mjs --script=<名>`（见 [`AGENTS.md`](AGENTS.md) 第三节）。

| 脚本 | 覆盖 |
| --- | --- |
| `audit-tables.mjs` | 全站 29 页表格版式 |
| `audit-layout.mjs` | 全站 29 页版式 |
| `audit-overflow.mjs` | 横向溢出 / 硬裁切 / 头部错行 |
| `e2e/cdp-smoke.mjs` | P0 状态流转 + P1（最重要的回归基线） |
| `e2e/verify-gaps.mjs` | 21 条验收要点可达性 |
| `e2e/capture-proof.mjs` | 出验收证据截图 → `验收问题回复/` |
| `e2e/probe-acceptance.mjs` | 定点核验"待验收 → 验收 / 评价"可达 |
| `verify-audit-chain.mjs` | 留痕链路：自助服务改权限 → 审计中心可见 |
| `verify-drawer.mjs` | 覆盖表抽屉 + "上次看到哪儿"缓存 |
| `verify-audit.mjs` / `verify-coverage-text.mjs` | 审计中心只读化 / 覆盖表文案的定点复查 |
| `inspect-*.mjs` | 单页几何取证 + 截图（`change` / `clip` / `dropdown` / `expand` / `align`） |

---

## 四、没有路由引用的文件

| 文件 | 状态 |
| --- | --- |
| `src/views/PlaceholderView.vue` | **零路由引用**。保留为未实现页面的占位；若确认不需要，可连同本行一并删除 |

---

## 五、同步检查清单

改动完成后逐条确认：

- [ ] 新增/删除 `src/views/*.vue` → 更新第一、二节表格行
- [ ] 新增/删除/改动路由 path 或 `meta.title` → 更新对应行的「中文页名 / 路由」
- [ ] 视图被新的路由复用，或复用关系解除 → 更新 ⓐ 标注
- [ ] 新增/重命名 `stores/` 或 `core/` 文件 → 更新第三节
- [ ] 新增/删除 `scripts/` → 更新第三节脚本表
- [ ] 核验脚本增删，或某页的核验覆盖变化 → 更新「额外核验」列
- [ ] 跑 `node scripts/check-codemap.mjs`，零错误
