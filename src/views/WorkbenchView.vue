<script setup lang="ts">
/**
 * WorkbenchView —— 运营看板
 *
 * 汇总需求受理与交付、生产任务与运维事件的关键指标。
 * 指标口径、待办范围与图表视角随当前账号角色自动适配：
 *   · 服务台受理员 —— 需求受理、事件闭环与服务量
 *   · 供数方       —— 需求审批、订阅授权与评价反馈
 *   · 运维工程师   —— 事件处理、问题推进与发布验证
 *   · 生产实施方   —— 任务承接、实施进度与交付产物
 *   · 用数方       —— 本人申请进度、验收与评价
 *   · 平台管理员   —— 全量指标概览
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useDemoStore } from '@/stores/demo'
import { config } from '@/core/config'
import { by, countBy, fmtShort } from '@/core/utils'
import PageHead from '@/components/PageHead.vue'
import StatCards from '@/components/StatCards.vue'
import type { StatItem } from '@/components/StatCards.vue'
import ChartBox from '@/components/ChartBox.vue'
import StatusTag from '@/components/StatusTag.vue'

const store = useDemoStore()
const router = useRouter()
const facts = config.facts

/* ---------------------------------------------------------- 时间基准 -- */
/** 与种子数据保持一致的基准时间，保证近 14 天趋势可复现 */
const BASE = new Date('2026-01-27T10:30:00').getTime()
const DAY = 86400000
const toTs = (v: unknown): number => (v ? new Date(String(v).replace(' ', 'T')).getTime() : NaN)

/* ------------------------------------------------------- 角色看板配置 -- */
type TrendSource = 'demand' | 'incident' | 'task'
type RankSource = 'applicant' | 'incidentSource' | 'taskDept' | 'none'

interface BoardAction { text: string; route: string; icon: string; perm: string; type?: 'primary' | 'default' }

interface RoleBoard {
  /** 角色定位标签 */
  tag: string
  /** 业务口径说明 */
  summary: string
  /** 指标卡取用顺序 */
  stats: string[]
  /** 趋势图 */
  trendTitle: string
  trendNote: string
  trendTag: string
  trendSource: TrendSource
  /** 待办区标题；为 null 时该位置改展示审计动态 */
  todosTitle: string | null
  /** 状态分布图 */
  distTitle: string
  distSource: TrendSource
  distCenter: string
  /** 数据范围：mine = 仅本账号 / 本组织申请，all = 全量 */
  scope: 'mine' | 'all'
  /** 排行图 */
  rankTitle: string
  rankSource: RankSource
  actions: BoardAction[]
}

