<script setup lang="ts">
/**
 * ProblemDetailView —— 问题单详情
 *
 * 覆盖功能点：问题根因分析、已知错误流程（临时解决方案 + 根治计划）、
 * 解决方案与预防措施、问题通知记录、问题关联（事件 / 变更 / 配置项 / 知识条目）、
 * 问题流转（分派 / 重新分派 / 升级 / 解决 / 手工关闭 / 自动关闭 / 提交知识条目）与问题审计。
 */
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDemoStore, dictItem } from '@/stores/demo'
import { config } from '@/core/config'
import { fmtDate, fmtTime, fromNow, iso, addDays, NOW, nowStamp } from '@/core/utils'
import PageHead from '@/components/PageHead.vue'
import StatusTag from '@/components/StatusTag.vue'

const store = useDemoStore()
const route = useRoute()
const router = useRouter()

/** 安全取数组（模板中统一使用，避免 unknown[] 的类型噪音） */
const list = (v: unknown): any[] => (Array.isArray(v) ? v : [])

const id = computed(() => String(route.params.id ?? ''))
const p = computed<any>(() => store.findById('problems', id.value))
const stepIndex = computed(() => (config.flowIndex.Problem as any)[p.value?.status] ?? 0)

const deptOptions = [
  '运维中心 · 一线支持组', '运维中心 · 二线支持组', '运维中心 · 专家组',
  '数据生产中心 · 加工组', '平台运营中心'
]

/* --------------------------------------------------------- 关联对象 -- */
const incidentOf = (iid: string) => (store.table('incidents') as any[]).find(i => i.id === iid)
const changeOf = (cid: string) => (store.table('changes') as any[]).find(c => c.id === cid)
const ciOf = (cid: string) => (store.table('cis') as any[]).find(c => c.id === cid)
const knowledge = computed<any>(() => (p.value?.knowledgeId ? store.findById('knowledges', p.value.knowledgeId) : null))
/** 由本问题驱动的发布单（发布管理侧写入 problemIds） */
const relatedReleases = computed(() => (store.table('releases') as any[]).filter(r => list(r.problemIds).includes(id.value)))

function openIncident(iid: string) {
  const i = incidentOf(iid)
  if (!i) { ElMessage.warning('关联事件不存在'); return }
  ElMessageBox.alert(
    `事件单号：${i.no}\n标题：${i.title}\n状态：${dictItem('IncidentStatus', i.status).label} · 处理人：${i.handler}\n来源：${i.source}`,
    '关联事件', { confirmButtonText: '去事件管理查看' }
  ).then(() => router.push('/incident/list')).catch(() => { /* 关闭 */ })
}

/* --------------------------------------------------------- 审计日志 -- */
const audits = computed(() => (store.table('audits') as any[]).filter(a => a.bizId === id.value))

/* ------------------------------------------------------- 根因分析 -- */
const rootCauseDraft = ref('')
const rootCauseEditing = ref(false)
function startEditRootCause() {
  rootCauseDraft.value = p.value?.rootCause ?? ''
  rootCauseEditing.value = true
}
function saveRootCause() {
  const rec = p.value
  if (!rec) return
  if (!rootCauseDraft.value.trim()) { ElMessage.warning('请填写根因分析结论'); return }
  store.update('problems', rec.id, {
    rootCause: rootCauseDraft.value.trim(),
    status: ['NEW', 'DISPATCHED'].includes(rec.status) ? 'ANALYZING' : rec.status
  }, { action: '根因分析', remark: rootCauseDraft.value.trim().slice(0, 60) })
  store.pushTimeline(rec, { action: '根因分析完成', comment: rootCauseDraft.value.trim() })
  store.persist()
  rootCauseEditing.value = false
  ElMessage.success('根因分析已保存')
}

/* ------------------------------------------------- 分派 / 升级 / 关闭 -- */
function assign() {
  const rec = p.value
  if (!rec) return
  const reselect = rec.status !== 'NEW'
  ElMessageBox.prompt(
    `请选择归属部门与处理人\n可选部门：${deptOptions.join(' / ')}\n可选处理人：徐鹏（一线）、陈志刚（二线）`,
    reselect ? `重新分派问题单 ${rec.no}` : `分派问题单 ${rec.no}`,
    { inputValue: `${rec.dept || deptOptions[1]} / ${rec.handler === '—' ? '陈志刚' : rec.handler}`, inputType: 'textarea', confirmButtonText: '确认分派' }
  ).then(({ value }) => {
    const [dept, handler] = String(value).split('/').map(s => s.trim())
    store.update('problems', rec.id, { dept: dept || rec.dept, handler: handler || rec.handler, status: rec.status === 'NEW' ? 'DISPATCHED' : rec.status },
      { action: reselect ? '重新分派' : '分派', remark: `分派至 ${dept} / ${handler}` })
    store.pushTimeline(rec, { action: reselect ? '重新分派' : '分派', comment: `分派至 ${dept} / ${handler}` })
    store.notify({ type: 'info', title: `问题单 ${rec.no} 已分派`, body: `处理人：${handler}（${dept}）`, toRoles: ['ops'], link: `/problem/detail/${rec.id}` })
    ElMessage.success(`已分派至 ${dept} / ${handler}`)
  }).catch(() => { /* 取消 */ })
}

