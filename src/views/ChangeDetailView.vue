<script setup lang="ts">
/**
 * ChangeDetailView —— 变更单详情
 *
 * 覆盖原文功能点：需求变更管理 —— 需求关联（与事件 / 问题关联可查看）、需求审批（独立审批引擎、
 * 可视化变更窗口）、风险评估（基于 CMDB 的数据模型进行影响模拟分析）、冲突分析（基于配置项和服务调用情况）、
 * 变更审计（记录数据前后修改人与时间）。
 *
 * 说明：config.flows / flowIndex 中无 Change 键，流转条按 ChangeStatus 字典自行定义 5 步：
 * 草稿 → 待审批 → 审批通过 → 实施中 → 已完成（驳回 / 撤回作为异常态标记）。
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDemoStore } from '@/stores/demo'
import { arr, by, fmtTime, fromNow, iso, toDate } from '@/core/utils'
import { planEditableStatus } from '@/core/changePlan'
import PageHead from '@/components/PageHead.vue'
import StatusTag from '@/components/StatusTag.vue'
import ChangePlanEditor from '@/components/ChangePlanEditor.vue'

const store = useDemoStore()
const route = useRoute()
const router = useRouter()

/* 本地宽松数组 / 字典工具（store 返回宽类型，避免 unknown 推断） */
const lst = (v: unknown): any[] => (Array.isArray(v) ? v : [])
const dictOpts = (d: Record<string, { label: string }>) => Object.keys(d).map(k => ({ value: k, label: d[k].label }))

const changeId = computed(() => {
  const p = route.params.id
  return (Array.isArray(p) ? p[0] : p) as string
})
const c = computed<any>(() => store.findById('changes', changeId.value) ?? (store.table('changes') as any[])[0] ?? null)

/* ------------------------------------------- 5 步流转（自行定义） -- */
const STEPS = ['草稿', '待审批', '审批通过', '实施中', '已完成']
const STEP_INDEX: Record<string, number> = {
  DRAFT: 0, PENDING_APPROVE: 1, APPROVED: 2, IMPLEMENTING: 3, DONE: 4,
  REJECTED: 1, WITHDRAWN: 0
}
const stepIndex = computed(() => STEP_INDEX[c.value?.status] ?? 0)
const abnormal = computed(() => ['REJECTED', 'WITHDRAWN'].includes(c.value?.status))

const stepTime = computed<Record<string, string>>(() => ({
  草稿: c.value?.createdAt ?? '',
  待审批: c.value?.submittedAt ?? '',
  审批通过: c.value?.approvedAt ?? '',
  实施中: c.value?.approvedAt ?? '',
  已完成: c.value?.doneAt ?? ''
}))
function flowClass(i: number): string {
  if (abnormal.value && i === stepIndex.value) return 'flow__step--reject'
  if (i < stepIndex.value) return 'flow__step--done'
  if (i === stepIndex.value) return 'flow__step--active'
  return ''
}

/* ------------------------------------------------------------ 关联 -- */
const resourceMap = computed<Record<string, any>>(() => {
  const m: Record<string, any> = {}
  ;(store.table('resources') as any[]).forEach(r => { m[r.id] = r })
  return m
})
function resLabel(id: string): string {
  return resourceMap.value[id] ? `${resourceMap.value[id].name}（${resourceMap.value[id].code}）` : id
}
const demand = computed<any>(() => (c.value?.demandId ? store.findById('demands', c.value.demandId) : null))
const incidents = computed(() => lst(c.value?.relatedIncidentIds).map((id: string) => store.findById('incidents', id)).filter(Boolean) as any[])
const problems = computed(() => lst(c.value?.relatedProblemIds).map((id: string) => store.findById('problems', id)).filter(Boolean) as any[])
const auditRows = computed(() => by((store.table('audits') as any[]).filter(a => a.bizId === c.value?.id), 'operatedAt', 'desc'))

/* ------------------------------------------------------------ 动作 -- */
function submit() {
  store.update('changes', c.value.id, { status: 'PENDING_APPROVE', submittedAt: iso() }, { action: '提交变更审批' })
  store.pushTimeline(c.value, { action: '提交变更审批', comment: '提交独立审批引擎流转' })
  ElMessage.success('已提交变更审批')
}

