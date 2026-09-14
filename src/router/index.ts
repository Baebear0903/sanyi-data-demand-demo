/**
 * router —— Hash 路由（保证构建产物放到任意子目录都能正常跳转）
 *
 * 约定：
 *  · 每个菜单项在 config.products[].menu 中声明 route，本文件的 path 必须与之严格一致，
 *    否则侧栏点击无反应（AppShell 通过 item.route 跳转）。
 *  · meta.product 指明该路由归属的产品（general / p1 / p2 / p3），
 *    顶部产品切换栏与侧栏菜单据此联动。**详情页与隐藏页也必须标注**，
 *    否则直接访问 URL 时顶部与侧栏会落到错误产品。
 *  · meta.title 显示在顶栏，meta.group 显示为归属标签。
 *  · 全部懒加载，构建时按页面分包。
 */
import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import { useUiStore } from '@/stores/ui'

/** 产品标识（与 config.products[].key 一致） */
const PG = 'general'
const P1 = 'p1'
const P2 = 'p2'
const P3 = 'p3'

/** 产品中文名 */
const G0 = '综合'
const G1 = '需求受理与供给'
const G2 = '运维服务管理'
const G3 = '服务窗口与度量'

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/workbench' },

  /* ============================================================ 综合 == */
  {
    path: '/workbench', name: 'workbench',
    component: () => import('@/views/WorkbenchView.vue'),
    meta: { title: '运营看板', group: G0, product: PG }
  },
  {
    path: '/audit', name: 'audit',
    component: () => import('@/views/AuditView.vue'),
    meta: { title: '审计中心', group: G0, product: PG }
  },
  {
    path: '/admin', name: 'admin',
    component: () => import('@/views/AdminView.vue'),
    meta: { title: '系统配置', group: G0, product: PG }
  },

  /* ============================================ 需求受理与供给（子产品一） */
  {
    path: '/demand/apply', name: 'demand-apply',
    component: () => import('@/views/DemandApplyView.vue'),
    meta: { title: '需求申请管理', group: G1, product: P1 }
  },
  {
    path: '/demand/list', name: 'demand-list',
    component: () => import('@/views/DemandListView.vue'),
    meta: { title: '需求单管理', group: G1, product: P1 }
  },
  {
    path: '/demand/detail/:id', name: 'demand-detail',
    component: () => import('@/views/DemandDetailView.vue'),
    meta: { title: '需求单详情', group: G1, product: P1, hidden: true }
  },
  {
    path: '/change/list', name: 'change-list',
    component: () => import('@/views/ChangeListView.vue'),
    meta: { title: '需求变更管理', group: G1, product: P1 }
  },
  {
    path: '/change/detail/:id', name: 'change-detail',
    component: () => import('@/views/ChangeDetailView.vue'),
    meta: { title: '变更单详情', group: G1, product: P1, hidden: true }
  },
  {
    path: '/change/calendar', name: 'change-calendar',
    component: () => import('@/views/ChangeCalendarView.vue'),
    meta: { title: '可视化变更窗口', group: G1, product: P1, hidden: true }
  },
  {
    path: '/task/list', name: 'task-list',
    component: () => import('@/views/TaskListView.vue'),
    meta: { title: '任务管理', group: G1, product: P1 }
  },
  {
    path: '/task/detail/:id', name: 'task-detail',
    component: () => import('@/views/TaskListView.vue'),
    meta: { title: '任务单详情', group: G1, product: P1, hidden: true }
  },
  {
    path: '/workflow', name: 'workflow',
    component: () => import('@/views/WorkflowView.vue'),
    meta: { title: '工作流管理', group: G1, product: P1 }
  },
  {
    path: '/delivery', name: 'delivery',
    component: () => import('@/views/DeliveryView.vue'),
    meta: { title: '交付与授权', group: G1, product: P1 }
  },
  {
    path: '/delivery/detail/:id', name: 'delivery-detail',
    component: () => import('@/views/DeliveryView.vue'),
    meta: { title: '订阅单详情', group: G1, product: P1, hidden: true }
  },

  /* ============================================== 运维服务管理（子产品二） */
  {
    path: '/incident/list', name: 'incident-list',
    component: () => import('@/views/IncidentListView.vue'),
    meta: { title: '事件管理', group: G2, product: P2 }
  },
  {
    path: '/incident/detail/:id', name: 'incident-detail',
    component: () => import('@/views/IncidentDetailView.vue'),
    meta: { title: '事件单详情', group: G2, product: P2, hidden: true }
  },
  {
    path: '/incident/config', name: 'incident-config',
    component: () => import('@/views/IncidentConfigView.vue'),
    meta: { title: '事件分类与模板', group: G2, product: P2, hidden: true }
  },
  {
    path: '/problem/list', name: 'problem-list',
    component: () => import('@/views/ProblemListView.vue'),
    meta: { title: '问题管理', group: G2, product: P2 }
  },
  {
    path: '/problem/detail/:id', name: 'problem-detail',
    component: () => import('@/views/ProblemDetailView.vue'),
    meta: { title: '问题单详情', group: G2, product: P2, hidden: true }
  },
  {
    path: '/release/list', name: 'release-list',
    component: () => import('@/views/ReleaseListView.vue'),
    meta: { title: '发布管理', group: G2, product: P2 }
  },
  {
    path: '/release/detail/:id', name: 'release-detail',
    component: () => import('@/views/ReleaseDetailView.vue'),
    meta: { title: '发布单详情', group: G2, product: P2, hidden: true }
  },
  {
    path: '/kb/list', name: 'kb-list',
    component: () => import('@/views/KnowledgeListView.vue'),
    meta: { title: '知识库管理', group: G2, product: P2 }
  },
  {
    path: '/kb/detail/:id', name: 'kb-detail',
    component: () => import('@/views/KnowledgeListView.vue'),
    meta: { title: '知识条目详情', group: G2, product: P2, hidden: true }
  },
  {
    path: '/kb/qna', name: 'kb-qna',
    component: () => import('@/views/KnowledgeQnaView.vue'),
    meta: { title: '知识问答管理', group: G2, product: P2, hidden: true }
  },

  /* ============================================ 服务窗口与度量（子产品三） */
  {
    path: '/service-desk', name: 'service-desk',
    component: () => import('@/views/ServiceDeskView.vue'),
    meta: { title: '服务台管理', group: G3, product: P3 }
  },
  {
    path: '/selfservice', name: 'selfservice',
    component: () => import('@/views/SelfServiceView.vue'),
    meta: { title: '自助服务管理', group: G3, product: P3 }
  },
  {
    path: '/evaluation', name: 'evaluation',
    component: () => import('@/views/EvaluationView.vue'),
    meta: { title: '评价管理', group: G3, product: P3 }
  },
  {
    path: '/evaluation/detail/:id', name: 'evaluation-detail',
    component: () => import('@/views/EvaluationDetailView.vue'),
    meta: { title: '评价单 / 反馈单详情', group: G3, product: P3, hidden: true }
  },
  {
    path: '/stats', name: 'stats',
    component: () => import('@/views/StatsView.vue'),
    meta: { title: '统计分析', group: G3, product: P3 }
  },

  /* ======================== 不在产品导航中暴露的页面（右上角信息入口访问） */
  /*
   * 功能点覆盖表已合并为右上角信息入口抽屉的唯一栏目（父子集表格 + 表底剧本入口）。
   * 这里保留旧地址 /coverage 作为兼容：打开抽屉并回到运营看板，避免旧书签落到空白页。
   * 注意：must 用 beforeEnter + 返回目标位置的方式，**不能**用 redirect 字段 ——
   * 配置成 redirect 时 Vue Router 不会执行该记录上的导航守卫，抽屉就不会被打开。
   */
  {
    path: '/coverage', name: 'coverage',
    component: () => import('@/views/WorkbenchView.vue'),
    meta: { title: '功能点覆盖表', group: G0, product: PG, hidden: true },
    beforeEnter: () => { useUiStore().openTools(); return true }
  },

  /* 兜底：未匹配路由回运营看板 */
  { path: '/:pathMatch(.*)*', redirect: '/workbench' }
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
})

export default router
