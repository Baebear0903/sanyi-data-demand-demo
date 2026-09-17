<script setup lang="ts">
/**
 * DeliveryView —— 交付与授权
 *
 * 覆盖原文功能点（数据服务管理相关条款）：
 *  · 资源订阅：填写需求工单号后订阅数据服务，资源归属方可审批、订阅方可退订
 *  · 订阅审批流程管理：资源归属方审批、退订
 *  · 服务渠道授权管理：配置服务的使用范围 / 可见范围
 *  · 密钥管理：查看申请人与申请应用，支持补发密钥、更换密钥（全部订购方）
 *  · 资源推送：授权与数据推送，敏感资源走 SFTP；实时服务订购后自动组装并推送
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute } from 'vue-router'
import { useDemoStore } from '@/stores/demo'
import { config } from '@/core/config'
import { arr, by, demoUid, fmtTime, fromNow, iso, nowStamp, num } from '@/core/utils'
import PageHead from '@/components/PageHead.vue'
import StatCards from '@/components/StatCards.vue'
import StatusTag from '@/components/StatusTag.vue'

const store = useDemoStore()

/* ============================================================== 数据 == */
const subs = computed(() => store.table('subscriptions') as any[])
const services = computed(() => store.table('services') as any[])
const apps = computed(() => store.table('apps') as any[])
const tenants = computed(() => store.table('tenants') as any[])
const demands = computed(() => store.table('demands') as any[])

const svcOf = (id: string) => services.value.find(s => s.id === id) ?? null
const appOf = (id: string) => apps.value.find(a => a.id === id) ?? null
const tenantOf = (id: string) => tenants.value.find(t => t.id === id) ?? null

/* --------------------------------------------------------------- 筛选 -- */
const f = reactive({ kw: '', kind: '', approveStatus: '', tenantId: '' })
/** 字典 → 下拉选项（demo 字典为宽松字面量对象，这里显式收敛类型） */
const dictOptions = (name: string): { value: string; label: string }[] =>
  Object.entries((config.dicts as Record<string, any>)[name] ?? {}).map(([v, o]) => ({ value: v, label: (o as any).label ?? v }))

const kindOptions = dictOptions('ServiceKind')
const statusOptions = dictOptions('SubscriptionStatus')

const rows = computed(() => {
  const list = subs.value.filter(s => {
    if (f.kind && s.kind !== f.kind) return false
    if (f.approveStatus && s.approveStatus !== f.approveStatus) return false
    if (f.tenantId && s.tenantId !== f.tenantId) return false
    if (f.kw) {
      const svc = svcOf(s.serviceId)
      const hay = `${s.no} ${s.demandNo} ${svc?.name ?? ''} ${appOf(s.appId)?.name ?? ''}`.toLowerCase()
      if (!hay.includes(f.kw.toLowerCase())) return false
    }
    return true
  })
  return by(list, 'submittedAt', 'desc')
})

const stats = computed(() => {
  const list = subs.value
  const nameOf = (k: string) => list.filter(s => s.kind === k).length
  return [
    { label: '订阅总数', value: list.length, unit: '单', icon: 'Tickets', tone: 'primary' as const },
    { label: '待审批', value: list.filter(s => s.approveStatus === 'PENDING').length, unit: '单', icon: 'Clock', tone: 'warning' as const },
    { label: 'API 服务订阅', value: nameOf('API'), unit: '单', icon: 'Connection', tone: 'info' as const },
    { label: '文件服务订阅', value: nameOf('FILE'), unit: '单', icon: 'Folder', tone: 'teal' as const },
    { label: '实时服务订阅', value: nameOf('REALTIME'), unit: '单', icon: 'Lightning', tone: 'purple' as const },
    { label: '推送失败待补推', value: list.reduce((n, s) => n + arr(s.pushLogs).filter((p: any) => p.status === '失败').length, 0), unit: '次', icon: 'Warning', tone: 'danger' as const }
  ]
})

/* ======================================================== 新建订阅弹窗 == */
const createVisible = ref(false)
const form = reactive<any>({
  kind: 'API',
  serviceId: '',
  demandNo: '',
  appId: '',
  tenantId: '',
  fileName: '', filePath: '/data/', fileTaskName: '', separator: '|', format: 'CSV(UTF-8 BOM)', zip: true,
  fieldsText: '', rule: '', schedule: '每日 02:00',
  period: '12 个月', estCalls: 10000,
  rtMode: '推送', rtCluster: 'kafka-prod-03:9092', rtAuth: 'SASL/SCRAM-SHA-256', rtAuthType: '密钥认证'
})
const formRef = ref<any>(null)

const serviceOptions = computed(() => services.value.filter(s => s.kind === form.kind))
const appOptions = computed(() => apps.value.map(a => ({ value: a.id, label: `${a.name}（${tenantOf(a.tenantId)?.name ?? a.tenantId}）` })))
const demandOptions = computed(() =>
  demands.value.map(d => ({
    value: d.no,
    label: `${d.no} · ${d.title}`,
    status: d.status,
    ok: ['APPROVED', 'IMPLEMENTING', 'DELIVERED'].includes(d.status),
    okLabel: ['APPROVED', 'IMPLEMENTING', 'DELIVERED'].includes(d.status) ? '可订阅' : '状态不符'
  }))
)

