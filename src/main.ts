import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import * as ElIcons from '@element-plus/icons-vue'

import 'element-plus/dist/index.css'
import '@/styles/tokens.css'
import '@/styles/base.css'

import AppShell from '@/components/AppShell.vue'
import router from '@/router'
import { useDemoStore } from '@/stores/demo'
import { useUiStore } from '@/stores/ui'

const app = createApp(AppShell)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(ElementPlus, { locale: zhCn })

/* 注册全部 Element Plus 图标，供页面直接使用 */
for (const [name, comp] of Object.entries(ElIcons)) {
  app.component(name, comp as never)
}

/* 演示数据必须在路由挂载前就绪，否则首屏页面读不到数据 */
const store = useDemoStore(pinia)
store.init()

/* 恢复核对抽屉的上次位置（面板 / 剧本进度 / 搜索词 / 滚动位置 / 上次核对的页面） */
const ui = useUiStore(pinia)
ui.restoreToolsMemory()

app.mount('#app')
