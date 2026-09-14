<script setup lang="ts">
/**
 * ToolsDrawer —— 右上角信息入口的抽屉
 *
 * 只有一个栏目：**功能点覆盖表**（与《数据需求管理-功能清单.md》逐行对齐）
 *   · 行集合 = 清单的 69 个标题：根 1 + 模块 11 + 条目 57，无任何清单外内容
 *   · 父行三列：功能名称（编号 + 层级标签）/ 功能描述（清单原文逐字）/ 是否验收
 *     —— 只有清单原文非空的行（67 行）给验收按钮，2 个空描述标题仅承载层级
 *   · 展开子行：
 *       条目行 = 角色 → 系统页面 → 看得到什么 / 要做什么 → 对应示例数据
 *       模块行 = 角色 → 承载页面 → 看什么最完整 → 示例数据（不写具体操作）
 *   · 表底：演示剧本（默认收起，弱化）与核对边界说明
 *
 * 性能约定（滚动流畅性）：
 *   ① 滚动事件用 rAF 节流，滚动过程中**不写任何响应式状态**，滚完 300ms 才落盘一次；
 *   ② 展开行用 el-table 的 expand-row-keys 受控 + row-key，避免整表重渲染；
 *   ③ 打开抽屉只做一次滚动还原（用户已滚动则放弃），不用定时器反复抢占。
 */
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { config } from '@/core/config'
import { roles as ROLES } from '@/core/roles'
import { recipes } from '@/core/recipes'
import type { Recipe, RecipeRow, RecipeModuleRow } from '@/core/recipes'
import { coverageRows, originOf } from '@/core/reference'
import type { CoverageRow } from '@/core/reference'
import { navOf, roleNameOf } from '@/core/recipeHelpers'
import { useDemoStore } from '@/stores/demo'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const store = useDemoStore()
const router = useRouter()

const PANEL: 'coverage' = 'coverage'
const LEVEL_TAG: Record<CoverageRow['level'], string> = { root: '根', module: '模块', item: '条目' }

/* ================================================== 数据与筛选 -- */
const covRows = computed(() => ui.coverageRows)

/** 模块清单（用于下拉筛选） */
const modules = computed(() => covRows.value.filter(r => r.level === 'module').map(r => ({ id: r.id, name: r.point })))

/** 层级缩进 */
function indentOf(row: CoverageRow): number {
  return row.level === 'root' ? 0 : row.level === 'module' ? 18 : 36
}

/** 层级标签（用函数而非直接索引，避免模板里出现隐式 any） */
function levelTag(level: CoverageRow['level']): string {
  return LEVEL_TAG[level]
}

const covKw = computed({
  get: () => ui.coverageKw,
  set: (v: string) => { ui.coverageKw = v }
})
const covLevel = computed({
  get: () => ui.coverageLevel,
  set: (v: 'all' | 'module' | 'item') => { ui.coverageLevel = v; ui.persistToolsMemory() }
})
const covModule = computed({
  get: () => ui.coverageModule,
  set: (v: string) => { ui.coverageModule = v; ui.persistToolsMemory() }
})

/** 关键词命中：编号 / 名称 / 清单原文 / 实现说明 / 演示说明 */
function hit(row: CoverageRow, kw: string): boolean {
  const rec = recipes[row.id]
  const recText = rec
    ? rec.rows.map(r => {
      const rr = r as RecipeRow & RecipeModuleRow
      return `${rr.ops ? rr.ops.join('') : ''}${rr.view ?? ''}${rr.evidence ?? ''}${rr.example ?? ''}${rr.page}`
    }).join('')
    : ''
  return `${row.id}${row.short}${row.point}${row.module}${row.spec}${row.impl}${recText}${rec?.surface ?? ''}`
    .toLowerCase().includes(kw)
}

const covFiltered = computed(() => {
  const kw = covKw.value.trim().toLowerCase()
  return covRows.value.filter(row => {
    if (covLevel.value !== 'all' && row.level !== covLevel.value) return false
    if (covModule.value && row.id !== covModule.value && !row.id.startsWith(covModule.value + '.')) return false
    if (kw && !hit(row, kw)) return false
    return true
  })
})