/** 需求工单号校验：必须存在且状态为 已交付 / 实施中 / 审批通过 */
function validateDemandNo(_r: any, value: string, cb: (e?: Error) => void) {
  if (!value) return cb(new Error('需求工单号必填'))
  const d = demands.value.find(x => x.no === value)
  if (!d) return cb(new Error('需求工单号不存在，请输入有效的需求工单号'))
  if (!['APPROVED', 'IMPLEMENTING', 'DELIVERED'].includes(d.status)) {
    return cb(new Error(`该工单当前状态为「${(config.dicts.DemandStatus as any)[d.status]?.label ?? d.status}」，仅「审批通过 / 实施中 / 已交付」的工单可发起订阅`))
  }
  cb()
}
const demandRule = [{ validator: validateDemandNo, trigger: 'blur' }]

const createRules: any = {
  kind: [{ required: true, message: '请选择订阅方式', trigger: 'change' }],
  serviceId: [{ required: true, message: '请选择目标服务', trigger: 'change' }],
  appId: [{ required: true, message: '请绑定申请应用', trigger: 'change' }],
  demandNo: [{ required: true, validator: validateDemandNo, trigger: 'blur' }]
}

function openCreate(kind = 'API') {
  if (!store.can('demand.deliver') && !store.can('demand.apply')) {
    ElMessage.warning('当前角色无订阅申请权限')
    return
  }
  Object.assign(form, {
    kind, serviceId: '', demandNo: '', appId: '', tenantId: '', fileName: '', filePath: '/data/',
    fileTaskName: '', separator: '|', format: 'CSV(UTF-8 BOM)', zip: true, fieldsText: '', rule: '',
    schedule: '每日 02:00', period: '12 个月', estCalls: 10000, rtMode: '推送',
    rtCluster: 'kafka-prod-03:9092', rtAuth: 'SASL/SCRAM-SHA-256', rtAuthType: '密钥认证'
  })
  const first = services.value.find(s => s.kind === kind)
  if (first) form.serviceId = first.id
  createVisible.value = true
}

/** 选择服务后自动带出所属租户与推荐应用 */
function onServiceChange(id: string) {
  const s = svcOf(id)
  if (!s) return
  const a = apps.value.find(x => x.tenantId === form.tenantId) ?? apps.value[0]
  form.appId = form.appId || a?.id || ''
  form.tenantId = form.tenantId || a?.tenantId || ''
  if (form.kind === 'FILE' && s.resourceId) {
    const r = store.findById('resources', s.resourceId) as any
    form.fileTaskName = form.fileTaskName || `${r?.name ?? 'data'}_下发任务`
    form.fieldsText = form.fieldsText || arr(r?.fields).map((x: any) => x.name).slice(0, 6).join(',')
  }
}

function submitCreate() {
  const ref0 = formRef.value
  if (!ref0) return
  ref0.validate((ok: boolean) => {
    if (!ok) { ElMessage.warning('请先补全带 * 的必填项'); return }
    const svc = svcOf(form.serviceId)
    const rec: any = {
      id: demoUid('sb'),
      no: `DY${nowStamp()}${String(subs.value.length + 1).padStart(3, '0')}`,
      demandNo: form.demandNo,
      kind: form.kind,
      serviceId: form.serviceId,
      appId: form.appId,
      tenantId: form.tenantId || appOf(form.appId)?.tenantId || '',
      approveStatus: 'PENDING',
      submittedAt: iso(),
      channelAuth: null,
      pushLogs: []
    }
    if (form.kind === 'FILE') {
      rec.fileConf = {
        taskName: form.fileTaskName, filePath: form.filePath, fileName: form.fileName,
        separator: form.separator, format: form.format, zip: !!form.zip,
        fields: String(form.fieldsText).split(/[,，\s]+/).filter(Boolean),
        rule: form.rule, schedule: form.schedule
      }
    } else if (form.kind === 'API') {
      rec.apiConf = { period: form.period, estCalls: num(form.estCalls) }
    } else {
      rec.rtConf = { mode: form.rtMode, cluster: form.rtCluster, auth: form.rtAuth, authType: form.rtAuthType }
    }
    store.insert('subscriptions', rec)
    store.addAudit({
      bizType: 'subscriptions', bizId: rec.id, bizNo: rec.no,
      bizTitle: `${svc?.name ?? ''} 订阅申请`,
      action: '新建订阅申请',
      changes: [{ field: 'approveStatus', before: '（空）', after: '待审批' }],
      remark: `订阅方式 ${(config.dicts.ServiceKind as any)[form.kind]?.label}，需求工单号 ${form.demandNo}`
    })
    const d = demands.value.find(x => x.no === form.demandNo)
    if (d) {
      store.pushTimeline(d, { action: '发起服务订阅', comment: `订阅 ${svc?.name ?? ''}（${(config.dicts.ServiceKind as any)[form.kind]?.label}）` })
    }
    store.notify({
      type: 'info', title: `订阅单 ${rec.no} 待审批`,
      body: `${appOf(form.appId)?.name ?? ''} 申请订阅「${svc?.name ?? ''}」，请资源归属方审批。`,
      toRoles: ['supplier'], link: '/delivery'
    })
    createVisible.value = false
    ElMessage.success(`订阅申请已提交，单号 ${rec.no}，等待资源归属方审批`)
  })
}

/* ============================================================ 详情抽屉 == */
const detailVisible = ref(false)
const currentId = ref('')
const current = computed(() => subs.value.find(s => s.id === currentId.value) ?? null)
const authDraft = reactive<{ useScope: string[]; visibleScope: string[] }>({ useScope: [], visibleScope: [] })
const authDirty = ref(false)

/**
 * 深链支持：路由 /delivery/detail/:id 直接打开对应订阅单详情抽屉。
 * 用于审计中心、待办、通知等处的精确跳转。
 */
