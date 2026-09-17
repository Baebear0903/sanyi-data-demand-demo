<script setup lang="ts">
/**
 * EvaluationView —— 评价管理（M12）
 *
 * 覆盖原文功能点：
 *  · 评价管理（总述）：基于数据共享过程中用户使用数据的情况进行评价与反馈；对评价与评价反馈的
 *    审批情况进行监控；用数方发起的评价经审批通过后将展示给供数方，供数方的评价反馈经审批通过后
 *    将展示给用数方。
 *  · 评价单详情（10.1）/ 反馈单详情（10.2）：由「评价单 / 反馈单详情」页承载。
 *
 * 核心逻辑：**双向可见性** —— 通过「用数方视角 / 供数方视角」切换，可直观看到
 * "未审批通过的评价供数方不可见、未审批通过的反馈用数方不可见"。
 */
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDemoStore, dictItem } from '@/stores/demo'
import { config } from '@/core/config'
import { by, fmtTime, fromNow, iso, today, truncate, uid } from '@/core/utils'
import PageHead from '@/components/PageHead.vue'
import StatCards from '@/components/StatCards.vue'
import StatusTag from '@/components/StatusTag.vue'

const store = useDemoStore()
const router = useRouter()

/** 安全数组（单据数据为宽松结构，统一收敛为 any[]，便于模板中安全访问） */
const arrAny = (v: unknown): any[] => (Array.isArray(v) ? v : [])

/** 5 个评价维度（建设方案建议：数据质量 / 交付及时性 / 服务态度 / 文档完备性 / 问题响应速度） */
const DIMS = ['数据质量', '交付及时性', '服务态度', '文档完备性', '问题响应速度']

const evaluations = computed(() => by(store.table('evaluations') as any[], 'evaluatedAt', 'desc'))
const statusOptions = Object.entries(config.dicts.EvaluationStatus)
  .map(([v, o]) => ({ value: v, label: (o as { label: string }).label }))

/* ============================================================ 指标 -- */
const stats = computed(() => {
  const rows = evaluations.value
  const scored = rows.filter(r => typeof r.score === 'number')
  const avg = scored.length ? (scored.reduce((s, r) => s + Number(r.score), 0) / scored.length).toFixed(2) : '—'
  return [
    { label: '评价单总数', value: rows.length, unit: '单', icon: 'Star', tone: 'primary' as const },
    { label: '待审批', value: rows.filter(r => r.status === 'PENDING_APPROVE').length, unit: '单', icon: 'EditPen', tone: 'warning' as const, tip: '含待审批的评价与待审批的反馈' },
    { label: '平均分', value: avg, unit: '分', icon: 'TrendCharts', tone: 'success' as const, delta: `已评分 ${scored.length} 单` },
    { label: '有反馈', value: rows.filter(r => r.feedback).length, unit: '单', icon: 'ChatDotRound', tone: 'teal' as const },
    { label: '已驳回', value: rows.filter(r => r.status === 'REJECTED').length, unit: '单', icon: 'CircleClose', tone: 'danger' as const }
  ]
})

/* ============================================== 双向可见性（核心逻辑） -- */
const view = ref<'consumer' | 'supplier'>('consumer')

const visibleRows = computed(() => {
  if (view.value === 'supplier') {
    /* 供数方视角：只有"审批通过"的评价才展示给我方（原文：评价经审批通过后展示给供数方） */
    return evaluations.value.filter(e => e.status === 'APPROVED')
  }
  /* 用数方视角：自己发起的评价全流程可见（含待审批 / 已驳回），供数方反馈需审批通过后可见 */
  return evaluations.value
})

/** 反馈是否对该视角可见（未审批通过的反馈，用数方视角不可见） */
const feedbackVisible = (e: any) => !!e.feedback && (view.value === 'supplier' || e.feedback.status === 'APPROVED')

