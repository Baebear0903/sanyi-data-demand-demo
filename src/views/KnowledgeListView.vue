<script setup lang="ts">
/**
 * KnowledgeListView —— 知识库管理（含知识详情抽屉）
 *
 * 覆盖功能点：知识条目管理（创建 / 审核 / 发布 / 撤回的规范管理流程）、知识条目分类管理（按产品 / 用户群 / 业务领域 / 地点分类，
 * 知识可设定维护责任人）、编辑组件（丰富编辑环境、可嵌入图片、支持知识文档之间的引用）、
 * 知识条目检索（关键字检索、全文模糊匹配、附件内容检索、自动记录引用次数）、知识的评分和评论（评分按知识统计、评论发送给维护责任人）。
 */
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDemoStore } from '@/stores/demo'
import { config } from '@/core/config'
import { by, demoUid, fmtTime, fromNow, iso, nowStamp } from '@/core/utils'
import {
  readFileAsAttachment, sampleAttachment, type KbAttachment
} from '@/core/attachments'
import PageHead from '@/components/PageHead.vue'
import StatCards from '@/components/StatCards.vue'
import StatusTag from '@/components/StatusTag.vue'

const store = useDemoStore()
const router = useRouter()
const route = useRoute()

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'teal' | 'neutral'

/** 安全取数组（模板统一使用） */
const list = (v: unknown): any[] => (Array.isArray(v) ? v : [])

/* ------------------------------------------------------------ 基础数据 -- */
type DictLike = Record<string, { label: string }>
/** 字典转下拉选项（显式标注参数类型，避免 config.dicts 类型推断变化带来的噪音） */
const dictOptions = (d: DictLike) => Object.entries(d).map(([value, o]) => ({ value, label: o.label }))

const cats = computed(() => store.table('kbCategories') as any[])
const knowledges = computed(() => store.table('knowledges') as any[])
const users = computed(() => store.table('users') as any[])

const statusOptions = dictOptions(config.dicts.KnowledgeStatus)
const ownerOptions = computed(() => Array.from(new Set(knowledges.value.map(k => k.owner))).map(v => ({ value: v, label: v })))

/** 分类节点（含全部子孙节点）对应的知识条目 id 集合 */
function catIdsOf(node: any): string[] {
  return [node.id, ...list(node.children).flatMap((c: any) => catIdsOf(c))]
}
function countOf(node: any): number {
  const ids = catIdsOf(node)
  return knowledges.value.filter(k => ids.includes(k.categoryId)).length
}

const catTreeRef = ref<any>(null)
const selectedCat = ref<any>(null)
const selectedCatName = computed(() => selectedCat.value?.name ?? '全部分类')
/**
 * 选中状态单一数据源：selectedCat 驱动右侧列表过滤，同时把选中项同步给 Element Plus
 * 的 current-node-key。否则会出现"树里还高亮着某个分类、底部却已显示全部分类"的不一致。
 */
function onCatClick(node: any) {
  selectedCat.value = node
  catTreeRef.value?.setCurrentKey(node.id)
}
function clearCat() {
  selectedCat.value = null
  catTreeRef.value?.setCurrentKey(null)
}

/* ---------------------------------------------------- 知识分类维护 -- */
/** 分类维度（原文：可按产品、用户群、业务领域、地点等分类） */
const CAT_DIMS = ['产品', '用户群', '业务领域', '地点']
/** 与「知识条目编辑」同权限：能维护知识条目的人即可维护其分类 */
const canConfigCat = computed(() => store.can('kb.write'))

/**
 * 分类管理：一个入口 + 一个弹窗，对整棵目录做增删改与排序。
 * 编辑作用于草稿（catDraft），点「保存」才校验并写回，取消则完全不影响页面。
 */
const catOpen = ref(false)
const catDraft = ref<any[]>([])

/** 统计某节点（含子级）下的知识条目数 */
function draftCount(node: any): number {
  const ids = catIdsOf(node)
  return knowledges.value.filter(k => ids.includes(k.categoryId)).length
}
/** 在草稿树里定位节点，返回其所属的同级数组与下标（用于排序 / 删除） */
function locateInDraft(id: string, nodes: any[] = catDraft.value, parent: any = null): { list: any[]; index: number; parent: any } | null {
  for (let i = 0; i < list(nodes).length; i++) {
    const n = nodes[i]
    if (n.id === id) return { list: nodes, index: i, parent }
    const hit = locateInDraft(id, list(n.children), n)
    if (hit) return hit
  }
  return null
}
/** 把草稿树拍平成「路径 → 节点」映射，便于比对差异 */
function flattenCats(nodes: any[], prefix = ''): { id: string; path: string; name: string; dim: string }[] {
  const out: { id: string; path: string; name: string; dim: string }[] = []
  for (const n of list(nodes)) {
    const path = prefix ? `${prefix} / ${n.name}` : String(n.name)
    out.push({ id: n.id, path, name: String(n.name), dim: String(n.dim ?? '') })
    out.push(...flattenCats(list(n.children), path))
  }
  return out
}

