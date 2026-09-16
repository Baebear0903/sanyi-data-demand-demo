<script setup lang="ts">
/**
 * ReleaseListView —— 发布管理（列表模式，对齐 DemandListView.vue 写法）
 *
 * 覆盖功能点：发布申请（由需求作为原始发布驱动，形成发布申请单，确定本次升级修改内容、测试情况、发布时间、停机时间）、
 * 发布包管理（每次发布的安装都归档，可回滚到上一个版本）、发布管理（按批复要求在规定时间点升级并做业务验证）、
 * 发布撤回（升级后发现重大问题可回滚到上一个版本，排除故障后重新发布）、发布审计（事后审计确保每次升级闭环）。
 */
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDemoStore } from '@/stores/demo'
import { config } from '@/core/config'
import { NOW, by, fmtTime, fromNow, iso, nowStamp } from '@/core/utils'
import PageHead from '@/components/PageHead.vue'
import StatCards from '@/components/StatCards.vue'
import StatusTag from '@/components/StatusTag.vue'

const store = useDemoStore()
const router = useRouter()
const route = useRoute()

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'teal' | 'neutral'

/** 安全取数组（模板统一使用） */
const list = (v: unknown): any[] => (Array.isArray(v) ? v : [])

/* ------------------------------------------------------------ 筛选 -- */
type DictLike = Record<string, { label: string }>
/** 字典转下拉选项（显式标注参数类型，避免 config.dicts 类型推断变化带来的噪音） */
const dictOptions = (d: DictLike) => Object.entries(d).map(([value, o]) => ({ value, label: o.label }))

const f = reactive({ kw: '', status: '', applicant: '' })
const statusOptions = dictOptions(config.dicts.ReleaseStatus)

const allRows = computed(() => store.table('releases') as any[])
const demands = computed(() => store.table('demands') as any[])
const changes = computed(() => store.table('changes') as any[])

const filtered = computed(() => by(allRows.value.filter(r => {
  if (f.status && r.status !== f.status) return false
  if (f.applicant && r.applicant !== f.applicant) return false
  if (f.kw) {
    const hay = `${r.no} ${r.title} ${r.changeContent ?? ''} ${r.applicant ?? ''}`.toLowerCase()
    if (!hay.includes(f.kw.toLowerCase())) return false
  }
  return true
}), 'releaseAt', 'desc'))

const applicantOptions = computed(() => Array.from(new Set(allRows.value.map(r => r.applicant))).map(v => ({ value: v, label: v })))
function resetFilter() { Object.assign(f, { kw: '', status: '', applicant: '' }) }

/* ---------------------------------------------------------- 指标卡 -- */
const stats = computed(() => {
  const rows = allRows.value
  return [
    { label: '发布总数', value: rows.length, unit: '单', icon: 'Van', tone: 'primary' as Tone },
    { label: '申请中', value: rows.filter(r => r.status === 'APPLYING').length, unit: '单', icon: 'EditPen', tone: 'info' as Tone },
    { label: '已批复', value: rows.filter(r => r.status === 'APPROVED').length, unit: '单', icon: 'Check', tone: 'purple' as Tone, tip: '已批复待执行升级，需按批复要求在规定时间点执行' },
    { label: '验证中', value: rows.filter(r => r.status === 'VERIFYING' || r.status === 'RELEASED').length, unit: '单', icon: 'Search', tone: 'warning' as Tone },
    { label: '已闭环', value: rows.filter(r => r.status === 'CLOSED').length, unit: '单', icon: 'CircleCheck', tone: 'success' as Tone, tip: '业务验证通过且完成事后发布审计' },
    { label: '已回滚', value: rows.filter(r => r.status === 'ROLLED_BACK').length, unit: '单', icon: 'RefreshLeft', tone: 'danger' as Tone, tip: '升级后发现重大问题，已回滚到上一个版本' }
  ]
})

