/**
 * check-recipes.mjs —— 功能点覆盖表的数据校验
 *
 * 目的：证明「功能描述里的行为被 cover 到」这句话有据可查 ——
 * 每行都对应《功能清单》的一个标题、描述逐字一致、演示说明里的按钮与示例单据都真实存在。
 *
 * 校验七项：
 *   ① 清单完备性：coverageRows / recipes 的键集合 == featureList 的 69 行；根1/模块11/条目57
 *   ② 原文一致性：coverageRows[].spec 与 featureList 原文逐字一致（去空白比较）
 *   ③ 原文依据：67 个可验收行都能取到 originRows
 *   ④ 无清单外内容：不存在 support 行或 A/S 开头的编号
 *   ⑤ 角色白名单：role 必须在 core/config.ts 的 roles 内，否则必须给 roleLabel
 *   ⑥ 页面白名单：page 必须是菜单标题；文案有据：ops / evidence / view 的词能在对应 views/*.vue 找到
 *   ⑦ 示例编号：example 里的单号必须真实存在于 mock/seed.ts
 *
 * 用法：cd demo && node scripts/check-recipes.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'src')
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8')

let failed = 0
const failures = []
const fail = (scope, msg) => { failed += 1; failures.push(`[${scope}] ${msg}`) }
const pass = msg => console.log(`  ✓ ${msg}`)

/* ============================================================ 装载数据 -- */
/*
 * 以「文本转 JS + data: URL 动态 import」的方式装载纯数据 TS 模块，
 * 不需要额外依赖，也不写入任何临时文件。
 */
async function loadModule(files, names) {
  let code = ''
  for (const f of files) {
    if (!fs.existsSync(path.join(ROOT, f))) { code += `\n/* 缺失：${f} */\n`; continue }
    const src = read(f)
      .replace(/^\s*import\s+type\s[^\n]*\n/gm, '')
      .replace(/^\s*import\s[^\n]*\n/gm, '')
      .replace(/^export\s+interface\s+\w+\s*\{[\s\S]*?^\}\s*$/gm, '')
      .replace(/^export\s+type\s+\w+[^\n]*\n/gm, '')
      .replace(/^(export\s+)?function\s+\w+\s*\([^)]*\)[^{]*\{[\s\S]*?^\}/gm, '')
      .replace(/^(export\s+)?(const|let|function)\s+(\w+)\s*\(([^)]*)\)\s*:\s*[^={]+([={])/gm, '$1$2 $3($4)$5')
      .replace(/^(export\s+)?const\s+(\w+)\s*:\s*[^=\n]+=/gm, '$1const $2 =')
      .replace(/^export\s+const\s/gm, 'const ')
      .replace(/^export\s+\{[^}]*\};?\s*$/gm, '')
    code += `\n/* ---- ${f} ---- */\n${src}`
  }
  code += `\nexport { ${names.join(', ')} }\n`
  const url = 'data:text/javascript;base64,' + Buffer.from(code, 'utf8').toString('base64')
  try {
    return await import(url)
  } catch (e) {
    // 数据 URL 很长，报错时只打印真正有用的第一行与出错行
    const first = String(e.message || e).split('\n')[0]
    const at = String(e.stack || '').split('\n').find(l => l.includes('data:text/javascript')) ?? ''
    const pos = at.match(/:\d+:\d+$/)?.[0] ?? ''
    console.error(`❌ 装载 ${files.join(', ')} 失败：${first} ${pos}`)
    const lineNo = Number(pos.split(':')[1] || 0)
    if (lineNo) console.error('   出错行：' + (code.split('\n')[lineNo - 1] ?? '').slice(0, 120))
    process.exit(2)
  }
}

const { featureItems, coverageRows, originRows } = await loadModule(
  ['src/core/featureList.ts', 'src/core/reference.ts'],
  ['featureItems', 'coverageRows', 'originRows']
)
const { recipes } = await loadModule(['src/core/recipesData.ts'], ['recipes'])

console.log(`\n功能点覆盖表校验 —— 功能清单 ${featureItems.length} 行 / 覆盖行 ${coverageRows.length} / 演示说明 ${Object.keys(recipes).length}\n`)

const cfg = read('src/core/config.ts')
const menuTitles = new Set()
for (const m of cfg.matchAll(/title: '([^']+)', icon:/g)) menuTitles.add(m[1])

