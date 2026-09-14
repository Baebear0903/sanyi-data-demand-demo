# 页面开发规范（给并行实现的开发者）

> 本文件是 `demo` 演示系统页面实现的**唯一约定来源**。新增页面前必须先读本文件。
> 现有样板页：`src/views/WorkbenchView.vue`（看板模式）、`src/views/DemandListView.vue`（列表模式）。

---

## 1. 硬性约束（违反会导致验收失败）

| 约束 | 说明 |
| --- | --- |
| **不许新增依赖** | 只能用 `package.json` 中已有的包。图表用 `@/components/ChartBox.vue`，不要引 ECharts。 |
| **不许改公共文件** | 不要修改 `stores/`、`core/`、`mock/`、`styles/`、`router/index.ts`、`components/` 下已有文件（除本组明确分配给你的）。只**新建**自己负责的 view 文件。 |
| **必须类型检查通过** | 提交前自查：不要留 `any` 泛滥、不要用未定义变量。项目 `strict: true`。 |
| **必须零控制台错误** | 页面渲染与交互过程中不得产生 `pageerror` 或 `console.error`。 |
| **必须可交互** | 每个页面至少要有：可用的筛选/切换、可打开详情（弹窗或跳转）、至少一个会改变 store 数据的操作动作（带动画或提示反馈）。不接受纯静态占位。 |
| **中文界面** | 全部文案中文；术语必须与建设方案一致（需求单 / 任务单 / 事件单 / 问题单 / 发布单 / 知识条目 / 评价单 / 反馈单）。 |
| **标注原文依据** | 页面顶部用 `<div class="spec-note">` 标注该页对应的原文功能点描述（从 PRD 第 2.3 节映射表取原文）。 |

---

## 2. 技术栈与写法

- Vue 3.4 `<script setup lang="ts">` + TypeScript
- Element Plus 2.8（**已在 main.ts 全量注册图标**，模板里可直接用 `<el-icon><Search /></el-icon>`，无需 import）
- 路由为 Hash 模式；跳转用 `router.push('/demand/detail/' + id)`（**不要带 `#`**）
- 样式：优先用已有 CSS 类（见第 5 节）；需要自定义时在 `<style scoped>` 内写，**只能用 tokens.css 里的 CSS 变量，不得写死颜色/尺寸**

### 引入示例

```vue
<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDemoStore, dictItem } from '@/stores/demo'
import { config } from '@/core/config'
import { by, fmtTime, fromNow, arr } from '@/core/utils'
import PageHead from '@/components/PageHead.vue'
import StatCards from '@/components/StatCards.vue'
import StatusTag from '@/components/StatusTag.vue'
import ChartBox from '@/components/ChartBox.vue'
</script>
```

---

## 3. 数据访问（Pinia store）

```ts
const store = useDemoStore()

store.table('demands')            // 取整张表（数组）
store.findById('demands', id)     // 按 id 或 no 查单条
store.query('demands', { status: 'APPROVED' })
store.role                        // 当前角色对象 { id,name,short,icon,org,desc,dataScope,perms,all }
store.user                        // 当前角色代表人 { id,name,org,title,phone,email }
store.can('demand.approve')       // 权限点判断（管理员恒 true）
store.todos                       // 待办数组（自动按角色推导）
store.messages                    // 当前角色可见消息
```

### 写操作（**必须走这些方法，才能自动留审计**）

```ts
// 更新并自动写字段级审计 + 时间轴
store.update('demands', d.id, { status: 'APPROVED', approver: store.user.name },
             { action: '审批通过', remark: '同意共享' })
store.pushTimeline(d, { action: '审批通过', comment: '同意共享' })

// 新增
store.insert('messages', { type:'info', title:'…', body:'…' })

// 通知（按角色下发，用于演示"同步更新至其授权用户"）
store.notify({ type:'success', title:'需求单已交付', body:'…', toRoles:['consumer'], link:'/demand/detail/'+id })

// 消息可读
store.markRead(id); store.markAllRead()
```

> 写操作后**不需要**手动 `persist()`，`update/insert/remove/notify` 内部已处理。

---

## 4. 可用数据表（字段以 `src/mock/seed.ts` 为准，务必先读该表定义）

