import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 보스 타이머 화면만 따로 빌드하는 설정. Supabase Edge Function 은 코드 전체를
// 텍스트로 담아야 해서(용량 제한), react/react-dom 을 번들에 넣지 않고 esm.sh CDN 에서
// 불러오게(import map, boss-timer.html 참고) 해서 산출물을 최대한 작게 만든다.
// 메인 앱(index.html, Netlify 배포)의 vite.config.ts 는 건드리지 않는다.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist-boss-timer',
    rollupOptions: {
      input: {
        bossTimer: resolve(import.meta.dirname, 'boss-timer.html'),
      },
      external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', '@supabase/supabase-js'],
    },
  },
})