const BOARDS: Record<string, RoleBoard> = {
  desk: {
    tag: '服务台受理',
    summary: '汇总需求受理与交付、事件闭环与服务量的关键指标，突出待受理需求与未闭环事件，支撑统一受理与分派监督。',
    stats: ['pendingAccept', 'openIncident', 'escalatedIncident', 'incidentTotal', 'delivered', 'demandTotal'],
    trendTitle: '需求提交与交付趋势',
    trendNote: '近 14 天 · 服务台受理口径',
    trendTag: '来源：需求单流转记录',
    trendSource: 'demand',
    todosTitle: '我的待办 · 服务台受理',
    distTitle: '需求状态分布',
    distSource: 'demand',
    distCenter: '需求单',
    scope: 'all',
    rankTitle: '申请方排行',
    rankSource: 'applicant',
    actions: [
      { text: '服务台受理', route: '/service-desk', icon: 'Headset', perm: 'desk.manage', type: 'primary' },
      { text: '事件管理', route: '/incident/list', icon: 'Warning', perm: 'incident.view' },
      { text: '需求单管理', route: '/demand/list', icon: 'Tickets', perm: 'demand.view.all' }
    ]
  },
  supplier: {
    tag: '供数方审批',
    summary: '汇总需求审批、订阅授权与评价反馈的关键指标，突出待审批事项与已交付需求，支撑资源归属方审批决策。',
    stats: ['pendingApprove', 'pendingSubscription', 'pendingEvaluation', 'implementing', 'delivered', 'resourceCatalog'],
    trendTitle: '需求提交与交付趋势',
    trendNote: '近 14 天 · 资源归属方审批口径',
    trendTag: '来源：需求单流转记录',
    trendSource: 'demand',
    todosTitle: '我的待办 · 供数审批',
    distTitle: '需求状态分布',
    distSource: 'demand',
    distCenter: '需求单',
    scope: 'all',
    rankTitle: '申请方排行',
    rankSource: 'applicant',
    actions: [
      { text: '需求单管理', route: '/demand/list', icon: 'DocumentChecked', perm: 'demand.view.all', type: 'primary' },
      { text: '交付与授权', route: '/delivery', icon: 'Share', perm: 'delivery.view' },
      { text: '评价管理', route: '/evaluation', icon: 'Star', perm: 'eval.view' }
    ]
  },
  ops: {
    tag: '运维处理',
    summary: '汇总事件处理、问题推进与发布验证的关键指标，突出未闭环事件与待处置事项，支撑一线与二线协同。',
    stats: ['openIncident', 'escalatedIncident', 'openProblem', 'pendingRelease', 'pendingKnowledge', 'incidentTotal'],
    trendTitle: '事件新建与解决趋势',
    trendNote: '近 14 天 · 运维处置口径',
    trendTag: '来源：事件单处理记录',
    trendSource: 'incident',
    todosTitle: '我的待办 · 运维处理',
    distTitle: '事件状态分布',
    distSource: 'incident',
    distCenter: '事件单',
    scope: 'all',
    rankTitle: '事件来源分布',
    rankSource: 'incidentSource',
    actions: [
      { text: '事件管理', route: '/incident/list', icon: 'Warning', perm: 'incident.view', type: 'primary' },
      { text: '问题管理', route: '/problem/list', icon: 'QuestionFilled', perm: 'problem.manage' },
      { text: '发布管理', route: '/release/list', icon: 'Promotion', perm: 'release.manage' }
    ]
  },
  producer: {
    tag: '生产实施',
    summary: '汇总生产任务承接、实施进度与交付产物的关键指标，突出实施中任务与待接单任务，支撑加工与建模排产。',
    stats: ['doingTask', 'pendingAcceptTask', 'pendingVerifyTask', 'doneTask', 'deployArtifact', 'taskTotal'],
    trendTitle: '任务派发与完成趋势',
    trendNote: '近 14 天 · 生产实施口径',
    trendTag: '来源：任务单实施记录',
    trendSource: 'task',
    todosTitle: '我的待办 · 生产实施',
    distTitle: '任务状态分布',
    distSource: 'task',
    distCenter: '任务单',
    scope: 'all',
    rankTitle: '生产部门任务量',
    rankSource: 'taskDept',
    actions: [
      { text: '任务管理', route: '/task/list', icon: 'Operation', perm: 'task.view', type: 'primary' },
      { text: '需求单管理', route: '/demand/list', icon: 'Tickets', perm: 'demand.view.all' },
      { text: '工作流管理', route: '/workflow', icon: 'SetUp', perm: 'flow.view' }
    ]
  },
  consumer: {
    tag: '用数申请',
    summary: '汇总本账号提交需求的受理与交付进度，突出在途申请、待验收与待评价事项，方便随时掌握数据到手情况。',
    stats: ['mineInflight', 'mineAcceptance', 'mineDelivered', 'mineEvaluate', 'mineTotal', 'resourceCatalog'],
    trendTitle: '我的需求流转趋势',
    trendNote: '近 14 天 · 本账号申请口径',
    trendTag: '来源：我的需求单',
    trendSource: 'demand',
    todosTitle: '我的待办 · 用数申请',
    distTitle: '我的需求状态分布',
    distSource: 'demand',
    distCenter: '我的申请',
    scope: 'mine',
    rankTitle: '同类申请单位排行',
    rankSource: 'applicant',
    actions: [
      { text: '提交数据需求', route: '/demand/apply', icon: 'EditPen', perm: 'demand.apply', type: 'primary' },
      { text: '自助服务', route: '/selfservice', icon: 'Grid', perm: 'selfservice.view' },
      { text: '统计分析', route: '/stats', icon: 'TrendCharts', perm: 'stat.view' }
    ]
  },
  admin: {
    tag: '全量概览',
    summary: '汇总需求、任务、事件、问题、发布与订阅授权的全量指标，用于平台整体运营概览与跨模块态势掌握。',
    stats: ['demandTotal', 'taskTotal', 'incidentTotal', 'problemTotal', 'releaseTotal', 'subscriptionTotal'],
    trendTitle: '需求提交与交付趋势',
    trendNote: '近 14 天 · 全量数据',
    trendTag: '来源：需求单流转记录',
    trendSource: 'demand',
    todosTitle: null,
    distTitle: '需求状态分布',
    distSource: 'demand',
    distCenter: '需求单',
    scope: 'all',
    rankTitle: '申请方排行',
    rankSource: 'applicant',
    actions: [
      { text: '系统配置', route: '/admin', icon: 'Setting', perm: 'admin.all', type: 'primary' },
      { text: '审计中心', route: '/audit', icon: 'DocumentChecked', perm: 'audit.view' },
      { text: '需求单管理', route: '/demand/list', icon: 'Tickets', perm: 'demand.view.all' }
    ]
  }
}

