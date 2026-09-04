import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        // 로그인·메뉴 시스템과 무관한 공개 페이지. 링크만 있으면 누구나 들어온다.
        bossTimer: resolve(import.meta.dirname, 'boss-timer.html'),
      },
    },
  },
  server: {
    port: 5173,
    // /api 요청을 Spring Boot 로 넘겨서 개발 중에는 CORS 를 아예 타지 않게 한다.
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
