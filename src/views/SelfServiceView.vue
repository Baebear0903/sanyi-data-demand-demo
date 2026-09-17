<script setup lang="ts">
/**
 * SelfServiceView —— 自助服务管理（M11）
 *
 * 覆盖原文功能点：
 *  · 自助服务管理（总述）：通过服务目录发布服务内容，帮助用户自己处理事件或完成事件、问题的申报，
 *    从而大量降低进入服务台的请求，使运维工程师集中精力解决服务故障事件和恢复关键任务。
 *  · 服务目录（9.1）：向最终用户展示信息系统提供的服务内容、可用性、时间，确保清楚了解服务指标。
 *  · 服务产品（9.2）：通过图片、HTML、层次目录等方式友好展现服务目录内容，可通过搜索快速查找服务产品。
 *  · 权限管理（9.3）：服务目录按各角色的可申请范围定义当前用户能使用的服务内容
 *    （矩阵的查看 / 编辑入口在「综合 → 系统配置 → 角色与权限」，本页只呈现结果）。
 *  · WEB 提交需求（9.4）：基于 Web 的三医服务窗口，用户可填写故障申诉和服务申请。
 *  · 电子邮件提交需求（9.5）：支持用户通过电子邮件方式提交服务申请（邮件解析 → 自动建单）。
 *  · 预定义需求类别（9.6）：提供预定义故障与服务申请类别、描述；根据所选服务类型展现不同界面、
 *    要求输入相关信息、激活不同处理流程。
 */
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useDemoStore } from '@/stores/demo'
import { config } from '@/core/config'
import { ticketKindOf } from '@/core/serviceCatalog'
import { addDays, iso, nowIsoOffset, today, truncate } from '@/core/utils'
import PageHead from '@/components/PageHead.vue'
import StatCards from '@/components/StatCards.vue'
import StatusTag from '@/components/StatusTag.vue'

const store = useDemoStore()
const router = useRouter()

/** 安全数组（单据数据为宽松结构，统一收敛为 any[]，便于模板中安全访问） */
/**
 * 服务产品图标：直接取数据中的 icon 字段（已是 Element Plus 图标组件名）。
 * 兜底为 Grid，避免历史数据缺少该字段时图标为空。
 */
const svcIcon = (item?: { icon?: string }) => item?.icon || 'Grid'
const arrAny = (v: unknown): any[] => (Array.isArray(v) ? v : [])

const catalogItems = computed(() => store.table('catalogItems') as any[])
const categories = computed(() => Array.from(new Set(catalogItems.value.map(i => i.category))))
const workflows = computed(() => store.table('workflows') as any[])
const flowName = (id: string) => workflows.value.find(w => w.id === id)?.name ?? id

/* ==================================================== 指标 -- */
const stats = computed(() => {
  const rows = catalogItems.value
  const mine = rows.filter(i => arrAny(i.allowedRoles).includes(store.role.id)).length
  const demands = store.table('demands') as any[]
  const selfD = demands.filter(d => d.source === 'SELF').length
  const mailD = demands.filter(d => d.source === 'EMAIL').length
  const incidents = store.table('incidents') as any[]
  const selfI = incidents.filter(i => i.source === '客户自助').length
  const mailI = incidents.filter(i => i.source === '邮件').length
  return [
    { label: '服务目录项', value: rows.length, unit: '项', icon: 'Grid', tone: 'primary' as const, delta: `${categories.value.length} 个类别` },
    { label: '当前角色可用', value: mine, unit: '项', icon: 'Key', tone: 'success' as const, delta: `角色：${store.role.name}`, tip: '按当前角色的可申请范围计算' },
    { label: '自助服务提交', value: selfD + selfI, unit: '单', icon: 'User', tone: 'teal' as const, delta: `需求 ${selfD} · 事件 ${selfI}` },
    { label: '邮件提交', value: mailD + mailI, unit: '单', icon: 'Message', tone: 'warning' as const, delta: `需求 ${mailD} · 事件 ${mailI}` },
    { label: '待解析邮件', value: mailsPending(), unit: '封', icon: 'Promotion', tone: 'danger' as const, tip: '服务台邮箱中尚未解析建单的邮件' }
  ]
})

/* ====================================== 9.1 服务目录 / 9.2 服务产品 -- */
/**
 * 两个功能点各用一屏承载：
 *  · 服务目录：以清单形式展示服务内容、可用性、服务时间与服务指标（SLA 时限）
 *  · 服务产品：以图片 + HTML 说明 + 层次目录（类别 → 产品）友好展现，并支持搜索
 */
const tab = ref<'catalog' | 'product'>('catalog')
const f = reactive({ kw: '', category: '', onlyAvailable: false })

