<script setup lang="ts">
/**
 * AuditView —— 审计中心（公共支撑 S2）
 *
 * 统一承载建设方案中 4 处审计要求：
 *  · 变更审计（2.7）：记录数据变化前后的修改人、时间，保证数据安全。
 *  · 事件审计（4.8）：同上。
 *  · 问题审计（5.7）：同上。
 *  · 发布审计（6.5）：对发布项进行事后审计，确保每次升级闭环。
 *
 * 页面能力：字段级"变更前 → 变更后"对比、操作人 / 时间 / 来源 IP / 终端留痕、
 * 多条件检索与导出。本页**只读**：留痕由各业务单据的真实写操作自动写入，
 * 审计中心不提供写操作入口。
 */
import { computed, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useDemoStore } from '@/stores/demo'
import { addDays, by, fmtDate, fmtTime, fromNow, today, truncate } from '@/core/utils'
import PageHead from '@/components/PageHead.vue'
import StatCards from '@/components/StatCards.vue'
import StatusTag from '@/components/StatusTag.vue'

const store = useDemoStore()
const router = useRouter()

/** 安全数组（单据数据为宽松结构，统一收敛为 any[]，便于模板中安全访问） */
const arrAny = (v: unknown): any[] => (Array.isArray(v) ? v : [])

/* ==================================================== 单据类型映射 -- */
const BIZ_TYPES: { value: string; label: string; route?: (id: string) => string }[] = [
  { value: 'demands', label: '需求单', route: id => `/demand/detail/${id}` },
  { value: 'changes', label: '变更单', route: id => `/change/detail/${id}` },
  { value: 'tasks', label: '任务单', route: id => `/task/detail/${id}` },
  { value: 'incidents', label: '事件单', route: id => `/incident/detail/${id}` },
  { value: 'problems', label: '问题单', route: id => `/problem/detail/${id}` },
  { value: 'releases', label: '发布单', route: id => `/release/detail/${id}` },
  { value: 'knowledges', label: '知识条目', route: id => `/kb/detail/${id}` },
  { value: 'subscriptions', label: '订阅单', route: id => `/delivery/detail/${id}` },
  { value: 'evaluations', label: '评价单', route: id => `/evaluation/detail/${id}` },
  { value: 'tenants', label: '租户' },
  /* 以下表同样会产生审计留痕（无独立详情页，仅用于「单据类型」列与筛选下拉的正确显示） */
  { value: 'workflows', label: '审批流程' },
  { value: 'catalogItems', label: '服务目录项' },
  { value: 'services', label: '服务产品' },
  { value: 'incidentCategories', label: '事件分类配置' },
  { value: 'incidentTemplates', label: '事件模板' },
  { value: 'qnas', label: '知识问答' },
  { value: 'capabilityApplies', label: '能力申请' },
  { value: 'tenantRegs', label: '租户注册申请' },
  { value: 'broadcasts', label: '广播记录' },
  { value: 'callbacks', label: '回访记录' },
  { value: 'deployRecords', label: '部署记录' }
]
const bizLabel = (t: string) => BIZ_TYPES.find(b => b.value === t)?.label ?? t
const bizRoute = (t: string, id: string) => BIZ_TYPES.find(b => b.value === t)?.route?.(id)
function openBiz(row: any) {
  const r = bizRoute(row.bizType, row.bizId)
  if (r) router.push(r)
  else ElMessage.info(`「${bizLabel(row.bizType)}」暂无详情页（单号 ${row.bizNo}）`)
}

/* ======================================================== 数据 -- */
const allAudits = computed(() => by(store.table('audits') as any[], 'operatedAt', 'desc'))
const auditKey = (a: any, i: number) => a.id ?? `${a.bizType}-${a.bizNo}-${a.operatedAt}-${a.action}-${i}`

const stats = computed(() => {
  const rows = allAudits.value
  const todayStr = today()
  const operators = new Set(rows.map(r => r.operator))
  const types = new Set(rows.map(r => r.bizType))
  const fieldChanges = rows.reduce((s, r) => s + arrAny(r.changes).length, 0)
  return [
    { label: '审计记录总数', value: rows.length, unit: '条', icon: 'DataAnalysis', tone: 'primary' as const, delta: `字段级变更 ${fieldChanges} 项` },
    { label: '今日新增', value: rows.filter(r => String(r.operatedAt ?? '').startsWith(todayStr)).length, unit: '条', icon: 'Clock', tone: 'success' as const, delta: `基准日期 ${todayStr}` },
    { label: '涉及单据类型', value: types.size, unit: '类', icon: 'FolderOpened', tone: 'purple' as const, delta: '需求/变更/任务/事件/问题/发布…' },
    { label: '操作人数', value: operators.size, unit: '人', icon: 'User', tone: 'teal' as const }
  ]
})

/* ======================================================== 筛选 -- */
const f = reactive({ bizType: '', operator: '', action: '', kw: '', range: [fmtDate(addDays(today(), -365)), today()] as string[] })