/* ------------------------------------------------------ 关联对象 -- */
const demandOf = (id: string) => demands.value.find(d => d.id === id)
const changeOf = (id: string) => changes.value.find(c => c.id === id)
/** 关联需求 / 变更明细（用于"关联需求与变更"弹窗） */
const relDemands = (ids: unknown) => list(ids).map(did => demandOf(String(did))).filter(Boolean)
const relChanges = (ids: unknown) => list(ids).map(cid => changeOf(String(cid))).filter(Boolean)

const relVisible = ref(false)
const relRowId = ref('')
const relRow = computed<any>(() => (relRowId.value ? store.findById('releases', relRowId.value) : null))
function openRelated(r: any) { relRowId.value = r.id; relVisible.value = true }

/* ---------------------------------------------------- 新建发布申请 -- */
const createVisible = ref(false)
const demandScope = ref<'delivered' | 'all'>('delivered')
const form = reactive({
  title: '', demandIds: [] as string[], changeIds: [] as string[], problemIds: [] as string[],
  changeContent: '', testResult: '', releaseAt: '', downtime: '', version: ''
})

/** 默认筛选出「已交付 / 评估完成」的需求，作为发布的原始驱动 */
const demandOptions = computed(() => {
  const allow = demandScope.value === 'delivered'
    ? ['DELIVERED', 'EVALUATED']
    : ['APPROVED', 'IMPLEMENTING', 'PENDING_ACCEPTANCE', 'DELIVERED', 'EVALUATED']
  return demands.value.filter(d => allow.includes(d.status))
})
const changeOptions = computed(() => changes.value.map(c => ({ value: c.id, label: `${c.no} ${c.title}`, demandNo: c.demandNo })))
/** 问题驱动：原文「由需求 / 问题驱动创建发布申请单」——已解决 / 已关闭的问题可作为发布来源 */
const problems = computed(() => store.table('problems') as any[])
const problemOptions = computed(() => problems.value.map(p => ({ value: p.id, label: `${p.no} ${p.title}` })))
const relProblems = (ids: unknown) => list(ids).map(pid => problems.value.find(p => p.id === pid)).filter(Boolean)

function applyDemands(ids: string[]) {
  const picked = ids.map(demandOf).filter(Boolean) as any[]
  const pickedProblems = form.problemIds.map(pid => problems.value.find(p => p.id === pid)).filter(Boolean) as any[]
  const lines = picked.map((d, i) => `${i + 1}、${d.title}（${d.no}）`)
  pickedProblems.forEach(p => lines.push(`${lines.length + 1}、由问题单 ${p.no} 驱动：${p.title}`))
  form.changeContent = lines.join('\n')
}
function onDemandChange() { applyDemands(form.demandIds) }
function onProblemChange() {
  applyDemands(form.demandIds)
  if (!form.title.trim() && form.problemIds.length) {
    const p = problems.value.find(x => x.id === form.problemIds[0])
    if (p) form.title = `问题 ${p.no} 根治版本发布`
  }
}

function resetForm() {
  Object.assign(form, { title: '', demandIds: [], changeIds: [], problemIds: [], changeContent: '', testResult: '', releaseAt: '', downtime: '', version: '' })
  demandScope.value = 'delivered'
}

/**
 * 从问题单详情「创建发布申请」跳转过来（/release/list?problem=xxx）时：
 * 自动打开新建弹窗并预选该问题，形成「问题 → 发布」的直达路径。
 * 同时监听 query 变化：已在发布管理页时再次带参跳入也能生效。
 */
function openFromProblemQuery() {
  const pid = String(route.query.problem ?? '')
  if (!pid) return
  const p = problems.value.find(x => x.id === pid || x.no === pid)
  resetForm()
  createVisible.value = true
  if (p) {
    form.problemIds = [p.id]
    form.title = `问题 ${p.no} 根治版本发布`
    form.changeContent = `由问题单 ${p.no} 驱动：${p.title}\n${p.rootCause ? `根因：${p.rootCause}` : ''}\n${p.solution ? `解决方案：${p.solution}` : ''}`.trim()
  }
}
onMounted(openFromProblemQuery)
watch(() => route.query.problem, () => openFromProblemQuery())

