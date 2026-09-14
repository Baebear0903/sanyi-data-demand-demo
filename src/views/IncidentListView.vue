<script setup lang="ts">
/**
 * IncidentListView —— 事件管理
 *
 * 覆盖功能点（运维服务管理 · 事件管理）：
 *  · 事件录入：服务台申报、客户自助录入、微信报障、邮件等多种方式
 *  · 预先定义事件分类（严重等级 / 影响程度 / 紧急程度 → 优先级）
 *  · 事件派发：按分类自动分派或手工分派
 *  · 事件变更：由事件单开出问题单和变更单
 *  · 事件升级（自动升级）、事件关联（重复事件关联并自动统计数量）
 *  · 关联知识库：录入时按关键字自动查询知识条目；多种关闭方式
 *  · 事件审计、事件广播（把信息与进展通告给全部相关人员）、事件分析（事件决策树）、事件模板定义
 */
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDemoStore } from '@/stores/demo'
import { config } from '@/core/config'
import { NOW, arr, by, countBy, demoUid, fmtTime, fromNow, get, iso, nowStamp, num, toDate } from '@/core/utils'
import PageHead from '@/components/PageHead.vue'
import StatCards from '@/components/StatCards.vue'
import StatusTag from '@/components/StatusTag.vue'
import ChartBox from '@/components/ChartBox.vue'

const store = useDemoStore()
const router = useRouter()

/** 安全数组访问：把 store 中的宽松字段收敛为可遍历数组（等价于 arr 的显式类型版本） */
const listOf = (v: unknown): any[] => (Array.isArray(v) ? v : [])

/* ============================================================== 数据 == */
const allIncidents = computed(() => store.table('incidents') as any[])
const categories = computed(() => store.table('incidentCategories') as any[])
const templates = computed(() => store.table('incidentTemplates') as any[])
const knowledges = computed(() => store.table('knowledges') as any[])

/* 优先级矩阵：按影响程度 × 紧急程度推导优先级 */
const PRIORITY_MATRIX: Record<string, Record<string, string>> = {
  '严重影响业务': { 紧急: 'P0', 较急: 'P1', 一般: 'P1' },
  '部分功能受影响': { 紧急: 'P1', 较急: 'P2', 一般: 'P2' },
  '轻微影响': { 紧急: 'P2', 较急: 'P3', 一般: 'P3' }
}
function calcPriority(impact: string, urgency: string) {
  return get(PRIORITY_MATRIX, `${impact}.${urgency}`, 'P2') as string
}
/** 按优先级推导 SLA 响应时限（小时） */
const SLA_HOURS: Record<string, number> = { P0: 4, P1: 8, P2: 24, P3: 48 }
const CLOSED_STATUS = ['CLOSED', 'RESOLVED']

/** 事件创建时间：优先取 createdAt，否则取时间轴第一条 */
function createdAtOf(it: any): string {
  return it.createdAt ?? listOf(it.timeline)[0]?.at ?? ''
}

/** 字典转下拉选项（配置字典为宽松字面量对象，这里显式收敛类型） */
const dictOptions = (name: string): { value: string; label: string }[] =>
  Object.entries((config.dicts as Record<string, any>)[name] ?? {}).map(([v, o]) => ({ value: v, label: (o as any).label ?? v }))

const statusOptions = dictOptions('IncidentStatus')
const severityOptions = dictOptions('Severity')
const priorityOptions = dictOptions('Priority')
const impactOptions = ['严重影响业务', '部分功能受影响', '轻微影响']
const urgencyOptions = ['紧急', '较急', '一般']
const sourceOptions = ['服务台申报', '客户自助', '微信报障', '邮件']
const groupOptions = computed(() => Array.from(new Set([
  ...categories.value.map(c => c.autoAssign),
  ...allIncidents.value.map(i => i.handlerGroup)
].filter(Boolean))) as string[])

/* --------------------------------------------------------------- 筛选 -- */
const f = reactive({ kw: '', status: '', severity: '', impact: '', urgency: '', priority: '', source: '', handlerGroup: '' })
const page = ref(1)
const pageSize = ref(10)

function resetFilter() {
  Object.assign(f, { kw: '', status: '', severity: '', impact: '', urgency: '', priority: '', source: '', handlerGroup: '' })
  page.value = 1
}

const filtered = computed(() =>
  by(
    allIncidents.value.filter(it => {
      if (f.status && it.status !== f.status) return false
      if (f.severity && it.severity !== f.severity) return false
      if (f.impact && it.impact !== f.impact) return false
      if (f.urgency && it.urgency !== f.urgency) return false
      if (f.priority && it.priority !== f.priority) return false
      if (f.source && it.source !== f.source) return false
      if (f.handlerGroup && it.handlerGroup !== f.handlerGroup) return false
      if (f.kw) {
        const hay = `${it.no} ${it.title} ${it.description} ${it.categoryName} ${it.handler}`.toLowerCase()
        if (!hay.includes(f.kw.toLowerCase())) return false
      }
      return true
    }),
    'slaDueAt',
    'desc'
  )
)

const paged = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return filtered.value.slice(start, start + pageSize.value)
})

/* --------------------------------------------------- SLA 剩余时间计算 -- */
function slaInfo(it: any) {
  const due = toDate(it.slaDueAt)
  if (!due) return { text: '未设置', tone: 'muted' as const, overdue: false }
  const diffH = (due.getTime() - NOW.getTime()) / 3600000
  if (CLOSED_STATUS.includes(it.status)) return { text: '已闭环', tone: 'muted' as const, overdue: false }
  if (diffH < 0) {
    const h = Math.abs(diffH)
    return { text: `已超期 ${h < 24 ? h.toFixed(1) + ' 小时' : Math.floor(h / 24) + ' 天'}`, tone: 'danger' as const, overdue: true }
  }
  if (diffH <= 4) return { text: `剩余 ${diffH.toFixed(1)} 小时`, tone: 'warning' as const, overdue: false }
  return { text: `剩余 ${Math.floor(diffH)} 小时`, tone: 'muted' as const, overdue: false }
}

/* ------------------------------------------------------------ 指标卡 -- */
const stats = computed(() => {
  const rows = allIncidents.value
  const overdue = rows.filter(it => !CLOSED_STATUS.includes(it.status) && (toDate(it.slaDueAt)?.getTime() ?? 0) < NOW.getTime())
  const todayNew = rows.filter(it => String(createdAtOf(it)).slice(0, 10) === iso().slice(0, 10))
  return [
    { label: '事件总数', value: rows.length, unit: '条', icon: 'Warning', tone: 'primary' as const },
    { label: '未闭环', value: rows.filter(it => it.status !== 'CLOSED').length, unit: '条', icon: 'Clock', tone: 'warning' as const, tip: '状态非「已关闭」的事件' },
    { label: '已升级', value: rows.filter(it => it.status === 'ESCALATED').length, unit: '条', icon: 'Top', tone: 'danger' as const, tip: '已改派二线支持组继续处理的事件' },
    { label: '超期预警', value: overdue.length, unit: '条', icon: 'WarningFilled', tone: 'danger' as const, tip: 'SLA 时限已过且未关闭' },
    { label: '今日新增', value: todayNew.length, unit: '条', icon: 'Download', tone: 'info' as const },
    { label: '已关闭', value: rows.filter(it => it.status === 'CLOSED').length, unit: '条', icon: 'CircleCheck', tone: 'success' as const }
  ]
})