/* ================================================== 统计与验收 -- */
const checkable = computed(() => covRows.value.filter(r => r.accept))
const covDone = computed(() => checkable.value.filter(r => store.coverageChecked[r.id]).length)
const covPercent = computed(() => checkable.value.length ? Math.round((covDone.value / checkable.value.length) * 100) : 0)
const levelCount = computed(() => ({
  root: covRows.value.filter(r => r.level === 'root').length,
  module: covRows.value.filter(r => r.level === 'module').length,
  item: covRows.value.filter(r => r.level === 'item').length
}))

function toggleCov(id: string) {
  store.setCoverageChecked(id, !store.coverageChecked[id])
}
function setAllCov(v: boolean) {
  store.setAllCoverage(v, checkable.value.map(r => r.id))
  ElMessage.success(v ? `已把 ${checkable.value.length} 条可验收项全部标记为通过` : '已清空验收状态')
}

/* ================================================== 演示说明 -- */
function recipeOf(id: string): Recipe | null {
  return recipes[id] ?? null
}
/** 统一成条目行形状，便于模板与导出共用 */
function itemRowsOf(id: string): (RecipeRow & { _view?: string })[] {
  const rec = recipes[id]
  if (!rec) return []
  if (rec.isModule) return []
  return (rec.rows as RecipeRow[])
}
function moduleRowsOf(id: string): RecipeModuleRow[] {
  const rec = recipes[id]
  if (!rec?.isModule) return []
  return (rec.rows as RecipeModuleRow[])
}
/** 该行的可点页面（子行「系统页面」列的页面名 + 模块行承载页面的拆分） */
function pagesOf(row: RecipeRow): string[] {
  return row.page.split(/[、/]/).map(s => s.trim()).filter(Boolean)
}
function navFor(page: string, row?: RecipeRow): string {
  return navOf(page) || row?.detail || page
}

/* ================================================== 原文依据弹窗 -- */
const originVisible = ref(false)
const originRow = ref<CoverageRow | null>(null)
function openOrigin(id: string) {
  const hitRow = covRows.value.find(r => r.id === id)
  if (!hitRow || !hitRow.accept) return
  originRow.value = hitRow
  originVisible.value = true
}

/* ================================================== 展开行（受控） -- */
const covTableRef = ref()
const expandKeys = computed(() => ui.coverageOpen)
function isExpanded(id: string) {
  return ui.coverageOpen.includes(id)
}
function onExpandChange(row: any, expanded: any[]) {
  const open = Array.isArray(expanded) ? expanded.some(e => e?.id === row.id) : !!expanded
  ui.setCoverageOpen(row.id, open)
}
function expandAll() {
  const rows = covFiltered.value
  ui.toggleCoverageAll(rows.map(r => r.id), true)
  nextTick(() => rows.forEach(r => { if (!isExpanded(r.id)) covTableRef.value?.toggleRowExpansion?.(r, true) }))
}
function collapseAll() {
  ui.toggleCoverageAll([], false)
}

/* ================================================== 导出 -- */
function exportCov() {
  const cols = ['编号', '短号', '层级', '所属模块', '功能名称', '功能描述（清单原文）', '实现说明', '验收', '角色', '系统页面', '看得到什么 / 要做什么', '页面上可看到', '对应示例数据']
  const lines: string[] = [cols.join(',')]
  const clean = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim()
  const put = (arr: unknown[]) => lines.push(arr.map(v => `"${clean(v).replace(/"/g, '""')}"`).join(','))

  for (const r of covRows.value) {
    const rec = recipeOf(r.id)
    const checked = r.accept ? (store.coverageChecked[r.id] ? '通过' : '未验收') : '—'
    const head = [r.id, r.short, LEVEL_TAG[r.level], r.module, r.point, r.spec, r.impl, checked]
    if (!rec) { put([...head, '', '', '暂无演示说明', '', '']); continue }

    if (rec.isModule) {
      for (const row of rec.rows as RecipeModuleRow[]) {
        put([...head, roleNameOf(row.role), row.page, row.view, rec.surface ?? '', row.example ?? ''])
      }
      continue
    }
    for (const row of rec.rows as RecipeRow[]) {
      const ops = row.ops.map((o, i) => `${i + 1}. ${o}`).join(' ')
      put([...head, roleNameOf(row.role, row.roleLabel ?? undefined), navFor(row.page, row), `${rec.surface ? `入口：${rec.surface} ` : ''}${ops}`, row.evidence ?? '', row.example ?? ''])
    }
  }
  try {
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = '数据需求管理-功能点覆盖表.csv'
    document.body.appendChild(a); a.click()
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 500)
    ElMessage.success(`已导出 ${covRows.value.length} 行（功能清单 69 行全集）`)
  } catch {
    ElMessage.warning('当前环境不支持下载，清单已输出到控制台')
    console.log(lines.join('\n'))
  }
}