function nextNo(rows: any[]): string {
  const seq = String(rows.length + 1).padStart(3, '0')
  return `${config.prefixes.releases}${nowStamp()}${seq}`
}

function submitCreate() {
  if (!form.title.trim()) { ElMessage.warning('请填写发布标题'); return }
  if (!form.releaseAt) { ElMessage.warning('请选择发布时间'); return }
  const rows = allRows.value
  const rel = store.insert('releases', {
    no: nextNo(rows),
    title: form.title.trim(),
    demandIds: [...form.demandIds],
    changeIds: [...form.changeIds],
    problemIds: [...form.problemIds],
    changeContent: form.changeContent || '（待补充升级修改内容）',
    testResult: form.testResult || '测试情况待确认',
    releaseAt: form.releaseAt,
    downtime: form.downtime || '无（热更新）',
    status: 'APPLYING', applicant: store.user.name, approver: null, approvedAt: null,
    packages: form.version ? [{ version: form.version, archivedAt: iso(NOW), operator: store.user.name, remark: '申请时预归档发布包' }] : [],
    verifyItems: [
      { name: '发布内容与变更单一致性核对', result: '未执行' },
      { name: '核心接口调用成功率', result: '未执行' },
      { name: '订阅方数据完整性', result: '未执行' },
      { name: '既有功能回归', result: '未执行' }
    ],
    auditNote: '', auditedAt: null,
    timeline: []
  })
  store.pushTimeline(rel, {
    action: '提交发布申请',
    comment: `由 ${form.demandIds.length} 个需求、${form.changeIds.length} 个变更、${form.problemIds.length} 个问题驱动；计划发布时间 ${form.releaseAt}，停机时间 ${form.downtime || '无（热更新）'}`
  })
  store.notify({
    type: 'info', title: `发布申请 ${rel.no} 待批复`,
    body: `发布「${rel.title}」已提交，发布时间 ${form.releaseAt}，请数据资源管理人员审核批复。`,
    toRoles: ['ops', 'supplier', 'admin'], link: `/release/detail/${rel.id}`
  })
  ElMessage.success(`已提交发布申请 ${rel.no}，流转至「申请中」`)
  createVisible.value = false
  resetForm()
}

/* --------------------------------------------------------- 行操作 -- */
function approve(r: any) {
  ElMessageBox.prompt('请填写发布审批意见', `审批发布申请 ${r.no}`, {
    inputValue: `同意在 ${r.releaseAt} 窗口执行发布，请提前通知订阅方并准备回滚脚本。`,
    inputType: 'textarea', confirmButtonText: '批复通过'
  }).then(({ value }) => {
    store.update('releases', r.id, { status: 'APPROVED', approver: store.user.name, approvedAt: iso() }, { action: '发布审批批复', remark: value })
    store.pushTimeline(r, { action: '发布审批批复', comment: value })
    store.notify({ type: 'success', title: `发布单 ${r.no} 已批复`, body: value, toRoles: ['ops', 'producer'], link: `/release/detail/${r.id}` })
    ElMessage.success('已批复，可按批复要求在规定时间点执行升级')
  }).catch(() => { /* 取消 */ })
}

function execute(r: any) {
  ElMessageBox.prompt('请填写本次发布的版本号（发布包将自动归档，便于随时回滚）', `执行升级 ${r.no}`, {
    inputValue: list(r.packages)[0]?.version ?? 'v1.6.0', confirmButtonText: '确认执行升级'
  }).then(({ value }) => {
    const version = String(value || '').trim() || 'v1.6.0'
    const packs = [...list(r.packages), { version, archivedAt: iso(), operator: store.user.name, remark: '执行升级时自动归档' }]
    store.update('releases', r.id, { status: 'RELEASED', packages: packs, releasedAt: iso() }, { action: '执行升级', remark: `发布包 ${version} 部署完成，已归档` })
    store.pushTimeline(r, { action: '执行升级', comment: `发布包 ${version} 部署完成并归档，停机窗口 ${r.downtime}，进入业务验证` })
    store.notify({ type: 'success', title: `发布单 ${r.no} 已执行升级`, body: `版本 ${version} 已部署，请按批复要求逐项完成业务验证。`, toRoles: ['ops', 'desk'], link: `/release/detail/${r.id}` })
    ElMessage.success(`已执行升级（${version}），请进入详情页完成业务验证`)
  }).catch(() => { /* 取消 */ })
}

