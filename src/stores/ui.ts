/**
 * useUiStore —— 全局 UI 状态
 *
 * 统一管理跨组件的浮层与「非业务」面板状态，避免组件之间互相引用，
 * 也让 AppShell 只负责布局：
 *   · toolsDrawer  右上角信息入口抽屉（只有一个栏目：功能点覆盖表，剧本入口收在表底）
 *   · 覆盖表的搜索词 / 展开行 / 滚动位置 / 剧本进度
 *
 * 「上次位置」本地缓存（drm-tools-memory-v1）：
 *   核对抽屉是验收时反复开关的工具，因此只记住**上次看到哪儿** —— 搜索词、
 *   展开的功能点、剧本进度、滚动位置与表底剧本区的展开态。重新打开即回到原处，
 *   但不参与跳转（不记录、也不提供「回到上次核对的页面」）。
 *   注意：它与业务数据（drm-demo-state-v1）分开存储，点「重置数据」不会清掉核对进度。
 */
import { defineStore } from 'pinia'
import { coverageRows } from '@/core/reference'
import type { CoverageRow } from '@/core/reference'
import { safeStore } from '@/core/storage'

/**
 * 抽屉栏目。
 * 历史上还有 scenario（演示剧本）与 spec（原文依据对照）两个并列栏目，
 * 现已合并：剧本入口收在覆盖表最底部，原文依据并进父行「原文依据」弹窗。
 * 类型保留为联合类型，便于将来再扩展栏目时不必改缓存结构。
 */
export type ToolsPanel = 'coverage'

/** 核对抽屉的上次位置（只用于还原视图，不含任何跳转信息） */
export interface ToolsMemory {
  panel: ToolsPanel
  scenarioId: string | null
  scenarioStep: number
  coverageKw: string
  /** 层级筛选 */
  coverageLevel: 'all' | 'module' | 'item'
  /** 模块筛选（'' = 全部） */
  coverageModule: string
  /** 展开过的功能点编号（父行 id） */
  coverageOpen: string[]
  /** 表底剧本区是否展开（默认收起，弱化入口） */
  scenarioOpen: boolean
  /** 滚动位置 */
  scroll: Record<string, number>
}

function emptyMemory(): ToolsMemory {
  return {
    panel: 'coverage', scenarioId: null, scenarioStep: 0,
    coverageKw: '', coverageLevel: 'all', coverageModule: '',
    coverageOpen: [], scenarioOpen: false, scroll: {}
  }
}

/** 旧缓存兼容：历史版本的 panel 可能是 scenario / spec，统一归一为唯一栏目 */
function normalizePanel(_v: unknown): ToolsPanel {
  return 'coverage'
}