const board = computed<RoleBoard>(() => BOARDS[store.role.id] ?? BOARDS.admin)
const actions = computed(() => board.value.actions.filter(a => store.can(a.perm)))

/* ------------------------------------------------------------ 指标口径 -- */
const metrics = computed(() => {
  const demands = store.table('demands') as any[]
  const tasks = store.table('tasks') as any[]
  const incidents = store.table('incidents') as any[]
  const problems = store.table('problems') as any[]
  const releases = store.table('releases') as any[]
  const subscriptions = store.table('subscriptions') as any[]
  const evaluations = store.table('evaluations') as any[]
  const knowledges = store.table('knowledges') as any[]
  const services = store.table('services') as any[]
  const audits = store.table('audits') as any[]

  const INFLIGHT = ['PENDING_ACCEPT', 'PENDING_APPROVE', 'APPROVED', 'IMPLEMENTING', 'PENDING_ACCEPTANCE', 'CHANGING']
  const org = store.user.org
  const who = store.user.name
  const mine = demands.filter(d => d.applicantOrg === org || d.applicant === who)

  return {
    demands, tasks, incidents, problems, mine,
    demandTotal: demands.length,
    pendingAccept: demands.filter(d => d.status === 'PENDING_ACCEPT').length,
    pendingApprove: demands.filter(d => d.status === 'PENDING_APPROVE').length,
    inflight: demands.filter(d => INFLIGHT.includes(d.status)).length,
    implementing: demands.filter(d => ['APPROVED', 'IMPLEMENTING', 'CHANGING'].includes(d.status)).length,
    delivered: demands.filter(d => ['DELIVERED', 'EVALUATED'].includes(d.status)).length,

    taskTotal: tasks.length,
    doingTask: tasks.filter(t => t.status === 'DOING').length,
    pendingAcceptTask: tasks.filter(t => ['PENDING_ACCEPT', 'PENDING_DISPATCH'].includes(t.status)).length,
    pendingVerifyTask: tasks.filter(t => t.status === 'PENDING_VERIFY').length,
    doneTask: tasks.filter(t => t.status === 'DONE').length,
    serviceTotal: services.length,

    incidentTotal: incidents.length,
    openIncident: incidents.filter(i => !['RESOLVED', 'CLOSED'].includes(i.status)).length,
    escalatedIncident: incidents.filter(i => i.status === 'ESCALATED').length,
    problemTotal: problems.length,
    openProblem: problems.filter(p => !['RESOLVED', 'CLOSED'].includes(p.status)).length,
    releaseTotal: releases.length,
    pendingRelease: releases.filter(r => ['APPLYING', 'APPROVED', 'VERIFYING'].includes(r.status)).length,
    pendingKnowledge: knowledges.filter(k => k.status === 'PENDING_REVIEW').length,
    subscriptionTotal: subscriptions.length,
    pendingSubscription: subscriptions.filter(s => s.approveStatus === 'PENDING').length,
    activeSubscription: subscriptions.filter(s => s.approveStatus === 'APPROVED').length,
    pendingEvaluation: evaluations.filter(e => e.status === 'PENDING_APPROVE').length,
    auditTotal: audits.length,

    mineTotal: mine.length,
    mineInflight: mine.filter(d => INFLIGHT.includes(d.status)).length,
    mineAcceptance: mine.filter(d => d.status === 'PENDING_ACCEPTANCE').length,
    mineDelivered: mine.filter(d => ['DELIVERED', 'EVALUATED'].includes(d.status)).length,
    mineEvaluate: mine.filter(d => ['DELIVERED', 'APPROVED'].includes(d.status)).length
  }
})

