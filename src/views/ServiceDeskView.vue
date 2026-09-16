<script setup lang="ts">
/**
 * ServiceDeskView —— 服务台管理（M10）
 *
 * 覆盖原文功能点：
 *  · 服务台管理（总述 8.5）：为经办机构、医疗机构以及系统运维人员提供统一的工作环境；
 *    通过服务台统一受理各类事件或服务请求；使记录、分派、监督通知、解决方案记录、
 *    报表统计等过程电子化、自动化。
 *  · 服务概况（8.1）：按事件类型、处理状态、处理人员、组织结构统计分析并用图形显示。
 *  · 广播通知（8.2）：向指定人员或群组发送广播通知（或短信），方式含电子邮件、短信。
 *  · 事件统计（8.3）：自定义起止时间查询与报表定制；按小时/日/周/月/年不同时间梯度汇总。
 *  · 回访调查（8.4）：处理完毕的服务请求自动产生回访调查，由最终用户填写反馈意见与评分。
 */
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDemoStore, dictItem } from '@/stores/demo'
import { config } from '@/core/config'
import { ticketKindOf } from '@/core/serviceCatalog'
import {
  addDays, by, countBy, fmtDate, fmtTime, fromNow, hoursAgo, iso, today, toDate, truncate
} from '@/core/utils'
import type { ChartTone } from '@/core/chart'
import PageHead from '@/components/PageHead.vue'
import StatCards from '@/components/StatCards.vue'
import StatusTag from '@/components/StatusTag.vue'
import ChartBox from '@/components/ChartBox.vue'

const store = useDemoStore()
const router = useRouter()

/** 安全数组（单据数据为宽松结构，统一收敛为 any[]，便于模板中安全访问） */
const arrAny = (v: unknown): any[] => (Array.isArray(v) ? v : [])

/* ============================================================ 通用工具 -- */
const dictLabel = (dict: string, key?: string) => dictItem(dict, key).label

/** 服务台受理/广播权限（无权限时按钮隐藏并给出提示） */
const canDesk = computed(() => store.can('desk.manage'))

/** CSV 导出（前端生成，失败时兜底为提示） */
function downloadCsv(filename: string, rows: (string | number)[][]) {
  try {
    const csv = '\ufeff' + rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    ElMessage.success(`已导出「${filename}」`)
  } catch {
    ElMessage.warning('当前浏览器限制了文件下载，导出未能完成')
  }
}

/* ======================================================== 指标（服务台） -- */
const pendingIntake = computed(() => intakeOf('WEB').length + intakeOf('EMAIL').length + intakeOf('SELF').length)
const stats = computed(() => {
  const incidents = store.table('incidents') as any[]
  const callbacks = store.table('callbacks') as any[]
  const open = incidents.filter(i => !['RESOLVED', 'CLOSED'].includes(i.status)).length
  const overdue = incidents.filter(i => !['RESOLVED', 'CLOSED'].includes(i.status) && i.slaDueAt && hoursAgo(i.slaDueAt) > 0).length
  const todoCb = callbacks.filter(c => c.status === '待回访').length
  const scored = callbacks.filter(c => typeof c.score === 'number')
  const avg = scored.length ? (scored.reduce((s, c) => s + Number(c.score), 0) / scored.length).toFixed(1) : '—'
  return [
    { label: '待受理请求', value: pendingIntake.value, unit: '单', icon: 'Tickets', tone: 'warning' as const, tip: 'Web / 邮件 / 自助服务三个入口合计' },
    { label: '未闭环事件', value: open, unit: '单', icon: 'Warning', tone: 'danger' as const, delta: `累计 ${incidents.length} 单（含历史）` },
    { label: 'SLA 超期预警', value: overdue, unit: '单', icon: 'Timer', tone: 'purple' as const, tip: '已过 SLA 期限仍未解决的事件' },
    { label: '待回访调查', value: todoCb, unit: '条', icon: 'Phone', tone: 'info' as const, tip: '处理完毕后自动产生，等待用户填写' },
    { label: '回访平均分', value: avg, unit: '分', icon: 'Star', tone: 'success' as const, delta: `已回收 ${scored.length} 条` },
    { label: '广播通知', value: (store.table('broadcasts') as any[]).length, unit: '条', icon: 'Promotion', tone: 'teal' as const, delta: '支持站内 / 邮件 / 短信' }
  ]
})

/* ============================================== 8.5 统一受理台（四入口） -- */
type IntakeRow = {
  kind: 'demand' | 'incident'
  id: string
  no: string
  title: string
  source: string
  sourceLabel: string
  submittedAt: string
  urgency: string
  sub: string
  raw: any
}

const INTAKE_TABS = [
  { key: 'WEB', label: 'Web 提交', desc: '三医服务窗口提交的服务申请 / 故障申诉' },
  { key: 'EMAIL', label: '邮件提交', desc: '服务台邮箱自动解析后建单' },
  { key: 'SELF', label: '自助服务', desc: '自助服务门户提交的需求' },
  { key: 'INCIDENT', label: '客户端申报', desc: '客户端 / 微信 / 邮件等渠道申报的事件单' }
]
const intakeTab = ref('WEB')

function demandRow(d: any): IntakeRow {
  return {
    kind: 'demand', id: d.id, no: d.no, title: d.title,
    source: d.source, sourceLabel: dictLabel('DemandSource', d.source),
    submittedAt: d.submittedAt, urgency: d.priority,
    sub: `${d.applicant} · ${d.applicantOrg}`, raw: d
  }
}
function incidentRow(i: any): IntakeRow {
  return {
    kind: 'incident', id: i.id, no: i.no, title: i.title,
    source: i.source, sourceLabel: i.source,
    submittedAt: arrAny(i.timeline)[0]?.at ?? i.slaDueAt, urgency: i.priority,
    sub: `${i.categoryName} · 影响：${i.impact}`, raw: i
  }
}

function intakeOf(key: string): IntakeRow[] {
  const demands = store.table('demands') as any[]
  const incidents = store.table('incidents') as any[]
  if (key === 'WEB') return demands.filter(d => d.source === 'WEB' && d.status === 'PENDING_ACCEPT').map(demandRow)
  if (key === 'EMAIL') return demands.filter(d => d.source === 'EMAIL').map(demandRow)
  if (key === 'SELF') return demands.filter(d => d.source === 'SELF').map(demandRow)
  return incidents.filter(i => i.status === 'NEW').map(incidentRow)
}

const intakeRows = computed<IntakeRow[]>(() => by(intakeOf(intakeTab.value), 'submittedAt', 'desc'))

/* ================================ 预定义需求类别（原文 9.6 的类别落地） -- */
/**
 * 「预定义需求类别」= 服务目录项（catalogItems）：类别 / 名称 / 描述 / 动态界面字段 / 激活流程 / 可申请角色。
 * 服务台既是统一受理方（按类别识别请求类型），也是类别的维护方：
 * 本页右上「配置需求类别」打开配置抽屉，可新增 / 编辑 / 删除类别；
 * 自助服务管理只做申请侧展示（类别定义 + 去申请），避免同一份配置两处维护。
 */
const catalogItems = computed(() => store.table('catalogItems') as any[])
const workflows = computed(() => store.table('workflows') as any[])
const flowNameOf = (id: string) => workflows.value.find(w => w.id === id)?.name ?? id
const presetCategories = computed(() => catalogItems.value.map(i => {
  const fields = arrAny(i.formSchema)
  const kind = ticketKindOf(i.category)
  return {
    id: i.id,
    name: i.name,
    category: i.category,
    desc: i.desc,
    fieldCount: fields.length,
    requiredCount: fields.filter((s: any) => s.required).length,
    flowName: flowNameOf(i.flowId),
    roles: arrAny(i.allowedRoles).map((id: string) => store.roles.find(r => r.id === id)?.name ?? id),
    kind
  }
}))
/** 自助 / 邮件 / Web 入口提交的需求单，按「服务产品名 + （来源提交）」回推预定义类别 */
function categoryOfDemand(d: any): string {
  const title = String(d?.title ?? '')
  const hit = presetCategories.value.find(c => title.includes(c.name))
  return hit ? hit.name : (d?.kind === 'NEW' ? '新增数据需求' : '数据资源申请')
}