const operatorOptions = computed(() => Array.from(new Set(allAudits.value.map(r => r.operator))))
const actionOptions = computed(() => Array.from(new Set(allAudits.value.map(r => r.action))))

const filtered = computed(() => {
  const [s, e] = f.range ?? ['', '']
  return allAudits.value.filter(r => {
    if (f.bizType && r.bizType !== f.bizType) return false
    if (f.operator && r.operator !== f.operator) return false
    if (f.action && r.action !== f.action) return false
    if (s && e) {
      const d = fmtDate(r.operatedAt)
      if (d !== '—' && (d < s || d > e)) return false
    }
    if (f.kw) {
      const hay = `${r.bizNo} ${r.bizTitle} ${r.operator} ${r.action} ${r.remark}`.toLowerCase()
      if (!hay.includes(f.kw.toLowerCase())) return false
    }
    return true
  })
})

function resetFilter() {
  f.bizType = ''
  f.operator = ''
  f.action = ''
  f.kw = ''
  f.range = [fmtDate(addDays(today(), -365)), today()]
}

/* ======================================================== 导出 -- */
function exportAudits() {
  try {
    const rows: (string | number)[][] = [
      ['时间', '单据类型', '单号', '标题', '动作', '操作人', '操作组织', '来源 IP', '终端', '字段变更', '备注']
    ]
    filtered.value.forEach(a => rows.push([
      a.operatedAt, bizLabel(a.bizType), a.bizNo, a.bizTitle, a.action, a.operator, a.operatorOrg, a.ip, a.terminal,
      arrAny(a.changes).map((c: any) => `${c.field}: ${c.before} → ${c.after}`).join(' | '), a.remark
    ]))
    const csv = '\ufeff' + rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const el = document.createElement('a')
    el.href = URL.createObjectURL(blob)
    el.download = `审计中心_${today()}.csv`
    el.click()
    setTimeout(() => URL.revokeObjectURL(el.href), 1000)
    ElMessage.success(`已导出 ${filtered.value.length} 条审计记录`)
  } catch {
    ElMessage.warning('当前浏览器限制了文件下载，导出未能完成')
  }
}
</script>

