#!/usr/bin/env node
/*
 * 로컬 폴더의 카드 이미지를 DB(asset_image)에 넣는다.
 *
 * 왜 필요한가
 *   전법 160개 중 상당수가 카드 사진이 없어 화면에서 깨져 보인다. 원본은 로컬 폴더에
 *   있는데 DB 에 들어가 있지 않아서다. 백엔드의 /api/assets/import 가 같은 일을 하지만
 *   그건 Render 에 폴더가 올라가 있어야 쓸 수 있다. 원본은 이 PC 에만 있으므로
 *   여기서 직접 넣는다.
 *
 * 하는 일
 *   1. 폴더를 훑어 파일 이름(확장자 제외)을 카드 이름으로 본다. 하위 폴더도 함께 본다.
 *   2. 그 이름의 장수·전법이 DB 에 «있을 때만» 넣는다. 없는 이름은 넣지 않고 알린다.
 *      이름이 틀린 파일을 그냥 넣으면 아무 카드에도 안 붙는 행만 쌓인다.
 *   3. 이미 같은 사진이 들어 있으면(sha256 이 같으면) 건너뛴다.
 *
 * 실행
 *   node tools/import-card-images.js TACTIC "C:/.../천하결전/전법"
 *   node tools/import-card-images.js GENERAL "C:/.../천하결전/장수"
 *
 *   --replace 를 붙이면 이미 있는 카드의 사진도 새 파일로 바꾼다.
 *   기본값은 «없는 것만 채우기» 다. 손댈 이유가 없는 것을 건드리지 않기 위해서다.
 *
 * 넣은 뒤에는 반드시
 *   node tools/export-card-images.js
 *   화면은 DB 가 아니라 그 도구가 뽑아 둔 정적 파일을 읽는다.
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = path.resolve(__dirname, '..')

const CONTENT_TYPE = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

function readEnv() {
  const file = path.join(ROOT, '.env')
  if (!fs.existsSync(file)) {
    console.error('❌ .env 가 없습니다.')
    process.exit(1)
  }
  return Object.fromEntries(
    fs
      .readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
  )
}

/** 하위 폴더까지 훑는다. 시즌별로 폴더를 나눠 둔 경우가 있다. */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (CONTENT_TYPE[path.extname(entry.name).toLowerCase()]) out.push(full)
  }
  return out
}

/** 시트와 파일명은 띄어쓰기가 들쭉날쭉하다. 공백을 지우고 견준다. */
const normalize = (s) => s.replace(/\s+/g, '')

async function main() {
  const [, , category, dir, ...flags] = process.argv
  const replace = flags.includes('--replace')

  if (!category || !dir || !['GENERAL', 'TACTIC'].includes(category)) {
    console.error('사용법: node tools/import-card-images.js <GENERAL|TACTIC> <폴더> [--replace]')
    process.exit(1)
  }
  if (!fs.existsSync(dir)) {
    console.error(`❌ 폴더가 없습니다: ${dir}`)
    process.exit(1)
  }

  let Client
  try {
    ;({ Client } = require('pg'))
  } catch {
    console.error('❌ pg 모듈이 필요합니다:  npm install --no-save pg')
    process.exit(1)
  }

  const env = readEnv()
  const m = (env.SUPABASE_DB_URL || '').match(/^jdbc:postgresql:\/\/([^:/]+):(\d+)\/([^?]+)/)
  if (!m) {
    console.error('❌ SUPABASE_DB_URL 형식을 읽을 수 없습니다.')
    process.exit(1)
  }

  const client = new Client({
    host: m[1],
    port: +m[2],
    database: m[3],
    user: env.SUPABASE_DB_USER,
    password: env.SUPABASE_DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()

  // 카드 이름 목록. 파일 이름이 여기 없으면 넣지 않는다.
  const table = category === 'GENERAL' ? 'general' : 'tactic'
  const { rows: cards } = await client.query(`select name from ${table}`)
  const cardByNorm = new Map(cards.map((r) => [normalize(r.name), r.name]))

  const { rows: existing } = await client.query(
    'select name, sha256 from asset_image where category = $1',
    [category],
  )
  const shaByName = new Map(existing.map((r) => [r.name, r.sha256]))

  const files = walk(dir)
  const inserted = []
  const updated = []
  const unchanged = []
  const unknown = []

  for (const file of files) {
    const base = path.basename(file, path.extname(file))
    const cardName = cardByNorm.get(normalize(base))
    if (!cardName) {
      unknown.push(base)
      continue
    }

    const data = fs.readFileSync(file)
    const sha256 = crypto.createHash('sha256').update(data).digest('hex')
    const had = shaByName.get(cardName)

    if (had === sha256) {
      unchanged.push(cardName)
      continue
    }
    if (had !== undefined && !replace) {
      unchanged.push(cardName)
      continue
    }

    await client.query(
      `insert into asset_image (category, name, file_name, content_type, byte_size, sha256, data)
            values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (category, name) do update
               set file_name = excluded.file_name,
                   content_type = excluded.content_type,
                   byte_size = excluded.byte_size,
                   sha256 = excluded.sha256,
                   data = excluded.data`,
      [
        category,
        cardName,
        path.basename(file),
        CONTENT_TYPE[path.extname(file).toLowerCase()],
        data.length,
        sha256,
        data,
      ],
    )
    ;(had === undefined ? inserted : updated).push(cardName)
  }

  const { rows: after } = await client.query(
    `select count(*) filter (where a.name is not null) as with_image, count(*) as total
       from ${table} c left join asset_image a on a.category = $1 and a.name = c.name`,
    [category],
  )
  await client.end()

  console.log(`파일 ${files.length}개를 살펴봤습니다.`)
  console.log(`  새로 넣음   ${inserted.length}${inserted.length ? ': ' + inserted.join(', ') : ''}`)
  console.log(`  바꿈        ${updated.length}${updated.length ? ': ' + updated.join(', ') : ''}`)
  console.log(`  그대로 둠   ${unchanged.length}`)
  if (unknown.length) {
    console.log(`  ⚠️ DB 에 그 이름의 ${category === 'GENERAL' ? '장수' : '전법'}가 없어 건너뜀 ${unknown.length}: ${unknown.join(', ')}`)
  }
  console.log(`이제 ${after[0].total} 중 ${after[0].with_image}개가 사진을 가집니다.`)
  console.log('다음: node tools/export-card-images.js')
}

main().catch((e) => {
  console.error('실패:', e.message)
  process.exitCode = 1
})
