<script setup lang="ts">
/**
 * ProblemListView —— 问题管理（列表模式样板对齐 DemandListView.vue）
 *
 * 覆盖功能点：问题创建（事件创建 / 手工创建、分类与优先级）、问题关联（事件 / 变更 / 配置项）、
 * 问题分派（自动 / 手工 / 重新分派）、问题升级、问题通知（邮件 / 短信）、
 * 问题流转（手工关闭 / 自动关闭；已知错误流程 + 临时解决方案；提交知识条目）、问题审计，
 * 以及主动问题管理看板（状态分布 / 根因 TOP / 预防措施执行情况）。
 */
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDemoStore, dictItem } from '@/stores/demo'
import { config } from '@/core/config'
import { NOW, addDays, arr, by, fmtTime, fromNow, iso, nowStamp } from '@/core/utils'
import PageHead from '@/components/PageHead.vue'
import StatCards from '@/components/StatCards.vue'
import StatusTag from '@/components/StatusTag.vue'
import ChartBox from '@/components/ChartBox.vue'

const store = useDemoStore()
const router = useRouter()

/** 安全取数组（模板中统一用它，避免 unknown[] 带来的类型噪音） */
const list = (v: unknown): any[] => (Array.isArray(v) ? v : [])

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'teal' | 'neutral'

/**
 * 问题处理权限（与问题单详情页 canManage 同口径）。
 * 「问题管理」菜单放开的只是查看（problem.view），页面上所有写入口都按此收口：
 * 新建问题、行操作（分派 / 升级 / 转入已知错误 / 解决 / 提交知识 / 关闭）、处理抽屉底部动作区。
 */
const canManage = computed(() => store.can('problem.manage') || store.can('problem.rootcause'))

/* ------------------------------------------------------------ 选项 -- */
type DictLike = Record<string, { label: string }>
/** 字典转下拉选项（显式标注参数类型，避免 config.dicts 类型推断变化带来的噪音） */
const dictOptions = (d: DictLike) => Object.entries(d).map(([value, o]) => ({ value, label: o.label }))

const statusOptions = dictOptions(config.dicts.ProblemStatus)
const severityOptions = dictOptions(config.dicts.Severity)
const priorityOptions = dictOptions(config.dicts.Priority)
const deptOptions = [
  '运维中心 · 一线支持组', '运维中心 · 二线支持组', '运维中心 · 专家组',
  '数据生产中心 · 加工组', '平台运营中心'
]
const IMPACTS = ['严重影响业务', '部分功能受影响', '轻微影响']
const URGENCIES = ['紧急', '较急', '一般']

/* ------------------------------------------------------------ 筛选 -- */
const f = reactive({ kw: '', status: '', severity: '', priority: '', source: '', dept: '' })

const allRows = computed(() => store.table('problems') as any[])
const cis = computed(() => store.table('cis') as any[])

const filtered = computed(() => {
  const q = f
  return by(allRows.value.filter(p => {
    if (q.status && p.status !== q.status) return false
    if (q.severity && p.severity !== q.severity) return false
    if (q.priority && p.priority !== q.priority) return false
    if (q.source && p.source !== q.source) return false
    if (q.dept && p.dept !== q.dept) return false
    if (q.kw) {
      const hay = `${p.no} ${p.title} ${p.handler} ${p.dept} ${p.rootCause ?? ''}`.toLowerCase()
      if (!hay.includes(q.kw.toLowerCase())) return false
    }
    return true
  }), 'createdAt', 'desc')
})
function resetFilter() {
  Object.assign(f, { kw: '', status: '', severity: '', priority: '', source: '', dept: '' })
}

/* ---------------------------------------------------------- 指标卡 -- */
const stats = computed(() => {
  const rows = allRows.value
  return [
    { label: '问题总数', value: rows.length, unit: '单', icon: 'QuestionFilled', tone: 'primary' as Tone },
    { label: '分析中', value: rows.filter(p => ['DISPATCHED', 'ANALYZING'].includes(p.status)).length, unit: '单', icon: 'Search', tone: 'info' as Tone },
    { label: '已知错误', value: rows.filter(p => p.status === 'KNOWN_ERROR').length, unit: '单', icon: 'Share', tone: 'purple' as Tone, tip: '已找到根因但暂时无法根本解决，走独立的已知错误管理流程' },
    { label: '已解决', value: rows.filter(p => ['RESOLVED', 'CLOSED'].includes(p.status)).length, unit: '单', icon: 'CircleCheck', tone: 'success' as Tone },
    { label: '未闭环', value: rows.filter(p => p.status !== 'CLOSED').length, unit: '单', icon: 'Timer', tone: 'warning' as Tone, tip: '未关闭的问题单（含已知错误）' },
    { label: 'P0/P1 高优', value: rows.filter(p => ['P0', 'P1'].includes(p.priority)).length, unit: '单', icon: 'WarningFilled', tone: 'danger' as Tone }
  ]
})