/* ------------------------------------------------------------ 指标卡池 -- */
const pool = computed<Record<string, StatItem>>(() => {
  const m = metrics.value
  return {
    resourceCatalog: {
      label: '目录链数据资源', value: facts.catalogTables, unit: '张表', icon: 'Files', tone: 'primary',
      delta: `${facts.catalogFields.toLocaleString()} 个字段`, tip: '市大数据平台已上目录链内容，均可作为需求申请对象'
    },
    demandTotal: {
      label: '需求单总数', value: m.demandTotal, unit: '单', icon: 'Tickets', tone: 'primary',
      delta: `在途 ${m.inflight} 单`
    },
    pendingAccept: {
      label: '待受理需求', value: m.pendingAccept, unit: '单', icon: 'Clock', tone: 'warning',
      delta: `需求单累计 ${m.demandTotal} 单`, tip: '已提交、等待服务台受理的需求单'
    },
    pendingApprove: {
      label: '待审批需求', value: m.pendingApprove, unit: '单', icon: 'DocumentChecked', tone: 'warning',
      delta: `在途 ${m.inflight} 单`, tip: '已受理、等待资源归属方审批的需求单'
    },
    implementing: {
      label: '实施中需求', value: m.implementing, unit: '单', icon: 'SetUp', tone: 'info',
      delta: `已交付 ${m.delivered} 单`
    },
    delivered: {
      label: '已交付需求', value: m.delivered, unit: '单', icon: 'Box', tone: 'success',
      delta: '进入验收与评价环节'
    },
    pendingSubscription: {
      label: '待审批订阅', value: m.pendingSubscription, unit: '单', icon: 'Key', tone: 'warning',
      delta: `生效订阅 ${m.activeSubscription} 单`, tip: '资源订阅与渠道授权申请，审批后发放密钥'
    },
    pendingEvaluation: {
      label: '待审批评价', value: m.pendingEvaluation, unit: '条', icon: 'Star', tone: 'teal',
      delta: '用数方评价与供数方反馈'
    },
    mineTotal: {
      label: '我的申请总数', value: m.mineTotal, unit: '单', icon: 'Tickets', tone: 'primary',
      delta: `在途 ${m.mineInflight} 单`
    },
    mineInflight: {
      label: '我的在途申请', value: m.mineInflight, unit: '单', icon: 'EditPen', tone: 'primary',
      delta: `累计申请 ${m.mineTotal} 单`, tip: '处于受理、审批、实施、验收环节的申请'
    },
    mineAcceptance: {
      label: '待我验收', value: m.mineAcceptance, unit: '单', icon: 'CircleCheck', tone: 'warning',
      delta: '交付后需确认交付物'
    },
    mineDelivered: {
      label: '已交付给我', value: m.mineDelivered, unit: '单', icon: 'Box', tone: 'success',
      delta: '交付物含接口 / 库表 / 文件'
    },
    mineEvaluate: {
      label: '待我评价', value: m.mineEvaluate, unit: '单', icon: 'Star', tone: 'teal',
      delta: '验收后提交评价与反馈'
    },
    doingTask: {
      label: '实施中任务', value: m.doingTask, unit: '个', icon: 'Tools', tone: 'info',
      delta: `任务累计 ${m.taskTotal} 个`
    },
    pendingAcceptTask: {
      label: '待接单任务', value: m.pendingAcceptTask, unit: '个', icon: 'Promotion', tone: 'warning',
      delta: '含待派发任务', tip: '已派发但尚未接单，或等待派发的生产任务'
    },
    pendingVerifyTask: {
      label: '待验证任务', value: m.pendingVerifyTask, unit: '个', icon: 'View', tone: 'warning',
      delta: `已完成 ${m.doneTask} 个`
    },
    doneTask: {
      label: '已完成任务', value: m.doneTask, unit: '个', icon: 'CircleCheck', tone: 'success',
      delta: `任务累计 ${m.taskTotal} 个`
    },
    taskTotal: {
      label: '生产任务总数', value: m.taskTotal, unit: '个', icon: 'Operation', tone: 'primary',
      delta: `实施中 ${m.doingTask} 个`
    },
    deployArtifact: {
      label: '可交付数据服务', value: m.serviceTotal, unit: '个', icon: 'Box', tone: 'teal',
      delta: '接口 / 库表 / 文件三类交付物', tip: '已完成封装并发布的数据服务，可作为需求交付产物'
    },
    openIncident: {
      label: '未闭环事件', value: m.openIncident, unit: '单', icon: 'Warning', tone: 'danger',
      delta: `事件累计 ${m.incidentTotal} 单`, tip: '尚未解决或关闭的事件单'
    },
    escalatedIncident: {
      label: '已升级事件', value: m.escalatedIncident, unit: '单', icon: 'Top', tone: 'danger',
      delta: '需二线支持组介入'
    },
    incidentTotal: {
      label: '事件单总数', value: m.incidentTotal, unit: '单', icon: 'Warning', tone: 'warning',
      delta: `未闭环 ${m.openIncident} 单`
    },
    openProblem: {
      label: '待推进问题', value: m.openProblem, unit: '单', icon: 'QuestionFilled', tone: 'warning',
      delta: `问题累计 ${m.problemTotal} 单`, tip: '新建 / 分派 / 分析中 / 已知错误的问题单'
    },
    problemTotal: {
      label: '问题单总数', value: m.problemTotal, unit: '单', icon: 'QuestionFilled', tone: 'purple',
      delta: `待推进 ${m.openProblem} 单`
    },
    pendingRelease: {
      label: '待发布 / 验证', value: m.pendingRelease, unit: '单', icon: 'Promotion', tone: 'warning',
      delta: `发布累计 ${m.releaseTotal} 单`, tip: '处于申请、批复、验证阶段的发布单'
    },
    releaseTotal: {
      label: '发布单总数', value: m.releaseTotal, unit: '单', icon: 'Promotion', tone: 'primary',
      delta: `待发布 / 验证 ${m.pendingRelease} 单`
    },
    pendingKnowledge: {
      label: '待审核知识', value: m.pendingKnowledge, unit: '条', icon: 'Reading', tone: 'teal',
      delta: '问题根治后沉淀为知识条目'
    },
    subscriptionTotal: {
      label: '订阅授权总数', value: m.subscriptionTotal, unit: '单', icon: 'Share', tone: 'primary',
      delta: `待审批 ${m.pendingSubscription} 单`
    },
    auditTotal: {
      label: '审计记录', value: m.auditTotal, unit: '条', icon: 'DocumentChecked', tone: 'neutral',
      delta: '字段级变更留痕'
    }
  }
})

