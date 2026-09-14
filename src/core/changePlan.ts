/**
 * changePlan.ts —— 变更「实施计划」的可编辑规则
 *
 * 原文要求："……支持调整实施计划后重新分析"（冲突分析的处置闭环）。
 * 规则集中在此处，变更列表、变更详情与调整抽屉三处共用，避免各写一份判断。
 *
 * 可调整状态：草稿 / 待审批（含撤回后重提）/ 已驳回 / 已撤回；
 * 已审批通过并进入实施的变更不允许直改，需走变更流程重新提交——否则会绕过审批留痕。
 */
export const CHANGE_PLAN_EDITABLE = ['DRAFT', 'PENDING_APPROVE', 'REJECTED', 'WITHDRAWN'] as const

/** 状态是否允许调整实施计划 */
export function planEditableStatus(c: any): boolean {
  return !!c && (CHANGE_PLAN_EDITABLE as readonly string[]).includes(c.status)
}

/**
 * 当前角色是否可调整实施计划
 * @param can 权限判定函数（通常传 pinia store 的 can）
 */
export function canEditChangePlan(can: (perm: string) => boolean, c: any): boolean {
  if (!planEditableStatus(c)) return false
  return can('demand.change') || can('demand.approve') || can('admin.all')
}
