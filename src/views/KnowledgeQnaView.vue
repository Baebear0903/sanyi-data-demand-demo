<script setup lang="ts">
/**
 * KnowledgeQnaView —— 知识问答管理
 *
 * 覆盖功能点：提问（知识库中找不到所需知识时，可通过征询问答的方式，向运维人员发起提问）、
 * 回答（运维人员回答问题，按线索方面对提问和回答进行关联）、
 * 归档（在所有回复的答案中，有权限的用户选择最佳答案，将该问答转化为知识点纳入知识库，实现隐性知识的挖掘）。
 */
import { computed, nextTick, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDemoStore } from '@/stores/demo'
import { config } from '@/core/config'
import { by, demoUid, fmtTime, fromNow, iso, nowStamp } from '@/core/utils'
import PageHead from '@/components/PageHead.vue'
import StatCards from '@/components/StatCards.vue'
import StatusTag from '@/components/StatusTag.vue'

const store = useDemoStore()
const router = useRouter()

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'teal' | 'neutral'

/** 安全取数组（模板统一使用） */
const list = (v: unknown): any[] => (Array.isArray(v) ? v : [])

const qnas = computed(() => store.table('qnas') as any[])
const knowledges = computed(() => store.table('knowledges') as any[])
const resources = computed(() => store.table('resources') as any[])

/* --------------------------------------------------------- 状态分组 -- */
const tab = ref<'ASKED' | 'ANSWERED' | 'TO_ARCHIVE' | 'ARCHIVED'>('ASKED')
const countOf = (s: string) => qnas.value.filter(q => q.status === s).length
/** 已回答但尚未选择最佳答案 → 待归档（归档入口就是这一组） */
const toArchive = computed(() => qnas.value.filter(q => q.status === 'ANSWERED' && !list(q.answers).some((a: any) => a.isBest)))
const tabs = computed(() => [
  { value: 'ASKED', label: `待回答（${countOf('ASKED')}）` },
  { value: 'ANSWERED', label: `已回答（${countOf('ANSWERED')}）` },
  { value: 'TO_ARCHIVE', label: `待归档（${toArchive.value.length}）` },
  { value: 'ARCHIVED', label: `已归档（${countOf('ARCHIVED')}）` }
])
const groupRows = computed(() => {
  if (tab.value === 'TO_ARCHIVE') return toArchive.value
  return qnas.value.filter(q => q.status === tab.value)
})
const filtered = computed(() => by(groupRows.value, 'askedAt', 'desc'))

const canArchive = computed(() => store.can('kb.archive'))
/** 归档权限角色提示（避免用户在当前角色下找不到入口时误判为功能缺失） */
const archiverHint = computed(() =>
  canArchive.value
    ? '当前角色具备「问答归档为知识」权限，可直接选择最佳答案并归档'
    : '当前角色无「问答归档为知识」权限')

/* ---------------------------------------------------------- 指标卡 -- */
const stats = computed(() => {
  const rows = qnas.value
  const answers = rows.reduce((s, q) => s + list(q.answers).length, 0)
  return [
    { label: '问答总数', value: rows.length, unit: '条', icon: 'QuestionFilled', tone: 'primary' as Tone },
    { label: '待回答', value: countOf('ASKED'), unit: '条', icon: 'Timer', tone: 'warning' as Tone },
    { label: '已回答', value: countOf('ANSWERED'), unit: '条', icon: 'ChatDotRound', tone: 'info' as Tone },
    { label: '已归档为知识', value: countOf('ARCHIVED'), unit: '条', icon: 'Collection', tone: 'success' as Tone, tip: '选择最佳答案后转化为知识点纳入知识库' },
    { label: '累计回答数', value: answers, unit: '条', icon: 'EditPen', tone: 'purple' as Tone },
    { label: '平均回答数', value: rows.length ? (answers / rows.length).toFixed(1) : '0', unit: '条/问', icon: 'TrendCharts', tone: 'teal' as Tone }
  ]
})

/* ------------------------------------------------------------ 提问 -- */
const askVisible = ref(false)
const askForm = reactive({ question: '', description: '', relatedKnowledgeId: '', relatedResourceId: '' })

