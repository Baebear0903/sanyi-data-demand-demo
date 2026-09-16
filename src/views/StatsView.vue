<script setup lang="ts">
/**
 * StatsView —— 统计分析（M13）
 *
 * 覆盖原文功能点：
 *  · 统计分析（总述 12）：可以从 CMDB 的角度出发，去统计每一个项目、每一个设备的事件情况。
 *  · 按用户统计（11.1）：从用户的角度出发，统计某个用方组织或某个用户的事件情况；
 *    还可以从运维组织的角度出发，统计服务团队、人员的事件情况。
 *  · 按事件统计（11.2）：从事件本身的信息出发，根据事件的类型、分类、等级、状态、来源统计。
 *
 * 页面用 el-tabs 组织三个统计视角（按事件 / 按用户 / CMDB），并附「需求与交付度量」指标卡片区
 * （该组指标为建设方案未明确的部分，按合理口径补充）。
 */
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useDemoStore, dictItem } from '@/stores/demo'
import { config } from '@/core/config'
import { NOW, addDays, by, countBy, fmtDate, hoursAgo, iso, today, toDate } from '@/core/utils'
import type { ChartTone } from '@/core/chart'
import PageHead from '@/components/PageHead.vue'
import StatCards from '@/components/StatCards.vue'
import ChartBox from '@/components/ChartBox.vue'
import StatusTag from '@/components/StatusTag.vue'

const store = useDemoStore()
const router = useRouter()

/** 安全数组（单据数据为宽松结构，统一收敛为 any[]，便于模板中安全访问） */
const arrAny = (v: unknown): any[] => (Array.isArray(v) ? v : [])

const dictLabel = (d: string, k?: string) => dictItem(d, k).label

/* ============================================================ 工具 -- */
function incidentDate(i: any): Date | null {
  if (typeof i?.__dayOffset === 'number') return addDays(today(), i.__dayOffset)
  return toDate(arrAny(i?.timeline)[0]?.at) ?? toDate(i?.slaDueAt) ?? toDate(i?.resolvedAt)
}
function requesterOf(i: any): string {
  return String(arrAny(i?.timeline)[0]?.actor ?? '系统 / 其他渠道')
}
function orgOfRequester(name: string): string {
  const u = (store.table('users') as any[]).find(x => x.name === name)
  if (u) return u.org
  if (name === store.user.name) return store.user.org   // 登录账号不在演示人员名录内
  if (/服务台|邮箱/.test(name)) return '三医数据底座服务台'
  if (/系统|网关|用户/.test(name)) return '平台自动创建'
  return '其他来源'
}

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
const exportChart = (title: string, data: ChartTone[]) =>
  downloadCsv(`${title}_${today()}.csv`, [['名称', '数量'], ...data.map(d => [d.name, d.value] as (string | number)[])])

/* ========================================================== 筛选 -- */
const tab = ref('event')
const f = reactive({ range: [fmtDate(addDays(today(), -29)), today()] as string[], source: '' })
const sourceOptions = computed(() => Array.from(new Set((store.table('incidents') as any[]).map(i => i.source))))

const scopedIncidents = computed(() => {
  const [s, e] = f.range ?? ['', '']
  return (store.table('incidents') as any[]).filter(i => {
    if (f.source && i.source !== f.source) return false
    if (!s || !e) return true
    const d = incidentDate(i)
    if (!d) return true
    const ds = fmtDate(d)
    return ds >= s && ds <= e
  })
})

