<script setup lang="ts">
/**
 * AppShell —— 应用外壳
 *
 * 版式（B 端管理后台）：
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ [标识] 数据需求管理 │ 三医数据底座…   [检索] [消息] [角色] [ⓘ] │ ← 顶栏
 *   ├──────────────────────────────────────────────────────────────┤
 *   │ ▸ 综合  ▸ 需求受理与供给  ▸ 运维服务管理  ▸ 服务窗口与度量      │ ← 产品切换
 *   ├────────────┬─────────────────────────────────────────────────┤
 *   │ 侧栏菜单    │  内容区                                          │
 *   └────────────┴─────────────────────────────────────────────────┘
 *
 * 导航联动：顶部产品由 route.meta.product 决定（详情页也标注了归属），
 * 侧栏只渲染当前产品的菜单；切换产品时跳到该产品下第一个有权限的页面。
 * 验收/说明类内容不进入业务页面，统一收在右上角信息图标打开的抽屉里。
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDemoStore } from '@/stores/demo'
import { useUiStore } from '@/stores/ui'
import { config } from '@/core/config'
import { roles as ROLES } from '@/core/roles'
import ToolsDrawer from '@/components/ToolsDrawer.vue'

const store = useDemoStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()

onMounted(() => { if (!store._loaded) store.init() })

/* ============================================================ 产品导航 -- */
interface MenuItem { key: string; title: string; icon?: string; perm?: string; hide?: boolean; route: string }
interface Product { key: string; title: string; icon: string; desc: string; menu: MenuItem[] }

const products = computed<Product[]>(() => config.products as unknown as Product[])

/** 当前路由所属产品：优先取 meta.product */
const currentProductKey = computed<string>(() => {
  const fromMeta = route.meta.product as string | undefined
  if (fromMeta) return fromMeta
  const key = String(route.name ?? '')
  return store.productOfRoute(key) ?? products.value[0]?.key ?? 'general'
})

const currentProduct = computed<Product>(
  () => products.value.find(p => p.key === currentProductKey.value) ?? products.value[0]
)

/** 某产品下当前角色可见的侧栏项 */
function visibleMenu(p: Product): MenuItem[] {
  return p.menu.filter(it => !it.hide && (!it.perm || store.can(it.perm)))
}

/** 产品是否有该角色可访问的页面（无则置灰不可点） */
const productEnabled = (p: Product) => visibleMenu(p).length > 0

const sideMenu = computed<MenuItem[]>(() => visibleMenu(currentProduct.value))

function switchProduct(p: Product) {
  if (p.key === currentProductKey.value) return
  const first = visibleMenu(p)[0]
  if (!first) {
    ElMessage.warning(`当前账号在「${p.title}」下没有可访问的页面`)
    return
  }
  router.push(first.route)
}

/* ============================================================== 侧栏 -- */
const badges = computed<Record<string, number>>(() => {
  const map: Record<string, number> = {}
  const routeMap: Record<string, string> = {
    demands: 'demand-list', tasks: 'task-list', changes: 'change-list',
    incidents: 'incident-list', problems: 'problem-list', releases: 'release-list',
    knowledges: 'kb-list', qnas: 'kb-qna', evaluations: 'evaluation',
    subscriptions: 'delivery', broadcasts: 'service-desk'
  }
  for (const t of store.todos) {
    const k = routeMap[t.table]
    if (k) map[k] = (map[k] ?? 0) + 1
  }
  return map
})

const isActive = (it: MenuItem) => route.path === it.route || route.path.startsWith(it.route + '/')
function go(it: MenuItem) { if (route.path !== it.route) router.push(it.route) }

/* ========================================================== 身份切换 -- */
/*
 * 顶栏账号是本演示系统的**唯一登录账号**（名称恒定），下拉里选的是该账号的身份（角色）：
 * 切换后只有权限、菜单可见范围与所属机构变化，账号名不变。
 * 默认身份为平台管理员，手动切换只在本次会话（同一标签页）内保持。
 */
const currentRole = computed(() => store.role)
const currentUser = computed(() => store.user)