function openAsk() {
  Object.assign(askForm, { question: '', description: '', relatedKnowledgeId: '', relatedResourceId: '' })
  askVisible.value = true
}
function submitAsk() {
  if (!askForm.question.trim()) { ElMessage.warning('请填写问题标题'); return }
  if (!askForm.description.trim()) { ElMessage.warning('请填写问题详细描述'); return }
  const rows = qnas.value
  const qa = store.insert('qnas', {
    no: `${config.prefixes.qnas}${nowStamp().slice(0, 6)}${String(rows.length + 1).padStart(4, '0')}`,
    question: askForm.question.trim(),
    description: askForm.description.trim(),
    asker: store.user.name,
    askerOrg: store.user.org,
    askedAt: iso(),
    status: 'ASKED',
    answers: [],
    relatedKnowledgeId: askForm.relatedKnowledgeId || null,
    relatedResourceId: askForm.relatedResourceId || null,
    archivedKnowledgeId: null,
    archivedAt: null
  })
  ensureDraft(qa.id)
  store.pushTimeline(qa, { action: '发起知识提问', comment: `知识库中未找到所需知识，向运维人员发起征询问答` })
  // 知识库中找不到所需知识时，向运维人员发起提问
  store.notify({
    type: 'warning',
    title: `新的知识提问 ${qa.no} 待回答`,
    body: `${qa.asker}（${qa.askerOrg}）提问：${qa.question}`,
    toRoles: ['ops', 'desk'],
    link: '/kb/qna'
  })
  askVisible.value = false
  tab.value = 'ASKED'
  ElMessage.success(`已发起提问 ${qa.no}，已通知运维人员（运维工程师角色可在「知识问答管理」中回答）`)
}

/* ------------------------------------------------------------ 回答 -- */
const tableRef = ref<any>(null)
const drafts = reactive<Record<string, { clue: string; content: string }>>({})
/** 预建草稿对象，避免在渲染期写入响应式对象 */
function ensureDraft(id: unknown) {
  const key = String(id)
  if (!drafts[key]) drafts[key] = { clue: '', content: '' }
  return drafts[key]
}
qnas.value.forEach(q => ensureDraft(q.id))
function draftOf(q: any) { return drafts[String(q.id)] ?? ensureDraft(q.id) }
function toggleExpand(row: any) {
  tableRef.value?.toggleRowExpansion?.(row)
}
/**
 * 「选最佳答案并归档」快捷入口（表格行内）：
 * 展开该行并滚动定位到候选答案，避免用户不知道归档入口藏在展开行里。
 */
function goArchive(row: any) {
  if (!canArchive.value) {
    ElMessage.warning(`当前角色「${store.role.name}」无「问答归档为知识」权限`)
    return
  }
  if (row.status === 'ARCHIVED') { tab.value = 'ARCHIVED'; return }
  if (!list(row.answers).length) { ElMessage.warning('该问答还没有回答，无法选择最佳答案'); return }
  tab.value = row.status === 'ANSWERED' ? 'TO_ARCHIVE' : 'ANSWERED'
  nextTick(() => {
    toggleExpand(row)
    nextTick(() => {
      const el = document.querySelector('.ans-list') as HTMLElement | null
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      ElMessage.info('已展开候选答案')
    })
  })
}
function submitAnswer(q: any) {
  const d = draftOf(q)
  if (!d.clue.trim()) { ElMessage.warning('请填写「线索」——按线索方面对提问和回答进行关联'); return }
  if (!d.content.trim()) { ElMessage.warning('请填写回答内容'); return }
  const answers = [...list(q.answers), {
    id: demoUid(`a${list(q.answers).length + 1}`),
    user: store.user.name,
    content: d.content.trim(),
    at: iso(),
    clue: d.clue.trim(),
    isBest: false
  }]
  store.update('qnas', q.id, { answers, status: 'ANSWERED' }, { action: '回答问题', remark: `线索：${d.clue.trim()}` })
  store.pushTimeline(q, { action: '提交回答', comment: `线索：${d.clue.trim()}｜${d.content.trim().slice(0, 50)}` })
  store.notify({
    type: 'success',
    title: `您的提问 ${q.no} 已有回答`,
    body: `${store.user.name} 按线索「${d.clue.trim()}」回答了该问题。`,
    toRoles: ['consumer', 'desk', 'supplier'],
    link: '/kb/qna'
  })
  d.clue = ''
  d.content = ''
  tab.value = 'ANSWERED'
  ElMessage.success('回答已提交，状态流转为「已回答」')
}

