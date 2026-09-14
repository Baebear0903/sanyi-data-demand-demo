/**
 * recipes.ts —— 功能点「覆盖说明」的类型与入口
 *
 * 目的：验收时不需要把系统完整跑一遍，只要**在页面上看得见**对应的按钮 / 区块 / 页签，
 * 就认为功能描述里描述的行为被覆盖。所以每条配方只回答：
 *   ① 用哪个角色             row.role
 *   ② 到哪个系统的哪个页面     row.page（+ detail：详情页 / 隐藏页的两级路径）
 *   ③ 看得到什么 / 要做什么    row.ops + row.evidence（最简文字，不做一键跳转）
 *   ④ 对应的示例数据          row.example（真实种子记录编号，来自 mock/seed.ts）
 *
 * 模块行（清单的 11 个模块）不写具体操作，只回答「用哪个角色、在哪个页面能一次看全」：
 *   用 ModuleRow（role / page / view / example）。
 *
 * 文件分工：
 *   · core/featureList.ts  —— 功能清单真源（69 行，脚本生成）
 *   · core/reference.ts    —— 覆盖表：清单原文 + 实现说明 + 原文依据
 *   · core/recipesData.ts  —— 演示说明数据（纯数据，便于脚本静态校验）
 *   · core/recipeHelpers.ts—— 需要 config / roles 的展示辅助
 *   · scripts/check-recipes.mjs —— 校验键集合、角色、页面、文案出处、示例编号
 *
 * 数据来源纪律（改动配方前必读）：
 *   · page 只能取 core/config.ts 的菜单标题；
 *   · example 只能取 mock/seed.ts 中真实存在的单据；
 *   · ops / evidence / view 的词必须能在对应 src/views/*.vue 的模板或脚本字符串里找到。
 */
export type RecipeMode = 'demo' | 'operate'

/** 条目行：一个功能点可并列多条（多角色 / 多页面 / 多个证据面） */
export interface RecipeRow {
  /** 角色 id（consumer | supplier | desk | ops | producer | admin） */
  role: string
  /** 未包含在 6 个演示角色内时的显示名，如「多级安全审批人」 */
  roleLabel?: string | null
  /** 系统页面名：取 config 菜单标题 */
  page: string
  /** 页面不在侧栏菜单里（详情页 / 隐藏页）时，补一条两级导航路径 */
  detail?: string | null
  /** 1–3 条最简操作或观看要点（纯文字） */
  ops: string[]
  /** 页面上看得见的证据（按钮 / 区块 / 页签名） */
  evidence?: string | null
  /** 对应示例数据，如 “XQ20260112001 医保基金监管分析-门急诊费用与就诊明细申请” */
  example?: string | null
}

/** 模块行：只说明「哪个角色、在哪个页面、看什么最完整」 */
export interface RecipeModuleRow {
  role: string
  /** 该模块由哪些页面承载 */
  page: string
  /** 一句话：从哪个页面能一次看全该模块 */
  view: string
  example?: string | null
}

export interface Recipe {
  /** 模块行标记：rows 为 RecipeModuleRow[] */
  isModule?: boolean
  /** demo = 直接看已有种子数据即可；operate = 需要现场打一个样 */
  mode: RecipeMode
  /** 承载该功能的入口 / 区块名，如「统一受理台」「风险评估面板」 */
  surface?: string | null
  rows: RecipeRow[] | RecipeModuleRow[]
  note?: string | null
}

export { recipes } from './recipesData'
