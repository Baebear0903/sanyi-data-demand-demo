/**
 * useDemoStore —— 演示系统数据仓库（Pinia）
 *
 * 职责：
 *  · 装载种子数据 / localStorage 持久化 / 一键重置
 *  · 当前登录账号与身份（角色）判定：账号名称恒定，切换身份只换权限与所属机构
 *  · 单据变更：自动写字段级审计（对应建设方案的变更/事件/问题/发布审计）
 *  · 通知中心与待办推导
 *
 * 所有页面通过本 store 读写数据，不直接改 seed，以保证审计留痕与可重置。
 */
import { defineStore } from 'pinia'
import { seed } from '@/mock/seed'
import { config } from '@/core/config'
import { roles as ROLES, roleMatrix } from '@/core/roles'
import type { Role } from '@/core/roles'
import type { AuditRecord, Message } from '@/core/types'
import {
  NOW, iso, deepClone, find, findById, get, isArr, isFn, isNil, uid, by
} from '@/core/utils'
import { safeStore, safeSession } from '@/core/storage'

const KEY = 'drm-demo-state-v1'
const KEY_PREFS = 'drm-demo-prefs-v1'
const KEY_COVERAGE = 'drm-coverage-v1'
/** 本次会话的登录身份（会话级：新开标签页回到默认身份） */
const KEY_ROLE = 'drm-demo-role-v1'
/** 默认身份：平台管理员 —— 除非演示者手动切换，否则始终以管理员权限进入 */
const DEFAULT_ROLE = 'admin'
/** 登录账号名称：切换身份不改名，留痕统一记该账号 */
const ACCOUNT_NAME = '超级管理员'

export type Db = Record<string, any>

function buildSeedDb(): Db {
  const db: Db = {}
  for (const k of Object.keys(seed as Record<string, unknown>)) {
    if (k === 'now') continue
    const v = (seed as Record<string, any>)[k]
    db[k] = isFn(v) ? v() : deepClone(v)
  }
  db.roles = ROLES
  db.roleMatrix = roleMatrix
  db.meta = { seededAt: iso(NOW), version: config.version }
  db.messages = []
  return db
}

