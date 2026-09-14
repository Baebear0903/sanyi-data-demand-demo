<script setup lang="ts">
/**
 * DemandListView —— 需求单管理（样板页：标准「筛选 + 表格 + 分页」列表模式）
 *
 * 覆盖原文功能点：需求单管理 —— "对前置单位申请的数据资源提交的资源单的流程审批与监控，
 * 支持实时查看需求单流转状态"。
 * 本页同时体现「按角色与状态动态显示操作按钮」的权限模型。
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDemoStore } from '@/stores/demo'
import { config } from '@/core/config'
import { dictItem } from '@/stores/demo'
import { by, fmtTime, fromNow, get, hoursAgo, nowIso } from '@/core/utils'
import PageHead from '@/components/PageHead.vue'
import StatCards from '@/components/StatCards.vue'
import StatusTag from '@/components/StatusTag.vue'

const store = useDemoStore()
const router = useRouter()

/* ------------------------------------------------------------ 筛选 -- */
const f = ref({ kw: '', status: '', kind: '', applicantOrg: '', priority: '', source: '' })

const statusOptions = Object.entries(config.dicts.DemandStatus).map(([v, o]) => ({ value: v, label: o.label }))
const kindOptions = Object.entries(config.dicts.DemandKind).map(([v, o]) => ({ value: v, label: o.label }))
const priorityOptions = Object.entries(config.dicts.Priority).map(([v, o]) => ({ value: v, label: o.label }))
const sourceOptions = Object.entries(config.dicts.DemandSource).map(([v, o]) => ({ value: v, label: o.label }))
const orgOptions = computed(() =>
  Array.from(new Set((store.table('demands') as any[]).map(d => d.applicantOrg))).map(v => ({ value: v, label: v }))
)

/* ------------------------------------------------------------ 数据 -- */
const allRows = computed(() => store.table('demands') as any[])

const filtered = computed(() => {
  const q = f.value
  const rows = allRows.value.filter(d => {
    if (q.status && d.status !== q.status) return false
    if (q.kind && d.kind !== q.kind) return false
    if (q.applicantOrg && d.applicantOrg !== q.applicantOrg) return false
    if (q.priority && d.priority !== q.priority) return false
    if (q.source && d.source !== q.source) return false
    if (q.kw) {
      const hay = `${d.no} ${d.title} ${d.applicant} ${d.applicantOrg}`.toLowerCase()
      if (!hay.includes(q.kw.toLowerCase())) return false
    }
    return true
  })
  return by(rows, 'submittedAt', 'desc')
})

/* 数据范围（权限模型）
   · 角色 dataScope = ORG  → 默认仅本组织/本人相关单据，判定口径为：
       ① 本人提交 / 本组织提交；或
       ② 申请的数据资源归属本组织（供数方＝资源归属方，需要看到"别人申请我的数据"的单据）。
     只按①判定会让供数方几乎看不到任何单据（种子数据里申请方都不是资源归属单位），
     于是"审批通过后派发任务"就找不到单据——这正是剧本第 5 步要解释的场景。
   · 其他角色             → 全部单据
   顶部提供范围切换按钮，可直观对比不同角色的数据范围差异。 */
const scopeMode = ref<'role' | 'all'>('role')

const resourceMap = computed<Record<string, any>>(() => {
  const m: Record<string, any> = {}
  ;(store.table('resources') as any[]).forEach(r => { m[r.id] = r })
  return m
})

/** 是否落在当前角色的「本组织」范围内 */
function inMyScope(d: any): boolean {
  if (d.applicant === store.user.name || d.applicantOrg === store.user.org) return true
  const myOrg = store.user.org
  return (Array.isArray(d.resources) ? d.resources : [])
    .some((id: string) => resourceMap.value[id]?.owner === myOrg)
}

const scoped = computed(() => {
  if (store.role.dataScope !== 'ORG' || scopeMode.value === 'all') return filtered.value
  return filtered.value.filter(inMyScope)
})

