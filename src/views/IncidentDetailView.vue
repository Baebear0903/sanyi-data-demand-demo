<script setup lang="ts">
/**
 * IncidentDetailView —— 事件单详情
 *
 * 覆盖功能点：事件单全字段查看、状态流转、处理时间轴、关联知识条目、重复事件关联、
 * 由事件单开出的问题单 / 变更单、事件广播记录与事件审计日志。
 * 操作按钮与事件列表页保持一致（受理 / 处理中 / 解决 / 升级 / 关联 / 开单 / 广播 / 关闭）。
 */
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDemoStore } from '@/stores/demo'
import { config } from '@/core/config'
import { NOW, arr, by, demoUid, fmtTime, fromNow, iso, nowStamp, toDate } from '@/core/utils'
import PageHead from '@/components/PageHead.vue'
import StatusTag from '@/components/StatusTag.vue'

const store = useDemoStore()
const route = useRoute()
const router = useRouter()

/** 安全数组访问：把 store 中的宽松字段收敛为可遍历数组（等价于 arr 的显式类型版本） */
const listOf = (v: unknown): any[] => (Array.isArray(v) ? v : [])

const id = computed(() => String(route.params.id ?? ''))
const incidents = computed(() => store.table('incidents') as any[])
const it = computed(() => incidents.value.find(x => x.id === id.value || x.no === id.value) ?? null)

const categories = computed(() => store.table('incidentCategories') as any[])
const knowledges = computed(() => store.table('knowledges') as any[])
const CLOSED_STATUS = ['CLOSED', 'RESOLVED']

/* ============================================================ 基本信息 == */
const createdAt = computed(() => (it.value ? (it.value.createdAt ?? listOf(it.value.timeline)[0]?.at ?? '') : ''))
const relateList = computed(() => incidents.value.filter(x => listOf(it.value?.relatedIncidentIds).includes(x.id)))
const problem = computed(() => (it.value?.problemId ? (store.findById('problems', it.value.problemId) as any) : null))
const change = computed(() => (it.value?.changeId ? (store.findById('changes', it.value.changeId) as any) : null))
const broadcasts = computed(() => listOf(it.value?.broadcastIds).map((bid: string) => store.findById('broadcasts', bid)).filter(Boolean) as any[])
const audits = computed(() => by(
  (store.table('audits') as any[]).filter(a => a.bizId === id.value || a.bizNo === it.value?.no),
  'operatedAt', 'desc'
))

/* SLA 剩余时间（与列表页一致的计算口径） */
const sla = computed(() => {
  const cur = it.value
  if (!cur) return { text: '—', tone: 'muted', overdue: false }
  const due = toDate(cur.slaDueAt)
  if (!due) return { text: '未设置', tone: 'muted', overdue: false }
  const diffH = (due.getTime() - NOW.getTime()) / 3600000
  if (CLOSED_STATUS.includes(cur.status)) return { text: '已闭环', tone: 'muted', overdue: false }
  if (diffH < 0) {
    const h = Math.abs(diffH)
    return { text: `已超期 ${h < 24 ? h.toFixed(1) + ' 小时' : Math.floor(h / 24) + ' 天'}`, tone: 'danger', overdue: true }
  }
  if (diffH <= 4) return { text: `剩余 ${diffH.toFixed(1)} 小时`, tone: 'warning', overdue: false }
  return { text: `剩余 ${Math.floor(diffH)} 小时`, tone: 'muted', overdue: false }
})

/* ============================================================ 流转条 == */
const flowSteps = computed(() => (config.flows.Incident ?? []) as string[])
const flowIndexNow = computed(() => (config.flowIndex.Incident as any)[it.value?.status ?? 'NEW'] ?? 0)
function stepClass(i: number) {
  const cur = flowIndexNow.value
  if (it.value?.status === 'CLOSED') return 'flow__step--done'
  if (i < cur) return 'flow__step--done'
  if (i === cur) return 'flow__step--active'
  return ''
}
/** 各流转步骤的实际达成时间 */
function stepTime(i: number) {
  const cur = it.value
  if (!cur) return ''
  const map: Record<number, string> = {
    0: createdAt.value,
    1: listOf(cur.timeline).find((t: any) => /受理|自动分派/.test(t.action))?.at ?? '',
    2: listOf(cur.timeline).find((t: any) => /处理|升级|排查/.test(t.action))?.at ?? '',
    3: cur.resolvedAt ?? '',
    4: cur.closedAt ?? ''
  }
  return map[i] ? fmtTime(map[i]).slice(5, 16) : ''
}

