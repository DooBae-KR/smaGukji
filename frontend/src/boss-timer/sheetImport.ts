import type { BulkImportRow, SpawnType } from './api'

/** 두배님의 "보스탭" 구글시트 export CSV 주소. gid 는 그 탭의 gid. */
export const BOSS_SHEET_CSV_URL =
  'https://docs.google.com/spreadsheets/d/1DWR_iZ91ABywQroNo58pYMGlBAfqdfnSpK-fofggbcc/export?format=csv&gid=1197902919'

const WEEKDAY_KO: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 }

/**
 * 방을 처음 만들 때 자동으로 넣는 기본 보스 목록.
 *
 * 시트를 그때그때 브라우저에서 불러오는 "📄 시트에서 불러오기" 와 달리, 이건 방 생성 시각에
 * 딱 한 번 넣는 값이라 여기 그대로 박아둔다(2026-09-05 시트 스냅샷). CORS 로 시트를 못 읽는
 * 상황이어도 새 방에는 항상 보스 목록이 채워지게 하기 위해서다. 시트가 바뀌면 방을 만든 뒤
 * "시트에서 불러오기" 로 최신값을 다시 반영하면 된다.
 */
export const DEFAULT_BOSS_SEED: BulkImportRow[] = [
  { name: '아라크네', level: 50, location: '테실리아', spawnType: 2, weekday: 3, fixedTime: '21:00' },
  { name: '메데이아', level: 45, location: '[인터] 타르타로스 2층', spawnType: 2, weekday: 6, fixedTime: '21:00' },
  { name: '케르베로스', level: 75, location: '[인터] 타르타로스5계 심판', spawnType: 2, weekday: 5, fixedTime: '21:00' },
  { name: '아르고스', level: 65, location: '자하브', spawnType: 2, weekday: 1, fixedTime: '21:00' },
  { name: '크리소파고스', level: 35, location: '테실리아 평원', spawnType: 1, respawnMinMinutes: 480, respawnMaxMinutes: 480 },
  { name: '아모르포스', level: 35, location: '침식된 경작지', spawnType: 1, respawnMinMinutes: 480, respawnMaxMinutes: 480 },
  { name: '트라손', level: 40, location: '고대 신전 유적지', spawnType: 1, respawnMinMinutes: 480, respawnMaxMinutes: 480 },
  { name: '이오칸토스', level: 45, location: '아르보리아스 폐허', spawnType: 1, respawnMinMinutes: 720, respawnMaxMinutes: 720 },
  { name: '키니 러우리', level: 45, location: '금지된 숲', spawnType: 1, respawnMinMinutes: 720, respawnMaxMinutes: 720 },
  { name: '알라스토르', level: 55, location: '무법자의 길목', spawnType: 1, respawnMinMinutes: 480, respawnMaxMinutes: 480 },
  { name: '베딕스', level: 60, location: '공헌의 제단', spawnType: 1, respawnMinMinutes: 480, respawnMaxMinutes: 480 },
  { name: '고트시스', level: 60, location: '황 금리라 부락', spawnType: 1, respawnMinMinutes: 480, respawnMaxMinutes: 480 },
  { name: '트리포크', level: 65, location: '가시 덤불 지대', spawnType: 1, respawnMinMinutes: 720, respawnMaxMinutes: 720 },
  { name: '거인의 세번째 손', level: 70, location: '유적지 폐허', spawnType: 1, respawnMinMinutes: 720, respawnMaxMinutes: 720 },
  { name: '봉인된 아모르포스', level: 40, location: '[인터] 타르타로스 1층', spawnType: 1, respawnMinMinutes: 360, respawnMaxMinutes: 600 },
  { name: '봉인된 브델레스', level: 45, location: '[인터] 타르타로스 2층', spawnType: 1, respawnMinMinutes: 720, respawnMaxMinutes: 720 },
  { name: '봉인된 스코톨라스마', level: 60, location: '[인터] 타르타로스 3층', spawnType: 1, respawnMinMinutes: 360, respawnMaxMinutes: 600 },
  { name: '심연의 틈', level: 0, location: '테실리아', spawnType: 3, fixedTime: '12:00' },
  { name: '심연의 틈', level: 0, location: '테실리아', spawnType: 3, fixedTime: '20:00' },
]

