<script setup lang="ts">
/**
 * ChangeCalendarView —— 可视化变更窗口
 *
 * 覆盖原文功能点：需求变更管理 —— "有可视化的变更窗口，可以在变更窗口中显示当前已有变更与
 * 业务事件日程，便于在制定新的变更计划时作为参考。"
 *
 * 日历同时叠加三类日程：
 *   · 变更（changes.implementDate）                      —— cal__ev--change
 *   · 业务事件日程（incidents 中严重 / 高，按 slaDueAt）  —— cal__ev--event
 *   · 发布（releases.releaseAt）                         —— cal__ev--release
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useDemoStore } from '@/stores/demo'
import { arr, by, fmtDate, NOW, toDate } from '@/core/utils'
import PageHead from '@/components/PageHead.vue'
import StatusTag from '@/components/StatusTag.vue'

const store = useDemoStore()
const router = useRouter()

/* 本地宽松数组 / 字典工具（store 返回宽类型，避免 unknown 推断） */
const lst = (v: unknown): any[] => (Array.isArray(v) ? v : [])
const dictOpts = (d: Record<string, { label: string }>) => Object.keys(d).map(k => ({ value: k, label: d[k].label }))

/* ------------------------------------------------------------ 月份 -- */
const base = NOW
const year = ref(base.getFullYear())
const month = ref(base.getMonth() + 1)          // 1-12
const TODAY = fmtDate(base)                      // 2026-01-27
const selectedDate = ref(TODAY)

function pad(n: number): string { return n < 10 ? '0' + n : String(n) }
function shiftMonth(delta: number) {
  let y = year.value
  let m = month.value + delta
  if (m < 1) { m = 12; y -= 1 }
  if (m > 12) { m = 1; y += 1 }
  year.value = y
  month.value = m
}
function backToday() {
  year.value = base.getFullYear()
  month.value = base.getMonth() + 1
  selectedDate.value = TODAY
}

/* -------------------------------------------------------- 三类日程 -- */
type EvType = 'change' | 'event' | 'release'
interface Ev { key: string; type: EvType; id: string; date: string; title: string }

const changeRows = computed(() => store.table('changes') as any[])
const incidentRows = computed(() => store.table('incidents') as any[])
const releaseRows = computed(() => store.table('releases') as any[])

/** date(YYYY-MM-DD) → 事件列表（变更 / 事件 / 发布） */
const evIndex = computed<Record<string, Ev[]>>(() => {
  const m: Record<string, Ev[]> = {}
  const push = (date: string, ev: Ev) => { (m[date] ||= []).push(ev) }
  changeRows.value.forEach(c => {
    if (!c.implementDate) return
    push(String(c.implementDate).slice(0, 10), {
      key: `c-${c.id}`, type: 'change', id: c.id, date: String(c.implementDate).slice(0, 10),
      title: `${String(c.no).slice(-6)} ${c.title}`
    })
  })
  incidentRows.value.forEach(i => {
    if (!i.slaDueAt || !['严重', '高'].includes(i.severity)) return
    push(String(i.slaDueAt).slice(0, 10), {
      key: `i-${i.id}`, type: 'event', id: i.id, date: String(i.slaDueAt).slice(0, 10),
      title: `${String(i.no).slice(-6)} ${i.title}`
    })
  })
  releaseRows.value.forEach(r => {
    if (!r.releaseAt) return
    push(String(r.releaseAt).slice(0, 10), {
      key: `r-${r.id}`, type: 'release', id: r.id, date: String(r.releaseAt).slice(0, 10),
      title: `${String(r.no).slice(-6)} ${r.title}`
    })
  })
  const order: Record<EvType, number> = { change: 0, event: 1, release: 2 }
  Object.keys(m).forEach(k => m[k].sort((a, b) => order[a.type] - order[b.type]))
  return m
})

const totalChange = computed(() => changeRows.value.length)
const totalEvent = computed(() => incidentRows.value.filter(i => ['严重', '高'].includes(i.severity) && i.slaDueAt).length)
const totalRelease = computed(() => releaseRows.value.filter(r => r.releaseAt).length)

/* ------------------------------------------------------ 日历网格 -- */
const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const cells = computed(() => {
  const first = new Date(year.value, month.value - 1, 1)
  const start = new Date(first.getTime())
  start.setDate(1 - first.getDay())
  const out: { date: string; day: number; out: boolean; today: boolean; evs: Ev[] }[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getTime())
    d.setDate(start.getDate() + i)
    const date = fmtDate(d)
    out.push({
      date,
      day: d.getDate(),
      out: d.getMonth() !== month.value - 1,
      today: date === TODAY,
      evs: evIndex.value[date] ?? []
    })
  }
  return out
})

