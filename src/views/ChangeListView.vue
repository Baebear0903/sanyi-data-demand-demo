<script setup lang="ts">
/**
 * ChangeListView —— 需求变更管理
 *
 * 覆盖原文功能点：需求变更管理 —— "需求创建（手动创建或通过事件、问题创建；基于服务市场申请服务；
 * 模板化创建）；需求变更，未审核前可撤回；需求关联（与事件 / 问题关联，变更分类与优先级，记录实施日期、
 * 相应资源、请求人、实施者、实施计划）；需求审批（独立审批引擎、可定义审批规则、可视化变更窗口）；
 * 风险评估（基于配置管理数据库 CMDB 的数据模型进行影响模拟分析）；冲突分析（基于配置项和服务调用情况）；
 * 变更审计（记录数据前后修改人与时间）。"
 */
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDemoStore } from '@/stores/demo'
import { config } from '@/core/config'
import { arr, by, demoUid, fmtDate, fmtTime, iso, NOW, nowStamp, toDate } from '@/core/utils'
import { canEditChangePlan, planEditableStatus } from '@/core/changePlan'
import PageHead from '@/components/PageHead.vue'
import StatCards from '@/components/StatCards.vue'
import StatusTag from '@/components/StatusTag.vue'
import ChangePlanEditor from '@/components/ChangePlanEditor.vue'

const store = useDemoStore()
const router = useRouter()

/* 本地宽松数组 / 字典工具（store 返回宽类型，避免 unknown 推断） */
const lst = (v: unknown): any[] => (Array.isArray(v) ? v : [])
const dictOpts = (d: Record<string, { label: string }>) => Object.keys(d).map(k => ({ value: k, label: d[k].label }))

const categories = ['范围变更', '服务变更', '资源变更', '计划变更', '配置变更']
const levelOrder = ['L1', 'L2', 'L3', 'L4']

/* ------------------------------------------------------------ 数据 -- */
const allRows = computed(() => by(store.table('changes') as any[], 'implementDate', 'asc'))
const resources = computed(() => store.table('resources') as any[])
const resourceMap = computed<Record<string, any>>(() => {
  const m: Record<string, any> = {}
  resources.value.forEach(r => { m[r.id] = r })
  return m
})
function resLabel(id: string): string {
  const r = resourceMap.value[id]
  return r ? `${r.name}（${r.code}）` : id
}
function demandTitle(id: string): string {
  return store.findById('demands', id)?.title ?? id
}

/* ------------------------------------------------------------ 筛选 -- */
const f = reactive({ kw: '', status: '', category: '', risk: '' })
const filtered = computed(() => allRows.value.filter(c => {
  if (f.status && c.status !== f.status) return false
  if (f.category && c.category !== f.category) return false
  if (f.risk && c.riskLevel !== f.risk) return false
  if (f.kw) {
    const hay = `${c.no} ${c.title} ${c.demandNo} ${c.requestor} ${c.implementer}`.toLowerCase()
    if (!hay.includes(f.kw.toLowerCase())) return false
  }
  return true
}))

const stats = computed(() => {
  const rows = allRows.value
  const conflicts = rows.reduce((s, c) => s + lst(c.conflicts).length, 0)
  return [
    { label: '变更单总数', value: rows.length, unit: '单', icon: 'Refresh', tone: 'primary' as const },
    { label: '待审批', value: rows.filter(c => c.status === 'PENDING_APPROVE').length, unit: '单', icon: 'EditPen', tone: 'info' as const },
    { label: '实施中', value: rows.filter(c => c.status === 'IMPLEMENTING').length, unit: '单', icon: 'Tools', tone: 'purple' as const },
    { label: '已完成', value: rows.filter(c => c.status === 'DONE').length, unit: '单', icon: 'CircleCheck', tone: 'success' as const },
    { label: '高风险变更', value: rows.filter(c => c.riskLevel === '高').length, unit: '单', icon: 'Warning', tone: 'danger' as const, tip: '风险等级由 CMDB 影响模拟结果推导' },
    { label: '已检出冲突', value: conflicts, unit: '项', icon: 'WarningFilled', tone: 'warning' as const, tip: '时间窗 / 资源占用 / 服务依赖三类冲突合计' }
  ]
})

/* -------------------------------------------------------- 新建变更 -- */
const createVisible = ref(false)
const cf = reactive({
  createType: 'MANUAL' as 'MANUAL' | 'INCIDENT' | 'PROBLEM',
  templateId: '',
  sourceId: '',
  title: '',
  demandId: '',
  category: '范围变更',
  priority: 'P2',
  implementDate: fmtDate(NOW),
  resources: [] as string[],
  requestor: '',
  implementer: '刘涛',
  plan: '',
  relatedIncidentIds: [] as string[],
  relatedProblemIds: [] as string[]
})

const templates = computed(() => store.table('workflows') as any[])
const demandOptions = computed(() => (store.table('demands') as any[]).filter(d => !['CANCELLED', 'REJECTED'].includes(d.status)))
const incidentOptions = computed(() => (store.table('incidents') as any[]).slice(0, 60))
const problemOptions = computed(() => store.table('problems') as any[])
const implementerOptions = computed(() => (store.table('users') as any[]).filter(u => /生产中心|运营中心|运维中心/.test(u.org)))