/** "오전 8:00:00" 같은 값에서 오전/오후 는 무시하고 시:분 을 «분 단위 길이» 로 읽는다(쿨타임형용). */
function parseDurationMinutes(raw: string): number | null {
  const m = raw.trim().match(/(\d{1,2}):(\d{2})/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/** "오전 8:00:00" / "오후 9:00:00" 을 실제 시계 시각 "HH:MM" 으로 읽는다(요일고정·매일고정형용). */
function parseClockTime(raw: string): string | null {
  const s = raw.trim()
  const m = s.match(/(\d{1,2}):(\d{2})/)
  if (!m) return null
  let h = Number(m[1])
  const min = Number(m[2])
  if (s.includes('오후') && h !== 12) h += 12
  if (s.includes('오전') && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

/** 매우 단순한 CSV 파서. 셀 안에 줄바꿈 없는 일반적인 시트 export 만 가정한다. */
function parseCsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => {
      const cells: string[] = []
      let cur = ''
      let inQuotes = false
      for (let i = 0; i < line.length; i++) {
        const c = line[i]
        if (inQuotes) {
          if (c === '"' && line[i + 1] === '"') {
            cur += '"'
            i++
          } else if (c === '"') {
            inQuotes = false
          } else {
            cur += c
          }
        } else if (c === '"') {
          inQuotes = true
        } else if (c === ',') {
          cells.push(cur)
          cur = ''
        } else {
          cur += c
        }
      }
      cells.push(cur)
      return cells
    })
}

export function parseBossSheet(csvText: string): { rows: BulkImportRow[]; skipped: string[] } {
  const table = parseCsv(csvText)
  if (table.length === 0) return { rows: [], skipped: [] }

  const header = table[0].map((h) => h.trim())
  const idx = (name: string) => header.findIndex((h) => h.replace(/\s/g, '') === name)
  const iName = idx('보스이름')
  const iLevel = idx('레벨')
  const iLocation = idx('위치')
  const iCode = idx('등장코드')
  const iTime = idx('시간')
  const iWeekday = idx('요일')

  const rows: BulkImportRow[] = []
  const skipped: string[] = []

  for (const cells of table.slice(1)) {
    const name = cells[iName]?.trim()
    if (!name) continue
    const code = Number(cells[iCode]?.trim()) as SpawnType
    const timeCell = cells[iTime]?.trim() ?? ''
    const level = iLevel >= 0 && cells[iLevel]?.trim() ? Number(cells[iLevel]) : null
    const location = iLocation >= 0 ? cells[iLocation]?.trim() || null : null

    if (code === 1) {
      // "6:00 ~ 10:00" 같은 범위면 최소·최대로, 아니면 같은 값으로.
      if (timeCell.includes('~')) {
        const [a, b] = timeCell.split('~')
        const min = parseDurationMinutes(a)
        const max = parseDurationMinutes(b)
        if (min == null || max == null) { skipped.push(name); continue }
        rows.push({ name, level, location, spawnType: 1, respawnMinMinutes: min, respawnMaxMinutes: max })
      } else {
        const min = parseDurationMinutes(timeCell)
        if (min == null) { skipped.push(name); continue }
        rows.push({ name, level, location, spawnType: 1, respawnMinMinutes: min, respawnMaxMinutes: min })
      }
    } else if (code === 2) {
      const weekdayKo = cells[iWeekday]?.trim()
      const weekday = weekdayKo ? WEEKDAY_KO[weekdayKo] : undefined
      const fixedTime = parseClockTime(timeCell)
      if (weekday === undefined || fixedTime == null) { skipped.push(name); continue }
      rows.push({ name, level, location, spawnType: 2, weekday, fixedTime })
    } else if (code === 3) {
      const fixedTime = parseClockTime(timeCell)
      if (fixedTime == null) { skipped.push(name); continue }
      rows.push({ name, level, location, spawnType: 3, fixedTime })
    } else {
      skipped.push(name)
    }
  }

  return { rows, skipped }
}
