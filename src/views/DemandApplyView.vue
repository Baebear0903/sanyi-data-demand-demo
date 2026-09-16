<script setup lang="ts">
/**
 * DemandApplyView —— 需求申请管理（4 步向导）
 *
 * 覆盖原文功能点：需求申请管理 —— "在目录系统的基础上，提高数据分享的高效性、安全性、便捷性。
 * 对已有资产的申请需求，通过自动和手动的实施的方式，提供安全的数据访问方式。对于接口类型的，
 * 提供接口文档；对于库表类型的提供库表名称等访问途径，对于文件类型的提供下载操作。
 * 对新增资产的需求，通过关联任务的方式，进行数据采集、加工、建模等任务的派发。"
 *
 * 同时覆盖原文"数据分类分级与脱敏"要点：选中 L3/L4 资源时自动带出分类分级结论、审批链增加
 * 安全合规审批节点、样例数据按配置规则在前端脱敏后展示。
 */
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDemoStore, dictItem } from '@/stores/demo'
import { config } from '@/core/config'
import { arr, demoUid, iso, mask, nowStamp, wan } from '@/core/utils'
import PageHead from '@/components/PageHead.vue'
import StatusTag from '@/components/StatusTag.vue'

const store = useDemoStore()
const router = useRouter()

/* 本地宽松数组 / 字典工具（store 返回宽类型，避免 unknown 推断） */
const lst = (v: unknown): any[] => (Array.isArray(v) ? v : [])
const dictOpts = (d: Record<string, { label: string }>) => Object.keys(d).map(k => ({ value: k, label: d[k].label }))

/* ------------------------------------------------------------ 表单 -- */
type Method = 'CATALOG' | 'TEMPLATE' | 'NEW'

const form = reactive({
  method: 'CATALOG' as Method,
  templateId: '' as string,
  resources: [] as string[],
  fields: [] as string[],
  title: '',
  scene: '',
  newDataDesc: '',
  timeRange: '',
  updateFreq: '每日增量',
  usePeriod: '12 个月',
  callVolume: 20000,
  deliveryForm: 'API',
  desensitize: true,
  appId: '' as string,
  incidentIds: [] as string[],
  problemIds: [] as string[],
  files: [] as string[]
})

const freqOptions = ['实时', '每日增量', '每日', '每周', '每月', '每季度', '一次性']
const periodOptions = ['3 个月', '6 个月', '12 个月', '24 个月', '长期', '课题周期内']
const deliveryOptions = [
  { value: 'API', label: '接口', tip: '提供接口文档、调用说明与密钥' },
  { value: 'TABLE', label: '库表', tip: '提供库表名称、视图与访问途径' },
  { value: 'FILE', label: '文件下载', tip: '提供文件下载操作与下发配置' }
]

/* ---------------------------------------------------- 申请方式与模板 -- */
const templates = computed(() => store.table('demandTemplates') as any[])
const templateOptions = computed(() => templates.value.map(t => ({ value: t.id, label: `${t.name}（${t.category}）` })))

function chooseMethod(m: Method) {
  form.method = m
  if (m === 'NEW') {
    form.resources = []
    form.fields = []
  }
}

/** 模板创建：把模板 preset 预填到后续步骤字段 */
function applyTemplate(id: string) {
  const tpl = templates.value.find(t => t.id === id)
  if (!tpl) return
  const p = (tpl.preset ?? {}) as Record<string, any>
  form.templateId = id
  form.title = form.title || `${tpl.name.replace(/（.*?）/g, '')}-${store.user.org}`
  form.scene = String(p.scene ?? form.scene)
  form.deliveryForm = String(p.deliveryForm ?? form.deliveryForm)
  form.updateFreq = String(p.updateFreq ?? form.updateFreq)
  form.usePeriod = String(p.usePeriod ?? form.usePeriod)
  form.desensitize = Boolean(p.desensitize ?? form.desensitize)
  if (p.kind === 'NEW') form.method = 'NEW'
  ElMessage.success(`已套用模板「${tpl.name}」，后续步骤字段已预填`)
}

/* ------------------------------------------------------------ 资源目录 -- */
const rf = reactive({ kw: '', type: '', domain: '', level: '' })
const resources = computed(() => store.table('resources') as any[])
const typeOptions = dictOpts(config.dicts.ResourceType)
const levelOptions = dictOpts(config.dicts.SecurityLevel)
const domainOptions = computed(() => Array.from(new Set(resources.value.map(r => r.domain))).map(v => ({ value: v, label: v })))

const filteredResources = computed(() => resources.value.filter(r => {
  if (rf.type && r.type !== rf.type) return false
  if (rf.domain && r.domain !== rf.domain) return false
  if (rf.level && r.securityLevel !== rf.level) return false
  if (rf.kw) {
    const hay = `${r.name} ${r.code} ${r.owner} ${r.desc}`.toLowerCase()
    if (!hay.includes(rf.kw.toLowerCase())) return false
  }
  return true
}))

const resourceMap = computed<Record<string, any>>(() => {
  const m: Record<string, any> = {}
  resources.value.forEach(r => { m[r.id] = r })
  return m
})

function pickResource(r: any) {
  const i = form.resources.indexOf(r.id)
  if (i >= 0) {
    form.resources.splice(i, 1)
    form.fields = form.fields.filter(f => !lst(r.fields).some((x: any) => x.name === f))
  } else {
    form.resources.push(r.id)
    /* 交付方式跟随资源类型自动建议 */
    if (form.resources.length === 1) {
      if (r.type === 'API') form.deliveryForm = 'API'
      else if (r.type === 'RAW' || r.type === 'MODEL') form.deliveryForm = 'TABLE'
    }
  }
}