const stats = computed<StatItem[]>(() => board.value.stats.map(k => pool.value[k]).filter(Boolean))

/* ------------------------------------------------------------ 趋势数据 -- */
function trendOf(
  rows: any[],
  getA: (r: any) => unknown,
  getB: (r: any) => unknown,
  nameA: string,
  nameB: string
) {
  const categories: string[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(BASE); d.setDate(d.getDate() - i)
    categories.push(`${d.getMonth() + 1}-${d.getDate()}`)
  }
  const a = new Array(14).fill(0) as number[]
  const b = new Array(14).fill(0) as number[]
  const put = (v: unknown, into: number[]) => {
    const ts = toTs(v)
    if (isNaN(ts)) return
    const idx = 13 - Math.round((BASE - ts) / DAY)
    if (idx >= 0 && idx < 14) into[idx] += 1
  }
  for (const r of rows) { put(getA(r), a); put(getB(r), b) }
  return { categories, series: [{ name: nameA, data: a }, { name: nameB, data: b }] }
}

const trend = computed(() => {
  const m = metrics.value
  const b = board.value
  if (b.trendSource === 'incident') {
    return trendOf(m.incidents, r => r.timeline?.[0]?.at, r => r.resolvedAt, '事件新建', '事件解决')
  }
  if (b.trendSource === 'task') {
    return trendOf(m.tasks, r => r.planStart, r => (r.status === 'DONE' ? r.planEnd : null), '任务派发', '任务完成')
  }
  const rows = b.scope === 'mine' ? m.mine : m.demands
  return trendOf(rows, r => r.submittedAt, r => r.deliveredAt, '需求提交', '需求交付')
})

