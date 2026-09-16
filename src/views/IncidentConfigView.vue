<script setup lang="ts">
/**
 * IncidentConfigView —— 事件分类与模板配置
 *
 * 覆盖功能点：
 *  · "预先定义事件分类（严重等级 / 影响程度 / 紧急程度分类与优先级）"
 *  · "事件模板定义"
 *  · 事件派发："按分类自动分派或手工分派"（分类上维护自动分派目标）
 */
import { computed, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDemoStore } from '@/stores/demo'
import { config } from '@/core/config'
import { arr, countBy, demoUid } from '@/core/utils'
import PageHead from '@/components/PageHead.vue'
import StatusTag from '@/components/StatusTag.vue'
import ChartBox from '@/components/ChartBox.vue'

const store = useDemoStore()

/** 安全数组访问：把 store 中的宽松字段收敛为可遍历数组（等价于 arr 的显式类型版本） */
const listOf = (v: unknown): any[] => (Array.isArray(v) ? v : [])

const categories = computed(() => store.table('incidentCategories') as any[])
const templates = computed(() => store.table('incidentTemplates') as any[])
const incidents = computed(() => store.table('incidents') as any[])

/* ==================================================== 事件分类管理 == */
const catKw = ref('')
const catGroup = ref('')

const groupList = computed(() => Array.from(new Set(categories.value.map(c => c.group))))
const groupOptions = ['数据服务', '数据质量', '平台功能', '安全与权限', '其他']

const catRows = computed(() =>
  categories.value.filter(c => {
    if (catGroup.value && c.group !== catGroup.value) return false
    if (catKw.value) {
      const hay = `${c.name} ${c.group} ${c.autoAssign} ${listOf(c.keywords).join(' ')}`.toLowerCase()
      if (!hay.includes(catKw.value.toLowerCase())) return false
    }
    return true
  })
)

/** 该分类下的事件数量 */
const countOfCat = (id: string) => incidents.value.filter(i => i.categoryId === id).length

/** 分类分布图 */
const catChart = computed(() => {
  const m = countBy(incidents.value, 'categoryName')
  return categories.value.map(c => ({ name: c.name, value: m[c.name] ?? 0 }))
})

const catDialog = ref(false)
const catEditId = ref('')
const catForm = reactive<any>({ name: '', group: '数据服务', autoAssign: '运维中心 · 一线支持组', keywords: [] as string[] })

function openCatCreate() {
  if (!store.can('incident.category.config')) { ElMessage.warning('当前角色无「事件分类与模板配置」权限'); return }
  catEditId.value = ''
  Object.assign(catForm, { name: '', group: '数据服务', autoAssign: '运维中心 · 一线支持组', keywords: [] })
  catDialog.value = true
}

function openCatEdit(c: any) {
  if (!store.can('incident.category.config')) { ElMessage.warning('当前角色无「事件分类与模板配置」权限'); return }
  catEditId.value = c.id
  Object.assign(catForm, { name: c.name, group: c.group, autoAssign: c.autoAssign, keywords: [...listOf(c.keywords)] })
  catDialog.value = true
}

function saveCat() {
  if (!catForm.name) { ElMessage.warning('请填写分类名称'); return }
  if (!catForm.autoAssign) { ElMessage.warning('请填写自动分派目标（处理组）'); return }
  if (!catForm.keywords.length) { ElMessage.warning('请至少录入一个关键字（用于录入时自动匹配分类与知识库）'); return }
  if (catEditId.value) {
    store.update('incidentCategories', catEditId.value, {
      name: catForm.name, group: catForm.group, autoAssign: catForm.autoAssign, keywords: [...catForm.keywords]
    }, { action: '编辑事件分类', remark: `关键字 ${catForm.keywords.length} 个，自动分派至 ${catForm.autoAssign}` })
    ElMessage.success('事件分类已更新')
  } else {
    store.insert('incidentCategories', {
      id: demoUid('ic'),
      name: catForm.name, group: catForm.group, autoAssign: catForm.autoAssign, keywords: [...catForm.keywords]
    })
    store.addAudit({
      bizType: 'incidentCategories', bizId: catForm.name, bizNo: '—', bizTitle: catForm.name,
      action: '新增事件分类',
      changes: [{ field: 'autoAssign', before: '（空）', after: catForm.autoAssign }],
      remark: `预定义分类关键字 ${catForm.keywords.join('、')}`
    })
    ElMessage.success('事件分类已新增，录入事件时即可按关键字自动匹配')
  }
  catDialog.value = false
}