const available = (item: any) => arrAny(item.allowedRoles).includes(store.role.id)
/** 可申请角色名（服务目录的「可申请角色」列） */
const roleNames = (ids: unknown) => arrAny(ids).map((id: string) => store.roles.find(r => r.id === id)?.name ?? id)

/** 服务指标：激活流程各节点时限汇总出的端到端 SLA */
function slaOf(flowId: string) {
  const wf = workflows.value.find(w => w.id === flowId)
  const nodes = arrAny(wf?.nodes).filter((n: any) => Number(n.slaHours) > 0)
  const hours = nodes.map((n: any) => Number(n.slaHours || 0))
  const total = hours.reduce((s: number, h: number) => s + h, 0)
  return {
    total,
    count: nodes.length,
    max: hours.length ? Math.max(...hours) : 0,
    detail: nodes.map((n: any) => `${n.name} ${n.slaHours}h`).join(' → ')
  }
}

/** 服务目录行：按类别 / 可用性筛选 */
const catalogRows = computed(() => catalogItems.value.filter(i => {
  if (f.category && i.category !== f.category) return false
  if (f.onlyAvailable && !available(i)) return false
  return true
}))

const filteredCatalog = computed(() => {
  const q = f.kw.trim().toLowerCase()
  return catalogItems.value.filter(i => {
    if (f.category && i.category !== f.category) return false
    if (f.onlyAvailable && !available(i)) return false
    if (q) {
      const hay = `${i.name} ${i.desc} ${i.category} ${arrAny(i.formSchema).map((s: any) => s.label).join(' ')}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
})

/** 服务产品的层次目录：类别 → 服务产品 */
const productGroups = computed(() => {
  const groups: { category: string; items: any[] }[] = []
  for (const item of filteredCatalog.value) {
    const g = groups.find(x => x.category === item.category)
    if (g) g.items.push(item)
    else groups.push({ category: item.category, items: [item] })
  }
  return groups
})

/* ================================= 服务产品详情 / 动态表单 / 建单 -- */
const drawer = ref(false)
const current = ref<any>(null)
const form = reactive<Record<string, any>>({})
const lastResult = ref<{ kind: string; no: string; route: string; text: string } | null>(null)

const currentFlow = computed(() => workflows.value.find(w => w.id === current.value?.flowId) ?? null)

function openItem(item: any) {
  if (!item) return
  if (!available(item)) {
    ElMessage.warning(`当前角色「${store.role.name}」无权申请「${item.name}」`)
    return
  }
  current.value = item
  Object.keys(form).forEach(k => delete form[k])
  arrAny(item.formSchema).forEach((s: any) => { form[s.key] = s.type === 'number' ? 1 : '' })
  drawer.value = true
}

/** search 类型字段的可搜索数据源（目标资源 / 目标服务 / 绑定应用） */
const dictKind = (k: string) => ({ API: 'API 服务', FILE: '文件服务', REALTIME: '实时服务' } as Record<string, string>)[k] ?? k
function searchOptions(key: string, label: string): { value: string; label: string }[] {
  const t = `${key}${label}`
  if (/service|目标服务/.test(t)) return (store.table('services') as any[]).map(s => ({ value: s.name, label: `${s.name}（${dictKind(s.kind)}）` }))
  if (/app|绑定应用/.test(t)) return (store.table('apps') as any[]).map(a => ({ value: a.name, label: `${a.name} · ${a.owner}` }))
  return (store.table('resources') as any[]).map(r => ({ value: r.name, label: `${r.name}（${r.code}）` }))
}

function nextNo(prefix: string, table: string) {
  const n = (store.table(table) as any[]).length + 1
  return prefix + today().replace(/-/g, '') + String(n).padStart(3, '0')
}

/** 事件分类自动分派规则（关键词命中 → 分类） */
function matchIncidentCategory(text: string): any {
  const cats = store.table('incidentCategories') as any[]
  let best = cats[0]
  let bestScore = -1
  for (const c of cats) {
    const score = arrAny(c.keywords).filter((k: string) => text.includes(k)).length
    if (score > bestScore) { best = c; bestScore = score }
  }
  return best
}

/**
 * 按服务类别激活不同处理流程并建单（原文 9.6）
 *  · 数据服务 → 需求单（激活数据需求申请 / 订阅审批流）
 *  · 故障申诉 → 事件单（按分类规则自动分派，激活事件升级与派发规则）
 *  · 权限服务 → 能力申请单（能力开放门户 · 能力申请，页面内已说明该映射关系）
 *
 * 「类别 → 单据类型」的映射取自 core/serviceCatalog.ts（唯一真源），此处只负责各类别的建单细节。
 */
function createTicket(item: any, values: Record<string, any>, origin: 'SELF' | 'EMAIL') {
  const tag = origin === 'EMAIL' ? '邮件' : '自助服务'
  const kind = ticketKindOf(item.category)

  if (kind === '事件单') {
    const text = `${item.name} ${values.desc ?? ''} ${values.problemType ?? ''} ${values.system ?? ''}`
    const cat = matchIncidentCategory(text)
    const sev: string = values.severity === '严重影响业务' ? '严重' : values.severity === '轻微影响' ? '低' : '中'
    const no = nextNo(config.prefixes.incidents, 'incidents')
    const rec = store.insert('incidents', {
      no, title: `【${cat.group}】${values.system || item.name}`, description: values.desc || item.desc,
      source: origin === 'EMAIL' ? '邮件' : '客户自助', categoryId: cat.id, categoryName: cat.name,
      severity: sev, impact: values.severity || '部分功能受影响', urgency: '较急',
      priority: sev === '严重' ? 'P0' : sev === '中' ? 'P2' : 'P3',
      ciIds: [], status: 'DISPATCHED', handler: String(cat.autoAssign).includes('一线') ? '徐鹏' : '陈志刚',
      handlerGroup: cat.autoAssign, slaDueAt: iso(addDays(today(), sev === '严重' ? 0 : 1)), resolvedAt: null, closeType: null,
      relatedIncidentIds: [], problemId: null, changeId: null, broadcastIds: [], knowledgeRefs: [],
      timeline: [
        { at: iso(), actor: store.user.name, action: `通过${tag}提交事件`, comment: `服务产品：${item.name}` },
        { at: iso(), actor: '系统', action: `按分类规则自动分派至 ${cat.autoAssign}` }
      ]
    })
    return { kind: 'incident', no, route: `/incident/detail/${rec.id}`, text: `已生成事件单 ${no}，已自动分派至${cat.autoAssign}` }
  }

  if (kind === '能力申请单') {
    const no = nextNo('NL', 'capabilityApplies')
    const map: Record<string, string> = { 新建账号: '应用能力', 权限调整: '数据服务能力', 密钥补发: '数据库能力', 租户注册: '计算能力' }
    store.insert('capabilityApplies', {
      no, applicant: values.targetUser || store.user.name, email: store.user.email, phone: store.user.phone,
      applyType: map[values.accountType] ?? '应用能力', storage: '500 GB', cpu: '16 核', memory: '64 GB',
      tenantId: '', status: 'PENDING', submittedAt: iso(),
      remark: `${values.accountType || '权限申请'}：${values.reason || ''}`
    })
    store.notify({
      type: 'info', title: `能力/权限申请 ${no} 已提交`,
      body: `${store.user.name} 提交「${values.accountType || '权限申请'}」，等待平台运营中心审核。`,
      toRoles: ['admin', 'desk'], link: '/selfservice'
    })
    return {
      kind: 'capability', no, route: '/selfservice',
      text: `已生成能力申请单 ${no}，提交至平台运营中心审核`
    }
  }

  /* 数据服务 → 需求单 */
  const no = nextNo(config.prefixes.demands, 'demands')
  const rec = store.insert('demands', {
    no, title: `${item.name}（${tag}提交）`,
    applicant: store.user.name, applicantOrg: store.user.org, tenantId: '', appId: null,
    scene: values.scene || values.dataDesc || item.desc,
    kind: item.id === 'sc02' ? 'NEW' : 'EXISTING', resourceType: 'MODEL', deliveryForm: 'API',
    resources: values.resource ? [values.resource] : [], fields: [],
    timeRange: '', updateFreq: '按需', usePeriod: values.usePeriod || '12 个月', callVolume: Number(values.estCalls) || 0,
    desensitize: true, securityLevel: 'L2', priority: 'P2', status: 'PENDING_ACCEPT', currentHandler: '—',
    source: origin === 'EMAIL' ? 'EMAIL' : 'SELF', templateId: null,
    submittedAt: iso(), expectAt: values.expectAt || iso(addDays(today(), 10)),
    relatedIncidentIds: [], relatedProblemIds: [], taskIds: [], changeIds: [], subscriptionIds: [],
    evaluationId: null, approver: null, rejectReason: null,
    timeline: [{ at: iso(), actor: store.user.name, action: `通过${tag}提交需求`, comment: `服务产品：${item.name}` }]
  })
  store.notify({
    type: 'info', title: `需求单 ${no} 待受理`,
    body: `${store.user.name} 通过${tag}提交「${item.name}」，请服务台受理。`,
    toRoles: ['desk'], link: `/demand/detail/${rec.id}`
  })
  return {
    kind: 'demand', no, route: `/demand/detail/${rec.id}`,
    text: `已生成需求单 ${no}，激活流程「${flowName(item.flowId)}」，等待服务台受理`
  }
}

function submitApply() {
  const item = current.value
  if (!item) return
  for (const s of arrAny(item.formSchema)) {
    const v = form[s.key]
    if (s.required && (v === '' || v === null || v === undefined)) {
      ElMessage.warning(`请填写「${s.label}」`)
      return
    }
  }
  const res = createTicket(item, { ...form }, 'SELF')
  lastResult.value = res
  ElMessage.success(res.text)
  drawer.value = false
}

/* ============================================ 9.6 预定义需求类别 -- */
/**
 * 预定义需求类别 = 服务目录项（名称 / 描述 / 动态表单字段 / 激活流程）。
 * 这里集中列出「类别 → 界面字段 → 激活流程 → 生成单据」的映射，
 * 便于在服务台侧直接核对预定义类别（原文 9.6），无需到自助服务目录里逐项点开。
 */
const categoryMapping = computed(() => catalogItems.value.map(i => {
  const flow = workflows.value.find(w => w.id === i.flowId)
  const kind = ticketKindOf(i.category)
  return {
    id: i.id,
    name: i.name,
    category: i.category,
    desc: i.desc,
    fields: arrAny(i.formSchema).map((s: any) => s.label),
    requiredCount: arrAny(i.formSchema).filter((s: any) => s.required).length,
    flowName: flow?.name ?? i.flowId,
    flowSteps: arrAny(flow?.nodes).map((n: any) => n.name),
    kind,
    roles: arrAny(i.allowedRoles).map((r: string) => store.roles.find(x => x.id === r)?.name ?? r)
  }
}))
/** 按类别（数据服务 / 故障申诉 / 权限服务）分组统计 */
const categoryGroups = computed(() => {
  const out: { group: string; items: typeof categoryMapping.value }[] = []
  for (const it of categoryMapping.value) {
    const hit = out.find(g => g.group === it.category)
    if (hit) hit.items.push(it)
    else out.push({ group: it.category, items: [it] })
  }
  return out
})

/* ================================================ 9.5 邮件提交需求 -- */
type Mail = { id: string; from: string; subject: string; body: string; at: string; parsed: boolean }
const mails = ref<Mail[]>([
  {
    id: 'ml01', from: 'wuq@yjj.sanyi-data.cn（市药品监督管理局 吴强）',
    subject: '【服务申请】申请开通药品不良反应监测数据接口',
    body: '服务台您好：\n我局药品流通追溯分析应用需要接入药品不良反应监测数据，用于不良反应聚集性信号分析。\n期望交付方式：接口；使用期限：12 个月；使用范围限本局应用。\n请协助开通，谢谢。',
    at: nowIsoOffset(0, -2), parsed: false
  },
  {
    id: 'ml02', from: 'zhengx@cdc.sanyi-data.cn（市疾控中心 郑晓）',
    subject: '【故障报修】传染病报告实时推送服务连接中断',
    body: '今日 07:30 起，传染病监测预警应用无法接收到实时推送数据，客户端提示连接超时。\n影响：传染病监测预警页面数据不更新。\n请尽快排查，谢谢。',
    at: nowIsoOffset(0, -1), parsed: false
  },
  {
    id: 'ml03', from: 'mach@hospital.sanyi-data.cn（北京大学第三医院 马超）',
    subject: '【服务申请】申请开通数据沙箱账号与权限',
    body: '我院科研课题需在数据沙箱内使用脱敏后的门急诊数据开展研究，申请新建账号并开通数据沙箱权限。\n申请人：马超；所属单位：北京大学第三医院。\n请协助办理。',
    at: nowIsoOffset(0, 0), parsed: false
  }
])
const activeMail = ref<Mail>(mails.value[0])
function mailsPending() { return mails.value.filter(m => !m.parsed).length }

/** 邮件 → 预定义需求类别的解析规则（关键词打分） */
const MAIL_RULES: { id: string; kw: string[] }[] = [
  { id: 'sc05', kw: ['故障', '报修', '中断', '无法', '超时', '打不开', '白屏', '崩溃', '异常'] },
  { id: 'sc04', kw: ['数据质量', '口径', '缺失', '不一致', '未更新', '延迟'] },
  { id: 'sc06', kw: ['权限', '账号', '密钥', '租户', '沙箱'] },
  { id: 'sc02', kw: ['新增', '采集', '建模'] },
  { id: 'sc03', kw: ['订阅'] },
  { id: 'sc01', kw: ['申请', '接口', '数据', '共享', '调取'] }
]

function parseCategory(text: string): any {
  let bestId = 'sc01'
  let bestScore = -1
  for (const rule of MAIL_RULES) {
    const score = rule.kw.filter(k => text.includes(k)).length
    if (score > bestScore) { bestScore = score; bestId = rule.id }
  }
  return catalogItems.value.find(i => i.id === bestId) ?? catalogItems.value[0]
}

function parseMail(mail: Mail) {
  if (mail.parsed) { ElMessage.info('该邮件已解析建单'); return }
  if (!catalogItems.value.length) { ElMessage.warning('尚未配置预定义需求类别，请先到「服务台管理 → 预定义需求类别」完成配置'); return }
  const item = parseCategory(`${mail.subject} ${mail.body}`)
  const values: Record<string, any> = {
    scene: truncate(mail.body, 120),
    dataDesc: truncate(mail.body, 120),
    desc: truncate(mail.body, 200),
    system: mail.subject.replace(/^【[^】]*】/, ''),
    problemType: '数据缺失',
    accountType: '新建账号',
    targetUser: mail.from.split('@')[0],
    reason: truncate(mail.body, 80),
    resource: '',
    usePeriod: '12 个月'
  }
  const res = createTicket(item, values, 'EMAIL')
  mail.parsed = true
  lastResult.value = res
  ElMessage.success(`邮件已解析为工单：匹配预定义类别「${item.name}」，已生成 ${res.text}`)
}
</script>

<template>
  <div>
    <PageHead
      title="自助服务管理"
      desc="面向最终用户的服务门户：服务目录、服务产品，支持 Web 与邮件提交需求。"
    >
      <template #actions>
        <el-button @click="router.push('/service-desk')">前往服务台</el-button>
        <el-button type="primary" :disabled="!catalogItems.length" @click="openItem(catalogItems[0])"><el-icon><Plus /></el-icon> Web 提交需求</el-button>
      </template>
    </PageHead>

    <StatCards :items="stats" />

    <el-alert
      v-if="lastResult"
      class="mb-4"
      type="success"
      show-icon
      @close="lastResult = null"
    >
      <template #title>
        <span>{{ lastResult.text }}</span>
        <el-button link type="primary" style="margin-left: 12px" @click="router.push(lastResult.route)">查看单据 {{ lastResult.no }} <el-icon><ArrowRight /></el-icon></el-button>
      </template>
    </el-alert>

    <!-- ============================ 服务目录（服务指标）/ 服务产品（图文） -- -->
    <div class="card">
      <div class="card__body" style="padding-bottom: 0">
        <el-tabs v-model="tab">
          <!-- ------------------------------ 服务目录：内容 / 可用性 / 时间 ------------------------------ -->
          <el-tab-pane label="服务目录" name="catalog">
            <div class="flex items-center justify-between wrap gap-2 mb-3">
              <div class="flex items-center gap-2 wrap">
                <el-select v-model="f.category" placeholder="全部类别" clearable size="small" style="width: 150px">
                  <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
                </el-select>
                <el-checkbox v-model="f.onlyAvailable" size="small">仅看我可用</el-checkbox>
              </div>
              <span class="text-xs muted">共 {{ catalogRows.length }} / {{ catalogItems.length }} 项服务 · 当前角色：{{ store.role.name }}</span>
            </div>
            <el-table :data="catalogRows" style="width: 100%" row-key="id" size="small">
              <el-table-column label="服务名称" min-width="190">
                <template #default="{ row }">
                  <div class="flex items-center gap-2">
                    <el-icon><component :is="svcIcon(row)" /></el-icon>
                    <span class="bold">{{ row.name }}</span>
                  </div>
                  <div class="cell-sub">{{ flowName(row.flowId) }}</div>
                </template>
              </el-table-column>
              <el-table-column label="服务内容" min-width="240">
                <template #default="{ row }">
                  <el-tooltip :content="row.desc" placement="top">
                    <div>{{ row.desc }}</div>
                  </el-tooltip>
                  <div class="cell-sub">{{ arrAny(row.formSchema).length }} 个申请字段</div>
                </template>
              </el-table-column>
              <el-table-column label="类别" width="100">
                <template #default="{ row }"><StatusTag :label="row.category" tone="info" :dot="false" /></template>
              </el-table-column>
              <el-table-column label="可用性" width="92">
                <template #default="{ row }"><span class="mono">{{ row.availability }}</span></template>
              </el-table-column>
              <el-table-column prop="serviceTime" label="服务时间" width="152" />
              <el-table-column label="服务指标（SLA 时限）" min-width="200">
                <template #default="{ row }">
                  <div>端到端 <b class="mono">{{ slaOf(row.flowId).total }}</b> 小时</div>
                  <el-tooltip :content="slaOf(row.flowId).detail" placement="top">
                    <div class="cell-sub">{{ slaOf(row.flowId).count }} 个环节 · 单环节最长 {{ slaOf(row.flowId).max }}h</div>
                  </el-tooltip>
                </template>
              </el-table-column>
              <el-table-column label="可申请角色" min-width="150">
                <template #default="{ row }">
                  <el-tooltip :content="roleNames(row.allowedRoles).join('、')" placement="top">
                    <div class="text-xs muted">{{ roleNames(row.allowedRoles).length }} 类角色可申请</div>
                  </el-tooltip>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="100" fixed="right">
                <template #default="{ row }">
                  <el-button size="small" type="primary" :disabled="!available(row)" @click="openItem(row)">立即申请</el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>

          <!-- --------------------- 服务产品：图片 / HTML / 层次目录 + 搜索 --------------------- -->
          <el-tab-pane label="服务产品" name="product">
            <div class="flex items-center justify-between wrap gap-2 mb-3">
              <div class="flex items-center gap-2 wrap">
                <el-input v-model="f.kw" placeholder="搜索服务产品（名称 / 描述 / 类别）" clearable style="width: 260px" size="small">
                  <template #prefix><el-icon><Search /></el-icon></template>
                </el-input>
                <el-select v-model="f.category" placeholder="全部类别" clearable size="small" style="width: 150px">
                  <el-option v-for="c in categories" :key="c" :label="c" :value="c" />
                </el-select>
                <el-checkbox v-model="f.onlyAvailable" size="small">仅看我可用</el-checkbox>
              </div>
              <span class="text-xs muted">共 {{ filteredCatalog.length }} / {{ catalogItems.length }} 项 · 当前角色：{{ store.role.name }}</span>
            </div>
            <template v-if="productGroups.length">
              <div v-for="g in productGroups" :key="g.category" class="svc-group">
                <div class="svc-group__head">
                  <span class="svc-group__title">{{ g.category }}</span>
                  <span class="text-xs muted">{{ g.items.length }} 项服务产品</span>
                </div>
                <div class="svc-grid">
                  <div
                    v-for="item in g.items"
                    :key="item.id"
                    class="svc-card"
                    :class="{ 'svc-card--off': !available(item) }"
                    @click="openItem(item)"
                  >
                    <div class="svc-card__banner" :class="item.banner ? `svc-card__banner--${item.banner}` : ''">
                      <el-icon :size="22"><component :is="svcIcon(item)" /></el-icon>
                    </div>
                    <div class="svc-card__body">
                      <div class="flex items-center justify-between gap-2">
                        <span class="svc-card__title">{{ item.name }}</span>
                        <StatusTag :label="item.category" tone="info" :dot="false" />
                      </div>
                      <div class="svc-card__desc">{{ item.desc }}</div>
                      <div class="svc-card__meta">
                        <span>可用性 <b class="mono">{{ item.availability }}</b></span>
                        <span>服务时间 <b>{{ item.serviceTime }}</b></span>
                      </div>
                      <div class="svc-card__meta">
                        <span>流程 <b>{{ flowName(item.flowId) }}</b></span>
                      </div>
                      <div v-if="!available(item)" class="lock-tip"><el-icon><Lock /></el-icon> 当前角色无权申请</div>
                    </div>
                    <div class="svc-card__foot">
                      <el-button size="small" type="primary" :disabled="!available(item)" @click.stop="openItem(item)">立即申请</el-button>
                      <span class="text-xs muted">{{ arrAny(item.formSchema).length }} 个字段 · {{ arrAny(item.allowedRoles).length }} 类角色可用</span>
                    </div>
                  </div>
                </div>
              </div>
            </template>
            <div v-else class="empty-box">
              <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
              <div class="empty-box__text">没有符合条件的服务产品，请调整搜索条件</div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>

    <!-- ====================================== 预定义需求类别（9.6） -- -->
    <div class="card">
      <div class="card__head">
        <div class="card__title">预定义需求类别</div>
        <div class="card__sub">提供预定义故障和服务申请的类别、描述；按所选服务类型展现不同界面、要求输入相关信息、激活不同处理流程</div>
        <div class="card__spacer" />
        <StatusTag :label="`${categoryGroups.length} 个类别组`" tone="info" :dot="false" />
      </div>
      <div class="card__body">
        <div class="text-xs muted mb-3">
          类别、界面字段与激活流程一览
        </div>
        <el-table :data="categoryMapping" style="width: 100%" row-key="id" size="small">
          <el-table-column label="类别" width="96">
            <template #default="{ row }"><StatusTag :label="row.category" tone="primary" :dot="false" /></template>
          </el-table-column>
          <el-table-column label="预定义需求类别" min-width="180">
            <template #default="{ row }">
              <div class="bold">{{ row.name }}</div>
              <div class="cell-sub">{{ row.desc }}</div>
            </template>
          </el-table-column>
          <el-table-column label="界面字段（必填）" min-width="220">
            <template #default="{ row }">
              <div class="text-sm">{{ row.fields.join(' / ') }}</div>
              <div class="cell-sub">共 {{ row.fields.length }} 个字段 · {{ row.requiredCount }} 个必填</div>
            </template>
          </el-table-column>
          <el-table-column label="激活流程" min-width="200">
            <template #default="{ row }">
              <div class="text-sm">{{ row.flowName }}</div>
              <div class="cell-sub">{{ row.flowSteps.join(' → ') }}</div>
            </template>
          </el-table-column>
          <el-table-column label="生成单据" width="100">
            <template #default="{ row }"><StatusTag :label="row.kind" tone="teal" :dot="false" /></template>
          </el-table-column>
          <el-table-column label="可申请角色" min-width="180">
            <template #default="{ row }"><span class="text-xs muted">{{ row.roles.join('、') }}</span></template>
          </el-table-column>
          <el-table-column label="操作" width="96" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" @click="openItem(catalogItems.find(i => i.id === row.id))">去申请</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <!-- ============================================ 电子邮件提交需求 -- -->
    <div class="card">
      <div class="card__head">
        <div class="card__title">电子邮件提交需求（服务台邮箱）</div>
        <div class="card__sub">支持用户通过电子邮件方式提交服务申请，点击「解析并建单」可将邮件转为对应工单</div>
        <div class="card__spacer" />
        <StatusTag :label="`待解析 ${mailsPending()} 封`" :tone="mailsPending() ? 'warning' : 'success'" />
      </div>
      <div class="card__body">
        <div class="grid grid--side-l">
          <div>
            <div class="mail-panel__title"><el-icon><Promotion /></el-icon> 服务台邮箱（service-desk@sanyi-data.cn）</div>
            <div
              v-for="m in mails"
              :key="m.id"
              class="mail-item"
              :class="{ 'mail-item--active': activeMail?.id === m.id }"
              @click="activeMail = m"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="bold text-sm">{{ m.from }}</span>
                <el-tag v-if="m.parsed" size="small" type="success" effect="plain">已建单</el-tag>
              </div>
              <div class="mail-item__subject">{{ m.subject }}</div>
              <div class="text-xs muted">{{ m.at }}</div>
            </div>
          </div>
          <div v-if="activeMail" class="mail-preview">
            <div class="flex items-center justify-between gap-2 wrap">
              <div>
                <div class="bold">{{ activeMail.subject }}</div>
                <div class="text-xs muted mt-1">发件人：{{ activeMail.from }} · 收件时间：{{ activeMail.at }}</div>
              </div>
              <el-button type="primary" size="small" :disabled="activeMail.parsed" @click="parseMail(activeMail)">
                {{ activeMail.parsed ? '已解析建单' : '解析并建单' }}
              </el-button>
            </div>
            <div class="tl__quote mt-3" style="white-space: pre-wrap">{{ activeMail.body }}</div>
          </div>
          <div v-else class="empty-box">
            <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
            <div class="empty-box__text">请选择左侧邮件查看详情</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ============================ 服务产品详情 + Web 提交（抽屉） -- -->
    <el-drawer v-model="drawer" :title="current ? `服务产品：${current.name}` : '服务产品'" size="660px">
      <div v-if="current" class="drawer-body">
        <div class="prod-head">
          <div class="prod-head__icon"><el-icon :size="20"><component :is="svcIcon(current)" /></el-icon></div>
          <div>
            <div class="bold">{{ current.name }}</div>
            <div class="text-sm muted mt-1">{{ current.desc }}</div>
            <div class="svc-card__meta mt-2">
              <span>类别 <b>{{ current.category }}</b></span>
              <span>可用性 <b class="mono">{{ current.availability }}</b></span>
              <span>服务时间 <b>{{ current.serviceTime }}</b></span>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card__head">
            <div class="card__title">服务说明</div>
            <div class="card__sub">服务范围、办理时限与注意事项</div>
          </div>
          <div class="card__body">
            <div class="richtext" v-html="current.introHtml || `<p>${current.desc}</p>`" />
          </div>
        </div>

        <div class="card">
          <div class="card__head">
            <div class="card__title">激活的处理流程</div>
            <div class="card__sub">{{ currentFlow?.name }} · {{ currentFlow?.version }} · 业务类型：{{ currentFlow?.bizType }}</div>
          </div>
          <div class="card__body">
            <div class="flow">
              <div v-for="(n, i) in arrAny(currentFlow?.nodes)" :key="n.key" class="flow__step" :class="{ 'flow__step--active': i === 0 }">
                <div class="flow__dot">{{ i + 1 }}</div>
                <div class="flow__label">{{ n.name }}</div>
                <div class="flow__time">{{ n.role }} · SLA {{ n.slaHours }}h</div>
                <div class="flow__time">{{ arrAny(n.actions).join(' / ') }}</div>
              </div>
            </div>
            <div v-if="arrAny(currentFlow?.rules).length" class="text-xs muted mt-2">
              审批规则：{{ arrAny(currentFlow?.rules).map((r: any) => `L${r.level} ${arrAny(r.approvers).join('、')}（${r.mode}，${r.condition}）`).join('；') }}
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card__head">
            <div class="card__title">填写申请信息</div>
            <div class="card__sub">按该服务产品预定义的需求类别渲染表单</div>
          </div>
          <div class="card__body">
            <el-form label-width="132px">
              <el-form-item v-for="s in arrAny(current.formSchema)" :key="s.key" :label="s.label" :required="s.required">
                <el-input v-if="s.type === 'text'" v-model="form[s.key]" :placeholder="`请输入${s.label}`" />
                <el-input v-else-if="s.type === 'textarea'" v-model="form[s.key]" type="textarea" :rows="4" :placeholder="`请输入${s.label}`" />
                <el-select v-else-if="s.type === 'select'" v-model="form[s.key]" :placeholder="`请选择${s.label}`" style="width: 100%">
                  <el-option v-for="o in arrAny(s.options)" :key="o" :label="o" :value="o" />
                </el-select>
                <el-select v-else-if="s.type === 'search'" v-model="form[s.key]" filterable clearable :placeholder="`搜索并选择${s.label}`" style="width: 100%">
                  <el-option v-for="o in searchOptions(s.key, s.label)" :key="o.value" :label="o.label" :value="o.value" />
                </el-select>
                <el-input-number v-else-if="s.type === 'number'" v-model="form[s.key]" :min="0" :step="1000" style="width: 220px" />
                <el-date-picker
                  v-else-if="s.type === 'date'"
                  v-model="form[s.key]"
                  type="date"
                  value-format="YYYY-MM-DD"
                  placeholder="选择日期"
                  style="width: 220px"
                />
                <el-input v-else v-model="form[s.key]" :placeholder="`请输入${s.label}`" />
              </el-form-item>
            </el-form>
            <div class="text-xs muted">
              提交后按服务类别激活不同流程：<b>数据服务</b>生成需求单（来源「客户自助」/「电子邮件」）；
              <b>故障申诉</b>生成事件单（来源「客户自助」/「邮件」，并按分类规则自动分派）；
              <b>权限服务</b>生成能力申请单，提交平台运营中心审核。
            </div>
          </div>
          <div class="card__foot">
            <el-button @click="drawer = false">取消</el-button>
            <el-button type="primary" @click="submitApply">提交申请</el-button>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.svc-card { cursor: pointer; }
.svc-card--off { opacity: .62; filter: grayscale(.55); cursor: not-allowed; }
.svc-card--off:hover { transform: none; box-shadow: none; }
/* 服务产品的层次目录：类别分组标题 */
.svc-group + .svc-group { margin-top: var(--sp-5); }
.svc-group__head {
  display: flex; align-items: center; gap: var(--sp-2);
  padding-bottom: var(--sp-2); margin-bottom: var(--sp-3);
  border-bottom: 1px solid var(--border-2);
}
.svc-group__title { font-size: var(--fs-lg); font-weight: 600; }
/* 表格单元格副标题（与其余列表页保持一致的观感） */
.cell-sub { font-size: var(--fs-xs); color: var(--text-3); margin-top: 2px; }
/* 服务说明（HTML 富文本） */
.richtext { font-size: var(--fs-md); line-height: 1.8; color: var(--text); }
.richtext :deep(h3) { font-size: var(--fs-md); font-weight: 600; margin: var(--sp-3) 0 var(--sp-1); }
.richtext :deep(p) { margin: var(--sp-2) 0; }
.richtext :deep(ul), .richtext :deep(ol) { padding-left: 22px; margin: var(--sp-2) 0; }
.richtext :deep(li) { margin: 2px 0; }
.richtext :deep(img) { max-width: 100%; border-radius: var(--r-sm); }
.lock-tip {
  margin-top: 6px; font-size: var(--fs-xs); color: var(--danger-fg);
  background: var(--danger-bg); border-radius: var(--r-sm); padding: 3px 8px; display: inline-block;
}
.mail-panel__title { font-weight: 600; margin-bottom: var(--sp-2); }
.mail-item {
  border: 1px solid var(--border-2); border-radius: var(--r-md); padding: var(--sp-3);
  margin-bottom: var(--sp-2); cursor: pointer; background: var(--surface);
  transition: border-color var(--t-fast), background var(--t-fast);
}
.mail-item:hover { border-color: var(--brand-400); background: var(--brand-50); }
.mail-item--active { border-color: var(--brand-600); background: var(--brand-50); }
.mail-item__subject { font-size: var(--fs-sm); margin: 4px 0 2px; }
.mail-preview { border: 1px solid var(--border-2); border-radius: var(--r-md); padding: var(--sp-4); background: var(--surface); }
.drawer-body { padding-bottom: var(--sp-6); }
.prod-head { display: flex; gap: var(--sp-4); align-items: flex-start; margin-bottom: var(--sp-4); }
.prod-head__icon {
  width: 52px; height: 52px; flex: none; border-radius: var(--r-md);
  background: var(--brand-50); color: var(--brand-600);
  display: grid; place-items: center; font-size: 24px;
}
</style>
