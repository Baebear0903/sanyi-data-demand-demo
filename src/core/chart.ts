/**
 * chart.ts —— 自绘 SVG 图表内核（由 vanilla 版 chart.js 迁移）
 *
 * 为什么自绘而不引 ECharts：演示系统需零外部 CDN 依赖、离线可跑，
 * 且本项目的图表需求（折线 / 柱状 / 横向条形 / 环形 / 仪表 / 漏斗 / 热力）
 * 用轻量 SVG 即可满足，同时避免为演示引入 1MB+ 的图表库。
 * 若后续需要更复杂图表（地图 / 桑基等），可替换本文件而不影响页面。
 */
import { thousands, truncate } from '@/core/utils'

export type ChartTone = { name: string; value: number; color?: string; extra?: string }
export type Series = { name: string; data: number[]; categories?: string[] }

const PALETTE = [
  'var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)',
  'var(--chart-5)', 'var(--chart-6)', 'var(--chart-7)', 'var(--chart-8)'
]
export const chartColor = (i: number) => PALETTE[i % PALETTE.length]

/** 刻度格式化：最大值较小时仅显示整数，避免出现 0.5 这类无意义刻度 */
function tickLabel(v: number, maxV: number): string {
  return maxV <= 8 ? String(Math.round(v)) : thousands(v)
}