function switchRole(id: string) {
  store.setRole(id)
  const r = ROLES.find(x => x.id === id)
  ElMessage.success(`已切换身份：${r?.name}`)
  // 切换后若当前产品在新角色下无权限，落到第一个可用产品
  if (!productEnabled(currentProduct.value)) {
    const target = products.value.find(productEnabled)
    const first = target ? visibleMenu(target)[0] : null
    if (first) router.push(first.route)
  } else if (!sideMenu.value.some(isActive)) {
    const first = sideMenu.value[0]
    if (first) router.push(first.route)
  }
}

/* ========================================================== 消息中心 -- */
function readAll() { store.markAllRead(); ElMessage.success('已全部标记为已读') }

/* ========================================================== 重置数据 -- */
async function doReset() {
  try {
    await ElMessageBox.confirm('将丢弃本次操作产生的全部数据，恢复到初始状态。是否继续？', '重置数据', {
      confirmButtonText: '确认重置', cancelButtonText: '取消', type: 'warning'
    })
    store.reset(true)
    ElMessage.success('数据已重置')
    router.go(0)
  } catch { /* 用户取消 */ }
}

/* ========================================================== 全局检索 -- */
const searchValue = ref('')
const searchOptions = computed(() => {
  const out: { value: string; label: string; desc: string; route: string }[] = []
  const push = (table: string, label: string, route: string) => {
    for (const r of store.table(table) as any[]) {
      // 排除为统计图表生成的历史数据，避免检索结果被噪声淹没
      if (r.__hour !== undefined || /^(ix|ih)/.test(String(r.id))) continue
      out.push({ value: `${table}:${r.id}`, label: `${r.no ?? r.id} ${r.title ?? r.name ?? ''}`, desc: label, route })
    }
  }
  push('demands', '需求单', '/demand/detail/')
  push('tasks', '任务单', '/task/detail/')
  push('incidents', '事件单', '/incident/detail/')
  push('problems', '问题单', '/problem/detail/')
  push('releases', '发布单', '/release/detail/')
  push('knowledges', '知识条目', '/kb/detail/')
  for (const r of store.table('resources') as any[]) {
    out.push({ value: `res:${r.id}`, label: r.name, desc: '数据资源', route: '/demand/apply' })
  }
  return out
})
function onSearchSelect(v: string) {
  const opt = searchOptions.value.find(o => o.value === v)
  if (!opt) return
  const id = v.split(':')[1]
  router.push(opt.route === '/demand/apply' ? opt.route : opt.route + id)
}

function toggleSide() { store.toggleSidebar() }

/* ------------------------------------------------ 产品页签自适应收纳 -- */
/*
 * 空间足够时平铺全部页签；不足时按顺序尽量多放，放不下的收进行尾的「…」下拉。
 * 布局在渲染后测量（不需要预知宽度），窗口尺寸与角色变化时重新计算。
 */
const tabsEl = ref<HTMLElement | null>(null)
/** 被收纳进「…」的页签 key */
const hiddenTabKeys = ref<string[]>([])
/** 已测量到的各页签自然宽度 */
const tabWidths = ref<Record<string, number>>({})

const GAP = 2          // 与 .app-tabs 的 gap 一致
const MORE_W = 40      // 「…」按钮占位（含与其他项的间距）

const visibleTabs = computed(() =>
  products.value.filter(p => !hiddenTabKeys.value.includes(p.key))
)
const hiddenTabs = computed(() =>
  products.value.filter(p => hiddenTabKeys.value.includes(p.key))
)

function measureTabs() {
  const el = tabsEl.value
  if (!el) return
  const nodes = Array.from(el.querySelectorAll<HTMLElement>('.app-tab'))
  // 记录本次实际渲染出的页签宽度（隐藏的宽度为 0，不覆盖已测值）
  const widths = { ...tabWidths.value }
  nodes.forEach((n, i) => {
    const key = n.dataset.key
    if (key && n.offsetWidth > 0) widths[key] = n.offsetWidth
  })
  tabWidths.value = widths

  const avail = el.clientWidth
  const keys = products.value.map(p => p.key)
  // 宽度未测全时先全部展示，等下一轮再计算
  if (!keys.every(k => widths[k] > 0)) return

  let used = 0
  let cut = -1
  for (let i = 0; i < keys.length; i++) {
    const w = widths[keys[i]] + (i ? GAP : 0)
    // 预判：若后面还有页签，需为「…」预留位置
    const rest = keys.length - i - 1
    const reserve = rest > 0 ? MORE_W : 0
    if (used + w + reserve > avail) { cut = i; break }
    used += w
  }
  hiddenTabKeys.value = cut < 0 ? [] : keys.slice(cut)
}

