/**
 * attachments.ts —— 知识条目附件支撑内核（知识库管理 / 知识问答归档共用）
 *
 * 原文依据（1.2.7.3.1.7.4 知识条目检索）：
 *   「支持附件功能和附件的显示，允许把各类文件作为知识的附件，支持中文附件内容的搜索，
 *     可以搜索 pdf\word\ppt\txt 等类型的附件内容。」
 *
 * 演示系统是纯前端静态应用，没有后端文件存储，因此附件采用「读文件 → 抽取可检索文本 → 存入单据」
 * 的模拟方式：
 *   · 文本类（txt / md / csv / json / log 等）：直接读取文件全文作为可检索文本（中文可检索）；
 *   · 二进制类（pdf / word / ppt / xlsx）：尽力按 UTF-8 解码，过滤乱码后取可读片段；
 *   · 读取失败或不可解析时，退化为「文件名 + 类型 + 人工摘要」，保证附件内容检索始终可用。
 * 附件本体只保留名称 / 类型 / 大小 / 可检索文本四项，与 Knowledge.attachments 的结构一致，
 * 页面侧无需感知文件来源（真实上传 / 示例附件）。
 */

/** 知识附件（与 core/types.ts 中 Knowledge.attachments 元素结构保持一致） */
export interface KbAttachment {
  name: string
  type: string
  size: string
  contentText: string
}

/** 可抽取文本的长度上限，避免 localStorage 被大文件撑爆 */
export const ATTACH_TEXT_LIMIT = 6000

/** 扩展名 → 附件类型（原文点名的 pdf / word / ppt / txt 四类 + 表格与常见文本格式） */
const EXT_TYPE: Record<string, string> = {
  pdf: 'pdf',
  doc: 'word', docx: 'word', wps: 'word', rtf: 'word',
  ppt: 'ppt', pptx: 'ppt', dps: 'ppt',
  xls: 'xlsx', xlsx: 'xlsx', csv: 'xlsx', et: 'xlsx',
  txt: 'txt', md: 'txt', log: 'txt', json: 'txt', xml: 'txt', sql: 'txt', html: 'txt'
}

/** 取文件名中的扩展名（小写，不含点） */
export function extOf(name: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(String(name ?? ''))
  return m ? m[1].toLowerCase() : ''
}

/** 扩展名 → 附件类型，未知类型归入 txt 之外的中性类型（仍可参与检索） */
export function typeOf(name: string): string {
  return EXT_TYPE[extOf(name)] ?? 'file'
}

/** 字节数 → 可读大小（与演示数据中的 '486 KB' 风格一致） */
export function fmtSize(bytes: number): string {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/**
 * 从文件内容中抽取可检索文本。
 * @param raw  文件全文（二进制文件解码后可能含乱码）
 * @param name 文件名（用于结果为空时的兜底摘要）
 */
export function extractSearchText(raw: string, name: string): string {
  const text = String(raw ?? '')
  // 只保留中日韩、字母数字、常用标点与空白，剔除二进制乱码字符
  const cleaned = text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/g, ' ')
    .replace(/[^\u4e00-\u9fa5\u3000-\u303FA-Za-z0-9\s.,;:!?()[\]{}<>/\\|@#$%^&*\-_=+'"~`，。；：！？（）【】《》、·—…“”‘’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // 连续单字符（二进制噪声）占比过高时视为不可解析，使用兜底摘要
  const meaningful = cleaned.replace(/[^A-Za-z0-9\u4e00-\u9fa5]/g, '')
  if (meaningful.length < 8) {
    return `（${typeOf(name).toUpperCase()} 附件，正文不可直接解析，按文件名参与检索）${name}`
  }
  return cleaned.slice(0, ATTACH_TEXT_LIMIT)
}

/** 读取浏览器 File 对象 → 知识附件 */
export async function readFileAsAttachment(file: File): Promise<KbAttachment> {
  const name = file.name || '未命名附件'
  let raw = ''
  try {
    raw = await file.text()
  } catch {
    try {
      raw = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader()
        fr.onload = () => resolve(String(fr.result ?? ''))
        fr.onerror = () => reject(fr.error)
        fr.readAsText(file)
      })
    } catch {
      raw = ''
    }
  }
  return {
    name,
    type: typeOf(name),
    size: fmtSize(file.size),
    contentText: extractSearchText(raw, name)
  }
}

/**
 * 生成「示例附件」——不依赖真实文件，用于快速演示附件能力。
 * 演示系统无后端存储，示例附件与真实上传在数据结构上完全一致。
 */
export function sampleAttachment(kind: 'pdf' | 'word' | 'ppt' | 'txt' | 'xlsx', title: string, topic: string): KbAttachment {
  const meta: Record<string, { ext: string; size: string; label: string }> = {
    pdf: { ext: 'pdf', size: '486 KB', label: '排查清单' },
    word: { ext: 'docx', size: '1.2 MB', label: '处理流程' },
    ppt: { ext: 'pptx', size: '2.4 MB', label: '培训讲义' },
    txt: { ext: 'txt', size: '12 KB', label: '速查表' },
    xlsx: { ext: 'xlsx', size: '86 KB', label: '字段说明' }
  }
  const m = meta[kind] ?? meta.txt
  return {
    name: `${title}-${m.label}.${m.ext}`,
    type: kind,
    size: m.size,
    contentText: `${title} ${topic} ${m.label} 中文附件内容检索 关键字示例 处理步骤 校验规则 常见问题 责任分工`
  }
}