/* ==================================================== 指标行 -- */
const stats = computed(() => {
  const rows = scopedIncidents.value
  const closed = rows.filter(i => ['RESOLVED', 'CLOSED'].includes(i.status)).length
  const cis = store.table('cis') as any[]
  const demands = store.table('demands') as any[]
  const evs = store.table('evaluations') as any[]
  const scored = evs.filter(e => typeof e.score === 'number')
  return [
    { label: '事件单（筛选后）', value: rows.length, unit: '单', icon: 'Warning', tone: 'primary' as const, delta: `全量 ${store.table('incidents').length} 单` },
    { label: '已解决 / 关闭', value: closed, unit: '单', icon: 'CircleCheck', tone: 'success' as const, delta: rows.length ? `解决率 ${((closed / rows.length) * 100).toFixed(1)}%` : '—' },
    { label: 'CMDB 配置项', value: cis.length, unit: '个', icon: 'Files', tone: 'purple' as const, delta: '从 CMDB 视角统计事件' },
    { label: '需求单', value: demands.length, unit: '单', icon: 'Tickets', tone: 'teal' as const },
    { label: '评价平均分', value: scored.length ? (scored.reduce((s, e) => s + Number(e.score), 0) / scored.length).toFixed(2) : '—', unit: '分', icon: 'Star', tone: 'warning' as const, delta: `${scored.length} 条评价` }
  ]
})

/* ============================================ 视角一：按事件统计 -- */
const KINDS = [
  { value: 'donut', label: '环形' }, { value: 'bar', label: '柱状' }, { value: 'hbar', label: '条形' }
] as const
const kinds = reactive<Record<string, 'donut' | 'bar' | 'hbar'>>({
  categoryName: 'donut', categoryId: 'bar', severity: 'hbar', status: 'donut', source: 'bar'
})

const categoryNameData = computed<ChartTone[]>(() => {
  const c = countBy(scopedIncidents.value, 'categoryName')
  return by(Object.entries(c).map(([name, value]) => ({ name, value })), 'value', 'desc')
})
const categoryIdData = computed<ChartTone[]>(() => {
  const cats = store.table('incidentCategories') as any[]
  const c = countBy(scopedIncidents.value, (i: any) => cats.find(x => x.id === i.categoryId)?.name ?? i.categoryName ?? '其他')
  return by(Object.entries(c).map(([name, value]) => ({ name, value })), 'value', 'desc')
})
const severityData = computed<ChartTone[]>(() => {
  const c = countBy(scopedIncidents.value, 'severity')
  const order = Object.keys(config.dicts.Severity)
  return order.filter(k => c[k]).map(k => ({ name: k, value: c[k] }))
})
const statusData = computed<ChartTone[]>(() => {
  const c = countBy(scopedIncidents.value, 'status')
  const order = Object.keys(config.flowIndex.Incident)
  return order.filter(k => c[k]).map(k => ({ name: dictLabel('IncidentStatus', k), value: c[k] }))
})
const sourceData = computed<ChartTone[]>(() => {
  const c = countBy(scopedIncidents.value, 'source')
  return by(Object.entries(c).map(([name, value]) => ({ name, value })), 'value', 'desc')
})

const DIM_CARDS = computed(() => [
  { key: 'categoryName', title: '按事件类型统计（categoryName）', data: categoryNameData.value, center: '事件单' },
  { key: 'categoryId', title: '按事件分类统计（categoryId → 分类名称）', data: categoryIdData.value, center: '事件单' },
  { key: 'severity', title: '按严重等级统计（severity）', data: severityData.value, center: '事件单' },
  { key: 'status', title: '按状态统计（status）', data: statusData.value, center: '事件单' },
  { key: 'source', title: '按来源统计（source）', data: sourceData.value, center: '事件单' }
])

/* ============================================ 视角二：按用户统计 -- */
/** 1) 用方组织 / 用户视角 —— 谁提的事件 */
const requesterRows = computed(() => {
  const users = store.table('users') as any[]
  const map: Record<string, { name: string; org: string; total: number; resolved: number; series: number[] }> = {}
  for (const i of scopedIncidents.value) {
    const actor = requesterOf(i)
    const u = users.find(x => x.name === actor)
    const key = (u || actor === store.user.name) ? actor : '系统 / 其他渠道'
    if (!map[key]) map[key] = { name: key, org: orgOfRequester(actor), total: 0, resolved: 0, series: new Array(7).fill(0) }
    const row = map[key]
    row.total += 1
    if (['RESOLVED', 'CLOSED'].includes(i.status)) row.resolved += 1
    const d = incidentDate(i)
    if (d) {
      const idx = 6 - Math.round((NOW.getTime() - d.getTime()) / 86400000)
      if (idx >= 0 && idx < 7) row.series[idx] += 1
    }
  }
  return by(Object.values(map), 'total', 'desc')
})
const orgData = computed<ChartTone[]>(() => {
  const c = countBy(scopedIncidents.value, (i: any) => orgOfRequester(requesterOf(i)))
  return by(Object.entries(c).map(([name, value]) => ({ name, value })), 'value', 'desc').slice(0, 10)
})