const monthEvs = computed(() => {
  const prefix = `${year.value}-${pad(month.value)}`
  return Object.entries(evIndex.value)
    .filter(([date]) => date.startsWith(prefix))
    .reduce((s, [, list]) => s + list.length, 0)
})

/* ------------------------------------------------------ 当日明细 -- */
const dayChanges = computed(() => by(changeRows.value.filter(c => String(c.implementDate).slice(0, 10) === selectedDate.value), 'no', 'asc'))
const dayEvents = computed(() => incidentRows.value
  .filter(i => ['严重', '高'].includes(i.severity) && String(i.slaDueAt).slice(0, 10) === selectedDate.value))
const dayReleases = computed(() => releaseRows.value.filter(r => String(r.releaseAt).slice(0, 10) === selectedDate.value))
const dayDetail = computed<Ev[]>(() => evIndex.value[selectedDate.value] ?? [])

function pick(date: string) {
  selectedDate.value = date
  const d = toDate(date)
  if (d && (d.getMonth() !== month.value - 1 || d.getFullYear() !== year.value)) {
    year.value = d.getFullYear()
    month.value = d.getMonth() + 1
  }
}

function newPlan() {
  ElMessage.info('已跳转「需求变更管理」，可在其中新建变更单制定变更计划')
  router.push('/change/list')
}

/* -------------------------------------------------- 变更密集日提示 -- */
const busyDays = computed(() => Object.entries(evIndex.value)
  .filter(([, list]) => list.filter(e => e.type === 'change').length > 1)
  .map(([date, list]) => ({ date, count: list.filter(e => e.type === 'change').length }))
  .sort((a, b) => a.date.localeCompare(b.date)))
</script>

