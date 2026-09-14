/**
 * gen-recipes.mjs —— 由各组的迁移结果生成 src/core/recipesData.ts
 *
 * 输入：
 *   · /tmp/recipes-a.json … /tmp/recipes-e.json  —— 各组的演示说明（条目行，按清单编号重键）
 *   · 本文件底部的 MODULE_ROWS                   —— 11 个模块行（人工编写：只写"哪个角色、看哪个页面"）
 *
 * 用法：cd demo && node scripts/gen-recipes.mjs
 *
 * 输出：src/core/recipesData.ts（纯数据，供 scripts/check-recipes.mjs 静态校验）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/core/recipesData.ts')
const PARTS = ['a', 'b', 'c', 'd', 'e'].map(k => `/tmp/recipes-${k}.json`)

/* ============================================================ 模块行（人工） -- */
/*
 * 模块行不写具体操作，只回答：用哪个角色、该模块由哪些页面承载、从哪看最完整。
 */
const MODULE_ROWS = {
  '1.2.6.3.1.1': {
    mode: 'demo',
    surface: '需求申请向导 + 需求单列表 / 详情 + 工作流管理',
    rows: [
      { role: 'consumer', page: '需求申请管理', view: '用数方从「需求申请管理」走一遍 4 步向导（选择申请对象 → 填写需求信息 → 关联与附件 → 确认提交），即可看到三类交付物指引与分类分级带出；提交后在「需求单管理」看流转状态。', example: '例：XQ20260112001 医保基金监管分析-门急诊费用与就诊明细申请' },
      { role: 'supplier', page: '需求单管理、工作流管理', view: '供数方在「需求单管理」看受理 / 审批 / 派发入口；生产实施方在「工作流管理」看已审核工单的自动化部署与产物。', example: '例：XQ20260118005 医保支付方式改革评估-结算与住院数据申请（待部署工单）' }
    ]
  },
  '1.2.6.3.1.2': {
    mode: 'demo',
    surface: '变更单列表 + 变更单详情 + 可视化变更窗口',
    rows: [
      { role: 'consumer', page: '需求变更管理', view: '从「需求变更管理」列表的「新建变更单」与行操作（风险评估 / 冲突分析 / 调整实施计划 / 审批 / 完成），再进「变更单详情」看需求关联、实施计划与变更审计，即可覆盖该模块全部条目。', example: '例：BG20260125001 医疗资源专题-卫生人员数据补充字段变更' },
      { role: 'supplier', page: '可视化变更窗口', view: '供数方在「可视化变更窗口」按月历看变更与业务事件日程的叠加，确认排期冲突最小的时间窗。', example: '例：BG20260126003 医保结算增量文件服务-字段扩展变更' }
    ]
  },
  '1.2.6.3.1.3': {
    mode: 'demo',
    surface: '任务单列表 + 任务单详情抽屉',
    rows: [
      { role: 'producer', page: '任务管理', view: '生产实施方在「任务管理」按状态 / 类型 / 承接部门筛选，点任务单号打开详情，即可看全该模块（实施内容与交付标准、里程碑、进度、关联问题与审计）。', example: '例：RW20260114001 门急诊就诊明细视图加工与脱敏配置' }
    ]
  },
  '1.2.6.3.1.4': {
    mode: 'demo',
    surface: '事件列表 + 新建 / 处理抽屉 + 事件分类与模板 + 事件决策树',
    rows: [
      { role: 'desk', page: '事件管理、事件分类与模板', view: '服务台受理员在「事件管理」看多渠道录入、统一受理与分派，在「事件分类与模板」看分类树与优先级矩阵；处理抽屉里含知识推荐、关联重复事件、广播与关闭方式，一次可覆盖该模块 11 个条目。', example: '例：SJ20260125002 【数据延迟】门急诊就诊记录未按时更新（已升级）' },
      { role: 'ops', page: '事件管理', view: '运维工程师从事件详情看流转时间轴、SLA 到期时间与升级处理，并从「事件决策树」按现象逐层定位原因。', example: '例：SJ20260125001 【接口异常】医疗机构信息查询服务返回 403' }
    ]
  },
  '1.2.6.3.1.5': {
    mode: 'demo',
    surface: '问题列表 + 主动问题管理看板 + 问题详情',
    rows: [
      { role: 'ops', page: '问题管理', view: '运维工程师在「问题管理」看主动问题管理看板（状态分布 / 根因 TOP / 预防措施执行情况），点问题单号打开详情看关联、根因分析、已知错误与转知识，即可覆盖该模块 7 个条目。', example: '例：WT2026010001 门急诊就诊记录批量延迟（根因：上游采集批次缺失）' }
    ]
  },
  '1.2.6.3.1.6': {
    mode: 'demo',
    surface: '发布列表 + 发布单详情（发布包 / 升级 / 验证 / 回滚 / 审计）',
    rows: [
      { role: 'ops', page: '发布管理', view: '运维工程师在「发布管理」点发布单号打开详情，从发布内容与停机窗口 → 发布包归档 → 执行升级 → 业务验证 → 回滚 / 发布审计，一条链路即可覆盖该模块 5 个条目。', example: '例：FB20260118003 资源目录检索优化版本发布（已回滚）' }
    ]
  },
  '1.2.6.3.1.7': {
    mode: 'demo',
    surface: '知识列表（分类树 + 检索）+ 知识条目详情 / 编辑器',
    rows: [
      { role: 'ops', page: '知识库管理', view: '运维工程师在「知识库管理」用左侧分类树 + 顶部检索，点条目打开详情看富文本正文、附件、引用次数与评分评论，即可覆盖该模块 5 个条目。', example: '例：ZS2026010001 API 服务鉴权失败（401/403）排查清单' }
    ]
  },
  '1.2.6.3.1.8': {
    mode: 'demo',
    surface: '知识问答管理（待回答 / 已回答 / 待归档分组）',
    rows: [
      { role: 'ops', page: '知识问答管理', view: '运维工程师在「知识问答管理」按分组切换：待回答里发起 / 查看提问，已回答里看按线索关联的回答，待归档里选最佳答案并归档为知识条目 —— 三个条目一次看全。（清单中本模块标题下无描述，要求由 3 个子条目给出）', example: '例：WD2026010005 变更窗口中的「业务事件日程」数据来自哪里？' }
    ]
  },
  '1.2.6.3.1.9': {
    mode: 'demo',
    surface: '服务台管理（服务概况 / 统一受理台 / 事件统计 / 广播通知 / 回访调查）+ 自助服务管理',
    rows: [
      { role: 'desk', page: '服务台管理', view: '服务台受理员在「服务台管理」从上到下走：服务概况图表 → 统一受理台（三入口）→ 预定义需求类别 → 事件统计报表 → 广播通知 → 回访调查，即可覆盖该模块前 4 个条目与「统一受理、报表统计」等模块级要求。', example: '例：GB20260126001 【事件通告】门急诊就诊记录数据延迟及处置进展' },
      { role: 'consumer', page: '自助服务管理', view: '用数方在「自助服务管理」看服务目录 / 服务产品、权限矩阵、Web 提交与邮件建单说明，覆盖该模块 5–11 个条目（自助分流）。', example: '例：XQ20260124006 突发公共事件应急调度-医疗资源与急救信息申请（邮件提交）' }
    ]
  },
  '1.2.6.3.1.10': {
    mode: 'demo',
    surface: '评价列表 + 评价单 / 反馈单详情（双向可见）',
    rows: [
      { role: 'consumer', page: '评价管理', view: '用数方在「评价管理」点「提交评价」并查看自己的评价单详情；供数方在同页审批评价 / 提交反馈，审批通过后双方互见 —— 两个条目一次看全。', example: '例：PJ20260110001（评价单，关联 XQ20260112001）' },
      { role: 'supplier', page: '评价管理', view: '供数方切换视角查看「供数方反馈」侧，确认未审批内容互不可见、审批后双向可见。', example: '例：PJ20260126005（反馈单，关联 XQ20260120014）' }
    ]
  },
  '1.2.6.3.1.11': {
    mode: 'demo',
    surface: '统计分析（按事件 / 按用户 / CMDB 视角 三个页签）',
    rows: [
      { role: 'admin', page: '统计分析', view: '平台管理员在「统计分析」依次切三个页签：按事件统计（类型 / 分类 / 等级 / 状态 / 来源多维筛选）、按用户统计（用方组织 / 运维组织双视角）、CMDB 视角（按配置项汇总事件数量与等级分布）—— 清单中本模块描述要求的「从 CMDB 角度统计每一个项目、每一个设备」即由第三个页签承载。', example: '例：ci05 dwd_visit_outpatient（门急诊就诊记录，关联事件 SJ20260125002）' }
    ]
  }
}

