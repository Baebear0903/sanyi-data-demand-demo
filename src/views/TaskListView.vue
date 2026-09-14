<script setup lang="ts">
/**
 * TaskListView —— 任务管理（含任务单详情与任务关联信息）
 *
 * 覆盖原文功能点：任务管理 —— "根据用户反馈的数据问题，创建任务并指定生产部门实施，跟踪任务的审批与
 * 最终实施情况。"；任务单详情 —— "展示任务单处理的详细信息，用户可监控各生产部门任务单处理状态。"；
 * 任务关联信息 —— "除了在问题管理处为问题单关联任务单，在任务管理处新建任务单时可主动关联问题单。
 * 任务单详情展示所有任务单记录信息，并可查看该任务单关联的数据问题，掌握实施任务来源。"
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDemoStore } from '@/stores/demo'
import { config } from '@/core/config'
import { addDays, arr, by, demoUid, fmtDate, fmtTime, fromNow, hoursAgo, iso, NOW, nowStamp } from '@/core/utils'
import PageHead from '@/components/PageHead.vue'
import ChartBox from '@/components/ChartBox.vue'
import StatCards from '@/components/StatCards.vue'
import StatusTag from '@/components/StatusTag.vue'

const store = useDemoStore()
const route = useRoute()


/* 本地宽松数组 / 字典工具（store 返回宽类型，避免 unknown 推断） */
const lst = (v: unknown): any[] => (Array.isArray(v) ? v : [])
const dictOpts = (d: Record<string, { label: string }>) => Object.keys(d).map(k => ({ value: k, label: d[k].label }))

/* ------------------------------------------------------------ 数据 -- */
const allRows = computed(() => by(store.table('tasks') as any[], 'planStart', 'desc'))
const resources = computed(() => store.table('resources') as any[])
const resourceMap = computed<Record<string, any>>(() => {
  const m: Record<string, any> = {}
  resources.value.forEach(r => { m[r.id] = r })
  return m
})

const f = reactive({ kw: '', status: '', type: '', dept: '', source: '' })
const filtered = computed(() => allRows.value.filter(t => {
  if (f.status && t.status !== f.status) return false
  if (f.type && t.type !== f.type) return false
  if (f.dept && t.dept !== f.dept) return false
  if (f.source && t.source !== f.source) return false
  if (f.kw) {
    const hay = `${t.no} ${t.title} ${t.sourceNo} ${t.assignee} ${t.dept}`.toLowerCase()
    if (!hay.includes(f.kw.toLowerCase())) return false
  }
  return true
}))

const deptOptions = computed(() => Array.from(new Set([
  ...(store.table('tasks') as any[]).map(t => t.dept),
  ...(store.table('orgs') as any[]).filter(o => /生产|运维|运营/.test(o.name)).map(o => o.name)
])).map(d => ({ value: d, label: d })))

const assigneeOptions = computed(() => (store.table('users') as any[]).filter(u => /生产中心|运维中心|运营中心/.test(u.org)))

const overdue = (t: any): boolean => t.status !== 'DONE' && !!t.planEnd && hoursAgo(t.planEnd) > 0

const stats = computed(() => {
  const rows = allRows.value
  return [
    { label: '任务单总数', value: rows.length, unit: '单', icon: 'Tickets', tone: 'primary' as const },
    { label: '待派发 / 待接单', value: rows.filter(t => ['PENDING_DISPATCH', 'PENDING_ACCEPT'].includes(t.status)).length, unit: '单', icon: 'Promotion', tone: 'warning' as const },
    { label: '实施中', value: rows.filter(t => t.status === 'DOING').length, unit: '单', icon: 'Tools', tone: 'info' as const },
    { label: '待验证', value: rows.filter(t => t.status === 'PENDING_VERIFY').length, unit: '单', icon: 'Search', tone: 'purple' as const },
    { label: '已完成', value: rows.filter(t => t.status === 'DONE').length, unit: '单', icon: 'CircleCheck', tone: 'success' as const },
    { label: '超期未完成', value: rows.filter(overdue).length, unit: '单', icon: 'Warning', tone: 'danger' as const, tip: '计划结束日期已过但尚未完成' }
  ]
})

/** 承接部门任务分布（监控各生产部门任务单处理状态） */
const deptChart = computed(() => {
  const m: Record<string, number> = {}
  allRows.value.forEach(t => { m[t.dept] = (m[t.dept] ?? 0) + 1 })
  return Object.entries(m).map(([name, value]) => ({ name, value }))
})

/* -------------------------------------------------------- 新建任务单 -- */
const createVisible = ref(false)
const nf = reactive({
  title: '', type: '数据加工', source: 'DEMAND', sourceId: '', dept: '数据生产中心 · 加工组',
  assignee: '刘涛', priority: 'P2', planStart: fmtDate(NOW), planEnd: fmtDate(addDays(NOW, 7)),
  content: '', deliverable: '', resources: [] as string[], relatedProblemIds: [] as string[]
})
const demandOptions = computed(() => (store.table('demands') as any[]).filter(d => !['DRAFT', 'CANCELLED', 'REJECTED'].includes(d.status)))
const problemOptions = computed(() => store.table('problems') as any[])

