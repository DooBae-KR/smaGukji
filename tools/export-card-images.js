#!/usr/bin/env node
/*
 * DB 에 들어 있는 장수·전법 카드 이미지를 프론트 정적 파일로 내보낸다.
 *
 * 왜 필요한가
 *   이미지는 지금까지 Render 의 /api/assets/... 가 DB 에서 꺼내 내려줬다.
 *   프론트를 Netlify 로 옮겨도 이미지가 Render 에 묶여 있으면, 무료 인스턴스가
 *   잠든 동안 카드 131장이 전부 깨져 보인다. 화면이 통째로 망가진 것처럼 보이는
 *   가장 눈에 띄는 증상이라 이것부터 떼어낸다.
 *
 * 파일 이름
 *   장수 이름이 한글이라 URL 인코딩 문제가 생기기 쉽다. 그래서 내용 해시로 저장하고
 *   «이름 → 파일» 대응표를 따로 만든다. 내용이 바뀌면 이름도 바뀌므로 캐시를
 *   영구 보관해도 안전하다.
 *
 * 실행
 *   node tools/export-card-images.js
 *   (DB 접속 정보는 .env 의 SUPABASE_DB_* 를 쓴다)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'frontend', 'public', 'cards');
const MANIFEST = path.join(ROOT, 'frontend', 'src', 'generated', 'card-images.json');

const EXT = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function readEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) {
    console.error('❌ .env 가 없습니다.');
    process.exit(1);
  }
  return Object.fromEntries(
    fs.readFileSync(file, 'utf8').split(/\r?\n/)
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
}

async function main() {
  let Client;
  try {
    ({ Client } = require('pg'));
  } catch {
    console.error('❌ pg 모듈이 필요합니다:  npm install --no-save pg');
    process.exit(1);
  }

  const env = readEnv();
  const m = (env.SUPABASE_DB_URL || '').match(/^jdbc:postgresql:\/\/([^:/]+):(\d+)\/([^?]+)/);
  if (!m) {
    console.error('❌ SUPABASE_DB_URL 형식을 읽을 수 없습니다.');
    process.exit(1);
  }

  const client = new Client({
    host: m[1], port: +m[2], database: m[3],
    user: env.SUPABASE_DB_USER, password: env.SUPABASE_DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const { rows } = await client.query(
    `select category, name, content_type, sha256, data
       from asset_image
      where data is not null
      order by category, name`);
  await client.end();

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });

  // 이번에 쓴 파일만 남기고 예전 것은 지운다. 카드 이름이 바뀌어도 찌꺼기가 안 남는다.
  const keep = new Set();
  const manifest = {};
  let written = 0;
  let unchanged = 0;
  const skipped = [];

  for (const r of rows) {
    const ext = EXT[r.content_type];
    if (!ext) {
      skipped.push(`${r.category}/${r.name} (알 수 없는 형식: ${r.content_type})`);
      continue;
    }
    const file = `${r.sha256.slice(0, 16)}.${ext}`;
    const dest = path.join(OUT_DIR, file);
    keep.add(file);
    manifest[`${r.category}/${r.name}`] = file;

    // 내용 해시가 파일 이름이므로, 있으면 내용이 같다는 뜻이다.
    if (fs.existsSync(dest)) { unchanged += 1; continue; }
    fs.writeFileSync(dest, r.data);
    written += 1;
  }

  let removed = 0;
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (!keep.has(f)) { fs.unlinkSync(path.join(OUT_DIR, f)); removed += 1; }
  }

  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + '\n', 'utf8');

  const total = Object.keys(manifest).length;
  console.log(`✅ 카드 이미지 ${total}장`);
  console.log(`   새로 씀 ${written} · 그대로 ${unchanged} · 지움 ${removed}`);
  console.log(`   이미지  ${path.relative(ROOT, OUT_DIR)}`);
  console.log(`   대응표  ${path.relative(ROOT, MANIFEST)}`);
  if (skipped.length) {
    console.log(`⚠️  건너뛴 ${skipped.length}건:`);
    skipped.forEach((s) => console.log(`     · ${s}`));
  }
}

main().catch((e) => { console.error('❌ ' + e.message); process.exit(1); });
