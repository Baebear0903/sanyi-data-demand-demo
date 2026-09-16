/**
 * storage.ts —— 本地存储适配层
 *
 * 隐私模式 / 受限环境（localStorage 抛错或不可用）下降级为内存存储，
 * 保证演示系统在任何环境下都不会因为"存不进去"而整体崩溃。
 *
 * 使用方：
 *   · stores/demo.ts  业务数据（drm-demo-state-v1 / 偏好 / 验收勾选）与会话身份（drm-demo-role-v1）
 *   · stores/ui.ts    核对抽屉的上次位置（drm-tools-memory-v1）
 */

const mem: Record<string, string> = {}

export const safeStore = {
  /** 探测 localStorage 是否真的可写（Safari 隐私模式下会抛错） */
  ok: (() => {
    try {
      localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true
    } catch { return false }
  })(),
  get(k: string): string | null {
    try { return this.ok ? localStorage.getItem(k) : (mem[k] ?? null) } catch { return mem[k] ?? null }
  },
  set(k: string, v: string) {
    try { this.ok ? localStorage.setItem(k, v) : (mem[k] = v) } catch { mem[k] = v }
  },
  del(k: string) {
    try { this.ok ? localStorage.removeItem(k) : delete mem[k] } catch { delete mem[k] }
  }
}

/**
 * 会话级存储（sessionStorage）适配层
 *
 * 用于"本次打开"才有效、关掉标签页即失效的状态：新开会话回到出厂默认，
 * 同一标签页内刷新保持。受限环境同样降级为内存（前缀 s: 避免与 safeStore 冲突）。
 */
export const safeSession = {
  get(k: string): string | null {
    try { return sessionStorage.getItem(k) } catch { return mem['s:' + k] ?? null }
  },
  set(k: string, v: string) {
    try { sessionStorage.setItem(k, v) } catch { mem['s:' + k] = v }
  },
  del(k: string) {
    try { sessionStorage.removeItem(k) } catch { delete mem['s:' + k] }
  }
}