function openCatManage() {
  if (!canConfigCat.value) { ElMessage.warning('当前角色无「知识条目编辑」权限，无法维护知识分类'); return }
  catDraft.value = JSON.parse(JSON.stringify(cats.value))
  catOpen.value = true
}
/** 新增子分类（挂在当前行下；顶级用「新增一级分类」） */
function draftAddChild(row: any | null) {
  const node = { id: demoUid('kc'), name: '', dim: row?.dim ?? CAT_DIMS[0], children: [] as any[] }
  if (row) {
    if (!Array.isArray(row.children)) row.children = []
    row.children.push(node)
  } else {
    catDraft.value.push(node)
  }
}
/** 同级上移 / 下移 */
function draftMove(row: any, delta: number) {
  const hit = locateInDraft(row.id)
  if (!hit) return
  const target = hit.index + delta
  if (target < 0 || target >= hit.list.length) return
  const [item] = hit.list.splice(hit.index, 1)
  hit.list.splice(target, 0, item)
}
/** 删除分类：其下（含子级）有知识条目时阻止，避免出现孤儿条目 */
function draftRemove(row: any) {
  const used = draftCount(row)
  if (used) {
    ElMessage.warning(`分类「${row.name || '未命名'}」下有 ${used} 条知识条目，请先调整条目归属后再删除`)
    return
  }
  const hit = locateInDraft(row.id)
  if (!hit) return
  hit.list.splice(hit.index, 1)
}
/** 保存：校验 → 写回 → 改名级联 → 审计留痕 */
function saveCatManage() {
  const flatBefore = flattenCats(cats.value)
  const flatAfter = flattenCats(catDraft.value)
  // 校验：名称非空、同级不重名
  const walk = (nodes: any[], path = ''): boolean => {
    const seen = new Set<string>()
    for (const n of list(nodes)) {
      const name = String(n.name ?? '').trim()
      if (!name) { ElMessage.warning(`「${path || '顶级分类'}」下存在未命名的分类`); return false }
      if (seen.has(name)) { ElMessage.warning(`「${path || '顶级分类'}」下存在重名分类「${name}」`); return false }
      seen.add(name)
      const childPath = path ? `${path} / ${name}` : name
      if (!walk(list(n.children), childPath)) return false
    }
    return true
  }
  if (!walk(catDraft.value)) return

  // 差异：新增 / 删除 / 改名 / 维度 / 顺序
  const beforeById = new Map(flatBefore.map(x => [x.id, x]))
  const afterById = new Map(flatAfter.map(x => [x.id, x]))
  const changes: { field: string; before: string; after: string }[] = []
  for (const a of flatAfter) {
    const b = beforeById.get(a.id)
    if (!b) changes.push({ field: '新增分类', before: '（空）', after: `${a.path}（维度 ${a.dim}）` })
    else if (b.name !== a.name || b.dim !== a.dim) changes.push({ field: `分类「${b.name}」`, before: `名称 ${b.name} · 维度 ${b.dim}`, after: `名称 ${a.name} · 维度 ${a.dim}` })
  }
  for (const b of flatBefore) if (!afterById.has(b.id)) changes.push({ field: '删除分类', before: b.path, after: '（已删除）' })
  if (flatBefore.map(x => x.path).join(' > ') !== flatAfter.map(x => x.path).join(' > ')
    && !changes.some(c => c.field === '新增分类' || c.field === '删除分类')) {
    changes.push({ field: '分类顺序', before: flatBefore.map(x => x.name).join(' > '), after: flatAfter.map(x => x.name).join(' > ') })
  }
  if (!changes.length) { catOpen.value = false; return }

  /* 写回：原地替换，保持 store 表引用不变 */
  cats.value.splice(0, cats.value.length, ...JSON.parse(JSON.stringify(catDraft.value)))
  /* 知识条目上冗余保存了分类名，改名时级联回写，避免「树上是新名、列表里是旧名」 */
  const renamed = new Map(flatAfter.map(a => [a.id, a.name]))
  knowledges.value.forEach(k => {
    const nm = renamed.get(String(k.categoryId))
    if (nm) k.categoryName = nm
  })
  /* 当前筛选的分类被删除时复位 */
  if (selectedCat.value && !cats.value.some((c: any) => catIdsOf(c).includes(selectedCat.value.id))) clearCat()
  store.addAudit({
    bizType: 'kbCategories', bizId: 'kb-category-tree', bizNo: '知识分类',
    bizTitle: `知识分类（${flatAfter.length} 个节点）`, action: '调整知识分类', changes
  })
  store.persist()
  catOpen.value = false
  ElMessage.success(`已保存分类调整（${changes.length} 处变更）`)
}

/** 在分类树中按 id 查找节点（支持任意层级） */
function findCat(id: string, nodes: any[] = cats.value): any {
  for (const n of list(nodes)) {
    if (n.id === id) return n
    const hit = findCat(id, list(n.children))
    if (hit) return hit
  }
  return null
}

/* -------------------------------------------------------------- 检索 -- */
const f = reactive({ kw: '', scope: 'TITLE' as 'TITLE' | 'FULL' | 'ATTACH', owner: '', status: '' })

const result = computed(() => {
  const kw = f.kw.trim().toLowerCase()
  const hits: Record<string, string[]> = {}
  const ids = selectedCat.value ? catIdsOf(selectedCat.value) : null
  const rows = by(knowledges.value.filter(k => {
    if (ids && !ids.includes(k.categoryId)) return false
    if (f.owner && k.owner !== f.owner) return false
    if (f.status && k.status !== f.status) return false
    if (kw) {
      if (f.scope === 'TITLE') {
        if (!String(k.title).toLowerCase().includes(kw)) return false
      } else if (f.scope === 'FULL') {
        const hay = `${k.title} ${k.contentText} ${String(k.contentHtml).replace(/<[^>]+>/g, '')} ${k.categoryName} ${k.owner}`.toLowerCase()
        if (!hay.includes(kw)) return false
      } else {
        const names = list(k.attachments)
          .filter(a => String(a.contentText).toLowerCase().includes(kw) || String(a.name).toLowerCase().includes(kw))
          .map(a => String(a.name))
        if (!names.length) return false
        hits[String(k.id)] = names
      }
    }
    return true
  }), 'createdAt', 'desc')
  return { rows, hits }
})
const filtered = computed(() => result.value.rows)
const attachHits = computed(() => result.value.hits)

function resetFilter() {
  Object.assign(f, { kw: '', scope: 'TITLE', owner: '', status: '' })
  clearCat()
}

function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
/** 命中关键字高亮（先转义再包裹 mark） */
function highlight(text: unknown, kw: string): string {
  const t = escapeHtml(text)
  if (!kw) return t
  const re = new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  return t.replace(re, '<mark class="hit">$1</mark>')
}

/* ---------------------------------------------------------- 指标卡 -- */
const stats = computed(() => {
  const rows = knowledges.value
  return [
    { label: '知识条目总数', value: rows.length, unit: '条', icon: 'Tickets', tone: 'primary' as Tone },
    { label: '已发布', value: rows.filter(k => k.status === 'PUBLISHED').length, unit: '条', icon: 'CircleCheck', tone: 'success' as Tone },
    { label: '待审核', value: rows.filter(k => k.status === 'PENDING_REVIEW').length, unit: '条', icon: 'EditPen', tone: 'warning' as Tone },
    { label: '累计引用次数', value: rows.reduce((s, k) => s + Number(k.refCount || 0), 0), unit: '次', icon: 'Link', tone: 'purple' as Tone, tip: '知识条目详情被打开时自动累加引用次数' },
    { label: '附件总数', value: rows.reduce((s, k) => s + list(k.attachments).length, 0), unit: '个', icon: 'Paperclip', tone: 'teal' as Tone },
    { label: '维护责任人', value: new Set(rows.map(k => k.owner)).size, unit: '人', icon: 'User', tone: 'info' as Tone }
  ]
})