async function removeCat(c: any) {
  if (!store.can('incident.category.config')) { ElMessage.warning('当前角色无配置权限'); return }
  const used = countOfCat(c.id)
  try {
    await ElMessageBox.confirm(
      used ? `分类「${c.name}」已被 ${used} 条事件引用，删除后这些事件将保留原分类名称但不再自动分派，是否继续？` : `确认删除分类「${c.name}」？`,
      '删除事件分类', { confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning' }
    )
  } catch { return }
  store.remove('incidentCategories', c.id, { bizType: 'incidentCategories', remark: `删除分类 ${c.name}` })
  ElMessage.success('已删除该事件分类')
}

/* ================================================= 字典与优先级矩阵 == */
const levelDicts = computed(() => [
  { title: '严重等级（Severity）', dict: 'Severity', desc: '描述事件本身对业务的损害程度' },
  { title: '影响程度（Impact）', dict: 'Impact', desc: '描述受影响的范围' },
  { title: '紧急程度（Urgency）', dict: 'Urgency', desc: '描述期望的响应速度' }
])

/** 影响程度 × 紧急程度推导优先级 */
const impactList = ['严重影响业务', '部分功能受影响', '轻微影响']
const urgencyList = ['紧急', '较急', '一般']
const PRIORITY_MATRIX: Record<string, Record<string, string>> = {
  '严重影响业务': { 紧急: 'P0', 较急: 'P1', 一般: 'P1' },
  '部分功能受影响': { 紧急: 'P1', 较急: 'P2', 一般: 'P2' },
  '轻微影响': { 紧急: 'P2', 较急: 'P3', 一般: 'P3' }
}
const matrixCell = (impact: string, urgency: string) => PRIORITY_MATRIX[impact][urgency]

/** 矩阵中每个优先级对应的事件数（用于说明矩阵的实际命中情况） */
const matrixHit = computed(() => {
  const m = countBy(incidents.value, i => `${i.impact}|${i.urgency}`)
  return (impact: string, urgency: string) => m[`${impact}|${urgency}`] ?? 0
})

/* ==================================================== 事件模板管理 == */
const tplKw = ref('')
const tplRows = computed(() =>
  templates.value.filter(t => {
    if (!tplKw.value) return true
    const hay = `${t.name} ${t.title} ${t.desc}`.toLowerCase()
    return hay.includes(tplKw.value.toLowerCase())
  })
)

const tplDialog = ref(false)
const tplEditId = ref('')
const tplForm = reactive<any>({
  name: '', categoryId: 'ic01', severity: '中',
  impact: '部分功能受影响', urgency: '较急', title: '', desc: ''
})

/** 字典转下拉选项 */
const severityOptions = Object.entries(config.dicts.Severity as Record<string, any>).map(([v, o]) => ({ value: v, label: o.label }))

function openTplCreate() {
  if (!store.can('incident.category.config')) { ElMessage.warning('当前角色无事件模板配置权限'); return }
  tplEditId.value = ''
  Object.assign(tplForm, {
    name: '', categoryId: categories.value[0]?.id ?? 'ic01', severity: '中',
    impact: '部分功能受影响', urgency: '较急', title: '', desc: ''
  })
  tplDialog.value = true
}

function openTplEdit(t: any) {
  if (!store.can('incident.category.config')) { ElMessage.warning('当前角色无事件模板配置权限'); return }
  tplEditId.value = t.id
  Object.assign(tplForm, {
    name: t.name, categoryId: t.categoryId, severity: t.severity,
    impact: t.impact, urgency: t.urgency, title: t.title, desc: t.desc
  })
  tplDialog.value = true
}

function saveTpl() {
  if (!tplForm.name) { ElMessage.warning('请填写模板名称'); return }
  if (!tplForm.title) { ElMessage.warning('请填写标题模板'); return }
  if (!tplForm.desc) { ElMessage.warning('请填写描述模板'); return }
  if (tplEditId.value) {
    store.update('incidentTemplates', tplEditId.value, {
      name: tplForm.name, categoryId: tplForm.categoryId, severity: tplForm.severity,
      impact: tplForm.impact, urgency: tplForm.urgency, title: tplForm.title, desc: tplForm.desc
    }, { action: '编辑事件模板', remark: `模板 ${tplForm.name}` })
    ElMessage.success('事件模板已更新')
  } else {
    store.insert('incidentTemplates', {
      id: demoUid('it'),
      name: tplForm.name, categoryId: tplForm.categoryId, severity: tplForm.severity,
      impact: tplForm.impact, urgency: tplForm.urgency, title: tplForm.title, desc: tplForm.desc
    })
    store.addAudit({
      bizType: 'incidentTemplates', bizId: tplForm.name, bizNo: '—', bizTitle: tplForm.name,
      action: '新增事件模板',
      changes: [{ field: 'severity', before: '（空）', after: tplForm.severity }],
      remark: '预定义事件模板，录入事件时可一键套用'
    })
    ElMessage.success('事件模板已新增，录入事件时可直接套用')
  }
  tplDialog.value = false
}

async function removeTpl(t: any) {
  if (!store.can('incident.category.config')) { ElMessage.warning('当前角色无配置权限'); return }
  try {
    await ElMessageBox.confirm(`确认删除事件模板「${t.name}」？`, '删除事件模板', {
      confirmButtonText: '确认删除', cancelButtonText: '取消', type: 'warning'
    })
  } catch { return }
  store.remove('incidentTemplates', t.id, { bizType: 'incidentTemplates', remark: `删除模板 ${t.name}` })
  ElMessage.success('已删除该事件模板')
}

const catNameOf = (id: string) => categories.value.find(c => c.id === id)?.name ?? '—'

/**
 * 分类与模板的配置权限（incident.category.config，当前仅平台管理员）。
 * 无权限的角色仍可进入本页查看分类树 / 优先级规则（服务台核对分类要用），
 * 但所有写操作按钮置灰——不再是「按钮能点、点了才报无权限」。
 */
const canConfig = computed(() => store.can('incident.category.config'))
</script>

<template>
  <div>
    <PageHead
      title="事件分类与模板配置"
      desc="预先定义事件分类（含自动分派目标与匹配关键字）、严重等级 / 影响程度 / 紧急程度字典与优先级规则，并维护事件模板。"
    >
      <template #actions>
        <el-button :disabled="!canConfig" @click="openTplCreate"><el-icon><Plus /></el-icon> 新增模板</el-button>
        <el-button type="primary" :disabled="!canConfig" @click="openCatCreate"><el-icon><Plus /></el-icon> 新增分类</el-button>
      </template>
    </PageHead>

    <el-alert
      v-if="!canConfig"
      class="mb-4"
      type="info"
      show-icon
      :closable="false"
      title="查看态：当前角色无「事件分类与模板配置」权限，分类与模板的新增 / 编辑 / 删除已置灰；如需配置请切换为平台管理员。"
    />

    <!-- ================================================== 事件分类管理 == -->
    <div class="card">
      <div class="card__head">
        <div class="card__title">事件分类管理</div>
        <div class="card__sub">共 {{ categories.length }} 类 · 关键字用于事件录入时自动匹配分类与知识条目</div>
        <span class="card__spacer" />
        <el-input v-model="catKw" placeholder="分类 / 关键字 / 处理组" clearable style="width: 220px" />
        <el-select v-model="catGroup" placeholder="全部分组" clearable style="width: 140px">
          <el-option v-for="g in groupList" :key="g" :label="g" :value="g" />
        </el-select>
      </div>
      <div class="card__body card__body--flush">
        <el-table :data="catRows" style="width: 100%" row-key="id">
          <el-table-column prop="name" label="分类名称" width="190">
            <template #default="{ row }">
              <div class="bold">{{ row.name }}</div>
              <div class="cell-sub">该分类事件 {{ countOfCat(row.id) }} 条</div>
            </template>
          </el-table-column>
          <el-table-column label="所属分组" width="120">
            <template #default="{ row }"><StatusTag :label="row.group" tone="info" :dot="false" /></template>
          </el-table-column>
          <el-table-column prop="autoAssign" label="自动分派目标（处理组）" min-width="200" show-overflow-tooltip />
          <el-table-column label="匹配关键字" min-width="330">
            <template #default="{ row }">
              <el-tag v-for="k in listOf(row.keywords)" :key="k" size="small" effect="plain" class="mr-1">{{ k }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="130" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" :disabled="!canConfig" @click="openCatEdit(row)">编辑</el-button>
              <el-button link type="danger" size="small" :disabled="!canConfig" @click="removeCat(row)">删除</el-button>
            </template>
          </el-table-column>
          <template #empty>
            <div class="empty-box">
              <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
              <div class="empty-box__text">没有符合条件的事件分类</div>
            </div>
          </template>
        </el-table>
      </div>
    </div>

    <!-- ============================== 字典 + 优先级矩阵 + 分类分布 == -->
    <div class="grid grid--side mt-4">
      <div>
        <div class="card mb-4">
          <div class="card__head">
            <div class="card__title">影响程度 × 紧急程度推导优先级</div>
            <div class="card__sub">事件录入时按该矩阵自动推导优先级</div>
          </div>
          <div class="card__body">
            <table class="matrix">
              <thead>
                <tr>
                  <th>影响程度 \ 紧急程度</th>
                  <th v-for="u in urgencyList" :key="u">{{ u }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="im in impactList" :key="im">
                  <td class="bold">{{ im }}</td>
                  <td v-for="u in urgencyList" :key="u">
                    <StatusTag dict="Priority" :value="matrixCell(im, u)" :dot="false" />
                    <div class="text-xs muted">命中 {{ matrixHit(im, u) }} 条</div>
                  </td>
                </tr>
              </tbody>
            </table>
            <div class="text-xs muted mt-3">
              SLA 响应时限：P0 4 小时 / P1 8 小时 / P2 24 小时 / P3 48 小时，事件录入时按优先级自动计算 SLA 截止时间。
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card__head">
            <div class="card__title">等级字典</div>
            <div class="card__sub">严重等级 / 影响程度 / 紧急程度</div>
          </div>
          <div class="card__body">
            <div class="grid grid--3">
              <div v-for="d in levelDicts" :key="d.dict">
                <div class="bold text-sm mb-2">{{ d.title }}</div>
                <div class="text-xs muted mb-2">{{ d.desc }}</div>
                <template v-if="d.dict === 'Severity'">
                  <div v-for="(v, k) in config.dicts.Severity" :key="k" class="dict-row">
                    <StatusTag dict="Severity" :value="String(k)" />
                    <span class="text-xs muted">{{ incidents.filter((i: any) => i.severity === String(k)).length }} 条事件</span>
                  </div>
                </template>
                <template v-else-if="d.dict === 'Impact'">
                  <div v-for="im in impactList" :key="im" class="dict-row">
                    <span class="text-sm">{{ im }}</span>
                    <span class="text-xs muted">{{ incidents.filter((i: any) => i.impact === im).length }} 条事件</span>
                  </div>
                </template>
                <template v-else>
                  <div v-for="u in urgencyList" :key="u" class="dict-row">
                    <span class="text-sm">{{ u }}</span>
                    <span class="text-xs muted">{{ incidents.filter((i: any) => i.urgency === u).length }} 条事件</span>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card__head">
          <div class="card__title">分类事件分布</div>
          <div class="card__sub">用于评估分类定义是否贴合实际</div>
        </div>
        <div class="card__body">
          <ChartBox kind="hbar" :data="catChart" />
          <div class="text-xs muted mt-3">分类过粗会导致自动分派不准，过细则维护成本高；建议按「处理组」维度保持 5–10 个分类。</div>
        </div>
      </div>
    </div>

    <!-- ================================================== 事件模板管理 == -->
    <div class="card mt-4">
      <div class="card__head">
        <div class="card__title">事件模板管理</div>
        <div class="card__sub">共 {{ templates.length }} 个模板 · 录入事件时可一键套用，自动填充标题 / 描述 / 分类 / 等级</div>
        <span class="card__spacer" />
        <el-input v-model="tplKw" placeholder="模板名称 / 标题 / 描述" clearable style="width: 220px" />
      </div>
      <div class="card__body card__body--flush">
        <el-table :data="tplRows" style="width: 100%" row-key="id">
          <el-table-column prop="name" label="模板名称" width="180" />
          <el-table-column label="适用分类" width="160">
            <template #default="{ row }">{{ catNameOf(row.categoryId) }}</template>
          </el-table-column>
          <el-table-column label="默认严重等级" width="110">
            <template #default="{ row }"><StatusTag dict="Severity" :value="row.severity" /></template>
          </el-table-column>
          <el-table-column label="默认影响程度" width="130">
            <template #default="{ row }">{{ row.impact }}</template>
          </el-table-column>
          <el-table-column label="默认紧急程度" width="110">
            <template #default="{ row }">{{ row.urgency }}</template>
          </el-table-column>
          <el-table-column label="标题模板" min-width="220" show-overflow-tooltip>
            <template #default="{ row }"><span class="mono text-sm">{{ row.title }}</span></template>
          </el-table-column>
          <el-table-column label="描述模板" min-width="240">
            <template #default="{ row }"><span class="text-sm muted">{{ String(row.desc).replace(/\n/g, ' / ') }}</span></template>
          </el-table-column>
          <el-table-column label="操作" width="130" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" size="small" :disabled="!canConfig" @click="openTplEdit(row)">编辑</el-button>
              <el-button link type="danger" size="small" :disabled="!canConfig" @click="removeTpl(row)">删除</el-button>
            </template>
          </el-table-column>
          <template #empty>
            <div class="empty-box">
              <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
              <div class="empty-box__text">没有符合条件的事件模板</div>
            </div>
          </template>
        </el-table>
      </div>
    </div>

    <!-- ==================================================== 分类弹窗 == -->
    <el-dialog v-model="catDialog" :title="catEditId ? '编辑事件分类' : '新增事件分类'" width="620px">
      <el-form label-width="120px">
        <el-form-item label="分类名称"><el-input v-model="catForm.name" placeholder="如：数据服务接口异常" /></el-form-item>
        <el-form-item label="所属分组">
          <el-select v-model="catForm.group" filterable allow-create default-first-option style="width: 100%">
            <el-option v-for="g in groupOptions" :key="g" :label="g" :value="g" />
          </el-select>
        </el-form-item>
        <el-form-item label="自动分派目标">
          <el-input v-model="catForm.autoAssign" placeholder="如：运维中心 · 二线支持组" />
        </el-form-item>
        <el-form-item label="匹配关键字">
          <el-select v-model="catForm.keywords" multiple filterable allow-create default-first-option placeholder="输入关键字后回车添加" style="width: 100%">
            <el-option v-for="k in ['接口', 'API', '报错', '超时', '延迟', '缺失', '性能', '权限', '脱敏']" :key="k" :label="k" :value="k" />
          </el-select>
        </el-form-item>
      </el-form>
      <div class="text-xs muted">
        关键字同时用于两处：事件录入时按关键字自动匹配分类与自动分派组；与知识库条目做关键字关联推荐。
      </div>
      <template #footer>
        <el-button @click="catDialog = false">取消</el-button>
        <el-button type="primary" @click="saveCat">保存</el-button>
      </template>
    </el-dialog>

    <!-- ==================================================== 模板弹窗 == -->
    <el-dialog v-model="tplDialog" :title="tplEditId ? '编辑事件模板' : '新增事件模板'" width="700px">
      <el-form label-width="120px">
        <el-form-item label="模板名称"><el-input v-model="tplForm.name" placeholder="如：API 接口调用失败" /></el-form-item>
        <el-form-item label="适用分类">
          <el-select v-model="tplForm.categoryId" style="width: 100%">
            <el-option v-for="c in categories" :key="c.id" :label="`${c.name}（${c.group}）`" :value="c.id" />
          </el-select>
        </el-form-item>
        <div class="grid grid--3">
          <el-form-item label="严重等级" label-width="88px">
            <el-select v-model="tplForm.severity" style="width: 100%">
              <el-option v-for="o in severityOptions" :key="o.value" :label="o.label" :value="o.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="影响程度" label-width="88px">
            <el-select v-model="tplForm.impact" style="width: 100%">
              <el-option v-for="o in impactList" :key="o" :label="o" :value="o" />
            </el-select>
          </el-form-item>
          <el-form-item label="紧急程度" label-width="88px">
            <el-select v-model="tplForm.urgency" style="width: 100%">
              <el-option v-for="o in urgencyList" :key="o" :label="o" :value="o" />
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="标题模板"><el-input v-model="tplForm.title" placeholder="如：【接口异常】xxx 服务调用返回异常" /></el-form-item>
        <el-form-item label="描述模板">
          <el-input v-model="tplForm.desc" type="textarea" :rows="6" placeholder="支持多行，可预置需要申报人补充的字段，如：&#10;服务名称：&#10;调用时间：&#10;错误码：" />
        </el-form-item>
        <el-form-item label="推导优先级">
          <StatusTag dict="Priority" :value="matrixCell(tplForm.impact, tplForm.urgency)" :dot="false" />
          <span class="text-xs muted" style="margin-left: 8px">按影响程度 × 紧急程度矩阵推导</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="tplDialog = false">取消</el-button>
        <el-button type="primary" @click="saveTpl">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.cell-sub { font-size: var(--fs-xs); color: var(--text-3); margin-top: 2px; }
.mr-1 { margin-right: var(--sp-1); }
.dict-row { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); padding: 5px 0; border-bottom: 1px dashed var(--border-2); }
.dict-row:last-child { border-bottom: none; }
.card__head { gap: var(--sp-3); flex-wrap: wrap; }
</style>
