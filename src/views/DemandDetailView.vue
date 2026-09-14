<script setup lang="ts">
/**
 * DemandDetailView —— 需求单详情
 *
 * 覆盖原文功能点：需求单管理 —— "对前置单位申请的数据资源提交的资源单的流程审批与监控，
 * 支持实时查看需求单流转状态"；需求申请管理 —— 交付物差异化（接口文档 / 库表访问途径 / 文件下载）。
 * 同时体现原文"敏感数据临时授权工单由多级安全审批人逐级审批（系统审批 / 邮件审批）"
 * 与"变更审计：记录数据前后修改人与时间"。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDemoStore, dictItem } from '@/stores/demo'
import { config } from '@/core/config'
import { addDays, arr, by, demoUid, fmtDate, fmtTime, fromNow, iso, mask, NOW, nowStamp } from '@/core/utils'
import { artifactsOfRecord, deployRecordsOf } from '@/core/artifacts'
import type { DeployArtifacts } from '@/core/artifacts'
import PageHead from '@/components/PageHead.vue'
import StatusTag from '@/components/StatusTag.vue'
import ArtifactPanel from '@/components/ArtifactPanel.vue'

const store = useDemoStore()
const route = useRoute()
const router = useRouter()

/* 本地宽松数组 / 字典工具（store 返回宽类型，避免 unknown 推断） */
const lst = (v: unknown): any[] => (Array.isArray(v) ? v : [])
const dictOpts = (d: Record<string, { label: string }>) => Object.keys(d).map(k => ({ value: k, label: d[k].label }))

/* ------------------------------------------------------------ 取数 -- */
const demandId = computed(() => {
  const p = route.params.id
  return (Array.isArray(p) ? p[0] : p) as string
})
const d = computed<any>(() => store.findById('demands', demandId.value) ?? (store.table('demands') as any[])[0] ?? null)

const tab = ref('overview')
const scopeMode = ref<'this' | 'all'>('this')

const resources = computed(() => store.table('resources') as any[])
const resourceMap = computed<Record<string, any>>(() => {
  const m: Record<string, any> = {}
  resources.value.forEach(r => { m[r.id] = r })
  return m
})
function resName(id: string): string {
  return resourceMap.value[id]?.name ?? id
}
function fieldCn(name: string): string {
  for (const r of resources.value) {
    const f = lst(r.fields).find((x: any) => x.name === name)
    if (f) return f.cn
  }
  return name
}
function fieldSensitive(name: string): boolean {
  for (const r of resources.value) {
    const f = lst(r.fields).find((x: any) => x.name === name)
    if (f) return !!f.sensitive
  }
  return /id_card|phone|mobile|name|bank|account/.test(name)
}

/* -------------------------------------------------------- 流转条 -- */
const flowSteps = config.flows.Demand as string[]
const stepIndex = computed(() => ((config.flowIndex.Demand as any)[d.value?.status] ?? 0) as number)

const flowTimes: Record<string, () => string> = {
  草稿: () => d.value?.createdAt ?? '',
  待受理: () => d.value?.submittedAt ?? '',
  待审批: () => d.value?.acceptedAt ?? '',
  审批通过: () => d.value?.approvedAt ?? '',
  实施中: () => d.value?.acceptedAt ?? '',
  待验收: () => d.value?.deliveredAt ?? '',
  已交付: () => d.value?.deliveredAt ?? '',
  已评价: () => d.value?.evaluatedAt ?? ''
}
function flowClass(i: number): string {
  if (d.value?.status === 'REJECTED' && i === stepIndex.value) return 'flow__step--reject'
  if (i < stepIndex.value) return 'flow__step--done'
  if (i === stepIndex.value) return 'flow__step--active'
  return ''
}

/* ------------------------------------------------------ 权限动作 -- */
function actionsOf(): { label: string; type?: string; run: () => void }[] {
  const x = d.value
  if (!x) return []
  const out: { label: string; type?: string; run: () => void }[] = []
  const can = store.can
  const isApplicant = x.applicant === store.user.name
  if (x.status === 'PENDING_ACCEPT' && can('demand.accept')) out.push({ label: '受理', type: 'primary', run: () => doAccept() })
  if (x.status === 'PENDING_APPROVE' && can('demand.approve')) {
    out.push({ label: '审批', type: 'primary', run: () => doApprove() })
    out.push({ label: '驳回', run: () => doReject() })
  }
  if (['APPROVED', 'IMPLEMENTING', 'CHANGING'].includes(x.status) && (can('demand.dispatch') || can('admin.all'))) {
    out.push({ label: '派发任务', type: 'primary', run: () => openDispatch() })
  }
  /*
   * 标记实施完成：处理人办结后的闭环入口（自助 / 邮件提交、未派生任务的需求单尤其需要）。
   * 有任务时要求任务全部验证通过；无任务时由供数方 / 服务台确认办结。
   */
  if (['APPROVED', 'IMPLEMENTING', 'CHANGING'].includes(x.status)
    && (can('demand.dispatch') || can('demand.deliver') || can('demand.accept') || can('admin.all'))) {
    out.push({ label: '标记实施完成', run: () => markImplementDone() })
  }
  if (x.status === 'PENDING_ACCEPTANCE' && isApplicant) out.push({ label: '验收', type: 'primary', run: () => doAcceptance() })
  if (['DELIVERED', 'EVALUATED'].includes(x.status) && isApplicant) out.push({ label: '评价', type: 'primary', run: () => router.push('/evaluation') })
  if (['APPROVED', 'IMPLEMENTING', 'DELIVERED', 'CHANGING'].includes(x.status) && (can('demand.change') || can('admin.all'))) {
    out.push({ label: '变更', run: () => router.push('/change/list') })
  }
  if (['PENDING_ACCEPT', 'PENDING_APPROVE', 'DRAFT'].includes(x.status) && isApplicant) out.push({ label: '撤回', run: () => doWithdraw() })
  if (['DRAFT', 'WITHDRAWN', 'REJECTED'].includes(x.status) && isApplicant) out.push({ label: '作废', run: () => doCancel() })
  out.push({ label: '返回列表', run: () => router.push('/demand/list') })
  return out
}

/* ------------------------------------------------------ 动作实现 -- */
function doAccept() {
  const at = iso()
  store.update('demands', d.value.id, { status: 'PENDING_APPROVE', acceptedAt: at, currentHandler: '张建国' },
    { action: '服务台受理', remark: '材料齐全，转资源归属方审批' })
  store.pushTimeline(d.value, { action: '服务台受理', comment: '材料齐全，转资源归属方审批' })
  store.notify({
    type: 'info', title: `需求单 ${d.value.no} 已受理`,
    body: `您的需求「${d.value.title}」已被服务台受理，进入资源归属方审批环节。`,
    toRoles: ['consumer', 'supplier'], link: `/demand/detail/${d.value.id}`
  })
  ElMessage.success(`已受理 ${d.value.no}，流转至「待审批」`)
}