/* ------------------------------------------------------- 评分工具 -- */
function avgScore(k: any): number {
  const rs = list(k.ratings)
  if (!rs.length) return 0
  return rs.reduce((s, r) => s + Number(r.score || 0), 0) / rs.length
}
const attachIcon = (type: string): string =>
  ({ pdf: 'Document', word: 'Tickets', ppt: 'DataBoard', txt: 'Memo', xlsx: 'Grid' } as Record<string, string>)[type] ?? 'Paperclip'

/* --------------------------------------------------------- 详情抽屉 -- */
const detailVisible = ref(false)
const currentId = ref('')
const current = computed<any>(() => (currentId.value ? store.findById('knowledges', currentId.value) : null))

const myScore = ref(0)
const commentDraft = ref('')

function openDetail(k: any) {
  currentId.value = k.id
  detailVisible.value = true
  myScore.value = 0
  commentDraft.value = ''
  // 打开详情时自动记录知识条目的引用次数
  store.update('knowledges', k.id, { refCount: Number(k.refCount || 0) + 1 }, { action: '引用计数 +1', skipAudit: true })
}

/** 内容渲染：清洗 + 知识文档之间的引用转为可点击链接 */
const rendered = computed(() => {
  const k = current.value
  if (!k) return ''
  const html = String(k.contentHtml ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '')
  return html.replace(/\[\[知识:([^\]]+)\]\]/g, (_m, title) =>
    `<a href="javascript:;" class="kb-ref" data-kb="${escapeHtml(title)}">知识：《${escapeHtml(title)}》</a>`)
})
function onRichClick(e: MouseEvent) {
  const target = e.target as HTMLElement | null
  const el = target?.closest?.('[data-kb]') as HTMLElement | null
  if (!el) return
  e.preventDefault()
  const title = el.getAttribute('data-kb') ?? ''
  const hit = knowledges.value.find(k => k.title === title)
  if (!hit) { ElMessage.warning(`未找到知识条目《${title}》`); return }
  openDetail(hit)
}

/** 支持通过路由 /kb/detail/:id 直接打开知识详情（工作台待办「审核知识条目」入口） */
function openById(id: string) {
  const k = knowledges.value.find(x => x.id === id || x.no === id)
  if (k) openDetail(k)
}
onMounted(() => { const rid = String(route.params.id ?? ''); if (rid) openById(rid) })
watch(() => route.params.id, v => { const rid = String(v ?? ''); if (rid) openById(rid) })

/** 评分统计 */
const ratingStats = computed(() => {
  const rs = list(current.value?.ratings)
  const dist = [5, 4, 3, 2, 1].map(n => ({ n, c: rs.filter(r => Number(r.score) === n).length }))
  const avg = rs.length ? rs.reduce((s, r) => s + Number(r.score || 0), 0) / rs.length : 0
  return { avg, count: rs.length, dist }
})

function submitRating() {
  const k = current.value
  if (!k) return
  if (!myScore.value) { ElMessage.warning('请先选择评分（1–5 星）'); return }
  const ratings = [...list(k.ratings), { user: store.user.name, score: myScore.value, at: iso() }]
  store.update('knowledges', k.id, { ratings }, { action: '知识评分', remark: `${myScore.value} 分` })
  ElMessage.success(`已提交评分 ${myScore.value} 分，评分按知识条目统计`)
  myScore.value = 0
}

function submitComment() {
  const k = current.value
  if (!k) return
  const content = commentDraft.value.trim()
  if (!content) { ElMessage.warning('请填写评论内容'); return }
  const comments = [...list(k.comments), { user: store.user.name, content, at: iso(), ownerNotified: true }]
  store.update('knowledges', k.id, { comments }, { action: '发表评论', remark: content.slice(0, 40) })
  // 评论需发送给维护责任人
  const ownerUser = users.value.find(u => u.name === k.owner)
  store.notify({
    type: 'info',
    title: `知识条目《${k.title}》收到新评论`,
    body: `${store.user.name} 评论：${content}（维护责任人：${k.owner}）`,
    to: ownerUser ? [String(ownerUser.id)] : [],
    toRoles: ['ops', 'admin'],
    channels: ['站内', '邮件'],
    link: '/kb/list'
  })
  store.pushTimeline(k, { action: '评论已发送给维护责任人', comment: `${k.owner}：${content}` })
  store.persist()
  commentDraft.value = ''
  ElMessage.success(`评论已发表，并已发送给维护责任人 ${k.owner}`)
}

/* ------------------------------------------------- 知识条目管理流程 -- */
function submitReview(k: any) {
  store.update('knowledges', k.id, { status: 'PENDING_REVIEW' }, { action: '提交审核', remark: '知识条目进入待审核' })
  store.pushTimeline(k, { action: '提交审核', comment: '按知识条目管理流程提交知识库维护责任人审核' })
  store.notify({ type: 'info', title: `知识条目 ${k.no} 待审核`, body: `《${k.title}》已提交审核，请维护责任人 ${k.owner} 审核发布。`, toRoles: ['ops', 'admin'], link: '/kb/list' })
  ElMessage.success('已提交审核，状态流转为「待审核」')
}
function approveKb(k: any) {
  ElMessageBox.prompt('请填写审核意见（审核通过后知识条目将发布，可被全文检索与引用）', `审核知识条目 ${k.no}`, {
    inputValue: '内容准确、可复用，同意发布。', inputType: 'textarea', confirmButtonText: '审核通过'
  }).then(({ value }) => {
    store.update('knowledges', k.id, { status: 'PUBLISHED', publishedAt: iso() }, { action: '审核通过', remark: value })
    store.pushTimeline(k, { action: '审核通过并发布', comment: value })
    store.notify({ type: 'success', title: `知识条目 ${k.no} 已发布`, body: `《${k.title}》已通过审核并发布。`, toRoles: ['ops', 'desk', 'consumer'], link: '/kb/list' })
    ElMessage.success('审核通过，知识条目已发布')
  }).catch(() => { /* 取消 */ })
}
function withdrawKb(k: any) {
  ElMessageBox.prompt('请填写撤回原因（撤回后不再对外检索展示，可修改后重新提交审核）', `撤回知识条目 ${k.no}`, {
    inputValue: '内容需结合实际案例补充后再发布。', inputType: 'textarea', confirmButtonText: '确认撤回'
  }).then(({ value }) => {
    store.update('knowledges', k.id, { status: 'WITHDRAWN' }, { action: '撤回知识条目', remark: value })
    store.pushTimeline(k, { action: '撤回', comment: value })
    store.persist()
    ElMessage.success('已撤回该知识条目')
  }).catch(() => { /* 取消 */ })
}

