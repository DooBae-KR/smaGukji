#!/usr/bin/env node
/*
 * 구글 시트의 «시즌2 티어표» 탭을 프론트 정적 파일로 내보낸다.
 *
 * 왜 시트를 화면에서 직접 안 읽는가
 *   구글 시트의 CSV 내보내기 주소는 CORS 헤더를 주지 않는다. 브라우저에서 부르면
 *   막힌다. 그렇다고 Render 에 맡기면 무료 인스턴스가 잠든 동안 티어표가 비어
 *   보인다. 그래서 카드 이미지와 같은 방법을 쓴다 — 빌드 전에 여기서 뽑아 JSON 으로
 *   박아두고, 화면은 그 파일을 읽는다. 서버가 자든 말든 티어표는 늘 뜬다.
 *
 * 시트가 바뀌면
 *   node tools/export-tier-decks.js 를 다시 돌리고 결과를 커밋한다.
 *
 * 실행
 *   node tools/export-tier-decks.js
 */
const fs = require('fs')
const path = require('path')

const SHEET_ID = '1UOtQR7PvI5qJwLeFbq-RErRRKBwl-JjXhsK53JXLzAA'
const TIER_GID = '2052638695' // «시즌2 티어표» 탭
const OUT = path.join(__dirname, '..', 'frontend', 'src', 'generated', 'tier-decks.json')

/**
 * 한 덱이 차지하는 열 수.
 *
 * <p>표가 [라벨][장수1][장수2][장수3] 네 칸을 한 묶음으로 옆으로 반복한다.
 */
const BLOCK_WIDTH = 4
const GENERALS_PER_DECK = 3

/** 따옴표 안에 줄바꿈이 들어 있는 칸이 많아 직접 훑는다. */
function parseCsv(text) {
  const rows = []
  let row = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"'
          i++
        } else quoted = false
      } else cur += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cur)
      cur = ''
    } else if (c === '\n') {
      row.push(cur)
      rows.push(row)
      row = []
      cur = ''
    } else if (c !== '\r') cur += c
  }
  if (cur || row.length) {
    row.push(cur)
    rows.push(row)
  }
  return rows
}

const clean = (v) => (v ?? '').replace(/\s+/g, ' ').trim()

/**
 * 한 칸에 여러 개가 들어 있는 것을 쪼갠다.
 *
 * <p>구분자가 두 가지다. 줄바꿈(«허점 공략\n고요한 제압»)과 슬래시(«청풍 질주/ 청낭 치료»).
 * 둘 다 «이 중 하나를 골라라»는 뜻으로 쓰였다.
 */
function splitLines(v) {
  return (v ?? '')
    .split(/[\n/]/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s && s !== '\\')
}

/** 여러 개가 줄바꿈이나 쉼표로 붙어 있는 칸을 쪼갠다. «파죽지세,\n예리한 통찰» 같은 것 */
function splitList(v) {
  return (v ?? '')
    .split(/[\n,/]|>/)
    .map((s) => s.trim())
    .filter((s) => s && s !== '\\')
}

/**
 * 덱 이름에서 티어를 떼어낸다.
 *
 * <p>«T0.3 쌍방패 초원마» → tier 0.3, name «쌍방패 초원마».
 * «풀빨 T0.5 태황유» 처럼 앞에 수식이 붙는 것도 있어 위치를 고정하지 않는다.
 * 숫자가 작을수록 강한 표기다.
 */
function splitTier(title) {
  const m = title.match(/T\s*([0-9]+(?:\.[0-9]+)?)/)
  if (!m) return { tier: null, name: title, prefix: '' }
  const prefix = title.slice(0, m.index).trim()
  const name = title.slice(m.index + m[0].length).trim()
  return { tier: Number(m[1]), name: name || title, prefix }
}

/** 라벨 열에서 이 밴드의 행 위치를 찾는다. 시트에 행이 추가돼도 따라가도록 이름으로 찾는다. */
function findRow(rows, from, to, labels) {
  for (let r = from; r < to && r < rows.length; r++) {
    const cells = rows[r] ?? []
    for (const c of cells) {
      if (labels.includes(clean(c))) return r
    }
  }
  return -1
}

