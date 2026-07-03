import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  clearScreen: false,
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // jszip 仅有 CJS/UMD 构建，Rollup 默认会把它并入主 chunk。
        // 强制拆为独立 chunk，使其仅在解析 PPTX 时随动态 import 按需加载，不拖大主 bundle。
        manualChunks(id: string) {
          if (id.includes('node_modules/jszip/')) return 'jszip';
        },
      },
    },
  },
})
