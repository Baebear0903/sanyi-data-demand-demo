/**
 * artifacts.ts —— 工作流自动化部署的「产物生成」内核
 *
 * 从 WorkflowView 中抽出，供三处复用：
 *   · 工作流管理 → 自动化部署弹窗（实时生成并展示）
 *   · 工作流管理 → 部署记录「查看产物」（历史记录的快照，缺失时按同一算法重新生成）
 *   · 需求单详情 → 交付与授权页签的「本单部署产物」卡片
 *
 * 设计要点：
 *   · 生成结果完全由需求单字段 + 资源字段推导，**确定性**，因此历史记录可随时重新生成；
 *   · 部署成功时会把产物快照写入 deployRecords，保证"部署后文件有存放位置"。
 * 依据原文："对已审核的数据资源工单系统支持自动化工作流部署，自动生成对应的 API 接口以及相关文件"。
 */
import { config } from './config'
import { arr } from './utils'

/** 仅依赖 store 的两个只读方法，避免此处直接 import Pinia */
export interface StoreLike {
  findById(table: string, id: string): any
  table(name: string): any[]
}

export interface ArtifactFile {
  name: string
  /** 图标类型，与 base.css 的 .file-item__icon--* 对应 */
  type: 'txt' | 'xlsx' | 'word' | 'ppt' | 'pdf'
  size: string
  content: string
}

export interface DeployArtifacts {
  files: ArtifactFile[]
  serviceKind: 'API' | 'FILE'
  apiJson: string
  apiMd: string
}

export interface ApiParam {
  name: string; cn: string; type: string; required: boolean; remark: string
}

/* ------------------------------------------------------------ 命名规则 -- */
/** 单号 → 服务路径片段 */
export function pathOf(d: any): string {
  const first = String(d?.no ?? '').slice(-5).toLowerCase()
  return `${(first || 'demo')}_${String(d?.resources?.[0] ?? 'res').slice(-3)}`
}

export function serviceNameOf(store: StoreLike, d: any): string {
  const r = store.findById('resources', arr(d?.resources)[0] as string)
  return r ? `${r.name}查询服务（自动生成）` : `${d?.title}服务（自动生成）`
}

/** 依据需求单 fields 与资源 fields 真实生成入参 / 出参 */
export function buildParams(store: StoreLike, d: any) {
  const resFields: any[] = []
  for (const rid of arr(d?.resources) as string[]) {
    for (const f of arr((store.findById('resources', rid) as any)?.fields) as any[]) resFields.push(f)
  }
  const wanted = (arr(d?.fields) as string[]).filter(Boolean)
  const picked: any[] = []
  for (const name of wanted) {
    const hit = resFields.find(f => f.name === name)
    picked.push(hit ?? { name, cn: name, type: 'varchar(64)', sensitive: false })
  }
  const inputs: ApiParam[] = [
    { name: 'pageNo', cn: '页码', type: 'int', required: false, remark: '默认 1' },
    { name: 'pageSize', cn: '每页条数', type: 'int', required: false, remark: '默认 500，最大 2000' }
  ]
  const timeField = picked.find(p => /date|time|_at$/i.test(p.name))
  if (timeField) {
    inputs.push({ name: 'startDate', cn: '开始日期', type: 'date', required: true, remark: `对应 ${timeField.name}` })
    inputs.push({ name: 'endDate', cn: '结束日期', type: 'date', required: true, remark: `对应 ${timeField.name}` })
  }
  const outputs = picked.map(p => ({
    name: p.name,
    cn: p.cn ?? p.name,
    type: p.type ?? 'varchar(64)',
    sensitive: !!p.sensitive,
    remark: p.sensitive ? '按分类分级结果脱敏后返回' : ''
  }))
  return { inputs, outputs, resourceFields: resFields }
}