const selectedResources = computed(() => form.resources.map(id => resourceMap.value[id]).filter(Boolean))

/* ------------------------------------------------- 第 2 步：字段与安全 -- */
/** 多选资源时可能重名，需标出字段归属 */
const fieldOwner = computed<Record<string, number>>(() => {
  const m: Record<string, number> = {}
  selectedResources.value.forEach(r => lst(r.fields).forEach((f: any) => { m[f.name] = (m[f.name] ?? 0) + 1 }))
  return m
})

/** 可勾选字段（按数据项清单聚合） */
const fieldList = computed(() => {
  const m = new Map<string, any>()
  selectedResources.value.forEach((r: any) => lst(r.fields).forEach((f: any) => {
    if (!m.has(f.name)) m.set(f.name, { ...f, owner: r.name })
    else m.get(f.name).sensitive = m.get(f.name).sensitive || f.sensitive
  }))
  return Array.from(m.values())
})

/** 手动新增（NEW）方式下自行录入的数据项 */
const manualFields = computed(() => {
  if (form.method !== 'NEW' || !form.newDataDesc.trim()) return [] as any[]
  return form.newDataDesc.split(/[，,、\n]/).map(s => s.trim()).filter(Boolean)
    .map(s => ({ name: s, cn: s, type: '自定义', sensitive: /身份证|手机|姓名|银行|账户|住址/.test(s), owner: '新增资产' }))
})

const allFieldList = computed(() => [...fieldList.value, ...manualFields.value])
const sensitiveFields = computed(() => allFieldList.value.filter(f => f.sensitive))

const securityLevel = computed(() => {
  const order = ['L1', 'L2', 'L3', 'L4']
  const levels = selectedResources.value.map((r: any) => r.securityLevel).filter(Boolean)
  if (!levels.length) return 'L2'
  return levels.reduce((a: string, b: string) => (order.indexOf(b) > order.indexOf(a) ? b : a), 'L1')
})
const needSecurity = computed(() => ['L3', 'L4'].includes(securityLevel.value))

/* --------------- 分类分级与脱敏预览（右侧常驻卡片，展示脱敏效果） --------------- */
const classificationOf = computed(() => selectedResources.value
  .map((r: any) => ({ resource: r, cls: (store.table('classifications') as any[]).find(c => c.resourceId === r.id) }))
  .filter(x => !!x.cls))

/** 敏感字段掩码规则（与分类分级脱敏算法对应，前端展示用） */
const RULES: { re: RegExp; fn: (v: any) => string }[] = [
  { re: /id_card|idcard|身份证|证件号/, fn: mask.idcard },
  { re: /phone|mobile|tel|电话|手机/, fn: mask.phone },
  { re: /name|姓名|法人|联系人|insured|patient/, fn: mask.name },
  { re: /bank|account|账户|卡号/, fn: mask.bank }
]
function maskedVal(field: string, v: any): string {
  const s = v === null || v === undefined || v === '' ? '—' : String(v)
  const hit = RULES.find(r => r.re.test(field))
  return hit ? hit.fn(s) : s
}
function sampleRows(resourceId: string): any[] {
  const samples = store.db.samples as Record<string, any[]> | undefined
  return lst(samples?.[resourceId])
}
const sampleCols = computed(() => {
  const out: { resource: any; cols: { key: string; label: string; sensitive: boolean }[]; rows: any[] }[] = []
  selectedResources.value.forEach((r: any) => {
    const rows = sampleRows(r.id)
    if (!rows.length) return
    const cols = Object.keys(rows[0]).map(k => {
      const f = lst(r.fields).find((x: any) => x.name === k)
      return { key: k, label: f ? `${f.cn}（${k}）` : k, sensitive: /id_card|phone|mobile|name|bank|account|法人|联系人|insured/.test(k) }
    })
    out.push({ resource: r, cols, rows })
  })
  return out
})

/* ------------------------------------------------------------ 第 3 步关联 -- */
const apps = computed(() => store.table('apps') as any[])
const incidents = computed(() => store.table('incidents') as any[])
const problems = computed(() => store.table('problems') as any[])
const incidentOptions = computed(() => incidents.value.filter(i => lst(i.relatedIncidentIds).length >= 0).slice(0, 60))
const problemOptions = computed(() => problems.value)

/* 简易附件选择（不上传真实文件） */
const fileInput = ref('')
function addFile() {
  const v = fileInput.value.trim()
  if (!v) return
  form.files.push(v)
  fileInput.value = ''
}
function fileIcon(name: string): string {
  if (/\.pdf$/i.test(name)) return 'file-item__icon--pdf'
  if (/\.docx?$/i.test(name)) return 'file-item__icon--word'
  if (/\.xlsx?$/i.test(name)) return 'file-item__icon--xlsx'
  if (/\.pptx?$/i.test(name)) return 'file-item__icon--ppt'
  return 'file-item__icon--txt'
}

/* ------------------------------------------------------------ 向导控制 -- */
const step = ref(0)
function nextStep() {
  if (step.value === 0) {
    if (form.method === 'TEMPLATE' && !form.templateId) { ElMessage.warning('请先选择一个需求申请模板'); return }
    if (form.method === 'CATALOG' && !form.resources.length) { ElMessage.warning('请从资源目录中至少选择一项数据资源'); return }
    if (form.method === 'NEW' && !form.newDataDesc.trim()) { ElMessage.warning('请填写新增资产的数据项说明'); return }
  }
  if (step.value === 1) {
    if (!form.title.trim()) { ElMessage.warning('请填写需求名称'); return }
    if (!form.scene.trim()) { ElMessage.warning('请填写业务场景与用途'); return }
  }
  step.value = Math.min(3, step.value + 1)
}
function prevStep() { step.value = Math.max(0, step.value - 1) }