/* 模块行补全：清单里 11 个模块中，凡迁移结果未产出模块行的，这里统一补上 */
const MODULE_FILL = {
  '1.2.6.3.1': {
    mode: 'demo',
    surface: '运营看板（全模块入口导航）',
    rows: [
      { role: 'admin', page: '运营看板', view: '平台管理员用「运营看板」可纵览本模块全貌：顶部四个产品入口（综合 / 需求受理与供给 / 运维服务管理 / 服务窗口与度量）与左侧菜单即为功能清单 11 个模块的入口；本模块共 11 个模块、57 个条目，逐条覆盖见下表各行。', example: '例：XQ20260112001 医保基金监管分析-门急诊费用与就诊明细申请（需求受理与供给入口）' }
    ]
  },
  '1.2.6.3.1.2': {
    mode: 'demo',
    surface: '变更单列表 + 变更单详情 + 可视化变更窗口',
    rows: [
      { role: 'consumer', page: '需求变更管理', view: '从「需求变更管理」列表的「新建变更单」与行操作（风险评估 / 冲突分析 / 调整实施计划 / 审批 / 完成），再进「变更单详情」看需求关联、实施计划与变更审计，即可覆盖该模块全部 7 个条目。', example: '例：BG20260125001 医疗资源专题-卫生人员数据补充字段变更' },
      { role: 'supplier', page: '可视化变更窗口', view: '供数方在「可视化变更窗口」按月历看变更与业务事件日程的叠加，确认排期冲突最小的时间窗。', example: '例：BG20260126003 医保结算增量文件服务-字段扩展变更' }
    ]
  },
  '1.2.6.3.1.4': {
    mode: 'demo',
    surface: '事件列表 + 新建 / 处理抽屉 + 事件分类与模板 + 事件决策树',
    rows: [
      { role: 'desk', page: '事件管理、事件分类与模板', view: '服务台受理员在「事件管理」看多渠道录入、统一受理与分派，在「事件分类与模板」看分类树与优先级矩阵；处理抽屉里含知识推荐、关联重复事件、广播与关闭方式，一次可覆盖该模块 11 个条目。', example: '例：SJ20260125002 【数据延迟】门急诊就诊记录未按时更新（已升级）' },
      { role: 'ops', page: '事件管理', view: '运维工程师从事件详情看流转时间轴、SLA 到期时间与升级处理，并从「事件决策树」按现象逐层定位原因。', example: '例：SJ20260125001 【接口异常】医疗机构信息查询服务返回 403' }
    ]
  },
  '1.2.6.3.1.5': {
    mode: 'demo',
    surface: '问题列表 + 主动问题管理看板 + 问题详情',
    rows: [
      { role: 'ops', page: '问题管理', view: '运维工程师在「问题管理」看主动问题管理看板（状态分布 / 根因 TOP / 预防措施执行情况），点问题单号打开详情看关联、根因分析、已知错误与转知识，即可覆盖该模块 7 个条目。', example: '例：WT2026010001 门急诊就诊记录批量延迟（根因：上游采集批次缺失）' }
    ]
  },
  '1.2.6.3.1.6': {
    mode: 'demo',
    surface: '发布列表 + 发布单详情（发布包 / 升级 / 验证 / 回滚 / 审计）',
    rows: [
      { role: 'ops', page: '发布管理', view: '运维工程师在「发布管理」点发布单号打开详情，从发布内容与停机窗口 → 发布包归档 → 执行升级 → 业务验证 → 回滚 / 发布审计，一条链路即可覆盖该模块 5 个条目。', example: '例：FB20260118003 资源目录检索优化版本发布（已回滚）' }
    ]
  },
  '1.2.6.3.1.7': {
    mode: 'demo',
    surface: '知识列表（分类树 + 检索）+ 知识条目详情 / 编辑器',
    rows: [
      { role: 'ops', page: '知识库管理', view: '运维工程师在「知识库管理」用左侧分类树 + 顶部检索，点条目打开详情看富文本正文、附件、引用次数与评分评论，即可覆盖该模块 5 个条目。', example: '例：ZS2026010001 API 服务鉴权失败（401/403）排查清单' }
    ]
  },
  '1.2.6.3.1.8': {
    mode: 'demo',
    surface: '知识问答管理（待回答 / 已回答 / 待归档分组）',
    rows: [
      { role: 'ops', page: '知识问答管理', view: '运维工程师在「知识问答管理」按分组切换：待回答里发起 / 查看提问，已回答里看按线索关联的回答，待归档里选最佳答案并归档为知识条目 —— 3 个条目一次看全。（清单中本模块标题下无描述，要求由 3 个子条目给出）', example: '例：WD2026010005 变更窗口中的「业务事件日程」数据来自哪里？' }
    ]
  },
  '1.2.6.3.1.9': {
    mode: 'demo',
    surface: '服务台管理（服务概况 / 统一受理台 / 事件统计 / 广播通知 / 回访调查）+ 自助服务管理',
    rows: [
      { role: 'desk', page: '服务台管理', view: '服务台受理员在「服务台管理」从上到下走：服务概况图表 → 统一受理台（三入口）→ 预定义需求类别 → 事件统计报表 → 广播通知 → 回访调查，即可覆盖该模块第 1–4 个条目与「统一受理、报表统计」等模块级要求。', example: '例：GB20260126001 【事件通告】门急诊就诊记录数据延迟及处置进展' },
      { role: 'consumer', page: '自助服务管理', view: '用数方在「自助服务管理」看服务目录 / 服务产品、权限矩阵、Web 提交与邮件建单说明，覆盖该模块第 5–11 个条目（自助分流）。', example: '例：XQ20260124006 突发公共事件应急调度-医疗资源与急救信息申请（邮件提交）' }
    ]
  },
  '1.2.6.3.1.9.5': {
    mode: 'demo',
    surface: '自助服务管理（服务目录 / 权限矩阵 / Web 与邮件提交 / 预定义类别）',
    rows: [
      { role: 'consumer', page: '自助服务管理', view: '用数方在「自助服务管理」一个页面即可看全自助服务能力：服务目录 / 服务产品卡片 + 权限管理矩阵 + 预定义需求类别 + Web 提交与电子邮件建单说明 —— 这些正是"帮助用户自己处理事件或完成申报、降低进入服务台的请求"的落地。', example: '例：sc05 系统故障报修（预定义类别 → 生成事件单）' },
      { role: 'admin', page: '自助服务管理', view: '平台管理员在同页「权限管理」区块维护各角色的服务可见范围，说明自助服务按权限定义可用内容。', example: '例：sc02 新增数据需求（用数方 / 供数方 / 服务台受理员 / 平台管理员可用）' }
    ]
  },
  '1.2.6.3.1.10': {
    mode: 'demo',
    surface: '评价列表 + 评价单 / 反馈单详情（双向可见）',
    rows: [
      { role: 'consumer', page: '评价管理', view: '用数方在「评价管理」点「提交评价」并查看自己的评价单详情；供数方在同页审批评价 / 提交反馈，审批通过后双方互见 —— 2 个条目一次看全。', example: '例：PJ20260110001（评价单，关联 XQ20260112001）' },
      { role: 'supplier', page: '评价管理', view: '供数方切换视角查看「供数方反馈」侧，确认未审批内容互不可见、审批后双向可见。', example: '例：PJ20260126005（反馈单，关联 XQ20260120014）' }
    ]
  }
}

