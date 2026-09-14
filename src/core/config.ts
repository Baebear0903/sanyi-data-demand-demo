/**
 * config.ts —— 全局配置：字典 / 角色与权限 / 菜单 / 演示剧本 / 待办规则 / 背景数字
 *
 * 修改本文件即可调整演示的角色、可见菜单与状态文案，无需改动页面代码。
 * 注意：菜单项的 route 必须与 src/router/index.ts 中的 path 严格一致。
 */

import type { Role, RoleMatrixRow } from './roles'

/* ------------------------------------------------------------ 类型定义 -- */
export type TagTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'teal' | 'neutral'
export interface DictItem { label: string; tag: TagTone }
/** 字典： 状态码 → { 文案, 色系 } */
export type Dict = Record<string, DictItem>

export interface ScenarioStep { text: string; route?: string; role?: string }
export interface Scenario {
  id: string; name: string; icon: string; desc: string
  covers: string[]; steps: ScenarioStep[]
}
export interface TodoRule {
  table: string; kind: string; roles: string[]; statuses: string[]
  action: string; route: string; dueField?: string
}
export interface MenuItemDef {
  key: string; title: string; icon?: string
  perm?: string; hide?: boolean; badge?: string; route: string
}
/** 顶部产品入口：每个产品对应一组侧栏菜单 */
export interface ProductDef {
  key: string; title: string; icon: string; desc: string; menu: MenuItemDef[]
}
export interface FactNumbers {
  catalogTables: number; catalogFields: number
  demandTables: number; demandFields: number
  hospitals: number; districts: number; citySystems: number
  checkupOrgs: number; bigCats: number; subCats: number; dataItems: number
}

/** config 的精确形状：已知键给出强类型，同时保留索引签名以便点号访问辅助方法 */
export interface AppConfig {
  version: string
  appName: string
  moduleName: string
  owner: string
  prdDoc: string
  facts: FactNumbers
  dicts: Record<string, Dict>
  flows: Record<string, string[]>
  flowIndex: Record<string, Record<string, number>>
  perms: Record<string, string>
  roles: Role[]
  roleMatrix: RoleMatrixRow[]
  products: ProductDef[]
  hiddenRoutes: { key: string; title: string; route: string }[]
  prefixes: Record<string, string>
  todoRules: TodoRule[]
  scenarios: Scenario[]
  [k: string]: any
}


