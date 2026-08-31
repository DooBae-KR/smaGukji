import { createWorker } from 'tesseract.js'
import { PSM } from 'tesseract.js'
import type { Worker } from 'tesseract.js'

/**
 * 전보 사진 판독.
 *
 * <p>브라우저 안에서 돈다. 서버에 맡기면 Render 무료 인스턴스가 잠든 동안 전보를 못 올리고,
 * 바깥 API 를 쓰면 건당 비용과 키 관리가 붙는다. 전보는 자주 올리는 화면이라 둘 다 맞지 않다.
 * 한글 학습 데이터(2.2MB)는 {@code public/tessdata/} 에 함께 넣어 뒀다 — CDN 에서 받아오게
 * 두면 그 CDN 이 죽는 날 전보 화면도 같이 죽는다.
 *
 * <h3>화면 전체를 한 번에 읽지 않는다</h3>
 *
 * <p>처음에는 사진 한 장을 통째로 판독기에 넣었다. 그러면 표의 칸이 뒤엉킨다 — 전법 이름과
 * 옆 칸 숫자가 한 줄로 붙어 나와, 어느 장수의 전법인지 알 수 없게 된다. 실측에서 전법 3칸과
 * 적군 장수 절반을 놓쳤다.
 *
 * <p>전투 결과 화면은 <b>격자가 고정</b>돼 있다. 장수 여섯 열, 열마다 전법 세 줄, 줄마다
 * 왼쪽이 이름 오른쪽이 숫자다. 그래서 칸마다 잘라서 따로 읽는다. 칸 하나에는 글자가 몇 자뿐이라
 * 판독기가 훨씬 잘 맞힌다. 같은 사진으로 <b>장수 6/6, 전법 18/18</b> 이 정확히 나왔다.
 *
 * <p>좌표는 비율이라 해상도가 달라도 통한다. 다만 사진을 잘라 올리면 어긋나므로, 이름이 하나도
 * 안 잡히면 부르는 쪽에서 «직접 입력» 으로 돌아갈 수 있게 결과에 그대로 담아 돌려준다.
 */

/** 열 여섯 개(아군 3 · 적군 3)의 [왼쪽, 너비]. 가운데는 전투 결과 패널이라 비어 있다. */
const COLUMNS: [number, number][] = [
  [0.006, 0.128],
  [0.139, 0.128],
  [0.273, 0.134],
  [0.593, 0.128],
  [0.727, 0.131],
  [0.863, 0.131],
]

/** 장수 이름이 적힌 띠 [위, 높이] */
const NAME_BAND: [number, number] = [0.538, 0.058]

/** 전법 세 줄 [위, 높이] */
const TACTIC_BANDS: [number, number][] = [
  [0.648, 0.112],
  [0.772, 0.098],
  [0.878, 0.1],
]

/** 열에서 전법 «이름» 이 차지하는 왼쪽 비율. 나머지 오른쪽이 숫자다. */
const NAME_PART = 0.58

/** 숫자 칸에서 위쪽 «×횟수» 가 차지하는 비율. 아래가 누적 피해·회복이다. */
const COUNT_PART = 0.42

/** 위쪽 띠 — 진형과 부대 병력. */
const TOP = {
  ourFormation: [0.3, 0.02, 0.13, 0.09] as const,
  enemyFormation: [0.57, 0.02, 0.13, 0.09] as const,
  ourTroops: [0.0, 0.12, 0.16, 0.07] as const,
  enemyTroops: [0.84, 0.12, 0.16, 0.07] as const,
}

export interface CellTactic {
  /** 판독한 전법 이름. 맞추기는 readReport 가 한다 */
  name: string
  activations?: number
  /** 누적 피해나 회복. 판독기는 색을 못 봐서 어느 쪽인지 구분하지 못한다 */
  value?: number
}

export interface CellGeneral {
  name: string
  tactics: CellTactic[]
}

export interface BattleCells {
  generals: CellGeneral[]
  ourFormation: string
  enemyFormation: string
  ourTroops: string
  enemyTroops: string
}

let korWorker: Worker | null = null
let numWorker: Worker | null = null