const route = useRoute()
function openById(id: string) {
  const row = subs.value.find(s => s.id === id || s.no === id)
  if (row) openDetail(row)
  else ElMessage.warning(`未找到订阅单 ${id}`)
}
onMounted(() => { if (route.params.id) openById(String(route.params.id)) })
watch(() => route.params.id, (v) => { if (v) openById(String(v)) })

function openDetail(row: any) {
  currentId.value = row.id
  Object.assign(authDraft, {
    useScope: [...arr(row.channelAuth?.useScope)],
    visibleScope: [...arr(row.channelAuth?.visibleScope)]
  })
  authDirty.value = false
  detailVisible.value = true
}

const orgOptions = computed(() => Array.from(new Set([
  ...apps.value.map(a => appOf(a.id)?.name ?? ''),
  ...demands.value.map(d => d.applicantOrg),
  '市医疗保障局', '市卫生健康委员会', '市药品监督管理局', '市疾病预防控制中心'
].filter(Boolean))))

function saveAuth() {
  if (!current.value) return
  if (!store.can('demand.deliver') && !store.can('flow.config')) {
    ElMessage.warning('当前角色无「服务渠道授权管理」权限')
    return
  }
  if (!authDraft.useScope.length) { ElMessage.warning('使用范围至少选择一项'); return }
  store.update('subscriptions', current.value.id, {
    channelAuth: { useScope: [...authDraft.useScope], visibleScope: [...authDraft.visibleScope] }
  }, { action: '配置服务渠道授权', remark: `使用范围 ${authDraft.useScope.length} 项 / 可见范围 ${authDraft.visibleScope.length} 项` })
  authDirty.value = false
  ElMessage.success('渠道授权已保存')
}

/* ------------------------------------------------------------ 密钥管理 -- */
function maskSecret(v: string) {
  const s = String(v ?? '')
  if (!s) return '—'
  return s.length <= 8 ? s.replace(/./g, '*') : s.slice(0, 4) + '******************' + s.slice(-4)
}

function reissueKey() {
  const s = current.value
  if (!s) return
  if (!store.can('demand.deliver')) { ElMessage.warning('当前角色无密钥管理权限'); return }
  const appKey = `AK${nowStamp()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`
  const appSecret = `SK${Math.random().toString(36).slice(2, 10).toUpperCase()}${Math.random().toString(36).slice(2, 10).toUpperCase()}`
  store.update('subscriptions', s.id, {
    secret: { appKey, appSecret, issuedAt: iso(), reissued: true }
  }, { action: '补发密钥', remark: `为申请应用「${appOf(s.appId)?.name ?? ''}」补发密钥（申请人 ${s.approver ?? '—'}）` })
  ElMessage.success('密钥已补发，请通知申请应用及时更新 appSecret')
}