function escalate() {
  const rec = p.value
  if (!rec) return
  ElMessageBox.prompt('请填写问题升级原因（将同步至专家组与关注人）', `升级问题单 ${rec.no}`, {
    inputValue: '一线无法定位根因，升级至二线专家组介入分析。', inputType: 'textarea', confirmButtonText: '确认升级'
  }).then(({ value }) => {
    const nextPriority = rec.priority === 'P2' ? 'P1' : rec.priority === 'P3' ? 'P2' : rec.priority
    store.update('problems', rec.id, { dept: '运维中心 · 专家组', priority: nextPriority, escalatedAt: iso() }, { action: '问题升级', remark: value })
    store.pushTimeline(rec, { action: '问题升级', comment: `${value}（优先级调整为 ${nextPriority}）` })
    store.notify({ type: 'warning', title: `问题单 ${rec.no} 已升级`, body: value, toRoles: ['ops', 'supplier'], link: `/problem/detail/${rec.id}` })
    ElMessage.success('已升级至运维中心 · 专家组')
  }).catch(() => { /* 取消 */ })
}

const closeVisible = ref(false)
const closeForm = reactive({ closeType: '手工关闭', remark: '' })
function submitClose() {
  const rec = p.value
  if (!rec) return
  store.update('problems', rec.id, { status: 'CLOSED', closedAt: iso(), closeType: closeForm.closeType }, { action: closeForm.closeType, remark: closeForm.remark })
  store.pushTimeline(rec, { action: closeForm.closeType, comment: closeForm.remark || `${closeForm.closeType}，问题闭环` })
  closeVisible.value = false
  ElMessage.success(`已${closeForm.closeType}，问题单闭环`)
}

/* --------------------------------------------------- 已知错误流程 -- */
const keVisible = ref(false)
const keForm = reactive({ workaround: '', permanentFixPlan: '', expireAt: '' })
function openKnownError() {
  keForm.workaround = p.value?.knownError?.workaround ?? ''
  keForm.permanentFixPlan = p.value?.knownError?.permanentFixPlan ?? ''
  keForm.expireAt = p.value?.knownError?.expireAt ?? ''
  keVisible.value = true
}
function submitKnownError() {
  const rec = p.value
  if (!rec) return
  if (!keForm.workaround.trim() || !keForm.permanentFixPlan.trim()) { ElMessage.warning('请填写临时解决方案与根治计划'); return }
  store.update('problems', rec.id, {
    status: 'KNOWN_ERROR',
    knownError: { workaround: keForm.workaround.trim(), permanentFixPlan: keForm.permanentFixPlan.trim(), expireAt: keForm.expireAt }
  }, { action: '转入已知错误流程', remark: keForm.workaround.trim().slice(0, 60) })
  store.pushTimeline(rec, { action: '转入已知错误流程', comment: `临时方案：${keForm.workaround.trim()}｜根治计划：${keForm.permanentFixPlan.trim()}` })
  store.notify({
    type: 'warning', title: `问题单 ${rec.no} 已转入已知错误流程`,
    body: `临时解决方案已发布，根治计划到期日 ${keForm.expireAt || '待定'}。`, toRoles: ['ops', 'desk'], link: `/problem/detail/${rec.id}`
  })
  keVisible.value = false
  ElMessage.success('已转入已知错误流程，临时解决方案已记录')
}

/* ------------------------------------------------------- 解决 -- */
const solveVisible = ref(false)
const solveForm = reactive({ solution: '', preventive: '' })
function openSolve() {
  solveForm.solution = p.value?.solution ?? ''
  solveForm.preventive = p.value?.preventive ?? ''
  solveVisible.value = true
}
function submitSolve() {
  const rec = p.value
  if (!rec) return
  if (!solveForm.solution.trim()) { ElMessage.warning('请填写解决方案'); return }
  store.update('problems', rec.id, { status: 'RESOLVED', solution: solveForm.solution.trim(), preventive: solveForm.preventive.trim(), resolvedAt: iso() },
    { action: '问题解决', remark: solveForm.solution.trim().slice(0, 60) })
  store.pushTimeline(rec, { action: '解决', comment: `解决方案：${solveForm.solution.trim()}${solveForm.preventive.trim() ? `｜预防措施：${solveForm.preventive.trim()}` : ''}` })
  store.notify({ type: 'success', title: `问题单 ${rec.no} 已解决`, body: solveForm.solution.trim(), toRoles: ['desk', 'consumer', 'supplier'], link: `/problem/detail/${rec.id}` })
  solveVisible.value = false
  ElMessage.success('问题已解决，可关闭或提交知识条目')
}

