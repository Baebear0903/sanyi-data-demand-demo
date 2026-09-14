/**
 * storage.ts —— 本地存储适配层
 *
 * 隐私模式 / 受限环境（localStorage 抛错或不可用）下降级为内存存储，
 * 保证演示系统在任何环境下都不会因为"存不进去"而整体崩溃。
 *
 * 使用方：
 *   · stores/demo.ts  业务数据（drm-demo-state-v1 / 偏好 / 验收勾选）
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