/* ============================================================ 抽屉/弹窗 == */
const linkVisible = ref(false)
const linkSelection = ref<string[]>([])
const bcVisible = ref(false)
const bcForm = reactive({ title: '', content: '', groups: ['全部用户'], channels: ['站内', '邮件'] })
const closeVisible = ref(false)
const closeForm = reactive({ closeType: '一线解决', comment: '' })

function requireHandle() {
  if (!store.can('incident.handle') && !store.can('incident.dispatch') && !store.can('desk.manage')) {
    ElMessage.warning('当前角色无事件处理权限')
    return false
  }
  return true
}

function doAccept() {
  const cur = it.value
  if (!cur || !requireHandle()) return
  store.update('incidents', cur.id, { status: 'DISPATCHED', handler: cur.handler === '—' ? store.user.name : cur.handler },
    { action: '受理事件', remark: '已受理并进入处理流程' })
  store.pushTimeline(cur, { action: '受理事件', comment: '已受理，进入处理流程' })
  ElMessage.success('已受理，事件状态更新为「已派发」')
}

function doProcessing() {
  const cur = it.value
  if (!cur || !requireHandle()) return
  store.update('incidents', cur.id, { status: 'PROCESSING', handler: cur.handler === '—' ? store.user.name : cur.handler },
    { action: '事件处理中', remark: '开始定位与处理' })
  store.pushTimeline(cur, { action: '处理中', comment: '已开始处理并定位问题' })
  ElMessage.success('事件状态更新为「处理中」')
}

async function doResolve() {
  const cur = it.value
  if (!cur || !requireHandle()) return
  try {
    const { value } = await ElMessageBox.prompt('请填写解决方案', `解决事件 ${cur.no}`, {
      confirmButtonText: '标记解决', cancelButtonText: '取消', inputType: 'textarea',
      inputValue: '已按排查清单定位原因并处理完成，验证通过。'
    })
    store.update('incidents', cur.id, { status: 'RESOLVED', solution: value, resolvedAt: iso() },
      { action: '解决事件', remark: value })
    store.pushTimeline(cur, { action: '解决', comment: value })
    ElMessage.success('已标记为「已解决」，可继续关闭事件')
  } catch { /* 取消 */ }
}

async function doEscalate() {
  const cur = it.value
  if (!cur || !store.can('incident.dispatch')) { ElMessage.warning('当前角色无事件升级权限'); return }
  try {
    const { value } = await ElMessageBox.prompt('请填写升级原因（将改派二线支持组）', `升级事件 ${cur.no}`, {
      confirmButtonText: '确认升级', cancelButtonText: '取消', inputType: 'textarea',
      inputValue: '一线无法定位根因，升级至二线支持组继续处理。'
    })
    store.update('incidents', cur.id, {
      status: 'ESCALATED', handlerGroup: '运维中心 · 二线支持组', handler: '陈志刚', escalateReason: value
    }, { action: '事件升级', remark: value })
    store.pushTimeline(cur, { action: '升级', comment: `${value}（已改派运维中心 · 二线支持组）` })
    ElMessage.success('已升级并改派「运维中心 · 二线支持组」')
  } catch { /* 取消 */ }
}

function openLink() {
  if (!it.value) return
  linkSelection.value = [...listOf(it.value.relatedIncidentIds)]
  linkVisible.value = true
}
function saveLink() {
  const cur = it.value
  if (!cur) return
  store.update('incidents', cur.id, { relatedIncidentIds: [...linkSelection.value] }, {
    action: '关联重复事件', remark: `关联 ${linkSelection.value.length} 条重复事件`
  })
  store.pushTimeline(cur, { action: '关联重复事件', comment: `与 ${linkSelection.value.length} 条同类事件关联` })
  linkVisible.value = false
  ElMessage.success(`已关联 ${linkSelection.value.length} 条重复事件`)
}

