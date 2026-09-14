<script setup lang="ts">
/**
 * AdminView —— 系统配置
 *
 * 覆盖内容：
 *  · 角色与权限：6 个角色 + 角色职责矩阵 + 权限点矩阵
 *  · 用户与组织：来自 seed 的 orgs / users
 *  · 租户与应用：租户注册申请审核、能力申请审核（对应能力开放门户）
 *  · 系统参数与系统维护
 */
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useDemoStore } from '@/stores/demo'
import { config } from '@/core/config'
import { roles as ROLES, roleMatrix } from '@/core/roles'
import { fmtTime, nowIso } from '@/core/utils'
import PageHead from '@/components/PageHead.vue'
import StatusTag from '@/components/StatusTag.vue'

const store = useDemoStore()
const tab = ref('roles')

/* -------------------------------------------------------- 权限点矩阵 -- */
const permKeys = Object.keys(config.perms)
const permMatrix = computed(() =>
  permKeys.map(p => ({
    perm: p,
    label: config.permLabel(p),
    roles: ROLES.map(r => ({ id: r.id, short: r.short, has: !!(r.all || r.perms.includes(p)) }))
  }))
)

function switchToRole(id: string) {
  store.setRole(id)
  const r = ROLES.find(x => x.id === id)
  ElMessage.success(`已切换为「${r?.name}」，菜单与数据范围已同步变化`)
}

/* ------------------------------------------------------ 租户与能力 -- */
const tenantRegs = computed(() => store.table('tenantRegs') as any[])
const capApplies = computed(() => store.table('capabilityApplies') as any[])

async function reviewTenant(t: any, pass: boolean) {
  let comment = ''
  if (pass) {
    comment = '资质材料齐全，同意开通'
  } else {
    try {
      const r = await ElMessageBox.prompt('请填写审核不通过的原因（将反馈给申请方）', '审核租户注册', {
        confirmButtonText: '确认不通过', cancelButtonText: '取消', inputType: 'textarea'
      })
      comment = r.value
    } catch { return }
  }
  store.update('tenantRegs', t.id, {
    status: pass ? 'APPROVED' : 'REJECTED',
    reviewer: store.user.name,
    reviewedAt: nowIso(),
    reviewComment: comment
  }, { action: pass ? '租户注册审核通过' : '租户注册驳回', remark: comment })
  store.notify({
    type: pass ? 'success' : 'warning',
    title: `租户注册申请 ${t.no} ${pass ? '已通过' : '未通过'}`,
    body: pass ? `审核意见：${comment}` : `驳回原因：${comment}，请补充材料后重新提交。`,
    toRoles: ['admin', 'desk']
  })
  ElMessage.success(pass ? '已通过审核' : '已驳回')
}

function reviewCapability(c: any, pass: boolean) {
  store.update('capabilityApplies', c.id, {
    status: pass ? 'APPROVED' : 'REJECTED',
    reviewer: store.user.name,
    reviewedAt: nowIso()
  }, { action: pass ? '能力申请审批通过' : '能力申请驳回' })
  ElMessage.success(pass ? '已通过能力申请' : '已驳回能力申请')
}

/* -------------------------------------------------------- 用户与组织 -- */
const users = computed(() => store.table('users') as any[])
const orgs = computed(() => store.table('orgs') as any[])
const userKw = ref('')
const filteredUsers = computed(() => {
  const k = userKw.value.toLowerCase()
  if (!k) return users.value
  return users.value.filter(u => `${u.name}${u.org}${u.title}${u.phone}`.toLowerCase().includes(k))
})

/* ---------------------------------------------------------- 系统参数 -- */
const params = ref({
  slaHours: 24,
  securityThreshold: 'L3',
  autoAssign: true,
  autoCloseDays: 3,
  retentionMonths: 6,
  auditRetention: '12 个月'
})
function saveParams() {
  store.addAudit({
    bizType: 'systemConfig', bizId: 'params', bizNo: 'SYS-PARAM', bizTitle: '系统参数',
    action: '修改系统参数',
    changes: [{ field: '安全审批阈值', before: '—', after: params.value.securityThreshold }],
    remark: `SLA 时限 ${params.value.slaHours}h；自动分派 ${params.value.autoAssign ? '开启' : '关闭'}；自动关闭 ${params.value.autoCloseDays} 天`
  })
  ElMessage.success('系统参数已保存（当前为内存态，刷新后恢复默认）')
}
</script>