/* ============================================================ 读取与合并 -- */
const merged = {}
const seen = new Map()
for (const p of PARTS) {
  if (!fs.existsSync(p)) { console.warn(`⚠️  缺少 ${p}（跳过）`); continue }
  const obj = JSON.parse(fs.readFileSync(p, 'utf8'))
  for (const [code, rec] of Object.entries(obj)) {
    if (merged[code]) {
      // 同一条目被两组迁到同一个编号时，合并 rows 并去重
      const a = JSON.stringify(merged[code].rows)
      const b = JSON.stringify(rec.rows)
      if (a !== b) {
        console.warn(`ℹ️  ${code} 有两组结果，合并去重`)
        const key = r => JSON.stringify(r)
        const rows = [...merged[code].rows, ...rec.rows]
        const uniq = []
        const seenRow = new Set()
        for (const r of rows) { const k = key(r); if (!seenRow.has(k)) { seenRow.add(k); uniq.push(r) } }
        merged[code].rows = uniq
      }
    } else {
      merged[code] = rec
    }
  }
}
for (const [code, rec] of Object.entries(MODULE_ROWS)) {
  // 模块行以本文件为准（迁移结果即使给了同编号内容也覆盖，保证行形状统一）
  merged[code] = { isModule: true, ...rec }
}
for (const [code, rec] of Object.entries(MODULE_FILL)) {
  if (!merged[code]) merged[code] = { isModule: true, ...rec }
}
/* 模块行白名单：只有清单的 1.2.6.3.1 与 1.2.6.3.1.N（N 为模块序号）是模块行；
   其余一律是条目行（迁移结果里可能被误标 isModule） */