/* ================================================== 滚动位置 -- */
/*
 * 旧实现在 @scroll 里每帧写 Pinia + 400ms 后再写一次，滚动期间触发全局状态更新与重渲染；
 * 打开抽屉时还用 setInterval 反复抢占 scrollTop，滚轮会被"抢回去"。
 * 现在：滚动中只读 scrollTop 存入普通变量，停止 300ms 后落盘一次；打开时只还原一次。
 */
const bodyRef = ref<HTMLElement | null>(null)
let pendingScroll = 0
let scrollTimer: ReturnType<typeof setTimeout> | null = null
let userScrolled = false

function onBodyScroll() {
  const el = bodyRef.value
  if (!el) return
  userScrolled = true
  pendingScroll = el.scrollTop
  if (scrollTimer) return
  scrollTimer = setTimeout(() => {
    scrollTimer = null
    ui.setPanelScroll(PANEL, pendingScroll)
    ui.persistToolsMemory()
  }, 300)
}

function restoreScroll() {
  userScrolled = false
  const target = ui.toolsScroll[PANEL] ?? 0
  if (!target) return
  let tries = 0
  const apply = () => {
    if (userScrolled) return
    const el = bodyRef.value
    if (!el) return
    el.scrollTop = target
    tries += 1
    if (tries < 2) requestAnimationFrame(apply)
  }
  nextTick(() => requestAnimationFrame(apply))
}

watch(() => ui.toolsDrawer, open => { if (open) restoreScroll() })

function onClosed() {
  if (scrollTimer) { clearTimeout(scrollTimer); scrollTimer = null }
  // 用滚动时记录的位置，不要在这里回读 scrollTop（抽屉收起时内容可能正在卸载）
  ui.setPanelScroll(PANEL, pendingScroll)
  ui.persistToolsMemory()
}
onUnmounted(() => { if (scrollTimer) clearTimeout(scrollTimer) })

function clearMemory() {
  ui.clearToolsMemory()
  pendingScroll = 0
  const el = bodyRef.value
  if (el) el.scrollTop = 0
  ElMessage.info('已清除「上次看到哪儿」的缓存（已勾选的验收结果不受影响）')
}

/* ================================================== 演示剧本 -- */
/*
 * 剧本内容与原来一致，入口收在覆盖表底部并默认收起（弱化）。
 * 剧本步骤里的路由是早期版本遗留（如 /incident-list），这里按真实路由表校正。
 */
const ROUTE_FIX: Record<string, string> = {
  '/incident-list': '/incident/list',
  '/demand-list': '/demand/list',
  '/change-list': '/change/list',
  '/task-list': '/task/list',
  '/problem-list': '/problem/list',
  '/release-list': '/release/list',
  '/kb-list': '/kb/list',
  '/kb-qna': '/kb/qna'
}
const scenarios = config.scenarios as any[]
const curScenario = computed(() => scenarios.find(s => s.id === ui.activeScenario) ?? null)

