<script setup lang="ts">
/**
 * ReleaseDetailView —— 发布单详情
 *
 * 覆盖功能点：发布包管理（每次发布的安装都归档，可随时回滚到上一个版本）、
 * 发布管理（按批复的发布申请要求，在规定时间点升级，并进行业务验证）、
 * 发布撤回（升级后发现重大问题可回滚到上一个版本，排除故障后重新发布）、
 * 发布审计（对发布项进行事后审计，确保每次升级闭环）。
 */
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDemoStore } from '@/stores/demo'
import { config } from '@/core/config'
import { fmtTime, iso } from '@/core/utils'
import PageHead from '@/components/PageHead.vue'
import StatusTag from '@/components/StatusTag.vue'
import ChartBox from '@/components/ChartBox.vue'

const store = useDemoStore()
const route = useRoute()
const router = useRouter()

/** 安全取数组（模板统一使用） */
const list = (v: unknown): any[] => (Array.isArray(v) ? v : [])

const id = computed(() => String(route.params.id ?? ''))
const r = computed<any>(() => store.findById('releases', id.value))
const stepIndex = computed(() => (config.flowIndex.Release as any)[r.value?.status] ?? 0)
const canManage = computed(() => store.can('release.manage'))

/* --------------------------------------------------------- 关联对象 -- */
const demands = computed(() => store.table('demands') as any[])
const changes = computed(() => store.table('changes') as any[])
const demandOf = (did: string) => demands.value.find(d => d.id === did)
const changeOf = (cid: string) => changes.value.find(c => c.id === cid)
/** 关联需求 / 变更明细 */
const relDemands = (ids: unknown) => list(ids).map(did => demandOf(String(did))).filter(Boolean)
const relChanges = (ids: unknown) => list(ids).map(cid => changeOf(String(cid))).filter(Boolean)
/** 由问题驱动的发布（原文：由需求 / 问题驱动创建发布申请单） */
const problemOf = (pid: string) => (store.table('problems') as any[]).find(x => x.id === pid)
const relProblems = (ids: unknown) => list(ids).map(pid => problemOf(String(pid))).filter(Boolean)

/* --------------------------------------------------------- 审计日志 -- */
const audits = computed(() => (store.table('audits') as any[]).filter(a => a.bizId === id.value))

/* ------------------------------------------------------- 业务验证 -- */
const verifyItems = computed<any[]>(() => list(r.value?.verifyItems))
const passCount = computed(() => verifyItems.value.filter(i => i.result === '通过').length)
const passRate = computed(() => (verifyItems.value.length ? Math.round(passCount.value / verifyItems.value.length * 100) : 0))
const executedCount = computed(() => verifyItems.value.filter(i => i.result !== '未执行').length)

const verifyChart = computed(() => [
  { name: '通过', value: verifyItems.value.filter(i => i.result === '通过').length },
  { name: '不通过', value: verifyItems.value.filter(i => i.result === '不通过').length },
  { name: '未执行', value: verifyItems.value.filter(i => i.result === '未执行').length }
].filter(d => d.value > 0))

function setVerify(name: string, result: '通过' | '不通过') {
  const rec = r.value
  if (!rec) return
  const items = list(rec.verifyItems).map(i => (i.name === name ? { ...i, result, remark: result === '通过' ? (i.remark || '验证通过') : '验证不通过，请评估回滚' } : i))
  const nextStatus = rec.status === 'RELEASED' ? 'VERIFYING' : rec.status
  store.update('releases', rec.id, { verifyItems: items, status: nextStatus },
    { action: `业务验证 · ${result}`, remark: `${name} → ${result}` })
  store.pushTimeline(rec, { action: `业务验证 · ${result}`, comment: name })
  if (result === '不通过') {
    store.notify({ type: 'danger', title: `发布单 ${rec.no} 存在验证不通过项`, body: `「${name}」验证不通过，请评估是否执行发布撤回（回滚到上一个版本）。`, toRoles: ['ops', 'supplier'], link: `/release/detail/${rec.id}` })
    ElMessage.warning(`已记录「${name}」验证不通过，可执行发布撤回`)
  } else {
    ElMessage.success(`已记录「${name}」验证通过`)
  }
}