/* ----------------------------------------------------- 新建知识条目 -- */
const createVisible = ref(false)
const editorRef = ref<HTMLElement | null>(null)
const createForm = reactive({ title: '', categoryId: 'kc011', owner: '', contentText: '', attachments: [] as KbAttachment[] })
const refPickId = ref('')

/* --------------------------------------------------- 附件管理（创建） -- */
const createFileRef = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
/** 文件选择框：支持多选、任意类型（原文：允许把各类文件作为知识的附件） */
function pickCreateFiles() { createFileRef.value?.click() }
async function onCreateFiles(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (!files.length) return
  uploading.value = true
  try {
    for (const f of files) createForm.attachments.push(await readFileAsAttachment(f))
    ElMessage.success(`已添加 ${files.length} 个附件（已抽取可检索文本，支持中文附件内容搜索）`)
  } finally {
    uploading.value = false
    input.value = ''
  }
}
/** 示例附件：无需准备真实文件即可演示附件与附件内容检索 */
function addCreateSample() {
  const n = createForm.attachments.length + 1
  createForm.attachments.push(sampleAttachment(['pdf', 'word', 'txt', 'xlsx', 'ppt'][n % 5] as any,
    createForm.title.trim() || '知识条目', '附件内容检索'))
  ElMessage.success('已添加示例附件（可直接用于演示「附件内容检索」）')
}
function removeCreateAttach(i: number) { createForm.attachments.splice(i, 1) }

/* --------------------------------------------------- 附件管理（详情） -- */
const detailFileRef = ref<HTMLInputElement | null>(null)
function pickDetailFiles() { detailFileRef.value?.click() }
/** 已有条目补传附件：直接写回知识条目并留痕 */
async function onDetailFiles(e: Event) {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  const k = current.value
  if (!files.length || !k) { input.value = ''; return }
  uploading.value = true
  try {
    const added: KbAttachment[] = []
    for (const f of files) added.push(await readFileAsAttachment(f))
    store.update('knowledges', k.id, { attachments: [...list(k.attachments), ...added] },
      { action: '上传知识附件', remark: added.map(a => a.name).join('、') })
    store.pushTimeline(k, { action: '新增附件', comment: added.map(a => `${a.name}（${a.type.toUpperCase()} · ${a.size}）`).join('、') })
    ElMessage.success(`已上传 ${added.length} 个附件，可在「附件内容检索」中按内容命中`)
  } finally {
    uploading.value = false
    input.value = ''
  }
}
function addDetailSample() {
  const k = current.value
  if (!k) return
  const a = sampleAttachment('word', k.title, k.categoryName)
  store.update('knowledges', k.id, { attachments: [...list(k.attachments), a] },
    { action: '上传知识附件', remark: `${a.name}（示例附件）` })
  store.pushTimeline(k, { action: '新增附件', comment: `${a.name}（示例附件）` })
  ElMessage.success('已添加示例附件')
}
function removeDetailAttach(name: string) {
  const k = current.value
  if (!k) return
  ElMessageBox.confirm(`确认移除附件「${name}」？`, '移除附件', { confirmButtonText: '移除', cancelButtonText: '取消', type: 'warning' })
    .then(() => {
      store.update('knowledges', k.id, { attachments: list(k.attachments).filter((a: any) => a.name !== name) },
        { action: '移除知识附件', remark: name })
      store.pushTimeline(k, { action: '移除附件', comment: name })
      ElMessage.success('已移除附件')
    })
    .catch(() => { /* 取消 */ })
}

/** 可分叶子分类选项（分类只承载"维度划分"，维护责任人属于知识条目，不在分类上维护） */
const kbLeafOptions = computed(() => {
  const out: { id: string; name: string; leaf: string }[] = []
  for (const top of cats.value) {
    if (!list(top.children).length) out.push({ id: top.id, name: top.name, leaf: top.name })
    for (const c of list(top.children)) out.push({ id: c.id, name: `${top.name} / ${c.name}`, leaf: c.name })
  }
  return out
})

function insertHtml(html: string) {
  const el = editorRef.value
  if (!el) return
  el.focus()
  document.execCommand('insertHTML', false, html)
}
function cmd(command: string, value?: string) {
  const el = editorRef.value
  if (!el) return
  el.focus()
  document.execCommand(command, false, value)
}
/** 嵌入图片：插入内联 SVG data URI 图片（支持在正文中嵌入图片） */
function insertImage() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="120">'
    + '<rect x="1" y="1" width="358" height="118" rx="6" fill="#eef3f9" stroke="#b9cde4"/>'
    + '<text x="180" y="66" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#1f4e8c">图片占位（知识条目可嵌入图片）</text></svg>'
  insertHtml(`<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}" alt="图片" />`)
  ElMessage.success('已插入图片（内联 SVG 占位图）')
}
/** 知识文档之间的引用：插入 [[知识:标题]]，渲染为可点击跳转链接 */
function insertKnowledgeRef() {
  const k = knowledges.value.find(x => x.id === refPickId.value)
  if (!k) { ElMessage.warning('请先选择要引用的知识条目'); return }
  insertHtml(`[[知识:${k.title}]]`)
  ElMessage.success(`已插入对《${k.title}》的引用`)
}