function openCreate() {
  cf.createType = 'MANUAL'
  cf.templateId = ''
  cf.sourceId = ''
  cf.title = ''
  cf.demandId = ''
  cf.category = '范围变更'
  cf.priority = 'P2'
  cf.implementDate = fmtDate(NOW)
  cf.resources = []
  cf.requestor = store.user.name
  cf.implementer = '刘涛'
  cf.plan = ''
  cf.relatedIncidentIds = []
  cf.relatedProblemIds = []
  createVisible.value = true
}

/** 由事件 / 问题创建：自动带出标题与关联 */
function onSourceChange(v: string) {
  cf.sourceId = v
  if (cf.createType === 'INCIDENT') {
    const i = (store.table('incidents') as any[]).find(x => x.id === v)
    if (i) {
      cf.title = `${String(i.title).replace(/^【[^】]+】/, '')}-变更处置`
      cf.relatedIncidentIds = [i.id]
      cf.priority = i.priority ?? 'P2'
      cf.plan = cf.plan || `针对事件单 ${i.no}（${i.description}）实施变更处置。`
    }
  } else if (cf.createType === 'PROBLEM') {
    const p = (store.table('problems') as any[]).find(x => x.id === v)
    if (p) {
      cf.title = `${String(p.title).replace(/（.*?）/g, '')}-根因整改变更`
      cf.relatedProblemIds = [p.id]
      cf.priority = p.priority ?? 'P2'
      cf.plan = cf.plan || `针对问题单 ${p.no} 的根因整改实施变更。根因：${p.rootCause || '分析中'}`
    }
  }
}

function applyTemplate(id: string) {
  const wf = templates.value.find(w => w.id === id)
  if (!wf) return
  cf.templateId = id
  ElMessage.success(`已选用变更审批流模板「${wf.name} ${wf.version}」：${wf.desc}`)
  if (!cf.plan) cf.plan = `按「${wf.name}」执行：${lst(wf.nodes).map((n: any) => n.name).join(' → ')}`
}

function nextChangeNo(): string {
  // 单号日期取当前日期（NOW，见 core/utils），与单据创建时间保持同一天
  const day = nowStamp()
  return `BG${day}${String((store.table('changes') as any[]).length + 1).padStart(3, '0')}`
}

function createChange(submitNow: boolean) {
  if (!cf.title.trim()) { ElMessage.warning('请填写变更标题'); return }
  if (!cf.demandId) { ElMessage.warning('请选择关联需求单（变更必须可追溯到需求）'); return }
  if (!cf.resources.length) { ElMessage.warning('请选择变更涉及的资源'); return }
  const no = nextChangeNo()
  const demand = store.findById('demands', cf.demandId)
  const rec: Record<string, any> = {
    id: demoUid('c'),
    no,
    title: cf.title,
    demandId: cf.demandId,
    demandNo: demand?.no ?? '',
    category: cf.category,
    priority: cf.priority,
    implementDate: cf.implementDate,
    requestor: cf.requestor || store.user.name,
    implementer: cf.implementer,
    plan: cf.plan,
    resources: [...cf.resources],
    riskLevel: '低',
    impact: null,
    conflicts: [],
    status: submitNow ? 'PENDING_APPROVE' : 'DRAFT',
    submittedAt: submitNow ? iso() : null,
    templateId: cf.templateId || undefined,
    relatedIncidentIds: [...cf.relatedIncidentIds],
    relatedProblemIds: [...cf.relatedProblemIds],
    timeline: [{
      at: iso(), actor: cf.requestor || store.user.name,
      action: submitNow ? '发起需求变更' : '保存变更草稿',
      comment: cf.createType === 'INCIDENT' ? '由事件创建'
        : cf.createType === 'PROBLEM' ? '由问题创建'
          : cf.templateId ? '模板化创建' : '手动创建'
    }]
  }
  store.insert('changes', rec)
  store.addAudit({
    bizType: 'changes', bizId: rec.id, bizNo: no, bizTitle: rec.title,
    action: submitNow ? '创建变更单并提交审批' : '创建变更单草稿',
    remark: `变更分类 ${cf.category} · 优先级 ${cf.priority} · 实施日期 ${cf.implementDate} · 涉及资源 ${cf.resources.length} 项`
  })
  /* 回写关联需求单的 changeIds，并把需求单置为「变更中」 */
  if (demand) {
    store.update('demands', demand.id, {
      changeIds: [...lst(demand.changeIds), rec.id],
      status: ['DELIVERED', 'EVALUATED', 'IMPLEMENTING'].includes(demand.status) ? 'CHANGING' : demand.status
    }, { action: '关联需求变更', remark: `生成变更单 ${no}` })
    store.pushTimeline(demand, { action: '发起需求变更', comment: `变更单 ${no}：${cf.title}` })
  }
  if (submitNow) {
    store.notify({
      type: 'info', title: `变更单 ${no} 待审批`,
      body: `变更「${cf.title}」（${cf.category} / ${cf.priority}）已提交，请变更审批人审批。`,
      toRoles: ['supplier', 'admin'], link: `/change/detail/${rec.id}`
    })
    ElMessage.success(`已创建并提交变更单 ${no}，等待审批`)
  } else {
    ElMessage.info(`已保存变更草稿 ${no}`)
  }
  createVisible.value = false
}