const isModuleCode = c => /^1\.2\.6\.3\.1(\.[0-9]{1,2})?$/.test(c)
for (const [code, rec] of Object.entries(merged)) {
  if (rec.isModule && !isModuleCode(code)) {
    const rows = rec.rows.filter(r => Array.isArray(r.ops))
    merged[code] = { mode: rec.mode ?? 'demo', surface: rec.surface, rows }
  }
}
/* 反向兜底：模块行必须标 isModule，且 rows 用模块行形状 */
for (const [code, rec] of Object.entries(merged)) {
  if (isModuleCode(code) && !rec.isModule) {
    const rows = rec.rows.filter(r => typeof r.view === 'string')
    if (rows.length) merged[code] = { mode: rec.mode ?? 'demo', surface: rec.surface, isModule: true, rows }
  }
}
for (const code of Object.keys(merged)) seen.set(code, true)

/* ============================================================ 输出 -- */
const q = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"
const nullable = v => (v === null || v === undefined || v === '' ? 'null' : q(v))

function emitRows(rec) {
  if (rec.isModule) {
    return rec.rows.map(r => `      {\n        role: ${q(r.role)},\n        page: ${q(r.page)},\n        view: ${q(r.view)},\n        example: ${nullable(r.example)}\n      }`).join(',\n')
  }
  return rec.rows.map(r => {
    const ops = (r.ops ?? []).map(o => `          ${q(o)}`).join(',\n')
    return `      {\n        role: ${q(r.role)},\n        roleLabel: ${nullable(r.roleLabel)},\n        page: ${q(r.page)},\n        detail: ${nullable(r.detail)},\n        ops: [\n${ops}\n        ],\n        evidence: ${nullable(r.evidence)},\n        example: ${nullable(r.example)}\n      }`
  }).join(',\n')
}