function openCreate() {
  nf.title = ''
  nf.type = '数据加工'
  nf.source = 'DEMAND'
  nf.sourceId = ''
  nf.dept = '数据生产中心 · 加工组'
  nf.assignee = '刘涛'
  nf.priority = 'P2'
  nf.planStart = fmtDate(NOW)
  nf.planEnd = fmtDate(addDays(NOW, 7))
  nf.content = ''
  nf.deliverable = ''
  nf.resources = []
  nf.relatedProblemIds = []
  createVisible.value = true
}

/** 来源选择：需求单 / 问题单 / 手工 */
function onSourceChange(id: string) {
  nf.sourceId = id
  if (nf.source === 'DEMAND') {
    const d = store.findById('demands', id)
    if (d) {
      nf.title = nf.title || `${d.title}（生产实施）`
      nf.content = nf.content || `承接需求单 ${d.no}：${d.scene}`
      nf.priority = d.priority ?? nf.priority
      nf.resources = lst(d.resources)
      nf.relatedProblemIds = lst(d.relatedProblemIds)
    }
  } else if (nf.source === 'PROBLEM') {
    const p = store.findById('problems', id)
    if (p) {
      nf.title = nf.title || `${p.title.replace(/（.*?）/g, '')}-整改任务`
      nf.content = nf.content || `承接问题单 ${p.no} 的根因整改：${p.rootCause || '分析中'}`
      nf.priority = p.priority ?? nf.priority
      nf.relatedProblemIds = Array.from(new Set([...nf.relatedProblemIds, p.id]))
    }
  }
}

function nextTaskNo(): string {
  // 单号日期取演示基准时间，避免出现"单号是 20260914、单据时间是 2026-01-27"的错位
  const day = nowStamp()
  return `RW${day}${String((store.table('tasks') as any[]).length + 1).padStart(3, '0')}`
}

function createTask() {
  if (!nf.title.trim()) { ElMessage.warning('请填写任务名称'); return }
  const src = nf.source === 'DEMAND' ? store.findById('demands', nf.sourceId)
    : nf.source === 'PROBLEM' ? store.findById('problems', nf.sourceId) : null
  const no = nextTaskNo()
  const rec: Record<string, any> = {
    id: demoUid('t'),
    no, title: nf.title, type: nf.type,
    source: nf.source, sourceId: src?.id ?? null, sourceNo: src?.no ?? '',
    dept: nf.dept, assignee: nf.assignee, priority: nf.priority,
    planStart: nf.planStart, planEnd: nf.planEnd, progress: 0,
    status: 'PENDING_DISPATCH',
    content: nf.content, deliverable: nf.deliverable,
    resources: [...nf.resources], relatedProblemIds: [...nf.relatedProblemIds],
    milestones: [
      { name: '方案确认', planDate: nf.planStart },
      { name: '开发实施', planDate: fmtDate(addDays(nf.planStart, 4)) },
      { name: '验证交付', planDate: nf.planEnd }
    ],
    timeline: [{
      at: iso(), actor: store.user.name, action: '创建任务单',
      comment: nf.source === 'PROBLEM' ? `主动关联数据问题 ${src?.no ?? ''}` : nf.source === 'DEMAND' ? `承接需求单 ${src?.no ?? ''}` : '手工创建'
    }]
  }
  store.insert('tasks', rec)

  /* 主动关联问题单：回写问题单的任务关联，便于在问题处查看整改任务 */
  lst(nf.relatedProblemIds).forEach(pid => {
    const p = store.findById('problems', pid)
    if (!p) return
    store.pushTimeline(p, { action: '关联任务单', comment: `任务单 ${no} 承接本问题整改` })
    store.update('problems', pid, { relatedTaskIds: Array.from(new Set([...lst(p.relatedTaskIds), rec.id])) },
      { action: '关联任务单', remark: `关联任务单 ${no}` })
  })
  if (nf.source === 'DEMAND' && src) {
    store.update('demands', src.id, { taskIds: Array.from(new Set([...lst(src.taskIds), rec.id])) },
      { action: '派发生产任务', remark: `生成任务单 ${no}` })
    store.pushTimeline(src, { action: '派发生产任务', comment: `生成任务单 ${no}` })
  }
  store.addAudit({
    bizType: 'tasks', bizId: rec.id, bizNo: no, bizTitle: rec.title,
    action: '创建任务单',
    remark: `类型 ${nf.type} · 承接部门 ${nf.dept} · 实施人 ${nf.assignee} · 关联数据问题 ${lst(nf.relatedProblemIds).length} 个`
  })
  store.notify({
    type: 'info', title: `新任务单 ${no} 待派发`,
    body: `任务「${nf.title}」已创建，承接部门：${nf.dept}，实施人：${nf.assignee}。`,
    toRoles: ['producer', 'ops'], link: '/task/list'
  })
  createVisible.value = false
  ElMessage.success(`已创建任务单 ${no}${lst(nf.relatedProblemIds).length ? `，并关联 ${lst(nf.relatedProblemIds).length} 个数据问题` : ''}`)
}

