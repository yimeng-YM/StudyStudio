import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { reloadOnChunkError } from '@/lib/chunkLoadError'

// 全局兜底：动态导入 chunk 失效（重新部署后旧 chunk 哈希失效 / 浏览器缓存损坏）
// 时自动带缓存破坏参数刷新一次，避免用户卡在白屏或坏图上。
// 已被业务代码 try/catch 捕获的（如 Mermaid）由其自行调用 reloadOnChunkError。
window.addEventListener('error', (e) => {
  void reloadOnChunkError(e.error ?? e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  void reloadOnChunkError(e.reason);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