async function doApprove() {
  try {
    const { value } = await ElMessageBox.prompt('请填写审批意见', `审批需求单 ${d.value.no}`, {
      confirmButtonText: '审批通过', cancelButtonText: '取消', inputType: 'textarea',
      inputValue: '用途明确，同意共享，按资源敏感级别脱敏后交付。'
    })
    const needSecurity = ['L3', 'L4'].includes(d.value.securityLevel)
    store.update('demands', d.value.id, {
      status: needSecurity ? 'PENDING_APPROVE' : 'APPROVED',
      approver: store.user.name, approvedAt: iso(),
      currentHandler: needSecurity ? '周雅静' : '王思远'
    }, { action: '资源归属方审批通过', remark: value })
    store.pushTimeline(d.value, { action: '资源归属方审批通过', comment: value })
    store.notify({
      type: 'success', title: `需求单 ${d.value.no} 审批通过`, body: `审批意见：${value}`,
      toRoles: ['consumer', 'desk'], link: `/demand/detail/${d.value.id}`
    })
    ElMessage.success(needSecurity
      ? `已通过，因敏感级别为 ${d.value.securityLevel}，转入安全合规审批（多级审批人逐级审批）`
      : '审批通过，可派发生产任务')
  } catch { /* 取消 */ }
}

async function doReject() {
  try {
    const { value } = await ElMessageBox.prompt('请填写驳回原因（将反馈给申请方）', `驳回需求单 ${d.value.no}`, {
      confirmButtonText: '确认驳回', cancelButtonText: '取消', inputType: 'textarea'
    })
    store.update('demands', d.value.id, { status: 'REJECTED', rejectReason: value, rejectedAt: iso(), currentHandler: '—' },
      { action: '审批驳回', remark: value })
    store.pushTimeline(d.value, { action: '审批驳回', comment: value })
    store.notify({ type: 'warning', title: `需求单 ${d.value.no} 被驳回`, body: `驳回原因：${value}`, toRoles: ['consumer'], link: `/demand/detail/${d.value.id}` })
    ElMessage.warning('已驳回，原因已反馈申请方')
  } catch { /* 取消 */ }
}

function doWithdraw() {
  store.update('demands', d.value.id, { status: 'WITHDRAWN', withdrawnAt: iso(), currentHandler: '—' },
    { action: '撤回需求单', remark: '需求未审核前可撤回' })
  store.pushTimeline(d.value, { action: '撤回需求单', comment: '需求未审核前可撤回' })
  ElMessage.info('已撤回需求单')
}

function doCancel() {
  ElMessageBox.prompt('请填写作废原因', `作废需求单 ${d.value.no}`, { confirmButtonText: '确认作废', cancelButtonText: '取消', inputType: 'textarea' })
    .then(({ value }) => {
      store.update('demands', d.value.id, { status: 'CANCELLED', cancelReason: value, cancelledAt: iso(), currentHandler: '—' },
        { action: '作废需求单', remark: value })
      store.pushTimeline(d.value, { action: '作废需求单', comment: value })
      ElMessage.warning('已作废需求单')
    })
    .catch(() => { /* 取消 */ })
}

function doAcceptance() {
  store.update('demands', d.value.id, { status: 'DELIVERED', deliveredAt: iso(), currentHandler: '—' }, { action: '需求验收' })
  store.pushTimeline(d.value, { action: '需求验收通过', comment: '交付物符合申请要求' })
  ElMessage.success('验收通过，可提交评价')
}

/**
 * 标记实施完成 → 转「待验收」（来源：自助服务 / 电子邮件等未派生生产任务的需求单）
 *
 * 背景（验收问题）：通过「自助服务管理 → Web 提交需求 / 电子邮件提交需求」生成的单据
 * 受理、审批后进入「实施中」，处理人办结后没有任何推进入口——因为系统原先只在
 * 「生产任务全部验证通过」时自动回写状态，而没有任务的需求单永远走不到「待验收」。
 * 这里补齐人工闭环：有任务时必须等任务完成，无任务时由处理人确认办结。
 */
function relatedTasks(): any[] {
  return lst(d.value?.taskIds).map((id: string) => store.findById('tasks', id)).filter(Boolean) as any[]
}
function markImplementDone() {
  const x = d.value
  if (!x) return
  const tasks = relatedTasks()
  const unfinished = tasks.filter(t => t.status !== 'DONE')
  if (unfinished.length) {
    ElMessageBox.alert(
      `本需求单有 ${tasks.length} 张生产任务单，其中 ${unfinished.length} 张尚未验证通过：\n`
      + unfinished.map(t => `· ${t.no} ${t.title}（${dictItem('TaskStatus', t.status).label}）`).join('\n')
      + '\n\n请在「任务管理」中完成 接单 → 填报进度 → 提交验证 → 验证通过；全部任务完成后需求单会自动转「待验收」。',
      '暂不能标记实施完成', { confirmButtonText: '去任务管理' }
    ).then(() => router.push('/task/list')).catch(() => { /* 关闭 */ })
    return
  }
  const hasTask = tasks.length > 0
  ElMessageBox.confirm(
    hasTask
      ? `本单关联的 ${tasks.length} 张任务单均已验证通过，确认提交用数方验收？`
      : `本单未派生生产任务单（来源：${dictItem('DemandSource', x.source).label}）。确认实施已完成并提交用数方验收？`,
    `标记实施完成 · ${x.no}`,
    { confirmButtonText: '确认提交验收', cancelButtonText: '取消', type: 'warning' }
  ).then(() => {
    store.update('demands', x.id, { status: 'PENDING_ACCEPTANCE', currentHandler: x.applicant, implementedAt: iso() },
      { action: '实施完成，转需求验收', remark: hasTask ? '关联任务单已全部验证通过' : '未派生生产任务，由处理人确认实施完成' })
    store.pushTimeline(x, { action: '提交验收', comment: hasTask ? '关联任务单已全部验证通过' : '处理人确认实施完成，提交用数方验收' })
    store.notify({
      type: 'info', title: `需求单 ${x.no} 待验收`,
      body: `需求「${x.title}」已实施完成，请及时验收。`,
      toRoles: ['consumer'], link: `/demand/detail/${x.id}`
    })
    ElMessage.success('已标记实施完成，需求单流转至「待验收」')
  }).catch(() => { /* 取消 */ })
}

/* ------------------------------------------------ 派发生产任务 -- */
const dispatchVisible = ref(false)
const dform = reactive({ title: '', type: '数据加工', dept: '数据生产中心 · 加工组', assignee: '刘涛', priority: 'P1', planStart: '', planEnd: '', content: '', deliverable: '' })

const deptOptions = computed(() => Array.from(new Set((store.table('tasks') as any[]).map(t => t.dept))))
const assigneeOptions = computed(() => (store.table('users') as any[]).filter(u => /生产中心|运维中心/.test(u.org)))

