<script setup lang="ts">
/**
 * EvaluationDetailView —— 评价单 / 反馈单详情（M12 · 10.1 / 10.2）
 *
 * 原文：
 *  · 10.1 评价单详情：展示评价人、评分、评价内容以及评价时间、审批状态等。
 *  · 10.2 反馈单详情：展示原始评价单详细信息，同时展示对该评价的反馈的详细信息，
 *    包括反馈人、反馈内容、审批状态等；用数方评价经审批通过后展示给供数方，
 *    供数方反馈经审批通过后展示给用数方。
 *
 * 页面分两块：评价单详情 + 反馈单详情，并提供视角切换、审批操作与审计日志。
 */
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDemoStore, dictItem } from '@/stores/demo'
import { by, fmtTime, fromNow, iso, truncate, uid } from '@/core/utils'
import PageHead from '@/components/PageHead.vue'
import StatusTag from '@/components/StatusTag.vue'

const store = useDemoStore()
const route = useRoute()
const router = useRouter()

/** 安全数组（单据数据为宽松结构，统一收敛为 any[]，便于模板中安全访问） */
const arrAny = (v: unknown): any[] => (Array.isArray(v) ? v : [])

const DIMS = ['数据质量', '交付及时性', '服务态度', '文档完备性', '问题响应速度']

const id = computed(() => String(route.params.id ?? ''))
const ev = computed<any>(() => (store.table('evaluations') as any[]).find(e => e.id === id.value || e.no === id.value) ?? null)

/** 视角：默认按当前角色推断，可手动切换以对比可见性差异 */
const view = ref<'consumer' | 'supplier'>(store.role.id === 'supplier' || store.role.id === 'admin' ? 'supplier' : 'consumer')

/** 供数方视角下未审批通过的评价不可见 */
const evalBlocked = computed(() => !!ev.value && view.value === 'supplier' && ev.value.status !== 'APPROVED')
/** 用数方视角下未审批通过的反馈不可见 */
const feedbackBlocked = computed(() =>
  !!ev.value?.feedback && view.value === 'consumer' && ev.value.feedback.status !== 'APPROVED'
)

const canApprove = computed(() => store.can('eval.approve'))
const isSupplierRole = computed(() => store.role.id === 'supplier' || store.role.id === 'admin')

const avgDim = computed(() => {
  const dims = ev.value?.dims ?? {}
  const vals = DIMS.map(k => Number(dims[k] ?? 0)).filter(v => v > 0)
  return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : '—'
})

/* ======================================================== 审批操作 -- */
async function approveEvaluation() {
  const e = ev.value
  if (!e) return
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
      body: '该评价已展示给供数方。', toRoles: ['supplier'], link: `/evaluation/detail/${e.id}`
    })
    ElMessage.success('审批通过，评价已展示给供数方')
  } catch { /* 取消 */ }
}

async function rejectEvaluation() {
  const e = ev.value
  if (!e) return
  try {
    const { value } = await ElMessageBox.prompt('请填写驳回原因', `驳回评价单 ${e.no}`, {
      confirmButtonText: '确认驳回', cancelButtonText: '取消', inputType: 'textarea',
      inputValue: '评价内容与本次交付无关，请补充具体问题描述后重新提交。'
    })
    store.update('evaluations', e.id, {
      status: 'REJECTED', approver: store.user.name, rejectReason: value
    }, { action: '评价审批驳回', remark: value })
    store.pushTimeline(e, { action: '评价审批驳回', comment: value })
    store.notify({
      type: 'warning', title: `评价单 ${e.no} 被驳回`, body: `驳回原因：${value}`,
      toRoles: ['consumer'], link: `/evaluation/detail/${e.id}`
    })
    ElMessage.warning('已驳回，该评价不会展示给供数方')
  } catch { /* 取消 */ }
}

/* ---------------------------------------------------------- 反馈 -- */
const fbDialog = ref(false)
const fbForm = reactive({ content: '' })

function openFeedback() {
  fbForm.content = ev.value?.feedback?.content ?? ''
  fbDialog.value = true
}