/** 当前所在产品是否被收纳进「…」（用于让收纳按钮呈现激活态） */
const currentInMore = computed(() => hiddenTabKeys.value.includes(currentProductKey.value))

let tabRO: ResizeObserver | null = null
function observeTabs() {
  if (typeof ResizeObserver === 'undefined') return
  tabRO?.disconnect()
  tabRO = new ResizeObserver(() => measureTabs())
  if (tabsEl.value) tabRO.observe(tabsEl.value)
}
onMounted(async () => {
  observeTabs()
  await nextTick(); measureTabs(); await nextTick(); measureTabs()
  window.addEventListener('resize', measureTabs)
})
onUnmounted(() => { tabRO?.disconnect(); window.removeEventListener('resize', measureTabs) })
watch(
  () => [store.roleId, currentProductKey.value],
  async () => { await nextTick(); measureTabs(); await nextTick(); measureTabs() }
)
/** 用「…」下拉切换到被收纳的产品 */
function switchProductByKey(key: string) {
  const p = products.value.find(x => x.key === key)
  if (p) switchProduct(p)
}
</script>

<template>
  <div class="app-shell">
    <!-- ============ 顶栏（通栏顶层，位于侧栏之上）============ -->
    <!-- 品牌区固定在左上角，产品入口与品牌同一行，右侧为工具区 -->
    <header class="app-header">
      <div class="app-top">
        <div class="app-top__brand" :title="config.appFullName">
          <!--
            方形标识：品牌蓝圆角方块 + 白色线性图标。
            内联渲染（不用 <img>）：其一 SVG 内的 currentColor 需在文档流中才能继承，
            其二方形底需要随主题着色，用图片会失去这两个能力。
          -->
          <svg class="app-top__logo" viewBox="0 0 32 32" role="img" aria-label="数据需求管理">
            <title>数据需求管理</title>
            <rect x="0" y="0" width="32" height="32" rx="7" fill="currentColor" />
            <g
              transform="translate(3 3) scale(0.8125)"
              fill="none" stroke="#ffffff" stroke-width="2.2"
              stroke-linecap="round" stroke-linejoin="round"
            >
              <path d="M6 5.5A2.5 2.5 0 0 1 8.5 3H15l5 5v4" />
              <path d="M6 5.5V26a2.5 2.5 0 0 0 2.5 2.5H12" />
              <path d="M15 3l5 5h-2.5A2.5 2.5 0 0 1 15 5.5z" />
              <path d="M15.5 17h12" />
              <path d="M19 21.5h7" />
              <path d="M22 26h3" />
            </g>
          </svg>
          <span class="app-top__name">{{ config.appName }}</span>
        </div>

        <!-- 产品入口 -->
        <nav ref="tabsEl" class="app-tabs">
          <button
            v-for="p in visibleTabs"
            :key="p.key"
            class="app-tab"
            :data-key="p.key"
            :class="{ 'is-active': p.key === currentProductKey }"
            :disabled="!productEnabled(p)"
            :title="productEnabled(p) ? p.desc : `当前账号在「${p.title}」下没有可访问的页面`"
            @click="switchProduct(p)"
          >
            <el-icon class="app-tab__icon"><component :is="p.icon" /></el-icon>
            <span>{{ p.title }}</span>
            <span v-if="productEnabled(p)" class="app-tab__count">{{ visibleMenu(p).length }}</span>
          </button>

          <!-- 空间不足时收纳的页签 -->
          <el-dropdown v-if="hiddenTabs.length" trigger="click" @command="switchProductByKey">
            <button
              class="app-tab app-tab--more"
              :class="{ 'is-active': currentInMore }"
              :title="currentInMore ? `当前：${currentProduct.title}` : '更多模块'"
            >
              <el-icon><MoreFilled /></el-icon>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  v-for="p in hiddenTabs"
                  :key="p.key"
                  :command="p.key"
                  :disabled="!productEnabled(p)"
                >
                  <el-icon><component :is="p.icon" /></el-icon>
                  <span style="margin-left: 6px">{{ p.title }}</span>
                  <span v-if="productEnabled(p)" class="app-tab__count" style="margin-left: 8px">{{ visibleMenu(p).length }}</span>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </nav>

        <div class="app-top__spacer" />

        <div class="app-top__actions">
          <el-select
            v-model="searchValue"
            filterable
            clearable
            placeholder="搜索单号 / 资源 / 知识"
            popper-class="header-select-popper"
            class="header-select"
            style="width: 168px"
            @change="onSearchSelect"
          >
            <el-option v-for="o in searchOptions" :key="o.value" :label="o.label" :value="o.value">
              <span>{{ o.label }}</span>
              <span style="float: right; color: var(--text-3); font-size: 12px">{{ o.desc }}</span>
            </el-option>
          </el-select>

          <el-badge :value="store.unreadCount" :hidden="!store.unreadCount" type="danger">
            <button class="header-iconbtn" title="消息与通知" @click="ui.messageDrawer = true">
              <el-icon><Bell /></el-icon>
            </button>
          </el-badge>

          <!-- 账号角色 -->
          <el-dropdown trigger="click" @command="switchRole">
            <div class="role-chip">
              <span class="role-chip__avatar">
                <el-icon><component :is="currentRole.icon" /></el-icon>
              </span>
              <span class="role-chip__text">
                <b>{{ currentUser.name }}</b>
                <i>{{ currentUser.org }}</i>
              </span>
              <el-icon class="role-chip__caret"><ArrowDown /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  v-for="r in ROLES"
                  :key="r.id"
                  :command="r.id"
                  :disabled="r.id === store.roleId"
                >
                  <div class="role-opt">
                    <b>{{ r.name }}<span v-if="r.id === store.roleId" class="role-opt__cur">（当前）</span></b>
                    <span>{{ r.desc }}</span>
                  </div>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

          <!-- 信息入口 -->
          <el-dropdown trigger="click">
            <button class="header-iconbtn" title="信息与说明">
              <el-icon><InfoFilled /></el-icon>
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <!--
                  信息入口只有一个栏目：功能点覆盖表（父子集表格）。
                  演示剧本与原文依据对照都收在它内部：剧本在表底，原文依据在父行按钮里。
                  抽屉自身会记住「上次看到哪儿」（搜索词 / 展开行 / 滚动位置 / 剧本进度）。
                -->
                <el-dropdown-item @click="ui.openTools()">
                  <el-icon><List /></el-icon><span style="margin-left: 6px">功能点覆盖表</span>
                </el-dropdown-item>
                <el-dropdown-item divided @click="doReset">
                  <el-icon><RefreshLeft /></el-icon><span style="margin-left: 6px">重置数据</span>
                </el-dropdown-item>
                <el-dropdown-item divided @click="ui.messageDrawer = true">
                  <el-icon><Bell /></el-icon><span style="margin-left: 6px">消息与通知</span>
                </el-dropdown-item>
                <el-dropdown-item disabled>版本 {{ config.version }} · {{ config.owner }}</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>
    </header>

    <!-- ============ 顶栏之下：侧栏 + 内容区 ============ -->
    <div class="app-body">
      <!-- ======================== 侧栏 ======================== -->
      <aside class="app-side" :class="{ 'app-side--collapsed': store.prefs.sidebarCollapsed }">
      <nav class="app-side__scroll">
        <button
          v-for="it in sideMenu"
          :key="it.key"
          class="app-side__item"
          :class="{ 'is-active': isActive(it) }"
          :title="it.title"
          @click="go(it)"
        >
          <el-icon class="app-side__icon"><component :is="it.icon ?? 'Document'" /></el-icon>
          <span class="app-side__label">{{ it.title }}</span>
          <span v-if="badges[it.key]" class="app-side__badge">{{ badges[it.key] > 99 ? '99+' : badges[it.key] }}</span>
        </button>
        <div v-if="!sideMenu.length" class="app-side__empty">当前账号在本模块下暂无可见菜单</div>
      </nav>

      <div class="app-side__foot">
        <button class="app-side__toggle" @click="toggleSide">
          <el-icon><component :is="store.prefs.sidebarCollapsed ? 'Fold' : 'Expand'" /></el-icon>
          <span v-if="!store.prefs.sidebarCollapsed">折叠</span>
        </button>
      </div>
      </aside>

      <!-- ======================== 主区 ======================== -->
      <div class="app-main">
        <div class="app-content">
          <div class="app-content__inner">
            <router-view v-slot="{ Component }">
              <component :is="Component" />
            </router-view>
          </div>
        </div>
      </div>
    </div>

    <!-- 信息入口抽屉（唯一栏目：功能点覆盖表；剧本入口收在表底） -->
    <ToolsDrawer />

    <!-- 消息抽屉 -->
    <el-drawer v-model="ui.messageDrawer" title="消息与通知" size="520px">
      <div class="flex items-center mb-3">
        <span class="text-sm muted">共 {{ store.messages.length }} 条 · 未读 {{ store.unreadCount }} 条</span>
        <span class="card__spacer" />
        <el-button size="small" @click="readAll">全部标记已读</el-button>
      </div>
      <el-empty v-if="!store.messages.length" description="暂无消息" />
      <div v-for="m in store.messages" :key="m.id" class="card" style="margin-bottom: 10px" :style="{ opacity: m.read ? 0.62 : 1 }">
        <div class="card__body" style="padding: 12px 14px">
          <div class="flex items-center gap-2">
            <el-tag size="small" :type="m.type === 'success' ? 'success' : m.type === 'warning' ? 'warning' : m.type === 'danger' ? 'danger' : 'info'">
              {{ m.type === 'success' ? '完成' : m.type === 'warning' ? '待办' : m.type === 'danger' ? '预警' : '通知' }}
            </el-tag>
            <b class="text-sm">{{ m.title }}</b>
            <span class="card__spacer" />
            <span class="text-xs muted">{{ m.at }}</span>
          </div>
          <div class="text-sm mt-2" style="color: var(--text-2); white-space: pre-wrap">{{ m.body }}</div>
          <div class="mt-2 flex gap-2 items-center">
            <el-button v-if="m.link" size="small" type="primary" @click="router.push(m.link); ui.messageDrawer = false">查看详情</el-button>
            <el-button v-if="!m.read" size="small" @click="store.markRead(m.id)">标记已读</el-button>
            <span class="text-xs muted">渠道：{{ (m.channels ?? ['站内']).join(' / ') }}</span>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