| 表名 | 说明 | 关键字段 |
| --- | --- | --- |
| `demands` | 需求单（16 条，覆盖 12 种状态） | id,no,title,applicant,applicantOrg,tenantId,appId,scene,kind(EXISTING/NEW),resourceType,deliveryForm,resources[],fields[],timeRange,updateFreq,usePeriod,callVolume,desensitize,securityLevel,priority,status,currentHandler,source,templateId,relatedIncidentIds[],relatedProblemIds[],taskIds[],changeIds[],subscriptionIds[],evaluationId,submittedAt,acceptedAt,approvedAt,deliveredAt,evaluatedAt,withdrawnAt,cancelledAt,rejectedAt,expectAt,approver,securityApprover,rejectReason,cancelReason,timeline[] |
| `changes` | 需求变更单（6 条） | id,no,title,demandId,demandNo,category,priority,implementDate,requestor,implementer,plan,resources[],riskLevel,impact{ciList,services,tenants,suggestion},conflicts[{type,with,desc,suggestion}],status,submittedAt,approvedAt,doneAt,withdrawnAt,approver,expectAt,timeline[] |
| `tasks` | 生产任务单（12 条） | id,no,title,type(数据采集/数据加工/数据建模/服务封装),source(DEMAND/PROBLEM/MANUAL),sourceId,sourceNo,dept,assignee,priority,planStart,planEnd,progress,status,content,deliverable,resources[],milestones[{name,planDate,doneDate}],relatedProblemIds[],verifyResult,rejectReason,timeline[] |
| `subscriptions` | 订阅与授权单（10 条） | id,no,demandNo,kind(API/FILE/REALTIME),serviceId,appId,tenantId,fileConf,apiConf,rtConf,approveStatus,submittedAt,approvedAt,rejectedAt,unsubscribedAt,approver,rejectReason,channelAuth{useScope[],visibleScope[]},secret{appKey,appSecret,issuedAt,reissued},pushLogs[{at,target,mode,transport,rows,status,note}] |
| `incidents` | 事件单（273 条，含 __hour/__dayOffset 供按小时统计） | id,no,title,description,source(服务台申报/客户自助/微信报障/邮件),categoryId,categoryName,severity,impact,urgency,priority,ciIds[],status,handler,handlerGroup,slaDueAt,resolvedAt,closeType,relatedIncidentIds[],problemId,changeId,broadcastIds[],knowledgeRefs[],timeline[] |
| `problems` | 问题单（6 条） | id,no,title,source(INCIDENT/MANUAL),sourceIncidentIds[],severity,impact,urgency,priority,status,handler,dept,rootCause,knownError{workaround,permanentFixPlan,expireAt},solution,preventive,notifyChannels[],notifyLogs[{at,to,channel,content}],relatedChangeIds[],relatedCiIds[],knowledgeId,createdAt,expectAt,resolvedAt,closedAt,timeline[] |
| `releases` | 发布单（6 条） | id,no,title,demandIds[],changeIds[],changeContent,testResult,releaseAt,downtime,status,applicant,approver,approvedAt,packages[{version,archivedAt,operator,remark}],verifyItems[{name,result,remark}],rollback{at,reason,fromVersion,toVersion,operator},auditNote,auditedAt,timeline[] |
| `knowledges` | 知识条目（14 条） | id,no,title,categoryId,categoryName,owner,status,createdAt,publishedAt,refCount,contentText,contentHtml,attachments[{name,type,size,contentText}],ratings[{user,score,at}],comments[{user,content,at,ownerNotified}],relatedIds[] |
| `qnas` | 知识问答（6 条） | id,no,question,asker,askerOrg,askedAt,status(ASKED/ANSWERED/ARCHIVED),answers[{id,user,content,at,clue,isBest}],archivedKnowledgeId,archivedAt |
| `evaluations` | 评价单（8 条） | id,no,title,demandId,demandNo,evaluator,evaluatorOrg,score,evaluatedAt,content,dims{数据质量,交付及时性,服务态度,文档完备性,问题响应速度},status,approvedAt,approver,rejectReason,visibleTo,feedback{id,user,content,at,status,approvedAt} |
| `callbacks` | 回访调查（8 条） | id,ticketType(事件单/需求单/任务单),ticketId,ticketNo,score,comment,status(待回访/已回访),sentAt,repliedAt,to |
| `broadcasts` | 广播通知（4 条） | id,no,title,content,targets[{type,ids[]}],channels[],sender,senderOrg,sentAt,readBy[],status,relatedId |
| `audits` | 审计记录（10 条） | id,bizType,bizId,bizNo,bizTitle,action,changes[{field,before,after}],remark,operator,operatorOrg,operatedAt,ip,terminal |
| `resources` | 数据资源（20 条，7 类） | id,name,code,type(MODEL/API/PARAM/ALGO/TAG/METRIC/RAW),layer(ODS/DWD/DWA/DIM/SRC),domain,source,owner,securityLevel,fields[{name,cn,type,sensitive}],rowCount,updateFreq,publishedAt,subscribeCount,star,viewCount,desc |
| `classifications` | 分类分级结果（对接态） | resourceId,category,level,levelName,maskAlgorithm,evaluatedAt,source,ruleName,legalBasis,hitRules[] |
| `samples` | 资源样例数据（**已脱敏**，对象：resourceId → 行数组） | 按 resourceId 取 |
| `services` | 数据服务（12 条） | id,name,kind(API/FILE/REALTIME),resourceId,publisher,status,availability,serviceTime,subscribeCount,callVolume,publishAt,desc |
| `cis` | CMDB 配置项（17 条） | id,name,type,owner,env,dependsOn[],relatedTenants[],relatedServices[] |
| `workflows` | 工作流模板（6 套） | id,name,bizType,version,status,desc,nodes[{key,name,role,slaHours,actions[],condition}],rules[{level,approvers[],mode,condition}],deployArtifacts |
| `demandTemplates` | 需求申请模板（4 个） | id,name,category,desc,preset{} |
| `catalogItems` | 自助服务目录（6 项=预定义需求类别） | id,name,category,icon,banner,desc,availability,serviceTime,flowId,allowedRoles[],formSchema[{key,label,type,required,options}] |
| `incidentCategories` | 事件分类（7 类） | id,name,group,autoAssign,keywords[] |
| `incidentTemplates` | 事件模板（4 个） | id,name,categoryId,severity,impact,urgency,title,desc |
| `decisionTree` | 事件决策树 | {root,nodes:{key:{type:'q'\|'r',text,options[{label,next}],advice,tags[]}}} |
| `kbCategories` | 知识分类树（5 顶级，含 children） | id,name,dim(产品/用户群/业务领域/地点),children[]（维护责任人是 `knowledges.owner`，分类节点不承载责任人） |
| `tenantRegs` | 租户注册申请（5 条） | id,no,type(个人/企业),name,fields{},status,reviewer,reviewedAt,reviewComment |
| `capabilityApplies` | 能力申请（4 条） | id,no,applicant,email,phone,applyType,storage,cpu,memory,tenantId,status |
| `securityApprovals` | 安全审批工单（3 条） | id,demandId,demandNo,cate,createdAt,levels[{level,approver,channel,status,comment,at}] |
| `tenants` / `apps` / `users` / `orgs` | 主数据 | 见 seed |