/* --------------------------------------------------- 发布包与回滚 -- */
const currentVersion = computed(() => list(r.value?.packages)[0]?.version ?? '当前版本')

function doRollback(fromVersion: string, toVersion: string, reason: string, actionName: string) {
  const rec = r.value
  if (!rec) return
  store.update('releases', rec.id, {
    status: 'ROLLED_BACK',
    rollback: { at: iso(), reason, fromVersion, toVersion, operator: store.user.name }
  }, { action: actionName, remark: `${fromVersion} → ${toVersion}：${reason}` })
  store.pushTimeline(rec, { action: actionName, comment: `回滚 ${fromVersion} → ${toVersion}，原因：${reason}` })
  store.notify({
    type: 'danger', title: `发布单 ${rec.no} 已回滚至 ${toVersion}`,
    body: `${reason}。排除故障后可重新发布。`, toRoles: ['ops', 'supplier', 'producer'], link: `/release/detail/${rec.id}`
  })
}

function rollbackTo(pkg: any) {
  const rec = r.value
  if (!rec) return
  ElMessageBox.prompt(
    `将回滚到版本 ${pkg.version}（归档于 ${fmtTime(pkg.archivedAt)}，操作人 ${pkg.operator}）。\n请填写回滚原因：`,
    `回滚到 ${pkg.version}`,
    { inputValue: '升级后发现重大问题，按发布撤回流程回滚到上一个稳定版本。', inputType: 'textarea', confirmButtonText: '确认回滚' }
  ).then(({ value }) => {
    doRollback(currentVersion.value, pkg.version, String(value), '回滚到指定版本')
    ElMessage.success(`已回滚到 ${pkg.version}，业务功能恢复后请排除故障并重新发布`)
  }).catch(() => { /* 取消 */ })
}

function withdraw() {
  const rec = r.value
  if (!rec) return
  const target = list(rec.packages)[1]
  ElMessageBox.prompt(
    `发布撤回：将回滚到上一个版本${target ? ` ${target.version}` : ''}，并记录撤回原因。排除故障后可重新发布。`,
    `发布撤回 ${rec.no}`,
    { inputValue: '上线后出现重大问题，影响业务可用性，执行发布撤回。', inputType: 'textarea', confirmButtonText: '确认撤回' }
  ).then(({ value }) => {
    doRollback(currentVersion.value, target?.version ?? '上一稳定版本', String(value), '发布撤回（回滚）')
    ElMessage.success('已执行发布撤回，排除故障后可重新发布')
  }).catch(() => { /* 取消 */ })
}

function republish() {
  const rec = r.value
  if (!rec) return
  store.update('releases', rec.id, { status: 'APPROVED' }, { action: '重新发布', remark: '故障已排除，按原批复重新发布' })
  store.pushTimeline(rec, { action: '重新发布', comment: '故障已排除，恢复为「已批复」，按批复要求重新执行升级' })
  store.notify({ type: 'info', title: `发布单 ${rec.no} 重新发布`, body: '故障已排除，发布单已恢复为「已批复」状态。', toRoles: ['ops', 'producer'], link: `/release/detail/${rec.id}` })
  ElMessage.success('已恢复为「已批复」，可重新执行升级')
}

