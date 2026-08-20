/**
 * 무장 분류 시드 생성기.
 *
 * 사용자 스프레드시트의 «무장» 시트를 CSV 로 받아 V13 마이그레이션을 만든다.
 * 한글 이름·설명을 손으로 옮겨 적으면 오타가 나므로 항상 원본에서 생성한다.
 *
 *   node tools/generate-general-seed.js
 *
 * 시트에 새 분류 값이 생기면 «추측하지 않고» 멈춘다. 아래 매핑표를 갱신한 뒤 다시 돌린다.
 */
const fs = require('fs');
const https = require('https');
const path = require('path');

const SHEET_ID = '1UOtQR7PvI5qJwLeFbq-RErRRKBwl-JjXhsK53JXLzAA';
const GID = '817745317';
const OUT = path.join(
  __dirname, '..',
  'backend/src/main/resources/db/migration/V13__seed_general_classification.sql',
);

// 시트의 한글 분류 → DB 코드
const CAMP = { 전열: 'FRONT', 균형: 'BALANCE', 후열: 'BACK' };

// 성향은 복수다. 보조방어·문무보조는 시트에 한 덩어리로 적혀 있어 분해하지 않는다.
const DISP = {
  치유: 'HEAL',
  보조: 'SUPPORT',
  방어: 'DEFENSE',
  보조방어: 'SUPPORT_DEFENSE',
  문무보조: 'CIVIL_MARTIAL_SUPPORT',
  책략: 'STRATEGY',
  병기: 'WEAPON',
};

const UNIT = { 방패병: 'SHIELD', 창병: 'SPEAR', 궁병: 'BOW', 기병: 'CAVALRY' };
const CAT = { 지휘: 'COMMAND', 액티브: 'ACTIVE', 패시브: 'PASSIVE' };
const ABIL = { 치유: 'HEAL', 보조: 'SUPPORT', 책략: 'STRATEGY', 병기: 'WEAPON' };

/** RFC 4180 파서. 전법 설명에 쉼표와 개행이 들어 있어 따옴표 처리가 필수다. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); field = ''; rows.push(row); row = []; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function fetchCsv() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;
  return new Promise((resolve, reject) => {
    const get = (u, depth = 0) => {
      if (depth > 5) return reject(new Error('리다이렉트가 너무 많습니다'));
      https.get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return get(res.headers.location, depth + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(
            `시트를 받지 못했습니다 (HTTP ${res.statusCode}). 공개 설정을 확인하세요.`));
        }
        let s = '';
        res.setEncoding('utf8');
        res.on('data', (d) => { s += d; });
        res.on('end', () => resolve(s));
      }).on('error', reject);
    };
    get(url);
  });
}

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const t = (v) => (v || '').trim();

// 알 수 없는 값은 첫 건에서 멈추지 않고 전부 모아 한 번에 보고한다.
const unknown = [];

function map(table, value, label, who) {
  if (!value) return null;
  const code = table[value];
  if (!code) { unknown.push(`${who}: ${label} "${value}"`); return null; }
  return code;
}

/** 성향처럼 여러 값이 올 수 있는 칸. 줄바꿈으로만 나눈다. */
function mapMulti(table, raw, label, who) {
  return String(raw || '')
    .split(/[\r\n]+/)
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => map(table, v, label, who))
    .filter(Boolean);
}

(async () => {
  const rows = parseCsv(await fetchCsv());
  const list = [];

  for (const r of rows.slice(1)) {
    const name = t(r[4]);
    if (!name) continue;                 // 빈 템플릿 행
    list.push({
      name,
      camp: map(CAMP, t(r[1]), '진영', name),
      dispositions: mapMulti(DISP, r[2], '성향', name),
      unit: map(UNIT, t(r[5]), '병종', name),
      cat: map(CAT, t(r[6]), '전법 유명', name),
      abil: map(ABIL, t(r[7]), '전법 특성', name),
      tactic: t(r[8]),
      rate: t(r[9]).replace('%', ''),
      desc: t(r[10]),
      might: t(r[11]),
      intellect: t(r[12]),
      leadership: t(r[13]),
      initiative: t(r[14]),
    });
  }

  if (unknown.length) {
    console.error('❌ 매핑표에 없는 값이 있습니다. 추측하지 않고 멈춥니다:');
    for (const u of [...new Set(unknown)]) console.error('   ' + u);
    console.error('\n   tools/generate-general-seed.js 의 매핑표와');
    console.error('   V12 마이그레이션의 체크 제약을 함께 갱신하세요.');
    process.exit(1);
  }
  if (!list.length) throw new Error('시트에서 장수를 한 명도 읽지 못했습니다.');

  const withTactic = list.filter((r) => r.tactic);
  console.log(`장수 ${list.length}명 / 고유전법 ${withTactic.length}개`);

  let sql = '';
  sql += '-- 자동 생성 파일. 직접 수정하지 말고 tools/generate-general-seed.js 를 다시 실행하세요.\n';
  sql += '--\n';
  sql += '-- 출처: 사용자 스프레드시트의 «무장» 시트.\n';
  sql += '-- 시트가 비어 있는 장수는 넣지 않는다. 추측으로 채우지 않는다.\n\n';

  if (withTactic.length) {
    sql += '-- 1) 고유전법. 카드로 존재하는 77개 전법과는 별개다.\n';
    sql += 'insert into tactic (name, category, ability_type, trigger_rate, effect_text, source) values\n';
    sql += withTactic.map((r) => '    (' + [
      q(r.tactic), q(r.cat), q(r.abil), r.rate || 'null', q(r.desc), q('SIGNATURE'),
    ].join(', ') + ')').join(',\n');
    sql += '\non conflict (name) do update set\n';
    sql += '    category = excluded.category,\n';
    sql += '    ability_type = excluded.ability_type,\n';
    sql += '    trigger_rate = excluded.trigger_rate,\n';
    sql += '    effect_text = excluded.effect_text,\n';
    sql += '    source = excluded.source;\n\n';
  }

  sql += '-- 2) 장수 분류·수치를 채우고 고유전법을 연결한다.\n';
  sql += '--    이름이 이미 있는 장수만 갱신한다. 시트에만 있는 이름은 만들지 않는다.\n';
  for (const r of list) {
    const num = (v) => (v === '' ? 'null' : v);
    sql += 'update general set\n';
    sql += `    camp = ${r.camp ? q(r.camp) : 'null'},`
      + ` dispositions = ${q('{' + r.dispositions.join(',') + '}')},`
      + ` unit_type = ${r.unit ? q(r.unit) : 'null'},\n`;
    sql += `    might = ${num(r.might)}, intellect = ${num(r.intellect)},`
      + ` leadership = ${num(r.leadership)}, initiative = ${num(r.initiative)},\n`;
    sql += '    stat_level = 50';
    if (r.tactic) {
      sql += `,\n    signature_tactic_id = (select id from tactic where name = ${q(r.tactic)})`;
    }
    sql += `\nwhere name = ${q(r.name)};\n\n`;
  }

  fs.writeFileSync(OUT, sql, 'utf8');
  console.log('생성 완료: ' + OUT);
})().catch((e) => { console.error('❌ ' + e.message); process.exit(1); });