export const useDemoStore = defineStore('demo', {
  state: () => ({
    db: {} as Db,
    roleId: '' as string,
    prefs: { sidebarCollapsed: false, dense: true },
    scenario: null as string | null,
    auditSeq: 0,
    _loaded: false,
    /** 功能点覆盖检查表的验收勾选（持久化，便于多次验收累计） */
    coverageChecked: {} as Record<string, boolean>
  }),

  getters: {
    roles: (): Role[] => ROLES,
    role(state): Role {
      return find(ROLES, r => r.id === state.roleId) ?? ROLES[0]
    },
    /**
     * 当前登录账号：演示系统以固定账号进入，**名称恒定**；
     * 切换身份只改变该账号的角色（权限）与所属机构，账号本身不变。
     * 因此所有基于本账号的操作（申请人 / 审批人 / 操作人 / 留痕）都记该账号名。
     */
    user(state) {
      const r = find(ROLES, x => x.id === state.roleId) ?? ROLES[0]
      const rep = find(state.db.users ?? [], (u: any) => u.id === r.repUserId)
        ?? { id: 'u0', name: ACCOUNT_NAME, org: '演示组织', title: '', phone: '', email: '' }
      return { ...rep, name: ACCOUNT_NAME }
    },
    /**
     * 「本人」判定（提交 / 撤回 / 作废 / 验收 / 退订等入口）
     *
     * 种子单据的提交人记的是各身份对应的演示人员（李慧敏 / 张建国 …），
     * 而本账号新建的单据记登录账号名；两者都算"本人"，
     * 否则切到某个身份后，种子单据上的这些入口会整体消失。
     */
    isMine(state) {
      return (name?: string | null): boolean => {
        if (!name) return false
        if (name === ACCOUNT_NAME) return true
        const r = find(ROLES, x => x.id === state.roleId) ?? ROLES[0]
        const rep = find(state.db.users ?? [], (u: any) => u.id === r.repUserId)
        return !!(rep && rep.name === name)
      }
    },
    /** 是否拥有权限点（角色 all: true 视为全量；perms 里的权限点逐条判定） */
    can(state) {
      return (perm: string): boolean => {
        const r = find(ROLES, x => x.id === state.roleId)
        if (!r) return false
        if (r.all) return true
        return (r.perms ?? []).includes(perm)
      }
    },
    /** 待办（依据 config.todoRules + 当前角色推导） */
    todos(state) {
      const rid = state.roleId
      const out: any[] = []
      for (const rule of config.todoRules) {
        if (!rule.roles.includes(rid)) continue
        const rows = (state.db[rule.table] ?? []) as any[]
        for (const rec of rows) {
          if (!rule.statuses.includes(rec.status)) continue
          out.push({
            table: rule.table, id: rec.id, no: rec.no,
            title: rec.title ?? rec.name ?? '',
            status: rec.status, action: rule.action, kind: rule.kind,
            route: rule.route.replace(':id', rec.id),
            priority: rec.priority ?? 'P2',
            dueAt: rule.dueField ? rec[rule.dueField] : null
          })
        }
      }
      return by(out, 'dueAt', 'asc')
    },
    /** 当前角色可见的消息 */
    messages(state): Message[] {
      const rid = state.roleId
      const uidOf = (find(ROLES, r => r.id === rid) ?? ROLES[0]).repUserId
      return (state.db.messages ?? []).filter((m: Message) => {
        const to = m.toRoles ?? []
        if (!to.length) return true
        return to.includes(rid) || (m.to ?? []).includes(uidOf)
      })
    },
    unreadCount(): number {
      return (this.messages as Message[]).filter(m => !m.read).length
    },
    /** 根据路由 key 反查所属产品（供顶部产品切换与侧栏联动） */
    productOfRoute() {
      return (routeKey: string): string | null => {
        for (const p of config.products) {
          if (p.menu.some((m: any) => m.key === routeKey)) return p.key
        }
        return null
      }
    }
  },

  actions: {
    /* ---------------------------------------------------------- 初始化 -- */
    init() {
      // 偏好
      const p = safeStore.get(KEY_PREFS)
      if (p) { try { Object.assign(this.prefs, JSON.parse(p)) } catch { /* ignore */ } }

      // 数据（版本不匹配则重新播种，避免旧结构导致页面报错）
      let loaded = false
      const saved = safeStore.get(KEY)
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          if (parsed?.meta?.version === config.version) { this.db = parsed; loaded = true }
        } catch { loaded = false }
      }
      if (!loaded) this.db = buildSeedDb()

      // 验收勾选（独立于业务数据，重置业务数据不清空）
      const cov = safeStore.get(KEY_COVERAGE)
      if (cov) { try { this.coverageChecked = JSON.parse(cov) } catch { this.coverageChecked = {} } }

      const lastRole = safeSession.get(KEY_ROLE)
      this.roleId = (lastRole && find(ROLES, r => r.id === lastRole)) ? lastRole : DEFAULT_ROLE
      this._loaded = true

      /*
       * 初始化结束时立即落盘：
       * 当检测到版本不一致而重新播种时，若不在此时写回，
       * 旧的（结构或文案已过期的）数据会继续残留在 localStorage 中，
       * 任何直接读取存储的逻辑都会拿到过期内容。此处写回保证存储与内存一致。
       */
      this.persist()
    },

    persist() {
      if (!this._loaded) return
      try { safeStore.set(KEY, JSON.stringify(this.db)) } catch { /* 超配额时仅保留内存态 */ }
    },

    savePrefs() { safeStore.set(KEY_PREFS, JSON.stringify(this.prefs)) },

    reset(keepRole = true) {
      const r = this.roleId
      this.db = buildSeedDb()
      if (keepRole) this.roleId = r
      safeStore.del(KEY)
      this.persist()
    },

    /* -------------------------------------------------------------- 身份 -- */
    /** 切换本账号的身份（角色）：权限与所属机构随身份变化，账号名称不变 */
    setRole(id: string) {
      this.roleId = id
      safeSession.set(KEY_ROLE, id)
    },

    /* -------------------------------------------------------------- 表 -- */
    /** 取整张表（返回 any[] 以便页面直接访问字段；类型由各页面的接口自行收窄） */
    table(name: string): any[] {
      if (!this.db[name]) this.db[name] = []
      return this.db[name]
    },
    findById(name: string, id: string) {
      return findById(this.table(name), id)
    },
    query<T = any>(name: string, where?: Record<string, unknown>): T[] {
      const rows = this.table(name)
      if (!where) return rows.slice()
      return rows.filter(r => {
        for (const k of Object.keys(where)) {
          const cond = where[k]
          if (isArr(cond)) { if (!(cond as unknown[]).includes(get(r, k))) return false }
          else if (isFn(cond)) { if (!(cond as Function)(get(r, k), r)) return false }
          else if (get(r, k) !== cond) return false
        }
        return true
      })
    },

    /* ------------------------------------------------- 写操作 + 审计 -- */
    /** 字段级差异对比 */
    diffFields(before: any, after: any, fields?: string[]) {
      const keys = fields ?? Object.keys(after ?? {})
      const out: { field: string; before: string; after: string }[] = []
      for (const f of keys) {
        const b = before ? before[f] : undefined
        const a = after[f]
        if (JSON.stringify(b) !== JSON.stringify(a)) {
          out.push({ field: f, before: fmtVal(b), after: fmtVal(a) })
        }
      }
      return out
    },

    addAudit(a: Partial<AuditRecord>): AuditRecord {
      this.auditSeq += 1
      const u = this.user
      const rec: AuditRecord = {
        id: `audit_${Date.now().toString(36)}_${this.auditSeq}`,
        bizType: 'UNKNOWN', bizId: '', bizNo: '', bizTitle: '',
        action: '编辑', changes: [], remark: '',
        operator: u.name, operatorOrg: u.org ?? '',
        operatedAt: iso(NOW),
        ip: `10.20.${10 + (this.auditSeq % 200)}.${2 + (this.auditSeq % 250)}`,
        terminal: 'Web 端 / Chrome',
        ...a
      } as AuditRecord
      const list = this.table('audits')
      list.unshift(rec)
      if (list.length > 500) list.length = 500
      return rec
    },

    /**
     * 更新一条记录并写审计
     * @param opts.action 动作名（审批通过 / 接单 / 解决 …）
     */
    update(tableName: string, id: string, patch: Record<string, unknown>, opts: {
      action?: string; remark?: string; bizType?: string; skipAudit?: boolean
    } = {}) {
      const rec = this.findById(tableName, id)
      if (!rec) return null
      const before = deepClone(rec)
      const changes = this.diffFields(before, patch)
      Object.assign(rec, patch)
      rec.updatedAt = iso(NOW)
      if (!opts.skipAudit && changes.length) {
        this.addAudit({
          bizType: opts.bizType ?? tableName,
          bizId: rec.id, bizNo: rec.no ?? rec.id, bizTitle: rec.title ?? rec.name ?? '',
          action: opts.action ?? '编辑',
          changes, remark: opts.remark ?? ''
        })
      }
      this.persist()
      return rec
    },

    /** 追加时间轴 */
    pushTimeline(rec: any, entry: { action: string; actor?: string; comment?: string; at?: string }) {
      if (!rec) return
      if (!rec.timeline) rec.timeline = []
      rec.timeline.push({ at: entry.at ?? iso(NOW), actor: entry.actor ?? this.user.name, ...entry })
    },

    insert(tableName: string, rec: any) {
      const t = this.table(tableName)
      rec.id ||= uid(tableName)
      rec.createdAt ||= iso(NOW)
      rec.updatedAt ||= rec.createdAt
      t.unshift(rec)
      this.persist()
      return rec
    },

    remove(tableName: string, id: string, opts: { bizType?: string; remark?: string } = {}) {
      const t = this.table(tableName)
      const idx = t.findIndex((r: any) => r.id === id || r.no === id)
      if (idx < 0) return false
      const [rec] = t.splice(idx, 1)
      this.addAudit({
        bizType: opts.bizType ?? tableName, bizId: rec.id, bizNo: rec.no ?? rec.id,
        bizTitle: rec.title ?? rec.name ?? '', action: '删除', remark: opts.remark ?? ''
      })
      this.persist()
      return true
    },

    /* ---------------------------------------------------------- 通知 -- */
    notify(o: Partial<Message>): Message {
      this.auditSeq += 1
      const rec: Message = {
        id: `msg_${Date.now().toString(36)}_${this.auditSeq}`,
        type: 'info', title: '', body: '', at: iso(NOW),
        to: [], read: false, channels: ['站内'], link: '',
        ...o
      } as Message
      this.table('messages').unshift(rec)
      this.persist()
      return rec
    },
    markRead(id: string) {
      const m = this.findById('messages', id)
      if (m) { m.read = true; this.persist() }
    },
    markAllRead() {
      ;(this.messages as Message[]).forEach(m => { m.read = true })
      this.persist()
    },

    /* ------------------------------------------------ 覆盖检查勾选 -- */
    setCoverageChecked(id: string, v: boolean) {
      this.coverageChecked = { ...this.coverageChecked, [id]: v }
      safeStore.set(KEY_COVERAGE, JSON.stringify(this.coverageChecked))
    },
    setAllCoverage(v: boolean, ids: string[]) {
      const next: Record<string, boolean> = {}
      for (const id of ids) next[id] = v
      this.coverageChecked = next
      safeStore.set(KEY_COVERAGE, JSON.stringify(next))
    },

    setScenario(id: string | null) { this.scenario = id },
    toggleSidebar() { this.prefs.sidebarCollapsed = !this.prefs.sidebarCollapsed; this.savePrefs() }
  }
})

/* ------------------------------------------------------------ 辅助 -- */
function fmtVal(v: unknown): string {
  if (isNil(v) || v === '') return '（空）'
  if (isArr(v)) return v.length ? (v as unknown[]).join('、') : '（空）'
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 120)
  return String(v)
}

/** 供组件用：状态字典取色取文案 */
export function dictItem(dictName: string, key?: string) {
  const d = (config.dicts as Record<string, any>)[dictName]
  if (!d || !key) return { label: key ?? '—', tag: 'neutral' as const }
  return d[key] ?? { label: key, tag: 'neutral' as const }
}