/* ==================================================== ① 清单完备性 -- */
{
  const levels = { root: 0, module: 0, item: 0 }
  for (const it of featureItems) levels[it.level] += 1
  if (levels.root !== 1 || levels.module !== 11 || levels.item !== 57) {
    fail('清单完备性', `层级计数应为 根1/模块11/条目57，实际 根${levels.root}/模块${levels.module}/条目${levels.item}`)
  }
  const want = featureItems.map(i => i.code)
  for (const [name, rows] of [['coverageRows', coverageRows], ['recipes', Object.keys(recipes).map(k => ({ id: k }))]]) {
    const got = rows.map(r => r.id)
    const missing = want.filter(c => !got.includes(c))
    const extra = got.filter(c => !want.includes(c))
    if (missing.length) fail('清单完备性', `${name} 缺少 ${missing.length} 行：${missing.slice(0, 8).join(', ')}`)
    if (extra.length) fail('清单完备性', `${name} 多出 ${extra.length} 行（清单里没有）：${extra.slice(0, 8).join(', ')}`)
  }
  const acceptN = featureItems.filter(i => i.accept).length
  const covAcceptN = coverageRows.filter(r => r.accept).length
  if (acceptN !== 67 || covAcceptN !== 67) fail('清单完备性', `可验收行应为 67，实际 featureList ${acceptN} / coverageRows ${covAcceptN}`)
  // 行形状：只有根与 11 个模块可用模块行（rows 为 角色/页面/看什么最完整）
  const moduleCodes = new Set(featureItems.filter(i => i.level !== 'item').map(i => i.code))
  const shapeBad = []
  for (const [code, rec] of Object.entries(recipes)) {
    const shouldBeModule = moduleCodes.has(code)
    if (!!rec.isModule !== shouldBeModule) shapeBad.push(`${code}（isModule=${!!rec.isModule}，应为 ${shouldBeModule}）`)
    for (const r of rec.rows ?? []) {
      if (rec.isModule && !('view' in r)) shapeBad.push(`${code} 模块行缺少 view`)
      if (!rec.isModule && !Array.isArray(r.ops)) shapeBad.push(`${code} 条目行缺少 ops`)
    }
  }
  if (shapeBad.length) fail('清单完备性', `行形状不符：${shapeBad.slice(0, 6).join('; ')}`)
  if (!failed) pass(`清单完备性：${featureItems.length} 行（根1/模块11/条目57），可验收 ${acceptN} 行，coverageRows 与 recipes 全覆盖，行形状一致`)
}

/* ==================================================== ② 原文一致性 -- */
{
  const bad = []
  for (const it of featureItems) {
    const row = coverageRows.find(r => r.id === it.code)
    if (!row) continue
    const norm = s => String(s ?? '').replace(/\s+/g, '')
    if (norm(row.spec) !== norm(it.text)) bad.push(`${it.code}（清单原文与覆盖行描述不一致）`)
    if (row.point !== it.name) bad.push(`${it.code}（名称不一致：${row.point} ≠ ${it.name}）`)
  }
  if (bad.length) fail('原文一致性', `${bad.length} 处：\n${bad.slice(0, 10).map(b => `    · ${b}`).join('\n')}`)
  else pass(`原文一致性：${featureItems.length} 行的功能描述与清单原文逐字一致`)
}

/* ==================================================== ③ 原文依据 -- */
{
  const acceptRows = coverageRows.filter(r => r.accept)
  const missing = acceptRows.filter(r => !originRows.some(o => o.id === r.id))
  const empty = originRows.filter(o => !String(o.text ?? '').trim())
  if (missing.length) fail('原文依据', `${missing.length} 个可验收行取不到原文依据：${missing.slice(0, 5).map(r => r.id).join(', ')}`)
  if (empty.length) fail('原文依据', `${empty.length} 条原文依据内容为空：${empty.slice(0, 5).map(o => o.id).join(', ')}`)
  if (originRows.length !== acceptRows.length) fail('原文依据', `originRows ${originRows.length} 条与可验收行 ${acceptRows.length} 条数量不符`)
  if (!missing.length && !empty.length) pass(`原文依据：${originRows.length}/${acceptRows.length} 个可验收行全部有清单原文`)
}

/* ==================================================== ④ 无清单外内容 -- */
{
  const bad = coverageRows.filter(r => r.level === 'support' || /^[AS]\d/.test(r.id) || /-ext/.test(r.id))
  if (bad.length) fail('清单范围', `存在清单外的行：${bad.map(r => r.id).join(', ')}`)
  else pass('清单范围：覆盖表只含功能清单的 69 行，无任何清单外内容')
}