/* ------------------------------------------------------------ 提交 -- */
function nextNo(): string {
  // 单号日期统一取当前日期（nowStamp，见 core/utils），与单据创建 / 提交时间保持同一天
  const day = nowStamp()
  const n = (store.table('demands') as any[]).filter(x => String(x.no).includes(day.slice(0, 6))).length + 1
  return `XQ${day}${String(n).padStart(3, '0')}`
}

function submit(draft = false) {
  if (draft) {
    ElMessageBox.confirm('将保存为草稿（状态：草稿），可在「需求单管理」中继续编辑后提交。', '保存草稿', { type: 'info' })
      .then(() => createDemand(true))
      .catch(() => { /* 取消 */ })
    return
  }
  ElMessageBox.confirm(
    `申请对象：${form.method === 'NEW' ? '新增资产' : `${form.resources.length} 项数据资源`}；交付方式：${dictItem('DeliveryForm', form.deliveryForm).label}。确认提交？`,
    '确认提交需求申请',
    { type: 'info', confirmButtonText: '确认提交', cancelButtonText: '再看看' }
  ).then(() => createDemand(false)).catch(() => { /* 取消 */ })
}

function createDemand(draft: boolean) {
  const no = nextNo()
  const now = iso()
  const secApprover = '周雅静'
  const rec: Record<string, any> = {
    id: demoUid('d'),
    no,
    title: form.title || (form.method === 'NEW' ? '新增资产数据需求' : '数据资源申请'),
    applicant: store.user.name,
    applicantOrg: store.user.org,
    tenantId: (apps.value.find(a => a.id === form.appId) ?? {}).tenantId ?? null,
    appId: form.appId || null,
    scene: form.scene,
    kind: form.method === 'NEW' ? 'NEW' : 'EXISTING',
    resourceType: selectedResources.value[0]?.type ?? 'RAW',
    deliveryForm: form.deliveryForm,
    resources: form.method === 'NEW' ? [] : [...form.resources],
    fields: form.method === 'NEW' ? manualFields.value.map(f => f.name) : [...form.fields],
    newDataDesc: form.method === 'NEW' ? form.newDataDesc : undefined,
    timeRange: form.timeRange || '近 12 个月',
    updateFreq: form.updateFreq,
    usePeriod: form.usePeriod,
    callVolume: Number(form.callVolume) || 0,
    desensitize: form.desensitize,
    securityLevel: securityLevel.value,
    priority: 'P2',
    status: draft ? 'DRAFT' : 'PENDING_ACCEPT',
    currentHandler: draft ? store.user.name : '王思远',
    source: form.method === 'TEMPLATE' ? 'TEMPLATE' : 'WEB',
    templateId: form.templateId || undefined,
    relatedIncidentIds: [...form.incidentIds],
    relatedProblemIds: [...form.problemIds],
    taskIds: [],
    changeIds: [],
    subscriptionIds: [],
    submittedAt: draft ? null : now,
    acceptedAt: null,
    approvedAt: null,
    expectAt: null,
    timeline: [{
      at: now, actor: store.user.name,
      action: draft ? '保存草稿' : '提交需求单',
      comment: draft
        ? '向导暂存，待补充后提交'
        : `${form.method === 'NEW' ? '新增资产' : `${form.resources.length} 项已有资产`} · ${dictItem('DeliveryForm', form.deliveryForm).label} · 敏感级别 ${securityLevel.value}`
    }]
  }
  store.insert('demands', rec)
  store.addAudit({
    bizType: 'demands', bizId: rec.id, bizNo: no, bizTitle: rec.title,
    action: draft ? '保存草稿' : '创建需求单',
    remark: needSecurity.value ? `含 ${securityLevel.value} 敏感数据，审批链已自动增加安全合规审批节点` : '常规申请'
  })

  if (!draft) {
    store.notify({
      type: 'info',
      title: `新需求单 ${no} 待受理`,
      body: `用数方「${store.user.name}」提交需求「${rec.title}」，请服务台受理。${needSecurity.value ? `该申请涉及 ${securityLevel.value} 敏感资源，审批链已自动增加安全合规审批节点（安全审批人：${secApprover}）。` : ''}`,
      toRoles: ['desk'],
      link: `/demand/detail/${rec.id}`
    })
    ElMessage.success(
      needSecurity.value
        ? `已提交 ${no}，因涉及 ${securityLevel.value} 敏感数据，审批链已自动增加安全合规审批节点`
        : `已提交 ${no}，等待服务台受理`
    )
  } else {
    ElMessage.info(`已保存草稿 ${no}`)
  }
  router.push('/demand/list')
}