/* ------------------------------------------- 风险评估（CMDB 影响模拟） -- */
const impactVisible = ref(false)
const impactRow = ref<any>(null)
const impactResult = ref<any>(null)

/** 沿 dependsOn 反向遍历，找出受影响配置项 */
function affectedCis(seed: string[]): any[] {
  const cis = store.table('cis') as any[]
  const hit = new Set<string>(seed)
  let grew = true
  while (grew) {
    grew = false
    cis.forEach(ci => {
      if (hit.has(ci.id)) return
      if (lst(ci.dependsOn).some((p: string) => hit.has(p))) { hit.add(ci.id); grew = true }
    })
  }
  return cis.filter(ci => hit.has(ci.id))
}

function runImpact(c: any, silent = false) {
  const cis = store.table('cis') as any[]
  const seeds: string[] = []
  lst(c.resources).forEach((rid: string) => {
    const r = resourceMap.value[rid]
    if (!r) return
    cis.forEach(ci => {
      if (ci.name === r.code || ci.name === r.name) seeds.push(ci.id)
      if (lst(ci.relatedServices).some((sid: string) => {
        const sv = (store.table('services') as any[]).find(s => s.id === sid)
        return sv?.resourceId === rid
      })) seeds.push(ci.id)
    })
  })
  const affected = affectedCis(Array.from(new Set(seeds)))
  const serviceIds = new Set<string>()
  const tenantIds = new Set<string>()
  affected.forEach(ci => {
    lst(ci.relatedServices).forEach((s: string) => serviceIds.add(s))
    lst(ci.relatedTenants).forEach((t: string) => tenantIds.add(t))
  })
  const level = lst(c.resources).reduce((a: string, rid: string) => {
    const lv = resourceMap.value[rid]?.securityLevel ?? 'L1'
    return levelOrder.indexOf(lv) > levelOrder.indexOf(a) ? lv : a
  }, 'L1')
  /* 影响等级：高敏感资源或影响面很大为「高」；敏感 / 多服务 / 多配置项为「中」 */
  const risk = level === 'L4' || tenantIds.size >= 4 || affected.length >= 8 ? '高'
    : (level === 'L3' || serviceIds.size >= 2 || tenantIds.size >= 2 || affected.length >= 3) ? '中' : '低'
  const svcNames = Array.from(serviceIds).map(id => {
    const s = (store.table('services') as any[]).find(x => x.id === id)
    return s ? `${s.id} ${s.name}` : id
  })
  const tenantNames = Array.from(tenantIds).map(id => {
    const t = (store.table('tenants') as any[]).find(x => x.id === id)
    return t ? `${t.id} ${t.name}` : id
  })
  const suggestion = `本次变更影响 ${affected.length} 个配置项、${svcNames.length} 个数据服务、${tenantNames.length} 个租户；` +
    (risk === '高'
      ? '风险等级为「高」，建议在业务低峰期（22:00 之后）执行，提前 24 小时发布服务维护公告，并做好回滚预案与安全合规复核。'
      : risk === '中'
        ? '建议避开业务高峰执行，变更前通知受影响订阅方，变更后验证服务可用性。'
        : '影响面较小，可按计划执行，变更后按常规验证服务可用性即可。')
  const result = {
    ciList: affected.map(ci => `${ci.id} ${ci.name}（${ci.type} · ${ci.owner}）`),
    ciIds: affected.map(ci => ci.id),
    services: svcNames,
    tenants: tenantNames,
    resourceIds: lst(c.resources),
    riskLevel: risk,
    suggestion,
    simulatedAt: iso()
  }
  /* 同步返回风险等级，便于调用方直接使用 */
  store.update('changes', c.id, { impact: result, riskLevel: risk }, {
    action: '风险评估（CMDB 影响模拟）',
    remark: `影响 ${affected.length} 个配置项 / ${svcNames.length} 个服务 / ${tenantNames.length} 个租户，风险等级：${risk}`
  })
  store.pushTimeline(c, {
    action: '风险评估',
    comment: `基于 CMDB 影响模拟，影响 ${affected.length} 个配置项、${svcNames.length} 个服务、${tenantNames.length} 个租户，风险等级：${risk}`
  })
  impactResult.value = result
  impactRow.value = c
  if (!silent) {
    impactVisible.value = true
    ElMessage.success(`影响模拟完成，风险等级：${risk}`)
  }
  return result
}

function openImpact(c: any) {
  runImpact(c, true)
  impactVisible.value = true
}

/* --------------------------------------- 冲突分析（真实计算三类冲突） -- */
const conflictVisible = ref(false)
const conflictRow = ref<any>(null)
const conflictResult = ref<any[]>([])

