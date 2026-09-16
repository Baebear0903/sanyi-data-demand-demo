/**
 * utils.ts —— 通用工具（由 vanilla 版 util.js 迁移，框架无关）
 * 保留日期 / 数字 / 集合 / 格式化 / 掩码等纯函数，去掉 DOM 相关部分。
 */

/* ------------------------------------------------------------ 类型守卫 -- */
export const isArr = (v: unknown): v is unknown[] => Array.isArray(v)
export const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
export const isNil = (v: unknown): v is null | undefined => v === null || v === undefined
export const isFn = (v: unknown): v is (...a: any[]) => any => typeof v === 'function'

/* ---------------------------------------------------------------- 文本 -- */
export function truncate(s: unknown, n: number): string {
  const t = String(isNil(s) ? '' : s)
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}
export const pad2 = (n: number) => (n < 10 ? '0' + n : String(n))

/* ---------------------------------------------------------------- 日期 -- */
/**
 * 演示系统使用**双时钟**（两者的分工必须分清，混用会导致时间自相矛盾）：
 *
 * · `NOW` —— 运行时"当前时间"，取真实系统时间（模块加载时求值一次，同一次会话内稳定）。
 *   新增单据、审计留痕、单号日期段、SLA 剩余/超期、"今日/近 N 天"统计、图表窗口终点、
 *   待办时限、默认日期预填等**一切"现在"的口径**都用它。
 * · `SEED_ANCHOR` —— 种子"历史归档"数据的固定锚点，与真实时间无关，保证历史数据可复现。
 *   只有 `mock/seed.ts` 在生成**已终结/历史**记录时使用；未关闭记录与近 7 天小时桶另用
 *   真实时间锚定（见 seed.ts 的 live/withLive）。
 */
export const NOW = new Date()
/** 种子历史锚点：固定值，仅用于生成历史归档种子数据 */
export const SEED_ANCHOR = new Date('2026-08-31T10:30:00')