/* ============================================================ 筛选 -- */
const f = reactive({ kw: '', status: '', hasFeedback: '' })
const filtered = computed(() => {
  return visibleRows.value.filter(e => {
    if (f.status && e.status !== f.status) return false
    if (f.hasFeedback === 'yes' && !e.feedback) return false
    if (f.hasFeedback === 'no' && e.feedback) return false
    if (f.kw) {
      const hay = `${e.no} ${e.title} ${e.demandNo} ${e.evaluator} ${e.evaluatorOrg} ${e.content}`.toLowerCase()
      if (!hay.includes(f.kw.toLowerCase())) return false
    }
    return true
  })
})

const canApprove = computed(() => store.can('eval.approve'))
/** 提交评价权限（eval.submit）：仅评价发起方（用数方）与平台管理员 */
const canSubmit = computed(() => store.can('eval.submit'))
const isSupplierRole = computed(() => store.role.id === 'supplier' || store.role.id === 'admin')

/* ======================================================== 提交评价 -- */
const evalDialog = ref(false)
const evalForm = reactive({ demandId: '', score: 5, content: '' })
const dimForm = reactive<Record<string, number>>({})

/** 可评价的需求单：已交付 / 已评价 */
const evaluableDemands = computed(() =>
  (store.table('demands') as any[]).filter(d => ['DELIVERED', 'EVALUATED'].includes(d.status) || d.deliveredAt)
)

function openEvaluate() {
  if (!canSubmit.value) { ElMessage.warning('当前角色无「提交评价」权限'); return }
  const first = evaluableDemands.value[0]
  evalForm.demandId = first?.id ?? ''
  evalForm.score = 5
  evalForm.content = ''
  DIMS.forEach(d => { dimForm[d] = 5 })
  evalDialog.value = true
}

function submitEvaluation() {
  if (!canSubmit.value) { ElMessage.warning('当前角色无「提交评价」权限'); return }
  const d = store.findById('demands', evalForm.demandId)
  if (!d) { ElMessage.warning('请选择要评价的需求单'); return }
  if (!evalForm.content.trim()) { ElMessage.warning('请填写评价内容'); return }
  const no = 'PJ' + today().replace(/-/g, '') + String(evaluations.value.length + 1).padStart(3, '0')
  const dims: Record<string, number> = {}
  DIMS.forEach(k => { dims[k] = dimForm[k] ?? 5 })
  const rec = store.insert('evaluations', {
    no, title: `对「${d.title}」的评价`, demandId: d.id, demandNo: d.no,
    evaluator: store.user.name, evaluatorOrg: store.user.org,
    score: evalForm.score, evaluatedAt: iso(), content: evalForm.content, dims,
    status: 'PENDING_APPROVE', approvedAt: null, approver: null, rejectReason: null,
    visibleTo: 'SUPPLIER', feedback: null
  })
  store.update('demands', d.id, {
    evaluationId: rec.id, evaluatedAt: iso(),
    status: d.status === 'DELIVERED' ? 'EVALUATED' : d.status
  }, { action: '提交评价', remark: `评价单 ${no}，总体评分 ${evalForm.score} 分` })
  store.pushTimeline(d, { action: '提交评价', comment: `评价单 ${no}，总体评分 ${evalForm.score} 分` })
  store.notify({
    type: 'info', title: `评价单 ${no} 待审批`,
    body: `${store.user.name} 对「${d.title}」提交了评价（${evalForm.score} 分），审批通过后将展示给供数方。`,
    toRoles: ['supplier'], link: `/evaluation/detail/${rec.id}`
  })
  ElMessage.success(`评价已提交（${no}），状态为「待审批」，审批通过后展示给供数方`)
  evalDialog.value = false
}

/* ================================================ 审批 / 驳回评价 -- */
async function approveEvaluation(e: any) {
  try {
    const { value } = await ElMessageBox.prompt('请填写审批意见', `审批评价单 ${e.no}`, {
      confirmButtonText: '审批通过', cancelButtonText: '取消', inputType: 'textarea',
      inputValue: '评价内容属实，同意展示给供数方。'
    })
    store.update('evaluations', e.id, {
      status: 'APPROVED', approver: store.user.name, approvedAt: iso(), rejectReason: null
    }, { action: '评价审批通过', remark: value })
    store.pushTimeline(e, { action: '评价审批通过', comment: value })
    store.notify({
      type: 'success', title: `评价单 ${e.no} 审批通过`,
      body: `供数方现在可以查看该评价：${truncate(e.content, 50)}`,
      toRoles: ['supplier'], link: `/evaluation/detail/${e.id}`
    })
    ElMessage.success('审批通过，该评价已展示给供数方')
  } catch { /* 取消 */ }
}