/* ------------------------------------------------------------ 交付物 -- */
const deliverable = computed(() => {
  if (form.deliveryForm === 'API') {
    return {
      title: '接口交付物：提供接口文档与调用说明',
      items: [
        '《接口文档》：请求地址、请求方式、入参 / 出参字段说明、错误码、调用示例（cURL / Java / Python）',
        '接口密钥（appKey / appSecret）按订阅单审批后发放，密钥支持补发与轮换',
        '接口调用频率与配额按申请中的「预估调用量」核定，超限自动限流并告警'
      ]
    }
  }
  if (form.deliveryForm === 'TABLE') {
    return {
      title: '库表交付物：提供库表名称等访问途径',
      items: [
        `库表名称：${selectedResources.value.map((r: any) => r.code).filter(Boolean).join('、') || '（按加工结果命名）'}`,
        '访问途径：授权视图 / 只读账号（含库名、表名、视图名与连接方式）',
        '敏感字段按分类分级结果以视图脱敏列交付，不做原始列授权'
      ]
    }
  }
  return {
    title: '文件交付物：提供文件下载操作',
    items: [
      '文件下载：按申请频率下发 CSV / Excel 文件，提供下载链接与历史文件清单',
      '下发方式：平台下载区 / SFTP 目录（敏感资源走 SFTP 并记录分发日志）',
      '文件命名与字段说明随每次下发附带数据说明文件'
    ]
  }
})
</script>