/* ----------------------------------------------- 主动问题管理看板 -- */
/** 根因分类：按根因描述关键字归类 */
function causeType(p: any): string {
  const t = `${p.rootCause ?? ''}`
  if (!t) return '根因待分析'
  if (/上游|采集|批次|接口|上报/.test(t)) return '上游链路 / 采集'
  if (/调度|依赖|作业|任务/.test(t)) return '调度与依赖'
  if (/配置|参数|连接池|容量|阈值/.test(t)) return '配置与容量'
  if (/编码|复用|映射|贯标|口径/.test(t)) return '数据标准 / 口径'
  if (/索引|同步|缓存/.test(t)) return '索引与同步'
  return '其他'
}
const causeDim = ref<'cause' | 'dept'>('cause')
const causeData = computed(() => {
  const m = new Map<string, number>()
  for (const p of allRows.value) {
    const k = causeDim.value === 'cause' ? causeType(p) : (p.dept || '未分派')
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return Array.from(m.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
})
const statusData = computed(() =>
  Object.keys(config.dicts.ProblemStatus)
    .map(k => ({ name: (config.dicts.ProblemStatus as any)[k].label, value: allRows.value.filter(p => p.status === k).length }))
    .filter(d => d.value > 0)
)
function deptSeries(status: string) {
  const m = new Map<string, number>()
  for (const p of allRows.value) {
    if (p.status !== status) continue
    const k = p.dept || '未分派'
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return Array.from(m.entries()).map(([name, value]) => ({ name, value }))
}
const knownErrorByDept = computed(() => deptSeries('KNOWN_ERROR'))
const resolvedByDept = computed(() => deptSeries('RESOLVED'))

/* ------------------------------------------------------- 关联对象 -- */
const incidents = computed(() => store.table('incidents') as any[])
const changes = computed(() => store.table('changes') as any[])
const incidentOf = (id: string) => incidents.value.find(i => i.id === id)
const changeOf = (id: string) => changes.value.find(c => c.id === id)
const ciOf = (id: string) => cis.value.find(c => c.id === id)

function openIncident(id: string) {
  const i = incidentOf(id)
  if (!i) { ElMessage.warning('关联事件不存在'); return }
  ElMessageBox.alert(
    `事件单号：${i.no}\n标题：${i.title}\n状态：${dictItem('IncidentStatus', i.status).label} · 处理人：${i.handler}\n来源：${i.source}`,
    '关联事件', { confirmButtonText: '去事件管理查看' }
  ).then(() => router.push('/incident/list')).catch(() => { /* 关闭 */ })
}

/* ------------------------------------------------------------ 新建 -- */
const createVisible = ref(false)
const createMode = ref<'INCIDENT' | 'MANUAL'>('INCIDENT')
const form = reactive({
  title: '', description: '',
  sourceIncidentIds: [] as string[],
  severity: '中', impact: '部分功能受影响', urgency: '一般', priority: 'P2',
  assignMode: 'AUTO' as 'AUTO' | 'MANUAL',
  dept: deptOptions[1], handler: '陈志刚',
  relatedCiIds: [] as string[],
  expectDays: 7
})

function calcPriority(impact: string, urgency: string): string {
  if (impact === '严重影响业务' && urgency === '紧急') return 'P0'
  if ((impact === '部分功能受影响' && urgency === '紧急') || (impact === '严重影响业务' && urgency === '较急')) return 'P1'
  if (impact === '轻微影响' && urgency === '一般') return 'P3'
  return 'P2'
}
function onClassifyChange() { form.priority = calcPriority(form.impact, form.urgency) }

const autoAssignTip = computed(() => {
  const ci = form.relatedCiIds.length ? ciOf(form.relatedCiIds[0]) : null
  if (ci) return `按关联配置项「${ci.name}」的归属自动分派至：${ci.owner}`
  if (['P0', 'P1'].includes(form.priority)) return '按分类规则自动分派至：运维中心 · 二线支持组（P0/P1 直接进入二线）'
  return '按分类规则自动分派至：运维中心 · 一线支持组（未解决再升级二线）'
})

function applyIncidents(ids: string[]) {
  const picked = ids.map(incidentOf).filter(Boolean) as any[]
  if (!picked.length) return
  if (!form.title) form.title = picked[0].title.replace(/^【[^】]+】/, '')
  const desc = picked.map(i => `${i.no}：${i.description}`).join('\n')
  form.description = desc
  form.severity = picked[0].severity
  form.impact = picked[0].impact
  form.urgency = picked[0].urgency
  form.priority = picked[0].priority
  const ciIds: string[] = Array.from(new Set(picked.flatMap(i => arr(i.ciIds) as string[])))
  form.relatedCiIds = ciIds
}
function resetForm() {
  Object.assign(form, {
    title: '', description: '', sourceIncidentIds: [], severity: '中', impact: '部分功能受影响',
    urgency: '一般', priority: 'P2', assignMode: 'AUTO', dept: deptOptions[1], handler: '陈志刚',
    relatedCiIds: [], expectDays: 7
  })
}

function nextNo(prefix: string, rows: any[]): string {
  return `${prefix}${nowStamp().slice(0, 6)}${String(rows.length + 1).padStart(4, '0')}`
}

function submitCreate() {
  if (!form.title.trim()) { ElMessage.warning('请填写问题标题'); return }
  const dept = form.assignMode === 'AUTO'
    ? (form.relatedCiIds.length && ciOf(form.relatedCiIds[0])?.owner) || (['P0', 'P1'].includes(form.priority) ? deptOptions[1] : deptOptions[0])
    : form.dept
  const handler = form.assignMode === 'AUTO'
    ? (/一线/.test(dept) ? '徐鹏' : '陈志刚')
    : form.handler
  const rec = store.insert('problems', {
    no: nextNo(config.prefixes.problems, allRows.value),
    title: form.title.trim(),
    source: createMode.value,
    sourceIncidentIds: createMode.value === 'INCIDENT' ? [...form.sourceIncidentIds] : [],
    severity: form.severity, impact: form.impact, urgency: form.urgency, priority: form.priority,
    status: 'DISPATCHED', handler, dept,
    rootCause: form.description ? `【问题描述】${form.description}` : '',
    notifyChannels: ['邮件'], notifyLogs: [],
    relatedChangeIds: [], relatedCiIds: [...form.relatedCiIds],
    knowledgeId: null, createdAt: iso(), expectAt: iso(addDays(NOW, form.expectDays)),
    timeline: []
  })
  store.pushTimeline(rec, {
    action: createMode.value === 'INCIDENT' ? '由事件创建问题单' : '手工创建问题单',
    comment: `分类：${form.severity} / ${form.impact} / ${form.urgency}，优先级 ${form.priority}；分派方式：${form.assignMode === 'AUTO' ? '自动分派' : '手工分派'}`
  })
  if (createMode.value === 'INCIDENT') {
    form.sourceIncidentIds.forEach(id => {
      store.update('incidents', id, { problemId: rec.id }, { action: '关联问题单', remark: `已开出问题单 ${rec.no}` })
      const inc = incidentOf(id)
      if (inc) store.pushTimeline(inc, { action: '开出问题单', comment: `生成问题单 ${rec.no} 做根因分析` })
    })
  }
  store.addAudit({ bizType: 'problems', bizId: rec.id, bizNo: rec.no, bizTitle: rec.title, action: '创建问题单', remark: `${form.assignMode === 'AUTO' ? '自动' : '手工'}分派至 ${dept} / ${handler}` })
  store.notify({
    type: 'warning', title: `新问题单 ${rec.no} 已创建`,
    body: `问题「${rec.title}」已创建并分派至 ${dept}（${handler}），优先级 ${form.priority}。`,
    toRoles: ['ops', 'desk'], link: `/problem/detail/${rec.id}`
  })
  createVisible.value = false
  ElMessage.success(`已创建问题单 ${rec.no}，流转至「已分派」`)
  resetForm()
}

/* ---------------------------------------------------------- 处理抽屉 -- */
const drawer = ref(false)
const currentId = ref('')
const current = computed<any>(() => (currentId.value ? store.findById('problems', currentId.value) : null))
const rootCauseDraft = ref('')

function openDrawer(p: any) {
  currentId.value = p.id
  rootCauseDraft.value = p.rootCause ?? ''
  drawer.value = true
}

/* 根因分析 */
function saveRootCause() {
  const p = current.value
  if (!p) return
  if (!rootCauseDraft.value.trim()) { ElMessage.warning('请填写根因分析结论'); return }
  store.update('problems', p.id, { rootCause: rootCauseDraft.value.trim(), status: p.status === 'NEW' || p.status === 'DISPATCHED' ? 'ANALYZING' : p.status },
    { action: '根因分析', remark: rootCauseDraft.value.trim().slice(0, 60) })
  store.pushTimeline(p, { action: '根因分析完成', comment: rootCauseDraft.value.trim() })
  store.persist()
  ElMessage.success('根因分析已保存')
}

/* 分派 / 重新分派 */
function assign(p: any) {
  const reselect = p.status !== 'NEW'
  ElMessageBox.prompt(
    `请选择归属部门与处理人（可从下列选项中填写）\n可选部门：${deptOptions.join(' / ')}\n可选处理人：徐鹏（一线）、陈志刚（二线）`,
    reselect ? `重新分派问题单 ${p.no}` : `分派问题单 ${p.no}`,
    { inputValue: `${p.dept || deptOptions[1]} / ${p.handler === '—' ? '陈志刚' : p.handler}`, inputType: 'textarea', confirmButtonText: '确认分派' }
  ).then(({ value }) => {
    const [dept, handler] = String(value).split('/').map(s => s.trim())
    store.update('problems', p.id, { dept: dept || p.dept, handler: handler || p.handler, status: p.status === 'NEW' ? 'DISPATCHED' : p.status },
      { action: reselect ? '重新分派' : '分派', remark: `分派至 ${dept} / ${handler}` })
    store.pushTimeline(p, { action: reselect ? '重新分派' : '分派', comment: `分派至 ${dept} / ${handler}` })
    store.notify({ type: 'info', title: `问题单 ${p.no} 已分派`, body: `处理人：${handler}（${dept}）`, toRoles: ['ops'], link: `/problem/detail/${p.id}` })
    ElMessage.success(`已分派至 ${dept} / ${handler}`)
  }).catch(() => { /* 取消 */ })
}

/* 升级 */
function escalate(p: any) {
  ElMessageBox.prompt('请填写问题升级原因（将同步至专家组与关注人）', `升级问题单 ${p.no}`, {
    inputValue: '一线无法定位根因，升级至二线专家组介入分析。', inputType: 'textarea', confirmButtonText: '确认升级'
  }).then(({ value }) => {
    const nextPriority = p.priority === 'P2' ? 'P1' : p.priority === 'P3' ? 'P2' : p.priority
    store.update('problems', p.id, { dept: '运维中心 · 专家组', priority: nextPriority, escalatedAt: iso() }, { action: '问题升级', remark: value })
    store.pushTimeline(p, { action: '问题升级', comment: `${value}（优先级调整为 ${nextPriority}）` })
    store.notify({ type: 'warning', title: `问题单 ${p.no} 已升级`, body: value, toRoles: ['ops', 'supplier'], link: `/problem/detail/${p.id}` })
    ElMessage.success('已升级至运维中心 · 专家组')
  }).catch(() => { /* 取消 */ })
}

/* 转入已知错误流程 */
const keVisible = ref(false)
const keForm = reactive({ workaround: '', permanentFixPlan: '', expireAt: '' })
function openKnownError(p: any) {
  keForm.workaround = p.knownError?.workaround ?? ''
  keForm.permanentFixPlan = p.knownError?.permanentFixPlan ?? ''
  keForm.expireAt = p.knownError?.expireAt ?? ''
  keVisible.value = true
  currentId.value = p.id
}
function submitKnownError() {
  const p = current.value
  if (!p) return
  if (!keForm.workaround.trim() || !keForm.permanentFixPlan.trim()) { ElMessage.warning('请填写临时解决方案与根治计划'); return }
  store.update('problems', p.id, {
    status: 'KNOWN_ERROR',
    knownError: { workaround: keForm.workaround.trim(), permanentFixPlan: keForm.permanentFixPlan.trim(), expireAt: keForm.expireAt }
  }, { action: '转入已知错误流程', remark: keForm.workaround.trim().slice(0, 60) })
  store.pushTimeline(p, { action: '转入已知错误流程', comment: `临时方案：${keForm.workaround.trim()}｜根治计划：${keForm.permanentFixPlan.trim()}` })
  store.notify({
    type: 'warning', title: `问题单 ${p.no} 已转入已知错误流程`,
    body: `临时解决方案已发布，根治计划到期日 ${keForm.expireAt || '待定'}。`, toRoles: ['ops', 'desk'], link: `/problem/detail/${p.id}`
  })
  keVisible.value = false
  ElMessage.success('已转入已知错误流程，临时解决方案已记录')
}

/* 解决 */
const solveVisible = ref(false)
const solveForm = reactive({ solution: '', preventive: '' })
function openSolve(p: any) {
  solveForm.solution = p.solution ?? ''
  solveForm.preventive = p.preventive ?? ''
  solveVisible.value = true
  currentId.value = p.id
}
function submitSolve() {
  const p = current.value
  if (!p) return
  if (!solveForm.solution.trim()) { ElMessage.warning('请填写解决方案'); return }
  store.update('problems', p.id, { status: 'RESOLVED', solution: solveForm.solution.trim(), preventive: solveForm.preventive.trim(), resolvedAt: iso() },
    { action: '问题解决', remark: solveForm.solution.trim().slice(0, 60) })
  store.pushTimeline(p, { action: '解决', comment: `解决方案：${solveForm.solution.trim()}${solveForm.preventive.trim() ? `｜预防措施：${solveForm.preventive.trim()}` : ''}` })
  store.notify({ type: 'success', title: `问题单 ${p.no} 已解决`, body: solveForm.solution.trim(), toRoles: ['desk', 'consumer', 'supplier'], link: `/problem/detail/${p.id}` })
  solveVisible.value = false
  ElMessage.success('问题已解决，可关闭或提交知识条目')
}

/* 关闭（手工 / 自动） */
const closeVisible = ref(false)
const closeForm = reactive({ closeType: '手工关闭', remark: '' })
function openClose(p: any) { closeForm.closeType = '手工关闭'; closeForm.remark = ''; closeVisible.value = true; currentId.value = p.id }
function submitClose() {
  const p = current.value
  if (!p) return
  store.update('problems', p.id, { status: 'CLOSED', closedAt: iso(), closeType: closeForm.closeType }, { action: closeForm.closeType, remark: closeForm.remark })
  store.pushTimeline(p, { action: closeForm.closeType, comment: closeForm.remark || `${closeForm.closeType}，问题闭环` })
  ElMessage.success(`已${closeForm.closeType}，问题单闭环`)
  closeVisible.value = false
}

/* 提交知识条目 */
const kbVisible = ref(false)
const kbForm = reactive({ title: '', content: '', categoryId: 'kc011' })
const kbLeaves = computed(() => {
  const out: { id: string; name: string }[] = []
  for (const top of store.table('kbCategories') as any[]) {
    if (!arr<any>(top.children).length) out.push({ id: top.id, name: top.name })
    for (const c of arr<any>(top.children)) out.push({ id: c.id, name: `${top.name} / ${c.name}` })
  }
  return out
})
function openKnowledge(p: any) {
  kbForm.title = p.title
  kbForm.content = `【问题】${p.title}\n【根因】${p.rootCause || '—'}\n【解决方案】${p.solution || '—'}\n【预防措施】${p.preventive || '—'}`
  kbVisible.value = true
  currentId.value = p.id
}
function submitKnowledge() {
  const p = current.value
  if (!p) return
  if (!kbForm.title.trim()) { ElMessage.warning('请填写知识条目标题'); return }
  const cat = kbLeaves.value.find(c => c.id === kbForm.categoryId)
  const body = kbForm.content.split('\n').filter(Boolean)
  const kb = store.insert('knowledges', {
    no: nextNo(config.prefixes.knowledges, store.table('knowledges') as any[]),
    title: kbForm.title.trim(),
    categoryId: kbForm.categoryId,
    categoryName: cat ? cat.name.split(' / ').pop() : '数据需求管理',
    owner: store.user.name, status: 'PENDING_REVIEW', refCount: 0,
    contentText: body.join(' '),
    contentHtml: `<h3>问题描述</h3><p>${p.title}</p><h3>根因分析</h3><p>${p.rootCause || '—'}</p>`
      + `<h3>解决方案</h3><p>${p.solution || '—'}</p><h3>预防措施</h3><p>${p.preventive || '—'}</p>`,
    attachments: [], ratings: [], comments: [], relatedIds: arr<string>(p.sourceIncidentIds)
  })
  store.update('problems', p.id, { knowledgeId: kb.id }, { action: '提交知识条目', remark: `生成知识条目 ${kb.no}（待审核）` })
  store.pushTimeline(p, { action: '提交知识条目', comment: `已生成知识条目 ${kb.no}，等待知识库审核发布` })
  kbVisible.value = false
  ElMessageBox.confirm(`已生成知识条目 ${kb.no}，状态为「待审核」，需知识库维护责任人审核后发布。`, '提交成功', {
    confirmButtonText: '去知识库查看', cancelButtonText: '留在本页'
  }).then(() => router.push('/kb/list')).catch(() => { /* 留在本页 */ })
}

/* 通知（邮件 / 短信） */
const notifyVisible = ref(false)
const notifyForm = reactive({ channels: ['邮件'] as string[], to: '', content: '' })
function openNotify(p: any) {
  currentId.value = p.id
  notifyForm.to = `${p.handler === '—' ? '王思远' : p.handler}（${p.dept || '运维中心'}）`
  notifyForm.content = `【三医数据底座】问题单 ${p.no}「${p.title}」当前状态：${dictItem('ProblemStatus', p.status).label}，请关注处理进展。`
  notifyForm.channels = ['邮件']
  notifyVisible.value = true
}
function submitNotify() {
  const p = current.value
  if (!p) return
  if (!notifyForm.channels.length) { ElMessage.warning('请选择通知方式（邮件 / 短信）'); return }
  if (!notifyForm.to.trim()) { ElMessage.warning('请填写收件人'); return }
  const logs = notifyForm.channels.map(ch => ({ at: iso(), to: notifyForm.to.trim(), channel: ch, content: notifyForm.content }))
  store.update('problems', p.id, { notifyLogs: [...arr<any>(p.notifyLogs), ...logs], notifyChannels: notifyForm.channels },
    { action: '发送问题通知', remark: `${notifyForm.channels.join('、')} → ${notifyForm.to.trim()}` })
  store.pushTimeline(p, { action: '发送通知', comment: `通过 ${notifyForm.channels.join('、')} 通知 ${notifyForm.to.trim()}` })
  notifyVisible.value = false
  ElMessage.success(`已通过${notifyForm.channels.join('、')}发送通知`)
}

/* --------------------------------------------------------- 行操作 -- */
function actionsOf(p: any): { label: string; type?: string; run: () => void }[] {
  const out: { label: string; type?: string; run: () => void }[] = []
  const can = canManage.value
  if (can && ['NEW', 'DISPATCHED'].includes(p.status)) out.push({ label: p.status === 'NEW' ? '分派' : '重新分派', run: () => assign(p) })
  if (can && p.status === 'ANALYZING') out.push({ label: '转入已知错误', run: () => openKnownError(p) })
  if (can && ['ANALYZING', 'KNOWN_ERROR'].includes(p.status)) out.push({ label: '解决', type: 'primary', run: () => openSolve(p) })
  if (can && p.status === 'RESOLVED') out.push({ label: '提交知识', type: 'primary', run: () => openKnowledge(p) })
  if (can && p.status !== 'CLOSED') out.push({ label: '关闭', run: () => openClose(p) })
  out.push({ label: '处理', type: 'primary', run: () => openDrawer(p) })
  return out
}

function exportList() { ElMessage.success(`已导出 ${filtered.value.length} 条问题单（导出文件已生成）`) }
</script>

<template>
  <div>
    <PageHead title="问题管理" desc="问题的根因分析、已知错误流转、解决方案与预防措施。">
      <template #actions>
        <el-button @click="exportList"><el-icon><Download /></el-icon> 导出</el-button>
        <el-button type="primary" :disabled="!canManage" @click="createVisible = true"><el-icon><Plus /></el-icon> 新建问题</el-button>
      </template>
    </PageHead>

    <StatCards :items="stats" />

    <!-- ------------------------------------------------ 主动问题管理看板 -- -->
    <div class="card mb-4">
      <div class="card__head">
        <span class="card__title">主动问题管理看板</span>
        <span class="card__sub">基于问题单根因与预防措施执行情况的事前分析</span>
        <span class="card__spacer" />
        <el-radio-group v-model="causeDim" size="small">
          <el-radio-button value="cause">按根因分类</el-radio-button>
          <el-radio-button value="dept">按归属部门</el-radio-button>
        </el-radio-group>
      </div>
      <div class="card__body">
        <div class="grid grid--3">
          <div>
            <div class="card__sub mb-2">问题按状态分布</div>
            <ChartBox kind="donut" :data="statusData" :height="230" center-label="问题单" />
          </div>
          <div>
            <div class="card__sub mb-2">问题按{{ causeDim === 'cause' ? '根因分类' : '归属部门' }} TOP</div>
            <ChartBox kind="bar" :data="causeData" :height="230" :rotate="true" />
          </div>
          <div>
            <div class="card__sub mb-2">各部门已知错误 / 已解决数量</div>
            <ChartBox kind="hbar" :data="knownErrorByDept.length ? knownErrorByDept : [{ name: '暂无已知错误', value: 0 }]" />
            <ChartBox kind="hbar" :data="resolvedByDept.length ? resolvedByDept : [{ name: '暂无已解决问题', value: 0 }]" />
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="toolbar">
        <div class="toolbar__fields">
          <div class="field"><span class="field__label">关键字</span>
            <el-input v-model="f.kw" placeholder="单号 / 标题 / 根因 / 处理人" clearable style="width: 200px" />
          </div>
          <div class="field"><span class="field__label">状态</span>
            <el-select v-model="f.status" placeholder="全部状态" clearable style="width: 138px">
              <el-option v-for="o in statusOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </div>
          <div class="field"><span class="field__label">严重等级</span>
            <el-select v-model="f.severity" placeholder="全部" clearable style="width: 110px">
              <el-option v-for="o in severityOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </div>
          <div class="field"><span class="field__label">优先级</span>
            <el-select v-model="f.priority" placeholder="全部" clearable style="width: 120px">
              <el-option v-for="o in priorityOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </div>
          <div class="field"><span class="field__label">来源</span>
            <el-select v-model="f.source" placeholder="全部来源" clearable style="width: 130px">
              <el-option label="事件创建" value="INCIDENT" />
              <el-option label="手工创建" value="MANUAL" />
            </el-select>
          </div>
          <div class="field"><span class="field__label">处理部门</span>
            <el-select v-model="f.dept" placeholder="全部部门" clearable style="width: 190px">
              <el-option v-for="d in deptOptions" :key="d" :label="d" :value="d" />
            </el-select>
          </div>
        </div>
        <div class="toolbar__actions">
          <el-button @click="resetFilter">重置</el-button>
        </div>
      </div>

      <el-table :data="filtered" style="width: 100%" row-key="id">
        <el-table-column label="问题单号" width="132">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDrawer(row)">{{ row.no }}</el-button>
          </template>
        </el-table-column>
        <el-table-column label="标题" min-width="230" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="cell-main">{{ row.title }}</div>
            <div class="cell-sub">{{ row.rootCause ? row.rootCause.slice(0, 46) + '…' : '根因待分析' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="来源" width="128">
          <template #default="{ row }">
            <StatusTag dict="" :label="row.source === 'INCIDENT' ? '事件创建' : '手工创建'" :tone="row.source === 'INCIDENT' ? 'warning' : 'neutral'" />
            <el-button v-if="row.source === 'INCIDENT' && list(row.sourceIncidentIds).length" link type="primary" class="text-xs" @click="openIncident(list(row.sourceIncidentIds)[0])">
              关联 {{ list(row.sourceIncidentIds).length }} 个事件
            </el-button>
          </template>
        </el-table-column>
        <el-table-column label="严重等级" width="92">
          <template #default="{ row }"><StatusTag dict="Severity" :value="row.severity" /></template>
        </el-table-column>
        <el-table-column label="影响程度" width="130">
          <template #default="{ row }"><span class="text-sm">{{ row.impact }}</span></template>
        </el-table-column>
        <el-table-column label="优先级" width="92">
          <template #default="{ row }"><StatusTag dict="Priority" :value="row.priority" :dot="false" /></template>
        </el-table-column>
        <el-table-column label="处理人 / 部门" width="180" show-overflow-tooltip>
          <template #default="{ row }">
            <div>{{ row.handler || '—' }}</div>
            <div class="cell-sub">{{ row.dept || '未分派' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="106">
          <template #default="{ row }"><StatusTag dict="ProblemStatus" :value="row.status" /></template>
        </el-table-column>
        <el-table-column label="创建时间" width="126">
          <template #default="{ row }">
            <div>{{ row.createdAt ? fmtTime(row.createdAt).slice(5, 16) : '—' }}</div>
            <div class="cell-sub">{{ row.createdAt ? fromNow(row.createdAt) : '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="176" fixed="right">
          <template #default="{ row }">
            <el-button
              v-for="(a, i) in actionsOf(row).slice(0, 1)" :key="i" link
              :type="a.type === 'primary' ? 'primary' : 'default'" size="small" @click.stop="a.run()"
            >{{ a.label }}</el-button>
            <el-dropdown v-if="actionsOf(row).length > 1" trigger="click" style="margin-left: 6px">
              <el-button link size="small">更多</el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item v-for="(a, i) in actionsOf(row).slice(1)" :key="i" @click="a.run()">{{ a.label }}</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty-box">
            <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
            <div class="empty-box__text">没有符合条件的问题单</div>
          </div>
        </template>
      </el-table>

      <div class="card__foot">
        <span class="text-sm muted">共 <b>{{ filtered.length }}</b> 条问题单</span>
      </div>
    </div>

    <!-- ------------------------------------------------- 新建问题弹窗 -- -->
    <el-dialog v-model="createVisible" title="新建问题单" width="760px" top="6vh">
      <el-radio-group v-model="createMode" class="mb-3">
        <el-radio-button value="INCIDENT">通过事件创建</el-radio-button>
        <el-radio-button value="MANUAL">手工创建</el-radio-button>
      </el-radio-group>

      <el-form label-width="104px" label-position="right">
        <template v-if="createMode === 'INCIDENT'">
          <el-form-item label="关联事件">
            <el-select
              v-model="form.sourceIncidentIds" multiple filterable collapse-tags collapse-tags-tooltip
              placeholder="选择需要做根因分析的事件（可多选，支持重复发生的同类事件）" style="width: 100%"
              @change="applyIncidents"
            >
              <el-option v-for="i in incidents" :key="i.id" :label="`${i.no} ${i.title}`" :value="i.id">
                <span>{{ i.no }}</span>
                <span class="muted text-xs" style="margin-left: 8px">{{ dictItem('IncidentStatus', i.status).label }} · {{ i.priority }}</span>
              </el-option>
            </el-select>
            <div class="text-xs muted mt-1">选中后自动带出标题、描述与分类。</div>
          </el-form-item>
        </template>

        <el-form-item label="问题标题" required>
          <el-input v-model="form.title" placeholder="简要描述问题现象（不含具体工单编号）" />
        </el-form-item>
        <el-form-item label="问题描述">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="现象、影响范围、发生频次等" />
        </el-form-item>

        <el-form-item label="分类与优先级">
          <div class="flex wrap gap-2 items-center">
            <el-select v-model="form.severity" style="width: 110px" @change="onClassifyChange">
              <el-option v-for="o in severityOptions" :key="o.value" :label="`严重：${o.label}`" :value="o.value" />
            </el-select>
            <el-select v-model="form.impact" style="width: 168px" @change="onClassifyChange">
              <el-option v-for="i in IMPACTS" :key="i" :label="i" :value="i" />
            </el-select>
            <el-select v-model="form.urgency" style="width: 120px" @change="onClassifyChange">
              <el-option v-for="u in URGENCIES" :key="u" :label="`紧急：${u}`" :value="u" />
            </el-select>
            <el-select v-model="form.priority" style="width: 130px">
              <el-option v-for="o in priorityOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </div>
          <div class="text-xs muted mt-1">优先级默认按「影响程度 × 紧急程度」自动计算，可手工调整。</div>
        </el-form-item>

        <el-form-item label="关联配置项">
          <el-select v-model="form.relatedCiIds" multiple filterable placeholder="关联 CMDB 配置项（用于影响面分析与自动分派）" style="width: 100%">
            <el-option v-for="c in cis" :key="c.id" :label="`${c.name}（${c.type} · ${c.owner}）`" :value="c.id" />
          </el-select>
        </el-form-item>

        <el-form-item label="分派方式">
          <el-radio-group v-model="form.assignMode">
            <el-radio value="AUTO">自动分派</el-radio>
            <el-radio value="MANUAL">手工分派</el-radio>
          </el-radio-group>
          <div class="text-xs muted mt-1">{{ form.assignMode === 'AUTO' ? autoAssignTip : '手工分派需指定归属部门与处理人' }}</div>
        </el-form-item>

        <el-form-item v-if="form.assignMode === 'MANUAL'" label="归属部门">
          <div class="flex gap-2">
            <el-select v-model="form.dept" style="width: 220px">
              <el-option v-for="d in deptOptions" :key="d" :label="d" :value="d" />
            </el-select>
            <el-select v-model="form.handler" style="width: 160px">
              <el-option label="徐鹏（一线）" value="徐鹏" />
              <el-option label="陈志刚（二线）" value="陈志刚" />
              <el-option label="刘涛（生产）" value="刘涛" />
              <el-option label="赵敏（平台）" value="赵敏" />
            </el-select>
          </div>
        </el-form-item>

        <el-form-item label="期望解决">
          <el-input-number v-model="form.expectDays" :min="1" :max="90" /> <span class="text-sm muted" style="margin-left: 8px">天内解决</span>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" @click="submitCreate">提交并分派</el-button>
      </template>
    </el-dialog>

    <!-- ------------------------------------------------- 处理问题抽屉 -- -->
    <el-drawer v-model="drawer" :title="current ? `问题单 ${current.no} · 处理` : '问题单处理'" size="760px">
      <template v-if="current">
        <div class="flex gap-2 wrap mb-3">
          <StatusTag dict="ProblemStatus" :value="current.status" />
          <StatusTag dict="Priority" :value="current.priority" :dot="false" />
          <StatusTag dict="Severity" :value="current.severity" />
          <StatusTag v-if="current.knownError" dict="" label="已进入已知错误流程" tone="purple" />
        </div>

        <div class="flow mb-3">
          <div
            v-for="(s, i) in (config.flows.Problem as string[])" :key="s" class="flow__step"
            :class="{ 'flow__step--done': i < ((config.flowIndex.Problem as any)[current.status] ?? 0), 'flow__step--active': i === ((config.flowIndex.Problem as any)[current.status] ?? 0) }"
          >
            <div class="flow__dot">{{ i + 1 }}</div>
            <div class="flow__label">{{ s }}</div>
          </div>
        </div>

        <div class="card mb-3">
          <div class="card__head"><span class="card__title">基本信息</span></div>
          <div class="card__body">
            <div class="desc-grid desc-grid--2">
              <div class="desc-item"><span class="desc-item--label">问题标题</span><span class="desc-item__value">{{ current.title }}</span></div>
              <div class="desc-item"><span class="desc-item--label">来源</span><span class="desc-item__value">{{ current.source === 'INCIDENT' ? '由事件创建' : '手工创建' }}</span></div>
              <div class="desc-item"><span class="desc-item--label">影响程度</span><span class="desc-item__value">{{ current.impact }} / 紧急程度：{{ current.urgency }}</span></div>
              <div class="desc-item"><span class="desc-item--label">处理人</span><span class="desc-item__value">{{ current.handler || '—' }}（{{ current.dept || '未分派' }}）</span></div>
              <div class="desc-item"><span class="desc-item--label">创建时间</span><span class="desc-item__value">{{ fmtTime(current.createdAt) }}</span></div>
              <div class="desc-item"><span class="desc-item--label">期望解决</span><span class="desc-item__value">{{ current.expectAt || '—' }}</span></div>
            </div>
          </div>
        </div>

        <div class="card mb-3">
          <div class="card__head">
            <span class="card__title">根因分析</span>
            <span class="card__spacer" />
            <el-button size="small" type="primary" :disabled="!store.can('problem.rootcause') && !store.can('problem.manage')" @click="saveRootCause">保存根因</el-button>
          </div>
          <div class="card__body">
            <el-input v-model="rootCauseDraft" type="textarea" :rows="3" placeholder="填写根本原因分析结论（保存后状态流转为「分析中」）" />
          </div>
        </div>

        <div v-if="current.knownError" class="known-error mb-3">
          <div class="bold mb-1 flex items-center gap-1"><el-icon><Share /></el-icon> 已知错误管理流程（临时解决方案 + 根治计划）</div>
          <div class="text-sm">临时解决方案：{{ current.knownError.workaround }}</div>
          <div class="text-sm mt-1">根治计划：{{ current.knownError.permanentFixPlan }}</div>
          <div class="text-xs muted mt-1">计划完成（到期）日：{{ current.knownError.expireAt || '待定' }}</div>
        </div>

        <div v-if="current.solution || current.preventive" class="card mb-3">
          <div class="card__head"><span class="card__title">解决方案与预防措施</span></div>
          <div class="card__body">
            <div class="desc-item"><span class="desc-item--label">解决方案</span><span class="desc-item__value">{{ current.solution || '—' }}</span></div>
            <div class="desc-item mt-1"><span class="desc-item--label">预防措施</span><span class="desc-item__value">{{ current.preventive || '—' }}</span></div>
          </div>
        </div>

        <div class="card mb-3">
          <div class="card__head">
            <span class="card__title">问题关联</span>
            <span class="card__sub">事件 / 变更 / 配置项</span>
          </div>
          <div class="card__body">
            <div class="bold text-sm mb-1">关联事件（{{ list(current.sourceIncidentIds).length }}）</div>
            <div v-if="list(current.sourceIncidentIds).length" class="flex wrap gap-2 mb-3">
              <el-button v-for="id in list(current.sourceIncidentIds)" :key="id" size="small" @click="openIncident(id)">
                {{ incidentOf(id)?.no ?? id }} · {{ incidentOf(id)?.title?.slice(0, 16) ?? '事件' }}
              </el-button>
            </div>
            <div v-else class="text-sm muted mb-3">无关联事件（手工创建）</div>

            <div class="bold text-sm mb-1">关联变更（{{ list(current.relatedChangeIds).length }}）</div>
            <div v-if="list(current.relatedChangeIds).length" class="flex wrap gap-2 mb-3">
              <el-button v-for="id in list(current.relatedChangeIds)" :key="id" size="small" @click="router.push('/change/list')">
                {{ changeOf(id)?.no ?? id }} · {{ changeOf(id)?.title?.slice(0, 16) ?? '变更' }}
              </el-button>
            </div>
            <div v-else class="text-sm muted mb-3">暂无关联变更（可在变更管理中发起变更根治）</div>

            <div class="bold text-sm mb-1">关联配置项（{{ list(current.relatedCiIds).length }}）</div>
            <div v-if="list(current.relatedCiIds).length" class="flex wrap gap-2">
              <StatusTag v-for="id in list(current.relatedCiIds)" :key="id" dict="" :label="`${ciOf(id)?.name ?? id}（${ciOf(id)?.type ?? '配置项'}）`" tone="info" />
            </div>
            <div v-else class="text-sm muted">暂无关联配置项</div>
          </div>
        </div>

        <div class="card mb-3">
          <div class="card__head">
            <span class="card__title">通知记录</span>
            <span class="card__spacer" />
            <el-button size="small" type="primary" plain @click="openNotify(current)">发送通知</el-button>
          </div>
          <div class="card__body card__body--flush">
            <el-table :data="list(current.notifyLogs)" size="small">
              <el-table-column prop="at" label="时间" width="122" />
              <el-table-column prop="to" label="收件人" width="176" show-overflow-tooltip />
              <el-table-column label="渠道" width="82">
                <template #default="{ row }"><StatusTag dict="NotifyChannel" :value="row.channel" :dot="false" /></template>
              </el-table-column>
              <el-table-column prop="content" label="内容" min-width="200" show-overflow-tooltip />
              <template #empty><div class="empty-box"><div class="empty-box__text">尚未发送通知</div></div></template>
            </el-table>
          </div>
        </div>

        <div class="card mb-3">
          <div class="card__head"><span class="card__title">处理时间轴</span></div>
          <div class="card__body">
            <div class="tl">
              <div v-for="(t, i) in list(current.timeline)" :key="i" class="tl__item" :class="i === list(current.timeline).length - 1 ? 'tl__item--active' : 'tl__item--done'">
                <div class="tl__dot" />
                <div class="tl__head">
                  <span class="tl__action">{{ t.action }}</span>
                  <span class="tl__meta">{{ t.actor }} · {{ t.at }}</span>
                </div>
                <div v-if="t.comment" class="tl__body">{{ t.comment }}</div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="current.status === 'CLOSED'" class="text-xs muted mb-2">
          该问题单已关闭（终态）：关闭 / 解决 / 转入已知错误流程已停用；如需继续跟进，可发送通知或提交知识条目。
        </div>
        <div class="drawer-actions">
          <template v-if="canManage">
            <el-button @click="assign(current)">分派 / 重新分派</el-button>
            <el-button @click="escalate(current)">问题升级</el-button>
            <el-button :disabled="current.status === 'CLOSED'" @click="openKnownError(current)">转入已知错误流程</el-button>
            <el-button type="primary" :disabled="current.status === 'CLOSED'" @click="openSolve(current)">解决</el-button>
            <el-button :disabled="current.status === 'CLOSED'" @click="openClose(current)">关闭</el-button>
            <el-button type="success" plain @click="openKnowledge(current)">提交知识条目</el-button>
            <el-button @click="openNotify(current)">通知</el-button>
          </template>
          <el-button link type="primary" @click="router.push(`/problem/detail/${current.id}`)">打开详情页 <el-icon><ArrowRight /></el-icon></el-button>
        </div>
      </template>
    </el-drawer>

    <!-- --------------------------------------------- 已知错误流程弹窗 -- -->
    <el-dialog v-model="keVisible" title="转入已知错误管理流程" width="620px">
      <el-form label-width="110px">
        <el-form-item label="临时解决方案" required>
          <el-input v-model="keForm.workaround" type="textarea" :rows="3" placeholder="在根治方案落地前，可让一线/服务台立即执行的规避或恢复手段" />
        </el-form-item>
        <el-form-item label="根治计划" required>
          <el-input v-model="keForm.permanentFixPlan" type="textarea" :rows="3" placeholder="根治措施与承接方（如任务单 / 变更单编号）" />
        </el-form-item>
        <el-form-item label="计划完成日">
          <el-date-picker v-model="keForm.expireAt" type="date" value-format="YYYY-MM-DD" placeholder="选择到期日" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="keVisible = false">取消</el-button>
        <el-button type="primary" @click="submitKnownError">确认转入</el-button>
      </template>
    </el-dialog>

    <!-- --------------------------------------------------- 解决弹窗 -- -->
    <el-dialog v-model="solveVisible" title="解决问题单" width="620px">
      <el-form label-width="110px">
        <el-form-item label="解决方案" required>
          <el-input v-model="solveForm.solution" type="textarea" :rows="3" placeholder="最终解决方案与验证结果" />
        </el-form-item>
        <el-form-item label="预防措施">
          <el-input v-model="solveForm.preventive" type="textarea" :rows="3" placeholder="防止再次发生的措施（监控、校验、流程约束等）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="solveVisible = false">取消</el-button>
        <el-button type="primary" @click="submitSolve">确认解决</el-button>
      </template>
    </el-dialog>

    <!-- --------------------------------------------------- 关闭弹窗 -- -->
    <el-dialog v-model="closeVisible" title="关闭问题单" width="560px">
      <el-form label-width="96px">
        <el-form-item label="关闭方式">
          <el-radio-group v-model="closeForm.closeType">
            <el-radio value="手工关闭">手工关闭</el-radio>
            <el-radio value="自动关闭">自动关闭</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="关闭说明">
          <el-input v-model="closeForm.remark" type="textarea" :rows="2" placeholder="如：观察 3 日无复现，自动关闭" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="closeVisible = false">取消</el-button>
        <el-button type="primary" @click="submitClose">确认关闭</el-button>
      </template>
    </el-dialog>

    <!-- ----------------------------------------------- 提交知识条目 -- -->
    <el-dialog v-model="kbVisible" title="提交知识条目给知识管理" width="640px">
      <el-form label-width="96px">
        <el-form-item label="条目标题" required>
          <el-input v-model="kbForm.title" />
        </el-form-item>
        <el-form-item label="所属分类">
          <el-select v-model="kbForm.categoryId" style="width: 100%">
            <el-option v-for="c in kbLeaves" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="条目内容">
          <el-input v-model="kbForm.content" type="textarea" :rows="7" />
        </el-form-item>
        <el-form-item label="提交后状态">
          <StatusTag dict="" label="待审核" tone="warning" />
          <span class="text-xs muted" style="margin-left: 8px">需知识库维护责任人审核后发布。</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="kbVisible = false">取消</el-button>
        <el-button type="primary" @click="submitKnowledge">提交知识条目</el-button>
      </template>
    </el-dialog>

    <!-- --------------------------------------------------- 通知弹窗 -- -->
    <el-dialog v-model="notifyVisible" title="发送问题通知" width="580px">
      <el-form label-width="96px">
        <el-form-item label="通知方式">
          <el-checkbox-group v-model="notifyForm.channels">
            <el-checkbox value="邮件">邮件</el-checkbox>
            <el-checkbox value="短信">短信</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="收件人">
          <el-input v-model="notifyForm.to" placeholder="姓名（组织）" />
        </el-form-item>
        <el-form-item label="通知内容">
          <el-input v-model="notifyForm.content" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="notifyVisible = false">取消</el-button>
        <el-button type="primary" @click="submitNotify">发送</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex; align-items: center; gap: var(--sp-3);
  padding: var(--sp-4) var(--sp-5); border-bottom: 1px solid var(--border-2);
  flex-wrap: wrap;
}
.toolbar__fields { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; flex: 1; }
.toolbar__actions { display: flex; align-items: center; gap: var(--sp-2); }
.field { display: flex; align-items: center; gap: 6px; }
.field__label { font-size: var(--fs-sm); color: var(--text-2); white-space: nowrap; }
.cell-main { font-weight: 600; }
.cell-sub { font-size: var(--fs-xs); color: var(--text-3); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.known-error {
  border: 1px solid var(--purple);
  background: var(--purple-bg);
  border-radius: var(--r-md);
  padding: var(--sp-4);
  color: var(--purple-fg);
}
.drawer-actions {
  display: flex; flex-wrap: wrap; gap: var(--sp-2);
  padding-top: var(--sp-3); border-top: 1px solid var(--border-2);
}
</style>