function main() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${TIER_GID}`
  fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`시트를 읽지 못했습니다: ${res.status}`)
      return res.text()
    })
    .then((text) => {
      const rows = parseCsv(text)
      const decks = []
      const warnings = []

      // 밴드의 시작은 «장수» 행이다. 그 위 두어 줄에 덱 이름·설명·진형이 있다.
      const generalRows = []
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r] ?? []
        // 장수 행은 라벨이 «장수» 이거나 아예 비어 있고, 이름이 4칸 간격으로 늘어선다.
        const looksLikeGenerals =
          row.some((c) => clean(c) === '장수') ||
          (findRow(rows, r + 1, r + 2, ['전법1']) === r + 1)
        if (looksLikeGenerals && findRow(rows, r + 1, r + 3, ['전법1']) > r) generalRows.push(r)
      }

      for (const gr of generalRows) {
        const bandEnd = Math.min(gr + 16, rows.length)
        const rowOf = (labels) => findRow(rows, gr, bandEnd, labels)
        const at = (r, c) => clean((rows[r] ?? [])[c])

        const rTactic1 = rowOf(['전법1'])
        const rTactic2 = rowOf(['전법2'])
        const rAlt = rowOf(['대체 전법'])
        const rUnit = rowOf(['병종'])
        const rSpec = rowOf(['병종 특화'])
        const rStat = rowOf(['스탯'])
        const rBook = rowOf(['병서'])
        const rGearAttr = rowOf(['장비속성'])
        const rGear = rowOf(['장비'])
        const rMount = rowOf(['탈것'])

        // 이름·설명·진형은 장수 행 위에 있다. 진형은 «○형진/○자진» 으로 끝난다.
        let rFormation = -1
        for (let r = gr - 1; r >= Math.max(0, gr - 4); r--) {
          if ((rows[r] ?? []).some((c) => /[형자행월]진$/.test(clean(c)))) {
            rFormation = r
            break
          }
        }
        const rTitle = rFormation > 0 ? rFormation - 2 : gr - 3
        const rNote = rFormation > 0 ? rFormation - 1 : gr - 2

        for (let c = 1; c + GENERALS_PER_DECK < (rows[gr] ?? []).length; c += BLOCK_WIDTH) {
          const names = []
          for (let i = 1; i <= GENERALS_PER_DECK; i++) names.push(at(gr, c + i))
          if (names.filter(Boolean).length < GENERALS_PER_DECK) continue

          const title = at(rTitle, c)
          if (!title) continue
          const { tier, name, prefix } = splitTier(title)

          const generals = names.map((n, i) => ({
            name: n,
            // 전법 칸 하나에 «허점 공략 ↵ 고요한 제압» 처럼 두 개가 줄바꿈으로 들어 있다.
            // 둘 중 하나를 고르라는 뜻이므로 칸마다 «후보 목록» 으로 담는다.
            tactics: [rTactic1, rTactic2]
              .filter((r) => r > 0)
              .map((r) => splitLines((rows[r] ?? [])[c + i + 1]))
              .filter((list) => list.length > 0),
            alternativeTactics: rAlt > 0 ? splitList((rows[rAlt] ?? [])[c + i + 1]) : [],
            unitType: rUnit > 0 ? at(rUnit, c + i + 1) : '',
            unitSpecialty: rSpec > 0 ? at(rSpec, c + i + 1) : '',
            // 병서는 세 줄이다. 첫 줄이 «금.화계» 같은 주 병서이고 아래 두 줄이 세부 항목이다.
            // 라벨은 첫 줄에만 붙어 있어 그 아래 두 행을 함께 읽는다.
            books: rBook > 0
              ? [rBook, rBook + 1, rBook + 2]
                  .map((r) => at(r, c + i + 1))
                  .filter(Boolean)
              : [],
            gearAttribute: rGearAttr > 0 ? at(rGearAttr, c + i + 1) : '',
            gear: rGear > 0 ? splitLines((rows[rGear] ?? [])[c + i + 1]) : [],
            mount: rMount > 0 ? splitLines((rows[rMount] ?? [])[c + i + 1]) : [],
            statPlan: rStat > 0 ? clean((rows[rStat] ?? [])[c + i + 1]) : '',
          }))

          if (decks.some((d) => d.title === title)) continue // 아래쪽 «선발부대» 표에 같은 덱이 다시 나온다
          decks.push({
            title,
            name,
            note: prefix,
            tier,
            description: rNote > 0 ? clean((rows[rNote] ?? [])[c]) : '',
            formation: rFormation > 0 ? at(rFormation, c) : '',
            generals,
          })
        }
      }

      decks.sort((a, b) => (a.tier ?? 99) - (b.tier ?? 99) || a.name.localeCompare(b.name))

      const unnamed = decks.filter((d) => d.tier == null)
      if (unnamed.length) warnings.push(`티어 표기를 못 읽은 덱 ${unnamed.length}개`)

      fs.writeFileSync(
        OUT,
        JSON.stringify({ source: '시즌2 티어표', sheetGid: TIER_GID, decks }, null, 1) + '\n',
      )
      console.log(`덱 ${decks.length}개 → ${path.relative(process.cwd(), OUT)}`)
      for (const d of decks) {
        console.log(`  T${d.tier ?? '?'} ${d.name} — ${d.generals.map((g) => g.name).join(', ')}`)
      }
      for (const w of warnings) console.log(`  ⚠️ ${w}`)
    })
    .catch((e) => {
      console.error('실패:', e.message)
      process.exitCode = 1
    })
}

main()