/* ---------------------------------------- 类别配置抽屉（新增 / 编辑 / 删除） -- */
const canConfigCatalog = computed(() => store.can('service.catalog.config'))
const catDrawer = ref(false)
const catEditing = ref(false)
const catEditId = ref('')
/** 编辑草稿：新增时 id 为空；保存时整体写回服务目录项 */
const catForm = reactive<{ category: string; name: string; desc: string; flowId: string; allowedRoles: string[]; formSchema: any[] }>({
  category: '数据服务', name: '', desc: '', flowId: '', allowedRoles: [], formSchema: []
})
const FIELD_TYPES = [
  { value: 'text', label: '单行文本' },
  { value: 'textarea', label: '多行文本' },
  { value: 'select', label: '下拉选择' },
  { value: 'search', label: '搜索选择' },
  { value: 'number', label: '数字' },
  { value: 'date', label: '日期' }
]
/** 可选的类别分组：既有取值 + 三个预置类别（9.6 的「故障 / 服务申请」两大类） */
const categoryOptions = computed(() => Array.from(new Set([
  ...catalogItems.value.map(i => String(i.category)), '数据服务', '故障申诉', '权限服务'
])))

function openCategoryDrawer() {
  if (!canConfigCatalog.value) {
    ElMessage.warning(`当前角色「${store.role.name}」无「服务目录与类别配置」权限，无法配置预定义需求类别`)
    return
  }
  catEditing.value = false
  catDrawer.value = true
}
function newCategory() {
  catEditId.value = ''
  Object.assign(catForm, {
    category: categoryOptions.value[0] ?? '数据服务', name: '', desc: '',
    flowId: workflows.value[0]?.id ?? '', allowedRoles: ['consumer'],
    formSchema: [{ key: '', label: '', type: 'text', required: true }]
  })
  catEditing.value = true
}
function editCategory(row: any) {
  const rec = store.findById('catalogItems', row.id)
  if (!rec) { ElMessage.warning('该类别已不存在，请刷新后重试'); return }
  catEditId.value = rec.id
  Object.assign(catForm, {
    category: rec.category, name: rec.name, desc: rec.desc, flowId: rec.flowId,
    allowedRoles: [...arrAny(rec.allowedRoles)],
    formSchema: arrAny(rec.formSchema).map((s: any) => ({ ...s, options: s.options ? [...s.options] : undefined }))
  })
  catEditing.value = true
}
function cancelCategoryEdit() { catEditing.value = false; catEditId.value = '' }
function addField() { catForm.formSchema.push({ key: '', label: '', type: 'text', required: true }) }
function removeField(i: number) { catForm.formSchema.splice(i, 1) }
function moveField(i: number, delta: number) {
  const t = i + delta
  if (t < 0 || t >= catForm.formSchema.length) return
  const [row] = catForm.formSchema.splice(i, 1)
  catForm.formSchema.splice(t, 0, row)
}
/** 下拉字段的选项：编辑态用「、」分隔的文本，保存时拆成数组 */
function optionsText(s: any) { return arrAny(s.options).join('、') }
function setOptions(s: any, text: string) {
  s.options = String(text).split(/[、,，]/).map(t => t.trim()).filter(Boolean)
}

