<script setup lang="ts">
/**
 * WorkflowView —— 工作流管理
 *
 * 覆盖原文功能点：
 *  · "工作流管理：支持对审核通过的数据资源工单进行自动化工作流部署"
 *  · "对已审核的数据资源工单系统支持自动化工作流部署，自动生成对应的 API 接口以及相关文件"
 *  · "工作流模板与审批规则配置（多级审批 / 会签 / 或签 / 条件分支）"
 *
 * 三个 Tab：流程模板 / 审批规则配置 / 自动化部署（重点）
 */
import { computed, onUnmounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDemoStore } from '@/stores/demo'
import { config } from '@/core/config'
import { arr, by, demoUid, fmtTime, iso, NOW } from '@/core/utils'
import {
  artifactsOfRecord,
  buildApiJson as buildApiJsonCore,
  buildArtifacts as buildArtifactsCore,
  buildParams as buildParamsCore,
  deployStateOf,
  deployedDemandIds,
  pathOf,
  serviceNameOf as serviceNameOfCore
} from '@/core/artifacts'
import type { ArtifactFile, DeployArtifacts } from '@/core/artifacts'
import PageHead from '@/components/PageHead.vue'
import StatusTag from '@/components/StatusTag.vue'
import StatCards from '@/components/StatCards.vue'
import ArtifactPanel from '@/components/ArtifactPanel.vue'

const store = useDemoStore()
const tab = ref('tpl')

/* =========================================================== 流程模板 == */
const tplKeyword = ref('')
const tplStatus = ref('')
const expandId = ref<string>('wf01')

const workflows = computed(() => store.table('workflows') as any[])

const tplRows = computed(() =>
  workflows.value.filter(w => {
    if (tplStatus.value && w.status !== tplStatus.value) return false
    if (tplKeyword.value) {
      const hay = `${w.name} ${w.bizType} ${w.desc}`.toLowerCase()
      if (!hay.includes(tplKeyword.value.toLowerCase())) return false
    }
    return true
  })
)

/** 模板状态切换（写审计） */
function toggleWorkflowStatus(w: any, val: boolean) {
  if (!store.can('flow.config')) {
    ElMessage.warning('当前角色无「工作流与审批规则配置」权限，仅可查看')
    return
  }
  store.update('workflows', w.id, { status: val ? 'ENABLED' : 'DISABLED' }, {
    action: val ? '启用工作流模板' : '停用工作流模板',
    remark: `${w.name}（${w.version}）已${val ? '启用' : '停用'}`
  })
  ElMessage.success(`工作流模板「${w.name}」已${val ? '启用' : '停用'}，审计记录已生成`)
}

/* ====================================================== 审批规则配置 == */
const ruleTplId = ref('wf01')
const ruleDraft = ref<any[]>([])
const ruleTouched = ref(false)

const ruleTplOptions = computed(() =>
  workflows.value.map(w => ({ value: w.id, label: `${w.name}（${w.bizType} · ${w.version}）` }))
)
const currentRuleTpl = computed(() => workflows.value.find(w => w.id === ruleTplId.value) ?? workflows.value[0])

/** 可选审批角色（取自模板节点角色 + 需求单相关角色） */
const roleOptions = [
  '供数方', '数据资源管理人员', '多级安全审批人', '变更审批人',
  '服务台受理员', '运维工程师', '平台管理员', '发布管理员', '生产实施方'
]

function loadRules() {
  ruleDraft.value = (arr(currentRuleTpl.value?.rules) as any[]).map(r => ({
    level: r.level, approvers: [...(r.approvers ?? [])], mode: r.mode, condition: r.condition ?? ''
  }))
  ruleTouched.value = false
}

function addRuleLevel() {
  const nextLevel = ruleDraft.value.length ? Math.max(...ruleDraft.value.map(r => Number(r.level) || 0)) + 1 : 1
  ruleDraft.value.push({ level: nextLevel, approvers: [], mode: '或签', condition: '全部单据' })
  ruleTouched.value = true
}

function removeRuleLevel(idx: number) {
  ruleDraft.value.splice(idx, 1)
  ruleDraft.value.forEach((r, i) => { r.level = i + 1 })
  ruleTouched.value = true
}

function moveRule(idx: number, delta: number) {
  const target = idx + delta
  if (target < 0 || target >= ruleDraft.value.length) return
  const list = ruleDraft.value
  const [item] = list.splice(idx, 1)
  list.splice(target, 0, item)
  list.forEach((r, i) => { r.level = i + 1 })
  ruleTouched.value = true
}

function saveRules() {
  if (!store.can('flow.config')) { ElMessage.warning('当前角色无审批规则配置权限'); return }
  const tpl = currentRuleTpl.value
  if (!tpl) return
  if (ruleDraft.value.some(r => !(r.approvers ?? []).length)) {
    ElMessage.warning('每一级审批都必须至少选择一名审批人角色')
    return
  }
  store.update('workflows', tpl.id, { rules: JSON.parse(JSON.stringify(ruleDraft.value)) }, {
    action: '修改审批规则',
    remark: `调整 ${tpl.bizType} 审批规则为 ${ruleDraft.value.length} 级`
  })
  ruleTouched.value = false
  ElMessage.success('审批规则已保存，字段级变更已写入审计中心')
}

loadRules()

/* ======================================================== 自动化部署 == */
/** 部署成功过的需求单 id（已部署工单不再出现在"待部署"队列） */
const deployedIds = computed(() => deployedDemandIds(store))

/**
 * 已审核待部署的工单：审批通过 / 实施中，**且尚未部署成功**。
 * 说明：部署成功后需求单会写入 deployedAt / deployStatus，但单据状态仍为
 * 审批通过 / 实施中，因此必须按部署记录二次过滤，否则已部署工单会一直留在待部署队列。
 */