async function getWorkers(onProgress?: (m: string) => void) {
  if (korWorker && numWorker) return { kor: korWorker, num: numWorker }
  onProgress?.('판독기를 준비하는 중입니다… (처음 한 번만 몇 초 걸립니다)')
  // 판독기 부품을 전부 우리 쪽에서 준다. 기본값은 바깥 CDN 에서 받아오는데, 그러면
  // 그 CDN 이 막히거나 죽는 순간 «initialization failed» 로 판독이 통째로 멎는다.
  // (실제로 그것 때문에 화면에서 동작하지 않았다.)
  //
  // worker.min.js — 판독을 도맡는 웹워커
  // corePath      — wasm 본체. 폴더가 아니라 «파일» 을 콕 집는다. 폴더를 주면 tesseract 가
  //                 브라우저 성능에 맞춰 여러 변형 중 하나를 고르는데, 그러면 어느 것을
  //                 고를지 몰라 변형 여섯 개(약 19MB)를 전부 올려야 한다. SIMD 는 요즘
  //                 브라우저면 다 되므로 그중 하나만 두고 지정한다.
  // langPath      — 학습 데이터. 압축하지 않은 .traineddata 라 gzip 을 끈다
  const base = import.meta.env.BASE_URL
  const options = {
    workerPath: `${base}tesseract/worker.min.js`,
    corePath: `${base}tesseract/tesseract-core-simd-lstm.wasm.js`,
    langPath: `${base}tessdata`,
    gzip: false,
  }
  // 워커가 뜨다가 실패하면 tesseract 는 조용히 «initialization failed» 만 던진다.
  // 무엇 때문인지 알 수 있도록 부품 이름을 붙여 다시 던진다.
  const make = async (lang: 'kor' | 'eng') => {
    try {
      return await createWorker(lang, 1, options)
    } catch (e) {
      throw new Error(
        `판독기(${lang})를 띄우지 못했습니다: ${(e as Error).message}. ` +
          `${base}tesseract/ 와 ${base}tessdata/${lang}.traineddata 가 있는지 확인해 주세요.`,
      )
    }
  }

  try {
    korWorker = await make('kor')
    // 숫자는 영어 판독기에 숫자만 허용하는 편이 훨씬 낫다. 한글 판독기는 «1» 을 «ㅣ» 로,
    // «0» 을 «)» 으로 읽는다.
    numWorker = await make('eng')
    await numWorker.setParameters({ tessedit_char_whitelist: '0123456789,' })
  } catch (e) {
    // 둘 중 하나만 뜬 채로 두지 않는다. 반쪽만 남으면 다음 시도에서 또 새로 만들어
    // 죽은 워커가 쌓이고, 어디서 실패했는지도 흐려진다.
    await disposeOcr()
    throw e
  }
  return { kor: korWorker, num: numWorker }
}

/**
 * 칸 하나를 잘라 판독하기 좋게 손본다.
 *
 * <p>여섯 배로 키우고 흑백으로 만든 뒤 대비를 끝까지 편다. 게임 글자가 10px 남짓이라
 * 키우지 않으면 거의 못 읽는다. 대비를 펴는 것은 배경이 화려해서다.
 */