const scopeRestricted = computed(() => store.role.dataScope === 'ORG')
/** 被「本组织」范围过滤掉、切到「全部」才能看到的命中条数（空态引导用） */
const hiddenByScope = computed(() => filtered.value.length - scoped.value.length)

/* ------------------------------------------------------------ 分页 -- */
const page = ref(1)
const pageSize = ref(8)
const paged = computed(() => {
  const start = (page.value - 1) * pageSize.value
  return scoped.value.slice(start, start + pageSize.value)
})
function resetFilter() {
  f.value = { kw: '', status: '', kind: '', applicantOrg: '', priority: '', source: '' }
  page.value = 1
}

/* -------------------------------------------------- 统计与 SLA 预警 -- */
const stats = computed(() => {
  const rows = allRows.value
  const overdue = rows.filter(d => ['PENDING_ACCEPT', 'PENDING_APPROVE'].includes(d.status) && d.expectAt && hoursAgo(d.expectAt) > 0).length
  return [
    { label: '需求单总数', value: rows.length, tone: 'primary' as const, icon: 'Tickets' },
    { label: '待受理', value: rows.filter(d => d.status === 'PENDING_ACCEPT').length, tone: 'warning' as const, icon: 'Clock' },
    { label: '待审批', value: rows.filter(d => d.status === 'PENDING_APPROVE').length, tone: 'info' as const, icon: 'EditPen' },
    { label: '实施中', value: rows.filter(d => ['IMPLEMENTING', 'CHANGING'].includes(d.status)).length, tone: 'purple' as const, icon: 'Tools' },
    { label: '已交付', value: rows.filter(d => ['DELIVERED', 'EVALUATED'].includes(d.status)).length, tone: 'success' as const, icon: 'CircleCheck' },
    { label: '超期预警', value: overdue, tone: 'danger' as const, icon: 'Warning', tip: '期望交付时间已过但尚未完结' }
  ]
})

/* ------------------------------------------------------- 行操作按钮 -- */
/** 依据「角色 + 状态」推导可执行动作，体现多角色协同 */
function actionsOf(d: any): { label: string; type?: string; run: () => void }[] {
  const out: { label: string; type?: string; run: () => void }[] = []
  const can = store.can
  if (d.status === 'PENDING_ACCEPT' && can('demand.accept')) {
    out.push({ label: '受理', type: 'primary', run: () => doAccept(d) })
  }
  if (d.status === 'PENDING_APPROVE' && can('demand.approve')) {
    out.push({ label: '审批', type: 'primary', run: () => doApprove(d) })
    out.push({ label: '驳回', run: () => doReject(d) })
  }
  if (d.status === 'DRAFT' && (d.applicant === store.user.name)) {
    out.push({ label: '提交', type: 'primary', run: () => doSubmit(d) })
  }
  if (['PENDING_ACCEPT', 'PENDING_APPROVE'].includes(d.status) && d.applicant === store.user.name) {
    out.push({ label: '撤回', run: () => doWithdraw(d) })
  }
  if (d.status === 'PENDING_ACCEPTANCE' && d.applicant === store.user.name) {
    out.push({ label: '验收', type: 'primary', run: () => doAccept2(d) })
  }
  if (['APPROVED', 'DELIVERED'].includes(d.status) && d.applicant === store.user.name) {
    out.push({ label: '评价', type: 'primary', run: () => router.push('/evaluation') })
  }
  if (['APPROVED', 'IMPLEMENTING', 'DELIVERED'].includes(d.status) && can('demand.change')) {
    out.push({ label: '变更', run: () => router.push('/change/list') })
  }
  /*
   * 审批通过后的实施入口：派发生产任务（数据采集 / 加工 / 建模）。
   * 权限点 demand.dispatch 授予供数方；列表页跳详情页并自动打开派发弹窗（表单在详情页）。
   */
  if (['APPROVED', 'IMPLEMENTING', 'CHANGING'].includes(d.status) && (can('demand.dispatch') || can('admin.all'))) {
    out.push({ label: '派发任务', type: 'primary', run: () => router.push(`/demand/detail/${d.id}?dispatch=1`) })
  }
  out.push({ label: '详情', run: () => router.push(`/demand/detail/${d.id}`) })
  return out
}