async function approve() {
  try {
    const { value } = await ElMessageBox.prompt('请填写审批意见', `审批变更单 ${c.value.no}`, {
      confirmButtonText: '审批通过', cancelButtonText: '取消', inputType: 'textarea',
      inputValue: c.value.riskLevel === '高' ? '同意变更，按冲突分析建议错峰实施。' : '同意变更，按计划实施。'
    })
    store.update('changes', c.value.id, { status: 'APPROVED', approvedAt: iso(), approver: store.user.name },
      { action: '变更审批通过', remark: value })
    store.pushTimeline(c.value, { action: '变更审批通过', comment: value })
    store.notify({
      type: 'success', title: `变更单 ${c.value.no} 审批通过`, body: `审批意见：${value}`,
      toRoles: ['producer', 'consumer'], link: `/change/detail/${c.value.id}`
    })
    ElMessage.success('审批通过，可开始实施')
  } catch { /* 取消 */ }
}

async function reject() {
  try {
    const { value } = await ElMessageBox.prompt('请填写驳回原因', `驳回变更单 ${c.value.no}`, {
      confirmButtonText: '确认驳回', cancelButtonText: '取消', inputType: 'textarea'
    })
    store.update('changes', c.value.id, { status: 'REJECTED', rejectReason: value }, { action: '变更审批驳回', remark: value })
    store.pushTimeline(c.value, { action: '变更审批驳回', comment: value })
    ElMessage.warning('已驳回变更单')
  } catch { /* 取消 */ }
}

function withdraw() {
  store.update('changes', c.value.id, { status: 'WITHDRAWN', withdrawnAt: iso() }, { action: '撤回变更单', remark: '未审核前撤回' })
  store.pushTimeline(c.value, { action: '撤回变更单', comment: '变更未审核前可撤回' })
  ElMessage.info('已撤回变更单')
}

function startImplement() {
  store.update('changes', c.value.id, { status: 'IMPLEMENTING' }, { action: '开始实施变更' })
  store.pushTimeline(c.value, { action: '开始实施', comment: `实施人：${c.value.implementer}` })
  ElMessage.success('已开始实施变更')
}

function finish() {
  store.update('changes', c.value.id, { status: 'DONE', doneAt: iso() }, { action: '变更完成' })
  store.pushTimeline(c.value, { action: '变更完成', comment: '变更已实施完成，授权用户已同步更新' })
  store.notify({
    type: 'success', title: `数据服务变更完成（${c.value.no}）`,
    body: `变更「${c.value.title}」已实施完成：数据服务变更后将同步更新至其授权用户。`,
    toRoles: ['consumer', 'desk', 'admin'], link: `/change/detail/${c.value.id}`
  })
  if (demand.value && demand.value.status === 'CHANGING') {
    store.update('demands', demand.value.id, { status: 'DELIVERED' }, { action: '变更完成，需求恢复交付态' })
    store.pushTimeline(demand.value, { action: '变更完成', comment: `变更单 ${c.value.no} 已实施完成` })
  }
  ElMessage.success('变更已完成，已向授权用户同步更新通知')
}

/* -------------------------------------------------- 重新执行影响模拟 -- */
const levelOrder = ['L1', 'L2', 'L3', 'L4']
function affectedCis(seed: string[]): any[] {
  const cis = store.table('cis') as any[]
  const hit = new Set<string>(seed)
  let grew = true
  while (grew) {
    grew = false
    cis.forEach(ci => {
      if (hit.has(ci.id)) return
      if (lst(ci.dependsOn).some((p: string) => hit.has(p))) { hit.add(ci.id); grew = true }
    })
  }
  return cis.filter(ci => hit.has(ci.id))
}

