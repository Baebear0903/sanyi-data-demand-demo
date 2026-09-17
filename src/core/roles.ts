/**
 * roles.ts —— 角色与权限矩阵的类型定义与再导出
 *
 * 数据本体已内联到 config.ts（因为 config 自身需要用到角色列表来做待办规则推导），
 * 本文件保留类型定义，并再导出，保证 `import { roles } from '@/core/roles'` 仍然可用。
 */
import { config } from './config'

export interface Role {
  id: string
  name: string
  short: string
  icon: string
  repUserId: string
  org: string
  desc: string
  dataScope: string
  color: string
  all?: boolean
  perms: string[]
}

export interface RoleMatrixRow {
  name: string
  org: string
  duty: string
}

export const roles: Role[] = config.roles
export const roleMatrix: RoleMatrixRow[] = config.roleMatrix