const deployableDemands = computed(() =>
  by(
    (store.table('demands') as any[])
      .filter(d => ['APPROVED', 'IMPLEMENTING'].includes(d.status))
      .filter(d => !deployedIds.value.has(d.id)),
    'approvedAt', 'desc'
  )
)

/** 已部署完成的工单（用于「已部署」页签与重新部署演示） */
const deployedDemands = computed(() =>
  by(
    (store.table('demands') as any[]).filter(d => deployedIds.value.has(d.id)),
    'approvedAt', 'desc'
  )
)

/** 队列页签：待部署 / 已部署 / 全部 */
const deployScope = ref<'pending' | 'done' | 'all'>('pending')
const scopedDemands = computed(() => {
  if (deployScope.value === 'done') return deployedDemands.value
  if (deployScope.value === 'all') return by(
    (store.table('demands') as any[]).filter(d => ['APPROVED', 'IMPLEMENTING'].includes(d.status)),
    'approvedAt', 'desc'
  )
  return deployableDemands.value
})

const selectedId = ref('')
const selectedDemand = computed(() => scopedDemands.value.find(d => d.id === selectedId.value) ?? null)

/** 工单的部署状态（未部署 / 已部署 / 部署失败），取最新一条部署记录 */
function deployStateOfDemand(id: string) {
  return deployStateOf(store, id)
}

const stats = computed(() => {
  const rows = deployableDemands.value
  return [
    { label: '已审核待部署', value: rows.length, unit: '单', icon: 'Box', tone: 'warning' as const, tip: '状态为「审批通过 / 实施中」且尚未部署成功的需求单' },
    { label: '已部署工单', value: deployedDemands.value.length, unit: '单', icon: 'CircleCheck', tone: 'success' as const, tip: '已存在成功部署记录的需求单' },
    { label: '已生成 API 产物', value: deployRecords.value.filter(r => r.status === '成功').length, unit: '套', icon: 'Connection', tone: 'primary' as const },
    { label: '流程模板', value: workflows.value.length, unit: '套', icon: 'Setting', tone: 'purple' as const },
    { label: '部署失败待重试', value: deployRecords.value.filter(r => r.status === '失败').length, unit: '次', icon: 'Warning', tone: 'danger' as const }
  ]
})

/* ------------------------------------------------- 产物生成（复用内核）-- */
/*
 * 生成算法统一收敛到 core/artifacts.ts，工作流管理 / 部署记录 / 需求单详情三处共用，
 * 保证"部署后生成的相关文件"只有一个口径；此处仅做 store 绑定。
 */
const serviceNameOf = (d: any) => serviceNameOfCore(store, d)
const buildParams = (d: any) => buildParamsCore(store, d)
const buildApiJson = (d: any) => buildApiJsonCore(store, d)
const buildArtifacts = (d: any) => buildArtifactsCore(store, d)


/* ------------------------------------------------------------ 部署动画 -- */
const deployVisible = ref(false)
const deployLines = ref<{ time: string; text: string; tone: '' | 'ok' | 'warn' | 'err' }[]>([])
const deployPhase = ref<'running' | 'done' | 'failed'>('running')
const deployProgress = ref(0)
const deployResult = ref<any>(null)
const deployingDemand = ref<any>(null)
let deployTimer: ReturnType<typeof setInterval> | null = null

/** 是否具备自动化部署权限（生产实施方 / 平台管理员） */
const canDeploy = computed(() => store.can('flow.deploy'))

/*
 * 部署日志时钟：以演示基准时间（NOW = 2026-01-27 10:30）为起点、按真实流逝时间递增。
 * 不使用真实系统时间，否则日志时间（如 16:20）会与部署记录时间（2026-01-27 10:30）自相矛盾。
 */