async function changeKey() {
  const s = current.value
  if (!s) return
  if (!store.can('demand.deliver')) { ElMessage.warning('当前角色无密钥管理权限'); return }
  try {
    await ElMessageBox.confirm(
      `将为服务「${svcOf(s.serviceId)?.name ?? ''}」的订购方统一更换密钥，旧密钥立即失效，需通知全部订购方同步更新。是否继续？`,
      '更换密钥', { confirmButtonText: '确认更换', cancelButtonText: '取消', type: 'warning' }
    )
  } catch { return }
  const sameSvc = subs.value.filter(x => x.serviceId === s.serviceId && x.secret)
  sameSvc.forEach((x, i) => {
    store.update('subscriptions', x.id, {
      secret: {
        appKey: `AK${nowStamp()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        appSecret: `SK${Math.random().toString(36).slice(2, 10).toUpperCase()}${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
        issuedAt: iso(), reissued: true
      }
    }, { action: '更换密钥', remark: i === 0 ? `服务级密钥更换，覆盖 ${sameSvc.length} 个订购方` : '随服务级密钥更换一并更新' })
  })
  ElMessage.success(`已为 ${sameSvc.length} 个订购方更换密钥，广播通知已同步发送`)
  store.insert('broadcasts', {
    id: demoUid('gb'), no: `GB${nowStamp()}${subs.value.length}`,
    title: `【安全提醒】服务「${svcOf(s.serviceId)?.name ?? ''}」密钥更换通知`,
    content: `平台已对服务「${svcOf(s.serviceId)?.name ?? ''}」的全部订购方执行密钥更换，请相关应用及时更新 appSecret，逾期将无法正常调用。`,
    targets: [{ type: 'GROUP', ids: ['订阅方'] }], channels: ['站内', '邮件'], sender: store.user.name,
    senderOrg: store.user.org, sentAt: iso(), readBy: [], status: 'NEW', relatedId: s.id
  })
}

/* ------------------------------------------------------------ 推送记录 -- */
function retryPush(sub: any, log: any) {
  if (!store.can('demand.deliver') && !store.can('flow.deploy')) { ElMessage.warning('当前角色无数据推送权限'); return }
  const logs = arr(sub.pushLogs).slice()
  logs.push({
    at: iso(), target: log.target, mode: '补推', transport: log.transport,
    rows: log.rows, status: '成功', note: `补推成功（原失败时间 ${log.at}：${log.note || '—'}）`
  })
  store.update('subscriptions', sub.id, { pushLogs: logs }, { action: '补推数据', remark: `对 ${log.target} 执行补推，共 ${log.rows} 条` })
  ElMessage.success(`已对「${log.target}」执行补推，共 ${log.rows} 条记录`)
}

function pushNow(sub: any) {
  const svc = svcOf(sub.serviceId)
  const r = svc ? store.findById('resources', svc.resourceId) as any : null
  const sensitive = ['L3', 'L4'].includes(r?.securityLevel ?? '')
  const logs = arr(sub.pushLogs).slice()
  const rowsCount = 1000 + Math.floor(Math.random() * 90000)
  logs.push({
    at: iso(), target: appOf(sub.appId)?.name ?? '订阅应用',
    mode: '数据推送', transport: sub.kind === 'REALTIME' ? 'Flink' : sensitive ? 'SFTP' : '库表',
    rows: rowsCount, status: '成功',
    note: sensitive ? '敏感资源，按规范走 SFTP 通道下发' : '按调度配置执行推送'
  })
  store.update('subscriptions', sub.id, { pushLogs: logs }, {
    action: '执行数据推送',
    remark: `推送 ${rowsCount} 条至 ${appOf(sub.appId)?.name ?? ''}（${sensitive ? 'SFTP' : '库表'}）`
  })
  ElMessage.success(`推送完成：${rowsCount} 条记录已送达「${appOf(sub.appId)?.name ?? ''}」`)
}

/* ------------------------------------------------------------- 审批动作 -- */
async function approve(sub: any) {
  if (!store.can('demand.approve') && !store.can('demand.deliver')) { ElMessage.warning('当前角色无订阅审批权限'); return }
  try {
    const { value } = await ElMessageBox.prompt('请填写审批意见（将反馈给订阅方）', `审批订阅单 ${sub.no}`, {
      confirmButtonText: '审批通过', cancelButtonText: '取消', inputType: 'textarea',
      inputValue: '同意订阅，按渠道授权范围交付，敏感字段脱敏后下发。'
    })
    const svc = svcOf(sub.serviceId)
    const r = svc ? store.findById('resources', svc.resourceId) as any : null
    const appKey = `AK${nowStamp()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`
    store.update('subscriptions', sub.id, {
      approveStatus: 'APPROVED', approver: store.user.name, approvedAt: iso(),
      channelAuth: sub.channelAuth ?? {
        useScope: [appOf(sub.appId)?.name ?? '订阅应用'],
        visibleScope: [demands.value.find(d => d.no === sub.demandNo)?.applicantOrg ?? '订阅方组织']
      },
      secret: sub.kind === 'API' || sub.kind === 'REALTIME'
        ? { appKey, appSecret: `SK${Math.random().toString(36).slice(2, 10).toUpperCase()}${Math.random().toString(36).slice(2, 10).toUpperCase()}`, issuedAt: iso() }
        : sub.secret
    }, { action: '资源归属方审批订阅', remark: value })

    /* 推送记录：授权 / 数据推送（敏感资源走 SFTP） */
    const logs = arr(sub.pushLogs).slice()
    logs.push({
      at: iso(), target: appOf(sub.appId)?.name ?? '订阅应用', mode: '授权',
      transport: sub.kind === 'REALTIME' ? 'Flink' : sub.kind === 'FILE' ? (['L3', 'L4'].includes(r?.securityLevel) ? 'SFTP' : '库表') : '库表',
      rows: 0, status: '成功', note: '渠道授权与密钥发放完成'
    })
    if (sub.kind === 'REALTIME') {
      const rowsCount = 1000 + Math.floor(Math.random() * 20000)
      logs.push({
        at: iso(), target: appOf(sub.appId)?.name ?? '订阅应用', mode: '数据推送', transport: 'Flink',
        rows: rowsCount, status: '成功', note: '实时服务订购后自动组装并推送（Flink 作业已启动）'
      })
    }
    store.update('subscriptions', sub.id, { pushLogs: logs }, { action: '执行交付推送', remark: '订阅审批通过后自动完成渠道授权' })

    if (['L3', 'L4'].includes(r?.securityLevel)) {
      store.notify({
        type: 'warning', title: `订阅单 ${sub.no} 涉及敏感资源`,
        body: `资源「${r.name}」敏感级别 ${r.securityLevel}，已按分类分级结果配置脱敏与 SFTP 下发。`, toRoles: ['supplier', 'ops']
      })
    }
    store.notify({
      type: 'success', title: `订阅单 ${sub.no} 审批通过`,
      body: `审批意见：${value}，密钥已发放，可在「交付与授权」中查看。`,
      toRoles: ['consumer'], link: '/delivery'
    })
    ElMessage.success('审批通过：渠道授权已生效，密钥已发放')
  } catch { /* 取消 */ }
}

async function reject(sub: any) {
  if (!store.can('demand.approve') && !store.can('demand.deliver')) { ElMessage.warning('当前角色无订阅审批权限'); return }
  try {
    const { value } = await ElMessageBox.prompt('请填写驳回原因', `驳回订阅单 ${sub.no}`, {
      confirmButtonText: '确认驳回', cancelButtonText: '取消', inputType: 'textarea'
    })
    store.update('subscriptions', sub.id, { approveStatus: 'REJECTED', rejectReason: value, rejectedAt: iso() }, { action: '资源归属方驳回订阅', remark: value })
    store.notify({
      type: 'warning', title: `订阅单 ${sub.no} 被驳回`,
      body: `驳回原因：${value}`, toRoles: ['consumer'], link: '/delivery'
    })
    ElMessage.warning('已驳回，原因已反馈订阅方')
  } catch { /* 取消 */ }
}

async function unsubscribe(sub: any) {
  try {
    const { value } = await ElMessageBox.prompt('请填写退订原因', `退订订阅单 ${sub.no}`, {
      confirmButtonText: '确认退订', cancelButtonText: '取消', inputType: 'textarea',
      inputValue: '业务调整，不再需要该数据服务。'
    })
    store.update('subscriptions', sub.id, {
      approveStatus: 'UNSUBSCRIBED', unsubscribedAt: iso(), unsubscribeReason: value
    }, { action: '订阅方退订', remark: value })
    const svc = svcOf(sub.serviceId)
    if (svc) {
      store.update('services', svc.id, { subscribeCount: Math.max(0, num(svc.subscribeCount) - 1) }, {
        action: '退订后订阅数变更', remark: `${sub.no} 退订`
      })
    }
    ElMessage.info(`已退订 ${sub.no}，密钥将在 24 小时内失效`)
  } catch { /* 取消 */ }
}

function actionsOf(sub: any) {
  const out: { label: string; type?: string; run: () => void }[] = []
  if (sub.approveStatus === 'PENDING' && (store.can('demand.approve') || store.can('demand.deliver'))) {
    out.push({ label: '审批订阅', type: 'primary', run: () => approve(sub) })
    out.push({ label: '驳回', run: () => reject(sub) })
  }
  if (['APPROVED', 'PENDING'].includes(sub.approveStatus) && (store.can('demand.apply') || sub.appId === (apps.value.find(a => store.isMine(a.owner))?.id ?? ''))) {
    out.push({ label: '退订', run: () => unsubscribe(sub) })
  }
  out.push({ label: '详情', run: () => openDetail(sub) })
  return out
}

/* ------------------------------------------------------------ 配置描述 -- */
function confRows(sub: any): { label: string; value: string }[] {
  if (sub.kind === 'FILE' && sub.fileConf) {
    const c = sub.fileConf
    return [
      { label: '任务名称', value: c.taskName ?? '—' },
      { label: '文件路径', value: c.filePath ?? '—' },
      { label: '文件名称', value: c.fileName ?? '—' },
      { label: '分隔符', value: c.separator ?? '—' },
      { label: '下发格式', value: c.format ?? '—' },
      { label: '分包压缩', value: c.zip ? '是' : '否' },
      { label: '字段配置', value: arr(c.fields).join('、') || '—' },
      { label: '取数规则', value: c.rule ?? '—' },
      { label: '执行计划', value: c.schedule ?? '—' }
    ]
  }
  if (sub.kind === 'API' && sub.apiConf) {
    return [
      { label: '绑定应用', value: appOf(sub.appId)?.name ?? '—' },
      { label: '使用周期', value: sub.apiConf.period ?? '—' },
      { label: '预估调用量', value: `${num(sub.apiConf.estCalls).toLocaleString()} 次/月` }
    ]
  }
  if (sub.kind === 'REALTIME' && sub.rtConf) {
    return [
      { label: '需求工单号', value: sub.demandNo ?? '—' },
      { label: '获取方式', value: sub.rtConf.mode ?? '—' },
      { label: '集群连接信息', value: sub.rtConf.cluster ?? '—' },
      { label: '鉴权信息', value: sub.rtConf.auth ?? '—' },
      { label: '认证方式', value: sub.rtConf.authType ?? '—' }
    ]
  }
  return [{ label: '订阅配置', value: '—' }]
}

const secretVisible = ref(false)
</script>

<template>
  <div>
    <PageHead
      title="交付与授权"
      desc="资源订阅与审批、服务渠道授权、密钥管理与资源推送。"
    >
      <template #actions>
        <el-button @click="openCreate('FILE')"><el-icon><Folder /></el-icon> 新建文件订阅</el-button>
        <el-button @click="openCreate('REALTIME')"><el-icon><Lightning /></el-icon> 新建实时订阅</el-button>
        <el-button type="primary" @click="openCreate('API')"><el-icon><Plus /></el-icon> 新建 API 订阅</el-button>
      </template>
    </PageHead>

    <StatCards :items="stats" />

    <div class="card">
      <div class="toolbar">
        <div class="toolbar__fields">
          <div class="field"><span class="field__label">关键字</span>
            <el-input v-model="f.kw" placeholder="订阅单号 / 需求工单号 / 服务 / 应用" clearable style="width: 260px" />
          </div>
          <div class="field"><span class="field__label">订阅方式</span>
            <el-select v-model="f.kind" placeholder="全部" clearable style="width: 140px">
              <el-option v-for="o in kindOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </div>
          <div class="field"><span class="field__label">状态</span>
            <el-select v-model="f.approveStatus" placeholder="全部状态" clearable style="width: 140px">
              <el-option v-for="o in statusOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </div>
          <div class="field"><span class="field__label">租户</span>
            <el-select v-model="f.tenantId" placeholder="全部租户" clearable style="width: 200px">
              <el-option v-for="t in tenants" :key="t.id" :label="t.name" :value="t.id" />
            </el-select>
          </div>
        </div>
        <div class="toolbar__actions">
          <el-button @click="Object.assign(f, { kw: '', kind: '', approveStatus: '', tenantId: '' })">重置</el-button>
        </div>
      </div>

      <el-table :data="rows" size="default" style="width: 100%" row-key="id">
        <el-table-column prop="no" label="订阅单号" width="132" fixed="left">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">{{ row.no }}</el-button>
          </template>
        </el-table-column>
        <el-table-column label="关联需求工单号" width="150">
          <template #default="{ row }">
            <span class="mono">{{ row.demandNo || '—' }}</span>
            <div v-if="demands.find(d => d.no === row.demandNo)" class="cell-sub">{{ demands.find(d => d.no === row.demandNo)?.title }}</div>
          </template>
        </el-table-column>
        <el-table-column label="服务" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="cell-main">{{ svcOf(row.serviceId)?.name ?? row.serviceId }}</div>
            <div class="cell-sub">{{ svcOf(row.serviceId)?.publisher ?? '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="订阅方式" width="106">
          <template #default="{ row }"><StatusTag dict="ServiceKind" :value="row.kind" /></template>
        </el-table-column>
        <el-table-column label="订阅应用" min-width="170" show-overflow-tooltip>
          <template #default="{ row }">{{ appOf(row.appId)?.name ?? '—' }}</template>
        </el-table-column>
        <el-table-column label="租户" min-width="170" show-overflow-tooltip>
          <template #default="{ row }">{{ tenantOf(row.tenantId)?.name ?? '—' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }"><StatusTag dict="SubscriptionStatus" :value="row.approveStatus" /></template>
        </el-table-column>
        <el-table-column label="提交时间" width="130">
          <template #default="{ row }">
            <div>{{ row.submittedAt ? fmtTime(row.submittedAt).slice(5, 16) : '—' }}</div>
            <div class="cell-sub">{{ row.submittedAt ? fromNow(row.submittedAt) : '' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button v-for="(a, i) in actionsOf(row).slice(0, 1)" :key="i" link :type="a.type === 'primary' ? 'primary' : 'default'" size="small" @click.stop="a.run()">{{ a.label }}</el-button>
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
            <div class="empty-box__text">没有符合条件的订阅单</div>
          </div>
        </template>
      </el-table>

      <div class="card__foot">
        <span class="text-sm muted">共 <b>{{ rows.length }}</b> 条订阅单 · 订阅须关联需求工单号，审批通过后自动完成渠道授权与密钥发放</span>
      </div>
    </div>

    <!-- ================================================ 新建订阅弹窗 == -->
    <el-dialog v-model="createVisible" title="新建服务订阅" width="720px">
      <el-form ref="formRef" :model="form" :rules="createRules" label-width="118px">
        <el-form-item label="订阅方式" prop="kind">
          <el-radio-group v-model="form.kind" @change="() => { form.serviceId = serviceOptions[0]?.id ?? ''; onServiceChange(form.serviceId) }">
            <el-radio-button value="API">API 服务</el-radio-button>
            <el-radio-button value="FILE">文件服务</el-radio-button>
            <el-radio-button value="REALTIME">实时服务</el-radio-button>
          </el-radio-group>
          <div class="text-xs muted mt-1">文件服务配置下发任务；API 服务绑定应用与调用量；实时服务须填写需求工单号。</div>
        </el-form-item>

        <el-form-item label="需求工单号" prop="demandNo">
          <el-select v-model="form.demandNo" filterable allow-create default-first-option placeholder="输入或选择需求工单号" style="width: 100%">
            <el-option v-for="d in demandOptions" :key="d.value" :label="d.label" :value="d.value" :disabled="!d.ok">
              <span>{{ d.label }}</span>
              <span class="opt-tail" :class="d.ok ? 'opt-tail--ok' : 'opt-tail--no'">{{ d.okLabel }}</span>
            </el-option>
          </el-select>
          <div class="text-xs muted mt-1">工单须存在且状态为「审批通过 / 实施中 / 已交付」（实时服务订阅必填）。</div>
        </el-form-item>

        <el-form-item label="目标服务" prop="serviceId">
          <el-select v-model="form.serviceId" style="width: 100%" @change="onServiceChange">
            <el-option v-for="s in serviceOptions" :key="s.id" :label="`${s.name}（${s.publisher}）`" :value="s.id" />
          </el-select>
          <div v-if="!serviceOptions.length" class="text-xs muted mt-1">该类型暂无可订阅服务</div>
        </el-form-item>

        <el-form-item label="绑定应用" prop="appId">
          <el-select v-model="form.appId" style="width: 100%">
            <el-option v-for="a in appOptions" :key="a.value" :label="a.label" :value="a.value" />
          </el-select>
        </el-form-item>

        <!-- 文件服务 -->
        <template v-if="form.kind === 'FILE'">
          <el-divider content-position="left">文件服务配置</el-divider>
          <div class="grid grid--2">
            <el-form-item label="任务名称"><el-input v-model="form.fileTaskName" /></el-form-item>
            <el-form-item label="文件路径"><el-input v-model="form.filePath" /></el-form-item>
            <el-form-item label="文件名称"><el-input v-model="form.fileName" placeholder="如 data_{yyyyMMdd}.csv" /></el-form-item>
            <el-form-item label="分隔符" label-width="118px">
              <el-select v-model="form.separator" style="width: 100%">
                <el-option v-for="s in ['|', ',', '\\t', ';']" :key="s" :label="s === '\\t' ? 'Tab' : s" :value="s" />
              </el-select>
            </el-form-item>
            <el-form-item label="下发格式">
              <el-select v-model="form.format" style="width: 100%">
                <el-option v-for="s in ['CSV(UTF-8 BOM)', 'CSV(GBK)', 'TXT', 'JSON', 'Parquet']" :key="s" :label="s" :value="s" />
              </el-select>
            </el-form-item>
            <el-form-item label="分包压缩"><el-switch v-model="form.zip" active-text="是" inactive-text="否" inline-prompt /></el-form-item>
          </div>
          <el-form-item label="字段配置"><el-input v-model="form.fieldsText" type="textarea" :rows="2" placeholder="逗号分隔，如 settle_no,insured_id,settle_date" /></el-form-item>
          <el-form-item label="取数规则"><el-input v-model="form.rule" placeholder="如：按 settle_date = T-1 增量取数" /></el-form-item>
          <el-form-item label="执行计划"><el-input v-model="form.schedule" placeholder="如：每日 04:00" /></el-form-item>
        </template>

        <!-- API 服务 -->
        <template v-else-if="form.kind === 'API'">
          <el-divider content-position="left">API 服务配置</el-divider>
          <div class="grid grid--2">
            <el-form-item label="使用周期">
              <el-select v-model="form.period" style="width: 100%">
                <el-option v-for="s in ['6 个月', '12 个月', '24 个月', '长期']" :key="s" :label="s" :value="s" />
              </el-select>
            </el-form-item>
            <el-form-item label="预估调用量">
              <el-input-number v-model="form.estCalls" :min="0" :step="1000" controls-position="right" style="width: 100%" />
            </el-form-item>
          </div>
          <div class="text-xs muted">单位：次/月。调用量将作为服务容量评估与限流配置依据。</div>
        </template>

        <!-- 实时服务 -->
        <template v-else>
          <el-divider content-position="left">实时服务配置</el-divider>
          <div class="grid grid--2">
            <el-form-item label="获取方式">
              <el-radio-group v-model="form.rtMode">
                <el-radio-button value="推送">推送</el-radio-button>
                <el-radio-button value="消费">消费</el-radio-button>
              </el-radio-group>
            </el-form-item>
            <el-form-item label="认证方式">
              <el-select v-model="form.rtAuthType" style="width: 100%">
                <el-option v-for="s in ['密钥认证', '证书认证', '免认证（内网）']" :key="s" :label="s" :value="s" />
              </el-select>
            </el-form-item>
            <el-form-item label="集群连接信息"><el-input v-model="form.rtCluster" placeholder="host:port" /></el-form-item>
            <el-form-item label="鉴权信息"><el-input v-model="form.rtAuth" placeholder="如 SASL/SCRAM-SHA-256" /></el-form-item>
          </div>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" @click="submitCreate">提交订阅申请</el-button>
      </template>
    </el-dialog>

    <!-- ================================================== 详情抽屉 == -->
    <el-drawer v-model="detailVisible" size="58%" :title="`订阅详情 · ${current?.no ?? ''}`">
      <template v-if="current">
        <div class="flex items-center gap-2 mb-3 wrap">
          <StatusTag dict="ServiceKind" :value="current.kind" />
          <StatusTag dict="SubscriptionStatus" :value="current.approveStatus" />
          <span class="card__spacer" />
          <el-button v-if="current.approveStatus === 'PENDING' && (store.can('demand.approve') || store.can('demand.deliver'))" type="primary" size="small" @click="approve(current)">审批订阅</el-button>
          <el-button v-if="current.approveStatus === 'PENDING' && (store.can('demand.approve') || store.can('demand.deliver'))" size="small" @click="reject(current)">驳回</el-button>
          <el-button v-if="current.approveStatus === 'APPROVED'" size="small" @click="unsubscribe(current)">退订</el-button>
        </div>

        <div class="card mb-3">
          <div class="card__head"><div class="card__title">订阅基本信息</div></div>
          <div class="card__body">
            <div class="desc-grid">
              <div class="desc-item"><div class="desc-item--label">订阅单号</div><div class="desc-item__value mono">{{ current.no }}</div></div>
              <div class="desc-item"><div class="desc-item--label">需求工单号</div><div class="desc-item__value mono">{{ current.demandNo || '—' }}</div></div>
              <div class="desc-item"><div class="desc-item--label">服务名称</div><div class="desc-item__value">{{ svcOf(current.serviceId)?.name ?? '—' }}</div></div>
              <div class="desc-item"><div class="desc-item--label">服务发布方</div><div class="desc-item__value">{{ svcOf(current.serviceId)?.publisher ?? '—' }}</div></div>
              <div class="desc-item"><div class="desc-item--label">申请应用</div><div class="desc-item__value">{{ appOf(current.appId)?.name ?? '—' }}</div></div>
              <div class="desc-item"><div class="desc-item--label">所属租户</div><div class="desc-item__value">{{ tenantOf(current.tenantId)?.name ?? '—' }}</div></div>
              <div class="desc-item"><div class="desc-item--label">申请人</div><div class="desc-item__value">{{ appOf(current.appId)?.owner ?? '—' }}</div></div>
              <div class="desc-item"><div class="desc-item--label">提交时间</div><div class="desc-item__value">{{ fmtTime(current.submittedAt) }}</div></div>
              <div class="desc-item"><div class="desc-item--label">审批人 / 时间</div><div class="desc-item__value">{{ current.approver || '—' }} {{ current.approvedAt ? fmtTime(current.approvedAt) : '' }}</div></div>
              <div class="desc-item"><div class="desc-item--label">退订时间</div><div class="desc-item__value">{{ current.unsubscribedAt ? fmtTime(current.unsubscribedAt) : '—' }}</div></div>
              <div v-if="current.rejectReason" class="desc-item desc-item--wide"><div class="desc-item--label">驳回原因</div><div class="desc-item__value">{{ current.rejectReason }}</div></div>
            </div>
          </div>
        </div>

        <div class="card mb-3">
          <div class="card__head">
            <div class="card__title">订阅配置（{{ (config.dicts.ServiceKind as any)[current.kind]?.label }}）</div>
            <div class="card__sub">不同订阅方式需配置的字段不同</div>
          </div>
          <div class="card__body">
            <div class="desc-grid">
              <div v-for="c in confRows(current)" :key="c.label" class="desc-item">
                <div class="desc-item--label">{{ c.label }}</div>
                <div class="desc-item__value">{{ c.value }}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="card mb-3">
          <div class="card__head">
            <div class="card__title">服务渠道授权</div>
            <div class="card__sub">「使用范围」＝可使用该服务的对象；「可见范围」＝可看到该服务的对象。</div>
            <span class="card__spacer" />
            <el-button size="small" type="primary" :disabled="!authDirty" @click="saveAuth">保存授权</el-button>
          </div>
          <div class="card__body">
            <div class="grid grid--2">
              <div>
                <div class="text-sm mb-2">使用范围</div>
                <el-select v-model="authDraft.useScope" multiple filterable allow-create default-first-option placeholder="选择或输入组织 / 应用" style="width: 100%" @change="authDirty = true">
                  <el-option v-for="o in orgOptions" :key="o" :label="o" :value="o" />
                </el-select>
              </div>
              <div>
                <div class="text-sm mb-2">可见范围</div>
                <el-select v-model="authDraft.visibleScope" multiple filterable allow-create default-first-option placeholder="选择或输入组织" style="width: 100%" @change="authDirty = true">
                  <el-option v-for="o in orgOptions" :key="o" :label="o" :value="o" />
                </el-select>
              </div>
            </div>
            <div v-if="!current.channelAuth" class="text-xs muted mt-3">该订阅尚未配置渠道授权，审批通过时将按申请应用自动生成授权范围。</div>
          </div>
        </div>

        <div class="card mb-3">
          <div class="card__head">
            <div class="card__title">密钥管理</div>
            <div class="card__sub">可查看申请人与申请应用；支持补发密钥、为所有订购方更换密钥</div>
            <span class="card__spacer" />
            <el-button size="small" @click="reissueKey">补发密钥</el-button>
            <el-button size="small" type="primary" plain @click="changeKey">更换密钥</el-button>
          </div>
          <div class="card__body">
            <template v-if="current.secret">
              <div class="desc-grid">
                <div class="desc-item"><div class="desc-item--label">appKey</div><div class="desc-item__value mono">{{ current.secret.appKey }}</div></div>
                <div class="desc-item">
                  <div class="desc-item--label">appSecret</div>
                  <div class="desc-item__value mono">
                    <span v-if="secretVisible">{{ current.secret.appSecret }}</span>
                    <span v-else class="masked">{{ maskSecret(current.secret.appSecret) }}</span>
                    <el-button link size="small" @click="secretVisible = !secretVisible">{{ secretVisible ? '隐藏' : '显示' }}</el-button>
                  </div>
                </div>
                <div class="desc-item"><div class="desc-item--label">发放时间</div><div class="desc-item__value">{{ fmtTime(current.secret.issuedAt) }}</div></div>
                <div class="desc-item"><div class="desc-item--label">是否补发过</div><div class="desc-item__value">{{ current.secret.reissued ? '是' : '否' }}</div></div>
                <div class="desc-item"><div class="desc-item--label">申请人 / 申请应用</div><div class="desc-item__value">{{ appOf(current.appId)?.owner ?? '—' }} / {{ appOf(current.appId)?.name ?? '—' }}</div></div>
              </div>
            </template>
            <div v-else class="empty-box">
              <div class="empty-box__icon"><el-icon><Key /></el-icon></div>
              <div class="empty-box__text">尚未发放密钥（审批通过后自动发放 appKey / appSecret）</div>
            </div>
          </div>
        </div>

        <div class="card mb-3">
          <div class="card__head">
            <div class="card__title">资源推送记录</div>
            <div class="card__sub">敏感资源走 SFTP 通道；实时服务订购后自动组装并推送</div>
            <span class="card__spacer" />
            <el-button size="small" type="primary" plain @click="pushNow(current)">立即推送</el-button>
          </div>
          <div class="card__body card__body--flush">
            <el-table :data="arr(current.pushLogs)" size="small" style="width: 100%">
              <el-table-column label="时间" width="140">
                <template #default="{ row }">{{ fmtTime(row.at) }}</template>
              </el-table-column>
              <el-table-column prop="target" label="推送目标" min-width="170" show-overflow-tooltip />
              <el-table-column prop="mode" label="方式" width="90" />
              <el-table-column label="传输通道" width="100">
                <template #default="{ row }">
                  <StatusTag :label="row.transport" :tone="row.transport === 'SFTP' ? 'warning' : row.transport === 'Flink' ? 'purple' : 'info'" :dot="false" />
                </template>
              </el-table-column>
              <el-table-column label="条数" width="100">
                <template #default="{ row }"><span class="mono">{{ num(row.rows).toLocaleString() }}</span></template>
              </el-table-column>
              <el-table-column label="状态" width="90">
                <template #default="{ row }">
                  <StatusTag :label="row.status" :tone="row.status === '成功' ? 'success' : 'danger'" />
                </template>
              </el-table-column>
              <el-table-column prop="note" label="说明" min-width="200" show-overflow-tooltip />
              <el-table-column label="操作" width="80" fixed="right">
                <template #default="{ row }">
                  <el-button v-if="row.status === '失败'" link type="primary" size="small" @click="retryPush(current, row)">补推</el-button>
                  <span v-else class="muted text-xs">—</span>
                </template>
              </el-table-column>
              <template #empty>
                <div class="empty-box">
                  <div class="empty-box__icon"><el-icon><Promotion /></el-icon></div>
                  <div class="empty-box__text">暂无推送记录</div>
                </div>
              </template>
            </el-table>
          </div>
        </div>
      </template>
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
.opt-tail { float: right; font-size: var(--fs-xs); margin-left: var(--sp-3); }
.opt-tail--ok { color: var(--success-fg); }
.opt-tail--no { color: var(--text-4); }
</style>
