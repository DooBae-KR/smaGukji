#!/usr/bin/env node
// 보스알리미 화면(frontend/src/boss-timer)을 Supabase Edge Function `boss-timer-app`으로
// 배포할 수 있는 형태로 빌드한다. Netlify 빌드 시간(토큰)을 다 써서 이 화면만 Supabase에서
// 직접 서빙하기로 했다(2026-09-06).
//
// 사용법:
//   1) cd frontend && npx vite build --config vite.boss-timer.config.ts
//      (react/react-dom/@supabase/supabase-js는 esm.sh CDN에서 불러오도록 external 처리된 빌드.
//       boss-timer.html의 <script type="importmap"> 참고)
//   2) public/{sw.js,favicon.svg,boss-timer-manifest.json}을 dist-boss-timer/로 복사
//      (vite build가 이미 public/ 전체를 복사하므로 보통 이미 되어 있음)
//   3) node tools/build-boss-timer-app.js
//      → supabase/functions/boss-timer-app/index.ts 를 새로 생성한다.
//   4) Supabase MCP(mcp__Supabase__deploy_edge_function)로 그 파일을 배포한다.
//
// dist-boss-timer/의 실제 해시 파일명(assets/bossTimer-*.js, *.css)은 빌드마다 바뀌므로
// 아래 목록을 빌드 결과에 맞게 고쳐야 한다.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(__dirname, '..', 'frontend', 'dist-boss-timer')
const outFile = path.join(__dirname, '..', 'supabase', 'functions', 'boss-timer-app', 'index.ts')

const FILES = JSON.parse(readFileSync(path.join(__dirname, 'boss-timer-app-files.json'), 'utf8'))

const entries = FILES.map(({ file, contentType }) => {
  const abs = path.join(distDir, file)
  if (!existsSync(abs)) {
    throw new Error(`빌드 결과에 없음: ${file} — dist-boss-timer/를 다시 빌드했는지, 파일명(해시)이 바뀌었는지 확인`)
  }
  const gz = gzipSync(readFileSync(abs), { level: 9 })
  return { file, contentType, base64: gz.toString('base64') }
})

const header = `import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// 보스 타이머 정적 파일 서버. Netlify 빌드 시간을 다 써서 이 화면만 Supabase 로 옮겼다.
// react/react-dom/@supabase/supabase-js 는 boss-timer.html 의 importmap 으로 esm.sh 에서 불러오고,
// 여기엔 우리 앱 코드(gzip+base64)만 담아서 작게 유지한다.
// 이 파일은 손으로 고치지 말고 tools/build-boss-timer-app.js 로 다시 생성한다.
const FILES: Record<string, { contentType: string; gzipBase64: string }> = {
`

const body = entries
  .map((e) => `  ${JSON.stringify(e.file)}: { contentType: ${JSON.stringify(e.contentType)}, gzipBase64: ${JSON.stringify(e.base64)} },`)
  .join('\n')

const footer = `
}

function decodeBase64(base64: string): Uint8Array {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)
  // pathname 이 "/functions/v1/boss-timer-app/..." 로 올 때도, "/boss-timer-app/..." 로
  // (v1 부분만 벗겨져서) 올 때도, "/..." 로 (둘 다 벗겨져서) 올 때도 있어서 셋 다 처리한다.
  let path = url.pathname
    .replace(/^\\//, '')
    .replace(/^functions\\/v1\\//, '')
    .replace(/^boss-timer-app\\/?/, '')
  if (path === '' || path === 'index.html') path = 'boss-timer.html'

  const file = FILES[path]
  if (!file) {
    return new Response('Not found', { status: 404 })
  }

  // 스트림으로 응답하면 헤더가 제대로 안 붙는 문제가 있어서(2026-09-07), 압축을 완전히
  // 풀어 바이트 배열로 만든 뒤 그 바이트를 그대로 body 로 준다. gzip+base64 로 담아두는
  // 이유는 순전히 소스 파일 용량을 줄이기 위해서고, 응답은 항상 평문 바이트다.
  const gz = decodeBase64(file.gzipBase64)
  const decompressedBuffer = await new Response(
    new Response(gz).body!.pipeThrough(new DecompressionStream('gzip')),
  ).arrayBuffer()
  const cacheControl = path === 'boss-timer.html' ? 'no-cache' : 'public, max-age=3600'

  return new Response(decompressedBuffer, {
    headers: {
      'Content-Type': file.contentType,
      'Content-Length': String(decompressedBuffer.byteLength),
      'Cache-Control': cacheControl,
    },
  })
})
`

writeFileSync(outFile, header + body + footer)
console.log(`썼음: ${outFile} (${entries.length}개 파일, 총 ${entries.reduce((s, e) => s + e.base64.length, 0)} base64 chars)`)