function cropCell(
  source: HTMLCanvasElement,
  [x, y, w, h]: readonly [number, number, number, number],
  scale: number,
): HTMLCanvasElement | null {
  const left = Math.max(0, Math.round(x * source.width))
  const top = Math.max(0, Math.round(y * source.height))
  const width = Math.min(source.width - left, Math.round(w * source.width))
  const height = Math.min(source.height - top, Math.round(h * source.height))
  if (width < 4 || height < 4) return null

  const canvas = document.createElement('canvas')
  canvas.width = width * scale
  canvas.height = height * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, left, top, width, height, 0, 0, canvas.width, canvas.height)

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const px = image.data
  let min = 255
  let max = 0
  for (let i = 0; i < px.length; i += 4) {
    const v = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0
    px[i] = px[i + 1] = px[i + 2] = v
    if (v < min) min = v
    if (v > max) max = v
  }
  const span = max - min
  if (span > 8) {
    for (let i = 0; i < px.length; i += 4) {
      const v = ((px[i] - min) * 255) / span
      px[i] = px[i + 1] = px[i + 2] = v
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

async function toCanvas(file: File): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('이 브라우저에서는 사진을 처리할 수 없습니다.')
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return canvas
}

/** 숫자만 뽑는다. 못 읽었으면 undefined — 0 으로 채우지 않는다. */
function toNumber(text: string): number | undefined {
  const m = text.replace(/[,\s]/g, '').match(/\d+/)
  return m ? Number(m[0]) : undefined
}

export async function readBattleImage(
  file: File,
  onProgress?: (message: string) => void,
): Promise<BattleCells> {
  const source = await toCanvas(file)
  const { kor, num } = await getWorkers(onProgress)

  const readText = async (rect: readonly [number, number, number, number], psm: PSM) => {
    const cell = cropCell(source, rect, 6)
    if (!cell) return ''
    await kor.setParameters({ tessedit_pageseg_mode: psm })
    const { data } = await kor.recognize(cell)
    return data.text.replace(/\s+/g, ' ').trim()
  }

  const readNumber = async (rect: readonly [number, number, number, number], psm: PSM) => {
    const cell = cropCell(source, rect, 8)
    if (!cell) return undefined
    await num.setParameters({ tessedit_pageseg_mode: psm })
    const { data } = await num.recognize(cell)
    return toNumber(data.text)
  }

  onProgress?.('위쪽 띠를 읽는 중…')
  const ourFormation = await readText(TOP.ourFormation, PSM.SINGLE_LINE)
  const enemyFormation = await readText(TOP.enemyFormation, PSM.SINGLE_LINE)
  const ourTroops = await readText(TOP.ourTroops, PSM.SINGLE_LINE)
  const enemyTroops = await readText(TOP.enemyTroops, PSM.SINGLE_LINE)

  const generals: CellGeneral[] = []
  for (let c = 0; c < COLUMNS.length; c++) {
    onProgress?.(`장수 ${c + 1}/6 을 읽는 중…`)
    const [x, w] = COLUMNS[c]
    const name = await readText([x, NAME_BAND[0], w, NAME_BAND[1]], PSM.SINGLE_LINE)

    const tactics: CellTactic[] = []
    for (const [by, bh] of TACTIC_BANDS) {
      const tacticName = await readText([x, by, w * NAME_PART, bh], PSM.SINGLE_BLOCK)
      const numX = x + w * NAME_PART
      const numW = w * (1 - NAME_PART)
      const activations = await readNumber([numX, by, numW, bh * COUNT_PART], PSM.SINGLE_LINE)
      const value = await readNumber(
        [numX, by + bh * COUNT_PART, numW, bh * (1 - COUNT_PART)],
        PSM.SINGLE_BLOCK,
      )
      tactics.push({ name: tacticName, activations, value })
    }
    generals.push({ name, tactics })
  }

  // ⚠️ 임시 디버그 로그. 판독이 자꾸 빗나가는 사진이 있어, 어느 칸에서 무엇을 읽었는지
  // 콘솔에서 바로 볼 수 있게 남겨 둔다. 원인을 찾으면 이 블록은 지운다.
  console.group('[전보 OCR 원문]')
  console.log('사진 크기', `${source.width}×${source.height}`)
  console.log('진형', { ourFormation, enemyFormation })
  console.log('병력', { ourTroops, enemyTroops })
  console.table(
    generals.map((g, i) => ({
      자리: i < 3 ? `아군 ${i + 1}` : `적군 ${i - 2}`,
      이름원문: g.name,
      전법1: g.tactics[0]?.name,
      전법2: g.tactics[1]?.name,
      전법3: g.tactics[2]?.name,
    })),
  )
  console.groupEnd()

  return { generals, ourFormation, enemyFormation, ourTroops, enemyTroops }
}

/** 화면을 떠날 때 웹워커를 정리한다. 두고 가면 메모리를 계속 잡고 있다. */
export async function disposeOcr(): Promise<void> {
  const workers = [korWorker, numWorker].filter(Boolean) as Worker[]
  korWorker = null
  numWorker = null
  await Promise.all(workers.map((w) => w.terminate()))
}