function playScenario(id: string, resume = false) {
  ui.playScenario(id, resume)
  store.setScenario(id)
}
function stepOf(id: string): number {
  return ui.activeScenario === id ? ui.scenarioStep : 0
}
function exitScenario() {
  ui.exitScenario()
  store.setScenario(null)
}
function goStep(i: number, withRole: boolean) {
  const sc = curScenario.value
  if (!sc) return
  const st = sc.steps[i]
  ui.setScenarioStep(i)
  if (withRole && st.role) {
    store.setRole(st.role)
    ElMessage.success(`已切换为「${roleNameOf(st.role)}」并跳转至步骤 ${i + 1}`)
  }
  const raw = String(st.route ?? '').replace(/^#/, '')
  const route = ROUTE_FIX[raw] ?? raw
  if (route) {
    ui.toolsDrawer = false
    router.push(route)
  }
}
function toggleScenario() {
  ui.scenarioOpen = !ui.scenarioOpen
  ui.persistToolsMemory()
}

/* ================================================== 核对边界说明 -- */
const boundaryNotes: [string, string][] = [
  ['上游系统按对接态模拟', '资源目录、数据服务、数据分类分级、能力开放门户、CMDB 等上游能力以内置样例数据模拟，不在本模块内实现 —— 对应原文对大数据平台类能力标注的「本项目不计费用」。'],
  ['未量化指标的处理口径', 'SLA 时限、优先级矩阵、评价维度、验收时限等建设方案未给出量化值的指标，按行业通行口径设定，并在对应行的「原文依据 → 设计假设」中逐条标注。'],
  ['审计留痕为真实实现', '任何单据状态变更都会写入字段级审计（变更前后值 + 修改人 + 时间），可在审计中心查看与导出。'],
  ['数据可重置', '右上角信息入口提供数据重置能力，可恢复初始状态，保证核对结果可复现。'],
  ['角色权限真实生效', '切换角色后菜单可见范围、数据范围、操作按钮同步变化，可在需求单管理页用「本组织 / 全部」对比核对。'],
  ['原文截断处不补全', '功能清单 1.2.6.3.1.7.3「编辑组件」的原文在「支持知识文档之间的」处截断，本表按字面保留并标注「原文疑似缺失」，实现按知识条目互引呈现。']
]
const boundaryVisible = ref(false)
</script>

<template>
  <el-drawer
    v-model="ui.toolsDrawer"
    size="80%"
    :with-header="false"
    @closed="onClosed"
  >
    <div class="tools">
      <!-- 顶栏：唯一栏目 + 关闭 -->
      <div class="tools__nav">
        <span class="tools__navtitle">
          <el-icon><List /></el-icon>
          <span>功能点覆盖表</span>
        </span>
        <el-tag size="small" type="info" effect="plain">功能清单 {{ covRows.length }} 行</el-tag>
        <span class="tools__spacer" />
        <el-tooltip content="清除「上次看到哪儿」的缓存（已勾选的验收结果不受影响）" placement="bottom">
          <el-button text @click="clearMemory"><el-icon><Delete /></el-icon></el-button>
        </el-tooltip>
        <el-button text @click="ui.closeTools()">
          <el-icon><Close /></el-icon>
        </el-button>
      </div>

      <!-- 正文：整块滚动区 -->
      <div ref="bodyRef" class="tools__body" @scroll.passive="onBodyScroll">
        <div class="tools__head">
          <div>
            <h3>功能点覆盖表 · 功能清单 {{ covRows.length }} 行</h3>
            <p>
              与《数据需求管理-功能清单》逐行对齐：根 {{ levelCount.root }} + 模块 {{ levelCount.module }} + 条目 {{ levelCount.item }}。
              父行给出功能名称、清单原文与验收状态；展开后给出「用哪个角色 → 到哪个系统的哪个页面 →
              看得到什么 / 要做什么 → 对应示例数据」。只要页面上能看见对应入口，即认为该功能描述被覆盖。
            </p>
          </div>
          <div class="tools__spacer" />
          <el-input v-model="covKw" placeholder="搜索编号 / 名称 / 清单原文 / 演示要点" clearable style="width: 250px">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
          <el-select v-model="covLevel" style="width: 116px">
            <el-option label="全部层级" value="all" />
            <el-option label="仅模块" value="module" />
            <el-option label="仅条目" value="item" />
          </el-select>
          <el-select v-model="covModule" placeholder="全部模块" clearable filterable style="width: 168px">
            <el-option v-for="m in modules" :key="m.id" :label="m.name" :value="m.id" />
          </el-select>
          <el-button @click="expandAll">展开全部</el-button>
          <el-button @click="collapseAll">收起全部</el-button>
          <el-button @click="setAllCov(true)">全部通过</el-button>
          <el-button @click="setAllCov(false)">清空</el-button>
          <el-button type="primary" @click="exportCov">
            <el-icon><Download /></el-icon><span style="margin-left: 4px">导出</span>
          </el-button>
        </div>

        <div class="tools__stats">
          <span>功能清单 <b>{{ covRows.length }}</b> 行</span>
          <span>可验收 <b>{{ checkable.length }}</b> 行</span>
          <span>已通过 <b>{{ covDone }}</b> 行</span>
          <span>进度 <b>{{ covPercent }}%</b></span>
          <el-progress :percentage="covPercent" :stroke-width="6" style="width: 200px" />
          <span class="text-xs muted">（原文为空的标题不设验收按钮）</span>
        </div>

        <!-- ================= 父子集表格 ================= -->
        <el-table
          ref="covTableRef"
          :data="covFiltered"
          row-key="id"
          :expand-row-keys="expandKeys"
          size="small"
          border
          style="width: 100%"
          @expand-change="onExpandChange"
        >
          <el-table-column type="expand">
            <template #default="{ row }">
              <div class="rec">
                <div class="rec__head">
                  <span class="rec__title">{{ row.id }} {{ row.point }}</span>
                  <el-tag v-if="recipeOf(row.id)?.mode === 'operate'" size="small" type="warning" effect="plain">需现场打样</el-tag>
                  <el-tag v-else-if="recipeOf(row.id)" size="small" type="success" effect="plain">看现有数据即可</el-tag>
                  <span v-if="recipeOf(row.id)?.note" class="rec__note">{{ recipeOf(row.id)?.note }}</span>
                </div>

                <!-- 条目行：角色 / 系统页面 / 看得到什么 / 示例数据 -->
                <table v-if="itemRowsOf(row.id).length" class="rec__table">
                  <thead>
                    <tr>
                      <th style="width: 120px">角色</th>
                      <th style="width: 230px">系统页面</th>
                      <th>看得到什么 / 要做什么</th>
                      <th style="width: 210px">对应示例数据</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(r, i) in itemRowsOf(row.id)" :key="i">
                      <td><el-tag size="small" effect="plain">{{ roleNameOf(r.role, r.roleLabel ?? undefined) }}</el-tag></td>
                      <td>
                        <div class="rec__page">{{ r.page }}</div>
                        <div class="rec__nav">{{ navFor(r.page, r) }}</div>
                      </td>
                      <td>
                        <div v-if="recipeOf(row.id)?.surface" class="rec__surface">入口：{{ recipeOf(row.id)?.surface }}</div>
                        <ol class="rec__ops">
                          <li v-for="(op, k) in r.ops" :key="k">{{ op }}</li>
                        </ol>
                        <div v-if="r.evidence" class="rec__evi">
                          <el-icon><View /></el-icon><span>页面上可看到：{{ r.evidence }}</span>
                        </div>
                      </td>
                      <td class="rec__ex">{{ r.example ?? '—' }}</td>
                    </tr>
                  </tbody>
                </table>

                <!-- 模块行：只说明用哪个角色、从哪个页面看最完整 -->
                <table v-else-if="moduleRowsOf(row.id).length" class="rec__table">
                  <thead>
                    <tr>
                      <th style="width: 120px">角色</th>
                      <th style="width: 250px">承载该模块的功能页面</th>
                      <th>看什么最完整</th>
                      <th style="width: 210px">对应示例数据</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(r, i) in moduleRowsOf(row.id)" :key="i">
                      <td><el-tag size="small" effect="plain">{{ roleNameOf(r.role) }}</el-tag></td>
                      <td>
                        <div class="rec__page">{{ r.page }}</div>
                        <div class="rec__nav">{{ r.page.split(/[、/]/).map(s => s.trim()).filter(Boolean).map(p => navOf(p) || p).join(' ｜ ') }}</div>
                      </td>
                      <td>
                        <div class="rec__ops rec__ops--plain">{{ r.view }}</div>
                        <div v-if="recipeOf(row.id)?.surface" class="rec__surface" style="margin-top: 4px">入口：{{ recipeOf(row.id)?.surface }}</div>
                      </td>
                      <td class="rec__ex">{{ r.example ?? '—' }}</td>
                    </tr>
                  </tbody>
                </table>

                <div v-else class="rec__empty">暂无演示说明</div>
              </div>
            </template>
          </el-table-column>

          <el-table-column label="功能点名称" width="330" fixed>
            <template #default="{ row }">
              <div class="cov-point" :style="{ paddingLeft: indentOf(row) + 'px' }">
                <span class="cov-point__code">{{ row.short }}</span>
                <span class="cov-point__name">{{ row.point }}</span>
                <span class="cov-point__tag" :class="`is-${row.level}`">{{ levelTag(row.level) }}</span>
                <span v-if="row.malformed" class="cov-point__tag is-warn">原文疑似缺失</span>
              </div>
              <div class="cov-point__path" :style="{ paddingLeft: indentOf(row) + 'px' }">{{ row.id }}</div>
            </template>
          </el-table-column>

          <el-table-column label="功能点描述" min-width="440">
            <template #default="{ row }">
              <div v-if="row.spec" class="cov-spec">
                <span>{{ row.spec }}</span>
                <el-button
                  v-if="row.accept"
                  link
                  type="primary"
                  size="small"
                  class="cov-spec__btn"
                  @click="openOrigin(row.id)"
                >原文依据</el-button>
              </div>
              <span v-else class="muted">（清单原文本处无功能描述）</span>
            </template>
          </el-table-column>

          <el-table-column label="是否验收" width="120" align="center" fixed="right">
            <template #default="{ row }">
              <el-button
                v-if="row.accept"
                link
                size="small"
                :type="store.coverageChecked[row.id] ? 'success' : 'info'"
                @click="toggleCov(row.id)"
              >
                <el-icon><component :is="store.coverageChecked[row.id] ? 'CircleCheck' : 'Clock'" /></el-icon>
                <span>{{ store.coverageChecked[row.id] ? '通过' : '待验收' }}</span>
              </el-button>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>

          <template #empty>
            <div class="empty-box">
              <div class="empty-box__icon"><el-icon><Search /></el-icon></div>
              <div class="empty-box__text">没有匹配的功能点</div>
            </div>
          </template>
        </el-table>

        <!-- ================= 演示剧本（弱化入口，默认收起） ================= -->
        <div class="tools__scenarios">
          <div class="tools__scenbar">
            <el-icon><VideoPlay /></el-icon>
            <b>演示剧本</b>
            <span class="muted">（{{ scenarios.length }} 条 · 逐步讲解 + 一键切角色跳转，供现场讲解时选用）</span>
            <span class="tools__spacer" />
            <el-button link type="primary" size="small" @click="toggleScenario">
              {{ ui.scenarioOpen ? '收起' : '展开' }}
            </el-button>
          </div>

          <div v-if="ui.scenarioOpen" class="tools__scenbody">
            <template v-if="!curScenario">
              <div class="grid grid--2">
                <div v-for="sc in scenarios" :key="sc.id" class="card" style="margin: 0">
                  <div class="card__head">
                    <div class="card__title">
                      <span class="scen__no">{{ sc.icon }}</span>
                      <span style="margin-left: 6px">{{ sc.name }}</span>
                    </div>
                  </div>
                  <div class="card__body">
                    <div class="text-sm" style="color: var(--text-2); min-height: 44px">{{ sc.desc }}</div>
                    <div class="mt-2 flex wrap gap-1">
                      <el-tag v-for="c in sc.covers" :key="c" size="small" type="info" effect="plain">{{ c }}</el-tag>
                    </div>
                    <div class="mt-2 text-xs muted">
                      共 {{ sc.steps.length }} 步
                      <template v-if="stepOf(sc.id) > 0">· <b>上次看到第 {{ stepOf(sc.id) + 1 }} 步</b></template>
                    </div>
                  </div>
                  <div class="card__foot">
                    <el-button v-if="stepOf(sc.id) > 0" type="primary" size="small" @click="playScenario(sc.id, true)">
                      继续（第 {{ stepOf(sc.id) + 1 }}/{{ sc.steps.length }} 步）
                    </el-button>
                    <el-button v-else type="primary" size="small" @click="playScenario(sc.id)">开始演示</el-button>
                  </div>
                </div>
              </div>
            </template>

            <template v-else>
              <div class="tools__head">
                <div>
                  <h3>{{ curScenario.name }}</h3>
                  <p>{{ curScenario.desc }}</p>
                </div>
                <div class="tools__spacer" />
                <el-button size="small" @click="exitScenario">
                  <el-icon><Back /></el-icon><span style="margin-left: 4px">返回剧本列表</span>
                </el-button>
              </div>
              <div class="text-sm muted mb-2">进度：第 {{ ui.scenarioStep + 1 }} / {{ curScenario.steps.length }} 步</div>
              <div class="tl">
                <div
                  v-for="(st, i) in curScenario.steps"
                  :key="i"
                  class="tl__item"
                  :class="i < ui.scenarioStep ? 'tl__item--done' : i === ui.scenarioStep ? 'tl__item--active' : ''"
                >
                  <div class="tl__dot" />
                  <div class="tl__head">
                    <span class="tl__action">步骤 {{ i + 1 }}</span>
                    <el-tag v-if="st.role" size="small" type="warning">需角色：{{ roleNameOf(st.role) }}</el-tag>
                  </div>
                  <div class="tl__body">{{ st.text }}</div>
                  <div class="mt-2 flex gap-2 wrap">
                    <el-button size="small" :type="i === ui.scenarioStep ? 'primary' : 'default'" @click="goStep(i, false)">
                      跳到该步骤
                    </el-button>
                    <el-button v-if="st.role" size="small" @click="goStep(i, true)">切换角色并跳转</el-button>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>

        <!-- ================= 核对边界说明 ================= -->
        <div class="tools__boundary">
          <div class="tools__scenbar">
            <el-icon><InfoFilled /></el-icon>
            <b>核对边界说明</b>
            <span class="muted">（{{ boundaryNotes.length }} 条，说明哪些是模拟、哪些是真实实现）</span>
            <span class="tools__spacer" />
            <el-button link type="primary" size="small" @click="boundaryVisible = true">查看</el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 原文依据（父行按钮触发） -->
    <el-dialog v-model="originVisible" :title="`原文依据 · ${originRow?.id ?? ''} ${originRow?.point ?? ''}`" width="760px">
      <div v-if="originRow" class="spec">
        <div class="spec__row">
          <div class="spec__label">所属模块</div>
          <div class="spec__val">{{ originRow.module }}（{{ LEVEL_TAG[originRow.level] }}）</div>
        </div>
        <div class="spec__row">
          <div class="spec__label">功能清单原文</div>
          <div class="spec__val">{{ originOf(originRow.id)?.text }}</div>
        </div>
        <div class="spec__row">
          <div class="spec__label">本系统实现</div>
          <div class="spec__val">{{ originRow.impl }}</div>
        </div>
        <div class="spec__row">
          <div class="spec__label">原文未给出的设计假设</div>
          <div class="spec__val">
            <span v-if="originRow.note" class="spec__note">
              <el-icon><Warning /></el-icon><span>{{ originRow.note }}</span>
            </span>
            <span v-else class="muted">原文已明确，无需补充</span>
          </div>
        </div>
      </div>
    </el-dialog>

    <!-- 核对边界说明 -->
    <el-dialog v-model="boundaryVisible" title="核对边界说明" width="720px">
      <ul class="boundary-list">
        <li v-for="n in boundaryNotes" :key="n[0]"><b>{{ n[0] }}</b>：{{ n[1] }}</li>
      </ul>
    </el-dialog>
  </el-drawer>
</template>

<style scoped>
.tools { display: flex; flex-direction: column; height: 100%; margin: calc(-1 * var(--sp-4)); }
.tools__nav {
  flex: none; display: flex; align-items: center; gap: var(--sp-2);
  padding: 0 var(--sp-4); height: 48px; border-bottom: 1px solid var(--border);
  background: var(--surface);
}
.tools__navtitle {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: var(--fs-lg); font-weight: 600; color: var(--text-1);
}
.tools__spacer { flex: 1; }
.tools__body {
  flex: 1; overflow-y: auto; padding: var(--sp-5);
  /* 滚动性能：滚动只发生在这一层；contain:paint 把重绘范围限制在本元素内 */
  overscroll-behavior: contain;
  contain: paint;
}
.tools__head {
  display: flex; align-items: flex-start; gap: var(--sp-3);
  margin-bottom: var(--sp-4); flex-wrap: wrap;
}
.tools__head h3 { margin: 0; font-size: var(--fs-xl); font-weight: 600; }
.tools__head p { margin: 4px 0 0; font-size: var(--fs-sm); color: var(--text-3); max-width: 82ch; line-height: 1.7; }
.tools__stats {
  display: flex; align-items: center; gap: var(--sp-4);
  padding: 10px var(--sp-4); margin-bottom: var(--sp-4);
  background: var(--surface-2); border-radius: var(--r-md); font-size: var(--fs-sm);
  flex-wrap: wrap;
}
.tools__stats b { font-family: var(--ff-num); }

/* 父行：编号 / 名称 / 层级标签 / 清单编号路径 */
.cov-point { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.cov-point__code {
  font-family: var(--ff-num); font-size: var(--fs-xs); color: var(--text-3);
  min-width: 34px;
}
.cov-point__name { font-weight: 600; color: var(--text-1); }
.cov-point__tag {
  flex: none; padding: 0 5px; border-radius: 3px; font-size: 11px; line-height: 16px;
  border: 1px solid var(--border); color: var(--text-3); background: var(--surface);
}
.cov-point__tag.is-module { color: var(--brand-700); border-color: var(--brand-200); background: var(--brand-50); }
.cov-point__tag.is-item { color: var(--text-2); }
.cov-point__tag.is-warn { color: var(--warning-fg); border-color: currentColor; }
.cov-point__path { font-family: var(--ff-num); font-size: 11px; color: var(--text-3); }
.cov-spec { display: flex; align-items: flex-start; gap: var(--sp-2); line-height: 1.7; }
.cov-spec > span { flex: 1; min-width: 0; }
.cov-spec__btn { flex: none; }

/* 子行 */
.rec { padding: 6px 4px 10px; border-left: 3px solid var(--brand-200); background: var(--surface-2); }
.rec__head { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: 8px; flex-wrap: wrap; }
.rec__title { font-weight: 600; color: var(--text-1); }
.rec__note { font-size: var(--fs-xs); color: var(--text-3); }
.rec__table { width: 100%; border-collapse: collapse; background: var(--surface); font-size: var(--fs-sm); }
.rec__table th, .rec__table td {
  border: 1px solid var(--border-2); padding: 8px 10px; vertical-align: top; text-align: left;
}
.rec__table th { background: var(--surface-2); color: var(--text-2); font-weight: 600; white-space: nowrap; }
.rec__page { font-weight: 600; color: var(--text-1); }
.rec__nav { margin-top: 2px; font-size: var(--fs-xs); color: var(--text-3); }
.rec__surface { color: var(--text-3); font-size: var(--fs-xs); margin-bottom: 2px; }
.rec__ops { margin: 0; padding-left: 18px; line-height: 1.8; color: var(--text-1); }
.rec__ops--plain { padding-left: 0; }
.rec__evi {
  display: inline-flex; align-items: flex-start; gap: 5px;
  margin-top: 5px; font-size: var(--fs-xs); color: var(--success-fg);
}
.rec__ex { color: var(--text-2); font-size: var(--fs-xs); line-height: 1.7; }
.rec__empty { padding: 10px; color: var(--text-3); font-size: var(--fs-sm); }

/* 表底 */
.tools__scenarios { margin-top: var(--sp-5); }
.tools__scenbar {
  display: flex; align-items: center; gap: 6px;
  padding: 8px var(--sp-3); background: var(--surface-2);
  border: 1px solid var(--border-2); border-radius: var(--r-md);
  font-size: var(--fs-sm); color: var(--text-2);
}
.tools__scenbody { padding: var(--sp-3) 2px 0; }
.scen__no { font-weight: 700; color: var(--brand-600); }
.tools__boundary { margin-top: var(--sp-3); margin-bottom: var(--sp-2); }
.boundary-list { padding-left: 18px; list-style: disc; line-height: 1.9; font-size: var(--fs-sm); }
.boundary-list b { color: var(--text-1); }

/* 原文依据弹窗 */
.spec__row { display: flex; gap: var(--sp-3); padding: 8px 0; border-bottom: 1px dashed var(--border-2); }
.spec__row:last-child { border-bottom: none; }
.spec__label { flex: none; width: 160px; color: var(--text-3); font-size: var(--fs-sm); }
.spec__val { flex: 1; min-width: 0; line-height: 1.8; color: var(--text-1); }
.spec__note { display: inline-flex; align-items: flex-start; gap: 5px; color: var(--warning-fg); }
</style>