/* ------------------------------------------------------ 详情抽屉 -- */
const detailVisible = ref(false)
const current = ref<any>(null)

function openDetail(t: any) {
  current.value = t
  detailVisible.value = true
}

/* 兼容路由 /task/detail/:id 深链：进入页面即打开对应任务单详情抽屉 */
onMounted(() => {
  const p = route.params.id
  const id = Array.isArray(p) ? p[0] : p
  if (!id) return
  const t = store.findById('tasks', id)
  if (t) openDetail(t)
})
const curProblems = computed(() => lst(current.value?.relatedProblemIds).map((id: string) => store.findById('problems', id)).filter(Boolean) as any[])
const curDemand = computed<any>(() => (current.value?.source === 'DEMAND' && current.value?.sourceId ? store.findById('demands', current.value.sourceId) : null))
const curAudits = computed(() => by((store.table('audits') as any[]).filter(a => a.bizId === current.value?.id), 'operatedAt', 'desc'))

/* ------------------------------------------------------------ 动作 -- */
function dispatch(t: any) {
  store.update('tasks', t.id, { status: 'PENDING_ACCEPT' }, { action: '派发任务', remark: `派发至 ${t.dept}` })
  store.pushTimeline(t, { action: '派发任务', comment: `派发至 ${t.dept}，实施人 ${t.assignee}` })
  store.notify({ type: 'info', title: `任务单 ${t.no} 待接单`, body: `请 ${t.assignee}（${t.dept}）接单实施。`, toRoles: ['producer'], link: '/task/list' })
  ElMessage.success(`已派发任务单 ${t.no} 至 ${t.dept}`)
}

function accept(t: any) {
  store.update('tasks', t.id, { status: 'DOING', assignee: store.user.name }, { action: '接单' })
  store.pushTimeline(t, { action: '接单', comment: '已接单并开始实施' })
  ElMessage.success('已接单，开始实施')
}

async function report(t: any) {
  try {
    const { value } = await ElMessageBox.prompt('请输入当前进度百分比（0-100）', `填报进度 · ${t.no}`, {
      confirmButtonText: '提交', cancelButtonText: '取消', inputValue: String(t.progress ?? 0),
      inputPattern: /^\d{1,3}$/, inputErrorMessage: '请输入 0-100 的整数'
    })
    const p = Math.max(0, Math.min(100, Number(value)))
    const patch: Record<string, any> = { progress: p }
    if (['PENDING_DISPATCH', 'PENDING_ACCEPT', 'SUSPENDED'].includes(t.status)) patch.status = 'DOING'
    store.update('tasks', t.id, patch, { action: `填报进度 ${p}%`, remark: `当前进度 ${p}%` })
    store.pushTimeline(t, { action: `填报进度 ${p}%`, comment: p >= 100 ? '实施内容已完成，可提交验证' : '按计划推进中' })
    ElMessage.success(`已填报进度 ${p}%`)
  } catch { /* 取消 */ }
}

async function suspend(t: any) {
  try {
    const { value } = await ElMessageBox.prompt('请填写挂起原因', `挂起任务单 ${t.no}`, {
      confirmButtonText: '确认挂起', cancelButtonText: '取消', inputType: 'textarea'
    })
    store.update('tasks', t.id, { status: 'SUSPENDED', suspendReason: value }, { action: '挂起任务', remark: value })
    store.pushTimeline(t, { action: '挂起任务', comment: value })
    ElMessage.warning('任务已挂起')
  } catch { /* 取消 */ }
}

function submitVerify(t: any) {
  store.update('tasks', t.id, { status: 'PENDING_VERIFY', progress: 100 }, { action: '提交验证' })
  store.pushTimeline(t, { action: '提交验证', comment: '实施完成，提交成果验证' })
  store.notify({
    type: 'info', title: `任务单 ${t.no} 待验证`,
    body: `任务「${t.title}」已提交验证，请验证实施成果。`, toRoles: ['desk', 'supplier', 'producer'], link: '/task/list'
  })
  ElMessage.success('已提交验证，等待验证人确认')
}

function verifyPass(t: any) {
  store.update('tasks', t.id, { status: 'DONE', verifyResult: '通过', progress: 100 }, { action: '验证通过' })
  store.pushTimeline(t, { action: '验证通过', comment: '抽样比对一致，交付物符合要求' })
  store.notify({
    type: 'success', title: `任务单 ${t.no} 验证通过`,
    body: `任务「${t.title}」已通过验证，交付物可用于交付与授权。`, toRoles: ['consumer', 'admin'], link: '/task/list'
  })
  advanceSourceDemand(t)
  ElMessage.success('验证通过，任务已完成')
}

