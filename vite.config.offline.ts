import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { fileURLToPath, URL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

/**
 * 离线单文件构建配置
 * ------------------------------------------------------------------
 * 为什么需要它：用户确认的交付方式是「常规多文件构建 + 本地服务器打开」，
 * 但项目目标要求「可离线打开」。Vite 默认产物是 ES Module，通过 file://
 * 打开会被浏览器 CORS 拦截（实测报错 Access to script ... blocked by CORS policy）。
 * 本配置用 vite-plugin-singlefile 把 JS/CSS 全部内联为一个 index.html，
 * 从而支持双击直接打开（已实测可在 file:// 下零报错运行）。
 *
 * 产物：demo/offline/数据需求管理-演示系统.html
 * 注意：这只影响本配置，常规 pnpm build 的产物结构不受影响。
 */
/**
 * 插件：把 favicon 链接替换为内联 data URI。
 * 原因：单文件产物会被复制到任意位置双击打开，外部 favicon.svg 相对引用会
 * 触发 net::ERR_FILE_NOT_FOUND（不影响功能，但控制台不干净，验收时会被当成缺陷）。
 */
function inlineFavicon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#2b62d9"/><text x="16" y="22" font-size="15" font-weight="700" fill="#fff" text-anchor="middle" font-family="PingFang SC,Microsoft YaHei,sans-serif">医</text></svg>`
  const dataUri = 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64')
  return {
    name: 'inline-favicon',
    transformIndexHtml(html: string) {
      return html.replace(/<link rel="icon"[^>]*>/, `<link rel="icon" type="image/svg+xml" href="${dataUri}" />`)
    }
  }
}

/**
 * 插件：把单文件产物重命名为文档约定的文件名。
 * 原因：Vite 的 HTML 入口固定输出 index.html，而 README 与交付说明都以
 * 「数据需求管理-演示系统.html」指代该产物；又因 emptyOutDir 会清空 offline/，
 * 靠人工改名的话，每次重新构建都会丢掉那个文件名。
 */
function renameOfflineOutput() {
  return {
    name: 'rename-offline-output',
    apply: 'build' as const,
    closeBundle() {
      const dir = fileURLToPath(new URL('./offline', import.meta.url))
      const from = path.join(dir, 'index.html')
      const to = path.join(dir, '数据需求管理-演示系统.html')
      if (fs.existsSync(from)) {
        fs.rmSync(to, { force: true })
        fs.renameSync(from, to)
        console.log('\n离线单文件产物：offline/数据需求管理-演示系统.html（双击即可打开）\n')
      }
    }
  }
}

export default defineConfig({
  base: './',
  plugins: [vue(), viteSingleFile(), inlineFavicon(), renameOfflineOutput()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  build: {
    outDir: 'offline',
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    modulePreload: { polyfill: false },
    chunkSizeWarningLimit: 6000,
    rollupOptions: { output: { inlineDynamicImports: true } }
  }
})
