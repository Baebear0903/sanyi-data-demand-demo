/**
 * serviceCatalog.ts —— 预定义需求类别的「类别 → 生成单据」映射（唯一真源）
 *
 * 原文 9.6：预定义故障与服务申请类别，按所选服务类型展现不同界面、要求输入相关信息、激活不同处理流程。
 * 「界面对哪些字段」由服务目录项的 formSchema 决定；「激活哪条流程」由 flowId 决定；
 * 而「生成哪类单据」只由类别决定 —— 该映射此前在自助服务页（建单分支 / 类别表）与服务台页各写了一份，
 * 收敛到这里，避免三处口径漂移。
 */
export type TicketKind = '需求单' | '事件单' | '能力申请单'

export const TICKET_KIND_BY_CATEGORY: Record<string, TicketKind> = {
  数据服务: '需求单',
  故障申诉: '事件单',
  权限服务: '能力申请单'
}

/** 取类别对应的单据类型；未知或新增的类别一律按「需求单」处理 */
export function ticketKindOf(category?: string): TicketKind {
  return TICKET_KIND_BY_CATEGORY[String(category ?? '')] ?? '需求单'
}