/* ---------------------------------------------------------- 动作实现 -- */
function doAccept(d: any) {
  store.update('demands', d.id, { status: 'PENDING_APPROVE', currentHandler: '张建国', acceptedAt: nowIso() }, { action: '服务台受理', remark: '材料齐全，转资源归属方审批' })
  store.pushTimeline(d, { action: '服务台受理', comment: '材料齐全，转资源归属方审批' })
  store.notify({ type: 'info', title: `需求单 ${d.no} 已受理`, body: `您的需求「${d.title}」已被服务台受理，进入资源归属方审批环节。`, toRoles: ['consumer', 'supplier'], link: `/demand/detail/${d.id}` })
  ElMessage.success(`已受理需求单 ${d.no}，流转至「待审批」`)
}

async function doApprove(d: any) {
  try {
    const { value } = await ElMessageBox.prompt('请填写审批意见', `审批需求单 ${d.no}`, {
      confirmButtonText: '审批通过', cancelButtonText: '取消',
      inputValue: '用途明确，同意共享，按资源敏感级别脱敏后交付。',
      inputType: 'textarea'
    })
    const needSecurity = ['L3', 'L4'].includes(d.securityLevel)
    store.update('demands', d.id, {
      status: needSecurity ? 'PENDING_APPROVE' : 'APPROVED',
      approver: store.user.name,
      approvedAt: nowIso()
    }, { action: '资源归属方审批通过', remark: value })
    store.pushTimeline(d, { action: '资源归属方审批通过', comment: value })
    store.notify({ type: 'success', title: `需求单 ${d.no} 审批通过`, body: `审批意见：${value}`, toRoles: ['consumer', 'desk'], link: `/demand/detail/${d.id}` })
    ElMessage.success(needSecurity ? `已通过，因资源敏感级别为 ${d.securityLevel}，转入安全合规审批` : `审批通过，可派发生产任务`)
  } catch { /* 取消 */ }
}

async function doReject(d: any) {
  try {
    const { value } = await ElMessageBox.prompt('请填写驳回原因（将反馈给申请方）', `驳回需求单 ${d.no}`, {
      confirmButtonText: '确认驳回', cancelButtonText: '取消', inputType: 'textarea'
    })
    store.update('demands', d.id, { status: 'REJECTED', rejectReason: value }, { action: '审批驳回', remark: value })
    store.pushTimeline(d, { action: '审批驳回', comment: value })
    store.notify({ type: 'warning', title: `需求单 ${d.no} 被驳回`, body: `驳回原因：${value}`, toRoles: ['consumer'], link: `/demand/detail/${d.id}` })
    ElMessage.warning('已驳回，原因已反馈申请方')
  } catch { /* 取消 */ }
}

function doWithdraw(d: any) {
  store.update('demands', d.id, { status: 'WITHDRAWN', withdrawnAt: nowIso() }, { action: '撤回需求单', remark: '未审核前撤回' })
  store.pushTimeline(d, { action: '撤回需求单', comment: '需求未审核前可撤回' })
  ElMessage.info('已撤回需求单')
}

function doSubmit(d: any) {
  store.update('demands', d.id, { status: 'PENDING_ACCEPT', submittedAt: nowIso() }, { action: '提交需求单' })
  store.pushTimeline(d, { action: '提交需求单' })
  ElMessage.success('已提交，等待服务台受理')
}

function doAccept2(d: any) {
  store.update('demands', d.id, { status: 'DELIVERED', deliveredAt: nowIso() }, { action: '需求验收' })
  store.pushTimeline(d, { action: '需求验收通过', comment: '交付物符合申请要求' })
  ElMessage.success('验收通过，可提交评价')
}

/* ------------------------------------------------------ 批量审批 -- */
const selection = ref<any[]>([])
function batchApprove() {
  const list = selection.value.filter(d => d.status === 'PENDING_APPROVE')
  if (!list.length) { ElMessage.warning('所选需求单中没有处于「待审批」状态的记录'); return }
  list.forEach(d => {
    store.update('demands', d.id, { status: 'APPROVED', approver: store.user.name }, { action: '批量审批通过' })
    store.pushTimeline(d, { action: '批量审批通过', comment: '批量审批' })
  })
  ElMessage.success(`已批量审批 ${list.length} 条需求单`)
  selection.value = []
}