async function createProblem() {
  const cur = it.value
  if (!cur) return
  if (!store.can('problem.manage') && !store.can('incident.handle') && !store.can('incident.dispatch')) {
    ElMessage.warning('当前角色无「由事件开出问题单」权限'); return
  }
  try {
    await ElMessageBox.confirm('将由本事件单开出问题单，自动继承关联关系与优先级，是否继续？', `开出问题单 ${cur.no}`, {
      confirmButtonText: '开出问题单', cancelButtonText: '取消', type: 'info'
    })
  } catch { return }
  const no = `WT${nowStamp()}${String((store.table('problems') as any[]).length + 1).padStart(4, '0')}`
  const p = store.insert('problems', {
    id: demoUid('prob'), no,
    title: `${cur.title}（根因分析）`, source: 'INCIDENT',
    sourceIncidentIds: [cur.id, ...arr(cur.relatedIncidentIds)],
    severity: cur.severity, impact: cur.impact, urgency: cur.urgency, priority: cur.priority,
    status: 'NEW', handler: cur.handler === '—' ? store.user.name : cur.handler, dept: cur.handlerGroup,
    rootCause: '', knownError: null, solution: '', preventive: '',
    notifyChannels: ['站内', '邮件'], notifyLogs: [], relatedChangeIds: [], relatedCiIds: [...listOf(cur.ciIds)],
    knowledgeId: null, createdAt: iso(), expectAt: cur.slaDueAt,
    timeline: [{ at: iso(), actor: store.user.name, action: '由事件单开出问题单', comment: `来源事件 ${cur.no}` }]
  })
  store.update('incidents', cur.id, { problemId: p.id }, { action: '开出问题单', remark: `生成问题单 ${no} 做根因分析` })
  store.pushTimeline(cur, { action: '开出问题单', comment: `生成问题单 ${no}` })
  ElMessage.success(`已开出问题单 ${no}`)
}

async function createChange() {
  const cur = it.value
  if (!cur) return
  if (!store.can('demand.change') && !store.can('release.manage') && !store.can('incident.dispatch')) {
    ElMessage.warning('当前角色无「由事件开出变更单」权限'); return
  }
  try {
    await ElMessageBox.confirm('将由本事件单开出变更单（用于实施修复方案），是否继续？', `开出变更单 ${cur.no}`, {
      confirmButtonText: '开出变更单', cancelButtonText: '取消', type: 'info'
    })
  } catch { return }
  const no = `BG${nowStamp()}${String((store.table('changes') as any[]).length + 1).padStart(3, '0')}`
  const c = store.insert('changes', {
    id: demoUid('chg'), no,
    title: `${cur.title} —— 修复实施变更`, demandId: null, demandNo: null,
    category: '故障修复', priority: cur.priority, implementDate: cur.slaDueAt,
    requestor: store.user.name, implementer: '运维中心 · 二线支持组',
    plan: `针对事件 ${cur.no}（${cur.title}）实施修复变更，按标准变更窗口执行并验证。`,
    resources: [], riskLevel: cur.priority === 'P0' ? '高' : '中',
    impact: { ciList: [...arr(cur.ciIds)], services: [], tenants: [], suggestion: '建议在业务低峰期执行，并准备回滚方案。' },
    conflicts: [], status: 'PENDING_APPROVE', submittedAt: iso(), expectAt: cur.slaDueAt,
    timeline: [{ at: iso(), actor: store.user.name, action: '由事件单开出变更单', comment: `来源事件 ${cur.no}` }]
  })
  store.update('incidents', cur.id, { changeId: c.id }, { action: '开出变更单', remark: `生成变更单 ${no}` })
  store.pushTimeline(cur, { action: '开出变更单', comment: `生成变更单 ${no}` })
  ElMessage.success(`已开出变更单 ${no}`)
}

function openBroadcast() {
  const cur = it.value
  if (!cur) return
  bcForm.title = `【事件通告】${cur.title} 处置进展`
  bcForm.content = `各位相关人员：\n${cur.no}（${cur.title}）当前处理状态：${(config.dicts.IncidentStatus as any)[cur.status]?.label ?? cur.status}。\n处理组：${cur.handlerGroup}，处理人：${cur.handler}。\n后续进展将通过本渠道持续通告。`
  bcForm.groups = ['全部用户']
  bcForm.channels = ['站内', '邮件']
  bcVisible.value = true
}
function saveBroadcast() {
  const cur = it.value
  if (!cur) return
  if (!bcForm.title || !bcForm.content) { ElMessage.warning('请填写广播标题与内容'); return }
  const no = `GB${nowStamp()}${String((store.table('broadcasts') as any[]).length + 1).padStart(3, '0')}`
  const b = store.insert('broadcasts', {
    id: demoUid('bc'), no,
    title: bcForm.title, content: bcForm.content,
    targets: [{ type: 'GROUP', ids: [...bcForm.groups] }],
    channels: [...bcForm.channels], sender: store.user.name, senderOrg: store.user.org,
    sentAt: iso(), readBy: [], status: 'NEW', relatedId: cur.id
  })
  store.update('incidents', cur.id, { broadcastIds: [...arr(cur.broadcastIds), b.id] }, {
    action: '事件广播', remark: `向 ${bcForm.groups.join('、')} 通告事件信息与进展（${bcForm.channels.join('/')}）`
  })
  store.pushTimeline(cur, { action: '事件广播', comment: `已向 ${bcForm.groups.join('、')} 通告事件进展` })
  bcVisible.value = false
  ElMessage.success(`广播 ${no} 已发送至 ${bcForm.groups.join('、')}`)
}