/* --------------------------------------------------------- 发布审计 -- */
function runAudit() {
  const rec = r.value
  if (!rec) return
  ElMessageBox.prompt('请填写发布事后审计结论（确保每次升级闭环）', `发布审计 ${rec.no}`, {
    inputValue: `发布项事后审计完成：本次升级涉及 ${list(rec.changeIds).length} 个变更、${list(rec.demandIds).length} 个需求，业务验证通过率 ${passRate.value}%，无遗留问题。`,
    inputType: 'textarea', confirmButtonText: '提交审计结论'
  }).then(({ value }) => {
    const allPassed = verifyItems.value.length > 0 && passCount.value === verifyItems.value.length
    store.update('releases', rec.id, { auditNote: String(value), auditedAt: iso(), status: allPassed ? 'CLOSED' : rec.status },
      { action: '发布审计', remark: String(value).slice(0, 60) })
    store.pushTimeline(rec, { action: '发布审计', comment: `${value}${allPassed ? '（验证项全部通过，发布单闭环）' : ''}` })
    // 发布闭环后回写来源问题单：根治版本已验证通过，问题可闭环
    if (allPassed) {
      for (const pid of list(rec.problemIds)) {
        const prob = problemOf(String(pid))
        if (prob && ['RESOLVED', 'KNOWN_ERROR', 'ANALYZING'].includes(prob.status)) {
          store.update('problems', prob.id, { status: 'CLOSED', closedAt: iso(), closeType: '自动关闭' },
            { action: '发布闭环自动关闭', remark: `发布单 ${rec.no} 业务验证全部通过` })
          store.pushTimeline(prob, { action: '自动关闭', comment: `根治版本已由发布单 ${rec.no} 发布并验证通过，问题闭环` })
          store.notify({
            type: 'success', title: `问题单 ${prob.no} 已闭环`,
            body: `发布单 ${rec.no} 业务验证全部通过，问题已自动关闭。`, toRoles: ['ops', 'desk'], link: `/problem/detail/${prob.id}`
          })
        }
      }
    }
    ElMessage.success(allPassed ? '发布审计完成，发布单已闭环' : '已记录审计结论（存在未通过项，暂未闭环）')
  }).catch(() => { /* 取消 */ })
}

/* --------------------------------------------------------- 升级执行 -- */
function execute() {
  const rec = r.value
  if (!rec) return
  ElMessageBox.prompt('请填写本次发布的版本号（发布包将自动归档，便于随时回滚）', `执行升级 ${rec.no}`, {
    inputValue: list(rec.packages)[0]?.version ?? 'v1.6.0', confirmButtonText: '确认执行升级'
  }).then(({ value }) => {
    const version = String(value || '').trim() || 'v1.6.0'
    const packs = [{ version, archivedAt: iso(), operator: store.user.name, remark: '执行升级时自动归档' }, ...list(rec.packages)]
    store.update('releases', rec.id, { status: 'RELEASED', packages: packs }, { action: '执行升级', remark: `发布包 ${version} 部署完成，已归档` })
    store.pushTimeline(rec, { action: '执行升级', comment: `发布包 ${version} 部署完成并归档，停机窗口 ${rec.downtime}，进入业务验证` })
    store.notify({ type: 'success', title: `发布单 ${rec.no} 已执行升级`, body: `版本 ${version} 已部署，请逐项完成业务验证。`, toRoles: ['ops', 'desk'], link: `/release/detail/${rec.id}` })
    ElMessage.success(`已执行升级（${version}），请完成业务验证`)
  }).catch(() => { /* 取消 */ })
}

function approve() {
  const rec = r.value
  if (!rec) return
  ElMessageBox.prompt('请填写发布审批意见', `审批发布申请 ${rec.no}`, {
    inputValue: `同意在 ${rec.releaseAt} 窗口执行发布，请提前通知订阅方并准备回滚脚本。`,
    inputType: 'textarea', confirmButtonText: '批复通过'
  }).then(({ value }) => {
    store.update('releases', rec.id, { status: 'APPROVED', approver: store.user.name, approvedAt: iso() }, { action: '发布审批批复', remark: value })
    store.pushTimeline(rec, { action: '发布审批批复', comment: value })
    ElMessage.success('已批复，可按批复要求在规定时间点执行升级')
  }).catch(() => { /* 取消 */ })
}
</script>

