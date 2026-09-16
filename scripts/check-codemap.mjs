/**
 * check-codemap.mjs —— CODEMAP.md 与源码的结构对齐校验
 *
 * 目的：地图是**派生数据**，过期地图比没有地图更危险（会让人按错误前提改动）。
 * 所以这里只校验**零歧义的结构事实**，不评判「一句话职责」的措辞：
 *
 *   ① 路由 ↔ 地图：router/index.ts 的每个 path，在 CODEMAP 里恰好出现一次，且绑定的文件正确
 *   ② 视图 ↔ 地图：src/views/*.vue 每个文件，要么被路由引用并出现在地图，要么出现在「没有路由引用」一节
 *   ③ 视图 ↔ 路由：router 引用的每个视图文件都真实存在（防拼写错误 / 防删文件漏改路由）
 *   ④ 内核 ↔ 地图：src/stores、src/core 的每个文件都在地图里被点名
 *   ⑤ 核验脚本：地图提到的 .tooling/ 脚本必须真实存在
 *
 * 用法：cd demo && node scripts/check-codemap.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const REPO = path.resolve(ROOT, '..')
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8')

let failed = 0
const failures = []
const fail = (scope, msg) => { failed += 1; failures.push(`[${scope}] ${msg}`) }
const pass = msg => console.log(`  ✓ ${msg}`)

/* ============================================================ 解析源码 -- */

/**
 * 解析 router/index.ts：[{ path, file }]（跳过 redirect 与 catch-all）
 *
 * 必须先按 `path:` 切块、再在块内找 component —— 早先用「path 之后 400 字符」的滑动窗口，
 * 窗口会跨过 `{ path: '/', redirect }` 这类没有 component 的记录，把它误判成一条路由。
 */
function parseRoutes() {
  const src = read('src/router/index.ts')
  const out = []
  const re = /path:\s*'([^']+)'/g
  let m
  const hits = []
  while ((m = re.exec(src))) hits.push({ path: m[1], at: m.index })
  hits.forEach((hit, i) => {
    if (hit.path.includes('pathMatch')) return
    const block = src.slice(hit.at, hits[i + 1]?.at ?? src.length)
    const comp = block.match(/component:\s*\(\)\s*=>\s*import\('@\/views\/([\w.]+)'\)/)
    if (!comp) return // redirect 记录：块内没有 component
    out.push({ path: hit.path, file: comp[1] })
  })
  return out
}

const viewFiles = fs.readdirSync(path.join(ROOT, 'src/views')).filter(f => f.endsWith('.vue')).sort()
const coreFiles = fs.readdirSync(path.join(ROOT, 'src/core')).filter(f => f.endsWith('.ts')).sort()
const storeFiles = fs.readdirSync(path.join(ROOT, 'src/stores')).filter(f => f.endsWith('.ts')).sort()
const routes = parseRoutes()
const codemap = read('CODEMAP.md')

/** 去掉 §四 之前的表格，避免「没有路由引用的文件」一节里的文件名污染路由检查 */
const referencedSection = codemap.split('## 四、')[0]

/**
 * 地图里是否点名了该文件。
 * 只按**文件名 + 非文件名边界**匹配：地图里既有裸名 `` `demo.ts` ``，也有带路径的
 * `` `src/views/PlaceholderView.vue` ``，反引号不一定紧贴文件名；
 * 边界不含 `/`，否则带路径的写法会漏判。排除 `.` `-` 以免 `XView.vue` 命中 `PreXView.vue`。
 */
const namesFile = f => new RegExp('(^|[^\\w.-])' + f.replace(/\./g, '\\.') + '($|[^\\w.-])').test(codemap)

/** 取出路径单元格为 `<route>` 的那一行 */
const routeRow = r => referencedSection.split('\n').find(l => l.includes('| `' + r + '` |')) ?? ''

const routePaths = routes.map(r => r.path)