/* -------------------------------------------------------- 状态分布数据 -- */
const DIST_ORDER: Record<TrendSource, string[]> = {
  demand: ['PENDING_ACCEPT', 'PENDING_APPROVE', 'APPROVED', 'IMPLEMENTING', 'PENDING_ACCEPTANCE', 'DELIVERED', 'EVALUATED', 'CHANGING', 'REJECTED', 'WITHDRAWN', 'DRAFT', 'CANCELLED'],
  incident: ['NEW', 'DISPATCHED', 'PROCESSING', 'ESCALATED', 'RESOLVED', 'CLOSED'],
  task: ['PENDING_DISPATCH', 'PENDING_ACCEPT', 'DOING', 'SUSPENDED', 'PENDING_VERIFY', 'DONE', 'REJECTED']
}
const DIST_DICT: Record<TrendSource, string> = { demand: 'DemandStatus', incident: 'IncidentStatus', task: 'TaskStatus' }

const statusDist = computed(() => {
  const m = metrics.value
  const b = board.value
  const rows = b.distSource === 'incident' ? m.incidents : b.distSource === 'task' ? m.tasks : (b.scope === 'mine' ? m.mine : m.demands)
  const c = countBy(rows, 'status')
  const dict = config.dicts[DIST_DICT[b.distSource]] as Record<string, { label: string }>
  return DIST_ORDER[b.distSource].filter(k => c[k]).map(k => ({ name: dict?.[k]?.label ?? k, value: c[k] }))
})

/* ------------------------------------------------------------ 排行数据 -- */
const rank = computed(() => {
  const m = metrics.value
  const src = board.value.rankSource
  if (src === 'none') return []
  const rows = src === 'incidentSource' ? m.incidents : src === 'taskDept' ? m.tasks : m.demands
  const field = src === 'incidentSource' ? 'source' : src === 'taskDept' ? 'dept' : 'applicantOrg'
  const c = countBy(rows, field)
  return by(Object.entries(c).map(([name, value]) => ({ name, value })), 'value', 'desc').slice(0, 6)
})

/* ------------------------------------------------------------ 我的待办 -- */
const todos = computed(() => store.todos.slice(0, 8))
function openTodo(t: any) {
  if (t.route) router.push(t.route.replace('#', ''))
  else ElMessage.info('该待办暂无可跳转的目标页面')
}

/* -------------------------------------------------------- 最近审计动态 -- */
const recentAudits = computed(() => (store.table('audits') as any[]).slice(0, 7))
</script>