function niceMax(v: number): number {
  if (!v || v <= 0) return 10
  const mag = Math.pow(10, Math.floor(Math.log10(v)))
  const n = v / mag
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10
  return step * mag
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface LineOpts {
  height?: number
  area?: boolean
  smooth?: boolean
  showLegend?: boolean
  maxLabels?: number
  seriesName?: string
}
/** 折线图：支持单序列 [{name,value}] 与多序列 { categories, series } */
export function lineSvg(input: ChartTone[] | { categories: string[]; series: Series[] }, opts: LineOpts = {}): string {
  let cats: string[], series: Series[]
  if (Array.isArray(input)) {
    cats = input.map(d => d.name)
    series = [{ name: opts.seriesName ?? '数量', data: input.map(d => Number(d.value) || 0) }]
  } else {
    cats = input.categories
    series = input.series
  }
  const H = opts.height ?? 240
  const showLegend = opts.showLegend !== false && series.length > 1
  const padL = 52, padR = 20, padT = showLegend ? 30 : 14, padB = 30
  const W = 720
  const iw = W - padL - padR, ih = H - padT - padB
  const all = series.reduce<number[]>((a, s) => a.concat(s.data), [])
  const maxV = niceMax(Math.max(1, ...all))
  const n = Math.max(1, cats.length)
  const stepX = n > 1 ? iw / (n - 1) : iw
  const xAt = (i: number) => padL + (n > 1 ? i * stepX : iw / 2)
  const yAt = (v: number) => padT + ih - (v / maxV) * ih

  let g = ''
  for (let t = 0; t <= 4; t++) {
    const v = (maxV * t) / 4, y = yAt(v)
    g += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="var(--border-2)" />`
    g += `<text x="${padL - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--text-3)">${tickLabel(v, maxV)}</text>`
  }
  const labelStep = Math.ceil(n / (opts.maxLabels ?? 10))
  cats.forEach((c, i) => {
    if (i % labelStep) return
    g += `<text x="${xAt(i).toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="11" fill="var(--text-3)">${esc(truncate(c, 10))}</text>`
  })
  series.forEach((s, si) => {
    const pts = s.data.map((v, i) => [xAt(i), yAt(Number(v) || 0)] as const)
    let d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
    if (opts.smooth !== false && pts.length > 2) {
      d = pts.map((p, i) => {
        if (!i) return `M${p[0].toFixed(1)} ${p[1].toFixed(1)}`
        const prev = pts[i - 1], cx = (prev[0] + p[0]) / 2
        return `C${cx.toFixed(1)} ${prev[1].toFixed(1)},${cx.toFixed(1)} ${p[1].toFixed(1)},${p[0].toFixed(1)} ${p[1].toFixed(1)}`
      }).join(' ')
    }
    if (opts.area !== false) {
      const last = pts[pts.length - 1], first = pts[0]
      g += `<path d="${d} L${last[0].toFixed(1)} ${(padT + ih).toFixed(1)} L${first[0].toFixed(1)} ${(padT + ih).toFixed(1)} Z" fill="${chartColor(si)}" opacity=".10" />`
    }
    g += `<path d="${d}" fill="none" stroke="${chartColor(si)}" stroke-width="2" stroke-linejoin="round" />`
    s.data.forEach((v, i) => {
      const cx = xAt(i).toFixed(1), cy = yAt(Number(v) || 0).toFixed(1)
      const tip = `${esc(cats[i])} · ${esc(s.name)}：${thousands(v)}`
      g += `<circle cx="${cx}" cy="${cy}" r="9" fill="transparent"><title>${tip}</title></circle>`
      g += `<circle cx="${cx}" cy="${cy}" r="3" fill="var(--surface)" stroke="${chartColor(si)}" stroke-width="2" />`
    })
  })
  let legend = ''
  if (showLegend) {
    let lx = padL
    series.forEach((s, si) => {
      const w = 26 + String(s.name).length * 12
      legend += `<circle cx="${lx + 4}" cy="13" r="4" fill="${chartColor(si)}" />`
      legend += `<text x="${lx + 13}" y="17" font-size="11.5" fill="var(--text-2)">${esc(s.name)}</text>`
      lx += w
    })
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="xMidYMid meet" style="display:block">${g}${legend}</svg>`
}

export interface BarOpts { height?: number; showValue?: boolean; rotate?: boolean; valueLabel?: string; labelLen?: number }
/** 柱状图 */
export function barSvg(rows: ChartTone[], opts: BarOpts = {}): string {
  const H = opts.height ?? 240
  const padL = 52, padR = 20, padT = 20, padB = opts.rotate ? 62 : 32
  const W = 720
  const iw = W - padL - padR, ih = H - padT - padB
  const maxV = niceMax(Math.max(1, ...rows.map(r => Number(r.value) || 0)))
  const n = Math.max(1, rows.length)
  const slot = iw / n
  const bw = Math.min(34, slot * 0.6)
  let g = ''
  for (let t = 0; t <= 4; t++) {
    const v = (maxV * t) / 4, y = padT + ih - (v / maxV) * ih
    g += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="var(--border-2)" />`
    g += `<text x="${padL - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="11" fill="var(--text-3)">${thousands(v)}</text>`
  }
  rows.forEach((r, i) => {
    const v = Number(r.value) || 0
    const bh = (v / maxV) * ih
    const x = padL + slot * i + (slot - bw) / 2
    const y = padT + ih - bh
    const tip = `${esc(r.name)}：${thousands(v)}`
    g += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, bh).toFixed(1)}" rx="3" fill="${r.color ?? chartColor(i)}"><title>${tip}</title></rect>`
    if (opts.showValue !== false && n <= 16) {
      g += `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" font-size="11" fill="var(--text-2)">${thousands(v)}</text>`
    }
    if (opts.rotate) {
      const tx = (x + bw / 2).toFixed(1), ty = (padT + ih + 10).toFixed(1)
      g += `<text x="${tx}" y="${ty}" font-size="11" fill="var(--text-3)" text-anchor="start" transform="rotate(38 ${tx} ${ty})">${esc(truncate(r.name, 12))}</text>`
    } else {
      g += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="11" fill="var(--text-3)">${esc(truncate(r.name, opts.labelLen ?? 8))}</text>`
    }
  })
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="xMidYMid meet" style="display:block">${g}</svg>`
}

/** 环形图（返回 HTML 片段：SVG + 图例） */
export function donutHtml(rows: ChartTone[], opts: { height?: number; centerLabel?: string; legend?: boolean } = {}): string {
  const data = rows.filter(r => Number(r.value) > 0)
  const total = data.reduce((s, r) => s + Number(r.value), 0) || 1
  const H = opts.height ?? 220
  const R = 74, r0 = 48, cx = 110, cy = H / 2
  let ang = -Math.PI / 2
  let g = ''
  data.forEach((d, i) => {
    const a = (Number(d.value) / total) * Math.PI * 2
    const x1 = cx + R * Math.cos(ang), y1 = cy + R * Math.sin(ang)
    const x2 = cx + R * Math.cos(ang + a), y2 = cy + R * Math.sin(ang + a)
    const xi2 = cx + r0 * Math.cos(ang + a), yi2 = cy + r0 * Math.sin(ang + a)
    const xi1 = cx + r0 * Math.cos(ang), yi1 = cy + r0 * Math.sin(ang)
    const large = a > Math.PI ? 1 : 0
    const tip = `${esc(d.name)}：${thousands(d.value)}（${((Number(d.value) / total) * 100).toFixed(1)}%）`
    g += `<path d="M${x1.toFixed(2)} ${y1.toFixed(2)} A${R} ${R} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L${xi2.toFixed(2)} ${yi2.toFixed(2)} A${r0} ${r0} 0 ${large} 0 ${xi1.toFixed(2)} ${yi1.toFixed(2)} Z" fill="${d.color ?? chartColor(i)}" stroke="var(--surface)" stroke-width="2"><title>${tip}</title></path>`
    ang += a
  })
  const svg = `<svg viewBox="0 0 220 ${H}" width="220" height="${H}" style="display:block;margin:0 auto">${g}
    <text x="${cx}" y="${cy - 2}" text-anchor="middle" font-size="22" font-weight="700" font-family="var(--ff-num)" fill="var(--text)">${thousands(total)}</text>
    <text x="${cx}" y="${cy + 18}" text-anchor="middle" font-size="11.5" fill="var(--text-3)">${esc(opts.centerLabel ?? '合计')}</text></svg>`
  if (opts.legend === false) return svg
  const legend = `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px 10px;margin-top:8px">${data.map((d, i) =>
    `<span class="flex items-center gap-1 text-sm" style="color:var(--text-2)">
      <i style="width:8px;height:8px;border-radius:2px;background:${d.color ?? chartColor(i)};display:inline-block"></i>
      ${esc(d.name)} <b class="mono" style="color:var(--text)">${thousands(d.value)}</b></span>`).join('')}</div>`
  return svg + legend
}

/** 仪表盘 */
export function gaugeSvg(value: number, opts: { label?: string; color?: string } = {}): string {
  const p = Math.max(0, Math.min(100, Number(value) || 0))
  const W = 200, H = 120, cx = W / 2, cy = 100, R = 74
  const a0 = Math.PI, a1 = Math.PI * (1 - p / 100)
  const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0)
  const x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1)
  const large = p > 50 ? 1 : 0
  const col = opts.color ?? (p >= 90 ? 'var(--success)' : p >= 70 ? 'var(--brand-600)' : p >= 50 ? 'var(--warning)' : 'var(--danger)')
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">
    <path d="M${x0} ${y0} A${R} ${R} 0 0 1 ${cx + R} ${cy}" fill="none" stroke="var(--border)" stroke-width="12" stroke-linecap="round" />
    <path d="M${x0} ${y0} A${R} ${R} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}" fill="none" stroke="${col}" stroke-width="12" stroke-linecap="round" />
    <text x="${cx}" y="${cy - 14}" text-anchor="middle" font-size="26" font-weight="700" font-family="var(--ff-num)" fill="var(--text)">${p.toFixed(1)}<tspan font-size="13">%</tspan></text>
    <text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="11.5" fill="var(--text-3)">${esc(opts.label ?? '')}</text></svg>`
}

/** 漏斗（返回 HTML 片段） */
export function funnelHtml(rows: ChartTone[]): string {
  const max = Math.max(1, ...rows.map(r => Number(r.value) || 0))
  const first = Number(rows[0]?.value) || 1
  return rows.map((d, i) => {
    const p = (Number(d.value) / max) * 100
    const conv = i === 0 ? '' : `（${((Number(d.value) / first) * 100).toFixed(0)}%）`
    return `<div class="flex items-center gap-3" style="padding:4px 0">
      <div class="text-sm" style="width:92px;flex:none;text-align:right;color:var(--text-2)">${esc(d.name)}</div>
      <div style="flex:1;display:flex;justify-content:center">
        <div style="width:${Math.max(8, p).toFixed(1)}%;min-width:52px;height:28px;border-radius:var(--r-sm);background:${d.color ?? chartColor(i)};display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-family:var(--ff-num)">${thousands(d.value)}</div>
      </div>
      <div class="text-xs" style="width:58px;flex:none;color:var(--text-3)">${conv}</div>
    </div>`
  }).join('')
}

/** 横向条形（返回 HTML 片段） */
export function hbarHtml(rows: ChartTone[], opts: { labelWidth?: number; valueLabel?: string } = {}): string {
  const max = Math.max(1, ...rows.map(r => Number(r.value) || 0))
  return rows.map((d, i) => {
    const p = ((Number(d.value) || 0) / max) * 100
    return `<div class="flex items-center gap-3" style="padding:5px 0">
      <div class="text-sm" style="width:${opts.labelWidth ?? 132}px;flex:none;text-align:right;color:var(--text-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(d.name)}">${esc(d.name)}</div>
      <div style="flex:1;min-width:0;background:var(--surface-3);border-radius:var(--r-pill);height:14px;overflow:hidden">
        <div style="width:${p.toFixed(1)}%;height:100%;border-radius:var(--r-pill);background:${d.color ?? chartColor(i)}"></div>
      </div>
      <div class="mono text-sm" style="width:70px;flex:none">${thousands(d.value)}</div>
    </div>`
  }).join('')
}

/** 迷你趋势线 */
export function sparkSvg(values: number[], opts: { width?: number; height?: number; color?: string } = {}): string {
  const vs = values.length ? values : [0]
  const max = Math.max(1, ...vs)
  const W = opts.width ?? 96, H = opts.height ?? 24
  const pts = vs.map((v, i) => {
    const x = vs.length > 1 ? (i * W) / (vs.length - 1) : W / 2
    const y = H - (v / max) * (H - 6) - 3
    return `${x.toFixed(1)} ${y.toFixed(1)}`
  })
  const d = 'M' + pts.join(' L')
  const c = opts.color ?? 'var(--brand-600)'
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:block">
    <path d="${d} L${W} ${H} L0 ${H} Z" fill="${c}" opacity=".12" />
    <path d="${d}" fill="none" stroke="${c}" stroke-width="1.6" /></svg>`
}