function runConflict(c: any, silent = false): any[] {
  const rows = (store.table('changes') as any[]).filter(x => x.id !== c.id && !['DONE', 'WITHDRAWN'].includes(x.status))
  const out: any[] = []
  const d1 = toDate(c.implementDate)
  /* ① 时间窗冲突：实施日期相同或相邻 */
  rows.forEach(x => {
    const d2 = toDate(x.implementDate)
    if (!d1 || !d2) return
    const diff = Math.abs(d1.getTime() - d2.getTime()) / 86400000
    if (diff <= 1) {
      out.push({
        type: '时间窗',
        with: `${x.no}（${x.title}）`,
        desc: `两者实施窗口相邻（${c.implementDate} / ${x.implementDate}${diff === 0 ? '，同日执行' : '，相差 1 天'}），存在变更窗口重叠风险。`,
        suggestion: `建议将本变更顺延至 ${fmtDate(new Date(d1.getTime() + 2 * 86400000))} 执行，或与实施人 ${x.implementer} 协商错峰窗口。`
      })
    }
  })
  /* ② 资源冲突：涉及资源有交集 */
  rows.forEach(x => {
    const shared = lst(x.resources).filter((r: string) => lst(c.resources).includes(r))
    if (shared.length) {
      out.push({
        type: '资源占用',
        with: `${x.no}（${x.title}）`,
        desc: `两个变更同时涉及 ${shared.map(resLabel).join('、')}，在同一资源上并行变更存在互相覆盖与重算竞争。`,
        suggestion: '建议合并为一次变更执行，或明确先后顺序并错开实施窗口。'
      })
    }
  })
  /* ③ 服务依赖冲突：本变更影响的服务被其他变更涉及 */
  const myServices = new Set([...lst(c.impact?.services), ...lst(c.resources).map(resLabel)])
  rows.forEach(x => {
    const hit = lst(x.impact?.services).filter((s: string) => myServices.has(s))
    if (hit.length) {
      out.push({
        type: '服务依赖',
        with: `${x.no}（${x.title}）`,
        desc: `变更 ${x.no} 影响的服务 ${hit.join('、')} 与本变更影响链路存在调用依赖，可能相互影响可用性。`,
        suggestion: '建议变更前发布服务维护公告，或将两次变更安排在同一维护窗口内统一验证。'
      })
    }
  })
  store.update('changes', c.id, { conflicts: out }, {
    action: '冲突分析',
    remark: out.length ? `检出 ${out.length} 项冲突：${Array.from(new Set(out.map(o => o.type))).join('、')}` : '未检出冲突'
  })
  store.pushTimeline(c, {
    action: '冲突分析',
    comment: out.length ? `检出 ${out.length} 项冲突：${Array.from(new Set(out.map(o => o.type))).join('、')}` : '未检出时间窗 / 资源 / 服务依赖冲突'
  })
  conflictResult.value = out
  conflictRow.value = c
  if (!silent) {
    conflictVisible.value = true
    if (out.length) ElMessage.warning(`已检出 ${out.length} 项冲突，请调整实施计划`)
    else ElMessage.success('未检出冲突，可按计划实施')
  }
  return out
}

function openConflict(c: any) {
  runConflict(c, true)
  conflictVisible.value = true
}

/* ------------------------------------------------------ 调整实施计划 -- */
/*
 * 对应建设方案「支持调整实施计划后重新分析」：
 * 冲突分析给出建议后，必须有一个真正能改计划的地方，否则"建议调整实施计划"只是空话。
 * 编辑面板与规则统一收敛到 components/ChangePlanEditor.vue + core/changePlan.ts，
 * 变更列表与变更单详情共用同一套交互与校验。
 */
const planVisible = ref(false)
const planRow = ref<any>(null)

/** 是否可调整：状态允许 + 具备发起变更或审批变更权限 */
const canEditPlan = (c: any) => canEditChangePlan(store.can, c)

function openPlan(c: any) {
  if (!planEditableStatus(c)) {
    ElMessage.warning('当前状态不可调整实施计划：已审批通过 / 实施中的变更需重新发起变更流程')
    return
  }
  planRow.value = c
  planVisible.value = true
}

/** 抽屉保存后：按需立即用新计划重新执行冲突分析 */
function onPlanSaved({ change, rerun }: { change: any; rerun: boolean }) {
  if (rerun) runConflict(change)
}

/* ------------------------------------------------------------ 动作 -- */
function submit(c: any) {
  store.update('changes', c.id, { status: 'PENDING_APPROVE', submittedAt: iso() }, { action: '提交变更审批' })
  store.pushTimeline(c, { action: '提交变更审批', comment: '提交独立审批引擎流转' })
  store.notify({ type: 'info', title: `变更单 ${c.no} 待审批`, body: `变更「${c.title}」已提交审批。`, toRoles: ['supplier'], link: `/change/detail/${c.id}` })
  ElMessage.success('已提交变更审批')
}