function openCreate() {
  Object.assign(createForm, { title: '', categoryId: 'kc011', owner: users.value[0]?.name ?? store.user.name, contentText: '' })
  refPickId.value = ''
  createForm.attachments = []
  createVisible.value = true
  nextTick(() => { if (editorRef.value) editorRef.value.innerHTML = '' })
}
function saveKnowledge() {
  const el = editorRef.value
  const html = el ? el.innerHTML : ''
  const text = el ? (el.innerText || '').replace(/\s+/g, ' ').trim() : ''
  if (!createForm.title.trim()) { ElMessage.warning('请填写知识条目标题'); return }
  if (!text && !createForm.contentText.trim()) { ElMessage.warning('请填写知识条目正文'); return }
  const cat = kbLeafOptions.value.find(c => c.id === createForm.categoryId)
  const rows = knowledges.value
  // 附件文本并入全文检索字段，保证新建条目后即可用「全文模糊检索 / 附件内容检索」命中
  const attachText = createForm.attachments.map(a => a.contentText).join(' ')
  const kb = store.insert('knowledges', {
    no: `${config.prefixes.knowledges}${nowStamp().slice(0, 6)}${String(rows.length + 1).padStart(4, '0')}`,
    title: createForm.title.trim(),
    categoryId: createForm.categoryId,
    categoryName: cat?.leaf ?? '数据需求管理',
    owner: createForm.owner || store.user.name,
    status: 'DRAFT',
    refCount: 0,
    contentText: `${createForm.contentText.trim() || text.slice(0, 200)} ${attachText}`.trim(),
    contentHtml: html || `<p>${escapeHtml(createForm.contentText)}</p>`,
    attachments: [...createForm.attachments], ratings: [], comments: [], relatedIds: []
  })
  store.pushTimeline(kb, {
    action: '创建知识条目',
    comment: `分类：${cat?.name ?? '—'}；维护责任人：${kb.owner}；状态：草稿；附件 ${createForm.attachments.length} 个`
  })
  createVisible.value = false
  ElMessage.success(`已创建知识条目 ${kb.no}（草稿），可提交审核后发布`)
}
</script>