function saveCategory() {
  if (!canConfigCatalog.value) {
    ElMessage.warning(`当前角色「${store.role.name}」无「服务目录与类别配置」权限，无法保存`)
    return
  }
  const category = String(catForm.category ?? '').trim()
  const name = String(catForm.name ?? '').trim()
  const desc = String(catForm.desc ?? '').trim()
  if (!category) { ElMessage.warning('请填写类别名称'); return }
  if (!name) { ElMessage.warning('请填写需求类别名称'); return }
  if (!desc) { ElMessage.warning('请填写需求类别描述'); return }
  if (!catForm.flowId) { ElMessage.warning('请选择该类别激活的处理流程'); return }
  const fields = arrAny(catForm.formSchema)
  if (!fields.length) { ElMessage.warning('至少需要保留 1 个界面字段'); return }
  const keys = new Set<string>()
  for (const s of fields) {
    const k = String(s.key ?? '').trim()
    const label = String(s.label ?? '').trim()
    if (!k || !label) { ElMessage.warning('界面字段的「字段标识」与「字段名称」都不能为空'); return }
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(k)) { ElMessage.warning(`字段标识「${k}」只能以字母开头，且只含字母 / 数字 / 下划线`); return }
    if (keys.has(k)) { ElMessage.warning(`字段标识「${k}」重复，请换一个`); return }
    keys.add(k)
    if (s.type === 'select' && !arrAny(s.options).length) { ElMessage.warning(`下拉字段「${label}」至少需要 1 个选项（用「、」分隔）`); return }
  }
  const patch = {
    category, name, desc, flowId: catForm.flowId,
    allowedRoles: [...arrAny(catForm.allowedRoles)],
    formSchema: fields.map(s => ({
      key: String(s.key).trim(), label: String(s.label).trim(), type: s.type, required: !!s.required,
      ...(s.type === 'select' ? { options: arrAny(s.options) } : {})
    }))
  }
  if (catEditId.value) {
    const rec = store.findById('catalogItems', catEditId.value)
    if (!rec) { ElMessage.warning('该类别已不存在，请刷新后重试'); cancelCategoryEdit(); return }
    store.update('catalogItems', catEditId.value, patch, { action: '配置需求类别', remark: patch.name })
    ElMessage.success(`已保存「${patch.name}」，自助服务管理的类别表与申请表单已同步更新`)
  } else {
    const rec = store.insert('catalogItems', {
      name: patch.name, category: patch.category, icon: 'Grid', banner: '', desc: patch.desc,
      introHtml: '', availability: '99.9%', serviceTime: '7×24 小时',
      flowId: patch.flowId, allowedRoles: patch.allowedRoles, formSchema: patch.formSchema
    })
    // insert 不写审计，这里补一条，保证新增类别同样可追溯
    // （addAudit 只改内存，需显式 persist，否则刷新前这条留痕不在 localStorage 里）
    store.addAudit({
      bizType: 'catalogItems', bizId: rec.id, bizNo: rec.id, bizTitle: rec.name,
      action: '新增需求类别', remark: `${patch.category} · 生成${ticketKindOf(patch.category)}`
    })
    store.persist()
    ElMessage.success(`已新增类别「${patch.name}」，自助服务管理中立即可申请`)
  }
  cancelCategoryEdit()
}
function removeCategory(row: any) {
  if (!canConfigCatalog.value) { ElMessage.warning(`当前角色「${store.role.name}」无「服务目录与类别配置」权限，无法删除`); return }
  ElMessageBox.confirm(
    `确认删除预定义需求类别「${row.name}」？删除后自助服务管理不再展示该类别，已生成的历史单据不受影响。`,
    '删除需求类别', { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' }
  ).then(() => {
    if (catEditId.value === row.id) cancelCategoryEdit()
    store.remove('catalogItems', row.id, { bizType: 'catalogItems', remark: row.name })
    ElMessage.success(`已删除类别「${row.name}」`)
  }).catch(() => { /* 取消 */ })
}

/** 事件分类 → 自动分派组（按分类自动分派） */
function autoAssignOf(inc: any): string {
  const cat = (store.table('incidentCategories') as any[]).find(c => c.id === inc?.categoryId || c.name === inc?.categoryName)
  return cat?.autoAssign ?? '运维中心 · 一线支持组'
}

function doAccept(row: IntakeRow) {
  if (row.kind === 'demand') {
    store.update('demands', row.id,
      { status: 'PENDING_APPROVE', acceptedAt: iso(), currentHandler: store.user.name },
      { action: '服务台受理', remark: '统一受理台受理，材料齐全，转资源归属方审批' })
    store.pushTimeline(row.raw, { action: '服务台受理', comment: '统一受理台受理，转资源归属方审批' })
    store.notify({
      type: 'info', title: `需求单 ${row.no} 已受理`,
      body: `您的需求「${row.title}」已被服务台受理，进入资源归属方审批环节。`,
      toRoles: ['consumer', 'supplier'], link: `/demand/detail/${row.id}`
    })
    ElMessage.success(`已受理需求单 ${row.no}，流转至「待审批」`)
  } else {
    const group = autoAssignOf(row.raw)
    store.update('incidents', row.id,
      { status: 'DISPATCHED', handlerGroup: group, handler: group.includes('一线') ? '徐鹏' : '陈志刚' },
      { action: '服务台受理并分派', remark: `按事件分类自动分派至 ${group}` })
    store.pushTimeline(row.raw, { action: '服务台受理并派发', comment: `按分类规则自动分派至 ${group}` })
    store.notify({
      type: 'info', title: `事件单 ${row.no} 已受理`,
      body: `您申报的「${row.title}」已受理并分派至 ${group}。`,
      toRoles: ['consumer', 'ops'], link: `/incident/detail/${row.id}`
    })
    ElMessage.success(`已受理事件单 ${row.no}，已自动分派至${group}`)
  }
}

async function doDispatch(row: IntakeRow) {
  const preset = row.kind === 'incident' ? autoAssignOf(row.raw) : '张建国（资源归属方）'
  try {
    const { value } = await ElMessageBox.prompt('请填写处理人 / 处理组', `分派 ${row.no}`, {
      confirmButtonText: '确认分派', cancelButtonText: '取消', inputValue: preset
    })
    if (row.kind === 'incident') {
      store.update('incidents', row.id, { status: 'DISPATCHED', handlerGroup: value },
        { action: '手工分派', remark: `服务台手工分派至 ${value}` })
      store.pushTimeline(row.raw, { action: '服务台分派', comment: `分派至 ${value}` })
    } else {
      store.update('demands', row.id,
        { status: 'PENDING_APPROVE', acceptedAt: iso(), currentHandler: value },
        { action: '服务台分派', remark: `分派处理人：${value}` })
      store.pushTimeline(row.raw, { action: '服务台分派', comment: `分派处理人：${value}` })
    }
    ElMessage.success(`已分派给「${value}」`)
  } catch { /* 取消 */ }
}

async function doReturn(row: IntakeRow) {
  try {
    const { value } = await ElMessageBox.prompt('请填写退回原因（将通知申报人）', `退回 ${row.no}`, {
      confirmButtonText: '确认退回', cancelButtonText: '取消', inputType: 'textarea',
      inputValue: '申请信息不完整，请补充业务场景、使用期限与目标资源后重新提交。'
    })
    if (row.kind === 'demand') {
      store.update('demands', row.id, { status: 'REJECTED', rejectReason: value },
        { action: '受理退回', remark: value })
      store.pushTimeline(row.raw, { action: '服务台退回', comment: value })
      store.notify({
        type: 'warning', title: `需求单 ${row.no} 被退回`, body: `退回原因：${value}`,
        toRoles: ['consumer'], link: `/demand/detail/${row.id}`
      })
    } else {
      store.update('incidents', row.id, { status: 'CLOSED', closeType: '自动关闭', resolvedAt: iso() },
        { action: '受理退回', remark: value })
      store.pushTimeline(row.raw, { action: '服务台退回申报人', comment: value })
    }
    ElMessage.warning('已退回，原因已通知申报人')
  } catch { /* 取消 */ }
}

/* ================================================= 8.1 服务概况（图形） -- */
const overviewRange = ref<'7' | '30' | 'all'>('30')
const rankMode = ref<'group' | 'handler'>('group')
const kindOf = reactive<Record<'type' | 'status' | 'rank' | 'org', 'donut' | 'bar' | 'hbar'>>({
  type: 'donut', status: 'bar', rank: 'hbar', org: 'bar'
})
const KIND_OPTS = [
  { value: 'donut', label: '环形' },
  { value: 'bar', label: '柱状' },
  { value: 'hbar', label: '条形' }
]

function incidentDate(i: any): Date | null {
  if (typeof i?.__dayOffset === 'number') return addDays(today(), i.__dayOffset)
  return toDate(arrAny(i?.timeline)[0]?.at) ?? toDate(i?.slaDueAt) ?? toDate(i?.resolvedAt)
}

/** 申报人所属组织（原文：按组织结构统计） */
function requesterOrg(i: any): string {
  const actor = String(arrAny(i?.timeline)[0]?.actor ?? '')
  const u = (store.table('users') as any[]).find(x => x.name === actor)
  if (u) return u.org
  if (actor === store.user.name) return store.user.org   // 登录账号不在演示人员名录内
  if (/服务台|邮箱/.test(actor)) return '三医数据底座服务台'
  if (/系统|网关/.test(actor)) return '平台运营中心'
  return '其他来源'
}

const overviewRows = computed(() => {
  const rows = store.table('incidents') as any[]
  if (overviewRange.value === 'all') return rows
  const days = Number(overviewRange.value)
  return rows.filter(i => {
    const d = incidentDate(i)
    return !d || hoursAgo(d) <= days * 24
  })
})

const byType = computed<ChartTone[]>(() => {
  const c = countBy(overviewRows.value, 'categoryName')
  return by(Object.entries(c).map(([name, value]) => ({ name, value })), 'value', 'desc')
})
const byStatus = computed<ChartTone[]>(() => {
  const c = countBy(overviewRows.value, 'status')
  const order = Object.keys(config.flowIndex.Incident)
  const keys = order.filter(k => c[k]).concat(Object.keys(c).filter(k => !order.includes(k)))
  return keys.map(k => ({ name: dictLabel('IncidentStatus', k), value: c[k] }))
})
const byRank = computed<ChartTone[]>(() => {
  const c = countBy(overviewRows.value, rankMode.value === 'group' ? 'handlerGroup' : 'handler')
  return by(Object.entries(c).map(([name, value]) => ({ name, value })), 'value', 'desc').slice(0, 8)
})
const byOrg = computed<ChartTone[]>(() => {
  const c = countBy(overviewRows.value, (i: any) => requesterOrg(i))
  return by(Object.entries(c).map(([name, value]) => ({ name, value })), 'value', 'desc').slice(0, 8)
})

/* ================================================= 8.2 广播通知 -- */
const bcDialog = ref(false)
const bcForm = reactive({
  title: '', content: '', targetType: 'GROUP' as 'GROUP' | 'ORG' | 'USER',
  targetIds: [] as string[], channels: ['站内'] as string[]
})
const TARGET_TYPES = [
  { value: 'GROUP', label: '按群组' },
  { value: 'ORG', label: '按组织' },
  { value: 'USER', label: '按具体人员' }
]
const GROUP_OPTIONS = ['全部用户', '用数方', '供数方', '订阅方', '运维工程师', '服务台']
const targetOptions = computed(() => {
  if (bcForm.targetType === 'GROUP') return GROUP_OPTIONS.map(v => ({ value: v, label: v }))
  if (bcForm.targetType === 'ORG') return (store.table('orgs') as any[]).map(o => ({ value: o.name, label: `${o.name}（${o.short}）` }))
  return (store.table('users') as any[]).map(u => ({ value: u.id, label: `${u.name} · ${u.org}` }))
})
const channels = ['站内', '邮件', '短信']

/** 目标群组 → 接收角色（用于"广播送达后在角色消息中心可见"） */
const GROUP_ROLES: Record<string, string[]> = {
  全部用户: ['consumer', 'supplier', 'desk', 'ops', 'producer', 'admin'],
  用数方: ['consumer'], 供数方: ['supplier'], 订阅方: ['consumer', 'supplier'],
  运维工程师: ['ops', 'desk'], 服务台: ['desk']
}

function openBroadcast() {
  bcForm.title = ''
  bcForm.content = ''
  bcForm.targetType = 'GROUP'
  bcForm.targetIds = ['全部用户']
  bcForm.channels = ['站内']
  bcDialog.value = true
}

function sendBroadcast() {
  if (!bcForm.title.trim()) { ElMessage.warning('请填写广播标题'); return }
  if (!bcForm.content.trim()) { ElMessage.warning('请填写广播内容'); return }
  if (!bcForm.targetIds.length) { ElMessage.warning('请选择通知目标'); return }
  if (!bcForm.channels.length) { ElMessage.warning('请至少选择一种通知渠道'); return }

  const seq = (store.table('broadcasts') as any[]).length + 1
  const no = 'GB' + today().replace(/-/g, '') + String(seq).padStart(3, '0')
  const rec = store.insert('broadcasts', {
    no, title: bcForm.title, content: bcForm.content,
    targets: [{ type: bcForm.targetType, ids: bcForm.targetIds.slice() }],
    channels: bcForm.channels.slice(),
    sender: store.user.name, senderOrg: store.user.org,
    sentAt: iso(), readBy: [], status: 'NEW', relatedId: null
  })

  const toRoles: string[] = []
  const toUsers: string[] = []
  if (bcForm.targetType === 'GROUP') {
    bcForm.targetIds.forEach(g => (GROUP_ROLES[g] ?? []).forEach(r => { if (!toRoles.includes(r)) toRoles.push(r) }))
  } else if (bcForm.targetType === 'ORG') {
    ;(store.table('users') as any[]).filter(u => bcForm.targetIds.includes(u.org)).forEach(u => toUsers.push(u.id))
  } else {
    bcForm.targetIds.forEach(id => toUsers.push(id))
  }

  store.notify({
    type: 'info', title: `【广播】${bcForm.title}`,
    body: truncate(bcForm.content, 60),
    toRoles, to: toUsers, channels: bcForm.channels.slice(), link: '/service-desk'
  })
  ElMessage.success(`广播「${bcForm.title}」已通过 ${bcForm.channels.join(' / ')} 发送（${no}）`)
  bcDialog.value = false
  void rec
}

function remindUnread(row: any) {
  const unread = Math.max(0, (store.table('users') as any[]).length - arrAny(row.readBy).length)
  store.notify({
    type: 'warning', title: `【催办】${row.title}`,
    body: `该广播仍有 ${unread} 人未读，已通过站内 + 邮件再次提醒。`,
    toRoles: ['consumer', 'supplier', 'ops'], link: '/service-desk'
  })
  ElMessage.info(`已对未读人员再次提醒（${unread} 人）`)
}

const targetText = (row: any) => arrAny(row.targets).map((t: any) => `${t.type === 'GROUP' ? '群组' : t.type === 'ORG' ? '组织' : '人员'}：${arrAny(t.ids).join('、')}`).join('；')

/* ================================================= 8.3 事件统计报表 -- */
const GRADS = [
  { value: 'hour', label: '按小时' }, { value: 'day', label: '按日' },
  { value: 'week', label: '按周' }, { value: 'month', label: '按月' }, { value: 'year', label: '按年' }
] as const
type Grad = typeof GRADS[number]['value']
const grad = ref<Grad>('day')
const statRange = ref<any>([fmtDate(addDays(today(), -29)), today()])
const DIM_OPTS = [
  { value: 'status', label: '状态' }, { value: 'severity', label: '等级' },
  { value: 'source', label: '来源' }, { value: 'category', label: '分类' }
]
const statDims = ref<string[]>(['status', 'severity'])

const statRows = computed(() => {
  const [s, e] = (statRange.value ?? ['', '']) as [string, string]
  return (store.table('incidents') as any[]).filter(i => {
    if (!s || !e) return true
    const d = incidentDate(i)
    if (!d) return true
    const ds = fmtDate(d)
    return ds >= s && ds <= e
  })
})

function weekStart(d: Date): Date {
  const x = new Date(d.getTime())
  const wd = (x.getDay() + 6) % 7
  x.setDate(x.getDate() - wd)
  return x
}

const statBuckets = computed<{ key: string; label: string }[]>(() => {
  if (grad.value === 'hour') {
    return Array.from({ length: 24 }, (_, h) => ({ key: 'h' + h, label: String(h).padStart(2, '0') + '时' }))
  }
  const [s, e] = (statRange.value ?? ['', '']) as [string, string]
  const sd = toDate(s) ?? addDays(today(), -29)
  const ed = toDate(e) ?? toDate(today()) ?? addDays(today(), 0)
  const out: { key: string; label: string }[] = []
  if (grad.value === 'day') {
    for (let d = new Date(sd.getTime()); d <= ed; d = addDays(d, 1)) out.push({ key: fmtDate(d), label: fmtDate(d).slice(5) })
    return out.length > 62 ? out.slice(-62) : out
  }
  if (grad.value === 'week') {
    for (let d = weekStart(sd); d <= ed; d = addDays(d, 7)) out.push({ key: fmtDate(d), label: fmtDate(d).slice(5) + ' 起' })
    return out
  }
  if (grad.value === 'month') {
    const d = new Date(sd.getFullYear(), sd.getMonth(), 1)
    while (d <= ed) { out.push({ key: fmtDate(d).slice(0, 7), label: fmtDate(d).slice(0, 7) }); d.setMonth(d.getMonth() + 1) }
    return out
  }
  for (let y = sd.getFullYear(); y <= ed.getFullYear(); y++) out.push({ key: String(y), label: y + ' 年' })
  return out
})

/** 按小时梯度优先使用事件自带的 __hour 字段（种子数据为近 7 天 24 小时分布） */
function bucketKeyOf(i: any): string {
  if (grad.value === 'hour') {
    if (typeof i?.__hour === 'number') return 'h' + i.__hour
    const hd = incidentDate(i)
    return hd ? 'h' + hd.getHours() : ''
  }
  const d = incidentDate(i)
  if (!d) return ''
  if (grad.value === 'day') return fmtDate(d)
  if (grad.value === 'week') return fmtDate(weekStart(d))
  if (grad.value === 'month') return fmtDate(d).slice(0, 7)
  return String(d.getFullYear())
}

const statSeries = computed<ChartTone[]>(() => {
  const c = countBy(statRows.value, (i: any) => bucketKeyOf(i))
  return statBuckets.value.map(b => ({ name: b.label, value: c[b.key] ?? 0 }))
})

const statTotal = computed(() => statSeries.value.reduce((s, r) => s + r.value, 0))

function dimData(dim: string): ChartTone[] {
  let c: Record<string, number>
  if (dim === 'status') c = countBy(statRows.value, (i: any) => dictLabel('IncidentStatus', i.status))
  else if (dim === 'severity') c = countBy(statRows.value, (i: any) => dictLabel('Severity', i.severity))
  else if (dim === 'source') c = countBy(statRows.value, 'source')
  else {
    const cats = store.table('incidentCategories') as any[]
    c = countBy(statRows.value, (i: any) => cats.find(x => x.id === i.categoryId)?.name ?? i.categoryName ?? '其他')
  }
  return by(Object.entries(c).map(([name, value]) => ({ name, value })), 'value', 'desc')
}
const dimCharts = computed(() => statDims.value.map(d => ({ key: d, label: DIM_OPTS.find(o => o.value === d)?.label ?? d, data: dimData(d) })))

function exportReport() {
  const rows: (string | number)[][] = [['时间梯度', GRADS.find(g => g.value === grad.value)?.label ?? '', '统计区间', `${statRange.value?.[0] ?? ''} ~ ${statRange.value?.[1] ?? ''}`, '合计', statTotal.value]]
  rows.push(['时间', '事件数'])
  statSeries.value.forEach(r => rows.push([r.name, r.value]))
  statDims.value.forEach(d => {
    rows.push([], [d, '数量'])
    dimData(d).forEach(r => rows.push([r.name, r.value]))
  })
  downloadCsv(`服务台事件统计_${grad.value}_${today()}.csv`, rows)
}

/* ================================================= 8.4 回访调查 -- */
const cbDialog = ref(false)
const cbForm = reactive({ id: '', score: 5, comment: '' })
const cbRow = ref<any>(null)

function openCallback(row: any) {
  cbRow.value = row
  cbForm.id = row.id
  cbForm.score = typeof row.score === 'number' ? row.score : 5
  cbForm.comment = row.comment || ''
  cbDialog.value = true
}

function submitCallback() {
  const row = cbRow.value
  if (!row) return
  if (!cbForm.comment.trim()) { ElMessage.warning('请填写反馈意见'); return }
  const patch = { score: cbForm.score, comment: cbForm.comment, status: '已回访', repliedAt: iso() }
  store.update('callbacks', row.id, patch, { action: '用户填写回访调查', remark: `评分 ${cbForm.score} 分：${truncate(cbForm.comment, 40)}` })

  /* 同步到对应单据 / 评价 */
  let synced = ''
  if (row.ticketType === '需求单') {
    const ev = (store.table('evaluations') as any[]).find(e => e.demandId === row.ticketId)
    if (ev) {
      store.update('evaluations', ev.id, {
        score: cbForm.score, content: cbForm.comment, evaluatedAt: iso()
      }, { action: '回访评分同步至评价单', remark: `来自回访调查 ${row.ticketNo}` })
      store.pushTimeline(ev, { action: '回访调查回写评分', comment: `评分 ${cbForm.score} 分：${cbForm.comment}` })
      synced = `，已同步至评价单 ${ev.no}`
    } else {
      const d = store.findById('demands', row.ticketId)
      if (d) store.pushTimeline(d, { action: '回访调查回写', comment: `评分 ${cbForm.score} 分：${cbForm.comment}` })
      synced = '，已写入需求单流转时间轴'
    }
  } else if (row.ticketType === '事件单') {
    const inc = store.findById('incidents', row.ticketId)
    if (inc) store.pushTimeline(inc, { action: '回访调查回写', comment: `评分 ${cbForm.score} 分：${cbForm.comment}` })
    synced = '，已写入事件单流转时间轴'
  } else {
    const t = store.findById('tasks', row.ticketId)
    if (t) store.pushTimeline(t, { action: '回访调查回写', comment: `评分 ${cbForm.score} 分：${cbForm.comment}` })
    synced = '，已写入任务单流转时间轴'
  }
  store.notify({
    type: 'success', title: `回访调查已回收（${row.ticketNo}）`,
    body: `评分 ${cbForm.score} 分，意见：${truncate(cbForm.comment, 50)}`,
    toRoles: ['desk', 'supplier'], link: '/service-desk'
  })
  ElMessage.success(`已提交回访评分${synced}`)
  cbDialog.value = false
}

/** 原文：处理完毕的服务请求自动产生回访调查 */
function autoCreateCallbacks() {
  const callbacks = store.table('callbacks') as any[]
  const done = [
    ...(store.table('incidents') as any[]).filter(i => i.status === 'CLOSED').slice(0, 20).map(i => ({ type: '事件单', id: i.id, no: i.no, to: i.handler })),
    ...(store.table('demands') as any[]).filter(d => ['DELIVERED', 'EVALUATED'].includes(d.status)).map(d => ({ type: '需求单', id: d.id, no: d.no, to: d.applicant }))
  ]
  const fresh = done.filter(t => !callbacks.some(c => c.ticketNo === t.no))
  if (!fresh.length) { ElMessage.info('当前没有新完成、待产生回访的服务请求'); return }
  fresh.slice(0, 6).forEach(t => store.insert('callbacks', {
    ticketType: t.type, ticketId: t.id, ticketNo: t.no, score: null, comment: '',
    status: '待回访', sentAt: iso(), to: t.to
  }))
  ElMessage.success(`已为 ${Math.min(fresh.length, 6)} 条处理完毕的服务请求自动产生回访调查`)
}

const callbacks = computed(() => by(store.table('callbacks') as any[], 'sentAt', 'desc'))
</script>

<template>
  <div>
    <PageHead
      title="服务台管理"
      desc="为经办机构、医疗机构以及系统运维人员提供统一工作环境：统一受理各类事件或服务请求，使记录、分派、监督通知、解决方案记录、报表统计等过程电子化、自动化。"
    >
      <template #actions>
        <el-button @click="router.push('/incident/list')">事件管理</el-button>
        <el-button type="primary" :disabled="!canDesk" @click="openBroadcast"><el-icon><Promotion /></el-icon> 发送广播</el-button>
      </template>
    </PageHead>

    <StatCards :items="stats" />

    <!-- ==================================================== 统一受理台 -- -->
    <div class="card">
      <div class="card__head">
        <div class="card__title">统一受理台</div>
        <div class="card__sub">Web 服务窗口 / 电子邮件 / 自助服务 / 客户端申报 四个入口的待受理队列</div>
        <div class="card__spacer" />
        <span v-if="!canDesk" class="text-xs" style="color: var(--warning-fg)">
          当前角色无「服务台受理与广播」权限，操作按钮已隐藏（可在顶栏切换为服务台受理员）
        </span>
        <StatusTag v-else label="具备受理权限" tone="success" :dot="false" />
      </div>
      <div class="card__body card__body--flush">
        <el-tabs v-model="intakeTab" style="padding: 0 var(--sp-5)">
          <el-tab-pane v-for="t in INTAKE_TABS" :key="t.key" :name="t.key">
            <template #label>
              <span>{{ t.label }}<b class="mono" style="margin-left: 6px">{{ intakeOf(t.key).length }}</b></span>
            </template>
          </el-tab-pane>
        </el-tabs>

        <div class="px-5 text-sm muted" style="margin: -4px 0 10px">
          {{ INTAKE_TABS.find(t => t.key === intakeTab)?.desc }} · 共 <b>{{ intakeRows.length }}</b> 条待受理
        </div>

        <el-table :data="intakeRows" style="width: 100%" row-key="no">
          <el-table-column label="单号" width="150">
            <template #default="{ row }">
              <el-button link type="primary" @click="router.push(`/${row.kind === 'demand' ? 'demand' : 'incident'}/detail/${row.id}`)">{{ row.no }}</el-button>
            </template>
          </el-table-column>
          <el-table-column label="标题" min-width="260" show-overflow-tooltip>
            <template #default="{ row }">
              <div class="cell-main">{{ row.title }}</div>
              <div class="cell-sub">{{ row.sub }}</div>
            </template>
          </el-table-column>
          <el-table-column label="来源" width="120">
            <template #default="{ row }">
              <StatusTag v-if="row.kind === 'demand'" dict="DemandSource" :value="row.source" :dot="false" />
              <StatusTag v-else :label="row.sourceLabel" tone="purple" :dot="false" />
            </template>
          </el-table-column>
          <el-table-column label="预定义需求类别" width="150">
            <template #default="{ row }">
              <StatusTag
                v-if="row.kind === 'demand'"
                dict="" :label="categoryOfDemand(row.raw)" tone="teal" :dot="false"
              />
              <StatusTag v-else dict="" :label="row.raw?.categoryName ?? '事件分类'" tone="warning" :dot="false" />
            </template>
          </el-table-column>
          <el-table-column label="提交时间" width="140">
            <template #default="{ row }">
              <div>{{ row.submittedAt ? fmtTime(row.submittedAt).slice(5, 16) : '—' }}</div>
              <div class="cell-sub">{{ row.submittedAt ? fromNow(row.submittedAt) : '—' }}</div>
            </template>
          </el-table-column>
          <el-table-column label="紧急度" width="100">
            <template #default="{ row }"><StatusTag dict="Priority" :value="row.urgency" :dot="false" /></template>
          </el-table-column>
          <el-table-column label="操作" width="190" fixed="right">
            <template #default="{ row }">
              <template v-if="canDesk">
                <el-button link type="primary" size="small" @click="doAccept(row)">受理</el-button>
                <el-button link size="small" @click="doDispatch(row)">分派</el-button>
                <el-button link size="small" style="color: var(--danger-fg)" @click="doReturn(row)">退回</el-button>
              </template>
              <span v-else class="text-xs muted">无受理权限</span>
            </template>
          </el-table-column>
          <template #empty>
            <div class="empty-box">
              <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
              <div class="empty-box__text">该入口暂无待受理请求</div>
            </div>
          </template>
        </el-table>
      </div>
    </div>

    <!-- ============================================ 预定义需求类别（9.6） -- -->
    <div class="card">
      <div class="card__head">
        <div class="card__title">预定义需求类别（{{ presetCategories.length }} 类）</div>
        <div class="card__sub">统一受理时按预定义类别识别请求类型：不同类别展现不同界面、要求不同信息、激活不同处理流程</div>
        <div class="card__spacer" />
        <el-button size="small" type="primary" :disabled="!canConfigCatalog" @click="openCategoryDrawer">
          <el-icon><Setting /></el-icon> 配置需求类别
        </el-button>
        <el-button size="small" @click="router.push('/selfservice')">
          <el-icon><Grid /></el-icon> 去自助服务管理查看
        </el-button>
      </div>
      <div class="card__body card__body--flush">
        <div v-if="!canConfigCatalog" class="text-xs muted" style="padding: 10px var(--sp-5) 0">
          当前角色「{{ store.role.name }}」无「服务目录与类别配置」权限，<b>配置需求类别</b> 已置灰（配置需服务台受理员或平台管理员）；
          本页仍可核对类别与激活流程。
        </div>
        <el-table :data="presetCategories" size="small" style="width: 100%" row-key="id">
          <el-table-column label="类别" width="96">
            <template #default="{ row }"><StatusTag :label="row.category" tone="primary" :dot="false" /></template>
          </el-table-column>
          <el-table-column label="预定义需求类别" min-width="180">
            <template #default="{ row }">
              <div class="bold">{{ row.name }}</div>
              <div class="cell-sub">{{ row.desc }}</div>
            </template>
          </el-table-column>
          <el-table-column label="需输入信息" width="150">
            <template #default="{ row }">
              <span class="mono bold">{{ row.fieldCount }}</span> 个字段
              <span class="text-xs muted">（{{ row.requiredCount }} 必填）</span>
            </template>
          </el-table-column>
          <el-table-column label="激活流程" min-width="200">
            <template #default="{ row }">{{ row.flowName }}</template>
          </el-table-column>
          <el-table-column label="生成单据" width="110">
            <template #default="{ row }"><StatusTag :label="row.kind" tone="teal" :dot="false" /></template>
          </el-table-column>
          <el-table-column label="可申请角色" min-width="180">
            <template #default="{ row }"><span class="text-xs muted">{{ row.roles.join('、') || '—' }}</span></template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" :disabled="!canConfigCatalog" @click="editCategory(row)">编辑</el-button>
              <el-button link type="danger" size="small" :disabled="!canConfigCatalog" @click="removeCategory(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="text-xs muted" style="padding: 10px var(--sp-5)">
          入口说明：「预定义需求类别」的配置入口在本页右上角 <b>「配置需求类别」</b>（新增 / 编辑 / 删除类别、描述、界面字段与激活流程，
          保存后自助服务管理同步生效）；自助服务管理只做申请侧展示（类别定义 + 去申请），避免同一份配置在两处维护产生歧义。
          服务目录的「谁能申请哪个服务」在 <b>综合 → 系统配置 → 角色与权限</b> 的服务目录权限矩阵中维护。
        </div>
      </div>
    </div>

    <!-- ====================================================== 服务概况 -- -->
    <div class="card">
      <div class="card__head">
        <div class="card__title">服务概况</div>
        <div class="card__sub">按事件类型 / 处理状态 / 处理人员 / 组织结构统计（8.1）</div>
        <div class="card__spacer" />
        <el-radio-group v-model="overviewRange" size="small">
          <el-radio-button value="7">近 7 天</el-radio-button>
          <el-radio-button value="30">近 30 天</el-radio-button>
          <el-radio-button value="all">全部</el-radio-button>
        </el-radio-group>
      </div>
      <div class="card__body">
        <div class="grid grid--2">
          <div class="chart-cell">
            <div class="chart-cell__head">
              <span class="bold">按事件类型分布</span>
              <el-radio-group v-model="kindOf.type" size="small">
                <el-radio-button v-for="k in KIND_OPTS" :key="k.value" :value="k.value">{{ k.label }}</el-radio-button>
              </el-radio-group>
            </div>
            <ChartBox :kind="kindOf.type" :data="byType" :height="240" center-label="事件单" />
          </div>
          <div class="chart-cell">
            <div class="chart-cell__head">
              <span class="bold">按处理状态分布</span>
              <el-radio-group v-model="kindOf.status" size="small">
                <el-radio-button v-for="k in KIND_OPTS" :key="k.value" :value="k.value">{{ k.label }}</el-radio-button>
              </el-radio-group>
            </div>
            <ChartBox :kind="kindOf.status" :data="byStatus" :height="240" center-label="事件单" />
          </div>
          <div class="chart-cell">
            <div class="chart-cell__head">
              <span class="bold">处理{{ rankMode === 'group' ? '组' : '人' }}处理量排行</span>
              <el-radio-group v-model="rankMode" size="small">
                <el-radio-button value="group">按处理组</el-radio-button>
                <el-radio-button value="handler">按处理人</el-radio-button>
              </el-radio-group>
            </div>
            <ChartBox :kind="kindOf.rank" :data="byRank" :height="240" center-label="处理量" />
          </div>
          <div class="chart-cell">
            <div class="chart-cell__head">
              <span class="bold">按组织结构分布（申报方）</span>
              <el-radio-group v-model="kindOf.org" size="small">
                <el-radio-button v-for="k in KIND_OPTS" :key="k.value" :value="k.value">{{ k.label }}</el-radio-button>
              </el-radio-group>
            </div>
            <ChartBox :kind="kindOf.org" :data="byOrg" :height="240" center-label="事件单" />
          </div>
        </div>
      </div>
    </div>

    <!-- ====================================================== 事件统计 -- -->
    <div class="card">
      <div class="card__head">
        <div class="card__title">事件统计报表</div>
        <div class="card__sub">自定义起止时间 + 小时 / 日 / 周 / 月 / 年时间梯度（8.3）</div>
        <div class="card__spacer" />
        <el-date-picker
          v-model="statRange"
          type="daterange"
          unlink-panels
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          size="small"
          style="width: 250px"
        />
        <el-button size="small" type="primary" plain @click="exportReport"><el-icon><Download /></el-icon> 导出报表</el-button>
      </div>
      <div class="card__body">
        <div class="flex items-center gap-2 wrap mb-3">
          <span class="text-sm muted">时间梯度</span>
          <el-radio-group v-model="grad" size="small">
            <el-radio-button v-for="g in GRADS" :key="g.value" :value="g.value">{{ g.label }}</el-radio-button>
          </el-radio-group>
          <span class="card__spacer" />
          <span class="text-sm muted">区间内事件合计 <b class="mono">{{ statTotal }}</b> 条 · {{ statBuckets.length }} 个统计单元</span>
        </div>
        <ChartBox kind="bar" :data="statSeries" :height="260" :rotate="grad !== 'hour' && statBuckets.length > 10" />
      </div>
      <div class="card__foot" style="align-items: flex-start; flex-direction: column">
        <div class="flex items-center gap-3 wrap">
          <span class="text-sm muted">报表定制（选择统计维度）</span>
          <el-checkbox-group v-model="statDims" size="small">
            <el-checkbox v-for="d in DIM_OPTS" :key="d.value" :value="d.value">{{ d.label }}</el-checkbox>
          </el-checkbox-group>
        </div>
        <div class="grid grid--2 mt-3" style="width: 100%">
          <div v-for="c in dimCharts" :key="c.key" class="chart-cell">
            <div class="chart-cell__head"><span class="bold">按{{ c.label }}统计</span><span class="text-xs muted">报表定制维度</span></div>
            <ChartBox kind="hbar" :data="c.data" />
          </div>
        </div>
      </div>
    </div>

    <!-- ====================================================== 广播通知 -- -->
    <div class="card">
      <div class="card__head">
        <div class="card__title">广播通知</div>
        <div class="card__sub">向指定人员或群组发送广播通知，支持站内信 / 电子邮件 / 短信（8.2）</div>
        <div class="card__spacer" />
        <el-button size="small" type="primary" :disabled="!canDesk" @click="openBroadcast"><el-icon><Plus /></el-icon> 发送广播</el-button>
      </div>
      <div class="card__body card__body--flush">
        <el-table :data="store.table('broadcasts')" style="width: 100%" row-key="id">
          <el-table-column type="expand">
            <template #default="{ row }">
              <div class="expand-box">
                <div class="bold mb-2">通知内容</div>
                <div class="tl__quote" style="white-space: pre-wrap">{{ row.content }}</div>
                <div class="mt-3 text-sm">
                  <span class="muted">已读名单：</span>
                  <template v-if="arrAny(row.readBy).length">
                    <el-tag v-for="u in row.readBy" :key="u" size="small" effect="plain" style="margin-right: 6px">{{ u }}</el-tag>
                  </template>
                  <span v-else class="muted">暂无人员阅读</span>
                </div>
                <div class="mt-2 text-xs muted">关联单据：{{ row.relatedId || '—' }} · 发送组织：{{ row.senderOrg }}</div>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="广播标题" min-width="240" show-overflow-tooltip>
            <template #default="{ row }">
              <div class="cell-main">{{ row.title }}</div>
              <div class="cell-sub">{{ row.no }}</div>
            </template>
          </el-table-column>
          <el-table-column label="发送人" width="100" prop="sender" />
          <el-table-column label="通知目标" min-width="220" show-overflow-tooltip>
            <template #default="{ row }">{{ targetText(row) }}</template>
          </el-table-column>
          <el-table-column label="渠道" width="160">
            <template #default="{ row }">
              <StatusTag v-for="c in arrAny(row.channels)" :key="c" dict="NotifyChannel" :value="c" :dot="false" style="margin-right: 4px" />
            </template>
          </el-table-column>
          <el-table-column label="发送时间" width="140">
            <template #default="{ row }">
              <div>{{ fmtTime(row.sentAt).slice(5, 16) }}</div>
              <div class="cell-sub">{{ fromNow(row.sentAt) }}</div>
            </template>
          </el-table-column>
          <el-table-column label="已读人数" width="100">
            <template #default="{ row }">
              <span class="mono">{{ arrAny(row.readBy).length }}</span> / {{ store.table('users').length }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="110" fixed="right">
            <template #default="{ row }">
              <el-button link size="small" :disabled="!canDesk" @click="remindUnread(row)">提醒未读</el-button>
            </template>
          </el-table-column>
          <template #empty>
            <div class="empty-box">
              <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
              <div class="empty-box__text">暂无广播通知</div>
            </div>
          </template>
        </el-table>
      </div>
    </div>

    <!-- ====================================================== 回访调查 -- -->
    <div class="card">
      <div class="card__head">
        <div class="card__title">回访调查</div>
        <div class="card__sub">处理完毕的服务请求自动产生，由最终用户在网页上填写反馈意见与评分（8.4）</div>
        <div class="card__spacer" />
        <el-button size="small" @click="autoCreateCallbacks"><el-icon><Refresh /></el-icon> 自动产生回访调查</el-button>
      </div>
      <div class="card__body card__body--flush">
        <el-table :data="callbacks" style="width: 100%" row-key="id">
          <el-table-column prop="ticketType" label="工单类型" width="100" />
          <el-table-column label="工单号" width="150">
            <template #default="{ row }">
              <el-button
                v-if="row.ticketId"
                link type="primary"
                @click="router.push(`/${row.ticketType === '事件单' ? 'incident' : row.ticketType === '需求单' ? 'demand' : 'task'}/detail/${row.ticketId}`)"
              >{{ row.ticketNo }}</el-button>
              <span v-else>{{ row.ticketNo }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="to" label="收件人" width="100" />
          <el-table-column label="发送时间" width="140">
            <template #default="{ row }">
              <div>{{ fmtTime(row.sentAt).slice(5, 16) }}</div>
              <div class="cell-sub">{{ fromNow(row.sentAt) }}</div>
            </template>
          </el-table-column>
          <el-table-column label="评分" width="170">
            <template #default="{ row }">
              <el-rate v-if="typeof row.score === 'number'" :model-value="row.score" disabled size="small" />
              <span v-else class="muted text-xs">尚未评分</span>
            </template>
          </el-table-column>
          <el-table-column label="反馈内容" min-width="240" show-overflow-tooltip>
            <template #default="{ row }">
              <span v-if="row.comment">{{ row.comment }}</span>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <StatusTag :label="row.status" :tone="row.status === '已回访' ? 'success' : 'warning'" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="130" fixed="right">
            <template #default="{ row }">
              <el-button v-if="row.status !== '已回访'" link type="primary" size="small" @click="openCallback(row)">模拟用户填写</el-button>
              <el-button v-else link size="small" @click="openCallback(row)">查看 / 修改</el-button>
            </template>
          </el-table-column>
          <template #empty>
            <div class="empty-box">
              <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
              <div class="empty-box__text">暂无回访调查记录</div>
            </div>
          </template>
        </el-table>
      </div>
    </div>

    <!-- ================================================== 发送广播弹窗 -- -->
    <el-dialog v-model="bcDialog" title="发送广播通知" width="640px">
      <el-form label-width="88px">
        <el-form-item label="广播标题" required>
          <el-input v-model="bcForm.title" placeholder="如：【事件通告】门急诊就诊记录数据延迟及处置进展" />
        </el-form-item>
        <el-form-item label="通知内容" required>
          <el-input v-model="bcForm.content" type="textarea" :rows="5" placeholder="填写广播正文，将同时通过所选渠道下发" />
        </el-form-item>
        <el-form-item label="目标方式">
          <el-radio-group v-model="bcForm.targetType" @change="bcForm.targetIds = []">
            <el-radio-button v-for="t in TARGET_TYPES" :key="t.value" :value="t.value">{{ t.label }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="通知目标" required>
          <el-select v-model="bcForm.targetIds" multiple filterable placeholder="可多选" style="width: 100%">
            <el-option v-for="o in targetOptions" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="通知渠道" required>
          <el-checkbox-group v-model="bcForm.channels">
            <el-checkbox v-for="c in channels" :key="c" :value="c">{{ c }}</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="bcDialog = false">取消</el-button>
        <el-button type="primary" @click="sendBroadcast">发送广播</el-button>
      </template>
    </el-dialog>

    <!-- ============================================== 回访调查填写弹窗 -- -->
    <el-dialog v-model="cbDialog" title="回访调查（模拟最终用户填写）" width="560px">
      <div v-if="cbRow" class="mb-3 text-sm muted">
        工单：{{ cbRow.ticketType }} {{ cbRow.ticketNo }} · 收件人 {{ cbRow.to }} · 发送于 {{ fmtTime(cbRow.sentAt) }}
      </div>
      <el-form label-width="88px">
        <el-form-item label="满意度评分" required>
          <el-rate v-model="cbForm.score" show-score score-template="{value} 分" />
        </el-form-item>
        <el-form-item label="反馈意见" required>
          <el-input v-model="cbForm.comment" type="textarea" :rows="4" placeholder="请填写您对本次服务的反馈意见" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="cbDialog = false">取消</el-button>
        <el-button type="primary" @click="submitCallback">提交反馈</el-button>
      </template>
    </el-dialog>

    <!-- ====================== 预定义需求类别配置抽屉（9.6） -- -->
    <el-drawer v-model="catDrawer" title="预定义需求类别配置" size="860px">
      <div class="drawer-body">
        <div class="text-sm muted mb-3">
          维护「故障与服务申请」的预定义类别：<b>类别 → 名称 / 描述 → 动态界面字段 → 激活的处理流程 → 可申请角色</b>。
          保存后自助服务管理的类别表与申请抽屉同步生效；「生成单据」由类别推导，无需单独配置。
        </div>

        <!-- 类别清单 -->
        <div class="flex items-center gap-2 mb-2">
          <div class="bold">类别清单（{{ presetCategories.length }} 类）</div>
          <span class="card__spacer" />
          <el-button size="small" type="primary" @click="newCategory"><el-icon><Plus /></el-icon> 新增类别</el-button>
        </div>
        <el-table :data="presetCategories" size="small" style="width: 100%" row-key="id" class="mb-4">
          <el-table-column label="类别" width="92">
            <template #default="{ row }"><StatusTag :label="row.category" tone="primary" :dot="false" /></template>
          </el-table-column>
          <el-table-column label="预定义需求类别" min-width="170">
            <template #default="{ row }">
              <div class="bold">{{ row.name }}</div>
              <div class="cell-sub">{{ row.desc }}</div>
            </template>
          </el-table-column>
          <el-table-column label="界面字段" width="120">
            <template #default="{ row }">{{ row.fieldCount }} 个（{{ row.requiredCount }} 必填）</template>
          </el-table-column>
          <el-table-column label="激活流程" min-width="170">
            <template #default="{ row }">{{ row.flowName }}</template>
          </el-table-column>
          <el-table-column label="生成单据" width="96">
            <template #default="{ row }"><StatusTag :label="row.kind" tone="teal" :dot="false" /></template>
          </el-table-column>
          <el-table-column label="操作" width="112" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="editCategory(row)">编辑</el-button>
              <el-button link type="danger" size="small" @click="removeCategory(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <!-- 新增 / 编辑表单 -->
        <div v-if="catEditing" class="card">
          <div class="card__head">
            <div class="card__title">{{ catEditId ? '编辑类别' : '新增类别' }}</div>
            <div class="card__sub">类别与描述决定自助服务页的展示，界面字段决定申请时要求输入的信息，激活流程决定提交后走的审批规则</div>
          </div>
          <div class="card__body">
            <el-form label-width="120px">
              <el-form-item label="类别" required>
                <el-select v-model="catForm.category" filterable allow-create default-first-option placeholder="选择或输入类别" style="width: 260px">
                  <el-option v-for="c in categoryOptions" :key="c" :label="c" :value="c" />
                </el-select>
                <span class="text-xs muted" style="margin-left: 10px">生成单据：{{ ticketKindOf(catForm.category) }}</span>
              </el-form-item>
              <el-form-item label="需求类别名称" required>
                <el-input v-model="catForm.name" placeholder="如：系统故障报修" style="width: 420px" />
              </el-form-item>
              <el-form-item label="类别描述" required>
                <el-input v-model="catForm.desc" type="textarea" :rows="2" placeholder="一句话说明该类别适用于什么场景" />
              </el-form-item>
              <el-form-item label="激活流程" required>
                <el-select v-model="catForm.flowId" placeholder="选择该类别激活的处理流程" style="width: 420px">
                  <el-option v-for="w in workflows" :key="w.id" :label="`${w.name}（${w.bizType}）`" :value="w.id" />
                </el-select>
              </el-form-item>
              <el-form-item label="可申请角色">
                <el-checkbox-group v-model="catForm.allowedRoles">
                  <el-checkbox v-for="r in store.roles" :key="r.id" :value="r.id">{{ r.name }}</el-checkbox>
                </el-checkbox-group>
              </el-form-item>
              <el-form-item label="界面字段" required>
                <div style="width: 100%">
                  <table class="field-table">
                    <thead>
                      <tr>
                        <th style="width: 150px">字段名称</th>
                        <th style="width: 140px">字段标识</th>
                        <th style="width: 130px">类型</th>
                        <th style="width: 62px">必填</th>
                        <th>选项（下拉用「、」分隔）</th>
                        <th style="width: 130px">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(s, i) in catForm.formSchema" :key="i">
                        <td><el-input v-model="s.label" size="small" placeholder="如：故障现象" /></td>
                        <td><el-input v-model="s.key" size="small" placeholder="如：desc" /></td>
                        <td>
                          <el-select v-model="s.type" size="small">
                            <el-option v-for="t in FIELD_TYPES" :key="t.value" :label="t.label" :value="t.value" />
                          </el-select>
                        </td>
                        <td style="text-align: center"><el-checkbox v-model="s.required" /></td>
                        <td>
                          <el-input
                            v-if="s.type === 'select'"
                            :model-value="optionsText(s)"
                            size="small"
                            placeholder="如：数据缺失、口径不一致"
                            @update:model-value="(v: string) => setOptions(s, v)"
                          />
                          <span v-else class="text-xs muted">—</span>
                        </td>
                        <td style="text-align: center">
                          <el-button link size="small" @click="moveField(i, -1)">上移</el-button>
                          <el-button link size="small" @click="moveField(i, 1)">下移</el-button>
                          <el-button link type="danger" size="small" @click="removeField(i)">删除</el-button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <el-button size="small" class="mt-2" @click="addField"><el-icon><Plus /></el-icon> 添加字段</el-button>
                  <div class="text-xs muted mt-2">
                    类型说明：单行文本 / 多行文本 / 数字 / 日期直接录入；下拉选择需填选项；搜索选择按字段标识自动匹配资源、服务或应用数据源。
                  </div>
                </div>
              </el-form-item>
            </el-form>
          </div>
          <div class="card__foot">
            <el-button @click="cancelCategoryEdit">取消</el-button>
            <el-button type="primary" @click="saveCategory">保存</el-button>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.px-5 { padding-left: var(--sp-5); padding-right: var(--sp-5); }
.cell-main { font-weight: 600; }
.cell-sub { font-size: var(--fs-xs); color: var(--text-3); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chart-cell {
  border: 1px solid var(--border-2); border-radius: var(--r-md);
  padding: var(--sp-3) var(--sp-4); background: var(--surface-2);
}
.chart-cell__head { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); margin-bottom: var(--sp-2); flex-wrap: wrap; }
.expand-box { padding: var(--sp-4) var(--sp-6); background: var(--surface-2); }
/* 类别配置抽屉：界面字段编辑器 */
.drawer-body { padding-bottom: var(--sp-6); }
.field-table { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); }
.field-table th, .field-table td { border: 1px solid var(--border-2); padding: 5px 8px; vertical-align: middle; }
.field-table thead th { background: var(--surface-2); font-weight: 600; color: var(--text-2); font-size: var(--fs-xs); text-align: left; }
</style>