async function approve(c: any) {
  try {
    const { value } = await ElMessageBox.prompt('请填写审批意见', `审批变更单 ${c.no}`, {
      confirmButtonText: '审批通过', cancelButtonText: '取消', inputType: 'textarea',
      inputValue: c.riskLevel === '高' ? '同意变更，按冲突分析建议错峰实施，实施前发布维护公告。' : '同意变更，按计划实施。'
    })
    store.update('changes', c.id, { status: 'APPROVED', approvedAt: iso(), approver: store.user.name },
      { action: '变更审批通过', remark: value })
    store.pushTimeline(c, { action: '变更审批通过', comment: value })
    store.notify({ type: 'success', title: `变更单 ${c.no} 审批通过`, body: `审批意见：${value}`, toRoles: ['producer', 'consumer'], link: `/change/detail/${c.id}` })
    ElMessage.success('审批通过，可开始实施')
  } catch { /* 取消 */ }
}

async function reject(c: any) {
  try {
    const { value } = await ElMessageBox.prompt('请填写驳回原因', `驳回变更单 ${c.no}`, {
      confirmButtonText: '确认驳回', cancelButtonText: '取消', inputType: 'textarea'
    })
    store.update('changes', c.id, { status: 'REJECTED', rejectReason: value }, { action: '变更审批驳回', remark: value })
    store.pushTimeline(c, { action: '变更审批驳回', comment: value })
    ElMessage.warning('已驳回变更单')
  } catch { /* 取消 */ }
}

function withdraw(c: any) {
  store.update('changes', c.id, { status: 'WITHDRAWN', withdrawnAt: iso() }, { action: '撤回变更单', remark: '未审核前撤回' })
  store.pushTimeline(c, { action: '撤回变更单', comment: '变更未审核前可撤回' })
  ElMessage.info('已撤回变更单')
}

function startImplement(c: any) {
  store.update('changes', c.id, { status: 'IMPLEMENTING' }, { action: '开始实施变更' })
  store.pushTimeline(c, { action: '开始实施', comment: `实施人：${c.implementer}` })
  ElMessage.success('已开始实施变更')
}

function finish(c: any) {
  store.update('changes', c.id, { status: 'DONE', doneAt: iso() }, { action: '变更完成' })
  store.pushTimeline(c, { action: '变更完成', comment: '变更已实施完成，授权用户已同步更新' })
  store.notify({
    type: 'success',
    title: `数据服务变更完成（${c.no}）`,
    body: `变更「${c.title}」已实施完成：数据服务变更后将同步更新至其授权用户，请重新获取最新数据 / 接口文档。`,
    toRoles: ['consumer', 'desk', 'admin'], link: `/change/detail/${c.id}`
  })
  if (c.demandId) {
    const demand = store.findById('demands', c.demandId)
    if (demand && demand.status === 'CHANGING') {
      store.update('demands', demand.id, { status: 'DELIVERED' }, { action: '变更完成，需求恢复交付态' })
      store.pushTimeline(demand, { action: '变更完成', comment: `变更单 ${c.no} 已实施完成` })
    }
  }
  conflictVisible.value = false
  ElMessage.success('变更已完成，已向授权用户同步更新通知')
}

function actionsOf(c: any): { label: string; type?: string; run: () => void }[] {
  const out: { label: string; type?: string; run: () => void }[] = []
  const can = store.can
  if (c.status === 'DRAFT' && (can('demand.change') || can('admin.all'))) out.push({ label: '提交', type: 'primary', run: () => submit(c) })
  if (c.status === 'PENDING_APPROVE' && (can('demand.approve') || can('admin.all'))) {
    out.push({ label: '审批', type: 'primary', run: () => approve(c) })
    out.push({ label: '驳回', run: () => reject(c) })
  }
  if (['PENDING_APPROVE', 'DRAFT'].includes(c.status)) out.push({ label: '撤回', run: () => withdraw(c) })
  // 调整实施计划：冲突分析的处置入口，调整后可立即重新分析
  if (canEditPlan(c)) out.push({ label: '调整实施计划', run: () => openPlan(c) })
  if (c.status === 'APPROVED') out.push({ label: '开始实施', type: 'primary', run: () => startImplement(c) })
  if (c.status === 'IMPLEMENTING') out.push({ label: '完成变更', type: 'primary', run: () => finish(c) })
  out.push({ label: '风险评估', run: () => openImpact(c) })
  out.push({ label: '冲突分析', run: () => openConflict(c) })
  out.push({ label: '详情', run: () => router.push(`/change/detail/${c.id}`) })
  return out
}
</script>