/* --------------------------------------------------------- 知识推荐 -- */
/** 中文关键字抽取：中文二元词组 + 英文/数字词 */
function keywordsOf(text: string): string[] {
  const s = String(text ?? '')
  const out = new Set<string>()
  for (const m of s.match(/[A-Za-z0-9]{2,}/g) ?? []) out.add(m.toLowerCase())
  for (const seg of s.match(/[\u4e00-\u9fa5]+/g) ?? []) {
    for (let i = 0; i + 2 <= seg.length; i++) out.add(seg.slice(i, i + 2))
  }
  return Array.from(out).slice(0, 90)
}

const matchSource = ref('')

const recommendations = computed(() => {
  const text = (matchSource.value || '').trim()
  if (text.length < 2) return []
  const keys = keywordsOf(text)
  if (!keys.length) return []
  const out: { k: any; score: number; hits: string[] }[] = []
  for (const k of knowledges.value) {
    const titleKeys = keywordsOf(`${k.title ?? ''}`)
    const bodyKeys = keywordsOf(`${k.title ?? ''} ${k.contentText ?? ''}`)
    const hitTitle = keys.filter(x => titleKeys.includes(x))
    const hitBody = keys.filter(x => bodyKeys.includes(x))
    const score = hitTitle.length * 2 + hitBody.length
    if (score > 0) {
      out.push({ k, score, hits: Array.from(new Set([...hitTitle, ...hitBody])).slice(0, 6) })
    }
  }
  return by(out, 'score', 'desc').slice(0, 5)
})

/** 按分类预置关键字给出分类建议 */
const suggestedCategory = computed(() => {
  const text = (matchSource.value || '').toLowerCase()
  if (text.length < 2) return null
  let best: any = null
  let bestHit = 0
  for (const c of categories.value) {
    const hits = listOf(c.keywords).filter((w: string) => text.includes(String(w).toLowerCase())).length
    if (hits > bestHit) { bestHit = hits; best = c }
  }
  return bestHit > 0 ? { cat: best, hits: bestHit } : null
})

/* ========================================================== 新建事件 == */
const createVisible = ref(false)
const formRef = ref<any>(null)
const createForm = reactive<any>({
  source: '服务台申报',
  templateId: '',
  title: '',
  description: '',
  categoryId: 'ic01',
  severity: '中',
  impact: '部分功能受影响',
  urgency: '较急',
  affectedUsers: 10,
  contact: '',
  contactPhone: '',
  modelSystem: '数据服务管理工具',
  notifyChannels: ['站内'],
  autoEscalate: true,
  autoDispatch: true,
  occurAt: iso(),
  suggestHandler: ''
})

const createRules: any = {
  source: [{ required: true, message: '请选择事件来源', trigger: 'change' }],
  title: [{ required: true, message: '请输入事件标题', trigger: 'blur' }],
  description: [{ required: true, message: '请输入事件描述', trigger: 'blur' }],
  categoryId: [{ required: true, message: '请选择事件分类', trigger: 'change' }],
  severity: [{ required: true, message: '请选择严重等级', trigger: 'change' }],
  contact: [{ required: true, message: '请输入联系人', trigger: 'blur' }],
  contactPhone: [
    { required: true, message: '请输入联系电话', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '手机号格式不正确（请填 11 位手机号）', trigger: 'blur' }
  ]
}

const newPriority = computed(() => calcPriority(createForm.impact, createForm.urgency))

function openCreate(presetSource = '服务台申报') {
  if (!store.can('incident.create') && !store.can('desk.manage')) {
    ElMessage.warning('当前角色无「创建事件单」权限')
    return
  }
  Object.assign(createForm, {
    source: presetSource, templateId: '', title: '', description: '', categoryId: 'ic01',
    severity: '中', impact: '部分功能受影响', urgency: '较急', affectedUsers: 10,
    contact: store.user.name, contactPhone: store.user.phone || '13800001001',
    modelSystem: '数据服务管理工具', notifyChannels: ['站内'], autoEscalate: true,
    autoDispatch: true, occurAt: iso(), suggestHandler: ''
  })
  matchSource.value = ''
  createVisible.value = true
}

/** 套用事件模板（模板定义） */
function applyTemplate(id: string) {
  const t = templates.value.find(x => x.id === id)
  if (!t) return
  createForm.title = t.title
  createForm.description = t.desc
  createForm.categoryId = t.categoryId
  createForm.severity = t.severity
  createForm.impact = t.impact
  createForm.urgency = t.urgency
  syncMatch()
  ElMessage.success(`已套用模板「${t.name}」，标题 / 描述 / 分类 / 等级已自动填充`)
}

/** 输入标题 / 描述时实时触发知识库关键字查询 */
function syncMatch() {
  matchSource.value = `${createForm.title} ${createForm.description}`.trim()
}

function pickKnowledge(k: any) {
  createForm.description = `${createForm.description}${createForm.description ? '\n' : ''}（参考知识条目：${k.title}）`
  syncMatch()
  ElMessage.success(`已引用知识条目《${k.title}》`)
}

function submitCreate() {
  formRef.value?.validate((ok: boolean) => {
    if (!ok) { ElMessage.warning('请先补全带 * 的必填项'); return }
    const cat = categories.value.find(c => c.id === createForm.categoryId)
    const priority = newPriority.value
    const slaHours = SLA_HOURS[priority] ?? 24
    const due = new Date(NOW.getTime() + slaHours * 3600000)
    const p = (n: number) => (n < 10 ? '0' + n : String(n))
    const slaDueAt = `${due.getFullYear()}-${p(due.getMonth() + 1)}-${p(due.getDate())} ${p(due.getHours())}:${p(due.getMinutes())}`

    const no = `SJ${nowStamp()}${String(allIncidents.value.length + 1).padStart(3, '0')}`
    const handlerGroup = createForm.autoDispatch ? (cat?.autoAssign ?? '三医数据底座服务台') : '待手工分派'
    const rec: any = {
      id: demoUid('inc'),
      no,
      title: createForm.title,
      description: createForm.description,
      source: createForm.source,
      categoryId: createForm.categoryId,
      categoryName: cat?.name ?? '其他',
      severity: createForm.severity,
      impact: createForm.impact,
      urgency: createForm.urgency,
      priority,
      ciIds: [],
      status: createForm.autoDispatch ? 'DISPATCHED' : 'NEW',
      handler: createForm.suggestHandler || '—',
      handlerGroup,
      slaDueAt,
      resolvedAt: null,
      closeType: null,
      relatedIncidentIds: [],
      problemId: null,
      changeId: null,
      broadcastIds: [],
      knowledgeRefs: recommendations.value.map(r => r.k.id),
      ext: {
        affectedUsers: createForm.affectedUsers,
        contact: createForm.contact,
        contactPhone: createForm.contactPhone,
        modelSystem: createForm.modelSystem,
        notifyChannels: [...createForm.notifyChannels],
        autoEscalate: createForm.autoEscalate,
        occurAt: createForm.occurAt
      },
      timeline: [
        { at: iso(), actor: store.user.name, action: `通过${createForm.source}提交事件`, comment: `影响 ${createForm.affectedUsers} 人，联系人 ${createForm.contact}（${createForm.contactPhone}）` },
        createForm.autoDispatch
          ? { at: iso(), actor: '系统', action: `按分类「${cat?.name ?? '其他'}」自动分派至 ${handlerGroup}`, comment: '事件派发：按预先定义的分类规则自动分派' }
          : { at: iso(), actor: store.user.name, action: '标记为手工分派', comment: '等待服务台按处理组手工分派' },
        recommendations.value.length
          ? { at: iso(), actor: '系统', action: `知识库匹配到 ${recommendations.value.length} 条相关条目`, comment: recommendations.value.map(r => `《${r.k.title}》`).join('、') }
          : null
      ].filter(Boolean)
    }
    store.insert('incidents', rec)
    /* 事件审计 */
    store.addAudit({
      bizType: 'incidents', bizId: rec.id, bizNo: rec.no, bizTitle: rec.title,
      action: '创建事件单',
      changes: [
        { field: 'status', before: '（空）', after: createForm.autoDispatch ? '已派发' : '新建' },
        { field: 'priority', before: '（空）', after: priority },
        { field: 'handlerGroup', before: '（空）', after: handlerGroup }
      ],
      remark: `来源 ${createForm.source}；影响「${createForm.impact}」× 紧急「${createForm.urgency}」→ 优先级 ${priority}；SLA 截止 ${slaDueAt}`
    })
    store.notify({
      type: priority === 'P0' ? 'error' : 'info',
      title: `新事件 ${rec.no}（${priority}）`,
      body: `${rec.title} —— 已自动分派至 ${handlerGroup}，SLA 截止 ${slaDueAt}`,
      toRoles: ['ops', 'desk'], link: `/incident/detail/${rec.id}`
    })
    createVisible.value = false
    ElMessage.success(`事件 ${rec.no} 已创建：优先级 ${priority}，已自动分派至「${handlerGroup}」`)
  })
}