function rerunImpact() {
  const cis = store.table('cis') as any[]
  const seeds: string[] = []
  lst(c.value.resources).forEach((rid: string) => {
    const r = resourceMap.value[rid]
    if (!r) return
    cis.forEach(ci => {
      if (ci.name === r.code || ci.name === r.name) seeds.push(ci.id)
      if (lst(ci.relatedServices).some((sid: string) => {
        const sv = (store.table('services') as any[]).find(s => s.id === sid)
        return sv?.resourceId === rid
      })) seeds.push(ci.id)
    })
  })
  const affected = affectedCis(Array.from(new Set(seeds)))
  const serviceIds = new Set<string>()
  const tenantIds = new Set<string>()
  affected.forEach(ci => {
    lst(ci.relatedServices).forEach((s: string) => serviceIds.add(s))
    lst(ci.relatedTenants).forEach((t: string) => tenantIds.add(t))
  })
  const level = lst(c.value.resources).reduce((a: string, rid: string) => {
    const lv = resourceMap.value[rid]?.securityLevel ?? 'L1'
    return levelOrder.indexOf(lv) > levelOrder.indexOf(a) ? lv : a
  }, 'L1')
  const risk = level === 'L4' || tenantIds.size >= 3 ? '高'
    : (serviceIds.size >= 2 || level === 'L3' || affected.length >= 3) ? '中' : '低'
  const services = Array.from(serviceIds).map(id => {
    const s = (store.table('services') as any[]).find(x => x.id === id)
    return s ? `${s.id} ${s.name}` : id
  })
  const tenants = Array.from(tenantIds).map(id => {
    const t = (store.table('tenants') as any[]).find(x => x.id === id)
    return t ? `${t.id} ${t.name}` : id
  })
  const suggestion = `本次变更影响 ${affected.length} 个配置项、${services.length} 个数据服务、${tenants.length} 个租户；` +
    (risk === '高'
      ? '风险等级为「高」，建议在业务低峰期（22:00 之后）执行，提前 24 小时发布服务维护公告，并做好回滚预案与安全合规复核。'
      : risk === '中'
        ? '建议避开业务高峰执行，变更前通知受影响订阅方，变更后验证服务可用性。'
        : '影响面较小，可按计划执行，变更后按常规验证服务可用性即可。')
  store.update('changes', c.value.id, {
    impact: {
      ciList: affected.map(ci => `${ci.id} ${ci.name}（${ci.type} · ${ci.owner}）`),
      ciIds: affected.map(ci => ci.id), services, tenants,
      resourceIds: lst(c.value.resources), riskLevel: risk, suggestion, simulatedAt: iso()
    },
    riskLevel: risk
  }, { action: '风险评估（CMDB 影响模拟）', remark: `重新模拟：影响 ${affected.length} 个配置项，风险等级：${risk}` })
  store.pushTimeline(c.value, { action: '风险评估', comment: `重新执行 CMDB 影响模拟，风险等级：${risk}` })
  ElMessage.success(`影响模拟已更新，风险等级：${risk}`)
}

/* ---------------------------------------------- 冲突分析重新计算 -- */
function rerunConflict() {
  const rows = (store.table('changes') as any[]).filter(x => x.id !== c.value.id && !['DONE', 'WITHDRAWN'].includes(x.status))
  const out: any[] = []
  const d1 = toDate(c.value.implementDate)
  rows.forEach(x => {
    const d2 = toDate(x.implementDate)
    if (!d1 || !d2) return
    const diff = Math.abs(d1.getTime() - d2.getTime()) / 86400000
    if (diff <= 1) {
      out.push({
        type: '时间窗', with: `${x.no}（${x.title}）`,
        desc: `两者实施窗口相邻（${c.value.implementDate} / ${x.implementDate}${diff === 0 ? '，同日执行' : '，相差 1 天'}）。`,
        suggestion: '建议错开实施窗口，避免变更窗口重叠。'
      })
    }
  })
  rows.forEach(x => {
    const shared = lst(x.resources).filter((r: string) => lst(c.value.resources).includes(r))
    if (shared.length) {
      out.push({
        type: '资源占用', with: `${x.no}（${x.title}）`,
        desc: `两个变更同时涉及 ${shared.map(resLabel).join('、')}，存在重算与覆盖竞争。`,
        suggestion: '建议合并执行或明确先后顺序。'
      })
    }
  })
  const myServices = new Set([...lst(c.value.impact?.services), ...lst(c.value.resources).map(resLabel)])
  rows.forEach(x => {
    const hit = lst(x.impact?.services).filter((s: string) => myServices.has(s))
    if (hit.length) {
      out.push({
        type: '服务依赖', with: `${x.no}（${x.title}）`,
        desc: `变更 ${x.no} 影响的服务 ${hit.join('、')} 与本变更影响链路存在调用依赖。`,
        suggestion: '建议变更前发布服务维护公告或统一维护窗口。'
      })
    }
  })
  store.update('changes', c.value.id, { conflicts: out }, {
    action: '冲突分析',
    remark: out.length ? `检出 ${out.length} 项冲突` : '未检出冲突'
  })
  store.pushTimeline(c.value, { action: '冲突分析', comment: out.length ? `检出 ${out.length} 项冲突` : '未检出冲突' })
  ElMessage[out.length ? 'warning' : 'success'](out.length ? `已检出 ${out.length} 项冲突` : '未检出冲突，可按计划实施')
}