<template>
  <div>
    <PageHead
      title="需求变更管理"
      desc="需求变更单的创建、审批、风险评估、冲突分析与可视化排期。"
    >
      <template #actions>
        <el-button @click="router.push('/change/calendar')"><el-icon><Calendar /></el-icon> 可视化变更窗口</el-button>
        <el-button type="primary" @click="openCreate"><el-icon><Plus /></el-icon> 新建变更单</el-button>
      </template>
    </PageHead>

    <StatCards :items="stats" />

    <div class="card">
      <div class="toolbar">
        <div class="toolbar__fields">
          <div class="field"><span class="field__label">关键字</span>
            <el-input v-model="f.kw" placeholder="变更单号 / 标题 / 需求单号 / 人员" clearable style="width: 230px" />
          </div>
          <div class="field"><span class="field__label">状态</span>
            <el-select v-model="f.status" placeholder="全部状态" clearable style="width: 150px">
              <el-option v-for="(o, k) in config.dicts.ChangeStatus" :key="k" :label="o.label" :value="k" />
            </el-select>
          </div>
          <div class="field"><span class="field__label">变更分类</span>
            <el-select v-model="f.category" placeholder="全部分类" clearable style="width: 140px">
              <el-option v-for="o in categories" :key="o" :label="o" :value="o" />
            </el-select>
          </div>
          <div class="field"><span class="field__label">风险等级</span>
            <el-select v-model="f.risk" placeholder="全部等级" clearable style="width: 130px">
              <el-option v-for="(o, k) in config.dicts.RiskLevel" :key="k" :label="o.label" :value="k" />
            </el-select>
          </div>
        </div>
        <div class="toolbar__actions">
          <el-button @click="Object.assign(f, { kw: '', status: '', category: '', risk: '' })">重置</el-button>
          <span class="text-sm muted">共 <b>{{ filtered.length }}</b> 条</span>
        </div>
      </div>

      <el-table :data="filtered" style="width: 100%" row-key="id">
        <el-table-column label="变更单号" width="146">
          <template #default="{ row }">
            <el-button link type="primary" @click="router.push(`/change/detail/${row.id}`)">{{ row.no }}</el-button>
          </template>
        </el-table-column>
        <el-table-column label="变更标题" min-width="230" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="cell-main">{{ row.title }}</div>
            <div class="cell-sub">{{ row.plan }}</div>
          </template>
        </el-table-column>
        <el-table-column label="关联需求单" width="150">
          <template #default="{ row }">
            <el-button link type="primary" @click="router.push(`/demand/detail/${row.demandId}`)">{{ row.demandNo }}</el-button>
            <div class="cell-sub">{{ demandTitle(row.demandId) }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="category" label="变更分类" width="96" />
        <el-table-column label="优先级" width="94">
          <template #default="{ row }"><StatusTag dict="Priority" :value="row.priority" :dot="false" /></template>
        </el-table-column>
        <el-table-column label="风险等级" width="94">
          <template #default="{ row }"><StatusTag dict="RiskLevel" :value="row.riskLevel" /></template>
        </el-table-column>
        <el-table-column label="实施日期" width="112">
          <template #default="{ row }">{{ row.implementDate }}</template>
        </el-table-column>
        <el-table-column label="请求人 / 实施者" width="132">
          <template #default="{ row }">
            <div>{{ row.requestor }}</div>
            <div class="cell-sub">实施：{{ row.implementer }}</div>
          </template>
        </el-table-column>
        <el-table-column label="影响 / 冲突" width="126">
          <template #default="{ row }">
            <div class="text-xs">配置项 {{ lst(row.impact?.ciList).length }} · 服务 {{ lst(row.impact?.services).length }} · 租户 {{ lst(row.impact?.tenants).length }}</div>
            <div class="text-xs" :class="lst(row.conflicts).length ? 'danger-text' : 'muted'">冲突 {{ lst(row.conflicts).length }} 项</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="104">
          <template #default="{ row }"><StatusTag dict="ChangeStatus" :value="row.status" /></template>
        </el-table-column>
        <el-table-column label="操作" width="190" fixed="right">
          <template #default="{ row }">
            <el-button
              v-for="(a, i) in actionsOf(row).slice(0, 1)"
              :key="i"
              link
              :type="a.type === 'primary' ? 'primary' : 'default'"
              size="small"
              @click.stop="a.run()"
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
            <div class="empty-box__text">没有符合条件的变更单</div>
          </div>
        </template>
      </el-table>
    </div>

    <!-- ================= 新建变更单抽屉 ================= -->
    <el-drawer v-model="createVisible" title="新建需求变更单" size="720px">
      <el-tabs v-model="cf.createType">
        <el-tab-pane label="手动创建" name="MANUAL">
          <div class="text-sm muted mb-3">手工录入变更信息，可关联需求单、事件单、问题单，可选用审批流模板。</div>
        </el-tab-pane>
        <el-tab-pane label="由事件创建" name="INCIDENT">
          <div class="field mb-3">
            <span class="field__label">选择事件单</span>
            <el-select v-model="cf.sourceId" filterable placeholder="选择事件单后自动带出标题与关联" style="width: 100%" @change="onSourceChange">
              <el-option v-for="i in incidentOptions" :key="i.id" :label="`${i.no} ${i.title}`" :value="i.id" />
            </el-select>
          </div>
        </el-tab-pane>
        <el-tab-pane label="由问题创建" name="PROBLEM">
          <div class="field mb-3">
            <span class="field__label">选择问题单</span>
            <el-select v-model="cf.sourceId" filterable placeholder="选择问题单后自动带出根因与整改计划" style="width: 100%" @change="onSourceChange">
              <el-option v-for="p in problemOptions" :key="p.id" :label="`${p.no} ${p.title}`" :value="p.id" />
            </el-select>
          </div>
        </el-tab-pane>
      </el-tabs>

      <el-form label-width="98px" class="mt-3">
        <el-form-item label="审批流模板">
          <el-select v-model="cf.templateId" placeholder="可选用已定义审批规则的工作流模板" clearable style="width: 100%" @change="applyTemplate">
            <el-option v-for="w in templates" :key="w.id" :label="`${w.name} ${w.version}（${w.bizType}）`" :value="w.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="变更标题" required><el-input v-model="cf.title" placeholder="请输入变更标题" /></el-form-item>
        <el-form-item label="关联需求单" required>
          <el-select v-model="cf.demandId" filterable placeholder="变更必须可追溯到需求单" style="width: 100%">
            <el-option v-for="d in demandOptions" :key="d.id" :label="`${d.no} ${d.title}`" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="变更分类">
          <el-select v-model="cf.category" style="width: 200px">
            <el-option v-for="o in categories" :key="o" :label="o" :value="o" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级">
          <el-radio-group v-model="cf.priority">
            <el-radio-button v-for="(o, k) in config.dicts.Priority" :key="k" :value="k">{{ o.label }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="实施日期">
          <el-date-picker v-model="cf.implementDate" type="date" value-format="YYYY-MM-DD" style="width: 200px" />
        </el-form-item>
        <el-form-item label="相应资源">
          <el-select v-model="cf.resources" multiple filterable placeholder="选择变更涉及的资源" style="width: 100%">
            <el-option v-for="r in resources" :key="r.id" :label="`${r.name}（${r.code} · ${r.securityLevel}）`" :value="r.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="请求人">
          <el-input v-model="cf.requestor" style="width: 200px" />
        </el-form-item>
        <el-form-item label="实施者">
          <el-select v-model="cf.implementer" filterable style="width: 240px">
            <el-option v-for="u in implementerOptions" :key="u.id" :label="`${u.name}（${u.org}）`" :value="u.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联事件单">
          <el-select v-model="cf.relatedIncidentIds" multiple filterable placeholder="可多选" style="width: 100%">
            <el-option v-for="i in incidentOptions" :key="i.id" :label="`${i.no} ${i.title}`" :value="i.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联问题单">
          <el-select v-model="cf.relatedProblemIds" multiple filterable placeholder="可多选" style="width: 100%">
            <el-option v-for="p in problemOptions" :key="p.id" :label="`${p.no} ${p.title}`" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="实施计划">
          <el-input v-model="cf.plan" type="textarea" :rows="4" placeholder="实施步骤、窗口时间、回滚预案、受影响订阅方通知计划" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button @click="createChange(false)">保存草稿</el-button>
        <el-button type="primary" @click="createChange(true)">提交审批</el-button>
      </template>
    </el-drawer>

    <!-- ================= 风险评估抽屉 ================= -->
    <el-drawer v-model="impactVisible" title="风险评估 · 影响模拟分析" size="720px">
      <template v-if="impactRow && impactResult">
        <div class="mb-3">
          <div class="bold">{{ impactRow.no }} · {{ impactRow.title }}</div>
          <div class="text-xs muted mt-1">
            变更分类 {{ impactRow.category }} · 实施日期 {{ impactRow.implementDate }} · 实施者 {{ impactRow.implementer }}
          </div>
          <div class="flex items-center gap-2 mt-2">
            <span class="text-sm">影响等级：</span>
            <StatusTag dict="RiskLevel" :value="impactResult.riskLevel" />
            <span class="text-xs muted">（模拟于 {{ fmtTime(impactResult.simulatedAt) }}）</span>
          </div>
        </div>

        <el-alert type="info" :closable="false" show-icon class="mb-3"
          title="影响链路：变更资源 → 受影响配置项 → 受影响服务 → 受影响租户"
          :description="`共影响 ${impactResult.ciList.length} 个配置项、${impactResult.services.length} 个服务、${impactResult.tenants.length} 个租户`" />

        <div class="impact">
          <div class="impact__col">
            <div class="impact__title">① 变更资源</div>
            <div v-for="id in impactResult.resourceIds" :key="id" class="impact__node impact__node--root">
              <div class="bold">{{ resourceMap[id]?.name ?? id }}</div>
              <div class="text-xs muted mono">{{ resourceMap[id]?.code }}</div>
            </div>
          </div>
          <div class="impact__col">
            <div class="impact__title">② 受影响配置项（CMDB）</div>
            <div v-if="!impactResult.ciList.length" class="text-xs muted">未匹配到配置项</div>
            <div v-for="c in impactResult.ciList" :key="c" class="impact__node">{{ c }}</div>
          </div>
          <div class="impact__col">
            <div class="impact__title">③ 受影响数据服务 / ④ 租户</div>
            <div v-if="!impactResult.services.length" class="text-xs muted">无关联服务</div>
            <div v-for="s in impactResult.services" :key="s" class="impact__node impact__node--svc">{{ s }}</div>
            <div v-for="t in impactResult.tenants" :key="t" class="impact__node impact__node--tenant">{{ t }}</div>
          </div>
        </div>

        <div class="mt-4">
          <div class="bold mb-2">处置建议</div>
          <div class="suggest-box">{{ impactResult.suggestion }}</div>
        </div>

        <el-alert class="mt-3" type="warning" :closable="false" show-icon
          title="影响模拟结果已写入变更单"
          description="可继续执行「冲突分析」，检出时间窗 / 资源占用 / 服务依赖冲突。" />
      </template>
      <div v-else class="empty-box">
        <div class="empty-box__icon"><el-icon><Compass /></el-icon></div>
        <div class="empty-box__text">暂无可模拟的数据</div>
      </div>
      <template #footer>
        <el-button @click="impactVisible = false">关闭</el-button>
        <el-button type="primary" @click="impactRow && openConflict(impactRow)">继续冲突分析</el-button>
      </template>
    </el-drawer>

    <!-- ================= 冲突分析抽屉 ================= -->
    <el-drawer v-model="conflictVisible" title="冲突分析" size="760px">
      <template v-if="conflictRow">
        <div class="bold mb-1">{{ conflictRow.no }} · {{ conflictRow.title }}</div>
        <div class="text-xs muted mb-3">
          实施日期 {{ conflictRow.implementDate }} · 涉及资源：{{ lst(conflictRow.resources).map(resLabel).join('、') || '—' }}
        </div>
        <el-alert
          class="mb-3"
          :type="conflictResult.length ? 'warning' : 'success'"
          :closable="false"
          show-icon
          :title="conflictResult.length ? `检出 ${conflictResult.length} 项冲突，建议调整实施计划` : '未检出冲突，可按计划实施'"
          description="冲突类型包含时间窗 / 资源占用 / 服务依赖三类。"
        />
        <el-table :data="conflictResult" style="width: 100%">
          <el-table-column label="冲突类型" width="104">
            <template #default="{ row }">
              <StatusTag :label="row.type" :tone="row.type === '时间窗' ? 'warning' : row.type === '资源占用' ? 'danger' : 'purple'" :dot="false" />
            </template>
          </el-table-column>
          <el-table-column label="与谁冲突" min-width="180" show-overflow-tooltip>
            <template #default="{ row }"><span class="text-sm">{{ row.with }}</span></template>
          </el-table-column>
          <el-table-column prop="desc" label="冲突说明" min-width="240" show-overflow-tooltip />
          <el-table-column prop="suggestion" label="处置建议" min-width="220" show-overflow-tooltip />
          <template #empty>
            <div class="empty-box">
              <div class="empty-box__icon"><el-icon><CircleCheck /></el-icon></div>
              <div class="empty-box__text">未检出冲突</div>
            </div>
          </template>
        </el-table>
        <div class="text-xs muted mt-3">
          冲突分析结果已写入变更单。
        </div>
      </template>
      <template #footer>
        <el-button @click="conflictVisible = false">关闭</el-button>
        <!-- 把"建议调整实施计划"变成可直接执行的动作：调整 → 保存 → 立即重新分析 -->
        <el-button
          v-if="conflictRow && canEditPlan(conflictRow)"
          type="primary"
          plain
          @click="openPlan(conflictRow)"
        >调整实施计划</el-button>
        <el-button @click="conflictRow && runConflict(conflictRow)">重新分析</el-button>
        <el-button type="primary" @click="conflictRow && finish(conflictRow)">标记变更完成</el-button>
      </template>
    </el-drawer>

    <!-- ================= 调整实施计划抽屉（与变更单详情共用组件） ================= -->
    <ChangePlanEditor v-model="planVisible" :change="planRow" @saved="onPlanSaved" />
  </div>
</template>

<style scoped>
.toolbar {
  display: flex; align-items: center; gap: var(--sp-3);
  padding: var(--sp-4) var(--sp-5); border-bottom: 1px solid var(--border-2); flex-wrap: wrap;
}
.toolbar__fields { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; flex: 1; }
.toolbar__actions { display: flex; align-items: center; gap: var(--sp-2); }
.field { display: flex; align-items: center; gap: 6px; }
.field__label { font-size: var(--fs-sm); color: var(--text-2); white-space: nowrap; }
.cell-main { font-weight: 600; }
.cell-sub { font-size: var(--fs-xs); color: var(--text-3); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 230px; }
.danger-text { color: var(--danger-fg); }
.impact { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-3); }
.impact__col { display: flex; flex-direction: column; gap: 6px; }
.impact__title { font-size: var(--fs-sm); font-weight: 600; color: var(--text-2); margin-bottom: 2px; }
.impact__node {
  padding: 6px 10px; border: 1px solid var(--border-2); border-radius: var(--r-sm);
  background: var(--surface-2); font-size: var(--fs-xs); line-height: 1.5;
}
.impact__node--root { border-color: var(--brand-200); background: var(--brand-50); }
.impact__node--svc { border-color: var(--purple-bg); background: var(--purple-bg); color: var(--purple-fg); }
.impact__node--tenant { border-color: var(--teal-bg); background: var(--teal-bg); color: var(--teal-fg); }
.suggest-box {
  padding: var(--sp-3); border-radius: var(--r-md); font-size: var(--fs-sm);
  background: var(--warning-bg); color: var(--warning-fg); line-height: 1.8;
}
@media (max-width: 1200px) {
  .impact { grid-template-columns: minmax(0, 1fr); }
}
</style>