/* ------------------------------------------------------------ 归档 -- */
/** 默认归档分类：取一个合适的知识分类叶子节点（数据需求管理） */
const defaultCat = computed(() => {
  const tops = store.table('kbCategories') as any[]
  for (const top of tops) {
    for (const c of list(top.children)) {
      if (c.id === 'kc011') return { id: c.id, name: c.name }
    }
  }
  const first = tops[0]
  const leaf = list(first?.children)[0]
  return { id: leaf?.id ?? first?.id ?? 'kc011', name: leaf?.name ?? first?.name ?? '数据需求管理' }
})

function archive(q: any, ans: any) {
  if (!store.can('kb.archive')) { ElMessage.warning('当前角色无「问答归档为知识」权限'); return }
  ElMessageBox.confirm(
    `将把回答（${ans.user} · 线索：${ans.clue}）设为最佳答案，并把该问答转化为知识点纳入知识库。是否继续？`,
    `选择最佳答案 · ${q.no}`,
    { confirmButtonText: '确认归档为知识', cancelButtonText: '取消', type: 'warning' }
  ).then(() => {
    const answers = list(q.answers).map(a => ({ ...a, isBest: a.id === ans.id }))
    const questions = String(q.question)
    const desc = String(q.description ?? '')
    const kbRows = store.table('knowledges') as any[]
    const kb = store.insert('knowledges', {
      no: `${config.prefixes.knowledges}${nowStamp().slice(0, 6)}${String(kbRows.length + 1).padStart(4, '0')}`,
      title: questions,
      categoryId: defaultCat.value.id,
      categoryName: defaultCat.value.name,
      owner: store.user.name,
      status: 'PUBLISHED',
      publishedAt: iso(),
      refCount: 0,
      contentText: `${questions} ${desc} ${ans.content} ${ans.clue}`,
      contentHtml: `<h3>问题</h3><p>${questions}</p>`
        + (desc ? `<h3>问题描述</h3><p>${desc}</p>` : '')
        + `<h3>最佳答案（线索：${ans.clue}）</h3><p>${ans.content}</p>`
        + `<h3>提问与回答</h3><ul><li>提问人：${q.asker}（${q.askerOrg}）· ${q.askedAt}</li>`
        + `<li>回答人：${ans.user} · ${ans.at} · 线索：${ans.clue}</li></ul>`
        + `<blockquote>本条目由知识问答 ${q.no} 归档生成。</blockquote>`,
      attachments: [],
      ratings: [],
      comments: [],
      relatedIds: []
    })
    store.update('qnas', q.id, { answers, archivedKnowledgeId: kb.id, archivedAt: iso(), status: 'ARCHIVED' },
      { action: '选择最佳答案并归档', remark: `生成知识条目 ${kb.no}` })
    store.pushTimeline(q, { action: '归档为知识点', comment: `最佳答案：${ans.user}；已生成知识条目 ${kb.no}（已发布）` })
    store.notify({
      type: 'success',
      title: `问答 ${q.no} 已归档为知识条目`,
      body: `《${questions}》已纳入知识库。`,
      toRoles: ['ops', 'desk', 'consumer'],
      link: '/kb/list'
    })
    tab.value = 'ARCHIVED'
    ElMessageBox.confirm('已将该问答转化为知识点纳入知识库。', '归档成功', {
      confirmButtonText: '去知识库查看', cancelButtonText: '留在本页'
    }).then(() => router.push('/kb/list')).catch(() => { /* 留在本页 */ })
  }).catch(() => { /* 取消 */ })
}

/* ------------------------------------------------------------ 其他 -- */
const kbOf = (kid: string) => knowledges.value.find(k => k.id === kid)
const resOf = (rid: string) => resources.value.find(r => r.id === rid)
const answerCount = (q: any) => list(q.answers).length

function remind(q: any) {
  store.notify({
    type: 'info',
    title: `催办：知识提问 ${q.no} 仍待回答`,
    body: `提问：${q.question}（提问人 ${q.asker}）`,
    toRoles: ['ops'],
    link: '/kb/qna'
  })
  ElMessage.success('已向运维人员发送催办提醒')
}
</script>