function openDispatch() {
  const x = d.value
  dform.title = `${x.title}（生产实施）`
  dform.type = x.kind === 'NEW' ? '数据采集' : x.deliveryForm === 'TABLE' ? '数据加工' : '服务封装'
  dform.priority = x.priority ?? 'P1'
  dform.planStart = fmtDate(NOW)
  dform.planEnd = fmtDate(addDays(NOW, 7))
  dform.content = `承接需求单 ${x.no}：${x.scene}`
  dform.deliverable = x.deliveryForm === 'API' ? 'API 服务配置 + 接口文档' : x.deliveryForm === 'FILE' ? '文件下发配置 + 数据说明' : '库表视图 + 访问授权'
  dispatchVisible.value = true
}

function nextTaskNo(): string {
  // 单号日期取演示基准时间（与需求单、单据时间同一天）
  const day = nowStamp()
  return `RW${day}${String((store.table('tasks') as any[]).length + 1).padStart(3, '0')}`
}

function confirmDispatch() {
  const x = d.value
  const no = nextTaskNo()
  const rec: Record<string, any> = {
    id: demoUid('t'),
    no, title: dform.title, type: dform.type,
    source: 'DEMAND', sourceId: x.id, sourceNo: x.no,
    dept: dform.dept, assignee: dform.assignee, priority: dform.priority,
    planStart: dform.planStart, planEnd: dform.planEnd,
    progress: 0, status: 'PENDING_ACCEPT',
    content: dform.content, deliverable: dform.deliverable,
    resources: lst(x.resources), relatedProblemIds: lst(x.relatedProblemIds),
    milestones: [
      { name: '方案确认', planDate: dform.planStart },
      { name: '开发实施', planDate: fmtDate(addDays(dform.planStart, 4)) },
      { name: '验证交付', planDate: dform.planEnd }
    ],
    timeline: [{ at: iso(), actor: store.user.name, action: '派发任务', comment: `承接需求单 ${x.no}` }]
  }
  store.insert('tasks', rec)
  store.update('demands', x.id, {
    taskIds: [...lst(x.taskIds), rec.id],
    status: ['APPROVED', 'CHANGING'].includes(x.status) ? 'IMPLEMENTING' : x.status,
    currentHandler: dform.assignee
  }, { action: '派发生产任务', remark: `生成任务单 ${no}，承接部门 ${dform.dept}` })
  store.pushTimeline(x, { action: '派发生产任务', comment: `生成任务单 ${no}` })
  store.notify({
    type: 'info', title: `新任务单 ${no} 待接单`,
    body: `需求单 ${x.no} 已派发实施任务「${dform.title}」，承接部门：${dform.dept}。`,
    toRoles: ['producer'], link: '/task/list'
  })
  dispatchVisible.value = false
  ElMessage.success(`已派发任务单 ${no} 至 ${dform.dept}`)
}

/* ------------------------------------------------ 交付与授权 -- */
const subs = computed(() => (store.table('subscriptions') as any[]).filter(s => s.demandNo === d.value?.no))
const secApprovals = computed(() => (store.table('securityApprovals') as any[]).filter((s: any) => s.demandId === d.value?.id))

function serviceName(id: string): string {
  return (store.table('services') as any[]).find(s => s.id === id)?.name ?? id
}
function appName(id: string): string {
  return (store.table('apps') as any[]).find(a => a.id === id)?.name ?? id
}
function tenantName(id: string): string {
  return (store.table('tenants') as any[]).find(t => t.id === id)?.name ?? id
}

function approveSub(s: any) {
  store.update('subscriptions', s.id, { approveStatus: 'APPROVED', approver: store.user.name, approvedAt: iso() },
    { action: '订阅审批通过', bizType: 'subscriptions', remark: `需求单 ${d.value.no} 交付订阅审批` })
  store.notify({
    type: 'success', title: `订阅单 ${s.no} 审批通过`,
    body: `资源已授权给「${appName(s.appId)}」，可进行密钥发放与数据推送。`,
    toRoles: ['consumer', 'admin'], link: `/demand/detail/${d.value.id}`
  })
  ElMessage.success(`已审批通过订阅单 ${s.no}`)
}

function issueSecret(s: any) {
  const key = `AK${nowStamp()}${String(store.table('subscriptions').length + 1).padStart(3, '0')}`
  store.update('subscriptions', s.id, {
    secret: { appKey: key, appSecret: 'SK******************' + Math.random().toString(36).slice(-4), issuedAt: iso(), reissued: !!s.secret }
  }, { action: s.secret ? '补发密钥' : '发放密钥', bizType: 'subscriptions' })
  ElMessage.success(`已${s.secret ? '补发' : '发放'}密钥 ${key}（appSecret 全程脱敏展示）`)
}

function pushData(s: any) {
  const rec = {
    at: iso(), target: appName(s.appId), mode: '数据推送',
    transport: s.kind === 'REALTIME' ? 'Flink' : s.kind === 'FILE' ? 'SFTP' : 'API',
    rows: s.kind === 'API' ? 0 : 86400, status: '成功', note: '由需求单详情手动触发'
  }
  store.update('subscriptions', s.id, { pushLogs: [...lst(s.pushLogs), rec] },
    { action: '执行数据推送', bizType: 'subscriptions', remark: `推送至 ${rec.target}，${rec.rows} 行` })
  store.notify({
    type: 'success', title: '数据已推送', body: `订阅单 ${s.no} 已向「${rec.target}」完成一次数据推送（${rec.rows} 行）。`,
    toRoles: ['consumer'], link: `/demand/detail/${d.value.id}`
  })
  ElMessage.success('已执行推送并写入推送记录')
}

/** 差异化交付物说明（原文：接口→接口文档 / 库表→库表名称等访问途径 / 文件→下载操作） */
const deliverable = computed(() => {
  const x = d.value
  if (!x) return { title: '', items: [] as string[] }
  const svc = (store.table('services') as any[]).filter(s => lst(x.resources).includes(s.resourceId))
  if (x.deliveryForm === 'API') {
    return {
      title: '接口交付物：提供接口文档',
      items: [
        `接口文档：《${svc.filter(s => s.kind === 'API').map(s => s.name).join('》《') || '数据查询接口'}》——含请求地址、入参 / 出参、错误码、调用示例`,
        `接口服务：${svc.filter(s => s.kind === 'API').map(s => `${s.name}（可用性 ${s.availability}，${s.serviceTime}）`).join('；') || '按加工结果封装并发布'}`,
        '密钥与配额：订阅审批通过后发放 appKey / appSecret，调用频次按预估调用量核定'
      ]
    }
  }
  if (x.deliveryForm === 'TABLE') {
    return {
      title: '库表交付物：提供库表名称等访问途径',
      items: [
        `库表名称：${lst(x.resources).map(id => resourceMap.value[id]?.code).filter(Boolean).join('、') || '按加工结果命名'}`,
        '访问途径：授权只读账号 + 脱敏视图（含库名 / 表名 / 视图名与连接方式）',
        '授权范围：按渠道授权配置限定使用范围与可见范围，敏感列不下发原始值'
      ]
    }
  }
  return {
    title: '文件交付物：提供下载操作',
    items: [
      `文件服务：${svc.filter(s => s.kind === 'FILE').map(s => `${s.name}（${s.serviceTime}）`).join('；') || '按申请频率下发'}`,
      '下载操作：平台下载区提供文件清单与下载链接；敏感资源走 SFTP 并记录分发日志',
      '文件说明：每次下发附带字段说明与数据字典，便于用数方核对'
    ]
  }
})