export const config: AppConfig = {
    /*
     * 版本号同时是 localStorage 的数据版本闸门：
     * 版本变化时 store.init() 会重新播种演示数据（避免旧结构与新逻辑混用），
     * 因此每次调整种子数据结构 / 权限矩阵后都需要递增此版本号。
     * 1.2.0：需求单派发权限补齐、部署队列区分待部署/已部署、部署产物落库归档。
     * 1.3.0：知识条目附件上传、问答归档入口、自助服务权限矩阵可编辑、
     *        自助/邮件需求单「标记实施完成」、问题驱动发布申请（问题 → 发布）。
     * 1.4.0：知识分类树行高修复（不再压行）、分类节点去掉维护责任人（责任人只属于知识条目）。
     */
    version: '1.4.0',
    appName: '数据需求管理',
    appFullName: '三医数据底座 · 数据服务管理工具',
    moduleName: '数据需求管理',
    owner: '医疗公司',
    /** 内部需求文档文件名：仅供构建/文档引用，不渲染到界面 */
    prdDoc: '需求文档-数据需求管理模块静态演示系统.md',

    facts: {
      catalogTables: 835, catalogFields: 12800,
      demandTables: 166, demandFields: 3364,
      hospitals: 240, districts: 16, citySystems: 12, checkupOrgs: 35,
      bigCats: 21, subCats: 131, dataItems: 6000
    },

    dicts: {
      DemandStatus: {
        DRAFT: { label: '草稿', tag: 'neutral' },
        PENDING_ACCEPT: { label: '待受理', tag: 'warning' },
        PENDING_APPROVE: { label: '待审批', tag: 'info' },
        APPROVED: { label: '审批通过', tag: 'success' },
        REJECTED: { label: '已驳回', tag: 'danger' },
        WITHDRAWN: { label: '已撤回', tag: 'neutral' },
        IMPLEMENTING: { label: '实施中', tag: 'primary' },
        PENDING_ACCEPTANCE: { label: '待验收', tag: 'warning' },
        DELIVERED: { label: '已交付', tag: 'success' },
        EVALUATED: { label: '已评价', tag: 'teal' },
        CHANGING: { label: '变更中', tag: 'purple' },
        CANCELLED: { label: '已作废', tag: 'neutral' }
      },
      ChangeStatus: {
        DRAFT: { label: '草稿', tag: 'neutral' },
        PENDING_APPROVE: { label: '待审批', tag: 'info' },
        APPROVED: { label: '审批通过', tag: 'success' },
        REJECTED: { label: '已驳回', tag: 'danger' },
        WITHDRAWN: { label: '已撤回', tag: 'neutral' },
        IMPLEMENTING: { label: '实施中', tag: 'primary' },
        DONE: { label: '已完成', tag: 'teal' }
      },
      TaskStatus: {
        PENDING_DISPATCH: { label: '待派发', tag: 'warning' },
        PENDING_ACCEPT: { label: '待接单', tag: 'info' },
        DOING: { label: '实施中', tag: 'primary' },
        SUSPENDED: { label: '已挂起', tag: 'neutral' },
        PENDING_VERIFY: { label: '待验证', tag: 'warning' },
        DONE: { label: '已完成', tag: 'success' },
        REJECTED: { label: '已退回', tag: 'danger' }
      },
      IncidentStatus: {
        NEW: { label: '新建', tag: 'warning' },
        DISPATCHED: { label: '已派发', tag: 'info' },
        PROCESSING: { label: '处理中', tag: 'primary' },
        ESCALATED: { label: '已升级', tag: 'danger' },
        RESOLVED: { label: '已解决', tag: 'success' },
        CLOSED: { label: '已关闭', tag: 'neutral' }
      },
      ProblemStatus: {
        NEW: { label: '新建', tag: 'warning' },
        DISPATCHED: { label: '已分派', tag: 'info' },
        ANALYZING: { label: '分析中', tag: 'primary' },
        KNOWN_ERROR: { label: '已知错误', tag: 'purple' },
        RESOLVED: { label: '已解决', tag: 'success' },
        CLOSED: { label: '已关闭', tag: 'neutral' }
      },
      ReleaseStatus: {
        APPLYING: { label: '申请中', tag: 'info' },
        APPROVED: { label: '已批复', tag: 'primary' },
        RELEASED: { label: '已发布', tag: 'success' },
        VERIFYING: { label: '验证中', tag: 'warning' },
        CLOSED: { label: '已闭环', tag: 'teal' },
        ROLLED_BACK: { label: '已回滚', tag: 'danger' }
      },
      KnowledgeStatus: {
        DRAFT: { label: '草稿', tag: 'neutral' },
        PENDING_REVIEW: { label: '待审核', tag: 'warning' },
        PUBLISHED: { label: '已发布', tag: 'success' },
        WITHDRAWN: { label: '已撤回', tag: 'neutral' }
      },
      QnaStatus: {
        ASKED: { label: '待回答', tag: 'warning' },
        ANSWERED: { label: '已回答', tag: 'info' },
        ARCHIVED: { label: '已归档', tag: 'success' }
      },
      EvaluationStatus: {
        PENDING_APPROVE: { label: '待审批', tag: 'warning' },
        APPROVED: { label: '审批通过', tag: 'success' },
        REJECTED: { label: '已驳回', tag: 'danger' }
      },
      SubscriptionStatus: {
        PENDING: { label: '待审批', tag: 'warning' },
        APPROVED: { label: '已通过', tag: 'success' },
        REJECTED: { label: '已驳回', tag: 'danger' },
        UNSUBSCRIBED: { label: '已退订', tag: 'neutral' }
      },
      TenantStatus: {
        PENDING: { label: '待审核', tag: 'warning' },
        APPROVED: { label: '已通过', tag: 'success' },
        REJECTED: { label: '已驳回', tag: 'danger' }
      },
      Priority: {
        P0: { label: 'P0 紧急', tag: 'danger' },
        P1: { label: 'P1 高', tag: 'warning' },
        P2: { label: 'P2 中', tag: 'info' },
        P3: { label: 'P3 低', tag: 'neutral' }
      },
      Severity: {
        '严重': { label: '严重', tag: 'danger' },
        '高': { label: '高', tag: 'warning' },
        '中': { label: '中', tag: 'info' },
        '低': { label: '低', tag: 'neutral' }
      },
      RiskLevel: {
        '高': { label: '高风险', tag: 'danger' },
        '中': { label: '中风险', tag: 'warning' },
        '低': { label: '低风险', tag: 'success' }
      },
      SecurityLevel: {
        L1: { label: 'L1 公开', tag: 'success' },
        L2: { label: 'L2 内部', tag: 'info' },
        L3: { label: 'L3 敏感', tag: 'warning' },
        L4: { label: 'L4 高敏感', tag: 'danger' }
      },
      ResourceType: {
        MODEL: { label: '数据模型', tag: 'primary' },
        API: { label: '数据接口', tag: 'info' },
        PARAM: { label: '标准参数', tag: 'teal' },
        ALGO: { label: '算法模型', tag: 'purple' },
        TAG: { label: '标签', tag: 'warning' },
        METRIC: { label: '指标', tag: 'success' },
        RAW: { label: '数据资源', tag: 'neutral' }
      },
      DeliveryForm: {
        API: { label: '接口', tag: 'info' },
        TABLE: { label: '库表', tag: 'primary' },
        FILE: { label: '文件下载', tag: 'teal' }
      },
      ServiceKind: {
        API: { label: 'API 服务', tag: 'info' },
        FILE: { label: '文件服务', tag: 'teal' },
        REALTIME: { label: '实时服务', tag: 'purple' }
      },
      DemandKind: {
        EXISTING: { label: '已有资产', tag: 'primary' },
        NEW: { label: '新增资产', tag: 'warning' }
      },
      DemandSource: {
        WEB: { label: 'Web 提交', tag: 'info' },
        SERVICE_DESK: { label: '服务台申报', tag: 'primary' },
        SELF: { label: '客户自助', tag: 'teal' },
        WEIXIN: { label: '微信报障', tag: 'success' },
        EMAIL: { label: '电子邮件', tag: 'warning' },
        EVENT: { label: '由事件创建', tag: 'danger' },
        PROBLEM: { label: '由问题创建', tag: 'purple' },
        TEMPLATE: { label: '模板创建', tag: 'neutral' },
        MARKET: { label: '服务市场', tag: 'primary' }
      },
      TaskType: {
        '数据采集': { label: '数据采集', tag: 'info' },
        '数据加工': { label: '数据加工', tag: 'primary' },
        '数据建模': { label: '数据建模', tag: 'purple' },
        '服务封装': { label: '服务封装', tag: 'teal' }
      },
      CloseType: {
        '一线解决': { label: '一线解决', tag: 'success' },
        '二线解决': { label: '二线解决', tag: 'info' },
        '用户确认关闭': { label: '用户确认关闭', tag: 'primary' },
        '自动关闭': { label: '自动关闭', tag: 'neutral' }
      },
      NotifyChannel: { '邮件': { label: '邮件', tag: 'info' }, '短信': { label: '短信', tag: 'warning' }, '站内': { label: '站内信', tag: 'neutral' } }
    },

    flows: {
      Demand: ['草稿', '待受理', '待审批', '审批通过', '实施中', '待验收', '已交付', '已评价'],
      Task: ['待派发', '待接单', '实施中', '待验证', '已完成'],
      Incident: ['新建', '已派发', '处理中', '已解决', '已关闭'],
      Problem: ['新建', '已分派', '分析中', '已解决', '已关闭'],
      Release: ['申请中', '已批复', '已发布', '验证中', '已闭环'],
      Knowledge: ['草稿', '待审核', '已发布']
    },
    // 状态 → 流转步骤下标
    flowIndex: {
      Demand: { DRAFT: 0, PENDING_ACCEPT: 1, PENDING_APPROVE: 2, APPROVED: 3, IMPLEMENTING: 4, PENDING_ACCEPTANCE: 5, DELIVERED: 6, EVALUATED: 7, CHANGING: 4, REJECTED: 2, WITHDRAWN: 1, CANCELLED: 0 },
      Task: { PENDING_DISPATCH: 0, PENDING_ACCEPT: 1, DOING: 2, SUSPENDED: 2, PENDING_VERIFY: 3, DONE: 4, REJECTED: 1 },
      Incident: { NEW: 0, DISPATCHED: 1, PROCESSING: 2, ESCALATED: 2, RESOLVED: 3, CLOSED: 4 },
      Problem: { NEW: 0, DISPATCHED: 1, ANALYZING: 2, KNOWN_ERROR: 2, RESOLVED: 3, CLOSED: 4 },
      Release: { APPLYING: 0, APPROVED: 1, RELEASED: 2, VERIFYING: 3, CLOSED: 4, ROLLED_BACK: 2 },
      Knowledge: { DRAFT: 0, PENDING_REVIEW: 1, PUBLISHED: 2, WITHDRAWN: 0 }
    },

    /* ------------------------------------------------------ 权限点定义 -- */
    /*
     * 权限点分两类：
     *   · 操作类（apply / approve / dispatch / deliver / manage …）—— 控制按钮与动作
     *   · 查看类（*.view / *.share）—— 控制菜单可见性，保证角色在 4 个产品下都有入口
     */
    perms: {
      /* --- 需求受理与供给 --- */
      'demand.apply': '提交数据需求',
      'demand.view.all': '查看需求单',
      'demand.accept': '受理需求单',
      'demand.approve': '审批需求单',
      'demand.dispatch': '派发生产任务',
      'demand.change': '发起需求变更',
      'demand.deliver': '需求交付',
      'task.manage': '任务管理',
      'task.view': '查看任务',
      'task.implement': '任务实施',
      'task.verify': '任务验证',
      'flow.config': '工作流与审批规则配置',
      'flow.view': '查看工作流',
      'flow.deploy': '工作流自动化部署',
      'delivery.view': '查看订阅与授权',

      /* --- 运维服务管理 --- */
      'incident.create': '创建事件单',
      'incident.view': '查看事件单',
      'incident.handle': '事件处理',
      'incident.dispatch': '事件派发与升级',
      'problem.manage': '问题管理',
      'problem.view': '查看问题单',
      'problem.rootcause': '根因分析',
      'release.manage': '发布管理',
      'release.view': '查看发布单',
      'kb.write': '知识条目编辑',
      'kb.review': '知识条目审核',
      'kb.share': '查阅知识库',
      'kb.qna.answer': '知识问答回答',
      'kb.archive': '问答归档为知识',

      /* --- 服务窗口与度量 --- */
      'desk.manage': '服务台受理与广播',
      'selfservice.view': '使用自助服务',
      'selfservice.admin': '自助服务与类别配置',
      'eval.submit': '提交评价',
      'eval.view': '查看评价',
      'eval.approve': '评价/反馈审批',
      'stat.view': '统计分析查看',

      /* --- 公共支撑 --- */
      'audit.view': '审计中心查看',
      'admin.all': '系统管理'
    },

    /* ------------------------------------------------------------ 角色 -- */
    /*
     * 6 个角色。dataScope 控制数据范围（ALL 全部 / ORG 本组织）。
     * perms 中的查看类权限决定侧栏菜单可见性 —— 每个角色在 4 个产品下
     * 至少各有 1 个可见入口，避免出现空产品。
     */
    roles: [
      {
        id: 'consumer', name: '用数方', short: '用数', icon: 'User', repUserId: 'u01',
        org: '市医疗保障局',
        desc: '三医部门 / 医疗机构 / 委办局：提需求、查进度、撤回、验收、评价',
        dataScope: 'ORG', color: 'primary',
        perms: [
          'demand.apply', 'demand.change', 'delivery.view', 'task.view', 'flow.view',
          'incident.create', 'incident.view', 'problem.view', 'release.view', 'kb.share',
          'eval.submit', 'eval.view', 'selfservice.view', 'stat.view', 'audit.view'
        ]
      },
      {
        id: 'supplier', name: '供数方', short: '供数', icon: 'OfficeBuilding', repUserId: 'u02',
        org: '市卫生健康委员会 · 数据资源管理处',
        desc: '资源归属方：审批需求与订阅、确认授权范围、反馈评价',
        dataScope: 'ORG', color: 'teal',
        perms: [
          'demand.view.all', 'demand.accept', 'demand.approve', 'demand.dispatch', 'demand.deliver',
          'task.view', 'flow.view', 'delivery.view',
          'incident.view', 'problem.view', 'release.view', 'kb.share',
          'eval.approve', 'eval.view', 'selfservice.view', 'stat.view', 'audit.view'
        ]
      },
      {
        id: 'desk', name: '服务台受理员', short: '服务台', icon: 'Headset', repUserId: 'u03',
        org: '三医数据底座服务台',
        desc: '统一受理各类事件与服务请求，负责登记、分派、监督通知与回访',
        dataScope: 'ALL', color: 'warning',
        perms: [
          'demand.view.all', 'demand.accept', 'demand.approve', 'demand.deliver',
          'task.view', 'task.verify', 'flow.view', 'delivery.view',
          'incident.create', 'incident.view', 'incident.dispatch',
          'problem.view', 'release.view', 'kb.write', 'kb.share',
          'desk.manage', 'selfservice.view', 'eval.view', 'stat.view', 'audit.view', 'admin.all'
        ]
      },
      {
        id: 'ops', name: '运维工程师', short: '运维', icon: 'Tools', repUserId: 'u04',
        org: '运维中心 · 二线支持组',
        desc: '事件处理、问题根因分析、已知错误管理、发布执行、知识沉淀',
        dataScope: 'ALL', color: 'purple',
        perms: [
          'demand.view.all', 'task.view', 'task.implement', 'flow.view', 'delivery.view',
          'incident.handle', 'incident.dispatch', 'incident.view',
          'problem.manage', 'problem.rootcause', 'problem.view',
          'release.manage', 'release.view',
          'kb.write', 'kb.review', 'kb.share', 'kb.qna.answer', 'kb.archive',
          'selfservice.view', 'eval.view', 'stat.view', 'audit.view'
        ]
      },
      {
        id: 'producer', name: '生产实施方', short: '生产', icon: 'SetUp', repUserId: 'u05',
        org: '数据生产中心 · 加工组',
        desc: '承接数据采集、加工、建模任务，填报进度并交付成果',
        dataScope: 'ORG', color: 'info',
        perms: [
          'demand.view.all', 'task.view', 'task.manage', 'task.implement', 'task.verify',
          'flow.view', 'flow.config', 'flow.deploy', 'delivery.view',
          'incident.view', 'problem.view', 'release.view', 'kb.share',
          'selfservice.view', 'eval.view', 'stat.view', 'audit.view'
        ]
      },
      {
        id: 'admin', name: '平台管理员', short: '管理', icon: 'Setting', repUserId: 'u06',
        org: '平台运营中心',
        desc: '工作流与审批规则配置、租户与应用管理、渠道授权、系统管理与审计',
        dataScope: 'ALL', color: 'neutral', all: true,
        perms: []
      }
    ],

    /* ---------------- 建设方案中的角色与职责依据（14 类，用于系统配置页展示） ---------------- */
    roleMatrix: [
      { name: '用数方（需求方）', org: '三医部门 / 医疗机构 / 委办局', duty: '提需求、查进度、撤回、验收、评价', spec: '服务需求方出现需求时，可选择提需求单' },
      { name: '供数方（资源归属方）', org: '资源归属单位', duty: '审批订阅与需求、反馈评价', spec: '资源归属方可以审批资源的订阅请求' },
      { name: '数据资源生产者 / 发布人', org: '数据生产部门', duty: '资源配置、提交发布申请、撤单', spec: '由数据资源生产者完成数据资源配置后…可提交发布申请' },
      { name: '数据资源管理人员', org: '数据资源管理处', duty: '审核发布申请、逐级审批', spec: '可提交发布申请由数据资源管理人员审核' },
      { name: '服务台受理员', org: '服务台', duty: '统一受理、登记、分派、监督通知、回访', spec: '通过服务台统一受理各类事件或服务请求' },
      { name: '一线运维', org: '运维中心一线组', duty: '事件处理、知识调用、一线解决', spec: '提高故障的一线解决率' },
      { name: '二线 / 专家组', org: '运维中心二线组', duty: '根因分析、已知错误管理、决策树分析', spec: '维护人员、二线支持人员和专家组、管理层' },
      { name: '生产实施方', org: '数据生产部门', duty: '采集 / 加工 / 建模任务实施', spec: '创建任务并指定生产部门实施' },
      { name: '变更审批人', org: '领导小组办公室', duty: '审批规则定义、多级审批、会签', spec: '可以灵活的定义审批规则…定义审批人' },
      { name: '多级安全审批人', org: '安全管理部门', duty: '敏感数据临时授权工单逐级审批（系统/邮件）', spec: '需提交临时授权工单，由多级安全审批人进行逐级审批' },
      { name: '发布管理员', org: '运维管理', duty: '发布申请、发布包归档、回滚、发布审计', spec: '按批复的发布申请要求，在规定时间点升级' },
      { name: '知识库维护责任人', org: '各业务领域', duty: '知识创建审核发布撤回、评论处理', spec: '知识可设定维护责任人' },
      { name: '平台 / 租户 / 项目管理员', org: '平台运营中心', duty: '租户、应用、服务代理、密钥、渠道授权', spec: '平台管理员允许访问本菜单；租户管理员 / 项目管理员查看本级列表' },
      { name: '管理层 / 决策层', org: '三医联动领导小组', duty: '统计分析、服务概况、事件统计报表', spec: '管理层等，都会在指定的范围和规范化…框架和流程下进行日常工作' },
    ],

    /* ------------------------------------------------------------ 产品 -- */
    /*
     * 导航结构：顶部 = 4 个产品入口；侧栏 = 当前产品的 menu。
     *   · 综合            交付运营看板（角色自适应）+ 审计中心 + 系统配置
     *   · 需求受理与供给   子产品一
     *   · 运维服务管理     子产品二
     *   · 服务窗口与度量   子产品三
     * icon 一律为 Element Plus 图标组件名（单色线性图标），不使用字符或 emoji。
     * hide: true 的项只保留路由与权限，不出现在侧栏。
     */
    products: [
      {
        key: 'general',
        title: '综合',
        icon: 'DataAnalysis',
        desc: '交付运营看板、审计与系统配置',
        menu: [
          { key: 'workbench', title: '运营看板', icon: 'Odometer', route: '/workbench' },
          { key: 'audit', title: '审计中心', icon: 'DocumentChecked', perm: 'audit.view', route: '/audit' },
          { key: 'admin', title: '系统配置', icon: 'Setting', perm: 'admin.all', route: '/admin' }
        ]
      },
      {
        key: 'p1',
        title: '需求受理与供给',
        icon: 'Tickets',
        desc: '需求申请、审批、变更、任务派发与服务交付',
        menu: [
          { key: 'demand-apply', title: '需求申请管理', icon: 'EditPen', perm: 'demand.apply', route: '/demand/apply' },
          { key: 'demand-list', title: '需求单管理', icon: 'Tickets', perm: 'demand.view.all', route: '/demand/list' },
          { key: 'demand-board', title: '需求全景看板', icon: 'DataLine', hide: true, perm: 'demand.view.all', route: '/demand/list' },
          { key: 'change-list', title: '需求变更管理', icon: 'Refresh', perm: 'demand.view.all', route: '/change/list' },
          { key: 'change-detail', title: '变更单详情', icon: 'Document', hide: true, perm: 'demand.view.all', route: '/change/list' },
          { key: 'change-calendar', title: '可视化变更窗口', icon: 'Calendar', hide: true, perm: 'demand.view.all', route: '/change/list' },
          { key: 'task-list', title: '任务管理', icon: 'Operation', perm: 'task.view', route: '/task/list' },
          { key: 'workflow', title: '工作流管理', icon: 'SetUp', perm: 'flow.view', route: '/workflow' },
          { key: 'delivery', title: '交付与授权', icon: 'Share', perm: 'delivery.view', route: '/delivery' }
        ]
      },
      {
        key: 'p2',
        title: '运维服务管理',
        icon: 'Service',
        desc: '事件、问题、发布与知识库',
        menu: [
          { key: 'incident-list', title: '事件管理', icon: 'Warning', perm: 'incident.handle', route: '/incident/list' },
          { key: 'incident-config', title: '事件分类与模板', icon: 'Grid', hide: true, perm: 'incident.dispatch', route: '/incident/config' },
          { key: 'problem-list', title: '问题管理', icon: 'QuestionFilled', perm: 'problem.manage', route: '/problem/list' },
          { key: 'release-list', title: '发布管理', icon: 'Promotion', perm: 'release.manage', route: '/release/list' },
          { key: 'kb-list', title: '知识库管理', icon: 'Reading', perm: 'kb.share', route: '/kb/list' },
          { key: 'kb-qna', title: '知识问答管理', icon: 'ChatLineSquare', hide: true, perm: 'kb.share', route: '/kb/qna' }
        ]
      },
      {
        key: 'p3',
        title: '服务窗口与度量',
        icon: 'Headset',
        desc: '统一受理、自助服务、评价与统计分析',
        menu: [
          { key: 'service-desk', title: '服务台管理', icon: 'Headset', perm: 'desk.manage', route: '/service-desk' },
          { key: 'selfservice', title: '自助服务管理', icon: 'Grid', perm: 'selfservice.view', route: '/selfservice' },
          { key: 'evaluation', title: '评价管理', icon: 'Star', perm: 'eval.view', route: '/evaluation' },
          { key: 'stats', title: '统计分析', icon: 'TrendCharts', perm: 'stat.view', route: '/stats' }
        ]
      }
    ],

    /*
     * 说明：功能点覆盖表现已收在右上角信息入口的抽屉里（抽屉唯一栏目），
     * 不再有「不在产品导航中暴露的页面」，因此这里为空数组。
     * 旧地址 /coverage 在 router/index.ts 中保留为兼容重定向。
     */
    hiddenRoutes: [],

    prefixes: {
      demands: 'XQ', changes: 'BG', tasks: 'RW', incidents: 'SJ', problems: 'WT',
      releases: 'FB', subscriptions: 'DY', evaluations: 'PJ', knowledges: 'ZS',
      qnas: 'WD', broadcasts: 'GB', audits: 'AUD'
    },

    todoRules: [
      { table: 'demands', kind: '数据需求', roles: ['desk'], statuses: ['PENDING_ACCEPT'], action: '受理需求单', route: '/demand/detail/:id', dueField: 'expectAt' },
      { table: 'demands', kind: '数据需求', roles: ['supplier'], statuses: ['PENDING_APPROVE'], action: '审批需求单', route: '/demand/detail/:id', dueField: 'expectAt' },
      /*
       * 审批通过后的实施入口：供数方在工作台待办里直接打开需求单派发生产任务。
       * 必要性：供数方的数据范围为「本组织」，需求单管理页默认只显示本组织单据，
       * 其他单位提交的需求单不会出现在列表里，只能在待办中触达（待办按状态推导，不受数据范围限制）。
       */
      { table: 'demands', kind: '数据需求', roles: ['supplier'], statuses: ['APPROVED'], action: '派发生产任务', route: '/demand/detail/:id', dueField: 'expectAt' },
      /*
       * 实施中的需求单：供数方从待办进入并「标记实施完成」。
       * 必要性：自助 / 邮件提交的需求单不派生生产任务，没有任务就没有"全部验证通过"的自动流转，
       * 处理人办结后无处提交验收 → 需求单会永远停在「实施中」。
       */
      { table: 'demands', kind: '数据需求', roles: ['supplier'], statuses: ['IMPLEMENTING'], action: '跟踪实施 / 标记实施完成', route: '/demand/detail/:id', dueField: 'expectAt' },
      { table: 'demands', kind: '数据需求', roles: ['consumer'], statuses: ['PENDING_ACCEPTANCE'], action: '需求验收', route: '/demand/detail/:id', dueField: 'expectAt' },
      { table: 'demands', kind: '数据需求', roles: ['consumer'], statuses: ['APPROVED', 'DELIVERED'], action: '提交评价', route: '/demand/detail/:id' },
      { table: 'changes', kind: '需求变更', roles: ['supplier'], statuses: ['PENDING_APPROVE'], action: '审批变更单', route: '/change/detail/:id', dueField: 'implementDate' },
      { table: 'tasks', kind: '生产任务', roles: ['producer'], statuses: ['PENDING_ACCEPT', 'PENDING_DISPATCH'], action: '接单并实施', route: '/task/detail/:id', dueField: 'planEnd' },
      { table: 'tasks', kind: '生产任务', roles: ['desk', 'supplier'], statuses: ['PENDING_VERIFY'], action: '验证任务成果', route: '/task/detail/:id', dueField: 'planEnd' },
      { table: 'subscriptions', kind: '订阅授权', roles: ['supplier'], statuses: ['PENDING'], action: '审批订阅申请', route: '/delivery/detail/:id' },
      { table: 'incidents', kind: '事件单', roles: ['ops'], statuses: ['NEW', 'DISPATCHED', 'PROCESSING'], action: '处理事件', route: '/incident/detail/:id', dueField: 'slaDueAt' },
      { table: 'incidents', kind: '事件单', roles: ['desk', 'ops'], statuses: ['ESCALATED'], action: '处置升级事件', route: '/incident/detail/:id', dueField: 'slaDueAt' },
      { table: 'problems', kind: '问题单', roles: ['ops'], statuses: ['NEW', 'ANALYZING', 'KNOWN_ERROR'], action: '推进问题处理', route: '/problem/detail/:id' },
      /*
       * 已解决的问题 → 创建发布申请（原文：由需求 / 问题驱动创建发布申请单）。
       * 原实现缺失该环节，导致剧本④第 5 步「由问题驱动创建发布申请」在界面上没有入口。
       */
      { table: 'problems', kind: '问题单', roles: ['ops'], statuses: ['RESOLVED'], action: '创建发布申请', route: '/problem/detail/:id' },
      { table: 'releases', kind: '发布单', roles: ['ops'], statuses: ['APPLYING', 'APPROVED', 'VERIFYING'], action: '执行发布 / 验证', route: '/release/detail/:id', dueField: 'releaseAt' },
      { table: 'knowledges', kind: '知识条目', roles: ['ops'], statuses: ['PENDING_REVIEW'], action: '审核知识条目', route: '/kb/detail/:id' },
      { table: 'qnas', kind: '知识问答', roles: ['ops'], statuses: ['ASKED'], action: '回答提问', route: '/kb/qna' },
      { table: 'evaluations', kind: '评价', roles: ['supplier'], statuses: ['PENDING_APPROVE'], action: '审批评价/反馈', route: '/evaluation/detail/:id' },
      { table: 'broadcasts', kind: '广播', roles: ['consumer', 'supplier', 'ops', 'producer', 'desk'], statuses: ['NEW'], action: '查看广播通知', route: '/service-desk' }
    ],

    scenarios: [
      {
        id: 'S1', name: '一条数据需求的完整旅程', icon: '①',
        desc: '提需求 → 受理 → 多级审批（含风险评估）→ 派发任务 → 工作流自动部署生成 API → 交付 → 评价 → 供数方反馈',
        covers: ['M1 需求申请管理', 'M2 需求单管理', 'M3 需求变更管理', 'M4 任务管理', 'M5 工作流管理', 'M12 评价管理'],
        steps: [
          { text: '进入「需求申请管理」，从资源目录中检索并选中一张三医主题库表', route: '/demand/apply' },
          { text: '按向导 4 步填写申请信息并提交，生成需求单', route: '/demand/apply' },
          { text: '切换到「服务台受理员」角色，在工作台受理该需求单', route: '/workbench', role: 'desk' },
          { text: '切换到「供数方」角色，在运营看板「我的待办」中打开该需求单并审批（查看风险评估）', route: '/workbench', role: 'supplier' },
          { text: '审批通过后，在同一待办中打开需求单派发生产任务（数据采集 / 加工 / 建模）；也可在需求单管理页切换为「全部」范围后按行派发', route: '/workbench', role: 'supplier' },
          { text: '切换到「生产实施方」角色，在「工作流管理」对已审核工单执行自动化部署，查看生成的 API 与文件', route: '/workflow', role: 'producer' },
          { text: '在「任务管理」跟踪生产部门实施进度', route: '/task/list', role: 'producer' },
          { text: '切换到「用数方」角色，验收交付物并提交评价', route: '/demand/list', role: 'consumer' },
          { text: '切换到「供数方」角色，查看评价并提交反馈', route: '/evaluation', role: 'supplier' }
        ]
      },
      {
        id: 'S2', name: '需求变更与冲突处置', icon: '②',
        desc: '变更单创建 → 风险评估 → 冲突分析检出 2 类冲突 → 调整实施计划并重新分析 → 供数方审批 → 变更窗口核对 → 实施完成并同步授权用户 → 审计留痕',
        covers: ['M3 需求变更管理', 'M5 工作流管理', 'S1 工作流引擎', 'S2 审计中心'],
        steps: [
          { text: '切换到「用数方」角色，在「需求变更管理」基于服务市场 / 事件创建变更单', route: '/change/list', role: 'consumer' },
          { text: '执行风险评估，查看基于 CMDB 的影响链路模拟（配置项 → 服务 → 租户）', route: '/change/list' },
          { text: '执行冲突分析，检出时间窗冲突与资源占用冲突，查看逐条处置建议', route: '/change/list' },
          { text: '在冲突分析结论中点「调整实施计划」，调整实施日期 / 实施者并「保存并重新分析冲突」', route: '/change/list' },
          { text: '提交审批；切换到「供数方」角色，在变更单列表「详情」或行操作「更多 → 审批」中审批通过', route: '/change/list', role: 'supplier' },
          { text: '在「可视化变更窗口」查看本变更与业务事件日程的叠加，确认无时间窗冲突', route: '/change/calendar' },
          { text: '开始实施并完成变更，系统向授权用户同步更新通知', route: '/change/list' },
          { text: '在「审计中心」查看变更前后字段值、修改人与时间（含实施计划的调整留痕）', route: '/audit' }
        ]
      },
      {
        id: 'S3', name: '一次线上故障的全过程', icon: '③',
        desc: '微信报障 → 自动分派 → 知识推荐命中 → 一线解决 → 回访调查 → 事件统计',
        covers: ['M6 事件管理', 'M9 知识库管理', 'M10 服务台管理', 'M13 统计分析'],
        steps: [
          { text: '在「自助服务管理」通过微信报障入口提交故障', route: '/selfservice' },
          { text: '事件按分类规则自动分派到运维组', route: '/incident-list' },
          { text: '处理事件时，系统按关键字自动推荐知识条目', route: '/incident-list' },
          { text: '记录解决方案并关闭事件（一线解决）', route: '/incident-list' },
          { text: '在「服务台管理」查看自动产生的回访调查', route: '/service-desk' },
          { text: '在「统计分析」按小时/日/周/月梯度查看事件统计', route: '/stats' }
        ]
      },
      {
        id: 'S4', name: '从事件到问题到发布', icon: '④',
        desc: '事件升级 → 开问题单 → 根因分析 → 已知错误临时方案 → 提交知识条目 → 开变更/发布 → 业务验证 → 发布审计',
        covers: ['M6 事件管理', 'M7 问题管理', 'M8 发布管理', 'M9 知识库管理'],
        steps: [
          { text: '切换到「运维工程师」角色，对重复出现的事件执行升级，并关联重复事件', route: '/incident-list', role: 'ops' },
          { text: '由事件单开出问题单，自动继承关联关系', route: '/problem-list', role: 'ops' },
          { text: '推进根因分析；暂时无法根治的转入已知错误流程并给出临时方案', route: '/problem-list', role: 'ops' },
          { text: '将问题解决方案提交为知识条目', route: '/kb-list', role: 'ops' },
          { text: '步骤 5 · 创建发布申请单：在问题单详情（问题管理 → 任一问题 → 详情）点右上角「创建发布申请」，自动带入问题号、根因与解决方案，确定升级内容与停机时间；也可在发布管理点「新建发布申请」，在「问题驱动」下拉中选择问题单', route: '/problem/list', role: 'ops' },
          { text: '步骤 6 · 执行升级与业务验证：发布管理 → 发布单详情 → 批复后「执行升级」（发布包自动归档）→ 逐项业务验证', route: '/release/list', role: 'ops' },
          { text: '发现重大问题执行回滚，或完成后进行发布审计闭环（验证项全部通过时，来源问题单会自动闭环）', route: '/release/list', role: 'ops' }
        ]
      },
      {
        id: 'S5', name: '服务台的一天', icon: '⑤',
        desc: '服务概况 → 统一受理（Web/邮件/自助三入口）→ 分派 → 广播通知 → 事件统计',
        covers: ['M10 服务台管理', 'M11 自助服务管理'],
        steps: [
          { text: '查看服务台概况：按事件类型、处理状态、处理人员、组织结构统计', route: '/service-desk' },
          { text: '统一受理三个入口提交的请求（Web 服务窗口 / 电子邮件 / 自助服务）', route: '/service-desk' },
          { text: '按事件分类自动分派或手工分派', route: '/service-desk' },
          { text: '向指定群组发送广播通知（站内 + 邮件 + 短信）', route: '/service-desk' },
          { text: '按小时 / 日 / 周 / 月 / 年梯度查看事件统计报表', route: '/service-desk' }
        ]
      },
      {
        id: 'S6', name: '知识沉淀闭环', icon: '⑥',
        desc: '提问 → 回答 → 最佳答案归档为知识 → 分类/责任人 → 检索（附件内容/引用次数）→ 评分评论',
        covers: ['M9 知识库管理'],
        steps: [
          { text: '在知识库检索不到答案时发起提问', route: '/kb-qna' },
          { text: '运维人员按线索回答问题', route: '/kb-qna' },
          { text: '有权限的用户选择最佳答案，归档转化为知识条目', route: '/kb-qna' },
          { text: '为知识条目设置分类与维护责任人', route: '/kb-list' },
          { text: '通过关键字 / 全文模糊 / 附件内容检索知识，查看引用次数', route: '/kb-list' },
          { text: '对知识评分与评论，评论自动发送给维护责任人', route: '/kb-list' }
        ]
      },
      {
        id: 'S7', name: '数据到手：交付与授权', icon: '⑦',
        desc: '需求审批通过 → 生成订阅单（回填需求工单号）→ 资源归属方审批 → 渠道授权 → 密钥发放 → 按需推送',
        covers: ['M1 需求申请管理', 'M2 需求单管理'],
        steps: [
          { text: '需求审批通过后，在需求单详情生成订阅单（自动回填需求工单号）', route: '/demand-list' },
          { text: '资源归属方审批订阅、配置渠道授权（使用范围 / 可见范围）', route: '/delivery' },
          { text: '为 API 服务订购方发放密钥', route: '/delivery' },
          { text: '按配送置执行数据推送（敏感资源走 SFTP），查看推送记录', route: '/delivery' },
          { text: '查看三类交付物：接口文档 / 库表访问途径 / 文件下载', route: '/demand-list' }
        ]
      },
      {
        id: 'S8', name: '安全合规把关', icon: '⑧',
        desc: '申请高敏感资源（L3）→ 自动带出分类分级结论 → 审批链增加多级安全审批 → 样例数据脱敏展示',
        covers: ['M1 需求申请管理', 'M2 需求单管理'],
        steps: [
          { text: '在需求申请中选择一张 L3 敏感资源，自动带出分类分级结论与脱敏算法', route: '/demand/apply' },
          { text: '预览样例数据：按配置规则前端脱敏后展示', route: '/demand/apply' },
          { text: '提交后审批链自动增加安全审批节点（多级安全审批人）', route: '/demand-list' },
          { text: '安全审批人通过系统或邮件渠道逐级审批', route: '/demand-list' },
          { text: '审批通过后授权范围受限，交付时记录水印与分发监控信息', route: '/delivery' }
        ]
      }
    ]
  };

/* ============================================================ 辅助方法 -- */
/**
 * 兼容两种调用方式：
 *   config.roleById('desk')       （点号，供页面直接使用）
 *   import { roleById } from '@/core/config'  （具名导入）
 * 因此既挂在 config 上，也单独导出。
 */
function _roleById(id: string): Role | null {
  return (config.roles as Role[]).find(r => r.id === id) ?? null
}
function _dictLabel(dict: string, key: string): string {
  const d = (config.dicts as Record<string, Record<string, { label: string }>>)[dict]
  return d?.[key]?.label ?? key ?? '—'
}
function _permLabel(perm: string): string {
  return (config.perms as Record<string, string>)[perm] ?? perm
}

Object.assign(config, { roleById: _roleById, dictLabel: _dictLabel, permLabel: _permLabel })

export const roleById = _roleById
export const dictLabel = _dictLabel
export const permLabel = _permLabel
export type { Role, RoleMatrixRow }