function openClose() {
  const cur = it.value
  if (!cur) return
  if (!CLOSED_STATUS.includes(cur.status)) { ElMessage.warning('请先将事件标记为「已解决」后再关闭'); return }
  closeForm.closeType = cur.closeType || '一线解决'
  closeForm.comment = '经与用户确认，问题已恢复，同意关闭。'
  closeVisible.value = true
}
function saveClose() {
  const cur = it.value
  if (!cur) return
  store.update('incidents', cur.id, { status: 'CLOSED', closeType: closeForm.closeType, closedAt: iso() }, {
    action: '关闭事件', remark: `关闭方式：${closeForm.closeType}；${closeForm.comment}`
  })
  store.pushTimeline(cur, { action: '关闭事件', comment: `${closeForm.closeType}：${closeForm.comment}` })
  store.insert('callbacks', {
    id: demoUid('cb'),
    ticketType: '事件单', ticketId: cur.id, ticketNo: cur.no,
    score: null, comment: '', status: '待回访', sentAt: iso(), repliedAt: null, to: cur.handler
  })
  closeVisible.value = false
  ElMessage.success(`事件已关闭（${closeForm.closeType}），回访调查已自动生成`)
}

/* 派生单据跳转（对应路由由统一路由表提供） */
function gotoProblem() {
  if (!problem.value) return
  router.push(`/problem/detail/${problem.value.id}`)
}
function gotoChange() {
  if (!change.value) return
  router.push(`/change/detail/${change.value.id}`)
}
</script>

