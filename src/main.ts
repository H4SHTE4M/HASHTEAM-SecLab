import { createApp } from 'vue'
import App from './App.vue'
import './assets/fonts/noto-sans-sc/index.css'
import './styles/fonts.css'
import './styles/global.css'

const app = createApp(App)

app.config.errorHandler = (error, instance, info) => {
  console.error('[hashteam] Vue 运行时错误', { error, component: instance?.$options.name, info })
}

app.mount('#app')