/** 2) 运维组织 / 人员视角 —— 谁在处理、处理得怎么样 */
const groupData = computed<ChartTone[]>(() => {
  const c = countBy(scopedIncidents.value, 'handlerGroup')
  return by(Object.entries(c).map(([name, value]) => ({ name, value })), 'value', 'desc')
})
const handlerRows = computed(() => {
  const map: Record<string, { handler: string; group: string; total: number; done: number; hours: number[]; slaTotal: number; slaOk: number }> = {}
  for (const i of scopedIncidents.value) {
    const h = String(i.handler ?? '—')
    if (!h || h === '—') continue
    if (!map[h]) map[h] = { handler: h, group: i.handlerGroup ?? '—', total: 0, done: 0, hours: [], slaTotal: 0, slaOk: 0 }
    const row = map[h]
    row.total += 1
    const start = toDate(arrAny(i.timeline)[0]?.at)
    const end = toDate(i.resolvedAt)
    if (end) {
      row.done += 1
      if (start) row.hours.push(Math.max(0, (end.getTime() - start.getTime()) / 3600000))
    }
    if (i.slaDueAt) {
      row.slaTotal += 1
      const due = toDate(i.slaDueAt)
      if (end && due && end.getTime() <= due.getTime()) row.slaOk += 1
    }
  }
  return by(Object.values(map).map(r => ({
    handler: r.handler, group: r.group, total: r.total, done: r.done,
    avgHours: r.hours.length ? r.hours.reduce((a, b) => a + b, 0) / r.hours.length : 0,
    slaRate: r.slaTotal ? (r.slaOk / r.slaTotal) * 100 : 0,
    slaTotal: r.slaTotal
  })), 'total', 'desc')
})
const slaRate = computed(() => {
  const rows = handlerRows.value.filter(r => r.slaTotal > 0)
  const total = rows.reduce((s, r) => s + r.slaTotal, 0)
  const ok = rows.reduce((s, r) => s + (r.slaRate / 100) * r.slaTotal, 0)
  return total ? (ok / total) * 100 : 0
})
const handlerChart = computed<ChartTone[]>(() =>
  handlerRows.value.slice(0, 10).map(r => ({ name: r.handler, value: r.total }))
)

/* ============================================== 视角三：CMDB 视角 -- */
const cis = computed(() => store.table('cis') as any[])

/** 该配置项关联的事件数（其 id 出现在 incidents.ciIds 中） */
const ciIncidentCount = (ciId: string) =>
  scopedIncidents.value.filter(i => arrAny(i.ciIds).includes(ciId)).length

/** 影响面 = 反向依赖的配置项（谁依赖我）+ 关联服务 + 关联租户（统计口径） */
const ciImpact = (ci: any) => {
  const dependents = cis.value.filter(c => arrAny(c.dependsOn).includes(ci.id))
  const score = dependents.length * 2 + arrAny(ci.relatedServices).length + arrAny(ci.relatedTenants).length
  return {
    dependents, score,
    level: score >= 10 ? '高' : score >= 6 ? '中' : '低',
    text: `被 ${dependents.length} 个配置项依赖 · ${arrAny(ci.relatedServices).length} 个服务 · ${arrAny(ci.relatedTenants).length} 个租户`
  }
}
const ciRows = computed(() =>
  by(cis.value.map(c => ({
    ...c,
    incidentCount: ciIncidentCount(c.id),
    serviceCount: arrAny(c.relatedServices).length,
    tenantCount: arrAny(c.relatedTenants).length,
    impact: ciImpact(c)
  })), 'incidentCount', 'desc')
)