async function rejectEvaluation(e: any) {
  try {
    const { value } = await ElMessageBox.prompt('请填写驳回原因（将反馈给评价人）', `驳回评价单 ${e.no}`, {
      confirmButtonText: '确认驳回', cancelButtonText: '取消', inputType: 'textarea',
      inputValue: '评价内容与本次交付无关，请补充具体问题描述后重新提交。'
    })
    store.update('evaluations', e.id, {
      status: 'REJECTED', approver: store.user.name, rejectReason: value
    }, { action: '评价审批驳回', remark: value })
    store.pushTimeline(e, { action: '评价审批驳回', comment: value })
    store.notify({
      type: 'warning', title: `评价单 ${e.no} 被驳回`,
      body: `驳回原因：${value}`, toRoles: ['consumer'], link: `/evaluation/detail/${e.id}`
    })
    ElMessage.warning('已驳回，该评价不会展示给供数方')
  } catch { /* 取消 */ }
}

/* ==================================================== 提交 / 审批反馈 -- */
const fbDialog = ref(false)
const fbForm = reactive({ id: '', content: '' })
const fbTarget = ref<any>(null)

function openFeedback(e: any) {
  fbTarget.value = e
  fbForm.id = e.id
  fbForm.content = e.feedback?.content ?? ''
  fbDialog.value = true
}

function submitFeedback() {
  const e = fbTarget.value
  if (!e) return
  if (!fbForm.content.trim()) { ElMessage.warning('请填写反馈内容'); return }
  const feedback = {
    id: e.feedback?.id ?? uid('fb'),
    user: store.user.name,
    content: fbForm.content,
    at: iso(),
    status: 'PENDING_APPROVE',
    approvedAt: null
  }
  store.update('evaluations', e.id, { feedback }, {
    action: '提交评价反馈', remark: `反馈待审批：${truncate(fbForm.content, 40)}`
  })
  store.pushTimeline(e, { action: '供数方提交反馈', comment: fbForm.content })
  store.notify({
    type: 'info', title: `评价单 ${e.no} 收到供数方反馈`,
    body: '反馈已提交，审批通过后将展示给用数方。',
    toRoles: ['consumer', 'supplier'], link: `/evaluation/detail/${e.id}`
  })
  ElMessage.success('反馈已提交，状态为「待审批」，审批通过后展示给用数方')
  fbDialog.value = false
}

async function approveFeedback(e: any) {
  try {
    const { value } = await ElMessageBox.prompt('请填写反馈审批意见', `审批反馈（评价单 ${e.no}）`, {
      confirmButtonText: '审批通过', cancelButtonText: '取消', inputType: 'textarea',
      inputValue: '反馈内容属实，同意展示给用数方。'
    })
    store.update('evaluations', e.id, {
      feedback: { ...e.feedback, status: 'APPROVED', approvedAt: iso() }
    }, { action: '反馈审批通过', remark: value })
    store.notify({
      type: 'success', title: `评价单 ${e.no} 的反馈已审批通过`,
      body: `供数方反馈已展示给用数方：${truncate(e.feedback?.content ?? '', 50)}`,
      toRoles: ['consumer'], link: `/evaluation/detail/${e.id}`
    })
    ElMessage.success('反馈审批通过，已展示给用数方')
  } catch { /* 取消 */ }
}