/* --------------------------------------------------- 提交知识条目 -- */
const kbVisible = ref(false)
const kbForm = reactive({ title: '', content: '', categoryId: 'kc011' })
const kbLeaves = computed(() => {
  const out: { id: string; name: string }[] = []
  for (const top of store.table('kbCategories') as any[]) {
    if (!list(top.children).length) out.push({ id: top.id, name: top.name })
    for (const c of list(top.children)) out.push({ id: c.id, name: `${top.name} / ${c.name}` })
  }
  return out
})
function openKnowledge() {
  const rec = p.value
  if (!rec) return
  kbForm.title = rec.title
  kbForm.content = `【问题】${rec.title}\n【根因】${rec.rootCause || '—'}\n【解决方案】${rec.solution || '—'}\n【预防措施】${rec.preventive || '—'}`
  kbVisible.value = true
}
function submitKnowledge() {
  const rec = p.value
  if (!rec) return
  if (!kbForm.title.trim()) { ElMessage.warning('请填写知识条目标题'); return }
  const cat = kbLeaves.value.find(c => c.id === kbForm.categoryId)
  const rows = store.table('knowledges') as any[]
  const kb = store.insert('knowledges', {
    no: `${config.prefixes.knowledges}${nowStamp().slice(0, 6)}${String(rows.length + 1).padStart(4, '0')}`,
    title: kbForm.title.trim(),
    categoryId: kbForm.categoryId,
    categoryName: cat ? String(cat.name).split(' / ').pop() : '数据需求管理',
    owner: store.user.name, status: 'PENDING_REVIEW', refCount: 0,
    contentText: kbForm.content.split('\n').filter(Boolean).join(' '),
    contentHtml: `<h3>问题描述</h3><p>${rec.title}</p><h3>根因分析</h3><p>${rec.rootCause || '—'}</p>`
      + `<h3>解决方案</h3><p>${rec.solution || '—'}</p><h3>预防措施</h3><p>${rec.preventive || '—'}</p>`,
    attachments: [], ratings: [], comments: [], relatedIds: list(rec.sourceIncidentIds)
  })
  store.update('problems', rec.id, { knowledgeId: kb.id }, { action: '提交知识条目', remark: `生成知识条目 ${kb.no}（待审核）` })
  store.pushTimeline(rec, { action: '提交知识条目', comment: `已生成知识条目 ${kb.no}，等待知识库审核发布` })
  kbVisible.value = false
  ElMessageBox.confirm(`已生成知识条目 ${kb.no}，状态为「待审核」，需知识库维护责任人审核后发布。`, '提交成功', {
    confirmButtonText: '去知识库查看', cancelButtonText: '留在本页'
  }).then(() => router.push('/kb/list')).catch(() => { /* 留在本页 */ })
}

/* ------------------------------------------------------- 通知 -- */
const notifyVisible = ref(false)
const notifyForm = reactive({ channels: ['邮件'] as string[], to: '', content: '' })
function openNotify() {
  const rec = p.value
  if (!rec) return
  notifyForm.to = `${rec.handler === '—' ? '王思远' : rec.handler}（${rec.dept || '运维中心'}）`
  notifyForm.content = `【三医数据底座】问题单 ${rec.no}「${rec.title}」当前状态：${dictItem('ProblemStatus', rec.status).label}，请关注处理进展。`
  notifyForm.channels = ['邮件']
  notifyVisible.value = true
}
function submitNotify() {
  const rec = p.value
  if (!rec) return
  if (!notifyForm.channels.length) { ElMessage.warning('请选择通知方式（邮件 / 短信）'); return }
  if (!notifyForm.to.trim()) { ElMessage.warning('请填写收件人'); return }
  const logs = notifyForm.channels.map(ch => ({ at: iso(), to: notifyForm.to.trim(), channel: ch, content: notifyForm.content }))
  store.update('problems', rec.id, { notifyLogs: [...list(rec.notifyLogs), ...logs], notifyChannels: notifyForm.channels },
    { action: '发送问题通知', remark: `${notifyForm.channels.join('、')} → ${notifyForm.to.trim()}` })
  store.pushTimeline(rec, { action: '发送通知', comment: `通过 ${notifyForm.channels.join('、')} 通知 ${notifyForm.to.trim()}` })
  notifyVisible.value = false
  ElMessage.success(`已通过${notifyForm.channels.join('、')}发送通知`)
}

const canManage = computed(() => store.can('problem.manage') || store.can('problem.rootcause'))

/* ------------------------------------------------- 由问题创建发布申请 -- */
/**
 * 原文（发布管理）：由需求 / 问题驱动创建发布申请单，确定升级内容与停机时间。
 * 原实现只在发布管理列表里下拉选择需求与变更，问题单侧没有任何入口，
 * 导致「事件 → 问题 → 发布」这条链路在步骤 5 断掉。这里补齐问题侧的直达入口。
 */
