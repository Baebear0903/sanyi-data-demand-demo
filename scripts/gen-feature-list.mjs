/**
 * gen-feature-list.mjs —— 由《数据需求管理-功能清单.md》生成 src/core/featureList.ts
 *
 * 用法：cd demo && node scripts/gen-feature-list.mjs
 *
 * 解析规则：
 *   · `## 1.2.6.3.1 xxx`        → level: root
 *   · `### 1.2.6.3.1.x xxx`     → level: module
 *   · `#### 1.2.6.3.1.x.y xxx`  → level: item
 *   · 标题下方到下一个标题之间的段落 = 该行的功能描述（原文，逐字保留）
 *   · 原文为空 → accept: false（覆盖表不给验收按钮，只承载层级）
 *
 * 计数硬校验：根 1 / 模块 11 / 条目 57，有原文 67 / 无原文 2。
 * 数字对不上说明 md 改了 —— 生成会失败，必须人工确认后再放开。
 *
 * 注意：输入是**本地开发仓库根目录**的功能清单（不随本仓库发布）。
 * 单独克隆本仓库时该文件不存在，无需运行本脚本 —— 生成结果 src/core/featureList.ts
 * 已随仓库提供，且 scripts/check-recipes.mjs 只校验生成结果、不依赖该源文档。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const MD = path.join(ROOT_DIR, '数据需求管理-功能清单.md')
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/core/featureList.ts')
const ROOT_CODE = '1.2.6.3.1'

const EXPECT = { root: 1, module: 11, item: 57, withText: 67, withoutText: 2 }

/* ------------------------------------------------------------------ 解析 -- */
if (!fs.existsSync(MD)) {
  console.error(
    `✗ 找不到功能清单：${MD}\n` +
      `  该文件是本地开发仓库的源文档，不随本仓库发布。\n` +
      `  如果你只是想用仓库里的覆盖表，无需运行本脚本：src/core/featureList.ts 已随仓库提供。`
  )
  process.exit(1)
}
const lines = fs.readFileSync(MD, 'utf8').split('\n')
const items = []
let cur = null
for (const l of lines) {
  const h = l.match(/^(#{2,4})\s+(1\.2\.6\.3\.1[0-9.]*)\s+(.+?)\s*$/)
  if (h) {
    if (cur) items.push(cur)
    cur = { lv: h[1].length, code: h[2], name: h[3], text: '' }
    continue
  }
  if (cur && l.trim() && !l.startsWith('#')) cur.text = (cur.text + ' ' + l.trim()).trim()
}
if (cur) items.push(cur)

/* ------------------------------------------------------------ 计数校验 -- */
const count = { root: 0, module: 0, item: 0, withText: 0, withoutText: 0 }
for (const it of items) {
  count[it.lv === 2 ? 'root' : it.lv === 3 ? 'module' : 'item'] += 1
  count[it.text.trim() ? 'withText' : 'withoutText'] += 1
}
for (const [k, v] of Object.entries(EXPECT)) {
  if (count[k] !== v) {
    console.error(`❌ 计数不符：${k} 期望 ${v}、实际 ${count[k]}`)
    console.error('   功能清单疑似被修改，请人工确认后更新本脚本的 EXPECT 再生成。')
    process.exit(1)
  }
}

/* -------------------------------------------------------------- 生成 TS -- */
const levelOf = lv => (lv === 2 ? 'root' : lv === 3 ? 'module' : 'item')
const shortOf = code => code.replace(ROOT_CODE, '').replace(/^\./, '') || '根'
const parentOf = code => {
  if (code === ROOT_CODE) return null
  const parts = code.split('.')
  return parts.length <= 4 ? ROOT_CODE : parts.slice(0, -1).join('.')
}
const q = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"

const blocks = items.map(it => {
  const text = it.text.trim()
  let b = `  {\n    code: ${q(it.code)},\n    short: ${q(shortOf(it.code))},\n    level: ${q(levelOf(it.lv))},`
  b += `\n    name: ${q(it.name)},\n    text: ${q(text)},\n    parent: ${parentOf(it.code) ? q(parentOf(it.code)) : 'null'},`
  b += `\n    accept: ${text ? 'true' : 'false'}`
  if (!text) b += ',\n    empty: true'
  if (it.code === `${ROOT_CODE}.7.3`) b += ',\n    malformed: true'
  return b + '\n  }'
})

const header = `/**
 * 功能清单真源 —— 由《数据需求管理-功能清单.md》解析生成，请勿手改
 *
 * 覆盖表的每一行都对应本文件的一条记录：
 *   · ${items.length} 行 = 根 ${count.root}（## ${ROOT_CODE}）+ 模块 ${count.module}（### ${ROOT_CODE}.x）+ 条目 ${count.item}（#### ${ROOT_CODE}.x.y）
 *   · 其中 ${count.withText} 行有原文（accept: true → 覆盖表给验收按钮），${count.withoutText} 行原文为空（根 与 .8 知识问答管理）
 *   · text 为该标题下的清单原文，逐字保留（scripts/check-recipes.mjs 会比对，禁止改写）
 *
 * 重新生成：node scripts/gen-feature-list.mjs（改完 md 后跑一次并提交本文件）
 */
export interface FeatureItem {
  /** 清单编号，如 '${ROOT_CODE}.4.7' */
  code: string
  /** 紧凑短号，如 '4.7'；根为 '根' */
  short: string
  /** 层级：根 / 模块 / 条目 */
  level: 'root' | 'module' | 'item'
  /** 功能名称（清单标题） */
  name: string
  /** 功能描述（清单原文，逐字）；原文为空时为空串 */
  text: string
  /** 上级编号（模块挂根、条目挂模块；根为 null） */
  parent: string | null
  /** 是否给验收按钮：原文非空即为 true */
  accept: boolean
  /** 原文为空（仅根与 .8 知识问答管理） */
  empty?: boolean
  /** 原文疑似截断，按字面保留不补全 */
  malformed?: boolean
}

export const featureItems: FeatureItem[] = [
`

const footer = `]

/** 可验收行（原文非空）：${count.withText} 行 */
export const checkableItems: FeatureItem[] = featureItems.filter(i => i.accept)

/** 某一行的直接子行（按清单顺序） */
export function childrenOf(code: string): FeatureItem[] {
  return featureItems.filter(i => i.parent === code)
}

/** 按编号取行 */
export function featureOf(code: string): FeatureItem | null {
  return featureItems.find(i => i.code === code) ?? null
}

/** 层级标签文案 */
export const LEVEL_LABEL: Record<FeatureItem['level'], string> = {
  root: '根',
  module: '模块',
  item: '条目'
}
`

fs.writeFileSync(OUT, header + blocks.join(',\n') + '\n' + footer)
console.log(`✅ 已生成 ${path.relative(ROOT_DIR, OUT)}`)
console.log(`   根 ${count.root} / 模块 ${count.module} / 条目 ${count.item} —— 有原文 ${count.withText}、无原文 ${count.withoutText}`)