/* ==================================================== 处理事件抽屉 == */
const drawerVisible = ref(false)
const currentId = ref('')
/** 处理抽屉当前页签（受控，便于在详情之间切换时复位） */
const drawerTab = ref('base')
const current = computed(() => allIncidents.value.find(i => i.id === currentId.value) ?? null)

function openHandle(row: any) {
  currentId.value = row.id
  drawerTab.value = 'base'
  drawerVisible.value = true
}
function gotoDetail(row: any) {
  router.push(`/incident/detail/${row.id}`)
}

function requireHandle() {
  if (!store.can('incident.handle') && !store.can('incident.dispatch') && !store.can('desk.manage')) {
    ElMessage.warning('当前角色无事件处理权限')
    return false
  }
  return true
}

function doAccept() {
  const it = current.value
  if (!it || !requireHandle()) return
  store.update('incidents', it.id, { status: 'DISPATCHED', handler: it.handler === '—' ? store.user.name : it.handler },
    { action: '受理事件', remark: '已受理并进入处理流程' })
  store.pushTimeline(it, { action: '受理事件', comment: '已受理，进入处理流程' })
  ElMessage.success('已受理，事件状态更新为「已派发」')
}

function doProcessing() {
  const it = current.value
  if (!it || !requireHandle()) return
  store.update('incidents', it.id, { status: 'PROCESSING', handler: it.handler === '—' ? store.user.name : it.handler },
    { action: '事件处理中', remark: '开始定位与处理' })
  store.pushTimeline(it, { action: '处理中', comment: '已开始处理并定位问题' })
  ElMessage.success('事件状态更新为「处理中」')
}

async function doResolve() {
  const it = current.value
  if (!it || !requireHandle()) return
  try {
    const { value } = await ElMessageBox.prompt('请填写解决方案（将写入事件单并沉淀至知识库）', `解决事件 ${it.no}`, {
      confirmButtonText: '标记解决', cancelButtonText: '取消', inputType: 'textarea',
      inputValue: '已按排查清单定位原因并处理完成，验证通过。'
    })
    store.update('incidents', it.id, { status: 'RESOLVED', solution: value, resolvedAt: iso() },
      { action: '解决事件', remark: value })
    store.pushTimeline(it, { action: '解决', comment: value })
    store.notify({
      type: 'success', title: `事件 ${it.no} 已解决`,
      body: `解决方案：${value}`, toRoles: ['desk', 'consumer'], link: `/incident/detail/${it.id}`
    })
    ElMessage.success('已标记为「已解决」，可继续关闭事件')
  } catch { /* 取消 */ }
}

async function doEscalate() {
  const it = current.value
  if (!it || !store.can('incident.dispatch')) { ElMessage.warning('当前角色无事件升级权限'); return }
  try {
    const { value } = await ElMessageBox.prompt('请填写升级原因（将改派二线支持组）', `升级事件 ${it.no}`, {
      confirmButtonText: '确认升级', cancelButtonText: '取消', inputType: 'textarea',
      inputValue: '一线无法定位根因，升级至二线支持组继续处理。'
    })
    store.update('incidents', it.id, {
      status: 'ESCALATED', handlerGroup: '运维中心 · 二线支持组', handler: '陈志刚', escalateReason: value
    }, { action: '事件升级', remark: value })
    store.pushTimeline(it, { action: '升级', comment: `${value}（已改派运维中心 · 二线支持组）` })
    store.notify({
      type: 'warning', title: `事件 ${it.no} 已升级`,
      body: `升级原因：${value}，已改派运维中心二线支持组。`, toRoles: ['ops', 'desk'], link: `/incident/detail/${it.id}`
    })
    ElMessage.success('已升级并改派「运维中心 · 二线支持组」')
  } catch { /* 取消 */ }
}

/* --------------------------------------------------- 关联重复事件 -- */
const linkVisible = ref(false)
const linkSelection = ref<string[]>([])
function openLink() {
  const it = current.value
  if (!it) return
  linkSelection.value = [...listOf(it.relatedIncidentIds)]
  linkVisible.value = true
}
function saveLink() {
  const it = current.value
  if (!it) return
  store.update('incidents', it.id, { relatedIncidentIds: [...linkSelection.value] }, {
    action: '关联重复事件',
    remark: `关联 ${linkSelection.value.length} 条重复事件（系统自动统计重复数量）`
  })
  store.pushTimeline(it, { action: '关联重复事件', comment: `与 ${linkSelection.value.length} 条同类事件关联，系统自动统计重复数量` })
  linkVisible.value = false
  ElMessage.success(`已关联 ${linkSelection.value.length} 条重复事件`)
}

/* ------------------------------------------------------- 开出问题单 -- */
async function createProblem() {
  const it = current.value
  if (!it) return
  if (!store.can('problem.manage') && !store.can('incident.handle') && !store.can('incident.dispatch')) {
    ElMessage.warning('当前角色无「由事件开出问题单」权限')
    return
  }
  try {
    await ElMessageBox.confirm('将由本事件单开出问题单，自动继承关联关系与优先级，是否继续？', `开出问题单 ${it.no}`, {
      confirmButtonText: '开出问题单', cancelButtonText: '取消', type: 'info'
    })
  } catch { return }
  const no = `WT${nowStamp()}${String((store.table('problems') as any[]).length + 1).padStart(4, '0')}`
  const p = store.insert('problems', {
    id: demoUid('prob'),
    no,
    title: `${it.title}（根因分析）`,
    source: 'INCIDENT',
    sourceIncidentIds: [it.id, ...arr(it.relatedIncidentIds)],
    severity: it.severity, impact: it.impact, urgency: it.urgency, priority: it.priority,
    status: 'NEW', handler: it.handler === '—' ? store.user.name : it.handler,
    dept: it.handlerGroup,
    rootCause: '', knownError: null, solution: '', preventive: '',
    notifyChannels: ['站内', '邮件'], notifyLogs: [],
    relatedChangeIds: [], relatedCiIds: [...arr(it.ciIds)], knowledgeId: null,
    createdAt: iso(), expectAt: it.slaDueAt,
    timeline: [{ at: iso(), actor: store.user.name, action: '由事件单开出问题单', comment: `来源事件 ${it.no}` }]
  })
  store.update('incidents', it.id, { problemId: p.id }, { action: '开出问题单', remark: `生成问题单 ${no} 做根因分析` })
  store.pushTimeline(it, { action: '开出问题单', comment: `生成问题单 ${no}` })
  ElMessage.success(`已开出问题单 ${no}`)
}

