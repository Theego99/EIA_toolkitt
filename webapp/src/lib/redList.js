// ─────────────────────────────────────────────────────────────────────────────
// redList.js — 環境省レッドリスト 参照データベース（EIA頻出種の抜粋）
//
// 現地調査で確認されやすい種について、和名 → 学名・分類群・レッドリスト
// カテゴリを自動補完するための参照データ。カテゴリは CR/EN/VU/NT/LC に正規化。
// ※ 実務では最新の環境省レッドリスト・都道府県RDBで最終確認すること。
// ─────────────────────────────────────────────────────────────────────────────

// { name(和名), latin(学名), type(分類群), status(RLカテゴリ), protected(種の保存法等) }
export const RED_LIST = [
  // ── 猛禽類・鳥類 ──────────────────────────────────────────────
  { name: 'イヌワシ', latin: 'Aquila chrysaetos japonica', type: '鳥類', status: 'EN', protected: true },
  { name: 'クマタカ', latin: 'Nisaetus nipalensis', type: '鳥類', status: 'EN', protected: true },
  { name: 'オオタカ', latin: 'Accipiter gentilis', type: '鳥類', status: 'NT', protected: false },
  { name: 'サシバ', latin: 'Butastur indicus', type: '鳥類', status: 'VU', protected: false },
  { name: 'ハチクマ', latin: 'Pernis ptilorhynchus', type: '鳥類', status: 'NT', protected: false },
  { name: 'ハヤブサ', latin: 'Falco peregrinus', type: '鳥類', status: 'VU', protected: true },
  { name: 'チュウヒ', latin: 'Circus spilonotus', type: '鳥類', status: 'EN', protected: true },
  { name: 'ミサゴ', latin: 'Pandion haliaetus', type: '鳥類', status: 'NT', protected: false },
  { name: 'オジロワシ', latin: 'Haliaeetus albicilla', type: '鳥類', status: 'VU', protected: true },
  { name: 'オオワシ', latin: 'Haliaeetus pelagicus', type: '鳥類', status: 'VU', protected: true },
  { name: 'コアジサシ', latin: 'Sternula albifrons', type: '鳥類', status: 'VU', protected: false },
  { name: 'ブッポウソウ', latin: 'Eurystomus orientalis', type: '鳥類', status: 'EN', protected: false },
  { name: 'ヤイロチョウ', latin: 'Pitta nympha', type: '鳥類', status: 'EN', protected: true },
  { name: 'ヨタカ', latin: 'Caprimulgus indicus', type: '鳥類', status: 'NT', protected: false },
  { name: 'サンショウクイ', latin: 'Pericrocotus divaricatus', type: '鳥類', status: 'VU', protected: false },
  { name: 'アカショウビン', latin: 'Halcyon coromanda', type: '鳥類', status: 'LC', protected: false },
  { name: 'ヤマセミ', latin: 'Megaceryle lugubris', type: '鳥類', status: 'LC', protected: false },
  { name: 'カワセミ', latin: 'Alcedo atthis', type: '鳥類', status: 'LC', protected: false },
  { name: 'ノスリ', latin: 'Buteo japonicus', type: '鳥類', status: 'LC', protected: false },
  { name: 'トビ', latin: 'Milvus migrans', type: '鳥類', status: 'LC', protected: false },
  { name: 'フクロウ', latin: 'Strix uralensis', type: '鳥類', status: 'LC', protected: false },
  { name: 'オオヨシキリ', latin: 'Acrocephalus orientalis', type: '鳥類', status: 'LC', protected: false },
  { name: 'カッコウ', latin: 'Cuculus canorus', type: '鳥類', status: 'LC', protected: false },

  // ── 哺乳類 ────────────────────────────────────────────────────
  { name: 'ニホンカモシカ', latin: 'Capricornis crispus', type: '哺乳類', status: 'LC', protected: true },
  { name: 'ツキノワグマ', latin: 'Ursus thibetanus japonicus', type: '哺乳類', status: 'LC', protected: false },
  { name: 'ヤマネ', latin: 'Glirulus japonicus', type: '哺乳類', status: 'LC', protected: true },
  { name: 'ニホンモモンガ', latin: 'Pteromys momonga', type: '哺乳類', status: 'LC', protected: false },
  { name: 'ムササビ', latin: 'Petaurista leucogenys', type: '哺乳類', status: 'LC', protected: false },
  { name: 'ニホンリス', latin: 'Sciurus lis', type: '哺乳類', status: 'LC', protected: false },
  { name: 'カワネズミ', latin: 'Chimarrogale platycephalus', type: '哺乳類', status: 'LC', protected: false },
  { name: 'ヒナコウモリ', latin: 'Vespertilio sinensis', type: '哺乳類', status: 'VU', protected: false },
  { name: 'ユビナガコウモリ', latin: 'Miniopterus fuliginosus', type: '哺乳類', status: 'NT', protected: false },
  { name: 'カグヤコウモリ', latin: 'Myotis frater', type: '哺乳類', status: 'VU', protected: false },
  { name: 'ホンドギツネ', latin: 'Vulpes vulpes japonica', type: '哺乳類', status: 'LC', protected: false },
  { name: 'ホンドタヌキ', latin: 'Nyctereutes procyonoides', type: '哺乳類', status: 'LC', protected: false },
  { name: 'ニホンテン', latin: 'Martes melampus', type: '哺乳類', status: 'LC', protected: false },
  { name: 'ニホンアナグマ', latin: 'Meles anakuma', type: '哺乳類', status: 'LC', protected: false },
  { name: 'ニホンジカ', latin: 'Cervus nippon', type: '哺乳類', status: 'LC', protected: false },
  { name: 'イノシシ', latin: 'Sus scrofa', type: '哺乳類', status: 'LC', protected: false },

  // ── 両生類・爬虫類 ────────────────────────────────────────────
  { name: 'トウキョウサンショウウオ', latin: 'Hynobius tokyoensis', type: '両生類', status: 'VU', protected: false },
  { name: 'カスミサンショウウオ', latin: 'Hynobius nebulosus', type: '両生類', status: 'VU', protected: false },
  { name: 'ハコネサンショウウオ', latin: 'Onychodactylus japonicus', type: '両生類', status: 'LC', protected: false },
  { name: 'モリアオガエル', latin: 'Rhacophorus arboreus', type: '両生類', status: 'LC', protected: false },
  { name: 'シュレーゲルアオガエル', latin: 'Rhacophorus schlegelii', type: '両生類', status: 'LC', protected: false },
  { name: 'トノサマガエル', latin: 'Pelophylax nigromaculatus', type: '両生類', status: 'NT', protected: false },
  { name: 'ナゴヤダルマガエル', latin: 'Pelophylax porosus brevipodus', type: '両生類', status: 'EN', protected: false },
  { name: 'アカハライモリ', latin: 'Cynops pyrrhogaster', type: '両生類', status: 'NT', protected: false },
  { name: 'ニホンイシガメ', latin: 'Mauremys japonica', type: '爬虫類', status: 'NT', protected: false },
  { name: 'ニホンスッポン', latin: 'Pelodiscus sinensis', type: '爬虫類', status: 'DD', protected: false },
  { name: 'シロマダラ', latin: 'Dinodon orientale', type: '爬虫類', status: 'LC', protected: false },

  // ── 魚類・水生生物 ────────────────────────────────────────────
  { name: 'ミナミメダカ', latin: 'Oryzias latipes', type: '魚類', status: 'VU', protected: false },
  { name: 'ミヤコタナゴ', latin: 'Tanakia tanago', type: '魚類', status: 'CR', protected: true },
  { name: 'ゼニタナゴ', latin: 'Acheilognathus typus', type: '魚類', status: 'CR', protected: false },
  { name: 'スナヤツメ', latin: 'Lethenteron reissneri', type: '魚類', status: 'VU', protected: false },
  { name: 'アユカケ', latin: 'Cottus kazika', type: '魚類', status: 'VU', protected: false },
  { name: 'カジカ', latin: 'Cottus pollux', type: '魚類', status: 'NT', protected: false },
  { name: 'ホトケドジョウ', latin: 'Lefua echigonia', type: '魚類', status: 'EN', protected: false },
  { name: 'ドジョウ', latin: 'Misgurnus anguillicaudatus', type: '魚類', status: 'NT', protected: false },
  { name: 'ギバチ', latin: 'Tachysurus tokiensis', type: '魚類', status: 'VU', protected: false },

  // ── 昆虫・甲殻類 ──────────────────────────────────────────────
  { name: 'ゲンゴロウ', latin: 'Cybister chinensis', type: '昆虫類', status: 'VU', protected: false },
  { name: 'タガメ', latin: 'Kirkaldyia deyrolli', type: '昆虫類', status: 'VU', protected: false },
  { name: 'ギフチョウ', latin: 'Luehdorfia japonica', type: '昆虫類', status: 'VU', protected: false },
  { name: 'ヒメギフチョウ', latin: 'Luehdorfia puziloi', type: '昆虫類', status: 'NT', protected: false },
  { name: 'オオムラサキ', latin: 'Sasakia charonda', type: '昆虫類', status: 'NT', protected: false },
  { name: 'ハッチョウトンボ', latin: 'Nannophya pygmaea', type: '昆虫類', status: 'LC', protected: false },
  { name: 'ベッコウトンボ', latin: 'Libellula angelina', type: '昆虫類', status: 'CR', protected: true },
  { name: 'ゲンジボタル', latin: 'Nipponoluciola cruciata', type: '昆虫類', status: 'LC', protected: false },
  { name: 'サワガニ', latin: 'Geothelphusa dehaani', type: '甲殻類', status: 'LC', protected: false },

  // ── 植物 ──────────────────────────────────────────────────────
  { name: 'オキナグサ', latin: 'Pulsatilla cernua', type: '植物', status: 'VU', protected: false },
  { name: 'サギソウ', latin: 'Pecteilis radiata', type: '植物', status: 'NT', protected: false },
  { name: 'キンラン', latin: 'Cephalanthera falcata', type: '植物', status: 'VU', protected: false },
  { name: 'ギンラン', latin: 'Cephalanthera erecta', type: '植物', status: 'LC', protected: false },
  { name: 'クマガイソウ', latin: 'Cypripedium japonicum', type: '植物', status: 'VU', protected: false },
  { name: 'エビネ', latin: 'Calanthe discolor', type: '植物', status: 'NT', protected: false },
  { name: 'ササユリ', latin: 'Lilium japonicum', type: '植物', status: 'LC', protected: false },
  { name: 'カタクリ', latin: 'Erythronium japonicum', type: '植物', status: 'LC', protected: false },
  { name: 'ミズアオイ', latin: 'Monochoria korsakowii', type: '植物', status: 'NT', protected: false },
  { name: 'デンジソウ', latin: 'Marsilea quadrifolia', type: '植物', status: 'VU', protected: false },
  { name: 'タコノアシ', latin: 'Penthorum chinense', type: '植物', status: 'NT', protected: false },
]

// カテゴリを アプリの STATUS_CFG（CR/EN/VU/NT/LC）へ正規化
function normStatus(s) {
  return ['CR', 'EN', 'VU', 'NT', 'LC'].includes(s) ? s : 'NT' // DD等はNTに寄せる
}

// name(和名) 完全一致で参照。見つかれば {latin,type,status,protected} を返す。
export function lookupSpecies(name) {
  if (!name) return null
  const key = name.trim()
  const hit = RED_LIST.find((r) => r.name === key)
  if (!hit) return null
  return { latin: hit.latin, type: hit.type, status: normStatus(hit.status), protected: !!hit.protected }
}

// 部分一致の候補（サジェスト用）
export function suggestSpecies(query, limit = 8) {
  const q = (query || '').trim()
  if (!q) return []
  return RED_LIST.filter((r) => r.name.includes(q) || r.latin.toLowerCase().includes(q.toLowerCase())).slice(0, limit)
}

export const RED_LIST_NAMES = RED_LIST.map((r) => r.name)