---

## 5. 组件与 CSS 类速查

### 组件

```vue
<PageHead title="页面标题" desc="副标题">
  <template #actions><el-button type="primary">主要操作</el-button></template>
</PageHead>

<StatCards :items="[{ label:'需求单总数', value:16, unit:'单', icon:'📋', tone:'primary', delta:'较上周 +3', tip:'说明' }]" />
<!-- tone: primary|success|warning|danger|info|purple|teal|neutral -->

<StatusTag dict="DemandStatus" :value="row.status" />        <!-- 自动取文案+颜色 -->
<StatusTag dict="Priority" :value="row.priority" :dot="false" />
<StatusTag label="自定义文案" tone="teal" />                  <!-- 不查字典时 -->

<ChartBox kind="line"  :data="{ categories:[...], series:[{name,data:[]}] }" :height="260" />
<ChartBox kind="bar"   :data="[{name,value}]" :height="240" :rotate="true" />
<ChartBox kind="hbar"  :data="[{name,value}]" />
<ChartBox kind="donut" :data="[{name,value}]" center-label="需求单" />
<ChartBox kind="funnel" :data="[{name,value}]" />
<ChartBox kind="gauge" :value="96.4" label="SLA 达成率" />
```

字典名：`DemandStatus` `ChangeStatus` `TaskStatus` `IncidentStatus` `ProblemStatus` `ReleaseStatus`
`KnowledgeStatus` `QnaStatus` `EvaluationStatus` `SubscriptionStatus` `TenantStatus` `Priority`
`Severity` `RiskLevel` `SecurityLevel` `ResourceType` `DeliveryForm` `ServiceKind` `DemandKind`
`DemandSource` `TaskType` `CloseType` `NotifyChannel`