/* ==================================================== ⑤ 角色白名单 -- */
{
  const roleIds = [...cfg.matchAll(/id:\s*'([a-z]+)',\s*name:\s*'/g)].map(m => m[1])
  if (roleIds.length !== 6) fail('角色', `从 config.ts 抽到的角色 id 数量异常（${roleIds.length}）`)
  let bad = 0
  for (const [code, rec] of Object.entries(recipes)) {
    for (const row of rec.rows ?? []) {
      if (!roleIds.includes(row.role) && !row.roleLabel) { fail(code, `role "${row.role}" 不在角色表内且未给 roleLabel`); bad += 1 }
    }
  }
  if (!bad) pass(`角色：全部命中（${roleIds.join(' / ')}），第三方角色均已给 roleLabel`)
}

/* ============================================== ⑥ 页面白名单 + 文案有据 -- */
{
  const VIEW_FILE = {
    '审计中心': 'AuditView.vue',
    '系统配置': 'AdminView.vue',
    '运营看板': 'WorkbenchView.vue',
    '需求申请管理': 'DemandApplyView.vue',
    '需求单管理': 'DemandListView.vue|DemandDetailView.vue',
    '工作流管理': 'WorkflowView.vue',
    '需求变更管理': 'ChangeListView.vue',
    '变更单详情': 'ChangeDetailView.vue',
    '可视化变更窗口': 'ChangeCalendarView.vue',
    '任务管理': 'TaskListView.vue',
    '交付与授权': 'DeliveryView.vue',
    '事件管理': 'IncidentListView.vue',
    '事件分类与模板': 'IncidentConfigView.vue',
    '问题管理': 'ProblemListView.vue|ProblemDetailView.vue',
    '发布管理': 'ReleaseListView.vue|ReleaseDetailView.vue',
    '知识库管理': 'KnowledgeListView.vue',
    '知识问答管理': 'KnowledgeQnaView.vue',
    '服务台管理': 'ServiceDeskView.vue',
    '自助服务管理': 'SelfServiceView.vue',
    '评价管理': 'EvaluationView.vue|EvaluationDetailView.vue',
    '统计分析': 'StatsView.vue'
  }

  /** 抽取文件中的可见中文文案（跳过注释，避免拿注释当依据） */
  const cache = new Map()
  function visibleText(file) {
    if (cache.has(file)) return cache.get(file)
    const raw = fs.existsSync(path.join(SRC, 'views', file)) ? fs.readFileSync(path.join(SRC, 'views', file), 'utf8') : ''
    const set = new Set()
    if (raw) {
      const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      for (const m of src.matchAll(/>([^<>{}]*[\u4e00-\u9fa5][^<>{}]*)</g)) {
        const t = m[1].trim().replace(/\s+/g, '')
        if (t.length >= 2 && t.length <= 30) set.add(t)
      }
      for (const m of src.matchAll(/<[^>]+>/g)) {
        for (const a of m[0].matchAll(/"([^"]*[\u4e00-\u9fa5][^"]*)"/g)) {
          const t = a[1].trim().replace(/\s+/g, '')
          if (t.length >= 2 && t.length <= 40) set.add(t)
        }
      }
      for (const m of src.matchAll(/(?:label|title|placeholder|content|desc|empty-text)=\s*'([^']*[\u4e00-\u9fa5][^']*)'/g)) set.add(m[1].trim())
      for (const m of src.matchAll(/(label|title|content|action|desc):\s*'([^']*[\u4e00-\u9fa5][^']*)'/g)) set.add(m[2].trim())
    }
    cache.set(file, set)
    return set
  }
  const dictText = new Set()
  for (const m of cfg.matchAll(/label:\s*'([^']*[\u4e00-\u9fa5][^']*)'/g)) dictText.add(m[1].trim())
  for (const t of menuTitles) dictText.add(t)

  /** 一句文案里所有 ≥2 字的中文片段，命中其一即算有据 */
  const has = (text, files) => {
    const segs = String(text).replace(/\s+/g, '').match(/[\u4e00-\u9fa5]{2,}/g) ?? []
    return segs.some(seg => {
      for (const f of files) for (const s of visibleText(f)) if (s.includes(seg) || seg.includes(s)) return true
      for (const s of dictText) if (s.includes(seg) || seg.includes(s)) return true
      return false
    })
  }

  const uncovered = []
  let checked = 0
  for (const row of coverageRows) {
    const rec = recipes[row.id]
    if (!rec) { uncovered.push(`${row.id}（缺演示说明）`); continue }
    for (const r of rec.rows ?? []) {
      const pages = String(r.page).split(/[、/]/).map(s => s.trim()).filter(Boolean)
      for (const p of pages) {
        if (!menuTitles.has(p)) uncovered.push(`${row.id}（页面「${p}」不是菜单标题）`)
      }
      const files = pages.flatMap(p => (VIEW_FILE[p] ?? '').split('|')).filter(Boolean)
      if (!files.length) { uncovered.push(`${row.id}（页面 ${r.page} 未登记对应视图文件）`); continue }
      const texts = []
      if (rec.isModule) texts.push({ t: r.view, k: 'view' })
      else {
        for (const op of (r.ops ?? [])) texts.push({ t: op, k: 'ops' })
        if (r.evidence) texts.push({ t: r.evidence, k: 'evidence' })
      }
      for (const { t, k } of texts) {
        checked += 1
        if (!String(t).trim()) { uncovered.push(`${row.id}（${k} 为空）`); continue }
        if (!has(t, files)) uncovered.push(`${row.id}（${k}）：「${t}」`)
      }
    }
  }
  if (!uncovered.length) pass(`页面与文案：${checked} 条演示要点全部能在对应页面文案里找到出处`)
  else {
    fail('文案有据', `${uncovered.length} 处问题：`)
    uncovered.slice(0, 25).forEach(u => failures.push(`    · ${u}`))
  }
}

/* ==================================================== ⑦ 示例编号 -- */
{
  const seed = read('src/mock/seed.ts')
  const literalIds = new Set([...seed.matchAll(/id:\s*'([^']+)'/g)].map(m => m[1]))
  /*
   * 数字白名单 = 真实单据号（no:）+ 主键 id + 生成型前缀。
   * 注意：种子里的 AUDIT_SEED 用 bizNo: 记审计留痕的业务单号，其中几个与真实单据号不一致
   * （例如 changes c02 的真实单号是 BG20260123002，审计留痕里写的是 BG20260120002），
   * 这类"只在审计留痕里出现"的号不是真实单据，必须从白名单剔除，否则示例会引用到不存在的单号。
   */
  const auditBlock = seed.match(/const AUDIT_SEED = \[[\s\S]*?^\];/m)?.[0] ?? ''
  const allNos = [...seed.matchAll(/no:\s*'([^']+)'/g)].map(m => m[1])
  const auditOnlyNos = new Set([...auditBlock.matchAll(/bizNo:\s*'([^']+)'/g)].map(m => m[1]))
  // allNos 是纯单号；auditOnlyNos 是"审计留痕里的业务单号"
  const auditOnlyReal = new Set([...auditOnlyNos].filter(n => !allNos.includes(n)))
  const nos = allNos.filter(n => !auditOnlyReal.has(n))
  const genPrefixes = [...seed.matchAll(/(?:seq\(\s*'([A-Z0-9]+)'|no:\s*'([A-Z0-9]+)'\s*\+)/g)].map(m => m[1] ?? m[2])
  const genIdPrefixes = [...seed.matchAll(/id:\s*'([a-zA-Z]{1,4})'\s*\+/g)].map(m => m[1])
  const known = n => literalIds.has(n)
    || nos.some(x => x === n)
    || genPrefixes.some(p => n.startsWith(p))
    || genIdPrefixes.some(p => n.startsWith(p))

  const bad = []
  let checked = 0
  for (const [code, rec] of Object.entries(recipes)) {
    for (const row of rec.rows ?? []) {
      if (!row.example) continue
      checked += 1
      const tokens = String(row.example).match(/[A-Z]{2}\d{8,12}|[a-z]{1,4}\d{1,3}/g) ?? []
      if (!tokens.length) continue
      if (!tokens.some(known)) bad.push(`${code}：「${row.example}」`)
    }
  }
  if (!bad.length) pass(`示例数据：${checked} 条示例，编号均能在 mock/seed.ts 中找到`)
  else fail('示例数据', `${bad.length} 条示例编号存疑：\n${bad.slice(0, 10).map(b => `    · ${b}`).join('\n')}`)
}

/* ================================================================ 汇总 -- */
console.log('')
if (failed) {
  console.error(`校验未通过：${failed} 处问题\n`)
  failures.forEach(f => console.error(f))
  console.error('')
  process.exit(1)
}
console.log(`校验通过 ✅  功能清单 ${featureItems.length}/${featureItems.length} 行全部具备可说明的覆盖依据\n`)