<template>
  <div>
    <PageHead title="知识库管理" desc="知识库是两大基础数据库之一：通过知识条目的创建 / 审核 / 发布 / 撤回规范管理，提高故障的一线解决率。">
      <template #actions>
        <el-button @click="router.push('/kb/qna')"><el-icon><ChatDotRound /></el-icon> 知识问答管理</el-button>
        <el-button type="primary" @click="openCreate"><el-icon><Plus /></el-icon> 新建知识条目</el-button>
      </template>
    </PageHead>

    <StatCards :items="stats" />

    <div class="grid grid--side-l">
      <!-- 左：分类树 -->
      <div class="card">
        <div class="card__head">
          <span class="card__title">知识分类</span>
          <span class="card__spacer" />
          <el-button v-if="selectedCat" link type="primary" size="small" @click="clearCat">清除</el-button>
          <el-button size="small" type="primary" plain :disabled="!canConfigCat" @click="openCatManage">
            <el-icon><EditPen /></el-icon> 编辑
          </el-button>
        </div>
        <div class="card__body">
          <el-tree
            ref="catTreeRef" class="cat-tree"
            :data="cats" node-key="id" default-expand-all highlight-current
            :expand-on-click-node="false"
            :props="{ label: 'name', children: 'children' }" @node-click="onCatClick"
          >
            <template #default="{ node, data }">
              <span class="cat-node">
                <span class="cat-node__name">{{ data.name }}</span>
                <span v-if="node.level === 1" class="cat-node__dim">{{ data.dim }}</span>
                <span class="cat-node__count">{{ countOf(data) }} 条</span>
              </span>
            </template>
          </el-tree>
        </div>
      </div>

      <!-- 右：检索 + 列表 -->
      <div class="card">
        <div class="toolbar">
          <div class="toolbar__fields">
            <div class="field"><span class="field__label">关键字</span>
              <el-input v-model="f.kw" placeholder="标题 / 正文 / 附件内容" clearable style="width: 210px" />
            </div>
            <div class="field"><span class="field__label">检索范围</span>
              <el-select v-model="f.scope" style="width: 150px">
                <el-option label="标题检索" value="TITLE" />
                <el-option label="全文模糊检索" value="FULL" />
                <el-option label="附件内容检索" value="ATTACH" />
              </el-select>
            </div>
            <div class="field"><span class="field__label">维护责任人</span>
              <el-select v-model="f.owner" placeholder="全部" clearable style="width: 130px">
                <el-option v-for="o in ownerOptions" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </div>
            <div class="field"><span class="field__label">状态</span>
              <el-select v-model="f.status" placeholder="全部状态" clearable style="width: 130px">
                <el-option v-for="o in statusOptions" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </div>
          </div>
          <div class="toolbar__actions">
            <el-button @click="resetFilter">重置</el-button>
          </div>
        </div>

        <div v-if="f.scope === 'ATTACH'" class="text-xs muted" style="margin: 12px 20px 0">
          当前为「附件内容检索」：在附件的可检索文本（contentText）中匹配关键字，支持中文附件内容搜索（pdf / word / ppt / txt / xlsx），
          命中的附件名会在结果中高亮显示。附件在「新建知识条目 → 附件」或知识条目详情 →「上传附件」中添加，也可用「添加示例附件」快速演示。
        </div>

        <div class="card__body card__body--flush">
          <el-table :data="filtered" style="width: 100%" row-key="id" @row-click="openDetail">
            <el-table-column label="知识条目标题" min-width="270">
              <template #default="{ row }">
                <el-button link type="primary" @click.stop="openDetail(row)">{{ row.title }}</el-button>
                <div class="cell-sub">{{ row.no }} · 更新于 {{ fmtTime(row.updatedAt || row.publishedAt || row.createdAt) }}（{{ fromNow(row.updatedAt || row.publishedAt || row.createdAt) }}）</div>
                <div v-if="attachHits[String(row.id)]" class="attach-hit">
                  命中附件：
                  <span v-for="n in attachHits[String(row.id)]" :key="n" class="attach-hit__item" v-html="highlight(n, f.kw)" />
                </div>
              </template>
            </el-table-column>
            <el-table-column label="分类" width="150" show-overflow-tooltip>
              <template #default="{ row }">
                <div>{{ row.categoryName }}</div>
                <div class="cell-sub">{{ row.categoryId }}</div>
              </template>
            </el-table-column>
            <el-table-column label="维护责任人" width="106">
              <template #default="{ row }">{{ row.owner }}</template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }"><StatusTag dict="KnowledgeStatus" :value="row.status" /></template>
            </el-table-column>
            <el-table-column label="引用次数" width="98" align="right">
              <template #default="{ row }"><span class="mono bold">{{ row.refCount }}</span> <span class="text-xs muted">次</span></template>
            </el-table-column>
            <el-table-column label="平均评分" width="150">
              <template #default="{ row }">
                <el-rate :model-value="Math.round(avgScore(row) * 2) / 2" disabled allow-half size="small" />
                <div class="cell-sub">{{ avgScore(row) ? avgScore(row).toFixed(1) : '暂无' }} 分 · {{ list(row.ratings).length }} 人评分</div>
              </template>
            </el-table-column>
            <el-table-column label="附件" width="76" align="center">
              <template #default="{ row }">
                <span :title="list(row.attachments).map(a => a.name).join('、')">{{ list(row.attachments).length }} 个</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="160" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" size="small" @click.stop="openDetail(row)">查看</el-button>
                <el-button v-if="row.status === 'DRAFT'" link size="small" @click.stop="submitReview(row)">提交审核</el-button>
                <el-button v-if="row.status === 'PENDING_REVIEW' && store.can('kb.review')" link type="success" size="small" @click.stop="approveKb(row)">审核通过</el-button>
                <el-button v-if="row.status === 'PUBLISHED' && store.can('kb.review')" link type="danger" size="small" @click.stop="withdrawKb(row)">撤回</el-button>
              </template>
            </el-table-column>
            <template #empty>
              <div class="empty-box">
                <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
                <div class="empty-box__text">没有符合条件的知识条目（可切换检索范围或清除筛选）</div>
              </div>
            </template>
          </el-table>
        </div>

        <div class="card__foot">
          <span class="text-sm muted">共 <b>{{ filtered.length }}</b> 条知识条目 · 当前分类「{{ selectedCatName }}」</span>
        </div>
      </div>
    </div>

    <!-- ------------------------------------------------- 知识详情抽屉 -- -->
    <el-drawer v-model="detailVisible" :title="current ? `知识条目 ${current.no}` : '知识条目详情'" size="820px">
      <template v-if="current">
        <div class="flex items-center gap-2 wrap mb-3">
          <StatusTag dict="KnowledgeStatus" :value="current.status" />
          <StatusTag dict="" :label="current.categoryName" tone="info" :dot="false" />
          <span class="text-sm muted">维护责任人：<b>{{ current.owner }}</b></span>
          <span class="text-sm muted">引用次数：<b>{{ current.refCount }}</b></span>
          <span class="text-sm muted">平均评分：<b>{{ ratingStats.avg ? ratingStats.avg.toFixed(1) : '暂无' }}</b></span>
          <span class="card__spacer" />
          <el-button v-if="current.status === 'DRAFT'" size="small" type="primary" @click="submitReview(current)">提交审核</el-button>
          <el-button v-if="current.status === 'PENDING_REVIEW' && store.can('kb.review')" size="small" type="success" @click="approveKb(current)">审核通过并发布</el-button>
          <el-button v-if="current.status === 'PENDING_REVIEW' && store.can('kb.review')" size="small" @click="withdrawKb(current)">撤回</el-button>
          <el-button v-if="current.status === 'PUBLISHED' && store.can('kb.review')" size="small" @click="withdrawKb(current)">撤回</el-button>
        </div>

        <h2 class="kb-title">{{ current.title }}</h2>
        <div class="text-xs muted mb-3">
          创建时间 {{ fmtTime(current.createdAt) }}
          <template v-if="current.publishedAt"> · 发布时间 {{ fmtTime(current.publishedAt) }}</template>
          <template v-if="current.updatedAt"> · 最近更新 {{ fmtTime(current.updatedAt) }}</template>
        </div>

        <!-- 富文本正文 -->
        <div class="richtext" v-html="rendered" @click="onRichClick" />

        <!-- 附件 -->
        <div class="card mt-4">
          <div class="card__head">
            <span class="card__title">附件（{{ list(current.attachments).length }}）</span>
            <span class="card__sub">允许把各类文件作为附件，支持中文附件内容搜索</span>
            <span class="card__spacer" />
            <el-button size="small" type="primary" plain :loading="uploading" @click="pickDetailFiles">
              <el-icon><Upload /></el-icon> 上传附件
            </el-button>
            <el-button size="small" @click="addDetailSample">添加示例附件</el-button>
            <input ref="detailFileRef" type="file" multiple style="display: none" @change="onDetailFiles">
          </div>
          <div class="card__body">
            <div v-if="list(current.attachments).length" class="file-list">
              <div v-for="a in list(current.attachments)" :key="a.name" class="file-item">
                <span class="file-item__icon" :class="`file-item__icon--${a.type}`"><el-icon :size="15"><component :is="attachIcon(a.type)" /></el-icon></span>
                <div class="file-item__main">
                  <div class="file-item__name">{{ a.name }}</div>
                  <div class="file-item__meta">{{ a.type.toUpperCase() }} · {{ a.size }} · 可检索文本：{{ a.contentText }}</div>
                </div>
                <el-button link type="primary" size="small" @click="ElMessage.success(`已下载 ${a.name}`)">下载</el-button>
                <el-button link type="danger" size="small" @click="removeDetailAttach(a.name)">移除</el-button>
              </div>
            </div>
            <div v-else class="empty-box">
              <div class="empty-box__text">该知识条目暂无附件——点右上角「上传附件」选择本地文件，或用「添加示例附件」快速演示</div>
            </div>
          </div>
        </div>

        <!-- 评分与评论 -->
        <div class="grid grid--2 mt-4">
          <div class="card">
            <div class="card__head"><span class="card__title">知识评分</span><span class="card__sub">评分按知识统计</span></div>
            <div class="card__body">
              <div class="flex items-center gap-3 mb-3">
                <div class="rate-avg">{{ ratingStats.avg ? ratingStats.avg.toFixed(1) : '—' }}</div>
                <div>
                  <el-rate :model-value="Math.round(ratingStats.avg * 2) / 2" disabled allow-half />
                  <div class="text-xs muted">{{ ratingStats.count }} 人参与评分</div>
                </div>
              </div>
              <div v-for="d in ratingStats.dist" :key="d.n" class="rate-row">
                <span class="rate-row__label">{{ d.n }} 星</span>
                <el-progress :percentage="ratingStats.count ? Math.round(d.c / ratingStats.count * 100) : 0" :show-text="false" :stroke-width="8" style="flex: 1" />
                <span class="text-xs muted" style="width: 34px; text-align: right">{{ d.c }} 条</span>
              </div>
              <div class="flex items-center gap-2 mt-3">
                <span class="text-sm">我要评分</span>
                <el-rate v-model="myScore" />
                <el-button size="small" type="primary" @click="submitRating">提交评分</el-button>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card__head"><span class="card__title">评论</span><span class="card__sub">评论发送给维护责任人</span></div>
            <div class="card__body">
              <div v-if="list(current.comments).length" class="cmt-list">
                <div v-for="(c, i) in list(current.comments)" :key="i" class="cmt">
                  <div class="cmt__head">
                    <b>{{ c.user }}</b>
                    <span class="text-xs muted">{{ fmtTime(c.at) }}</span>
                    <StatusTag v-if="c.ownerNotified" dict="" label="已发送给维护责任人" tone="success" :dot="false" />
                  </div>
                  <div class="text-sm">{{ c.content }}</div>
                </div>
              </div>
              <div v-else class="empty-box"><div class="empty-box__text">暂无评论</div></div>
              <el-input v-model="commentDraft" type="textarea" :rows="3" class="mt-3" placeholder="填写评论（提交后将发送给维护责任人）" />
              <div class="flex justify-between items-center mt-2">
                <span class="text-xs muted">收件人：{{ current.owner }}（知识库维护责任人）</span>
                <el-button type="primary" size="small" @click="submitComment">发表评论</el-button>
              </div>
            </div>
          </div>
        </div>

        <!-- 流程记录 -->
        <div class="card mt-4">
          <div class="card__head"><span class="card__title">条目管理流程记录</span>
            <span class="card__sub">草稿 → 提交审核 → 审核通过（发布）/ 撤回</span></div>
          <div class="card__body">
            <div class="tl">
              <div v-for="(t, i) in list(current.timeline)" :key="i" class="tl__item tl__item--done">
                <div class="tl__dot" />
                <div class="tl__head">
                  <span class="tl__action">{{ t.action }}</span>
                  <span class="tl__meta">{{ t.actor }} · {{ t.at }}</span>
                </div>
                <div v-if="t.comment" class="tl__body">{{ t.comment }}</div>
              </div>
            </div>
            <div v-if="!list(current.timeline).length" class="empty-box"><div class="empty-box__text">暂无流程记录</div></div>
          </div>
        </div>
      </template>
      <div v-else class="empty-box"><div class="empty-box__text">未找到知识条目</div></div>
    </el-drawer>

    <!-- ------------------------------------------------- 知识分类管理 -- -->
    <el-dialog v-model="catOpen" title="知识分类管理" width="920px" top="6vh">
      <div class="text-xs muted mb-3">
        可直接修改分类名称与维度；同级内用「上移 / 下移」调整展示顺序；点「保存」统一生效并写入审计留痕。
      </div>
      <el-table
        :data="catDraft" row-key="id" default-expand-all size="small" style="width: 100%"
        :tree-props="{ children: 'children' }"
      >
        <el-table-column label="分类名称" min-width="240">
          <template #default="{ row }">
            <el-input v-model="row.name" size="small" placeholder="请输入分类名称" />
          </template>
        </el-table-column>
        <el-table-column label="维度" width="132">
          <template #default="{ row }">
            <el-select v-model="row.dim" size="small" style="width: 116px">
              <el-option v-for="d in CAT_DIMS" :key="d" :label="d" :value="d" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="知识条目" width="92">
          <template #default="{ row }"><span class="muted text-xs">{{ draftCount(row) }} 条</span></template>
        </el-table-column>
        <el-table-column label="操作" width="252">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="draftAddChild(row)">新增子分类</el-button>
            <el-button link type="primary" size="small" @click="draftMove(row, -1)">上移</el-button>
            <el-button link type="primary" size="small" @click="draftMove(row, 1)">下移</el-button>
            <el-button link type="danger" size="small" @click="draftRemove(row)">删除</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty-box">
            <div class="empty-box__icon"><el-icon><Files /></el-icon></div>
            <div class="empty-box__text">暂无分类，点下方「新增一级分类」开始</div>
          </div>
        </template>
      </el-table>
      <div class="mt-3">
        <el-button size="small" @click="draftAddChild(null)"><el-icon><Plus /></el-icon> 新增一级分类</el-button>
      </div>
      <template #footer>
        <el-button @click="catOpen = false">取消</el-button>
        <el-button type="primary" @click="saveCatManage">保存</el-button>
      </template>
    </el-dialog>

    <!-- ----------------------------------------------- 新建知识条目 -- -->
    <el-dialog v-model="createVisible" title="新建知识条目" width="820px" top="5vh">
      <el-form label-width="104px">
        <el-form-item label="条目标题" required>
          <el-input v-model="createForm.title" placeholder="如：数据更新延迟（T+1 未到数）处理规范" />
        </el-form-item>
        <el-form-item label="所属分类" required>
          <el-select v-model="createForm.categoryId" style="width: 300px">
            <el-option v-for="c in kbLeafOptions" :key="c.id" :label="c.name" :value="c.id" />
          </el-select>
          <span class="text-xs muted" style="margin-left: 10px">分类可按产品 / 用户群 / 业务领域 / 地点设置</span>
        </el-form-item>
        <el-form-item label="维护责任人">
          <el-select v-model="createForm.owner" filterable style="width: 220px">
            <el-option v-for="u in users" :key="u.id" :label="`${u.name}（${u.org}）`" :value="u.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="内容摘要">
          <el-input v-model="createForm.contentText" placeholder="用于全文检索的关键字摘要（留空则自动取正文）" />
        </el-form-item>

        <el-form-item label="附件">
          <div style="width: 100%">
            <div class="flex items-center gap-2 wrap mb-2">
              <el-button size="small" type="primary" plain :loading="uploading" @click="pickCreateFiles">
                <el-icon><Upload /></el-icon> 选择本地文件
              </el-button>
              <el-button size="small" @click="addCreateSample">添加示例附件</el-button>
              <span class="text-xs muted">支持 pdf / word / ppt / txt / xlsx 等各类文件，附件内容一并纳入检索</span>
            </div>
            <input ref="createFileRef" type="file" multiple style="display: none" @change="onCreateFiles">
            <div v-if="createForm.attachments.length" class="file-list">
              <div v-for="(a, i) in createForm.attachments" :key="a.name + i" class="file-item">
                <span class="file-item__icon" :class="`file-item__icon--${a.type}`"><el-icon :size="15"><component :is="attachIcon(a.type)" /></el-icon></span>
                <div class="file-item__main">
                  <div class="file-item__name">{{ a.name }}</div>
                  <div class="file-item__meta">{{ a.type.toUpperCase() }} · {{ a.size }} · 可检索文本：{{ a.contentText }}</div>
                </div>
                <el-button link type="danger" size="small" @click="removeCreateAttach(i)">移除</el-button>
              </div>
            </div>
            <div v-else class="text-xs muted">尚未添加附件（可留空；保存后仍可在知识条目详情中补传）</div>
          </div>
        </el-form-item>

        <el-form-item label="正文编辑">
          <div class="editor">
            <div class="editor__toolbar">
              <el-button size="small" @click="cmd('bold')"><b>B</b></el-button>
              <el-button size="small" @click="cmd('italic')"><i>I</i></el-button>
              <el-button size="small" @click="cmd('formatBlock', 'h3')">标题</el-button>
              <el-button size="small" @click="cmd('insertOrderedList')">有序列表</el-button>
              <el-button size="small" @click="cmd('insertUnorderedList')">无序列表</el-button>
              <el-button size="small" @click="cmd('formatBlock', 'pre')">代码</el-button>
              <el-button size="small" @click="cmd('formatBlock', 'blockquote')">引用</el-button>
              <el-button size="small" type="primary" plain @click="insertImage">插入图片</el-button>
            </div>
            <div class="editor__area-wrap">
              <div ref="editorRef" class="richtext editor__area" contenteditable="true" />
            </div>
            <div class="editor__ref">
              <span class="text-sm">插入知识引用</span>
              <el-select v-model="refPickId" filterable placeholder="选择要引用的其他知识条目" size="small" style="width: 300px">
                <el-option v-for="k in knowledges" :key="k.id" :label="k.title" :value="k.id" />
              </el-select>
              <el-button size="small" @click="insertKnowledgeRef">插入引用</el-button>
              <span class="text-xs muted">插入后在正文中显示为「知识：《标题》」，点击可跳转到该知识条目</span>
            </div>
          </div>
        </el-form-item>

        <el-form-item label="保存状态">
          <StatusTag dict="" label="草稿（DRAFT）" tone="neutral" />
          <span class="text-xs muted" style="margin-left: 8px">保存后可提交审核 → 审核通过发布 / 撤回，符合知识条目规范管理流程。</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" @click="saveKnowledge">保存为草稿</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex; align-items: center; gap: var(--sp-3);
  padding: var(--sp-4) var(--sp-5); border-bottom: 1px solid var(--border-2);
  flex-wrap: wrap;
}
.toolbar__fields { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; flex: 1; }
.toolbar__actions { display: flex; align-items: center; gap: var(--sp-2); }
.field { display: flex; align-items: center; gap: 6px; }
.field__label { font-size: var(--fs-sm); color: var(--text-2); white-space: nowrap; }
.cell-sub { font-size: var(--fs-xs); color: var(--text-3); margin-top: 2px; }

