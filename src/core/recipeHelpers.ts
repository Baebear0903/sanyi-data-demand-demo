/**
 * recipeHelpers.ts —— 覆盖说明表的展示辅助（不参与 check-recipes.mjs 的纯数据校验）
 *
 * 之所以与 recipes.ts 分开：recipes.ts 保持为纯数据（校验脚本会以文本方式装载它做静态校验），
 * 这里放需要 config / roles 运行时能力的轻量查询函数。
 */
import { config } from './config'
import { roles } from './roles'
import type { RecipeRow } from './recipes'

/** 页面名（可带「（知识推荐）」这类后缀）对应的侧栏导航路径；不在菜单里时返回空串 */
export function navOf(page: string): string {
  const base = page.replace(/（[^）]*）/g, '').trim()
  for (const p of config.products) {
    const hit = p.menu.find(m => m.title === base)
    if (hit) return `${p.title} → ${hit.title}`
  }
  return ''
}

/** 角色显示名 */
export function roleNameOf(id: string, fallback?: string): string {
  return roles.find(r => r.id === id)?.name ?? fallback ?? id
}

/** 子行最终展示的导航文案：菜单路径优先，详情页用两级路径 */
export function navTextOf(row: RecipeRow): string {
  return navOf(row.page) || row.detail || row.page
}