### CSS 类（`styles/base.css`，直接可用）

- 布局：`card` `card__head` `card__title` `card__sub` `card__spacer` `card__body` `card__body--flush` `card__foot`
- 栅格：`grid grid--2 / grid--3 / grid--4 / grid--side`（左内容 + 右 340px 侧栏）/ `grid--side-l`
- 提示条：`spec-note`（原文依据）+ `spec-note__tag`、`assume-note`（演示假设）
- 描述列表：`desc-grid` `desc-item` `desc-item--label` `desc-item__value` `desc-item--wide`
- 时间轴：`tl` `tl__item`（+`tl__item--done|active|danger`）`tl__dot` `tl__head` `tl__action` `tl__meta` `tl__body` `tl__quote`
- 流转条：`flow` `flow__step`（+`--done|active|reject`）`flow__dot` `flow__label` `flow__time`
- 附件：`file-list` `file-item` `file-item__icon--pdf|word|ppt|txt|xlsx` `file-item__name` `file-item__meta`
- 日志：`log-box` `log-box__line`（+`--ok|warn|err`）`log-box__time`；代码：`code-box`
- 卡片网格：`svc-grid` `svc-card` `svc-card__banner`（+`--alt|--warm|--purple`）`svc-card__body` `svc-card__title` `svc-card__desc` `svc-card__meta` `svc-card__foot`
- 权限矩阵：`matrix`（`th/td`，`.yes`/`.no`）
- 变更窗口日历：`cal` `cal__head` `cal__cell`（+`--out`）`cal__day`（+`--today`）`cal__ev`（+`--change|event|release|freeze`）
- 决策树：`dtree__q` `dtree__opts` `dtree__opt` `dtree__path` `dtree__result`
- 空态：`empty-box` `empty-box__icon` `empty-box__text`
- 工具类：`muted` `mono` `bold` `text-sm` `text-xs` `nowrap` `flex` `flex-1` `items-center` `justify-between` `wrap` `gap-1/2/3` `mt-1/2/3/4` `mb-2/3/4` `masked`（脱敏标记）

### 状态流转工具

```ts
(config.flowIndex.Demand as any)[row.status]   // → 步序号 0..7
(config.flows.Demand as any)[stepIndex]        // → 步骤名
// flows 键：Demand / Task / Incident / Problem / Release / Knowledge
```

### 工具函数（`@/core/utils`）

`fmtDate` `fmtTime` `fmtShort` `fmtCN` `fromNow` `hoursAgo` `addDays` `iso` `today`
`thousands` `wan` `pct` `num` `truncate` `by(arr,key,dir)` `get(obj,path,dflt)` `sum` `countBy`
`groupBy` `uniq` `find` `findById` `arr(v)`（安全数组）`deepClone` `uid` `mask.{idcard,phone,name,bank}` `debounce`

---

## 6. 交互与演示质量要求

1. **每条写操作都要有可见反馈**：`ElMessage.success('已…')`，并让列表/详情状态**立即更新**（因为改的是响应式 store 数据）。
2. **审批类动作**用 `ElMessageBox.prompt` 收集意见，把意见写进 `remark` 与 `timeline`。
3. **权限敏感**：操作按钮必须按 `store.can('权限点')` 或角色判断显隐（参考 `DemandListView.vue` 的 `actionsOf()` 写法）。
4. **空态**：所有列表/表格都要有 `#empty` 或 `v-if` 空态（用 `empty-box`）。
5. **脱敏展示**：涉及个人敏感字段（身份证/手机号/姓名）的样例数据必须用 `masked` 类或 `mask.*` 处理，并说明"按分类分级结果脱敏后展示"。
6. **演示假设标注**：原文未定义的数值（时限、评分权重、优先级矩阵等）必须用 `<div class="assume-note">` 标注为演示假设。
7. 页面要**信息充实但不堆砌**：表格 8–15 列以内，卡片 2–4 个一组，图表 ≥1 个（看板类页面）。