const releaseVisible = ref(false)
const releaseForm = reactive({ title: '', changeContent: '', testResult: '', releaseAt: '', downtime: '', version: '' })
function openRelease() {
  const rec = p.value
  if (!rec) return
  releaseForm.title = `问题 ${rec.no} 根治版本发布`
  releaseForm.changeContent = [
    `由问题单 ${rec.no} 驱动：${rec.title}`,
    rec.rootCause ? `根因：${rec.rootCause}` : '',
    rec.solution ? `解决方案：${rec.solution}` : '',
    rec.preventive ? `预防措施：${rec.preventive}` : ''
  ].filter(Boolean).join('\n')
  releaseForm.testResult = ''
  releaseForm.releaseAt = `${fmtDate(addDays(NOW, 3))} 22:00`
  releaseForm.downtime = '2026-09-03 22:00-23:00（预计 60 分钟）'
  releaseForm.version = 'v1.6.0'
  releaseVisible.value = true
}
function submitRelease() {
  const rec = p.value
  if (!rec) return
  if (!releaseForm.title.trim()) { ElMessage.warning('请填写发布标题'); return }
  if (!releaseForm.releaseAt) { ElMessage.warning('请选择发布时间'); return }
  const rows = store.table('releases') as any[]
  const no = `${config.prefixes.releases}${nowStamp()}${String(rows.length + 1).padStart(3, '0')}`
  const rel = store.insert('releases', {
    no,
    title: releaseForm.title.trim(),
    demandIds: [], changeIds: [],
    problemIds: [rec.id],
    changeContent: releaseForm.changeContent.trim() || `由问题单 ${rec.no} 驱动`,
    testResult: releaseForm.testResult.trim() || '测试情况待确认',
    releaseAt: releaseForm.releaseAt,
    downtime: releaseForm.downtime || '无（热更新）',
    status: 'APPLYING', applicant: store.user.name, approver: null, approvedAt: null,
    packages: releaseForm.version
      ? [{ version: releaseForm.version, archivedAt: iso(), operator: store.user.name, remark: '申请时预归档发布包' }]
      : [],
    verifyItems: [
      { name: '发布内容与变更单一致性核对', result: '未执行' },
      { name: '核心接口调用成功率', result: '未执行' },
      { name: '订阅方数据完整性', result: '未执行' },
      { name: '既有功能回归', result: '未执行' }
    ],
    auditNote: '', auditedAt: null, timeline: []
  })
  store.pushTimeline(rel, {
    action: '提交发布申请',
    comment: `由问题单 ${rec.no} 驱动；计划发布时间 ${releaseForm.releaseAt}，停机时间 ${releaseForm.downtime}`
  })
  store.update('problems', rec.id, { releaseId: rel.id }, { action: '创建发布申请', remark: `生成发布单 ${no}` })
  store.pushTimeline(rec, { action: '创建发布申请', comment: `已生成发布单 ${no}，等待数据资源管理人员批复` })
  store.notify({
    type: 'info', title: `发布申请 ${no} 待批复`,
    body: `问题 ${rec.no} 的根治版本发布已提交，发布时间 ${releaseForm.releaseAt}。`,
    toRoles: ['ops', 'supplier', 'admin'], link: `/release/detail/${rel.id}`
  })
  releaseVisible.value = false
  ElMessageBox.confirm(`已生成发布申请 ${no}（由问题单 ${rec.no} 驱动），状态为「申请中」。`, '提交成功', {
    confirmButtonText: '去发布管理查看', cancelButtonText: '留在本页'
  }).then(() => router.push(`/release/detail/${rel.id}`)).catch(() => { /* 留在本页 */ })
}
</script>