/* --------------------------------- 配置项下钻（可打开详情 + 写操作） -- */
const ciDetail = ref<any>(null)
function openCi(row: any) { ciDetail.value = row }
const ciIncidents = computed<any[]>(() =>
  ciDetail.value ? scopedIncidents.value.filter(i => arrAny(i.ciIds).includes(ciDetail.value.id)).slice(0, 8) : []
)

/** 为高影响配置项申报巡检事件单（真实写操作，形成"统计 → 处置"闭环） */
function createCiIncident() {
  const ci = ciDetail.value
  if (!ci) return
  const cats = store.table('incidentCategories') as any[]
  const cat = cats.find(c => c.id === 'ic01') ?? cats[0]
  const no = config.prefixes.incidents + today().replace(/-/g, '') + String((store.table('incidents') as any[]).length + 1).padStart(3, '0')
  const rec = store.insert('incidents', {
    no, title: `【配置项巡检】${ci.name} 关联事件 ${ci.incidentCount} 起，需复核`, description: `由统计分析 · CMDB 视角发起：配置项「${ci.name}」(${ci.id}) 关联事件 ${ci.incidentCount} 起，影响面${ci.impact.level}（${ci.impact.text}），请复核运行状态。`,
    source: '服务台申报', categoryId: cat.id, categoryName: cat.name,
    severity: ci.impact.level === '高' ? '高' : '中', impact: ci.impact.level === '高' ? '部分功能受影响' : '轻微影响',
    urgency: '一般', priority: ci.impact.level === '高' ? 'P2' : 'P3', ciIds: [ci.id],
    status: 'DISPATCHED', handler: '徐鹏', handlerGroup: cat.autoAssign,
    slaDueAt: iso(addDays(today(), 2)), resolvedAt: null, closeType: null,
    relatedIncidentIds: [], problemId: null, changeId: null, broadcastIds: [], knowledgeRefs: [],
    timeline: [
      { at: iso(), actor: store.user.name, action: '统计分析页发起配置项巡检事件' },
      { at: iso(), actor: '系统', action: `按分类规则自动分派至 ${cat.autoAssign}` }
    ]
  })
  store.notify({
    type: 'warning', title: `事件单 ${no} 已创建`,
    body: `配置项「${ci.name}」关联事件 ${ci.incidentCount} 起，已分派至${cat.autoAssign}复核。`,
    toRoles: ['ops', 'desk'], link: `/incident/detail/${rec.id}`
  })
  ElMessage.success(`已生成事件单 ${no}，并分派至${cat.autoAssign}`)
  ciDetail.value = null
}

function noticeCiOwner() {
  const ci = ciDetail.value
  if (!ci) return
  store.notify({
    type: 'info', title: `配置项关注提醒：${ci.name}`,
    body: `负责人 ${ci.owner}：该配置项关联事件 ${ci.incidentCount} 起，影响面${ci.impact.level}，请关注。`,
    toRoles: ['ops', 'admin'], link: '/stats'
  })
  ElMessage.success(`已通知负责人「${ci.owner}」（站内信 + 邮件）`)
}
const ciTopData = computed<ChartTone[]>(() =>
  ciRows.value.slice(0, 10).map(c => ({ name: c.name, value: c.incidentCount }))
)
const ciTypeData = computed<ChartTone[]>(() => {
  const c = countBy(cis.value, 'type')
  return by(Object.entries(c).map(([name, value]) => ({ name, value })), 'value', 'desc')
})

/* ======================================= 需求与交付度量（建议指标） -- */
const demandCycle = computed<ChartTone[]>(() => {
  const buckets = [
    { name: '≤3 天', min: 0, max: 3 }, { name: '4-7 天', min: 3, max: 7 },
    { name: '8-15 天', min: 7, max: 15 }, { name: '16-30 天', min: 15, max: 30 },
    { name: '>30 天', min: 30, max: Infinity }
  ]
  const rows = (store.table('demands') as any[]).filter(d => d.submittedAt && d.deliveredAt)
  return buckets.map(b => ({
    name: b.name,
    value: rows.filter(d => {
      const days = (toDate(d.deliveredAt)!.getTime() - toDate(d.submittedAt)!.getTime()) / 86400000
      return days > b.min && days <= b.max
    }).length
  }))
})
const demandFunnel = computed<ChartTone[]>(() => {
  const demands = store.table('demands') as any[]
  const steps = config.flows.Demand as string[]
  const idx = config.flowIndex.Demand as Record<string, number>
  return steps.map((name, i) => ({
    name,
    value: demands.filter(d => (idx[d.status] ?? 0) >= i && !['REJECTED', 'WITHDRAWN', 'CANCELLED'].includes(d.status)).length
  }))
})
const scoreDist = computed<ChartTone[]>(() => {
  const evs = store.table('evaluations') as any[]
  return [1, 2, 3, 4, 5].map(s => ({ name: `${s} 分`, value: evs.filter(e => Number(e.score) === s).length }))
})