<template>
  <div>
    <PageHead
      title="可视化变更窗口"
      desc="在变更窗口中显示当前已有变更与业务事件日程，便于在制定新的变更计划时作为参考。"
    >
      <template #actions>
        <el-button type="primary" @click="newPlan"><el-icon><Plus /></el-icon> 新建变更计划</el-button>
        <el-button @click="router.push('/change/list')">变更单列表</el-button>
      </template>
    </PageHead>

    <div class="grid grid--side">
      <!-- 日历 -->
      <div class="card">
        <div class="card__head">
          <div class="card__title">{{ year }} 年 {{ month }} 月</div>
          <div class="card__sub">
            本月 {{ monthEvs }} 项日程 · 全量：变更 {{ totalChange }} / 事件日程 {{ totalEvent }} / 发布 {{ totalRelease }}
          </div>
          <div class="card__spacer" />
          <el-button-group>
            <el-button @click="shiftMonth(-1)"><el-icon><ArrowLeft /></el-icon> 上月</el-button>
            <el-button @click="backToday">回到今天</el-button>
            <el-button @click="shiftMonth(1)">下月 <el-icon><ArrowRight /></el-icon></el-button>
          </el-button-group>
        </div>
        <div class="card__body">
          <div class="flex wrap gap-3 mb-3 legend">
            <span class="legend__item"><i class="legend__dot legend__dot--change" />变更（实施日期）</span>
            <span class="legend__item"><i class="legend__dot legend__dot--event" />业务事件日程（严重 / 高 · SLA 到期）</span>
            <span class="legend__item"><i class="legend__dot legend__dot--release" />发布（发布时间）</span>
            <span class="legend__item"><i class="legend__dot legend__dot--today" />今天（{{ TODAY }}）</span>
          </div>

          <div class="cal">
            <div v-for="w in weekdays" :key="w" class="cal__head">{{ w }}</div>
            <div
              v-for="cell in cells"
              :key="cell.date"
              class="cal__cell"
              :class="{ 'cal__cell--out': cell.out, 'is-selected': cell.date === selectedDate }"
              @click="pick(cell.date)"
            >
              <div class="cal__day" :class="{ 'cal__day--today': cell.today }">
                <span>{{ cell.day }}</span>
                <span v-if="cell.evs.length" class="text-xs muted">{{ cell.evs.length }}</span>
              </div>
              <div
                v-for="ev in cell.evs.slice(0, 3)"
                :key="ev.key"
                class="cal__ev"
                :class="`cal__ev--${ev.type}`"
                :title="ev.title"
              >{{ ev.title }}</div>
              <div v-if="cell.evs.length > 3" class="text-xs muted">+{{ cell.evs.length - 3 }} 项…</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 当日明细 -->
      <div>
        <div class="card mb-4">
          <div class="card__head">
            <div class="card__title">当日明细</div>
            <div class="card__sub">{{ selectedDate }} · 共 {{ dayDetail.length }} 项</div>
          </div>
          <div class="card__body">
            <div v-if="!dayDetail.length" class="empty-box">
              <div class="empty-box__icon"><el-icon><Calendar /></el-icon></div>
              <div class="empty-box__text">当日无变更 / 事件 / 发布日程，适合安排新的变更窗口</div>
            </div>

            <template v-if="dayChanges.length">
              <div class="detail-group__title">变更（{{ dayChanges.length }}）</div>
              <div v-for="c in dayChanges" :key="c.id" class="detail-item detail-item--change">
                <div class="flex items-center justify-between">
                  <el-button link type="primary" size="small" @click="router.push(`/change/detail/${c.id}`)">{{ c.no }}</el-button>
                  <StatusTag dict="ChangeStatus" :value="c.status" :dot="false" />
                </div>
                <div class="bold text-sm mt-1">{{ c.title }}</div>
                <div class="text-xs muted mt-1">
                  {{ c.category }} · 优先级 {{ c.priority }} · 风险 {{ c.riskLevel }} · 实施者 {{ c.implementer }}
                </div>
                <div class="text-xs muted">涉及资源 {{ lst(c.resources).length }} 项 · 已检出冲突 {{ lst(c.conflicts).length }} 项</div>
              </div>
            </template>

            <template v-if="dayEvents.length">
              <div class="detail-group__title">业务事件日程（{{ dayEvents.length }}）</div>
              <div v-for="i in dayEvents" :key="i.id" class="detail-item detail-item--event">
                <div class="flex items-center justify-between">
                  <span class="mono text-sm">{{ i.no }}</span>
                  <StatusTag dict="Severity" :value="i.severity" :dot="false" />
                </div>
                <div class="bold text-sm mt-1">{{ i.title }}</div>
                <div class="text-xs muted mt-1">{{ i.categoryName }} · {{ i.status }} · 处理人 {{ i.handler }} · {{ i.handlerGroup }}</div>
              </div>
            </template>

            <template v-if="dayReleases.length">
              <div class="detail-group__title">发布（{{ dayReleases.length }}）</div>
              <div v-for="r in dayReleases" :key="r.id" class="detail-item detail-item--release">
                <div class="flex items-center justify-between">
                  <span class="mono text-sm">{{ r.no }}</span>
                  <StatusTag dict="ReleaseStatus" :value="r.status" :dot="false" />
                </div>
                <div class="bold text-sm mt-1">{{ r.title }}</div>
                <div class="text-xs muted mt-1">停机 {{ r.downtime }} · 申请人 {{ r.applicant }} · {{ r.changeContent }}</div>
              </div>
            </template>
          </div>
        </div>

        <div class="card">
          <div class="card__head">
            <div class="card__title">变更密集日提示</div>
            <div class="card__sub">同日存在多个变更，制定新计划时建议避开</div>
          </div>
          <div class="card__body">
            <div v-if="!busyDays.length" class="empty-box">
              <div class="empty-box__icon"><el-icon><CircleCheck /></el-icon></div>
              <div class="empty-box__text">暂无同日多变更的情况</div>
            </div>
            <div v-for="b in busyDays" :key="b.date" class="busy-item" @click="pick(b.date)">
              <span class="mono">{{ b.date }}</span>
              <StatusTag :label="`${b.count} 个变更`" tone="warning" :dot="false" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.legend { display: flex; gap: var(--sp-4); flex-wrap: wrap; font-size: var(--fs-sm); color: var(--text-2); }
.legend__item { display: flex; align-items: center; gap: 6px; }
.legend__dot { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
.legend__dot--change { background: var(--brand-100); border: 1px solid var(--brand-400); }
.legend__dot--event { background: var(--warning-bg); border: 1px solid var(--warning); }
.legend__dot--release { background: var(--purple-bg); border: 1px solid var(--purple); }
.legend__dot--today { background: var(--brand-600); border-radius: 50%; }

.cal__cell { cursor: pointer; transition: background .15s ease; }
.cal__cell:hover { background: var(--brand-50); }
.cal__cell.is-selected { box-shadow: inset 0 0 0 2px var(--brand-400); background: var(--brand-50); }
.cal__ev { margin-top: 3px; cursor: pointer; }

.detail-group__title { font-size: var(--fs-sm); font-weight: 600; color: var(--text-2); margin: var(--sp-3) 0 var(--sp-2); }
.detail-group__title:first-child { margin-top: 0; }
.detail-item {
  padding: var(--sp-3); margin-bottom: var(--sp-2);
  border: 1px solid var(--border-2); border-left-width: 3px; border-radius: var(--r-sm);
  background: var(--surface-2);
}
.detail-item--change { border-left-color: var(--brand-500); }
.detail-item--event { border-left-color: var(--warning); }
.detail-item--release { border-left-color: var(--purple); }
.busy-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 7px 10px; border-radius: var(--r-sm); background: var(--warning-bg);
  margin-bottom: 6px; cursor: pointer; font-size: var(--fs-sm);
}
</style>