let deployClockBase = 0
function nowTime() {
  const d = new Date(NOW.getTime() + (Date.now() - deployClockBase))
  const p = (n: number) => (n < 10 ? '0' + n : String(n))
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function pushLine(text: string, tone: '' | 'ok' | 'warn' | 'err' = '') {
  deployLines.value.push({ time: nowTime(), text, tone })
}

function stopTimer() {
  if (deployTimer) { clearInterval(deployTimer); deployTimer = null }
}

onUnmounted(stopTimer)

function startDeploy() {
  const d = selectedDemand.value
  if (!d) { ElMessage.warning('请先在上方列表中选择一条已审核的工单'); return }
  if (!store.can('flow.deploy')) { ElMessage.warning('当前角色无「工作流自动化部署」权限，请切换为「生产实施方」或「平台管理员」'); return }

  deployClockBase = Date.now()
  deployingDemand.value = d
  deployVisible.value = true
  deployLines.value = []
  deployPhase.value = 'running'
  deployProgress.value = 0
  deployResult.value = null

  const { inputs, outputs } = buildParams(d)
  const sensitiveCount = outputs.filter(o => o.sensitive).length
  const resNames = (arr(d.resources) as string[])
    .map(rid => (store.findById('resources', rid) as any)?.name ?? rid).join('、')

  const steps: { text: string; tone: '' | 'ok' | 'warn' | 'err' }[] = [
    { text: `[1/10] 校验工单状态：${d.no} → 审批通过 / 实施中 …… 通过`, tone: 'ok' },
    { text: `[2/10] 解析申请资源：${resNames}（共 ${arr(d.resources).length} 项）`, tone: '' },
    { text: `[3/10] 解析申请字段：${(arr(d.fields) as string[]).join('、')}`, tone: '' },
    { text: `[4/10] 生成 API 接口定义：POST /open/api/v1/${pathOf(d)} 入参 ${inputs.length} 个 / 出参 ${outputs.length} 个`, tone: 'ok' },
    { text: `[5/10] 生成调度配置：${d.updateFreq}，依赖 ods_${pathOf(d)}_incr`, tone: '' },
    sensitiveCount
      ? { text: `[6/10] 生成脱敏规则：命中 ${sensitiveCount} 个敏感字段，按 ${d.securityLevel} 级别掩码`, tone: 'warn' }
      : { text: `[6/10] 生成脱敏规则：未命中敏感字段，交付内容不做额外掩码`, tone: '' },
    { text: `[7/10] 生成交付说明文件：${pathOf(d)}_交付说明.md`, tone: '' },
    { text: `[8/10] 注册服务到数据服务网关（ci15 数据服务网关集群）……`, tone: '' },
    d.deliveryForm === 'TABLE'
      ? { text: `[9/10] 开通库表访问途径：只读视图 v_${pathOf(d)} 已创建，授权范围限 ${d.applicantOrg}`, tone: 'warn' }
      : { text: `[9/10] 注册交付通道：${d.deliveryForm === 'FILE' ? 'SFTP 文件通道 /data/' : 'API 网关路由'} 已就绪`, tone: '' },
    { text: `[10/10] 部署完成：共生成 5 个相关文件，服务状态已置为在线`, tone: 'ok' }
  ]

  let i = 0
  stopTimer()
  deployTimer = setInterval(() => {
    const step = steps[i]
    pushLine(step.text, step.tone)
    deployProgress.value = Math.round(((i + 1) / steps.length) * 100)
    i += 1
    if (i >= steps.length) {
      stopTimer()
      finishDeploy(d)
    }
  }, 420)
}

function finishDeploy(d: any) {
  const art = buildArtifacts(d)
  deployPhase.value = 'done'
  deployResult.value = art

  /* 部署记录：连同产物快照一起落库，保证"部署生成的相关文件"有明确的存放位置 */
  const rec = store.insert('deployRecords', {
    id: demoUid(`dep_${d.id}`),
    no: `BS${String(d.no).slice(-11)}`,
    demandId: d.id,
    demandNo: d.no,
    demandTitle: d.title,
    operator: store.user.name,
    at: iso(),
    cost: `${(2.6 + Math.random() * 2.4).toFixed(1)} s`,
    status: '成功',
    artifactCount: art.files.length,
    serviceKind: art.serviceKind,
    serviceName: serviceNameOf(d),
    servicePath: `/open/api/v1/${pathOf(d)}`,
    artifacts: art.files.map((f: ArtifactFile) => ({ ...f })),
    apiMd: art.apiMd,
    reason: ''
  })

  /* 新增一条数据服务（kind 按交付形式映射：接口 → API、文件 → FILE） */
  const exists = (store.table('services') as any[]).some(s => s.sourceDemand === d.no)
  if (!exists) {
    store.insert('services', {
      id: demoUid(`sv_${d.id}`),
      name: serviceNameOf(d),
      kind: art.serviceKind,
      resourceId: arr(d.resources)[0] ?? '',
      publisher: d.applicantOrg,
      status: 'ONLINE',
      availability: '99.9%',
      serviceTime: d.updateFreq === '实时' ? '7×24 小时' : `按${d.updateFreq}更新`,
      subscribeCount: 0,
      callVolume: 0,
      publishAt: iso().slice(0, 10),
      desc: `由需求工单 ${d.no} 自动化部署生成（${(config.dicts.DeliveryForm as any)[d.deliveryForm]?.label ?? d.deliveryForm}）`,
      sourceDemand: d.no,
      path: `/open/api/v1/${pathOf(d)}`
    })
  }

  /*
   * 需求单时间轴 + 审计。
   * 部署即"服务封装 / 资源交付"的实施动作：审批通过但尚未派发任务的工单，部署完成后一并推进到「实施中」，
   * 避免出现"已部署成功、单据却仍停在审批通过"的语义错位。
   */
  const advance = ['APPROVED'].includes(d.status)
  store.update('demands', d.id, {
    deployedAt: iso(),
    deployStatus: '已部署',
    ...(advance ? { status: 'IMPLEMENTING' } : {})
  }, {
    action: '工作流自动化部署',
    remark: `自动生成 API 接口与 ${art.files.length} 个相关文件，服务已注册（记录号 ${rec.no}）${advance ? '；单据流转至实施中' : ''}`
  })
  store.pushTimeline(d, {
    action: '工作流自动化部署完成',
    comment: `自动生成 POST /open/api/v1/${pathOf(d)} 接口定义与 ${art.files.length} 个交付文件，服务已注册至数据服务网关`
  })
  store.notify({
    type: 'success',
    title: `工单 ${d.no} 自动化部署完成`,
    body: `已自动生成 API 接口与相关交付文件，新增数据服务「${serviceNameOf(d)}」。`,
    toRoles: ['producer', 'supplier', 'desk'],
    link: '/workflow'
  })
  ElMessage.success(`部署完成：已生成 API 接口与 ${art.files.length} 个相关文件，并新增 1 条数据服务`)
}

function simulateFailure() {
  const d = deployingDemand.value
  if (!d) return
  pushLine('[9/10] 注册服务到数据服务网关失败：网关返回 503，路由注册超时', 'err')
  pushLine('[回滚] 已回滚本次部署产生的临时路由与交付文件', 'warn')
  deployPhase.value = 'failed'
  deployProgress.value = 100
  store.insert('deployRecords', {
    id: demoUid(`dep_${d.id}`),
    no: `BS${String(d.no).slice(-11)}`,
    demandId: d.id, demandNo: d.no, demandTitle: d.title,
    operator: store.user.name, at: iso(),
    cost: `${(1.2 + Math.random()).toFixed(1)} s`,
    status: '失败', artifactCount: 0, serviceKind: 'API',
    reason: '数据服务网关返回 503，路由注册超时（已自动回滚）'
  })
  store.update('demands', d.id, { deployStatus: '部署失败' }, {
    action: '工作流自动化部署失败',
    remark: '数据服务网关 503，路由注册超时，已回滚'
  })
  ElMessage.error('部署失败：数据服务网关不可用，可在部署记录中重试')
}

function closeDeploy() {
  stopTimer()
  deployVisible.value = false
  deployingDemand.value = null
}

/* ------------------------------------------- 部署记录：查看产物 -- */
/** 产物查看抽屉：与部署弹窗共用 ArtifactPanel，关闭弹窗后仍可随时查阅生成的文件 */
const artifactVisible = ref(false)
const artifactResult = ref<DeployArtifacts | null>(null)
const artifactRecord = ref<any>(null)
/** 产物抽屉里展示服务名/路径所需的来源需求单 */
const artifactDemand = computed(() => (artifactRecord.value?.demandId ? store.findById('demands', artifactRecord.value.demandId) : null))
const artifactServiceLabel = computed(() => {
  if (artifactRecord.value?.serviceName) return artifactRecord.value.serviceName
  return artifactDemand.value ? serviceNameOf(artifactDemand.value) : '—'
})
const artifactPathLabel = computed(() => {
  if (artifactRecord.value?.servicePath) return artifactRecord.value.servicePath
  return artifactDemand.value ? `/open/api/v1/${pathOf(artifactDemand.value)}` : '—'
})

function openArtifacts(rec: any) {
  const art = artifactsOfRecord(store, rec)
  if (!art) { ElMessage.warning('关联需求单已不存在，无法还原产物'); return }
  artifactResult.value = art
  artifactRecord.value = rec
  artifactVisible.value = true
}

function openDeploy(d: any) {
  selectedId.value = d.id
  startDeploy()
}

/* ------------------------------------------------------------ 部署记录 -- */
/* 存放在 store 的 deployRecords 表中：部署/重试后列表立即刷新，可点击「重试」复现失败场景 */
const DEPLOY_SEED = [
  {
    id: 'dep_seed_1', no: 'BS20260112001', demandId: 'd01', demandNo: 'XQ20260112001',
    demandTitle: '医保基金监管分析-门急诊费用与就诊明细申请',
    operator: '赵敏', at: '2026-01-12 16:40', cost: '3.8 s', status: '成功', artifactCount: 5,
    serviceKind: 'API', reason: ''
  },
  {
    id: 'dep_seed_2', no: 'BS20260119002', demandId: 'd03', demandNo: 'XQ20260119003',
    demandTitle: '三医一张图-医疗资源与床位数据申请',
    operator: '刘涛', at: '2026-01-19 15:20', cost: '4.1 s', status: '成功', artifactCount: 5,
    serviceKind: 'FILE', reason: ''
  },
  {
    id: 'dep_seed_3', no: 'BS20260121003', demandId: 'd05', demandNo: 'XQ20260118005',
    demandTitle: '医保支付方式改革评估-结算与住院数据申请',
    operator: '赵敏', at: '2026-01-21 09:05', cost: '1.6 s', status: '失败', artifactCount: 0,
    serviceKind: 'API', reason: '数据服务网关返回 503，路由注册超时（已自动回滚）'
  }
]

/** 首次进入时灌入示例部署记录（其后所有记录都由真实部署动作写入） */
function seedDeployRecords() {
  const t = store.table('deployRecords') as any[]
  if (!t.length) DEPLOY_SEED.forEach(r => store.insert('deployRecords', { ...r }))
}
seedDeployRecords()

const deployRecords = computed(() => store.table('deployRecords') as any[])

function retryDeploy(rec: any) {
  const d = store.findById('demands', rec.demandId) as any
  if (!d) { ElMessage.warning('关联需求单已不存在，无法重试'); return }
  tab.value = 'deploy'
  // 让该工单在当前页签内可见，避免"选中了但不在列表里"导致部署按钮不可用
  deployScope.value = deployedIds.value.has(d.id) ? 'done' : 'pending'
  selectedId.value = d.id
  startDeploy()
}
</script>

<template>
  <div>
    <PageHead
      title="工作流管理"
      desc="维护业务流程模板与多级审批规则；对已审核的数据资源工单支持自动化工作流部署，自动生成对应的 API 接口以及相关文件。"
    >
      <template #actions>
        <el-button @click="ElMessage.info('已导出 6 套流程模板与 ' + deployRecords.length + ' 条部署记录')"><el-icon><Download /></el-icon> 导出流程清单</el-button>
        <el-tooltip :disabled="canDeploy" content="当前角色无「工作流自动化部署」权限，请切换为「生产实施方」或「平台管理员」" placement="bottom">
          <span>
            <el-button type="primary" :disabled="!selectedDemand || !canDeploy" @click="startDeploy"><el-icon><Lightning /></el-icon> 执行自动化部署</el-button>
          </span>
        </el-tooltip>
      </template>
    </PageHead>

    <StatCards :items="stats" />

    <div class="card">
      <el-tabs v-model="tab" class="wf-tabs">
        <!-- ================================================= 流程模板 == -->
        <el-tab-pane label="流程模板" name="tpl">
          <div class="filter-row">
            <el-input v-model="tplKeyword" placeholder="模板名称 / 单据类型 / 说明" clearable style="width: 260px" />
            <el-select v-model="tplStatus" placeholder="全部状态" clearable style="width: 140px">
              <el-option label="启用" value="ENABLED" />
              <el-option label="停用" value="DISABLED" />
            </el-select>
            <span class="card__spacer" />
            <span class="text-sm muted">共 {{ tplRows.length }} 套模板 · 点击卡片查看节点与审批规则</span>
          </div>

          <div class="tpl-list">
            <div v-for="w in tplRows" :key="w.id" class="card tpl-card" :class="{ 'tpl-card--open': expandId === w.id }">
              <div class="card__head tpl-card__head" @click="expandId = expandId === w.id ? '' : w.id">
                <div class="tpl-card__title">
                  <span class="bold">{{ w.name }}</span>
                  <StatusTag label="流程模板" tone="primary" :dot="false" />
                  <span class="mono text-sm muted">{{ w.version }}</span>
                </div>
                <div class="tpl-card__meta">
                  <span class="text-sm muted">适用单据：{{ w.bizType }}</span>
                  <span class="text-sm muted">节点 {{ (w.nodes || []).length }} 个</span>
                  <span class="text-sm muted">审批 {{ (w.rules || []).length }} 级</span>
                  <span class="card__spacer" />
                  <el-switch
                    :model-value="w.status === 'ENABLED'"
                    size="small"
                    inline-prompt
                    active-text="启用"
                    inactive-text="停用"
                    @click.stop
                    @change="(v: any) => toggleWorkflowStatus(w, !!v)"
                  />
                  <el-icon class="tpl-card__arrow"><ArrowDown /></el-icon>
                </div>
              </div>
              <div class="card__body tpl-card__desc">
                <div class="text-sm">{{ w.desc }}</div>
              </div>

              <div v-if="expandId === w.id" class="card__body tpl-card__detail">
                <div class="grid grid--side">
                  <div>
                    <div class="card__title mb-3">流程节点（竖向流程）</div>
                    <div class="tl">
                      <div
                        v-for="(n, ni) in (w.nodes || [])"
                        :key="n.key"
                        class="tl__item"
                        :class="ni === (w.nodes || []).length - 1 ? 'tl__item--active' : 'tl__item--done'"
                      >
                        <div class="tl__dot" />
                        <div class="tl__head">
                          <span class="tl__action">{{ ni + 1 }}. {{ n.name }}</span>
                          <span class="tl__meta">处理角色：{{ n.role }}</span>
                          <span class="tl__meta">时限：{{ n.slaHours ? n.slaHours + ' 小时' : '无' }}</span>
                        </div>
                        <div class="tl__body">
                          可执行动作：
                          <template v-for="(a, ai) in (n.actions || [])" :key="a">
                            <StatusTag :label="a" tone="neutral" :dot="false" />{{ ai < (n.actions || []).length - 1 ? ' ' : '' }}
                          </template>
                        </div>
                        <div v-if="n.condition" class="tl__quote">触发条件：{{ n.condition }}</div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <div class="card__title mb-3">审批规则</div>
                    <el-table :data="w.rules || []" size="small" style="width: 100%">
                      <el-table-column prop="level" label="级别" width="60">
                        <template #default="{ row }">第 {{ row.level }} 级</template>
                      </el-table-column>
                      <el-table-column label="审批人" min-width="140">
                        <template #default="{ row }">{{ (row.approvers || []).join('、') }}</template>
                      </el-table-column>
                      <el-table-column label="方式" width="76">
                        <template #default="{ row }"><StatusTag :label="row.mode" :tone="row.mode === '会签' ? 'purple' : 'info'" :dot="false" /></template>
                      </el-table-column>
                      <el-table-column prop="condition" label="触发条件" min-width="150" show-overflow-tooltip />
                      <template #empty>
                        <div class="empty-box">
                          <div class="empty-box__icon"><el-icon><FolderOpened /></el-icon></div>
                          <div class="empty-box__text">该模板暂未配置审批规则（按分类自动派发）</div>
                        </div>
                      </template>
                    </el-table>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="!tplRows.length" class="empty-box">
            <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
            <div class="empty-box__text">没有符合条件的流程模板</div>
          </div>
        </el-tab-pane>

        <!-- ============================================= 审批规则配置 == -->
        <el-tab-pane label="审批规则配置" name="rule">
          <div class="filter-row">
            <span class="field__label">选择流程模板</span>
            <el-select v-model="ruleTplId" style="width: 320px" @change="loadRules">
              <el-option v-for="o in ruleTplOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
            <StatusTag :label="currentRuleTpl?.bizType ?? '—'" tone="teal" :dot="false" />
            <span class="card__spacer" />
            <el-button @click="addRuleLevel"><el-icon><Plus /></el-icon> 新增一级审批</el-button>
            <el-button type="primary" :disabled="!ruleTouched" @click="saveRules">保存审批规则</el-button>
          </div>

          <div class="grid grid--side">
            <div class="card__body">
              <el-table :data="ruleDraft" size="small" style="width: 100%">
                <el-table-column label="审批级别" width="110">
                  <template #default="{ row }">第 {{ row.level }} 级</template>
                </el-table-column>
                <el-table-column label="审批人角色（可多选）" min-width="260">
                  <template #default="{ row }">
                    <el-select v-model="row.approvers" multiple collapse-tags size="small" placeholder="选择审批人角色" style="width: 100%" @change="ruleTouched = true">
                      <el-option v-for="r in roleOptions" :key="r" :label="r" :value="r" />
                    </el-select>
                  </template>
                </el-table-column>
                <el-table-column label="审批方式" width="180">
                  <template #default="{ row }">
                    <el-radio-group v-model="row.mode" size="small" @change="ruleTouched = true">
                      <el-radio-button value="会签">会签</el-radio-button>
                      <el-radio-button value="或签">或签</el-radio-button>
                    </el-radio-group>
                  </template>
                </el-table-column>
                <el-table-column label="触发条件（条件分支）" min-width="230">
                  <template #default="{ row }">
                    <el-input v-model="row.condition" size="small" placeholder="如：资源敏感级别 ≥ L3" @input="ruleTouched = true" />
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="130" fixed="right">
                  <template #default="{ $index }">
                    <el-button link size="small" :disabled="$index === 0" @click="moveRule($index, -1)">上移</el-button>
                    <el-button link size="small" @click="removeRuleLevel($index)">删除</el-button>
                  </template>
                </el-table-column>
                <template #empty>
                  <div class="empty-box">
                    <div class="empty-box__icon"><el-icon><Tickets /></el-icon></div>
                    <div class="empty-box__text">尚未配置审批级别，点击「新增一级审批」开始</div>
                  </div>
                </template>
              </el-table>
            </div>
            <div class="card__body rule-help">
              <div class="card__title mb-3">「条件分支」的价值</div>
              <div class="text-sm">
                条件分支让同一套流程模板可以按单据的实际风险自动伸缩审批链，避免「一刀切」：
                低风险单据走短链快速放行，高风险单据自动追加审批节点，既保证效率又不放松管控。
              </div>
              <div class="code-box mt-3">示例：# 资源敏感级别 ≥ L3 时增加安全审批节点
if (demand.securityLevel >= 'L3') {
  insertNode({
    name: '安全合规审批',
    role: '多级安全审批人',
    mode: '会签',
    slaHours: 48,
    after: '资源管理人员复核'
  })
}
// L1 / L2 → 仅走 资源归属方审批 + 资源管理人员复核（2 级）
// L3 / L4 → 追加 安全合规审批（会签，3 级），并按分级结果强制脱敏交付</div>
            </div>
          </div>
        </el-tab-pane>

        <!-- ============================================= 自动化部署 == -->
        <el-tab-pane label="自动化部署" name="deploy">
          <div class="card__body">
            <div class="flex items-center gap-3 mb-3 wrap">
              <div class="card__title">数据资源工单部署队列</div>
              <div class="card__sub">来源：需求单的「审批通过 / 实施中」状态记录，即原文所述「已审核的数据资源工单」；已部署成功的工单移入「已部署」页签</div>
              <span class="card__spacer" />
              <el-radio-group v-model="deployScope" size="small" @change="selectedId = ''">
                <el-radio-button value="pending">待部署（{{ deployableDemands.length }}）</el-radio-button>
                <el-radio-button value="done">已部署（{{ deployedDemands.length }}）</el-radio-button>
                <el-radio-button value="all">全部</el-radio-button>
              </el-radio-group>
              <el-tooltip :disabled="canDeploy" content="当前角色无「工作流自动化部署」权限，请切换为「生产实施方」或「平台管理员」" placement="bottom">
                <span>
                  <el-button type="primary" :disabled="!selectedDemand || !canDeploy" @click="startDeploy"><el-icon><Lightning /></el-icon> 执行自动化部署</el-button>
                </span>
              </el-tooltip>
            </div>
            <el-alert
              v-if="!canDeploy"
              class="mb-3"
              type="info"
              :closable="false"
              show-icon
              title="当前角色仅可查看部署队列与部署记录"
              description="「工作流自动化部署」权限点 flow.deploy 仅授予生产实施方与平台管理员，可在顶栏切换角色后执行。"
            />

            <el-table
              :data="scopedDemands"
              size="small"
              style="width: 100%"
              highlight-current-row
              :current-row-key="selectedId"
              row-key="id"
              class="deploy-table"
              @current-change="(r: any) => (selectedId = r ? r.id : '')"
              @row-click="(r: any) => (selectedId = r.id)"
            >
              <!-- 选中指示：用圆点而非 el-radio，避免 Element Plus 版本间 value/label 绑定差异导致无法选中 -->
              <el-table-column width="46" align="center">
                <template #default="{ row }">
                  <span
                    class="pick-dot"
                    :class="{ 'is-on': selectedId === row.id }"
                    :title="selectedId === row.id ? '已选中' : '点击该行选择此工单'"
                  />
                </template>
              </el-table-column>
              <el-table-column prop="no" label="需求工单号" width="132" />
              <el-table-column prop="title" label="需求名称" min-width="200" show-overflow-tooltip />
              <el-table-column label="交付形式" width="94">
                <template #default="{ row }"><StatusTag dict="DeliveryForm" :value="row.deliveryForm" :dot="false" /></template>
              </el-table-column>
              <el-table-column label="资源" width="160" show-overflow-tooltip>
                <template #default="{ row }">
                  {{ arr<any>(row.resources).map((rid: string) => (store.findById('resources', rid) as any)?.name ?? rid).join('、') || '—' }}
                </template>
              </el-table-column>
              <el-table-column label="字段数" width="72">
                <template #default="{ row }"><span class="mono">{{ arr(row.fields).length }}</span></template>
              </el-table-column>
              <el-table-column label="敏感级别" width="92">
                <template #default="{ row }"><StatusTag dict="SecurityLevel" :value="row.securityLevel" /></template>
              </el-table-column>
              <el-table-column label="单据状态" width="100">
                <template #default="{ row }"><StatusTag dict="DemandStatus" :value="row.status" /></template>
              </el-table-column>
              <!-- 部署状态：未部署 / 已部署（含时间）/ 部署失败，取最新一条部署记录 -->
              <el-table-column label="部署状态" width="150">
                <template #default="{ row }">
                  <StatusTag :label="deployStateOfDemand(row.id).label" :tone="deployStateOfDemand(row.id).tone" />
                  <div v-if="deployStateOfDemand(row.id).at" class="cell-sub">{{ fmtTime(deployStateOfDemand(row.id).at) }}</div>
                </template>
              </el-table-column>
              <el-table-column label="审批时间" width="126">
                <template #default="{ row }">{{ row.approvedAt ? fmtTime(row.approvedAt) : '—' }}</template>
              </el-table-column>
              <el-table-column label="操作" width="130" fixed="right">
                <template #default="{ row }">
                  <el-button link type="primary" size="small" :disabled="!canDeploy" @click="openDeploy(row)">
                    {{ deployStateOfDemand(row.id).label === '已部署' ? '重新部署' : '部署' }}
                  </el-button>
                </template>
              </el-table-column>
              <template #empty>
                <div class="empty-box">
                  <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
                  <div class="empty-box__text">
                    {{ deployScope === 'done' ? '当前没有已部署完成的工单' : '当前没有「审批通过 / 实施中」且尚未部署的工单' }}
                  </div>
                </div>
              </template>
            </el-table>
          </div>

          <div class="card__body deploy-records">
            <div class="flex items-center gap-3 mb-3">
              <div class="card__title">部署记录</div>
              <div class="card__sub">记录每次自动化部署的执行人、耗时与产物数量；点击「查看产物」可查阅该次部署生成的 API 接口定义与相关文件</div>
            </div>
            <el-table :data="deployRecords" size="small" style="width: 100%" row-key="id">
              <el-table-column prop="no" label="部署记录号" width="126" />
              <el-table-column label="需求工单" min-width="220" show-overflow-tooltip>
                <template #default="{ row }">
                  <div class="cell-main">{{ row.demandNo }}</div>
                  <div class="cell-sub">{{ row.demandTitle }}</div>
                </template>
              </el-table-column>
              <el-table-column prop="operator" label="执行人" width="90" />
              <el-table-column label="执行时间" width="136">
                <template #default="{ row }">{{ fmtTime(row.at) }}</template>
              </el-table-column>
              <el-table-column prop="cost" label="耗时" width="74" />
              <el-table-column label="产物类型" width="92">
                <template #default="{ row }"><StatusTag dict="ServiceKind" :value="row.serviceKind" :dot="false" /></template>
              </el-table-column>
              <el-table-column label="产物数量" width="86">
                <template #default="{ row }"><span class="mono">{{ row.artifactCount }}</span> 个</template>
              </el-table-column>
              <el-table-column label="结果" width="86">
                <template #default="{ row }">
                  <StatusTag :label="row.status" :tone="row.status === '成功' ? 'success' : 'danger'" />
                </template>
              </el-table-column>
              <el-table-column label="失败原因 / 备注" min-width="160" show-overflow-tooltip>
                <template #default="{ row }">{{ row.reason || '—' }}</template>
              </el-table-column>
              <el-table-column label="操作" width="150" fixed="right">
                <template #default="{ row }">
                  <el-button link type="primary" size="small" :disabled="row.status !== '成功'" @click="openArtifacts(row)">查看产物</el-button>
                  <el-button link type="primary" size="small" @click="retryDeploy(row)">{{ row.status === '失败' ? '重试' : '重新部署' }}</el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- ================================================ 部署执行弹窗 == -->
    <el-dialog
      v-model="deployVisible"
      :title="`自动化部署 · ${deployingDemand?.no ?? ''}`"
      width="880px"
      :close-on-click-modal="false"
      @close="closeDeploy"
    >
      <div class="flex items-center gap-3 mb-3 wrap">
        <span class="text-sm muted">工单</span>
        <span class="bold">{{ deployingDemand?.title }}</span>
        <StatusTag dict="DemandStatus" :value="deployingDemand?.status" />
        <StatusTag dict="DeliveryForm" :value="deployingDemand?.deliveryForm" :dot="false" />
        <span class="card__spacer" />
        <el-tag v-if="deployPhase === 'running'" type="warning" effect="light">部署中…</el-tag>
        <el-tag v-else-if="deployPhase === 'done'" type="success" effect="light">部署成功</el-tag>
        <el-tag v-else type="danger" effect="light">部署失败</el-tag>
      </div>

      <el-progress :percentage="deployProgress" :status="deployPhase === 'failed' ? 'exception' : deployPhase === 'done' ? 'success' : undefined" :stroke-width="8" />

      <div class="log-box mt-3">
        <div v-for="(l, i) in deployLines" :key="i" class="log-box__line" :class="l.tone ? `log-box__line--${l.tone}` : ''">
          <span class="log-box__time">{{ l.time }}</span><span>{{ l.text }}</span>
        </div>
        <div v-if="!deployLines.length" class="log-box__line">等待开始…</div>
      </div>

      <div v-if="deployPhase === 'done' && deployResult" class="mt-4">
        <div class="card__title mb-2">产物一：生成的 API 接口</div>
        <div class="text-sm muted mb-2">
          服务名 <b>{{ serviceNameOf(deployingDemand) }}</b> ·
          路径 <span class="mono">POST /open/api/v1/{{ pathOf(deployingDemand) }}</span> ·
          入参/出参依据需求单 <span class="mono">{{ deployingDemand?.no }}</span> 的申请字段与资源字段自动生成
        </div>
        <div class="code-box">{{ buildApiJson(deployingDemand) }}</div>

        <div class="grid grid--2 mt-4">
          <div>
            <div class="card__title mb-2">入参定义</div>
            <el-table :data="buildParams(deployingDemand).inputs" size="small" style="width: 100%">
              <el-table-column prop="name" label="字段" width="110" />
              <el-table-column prop="cn" label="中文名" min-width="90" />
              <el-table-column prop="type" label="类型" width="90" />
              <el-table-column label="必填" width="66">
                <template #default="{ row }">{{ row.required ? '是' : '否' }}</template>
              </el-table-column>
              <el-table-column prop="remark" label="说明" min-width="120" show-overflow-tooltip />
            </el-table>
          </div>
          <div>
            <div class="card__title mb-2">出参定义</div>
            <el-table :data="buildParams(deployingDemand).outputs" size="small" style="width: 100%" max-height="260">
              <el-table-column prop="name" label="字段" width="120" />
              <el-table-column prop="cn" label="中文名" min-width="90" />
              <el-table-column prop="type" label="类型" width="100" />
              <el-table-column label="脱敏" width="70">
                <template #default="{ row }">
                  <StatusTag :label="row.sensitive ? '脱敏' : '明文'" :tone="row.sensitive ? 'warning' : 'neutral'" :dot="false" />
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>

        <div class="card__title mt-4 mb-2">产物二：生成的相关文件</div>
        <ArtifactPanel :files="deployResult.files" :demand-no="deployingDemand?.no" />
      </div>
    </el-dialog>

    <!-- ============================================ 部署产物查看抽屉 == -->
    <el-drawer v-model="artifactVisible" title="自动化部署产物" size="720px">
      <template v-if="artifactResult && artifactRecord">
        <div class="flex items-center gap-2 mb-2 wrap">
          <span class="bold">{{ artifactRecord.no }}</span>
          <StatusTag :label="artifactRecord.status" :tone="artifactRecord.status === '成功' ? 'success' : 'danger'" :dot="false" />
          <span class="text-sm muted">需求工单 {{ artifactRecord.demandNo }}</span>
        </div>
        <div class="desc-grid mb-3">
          <div class="desc-item"><span class="desc-item--label">执行人</span><span class="desc-item__value">{{ artifactRecord.operator }}</span></div>
          <div class="desc-item"><span class="desc-item--label">执行时间</span><span class="desc-item__value">{{ fmtTime(artifactRecord.at) }}</span></div>
          <div class="desc-item"><span class="desc-item--label">耗时</span><span class="desc-item__value">{{ artifactRecord.cost }}</span></div>
          <div class="desc-item"><span class="desc-item--label">产物数量</span><span class="desc-item__value">{{ artifactResult.files.length }} 个</span></div>
          <div class="desc-item desc-item--wide">
            <span class="desc-item--label">数据服务</span>
            <span class="desc-item__value">
              {{ artifactServiceLabel }}
              <span class="mono muted">（POST {{ artifactPathLabel }}）</span>
            </span>
          </div>
        </div>

        <el-alert
          class="mb-3"
          type="info"
          :closable="false"
          show-icon
          title="产物归档说明"
          description="每次自动化部署生成的文件（接口文档 / 调度配置 / 脱敏规则 / API 接口定义 / 交付说明）随部署记录一并归档，可在此随时查阅；需求单详情的「交付与授权」页签同步可见。"
        />

        <div class="card__title mb-2">生成的 API 接口定义</div>
        <div class="code-box mb-4">{{ artifactResult.apiJson }}</div>

        <div class="card__title mb-2">相关文件（{{ artifactResult.files.length }}）</div>
        <ArtifactPanel :files="artifactResult.files" :demand-no="artifactRecord.demandNo" />
      </template>
      <div v-else class="empty-box">
        <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
        <div class="empty-box__text">未找到该次部署的产物</div>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.wf-tabs { padding: 0 var(--sp-5) var(--sp-5); }
.wf-tabs :deep(.el-tabs__header) { margin-bottom: var(--sp-4); }
.filter-row {
  display: flex; align-items: center; gap: var(--sp-3);
  padding: 0 0 var(--sp-3); flex-wrap: wrap;
  border-bottom: 1px solid var(--border-2); margin-bottom: var(--sp-4);
}
.field__label { font-size: var(--fs-sm); color: var(--text-2); white-space: nowrap; }
.tpl-list { display: flex; flex-direction: column; gap: var(--sp-3); }
.tpl-card { box-shadow: var(--sh-1); }
.tpl-card__head { cursor: pointer; gap: var(--sp-3); flex-wrap: wrap; }
.tpl-card__head:hover { background: var(--surface-2); }
.tpl-card__title { display: flex; align-items: center; gap: var(--sp-2); }
.tpl-card__meta { display: flex; align-items: center; gap: var(--sp-3); flex: 1; min-width: 240px; }
.tpl-card__arrow { color: var(--text-3); transition: transform var(--t-base); }
.tpl-card--open .tpl-card__arrow { transform: rotate(180deg); }
.tpl-card__desc { padding-bottom: 0; color: var(--text-2); }
.tpl-card__detail { border-top: 1px dashed var(--border); margin-top: var(--sp-4); }
.rule-help { background: var(--surface-2); }
.deploy-records { border-top: 1px solid var(--border-2); }
.cell-main { font-weight: 600; }
.cell-sub { font-size: var(--fs-xs); color: var(--text-3); margin-top: 2px; }
.file-item { cursor: pointer; }

/* 部署工单选择：整行可点，选中行高亮，避免依赖单选组件的交互细节 */
.deploy-table :deep(.el-table__row) { cursor: pointer; }
.deploy-table :deep(.el-table__row.current-row) { background: var(--brand-50); }
.pick-dot {
  display: inline-block; width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid var(--border); vertical-align: middle; transition: all var(--t-fast);
}
.pick-dot.is-on {
  border-color: var(--brand-600); background: var(--brand-600);
  box-shadow: 0 0 0 3px var(--brand-100);
}
</style>