export function toDate(v: unknown): Date | null {
  if (v instanceof Date) return v
  if (isNil(v) || v === '') return null
  const d = new Date(String(v).replace(/\./g, '-').replace(' ', 'T'))
  return isNaN(d.getTime()) ? null : d
}
export function fmtDate(v: unknown): string {
  const d = toDate(v); if (!d) return '—'
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
export function fmtTime(v: unknown): string {
  const d = toDate(v); if (!d) return '—'
  return `${fmtDate(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
export function fmtShort(v: unknown): string {
  const d = toDate(v); if (!d) return '—'
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
export function fmtCN(v: unknown): string {
  const d = toDate(v); if (!d) return '—'
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}
/** 相对时间：3 小时前 */
export function fromNow(v: unknown, base?: unknown): string {
  const d = toDate(v); if (!d) return '—'
  const b = toDate(base) ?? NOW
  let s = Math.floor((b.getTime() - d.getTime()) / 1000)
  const future = s < 0; s = Math.abs(s)
  let out: string
  if (s < 60) return '刚刚'
  else if (s < 3600) out = Math.floor(s / 60) + ' 分钟'
  else if (s < 86400) out = Math.floor(s / 3600) + ' 小时'
  else if (s < 86400 * 30) out = Math.floor(s / 86400) + ' 天'
  else if (s < 86400 * 365) out = Math.floor(s / 86400 / 30) + ' 个月'
  else out = Math.floor(s / 86400 / 365) + ' 年'
  return future ? out + '后' : out + '前'
}
export function hoursAgo(v: unknown, base?: unknown): number {
  const d = toDate(v); if (!d) return 0
  const b = toDate(base) ?? NOW
  return (b.getTime() - d.getTime()) / 3600000
}
export const addDays = (v: unknown, n: number): Date => {
  const d = toDate(v) ?? new Date(NOW.getTime())
  const r = new Date(d.getTime()); r.setDate(r.getDate() + n); return r
}
export const addHours = (v: unknown, n: number): Date => {
  const d = toDate(v) ?? new Date(NOW.getTime())
  return new Date(d.getTime() + n * 3600000)
}
export const iso = (v?: unknown): string => fmtTime(toDate(v) ?? NOW)
export const today = (): string => fmtDate(NOW)

/* ------------------------------------------------------------ 数字格式 -- */
export const num = (v: unknown, dflt = 0): number => {
  const n = Number(v); return isNaN(n) ? dflt : n
}
export const pct = (a: unknown, b: unknown, digits = 1): string =>
  num(b) ? ((num(a) / num(b)) * 100).toFixed(digits) + '%' : '0%'
export const thousands = (v: unknown): string =>
  num(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
export function wan(v: unknown): string {
  const n = num(v)
  if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(2) + ' 亿'
  if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(1) + ' 万'
  return thousands(n)
}

/* ------------------------------------------------------------------ ID -- */
let seq = 0
export const uid = (prefix = 'id'): string => `${prefix}_${Date.now().toString(36)}_${++seq}`

/* -------------------------------------------------------------- 集合 -- */
export const deepClone = <T>(v: T): T => {
  if (isNil(v)) return v
  try { return JSON.parse(JSON.stringify(v)) as T } catch { return v }
}
export function get<T = unknown>(obj: unknown, path: string, dflt?: T): T {
  if (isNil(obj)) return dflt as T
  const parts = String(path).split('.')
  let cur: any = obj
  for (const p of parts) { if (isNil(cur)) return dflt as T; cur = cur[p] }
  return (isNil(cur) ? dflt : cur) as T
}
/** 排序（不改原数组） */
export function by<T>(arr: T[], key: string, dir: 'asc' | 'desc' = 'asc'): T[] {
  const d = dir === 'desc' ? -1 : 1
  return arr.slice().sort((x, y) => {
    const a1 = get<any>(x, key), b1 = get<any>(y, key)
    if (typeof a1 === 'string' && typeof b1 === 'string') {
      if (/^\d{4}-\d{2}-\d{2}/.test(a1) && /^\d{4}-\d{2}-\d{2}/.test(b1)) {
        return ((toDate(a1)?.getTime() ?? 0) - (toDate(b1)?.getTime() ?? 0)) * d
      }
      return a1.localeCompare(b1, 'zh') * d
    }
    if (isNil(a1)) return 1
    if (isNil(b1)) return -1
    return (a1 - b1) * d
  })
}
export const uniq = <T>(arr: T[]): T[] => Array.from(new Set(arr))
export function groupBy<T>(arr: T[], keyFn: string | ((it: T) => unknown)): Record<string, T[]> {
  const m: Record<string, T[]> = {}
  for (const it of arr ?? []) {
    const raw = typeof keyFn === 'function' ? keyFn(it) : get(it, keyFn)
    const k = isNil(raw) || raw === '' ? '—' : String(raw)
    ;(m[k] ||= []).push(it)
  }
  return m
}
export const sum = <T>(arr: T[], key?: string | ((it: T) => number)): number =>
  (arr ?? []).reduce<number>((s, it) => s + num(typeof key === 'function' ? key(it) : key ? get(it, key) : it), 0)
export function countBy<T>(arr: T[], key: string | ((it: T) => unknown)): Record<string, number> {
  const m: Record<string, number> = {}
  for (const it of arr ?? []) {
    const raw = typeof key === 'function' ? key(it) : get(it, key)
    const k = isNil(raw) || raw === '' ? '—' : String(raw)
    m[k] = (m[k] ?? 0) + 1
  }
  return m
}
export const find = <T>(arr: T[] | undefined, fn: (it: T, i: number) => boolean): T | undefined =>
  (arr ?? []).find(fn)
export const findById = <T extends { id?: string; no?: string }>(arr: T[] | undefined, id: string): T | undefined =>
  (arr ?? []).find(r => r.id === id || r.no === id)

/* ------------------------------------------------------------ 其他 -- */
export const debounce = <F extends (...a: any[]) => void>(fn: F, wait = 200) => {
  let t: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<F>) => {
    if (t) clearTimeout(t)
    t = setTimeout(() => fn(...args), wait)
  }
}
export const sortToggle = (cur: { key: string; dir: 'asc' | 'desc' }, key: string) =>
  cur.key === key ? { key, dir: (cur.dir === 'asc' ? 'desc' : 'asc') as 'asc' | 'desc' } : { key, dir: 'desc' as const }

/** 掩码工具（演示脱敏展示用） */
export const mask = {
  idcard: (v: unknown) => { const s = String(v ?? ''); return s.length < 8 ? s : s.slice(0, 4) + '**********' + s.slice(-4) },
  phone: (v: unknown) => { const s = String(v ?? ''); return s.length < 7 ? s : s.slice(0, 3) + '****' + s.slice(-4) },
  name: (v: unknown) => { const s = String(v ?? ''); return s.length < 2 ? s : s[0] + '*'.repeat(s.length - 1) },
  bank: (v: unknown) => { const s = String(v ?? '').replace(/\s/g, ''); return s.length < 8 ? s : s.slice(0, 4) + ' **** **** ' + s.slice(-4) }
}

export const or = (v: unknown, dflt = '—'): unknown => (isNil(v) || v === '' ? dflt : v)

/** 数组安全访问（类型保护） */
export const arr = <T>(v: T[] | undefined | null): T[] => (Array.isArray(v) ? v : [])

/* ------------------------------------------------ 演示基准时间工具 -- */
/**
 * 运行时"现在"统一取 NOW（真实系统时间，模块加载时求值一次）。
 * 历史归档种子数据另用 SEED_ANCHOR 生成，两者不可混用：
 * 新增记录、审计、单号、SLA、统计窗口一律用 NOW；只有种子历史数据用 SEED_ANCHOR。
 * 种子内容变化时需递增 config.version（localStorage 数据版本闸门），否则旧浏览器仍用旧种子。
 */
/** 当前演示时间戳（'YYYY-MM-DD HH:mm'） */
export const nowIso = (): string => iso(NOW)
/** 当前演示日期（'YYYY-MM-DD'） */
export const nowDate = (): string => fmtDate(NOW)
/** 当前演示日期紧凑格式（'YYYYMMDD'），用于拼接单号 */
export const nowStamp = (): string => fmtDate(NOW).replace(/-/g, '')
/** 基于演示时间偏移若干天的时间戳 */
export const nowIsoOffset = (days: number, hours = 0): string =>
  iso(new Date(NOW.getTime() + days * 86400000 + hours * 3600000))
/** 基于演示时间的唯一标识（避免用 Date.now() 造成时间戳泄入数据） */
let _seq = 0
export const demoUid = (prefix = 'id'): string => `${prefix}_${nowStamp()}_${(++_seq).toString(36)}`