function submitFeedback() {
  const e = ev.value
  if (!e) return
  if (!fbForm.content.trim()) { ElMessage.warning('请填写反馈内容'); return }
  store.update('evaluations', e.id, {
    feedback: {
      id: e.feedback?.id ?? uid('fb'), user: store.user.name, content: fbForm.content,
      at: iso(), status: 'PENDING_APPROVE', approvedAt: null
    }
  }, { action: '提交评价反馈', remark: `反馈待审批：${truncate(fbForm.content, 40)}` })
  store.pushTimeline(e, { action: '供数方提交反馈', comment: fbForm.content })
  store.notify({
    type: 'info', title: `评价单 ${e.no} 收到供数方反馈`,
    body: '反馈已提交，审批通过后展示给用数方。', toRoles: ['consumer', 'supplier'], link: `/evaluation/detail/${e.id}`
  })
  ElMessage.success('反馈已提交，审批通过后展示给用数方')
  fbDialog.value = false
}

async function approveFeedback() {
  const e = ev.value
  if (!e?.feedback) return
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
      body: '供数方反馈已展示给用数方。', toRoles: ['consumer'], link: `/evaluation/detail/${e.id}`
    })
    ElMessage.success('反馈审批通过，已展示给用数方')
  } catch { /* 取消 */ }
}

function rejectFeedback() {
  const e = ev.value
  if (!e?.feedback) return
  store.update('evaluations', e.id, {
    feedback: { ...e.feedback, status: 'REJECTED', approvedAt: null }
  }, { action: '反馈审批驳回', remark: '反馈内容不符合要求，不予展示' })
  store.notify({
    type: 'warning', title: `评价单 ${e.no} 的反馈被驳回`,
    body: '反馈审批未通过，用数方不可见。', toRoles: ['supplier'], link: `/evaluation/detail/${e.id}`
  })
  ElMessage.warning('反馈已驳回，用数方视角不可见')
}

/* ======================================================== 审计日志 -- */
const audits = computed(() => {
  if (!ev.value) return []
  const rows = (store.table('audits') as any[]).filter(a =>
    (a.bizType === 'evaluations' || a.bizType === 'evaluation') &&
    (a.bizId === ev.value.id || a.bizNo === ev.value.no)
  )
  return by(rows, 'operatedAt', 'desc')
})

const auditKey = (a: any, i: number) => a.id ?? `${a.bizNo}-${a.operatedAt}-${a.action}-${i}`
const dimPct = (v: number) => Math.round((Number(v) || 0) / 5 * 100)
</script>

