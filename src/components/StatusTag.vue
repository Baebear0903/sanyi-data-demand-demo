<script setup lang="ts">
/**
 * StatusTag —— 状态标签
 *
 * 两种用法：
 *  1) 查字典：<StatusTag dict="DemandStatus" :value="row.status" />  自动取文案与色系
 *  2) 直接指定：<StatusTag label="进行中" tone="purple" />           用于非字典场景
 */
import { computed } from 'vue'
import { dictItem } from '@/stores/demo'

const props = withDefaults(defineProps<{
  /** 字典名，如 DemandStatus / TaskStatus；与 label 二选一 */
  dict?: string
  /** 状态值 */
  value?: string
  /** 是否显示前置圆点 */
  dot?: boolean
  /** 直接指定文案（不查字典时使用） */
  label?: string
  /** 直接指定色系（配合 label 使用） */
  tone?: string
}>(), { dot: true })

const item = computed(() => {
  if (props.label) return { label: props.label, tag: props.tone ?? 'neutral' }
  if (props.dict) return dictItem(props.dict, props.value)
  return { label: props.value ?? '—', tag: props.tone ?? 'neutral' }
})
</script>

<template>
  <span class="st-tag" :class="`st-tag--${item.tag}`">
    <i v-if="dot" class="st-tag__dot" /><span class="st-tag__text">{{ item.label }}</span>
  </span>
</template>

<style scoped>
/* 状态文案不换行、不省略，避免在窄列中被截断 */
.st-tag__text { white-space: nowrap; }
</style>