---

# 附：本轮改版规范（B 端后台化）

> 本节为最新要求，**优先于前文任何冲突描述**。

## 1. 正式页面不得出现演示/验收内容

**必须从所有业务页面移除**（不是隐藏，是删除）：

| 移除对象 | 说明 |
| --- | --- |
| `class="spec-note"` 整块 | 原文依据提示条，共 29 处 |
| `class="assume-note"` 整块 | 演示假设提示条，共 22 处 |
| 任何含"演示""验收""剧本""原文依据""演示假设""本页为…占位"字样的文案 | 包括注释性文案 |
| `EmptyBox` 里的庆祝类 emoji（🎉 等） | 换成中性单色图标 |

这些内容已统一收进右上角信息入口的抽屉（**只有一个栏目：功能点覆盖表**），**页面内不再出现**。
页面代码里也不要保留 `UI.specnote()` 之类的调用。

抽屉内部各块内容的落点（改抽屉时按此对应，不要再拆成并列栏目）：

| 内容 | 抽屉中的位置 |
| --- | --- |
| 功能点覆盖表（与《数据需求管理-功能清单.md》逐行对齐的 **69 行**） | 抽屉主体（父子缩进表格） |
| 演示剧本（8 条） | 表格**最底部**，默认收起（弱化入口） |
| 原文依据（清单原文 + 本系统实现 + 设计假设） | 父行「原文依据」按钮弹窗 |
| 核对边界说明 | 表格最底部「查看」弹窗 |

覆盖表的数据与校验：

- `core/featureList.ts` —— **功能清单真源**，由 `scripts/gen-feature-list.mjs` 从 `数据需求管理-功能清单.md` 解析生成（勿手改）
  69 行 = 根 1 + 模块 11 + 条目 57；`accept = 原文非空`（67 行有验收按钮，2 个空描述标题仅承载层级）
- `core/reference.ts` —— 逐行补「实现说明 `impl`」「承载页面 `view`」「设计假设 `note`」；`originRows` 给出 67 条原文依据
- `core/recipesData.ts` —— 演示说明，由 `scripts/gen-recipes.mjs` 生成：
  模块行只写「角色 → 承载该模块的功能页面 → 看什么最完整 → 示例数据」，条目行写「角色 → 系统页面 → 看得到什么 / 要做什么 → 示例数据」
- `scripts/check-recipes.mjs` —— 七项校验：清单完备性（69/69，根1/模块11/条目57，行形状一致）、原文一致性（与清单原文逐字）、
  原文依据可达性（67/67）、无清单外行、角色白名单、页面白名单 + **文案有据**（371 条演示要点必须能在对应 `views/*.vue` 找到出处）、
  示例编号有据（134 条，且剔除种子审计留痕里的失效单号）

```bash
cd demo
pnpm check:recipes                    # 七项校验
node scripts/gen-feature-list.mjs     # 改完《功能清单.md》后重新生成 featureList.ts
node scripts/gen-recipes.mjs          # 重新生成 recipesData.ts
```


## 2. 图标：全部改为 Element Plus 单色线性图标

- 统一写法：`<el-icon><ComponentName /></el-icon>`（图标已在 `main.ts` 全量注册，无需 import）
- 颜色随 `currentColor`，**不要给图标单独上色**（统计卡片的彩色底保留，见下）
- 禁止使用 emoji 与字符图形（`★ ☰ ⚙ ⚡ 📊 ✎ ✅ ⚠ 🎉 …`）

### 通用替换对照表

