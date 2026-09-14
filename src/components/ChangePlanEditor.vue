<script setup lang="ts">
/**
 * ChangePlanEditor —— 变更「调整实施计划」抽屉
 *
 * 变更管理列表、变更单详情、冲突分析结论三处共用同一个编辑面板：
 *   · 可调整状态与权限判定统一走 core/changePlan.ts；
 *   · 保存即写字段级审计（store.update 自动记录前后值）并追加流转记录；
 *   · 支持「保存并重新分析冲突」，直接兑现原文"支持调整实施计划后重新分析"。
 */
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useDemoStore } from '@/stores/demo'
import { config } from '@/core/config'
import { canEditChangePlan, planEditableStatus } from '@/core/changePlan'
import { fmtDate, NOW } from '@/core/utils'
import StatusTag from '@/components/StatusTag.vue'

const props = defineProps<{ modelValue: boolean; change: any }>()
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'saved', payload: { change: any; rerun: boolean }): void
}>()

const store = useDemoStore()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v)
})

const lst = (v: unknown): any[] => (Array.isArray(v) ? v : [])

const categories = ['范围变更', '服务变更', '资源变更', '计划变更', '配置变更']
const resources = computed(() => store.table('resources') as any[])
const incidentOptions = computed(() => (store.table('incidents') as any[]).slice(0, 60))
const implementerOptions = computed(() => (store.table('users') as any[]).filter(u => /生产中心|运营中心|运维中心/.test(u.org)))

const pf = reactive({
  implementDate: '',
  implementer: '',
  priority: 'P2',
  category: '范围变更',
  resources: [] as string[],
  relatedIncidentIds: [] as string[],
  plan: ''
})

const original = ref<{ implementDate: string; implementer: string; plan: string }>({ implementDate: '', implementer: '', plan: '' })

/** 打开抽屉时用变更单当前值初始化表单 */
watch(() => [props.modelValue, props.change?.id], () => {
  const c = props.change
  if (!props.modelValue || !c) return
  pf.implementDate = c.implementDate || fmtDate(NOW)
  pf.implementer = c.implementer || ''
  pf.priority = c.priority || 'P2'
  pf.category = c.category || '范围变更'
  pf.resources = [...lst(c.resources)]
  pf.relatedIncidentIds = [...lst(c.relatedIncidentIds)]
  pf.plan = c.plan || ''
  original.value = { implementDate: c.implementDate, implementer: c.implementer, plan: c.plan }
}, { immediate: true })

const editable = computed(() => planEditableStatus(props.change))
const allowed = computed(() => canEditChangePlan(store.can, props.change))
/** 待处置冲突（本地宽松化，避免模板里对 unknown 取属性） */
const conflicts = computed<any[]>(() => lst(props.change?.conflicts))

function save(rerun = false) {
  const c = props.change
  if (!c) return
  if (!allowed.value) {
    ElMessage.warning(
      editable.value
        ? '当前角色无「调整实施计划」权限，请切换为「供数方」或「平台管理员」'
        : '当前状态不可调整实施计划：已审批通过 / 实施中的变更需重新发起变更流程'
    )
    return
  }
  if (!pf.plan.trim()) { ElMessage.warning('请填写实施计划（实施步骤、窗口时间、回滚预案）'); return }

  store.update('changes', c.id, {
    implementDate: pf.implementDate,
    implementer: pf.implementer,
    priority: pf.priority,
    category: pf.category,
    resources: [...pf.resources],
    relatedIncidentIds: [...pf.relatedIncidentIds],
    plan: pf.plan
  }, {
    action: '调整实施计划',
    remark: `实施日期 ${original.value.implementDate} → ${pf.implementDate}；实施者 ${original.value.implementer} → ${pf.implementer}`
  })
  store.pushTimeline(c, {
    action: '调整实施计划',
    comment: `实施日期调整为 ${pf.implementDate}，实施者 ${pf.implementer}，并同步更新实施计划说明`
  })
  visible.value = false
  ElMessage.success('实施计划已保存，字段级变更（前 → 后）已写入审计中心')
  emit('saved', { change: c, rerun })
}
</script>

<template>
  <el-drawer v-model="visible" title="调整实施计划" size="660px">
    <template v-if="change">
      <el-alert
        class="mb-3"
        :type="allowed ? 'info' : 'warning'"
        :closable="false"
        show-icon
        :title="allowed
          ? '依据冲突分析结论调整实施日期 / 实施者 / 实施计划，保存后字段级变更自动写入审计中心'
          : '当前状态不可调整实施计划：已审批通过 / 实施中的变更需重新发起变更流程'"
        :description="`${change.no} · ${change.title}（当前状态：${(config.dicts.ChangeStatus as any)[change.status]?.label ?? change.status}）`"
      />

      <el-form label-width="98px">
        <el-form-item label="实施日期">
          <el-date-picker v-model="pf.implementDate" type="date" value-format="YYYY-MM-DD" style="width: 200px" :disabled="!allowed" />
          <span class="text-xs muted" style="margin-left: 10px">原计划：{{ change.implementDate || '—' }}</span>
        </el-form-item>
        <el-form-item label="实施者">
          <el-select v-model="pf.implementer" filterable style="width: 240px" :disabled="!allowed">
            <el-option v-for="u in implementerOptions" :key="u.id" :label="`${u.name}（${u.org}）`" :value="u.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="变更分类">
          <el-select v-model="pf.category" style="width: 200px" :disabled="!allowed">
            <el-option v-for="o in categories" :key="o" :label="o" :value="o" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级">
          <el-radio-group v-model="pf.priority" :disabled="!allowed">
            <el-radio-button v-for="(o, k) in config.dicts.Priority" :key="k" :value="k">{{ o.label }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="相应资源">
          <el-select v-model="pf.resources" multiple filterable placeholder="选择变更涉及的资源" style="width: 100%" :disabled="!allowed">
            <el-option v-for="r in resources" :key="r.id" :label="`${r.name}（${r.code} · ${r.securityLevel}）`" :value="r.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="关联事件单">
          <el-select v-model="pf.relatedIncidentIds" multiple filterable placeholder="可多选" style="width: 100%" :disabled="!allowed">
            <el-option v-for="i in incidentOptions" :key="i.id" :label="`${i.no} ${i.title}`" :value="i.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="实施计划">
          <el-input v-model="pf.plan" type="textarea" :rows="5" :disabled="!allowed"
            placeholder="实施步骤、窗口时间、回滚预案、受影响订阅方通知计划" />
        </el-form-item>
      </el-form>

      <div v-if="conflicts.length" class="mt-2">
        <div class="bold mb-2">待处置的冲突（{{ conflicts.length }}）</div>
        <div v-for="(cf, i) in conflicts" :key="i" class="text-sm" style="margin-bottom: 6px">
          <StatusTag :label="cf.type" tone="warning" :dot="false" />
          <span style="margin-left: 6px">{{ cf.with }}</span>
          <div class="text-xs muted">{{ cf.suggestion }}</div>
        </div>
      </div>
    </template>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button :disabled="!allowed" @click="save(false)">保存</el-button>
      <el-button type="primary" :disabled="!allowed" @click="save(true)">保存并重新分析冲突</el-button>
    </template>
  </el-drawer>
</template>
