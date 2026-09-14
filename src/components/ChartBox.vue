<script setup lang="ts">
/**
 * ChartBox —— 图表容器
 * 通过 kind 选择图表类型，渲染 core/chart.ts 生成的 SVG/HTML。
 * 用 v-html 绑定自绘 SVG（内容由本项目代码生成，不含外部输入）。
 */
import { computed } from 'vue'
import * as C from '@/core/chart'
import type { ChartTone } from '@/core/chart'

const props = withDefaults(defineProps<{
  kind: 'line' | 'bar' | 'hbar' | 'donut' | 'gauge' | 'funnel' | 'spark'
  /** 常规数据（line/bar/hbar/donut/funnel） */
  data?: ChartTone[] | { categories: string[]; series: C.Series[] }
  /** gauge 用数值 */
  value?: number
  /** spark 用数值数组 */
  values?: number[]
  height?: number
  legend?: boolean
  showValue?: boolean
  rotate?: boolean
  smooth?: boolean
  seriesName?: string
  label?: string
  centerLabel?: string
  maxLabels?: number
}>(), { height: 240, smooth: true })

const html = computed(() => {
  switch (props.kind) {
    case 'line':
      return C.lineSvg((props.data ?? []) as never, { height: props.height, smooth: props.smooth, showLegend: props.legend !== false, seriesName: props.seriesName, maxLabels: props.maxLabels })
    case 'bar':
      return C.barSvg((props.data ?? []) as ChartTone[], { height: props.height, showValue: props.showValue !== false, rotate: props.rotate })
    case 'hbar':
      return C.hbarHtml((props.data ?? []) as ChartTone[])
    case 'donut':
      return C.donutHtml((props.data ?? []) as ChartTone[], { height: props.height, legend: props.legend !== false, centerLabel: props.centerLabel })
    case 'gauge':
      return C.gaugeSvg(props.value ?? 0, { label: props.label })
    case 'funnel':
      return C.funnelHtml((props.data ?? []) as ChartTone[])
    case 'spark':
      return C.sparkSvg(props.values ?? [])
    default:
      return ''
  }
})
</script>

<template>
  <div class="chart-box" v-html="html" />
</template>

<style scoped>
.chart-box :deep(svg) { max-width: 100%; }
</style>