export const useUiStore = defineStore('ui', {
  state: () => ({
    /* ---- 右上角信息入口 ---- */
    toolsDrawer: false,
    toolsPanel: 'coverage' as ToolsPanel,

    /* ---- 功能点覆盖表 ---- */
    coverageRows: coverageRows as CoverageRow[],
    coverageKw: '',
    /** 层级筛选：全部 / 模块 / 条目 */
    coverageLevel: 'all' as 'all' | 'module' | 'item',
    /** 模块筛选：'' = 全部模块，'root' = 根行 */
    coverageModule: '',
    /** 展开的功能点编号（父行 id），键为 id 便于持久化 */
    coverageOpen: [] as string[],

    /* ---- 演示剧本（收在覆盖表最底部） ---- */
    scenarioOpen: false,
    activeScenario: null as string | null,
    scenarioStep: 0,

    /* ---- 核对抽屉的上次位置（本地缓存） ---- */
    toolsScroll: {} as Record<string, number>,

    /* ---- 其他浮层 ---- */
    messageDrawer: false,
    roleMatrixDialog: false
  }),
  actions: {
    /* ------------------------------------------- 上次位置的读写 -- */
    /** 启动时恢复（main.ts 在挂载前调用） */
    restoreToolsMemory() {
      const raw = safeStore.get('drm-tools-memory-v1')
      if (!raw) return
      try {
        const m = { ...emptyMemory(), ...(JSON.parse(raw) as Partial<ToolsMemory>) }
        this.toolsPanel = normalizePanel(m.panel)
        this.activeScenario = m.scenarioId ?? null
        this.scenarioStep = typeof m.scenarioStep === 'number' ? m.scenarioStep : 0
        this.coverageKw = typeof m.coverageKw === 'string' ? m.coverageKw : ''
        this.coverageLevel = m.coverageLevel === 'module' || m.coverageLevel === 'item' ? m.coverageLevel : 'all'
        this.coverageModule = typeof m.coverageModule === 'string' ? m.coverageModule : ''
        this.coverageOpen = Array.isArray(m.coverageOpen) ? m.coverageOpen.filter(x => typeof x === 'string') : []
        this.scenarioOpen = m.scenarioOpen === true
        this.toolsScroll = m.scroll ?? {}
      } catch { /* 结构不兼容时忽略，使用默认值 */ }
    },
    /** 落盘当前状态（搜索 / 展开 / 剧本步进 / 关闭抽屉时调用） */
    persistToolsMemory() {
      const m: ToolsMemory = {
        panel: this.toolsPanel,
        scenarioId: this.activeScenario,
        scenarioStep: this.scenarioStep,
        coverageKw: this.coverageKw,
        coverageLevel: this.coverageLevel,
        coverageModule: this.coverageModule,
        coverageOpen: [...this.coverageOpen],
        scenarioOpen: this.scenarioOpen,
        scroll: { ...this.toolsScroll }
      }
      safeStore.set('drm-tools-memory-v1', JSON.stringify(m))
    },
    /** 清空上次位置（抽屉内「清除核对位置」按钮，不影响已勾选的验收结果） */
    clearToolsMemory() {
      this.activeScenario = null
      this.scenarioStep = 0
      this.coverageKw = ''
      this.coverageLevel = 'all'
      this.coverageModule = ''
      this.coverageOpen = []
      this.scenarioOpen = false
      this.toolsScroll = {}
      safeStore.del('drm-tools-memory-v1')
    },

    /* ------------------------------------------------- 浮层开关 -- */
    openTools(_panel: ToolsPanel = 'coverage') {
      this.toolsPanel = 'coverage'
      this.toolsDrawer = true
    },
    /** 关闭抽屉：只收起浮层，**保留**剧本进度、展开行与搜索词，便于下次继续 */
    closeTools() {
      this.toolsDrawer = false
      this.persistToolsMemory()
    },

    /* ------------------------------------------- 覆盖表：展开行 -- */
    isCoverageOpen(id: string): boolean {
      return this.coverageOpen.includes(id)
    },
    /** el-table 展开事件回调：一次只告诉当前行，这里做集合增删 */
    setCoverageOpen(id: string, open: boolean) {
      if (open && !this.coverageOpen.includes(id)) this.coverageOpen = [...this.coverageOpen, id]
      if (!open) this.coverageOpen = this.coverageOpen.filter(x => x !== id)
      this.persistToolsMemory()
    },
    toggleCoverageAll(ids: string[], open: boolean) {
      this.coverageOpen = open ? [...ids] : []
      this.persistToolsMemory()
    },

    /* --------------------------------------------------- 剧本 -- */
    playScenario(id: string, resume = false) {
      this.activeScenario = id
      if (!resume) this.scenarioStep = 0
      this.persistToolsMemory()
    },
    setScenarioStep(i: number) {
      this.scenarioStep = i
      this.persistToolsMemory()
    },
    /** 退出剧本（返回剧本列表） */
    exitScenario() {
      this.activeScenario = null
      this.scenarioStep = 0
      this.persistToolsMemory()
    },

    /* --------------------------------------------------- 滚动位置 -- */
    /**
     * 记录滚动位置。
     * 由抽屉在滚动停止后调用（滚动过程中不调用），避免每帧写入 Pinia 触发重渲染。
     */
    setPanelScroll(panel: ToolsPanel, top: number) {
      this.toolsScroll[panel] = top
    }
  }
})