<template>
  <div>
    <PageHead :title="p ? `问题单详情 · ${p.no}` : '问题单详情'" :desc="p ? p.title : '未找到该问题单'">
      <template #actions>
        <el-button @click="router.push('/problem/list')"><el-icon><ArrowLeft /></el-icon> 返回列表</el-button>
        <el-button v-if="p && canManage" @click="assign">分派 / 重新分派</el-button>
        <el-button v-if="p && canManage" @click="escalate">问题升级</el-button>
        <el-button v-if="p && canManage" :disabled="p.status === 'CLOSED'" @click="openKnownError">转入已知错误流程</el-button>
        <el-button v-if="p && canManage" type="primary" :disabled="p.status === 'CLOSED'" @click="openSolve">解决</el-button>
        <el-button v-if="p && canManage" :disabled="p.status === 'CLOSED'" @click="closeVisible = true">关闭</el-button>
        <el-button v-if="p && canManage" type="success" plain @click="openKnowledge">提交知识条目</el-button>
        <el-button v-if="p && canManage" type="warning" plain @click="openRelease">创建发布申请</el-button>
        <el-button v-if="p" @click="openNotify">发送通知</el-button>
      </template>
    </PageHead>

    <div v-if="!p" class="empty-box">
      <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
      <div class="empty-box__text">未找到问题单（可能已被重置），请返回列表重新选择</div>
    </div>

    <template v-else>
      <!-- 流转条 -->
      <div class="card mb-4">
        <div class="card__head">
          <span class="card__title">问题流转状态</span>
          <span class="card__sub">已进入「{{ (config.flows.Problem as any)[stepIndex] }}」环节 · 第 {{ stepIndex + 1 }}/{{ (config.flows.Problem as string[]).length }} 步</span>
          <span class="card__spacer" />
          <StatusTag dict="ProblemStatus" :value="p.status" />
          <StatusTag dict="Priority" :value="p.priority" :dot="false" />
        </div>
        <div class="card__body">
          <div class="flow">
            <div
              v-for="(s, i) in (config.flows.Problem as string[])" :key="s" class="flow__step"
              :class="{
                'flow__step--done': i < stepIndex,
                'flow__step--active': i === stepIndex,
                'flow__step--reject': p.status === 'KNOWN_ERROR' && i === stepIndex
              }"
            >
              <div class="flow__dot">{{ i + 1 }}</div>
              <div class="flow__label">{{ s }}</div>
              <div class="flow__time">{{ i <= stepIndex ? '已流转' : '待流转' }}</div>
            </div>
          </div>
          <div v-if="p.status === 'KNOWN_ERROR'" class="text-xs muted mt-2">
            该问题已找到根因但暂时无法根本解决，当前通过独立的「已知错误管理流程」管理：一线按临时解决方案处置，根治计划完成后回归正常解决流程。
          </div>
          <div v-if="p.status === 'CLOSED'" class="text-xs muted mt-2">
            该问题单已关闭（终态）：关闭 / 解决 / 转入已知错误流程已停用；仍可提交知识条目、创建发布申请与发送通知。
          </div>
        </div>
      </div>

      <div class="grid grid--side">
        <div>
          <!-- 基本信息 -->
          <div class="card mb-4">
            <div class="card__head"><span class="card__title">基本信息</span></div>
            <div class="card__body">
              <div class="desc-grid desc-grid--2">
                <div class="desc-item"><span class="desc-item--label">问题单号</span><span class="desc-item__value mono">{{ p.no }}</span></div>
                <div class="desc-item"><span class="desc-item--label">来源</span><span class="desc-item__value">{{ p.source === 'INCIDENT' ? '由事件创建' : '手工创建' }}</span></div>
                <div class="desc-item desc-item--wide"><span class="desc-item--label">问题标题</span><span class="desc-item__value">{{ p.title }}</span></div>
                <div class="desc-item"><span class="desc-item--label">严重等级</span><span class="desc-item__value"><StatusTag dict="Severity" :value="p.severity" /></span></div>
                <div class="desc-item"><span class="desc-item--label">影响程度</span><span class="desc-item__value">{{ p.impact }}</span></div>
                <div class="desc-item"><span class="desc-item--label">紧急程度</span><span class="desc-item__value">{{ p.urgency }}</span></div>
                <div class="desc-item"><span class="desc-item--label">优先级</span><span class="desc-item__value"><StatusTag dict="Priority" :value="p.priority" :dot="false" /></span></div>
                <div class="desc-item"><span class="desc-item--label">处理人</span><span class="desc-item__value">{{ p.handler || '—' }}</span></div>
                <div class="desc-item"><span class="desc-item--label">归属部门</span><span class="desc-item__value">{{ p.dept || '未分派' }}</span></div>
                <div class="desc-item"><span class="desc-item--label">创建时间</span><span class="desc-item__value">{{ fmtTime(p.createdAt) }}（{{ fromNow(p.createdAt) }}）</span></div>
                <div class="desc-item"><span class="desc-item--label">期望解决</span><span class="desc-item__value">{{ p.expectAt || '—' }}</span></div>
                <div class="desc-item"><span class="desc-item--label">解决时间</span><span class="desc-item__value">{{ p.resolvedAt ? fmtTime(p.resolvedAt) : '—' }}</span></div>
                <div class="desc-item"><span class="desc-item--label">关闭时间</span><span class="desc-item__value">{{ p.closedAt ? fmtTime(p.closedAt) : '—' }}</span></div>
                <div class="desc-item"><span class="desc-item--label">通知方式</span><span class="desc-item__value">
                  <StatusTag v-for="c in list(p.notifyChannels)" :key="String(c)" dict="NotifyChannel" :value="String(c)" :dot="false" style="margin-right: 6px" />
                </span></div>
              </div>
            </div>
          </div>

          <!-- 根因分析 -->
          <div class="card mb-4">
            <div class="card__head">
              <span class="card__title">根因分析</span>
              <span class="card__spacer" />
              <el-button v-if="!rootCauseEditing" size="small" type="primary" :disabled="!canManage" @click="startEditRootCause">
                {{ p.rootCause ? '修订根因' : '填写根因' }}
              </el-button>
              <template v-else>
                <el-button size="small" @click="rootCauseEditing = false">取消</el-button>
                <el-button size="small" type="primary" @click="saveRootCause">保存</el-button>
              </template>
            </div>
            <div class="card__body">
              <div v-if="!rootCauseEditing" class="text-sm">{{ p.rootCause || '尚未填写根因分析结论' }}</div>
              <el-input v-else v-model="rootCauseDraft" type="textarea" :rows="4" placeholder="填写根本原因分析结论（保存后流转为「分析中」）" />
            </div>
          </div>

          <!-- 已知错误 -->
          <div v-if="p.knownError" class="known-error mb-4">
            <div class="flex items-center justify-between mb-2">
              <span class="bold flex items-center gap-1"><el-icon><Share /></el-icon> 已知错误（独立管理流程）</span>
              <el-button link type="primary" size="small" :disabled="!canManage || p.status === 'CLOSED'" @click="openKnownError">更新临时方案 / 根治计划</el-button>
            </div>
            <div class="desc-item"><span class="desc-item--label">临时解决方案</span><span class="desc-item__value">{{ p.knownError.workaround }}</span></div>
            <div class="desc-item mt-2"><span class="desc-item--label">根治计划</span><span class="desc-item__value">{{ p.knownError.permanentFixPlan }}</span></div>
            <div class="desc-item mt-2"><span class="desc-item--label">计划完成日</span><span class="desc-item__value">{{ p.knownError.expireAt || '待定' }}</span></div>
          </div>

          <!-- 解决方案与预防措施 -->
          <div class="card mb-4">
            <div class="card__head">
              <span class="card__title">解决方案与预防措施</span>
              <span class="card__spacer" />
              <el-button size="small" type="primary" plain :disabled="!canManage || p.status === 'CLOSED'" @click="openSolve">
                {{ p.solution ? '修订方案' : '填写方案' }}
              </el-button>
            </div>
            <div class="card__body">
              <div class="desc-item"><span class="desc-item--label">解决方案</span><span class="desc-item__value">{{ p.solution || '—' }}</span></div>
              <div class="desc-item mt-2"><span class="desc-item--label">预防措施</span><span class="desc-item__value">{{ p.preventive || '—' }}</span></div>
            </div>
          </div>

          <!-- 问题通知记录 -->
          <div class="card mb-4">
            <div class="card__head">
              <span class="card__title">通知记录（邮件 / 短信）</span>
              <span class="card__spacer" />
              <el-button size="small" type="primary" plain @click="openNotify">发送通知</el-button>
            </div>
            <div class="card__body card__body--flush">
              <el-table :data="list(p.notifyLogs)" size="small">
                <el-table-column prop="at" label="时间" width="130" />
                <el-table-column prop="to" label="收件人" width="190" show-overflow-tooltip />
                <el-table-column label="渠道" width="86">
                  <template #default="{ row }"><StatusTag dict="NotifyChannel" :value="row.channel" :dot="false" /></template>
                </el-table-column>
                <el-table-column prop="content" label="通知内容" min-width="240" show-overflow-tooltip />
                <template #empty><div class="empty-box"><div class="empty-box__text">尚未发送通知</div></div></template>
              </el-table>
            </div>
          </div>

          <!-- 问题关联 -->
          <div class="card mb-4">
            <div class="card__head"><span class="card__title">问题关联</span><span class="card__sub">事件 / 变更 / 配置项 / 知识条目</span></div>
            <div class="card__body">
              <div class="bold text-sm mb-1">关联事件（{{ list(p.sourceIncidentIds).length }}）</div>
              <div v-if="list(p.sourceIncidentIds).length" class="flex wrap gap-2 mb-3">
                <el-button v-for="iid in list(p.sourceIncidentIds)" :key="String(iid)" size="small" @click="openIncident(String(iid))">
                  {{ incidentOf(String(iid))?.no ?? iid }} · {{ incidentOf(String(iid))?.title?.slice(0, 18) ?? '事件' }}
                </el-button>
              </div>
              <div v-else class="text-sm muted mb-3">无关联事件（手工创建）</div>

              <div class="bold text-sm mb-1">关联变更（{{ list(p.relatedChangeIds).length }}）</div>
              <div v-if="list(p.relatedChangeIds).length" class="flex wrap gap-2 mb-3">
                <el-button v-for="cid in list(p.relatedChangeIds)" :key="String(cid)" size="small" @click="router.push('/change/list')">
                  {{ changeOf(String(cid))?.no ?? cid }} · {{ changeOf(String(cid))?.title?.slice(0, 18) ?? '变更' }}
                </el-button>
              </div>
              <div v-else class="text-sm muted mb-3">暂无关联变更</div>

              <div class="bold text-sm mb-1">关联配置项（{{ list(p.relatedCiIds).length }}）</div>
              <div v-if="list(p.relatedCiIds).length" class="flex wrap gap-2 mb-3">
                <StatusTag v-for="cid in list(p.relatedCiIds)" :key="String(cid)" dict="" :label="`${ciOf(String(cid))?.name ?? cid}（${ciOf(String(cid))?.type ?? '配置项'}）`" tone="info" />
              </div>
              <div v-else class="text-sm muted mb-3">暂无关联配置项</div>

              <div class="bold text-sm mb-1">知识条目</div>
              <div v-if="knowledge" class="flex items-center gap-2">
                <StatusTag dict="KnowledgeStatus" :value="knowledge.status" />
                <el-button link type="primary" @click="router.push('/kb/list')">《{{ knowledge.title }}》（{{ knowledge.no }}）</el-button>
              </div>
              <div v-else class="text-sm muted">尚未提交知识条目（已找到根因且有解决方案的问题可提交给知识管理）</div>

              <div class="bold text-sm mb-1 mt-3">关联发布（{{ relatedReleases.length }}）</div>
              <div v-if="relatedReleases.length" class="flex wrap gap-2">
                <el-button v-for="rel in relatedReleases" :key="rel.id" size="small" @click="router.push(`/release/detail/${rel.id}`)">
                  {{ rel.no }} · {{ String(rel.title).slice(0, 18) }}
                </el-button>
              </div>
              <div v-else class="text-sm muted">尚未创建发布申请（可点右上角「创建发布申请」，由本问题驱动发布根治版本）</div>
            </div>
          </div>
        </div>

        <!-- 右栏 -->
        <div>
          <div class="card mb-4">
            <div class="card__head"><span class="card__title">处理时间轴</span></div>
            <div class="card__body">
              <div class="tl">
                <div v-for="(t, i) in list(p.timeline)" :key="i" class="tl__item" :class="i === list(p.timeline).length - 1 ? 'tl__item--active' : 'tl__item--done'">
                  <div class="tl__dot" />
                  <div class="tl__head">
                    <span class="tl__action">{{ t.action }}</span>
                    <span class="tl__meta">{{ t.actor }} · {{ t.at }}</span>
                  </div>
                  <div v-if="t.comment" class="tl__body">{{ t.comment }}</div>
                </div>
              </div>
              <div v-if="!list(p.timeline).length" class="empty-box"><div class="empty-box__text">暂无处理记录</div></div>
            </div>
          </div>

          <div class="card">
            <div class="card__head"><span class="card__title">问题审计日志</span><span class="card__sub">字段级留痕</span></div>
            <div class="card__body card__body--flush">
              <el-table :data="audits" size="small" max-height="420">
                <el-table-column prop="operatedAt" label="时间" width="128" />
                <el-table-column prop="action" label="动作" width="112" show-overflow-tooltip />
                <el-table-column prop="operator" label="操作人" width="86" />
                <el-table-column label="字段变更" min-width="180">
                  <template #default="{ row }">
                    <div v-for="(c, i) in list(row.changes)" :key="i" class="log-line">
                      <span class="muted">{{ c.field }}</span>：<span class="muted">{{ c.before }}</span> → <b>{{ c.after }}</b>
                    </div>
                    <div v-if="!list(row.changes).length" class="muted text-xs">{{ row.remark || '—' }}</div>
                  </template>
                </el-table-column>
                <template #empty><div class="empty-box"><div class="empty-box__text">暂无审计记录</div></div></template>
              </el-table>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- 已知错误流程 -->
    <el-dialog v-model="keVisible" title="转入已知错误管理流程" width="620px">
      <el-form label-width="110px">
        <el-form-item label="临时解决方案" required>
          <el-input v-model="keForm.workaround" type="textarea" :rows="3" placeholder="在根治方案落地前，可让一线 / 服务台立即执行的规避或恢复手段" />
        </el-form-item>
        <el-form-item label="根治计划" required>
          <el-input v-model="keForm.permanentFixPlan" type="textarea" :rows="3" placeholder="根治措施与承接方（如任务单 / 变更单编号）" />
        </el-form-item>
        <el-form-item label="计划完成日">
          <el-date-picker v-model="keForm.expireAt" type="date" value-format="YYYY-MM-DD" placeholder="选择到期日" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="keVisible = false">取消</el-button>
        <el-button type="primary" @click="submitKnownError">确认转入</el-button>
      </template>
    </el-dialog>

    <!-- 解决 -->
    <el-dialog v-model="solveVisible" title="解决问题单" width="620px">
      <el-form label-width="110px">
        <el-form-item label="解决方案" required>
          <el-input v-model="solveForm.solution" type="textarea" :rows="3" placeholder="最终解决方案与验证结果" />
        </el-form-item>
        <el-form-item label="预防措施">
          <el-input v-model="solveForm.preventive" type="textarea" :rows="3" placeholder="防止再次发生的措施（监控、校验、流程约束等）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="solveVisible = false">取消</el-button>
        <el-button type="primary" @click="submitSolve">确认解决</el-button>
      </template>
    </el-dialog>

    <!-- 关闭 -->
    <el-dialog v-model="closeVisible" title="关闭问题单" width="560px">
      <el-form label-width="96px">
        <el-form-item label="关闭方式">
          <el-radio-group v-model="closeForm.closeType">
            <el-radio value="手工关闭">手工关闭</el-radio>
            <el-radio value="自动关闭">自动关闭</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="关闭说明">
          <el-input v-model="closeForm.remark" type="textarea" :rows="2" placeholder="如：观察 3 日无复现，自动关闭" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="closeVisible = false">取消</el-button>
        <el-button type="primary" @click="submitClose">确认关闭</el-button>
      </template>
    </el-dialog>

    <!-- 提交知识条目 -->
    <el-dialog v-model="kbVisible" title="提交知识条目给知识管理" width="640px">
      <el-form label-width="96px">
        <el-form-item label="条目标题" required><el-input v-model="kbForm.title" /></el-form-item>
        <el-form-item label="所属分类">
          <el-select v-model="kbForm.categoryId" style="width: 100%">
            <el-option v-for="c in kbLeaves" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="条目内容"><el-input v-model="kbForm.content" type="textarea" :rows="7" /></el-form-item>
        <el-form-item label="提交后状态">
          <StatusTag dict="" label="待审核（PENDING_REVIEW）" tone="warning" />
          <span class="text-xs muted" style="margin-left: 8px">需知识库维护责任人审核后发布。</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="kbVisible = false">取消</el-button>
        <el-button type="primary" @click="submitKnowledge">提交知识条目</el-button>
      </template>
    </el-dialog>

    <!-- 创建发布申请（由问题驱动） -->
    <el-dialog v-model="releaseVisible" title="创建发布申请（由问题驱动）" width="680px">
      <el-form label-width="110px">
        <el-form-item label="来源问题">
          <el-input :model-value="p ? `${p.no} ${p.title}` : ''" disabled />
          <span class="text-xs muted" style="margin-left: 8px">问题号 / 根因 / 解决方案已自动带入下方「升级修改内容」</span>
        </el-form-item>
        <el-form-item label="发布标题" required><el-input v-model="releaseForm.title" /></el-form-item>
        <el-form-item label="升级修改内容">
          <el-input v-model="releaseForm.changeContent" type="textarea" :rows="6" />
        </el-form-item>
        <el-form-item label="测试情况">
          <el-input v-model="releaseForm.testResult" type="textarea" :rows="3" placeholder="回归用例、性能压测、联调结论等" />
        </el-form-item>
        <el-form-item label="发布时间" required>
          <el-date-picker v-model="releaseForm.releaseAt" type="datetime" value-format="YYYY-MM-DD HH:mm" format="YYYY-MM-DD HH:mm" placeholder="选择计划发布时间" />
        </el-form-item>
        <el-form-item label="停机时间">
          <el-input v-model="releaseForm.downtime" placeholder="如：2026-09-03 22:00-23:00（预计 60 分钟）" />
        </el-form-item>
        <el-form-item label="发布包版本号">
          <el-input v-model="releaseForm.version" style="width: 240px" />
        </el-form-item>
      </el-form>
      <div class="text-xs muted">
        提交后生成发布申请单（状态「申请中」），需数据资源管理人员批复后方可按批复时间点升级并逐项业务验证。
      </div>
      <template #footer>
        <el-button @click="releaseVisible = false">取消</el-button>
        <el-button type="primary" @click="submitRelease">提交发布申请</el-button>
      </template>
    </el-dialog>

    <!-- 通知 -->
    <el-dialog v-model="notifyVisible" title="发送问题通知" width="580px">
      <el-form label-width="96px">
        <el-form-item label="通知方式">
          <el-checkbox-group v-model="notifyForm.channels">
            <el-checkbox value="邮件">邮件</el-checkbox>
            <el-checkbox value="短信">短信</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item label="收件人"><el-input v-model="notifyForm.to" placeholder="姓名（组织）" /></el-form-item>
        <el-form-item label="通知内容"><el-input v-model="notifyForm.content" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="notifyVisible = false">取消</el-button>
        <el-button type="primary" @click="submitNotify">发送</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.known-error {
  border: 1px solid var(--purple);
  background: var(--purple-bg);
  border-radius: var(--r-md);
  padding: var(--sp-4);
  color: var(--purple-fg);
}
.log-line { font-size: var(--fs-xs); line-height: 1.6; word-break: break-all; }
</style>