/* 分类树：覆盖 Element Plus 固定的 26px 行高（--el-tree-node-content-height），
   否则自定义节点内容溢出会把相邻节点压在一起（文字重叠、高亮框只盖住半行、点击命中错位）。 */
.cat-tree :deep(.el-tree-node__content) { height: 30px; border-radius: var(--r-sm); }
.cat-node { display: flex; align-items: center; gap: 6px; flex: 1; min-width: 0; padding-right: 8px; }
.cat-node__name { font-size: var(--fs-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cat-node__dim {
  flex: none; font-size: 10px; line-height: 15px; padding: 0 4px;
  color: var(--text-3); border: 1px solid var(--border-2); border-radius: var(--r-xs);
}
.cat-node__count { margin-left: auto; flex: none; font-size: 11px; color: var(--text-3); font-variant-numeric: tabular-nums; }

.attach-hit { margin-top: 4px; font-size: var(--fs-xs); color: var(--warning-fg); }
.attach-hit__item { margin-right: 8px; }
:deep(mark.hit) { background: var(--warning-bg); color: var(--warning-fg); padding: 0 2px; border-radius: var(--r-xs); }

.kb-title { font-size: var(--fs-2xl); margin: 0 0 4px; }

/* 富文本渲染样式（内容来自项目内置知识条目数据与编辑器录入） */
.richtext { font-size: var(--fs-md); line-height: 1.8; color: var(--text); }
.richtext :deep(h3) {
  font-size: var(--fs-lg); margin: var(--sp-4) 0 var(--sp-2);
  padding-left: 8px; border-left: 3px solid var(--brand-500);
}
.richtext :deep(p) { margin: var(--sp-2) 0; }
.richtext :deep(ol), .richtext :deep(ul) { padding-left: 22px; margin: var(--sp-2) 0; }
.richtext :deep(li) { margin: 2px 0; }
.richtext :deep(code) {
  background: var(--surface-3); padding: 1px 5px; border-radius: var(--r-sm);
  font-family: var(--ff-num); font-size: var(--fs-sm);
}
.richtext :deep(pre) {
  background: var(--surface-2); border: 1px solid var(--border-2); border-radius: var(--r-md);
  padding: var(--sp-3); font-family: var(--ff-num); font-size: var(--fs-sm); overflow-x: auto; white-space: pre-wrap;
}
.richtext :deep(blockquote) {
  margin: var(--sp-3) 0; padding: var(--sp-2) var(--sp-4);
  background: var(--warning-bg); border-left: 3px solid var(--warning);
  border-radius: 0 var(--r-md) var(--r-md) 0; color: var(--warning-fg);
}
.richtext :deep(img) { max-width: 100%; border: 1px solid var(--border); border-radius: var(--r-md); margin: var(--sp-2) 0; }
.richtext :deep(a.kb-ref) { color: var(--brand-600); border-bottom: 1px dashed var(--brand-400); cursor: pointer; }

.rate-avg { font-size: 34px; font-weight: 700; color: var(--text); line-height: 1; }
.rate-row { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: 4px; }
.rate-row__label { font-size: var(--fs-xs); color: var(--text-3); width: 34px; }

.cmt-list { display: flex; flex-direction: column; gap: var(--sp-3); max-height: 220px; overflow-y: auto; }
.cmt { border-bottom: 1px dashed var(--border-2); padding-bottom: var(--sp-2); }
.cmt__head { display: flex; align-items: center; gap: var(--sp-2); margin-bottom: 2px; flex-wrap: wrap; }

.editor { width: 100%; border: 1px solid var(--border); border-radius: var(--r-md); overflow: hidden; }
.editor__toolbar {
  display: flex; flex-wrap: wrap; gap: 6px; padding: 6px var(--sp-2);
  background: var(--surface-2); border-bottom: 1px solid var(--border-2);
}
.editor__area-wrap { max-height: 260px; overflow-y: auto; }
.editor__area { min-height: 160px; padding: var(--sp-3); outline: none; }
.editor__ref {
  display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap;
  padding: var(--sp-2) var(--sp-3); border-top: 1px solid var(--border-2); background: var(--surface-2);
}
</style>
