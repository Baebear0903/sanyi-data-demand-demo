/**
 * types.ts —— 演示系统数据类型定义
 * 说明：为便于快速迭代，业务单据采用宽松结构（索引签名 + 常用字段），
 *      强类型约束集中在角色、字典、状态等需要静态校验的部分。
 */

/* ============================================================== 字典 -- */
export type TagTone =
  | 'primary' | 'success' | 'warning' | 'danger'
  | 'info' | 'purple' | 'teal' | 'neutral'

export interface DictItem { label: string; tag: TagTone }
export type Dict = Record<string, DictItem>

/* ============================================================== 主数据 -- */
export interface Org {
  id: string; name: string; short: string; type: string; role: string
}
export interface User {
  id: string; name: string; org: string; orgId: string
  title: string; phone: string; email: string
}
export interface Tenant {
  id: string; name: string; type: string; org: string
  apps: number; createdAt: string; status: string
}
export interface AppItem {
  id: string; name: string; tenantId: string; owner: string
  apiCount: number; fileCount: number; status: string
}

/* ============================================================== 资源 -- */
export interface ResourceField {
  name: string; cn: string; type: string; sensitive: boolean
}
export interface Resource {
  id: string; name: string; code: string
  type: 'MODEL' | 'API' | 'PARAM' | 'ALGO' | 'TAG' | 'METRIC' | 'RAW'
  layer: 'ODS' | 'DWD' | 'DWA' | 'DIM' | 'SRC'
  domain: string; source: string; owner: string
  securityLevel: 'L1' | 'L2' | 'L3' | 'L4'
  fields: ResourceField[]
  rowCount: number; updateFreq: string; publishedAt: string
  subscribeCount: number; star: number; viewCount: number; desc: string
}
export interface Classification {
  resourceId: string; category: string
  level: 'L1' | 'L2' | 'L3' | 'L4'; levelName: string
  maskAlgorithm: string; evaluatedAt: string; source: string
  ruleName: string; legalBasis: string; hitRules: string[]
}
export interface DataService {
  id: string; name: string
  kind: 'API' | 'FILE' | 'REALTIME'
  resourceId: string; publisher: string; status: string
  availability: string; serviceTime: string
  subscribeCount: number; callVolume: number; publishAt: string; desc: string
}
export interface CI {
  id: string; name: string
  type: string; owner: string; env: string
  dependsOn: string[]; relatedTenants: string[]; relatedServices: string[]
}

/* ============================================================== 流程 -- */
export interface WorkflowNode {
  key: string; name: string; role: string; slaHours: number
  actions: string[]; condition?: string
}
export interface WorkflowRule {
  level: number; approvers: string[]; mode: string; condition: string
}
export interface Workflow {
  id: string; name: string; bizType: string; version: string
  status: string; desc: string
  nodes: WorkflowNode[]; rules: WorkflowRule[]
  deployArtifacts?: unknown
}