<template>
  <div>
    <PageHead title="运营看板" :desc="board.summary">
      <template #tag>
        <el-tag size="small" effect="plain" type="info">{{ board.tag }}</el-tag>
      </template>
      <template #actions>
        <el-button
          v-for="a in actions"
          :key="a.text"
          :type="a.type ?? 'default'"
          @click="router.push(a.route)"
        >
          <el-icon><component :is="a.icon" /></el-icon><span>{{ a.text }}</span>
        </el-button>
      </template>
    </PageHead>

    <StatCards :items="stats" />

    <div class="grid grid--side">
      <!-- 左：趋势 + 待办 / 审计 -->
      <div>
        <div class="card">
          <div class="card__head">
            <div class="card__title"><el-icon class="card__ico"><TrendCharts /></el-icon>{{ board.trendTitle }}</div>
            <div class="card__sub">{{ board.trendNote }}</div>
            <div class="card__spacer" />
            <el-tag size="small" type="info" effect="plain">{{ board.trendTag }}</el-tag>
          </div>
          <div class="card__body">
            <ChartBox kind="line" :data="trend" :height="260" />
          </div>
        </div>

        <div v-if="board.todosTitle" class="card">
          <div class="card__head">
            <div class="card__title"><el-icon class="card__ico"><Clock /></el-icon>{{ board.todosTitle }}</div>
            <div class="card__sub">依据当前账号角色与单据状态实时推导</div>
            <div class="card__spacer" />
            <el-tag size="small" type="warning">{{ store.todos.length }} 项</el-tag>
          </div>
          <div class="card__body card__body--flush">
            <el-table :data="todos" size="small" style="width: 100%" @row-click="openTodo">
              <el-table-column prop="no" label="单号" width="140" />
              <el-table-column prop="kind" label="类型" width="96">
                <template #default="{ row }"><el-tag size="small" effect="plain">{{ row.kind }}</el-tag></template>
              </el-table-column>
              <el-table-column prop="title" label="标题" min-width="240" show-overflow-tooltip />
              <el-table-column label="优先级" width="96">
                <template #default="{ row }">
                  <StatusTag dict="Priority" :value="row.priority" :dot="false" />
                </template>
              </el-table-column>
              <el-table-column label="时限" width="120">
                <template #default="{ row }">
                  <span class="muted">{{ row.dueAt ? fmtShort(row.dueAt) : '—' }}</span>
                </template>
              </el-table-column>
              <el-table-column label="待办动作" width="132">
                <template #default="{ row }">
                  <el-button link type="primary" size="small">{{ row.action }}</el-button>
                </template>
              </el-table-column>
              <template #empty>
                <div class="empty-box">
                  <div class="empty-box__icon"><el-icon><FolderOpened /></el-icon></div>
                  <div class="empty-box__text">当前账号暂无待办事项</div>
                </div>
              </template>
            </el-table>
          </div>
        </div>

        <div v-else class="card">
          <div class="card__head">
            <div class="card__title"><el-icon class="card__ico"><DocumentChecked /></el-icon>最近审计动态</div>
            <div class="card__sub">需求、任务、事件等单据的字段级变更留痕</div>
            <div class="card__spacer" />
            <el-button link type="primary" size="small" @click="router.push('/audit')">查看全部</el-button>
          </div>
          <div class="card__body">
            <div class="tl">
              <div v-for="a in recentAudits" :key="a.id" class="tl__item tl__item--done">
                <div class="tl__dot" />
                <div class="tl__head">
                  <span class="tl__action">{{ a.action }}</span>
                  <span class="tl__meta">{{ a.operator }} · {{ a.operatedAt }}</span>
                </div>
                <div class="tl__body">{{ a.bizNo }} {{ a.bizTitle }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右：分布 + 排行 + 动态 -->
      <div>
        <div class="card">
          <div class="card__head">
            <div class="card__title"><el-icon class="card__ico"><PieChart /></el-icon>{{ board.distTitle }}</div>
          </div>
          <div class="card__body">
            <ChartBox kind="donut" :data="statusDist" :height="220" :center-label="board.distCenter" />
          </div>
        </div>

        <div v-if="board.rankSource !== 'none'" class="card">
          <div class="card__head">
            <div class="card__title"><el-icon class="card__ico"><Histogram /></el-icon>{{ board.rankTitle }}</div>
          </div>
          <div class="card__body">
            <ChartBox kind="hbar" :data="rank" />
          </div>
        </div>

        <div v-if="board.todosTitle" class="card">
          <div class="card__head">
            <div class="card__title"><el-icon class="card__ico"><DocumentChecked /></el-icon>最近审计动态</div>
            <div class="card__spacer" />
            <el-button link type="primary" size="small" @click="router.push('/audit')">查看全部</el-button>
          </div>
          <div class="card__body">
            <div class="tl">
              <div v-for="a in recentAudits" :key="a.id" class="tl__item tl__item--done">
                <div class="tl__dot" />
                <div class="tl__head">
                  <span class="tl__action">{{ a.action }}</span>
                  <span class="tl__meta">{{ a.operator }} · {{ a.operatedAt }}</span>
                </div>
                <div class="tl__body">{{ a.bizNo }} {{ a.bizTitle }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 卡片标题前的线性图标：随标题 currentColor，不单独上色 */
.card__ico { margin-right: 6px; font-size: 16px; vertical-align: -2px; }
.empty-box__icon .el-icon { color: var(--text-4); }
</style>
