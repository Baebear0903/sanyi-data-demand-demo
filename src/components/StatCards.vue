<script setup lang="ts">
/**
 * StatCards —— 指标卡行
 *
 * 图标使用 Element Plus 单色线性图标：`icon` 传**组件名字符串**，例如 'Tickets'。
 * （图标已在 main.ts 全量注册，模板里用 <component :is> 直接渲染，无需 import。）
 * 彩色底保留：tone 决定图标底色与图标色，用于区分指标类别。
 */
export interface StatItem {
  label: string
  value: string | number
  unit?: string
  /** Element Plus 图标组件名，如 'Tickets' / 'Warning' / 'CircleCheck' */
  icon?: string
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'teal' | 'neutral'
  /** 副标题 / 环比说明 */
  delta?: string
  /** 标签后的说明气泡 */
  tip?: string
}

withDefaults(defineProps<{ items: StatItem[] }>(), {})

/** 色系 → CSS 变量（与 tokens.css 逐一对应） */
const TONE: Record<string, { bg: string; fg: string }> = {
  primary: { bg: 'var(--brand-50)', fg: 'var(--brand-600)' },
  success: { bg: 'var(--success-bg)', fg: 'var(--success-fg)' },
  warning: { bg: 'var(--warning-bg)', fg: 'var(--warning-fg)' },
  danger: { bg: 'var(--danger-bg)', fg: 'var(--danger-fg)' },
  info: { bg: 'var(--info-bg)', fg: 'var(--info-fg)' },
  purple: { bg: 'var(--purple-bg)', fg: 'var(--purple-fg)' },
  teal: { bg: 'var(--teal-bg)', fg: 'var(--teal-fg)' },
  neutral: { bg: 'var(--neutral-bg)', fg: 'var(--neutral-fg)' }
}
const toneOf = (t?: string) => TONE[t ?? 'primary'] ?? TONE.primary
</script>

<template>
  <div class="stat-row">
    <div v-for="it in items" :key="it.label" class="stat-card">
      <div
        v-if="it.icon"
        class="stat-card__icon"
        :style="{ background: toneOf(it.tone).bg, color: toneOf(it.tone).fg }"
      >
        <el-icon :size="20"><component :is="it.icon" /></el-icon>
      </div>
      <div class="stat-card__main">
        <div class="stat-card__label">
          {{ it.label }}
          <el-tooltip v-if="it.tip" :content="it.tip" placement="top">
            <el-icon class="stat-card__tip"><InfoFilled /></el-icon>
          </el-tooltip>
        </div>
        <div class="stat-card__value">
          {{ it.value }}<span v-if="it.unit" class="stat-card__unit">{{ it.unit }}</span>
        </div>
        <div v-if="it.delta" class="stat-card__delta">{{ it.delta }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 图标区域：由内联样式给底色与图标色，此处只控制布局 */
.stat-card__icon {
  width: 44px; height: 44px; flex: none; border-radius: var(--r-md);
  display: grid; place-items: center;
}
.stat-card__tip { color: var(--text-4); font-size: 12px; cursor: help; }
</style>