<template>
  <div>
    <PageHead
      :title="ev ? `评价单 / 反馈单详情 · ${ev.no}` : '评价单 / 反馈单详情'"
      desc="评价单与反馈单详情：评分、内容、审批状态与字段级留痕。"
    >
      <template #actions>
        <el-button @click="router.push('/evaluation')"><el-icon><ArrowLeft /></el-icon> 返回评价管理</el-button>
        <el-button v-if="ev && ev.status === 'APPROVED' && !ev.feedback && isSupplierRole" type="primary" @click="openFeedback">提交反馈</el-button>
      </template>
    </PageHead>

    <div v-if="!ev" class="card">
      <div class="card__body">
        <div class="empty-box">
          <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
          <div class="empty-box__text">未找到评价单 {{ id }}，可能已被移除或单号有误</div>
          <el-button class="mt-3" @click="router.push('/evaluation')">返回评价管理</el-button>
        </div>
      </div>
    </div>

    <template v-else>
      <!-- 视角与可见性提示 -->
      <div class="card">
        <div class="card__head">
          <div class="card__title">视角与可见性</div>
          <div class="card__sub">审批通过后，评价与反馈才对双方互相可见</div>
          <div class="card__spacer" />
          <el-radio-group v-model="view" size="small">
            <el-radio-button value="consumer">以用数方视角</el-radio-button>
            <el-radio-button value="supplier">以供数方视角</el-radio-button>
          </el-radio-group>
        </div>
        <div class="card__body">
          <el-alert
            :type="evalBlocked ? 'warning' : 'info'"
            show-icon
            :closable="false"
            :title="view === 'consumer'
              ? '用数方视角：可查看本方发起的评价全流程；供数方反馈需审批通过后才可见。'
              : '供数方视角：仅可查看审批通过的评价；本方反馈（含待审批）可见。'"
          />
          <div class="text-xs muted mt-3">
            当前角色「{{ store.role.name }}」的数据范围：{{ store.role.dataScope === 'ALL' ? '全部' : store.role.dataScope === 'ORG' ? '本组织' : '本人' }}；{{ canApprove ? '可审批评价与反馈' : '不可审批评价与反馈' }}。
          </div>
        </div>
      </div>

      <!-- ================================================ 评价单详情 -- -->
      <div class="card">
        <div class="card__head">
          <div class="card__title">评价单详情</div>
          <div class="card__sub">{{ ev.no }} · 关联需求单 {{ ev.demandNo }}</div>
          <div class="card__spacer" />
          <StatusTag dict="EvaluationStatus" :value="ev.status" />
        </div>
        <div class="card__body">
          <div v-if="evalBlocked" class="empty-box">
            <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
            <div class="empty-box__text">
              该评价尚未审批通过（当前状态：{{ dictItem('EvaluationStatus', ev.status).label }}），<b>供数方视角不可见</b>。<br>
              评价内容需审批通过后可见。
            </div>
          </div>

          <template v-else>
            <div class="desc-grid">
              <div class="desc-item">
                <span class="desc-item__label">评价单号</span>
                <span class="desc-item__value mono">{{ ev.no }}</span>
              </div>
              <div class="desc-item">
                <span class="desc-item__label">关联需求单</span>
                <span class="desc-item__value">
                  <el-button link type="primary" @click="router.push(`/demand/detail/${ev.demandId}`)">{{ ev.demandNo }}</el-button>
                </span>
              </div>
              <div class="desc-item">
                <span class="desc-item__label">评价人</span>
                <span class="desc-item__value">{{ ev.evaluator }}（{{ ev.evaluatorOrg }}）</span>
              </div>
              <div class="desc-item">
                <span class="desc-item__label">评价时间</span>
                <span class="desc-item__value">{{ fmtTime(ev.evaluatedAt) }} · {{ fromNow(ev.evaluatedAt) }}</span>
              </div>
              <div class="desc-item">
                <span class="desc-item__label">审批状态</span>
                <span class="desc-item__value">
                  <StatusTag dict="EvaluationStatus" :value="ev.status" />
                  <span v-if="ev.approver" class="muted text-xs" style="margin-left: 8px">审批人：{{ ev.approver }} {{ ev.approvedAt ? fmtTime(ev.approvedAt) : '' }}</span>
                </span>
              </div>
              <div class="desc-item">
                <span class="desc-item__label">可见范围</span>
                <span class="desc-item__value">{{ ev.visibleTo === 'BOTH' ? '用数方 + 供数方' : '供数方' }}</span>
              </div>
              <div class="desc-item desc-item--wide">
                <span class="desc-item__label">总体评分</span>
                <span class="desc-item__value">
                  <el-rate :model-value="ev.score" disabled show-score score-template="{value} 分" />
                  <span class="muted text-xs" style="margin-left: 10px">维度均分 {{ avgDim }}</span>
                </span>
              </div>
              <div class="desc-item desc-item--wide">
                <span class="desc-item__label">评价内容</span>
                <span class="desc-item__value" style="white-space: pre-wrap">{{ ev.content }}</span>
              </div>
              <div v-if="ev.rejectReason" class="desc-item desc-item--wide">
                <span class="desc-item__label">驳回原因</span>
                <span class="desc-item__value" style="color: var(--danger-fg)">{{ ev.rejectReason }}</span>
              </div>
            </div>

            <!-- 5 个维度 -->
            <div class="mt-4">
              <div class="bold mb-2">分维度评分（{{ DIMS.length }} 个维度）</div>
              <div class="dim-grid">
                <div v-for="d in DIMS" :key="d" class="dim-cell">
                  <div class="flex items-center justify-between">
                    <span class="text-sm">{{ d }}</span>
                    <span class="mono bold">{{ ev.dims?.[d] ?? '—' }} 分</span>
                  </div>
                  <el-progress
                    class="mt-1"
                    :percentage="dimPct(ev.dims?.[d] ?? 0)"
                    :stroke-width="8"
                    :show-text="false"
                    :status="Number(ev.dims?.[d] ?? 0) >= 4 ? 'success' : Number(ev.dims?.[d] ?? 0) >= 3 ? undefined : 'exception'"
                  />
                </div>
              </div>
            </div>

            <!-- 评价审批操作 -->
            <div v-if="ev.status === 'PENDING_APPROVE'" class="card__foot" style="padding-left: 0; padding-right: 0; margin-top: var(--sp-4)">
              <span class="text-sm muted">该评价待审批：审批通过后展示给供数方。</span>
              <span class="card__spacer" />
              <el-button v-if="canApprove" type="primary" @click="approveEvaluation">审批通过</el-button>
              <el-button v-if="canApprove" @click="rejectEvaluation">驳回</el-button>
              <span v-if="!canApprove" class="text-xs" style="color: var(--warning-fg)">当前角色无评价审批权限</span>
            </div>
          </template>
        </div>
      </div>

      <!-- ================================================ 反馈单详情 -- -->
      <div class="card">
        <div class="card__head">
          <div class="card__title">反馈单详情</div>
          <div class="card__sub">原始评价单信息 + 对该评价的反馈详情</div>
          <div class="card__spacer" />
          <StatusTag
            v-if="ev.feedback"
            :label="ev.feedback.status === 'APPROVED' ? '反馈已通过' : ev.feedback.status === 'REJECTED' ? '反馈已驳回' : '反馈待审批'"
            :tone="ev.feedback.status === 'APPROVED' ? 'success' : ev.feedback.status === 'REJECTED' ? 'danger' : 'warning'"
          />
          <StatusTag v-else label="暂无反馈" tone="neutral" />
        </div>
        <div class="card__body">
          <!-- 原始评价单摘要（反馈单详情必须同时展示原始评价单信息） -->
          <div class="tl__quote">
            <div class="flex items-center gap-2 wrap">
              <span class="bold">原始评价单 {{ ev.no }}</span>
              <el-rate :model-value="ev.score" disabled size="small" />
              <span class="text-xs muted">{{ ev.evaluator }} · {{ ev.evaluatorOrg }} · {{ fmtTime(ev.evaluatedAt) }}</span>
            </div>
            <div class="mt-1 text-sm">{{ ev.content }}</div>
          </div>

          <div v-if="!ev.feedback" class="empty-box">
            <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
            <div class="empty-box__text">供数方尚未提交反馈</div>
          </div>

          <div v-else-if="feedbackBlocked" class="empty-box">
            <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
            <div class="empty-box__text">
              该反馈尚未审批通过，<b>用数方视角不可见</b>（审批通过后展示给用数方）。
            </div>
          </div>

          <template v-else>
            <div class="desc-grid mt-3">
              <div class="desc-item">
                <span class="desc-item__label">反馈人</span>
                <span class="desc-item__value">{{ ev.feedback.user }}</span>
              </div>
              <div class="desc-item">
                <span class="desc-item__label">反馈时间</span>
                <span class="desc-item__value">{{ fmtTime(ev.feedback.at) }} · {{ fromNow(ev.feedback.at) }}</span>
              </div>
              <div class="desc-item">
                <span class="desc-item__label">审批状态</span>
                <span class="desc-item__value">
                  <StatusTag
                    :label="ev.feedback.status === 'APPROVED' ? '审批通过' : ev.feedback.status === 'REJECTED' ? '已驳回' : '待审批'"
                    :tone="ev.feedback.status === 'APPROVED' ? 'success' : ev.feedback.status === 'REJECTED' ? 'danger' : 'warning'"
                  />
                  <span v-if="ev.feedback.approvedAt" class="muted text-xs" style="margin-left: 8px">审批时间：{{ fmtTime(ev.feedback.approvedAt) }}</span>
                </span>
              </div>
              <div class="desc-item desc-item--wide">
                <span class="desc-item__label">反馈内容</span>
                <span class="desc-item__value" style="white-space: pre-wrap">{{ ev.feedback.content }}</span>
              </div>
            </div>

            <div v-if="ev.feedback.status === 'PENDING_APPROVE'" class="card__foot" style="padding-left: 0; padding-right: 0; margin-top: var(--sp-4)">
              <span class="text-sm muted">该反馈待审批：审批通过后展示给用数方。</span>
              <span class="card__spacer" />
              <el-button v-if="canApprove" type="primary" @click="approveFeedback">反馈审批通过</el-button>
              <el-button v-if="canApprove" @click="rejectFeedback">驳回反馈</el-button>
              <span v-if="!canApprove" class="text-xs" style="color: var(--warning-fg)">当前角色无反馈审批权限</span>
            </div>
            <div v-else class="card__foot" style="padding-left: 0; padding-right: 0; margin-top: var(--sp-4)">
              <span class="text-sm muted">
                反馈已{{ ev.feedback.status === 'APPROVED' ? '审批通过并展示给用数方' : '被驳回，不予展示' }}。
              </span>
              <span class="card__spacer" />
              <el-button v-if="isSupplierRole" @click="openFeedback">修改并重新提交反馈</el-button>
            </div>
          </template>
        </div>
      </div>

      <!-- ================================================== 审计日志 -- -->
      <div class="grid grid--side">
        <div class="card">
          <div class="card__head">
            <div class="card__title">审计日志</div>
            <div class="card__sub">该评价单 / 反馈单的字段级变更记录（修改人、时间、变更前后值）</div>
            <div class="card__spacer" />
            <el-button size="small" @click="router.push('/audit')">前往审计中心</el-button>
          </div>
          <div class="card__body card__body--flush">
            <el-table :data="audits" style="width: 100%" :row-key="auditKey">
              <el-table-column label="时间" width="150">
                <template #default="{ row }">{{ fmtTime(row.operatedAt) }}</template>
              </el-table-column>
              <el-table-column prop="action" label="动作" width="130">
                <template #default="{ row }"><StatusTag :label="row.action" tone="info" :dot="false" /></template>
              </el-table-column>
              <el-table-column prop="operator" label="操作人" width="110" />
              <el-table-column label="字段变更（变更前 / 变更后）" min-width="240">
                <template #default="{ row }">
                  <div v-for="(c, i) in arrAny(row.changes)" :key="i" class="text-xs">
                    <span class="mono">{{ c.field }}</span>：
                    <span class="before">{{ c.before }}</span>
                    <span class="muted"><el-icon><ArrowRight /></el-icon></span>
                    <span class="after">{{ c.after }}</span>
                  </div>
                  <span v-if="!arrAny(row.changes).length" class="muted text-xs">无字段变更</span>
                </template>
              </el-table-column>
              <el-table-column prop="remark" label="备注" min-width="160" show-overflow-tooltip>
                <template #default="{ row }">{{ row.remark || '—' }}</template>
              </el-table-column>
              <template #empty>
                <div class="empty-box">
                  <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
                  <div class="empty-box__text">该评价单暂无审计记录，执行审批 / 反馈操作后会自动留痕</div>
                </div>
              </template>
            </el-table>
          </div>
        </div>

        <div>
          <div class="card">
            <div class="card__head"><div class="card__title">流转时间轴</div></div>
            <div class="card__body">
              <div v-if="arrAny(ev.timeline).length" class="tl">
                <div v-for="(t, i) in ev.timeline" :key="i" class="tl__item" :class="i === ev.timeline.length - 1 ? 'tl__item--active' : 'tl__item--done'">
                  <div class="tl__dot" />
                  <div class="tl__head">
                    <span class="tl__action">{{ t.action }}</span>
                    <span class="tl__meta">{{ t.actor }} · {{ fmtTime(t.at) }}</span>
                  </div>
                  <div v-if="t.comment" class="tl__body">{{ t.comment }}</div>
                </div>
              </div>
              <div v-else class="empty-box">
                <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
                <div class="empty-box__text">暂无流转记录</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ==================================================== 反馈弹窗 -- -->
    <el-dialog v-model="fbDialog" title="提交评价反馈（供数方）" width="600px">
      <el-form label-width="88px">
        <el-form-item label="反馈内容" required>
          <el-input v-model="fbForm.content" type="textarea" :rows="5" placeholder="请填写整改措施、说明或后续计划" />
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
.dim-grid { display: grid; gap: var(--sp-3) var(--sp-5); grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
.dim-cell { border: 1px solid var(--border-2); border-radius: var(--r-md); padding: var(--sp-3) var(--sp-4); background: var(--surface-2); }
.before { color: var(--text-3); text-decoration: line-through; }
.after { color: var(--success-fg); font-weight: 600; }
</style>