/* ------------------------------------------------------- 开出变更单 -- */
async function createChange() {
  const it = current.value
  if (!it) return
  if (!store.can('demand.change') && !store.can('release.manage') && !store.can('incident.dispatch')) {
    ElMessage.warning('当前角色无「由事件开出变更单」权限')
    return
  }
  try {
    await ElMessageBox.confirm('将由本事件单开出变更单（用于实施修复方案），是否继续？', `开出变更单 ${it.no}`, {
      confirmButtonText: '开出变更单', cancelButtonText: '取消', type: 'info'
    })
  } catch { return }
  const no = `BG${nowStamp()}${String((store.table('changes') as any[]).length + 1).padStart(3, '0')}`
  const c = store.insert('changes', {
    id: demoUid('chg'),
    no,
    title: `${it.title} —— 修复实施变更`,
    demandId: null, demandNo: null,
    category: '故障修复', priority: it.priority,
    implementDate: it.slaDueAt, requestor: store.user.name, implementer: '运维中心 · 二线支持组',
    plan: `针对事件 ${it.no}（${it.title}）实施修复变更，按标准变更窗口执行并验证。`,
    resources: [], riskLevel: it.priority === 'P0' ? '高' : '中',
    impact: { ciList: [...arr(it.ciIds)], services: [], tenants: [], suggestion: '建议在业务低峰期执行，并准备回滚方案。' },
    conflicts: [], status: 'PENDING_APPROVE', submittedAt: iso(), expectAt: it.slaDueAt,
    timeline: [{ at: iso(), actor: store.user.name, action: '由事件单开出变更单', comment: `来源事件 ${it.no}` }]
  })
  store.update('incidents', it.id, { changeId: c.id }, { action: '开出变更单', remark: `生成变更单 ${no}` })
  store.pushTimeline(it, { action: '开出变更单', comment: `生成变更单 ${no}` })
  ElMessage.success(`已开出变更单 ${no}`)
}

/* --------------------------------------------------------- 事件广播 -- */
const bcVisible = ref(false)
const bcForm = reactive({ title: '', content: '', groups: ['全部用户'], channels: ['站内', '邮件'] })
function openBroadcast() {
  const it = current.value
  if (!it) return
  bcForm.title = `【事件通告】${it.title} 处置进展`
  bcForm.content = `各位相关人员：\n${it.no}（${it.title}）当前处理状态：${(config.dicts.IncidentStatus as any)[it.status]?.label ?? it.status}。\n处理组：${it.handlerGroup}，处理人：${it.handler}。\n后续进展将通过本渠道持续通告。`
  bcForm.groups = ['全部用户']
  bcForm.channels = ['站内', '邮件']
  bcVisible.value = true
}
function saveBroadcast() {
  const it = current.value
  if (!it) return
  if (!bcForm.title || !bcForm.content) { ElMessage.warning('请填写广播标题与内容'); return }
  const no = `GB${nowStamp()}${String((store.table('broadcasts') as any[]).length + 1).padStart(3, '0')}`
  const b = store.insert('broadcasts', {
    id: demoUid('bc'),
    no, title: bcForm.title, content: bcForm.content,
    targets: [{ type: 'GROUP', ids: [...bcForm.groups] }],
    channels: [...bcForm.channels], sender: store.user.name, senderOrg: store.user.org,
    sentAt: iso(), readBy: [], status: 'NEW', relatedId: it.id
  })
  store.update('incidents', it.id, { broadcastIds: [...arr(it.broadcastIds), b.id] }, {
    action: '事件广播', remark: `向 ${bcForm.groups.join('、')} 通告事件信息与进展（${bcForm.channels.join('/')}）`
  })
  store.pushTimeline(it, { action: '事件广播', comment: `已向 ${bcForm.groups.join('、')} 通告事件进展` })
  bcVisible.value = false
  ElMessage.success(`广播 ${no} 已发送至 ${bcForm.groups.join('、')}`)
}

/* ----------------------------------------------------------- 关闭事件 -- */
const closeVisible = ref(false)
const closeForm = reactive({ closeType: '一线解决', comment: '' })
function openClose() {
  const it = current.value
  if (!it) return
  if (!CLOSED_STATUS.includes(it.status)) { ElMessage.warning('请先将事件标记为「已解决」后再关闭'); return }
  closeForm.closeType = it.closeType || '一线解决'
  closeForm.comment = '经与用户确认，问题已恢复，同意关闭。'
  closeVisible.value = true
}
function saveClose() {
  const it = current.value
  if (!it) return
  store.update('incidents', it.id, { status: 'CLOSED', closeType: closeForm.closeType, closedAt: iso() }, {
    action: '关闭事件', remark: `关闭方式：${closeForm.closeType}；${closeForm.comment}`
  })
  store.pushTimeline(it, { action: '关闭事件', comment: `${closeForm.closeType}：${closeForm.comment}` })
  store.insert('callbacks', {
    id: demoUid('cb'),
    ticketType: '事件单', ticketId: it.id, ticketNo: it.no,
    score: null, comment: '', status: '待回访', sentAt: iso(), repliedAt: null, to: it.handler
  })
  store.notify({
    type: 'success', title: `事件 ${it.no} 已关闭`,
    body: `关闭方式：${closeForm.closeType}，系统已自动生成回访调查。`, toRoles: ['desk', 'ops'], link: `/incident/detail/${it.id}`
  })
  closeVisible.value = false
  ElMessage.success(`事件已关闭（${closeForm.closeType}），回访调查已自动生成`)
}

/* ======================================================== 决策树 -- */
const dtreeVisible = ref(false)
const dtreeKey = ref('')
const dtreePath = ref<{ q: string; a: string }[]>([])
/**
 * 决策树数据结构为 { root: 'q1', nodes: { q1: {...}, r_login: {...} } } —— 是对象而非数组，
 * 因此直接取 .nodes，不能用 [0] 索引。
 */
const dtreeTree = computed(() => (store.table('decisionTree') ?? {}) as { root?: string; nodes?: Record<string, any> })
const dtreeNodes = computed(() => dtreeTree.value.nodes ?? {})
const dtreeNode = computed(() => dtreeNodes.value[dtreeKey.value] ?? null)

function openDtree() {
  dtreeKey.value = dtreeTree.value.root ?? ''
  dtreePath.value = []
  dtreeVisible.value = true
}
function chooseOption(opt: any) {
  dtreePath.value.push({ q: dtreeNode.value?.text ?? '', a: opt.label })
  dtreeKey.value = opt.next
}
function resetDtree() {
  dtreeKey.value = dtreeTree.value.root ?? ''
  dtreePath.value = []
}
function createFromDtree() {
  const node = dtreeNode.value
  if (!node) return
  openCreate('服务台申报')
  const tags = listOf(node.tags)
  createForm.title = `${tags[0] ? '【' + tags[0] + '】' : ''}${node.text}`
  createForm.description = `${node.advice}\n\n决策树判定路径：${dtreePath.value.map(p => `${p.q} → ${p.a}`).join('；')}`
  const cat = categories.value.find(c => tags.includes(c.name))
  if (cat) createForm.categoryId = cat.id
  createForm.severity = '高'
  createForm.impact = '部分功能受影响'
  createForm.urgency = '较急'
  syncMatch()
  dtreeVisible.value = false
  ElMessage.success('已按决策树结论预填事件单，请确认后提交')
}