/* ------------------------------------------------------ 调整实施计划 -- */
const planVisible = ref(false)
const canApprove = computed(() => store.can('demand.approve') || store.can('admin.all'))

function openPlan() {
  if (!planEditableStatus(c.value)) {
    ElMessage.warning('当前状态不可调整实施计划：已审批通过 / 实施中的变更需重新发起变更流程')
    return
  }
  planVisible.value = true
}

/** 保存后按新计划立即重新分析冲突（与列表页行为一致） */
function onPlanSaved({ rerun }: { rerun: boolean }) {
  if (rerun) rerunConflict()
}
</script>

<template>
  <div v-if="c">
    <PageHead :title="`变更单详情 · ${c.no}`" :desc="c.title">
      <template #tag>
        <StatusTag dict="ChangeStatus" :value="c.status" />
        <StatusTag dict="RiskLevel" :value="c.riskLevel" />
        <StatusTag :label="c.category" tone="primary" :dot="false" />
      </template>
      <template #actions>
        <el-button v-if="c.status === 'DRAFT'" type="primary" @click="submit">提交</el-button>
        <template v-if="c.status === 'PENDING_APPROVE'">
          <template v-if="canApprove">
            <el-button type="primary" @click="approve">审批</el-button>
            <el-button @click="reject">驳回</el-button>
          </template>
          <el-tooltip v-else content="审批入口需「供数方」或「平台管理员」角色" placement="bottom">
            <el-button disabled>审批</el-button>
          </el-tooltip>
        </template>
        <!-- 调整实施计划：与变更列表、冲突分析结论共用同一编辑面板 -->
        <el-button v-if="planEditableStatus(c)" @click="openPlan">调整实施计划</el-button>
        <el-button v-if="['DRAFT', 'PENDING_APPROVE'].includes(c.status)" @click="withdraw">撤回</el-button>
        <el-button v-if="c.status === 'APPROVED'" type="primary" @click="startImplement">开始实施</el-button>
        <el-button v-if="c.status === 'IMPLEMENTING'" type="primary" @click="finish">完成变更</el-button>
        <el-button @click="router.push('/change/calendar')">变更窗口</el-button>
        <el-button @click="router.push('/change/list')">返回列表</el-button>
      </template>
    </PageHead>

    <el-alert
      v-if="c.status === 'PENDING_APPROVE' && !canApprove"
      class="mb-4"
      type="warning"
      :closable="false"
      show-icon
      title="当前角色无变更审批权限"
      description="变更单审批由「供数方」（资源归属方）或「平台管理员」执行；审批留痕写入审计中心。"
    />

    <!-- 流转条 -->
    <div class="card mb-4">
      <div class="card__head">
        <div class="card__title">变更流转</div>
        <div class="card__sub">第 {{ stepIndex + 1 }} / {{ STEPS.length }} 步 · 实施者：{{ c.implementer }} · 请求人：{{ c.requestor }}</div>
        <div class="card__spacer" />
        <span class="text-sm muted">计划实施日期：{{ c.implementDate }}</span>
      </div>
      <div class="card__body">
        <div class="flow">
          <div v-for="(s, i) in STEPS" :key="s" class="flow__step" :class="flowClass(i)">
            <div class="flow__dot"><el-icon v-if="i < stepIndex"><Check /></el-icon><template v-else>{{ i + 1 }}</template></div>
            <div class="flow__label">{{ s }}</div>
            <div class="flow__time">{{ stepTime[s] ? fmtTime(stepTime[s]).slice(5, 16) : '' }}</div>
          </div>
        </div>
        <el-alert v-if="abnormal" class="mt-2" :type="c.status === 'REJECTED' ? 'error' : 'info'" :closable="false" show-icon
          :title="c.status === 'REJECTED' ? '变更单已驳回（审批未通过）' : '变更单已撤回（未审核前可撤回）'"
          :description="c.rejectReason || '变更已由发起人撤回，可修改后重新提交。'" />
      </div>
    </div>

    <div class="grid grid--2 mb-4">
      <!-- 基本信息 -->
      <div class="card">
        <div class="card__head"><div class="card__title">变更基本信息</div></div>
        <div class="card__body">
          <div class="desc-grid">
            <div class="desc-item"><span class="desc-item--label">变更单号</span><span class="desc-item__value mono">{{ c.no }}</span></div>
            <div class="desc-item"><span class="desc-item--label">变更标题</span><span class="desc-item__value bold">{{ c.title }}</span></div>
            <div class="desc-item"><span class="desc-item--label">变更分类</span><span class="desc-item__value">{{ c.category }}</span></div>
            <div class="desc-item"><span class="desc-item--label">优先级</span><span class="desc-item__value"><StatusTag dict="Priority" :value="c.priority" :dot="false" /></span></div>
            <div class="desc-item"><span class="desc-item--label">风险等级</span><span class="desc-item__value"><StatusTag dict="RiskLevel" :value="c.riskLevel" /></span></div>
            <div class="desc-item"><span class="desc-item--label">实施日期</span><span class="desc-item__value">{{ c.implementDate }}</span></div>
            <div class="desc-item"><span class="desc-item--label">请求人</span><span class="desc-item__value">{{ c.requestor }}</span></div>
            <div class="desc-item"><span class="desc-item--label">实施者</span><span class="desc-item__value">{{ c.implementer }}</span></div>
            <div class="desc-item"><span class="desc-item--label">提交时间</span><span class="desc-item__value">{{ c.submittedAt ? fmtTime(c.submittedAt) : '未提交' }}</span></div>
            <div class="desc-item"><span class="desc-item--label">审批人 / 时间</span><span class="desc-item__value">{{ c.approver || '—' }}{{ c.approvedAt ? ' · ' + fmtTime(c.approvedAt) : '' }}</span></div>
            <div class="desc-item"><span class="desc-item--label">完成时间</span><span class="desc-item__value">{{ c.doneAt ? fmtTime(c.doneAt) : '—' }}</span></div>
            <div class="desc-item"><span class="desc-item--label">期望日期</span><span class="desc-item__value">{{ c.expectAt || '—' }}</span></div>
            <div class="desc-item desc-item--wide">
              <span class="desc-item--label">相应资源</span>
              <span class="desc-item__value">
                <el-tag v-for="id in lst(c.resources)" :key="id" class="mb-2">{{ resLabel(id) }}</el-tag>
                <span v-if="!lst(c.resources).length" class="muted">—</span>
              </span>
            </div>
            <div class="desc-item desc-item--wide"><span class="desc-item--label">实施计划</span><span class="desc-item__value">{{ c.plan || '—' }}</span></div>
          </div>
        </div>
      </div>

      <!-- 关联需求 / 事件 / 问题 -->
      <div class="card">
        <div class="card__head"><div class="card__title">需求关联</div><div class="card__sub">关联需求单、事件单、问题单可追溯</div></div>
        <div class="card__body">
          <div v-if="demand" class="rel-item">
            <div class="flex items-center justify-between">
              <span class="mono text-sm">{{ demand.no }}</span>
              <StatusTag dict="DemandStatus" :value="demand.status" />
            </div>
            <div class="bold mt-1">{{ demand.title }}</div>
            <div class="text-xs muted mt-1">{{ demand.applicant }} · {{ demand.applicantOrg }} · 交付方式 {{ demand.deliveryForm }}</div>
            <el-button link type="primary" size="small" class="mt-2" @click="router.push(`/demand/detail/${demand.id}`)">查看需求单详情<el-icon><ArrowRight /></el-icon></el-button>
          </div>
          <div v-else class="empty-box">
            <div class="empty-box__icon"><el-icon><Link /></el-icon></div>
            <div class="empty-box__text">未关联需求单</div>
          </div>

          <div class="text-sm bold mt-3 mb-2">关联事件单（{{ incidents.length }}）</div>
          <div v-if="!incidents.length" class="text-xs muted mb-3">无关联事件单</div>
          <div v-for="i in incidents" :key="i.id" class="rel-mini">
            <span class="mono text-xs">{{ i.no }}</span>
            <span class="text-sm">{{ i.title }}</span>
            <StatusTag dict="IncidentStatus" :value="i.status" :dot="false" />
          </div>

          <div class="text-sm bold mt-3 mb-2">关联问题单（{{ problems.length }}）</div>
          <div v-if="!problems.length" class="text-xs muted">无关联问题单</div>
          <div v-for="p in problems" :key="p.id" class="rel-mini">
            <span class="mono text-xs">{{ p.no }}</span>
            <span class="text-sm">{{ p.title }}</span>
            <StatusTag dict="ProblemStatus" :value="p.status" :dot="false" />
          </div>
        </div>
      </div>
    </div>

    <!-- 风险评估结果 -->
    <div class="card mb-4">
      <div class="card__head">
        <div class="card__title">风险评估结果（CMDB 影响链路）</div>
        <div class="card__sub">基于配置项依赖关系进行影响模拟分析</div>
        <div class="card__spacer" />
        <StatusTag v-if="c.impact" dict="RiskLevel" :value="c.riskLevel" />
        <el-button size="small" type="primary" plain @click="rerunImpact">重新模拟</el-button>
      </div>
      <div class="card__body">
        <div v-if="!c.impact" class="empty-box">
          <div class="empty-box__icon"><el-icon><Compass /></el-icon></div>
          <div class="empty-box__text">尚未执行风险评估</div>
        </div>
        <template v-else>
          <div class="impact">
            <div class="impact__col">
              <div class="impact__title">① 变更资源</div>
              <div v-for="id in lst(c.impact.resourceIds)" :key="id" class="impact__node impact__node--root">
                <div class="bold">{{ resourceMap[id]?.name ?? id }}</div>
                <div class="text-xs muted mono">{{ resourceMap[id]?.code }}</div>
              </div>
              <div v-if="!lst(c.impact.resourceIds).length" class="text-xs muted">—</div>
            </div>
            <div class="impact__col">
              <div class="impact__title">② 受影响配置项（{{ lst(c.impact.ciList).length }}）</div>
              <div v-for="ci in lst(c.impact.ciList)" :key="ci" class="impact__node">{{ ci }}</div>
              <div v-if="!lst(c.impact.ciList).length" class="text-xs muted">未匹配到配置项</div>
            </div>
            <div class="impact__col">
              <div class="impact__title">③ 受影响服务（{{ lst(c.impact.services).length }}）</div>
              <div v-for="s in lst(c.impact.services)" :key="s" class="impact__node impact__node--svc">{{ s }}</div>
              <div v-if="!lst(c.impact.services).length" class="text-xs muted">无关联服务</div>
            </div>
            <div class="impact__col">
              <div class="impact__title">④ 受影响租户（{{ lst(c.impact.tenants).length }}）</div>
              <div v-for="t in lst(c.impact.tenants)" :key="t" class="impact__node impact__node--tenant">{{ t }}</div>
              <div v-if="!lst(c.impact.tenants).length" class="text-xs muted">无关联租户</div>
            </div>
          </div>
          <div class="mt-4">
            <div class="bold mb-2">处置建议</div>
            <div class="suggest-box">{{ c.impact.suggestion }}</div>
          </div>
        </template>
      </div>
    </div>

    <!-- 冲突分析结果 -->
    <div class="card mb-4">
      <div class="card__head">
        <div class="card__title">冲突分析结果</div>
        <div class="card__sub">按配置项与服务调用情况检出</div>
        <div class="card__spacer" />
        <StatusTag :label="`检出 ${lst(c.conflicts).length} 项冲突`" :tone="lst(c.conflicts).length ? 'warning' : 'success'" :dot="false" />
        <el-button size="small" type="primary" plain @click="rerunConflict">重新分析</el-button>
      </div>
      <div class="card__body card__body--flush">
        <el-table :data="lst(c.conflicts)" style="width: 100%">
          <el-table-column label="冲突类型" width="110">
            <template #default="{ row }">
              <StatusTag :label="row.type" :tone="row.type === '时间窗' ? 'warning' : row.type === '资源占用' ? 'danger' : 'purple'" :dot="false" />
            </template>
          </el-table-column>
          <el-table-column prop="with" label="与谁冲突" min-width="200" show-overflow-tooltip />
          <el-table-column prop="desc" label="冲突说明" min-width="280" show-overflow-tooltip />
          <el-table-column prop="suggestion" label="处置建议" min-width="240" show-overflow-tooltip />
          <template #empty>
            <div class="empty-box">
              <div class="empty-box__icon"><el-icon><CircleCheck /></el-icon></div>
              <div class="empty-box__text">未检出冲突：时间窗、资源占用、服务依赖三类冲突均无交集</div>
            </div>
          </template>
        </el-table>
      </div>
    </div>

    <div class="grid grid--2">
      <!-- 流转记录 -->
      <div class="card">
        <div class="card__head"><div class="card__title">流转记录（{{ lst(c.timeline).length }}）</div></div>
        <div class="card__body">
          <div v-if="!lst(c.timeline).length" class="empty-box">
            <div class="empty-box__icon"><el-icon><Clock /></el-icon></div>
            <div class="empty-box__text">暂无流转记录</div>
          </div>
          <div v-else class="tl">
            <div
              v-for="(t, i) in lst(c.timeline)"
              :key="i"
              class="tl__item"
              :class="i === lst(c.timeline).length - 1 ? 'tl__item--active' : /驳回|撤回/.test(t.action) ? 'tl__item--danger' : 'tl__item--done'"
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
      </div>

      <!-- 审计日志 -->
      <div class="card">
        <div class="card__head">
          <div class="card__title">变更审计（{{ auditRows.length }}）</div>
          <div class="card__sub">记录数据前后修改人与时间</div>
        </div>
        <div class="card__body card__body--flush">
          <el-table :data="auditRows" style="width: 100%">
            <el-table-column label="操作时间" width="146"><template #default="{ row }">{{ fmtTime(row.operatedAt) }}</template></el-table-column>
            <el-table-column prop="action" label="操作" width="150" />
            <el-table-column label="字段变更（前 → 后）" min-width="240">
              <template #default="{ row }">
                <div v-if="!lst(row.changes).length" class="muted text-sm">—</div>
                <div v-for="(ch, i) in lst(row.changes)" :key="i" class="text-sm">
                  <span class="mono">{{ ch.field }}</span>：
                  <span class="muted">{{ ch.before }}</span> → <span class="bold">{{ ch.after }}</span>
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
            <el-table-column prop="terminal" label="终端" width="140" show-overflow-tooltip />
            <template #empty>
              <div class="empty-box">
                <div class="empty-box__icon"><el-icon><Tickets /></el-icon></div>
                <div class="empty-box__text">本单暂无审计记录；执行风险评估 / 冲突分析 / 审批后将自动留痕</div>
              </div>
            </template>
          </el-table>
        </div>
      </div>
    </div>
  </div>

  <div v-else class="card">
    <div class="empty-box">
      <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
      <div class="empty-box__text">未找到该变更单</div>
    </div>
  </div>

  <!-- 调整实施计划抽屉（与变更列表共用组件，保存后可按新计划重新分析冲突） -->
  <ChangePlanEditor v-model="planVisible" :change="c" @saved="onPlanSaved" />