/* ============================================================ ① 路由 → 地图 */
{
  const missing = []
  const wrongFile = []
  const duplicated = []
  for (const { path: p, file } of routes) {
    // 严格解析第 3 列：锚定第 2 列的路由路径，取紧随其后的那个反引号单元格。
    // 不能取「行内第 2 个反引号格」—— 职责列里可能还有 `/coverage`、核验列还有 `cdp-smoke`。
    const row = routeRow(p)
    const written = row.match(new RegExp('\\|\\s*`' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '`\\s*\\|\\s*`([^`]+)`'))?.[1]
    if (!row || !written) { missing.push(`${p} → ${file}`); continue }
    if (written !== file) wrongFile.push(`${p}：地图写 ${written}，实际 ${file}`)
    const occurrences = referencedSection.split('\n').filter(l => l.includes('| `' + p + '` |')).length
    if (occurrences > 1) duplicated.push(`${p}（${occurrences} 行）`)
  }
  if (!missing.length) pass(`路由 → 地图：${routes.length} 条路由全部有对应行`)
  else fail('路由 → 地图', `${missing.length} 条路由在地图里找不到：\n${missing.map(m => `    · ${m}`).join('\n')}`)
  if (!wrongFile.length) pass('路由 → 文件：地图绑定的视图文件与 router 一致')
  else fail('路由 → 文件', `绑定不一致：\n${wrongFile.map(m => `    · ${m}`).join('\n')}`)
  if (!duplicated.length) pass('路由 → 地图：无重复行')
  else fail('路由 → 地图', `同一路由出现多行：${duplicated.join('、')}`)

  // 行数守恒：被复用的视图要在每一节各占一行，漏掉一节时上面的按 path 检查查不出来
  const rowRefs = [...referencedSection.matchAll(/^\|[^|]*\|[^|]*\|\s*`([\w.]+\.vue)`/gm)].map(m => m[1])
  if (rowRefs.length === routes.length) pass(`地图行数守恒：${rowRefs.length} 行 = ${routes.length} 条路由`)
  else fail('地图行数守恒', `地图有 ${rowRefs.length} 行视图条目，路由有 ${routes.length} 条（复用视图需在每节各占一行）`)
}

/* ============================================================ ② 视图 → 地图 */
{
  // 注意：这里查**全文**（含 §四「没有路由引用的文件」），无路由的占位文件在那里登记
  const gone = viewFiles.filter(f => !namesFile(f))
  if (!gone.length) pass(`视图文件 → 地图：${viewFiles.length} 个 .vue 全部在地图中被点名`)
  else fail('视图文件 → 地图', `${gone.length} 个文件未被地图提及（新增或删除后未同步）：\n${gone.map(g => `    · src/views/${g}`).join('\n')}`)
}

/* ============================================================ ③ 路由 → 文件存在 */
{
  const missing = routes.filter(r => !fs.existsSync(path.join(ROOT, 'src/views', r.file)))
  if (!missing.length) pass(`路由 → 文件：${routes.length} 条路由引用的视图文件均存在`)
  else fail('路由 → 文件', `引用了不存在的视图文件：\n${missing.map(m => `    · ${m.path} → src/views/${m.file}`).join('\n')}`)
}

/* ============================================================ ④ 内核 → 地图 */
{
  const gone = [...storeFiles, ...coreFiles].filter(f => !namesFile(f))
  if (!gone.length) pass(`store / core → 地图：${storeFiles.length + coreFiles.length} 个文件全部被点名`)
  else fail('store / core → 地图', `${gone.length} 个文件未被地图提及：\n${gone.map(g => `    · ${g}`).join('\n')}`)
}