/* -------------------------------------------------- 关联单据统计 -- */
const taskRows = computed(() => lst(d.value?.taskIds).map((id: string) => store.findById('tasks', id)).filter(Boolean) as any[])
const incidentRows = computed(() => lst(d.value?.relatedIncidentIds).map((id: string) => store.findById('incidents', id)).filter(Boolean) as any[])
const problemRows = computed(() => lst(d.value?.relatedProblemIds).map((id: string) => store.findById('problems', id)).filter(Boolean) as any[])

const auditRows = computed(() => {
  const all = store.table('audits') as any[]
  if (scopeMode.value === 'all') return by(all.filter(a => a.bizType === 'demands'), 'operatedAt', 'desc').slice(0, 30)
  return by(all.filter(a => a.bizId === d.value?.id), 'operatedAt', 'desc')
})

/* ------------------------------------------- 自动化部署产物 -- */
/** 本工单的部署记录（含产物快照），产物查阅入口与工作流管理保持一致 */
const deployRecs = computed(() => deployRecordsOf(store, d.value?.id ?? ''))
const artifactVisible = ref(false)
const artifactResult = ref<DeployArtifacts | null>(null)
const artifactRecord = ref<any>(null)

function openArtifacts(rec: any) {
  const art = artifactsOfRecord(store, rec)
  if (!art) { ElMessage.warning('未能还原该次部署的产物'); return }
  artifactResult.value = art
  artifactRecord.value = rec
  artifactVisible.value = true
}

/* ------------------------------------------------------------ watch -- */
watch(d, x => { if (!x) ElMessage.warning('未找到该需求单，已切换为列表首条数据') })

/*
 * 从需求单管理列表点「派发任务」跳转过来（/demand/detail/:id?dispatch=1）时自动打开派发弹窗，
 * 使"审批通过 → 派发生产任务"在列表页与详情页都有明确入口。
 */
onMounted(() => {
  if (route.query.dispatch !== '1' || !d.value) return
  if (!['APPROVED', 'IMPLEMENTING', 'CHANGING'].includes(d.value.status)) {
    ElMessage.warning('当前状态不可派发生产任务')
    return
  }
  if (!store.can('demand.dispatch') && !store.can('admin.all')) {
    ElMessage.warning('当前角色无「派发生产任务」权限，请切换为「供数方」或「平台管理员」')
    return
  }
  openDispatch()
})
</script>