/**
 * 任务验证通过后回写来源需求单：
 * 该需求单的关联任务**全部**验证通过时，需求单流转到「待验收」，由用数方验收。
 * 否则需求单会一直停在「实施中」，流转条的第 6 步（待验收）永远点不亮。
 */
function advanceSourceDemand(t: any) {
  if (t.source !== 'DEMAND' || !t.sourceId) return
  const src = store.findById('demands', t.sourceId) as any
  if (!src || !['IMPLEMENTING', 'APPROVED'].includes(src.status)) return
  const siblings = lst(src.taskIds).map((id: string) => store.findById('tasks', id)).filter(Boolean) as any[]
  if (siblings.length && siblings.every(x => x.status === 'DONE')) {
    store.update('demands', src.id, { status: 'PENDING_ACCEPTANCE', currentHandler: src.applicant }, {
      action: '实施完成，转需求验收',
      remark: `关联任务单已全部验证通过（含 ${t.no}）`
    })
    store.pushTimeline(src, { action: '提交验收', comment: '关联任务单已全部验证通过，等待用数方验收' })
    store.notify({
      type: 'info', title: `需求单 ${src.no} 待验收`,
      body: `需求「${src.title}」的实施任务已全部验证通过，请及时验收。`,
      toRoles: ['consumer'], link: `/demand/detail/${src.id}`
    })
  }
}

async function verifyFail(t: any) {
  try {
    const { value } = await ElMessageBox.prompt('请填写验证不通过原因（将反馈给生产部门）', `验证不通过 · ${t.no}`, {
      confirmButtonText: '确认退回', cancelButtonText: '取消', inputType: 'textarea',
      inputValue: '抽样比对存在不一致，请核对原始数据后重新提交。'
    })
    store.update('tasks', t.id, { status: 'REJECTED', verifyResult: '不通过', rejectReason: value }, { action: '验证不通过', remark: value })
    store.pushTimeline(t, { action: '验证不通过', comment: value })
    store.notify({ type: 'warning', title: `任务单 ${t.no} 验证不通过`, body: `退回原因：${value}`, toRoles: ['producer'], link: '/task/list' })
    ElMessage.warning('已退回生产部门重做')
  } catch { /* 取消 */ }
}

/**
 * 重新实施：验证不通过被退回的任务重新进入实施中。
 * 必要性：退回（REJECTED）的任务若没有回到实施的入口，来源需求单的关联任务永远无法全部完成，
 * 需求单也就永远到不了「待验收」——状态机会卡死。
 */
function restart(t: any) {
  store.update('tasks', t.id, { status: 'DOING' }, {
    action: '重新实施',
    remark: t.rejectReason ? `按退回意见重新实施：${t.rejectReason}` : '按验证意见重新实施'
  })
  store.pushTimeline(t, { action: '重新实施', comment: '生产部门按退回意见重新实施' })
  if (t.source === 'DEMAND' && t.sourceId) {
    const src = store.findById('demands', t.sourceId) as any
    if (src && ['PENDING_ACCEPTANCE'].includes(src.status)) {
      store.update('demands', src.id, { status: 'IMPLEMENTING' }, { action: '任务退回重做，需求回到实施中' })
      store.pushTimeline(src, { action: '任务退回重做', comment: `任务单 ${t.no} 验证不通过，需求回到实施中` })
    }
  }
  ElMessage.success('已重新进入实施中，可继续填报进度并提交验证')
}

function actionsOf(t: any): { label: string; type?: string; run: () => void }[] {
  const out: { label: string; type?: string; run: () => void }[] = []
  const can = store.can
  if (t.status === 'PENDING_DISPATCH' && (can('task.manage') || can('admin.all'))) out.push({ label: '派发', type: 'primary', run: () => dispatch(t) })
  if (t.status === 'PENDING_ACCEPT' && (can('task.implement') || can('admin.all'))) out.push({ label: '接单', type: 'primary', run: () => accept(t) })
  if (t.status === 'REJECTED' && (can('task.implement') || can('admin.all'))) out.push({ label: '重新实施', type: 'primary', run: () => restart(t) })
  if (['DOING', 'SUSPENDED', 'PENDING_DISPATCH', 'PENDING_ACCEPT'].includes(t.status) && (can('task.implement') || can('admin.all'))) {
    out.push({ label: '填报进度', run: () => report(t) })
  }
  if (t.status === 'DOING' && (can('task.manage') || can('admin.all'))) out.push({ label: '挂起', run: () => suspend(t) })
  if (['DOING', 'SUSPENDED'].includes(t.status) && (can('task.implement') || can('admin.all'))) {
    out.push({ label: '提交验证', type: 'primary', run: () => submitVerify(t) })
  }
  if (t.status === 'PENDING_VERIFY' && (can('task.verify') || can('admin.all'))) {
    out.push({ label: '验证通过', type: 'primary', run: () => verifyPass(t) })
    out.push({ label: '验证不通过', run: () => verifyFail(t) })
  }
  out.push({ label: '详情', run: () => openDetail(t) })
  return out
}