function rejectFeedback(e: any) {
  store.update('evaluations', e.id, {
    feedback: { ...e.feedback, status: 'REJECTED', approvedAt: null }
  }, { action: '反馈审批驳回', remark: '反馈内容不符合要求，不予展示' })
  store.notify({
    type: 'warning', title: `评价单 ${e.no} 的反馈被驳回`,
    body: '反馈审批未通过，用数方不可见。', toRoles: ['supplier'], link: `/evaluation/detail/${e.id}`
  })
  ElMessage.warning('反馈已驳回，用数方视角不可见')
}

/* ========================================================== 行操作 -- */
function actionsOf(e: any): { label: string; type?: string; run: () => void }[] {
  const out: { label: string; type?: string; run: () => void }[] = []
  if (e.status === 'PENDING_APPROVE' && canApprove.value) {
    out.push({ label: '审批通过', type: 'primary', run: () => approveEvaluation(e) })
    out.push({ label: '驳回', run: () => rejectEvaluation(e) })
  }
  if (e.status === 'APPROVED' && !e.feedback && isSupplierRole.value) {
    out.push({ label: '提交反馈', type: 'primary', run: () => openFeedback(e) })
  }
  if (e.feedback?.status === 'PENDING_APPROVE' && canApprove.value) {
    out.push({ label: '审批反馈', type: 'primary', run: () => approveFeedback(e) })
    out.push({ label: '驳回反馈', run: () => rejectFeedback(e) })
  }
  out.push({ label: '详情', run: () => router.push(`/evaluation/detail/${e.id}`) })
  return out
}

const avgOf = (dims: Record<string, number> | undefined) => {
  const vals = DIMS.map(k => Number(dims?.[k] ?? 0))
  return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—'
}