/* ========================================================== 图表 -- */
const chartCategory = computed(() => {
  const m = countBy(allIncidents.value, 'categoryName')
  return Object.keys(m).map(k => ({ name: k, value: m[k] }))
})
const chartHour = computed(() => {
  const rows = allIncidents.value.filter(i => i.__hour !== undefined && i.__hour !== null)
  const buckets = new Array(24).fill(0)
  rows.forEach(r => { buckets[num(r.__hour)] += 1 })
  return buckets.map((v, i) => ({ name: `${i} 时`, value: v }))
})
const chartSeverity = computed(() => {
  const m = countBy(allIncidents.value, 'severity')
  return Object.keys(m).map(k => ({ name: k, value: m[k] }))
})

/* ========================================================== 其它 -- */
const relateCount = (it: any) => arr(it.relatedIncidentIds).length
const kbOf = (id: string) => knowledges.value.find(k => k.id === id) ?? null
const problemOf = (id: string) => store.findById('problems', id) as any
const changeOf = (id: string) => store.findById('changes', id) as any
const bcOf = (id: string) => store.findById('broadcasts', id) as any

function exportList() {
  ElMessage.success(`已导出 ${filtered.value.length} 条事件单（导出文件已生成）`)
}

function rowClass({ row }: { row: any }) {
  return slaInfo(row).overdue ? 'row-overdue' : ''
}
</script>