function exportList() {
  ElMessage.success(`已导出 ${scoped.value.length} 条需求单`)
}
</script>

<template>
  <div>
    <PageHead
      title="需求单管理"
      desc="对前置单位申请的数据资源提交的资源单进行流程审批与监控，支持实时查看需求单流转状态。"
    >
      <template #actions>
        <el-button @click="exportList"><el-icon><Download /></el-icon> 导出</el-button>
        <el-button type="primary" @click="router.push('/demand/apply')"><el-icon><Plus /></el-icon> 新建需求</el-button>
      </template>
    </PageHead>

    <!-- 指标行 -->
    <StatCards :items="stats" />

    <div class="card">
      <!-- 筛选行（参考截图 2 版式） -->
      <div class="toolbar">
        <div class="toolbar__fields">
          <div class="field"><span class="field__label">关键字</span>
            <el-input v-model="f.kw" placeholder="单号 / 标题 / 申请人" clearable style="width: 200px" @input="page = 1" />
          </div>
          <div class="field"><span class="field__label">状态</span>
            <el-select v-model="f.status" placeholder="全部状态" clearable style="width: 150px" @change="page = 1">
              <el-option v-for="o in statusOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </div>
          <div class="field"><span class="field__label">类型</span>
            <el-select v-model="f.kind" placeholder="全部类型" clearable style="width: 130px" @change="page = 1">
              <el-option v-for="o in kindOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </div>
          <div class="field"><span class="field__label">申请方</span>
            <el-select v-model="f.applicantOrg" placeholder="全部组织" clearable style="width: 180px" @change="page = 1">
              <el-option v-for="o in orgOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </div>
          <div class="field"><span class="field__label">优先级</span>
            <el-select v-model="f.priority" placeholder="全部" clearable style="width: 120px" @change="page = 1">
              <el-option v-for="o in priorityOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </div>
          <div class="field"><span class="field__label">来源</span>
            <el-select v-model="f.source" placeholder="全部来源" clearable style="width: 140px" @change="page = 1">
              <el-option v-for="o in sourceOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </div>
        </div>
        <div class="toolbar__actions">
          <el-tooltip
            v-if="scopeRestricted"
            :disabled="!(scopeMode === 'role' && hiddenByScope > 0)"
            :content="`本组织外还有 ${hiddenByScope} 条符合条件的需求单，切到「全部」即可查看`"
            placement="bottom"
          >
            <el-radio-group v-model="scopeMode" size="small" :class="{ 'is-hint': scopeMode === 'role' && hiddenByScope > 0 }" @change="page = 1">
              <el-radio-button value="role">本组织</el-radio-button>
              <el-radio-button value="all">全部{{ hiddenByScope > 0 ? `（+${hiddenByScope}）` : '' }}</el-radio-button>
            </el-radio-group>
          </el-tooltip>
          <el-button @click="resetFilter">重置</el-button>
          <el-button v-if="store.can('demand.approve')" type="primary" plain :disabled="!selection.length" @click="batchApprove">
            批量审批{{ selection.length ? `(${selection.length})` : '' }}
          </el-button>
        </div>
      </div>

      <!-- 表格 -->
      <el-table
        :data="paged"
        style="width: 100%"
        row-key="id"
        @selection-change="(v: any[]) => (selection = v)"
      >
        <el-table-column type="selection" width="42" />
        <el-table-column prop="no" label="需求单号" width="130">
          <template #default="{ row }">
            <el-button link type="primary" @click="router.push(`/demand/detail/${row.id}`)">{{ row.no }}</el-button>
          </template>
        </el-table-column>
        <el-table-column label="需求名称" min-width="210" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="cell-main">{{ row.title }}</div>
            <div class="cell-sub">{{ row.scene }}</div>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="92">
          <template #default="{ row }"><StatusTag dict="DemandKind" :value="row.kind" :dot="false" /></template>
        </el-table-column>
        <el-table-column label="交付" width="88">
          <template #default="{ row }"><StatusTag dict="DeliveryForm" :value="row.deliveryForm" :dot="false" /></template>
        </el-table-column>
        <el-table-column label="敏感级别" width="94">
          <template #default="{ row }"><StatusTag dict="SecurityLevel" :value="row.securityLevel" /></template>
        </el-table-column>
        <el-table-column label="申请方" width="132" show-overflow-tooltip>
          <template #default="{ row }">
            <div>{{ row.applicant }}</div>
            <div class="cell-sub">{{ row.applicantOrg }}</div>
          </template>
        </el-table-column>
        <el-table-column label="优先级" width="88">
          <template #default="{ row }"><StatusTag dict="Priority" :value="row.priority" :dot="false" /></template>
        </el-table-column>
        <el-table-column label="流转状态" width="164">
          <template #default="{ row }">
            <StatusTag dict="DemandStatus" :value="row.status" />
            <div class="progress-cell mt-1">
              <el-progress
                :percentage="Math.round(((config.flowIndex.Demand as any)[row.status] ?? 0) / 7 * 100)"
                :stroke-width="5"
                :show-text="false"
                :status="row.status === 'REJECTED' ? 'exception' : row.status === 'EVALUATED' ? 'success' : undefined"
              />
              <span class="text-xs muted">第 {{ ((config.flowIndex.Demand as any)[row.status] ?? 0) + 1 }}/8 步 · {{ (config.flows.Demand as any)[(config.flowIndex.Demand as any)[row.status] ?? 0] }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="提交时间" width="126">
          <template #default="{ row }">
            <div>{{ row.submittedAt ? fmtTime(row.submittedAt).slice(5, 16) : '—' }}</div>
            <div class="cell-sub">{{ row.submittedAt ? fromNow(row.submittedAt) : '尚未提交' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="170" fixed="right">
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
          <!-- 空态分两种：真的没有数据；或被「本组织」数据范围挡住了——后者必须给出可执行的一步 -->
          <div v-if="scopeRestricted && scopeMode === 'role' && hiddenByScope > 0" class="empty-box">
            <div class="empty-box__icon"><el-icon><WarningFilled /></el-icon></div>
            <div class="empty-box__text">
              当前数据范围为「本组织」，本组织外还有 <b>{{ hiddenByScope }}</b> 条符合筛选条件的需求单
            </div>
            <el-button type="primary" class="mt-2" @click="scopeMode = 'all'; page = 1">
              切换为「全部」查看这 {{ hiddenByScope }} 条
            </el-button>
            <div class="text-xs muted mt-2">
              供数方（资源归属方）的可见范围＝本人/本组织提交，或申请资源归属本组织的需求单
            </div>
          </div>
          <div v-else class="empty-box">
            <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
            <div class="empty-box__text">没有符合条件的需求单</div>
          </div>
        </template>
      </el-table>

      <!-- 分页（参考截图 2 右下角版式） -->
      <div class="card__foot">
        <span class="text-sm muted">
          共 <b>{{ scoped.length }}</b> 条
          <template v-if="scopeRestricted && scopeMode === 'role'">
            （当前角色数据范围为「本组织」：本人/本组织提交，或申请资源归属本组织的需求单
            <template v-if="hiddenByScope > 0">；另有 <b>{{ hiddenByScope }}</b> 条需切换为「全部」查看</template>）
          </template>
        </span>
        <span class="card__spacer" />
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="scoped.length"
          :page-sizes="[8, 15, 30]"
          layout="total, sizes, prev, pager, next, jumper"
          background
        />
      </div>
    </div>
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
.progress-cell { display: flex; flex-direction: column; gap: 3px; }
/* 本组织范围挡住了命中数据时，给范围切换一点视觉提示 */
.toolbar__actions :deep(.el-radio-group.is-hint) {
  box-shadow: 0 0 0 2px var(--warning-bg);
  border-radius: var(--r-md);
}
</style>