<template>
  <div>
    <PageHead
      title="系统配置"
      desc="角色与权限、用户与组织、租户与能力申请审核、系统参数与系统维护。"
    />

    <div class="card">
      <div class="card__body" style="padding-bottom: 0">
        <el-tabs v-model="tab">
          <!-- ============ 角色与权限 ============ -->
          <el-tab-pane label="角色与权限" name="roles">
            <div class="section-title">角色（顶部可切换，切换后菜单与数据范围同步变化）</div>
            <div class="grid grid--3 mb-4">
              <div v-for="r in ROLES" :key="r.id" class="role-card" :class="{ 'is-current': r.id === store.role.id }">
                <div class="role-card__head">
                  <span class="role-card__avatar"><el-icon :size="17"><component :is="r.icon" /></el-icon></span>
                  <div>
                    <div class="bold">{{ r.name }}</div>
                    <div class="text-xs muted">{{ r.org }}</div>
                  </div>
                  <span class="card__spacer" />
                  <el-tag v-if="r.id === store.role.id" size="small" type="success">当前</el-tag>
                </div>
                <div class="role-card__desc">{{ r.desc }}</div>
                <div class="role-card__foot">
                  <span class="text-xs muted">数据范围：{{ r.dataScope === 'ALL' ? '全部' : r.dataScope === 'ORG' ? '本组织' : '本人' }}</span>
                  <span class="card__spacer" />
                  <el-button size="small" :disabled="r.id === store.role.id" @click="switchToRole(r.id)">切换到此角色</el-button>
                </div>
              </div>
            </div>

            <div class="section-title">权限点矩阵（勾选表示具备该权限，— 表示不具备；平台管理员拥有全部权限）</div>
            <div class="tablewrap mb-4">
              <table class="matrix">
                <thead>
                  <tr>
                    <th style="width: 220px">权限点</th>
                    <th style="width: 260px">说明</th>
                    <th v-for="r in ROLES" :key="r.id" style="width: 80px">{{ r.short }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in permMatrix" :key="row.perm">
                    <td class="mono text-xs">{{ row.perm }}</td>
                    <td>{{ row.label }}</td>
                    <td v-for="c in row.roles" :key="c.id" :class="c.has ? 'yes' : 'no'">
                      <el-icon v-if="c.has"><Check /></el-icon>
                      <span v-else>—</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="section-title">建设方案中的角色与职责依据（共 {{ roleMatrix.length }} 类）</div>
            <el-table :data="roleMatrix" size="small" style="width: 100%" class="mb-4">
              <el-table-column prop="name" label="角色" width="200" />
              <el-table-column prop="org" label="所属组织" width="200" />
              <el-table-column prop="duty" label="核心职责" min-width="260" />
              <el-table-column prop="spec" label="职责依据" min-width="360" show-overflow-tooltip />
            </el-table>
          </el-tab-pane>

          <!-- ============ 用户与组织 ============ -->
          <el-tab-pane label="用户与组织" name="users">
            <div class="flex items-center mb-3">
              <el-input v-model="userKw" placeholder="搜索姓名 / 组织 / 职务 / 手机号" clearable style="width: 260px" />
              <span class="card__spacer" />
              <span class="text-sm muted">共 {{ orgs.length }} 个组织 · {{ users.length }} 名用户</span>
            </div>
            <el-table :data="filteredUsers" size="small" style="width: 100%">
              <el-table-column prop="name" label="姓名" width="110" />
              <el-table-column prop="org" label="所属组织" min-width="220" />
              <el-table-column prop="title" label="职务" width="180" />
              <el-table-column prop="phone" label="手机号" width="140">
                <template #default="{ row }">
                  <span class="masked">{{ row.phone.slice(0, 3) }}****{{ row.phone.slice(-4) }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="email" label="邮箱" min-width="200" />
            </el-table>
          </el-tab-pane>

          <!-- ============ 租户与能力 ============ -->
          <el-tab-pane label="租户与能力申请" name="tenant">
            <div class="section-title">租户注册申请（对应「能力开放门户 → 租户注册 / 租户信息审核」）</div>
            <el-table :data="tenantRegs" size="small" style="width: 100%" class="mb-4">
              <el-table-column prop="no" label="申请单号" width="140" />
              <el-table-column label="类型" width="80">
                <template #default="{ row }"><el-tag size="small" effect="plain">{{ row.type }}</el-tag></template>
              </el-table-column>
              <el-table-column prop="name" label="租户/申请人" min-width="220" show-overflow-tooltip />
              <el-table-column label="提交时间" width="140">
                <template #default="{ row }">{{ row.submittedAt ?? row.reviewedAt ?? '—' }}</template>
              </el-table-column>
              <el-table-column label="状态" width="100">
                <template #default="{ row }"><StatusTag dict="TenantStatus" :value="row.status" /></template>
              </el-table-column>
              <el-table-column label="审核意见" min-width="200" show-overflow-tooltip>
                <template #default="{ row }"><span class="muted">{{ row.reviewComment ?? '—' }}</span></template>
              </el-table-column>
              <el-table-column label="操作" width="150" fixed="right">
                <template #default="{ row }">
                  <template v-if="row.status === 'PENDING'">
                    <el-button link type="primary" size="small" @click="reviewTenant(row, true)">通过</el-button>
                    <el-button link type="danger" size="small" @click="reviewTenant(row, false)">驳回</el-button>
                  </template>
                  <span v-else class="text-xs muted">已处理</span>
                </template>
              </el-table-column>
            </el-table>

            <div class="section-title">能力申请（对应「能力开放门户 → 能力申请」）</div>
            <el-table :data="capApplies" size="small" style="width: 100%" class="mb-4">
              <el-table-column prop="no" label="申请单号" width="140" />
              <el-table-column prop="applicant" label="申请人" width="110" />
              <el-table-column prop="applyType" label="申请类型" width="130" />
              <el-table-column prop="storage" label="存储" width="100" />
              <el-table-column prop="cpu" label="CPU" width="90" />
              <el-table-column prop="memory" label="内存" width="100" />
              <el-table-column label="状态" width="100">
                <template #default="{ row }"><StatusTag dict="TenantStatus" :value="row.status" /></template>
              </el-table-column>
              <el-table-column label="操作" width="150" fixed="right">
                <template #default="{ row }">
                  <template v-if="row.status === 'PENDING'">
                    <el-button link type="primary" size="small" @click="reviewCapability(row, true)">通过</el-button>
                    <el-button link type="danger" size="small" @click="reviewCapability(row, false)">驳回</el-button>
                  </template>
                  <span v-else class="text-xs muted">已处理</span>
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>

          <!-- ============ 系统参数 ============ -->
          <el-tab-pane label="系统参数" name="params">
            <div class="grid grid--2" style="max-width: 900px">
              <div class="fitem">
                <label class="fitem__label">需求审批 SLA 时限（小时）</label>
                <el-input-number v-model="params.slaHours" :min="1" :max="240" />
                <div class="fitem__hint">用于计算待审批需求单的超期预警</div>
              </div>
              <div class="fitem">
                <label class="fitem__label">安全合规审批触发阈值</label>
                <el-select v-model="params.securityThreshold">
                  <el-option label="L2 及以上" value="L2" />
                  <el-option label="L3 及以上" value="L3" />
                  <el-option label="L4 及以上" value="L4" />
                </el-select>
                <div class="fitem__hint">资源敏感级别达到该值，审批链自动增加安全审批节点</div>
              </div>
              <div class="fitem">
                <label class="fitem__label">事件按分类自动分派</label>
                <el-switch v-model="params.autoAssign" />
                <div class="fitem__hint">关闭后所有事件需手工分派</div>
              </div>
              <div class="fitem">
                <label class="fitem__label">事件自动关闭天数（天）</label>
                <el-input-number v-model="params.autoCloseDays" :min="1" :max="30" />
                <div class="fitem__hint">已解决事件超过该天数未确认则自动关闭</div>
              </div>
              <div class="fitem">
                <label class="fitem__label">回访调查触发</label>
                <el-input value="服务请求处理完毕后自动产生" disabled />
                <div class="fitem__hint">服务请求处理完毕后，系统自动产生回访调查</div>
              </div>
              <div class="fitem">
                <label class="fitem__label">审计日志保留期</label>
                <el-select v-model="params.auditRetention">
                  <el-option label="6 个月" value="6 个月" />
                  <el-option label="12 个月" value="12 个月" />
                  <el-option label="24 个月" value="24 个月" />
                </el-select>
                <div class="fitem__hint">默认保留 12 个月，可按审计要求调整</div>
              </div>
            </div>
            <el-button type="primary" class="mt-4" @click="saveParams">保存系统参数</el-button>
          </el-tab-pane>

          <!-- ============ 系统维护 ============ -->
          <el-tab-pane label="系统维护" name="tools">
            <div class="grid grid--2" style="max-width: 900px">
              <div class="card" style="margin: 0">
                <div class="card__head"><div class="card__title">数据</div></div>
                <div class="card__body">
                  <p class="text-sm muted mb-3">可将业务数据一键恢复到初始状态。</p>
                  <el-button @click="store.reset(true); ElMessage.success('已重置（保留当前角色）')"><el-icon><RefreshLeft /></el-icon> 重置初始数据</el-button>
                  <div class="fitem__hint mt-2">
                    存储方式：{{ store.db.meta ? 'localStorage（刷新后保持操作结果）' : '内存' }}
                  </div>
                </div>
              </div>
              <div class="card" style="margin: 0">
                <div class="card__head"><div class="card__title">版本与归属</div></div>
                <div class="card__body text-sm" style="line-height: 2">
                  系统名称：{{ config.appName }}<br />
                  系统版本：{{ config.version }}<br />
                  建设归属：{{ config.owner }}<br />
                  运行环境：三医数据底座 · 数据服务管理工具
                </div>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </div>
  </div>
</template>

<style scoped>
.section-title {
  font-size: var(--fs-lg); font-weight: 600; margin: 6px 0 12px;
  display: flex; align-items: center; gap: 8px;
}
.section-title::before {
  content: ""; width: 3px; height: 15px; border-radius: var(--r-pill); background: var(--brand-600);
}
.role-card {
  border: 1px solid var(--border-2); border-radius: var(--r-md);
  padding: 12px 14px; background: var(--surface-2);
  display: flex; flex-direction: column; gap: 8px;
}
.role-card.is-current { border-color: var(--brand-400); background: var(--brand-50); }
.role-card__head { display: flex; align-items: center; gap: 10px; }
.role-card__avatar {
  width: 32px; height: 32px; flex: none; border-radius: 50%;
  display: grid; place-items: center; color: #fff; font-size: 14px; font-weight: 700;
  background: var(--brand-600);
}
.role-card__desc { font-size: var(--fs-xs); color: var(--text-2); line-height: 1.6; min-height: 34px; }
.role-card__foot { display: flex; align-items: center; border-top: 1px solid var(--border-2); padding-top: 8px; }
.tablewrap { overflow-x: auto; }
.matrix .yes { color: var(--success-fg); font-size: 15px; }
.matrix .no { color: var(--text-4); }
.fitem { display: flex; flex-direction: column; gap: 6px; }
.fitem__label { font-size: var(--fs-sm); color: var(--text-2); }
.fitem__hint { font-size: var(--fs-xs); color: var(--text-3); }
</style>