const codes = Object.keys(merged)
const blocks = codes.map(code => {
  const rec = merged[code]
  const head = `  ${q(code)}: {\n    isModule: ${rec.isModule ? 'true' : 'false'},\n    mode: ${q(rec.mode ?? 'demo')},\n    surface: ${nullable(rec.surface)}`
  return `${head},\n    rows: [\n${emitRows(rec)}\n    ]${rec.note ? `,\n    note: ${q(rec.note)}` : ''}\n  }`
})

const file = `/**
 * recipesData —— 功能点覆盖说明（演示说明数据，纯数据）
 *
 * 键 = 功能清单编号（core/featureList.ts 的 code），与 coverageRows 一一对应。
 * 由 scripts/gen-recipes.mjs 生成：条目行来自各组迁移结果，模块行为人工编写（只写角色 / 页面 / 看什么最完整）。
 * 约束：page 取 core/config.ts 菜单标题；ops / evidence / view 的词必须能在对应 src/views/*.vue 找到；
 *       example 必须真实存在于 mock/seed.ts —— 由 scripts/check-recipes.mjs 校验，请勿手改本文件。
 */
import type { Recipe } from './recipes'

export const recipes: Record<string, Recipe> = {
${blocks.join(',\n')}
}
`
fs.writeFileSync(OUT, file)
console.log(`✅ 已生成 ${path.relative(process.cwd(), OUT)}：${codes.length} 条`)
console.log(`   其中模块行 ${codes.filter(c => merged[c].isModule).length} 条、条目行 ${codes.filter(c => !merged[c].isModule).length} 条`)
