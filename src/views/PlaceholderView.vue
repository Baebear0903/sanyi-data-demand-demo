<script setup lang="ts">
/**
 * PlaceholderView —— 未实现页面的占位
 * 正常情况下不应出现（所有页面均已实现）；仅当路由指向尚未注册的组件时兜底。
 */
import { useRoute } from 'vue-router'
import { computed } from 'vue'
import PageHead from '@/components/PageHead.vue'

const route = useRoute()
const title = computed(() => (route.meta.title as string) ?? '页面')
</script>

<template>
  <div>
    <PageHead :title="title" desc="该页面尚未实现。" />
    <div class="card">
      <div class="card__body">
        <div class="empty-box">
          <div class="empty-box__icon">
            <el-icon :size="34"><DocumentRemove /></el-icon>
          </div>
          <div class="empty-box__text">页面 {{ title }} 尚未实现</div>
        </div>
      </div>
    </div>
  </div>
</template>