/* ============================================================== 单据 -- */
export interface TimelineEntry {
  at: string; actor: string; action: string; comment?: string
}
export interface BaseDoc {
  id: string; no?: string; title?: string; name?: string
  status?: string; priority?: string
  createdAt?: string; updatedAt?: string
  timeline?: TimelineEntry[]
  [k: string]: unknown
}
export interface Demand extends BaseDoc {
  applicant: string; applicantOrg: string; tenantId: string
  scene: string; kind: 'EXISTING' | 'NEW'
  resourceType?: string; deliveryForm: string
  resources: string[]; fields?: string[]
  timeRange?: string; updateFreq?: string; usePeriod?: string; callVolume?: number
  desensitize: boolean; securityLevel: string
  source: string; templateId?: string
  relatedIncidentIds?: string[]; relatedProblemIds?: string[]
  taskIds?: string[]; changeIds?: string[]; subscriptionIds?: string[]
  evaluationId?: string; appId?: string | null
  submittedAt?: string | null; acceptedAt?: string; approvedAt?: string
  deliveredAt?: string; evaluatedAt?: string
  withdrawnAt?: string; cancelledAt?: string; rejectedAt?: string
  expectAt?: string | null; approver?: string; securityApprover?: string
  rejectReason?: string; cancelReason?: string
  currentHandler?: string
}
export interface DemandChange extends BaseDoc {
  demandId: string; demandNo: string; category: string
  implementDate: string; requestor: string; implementer: string; plan: string
  resources: string[]; riskLevel?: string
  impact?: { ciList: string[]; services: string[]; tenants: string[]; suggestion: string }
  conflicts?: { type: string; with: string; desc: string; suggestion: string }[]
  submittedAt?: string; approvedAt?: string; doneAt?: string
  withdrawnAt?: string; approver?: string; expectAt?: string
  relatedIncidentIds?: string[]; relatedProblemIds?: string[]
}
export interface Task extends BaseDoc {
  type: string; source: string; sourceId?: string; sourceNo?: string
  dept: string; assignee: string
  planStart: string; planEnd: string; progress: number
  content: string; deliverable: string; resources: string[]
  milestones: { name: string; planDate: string; doneDate?: string }[]
  relatedProblemIds: string[]
  verifyResult?: string; rejectReason?: string
}
export interface Subscription extends BaseDoc {
  demandNo: string; kind: 'API' | 'FILE' | 'REALTIME'
  serviceId: string; appId: string; tenantId: string
  fileConf?: Record<string, unknown>
  apiConf?: Record<string, unknown>
  rtConf?: Record<string, unknown>
  approveStatus: string; submittedAt?: string; approvedAt?: string
  rejectedAt?: string; unsubscribedAt?: string
  approver?: string; rejectReason?: string
  channelAuth?: { useScope: string[]; visibleScope: string[] } | null
  secret?: { appKey: string; appSecret: string; issuedAt: string; reissued?: boolean }
  pushLogs: Record<string, unknown>[]
}
export interface Incident extends BaseDoc {
  description: string; source: string
  categoryId: string; categoryName: string
  severity: string; impact: string; urgency: string
  ciIds: string[]; handler: string; handlerGroup: string
  slaDueAt: string; resolvedAt?: string | null; closeType?: string | null
  relatedIncidentIds: string[]; problemId?: string | null; changeId?: string | null
  broadcastIds: string[]; knowledgeRefs: string[]
  __hour?: number; __dayOffset?: number
}
export interface Problem extends BaseDoc {
  source: string; sourceIncidentIds: string[]
  severity: string; impact: string; urgency: string
  handler: string; dept: string
  rootCause: string
  knownError?: { workaround: string; permanentFixPlan: string; expireAt?: string }
  solution?: string; preventive?: string
  notifyChannels: string[]
  notifyLogs: { at: string; to: string; channel: string; content: string }[]
  relatedChangeIds: string[]; relatedCiIds: string[]
  knowledgeId?: string | null
  createdAt?: string; expectAt?: string; resolvedAt?: string; closedAt?: string
}
export interface Release extends BaseDoc {
  demandIds: string[]; changeIds: string[]
  /** 由问题驱动的发布：记录来源问题单（原文「由需求 / 问题驱动创建发布申请单」） */
  problemIds?: string[]
  changeContent: string; testResult: string
  releaseAt: string; downtime: string
  applicant: string; approver?: string | null; approvedAt?: string
  packages: { version: string; archivedAt: string; operator: string; remark: string }[]
  verifyItems: { name: string; result: string; remark?: string }[]
  rollback?: { at: string; reason: string; fromVersion: string; toVersion: string; operator: string }
  auditNote?: string; auditedAt?: string
}
export interface Knowledge extends BaseDoc {
  categoryId: string; categoryName: string; owner: string
  createdAt: string; publishedAt?: string; refCount: number
  contentText: string; contentHtml: string
  attachments: { name: string; type: string; size: string; contentText: string }[]
  ratings: { user: string; score: number; at: string }[]
  comments: { user: string; content: string; at: string; ownerNotified: boolean }[]
  relatedIds: string[]
}
export interface Qna extends BaseDoc {
  question: string; asker: string; askerOrg: string; askedAt: string
  answers: { id: string; user: string; content: string; at: string; clue: string; isBest?: boolean }[]
  archivedKnowledgeId?: string; archivedAt?: string
}
export interface Evaluation extends BaseDoc {
  demandId: string; demandNo: string
  evaluator: string; evaluatorOrg: string; score: number
  evaluatedAt: string; content: string
  dims: Record<string, number>
  approvedAt?: string | null; approver?: string; rejectReason?: string
  visibleTo: string
  feedback?: { id: string; user: string; content: string; at: string; status: string; approvedAt?: string } | null
}
export interface Callback extends BaseDoc {
  ticketType: string; ticketId: string; ticketNo: string
  score: number | null; comment: string; status: string
  sentAt: string; repliedAt?: string; to: string
}
export interface Broadcast extends BaseDoc {
  content: string
  targets: { type: string; ids: string[] }[]
  channels: string[]; sender: string; senderOrg: string
  sentAt: string; readBy: string[]; relatedId?: string
}
export interface AuditRecord extends BaseDoc {
  bizType: string; bizId: string; bizNo: string; bizTitle: string
  action: string
  changes: { field: string; before: string; after: string }[]
  remark: string
  operator: string; operatorOrg: string; operatedAt: string
  ip: string; terminal: string
}
export interface Message extends BaseDoc {
  type: string; body: string; at: string
  to: string[]; toRoles?: string[]; read: boolean
  channels: string[]; link: string
}

/* ============================================================== 其他 -- */
export interface CatalogItem {
  id: string; name: string; category: string; icon: string; banner: string
  desc: string; availability: string; serviceTime: string; flowId: string
  allowedRoles: string[]
  formSchema: { key: string; label: string; type: string; required: boolean; options?: string[] }[]
}
export interface KbCategory {
  id: string; name: string; dim: string; owner: string
  children: KbCategory[]
}
export interface IncidentCategory {
  id: string; name: string; group: string; autoAssign: string; keywords: string[]
}
export interface IncidentTemplate {
  id: string; name: string; categoryId: string
  severity: string; impact: string; urgency: string
  title: string; desc: string
}
export interface DecisionNode {
  type: 'q' | 'r'; text: string
  options?: { label: string; next: string }[]
  advice?: string; tags?: string[]
}
export interface DemandTemplate {
  id: string; name: string; category: string; desc: string
  preset: Record<string, unknown>
}