/*
 * 账号芯片：单行显示「姓名 + 所属机构」，高度固定 36px。
 * 演示账号的机构名已规范化（最长 9 字），因此宽度取 200–280px 即可容纳；
 * 超长时机构名省略、姓名不省略，保证切换账号后高度恒定、右侧信息入口不被挤压。
 */
.role-chip {
  display: flex; align-items: center; gap: 8px;
  height: 36px; box-sizing: border-box;
  min-width: 190px; max-width: 270px;
  padding: 0 8px;
  border: 1px solid var(--topbar-field-bd); border-radius: var(--r-md);
  background: var(--topbar-field); cursor: pointer; outline: none;
  transition: background var(--t-fast), border-color var(--t-fast);
}
.role-chip:hover { background: var(--topbar-hover); border-color: rgba(255, 255, 255, .34); }
.role-chip__avatar {
  width: 26px; height: 26px; flex: none; border-radius: 50%;
  display: grid; place-items: center; color: #fff; font-size: 14px;
  background: rgba(255, 255, 255, .20);
}
/* 单行：姓名 + 所属机构 */
.role-chip__text {
  display: flex; align-items: baseline; gap: 6px;
  min-width: 0; flex: 1; line-height: 1;
}
/* 姓名不省略、不换行 */
.role-chip__text b {
  flex: none;
  font-size: var(--fs-md); font-weight: 600; color: #fff;
  white-space: nowrap;
}
/* 机构名过长时省略；前面加分隔点，视觉上区分姓名与机构 */
.role-chip__text i {
  min-width: 0;
  font-size: var(--fs-sm); font-style: normal; color: var(--topbar-text-2);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.role-chip__text i::before {
  content: "·";
  margin-right: 6px;
  color: rgba(255, 255, 255, .38);
}
.role-chip__caret { font-size: 11px; color: var(--topbar-text-2); flex: none; }
/* 角色下拉项：角色名 + 说明 */
.role-opt { line-height: 1.4; max-width: 330px; }
.role-opt b { display: block; }
.role-opt span { display: block; font-size: 12px; color: var(--text-3); white-space: normal; }
.role-opt__cur { display: inline; font-size: 12px; font-weight: 400; color: var(--text-3); }

/* 侧栏空态 */
.app-side__empty {
  padding: var(--sp-5) var(--sp-4); font-size: var(--fs-sm);
  color: var(--side-group); text-align: center; line-height: 1.7;
}
</style>