<template>
  <div v-if="d">
    <PageHead :title="`需求单详情 · ${d.no}`" :desc="d.title">
      <template #tag>
        <StatusTag dict="DemandStatus" :value="d.status" />
        <StatusTag dict="SecurityLevel" :value="d.securityLevel" />
      </template>
      <template #actions>
        <el-button
          v-for="(a, i) in actionsOf()"
          :key="i"
          :type="a.type === 'primary' ? 'primary' : 'default'"
          @click="a.run()"
        >{{ a.label }}</el-button>
      </template>
    </PageHead>

    <!-- 流转状态条 -->
    <div class="card mb-4">
      <div class="card__head">
        <div class="card__title">流转状态</div>
        <div class="card__sub">第 {{ stepIndex + 1 }} / {{ flowSteps.length }} 步 · 当前处理人：{{ d.currentHandler || '—' }}</div>
        <div class="card__spacer" />
        <span class="text-sm muted">期望交付时间：{{ d.expectAt ? fmtTime(d.expectAt) : '—' }}</span>
      </div>
      <div class="card__body">
        <div class="flow">
          <div v-for="(s, i) in flowSteps" :key="s" class="flow__step" :class="flowClass(i)">
            <div class="flow__dot"><el-icon v-if="i < stepIndex"><Check /></el-icon><template v-else>{{ i + 1 }}</template></div>
            <div class="flow__label">{{ s }}</div>
            <div class="flow__time">{{ (flowTimes[s]?.() || '') ? fmtDate(flowTimes[s]()) : '' }}</div>
          </div>
        </div>
        <el-alert
          v-if="['L3', 'L4'].includes(d.securityLevel)"
          class="mt-2"
          type="warning"
          show-icon
          :closable="false"
          :title="`本需求涉及 ${d.securityLevel} 敏感数据，审批链已自动增加安全合规审批节点`"
          :description="`安全审批人：${d.securityApprover || '周雅静'}（多级逐级审批，支持系统审批 / 邮件审批）`"
        />
      </div>
    </div>

    <el-tabs v-model="tab" class="detail-tabs">
      <!-- ============ 概览 ============ -->
      <el-tab-pane label="概览" name="overview">
        <div class="card mb-4">
          <div class="card__head"><div class="card__title">申请信息</div></div>
          <div class="card__body">
            <div class="desc-grid">
              <div class="desc-item"><span class="desc-item--label">需求单号</span><span class="desc-item__value mono">{{ d.no }}</span></div>
              <div class="desc-item"><span class="desc-item--label">需求名称</span><span class="desc-item__value bold">{{ d.title }}</span></div>
              <div class="desc-item"><span class="desc-item--label">申请类型</span><span class="desc-item__value"><StatusTag dict="DemandKind" :value="d.kind" :dot="false" /></span></div>
              <div class="desc-item"><span class="desc-item--label">来源</span><span class="desc-item__value"><StatusTag dict="DemandSource" :value="d.source" :dot="false" /></span></div>
              <div class="desc-item"><span class="desc-item--label">申请人</span><span class="desc-item__value">{{ d.applicant }} · {{ d.applicantOrg }}</span></div>
              <div class="desc-item"><span class="desc-item--label">关联应用</span><span class="desc-item__value">{{ d.appId ? appName(d.appId) : '—' }}</span></div>
              <div class="desc-item"><span class="desc-item--label">租户</span><span class="desc-item__value">{{ d.tenantId ? tenantName(d.tenantId) : '—' }}</span></div>
              <div class="desc-item"><span class="desc-item--label">资源类型</span><span class="desc-item__value"><StatusTag dict="ResourceType" :value="d.resourceType" :dot="false" /></span></div>
              <div class="desc-item"><span class="desc-item--label">交付方式</span><span class="desc-item__value"><StatusTag dict="DeliveryForm" :value="d.deliveryForm" :dot="false" /></span></div>
              <div class="desc-item"><span class="desc-item--label">敏感级别</span><span class="desc-item__value"><StatusTag dict="SecurityLevel" :value="d.securityLevel" /></span></div>
              <div class="desc-item"><span class="desc-item--label">优先级</span><span class="desc-item__value"><StatusTag dict="Priority" :value="d.priority" :dot="false" /></span></div>
              <div class="desc-item"><span class="desc-item--label">是否脱敏</span><span class="desc-item__value">{{ d.desensitize ? '是（按分类分级结果脱敏）' : '否' }}</span></div>
              <div class="desc-item"><span class="desc-item--label">时间范围</span><span class="desc-item__value">{{ d.timeRange || '—' }}</span></div>
              <div class="desc-item"><span class="desc-item--label">更新频率</span><span class="desc-item__value">{{ d.updateFreq || '—' }}</span></div>
              <div class="desc-item"><span class="desc-item--label">使用期限</span><span class="desc-item__value">{{ d.usePeriod || '—' }}</span></div>
              <div class="desc-item"><span class="desc-item--label">预估调用量</span><span class="desc-item__value">{{ d.callVolume ? d.callVolume + ' 次 / 年' : '—' }}</span></div>
              <div class="desc-item"><span class="desc-item--label">提交时间</span><span class="desc-item__value">{{ d.submittedAt ? fmtTime(d.submittedAt) : '尚未提交' }}</span></div>
              <div class="desc-item"><span class="desc-item--label">受理时间</span><span class="desc-item__value">{{ d.acceptedAt ? fmtTime(d.acceptedAt) : '—' }}</span></div>
              <div class="desc-item"><span class="desc-item--label">审批人 / 时间</span><span class="desc-item__value">{{ d.approver || '—' }} {{ d.approvedAt ? '· ' + fmtTime(d.approvedAt) : '' }}</span></div>
              <div class="desc-item"><span class="desc-item--label">安全审批人</span><span class="desc-item__value">{{ d.securityApprover || '—' }}</span></div>
              <div class="desc-item"><span class="desc-item--label">期望交付</span><span class="desc-item__value">{{ d.expectAt ? fmtTime(d.expectAt) : '—' }}</span></div>
              <div class="desc-item"><span class="desc-item--label">交付时间</span><span class="desc-item__value">{{ d.deliveredAt ? fmtTime(d.deliveredAt) : '—' }}</span></div>
              <div class="desc-item desc-item--wide"><span class="desc-item--label">业务场景与用途</span><span class="desc-item__value">{{ d.scene || '—' }}</span></div>
              <div v-if="d.newDataDesc" class="desc-item desc-item--wide"><span class="desc-item--label">新增数据项</span><span class="desc-item__value">{{ d.newDataDesc }}</span></div>
              <div v-if="d.rejectReason" class="desc-item desc-item--wide"><span class="desc-item--label">驳回原因</span><span class="desc-item__value" style="color: var(--danger-fg)">{{ d.rejectReason }}</span></div>
              <div v-if="d.cancelReason" class="desc-item desc-item--wide"><span class="desc-item--label">作废原因</span><span class="desc-item__value">{{ d.cancelReason }}</span></div>
              <div class="desc-item desc-item--wide">
                <span class="desc-item--label">申请资源</span>
                <span class="desc-item__value">
                  <template v-if="lst(d.resources).length">
                    <el-tag v-for="id in d.resources" :key="id" class="mb-2">{{ resName(id) }}</el-tag>
                  </template>
                  <span v-else class="muted">新增资产（无既有资源）</span>
                </span>
              </div>
              <div class="desc-item desc-item--wide">
                <span class="desc-item--label">数据项清单</span>
                <span class="desc-item__value">
                  <template v-if="lst(d.fields).length">
                    <span v-for="f in d.fields" :key="f" class="field-tag" :class="{ masked: fieldSensitive(f) }">{{ fieldCn(f) }}</span>
                  </template>
                  <span v-else class="muted">—</span>
                </span>
              </div>
              <div class="desc-item desc-item--wide">
                <span class="desc-item--label">关联单据统计</span>
                <span class="desc-item__value">
                  任务单 {{ taskRows.length }} 张 · 变更单 {{ lst(d.changeIds).length }} 张 · 订阅单 {{ subs.length }} 张 ·
                  事件单 {{ incidentRows.length }} 张 · 问题单 {{ problemRows.length }} 张
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 多级安全审批工单 -->
        <div v-if="secApprovals.length" class="card">
          <div class="card__head">
            <div class="card__title">敏感数据临时授权工单（多级安全审批）</div>
            <div class="card__sub">由多级安全审批人逐级审批，支持系统审批与邮件审批</div>
          </div>
          <div class="card__body">
            <div v-for="sa in secApprovals" :key="sa.id" class="mb-4">
              <div class="flex items-center gap-2 mb-2">
                <span class="bold">{{ sa.cate }}</span>
                <span class="text-xs muted">创建于 {{ fmtTime(sa.createdAt) }}</span>
              </div>
              <div class="tl">
                <div
                  v-for="lv in lst(sa.levels)"
                  :key="lv.level"
                  class="tl__item"
                  :class="lv.status === '通过' ? 'tl__item--done' : 'tl__item--active'"
                >
                  <div class="tl__dot" />
                  <div class="tl__head">
                    <span class="tl__action">第 {{ lv.level }} 级 · {{ lv.approver }}</span>
                    <StatusTag :label="lv.channel" :tone="lv.channel === '邮件审批' ? 'purple' : 'info'" :dot="false" />
                    <StatusTag :label="lv.status" :tone="lv.status === '通过' ? 'success' : 'warning'" :dot="false" />
                    <span class="tl__meta">{{ lv.at ? fmtTime(lv.at) : '待审批' }}</span>
                  </div>
                  <div v-if="lv.comment" class="tl__body">{{ lv.comment }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- ============ 流转记录 ============ -->
      <el-tab-pane :label="`流转记录（${lst(d.timeline).length}）`" name="timeline">
        <div class="card">
          <div class="card__body">
            <div v-if="!lst(d.timeline).length" class="empty-box">
              <div class="empty-box__icon"><el-icon><Clock /></el-icon></div>
              <div class="empty-box__text">暂无流转记录</div>
            </div>
            <div v-else class="tl">
              <div
                v-for="(t, i) in lst(d.timeline)"
                :key="i"
                class="tl__item"
                :class="i === lst(d.timeline).length - 1 ? 'tl__item--active' : /驳回|撤回|作废/.test(t.action) ? 'tl__item--danger' : 'tl__item--done'"
              >
                <div class="tl__dot" />
                <div class="tl__head">
                  <span class="tl__action">{{ t.action }}</span>
                  <span class="tl__meta">{{ t.actor }} · {{ fmtTime(t.at) }} · {{ fromNow(t.at) }}</span>
                </div>
                <div v-if="t.comment" class="tl__body tl__quote">{{ t.comment }}</div>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- ============ 交付与授权 ============ -->
      <el-tab-pane :label="`交付与授权（${subs.length}）`" name="delivery">
        <div class="card mb-4">
          <div class="card__head">
            <div class="card__title">差异化交付物</div>
            <div class="card__sub">按交付方式提供对应的数据访问方式</div>
            <div class="card__spacer" />
            <StatusTag dict="DeliveryForm" :value="d.deliveryForm" :dot="false" />
          </div>
          <div class="card__body">
            <div class="bold mb-2"><el-icon><Box /></el-icon> {{ deliverable.title }}</div>
            <ul class="deliver-list">
              <li v-for="(t, i) in deliverable.items" :key="i">{{ t }}</li>
            </ul>
            <div v-if="d.deliveryForm === 'TABLE'" class="code-box mt-3">
              <div class="log-box__line">-- 授权只读视图（敏感列已按分类分级脱敏）</div>
              <div class="log-box__line">GRANT SELECT ON dw.&lt;资源编码&gt;_v TO user_&lt;租户&gt;;</div>
              <div class="log-box__line">-- 资源编码：{{ lst(d.resources).map(id => resourceMap[id]?.code).filter(Boolean).join('、') || '待加工结果确定' }}</div>
            </div>
            <div v-else-if="d.deliveryForm === 'FILE'" class="code-box mt-3">
              <div class="log-box__line">下发目录：/data/share/{{ d.no }}/</div>
              <div class="log-box__line">文件名：{资源编码}_{yyyyMMdd}.csv.gz　编码：UTF-8 BOM　分隔符：|</div>
              <div class="log-box__line">下载操作：平台「我的数据」→ 文件清单 → 下载 / 补推</div>
            </div>
            <div v-else class="code-box mt-3">
              <div class="log-box__line">GET /api/v1/{{ lst(d.resources).map(id => resourceMap[id]?.code).filter(Boolean)[0] || 'resource' }}/query</div>
              <div class="log-box__line">Authorization: Bearer &lt;appKey:appSecret&gt;　Content-Type: application/json</div>
              <div class="log-box__line">接口文档：随订阅审批通过后自动推送至应用负责人</div>
            </div>
          </div>
        </div>

        <!-- 自动化部署产物：对应原文「自动生成对应的 API 接口以及相关文件」，给出文件的存放与查阅入口 -->
        <div class="card mb-4">
          <div class="card__head">
            <div class="card__title">自动化部署产物</div>
            <div class="card__sub">工作流引擎对本工单自动生成的文件（接口文档 / 调度配置 / 脱敏规则 / API 接口定义 / 交付说明）随部署记录归档</div>
            <div class="card__spacer" />
            <StatusTag v-if="deployRecs.length" :label="`${deployRecs.length} 次部署`" tone="primary" :dot="false" />
          </div>
          <div class="card__body card__body--flush">
            <el-table v-if="deployRecs.length" :data="deployRecs" size="small" style="width: 100%">
              <el-table-column prop="no" label="部署记录号" width="130" />
              <el-table-column label="执行时间" width="150">
                <template #default="{ row }">{{ fmtTime(row.at) }}</template>
              </el-table-column>
              <el-table-column prop="operator" label="执行人" width="96" />
              <el-table-column prop="cost" label="耗时" width="80" />
              <el-table-column label="产物" min-width="220" show-overflow-tooltip>
                <template #default="{ row }">
                  <span class="mono">{{ row.artifactCount }}</span> 个文件 · {{ row.serviceName || '自动生成数据服务' }}
                </template>
              </el-table-column>
              <el-table-column label="结果" width="90">
                <template #default="{ row }">
                  <StatusTag :label="row.status" :tone="row.status === '成功' ? 'success' : 'danger'" />
                </template>
              </el-table-column>
              <el-table-column label="操作" width="110" fixed="right">
                <template #default="{ row }">
                  <el-button link type="primary" size="small" :disabled="row.status !== '成功'" @click="openArtifacts(row)">查看产物</el-button>
                </template>
              </el-table-column>
            </el-table>
            <div v-else class="empty-box">
              <div class="empty-box__icon"><el-icon><Box /></el-icon></div>
              <div class="empty-box__text">
                尚未执行自动化部署；审批通过后由生产实施方在「工作流管理 → 自动化部署」执行，
                生成的 API 接口定义与相关文件将在此处归档并可查阅
              </div>
            </div>
          </div>
        </div>

        <div v-if="!subs.length" class="card">
          <div class="empty-box">
            <div class="empty-box__icon"><el-icon><Link /></el-icon></div>
            <div class="empty-box__text">尚无关联订阅单；审批通过并交付后，系统自动生成订阅单并回填需求工单号</div>
          </div>
        </div>
        <div v-for="s in subs" :key="s.id" class="card mb-4">
          <div class="card__head">
            <div class="card__title">{{ s.no }} · {{ serviceName(s.serviceId) }}</div>
            <StatusTag dict="ServiceKind" :value="s.kind" :dot="false" />
            <StatusTag dict="SubscriptionStatus" :value="s.approveStatus" />
            <div class="card__spacer" />
            <el-button v-if="s.approveStatus === 'PENDING'" type="primary" size="small" @click="approveSub(s)">审批订阅</el-button>
            <el-button v-if="s.approveStatus === 'APPROVED'" size="small" @click="issueSecret(s)">{{ s.secret ? '补发密钥' : '发放密钥' }}</el-button>
            <el-button v-if="s.approveStatus === 'APPROVED'" size="small" type="primary" plain @click="pushData(s)">执行推送</el-button>
          </div>
          <div class="card__body">
            <div class="desc-grid">
              <div class="desc-item"><span class="desc-item--label">订阅应用</span><span class="desc-item__value">{{ appName(s.appId) }}</span></div>
              <div class="desc-item"><span class="desc-item--label">租户</span><span class="desc-item__value">{{ tenantName(s.tenantId) }}</span></div>
              <div class="desc-item"><span class="desc-item--label">提交 / 审批</span><span class="desc-item__value">{{ fmtTime(s.submittedAt) }}<span class="muted"> → </span>{{ s.approvedAt ? fmtTime(s.approvedAt) : '待审批' }}</span></div>
              <div class="desc-item"><span class="desc-item--label">审批人</span><span class="desc-item__value">{{ s.approver || '—' }}</span></div>
              <div class="desc-item desc-item--wide">
                <span class="desc-item--label">渠道授权</span>
                <span class="desc-item__value">
                  <template v-if="s.channelAuth">
                    使用范围：{{ lst(s.channelAuth.useScope).join('、') }}；可见范围：{{ lst(s.channelAuth.visibleScope).join('、') }}
                  </template>
                  <span v-else class="muted">未配置（待资源归属方审批后配置）</span>
                </span>
              </div>
              <div v-if="s.secret" class="desc-item desc-item--wide">
                <span class="desc-item--label">密钥</span>
                <span class="desc-item__value mono">
                  appKey：{{ s.secret.appKey }}　appSecret：<span class="masked">{{ s.secret.appSecret }}</span>
                  <span class="text-xs muted">（发放于 {{ fmtTime(s.secret.issuedAt) }}{{ s.secret.reissued ? '，已补发' : '' }}；appSecret 脱敏展示）</span>
                </span>
              </div>
              <div v-if="s.apiConf" class="desc-item desc-item--wide">
                <span class="desc-item--label">接口配置</span>
                <span class="desc-item__value">授权期限 {{ s.apiConf.period }} · 预估调用 {{ s.apiConf.estCalls }} 次 / 年</span>
              </div>
              <div v-if="s.fileConf" class="desc-item desc-item--wide">
                <span class="desc-item--label">文件配置</span>
                <span class="desc-item__value">
                  {{ s.fileConf.taskName }} · {{ s.fileConf.filePath }}{{ s.fileConf.fileName }} ·
                  {{ s.fileConf.format }}{{ s.fileConf.zip ? '（压缩）' : '' }} · 分隔符 {{ s.fileConf.separator }} · {{ s.fileConf.schedule }}
                </span>
              </div>
              <div v-if="s.rtConf" class="desc-item desc-item--wide">
                <span class="desc-item--label">实时配置</span>
                <span class="desc-item__value">{{ s.rtConf.mode }} · {{ s.rtConf.cluster }} · {{ s.rtConf.auth }}（{{ s.rtConf.authType }}）</span>
              </div>
            </div>

            <div class="mt-3">
              <div class="text-sm bold mb-2">推送记录（{{ lst(s.pushLogs).length }}）</div>
              <el-table :data="lst(s.pushLogs)" size="small" style="width: 100%">
                <el-table-column label="时间" width="150"><template #default="{ row }">{{ fmtTime(row.at) }}</template></el-table-column>
                <el-table-column prop="target" label="目标应用" min-width="160" show-overflow-tooltip />
                <el-table-column prop="mode" label="方式" width="90" />
                <el-table-column prop="transport" label="通道" width="90" />
                <el-table-column label="行数" width="100"><template #default="{ row }">{{ row.rows ? row.rows.toLocaleString() : '—' }}</template></el-table-column>
                <el-table-column label="结果" width="86">
                  <template #default="{ row }"><StatusTag :label="row.status" :tone="row.status === '成功' ? 'success' : 'danger'" :dot="false" /></template>
                </el-table-column>
                <el-table-column prop="note" label="说明" min-width="180" show-overflow-tooltip />
                <template #empty>
                  <div class="empty-box"><div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div><div class="empty-box__text">暂无推送记录</div></div>
                </template>
              </el-table>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- ============ 关联任务 ============ -->
      <el-tab-pane :label="`关联任务（${taskRows.length}）`" name="tasks">
        <div class="card">
          <div class="card__head">
            <div class="card__title">派发到生产部门的任务单</div>
            <div class="card__sub">点击任务单号可查看任务详情与实施进度</div>
            <div class="card__spacer" />
            <el-button v-if="['APPROVED', 'IMPLEMENTING', 'CHANGING'].includes(d.status)" type="primary" size="small" @click="openDispatch"><el-icon><Plus /></el-icon> 派发任务</el-button>
          </div>
          <div class="card__body card__body--flush">
            <el-table :data="taskRows" style="width: 100%">
              <el-table-column label="任务单号" width="150">
                <template #default="{ row }">
                  <el-button link type="primary" @click="router.push('/task/list')">{{ row.no }}</el-button>
                </template>
              </el-table-column>
              <el-table-column label="任务名称" min-width="220" show-overflow-tooltip>
                <template #default="{ row }">
                  <div class="cell-main">{{ row.title }}</div>
                  <div class="cell-sub">{{ row.content }}</div>
                </template>
              </el-table-column>
              <el-table-column label="类型" width="100"><template #default="{ row }"><StatusTag dict="TaskType" :value="row.type" :dot="false" /></template></el-table-column>
              <el-table-column prop="dept" label="承接部门" width="180" show-overflow-tooltip />
              <el-table-column prop="assignee" label="实施人" width="90" />
              <el-table-column label="进度" width="160">
                <template #default="{ row }">
                  <el-progress :percentage="row.progress" :stroke-width="8"
                    :status="row.status === 'DONE' ? 'success' : row.status === 'REJECTED' ? 'exception' : undefined" />
                </template>
              </el-table-column>
              <el-table-column label="状态" width="110"><template #default="{ row }"><StatusTag dict="TaskStatus" :value="row.status" /></template></el-table-column>
              <el-table-column label="计划" width="180"><template #default="{ row }">{{ row.planStart }} ~ {{ row.planEnd }}</template></el-table-column>
              <template #empty>
                <div class="empty-box">
                  <div class="empty-box__icon"><el-icon><Tools /></el-icon></div>
                  <div class="empty-box__text">尚未派发任务单；新增资产需求通过关联任务完成采集 / 加工 / 建模</div>
                </div>
              </template>
            </el-table>
          </div>
        </div>
      </el-tab-pane>

      <!-- ============ 关联事件与问题 ============ -->
      <el-tab-pane :label="`关联事件与问题（${incidentRows.length + problemRows.length}）`" name="related">
        <div class="grid grid--2">
          <div class="card">
            <div class="card__head"><div class="card__title">关联事件单（{{ incidentRows.length }}）</div></div>
            <div class="card__body">
              <div v-if="!incidentRows.length" class="empty-box">
                <div class="empty-box__icon"><el-icon><Warning /></el-icon></div>
                <div class="empty-box__text">无关联事件单</div>
              </div>
              <div v-for="i in incidentRows" :key="i.id" class="rel-item">
                <div class="flex items-center justify-between">
                  <span class="mono text-sm">{{ i.no }}</span>
                  <StatusTag dict="IncidentStatus" :value="i.status" />
                </div>
                <div class="bold mt-1">{{ i.title }}</div>
                <div class="text-xs muted mt-1">
                  {{ i.categoryName }} · 严重程度 {{ i.severity }} · 处理人 {{ i.handler }} · SLA 到期 {{ fmtTime(i.slaDueAt) }}
                </div>
                <div class="text-sm mt-2">{{ i.description }}</div>
              </div>
            </div>
          </div>
          <div class="card">
            <div class="card__head"><div class="card__title">关联问题单（{{ problemRows.length }}）</div></div>
            <div class="card__body">
              <div v-if="!problemRows.length" class="empty-box">
                <div class="empty-box__icon">?</div>
                <div class="empty-box__text">无关联问题单</div>
              </div>
              <div v-for="p in problemRows" :key="p.id" class="rel-item">
                <div class="flex items-center justify-between">
                  <span class="mono text-sm">{{ p.no }}</span>
                  <StatusTag dict="ProblemStatus" :value="p.status" />
                </div>
                <div class="bold mt-1">{{ p.title }}</div>
                <div class="text-xs muted mt-1">{{ p.dept }} · 处理人 {{ p.handler }} · 优先级 {{ p.priority }}</div>
                <div v-if="p.rootCause" class="text-sm mt-2">根因：{{ p.rootCause }}</div>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- ============ 审计日志 ============ -->
      <el-tab-pane :label="`审计日志（${auditRows.length}）`" name="audit">
        <div class="card">
          <div class="card__head">
            <div class="card__title">审计日志</div>
            <div class="card__sub">记录数据前后修改值、修改人与时间</div>
            <div class="card__spacer" />
            <el-radio-group v-model="scopeMode" size="small">
              <el-radio-button value="this">本单</el-radio-button>
              <el-radio-button value="all">全部需求单</el-radio-button>
            </el-radio-group>
          </div>
          <div class="card__body card__body--flush">
            <el-table :data="auditRows" style="width: 100%">
              <el-table-column label="操作时间" width="150"><template #default="{ row }">{{ fmtTime(row.operatedAt) }}</template></el-table-column>
              <el-table-column prop="bizNo" label="单据号" width="140" />
              <el-table-column prop="action" label="操作" width="150" />
              <el-table-column label="字段变更（前 → 后）" min-width="300">
                <template #default="{ row }">
                  <div v-if="!lst(row.changes).length" class="muted text-sm">—</div>
                  <div v-for="(c, i) in lst(row.changes)" :key="i" class="text-sm">
                    <span class="mono">{{ c.field }}</span>：
                    <span class="muted">{{ c.before }}</span> →
                    <span class="bold">{{ c.after }}</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column prop="remark" label="备注" min-width="180" show-overflow-tooltip />
              <el-table-column label="操作人" width="130">
                <template #default="{ row }">
                  <div>{{ row.operator }}</div>
                  <div class="cell-sub">{{ row.operatorOrg }}</div>
                </template>
              </el-table-column>
              <el-table-column prop="ip" label="IP" width="130" />
              <el-table-column prop="terminal" label="终端" width="140" show-overflow-tooltip />
              <template #empty>
                <div class="empty-box">
                  <div class="empty-box__icon"><el-icon><Tickets /></el-icon></div>
                  <div class="empty-box__text">本单暂无审计记录；对需求单执行受理 / 审批 / 派发等操作后将自动留痕</div>
                </div>
              </template>
            </el-table>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 部署产物查看抽屉（与工作流管理共用同一产物面板） -->
    <el-drawer v-model="artifactVisible" title="自动化部署产物" size="700px">
      <template v-if="artifactResult && artifactRecord">
        <div class="flex items-center gap-2 mb-2 wrap">
          <span class="bold">{{ artifactRecord.no }}</span>
          <StatusTag :label="artifactRecord.status" :tone="artifactRecord.status === '成功' ? 'success' : 'danger'" :dot="false" />
          <span class="text-sm muted">{{ fmtTime(artifactRecord.at) }} · {{ artifactRecord.operator }}</span>
        </div>
        <div class="card__title mb-2">生成的 API 接口定义</div>
        <div class="code-box mb-4">{{ artifactResult.apiJson }}</div>
        <div class="card__title mb-2">相关文件（{{ artifactResult.files.length }}）</div>
        <ArtifactPanel :files="artifactResult.files" :demand-no="d.no" />
      </template>
      <div v-else class="empty-box">
        <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
        <div class="empty-box__text">未找到该次部署的产物</div>
      </div>
    </el-drawer>

    <!-- 派发任务弹窗 -->
    <el-dialog v-model="dispatchVisible" title="派发生产任务" width="680px">
      <el-alert class="mb-3" type="info" :closable="false" show-icon
        title="对新增资产的需求，通过关联任务的方式进行数据采集、加工、建模等任务的派发"
        :description="`承接需求单 ${d.no} · ${d.title}`" />
      <el-form label-width="96px">
        <el-form-item label="任务名称"><el-input v-model="dform.title" /></el-form-item>
        <el-form-item label="任务类型">
          <el-select v-model="dform.type" style="width: 220px">
            <el-option v-for="(o, k) in config.dicts.TaskType" :key="k" :label="o.label" :value="k" />
          </el-select>
        </el-form-item>
        <el-form-item label="承接部门">
          <el-select v-model="dform.dept" filterable allow-create style="width: 260px">
            <el-option v-for="o in deptOptions" :key="o" :label="o" :value="o" />
          </el-select>
        </el-form-item>
        <el-form-item label="实施人">
          <el-select v-model="dform.assignee" filterable style="width: 260px">
            <el-option v-for="u in assigneeOptions" :key="u.id" :label="`${u.name}（${u.org}）`" :value="u.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级">
          <el-radio-group v-model="dform.priority">
            <el-radio-button v-for="(o, k) in config.dicts.Priority" :key="k" :value="k">{{ o.label }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="计划起止">
          <el-date-picker v-model="dform.planStart" type="date" value-format="YYYY-MM-DD" placeholder="开始" style="width: 170px" />
          <span class="muted" style="margin: 0 var(--sp-2)">~</span>
          <el-date-picker v-model="dform.planEnd" type="date" value-format="YYYY-MM-DD" placeholder="结束" style="width: 170px" />
        </el-form-item>
        <el-form-item label="任务内容"><el-input v-model="dform.content" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="交付标准"><el-input v-model="dform.deliverable" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dispatchVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmDispatch">确认派发</el-button>
      </template>
    </el-dialog>
  </div>

  <div v-else class="card">
    <div class="empty-box">
      <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
      <div class="empty-box__text">未找到该需求单</div>
    </div>
  </div>
</template>

<style scoped>
.detail-tabs :deep(.el-tabs__header) { margin-bottom: var(--sp-4); }
.cell-main { font-weight: 600; }
.cell-sub { font-size: var(--fs-xs); color: var(--text-3); margin-top: 2px; }
.field-tag {
  display: inline-block; padding: 1px 8px; margin: 0 6px 6px 0;
  border-radius: var(--r-sm); background: var(--surface-2);
  font-size: var(--fs-xs); color: var(--text-2);
}
.deliver-list { margin: 0; padding-left: 20px; font-size: var(--fs-sm); color: var(--text-2); line-height: 1.9; }
.rel-item {
  padding: var(--sp-3); margin-bottom: var(--sp-3);
  border: 1px solid var(--border-2); border-radius: var(--r-md); background: var(--surface);
}
</style>