/* ============================================================ ⑤ 核验脚本存在 */
{
  // 地图里既可能写全名（`check-recipes.mjs`）也可能写运行器别名（`cdp-smoke`），两种都认。
  // 用「反向匹配」而不是枚举形态：凡是以 .mjs 结尾，或名字里带连字符且能对上
  // scripts/ 与 .tooling/ 下某个文件的名字，都算核验脚本名；对不上的就是漂移。
  const known = new Set()
  const collect = (dir, prefix = '') => {
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      if (f.isDirectory()) collect(path.join(dir, f.name), `${prefix}${f.name}/`)
      else if (f.name.endsWith('.mjs')) {
        known.add(f.name.slice(0, -4))
        known.add(`${prefix}${f.name.slice(0, -4)}`)
      }
    }
  }
  collect(path.join(REPO, '.tooling'))
  collect(path.join(ROOT, 'scripts'))

  const candidates = [...new Set([
    ...[...codemap.matchAll(/([\w-]+)\.mjs/g)].map(m => m[1]),
    ...[...codemap.matchAll(/`((?:e2e\/)?[a-z][\w-]*-[\w-]+)`/g)].map(m => m[1])
  ])]
  const gone = candidates.filter(n => !known.has(n))
  if (!gone.length) pass(`核验脚本 → 磁盘：地图提到的 ${candidates.length} 个脚本名均存在`)
  else fail('核验脚本 → 磁盘', `地图提到但磁盘上不存在：${gone.join('、')}\n    （若这是命令参数而非脚本名，请调整本项匹配规则）`)
}

/* ============================================================ ⑥ 复用关系 ⓐ */
{
  // 同一文件被两条以上路由使用时，地图每行都要带 ⓐ 标注，否则「改详情页」会走错文件
  const byFile = {}
  for (const r of routes) byFile[r.file] = (byFile[r.file] ?? 0) + 1
  const reused = Object.entries(byFile).filter(([, n]) => n > 1).map(([f]) => f)
  const noMark = reused.filter(f => routes.filter(r => r.file === f).some(r => !routeRow(r.path).includes('ⓐ')))
  if (!reused.length) pass('视图复用：当前无一条路由共用同一视图')
  else if (!noMark.length) pass(`视图复用：${reused.length} 个被复用的视图均有 ⓐ 标注（${reused.join('、')}）`)
  else fail('视图复用标注', `被多条路由共用但未标 ⓐ：${noMark.join('、')}（在该行的职责或文件列末尾加 ⓐ）`)
}

/* ============================================================ ⑥ 剧本 / 待办路由可达 */
{
  /*
   * config.ts 里的 route 字面量有两类消费者：演示剧本步骤与工作台待办（都走 router.push）。
   * 写错（如 /incident-list 而真实路径是 /incident/list）不会报错，只会被兜底路由静默送回运营看板，
   * 表现为「点了没反应」——因此在这里做一次静态对齐。
   */
  const cfg = read('src/core/config.ts')
  const literals = [...new Set([...cfg.matchAll(/route:\s*'([^']+)'/g)].map(m => m[1]))]
  const known = new Set(routePaths)
  const bad = literals.filter(r => {
    if (known.has(r)) return false
    // 待办规则用 `:id` 占位（`route.replace(':id', rec.id)`），按前缀匹配真实路由
    if (r.includes(':')) return !routePaths.some(p => p.startsWith(r.split(':')[0]) && p.includes(':'))
    return true
  })
  if (!bad.length) pass(`剧本 / 待办路由：${literals.length} 个 route 字面量均命中真实路由`)
  else fail('剧本 / 待办路由', `${bad.length} 个 route 字面量在 router 中不存在（会被兜底路由送回运营看板）：\n${bad.map(b => `    · ${b}`).join('\n')}`)
}

/* ================================================================ 汇总 -- */
console.log('')
if (failed) {
  console.error(`校验未通过：${failed} 处问题\n`)
  failures.forEach(f => console.error(f))
  console.error('\n提示：地图与代码不一致时以代码为准，请在同一次改动内把 CODEMAP.md 改对。\n')
  process.exit(1)
}
console.log(`校验通过 ✅  CODEMAP 与源码结构一致（路由 ${routes.length} 条 / 视图 ${viewFiles.length} 个）\n`)