</template>

<style scoped>
.cell-sub { font-size: var(--fs-xs); color: var(--text-3); margin-top: 2px; }
.rel-item {
  padding: var(--sp-3); margin-bottom: var(--sp-3);
  border: 1px solid var(--border-2); border-radius: var(--r-md); background: var(--surface);
}
.rel-mini {
  display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap;
  padding: 5px 8px; border-radius: var(--r-sm); background: var(--surface-2); margin-bottom: 5px;
}
.impact { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--sp-3); }
.impact__col { display: flex; flex-direction: column; gap: 6px; }
.impact__title { font-size: var(--fs-sm); font-weight: 600; color: var(--text-2); margin-bottom: 2px; }
.impact__node {
  padding: 6px 10px; border: 1px solid var(--border-2); border-radius: var(--r-sm);
  background: var(--surface-2); font-size: var(--fs-xs); line-height: 1.5;
}
.impact__node--root { border-color: var(--brand-200); background: var(--brand-50); }
.impact__node--svc { border-color: var(--purple-bg); background: var(--purple-bg); color: var(--purple-fg); }
.impact__node--tenant { border-color: var(--teal-bg); background: var(--teal-bg); color: var(--teal-fg); }
.suggest-box {
  padding: var(--sp-3); border-radius: var(--r-md); font-size: var(--fs-sm);
  background: var(--warning-bg); color: var(--warning-fg); line-height: 1.8;
}
@media (max-width: 1400px) {
  .impact { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 900px) {
  .impact { grid-template-columns: minmax(0, 1fr); }
}
</style>