/* ---------------------------------------------------- 来源单据跳转 -- */
function sourceLink(t: any) {
  if (t.source === 'DEMAND' && t.sourceId) return `/demand/detail/${t.sourceId}`
  return ''
}
function sourceLabel(t: any): string {
  return t.source === 'DEMAND' ? '需求单' : t.source === 'PROBLEM' ? '问题单' : '手工创建'
}
</script>

<template>
  <div>
    <PageHead
      title="任务管理"
      desc="根据用户反馈的数据问题创建任务并指定生产部门实施，跟踪任务的审批与最终实施情况，监控各生产部门任务单处理状态。"
    >
      <template #actions>
        <el-button type="primary" @click="openCreate"><el-icon><Plus /></el-icon> 新建任务单</el-button>
      </template>
    </PageHead>

    <StatCards :items="stats" />

    <div class="grid grid--side mb-4">
      <div class="card">
        <div class="card__head">
          <div class="card__title">任务单列表</div>
          <div class="card__sub">可按来源单据追溯任务来源；点击行操作「详情」查看任务关联信息</div>
        </div>
        <div class="toolbar">
          <div class="toolbar__fields">
            <div class="field"><span class="field__label">关键字</span>
              <el-input v-model="f.kw" placeholder="任务单号 / 名称 / 来源单号 / 实施人" clearable style="width: 230px" />
            </div>
            <div class="field"><span class="field__label">状态</span>
              <el-select v-model="f.status" placeholder="全部状态" clearable style="width: 140px">
                <el-option v-for="(o, k) in config.dicts.TaskStatus" :key="k" :label="o.label" :value="k" />
              </el-select>
            </div>
            <div class="field"><span class="field__label">类型</span>
              <el-select v-model="f.type" placeholder="全部类型" clearable style="width: 130px">
                <el-option v-for="(o, k) in config.dicts.TaskType" :key="k" :label="o.label" :value="k" />
              </el-select>
            </div>
            <div class="field"><span class="field__label">承接部门</span>
              <el-select v-model="f.dept" placeholder="全部部门" clearable filterable style="width: 180px">
                <el-option v-for="o in deptOptions" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </div>
            <div class="field"><span class="field__label">来源</span>
              <el-select v-model="f.source" placeholder="全部来源" clearable style="width: 130px">
                <el-option label="需求单" value="DEMAND" />
                <el-option label="问题单" value="PROBLEM" />
                <el-option label="手工创建" value="MANUAL" />
              </el-select>
            </div>
          </div>
          <div class="toolbar__actions">
            <el-button @click="Object.assign(f, { kw: '', status: '', type: '', dept: '', source: '' })">重置</el-button>
            <span class="text-sm muted">共 <b>{{ filtered.length }}</b> 条</span>
          </div>
        </div>

        <el-table :data="filtered" style="width: 100%" row-key="id">
          <el-table-column label="任务单号" width="146">
            <template #default="{ row }">
              <el-button link type="primary" @click="openDetail(row)">{{ row.no }}</el-button>
            </template>
          </el-table-column>
          <el-table-column label="任务名称" min-width="220" show-overflow-tooltip>
            <template #default="{ row }">
              <div class="cell-main">{{ row.title }}</div>
              <div class="cell-sub">{{ row.content }}</div>
            </template>
          </el-table-column>
          <el-table-column label="类型" width="98">
            <template #default="{ row }"><StatusTag dict="TaskType" :value="row.type" :dot="false" /></template>
          </el-table-column>
          <el-table-column label="来源" width="140">
            <template #default="{ row }">
              <el-button v-if="sourceLink(row)" link type="primary" size="small" @click="$router.push(sourceLink(row))">
                {{ sourceLabel(row) }} {{ row.sourceNo }}
              </el-button>
              <span v-else class="text-sm muted">手工创建</span>
            </template>
          </el-table-column>
          <el-table-column label="承接部门" width="176" show-overflow-tooltip>
            <template #default="{ row }">
              <div>{{ row.dept }}</div>
              <div class="cell-sub">实施人：{{ row.assignee }}</div>
            </template>
          </el-table-column>
          <el-table-column label="优先级" width="92">
            <template #default="{ row }"><StatusTag dict="Priority" :value="row.priority" :dot="false" /></template>
          </el-table-column>
          <el-table-column label="计划起止" width="180">
            <template #default="{ row }">
              <div>{{ row.planStart }} ~ {{ row.planEnd }}</div>
              <div class="cell-sub" :class="{ 'danger-text': overdue(row) }">
                {{ overdue(row) ? '已超期' : row.status === 'DONE' ? '已完成' : '剩余 ' + Math.max(0, Math.round(-hoursAgo(row.planEnd) / 24)) + ' 天' }}
              </div>
            </template>
          </el-table-column>
          <el-table-column label="进度" width="150">
            <template #default="{ row }">
              <el-progress :percentage="row.progress" :stroke-width="8"
                :status="row.status === 'DONE' ? 'success' : row.status === 'REJECTED' ? 'exception' : undefined" />
            </template>
          </el-table-column>
          <el-table-column label="状态" width="104">
            <template #default="{ row }"><StatusTag dict="TaskStatus" :value="row.status" /></template>
          </el-table-column>
          <el-table-column label="操作" width="160" fixed="right">
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
              <div class="empty-box__text">没有符合条件的任务单</div>
            </div>
          </template>
        </el-table>
      </div>

      <div>
        <div class="card mb-4">
          <div class="card__head">
            <div class="card__title">承接部门任务分布</div>
            <div class="card__sub">监控各生产部门任务单处理状态</div>
          </div>
          <div class="card__body">
            <ChartBox kind="hbar" :data="deptChart" />
          </div>
        </div>
        <div class="card">
          <div class="card__head"><div class="card__title">任务来源构成</div></div>
          <div class="card__body">
            <ChartBox
              kind="donut"
              center-label="任务单"
              :data="[
                { name: '需求单派发', value: allRows.filter(t => t.source === 'DEMAND').length },
                { name: '问题单整改', value: allRows.filter(t => t.source === 'PROBLEM').length },
                { name: '手工创建', value: allRows.filter(t => t.source === 'MANUAL').length }
              ]"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- ================= 任务单详情抽屉 ================= -->
    <el-drawer v-model="detailVisible" size="860px">
      <template #header>
        <div class="flex items-center gap-2">
          <span class="bold">任务单详情</span>
          <span class="mono text-sm muted">{{ current?.no }}</span>
          <StatusTag v-if="current" dict="TaskStatus" :value="current.status" />
        </div>
      </template>
      <template v-if="current">
        <!-- 基本信息 -->
        <div class="drawer-sec">
          <div class="drawer-sec__title">基本信息</div>
          <div class="desc-grid">
            <div class="desc-item"><span class="desc-item--label">任务单号</span><span class="desc-item__value mono">{{ current.no }}</span></div>
            <div class="desc-item"><span class="desc-item--label">任务名称</span><span class="desc-item__value bold">{{ current.title }}</span></div>
            <div class="desc-item"><span class="desc-item--label">任务类型</span><span class="desc-item__value"><StatusTag dict="TaskType" :value="current.type" :dot="false" /></span></div>
            <div class="desc-item"><span class="desc-item--label">优先级</span><span class="desc-item__value"><StatusTag dict="Priority" :value="current.priority" :dot="false" /></span></div>
            <div class="desc-item"><span class="desc-item--label">承接部门</span><span class="desc-item__value">{{ current.dept }}</span></div>
            <div class="desc-item"><span class="desc-item--label">实施人</span><span class="desc-item__value">{{ current.assignee }}</span></div>
            <div class="desc-item"><span class="desc-item--label">计划起止</span><span class="desc-item__value">{{ current.planStart }} ~ {{ current.planEnd }}</span></div>
            <div class="desc-item"><span class="desc-item--label">当前进度</span><span class="desc-item__value">{{ current.progress }}%</span></div>
            <div class="desc-item">
              <span class="desc-item--label">任务来源</span>
              <span class="desc-item__value">
                <el-button v-if="sourceLink(current)" link type="primary" size="small" @click="$router.push(sourceLink(current))">
                  {{ sourceLabel(current) }} {{ current.sourceNo }}
                </el-button>
                <span v-else>手工创建</span>
              </span>
            </div>
            <div class="desc-item"><span class="desc-item--label">验证结果</span><span class="desc-item__value">{{ current.verifyResult || '待验证' }}</span></div>
            <div v-if="current.rejectReason" class="desc-item desc-item--wide">
              <span class="desc-item--label">退回原因</span><span class="desc-item__value" style="color: var(--danger-fg)">{{ current.rejectReason }}</span>
            </div>
            <div v-if="curDemand" class="desc-item desc-item--wide">
              <span class="desc-item--label">来源需求</span>
              <span class="desc-item__value">{{ curDemand.no }} · {{ curDemand.title }}（{{ curDemand.applicantOrg }}）</span>
            </div>
          </div>
        </div>

        <!-- 任务内容与交付标准 -->
        <div class="drawer-sec">
          <div class="drawer-sec__title">任务内容与交付标准</div>
          <div class="drawer-sec__body">
            <div class="mb-2"><span class="muted">任务内容：</span>{{ current.content || '—' }}</div>
            <div><span class="muted">交付标准：</span>{{ current.deliverable || '—' }}</div>
          </div>
        </div>

        <!-- 里程碑 -->
        <div class="drawer-sec">
          <div class="drawer-sec__title">里程碑</div>
          <div class="tl">
            <div
              v-for="(m, i) in lst(current.milestones)"
              :key="i"
              class="tl__item"
              :class="m.doneDate ? 'tl__item--done' : i === 0 ? 'tl__item--active' : ''"
            >
              <div class="tl__dot" />
              <div class="tl__head">
                <span class="tl__action">{{ m.name }}</span>
                <span class="tl__meta">计划 {{ m.planDate }}{{ m.doneDate ? ` · 完成 ${m.doneDate}` : ' · 未完成' }}</span>
              </div>
            </div>
          </div>
          <div v-if="!lst(current.milestones).length" class="empty-box">
            <div class="empty-box__icon"><el-icon><Warning /></el-icon></div>
            <div class="empty-box__text">未设置里程碑</div>
          </div>
        </div>

        <!-- 关联资源 -->
        <div class="drawer-sec">
          <div class="drawer-sec__title">关联资源</div>
          <div v-if="!lst(current.resources).length" class="empty-box">
            <div class="empty-box__icon"><el-icon><FolderOpened /></el-icon></div>
            <div class="empty-box__text">未关联数据资源</div>
          </div>
          <el-table v-else :data="lst(current.resources).map((id: string) => resourceMap[id]).filter(Boolean)" size="small" style="width: 100%">
            <el-table-column label="资源名称" min-width="180">
              <template #default="{ row }">
                <div class="cell-main">{{ row.name }}</div>
                <div class="cell-sub mono">{{ row.code }}</div>
              </template>
            </el-table-column>
            <el-table-column label="类型" width="98"><template #default="{ row }"><StatusTag dict="ResourceType" :value="row.type" :dot="false" /></template></el-table-column>
            <el-table-column prop="layer" label="分层" width="76" />
            <el-table-column prop="domain" label="主题域" width="86" />
            <el-table-column label="敏感级别" width="104"><template #default="{ row }"><StatusTag dict="SecurityLevel" :value="row.securityLevel" /></template></el-table-column>
          </el-table>
        </div>

        <!-- 关联的数据问题（原文明确要求） -->
        <div class="drawer-sec">
          <div class="drawer-sec__title">
            关联的数据问题（{{ curProblems.length }}）
            <span class="text-xs muted">掌握实施任务来源</span>
          </div>
          <div v-if="!curProblems.length" class="empty-box">
            <div class="empty-box__icon">?</div>
            <div class="empty-box__text">本任务单未关联数据问题；可在新建任务单时主动关联问题单</div>
          </div>
          <div v-for="p in curProblems" :key="p.id" class="prob-item">
            <div class="flex items-center justify-between">
              <span class="mono text-sm">{{ p.no }}</span>
              <StatusTag dict="ProblemStatus" :value="p.status" />
            </div>
            <div class="bold mt-1">{{ p.title }}</div>
            <div class="text-xs muted mt-1">{{ p.dept }} · 处理人 {{ p.handler }} · 优先级 {{ p.priority }} · 严重程度 {{ p.severity }}</div>
            <div v-if="p.rootCause" class="text-sm mt-2">根因：{{ p.rootCause }}</div>
            <div v-if="p.knownError?.workaround" class="text-sm mt-1">临时方案：{{ p.knownError.workaround }}</div>
          </div>
        </div>

        <!-- 处理记录 -->
        <div class="drawer-sec">
          <div class="drawer-sec__title">处理记录（{{ lst(current.timeline).length }}）</div>
          <div v-if="!lst(current.timeline).length" class="empty-box">
            <div class="empty-box__icon"><el-icon><Clock /></el-icon></div>
            <div class="empty-box__text">暂无处理记录</div>
          </div>
          <div v-else class="tl">
            <div
              v-for="(t, i) in lst(current.timeline)"
              :key="i"
              class="tl__item"
              :class="i === lst(current.timeline).length - 1 ? 'tl__item--active' : /不通过|挂起/.test(t.action) ? 'tl__item--danger' : 'tl__item--done'"
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

        <!-- 审计 -->
        <div class="drawer-sec">
          <div class="drawer-sec__title">审计记录（{{ curAudits.length }}）</div>
          <el-table :data="curAudits" size="small" style="width: 100%">
            <el-table-column label="时间" width="146"><template #default="{ row }">{{ fmtTime(row.operatedAt) }}</template></el-table-column>
            <el-table-column prop="action" label="操作" width="140" />
            <el-table-column label="字段变更（前 → 后）" min-width="220">
              <template #default="{ row }">
                <div v-if="!lst(row.changes).length" class="muted text-sm">—</div>
                <div v-for="(ch, i) in lst(row.changes)" :key="i" class="text-sm">
                  <span class="mono">{{ ch.field }}</span>：<span class="muted">{{ ch.before }}</span> → <span class="bold">{{ ch.after }}</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="操作人" width="120">
              <template #default="{ row }">
                <div>{{ row.operator }}</div>
                <div class="cell-sub">{{ row.operatorOrg }}</div>
              </template>
            </el-table-column>
            <el-table-column prop="ip" label="IP" width="126" />
            <template #empty>
              <div class="empty-box">
                <div class="empty-box__icon"><el-icon><Tickets /></el-icon></div>
                <div class="empty-box__text">暂无审计记录</div>
              </div>
            </template>
          </el-table>
        </div>
      </template>

      <template #footer>
        <el-button @click="detailVisible = false">关闭</el-button>
        <template v-if="current">
          <el-button v-for="(a, i) in actionsOf(current).filter(x => x.label !== '详情')" :key="i"
            :type="a.type === 'primary' ? 'primary' : 'default'" @click="a.run()">{{ a.label }}</el-button>
        </template>
      </template>
    </el-drawer>

    <!-- ================= 新建任务单弹窗 ================= -->
    <el-dialog v-model="createVisible" title="新建任务单" width="720px">
      <el-alert class="mb-3" type="info" :closable="false" show-icon
        title="新建任务单时可主动关联问题单（也可在问题管理处为问题单关联任务单）"
        description="任务单创建后处于「待派发」状态，派发至生产部门后由实施人接单实施。" />
      <el-form label-width="104px">
        <el-form-item label="任务名称" required><el-input v-model="nf.title" placeholder="请输入任务名称" /></el-form-item>
        <el-form-item label="任务类型">
          <el-select v-model="nf.type" style="width: 220px">
            <el-option v-for="(o, k) in config.dicts.TaskType" :key="k" :label="o.label" :value="k" />
          </el-select>
        </el-form-item>
        <el-form-item label="任务来源">
          <el-radio-group v-model="nf.source">
            <el-radio-button value="DEMAND">需求单派发</el-radio-button>
            <el-radio-button value="PROBLEM">由数据问题创建</el-radio-button>
            <el-radio-button value="MANUAL">手工创建</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="nf.source === 'DEMAND'" label="关联需求单">
          <el-select v-model="nf.sourceId" filterable clearable placeholder="选择需求单（自动带出内容与资源）" style="width: 100%" @change="onSourceChange">
            <el-option v-for="d in demandOptions" :key="d.id" :label="`${d.no} ${d.title}`" :value="d.id" />
          </el-select>
        </el-form-item>
        <el-form-item v-else-if="nf.source === 'PROBLEM'" label="关联问题单">
          <el-select v-model="nf.sourceId" filterable clearable placeholder="选择问题单（自动带出根因整改内容）" style="width: 100%" @change="onSourceChange">
            <el-option v-for="p in problemOptions" :key="p.id" :label="`${p.no} ${p.title}`" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="主动关联问题">
          <el-select v-model="nf.relatedProblemIds" multiple filterable placeholder="可多选，任务单详情将展示关联的数据问题" style="width: 100%">
            <el-option v-for="p in problemOptions" :key="p.id" :label="`${p.no} ${p.title}`" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="承接部门">
          <el-select v-model="nf.dept" filterable allow-create style="width: 260px">
            <el-option v-for="o in deptOptions" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="实施人">
          <el-select v-model="nf.assignee" filterable style="width: 260px">
            <el-option v-for="u in assigneeOptions" :key="u.id" :label="`${u.name}（${u.org}）`" :value="u.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级">
          <el-radio-group v-model="nf.priority">
            <el-radio-button v-for="(o, k) in config.dicts.Priority" :key="k" :value="k">{{ o.label }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="计划起止">
          <el-date-picker v-model="nf.planStart" type="date" value-format="YYYY-MM-DD" style="width: 168px" />
          <span class="muted" style="margin: 0 var(--sp-2)">~</span>
          <el-date-picker v-model="nf.planEnd" type="date" value-format="YYYY-MM-DD" style="width: 168px" />
        </el-form-item>
        <el-form-item label="关联资源">
          <el-select v-model="nf.resources" multiple filterable placeholder="选择任务涉及的数据资源" style="width: 100%">
            <el-option v-for="r in resources" :key="r.id" :label="`${r.name}（${r.code}）`" :value="r.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="任务内容"><el-input v-model="nf.content" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="交付标准"><el-input v-model="nf.deliverable" type="textarea" :rows="2" placeholder="如：视图 / 采集表 / API 服务配置 + 接口文档" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" @click="createTask">创建任务单</el-button>
      </template>
    </el-dialog>
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
.cell-sub { font-size: var(--fs-xs); color: var(--text-3); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 220px; }
.danger-text { color: var(--danger-fg); }
.drawer-sec { margin-bottom: var(--sp-5); }
.drawer-sec__title {
  font-size: var(--fs-lg); font-weight: 600; margin-bottom: var(--sp-3);
  padding-left: var(--sp-2); border-left: 3px solid var(--brand-500);
  display: flex; align-items: center; gap: var(--sp-2);
}
.drawer-sec__body { font-size: var(--fs-sm); color: var(--text-2); line-height: 1.9; }
.prob-item {
  padding: var(--sp-3); margin-bottom: var(--sp-2);
  border: 1px solid var(--border-2); border-radius: var(--r-md); background: var(--surface-2);
}
</style>