| 原字符 | 替换为 | 用途 |
| --- | --- | --- |
| 📋 ☰ 📄 📑 🧾 | `Document` / `Tickets` | 单据、清单 |
| 📝 ✎ ✍ | `EditPen` / `Edit` | 申请、编辑 |
| ⚙ ⚒ 🛠 🔧 | `Setting` / `Tools` | 配置、实施 |
| ⚡ ⚠ 🚩 | `Warning` / `WarningFilled` | 事件、告警、优先级 |
| ✅ ✓ ☑ ✔ | `CircleCheck` / `Check` | 完成、通过 |
| ❌ ✕ | `CircleClose` / `Close` | 驳回、失败 |
| ⏳ 🕒 🕓 🕘 🕘 | `Clock` / `Timer` | 时间、待办 |
| 📦 🗂 📁 | `Box` / `Folder` / `FolderOpened` | 产物、归档 |
| 🔌 🔑 🛡 🔒 | `Connection` / `Key` / `Lock` | 服务、密钥、权限 |
| 📊 📈 ◔ ▤ | `DataAnalysis` / `TrendCharts` / `Histogram` / `PieChart` | 统计、图表 |
| 🔍 🔎 | `Search` | 检索 |
| 📢 📣 📮 ✉ 💬 | `Promotion` / `Message` / `ChatDotRound` | 通知、消息 |
| 👤 👥 🏢 🏛 🏥 | `User` / `UserFilled` / `OfficeBuilding` | 人员、机构 |
| ★ ⭐ 🏆 🏅 | `Star` / `Medal` | 评价、等级 |
| 📞 ☎ | `Headset` / `Phone` | 服务台 |
| 🌳 🧩 🔗 | `Share` / `Connection` / `Link` | 关联、图谱 |
| 📥 📤 🔗 | `Download` / `Upload` / `Link` | 导入导出 |
| 🖥 💻 | `Monitor` | 终端 |
| 🎉 🚧 📭 | `FolderOpened` / `InfoFilled` / `DocumentRemove` | 空态（**不要用庆祝类**） |
| ⇄ ↔ ↩ | `Refresh` / `Back` / `Sort` | 流转、回退 |
| → ← ↗ ↕ ▼ ▶ | `ArrowRight` / `ArrowLeft` / `Top` / `Bottom` / `Right` | 箭头（**下拉里的箭头也要换**） |
| ➕ | `Plus` | 新增 |
| 🗓 📅 | `Calendar` | 日历 |
| 🧭 🗺 | `Compass` / `MapLocation` | 导航 |
| 👁 🔎 | `View` | 查看 |
| 📎 | `Paperclip` | 附件 |
| 🔒 ⛔ | `Lock` / `CircleClose` | 锁定、禁止 |

> `Send` / `Truck` / `BarChart` / `LineChart` 在 Element Plus 中**不存在**，
> 请用 `Promotion` / `Van` / `Histogram` / `TrendCharts` 替代。

## 3. 统计卡片的写法（已改）

`StatCards` 的 `items[].icon` 现在接受 **Element Plus 图标组件名字符串**（不再是 emoji）：

```vue
<StatCards :items="[
  { label: '需求单总数', value: 16, unit: '单', icon: 'Tickets', tone: 'primary' },
  { label: '超期预警',   value: 0,  unit: '单', icon: 'Warning', tone: 'danger', tip: '期望交付时间已过但尚未完结' }
]" />
```

- `icon` 传组件名（`'Tickets'`），不要传 emoji
- **彩色底保留**（`tone` 仍生效），只把 emoji 换成线性图标
- 若某卡片不需要图标，直接省略 `icon`

## 4. 色彩规范

- 主色已改为沉稳深蓝 `#1f4e8c`（在 `tokens.css` 内，页面无需改动）
- 语义色（`success` / `warning` / `danger`）**只用于状态标签、告警、风险等级**
- 禁止新增装饰性渐变或彩色块；服务目录卡片的 `svc-card__banner` 渐变已取消，
  改为浅底 + 单色图标（见 `base.css`）

## 5. 侧栏导航已产品化

- `config.menu` **已不存在**，改为 `config.products[]`（4 个产品，各含 `menu`）
- 页面内如需读取菜单，请用 `config.products`；**不要**再引用 `config.menu`
- 侧栏不再显示分组标题（产品名已在顶部切换栏）
