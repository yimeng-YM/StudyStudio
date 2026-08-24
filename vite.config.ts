import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const localBackend = env.STUDYSTUDIO_LOCAL_BACKEND_URL || 'http://127.0.0.1:17890'
  const requestedDevPort = Number.parseInt(env.STUDYSTUDIO_DEV_PORT || '5173', 10)
  const devPort = Number.isInteger(requestedDevPort) && requestedDevPort > 0 && requestedDevPort <= 65535
    ? requestedDevPort
    : 5173

  return {
    clearScreen: false,
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      // Bind IPv4 explicitly so `localhost` cannot resolve to an unusable IPv6
      // listener.
      host: '127.0.0.1',
      port: devPort,
      strictPort: true,
      proxy: {
        '/api': {
          target: localBackend,
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          // jszip 浠呮湁 CJS/UMD 鏋勫缓锛孯ollup 榛樿浼氭妸瀹冨苟鍏ヤ富 chunk銆?
          // 寮哄埗鎷嗕负鐙珛 chunk锛屼娇鍏朵粎鍦ㄨВ鏋?PPTX 鏃堕殢鍔ㄦ€?import 鎸夐渶鍔犺浇锛屼笉鎷栧ぇ涓?bundle銆?
          manualChunks(id: string) {
            if (id.includes('node_modules/jszip/')) return 'jszip';
          },
        },
      },
    },
  }
})