function exportList() {
  try {
    const rows: (string | number)[][] = [['评价单号', '关联需求单', '评价人', '组织', '总体评分', '维度均分', '评价内容', '评价时间', '审批状态', '反馈状态']]
    filtered.value.forEach(e => rows.push([
      e.no, e.demandNo, e.evaluator, e.evaluatorOrg, e.score, avgOf(e.dims),
      String(e.content).replace(/\n/g, ' '), e.evaluatedAt, dictItem('EvaluationStatus', e.status).label,
      e.feedback ? (e.feedback.status === 'APPROVED' ? '反馈已通过' : e.feedback.status === 'REJECTED' ? '反馈已驳回' : '反馈待审批') : '无反馈'
    ]))
    const csv = '\ufeff' + rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `评价管理_${today()}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    ElMessage.success(`已导出 ${filtered.value.length} 条评价记录`)
  } catch {
    ElMessage.warning('当前浏览器限制了文件下载，导出未能完成')
  }
}
</script>

<template>
  <div>
    <PageHead
      title="评价管理"
      desc="评价与反馈的提交、审批与双向可见性管理。"
    >
      <template #actions>
        <el-button @click="exportList"><el-icon><Download /></el-icon> 导出</el-button>
        <el-button type="primary" :disabled="!canSubmit" @click="openEvaluate"><el-icon><Plus /></el-icon> 提交评价</el-button>
      </template>
    </PageHead>

    <StatCards :items="stats" />

    <!-- ================================================ 可见性说明 -- -->
    <div class="card">
      <div class="card__head">
        <div class="card__title">评价与反馈的双向可见性</div>
        <div class="card__sub">审批通过后，评价与反馈才对双方互相可见</div>
        <div class="card__spacer" />
        <el-radio-group v-model="view" size="small">
          <el-radio-button value="consumer">以用数方视角</el-radio-button>
          <el-radio-button value="supplier">以供数方视角</el-radio-button>
        </el-radio-group>
      </div>
      <div class="card__body">
        <div class="grid grid--2">
          <div class="visi-cell" :class="{ 'visi-cell--on': view === 'consumer' }">
            <div class="bold"><el-icon><User /></el-icon> 用数方视角（评价发起方）</div>
            <ul class="visi-list">
              <li>可见：本人 / 本单位发起的评价（含待审批、已驳回，便于跟踪审批进度）</li>
              <li>可见：<b>审批通过</b>后展示出来的供数方反馈</li>
              <li>不可见：审批未通过的供数方反馈（显示为「反馈审批中，暂不可见」）</li>
            </ul>
          </div>
          <div class="visi-cell" :class="{ 'visi-cell--on': view === 'supplier' }">
            <div class="bold"><el-icon><OfficeBuilding /></el-icon> 供数方视角（资源归属方 / 被评价方）</div>
            <ul class="visi-list">
              <li>可见：<b>审批通过</b>的评价及其评分、评价内容（未审批通过的评价完全不可见）</li>
              <li>可见：本方提交的反馈（含待审批）</li>
              <li>不可见：其他供数方、其他组织的评价</li>
            </ul>
          </div>
        </div>
        <div class="text-xs muted mt-3">
          当前为「{{ view === 'consumer' ? '用数方' : '供数方' }}视角」：列表显示 <b>{{ filtered.length }}</b> 条评价。
          评价与反馈的审批由「供数方 / 平台管理员」承担。
        </div>
      </div>
    </div>

    <!-- ================================================== 筛选 + 表格 -- -->
    <div class="card">
      <div class="card__head">
        <div class="card__title">评价单列表</div>
        <div class="card__sub">评分与维度分由最终用户填写，评价数据同时用于统计分析</div>
        <div class="card__spacer" />
        <el-input v-model="f.kw" placeholder="评价单号 / 需求单号 / 评价人 / 内容" clearable size="small" style="width: 240px">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-select v-model="f.status" placeholder="全部审批状态" clearable size="small" style="width: 150px">
          <el-option v-for="o in statusOptions" :key="o.value" :label="o.label" :value="o.value" />
        </el-select>
        <el-select v-model="f.hasFeedback" placeholder="反馈" clearable size="small" style="width: 130px">
          <el-option label="有反馈" value="yes" />
          <el-option label="无反馈" value="no" />
        </el-select>
      </div>
      <div class="card__body card__body--flush">
        <el-table :data="filtered" style="width: 100%" row-key="id">
          <el-table-column label="评价单号" width="150">
            <template #default="{ row }">
              <el-button link type="primary" @click="router.push(`/evaluation/detail/${row.id}`)">{{ row.no }}</el-button>
            </template>
          </el-table-column>
          <el-table-column label="关联需求单" width="150">
            <template #default="{ row }">
              <el-button link type="primary" @click="router.push(`/demand/detail/${row.demandId}`)">{{ row.demandNo }}</el-button>
            </template>
          </el-table-column>
          <el-table-column label="评价人 / 组织" width="170" show-overflow-tooltip>
            <template #default="{ row }">
              <div class="cell-main">{{ row.evaluator }}</div>
              <div class="cell-sub">{{ row.evaluatorOrg }}</div>
            </template>
          </el-table-column>
          <el-table-column label="总体评分" width="170">
            <template #default="{ row }">
              <el-rate :model-value="row.score" disabled size="small" />
              <div class="cell-sub">维度均分 {{ avgOf(row.dims) }}</div>
            </template>
          </el-table-column>
          <el-table-column label="评价内容摘要" min-width="220" show-overflow-tooltip>
            <template #default="{ row }">
              <div>{{ truncate(row.content, 48) }}</div>
            </template>
          </el-table-column>
          <el-table-column label="评价时间" width="132">
            <template #default="{ row }">
              <div>{{ fmtTime(row.evaluatedAt).slice(5, 16) }}</div>
              <div class="cell-sub">{{ fromNow(row.evaluatedAt) }}</div>
            </template>
          </el-table-column>
          <el-table-column label="审批状态" width="118">
            <template #default="{ row }">
              <StatusTag dict="EvaluationStatus" :value="row.status" />
              <div v-if="row.approver" class="cell-sub">{{ row.approver }} 审批</div>
            </template>
          </el-table-column>
          <el-table-column label="反馈" width="150">
            <template #default="{ row }">
              <template v-if="feedbackVisible(row)">
                <StatusTag
                  :label="row.feedback.status === 'APPROVED' ? '反馈已通过' : row.feedback.status === 'REJECTED' ? '反馈已驳回' : '反馈待审批'"
                  :tone="row.feedback.status === 'APPROVED' ? 'success' : row.feedback.status === 'REJECTED' ? 'danger' : 'warning'"
                />
                <div class="cell-sub">{{ row.feedback.user }} · {{ fmtTime(row.feedback.at).slice(5, 16) }}</div>
              </template>
              <template v-else-if="row.feedback">
                <span class="text-xs" style="color: var(--warning-fg)"><el-icon><Lock /></el-icon> 反馈审批中，当前视角不可见</span>
              </template>
              <span v-else class="muted text-xs">暂无反馈</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right">
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
              <div class="empty-box__text">
                {{ view === 'supplier' ? '当前视角下没有审批通过的评价（未审批通过的评价不展示给供数方）' : '没有符合条件的评价单' }}
              </div>
            </div>
          </template>
        </el-table>
      </div>
      <div class="card__foot">
        <span class="text-sm muted">
          共 <b>{{ filtered.length }}</b> 条 ·
          视角：{{ view === 'consumer' ? '用数方（可见评价 + 已审批反馈）' : '供数方（仅可见审批通过的评价）' }}
        </span>
      </div>
    </div>

    <!-- ==================================================== 提交评价 -- -->
    <el-dialog v-model="evalDialog" title="提交评价" width="620px">
      <el-form label-width="110px">
        <el-form-item label="需求单" required>
          <el-select v-model="evalForm.demandId" filterable placeholder="选择已交付 / 已完成的需求单" style="width: 100%">
            <el-option
              v-for="d in evaluableDemands"
              :key="d.id"
              :label="`${d.no} ${truncate(d.title, 26)}`"
              :value="d.id"
            >
              <span>{{ d.no }}</span>
              <span class="muted" style="float: right">{{ dictItem('DemandStatus', d.status).label }}</span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="总体评分" required>
          <el-rate v-model="evalForm.score" show-score score-template="{value} 分" />
        </el-form-item>
        <el-form-item v-for="d in DIMS" :key="d" :label="d">
          <el-rate v-model="dimForm[d]" />
        </el-form-item>
        <el-form-item label="评价内容" required>
          <el-input v-model="evalForm.content" type="textarea" :rows="4" placeholder="请填写评价内容（数据质量、交付情况、服务体验等）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="evalDialog = false">取消</el-button>
        <el-button type="primary" :disabled="!canSubmit" @click="submitEvaluation">提交评价</el-button>
      </template>
    </el-dialog>

    <!-- ==================================================== 提交反馈 -- -->
    <el-dialog v-model="fbDialog" title="提交评价反馈（供数方）" width="600px">
      <div v-if="fbTarget" class="mb-3">
        <div class="text-sm muted">原始评价单：{{ fbTarget.no }} · {{ fbTarget.evaluator }}（{{ fbTarget.evaluatorOrg }}）</div>
        <div class="tl__quote mt-2">
          <el-rate :model-value="fbTarget.score" disabled size="small" />
          <div class="mt-1">{{ fbTarget.content }}</div>
        </div>
      </div>
      <el-form label-width="88px">
        <el-form-item label="反馈内容" required>
          <el-input v-model="fbForm.content" type="textarea" :rows="4" placeholder="请填写整改措施、说明或后续计划" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="fbDialog = false">取消</el-button>
        <el-button type="primary" @click="submitFeedback">提交反馈</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.cell-main { font-weight: 600; }
.cell-sub { font-size: var(--fs-xs); color: var(--text-3); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.visi-cell {
  border: 1px solid var(--border-2); border-radius: var(--r-md);
  padding: var(--sp-4); background: var(--surface-2);
  transition: border-color var(--t-base), box-shadow var(--t-base);
}
.visi-cell--on { border-color: var(--brand-600); background: var(--brand-50); box-shadow: var(--sh-2); }
.visi-list { margin-top: var(--sp-2); font-size: var(--fs-sm); color: var(--text-2); }
.visi-list li { position: relative; padding-left: 14px; margin-bottom: 4px; }
.visi-list li::before { content: "·"; position: absolute; left: 4px; font-weight: 700; }
</style>