export function buildApiJson(store: StoreLike, d: any): string {
  const { inputs, outputs } = buildParams(store, d)
  const obj = {
    serviceName: serviceNameOf(store, d),
    serviceCode: `open_${pathOf(d)}`,
    path: `/open/api/v1/${pathOf(d)}`,
    method: 'POST',
    protocol: 'HTTPS + JSON',
    authType: 'appKey + appSecret 签名（HMAC-SHA256）',
    qps: 20,
    timeout: 30000,
    sourceDemand: d?.no,
    sourceResources: (arr(d?.resources) as string[]).map(rid => {
      const r = store.findById('resources', rid) as any
      return r ? { code: r.code, name: r.name, securityLevel: r.securityLevel } : { code: rid }
    }),
    desensitize: !!d?.desensitize,
    securityLevel: d?.securityLevel,
    request: {
      headers: { appKey: 'string, 必填', timestamp: 'string, 必填', sign: 'string, 必填' },
      body: inputs.map(i => ({ field: i.name, label: i.cn, type: i.type, required: i.required }))
    },
    response: {
      code: '0 成功 / 非 0 失败',
      data: { total: 'int', rows: outputs.map(o => ({ field: o.name, label: o.cn, type: o.type, masked: o.sensitive })) }
    }
  }
  return JSON.stringify(obj, null, 2)
}

export function buildArtifacts(store: StoreLike, d: any): DeployArtifacts {
  const { inputs, outputs } = buildParams(store, d)
  const primaryFields = arr(d?.fields) as string[]
  const apiMd = [
    `# ${serviceNameOf(store, d)} 接口文档`,
    ``,
    `- 关联需求工单：${d?.no}（${d?.title}）`,
    `- 请求地址：POST /open/api/v1/${pathOf(d)}`,
    `- 鉴权方式：appKey + appSecret 签名（HMAC-SHA256）`,
    `- 交付形式：${(config.dicts.DeliveryForm as any)[d?.deliveryForm]?.label ?? d?.deliveryForm}`,
    ``,
    `## 请求参数`,
    `| 字段 | 说明 | 类型 | 必填 |`,
    `| --- | --- | --- | --- |`,
    ...inputs.map(i => `| ${i.name} | ${i.cn} | ${i.type} | ${i.required ? '是' : '否'} |`),
    ``,
    `## 返回字段`,
    `| 字段 | 说明 | 类型 | 脱敏 |`,
    `| --- | --- | --- | --- |`,
    ...outputs.map(o => `| ${o.name} | ${o.cn} | ${o.type} | ${o.sensitive ? '是' : '否'} |`),
    ``,
    `> 返回字段依据需求单申请字段与资源字段定义自动生成，敏感字段按分类分级结果脱敏。`
  ].join('\n')

  const deliveryMd = [
    `# ${d?.title} 交付说明`,
    ``,
    `| 项 | 内容 |`,
    `| --- | --- |`,
    `| 需求工单号 | ${d?.no} |`,
    `| 申请方 | ${d?.applicant}（${d?.applicantOrg}） |`,
    `| 交付形式 | ${(config.dicts.DeliveryForm as any)[d?.deliveryForm]?.label ?? d?.deliveryForm} |`,
    `| 资源敏感级别 | ${(config.dicts.SecurityLevel as any)[d?.securityLevel]?.label ?? d?.securityLevel} |`,
    `| 是否脱敏 | ${d?.desensitize ? '是（按分类分级结果）' : '否'} |`,
    `| 更新频率 | ${d?.updateFreq} |`,
    `| 使用期限 | ${d?.usePeriod} |`,
    `| 交付字段 | ${primaryFields.join('、') || '—'} |`,
    ``,
    `## 交付物清单`,
    `1. 接口文档（api-doc.md）`,
    `2. 调度配置（schedule.json）`,
    `3. 脱敏规则（mask-rule.conf）`,
    `4. API 接口定义（api-define.json）`,
    ``,
    `## 使用方式`,
    `- 接口类：订阅方在「交付与授权」中发起订阅，资源归属方审批后发放 appKey / appSecret 调用。`,
    `- 文件类：按调度配置生成的文件通过 SFTP 下发至指定路径，敏感资源强制走 SFTP。`,
    `- 库表类：开通只读视图，按字段级脱敏规则授权访问。`
  ].join('\n')

  const scheduleJson = JSON.stringify({
    jobName: `job_${pathOf(d)}`,
    cron: d?.updateFreq === '实时' ? '*/5 * * * *' : d?.updateFreq === '每日增量' || d?.updateFreq === '每日' ? '0 2 * * *' : '0 3 * * 1',
    updateFreq: d?.updateFreq,
    timeRange: d?.timeRange,
    target: d?.deliveryForm === 'FILE' ? `/sftp/${pathOf(d)}/` : `doris://dwd.${pathOf(d)}`,
    retry: { times: 3, intervalSec: 300 },
    dependsOn: [`ods_${pathOf(d)}_incr`],
    alert: { channel: ['邮件', '站内'], to: ['数据生产中心', d?.applicant] }
  }, null, 2)

  const maskConf = [
    `# 脱敏规则（依据分类分级结果自动生成）  需求单：${d?.no}`,
    `mask.enable=${d?.desensitize ? 'true' : 'false'}`,
    `mask.level=${d?.securityLevel}`,
    ...outputs.filter(o => o.sensitive).map(o => `mask.field.${o.name}=掩码保留首尾（如 1101**********1001）`),
    outputs.some(o => o.sensitive) ? '' : '# 本次申请字段未命中敏感字段规则，交付内容不做额外掩码',
    `watermark.enable=true`,
    `watermark.text=${d?.applicantOrg}-${d?.no}`
  ].filter(Boolean).join('\n')

  const apiJson = buildApiJson(store, d)
  return {
    files: [
      { name: `${pathOf(d)}_交付说明.md`, type: 'txt', size: `${Math.max(2, Math.round(deliveryMd.length / 512))} KB`, content: deliveryMd },
      { name: `${pathOf(d)}_接口文档.md`, type: 'txt', size: `${Math.max(2, Math.round(apiMd.length / 512))} KB`, content: apiMd },
      { name: `${pathOf(d)}_调度配置.json`, type: 'xlsx', size: `${Math.max(1, Math.round(scheduleJson.length / 512))} KB`, content: scheduleJson },
      { name: `${pathOf(d)}_脱敏规则.conf`, type: 'word', size: '1 KB', content: maskConf },
      { name: `${pathOf(d)}_api-define.json`, type: 'ppt', size: `${Math.max(2, Math.round(apiJson.length / 512))} KB`, content: apiJson }
    ],
    serviceKind: d?.deliveryForm === 'FILE' ? 'FILE' : 'API',
    apiJson,
    apiMd
  }
}