<template>
  <div>
    <template v-if="it">
      <PageHead :title="`事件单详情 · ${it.no}`" :desc="it.title">
        <template #tag>
          <StatusTag dict="IncidentStatus" :value="it.status" />
          <StatusTag dict="Priority" :value="it.priority" :dot="false" />
          <StatusTag dict="Severity" :value="it.severity" />
        </template>
        <template #actions>
          <el-button @click="router.push('/incident/list')"><el-icon><ArrowLeft /></el-icon> 返回列表</el-button>
          <el-button @click="openLink">关联重复事件</el-button>
          <el-button @click="openBroadcast">事件广播</el-button>
          <el-button type="primary" :disabled="CLOSED_STATUS.includes(it.status)" @click="doResolve">解决</el-button>
        </template>
      </PageHead>

      <!-- ================================================== 流转条 == -->
      <div class="card mb-4">
        <div class="card__head">
          <div class="card__title">事件流转状态</div>
          <div class="card__sub">新建 → 已派发 → 处理中 → 已解决 → 已关闭</div>
          <span class="card__spacer" />
          <span class="text-sm sla" :class="`sla--${sla.tone}`">SLA：{{ sla.text }}</span>
        </div>
        <div class="card__body">
          <div class="flow">
            <div v-for="(s, i) in flowSteps" :key="s" class="flow__step" :class="stepClass(i)">
              <div class="flow__dot">{{ i + 1 }}</div>
              <div class="flow__label">{{ s }}</div>
              <div class="flow__time">{{ stepTime(i) }}</div>
            </div>
          </div>
          <el-alert
            v-if="it.status === 'ESCALATED'"
            class="mt-3"
            type="warning"
            :closable="false"
            show-icon
            :title="`该事件已升级（当前处理组：${it.handlerGroup}）`"
            :description="`升级原因：${it.escalateReason || '—'}`"
          />
        </div>
      </div>

      <!-- ============================================ 全字段 + 右侧 == -->
      <div class="grid grid--side">
        <div>
          <div class="card mb-4">
            <div class="card__head">
              <div class="card__title">事件基本信息</div>
              <div class="card__sub">全字段（含扩展字段）</div>
            </div>
            <div class="card__body">
              <div class="desc-grid">
                <div class="desc-item"><div class="desc-item--label">事件单号</div><div class="desc-item__value mono">{{ it.no }}</div></div>
                <div class="desc-item"><div class="desc-item--label">来源</div><div class="desc-item__value">{{ it.source }}</div></div>
                <div class="desc-item"><div class="desc-item--label">事件分类</div><div class="desc-item__value">{{ it.categoryName }}（{{ categories.find(c => c.id === it.categoryId)?.group ?? '—' }}）</div></div>
                <div class="desc-item"><div class="desc-item--label">严重等级</div><div class="desc-item__value"><StatusTag dict="Severity" :value="it.severity" /></div></div>
                <div class="desc-item"><div class="desc-item--label">影响程度</div><div class="desc-item__value">{{ it.impact }}</div></div>
                <div class="desc-item"><div class="desc-item--label">紧急程度</div><div class="desc-item__value">{{ it.urgency }}</div></div>
                <div class="desc-item"><div class="desc-item--label">优先级</div><div class="desc-item__value"><StatusTag dict="Priority" :value="it.priority" :dot="false" /></div></div>
                <div class="desc-item"><div class="desc-item--label">处理人</div><div class="desc-item__value">{{ it.handler }}</div></div>
                <div class="desc-item"><div class="desc-item--label">处理组</div><div class="desc-item__value">{{ it.handlerGroup }}</div></div>
                <div class="desc-item"><div class="desc-item--label">SLA 截止时间</div><div class="desc-item__value">{{ fmtTime(it.slaDueAt) }}</div></div>
                <div class="desc-item"><div class="desc-item--label">创建时间</div><div class="desc-item__value">{{ fmtTime(createdAt) }}（{{ createdAt ? fromNow(createdAt) : '—' }}）</div></div>
                <div class="desc-item"><div class="desc-item--label">解决时间</div><div class="desc-item__value">{{ it.resolvedAt ? fmtTime(it.resolvedAt) : '—' }}</div></div>
                <div class="desc-item"><div class="desc-item--label">关闭方式</div><div class="desc-item__value">{{ it.closeType || '—' }}</div></div>
                <div class="desc-item"><div class="desc-item--label">重复事件数量</div><div class="desc-item__value">{{ relateList.length }} 条</div></div>
                <div class="desc-item desc-item--wide"><div class="desc-item--label">事件描述</div><div class="desc-item__value">{{ it.description }}</div></div>
                <div v-if="it.solution" class="desc-item desc-item--wide"><div class="desc-item--label">解决方案</div><div class="desc-item__value">{{ it.solution }}</div></div>
              </div>

              <!-- 扩展字段（由新建事件表单写入） -->
              <template v-if="it.ext">
                <el-divider content-position="left">录入扩展信息</el-divider>
                <div class="desc-grid">
                  <div class="desc-item"><div class="desc-item--label">影响用户数</div><div class="desc-item__value">{{ it.ext.affectedUsers }} 人</div></div>
                  <div class="desc-item"><div class="desc-item--label">发生时间</div><div class="desc-item__value">{{ it.ext.occurAt }}</div></div>
                  <div class="desc-item">
                    <div class="desc-item--label">联系人</div>
                    <div class="desc-item__value">{{ it.ext.contact }}<span class="masked" style="margin-left: 6px">{{ String(it.ext.contactPhone).slice(0, 3) }}****{{ String(it.ext.contactPhone).slice(-4) }}</span></div>
                  </div>
                  <div class="desc-item"><div class="desc-item--label">相关系统</div><div class="desc-item__value">{{ it.ext.modelSystem }}</div></div>
                  <div class="desc-item"><div class="desc-item--label">通知方式</div><div class="desc-item__value">{{ listOf(it.ext.notifyChannels).join('、') || '—' }}</div></div>
                  <div class="desc-item"><div class="desc-item--label">超时自动升级</div><div class="desc-item__value">{{ it.ext.autoEscalate ? '已开启' : '未开启' }}</div></div>
                </div>
              </template>

              <template v-if="arr(it.ciIds).length">
                <el-divider content-position="left">关联配置项（CMDB）</el-divider>
                <el-tag v-for="ci in listOf(it.ciIds)" :key="ci" size="small" effect="plain" class="mr-1">
                  {{ (store.findById('cis', ci) as any)?.name ?? ci }}
                </el-tag>
              </template>
            </div>
          </div>

          <!-- ============================================ 处理时间轴 == -->
          <div class="card mb-4">
            <div class="card__head">
              <div class="card__title">处理时间轴</div>
              <div class="card__sub">共 {{ arr(it.timeline).length }} 条处理记录</div>
            </div>
            <div class="card__body">
              <div v-if="!arr(it.timeline).length" class="empty-box">
                <div class="empty-box__icon"><el-icon><Clock /></el-icon></div>
                <div class="empty-box__text">暂无处理记录</div>
              </div>
              <div v-else class="tl">
                <div
                  v-for="(t, i) in listOf(it.timeline)"
                  :key="i"
                  class="tl__item"
                  :class="i === listOf(it.timeline).length - 1 ? 'tl__item--active' : 'tl__item--done'"
                >
                  <div class="tl__dot" />
                  <div class="tl__head">
                    <span class="tl__action">{{ (t as any).action }}</span>
                    <span class="tl__meta">{{ (t as any).actor }} · {{ fmtTime((t as any).at) }}（{{ fromNow((t as any).at) }}）</span>
                  </div>
                  <div v-if="(t as any).comment" class="tl__quote">{{ (t as any).comment }}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- ============================================ 审计日志 == -->
          <div class="card">
            <div class="card__head">
              <div class="card__title">事件审计日志</div>
              <div class="card__sub">记录本事件单的字段级变更、操作人与终端</div>
            </div>
            <div class="card__body card__body--flush">
              <el-table :data="audits" size="small" style="width: 100%">
                <el-table-column label="操作时间" width="140">
                  <template #default="{ row }">{{ fmtTime(row.operatedAt) }}</template>
                </el-table-column>
                <el-table-column prop="action" label="操作" width="150" />
                <el-table-column label="字段级变更" min-width="280">
                  <template #default="{ row }">
                    <div v-if="!arr(row.changes).length" class="muted text-xs">—</div>
                    <div v-for="(c, i) in listOf(row.changes)" :key="i" class="text-xs">
                      <span class="mono">{{ c.field }}</span>：
                      <span class="muted">{{ c.before }}</span> →
                      <span class="bold">{{ c.after }}</span>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column prop="remark" label="备注" min-width="200" show-overflow-tooltip />
                <el-table-column label="操作人" width="150">
                  <template #default="{ row }">
                    <div>{{ row.operator }}</div>
                    <div class="cell-sub">{{ row.operatorOrg }}</div>
                  </template>
                </el-table-column>
                <el-table-column label="终端 / IP" width="150">
                  <template #default="{ row }">
                    <div class="text-xs">{{ row.terminal }}</div>
                    <div class="cell-sub mono">{{ row.ip }}</div>
                  </template>
                </el-table-column>
                <template #empty>
                  <div class="empty-box">
                    <div class="empty-box__icon"><el-icon><Tickets /></el-icon></div>
                    <div class="empty-box__text">本事件单暂无审计记录（执行处理动作后将自动生成）</div>
                  </div>
                </template>
              </el-table>
            </div>
          </div>
        </div>

        <!-- ================================================ 右侧栏 == -->
        <div>
          <div class="card mb-4">
            <div class="card__head"><div class="card__title">处理操作</div></div>
            <div class="card__body">
              <div class="op-list">
                <el-button size="small" :disabled="it.status !== 'NEW'" @click="doAccept">受理</el-button>
                <el-button size="small" :disabled="!['DISPATCHED', 'ESCALATED'].includes(it.status)" @click="doProcessing">处理中</el-button>
                <el-button size="small" type="primary" :disabled="CLOSED_STATUS.includes(it.status)" @click="doResolve">解决</el-button>
                <el-button size="small" type="warning" plain :disabled="CLOSED_STATUS.includes(it.status)" @click="doEscalate">升级</el-button>
                <el-button size="small" @click="openLink">关联重复事件</el-button>
                <el-button size="small" @click="createProblem">开出问题单</el-button>
                <el-button size="small" @click="createChange">开出变更单</el-button>
                <el-button size="small" @click="openBroadcast">事件广播</el-button>
                <el-button size="small" type="success" :disabled="it.status === 'CLOSED'" @click="openClose">关闭</el-button>
              </div>
              <div class="text-xs muted mt-3">操作权限按当前角色判定：服务台可受理与广播，运维可处理 / 升级 / 开单，处理动作均写入事件审计。</div>
            </div>
          </div>

          <div class="card mb-4">
            <div class="card__head">
              <div class="card__title">关联知识条目</div>
              <span class="card__spacer" />
              <span class="bold">{{ arr(it.knowledgeRefs).length }} 条</span>
            </div>
            <div class="card__body">
              <div v-if="!arr(it.knowledgeRefs).length" class="empty-box">
                <div class="empty-box__icon"><el-icon><Tickets /></el-icon></div>
                <div class="empty-box__text">暂无关联知识条目</div>
              </div>
              <div v-else class="kb-list">
                <div v-for="kid in listOf(it.knowledgeRefs)" :key="kid" class="kb-item">
                  <div class="kb-item__head">
                    <span class="bold text-sm">{{ (knowledges.find(k => k.id === kid) as any)?.title ?? kid }}</span>
                    <StatusTag dict="KnowledgeStatus" :value="(knowledges.find(k => k.id === kid) as any)?.status" :dot="false" />
                  </div>
                  <div class="text-xs muted mt-1">
                    {{ (knowledges.find(k => k.id === kid) as any)?.categoryName }} ·
                    维护人 {{ (knowledges.find(k => k.id === kid) as any)?.owner }} ·
                    引用 {{ (knowledges.find(k => k.id === kid) as any)?.refCount }} 次
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="card mb-4">
            <div class="card__head">
              <div class="card__title">关联的重复事件</div>
              <span class="card__spacer" />
              <span class="bold">{{ relateList.length }} 条</span>
            </div>
            <div class="card__body">
              <div v-if="!relateList.length" class="empty-box">
                <div class="empty-box__icon"><el-icon><Link /></el-icon></div>
                <div class="empty-box__text">暂无关联的重复事件</div>
              </div>
              <div v-else class="rel-list">
                <div v-for="r in relateList" :key="r.id" class="rel-item" @click="router.push(`/incident/detail/${r.id}`)">
                  <div class="flex items-center justify-between">
                    <span class="mono text-sm">{{ r.no }}</span>
                    <StatusTag dict="IncidentStatus" :value="r.status" :dot="false" />
                  </div>
                  <div class="text-sm mt-1">{{ r.title }}</div>
                  <div class="text-xs muted mt-1">{{ fmtTime(r.slaDueAt) }} 截止 · 处理人 {{ r.handler }}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="card mb-4">
            <div class="card__head"><div class="card__title">开出的问题单 / 变更单</div></div>
            <div class="card__body">
              <div class="drv-item" :class="{ 'drv-item--link': !!problem }" @click="gotoProblem">
                <div class="flex items-center justify-between">
                  <span class="text-sm bold">问题单</span>
                  <StatusTag v-if="problem" dict="ProblemStatus" :value="problem.status" :dot="false" />
                </div>
                <template v-if="problem">
                  <div class="mono text-sm mt-1 flex items-center gap-1">{{ problem.no }} <el-icon><ArrowRight /></el-icon></div>
                  <div class="text-sm">{{ problem.title }}</div>
                </template>
                <div v-else class="text-sm muted mt-1">尚未开出问题单</div>
              </div>
              <div class="drv-item" :class="{ 'drv-item--link': !!change }" @click="gotoChange">
                <div class="flex items-center justify-between">
                  <span class="text-sm bold">变更单</span>
                  <StatusTag v-if="change" dict="ChangeStatus" :value="change.status" :dot="false" />
                </div>
                <template v-if="change">
                  <div class="mono text-sm mt-1 flex items-center gap-1">{{ change.no }} <el-icon><ArrowRight /></el-icon></div>
                  <div class="text-sm">{{ change.title }}</div>
                </template>
                <div v-else class="text-sm muted mt-1">尚未开出变更单</div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card__head">
              <div class="card__title">广播记录</div>
              <span class="card__spacer" />
              <span class="bold">{{ broadcasts.length }} 条</span>
            </div>
            <div class="card__body">
              <div v-if="!broadcasts.length" class="empty-box">
                <div class="empty-box__icon"><el-icon><Promotion /></el-icon></div>
                <div class="empty-box__text">尚未广播该事件</div>
              </div>
              <div v-else class="rel-list">
                <div v-for="b in broadcasts" :key="b.id" class="rel-item">
                  <div class="text-sm bold">{{ b.title }}</div>
                  <div class="text-xs muted mt-1">
                    {{ fmtTime(b.sentAt) }} · {{ b.sender }}（{{ b.senderOrg }}）
                  </div>
                  <div class="text-xs muted">目标：{{ listOf(b.targets).map((t: any) => listOf(t.ids).join('、')).join('；') }}</div>
                  <div class="text-xs muted">渠道：{{ listOf(b.channels).join(' / ') }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="card">
      <div class="card__body">
        <div class="empty-box">
          <div class="empty-box__icon"><el-icon><Search /></el-icon></div>
          <div class="empty-box__text">未找到事件单「{{ id }}」，可能已被删除或重置</div>
          <el-button class="mt-3" type="primary" @click="router.push('/incident/list')">返回事件列表</el-button>
        </div>
      </div>
    </div>

    <!-- ================================================ 关联重复事件 -- -->
    <el-dialog v-model="linkVisible" title="关联重复事件" width="700px">
      <div class="text-sm muted mb-2">选择与本事件重复的其他事件单，系统将自动统计重复数量。</div>
      <el-select v-model="linkSelection" multiple filterable placeholder="选择重复事件" style="width: 100%">
        <el-option
          v-for="x in incidents.filter(y => y.id !== it?.id)"
          :key="x.id"
          :label="`${x.no} · ${x.title}`"
          :value="x.id"
        />
      </el-select>
      <div class="mt-3 text-sm">已选择 <b>{{ linkSelection.length }}</b> 条</div>
      <template #footer>
        <el-button @click="linkVisible = false">取消</el-button>
        <el-button type="primary" @click="saveLink">保存关联</el-button>
      </template>
    </el-dialog>

    <!-- ==================================================== 事件广播 -- -->
    <el-dialog v-model="bcVisible" title="事件广播" width="660px">
      <el-form label-width="90px">
        <el-form-item label="广播标题"><el-input v-model="bcForm.title" /></el-form-item>
        <el-form-item label="广播内容"><el-input v-model="bcForm.content" type="textarea" :rows="6" /></el-form-item>
        <el-form-item label="目标群组">
          <el-select v-model="bcForm.groups" multiple style="width: 100%">
            <el-option v-for="g in ['全部用户', '用数方', '供数方', '订阅方', '运维中心', '服务台']" :key="g" :label="g" :value="g" />
          </el-select>
        </el-form-item>
        <el-form-item label="广播渠道">
          <el-checkbox-group v-model="bcForm.channels">
            <el-checkbox v-for="c in ['站内', '邮件', '短信']" :key="c" :value="c">{{ c }}</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="bcVisible = false">取消</el-button>
        <el-button type="primary" @click="saveBroadcast">发送广播</el-button>
      </template>
    </el-dialog>

    <!-- ==================================================== 关闭事件 -- -->
    <el-dialog v-model="closeVisible" title="关闭事件" width="580px">
      <el-form label-width="90px">
        <el-form-item label="关闭方式">
          <el-radio-group v-model="closeForm.closeType">
            <el-radio v-for="(v, k) in config.dicts.CloseType" :key="k" :value="k">{{ (v as any).label }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="关闭说明"><el-input v-model="closeForm.comment" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="closeVisible = false">取消</el-button>
        <el-button type="primary" @click="saveClose">确认关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.sla { font-weight: 600; }
.sla--danger { color: var(--danger-fg); }
.sla--warning { color: var(--warning-fg); }
.sla--muted { color: var(--text-3); }
.mr-1 { margin-right: var(--sp-1); }
.cell-sub { font-size: var(--fs-xs); color: var(--text-3); margin-top: 2px; }
.op-list { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
.op-list :deep(.el-button + .el-button) { margin-left: 0; }
.kb-list, .rel-list { display: flex; flex-direction: column; gap: var(--sp-3); }
.kb-item, .rel-item {
  padding: var(--sp-3); border: 1px solid var(--border-2);
  border-radius: var(--r-md); background: var(--surface-2);
}
.rel-item { cursor: pointer; transition: border-color var(--t-base); }
.rel-item:hover { border-color: var(--brand-400); }
.drv-item {
  padding: var(--sp-3); border: 1px solid var(--border-2);
  border-radius: var(--r-md); margin-bottom: var(--sp-2);
}
.drv-item--link { cursor: pointer; }
.drv-item--link:hover { border-color: var(--brand-400); background: var(--brand-50); }
.drv-item:last-child { margin-bottom: 0; }
</style>