function exportCi() {
  downloadCsv(`CMDB配置项事件统计_${today()}.csv`, [
    ['配置项', '类型', '环境', '负责人', '关联事件数', '关联服务数', '关联租户数', '影响面', '影响面说明'],
    ...ciRows.value.map(c => [c.name, c.type, c.env, c.owner, c.incidentCount, c.serviceCount, c.tenantCount, c.impact.level, c.impact.text])
  ])
}
function exportHandler() {
  downloadCsv(`运维人员处理统计_${today()}.csv`, [
    ['处理人', '处理组', '处理数', '已解决', '平均处理时长(小时)', 'SLA 达成率(%)'],
    ...handlerRows.value.map(r => [r.handler, r.group, r.total, r.done, r.avgHours.toFixed(1), r.slaRate.toFixed(1)])
  ])
}
function exportRequester() {
  downloadCsv(`按用户统计_${today()}.csv`, [
    ['用户', '组织', '提交事件数', '已解决', '近 7 天趋势'],
    ...requesterRows.value.map(r => [r.name, r.org, r.total, r.resolved, r.series.join('/')])
  ])
}
const hours = (v: number) => (v ? `${v.toFixed(1)} h` : '—')
</script>

<template>
  <div>
    <PageHead
      title="统计分析"
      desc="从 CMDB 的角度统计每一个项目、每一个设备的事件情况；按用户与按事件两个视角分别统计，并补充需求与交付度量指标。"
    >
      <template #actions>
        <el-button @click="router.push('/service-desk')">服务台事件统计</el-button>
        <el-button type="primary" @click="exportChart('事件统计_全维度', categoryNameData)"><el-icon><Download /></el-icon> 导出事件统计</el-button>
      </template>
    </PageHead>

    <StatCards :items="stats" />

    <div class="card">
      <div class="card__head">
        <div class="card__title">统计筛选</div>
        <div class="card__sub">筛选条件对事件相关统计（按事件 / 按用户 / CMDB 关联事件数）生效</div>
        <div class="card__spacer" />
        <span class="text-sm muted">事件时间范围</span>
        <el-date-picker
          v-model="f.range"
          type="daterange"
          unlink-panels
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          size="small"
          style="width: 250px"
        />
        <el-select v-model="f.source" placeholder="全部来源" clearable size="small" style="width: 140px">
          <el-option v-for="s in sourceOptions" :key="s" :label="s" :value="s" />
        </el-select>
        <el-button size="small" @click="f.range = [fmtDate(addDays(today(), -29)), today()]; f.source = ''">重置</el-button>
      </div>
      <div class="card__body" style="padding-top: var(--sp-3); padding-bottom: var(--sp-3)">
        <div class="text-sm muted">
          当前筛选命中 <b class="mono">{{ scopedIncidents.length }}</b> 条事件（时间口径：
          有 <code>__dayOffset</code> 的历史事件按相对天数换算，其余取流转时间轴首条时间，缺失时回退 SLA 到期时间 / 解决时间）。
        </div>
      </div>
    </div>

    <el-tabs v-model="tab" class="stats-tabs">
      <!-- ============================================ 按事件统计 -- -->
      <el-tab-pane label="按事件统计" name="event">
        <div class="grid grid--2">
          <div v-for="c in DIM_CARDS" :key="c.key" class="card">
            <div class="card__head">
              <div class="card__title">{{ c.title }}</div>
              <div class="card__spacer" />
              <el-radio-group v-model="kinds[c.key]" size="small">
                <el-radio-button v-for="k in KINDS" :key="k.value" :value="k.value">{{ k.label }}</el-radio-button>
              </el-radio-group>
              <el-button size="small" @click="exportChart(c.title, c.data)"><el-icon><Download /></el-icon> 导出</el-button>
            </div>
            <div class="card__body">
              <ChartBox :kind="kinds[c.key]" :data="c.data" :height="250" :center-label="c.center" />
            </div>
          </div>
        </div>
      </el-tab-pane>

      <!-- ============================================ 按用户统计 -- -->
      <el-tab-pane label="按用户统计" name="user">
        <div class="card">
          <div class="card__head">
            <div class="card__title">用方组织 / 用户视角</div>
            <div class="card__sub">统计某个用方组织或某个用户的事件情况（11.1）</div>
            <div class="card__spacer" />
            <el-button size="small" @click="exportRequester"><el-icon><Download /></el-icon> 导出</el-button>
          </div>
          <div class="card__body">
            <div class="grid grid--2">
              <div>
                <div class="bold mb-2">各申请方组织事件数</div>
                <ChartBox kind="hbar" :data="orgData" />
              </div>
              <div>
                <div class="bold mb-2">提交事件的用户 TOP（近 7 天趋势）</div>
                <el-table :data="requesterRows.slice(0, 8)" size="small" style="width: 100%">
                  <el-table-column prop="name" label="用户" width="90" />
                  <el-table-column prop="org" label="所属组织" min-width="150" show-overflow-tooltip />
                  <el-table-column prop="total" label="提交" width="64" />
                  <el-table-column prop="resolved" label="已解决" width="72" />
                  <el-table-column label="近 7 天趋势" width="110">
                    <template #default="{ row }">
                      <ChartBox kind="spark" :values="row.series" />
                    </template>
                  </el-table-column>
                  <template #empty>
                    <div class="empty-box">
                      <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
                      <div class="empty-box__text">当前筛选范围内没有用户提交的事件</div>
                    </div>
                  </template>
                </el-table>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card__head">
            <div class="card__title">运维组织 / 人员视角</div>
            <div class="card__sub">统计服务团队、人员的事件处理情况与处理时效</div>
            <div class="card__spacer" />
            <el-button size="small" @click="exportHandler"><el-icon><Download /></el-icon> 导出</el-button>
          </div>
          <div class="card__body">
            <div class="grid grid--3">
              <div>
                <div class="bold mb-2">按处理组处理量</div>
                <ChartBox kind="hbar" :data="groupData" />
              </div>
              <div>
                <div class="bold mb-2">按处理人处理量</div>
                <ChartBox kind="hbar" :data="handlerChart" />
              </div>
              <div>
                <div class="bold mb-2">整体 SLA 达成率</div>
                <ChartBox kind="gauge" :value="Number(slaRate.toFixed(1))" label="SLA 达成率（已解决事件）" />
                <div class="text-xs muted" style="margin-top: var(--sp-3)">
                  口径：SLA 达成 = 解决时间不晚于 slaDueAt；未解决事件计入未达成。
                </div>
              </div>
            </div>
            <el-table :data="handlerRows" class="mt-4" style="width: 100%" size="small">
              <el-table-column prop="handler" label="处理人" width="100" />
              <el-table-column prop="group" label="处理组" min-width="170" show-overflow-tooltip />
              <el-table-column prop="total" label="处理数" width="80" sortable />
              <el-table-column prop="done" label="已解决" width="80" />
              <el-table-column label="平均处理时长" width="130">
                <template #default="{ row }">{{ hours(row.avgHours) }}</template>
              </el-table-column>
              <el-table-column label="SLA 达成率" min-width="180">
                <template #default="{ row }">
                  <el-progress
                    :percentage="Number(row.slaRate.toFixed(1))"
                    :stroke-width="10"
                    :status="row.slaRate >= 90 ? 'success' : row.slaRate >= 70 ? undefined : 'exception'"
                  />
                </template>
              </el-table-column>
              <template #empty>
                <div class="empty-box">
                  <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
                  <div class="empty-box__text">当前筛选范围内没有已分派处理人的事件</div>
                </div>
              </template>
            </el-table>
          </div>
        </div>
      </el-tab-pane>

      <!-- ============================================= CMDB 视角 -- -->
      <el-tab-pane label="CMDB 视角" name="cmdb">
        <div class="card">
          <div class="card__head">
            <div class="card__title">配置项关联事件统计</div>
            <div class="card__sub">从 CMDB 的角度出发，统计每一个项目、每一个设备（配置项）的事件情况</div>
            <div class="card__spacer" />
            <el-button size="small" @click="exportCi"><el-icon><Download /></el-icon> 导出</el-button>
          </div>
          <div class="card__body">
            <div class="grid grid--2">
              <div>
                <div class="bold mb-2">配置项关联事件数 TOP</div>
                <ChartBox kind="bar" :data="ciTopData" :height="280" :rotate="true" />
              </div>
              <div>
                <div class="bold mb-2">配置项类型分布</div>
                <ChartBox kind="donut" :data="ciTypeData" :height="230" center-label="配置项" />
              </div>
            </div>
          </div>
          <div class="card__body card__body--flush">
            <el-table :data="ciRows" style="width: 100%" size="small" row-key="id" @row-click="openCi">
              <el-table-column label="配置项" min-width="200">
                <template #default="{ row }">
                  <div class="cell-main">{{ row.name }}</div>
                  <div class="cell-sub mono">{{ row.id }}</div>
                </template>
              </el-table-column>
              <el-table-column prop="type" label="类型" width="100" />
              <el-table-column prop="env" label="环境" width="80" />
              <el-table-column prop="owner" label="负责人" width="130" show-overflow-tooltip />
              <el-table-column label="关联事件数" width="110" sortable>
                <template #default="{ row }">
                  <span class="mono bold" :style="{ color: row.incidentCount >= 3 ? 'var(--danger)' : 'var(--text)' }">{{ row.incidentCount }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="serviceCount" label="关联服务数" width="110" />
              <el-table-column prop="tenantCount" label="关联租户数" width="110" />
              <el-table-column label="影响面" min-width="260">
                <template #default="{ row }">
                  <StatusTag :label="`影响面 ${row.impact.level}`" :tone="row.impact.level === '高' ? 'danger' : row.impact.level === '中' ? 'warning' : 'success'" :dot="false" />
                  <span class="text-xs muted" style="margin-left: 8px">{{ row.impact.text }}</span>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="120" fixed="right">
                <template #default="{ row }">
                  <el-button link type="primary" size="small" @click.stop="openCi(row)">关联事件</el-button>
                </template>
              </el-table-column>
              <template #empty>
                <div class="empty-box">
                  <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
                  <div class="empty-box__text">暂无 CMDB 配置项数据</div>
                </div>
              </template>
            </el-table>
          </div>
          <div class="card__foot">
            <span class="text-sm muted">
              口径说明：关联事件数 = 事件单 <code>ciIds</code> 命中该配置项的条数；
              影响面 = 反向依赖该配置项的配置项数 ×2 + 关联服务数 + 关联租户数，≥10 为高、≥6 为中。
            </span>
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- ================================ 需求与交付度量（建议指标） -- -->
    <div class="grid grid--3">
      <div class="card">
        <div class="card__head">
          <div class="card__title">需求交付周期分布</div>
          <div class="card__spacer" />
          <el-button size="small" @click="exportChart('需求交付周期分布', demandCycle)"><el-icon><Download /></el-icon> 导出</el-button>
        </div>
        <div class="card__body">
          <ChartBox kind="bar" :data="demandCycle" :height="240" />
          <div class="text-xs muted mt-2">按 submittedAt → deliveredAt 的自然日天数分桶（仅统计已交付需求单）。</div>
        </div>
      </div>
      <div class="card">
        <div class="card__head">
          <div class="card__title">需求状态漏斗</div>
          <div class="card__spacer" />
          <el-button size="small" @click="exportChart('需求状态漏斗', demandFunnel)"><el-icon><Download /></el-icon> 导出</el-button>
        </div>
        <div class="card__body">
          <ChartBox kind="funnel" :data="demandFunnel" />
          <div class="text-xs muted mt-2">按需求单流转步骤累计计数（已驳回 / 已撤回 / 已作废不计入后续环节）。</div>
        </div>
      </div>
      <div class="card">
        <div class="card__head">
          <div class="card__title">评价得分分布</div>
          <div class="card__spacer" />
          <el-button size="small" @click="exportChart('评价得分分布', scoreDist)"><el-icon><Download /></el-icon> 导出</el-button>
        </div>
        <div class="card__body">
          <ChartBox kind="bar" :data="scoreDist" :height="240" />
          <div class="text-xs muted mt-2">评价数据来自「评价管理」，与 M12 评价单保持一致。</div>
        </div>
      </div>
    </div>

    <!-- ======================================= 配置项下钻（弹窗 + 写操作） -- -->
    <el-dialog v-model="ciDetail" :title="ciDetail ? `配置项关联事件 · ${ciDetail.name}` : '配置项关联事件'" width="720px">
      <template v-if="ciDetail">
        <div class="desc-grid">
          <div class="desc-item">
            <span class="desc-item__label">配置项 ID</span>
            <span class="desc-item__value mono">{{ ciDetail.id }}</span>
          </div>
          <div class="desc-item">
            <span class="desc-item__label">类型 / 环境</span>
            <span class="desc-item__value">{{ ciDetail.type }} · {{ ciDetail.env }}</span>
          </div>
          <div class="desc-item">
            <span class="desc-item__label">负责人</span>
            <span class="desc-item__value">{{ ciDetail.owner }}</span>
          </div>
          <div class="desc-item">
            <span class="desc-item__label">关联事件数</span>
            <span class="desc-item__value"><b class="mono">{{ ciDetail.incidentCount }}</b> 起</span>
          </div>
          <div class="desc-item desc-item--wide">
            <span class="desc-item__label">影响面</span>
            <span class="desc-item__value">
              <StatusTag :label="`影响面 ${ciDetail.impact.level}`" :tone="ciDetail.impact.level === '高' ? 'danger' : ciDetail.impact.level === '中' ? 'warning' : 'success'" :dot="false" />
              <span class="text-xs muted" style="margin-left: 8px">{{ ciDetail.impact.text }}</span>
            </span>
          </div>
        </div>

        <div class="bold mt-4 mb-2">该配置项关联的事件（点击单号查看事件详情）</div>
        <el-table :data="ciIncidents" size="small" style="width: 100%" row-key="id">
          <el-table-column label="单号" width="150">
            <template #default="{ row }">
              <el-button link type="primary" @click="router.push(`/incident/detail/${row.id}`)">{{ row.no }}</el-button>
            </template>
          </el-table-column>
          <el-table-column prop="title" label="标题" min-width="220" show-overflow-tooltip />
          <el-table-column label="状态" width="100">
            <template #default="{ row }"><StatusTag dict="IncidentStatus" :value="row.status" /></template>
          </el-table-column>
          <el-table-column prop="handler" label="处理人" width="90" />
          <template #empty>
            <div class="empty-box">
              <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
              <div class="empty-box__text">当前筛选范围内该配置项没有关联事件</div>
            </div>
          </template>
        </el-table>
      </template>
      <div class="text-xs muted mt-3">
        可基于统计结果直接发起处置：「申报巡检事件单」会写入事件单表并自动分派，
        「通知负责人」会下发站内信，形成"统计 → 处置"闭环。
      </div>
      <template #footer>
        <el-button @click="noticeCiOwner"><el-icon><Promotion /></el-icon> 通知负责人</el-button>
        <el-button type="primary" @click="createCiIncident"><el-icon><Plus /></el-icon> 申报巡检事件单</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.stats-tabs :deep(.el-tabs__header) { margin-bottom: var(--sp-4); }
.cell-main { font-weight: 600; }
.cell-sub { font-size: var(--fs-xs); color: var(--text-3); margin-top: 2px; }
</style>