<template>
  <div>
    <PageHead
      title="事件管理"
      desc="多来源事件录入、按分类自动分派、知识库关键字推荐、事件升级 / 关联 / 广播与决策树分析。"
    >
      <template #actions>
        <el-button @click="openDtree"><el-icon><Share /></el-icon> 事件决策树</el-button>
        <el-button @click="router.push('/incident/config')"><el-icon><Setting /></el-icon> 事件分类与模板</el-button>
        <el-button @click="exportList"><el-icon><Download /></el-icon> 导出</el-button>
        <el-button type="primary" @click="openCreate('服务台申报')"><el-icon><Plus /></el-icon> 新建事件</el-button>
      </template>
    </PageHead>

    <StatCards :items="stats" />

    <div class="card">
      <div class="toolbar">
        <div class="toolbar__fields">
          <div class="field"><span class="field__label">关键字</span>
            <el-input v-model="f.kw" placeholder="单号 / 标题 / 描述 / 处理人" clearable style="width: 210px" @input="page = 1" />
          </div>
          <div class="field"><span class="field__label">状态</span>
            <el-select v-model="f.status" placeholder="全部" clearable style="width: 116px" @change="page = 1">
              <el-option v-for="o in statusOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </div>
          <div class="field"><span class="field__label">严重等级</span>
            <el-select v-model="f.severity" placeholder="全部" clearable style="width: 104px" @change="page = 1">
              <el-option v-for="o in severityOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </div>
          <div class="field"><span class="field__label">影响程度</span>
            <el-select v-model="f.impact" placeholder="全部" clearable style="width: 140px" @change="page = 1">
              <el-option v-for="o in impactOptions" :key="o" :label="o" :value="o" />
            </el-select>
          </div>
          <div class="field"><span class="field__label">紧急程度</span>
            <el-select v-model="f.urgency" placeholder="全部" clearable style="width: 104px" @change="page = 1">
              <el-option v-for="o in urgencyOptions" :key="o" :label="o" :value="o" />
            </el-select>
          </div>
          <div class="field"><span class="field__label">优先级</span>
            <el-select v-model="f.priority" placeholder="全部" clearable style="width: 118px" @change="page = 1">
              <el-option v-for="o in priorityOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </div>
          <div class="field"><span class="field__label">来源</span>
            <el-select v-model="f.source" placeholder="全部" clearable style="width: 124px" @change="page = 1">
              <el-option v-for="o in sourceOptions" :key="o" :label="o" :value="o" />
            </el-select>
          </div>
          <div class="field"><span class="field__label">处理组</span>
            <el-select v-model="f.handlerGroup" placeholder="全部" clearable filterable style="width: 196px" @change="page = 1">
              <el-option v-for="o in groupOptions" :key="o" :label="o" :value="o" />
            </el-select>
          </div>
        </div>
        <div class="toolbar__actions">
          <el-button @click="resetFilter">重置</el-button>
        </div>
      </div>

      <el-table :data="paged" style="width: 100%" row-key="id" :row-class-name="rowClass">
        <el-table-column prop="no" label="事件单号" width="126" fixed="left">
          <template #default="{ row }">
            <el-button link type="primary" @click="openHandle(row)">{{ row.no }}</el-button>
          </template>
        </el-table-column>
        <el-table-column label="标题 / 描述" min-width="240" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="cell-main">{{ row.title }}</div>
            <div class="cell-sub">{{ row.description }}</div>
          </template>
        </el-table-column>
        <el-table-column label="来源" width="96">
          <template #default="{ row }"><StatusTag :label="row.source" tone="neutral" :dot="false" /></template>
        </el-table-column>
        <el-table-column label="分类" width="150" show-overflow-tooltip>
          <template #default="{ row }">
            <div>{{ row.categoryName }}</div>
            <div v-if="relateCount(row)" class="cell-sub">已关联 {{ relateCount(row) }} 条重复事件</div>
          </template>
        </el-table-column>
        <el-table-column label="严重等级" width="94">
          <template #default="{ row }"><StatusTag dict="Severity" :value="row.severity" /></template>
        </el-table-column>
        <el-table-column label="影响程度" width="126">
          <template #default="{ row }"><span class="text-sm">{{ row.impact }}</span></template>
        </el-table-column>
        <el-table-column label="紧急程度" width="92">
          <template #default="{ row }"><span class="text-sm">{{ row.urgency }}</span></template>
        </el-table-column>
        <el-table-column label="优先级" width="92">
          <template #default="{ row }"><StatusTag dict="Priority" :value="row.priority" :dot="false" /></template>
        </el-table-column>
        <el-table-column label="处理人 / 组" width="170" show-overflow-tooltip>
          <template #default="{ row }">
            <div>{{ row.handler }}</div>
            <div class="cell-sub">{{ row.handlerGroup }}</div>
          </template>
        </el-table-column>
        <el-table-column label="SLA 剩余时间" width="132">
          <template #default="{ row }">
            <span class="sla" :class="`sla--${slaInfo(row).tone}`">{{ slaInfo(row).text }}</span>
            <div class="cell-sub">{{ row.slaDueAt ? fmtTime(row.slaDueAt).slice(5, 16) + ' 截止' : '' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }"><StatusTag dict="IncidentStatus" :value="row.status" /></template>
        </el-table-column>
        <el-table-column label="操作" width="130" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openHandle(row)">处理</el-button>
            <el-button link size="small" @click="gotoDetail(row)">详情</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty-box">
            <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
            <div class="empty-box__text">没有符合条件的事件单</div>
          </div>
        </template>
      </el-table>

      <div class="card__foot">
        <span class="text-sm muted">共 <b>{{ filtered.length }}</b> 条事件单 · 超期记录以红色标注，临近 SLA（≤4 小时）以橙色标注</span>
        <span class="card__spacer" />
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="filtered.length"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          background
        />
      </div>
    </div>

    <!-- ========================================================= 分析 -- -->
    <div class="grid grid--3 mt-4">
      <div class="card">
        <div class="card__head">
          <div class="card__title">按分类的事件分布</div>
          <div class="card__sub">共 {{ allIncidents.length }} 条事件</div>
        </div>
        <div class="card__body">
          <ChartBox kind="bar" :data="chartCategory" :height="260" :rotate="true" />
        </div>
      </div>
      <div class="card">
        <div class="card__head">
          <div class="card__title">按小时的事件分布</div>
          <div class="card__sub">近 7 天 24 小时梯度统计</div>
        </div>
        <div class="card__body">
          <ChartBox kind="bar" :data="chartHour" :height="260" />
        </div>
      </div>
      <div class="card">
        <div class="card__head">
          <div class="card__title">按严重等级分布</div>
          <div class="card__sub">严重 / 高 / 中 / 低</div>
        </div>
        <div class="card__body">
          <ChartBox kind="donut" :data="chartSeverity" :height="260" center-label="事件单" />
        </div>
      </div>
    </div>

    <!-- ==================================================== 新建事件 -- -->
    <el-dialog v-model="createVisible" title="新建事件单" width="1000px" top="5vh">
      <el-form ref="formRef" :model="createForm" :rules="createRules" label-width="104px">
        <el-form-item label="事件来源" prop="source">
          <el-radio-group v-model="createForm.source">
            <el-radio-button value="服务台申报"><el-icon><Headset /></el-icon> 服务台申报</el-radio-button>
            <el-radio-button value="客户自助"><el-icon><Monitor /></el-icon> 客户自助录入</el-radio-button>
            <el-radio-button value="微信报障"><el-icon><ChatDotRound /></el-icon> 微信报障</el-radio-button>
            <el-radio-button value="邮件"><el-icon><Message /></el-icon> 邮件</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="套用模板">
          <el-select :model-value="createForm.templateId" placeholder="选择事件模板可自动填充标题、描述、分类与等级" clearable style="width: 100%" @change="applyTemplate">
            <el-option
              v-for="t in templates"
              :key="t.id"
              :label="`${t.name}（${categories.find(c => c.id === t.categoryId)?.name ?? '—'} · ${t.severity} / ${t.urgency}）`"
              :value="t.id"
            />
          </el-select>
        </el-form-item>

        <div class="grid grid--side">
          <div>
            <el-form-item label="事件标题" prop="title">
              <el-input v-model="createForm.title" placeholder="如：【接口异常】医疗机构信息查询服务返回 403" @input="syncMatch" />
            </el-form-item>

            <el-form-item label="事件描述" prop="description">
              <el-input
                v-model="createForm.description"
                type="textarea"
                :rows="5"
                placeholder="请描述现象、影响范围与已尝试的处理；输入过程中右侧会自动检索知识库相关条目"
                @input="syncMatch"
              />
            </el-form-item>

            <div class="grid grid--2">
              <el-form-item label="事件分类" prop="categoryId">
                <el-select v-model="createForm.categoryId" style="width: 100%">
                  <el-option v-for="c in categories" :key="c.id" :label="`${c.name}（${c.group}）`" :value="c.id" />
                </el-select>
              </el-form-item>
              <el-form-item label="严重等级" prop="severity">
                <el-select v-model="createForm.severity" style="width: 100%">
                  <el-option v-for="o in severityOptions" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
              </el-form-item>
              <el-form-item label="影响程度">
                <el-select v-model="createForm.impact" style="width: 100%">
                  <el-option v-for="o in impactOptions" :key="o" :label="o" :value="o" />
                </el-select>
              </el-form-item>
              <el-form-item label="紧急程度">
                <el-select v-model="createForm.urgency" style="width: 100%">
                  <el-option v-for="o in urgencyOptions" :key="o" :label="o" :value="o" />
                </el-select>
              </el-form-item>
            </div>

            <el-form-item label="优先级">
              <StatusTag dict="Priority" :value="newPriority" :dot="false" />
              <span class="text-xs muted ml-2">按「影响程度 × 紧急程度」矩阵自动推导</span>
            </el-form-item>

            <el-divider content-position="left">扩展信息（覆盖数字 / 字符 / 下拉 / 布尔 / 时间 / 人员字段）</el-divider>
            <div class="grid grid--2">
              <el-form-item label="影响用户数">
                <el-input-number v-model="createForm.affectedUsers" :min="0" :step="10" controls-position="right" style="width: 100%" />
              </el-form-item>
              <el-form-item label="发生时间">
                <el-date-picker v-model="createForm.occurAt" type="datetime" value-format="YYYY-MM-DD HH:mm" style="width: 100%" />
              </el-form-item>
              <el-form-item label="联系人" prop="contact"><el-input v-model="createForm.contact" /></el-form-item>
              <el-form-item label="联系电话" prop="contactPhone"><el-input v-model="createForm.contactPhone" maxlength="11" /></el-form-item>
              <el-form-item label="相关系统">
                <el-select v-model="createForm.modelSystem" style="width: 100%">
                  <el-option v-for="s in ['数据服务管理工具', '三医一张图可视化', '医保基金监管分析平台', '数据服务网关', '数据生产调度平台']" :key="s" :label="s" :value="s" />
                </el-select>
              </el-form-item>
              <el-form-item label="建议处理人">
                <el-select v-model="createForm.suggestHandler" clearable placeholder="留空则由系统按分类分派" style="width: 100%">
                  <el-option v-for="u in (store.table('users') as any[])" :key="u.id" :label="`${u.name}（${u.org}）`" :value="u.name" />
                </el-select>
              </el-form-item>
            </div>
            <div class="grid grid--2">
              <el-form-item label="通知方式">
                <el-checkbox-group v-model="createForm.notifyChannels">
                  <el-checkbox v-for="c in ['站内', '邮件', '短信']" :key="c" :value="c">{{ c }}</el-checkbox>
                </el-checkbox-group>
              </el-form-item>
              <el-form-item label="自动处理">
                <el-switch v-model="createForm.autoDispatch" active-text="按分类自动分派" />
                <el-switch v-model="createForm.autoEscalate" active-text="超时自动升级" style="margin-left: 12px" />
              </el-form-item>
            </div>
          </div>

          <!-- 知识库实时推荐（录入时自动查询知识库中的相关知识条目） -->
          <div class="kb-panel">
            <div class="card__head">
              <div class="card__title">知识库实时推荐</div>
              <div class="card__sub">按输入关键字自动匹配</div>
            </div>
            <div class="card__body">
              <div v-if="suggestedCategory" class="kb-suggest">
                <span class="text-xs muted">分类建议</span>
                <StatusTag :label="suggestedCategory.cat.name" tone="teal" :dot="false" />
                <span class="text-xs muted">命中 {{ suggestedCategory.hits }} 个预置关键字</span>
                <el-button link type="primary" size="small" @click="createForm.categoryId = suggestedCategory.cat.id">采用</el-button>
              </div>
              <div v-if="!recommendations.length" class="empty-box">
                <div class="empty-box__icon"><el-icon><Search /></el-icon></div>
                <div class="empty-box__text">输入标题或描述后，系统将自动查询知识库中的相关条目</div>
              </div>
              <div v-else class="kb-list">
                <div v-for="r in recommendations" :key="r.k.id" class="kb-item">
                  <div class="kb-item__head">
                    <span class="bold text-sm">{{ r.k.title }}</span>
                    <StatusTag dict="KnowledgeStatus" :value="r.k.status" :dot="false" />
                  </div>
                  <div class="text-xs muted mt-1">{{ r.k.categoryName }} · 维护人 {{ r.k.owner }} · 引用 {{ r.k.refCount }} 次</div>
                  <div class="mt-2">
                    <span class="text-xs muted">匹配关键字：</span>
                    <el-tag v-for="h in r.hits" :key="h" size="small" type="warning" effect="plain" class="mr-1">{{ h }}</el-tag>
                  </div>
                  <div class="mt-2">
                    <el-button link type="primary" size="small" @click="pickKnowledge(r.k)">引用到描述</el-button>
                    <el-button link size="small" @click="router.push('/kb/list')">查看知识条目</el-button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" @click="submitCreate">提交事件单</el-button>
      </template>
    </el-dialog>

    <!-- ==================================================== 处理抽屉 -- -->
    <el-drawer v-model="drawerVisible" size="64%" :title="`处理事件 · ${current?.no ?? ''}`">
      <template v-if="current">
        <div class="flex items-center gap-2 mb-3 wrap">
          <StatusTag dict="IncidentStatus" :value="current.status" />
          <StatusTag dict="Priority" :value="current.priority" :dot="false" />
          <StatusTag dict="Severity" :value="current.severity" />
          <StatusTag v-if="relateCount(current)" :label="`已关联 ${relateCount(current)} 条重复事件`" tone="purple" />
          <span class="card__spacer" />
          <span class="text-sm sla" :class="`sla--${slaInfo(current).tone}`">SLA：{{ slaInfo(current).text }}</span>
        </div>

        <el-tabs v-model="drawerTab">
          <el-tab-pane label="基本信息" name="base">
            <div class="card mb-3">
              <div class="card__body">
                <div class="desc-grid">
                  <div class="desc-item"><div class="desc-item--label">事件单号</div><div class="desc-item__value mono">{{ current.no }}</div></div>
                  <div class="desc-item"><div class="desc-item--label">来源</div><div class="desc-item__value">{{ current.source }}</div></div>
                  <div class="desc-item"><div class="desc-item--label">分类</div><div class="desc-item__value">{{ current.categoryName }}</div></div>
                  <div class="desc-item"><div class="desc-item--label">处理人</div><div class="desc-item__value">{{ current.handler }}</div></div>
                  <div class="desc-item"><div class="desc-item--label">处理组</div><div class="desc-item__value">{{ current.handlerGroup }}</div></div>
                  <div class="desc-item"><div class="desc-item--label">SLA 截止</div><div class="desc-item__value">{{ fmtTime(current.slaDueAt) }}</div></div>
                  <div class="desc-item"><div class="desc-item--label">严重 / 影响 / 紧急</div><div class="desc-item__value">{{ current.severity }} / {{ current.impact }} / {{ current.urgency }}</div></div>
                  <div class="desc-item"><div class="desc-item--label">关闭方式</div><div class="desc-item__value">{{ current.closeType || '—' }}</div></div>
                  <div class="desc-item desc-item--wide"><div class="desc-item--label">事件标题</div><div class="desc-item__value bold">{{ current.title }}</div></div>
                  <div class="desc-item desc-item--wide"><div class="desc-item--label">事件描述</div><div class="desc-item__value">{{ current.description }}</div></div>
                  <div v-if="current.solution" class="desc-item desc-item--wide"><div class="desc-item--label">解决方案</div><div class="desc-item__value">{{ current.solution }}</div></div>
                  <div v-if="current.escalateReason" class="desc-item desc-item--wide"><div class="desc-item--label">升级原因</div><div class="desc-item__value">{{ current.escalateReason }}</div></div>
                  <div v-if="arr(current.ciIds).length" class="desc-item desc-item--wide">
                    <div class="desc-item--label">关联配置项</div>
                    <div class="desc-item__value">
                      <el-tag v-for="ci in listOf(current.ciIds)" :key="ci" size="small" effect="plain" class="mr-1">
                        {{ (store.findById('cis', ci) as any)?.name ?? ci }}
                      </el-tag>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane :label="`关联知识库(${arr(current.knowledgeRefs).length})`" name="kb">
            <div v-if="!arr(current.knowledgeRefs).length" class="empty-box">
              <div class="empty-box__icon"><el-icon><Tickets /></el-icon></div>
              <div class="empty-box__text">暂无关联知识条目（录入时系统会按关键字自动推荐）</div>
            </div>
            <div v-else class="kb-list">
              <div v-for="kid in listOf(current.knowledgeRefs)" :key="kid" class="kb-item">
                <div class="kb-item__head">
                  <span class="bold text-sm">{{ kbOf(kid)?.title ?? kid }}</span>
                  <StatusTag dict="KnowledgeStatus" :value="kbOf(kid)?.status" :dot="false" />
                </div>
                <div class="text-xs muted mt-1">
                  {{ kbOf(kid)?.categoryName }} · 维护人 {{ kbOf(kid)?.owner }} · 引用 {{ kbOf(kid)?.refCount }} 次
                </div>
                <div class="text-sm mt-2">{{ kbOf(kid)?.contentText }}</div>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="处理时间轴" name="tl">
            <div class="tl">
              <div
                v-for="(t, i) in listOf(current.timeline)"
                :key="i"
                class="tl__item"
                :class="i === listOf(current.timeline).length - 1 ? 'tl__item--active' : 'tl__item--done'"
              >
                <div class="tl__dot" />
                <div class="tl__head">
                  <span class="tl__action">{{ (t as any).action }}</span>
                  <span class="tl__meta">{{ (t as any).actor }} · {{ fmtTime((t as any).at) }}（{{ fromNow((t as any).at) }}）</span>
                </div>
                <div v-if="(t as any).comment" class="tl__quote">{{ (t as any).comment }}</div>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="关联与派生单据" name="rel">
            <div class="card mb-3">
              <div class="card__head">
                <div class="card__title">重复事件关联（自动统计数量）</div>
                <span class="card__spacer" />
                <span class="bold">{{ relateCount(current) }} 条</span>
              </div>
              <div class="card__body card__body--flush">
                <div v-if="!relateCount(current)" class="empty-box">
                  <div class="empty-box__icon"><el-icon><Link /></el-icon></div>
                  <div class="empty-box__text">暂无关联的重复事件</div>
                </div>
                <el-table v-else :data="allIncidents.filter(x => arr(current.relatedIncidentIds).includes(x.id))" size="small" style="width: 100%">
                  <el-table-column prop="no" label="事件单号" width="126" />
                  <el-table-column prop="title" label="标题" min-width="200" show-overflow-tooltip />
                  <el-table-column label="状态" width="100"><template #default="{ row }"><StatusTag dict="IncidentStatus" :value="row.status" /></template></el-table-column>
                  <el-table-column label="操作" width="80"><template #default="{ row }"><el-button link type="primary" size="small" @click="openHandle(row)">查看</el-button></template></el-table-column>
                </el-table>
              </div>
            </div>
            <div class="grid grid--2">
              <div class="card">
                <div class="card__head"><div class="card__title">开出的问题单</div></div>
                <div class="card__body">
                  <div v-if="!current.problemId" class="text-sm muted">尚未开出问题单</div>
                  <div v-else>
                    <div class="bold">{{ problemOf(current.problemId)?.no }}</div>
                    <div class="text-sm">{{ problemOf(current.problemId)?.title }}</div>
                    <StatusTag class="mt-2" dict="ProblemStatus" :value="problemOf(current.problemId)?.status" />
                  </div>
                </div>
              </div>
              <div class="card">
                <div class="card__head"><div class="card__title">开出的变更单</div></div>
                <div class="card__body">
                  <div v-if="!current.changeId" class="text-sm muted">尚未开出变更单</div>
                  <div v-else>
                    <div class="bold">{{ changeOf(current.changeId)?.no }}</div>
                    <div class="text-sm">{{ changeOf(current.changeId)?.title }}</div>
                    <StatusTag class="mt-2" dict="ChangeStatus" :value="changeOf(current.changeId)?.status" />
                  </div>
                </div>
              </div>
            </div>
            <div class="card mt-3">
              <div class="card__head">
                <div class="card__title">广播记录</div>
                <span class="card__spacer" />
                <span class="bold">{{ arr(current.broadcastIds).length }} 条</span>
              </div>
              <div class="card__body">
                <div v-if="!arr(current.broadcastIds).length" class="text-sm muted">尚未广播</div>
                <div v-for="bid in listOf(current.broadcastIds)" :key="bid" class="bc-item">
                  <div class="bold text-sm">{{ bcOf(bid)?.title ?? bid }}</div>
                  <div class="text-xs muted">{{ fmtTime(bcOf(bid)?.sentAt) }} · 发送人 {{ bcOf(bid)?.sender ?? '—' }}</div>
                </div>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>

        <div class="drawer-actions">
          <el-button size="small" :disabled="current.status !== 'NEW'" @click="doAccept">受理</el-button>
          <el-button size="small" :disabled="!['DISPATCHED', 'ESCALATED'].includes(current.status)" @click="doProcessing">处理中</el-button>
          <el-button size="small" type="primary" :disabled="CLOSED_STATUS.includes(current.status)" @click="doResolve">解决</el-button>
          <el-button size="small" type="warning" plain :disabled="CLOSED_STATUS.includes(current.status)" @click="doEscalate">升级</el-button>
          <el-button size="small" @click="openLink">关联重复事件</el-button>
          <el-button size="small" @click="createProblem">开出问题单</el-button>
          <el-button size="small" @click="createChange">开出变更单</el-button>
          <el-button size="small" @click="openBroadcast">事件广播</el-button>
          <el-button size="small" type="success" :disabled="current.status === 'CLOSED'" @click="openClose">关闭</el-button>
        </div>
      </template>
      <div v-else class="empty-box">
        <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
        <div class="empty-box__text">请选择一条事件单</div>
      </div>
    </el-drawer>

    <!-- ================================================ 关联重复事件 -- -->
    <el-dialog v-model="linkVisible" title="关联重复事件" width="700px">
      <div class="text-sm muted mb-2">选择与本事件重复的其他事件单，系统将自动统计重复数量，并在列表与详情中显示「已关联 N 条」。</div>
      <el-select v-model="linkSelection" multiple filterable placeholder="选择重复事件" style="width: 100%">
        <el-option
          v-for="it in allIncidents.filter(x => x.id !== current?.id)"
          :key="it.id"
          :label="`${it.no} · ${it.title}`"
          :value="it.id"
        />
      </el-select>
      <div class="mt-3 text-sm">已选择 <b>{{ linkSelection.length }}</b> 条</div>
      <template #footer>
        <el-button @click="linkVisible = false">取消</el-button>
        <el-button type="primary" @click="saveLink">保存关联</el-button>
      </template>
    </el-dialog>

    <!-- ==================================================== 事件广播 -- -->
    <el-dialog v-model="bcVisible" title="事件广播" width="660px">
      <el-form label-width="90px">
        <el-form-item label="广播标题"><el-input v-model="bcForm.title" /></el-form-item>
        <el-form-item label="广播内容"><el-input v-model="bcForm.content" type="textarea" :rows="6" /></el-form-item>
        <el-form-item label="目标群组">
          <el-select v-model="bcForm.groups" multiple style="width: 100%">
            <el-option v-for="g in ['全部用户', '用数方', '供数方', '订阅方', '运维中心', '服务台']" :key="g" :label="g" :value="g" />
          </el-select>
        </el-form-item>
        <el-form-item label="广播渠道">
          <el-checkbox-group v-model="bcForm.channels">
            <el-checkbox v-for="c in ['站内', '邮件', '短信']" :key="c" :value="c">{{ c }}</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="bcVisible = false">取消</el-button>
        <el-button type="primary" @click="saveBroadcast">发送广播</el-button>
      </template>
    </el-dialog>

    <!-- ==================================================== 关闭事件 -- -->
    <el-dialog v-model="closeVisible" title="关闭事件" width="580px">
      <el-form label-width="90px">
        <el-form-item label="关闭方式">
          <el-radio-group v-model="closeForm.closeType">
            <el-radio v-for="(v, k) in config.dicts.CloseType" :key="k" :value="k">{{ (v as any).label }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="关闭说明"><el-input v-model="closeForm.comment" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="closeVisible = false">取消</el-button>
        <el-button type="primary" @click="saveClose">确认关闭</el-button>
      </template>
    </el-dialog>

    <!-- ================================================== 事件决策树 -- -->
    <el-drawer v-model="dtreeVisible" title="事件决策树（事件分析）" size="46%">
      <div class="dtree__path">
        <span class="muted">已选路径：</span>
        <template v-if="!dtreePath.length"><span class="muted">（尚未选择）</span></template>
        <template v-else>
          <el-tag v-for="(p, i) in dtreePath" :key="i" size="small" effect="plain">{{ p.a }}</el-tag>
        </template>
      </div>

      <div v-if="dtreeNode && dtreeNode.type === 'q'">
        <div class="dtree__q">{{ dtreeNode.text }}</div>
        <div class="dtree__opts">
          <button v-for="(o, i) in dtreeNode.options" :key="i" class="dtree__opt" @click="chooseOption(o)">{{ o.label }}</button>
        </div>
      </div>

      <div v-else-if="dtreeNode" class="dtree__result">
        <div class="bold mb-2">{{ dtreeNode.text }}</div>
        <div class="mb-3">{{ dtreeNode.advice }}</div>
        <div>
          <span class="text-xs">建议关联分类：</span>
          <StatusTag v-for="t in listOf(dtreeNode.tags)" :key="t" :label="String(t)" tone="teal" :dot="false" />
        </div>
        <div class="mt-3">
          <el-button type="primary" size="small" @click="createFromDtree">按此结论创建事件</el-button>
        </div>
      </div>

      <div class="mt-4">
        <el-button size="small" @click="resetDtree">重新开始</el-button>
        <span v-if="dtreePath.length" class="text-xs muted" style="margin-left: 8px">已完成 {{ dtreePath.length }} 步判定</span>
      </div>
    </el-drawer>
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
.sla { font-weight: 600; }
.sla--danger { color: var(--danger-fg); }
.sla--warning { color: var(--warning-fg); }
.sla--muted { color: var(--text-3); }
:deep(.row-overdue) { background: var(--danger-bg); }
:deep(.row-overdue td) { background: transparent; }
.ml-2 { margin-left: var(--sp-2); }
.mr-1 { margin-right: var(--sp-1); }
.kb-panel { border-left: 1px solid var(--border-2); }
.kb-list { display: flex; flex-direction: column; gap: var(--sp-3); }
.kb-item { padding: var(--sp-3); border: 1px solid var(--border-2); border-radius: var(--r-md); background: var(--surface-2); }
.kb-item__head { display: flex; align-items: center; gap: var(--sp-2); justify-content: space-between; }
.kb-suggest { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-2) var(--sp-3); background: var(--teal-bg); border-radius: var(--r-md); margin-bottom: var(--sp-3); flex-wrap: wrap; }
.bc-item { padding: var(--sp-2) 0; border-bottom: 1px dashed var(--border-2); }
.bc-item:last-child { border-bottom: none; }
.drawer-actions {
  display: flex; gap: var(--sp-2); flex-wrap: wrap;
  padding-top: var(--sp-4); margin-top: var(--sp-4);
  border-top: 1px solid var(--border-2);
}
</style>