<template>
  <div>
    <PageHead
      title="需求申请管理"
      desc="在目录系统的基础上，提高数据分享的高效性、安全性、便捷性；已有资产提供安全的数据访问方式，新增资产通过关联任务派发采集、加工、建模。"
    >
      <template #actions>
        <el-button @click="router.push('/demand/list')">需求单管理</el-button>
        <el-button type="primary" plain @click="submit(true)">存为草稿</el-button>
      </template>
    </PageHead>

    <div class="grid grid--side">
      <!-- ================= 左：向导 ================= -->
      <div>
        <div class="card mb-4">
          <div class="card__body">
            <el-steps :active="step" finish-status="success" align-center>
              <el-step title="选择申请对象" description="已有资产 / 模板 / 新增资产" />
              <el-step title="填写需求信息" description="用途、数据项、交付方式" />
              <el-step title="关联与附件" description="项目应用、事件问题、依据文件" />
              <el-step title="确认提交" description="预览并提交" />
            </el-steps>
          </div>
        </div>

        <!-- ---------------- 第 1 步 ---------------- -->
        <div v-show="step === 0" class="card mb-4">
          <div class="card__head">
            <div class="card__title">第 1 步 · 选择申请对象</div>
            <div class="card__sub">先选择申请方式，再确定申请对象</div>
          </div>
          <div class="card__body">
            <el-radio-group :model-value="form.method" @change="(v: any) => chooseMethod(v)">
              <el-radio-button value="CATALOG">① 从资源目录选择（已有资产）</el-radio-button>
              <el-radio-button value="TEMPLATE">② 从模板创建</el-radio-button>
              <el-radio-button value="NEW">③ 新增资产</el-radio-button>
            </el-radio-group>

            <!-- 从模板创建 -->
            <div v-if="form.method === 'TEMPLATE'" class="mt-4">
              <div class="field mb-3">
                <span class="field__label">需求申请模板</span>
                <el-select
                  :model-value="form.templateId"
                  placeholder="请选择模板（选中后自动预填后续字段）"
                  style="width: 420px"
                  @change="applyTemplate"
                >
                  <el-option v-for="t in templateOptions" :key="t.value" :label="t.label" :value="t.value" />
                </el-select>
              </div>
              <el-table :data="templates" style="width: 100%">
                <el-table-column label="模板名称" min-width="240">
                  <template #default="{ row }">
                    <div class="cell-main">{{ row.name }}</div>
                    <div class="cell-sub">{{ row.desc }}</div>
                  </template>
                </el-table-column>
                <el-table-column prop="category" label="适用场景" width="110" />
                <el-table-column label="预置参数" min-width="300">
                  <template #default="{ row }">
                    <span class="text-xs muted">
                      类型 {{ dictItem('DemandKind', row.preset.kind).label }} · 交付 {{ dictItem('DeliveryForm', row.preset.deliveryForm).label }} ·
                      频率 {{ row.preset.updateFreq }} · 期限 {{ row.preset.usePeriod }} ·
                      {{ row.preset.desensitize ? '需脱敏' : '不脱敏' }}
                    </span>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="90">
                  <template #default="{ row }">
                    <el-button link type="primary" size="small" @click="applyTemplate(row.id)">
                      {{ form.templateId === row.id ? '已选' : '选用' }}
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>
            </div>

            <!-- 新增资产 -->
            <div v-else-if="form.method === 'NEW'" class="mt-4">
              <el-alert type="warning" :closable="false" show-icon class="mb-3"
                title="新增资产需求：主题库尚未覆盖，提交后由生产部门派发采集 / 加工 / 建模任务"
                description="请在下方描述需要新增的数据项与来源系统；提交审批通过后，可在需求单详情中派发任务单（数据采集 / 数据加工 / 数据建模）。" />
              <div class="field mb-3">
                <span class="field__label">需求名称</span>
                <el-input v-model="form.title" placeholder="如：新增采集需求-药品流通与采购信息" style="width: 420px" />
              </div>
              <div class="field">
                <span class="field__label">新增数据项说明</span>
                <el-input
                  v-model="form.newDataDesc"
                  type="textarea"
                  :rows="4"
                  style="width: 620px"
                  placeholder="如：药品采购信息（采购单号、药品编码、采购数量、采购金额、供应商、采购日期），药品库存信息（药品编码、库存数量、库存金额、统计日期）"
                />
              </div>
            </div>

            <!-- 从资源目录选择 -->
            <div v-else class="mt-4">
              <div class="toolbar">
                <div class="toolbar__fields">
                  <div class="field"><span class="field__label">关键字</span>
                    <el-input v-model="rf.kw" placeholder="资源名称 / 编码 / 归属单位" clearable style="width: 220px" />
                  </div>
                  <div class="field"><span class="field__label">资源类型</span>
                    <el-select v-model="rf.type" placeholder="全部类型" clearable style="width: 140px">
                      <el-option v-for="o in typeOptions" :key="o.value" :label="o.label" :value="o.value" />
                    </el-select>
                  </div>
                  <div class="field"><span class="field__label">主题域</span>
                    <el-select v-model="rf.domain" placeholder="全部主题域" clearable style="width: 130px">
                      <el-option v-for="o in domainOptions" :key="o.value" :label="o.label" :value="o.value" />
                    </el-select>
                  </div>
                  <div class="field"><span class="field__label">敏感级别</span>
                    <el-select v-model="rf.level" placeholder="全部级别" clearable style="width: 140px">
                      <el-option v-for="o in levelOptions" :key="o.value" :label="o.label" :value="o.value" />
                    </el-select>
                  </div>
                </div>
                <div class="toolbar__actions">
                  <el-button @click="Object.assign(rf, { kw: '', type: '', domain: '', level: '' })">重置</el-button>
                  <span class="text-sm muted">已选 <b>{{ form.resources.length }}</b> 项</span>
                </div>
              </div>

              <el-table
                :data="filteredResources"
                style="width: 100%"
                height="360"
                row-key="id"
                @selection-change="(v: any[]) => (form.resources = v.map(x => x.id))"
              >
                <el-table-column type="selection" width="42" :reserve-selection="true" />
                <el-table-column label="资源名称" min-width="220" show-overflow-tooltip>
                  <template #default="{ row }">
                    <div class="cell-main">{{ row.name }}</div>
                    <div class="cell-sub mono">{{ row.code }}</div>
                  </template>
                </el-table-column>
                <el-table-column label="类型" width="100">
                  <template #default="{ row }"><StatusTag dict="ResourceType" :value="row.type" :dot="false" /></template>
                </el-table-column>
                <el-table-column prop="layer" label="分层" width="76" />
                <el-table-column prop="domain" label="主题域" width="80" />
                <el-table-column prop="source" label="来源" width="120" show-overflow-tooltip />
                <el-table-column label="敏感级别" width="104">
                  <template #default="{ row }"><StatusTag dict="SecurityLevel" :value="row.securityLevel" /></template>
                </el-table-column>
                <el-table-column label="订阅量" width="90">
                  <template #default="{ row }">{{ row.subscribeCount }} 次</template>
                </el-table-column>
                <el-table-column label="操作" width="86" fixed="right">
                  <template #default="{ row }">
                    <el-button link type="primary" size="small" @click="pickResource(row)">
                      {{ form.resources.includes(row.id) ? '取消' : '选择' }}
                    </el-button>
                  </template>
                </el-table-column>
                <template #empty>
                  <div class="empty-box">
                    <div class="empty-box__icon"><el-icon><Search /></el-icon></div>
                    <div class="empty-box__text">没有符合条件的资源，请调整筛选条件</div>
                  </div>
                </template>
              </el-table>

              <div v-if="selectedResources.length" class="mt-3">
                <div class="text-sm muted mb-2">已选申请对象（{{ selectedResources.length }}）</div>
                <div class="flex wrap gap-2">
                  <el-tag
                    v-for="r in selectedResources"
                    :key="r.id"
                    closable
                    :type="['L3', 'L4'].includes(r.securityLevel) ? 'warning' : 'info'"
                    @close="pickResource(r)"
                  >{{ r.name }} · {{ r.securityLevel }}</el-tag>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ---------------- 第 2 步 ---------------- -->
        <div v-show="step === 1" class="card mb-4">
          <div class="card__head">
            <div class="card__title">第 2 步 · 填写需求信息</div>
            <div class="card__sub">业务场景与用途将作为审批依据，请按最小必要原则填写数据项</div>
          </div>
          <div class="card__body">
            <el-alert
              v-if="needSecurity"
              class="mb-3"
              type="warning"
              show-icon
              :closable="false"
              title="所选资源包含 L3 / L4 敏感数据：审批链将自动增加安全合规审批节点"
              :description="`当前申请敏感级别为 ${securityLevel}（${dictItem('SecurityLevel', securityLevel).label}），提交后系统自动生成临时授权工单，由多级安全审批人逐级审批（系统审批 / 邮件审批）。`"
            />

            <div class="form-grid">
              <div class="field field--block">
                <span class="field__label">需求名称 <i class="req">*</i></span>
                <el-input v-model="form.title" placeholder="请输入需求名称" />
              </div>
              <div class="field field--block">
                <span class="field__label">交付方式 <i class="req">*</i></span>
                <el-radio-group v-model="form.deliveryForm">
                  <el-radio v-for="d in deliveryOptions" :key="d.value" :value="d.value">{{ d.label }}</el-radio>
                </el-radio-group>
                <div class="text-xs muted mt-1">{{ deliveryOptions.find(d => d.value === form.deliveryForm)?.tip }}</div>
              </div>
              <div class="field field--block wide">
                <span class="field__label">业务场景与用途 <i class="req">*</i></span>
                <el-input v-model="form.scene" type="textarea" :rows="3" placeholder="请说明具体业务场景、使用范围与不外传承诺" />
              </div>
              <div class="field field--block">
                <span class="field__label">时间范围</span>
                <el-input v-model="form.timeRange" placeholder="如 2025-09-01 ~ 2026-08-31 或 近 12 个月" />
              </div>
              <div class="field field--block">
                <span class="field__label">更新频率</span>
                <el-select v-model="form.updateFreq" style="width: 100%">
                  <el-option v-for="o in freqOptions" :key="o" :label="o" :value="o" />
                </el-select>
              </div>
              <div class="field field--block">
                <span class="field__label">使用期限</span>
                <el-select v-model="form.usePeriod" style="width: 100%">
                  <el-option v-for="o in periodOptions" :key="o" :label="o" :value="o" />
                </el-select>
              </div>
              <div class="field field--block">
                <span class="field__label">预估调用量</span>
                <el-input v-model.number="form.callVolume" type="number" placeholder="0">
                  <template #append>次 / 年</template>
                </el-input>
              </div>
              <div class="field field--block">
                <span class="field__label">是否脱敏</span>
                <el-switch v-model="form.desensitize" active-text="按分类分级结果脱敏交付" inactive-text="不脱敏" />
              </div>
            </div>

            <div class="mt-4">
              <div class="flex items-center justify-between mb-2">
                <span class="bold">数据项清单（{{ form.fields.length }} / {{ allFieldList.length }}）</span>
                <span class="text-xs muted">
                  已勾选敏感字段 <b>{{ form.fields.filter(f => allFieldList.find(x => x.name === f)?.sensitive).length }}</b> 项 ·
                  敏感字段标记 <span class="masked">脱敏</span>
                </span>
              </div>
              <div v-if="!allFieldList.length" class="empty-box">
                <div class="empty-box__icon"><el-icon><FolderOpened /></el-icon></div>
                <div class="empty-box__text">请先在第 1 步选择数据资源或填写新增数据项</div>
              </div>
              <el-checkbox-group v-else v-model="form.fields">
                <div class="field-pool">
                  <el-checkbox v-for="f in allFieldList" :key="f.name" :value="f.name" class="field-chip">
                    <span>{{ f.cn }}</span>
                    <span class="mono text-xs muted">（{{ f.name }}）</span>
                    <StatusTag v-if="f.sensitive" label="敏感" tone="warning" :dot="false" />
                    <StatusTag v-if="fieldOwner[f.name] > 1" label="同名冲突" tone="danger" :dot="false" />
                  </el-checkbox>
                </div>
              </el-checkbox-group>
            </div>

            <div v-if="sensitiveFields.length" class="mt-3">
              <el-alert type="info" :closable="false" show-icon
                :title="`本次申请涉及 ${sensitiveFields.length} 个敏感字段，将按分类分级结果脱敏后交付`"
                :description="sensitiveFields.map(f => f.cn).join('、')" />
            </div>
          </div>
        </div>

        <!-- ---------------- 第 3 步 ---------------- -->
        <div v-show="step === 2" class="card mb-4">
          <div class="card__head">
            <div class="card__title">第 3 步 · 关联与附件</div>
            <div class="card__sub">关联项目应用与已有事件 / 问题单，便于追溯需求来源</div>
          </div>
          <div class="card__body">
            <div class="form-grid">
              <div class="field field--block">
                <span class="field__label">关联项目 / 应用</span>
                <el-select v-model="form.appId" placeholder="请选择（取数后的承载应用）" clearable filterable style="width: 100%">
                  <el-option v-for="a in apps" :key="a.id" :label="`${a.name} · ${a.owner}`" :value="a.id" />
                </el-select>
              </div>
              <div class="field field--block">
                <span class="field__label">关联已有事件单</span>
                <el-select v-model="form.incidentIds" multiple filterable placeholder="由事件驱动的需求可关联" style="width: 100%">
                  <el-option
                    v-for="i in incidentOptions"
                    :key="i.id"
                    :label="`${i.no} ${i.title}`"
                    :value="i.id"
                  />
                </el-select>
              </div>
              <div class="field field--block">
                <span class="field__label">关联已有问题单</span>
                <el-select v-model="form.problemIds" multiple filterable placeholder="作为问题根治方案落地载体" style="width: 100%">
                  <el-option v-for="p in problemOptions" :key="p.id" :label="`${p.no} ${p.title}`" :value="p.id" />
                </el-select>
              </div>
            </div>

            <div class="mt-4">
              <div class="flex items-center gap-2 mb-2">
                <el-input v-model="fileInput" placeholder="填写依据文件名，如：执法依据文件.pdf" style="width: 280px" />
                <el-button @click="addFile">添加附件</el-button>
                <el-upload :auto-upload="false" :show-file-list="false" multiple>
                  <el-button plain><el-icon><Plus /></el-icon> 选择文件</el-button>
                </el-upload>
                <span class="text-xs muted">不做真实上传，仅登记依据文件清单</span>
              </div>
              <div v-if="form.files.length" class="file-list">
                <div v-for="f in form.files" :key="f" class="file-item">
                  <div class="file-item__icon" :class="fileIcon(f)">{{ (f.split('.').pop() || 'txt').slice(0, 4).toUpperCase() }}</div>
                  <div class="file-item__main">
                    <div class="file-item__name">{{ f }}</div>
                    <div class="file-item__meta">依据文件 · 未真实上传</div>
                  </div>
                  <el-button link type="danger" size="small" @click="form.files = form.files.filter(x => x !== f)">移除</el-button>
                </div>
              </div>
              <div v-else class="empty-box">
                <div class="empty-box__icon"><el-icon><Paperclip /></el-icon></div>
                <div class="empty-box__text">尚未添加依据文件</div>
              </div>
            </div>
          </div>
        </div>

        <!-- ---------------- 第 4 步 ---------------- -->
        <div v-show="step === 3" class="card mb-4">
          <div class="card__head">
            <div class="card__title">第 4 步 · 确认提交</div>
            <div class="card__sub">请核对整张申请单；提交后进入服务台受理</div>
          </div>
          <div class="card__body">
            <div class="desc-grid">
              <div class="desc-item desc-item--wide">
                <span class="desc-item--label">需求名称</span>
                <span class="desc-item__value bold">{{ form.title || '（未填写）' }}</span>
              </div>
              <div class="desc-item">
                <span class="desc-item--label">申请方式</span>
                <span class="desc-item__value">
                  {{ form.method === 'CATALOG' ? '从资源目录选择' : form.method === 'TEMPLATE' ? '从模板创建' : '新增资产' }}
                  <span v-if="form.templateId" class="muted">（{{ templates.find(t => t.id === form.templateId)?.name }}）</span>
                </span>
              </div>
              <div class="desc-item">
                <span class="desc-item--label">申请类型</span>
                <span class="desc-item__value"><StatusTag dict="DemandKind" :value="form.method === 'NEW' ? 'NEW' : 'EXISTING'" :dot="false" /></span>
              </div>
              <div class="desc-item">
                <span class="desc-item--label">申请人</span>
                <span class="desc-item__value">{{ store.user.name }} · {{ store.user.org }}</span>
              </div>
              <div class="desc-item">
                <span class="desc-item--label">交付方式</span>
                <span class="desc-item__value"><StatusTag dict="DeliveryForm" :value="form.deliveryForm" :dot="false" /></span>
              </div>
              <div class="desc-item">
                <span class="desc-item--label">敏感级别</span>
                <span class="desc-item__value">
                  <StatusTag dict="SecurityLevel" :value="securityLevel" />
                  <span v-if="needSecurity" class="text-xs muted"> · 审批链自动增加安全合规审批节点</span>
                </span>
              </div>
              <div class="desc-item">
                <span class="desc-item--label">时间范围</span>
                <span class="desc-item__value">{{ form.timeRange || '—' }}</span>
              </div>
              <div class="desc-item">
                <span class="desc-item--label">更新频率</span>
                <span class="desc-item__value">{{ form.updateFreq }}</span>
              </div>
              <div class="desc-item">
                <span class="desc-item--label">使用期限</span>
                <span class="desc-item__value">{{ form.usePeriod }}</span>
              </div>
              <div class="desc-item">
                <span class="desc-item--label">预估调用量</span>
                <span class="desc-item__value">{{ wan(form.callVolume) }} 次 / 年</span>
              </div>
              <div class="desc-item">
                <span class="desc-item--label">是否脱敏</span>
                <span class="desc-item__value">{{ form.desensitize ? '是（按分类分级结果脱敏）' : '否' }}</span>
              </div>
              <div class="desc-item">
                <span class="desc-item--label">关联应用</span>
                <span class="desc-item__value">{{ apps.find(a => a.id === form.appId)?.name || '—' }}</span>
              </div>
              <div class="desc-item desc-item--wide">
                <span class="desc-item--label">申请对象</span>
                <span class="desc-item__value">
                  <template v-if="form.method === 'NEW'">{{ form.newDataDesc || '—' }}</template>
                  <template v-else>
                    <el-tag v-for="r in selectedResources" :key="r.id" size="small" class="mb-2">{{ r.name }}（{{ r.code }}）</el-tag>
                    <span v-if="!selectedResources.length" class="muted">—</span>
                  </template>
                </span>
              </div>
              <div class="desc-item desc-item--wide">
                <span class="desc-item--label">数据项清单</span>
                <span class="desc-item__value">
                  <template v-if="form.fields.length">
                    {{ form.fields.map(f => allFieldList.find(x => x.name === f)?.cn ?? f).join('、') }}
                    <span class="muted">（共 {{ form.fields.length }} 项）</span>
                  </template>
                  <span v-else class="muted">未勾选（新增资产按加工结果确定）</span>
                </span>
              </div>
              <div class="desc-item desc-item--wide">
                <span class="desc-item--label">业务场景与用途</span>
                <span class="desc-item__value">{{ form.scene || '—' }}</span>
              </div>
              <div class="desc-item desc-item--wide">
                <span class="desc-item--label">关联单据</span>
                <span class="desc-item__value">
                  事件单 {{ form.incidentIds.length }} 张 · 问题单 {{ form.problemIds.length }} 张 · 附件 {{ form.files.length }} 个
                </span>
              </div>
            </div>

            <div class="deliver-box mt-4">
              <div class="bold mb-2"><el-icon><Box /></el-icon> {{ deliverable.title }}</div>
              <ul class="deliver-list">
                <li v-for="(t, i) in deliverable.items" :key="i">{{ t }}</li>
              </ul>
            </div>

            <el-alert class="mt-4" type="info" :closable="false" show-icon
              title="提交后流转：服务台受理 → 资源归属方审批 → 数据资源管理人员复核 →（敏感级别 ≥ L3 时）安全合规审批 → 派发实施"
              description="可在「需求单管理」中实时查看流转状态，未审核前可撤回。" />
          </div>
          <div class="card__foot">
            <span class="text-sm muted">
              提交后生成需求单号（XQ + 日期 + 序号），并通知服务台角色受理
            </span>
            <span class="card__spacer" />
            <el-button @click="submit(true)">存为草稿</el-button>
            <el-button type="primary" @click="submit(false)">提交申请</el-button>
          </div>
        </div>

        <div class="flex items-center gap-2 mb-4">
          <el-button :disabled="step === 0" @click="prevStep">上一步</el-button>
          <el-button v-if="step < 3" type="primary" @click="nextStep">下一步</el-button>
          <span class="text-sm muted">当前第 {{ step + 1 }} / 4 步</span>
        </div>
      </div>

      <!-- ================= 右：分类分级与脱敏预览 ================= -->
      <div>
        <div class="card mb-4">
          <div class="card__head">
            <div class="card__title">分类分级与脱敏预览</div>
            <div class="card__sub">对接数据分类分级系统</div>
          </div>
          <div class="card__body">
            <div v-if="!classificationOf.length" class="empty-box">
              <div class="empty-box__icon"><el-icon><Lock /></el-icon></div>
              <div class="empty-box__text">选择数据资源后，自动带出分类分级结论与脱敏算法</div>
            </div>
            <div v-for="c in classificationOf" :key="c.resource.id" class="cls-card">
              <div class="flex items-center justify-between">
                <span class="bold">{{ c.resource.name }}</span>
                <StatusTag dict="SecurityLevel" :value="c.cls.level" />
              </div>
              <div class="desc-grid mt-2">
                <div class="desc-item">
                  <span class="desc-item--label">类别</span>
                  <span class="desc-item__value">{{ c.cls.category }}</span>
                </div>
                <div class="desc-item">
                  <span class="desc-item--label">级别</span>
                  <span class="desc-item__value">{{ c.cls.levelName }}</span>
                </div>
                <div class="desc-item">
                  <span class="desc-item--label">脱敏算法</span>
                  <span class="desc-item__value">{{ c.cls.maskAlgorithm }}</span>
                </div>
                <div class="desc-item">
                  <span class="desc-item--label">法律依据</span>
                  <span class="desc-item__value">{{ c.cls.legalBasis }}</span>
                </div>
                <div class="desc-item desc-item--wide">
                  <span class="desc-item--label">命中规则</span>
                  <span class="desc-item__value">
                    <el-tag v-for="r in lst(c.cls.hitRules)" :key="r" size="small" class="mb-2">{{ r }}</el-tag>
                  </span>
                </div>
                <div class="desc-item desc-item--wide">
                  <span class="desc-item--label">评估信息</span>
                  <span class="desc-item__value text-xs muted">{{ c.cls.ruleName }} · {{ c.cls.source }} · {{ c.cls.evaluatedAt }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card__head">
            <div class="card__title">样例数据预览</div>
            <div class="card__sub">按配置规则在前端脱敏后展示</div>
          </div>
          <div class="card__body card__body--flush">
            <div v-if="!sampleCols.length" class="empty-box">
              <div class="empty-box__icon"><el-icon><View /></el-icon></div>
              <div class="empty-box__text">所选资源暂无样例数据</div>
            </div>
            <div v-for="s in sampleCols" :key="s.resource.id" class="sample-block">
              <div class="sample-block__title">
                {{ s.resource.name }}
                <StatusTag dict="SecurityLevel" :value="s.resource.securityLevel" :dot="false" />
              </div>
              <el-table :data="s.rows" size="small" style="width: 100%">
                <el-table-column
                  v-for="c in s.cols"
                  :key="c.key"
                  :label="c.label"
                  min-width="130"
                  show-overflow-tooltip
                >
                  <template #default="{ row }">
                    <span :class="{ masked: c.sensitive }">{{ maskedVal(c.key, row[c.key]) }}</span>
                  </template>
                </el-table-column>
              </el-table>
              <div class="text-xs muted mt-1">
                共 {{ s.rows.length }} 条样例 · 敏感字段（{{ s.cols.filter(c => c.sensitive).map(c => c.label).join('、') || '无' }}）已脱敏
              </div>
            </div>
            <div class="text-xs muted" style="margin: var(--sp-3) var(--sp-4)">
              样例数据来源于资源目录对接的样例集，原始值不可见；<span class="masked">灰色标记</span>字段为按分类分级脱敏算法处理后展示。
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex; align-items: center; gap: var(--sp-3);
  padding: var(--sp-3) 0; border-bottom: 1px solid var(--border-2);
  flex-wrap: wrap; margin-bottom: var(--sp-2);
}
.toolbar__fields { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; flex: 1; }
.toolbar__actions { display: flex; align-items: center; gap: var(--sp-2); }
.field { display: flex; align-items: center; gap: 6px; }
.field__label { font-size: var(--fs-sm); color: var(--text-2); white-space: nowrap; }
.req { color: var(--danger-fg); font-style: normal; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-4); }
.field--block { flex-direction: column; align-items: stretch; gap: 6px; }
.field--block.wide { grid-column: 1 / -1; }
.field-pool { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 2px var(--sp-3); }
.field-chip { height: 30px; margin-right: 0; }
.cell-main { font-weight: 600; }
.cell-sub { font-size: var(--fs-xs); color: var(--text-3); margin-top: 2px; }
.deliver-box {
  padding: var(--sp-4); border-radius: var(--r-md);
  background: var(--brand-50); border: 1px solid var(--brand-100);
}
.deliver-list { margin: 0; padding-left: 20px; font-size: var(--fs-sm); color: var(--text-2); line-height: 1.9; }
.cls-card { padding: var(--sp-3) 0; border-bottom: 1px dashed var(--border-2); }
.cls-card:last-child { border-bottom: none; }
.sample-block { padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--border-2); }
.sample-block__title { font-size: var(--fs-sm); font-weight: 600; margin-bottom: var(--sp-2); display: flex; align-items: center; gap: var(--sp-2); }
@media (max-width: 1200px) {
  .form-grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