function actionsOf(r: any): { label: string; type?: string; run: () => void }[] {
  const out: { label: string; type?: string; run: () => void }[] = []
  if (r.status === 'APPLYING' && store.can('release.manage')) out.push({ label: '审批批复', type: 'primary', run: () => approve(r) })
  if (r.status === 'APPROVED' && store.can('release.manage')) out.push({ label: '执行升级', type: 'primary', run: () => execute(r) })
  if (['RELEASED', 'VERIFYING'].includes(r.status)) out.push({ label: '业务验证', type: 'primary', run: () => router.push(`/release/detail/${r.id}`) })
  if (r.status === 'ROLLED_BACK') out.push({ label: '重新发布', run: () => router.push(`/release/detail/${r.id}`) })
  out.push({ label: '详情', run: () => router.push(`/release/detail/${r.id}`) })
  return out
}

function exportList() { ElMessage.success(`已导出 ${filtered.value.length} 条发布单（导出文件已生成）`) }

/** 通过率（业务验证） */
function passRate(r: any): number {
  const items = list(r.verifyItems)
  if (!items.length) return 0
  return Math.round(items.filter(i => i.result === '通过').length / items.length * 100)
}
</script>

<template>
  <div>
    <PageHead title="发布管理" desc="全盘了解变更，适用于大型或关键硬件 / 主要软件 / 打包成批变更：提高发布成功率、降低业务中断率，降低使用非法 / 缺陷 / 未授权软件的几率。">
      <template #actions>
        <el-button @click="exportList"><el-icon><Download /></el-icon> 导出</el-button>
        <el-button type="primary" @click="resetForm(); createVisible = true"><el-icon><Plus /></el-icon> 新建发布申请</el-button>
      </template>
    </PageHead>

    <StatCards :items="stats" />

    <div class="card">
      <div class="toolbar">
        <div class="toolbar__fields">
          <div class="field"><span class="field__label">关键字</span>
            <el-input v-model="f.kw" placeholder="单号 / 标题 / 升级内容" clearable style="width: 220px" />
          </div>
          <div class="field"><span class="field__label">状态</span>
            <el-select v-model="f.status" placeholder="全部状态" clearable style="width: 140px">
              <el-option v-for="o in statusOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </div>
          <div class="field"><span class="field__label">申请人</span>
            <el-select v-model="f.applicant" placeholder="全部申请人" clearable style="width: 140px">
              <el-option v-for="o in applicantOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </div>
        </div>
        <div class="toolbar__actions">
          <el-button @click="resetFilter">重置</el-button>
        </div>
      </div>

      <el-table :data="filtered" style="width: 100%" row-key="id">
        <el-table-column label="发布单号" width="140">
          <template #default="{ row }">
            <el-button link type="primary" @click="router.push(`/release/detail/${row.id}`)">{{ row.no }}</el-button>
          </template>
        </el-table-column>
        <el-table-column label="发布标题" min-width="230" show-overflow-tooltip>
          <template #default="{ row }">
            <div class="cell-main">{{ row.title }}</div>
            <div class="cell-sub">{{ (row.changeContent || '').slice(0, 52) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="关联需求 / 变更 / 问题" width="190">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openRelated(row)">
              需求 {{ list(row.demandIds).length }} · 变更 {{ list(row.changeIds).length }} · 问题 {{ list(row.problemIds).length }}
            </el-button>
          </template>
        </el-table-column>
        <el-table-column label="发布时间" width="140">
          <template #default="{ row }">
            <div>{{ row.releaseAt ? fmtTime(row.releaseAt).slice(5, 16) : '—' }}</div>
            <div class="cell-sub">{{ row.releaseAt ? fromNow(row.releaseAt) : '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="停机时间" min-width="180" show-overflow-tooltip>
          <template #default="{ row }"><span class="text-sm">{{ row.downtime || '无（热更新）' }}</span></template>
        </el-table-column>
        <el-table-column label="业务验证" width="130">
          <template #default="{ row }">
            <el-progress :percentage="passRate(row)" :stroke-width="6" :show-text="false" :status="passRate(row) === 100 ? 'success' : undefined" />
            <span class="text-xs muted">通过率 {{ passRate(row) }}%（{{ list(row.verifyItems).length }} 项）</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="106">
          <template #default="{ row }"><StatusTag dict="ReleaseStatus" :value="row.status" /></template>
        </el-table-column>
        <el-table-column label="申请人" width="92">
          <template #default="{ row }">{{ row.applicant }}</template>
        </el-table-column>
        <el-table-column label="审批人" width="100">
          <template #default="{ row }">
            <div>{{ row.approver || '待批复' }}</div>
            <div class="cell-sub">{{ row.approvedAt ? fmtTime(row.approvedAt).slice(5, 16) : '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button
              v-for="(a, i) in actionsOf(row).slice(0, 1)" :key="i" link
              :type="a.type === 'primary' ? 'primary' : 'default'" size="small" @click.stop="a.run()"
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
            <div class="empty-box__text">没有符合条件的发布单</div>
          </div>
        </template>
      </el-table>

      <div class="card__foot">
        <span class="text-sm muted">共 <b>{{ filtered.length }}</b> 条发布单</span>
      </div>
    </div>

    <!-- --------------------------------------------- 新建发布申请弹窗 -- -->
    <el-dialog v-model="createVisible" title="新建发布申请（由需求 / 问题驱动）" width="780px" top="5vh">
      <el-form label-width="120px">
        <el-form-item label="需求驱动">
          <div style="width: 100%">
            <el-radio-group v-model="demandScope" size="small" class="mb-2" @change="form.demandIds = []">
              <el-radio-button value="delivered">已交付 / 评估完成</el-radio-button>
              <el-radio-button value="all">全部需求</el-radio-button>
            </el-radio-group>
            <el-select
              v-model="form.demandIds" multiple filterable collapse-tags collapse-tags-tooltip
              placeholder="选择本次发布承接的需求单（发布以需求为原始驱动）" style="width: 100%" @change="onDemandChange"
            >
              <el-option v-for="d in demandOptions" :key="d.id" :label="`${d.no} ${d.title}`" :value="d.id">
                <span>{{ d.no }}</span>
                <span class="muted text-xs" style="margin-left: 8px">{{ d.title }}</span>
              </el-option>
            </el-select>
            <div class="text-xs muted mt-1">默认仅显示「已交付 / 已评价」的需求；选中后自动汇总到「升级修改内容」，可手工调整。</div>
          </div>
        </el-form-item>

        <el-form-item label="关联变更单">
          <el-select v-model="form.changeIds" multiple filterable collapse-tags collapse-tags-tooltip placeholder="可选：本次发布包含的变更单" style="width: 100%">
            <el-option v-for="c in changeOptions" :key="c.value" :label="c.label" :value="c.value" />
          </el-select>
        </el-form-item>

        <el-form-item label="问题驱动">
          <el-select
            v-model="form.problemIds" multiple filterable collapse-tags collapse-tags-tooltip
            placeholder="可选：由问题单驱动本次发布（问题 → 根因 → 发布根治版本）" style="width: 100%"
            @change="onProblemChange"
          >
            <el-option v-for="p in problemOptions" :key="p.value" :label="p.label" :value="p.value" />
          </el-select>
          <div class="text-xs muted mt-1">选中后会把「由问题单 xxx 驱动」汇入升级修改内容；也可在问题单详情点「创建发布申请」直接带入。</div>
        </el-form-item>

        <el-form-item label="发布标题" required>
          <el-input v-model="form.title" placeholder="如：数据服务管理工具 v1.6.0 版本发布" />
        </el-form-item>
        <el-form-item label="升级修改内容">
          <el-input v-model="form.changeContent" type="textarea" :rows="4" placeholder="本次升级修改的具体内容（选择需求后自动带出）" />
        </el-form-item>
        <el-form-item label="测试情况">
          <el-input v-model="form.testResult" type="textarea" :rows="3" placeholder="回归用例、性能压测、联调结论等" />
        </el-form-item>
        <el-form-item label="发布时间" required>
          <el-date-picker v-model="form.releaseAt" type="datetime" value-format="YYYY-MM-DD HH:mm" format="YYYY-MM-DD HH:mm" placeholder="选择计划发布时间" />
        </el-form-item>
        <el-form-item label="停机时间">
          <el-input v-model="form.downtime" placeholder="如：2026-09-03 22:00-23:00（预计 60 分钟）；无停机填「无（热更新）」" />
        </el-form-item>
        <el-form-item label="发布包版本号">
          <el-input v-model="form.version" placeholder="如：v1.6.0（申请时预归档发布包，可后续在详情页回滚）" style="width: 260px" />
        </el-form-item>
      </el-form>

      <div class="text-xs muted">
        发布申请需经数据资源管理人员批复后方可执行；停机窗口与业务验证项清单以批复要求为准。
      </div>

      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" @click="submitCreate">提交发布申请</el-button>
      </template>
    </el-dialog>

    <!-- --------------------------------------------- 关联需求与变更 -- -->
    <el-dialog v-model="relVisible" :title="relRow ? `发布单 ${relRow.no} · 关联需求与变更` : '关联需求与变更'" width="680px">
      <template v-if="relRow">
        <div class="bold text-sm mb-2">关联需求（{{ list(relRow.demandIds).length }}）</div>
        <el-table :data="relDemands(relRow.demandIds)" size="small" class="mb-3">
          <el-table-column label="需求单号" width="140">
            <template #default="{ row }">
              <el-button link type="primary" @click="router.push(`/demand/detail/${row.id}`)">{{ row.no }}</el-button>
            </template>
          </el-table-column>
          <el-table-column prop="title" label="需求名称" min-width="220" show-overflow-tooltip />
          <el-table-column label="状态" width="110">
            <template #default="{ row }"><StatusTag dict="DemandStatus" :value="row.status" /></template>
          </el-table-column>
          <template #empty><div class="empty-box"><div class="empty-box__text">本次发布未直接关联需求</div></div></template>
        </el-table>

        <div class="bold text-sm mb-2">关联变更（{{ list(relRow.changeIds).length }}）</div>
        <el-table :data="relChanges(relRow.changeIds)" size="small">
          <el-table-column label="变更单号" width="140">
            <template #default="{ row }">
              <el-button link type="primary" @click="router.push('/change/list')">{{ row.no }}</el-button>
            </template>
          </el-table-column>
          <el-table-column prop="title" label="变更名称" min-width="220" show-overflow-tooltip />
          <el-table-column label="状态" width="110">
            <template #default="{ row }"><StatusTag dict="ChangeStatus" :value="row.status" /></template>
          </el-table-column>
          <template #empty><div class="empty-box"><div class="empty-box__text">本次发布未关联变更单</div></div></template>
        </el-table>

        <div class="bold text-sm mb-2 mt-3">驱动本次发布的问题（{{ list(relRow.problemIds).length }}）</div>
        <el-table :data="relProblems(relRow.problemIds)" size="small">
          <el-table-column label="问题单号" width="140">
            <template #default="{ row }">
              <el-button link type="primary" @click="router.push(`/problem/detail/${row.id}`)">{{ row.no }}</el-button>
            </template>
          </el-table-column>
          <el-table-column prop="title" label="问题标题" min-width="220" show-overflow-tooltip />
          <el-table-column label="状态" width="110">
            <template #default="{ row }"><StatusTag dict="ProblemStatus" :value="row.status" /></template>
          </el-table-column>
          <template #empty><div class="empty-box"><div class="empty-box__text">本次发布不是由问题单驱动</div></div></template>
        </el-table>
      </template>
      <template #footer>
        <el-button type="primary" @click="relVisible = false">关闭</el-button>
      </template>
    </el-dialog>
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
</style>