<template>
  <div>
    <PageHead
      title="审计中心"
      desc="记录任意单据字段级的数据变化前后值、修改人与时间，保证数据安全性；统一承载变更审计、事件审计、问题审计、发布审计四类要求。"
    >
      <template #actions>
        <el-button @click="exportAudits"><el-icon><Download /></el-icon> 导出审计记录</el-button>
        <el-button type="primary" @click="router.push('/workbench')">返回工作台</el-button>
      </template>
    </PageHead>

    <StatCards :items="stats" />

    <div class="grid grid--side">
      <!-- ============================================== 审计列表 -- -->
      <div class="card">
        <div class="card__head">
          <div class="card__title">审计记录</div>
          <div class="card__sub">点击单据单号可跳转对应单据；展开行查看字段级变更前后值</div>
          <div class="card__spacer" />
          <el-input v-model="f.kw" placeholder="单号 / 标题 / 操作人 / 备注" clearable size="small" style="width: 200px">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-select v-model="f.bizType" placeholder="全部单据类型" clearable size="small" style="width: 150px">
            <el-option v-for="b in BIZ_TYPES" :key="b.value" :label="b.label" :value="b.value" />
          </el-select>
          <el-select v-model="f.operator" placeholder="全部操作人" clearable size="small" style="width: 130px">
            <el-option v-for="o in operatorOptions" :key="o" :label="o" :value="o" />
          </el-select>
          <el-select v-model="f.action" placeholder="全部动作" clearable size="small" style="width: 140px">
            <el-option v-for="a in actionOptions" :key="a" :label="a" :value="a" />
          </el-select>
          <el-date-picker
            v-model="f.range"
            type="daterange"
            unlink-panels
            range-separator="至"
            start-placeholder="开始"
            end-placeholder="结束"
            value-format="YYYY-MM-DD"
            size="small"
            style="width: 230px"
          />
          <el-button size="small" @click="resetFilter">重置</el-button>
        </div>
        <div class="card__body card__body--flush">
          <el-table :data="filtered" style="width: 100%" :row-key="auditKey">
            <el-table-column type="expand">
              <template #default="{ row }">
                <div class="expand-box">
                  <div class="bold mb-2">字段级变更对比（变更前<el-icon><ArrowRight /></el-icon>变更后）</div>
                  <el-table v-if="arrAny(row.changes).length" :data="row.changes" size="small" border style="max-width: 760px">
                    <el-table-column prop="field" label="字段名" width="240">
                      <template #default="{ row: c }"><span class="mono">{{ c.field }}</span></template>
                    </el-table-column>
                    <el-table-column label="变更前" min-width="220">
                      <template #default="{ row: c }"><span class="before">{{ c.before }}</span></template>
                    </el-table-column>
                    <el-table-column label="变更后" min-width="220">
                      <template #default="{ row: c }"><span class="after">{{ c.after }}</span></template>
                    </el-table-column>
                  </el-table>
                  <div v-else class="muted text-sm">该次操作没有字段级变更（例如仅追加流转记录）。</div>
                  <div class="text-xs muted mt-3">
                    修改人：{{ row.operator }}（{{ row.operatorOrg }}） · 时间：{{ row.operatedAt }} ·
                    来源 IP：<span class="mono">{{ row.ip }}</span> · 终端：{{ row.terminal }}
                  </div>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="时间" width="140">
              <template #default="{ row }">
                <div>{{ fmtTime(row.operatedAt).slice(5, 16) }}</div>
                <div class="cell-sub">{{ fromNow(row.operatedAt) }}</div>
              </template>
            </el-table-column>
            <el-table-column label="单据类型" width="100">
              <template #default="{ row }">
                <el-tag size="small" effect="plain">{{ bizLabel(row.bizType) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="单号" width="150">
              <template #default="{ row }">
                <el-button
                  v-if="bizRoute(row.bizType, row.bizId)"
                  link type="primary"
                  @click="openBiz(row)"
                >{{ row.bizNo }}</el-button>
                <span v-else class="mono">{{ row.bizNo }}</span>
              </template>
            </el-table-column>
            <el-table-column prop="bizTitle" label="标题" min-width="200" show-overflow-tooltip />
            <el-table-column label="动作" width="130">
              <template #default="{ row }">
                <StatusTag
                  :label="row.action"
                  :tone="/驳回|退回|回滚|删除/.test(row.action) ? 'danger' : /审批|审核|验证|关闭|解决/.test(row.action) ? 'success' : 'info'"
                  :dot="false"
                />
              </template>
            </el-table-column>
            <el-table-column label="操作人 / 组织" width="150" show-overflow-tooltip>
              <template #default="{ row }">
                <div>{{ row.operator }}</div>
                <div class="cell-sub">{{ row.operatorOrg }}</div>
              </template>
            </el-table-column>
            <el-table-column prop="ip" label="来源 IP" width="120">
              <template #default="{ row }"><span class="mono text-xs">{{ row.ip }}</span></template>
            </el-table-column>
            <el-table-column prop="terminal" label="终端" width="130" show-overflow-tooltip />
            <el-table-column label="备注" min-width="160" show-overflow-tooltip>
              <template #default="{ row }">{{ row.remark || '—' }}</template>
            </el-table-column>
            <template #empty>
              <div class="empty-box">
                <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
                <div class="empty-box__text">没有符合条件的审计记录，可调整筛选条件</div>
              </div>
            </template>
          </el-table>
        </div>
        <div class="card__foot">
          <span class="text-sm muted">
            共 <b>{{ filtered.length }}</b> 条 / 全部 {{ allAudits.length }} 条 ·
            字段级变更 <b>{{ filtered.reduce((s, r) => s + arrAny(r.changes).length, 0) }}</b> 项
          </span>
          <span class="card__spacer" />
          <span class="text-xs muted">审计记录最多保留最近 500 条</span>
        </div>
      </div>

      <!-- ============================================== 侧栏说明 -- -->
      <div>
        <div class="card">
          <div class="card__head"><div class="card__title">四类审计覆盖情况</div></div>
          <div class="card__body">
            <div v-for="b in ['changes', 'incidents', 'problems', 'releases']" :key="b" class="audit-cover">
              <div class="flex items-center justify-between">
                <span class="bold">{{ bizLabel(b) }}审计</span>
                <span class="mono text-sm">{{ allAudits.filter(a => a.bizType === b).length }} 条</span>
              </div>
              <div class="text-xs muted mt-1">
                {{ b === 'changes' ? '记录变更数据变化前后的修改人、时间' :
                   b === 'incidents' ? '记录事件处理过程的状态与处理人变化' :
                   b === 'problems' ? '记录问题根因分析与已知错误流转' :
                   '对发布项进行事后审计，确保每次升级闭环' }}
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card__head"><div class="card__title">最近留痕</div></div>
          <div class="card__body">
            <div v-if="allAudits.length" class="tl">
              <div v-for="(a, i) in allAudits.slice(0, 6)" :key="auditKey(a, i)" class="tl__item" :class="i === 0 ? 'tl__item--active' : 'tl__item--done'">
                <div class="tl__dot" />
                <div class="tl__head">
                  <span class="tl__action">{{ a.action }}</span>
                  <span class="tl__meta">{{ a.operator }} · {{ fromNow(a.operatedAt) }}</span>
                </div>
                <div class="tl__body">{{ bizLabel(a.bizType) }} {{ a.bizNo }} · {{ truncate(a.bizTitle, 24) }}</div>
              </div>
            </div>
            <div v-else class="empty-box">
              <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
              <div class="empty-box__text">暂无审计记录</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cell-sub { font-size: var(--fs-xs); color: var(--text-3); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.expand-box { padding: var(--sp-4) var(--sp-5); background: var(--surface-2); }
.before { color: var(--text-3); text-decoration: line-through; }
.after { color: var(--success-fg); font-weight: 600; }
.audit-cover { padding: 10px 0; border-bottom: 1px dashed var(--border-2); }
.audit-cover:last-child { border-bottom: none; }
</style>
