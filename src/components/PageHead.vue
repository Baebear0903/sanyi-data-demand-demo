<script setup lang="ts">
/**
 * PageHead —— 页面标题区（参考截图的标题 + 右侧操作按钮版式）
 */
withDefaults(defineProps<{
  title: string
  desc?: string
  /** 右上角操作按钮插槽，也可用 slot="actions" */
}>(), {})
</script>

<template>
  <div class="page-head">
    <div class="page-head__main">
      <div class="page-head__title">
        {{ title }}
        <slot name="tag" />
      </div>
      <div v-if="desc" class="page-head__desc">{{ desc }}</div>
    </div>
    <div v-if="$slots.actions" class="page-head__actions">
      <slot name="actions" />
    </div>
  </div>
</template>