<template>
  <div>
    <PageHead title="知识问答管理" desc="征询问答、运维作答与最佳答案归档。">
      <template #actions>
        <el-button @click="router.push('/kb/list')"><el-icon><Tickets /></el-icon> 知识库管理</el-button>
        <el-button type="primary" @click="openAsk"><el-icon><Plus /></el-icon> 发起提问</el-button>
      </template>
    </PageHead>

    <StatCards :items="stats" />

    <div class="card">
      <div class="card__head tabs-head">
        <el-tabs v-model="tab" style="width: 100%">
          <el-tab-pane v-for="t in tabs" :key="t.value" :label="t.label" :name="t.value" />
        </el-tabs>
      </div>

      <el-table ref="tableRef" :data="filtered" style="width: 100%" row-key="id">
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="qa-expand">
              <div class="bold mb-1">问题详情</div>
              <div class="text-sm mb-2">{{ row.description || row.question }}</div>
              <div class="flex wrap gap-3 text-xs muted mb-3">
                <span v-if="row.relatedKnowledgeId">
                  关联知识条目：<el-button link type="primary" size="small" @click="router.push('/kb/list')">{{ kbOf(row.relatedKnowledgeId)?.title ?? row.relatedKnowledgeId }}</el-button>
                </span>
                <span v-if="row.relatedResourceId">关联资源：{{ resOf(row.relatedResourceId)?.name ?? row.relatedResourceId }}</span>
                <span v-if="row.archivedKnowledgeId">
                  已归档知识条目：<el-button link type="primary" size="small" @click="router.push('/kb/list')">{{ kbOf(row.archivedKnowledgeId)?.title ?? row.archivedKnowledgeId }}</el-button>
                  （{{ row.archivedAt }}）
                </span>
              </div>

              <div class="bold mb-1">已有回答（{{ answerCount(row) }}）</div>
              <div v-if="answerCount(row) && row.status !== 'ARCHIVED'" class="text-xs muted mb-2">
                归档方式：在要采纳的答案右侧点 <b>「设为最佳答案」</b> → 确认后该问答转为知识条目并纳入知识库。{{ canArchive ? '' : '（当前角色无归档权限）' }}
              </div>
              <div v-if="answerCount(row)" class="ans-list">
                <div v-for="a in list(row.answers)" :key="a.id" class="ans" :class="{ 'ans--best': a.isBest }">
                  <div class="ans__head">
                    <b>{{ a.user }}</b>
                    <span class="text-xs muted">{{ fmtTime(a.at) }}（{{ fromNow(a.at) }}）</span>
                    <StatusTag dict="" :label="`线索：${a.clue}`" tone="purple" :dot="false" />
                    <StatusTag v-if="a.isBest" dict="" label="最佳答案" tone="success" :dot="false" />
                    <span class="card__spacer" />
                    <el-button
                      v-if="!a.isBest && row.status !== 'ARCHIVED'" size="small" type="primary" plain
                      :disabled="!store.can('kb.archive')" @click="archive(row, a)"
                    >设为最佳答案</el-button>
                  </div>
                  <div class="text-sm mt-1">{{ a.content }}</div>
                </div>
              </div>
              <div v-else class="empty-box"><div class="empty-box__icon"><el-icon><ChatDotRound /></el-icon></div><div class="empty-box__text">暂无回答，等待运维人员按线索回答</div></div>

              <div class="ans-form">
                <div class="bold text-sm mb-2">提交回答</div>
                <el-form label-width="72px" size="small">
                  <el-form-item label="线索">
                    <el-input v-model="draftOf(row).clue" placeholder="按线索方面对提问和回答进行关联，如：编码 / 调度依赖 / 权限配置" />
                  </el-form-item>
                  <el-form-item label="回答内容">
                    <el-input v-model="draftOf(row).content" type="textarea" :rows="3" placeholder="填写解决方案或排查结论（可引用知识条目编号）" />
                  </el-form-item>
                  <el-form-item label="">
                    <el-button type="primary" size="small" :disabled="!store.can('kb.qna.answer')" @click="submitAnswer(row)">提交回答</el-button>
                    <span class="text-xs muted" style="margin-left: 8px">提交后状态流转为「已回答」</span>
                  </el-form-item>
                </el-form>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="问答单号" width="140">
          <template #default="{ row }"><span class="mono">{{ row.no }}</span></template>
        </el-table-column>
        <el-table-column label="问题" min-width="280">
          <template #default="{ row }">
            <div class="cell-main">{{ row.question }}</div>
            <div class="cell-sub">{{ (row.description || '').slice(0, 60) }}</div>
          </template>
        </el-table-column>
        <el-table-column label="提问人 / 组织" width="200" show-overflow-tooltip>
          <template #default="{ row }">
            <div>{{ row.asker }}</div>
            <div class="cell-sub">{{ row.askerOrg }}</div>
          </template>
        </el-table-column>
        <el-table-column label="提问时间" width="140">
          <template #default="{ row }">
            <div>{{ row.askedAt ? fmtTime(row.askedAt).slice(5, 16) : '—' }}</div>
            <div class="cell-sub">{{ row.askedAt ? fromNow(row.askedAt) : '—' }}</div>
          </template>
        </el-table-column>
        <el-table-column label="回答数" width="86" align="center">
          <template #default="{ row }"><span class="mono bold">{{ answerCount(row) }}</span></template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }"><StatusTag dict="QnaStatus" :value="row.status" /></template>
        </el-table-column>
        <el-table-column label="操作" width="286" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="toggleExpand(row)">{{ answerCount(row) ? '查看 / 回答' : '回答' }}</el-button>
            <el-button
              v-if="row.status === 'ANSWERED' && answerCount(row) && !list(row.answers).some((a) => a.isBest)"
              link type="success" size="small" @click="goArchive(row)"
            >选最佳答案并归档</el-button>
            <el-button v-if="row.status === 'ASKED'" link size="small" @click="remind(row)">催办</el-button>
            <el-button
              v-if="row.status === 'ARCHIVED'" link type="success" size="small"
              @click="router.push('/kb/list')"
            >查看知识</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <div class="empty-box">
            <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
            <div class="empty-box__text">当前分组下没有问答记录</div>
          </div>
        </template>
      </el-table>

      <div class="card__foot">
        <span class="text-sm muted">
          共 <b>{{ filtered.length }}</b> 条 ·
          待回答 {{ countOf('ASKED') }} / 已回答 {{ countOf('ANSWERED') }} / 待归档 {{ toArchive.length }} / 已归档 {{ countOf('ARCHIVED') }}
        </span>
        <span class="card__spacer" />
        <span class="text-xs muted">
          归档入口：「待归档」页签内选择最佳答案即可归档。
          {{ archiverHint }}
        </span>
      </div>
    </div>

    <!-- ------------------------------------------------------- 提问弹窗 -- -->
    <el-dialog v-model="askVisible" title="发起知识提问" width="620px">
      <el-form label-width="106px">
        <el-form-item label="问题标题" required>
          <el-input v-model="askForm.question" placeholder="一句话描述你的问题" />
        </el-form-item>
        <el-form-item label="详细描述" required>
          <el-input v-model="askForm.description" type="textarea" :rows="4" placeholder="现象、已尝试的排查步骤、涉及的服务 / 资源等" />
        </el-form-item>
        <el-form-item label="关联知识条目">
          <el-select v-model="askForm.relatedKnowledgeId" filterable clearable placeholder="可选：已检索过但未命中的相关知识条目" style="width: 100%">
            <el-option v-for="k in knowledges" :key="k.id" :label="`${k.no} ${k.title}`" :value="k.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联数据资源">
          <el-select v-model="askForm.relatedResourceId" filterable clearable placeholder="可选：问题涉及的数据资源" style="width: 100%">
            <el-option v-for="r in resources" :key="r.id" :label="r.name" :value="r.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="askVisible = false">取消</el-button>
        <el-button type="primary" @click="submitAsk">提交提问</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.tabs-head { padding-bottom: 0; border-bottom: none; }
.cell-main { font-weight: 600; }
.cell-sub { font-size: var(--fs-xs); color: var(--text-3); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.qa-expand { padding: var(--sp-3) var(--sp-6) var(--sp-4); background: var(--surface-2); }
.ans-list { display: flex; flex-direction: column; gap: var(--sp-2); margin-bottom: var(--sp-3); }
.ans {
  border: 1px solid var(--border); border-radius: var(--r-md);
  background: var(--surface); padding: var(--sp-3);
}
.ans--best { border-color: var(--success); background: var(--success-bg); }
.ans__head { display: flex; align-items: center; gap: var(--sp-2); flex-wrap: wrap; }
.ans-form {
  border: 1px dashed var(--border); border-radius: var(--r-md);
  background: var(--surface); padding: var(--sp-3);
}
</style>
