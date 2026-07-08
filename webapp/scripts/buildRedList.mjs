// One-off generator: parses the official 環境省レッドリスト CSVs (mixed UTF-8 /
// Shift-JIS) into src/lib/redListData.js. Re-run when the ministry updates the
// lists:  node scripts/buildRedList.mjs
import fs from 'node:fs'
import path from 'node:path'

const DL = 'C:/Users/dalca/Downloads'
const FILES = [
  'redlist2025_kinrui.csv',      // 菌類
  'redlist2025_chiirui.csv',     // 地衣類
  'redlist2025_sorui.csv',       // 藻類
  'redlist2025_ikansoku.csv',    // 維管束植物
  'redlist2025_sentairui.csv',   // 蘚苔類
  'redlist2026_amphibian.csv',   // 両生類
  'redlist2026_reptiles.csv',    // 爬虫類
  'redlist2026_birds.csv',       // 鳥類
]

// 分類群（RL表記）→ アプリの type
const TAXON = {
  '菌類': 'その他', '地衣類': 'その他', '藻類': '植物', '蘚苔類': '植物',
  '維管束植物': '植物', '両生類': '両生類', '爬虫類': '爬虫類', '鳥類': '鳥類',
  '哺乳類': '哺乳類', '汽水・淡水魚類': '魚類', '魚類': '魚類', '昆虫類': '昆虫類',
  '貝類': '貝類', 'その他無脊椎動物': 'その他', 'クモ形類・多足類等': 'その他',
}

function decode(buf) {
  const utf8 = new TextDecoder('utf-8').decode(buf)
  if (utf8.includes('カテゴリー') || utf8.includes('和名')) return utf8
  return new TextDecoder('shift_jis').decode(buf) // 一部はShift-JIS
}

// カテゴリー文字列 → CR/EN/VU/NT/DD（EX/EWは現地調査対象外として除外）
function statusOf(cat) {
  const m = cat.match(/[（(]\s*([A-Za-z+ ]+?)\s*[）)]\s*$/)
  const code = (m ? m[1] : '').replace(/\s+/g, '').toUpperCase()
  if (code.startsWith('CR')) return 'CR' // CR, CR+EN
  if (['EN', 'VU', 'NT', 'DD'].includes(code)) return code
  if (code === 'LP') return 'NT' // 地域個体群
  return null // EX / EW / 不明 → 除外
}

// 一部ファイルは分科会名が「爬虫類・両生類」等で種別を判別できないため、
// ファイル名で分類群を上書きする
const FILE_TAXON = {
  'redlist2026_amphibian.csv': '両生類',
  'redlist2026_reptiles.csv': '爬虫類',
  'redlist2026_birds.csv': '鳥類',
}

function statusFromCode(code) {
  const c = (code || '').replace(/\s+/g, '').toUpperCase()
  if (c.startsWith('CR')) return 'CR'
  if (['EN', 'VU', 'NT', 'DD'].includes(c)) return c
  if (c === 'LP') return 'NT'
  return null
}

const map = new Map() // 和名 → entry（重複排除）
for (const f of FILES) {
  const p = path.join(DL, f)
  if (!fs.existsSync(p)) { console.warn('skip (missing):', f); continue }
  const rows = decode(fs.readFileSync(p)).split(/\r?\n/).map((r) => r.split(','))
  // ヘッダ行 = '和名' セルを含む最初の行（単純形式=行0 / 詳細形式=行2）
  const hIdx = rows.findIndex((r) => r.some((c) => (c || '').trim() === '和名'))
  if (hIdx < 0) { console.warn('no header:', f); continue }
  const H = rows[hIdx]
  const nameIdx = H.findIndex((c) => (c || '').trim() === '和名')
  const latinIdx = H.findIndex((c) => /学名/.test(c || ''))
  const taxonIdx = H.findIndex((c) => /分類群|分科会名/.test(c || ''))
  const engIdx = H.findIndex((c) => /カテゴリーENG|カテゴリーeng/i.test(c || ''))
  const jpnIdx = H.findIndex((c) => (c || '').trim() === 'カテゴリー' || /カテゴリーJPN/i.test(c || ''))
  let n = 0
  for (let r = hIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || row.length <= nameIdx) continue
    const nm = (row[nameIdx] || '').trim()
    if (!nm) continue
    const status = engIdx >= 0 ? statusFromCode(row[engIdx]) : statusOf(row[jpnIdx] || '')
    if (!status) continue
    const latin = (row[latinIdx] || '').trim()
    const type = FILE_TAXON[f] || TAXON[(row[taxonIdx] || '').trim()] || 'その他'
    if (!map.has(nm)) { map.set(nm, { name: nm, latin, type, status }); n++ }
  }
  console.log(f, '→', n, 'species')
}

const arr = [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ja'))
const body =
  '// AUTO-GENERATED from the official 環境省レッドリスト CSVs by scripts/buildRedList.mjs\n' +
  '// Do not edit by hand. Category normalized to CR/EN/VU/NT/DD; taxon to the app scheme.\n' +
  'export const RED_LIST_OFFICIAL = [\n' +
  arr.map((e) =>
    `  { name: ${JSON.stringify(e.name)}, latin: ${JSON.stringify(e.latin)}, type: ${JSON.stringify(e.type)}, status: ${JSON.stringify(e.status)} },`
  ).join('\n') +
  '\n]\n'

const out = path.join(process.cwd(), 'src/lib/redListData.js')
fs.writeFileSync(out, body)
console.log('TOTAL:', arr.length, '→', out)