<template>
  <div>
    <PageHead :title="r ? `发布单详情 · ${r.no}` : '发布单详情'" :desc="r ? r.title : '未找到该发布单'">
      <template #actions>
        <el-button @click="router.push('/release/list')"><el-icon><ArrowLeft /></el-icon> 返回列表</el-button>
        <el-button v-if="r && r.status === 'APPLYING' && canManage" type="primary" @click="approve">审批批复</el-button>
        <el-button v-if="r && r.status === 'APPROVED' && canManage" type="primary" @click="execute">执行升级</el-button>
        <el-button v-if="r && ['RELEASED', 'VERIFYING'].includes(r.status) && canManage" type="danger" plain @click="withdraw">发布撤回</el-button>
        <el-button v-if="r && r.status === 'ROLLED_BACK' && canManage" type="primary" @click="republish">重新发布</el-button>
        <el-button v-if="r && !r.auditedAt && canManage" type="success" plain @click="runAudit">执行事后审计</el-button>
      </template>
    </PageHead>

    <div v-if="!r" class="empty-box">
      <div class="empty-box__icon"><el-icon><DocumentRemove /></el-icon></div>
      <div class="empty-box__text">未找到发布单（可能已被重置），请返回列表重新选择</div>
    </div>

    <template v-else>
      <!-- 流转条 -->
      <div class="card mb-4">
        <div class="card__head">
          <span class="card__title">发布流转状态</span>
          <span class="card__sub">当前环节「{{ (config.flows.Release as any)[stepIndex] }}」 · 第 {{ stepIndex + 1 }}/{{ (config.flows.Release as string[]).length }} 步</span>
          <span class="card__spacer" />
          <StatusTag dict="ReleaseStatus" :value="r.status" />
          <StatusTag v-if="r.status === 'ROLLED_BACK'" dict="" label="已回滚，排除故障后可重新发布" tone="danger" />
        </div>
        <div class="card__body">
          <div class="flow">
            <div
              v-for="(s, i) in (config.flows.Release as string[])" :key="s" class="flow__step"
              :class="{
                'flow__step--done': i < stepIndex,
                'flow__step--active': i === stepIndex,
                'flow__step--reject': r.status === 'ROLLED_BACK' && i === stepIndex
              }"
            >
              <div class="flow__dot">
                <el-icon v-if="r.status === 'ROLLED_BACK' && i === stepIndex" :size="14"><RefreshLeft /></el-icon>
                <template v-else>{{ i + 1 }}</template>
              </div>
              <div class="flow__label">{{ s }}</div>
              <div class="flow__time">{{ i <= stepIndex ? '已流转' : '待流转' }}</div>
            </div>
          </div>
          <div v-if="r.rollback" class="rollback-note">
            <div class="bold mb-1 flex items-center gap-1"><el-icon><RefreshLeft /></el-icon> 已执行发布撤回 / 回滚</div>
            <div class="text-sm">回滚时间：{{ fmtTime(r.rollback.at) }} · 操作人：{{ r.rollback.operator }}</div>
            <div class="text-sm">版本：{{ r.rollback.fromVersion }} → {{ r.rollback.toVersion }}</div>
            <div class="text-sm mt-1">原因：{{ r.rollback.reason }}</div>
            <div class="text-xs muted mt-1">排除故障后可点击右上角「重新发布」按原批复重新执行升级。</div>
          </div>
        </div>
      </div>

      <div class="grid grid--side">
        <div>
          <!-- 基本信息 -->
          <div class="card mb-4">
            <div class="card__head"><span class="card__title">基本信息</span></div>
            <div class="card__body">
              <div class="desc-grid desc-grid--2">
                <div class="desc-item"><span class="desc-item--label">发布单号</span><span class="desc-item__value mono">{{ r.no }}</span></div>
                <div class="desc-item"><span class="desc-item--label">状态</span><span class="desc-item__value"><StatusTag dict="ReleaseStatus" :value="r.status" /></span></div>
                <div class="desc-item desc-item--wide"><span class="desc-item--label">发布标题</span><span class="desc-item__value">{{ r.title }}</span></div>
                <div class="desc-item"><span class="desc-item--label">发布时间</span><span class="desc-item__value">{{ fmtTime(r.releaseAt) }}</span></div>
                <div class="desc-item"><span class="desc-item--label">停机时间</span><span class="desc-item__value">{{ r.downtime || '无（热更新）' }}</span></div>
                <div class="desc-item"><span class="desc-item--label">申请人</span><span class="desc-item__value">{{ r.applicant }}</span></div>
                <div class="desc-item"><span class="desc-item--label">审批人</span><span class="desc-item__value">{{ r.approver || '待批复' }}{{ r.approvedAt ? ` · ${fmtTime(r.approvedAt)}` : '' }}</span></div>
                <div class="desc-item"><span class="desc-item--label">当前版本</span><span class="desc-item__value mono">{{ currentVersion }}</span></div>
                <div class="desc-item"><span class="desc-item--label">发布包数量</span><span class="desc-item__value">{{ list(r.packages).length }} 个（已归档）</span></div>
                <div class="desc-item"><span class="desc-item--label">审计状态</span><span class="desc-item__value">{{ r.auditedAt ? `已审计 · ${fmtTime(r.auditedAt)}` : '未审计' }}</span></div>
                <div class="desc-item desc-item--wide"><span class="desc-item--label">升级修改内容</span><span class="desc-item__value">{{ r.changeContent }}</span></div>
                <div class="desc-item desc-item--wide"><span class="desc-item--label">测试情况</span><span class="desc-item__value">{{ r.testResult }}</span></div>
              </div>
            </div>
          </div>

          <!-- 发布包管理 -->
          <div class="card mb-4">
            <div class="card__head">
              <span class="card__title">发布包管理</span>
              <span class="card__sub">每次发布的安装都进行归档，可随时回滚到上一个版本</span>
              <span class="card__spacer" />
              <span class="text-xs muted">回滚将写入审计与时间轴</span>
            </div>
            <div class="card__body card__body--flush">
              <el-table :data="list(r.packages)" size="small">
                <el-table-column label="版本号" width="120">
                  <template #default="{ row }">
                    <span class="mono bold">{{ row.version }}</span>
                    <StatusTag v-if="row.version === currentVersion" dict="" label="当前版本" tone="success" :dot="false" style="margin-left: 6px" />
                  </template>
                </el-table-column>
                <el-table-column prop="archivedAt" label="归档时间" width="150" />
                <el-table-column prop="operator" label="操作人" width="96" />
                <el-table-column prop="remark" label="备注" min-width="180" show-overflow-tooltip />
                <el-table-column label="操作" width="130" fixed="right">
                  <template #default="{ row }">
                    <el-button
                      v-if="row.version !== currentVersion" link type="danger" size="small"
                      :disabled="!canManage" @click="rollbackTo(row)"
                    >回滚到此版本</el-button>
                    <span v-else class="text-xs muted">当前运行版本</span>
                  </template>
                </el-table-column>
                <template #empty><div class="empty-box"><div class="empty-box__text">暂无归档发布包</div></div></template>
              </el-table>
            </div>
          </div>

          <!-- 业务验证 -->
          <div class="card mb-4">
            <div class="card__head">
              <span class="card__title">业务验证</span>
              <span class="card__sub">按批复要求在发布后逐项验证</span>
              <span class="card__spacer" />
              <span class="text-sm">通过率 <b>{{ passRate }}%</b>（{{ passCount }}/{{ verifyItems.length }} 项）</span>
            </div>
            <div class="card__body">
              <el-progress :percentage="passRate" :stroke-width="10" :status="passRate === 100 && verifyItems.length ? 'success' : undefined" />
              <div class="text-xs muted mt-1 mb-3">已执行 {{ executedCount }} 项，未执行 {{ verifyItems.length - executedCount }} 项；存在不通过项时建议执行「发布撤回」。</div>
              <el-table :data="verifyItems" size="small">
                <el-table-column prop="name" label="验证项" min-width="220" show-overflow-tooltip />
                <el-table-column label="结果" width="104">
                  <template #default="{ row }">
                    <StatusTag dict="" :label="row.result" :tone="row.result === '通过' ? 'success' : row.result === '不通过' ? 'danger' : 'neutral'" />
                  </template>
                </el-table-column>
                <el-table-column prop="remark" label="备注" min-width="200" show-overflow-tooltip />
                <el-table-column label="操作" width="150" fixed="right">
                  <template #default="{ row }">
                    <el-button link type="success" size="small" :disabled="!canManage" @click="setVerify(row.name, '通过')">通过</el-button>
                    <el-button link type="danger" size="small" :disabled="!canManage" @click="setVerify(row.name, '不通过')">不通过</el-button>
                  </template>
                </el-table-column>
                <template #empty><div class="empty-box"><div class="empty-box__text">暂无验证项</div></div></template>
              </el-table>
            </div>
          </div>

          <!-- 关联需求与变更 -->
          <div class="card mb-4">
            <div class="card__head"><span class="card__title">关联需求 / 变更 / 问题</span><span class="card__sub">发布以需求或问题为原始驱动</span></div>
            <div class="card__body">
              <div class="bold text-sm mb-2">驱动本次发布的问题（{{ list(r.problemIds).length }}）</div>
              <el-table :data="relProblems(r.problemIds)" size="small" class="mb-3">
                <el-table-column label="问题单号" width="140">
                  <template #default="{ row }">
                    <el-button link type="primary" @click="router.push(`/problem/detail/${row.id}`)">{{ row.no }}</el-button>
                  </template>
                </el-table-column>
                <el-table-column prop="title" label="问题标题" min-width="240" show-overflow-tooltip />
                <el-table-column label="状态" width="110">
                  <template #default="{ row }"><StatusTag dict="ProblemStatus" :value="row.status" /></template>
                </el-table-column>
                <template #empty><div class="empty-box"><div class="empty-box__text">本次发布不是由问题单驱动（新建发布申请可选择「问题驱动」）</div></div></template>
              </el-table>

              <div class="bold text-sm mb-2">关联需求（{{ list(r.demandIds).length }}）</div>
              <el-table :data="relDemands(r.demandIds)" size="small" class="mb-3">
                <el-table-column label="需求单号" width="140">
                  <template #default="{ row }">
                    <el-button link type="primary" @click="router.push(`/demand/detail/${row.id}`)">{{ row.no }}</el-button>
                  </template>
                </el-table-column>
                <el-table-column prop="title" label="需求名称" min-width="240" show-overflow-tooltip />
                <el-table-column label="状态" width="110">
                  <template #default="{ row }"><StatusTag dict="DemandStatus" :value="row.status" /></template>
                </el-table-column>
                <template #empty><div class="empty-box"><div class="empty-box__text">本次发布未直接关联需求</div></div></template>
              </el-table>

              <div class="bold text-sm mb-2">关联变更（{{ list(r.changeIds).length }}）</div>
              <el-table :data="relChanges(r.changeIds)" size="small">
                <el-table-column label="变更单号" width="140">
                  <template #default="{ row }">
                    <el-button link type="primary" @click="router.push('/change/list')">{{ row.no }}</el-button>
                  </template>
                </el-table-column>
                <el-table-column prop="title" label="变更名称" min-width="240" show-overflow-tooltip />
                <el-table-column label="状态" width="110">
                  <template #default="{ row }"><StatusTag dict="ChangeStatus" :value="row.status" /></template>
                </el-table-column>
                <template #empty><div class="empty-box"><div class="empty-box__text">本次发布未关联变更单</div></div></template>
              </el-table>
            </div>
          </div>

          <!-- 发布审计 -->
          <div class="card">
            <div class="card__head">
              <span class="card__title">发布审计结论</span>
              <span class="card__sub">对发布项进行事后审计，确保每次升级闭环</span>
              <span class="card__spacer" />
              <el-button v-if="canManage" size="small" type="success" plain @click="runAudit">
                {{ r.auditedAt ? '重新审计' : '执行事后审计' }}
              </el-button>
            </div>
            <div class="card__body">
              <div v-if="r.auditedAt" class="audit-box">
                <div class="text-sm">{{ r.auditNote }}</div>
                <div class="text-xs muted mt-2">审计人：{{ r.approver || store.user.name }} · 审计时间：{{ fmtTime(r.auditedAt) }}</div>
              </div>
              <div v-else class="empty-box">
                <div class="empty-box__icon"><el-icon><Tickets /></el-icon></div>
                <div class="empty-box__text">尚未执行事后审计，发布项未闭环</div>
              </div>
            </div>
          </div>
        </div>

        <!-- 右栏 -->
        <div>
          <div class="card mb-4">
            <div class="card__head"><span class="card__title">业务验证结果分布</span></div>
            <div class="card__body">
              <ChartBox kind="donut" :data="verifyChart.length ? verifyChart : [{ name: '暂无验证项', value: 0 }]" :height="210" center-label="验证项" />
            </div>
          </div>

          <div class="card mb-4">
            <div class="card__head"><span class="card__title">发布时间轴</span></div>
            <div class="card__body">
              <div class="tl">
                <div v-for="(t, i) in list(r.timeline)" :key="i" class="tl__item" :class="i === list(r.timeline).length - 1 ? 'tl__item--active' : 'tl__item--done'">
                  <div class="tl__dot" />
                  <div class="tl__head">
                    <span class="tl__action">{{ t.action }}</span>
                    <span class="tl__meta">{{ t.actor }} · {{ t.at }}</span>
                  </div>
                  <div v-if="t.comment" class="tl__body">{{ t.comment }}</div>
                </div>
              </div>
              <div v-if="!list(r.timeline).length" class="empty-box"><div class="empty-box__text">暂无发布记录</div></div>
            </div>
          </div>

          <div class="card">
            <div class="card__head"><span class="card__title">发布审计日志</span><span class="card__sub">字段级留痕</span></div>
            <div class="card__body card__body--flush">
              <el-table :data="audits" size="small" max-height="420">
                <el-table-column prop="operatedAt" label="时间" width="128" />
                <el-table-column prop="action" label="动作" width="118" show-overflow-tooltip />
                <el-table-column prop="operator" label="操作人" width="86" />
                <el-table-column label="字段变更" min-width="170">
                  <template #default="{ row }">
                    <div v-for="(c, i) in list(row.changes)" :key="i" class="log-line">
                      <span class="muted">{{ c.field }}</span>：<span class="muted">{{ c.before }}</span> → <b>{{ c.after }}</b>
                    </div>
                    <div v-if="!list(row.changes).length" class="muted text-xs">{{ row.remark || '—' }}</div>
                  </template>
                </el-table-column>
                <template #empty><div class="empty-box"><div class="empty-box__text">暂无审计记录</div></div></template>
              </el-table>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.rollback-note {
  border: 1px solid var(--danger);
  background: var(--danger-bg);
  border-radius: var(--r-md);
  padding: var(--sp-4);
  color: var(--danger-fg);
}
.audit-box {
  border: 1px solid var(--success);
  background: var(--success-bg);
  border-radius: var(--r-md);
  padding: var(--sp-4);
  color: var(--success-fg);
}
.log-line { font-size: var(--fs-xs); line-height: 1.6; word-break: break-all; }
</style>