/* --------------------------------------------------------- 部署记录辅助 -- */
/** 部署成功的需求单 id 集合（"已审核待部署"需据此排除已部署工单） */
export function deployedDemandIds(store: StoreLike): Set<string> {
  return new Set(
    store.table('deployRecords')
      .filter((r: any) => r.status === '成功')
      .map((r: any) => r.demandId)
  )
}

/** 某需求单的部署记录（按时间倒序） */
export function deployRecordsOf(store: StoreLike, demandId: string): any[] {
  return store.table('deployRecords')
    .filter((r: any) => r.demandId === demandId)
    .sort((a: any, b: any) => String(b.at).localeCompare(String(a.at)))
}

/** 某需求单最近一次部署的结论：未部署 / 已部署 / 部署失败 */
export function deployStateOf(store: StoreLike, demandId: string): { label: string; at: string; tone: 'neutral' | 'success' | 'danger' } {
  const recs = deployRecordsOf(store, demandId)
  if (!recs.length) return { label: '未部署', at: '', tone: 'neutral' }
  const latest = recs[0]
  if (latest.status === '成功') return { label: '已部署', at: latest.at, tone: 'success' }
  return { label: '部署失败', at: latest.at, tone: 'danger' }
}

/**
 * 取一条部署记录的产物：
 *   优先用部署时写入的快照（artifacts），种子 / 历史记录没有快照时按同一算法重新生成，
 *   保证任何一条部署记录都能"找到存放位置"。
 */
export function artifactsOfRecord(store: StoreLike, rec: any): DeployArtifacts | null {
  if (arr(rec?.artifacts).length) {
    const base = rec.demandId ? store.findById('demands', rec.demandId) : null
    return {
      files: rec.artifacts,
      serviceKind: rec.serviceKind === 'FILE' ? 'FILE' : 'API',
      apiJson: rec.artifacts.find((f: any) => /api-define/.test(f.name))?.content ?? '',
      apiMd: rec.artifacts.find((f: any) => /接口文档/.test(f.name))?.content ?? (base ? buildArtifacts(store, base).apiMd : '')
    }
  }
  const d = rec?.demandId ? store.findById('demands', rec.demandId) : null
  return d ? buildArtifacts(store, d) : null
}
