<script setup lang="ts">
/**
 * ArtifactPanel —— 自动化部署产物列表 + 内容预览
 *
 * 工作流管理的部署弹窗、部署记录「查看产物」、需求单详情的「本单部署产物」三处共用，
 * 保证"部署后生成的相关文件"在系统内只有一个渲染口径。
 */
import { computed, ref, watch } from 'vue'
import type { ArtifactFile } from '@/core/artifacts'

const props = withDefaults(defineProps<{
  files: ArtifactFile[]
  demandNo?: string
  /** 文件说明后缀，默认按"由工作流引擎依据工单 XX 自动生成"渲染 */
  metaPrefix?: string
}>(), { demandNo: '', metaPrefix: '' })

const current = ref('')

watch(() => props.files, () => { current.value = '' })

const currentFile = computed<ArtifactFile | null>(
  () => (props.files ?? []).find(f => f.name === current.value) ?? null
)

function metaOf(f: ArtifactFile): string {
  const prefix = props.metaPrefix || (props.demandNo ? `由工作流引擎依据工单 ${props.demandNo} 自动生成` : '由工作流引擎自动生成')
  return `${f.size} · ${prefix}`
}
</script>

<template>
  <div>
    <div class="file-list">
      <div v-for="f in files" :key="f.name" class="file-item" @click="current = current === f.name ? '' : f.name">
        <div class="file-item__icon" :class="`file-item__icon--${f.type}`">{{ f.type.toUpperCase() }}</div>
        <div class="file-item__main">
          <div class="file-item__name">{{ f.name }}</div>
          <div class="file-item__meta">{{ metaOf(f) }}</div>
        </div>
        <el-button link type="primary" size="small">{{ current === f.name ? '收起' : '预览' }}</el-button>
      </div>
      <div v-if="!files?.length" class="muted text-sm">暂无产物文件</div>
    </div>

    <div v-if="currentFile" class="mt-3">
      <div class="flex items-center gap-2 mb-2">
        <span class="card__title">{{ currentFile.name }}</span>
        <el-button link size="small" @click="current = ''">收起</el-button>
      </div>
      <div class="code-box">{{ currentFile.content }}</div>
    </div>
  </div>
</template>
