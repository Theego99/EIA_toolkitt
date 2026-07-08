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

  // ── 追加：鳥類 ────────────────────────────────────────────────
  { name: 'タンチョウ', latin: 'Grus japonensis', type: '鳥類', status: 'EN', protected: true },
  { name: 'コウノトリ', latin: 'Ciconia boyciana', type: '鳥類', status: 'CR', protected: true },
  { name: 'トキ', latin: 'Nipponia nippon', type: '鳥類', status: 'CR', protected: true },
  { name: 'クロツラヘラサギ', latin: 'Platalea minor', type: '鳥類', status: 'VU', protected: false },
  { name: 'ヘラシギ', latin: 'Calidris pygmaea', type: '鳥類', status: 'CR', protected: false },
  { name: 'シマフクロウ', latin: 'Ketupa blakistoni', type: '鳥類', status: 'CR', protected: true },
  { name: 'アオバズク', latin: 'Ninox japonica', type: '鳥類', status: 'LC', protected: false },
  { name: 'コミミズク', latin: 'Asio flammeus', type: '鳥類', status: 'NT', protected: false },
  { name: 'オオジシギ', latin: 'Gallinago hardwickii', type: '鳥類', status: 'NT', protected: false },
  { name: 'セイタカシギ', latin: 'Himantopus himantopus', type: '鳥類', status: 'VU', protected: false },
  { name: 'ヒクイナ', latin: 'Zapornia fusca', type: '鳥類', status: 'NT', protected: false },
  { name: 'アカモズ', latin: 'Lanius cristatus', type: '鳥類', status: 'EN', protected: false },
  { name: 'ノゴマ', latin: 'Calliope calliope', type: '鳥類', status: 'LC', protected: false },
  { name: 'クロサギ', latin: 'Egretta sacra', type: '鳥類', status: 'LC', protected: false },
  { name: 'ミゾゴイ', latin: 'Gorsachius goisagi', type: '鳥類', status: 'EN', protected: false },
  { name: 'ヨシゴイ', latin: 'Ixobrychus sinensis', type: '鳥類', status: 'NT', protected: false },
  { name: 'カンムリウミスズメ', latin: 'Synthliboramphus wumizusume', type: '鳥類', status: 'VU', protected: true },
  { name: 'ウミネコ', latin: 'Larus crassirostris', type: '鳥類', status: 'LC', protected: false },
  { name: 'カワガラス', latin: 'Cinclus pallasii', type: '鳥類', status: 'LC', protected: false },
  { name: 'コマドリ', latin: 'Larvivora akahige', type: '鳥類', status: 'LC', protected: false },
  { name: 'オオルリ', latin: 'Cyanoptila cyanomelana', type: '鳥類', status: 'LC', protected: false },
  { name: 'キビタキ', latin: 'Ficedula narcissina', type: '鳥類', status: 'LC', protected: false },
  { name: 'ホオジロ', latin: 'Emberiza cioides', type: '鳥類', status: 'LC', protected: false },
  { name: 'オオヨシゴイ', latin: 'Ixobrychus eurhythmus', type: '鳥類', status: 'CR', protected: false },

  // ── 追加：哺乳類 ──────────────────────────────────────────────
  { name: 'ニホンザル', latin: 'Macaca fuscata', type: '哺乳類', status: 'LC', protected: false },
  { name: 'ニホンウサギコウモリ', latin: 'Plecotus sacrimontis', type: '哺乳類', status: 'NT', protected: false },
  { name: 'コテングコウモリ', latin: 'Murina ussuriensis', type: '哺乳類', status: 'DD', protected: false },
  { name: 'ヤマコウモリ', latin: 'Nyctalus aviator', type: '哺乳類', status: 'NT', protected: false },
  { name: 'モグラ', latin: 'Mogera imaizumii', type: '哺乳類', status: 'LC', protected: false },
  { name: 'ヒミズ', latin: 'Urotrichus talpoides', type: '哺乳類', status: 'LC', protected: false },
  { name: 'カヤネズミ', latin: 'Micromys minutus', type: '哺乳類', status: 'LC', protected: false },
  { name: 'スミスネズミ', latin: 'Eothenomys smithii', type: '哺乳類', status: 'LC', protected: false },
  { name: 'アズマモグラ', latin: 'Mogera imaizumii', type: '哺乳類', status: 'LC', protected: false },
  { name: 'ジネズミ', latin: 'Crocidura dsinezumi', type: '哺乳類', status: 'LC', protected: false },

  // ── 追加：両生類・爬虫類 ──────────────────────────────────────
  { name: 'クロサンショウウオ', latin: 'Hynobius nigrescens', type: '両生類', status: 'NT', protected: false },
  { name: 'ヒダサンショウウオ', latin: 'Hynobius kimurae', type: '両生類', status: 'NT', protected: false },
  { name: 'オオサンショウウオ', latin: 'Andrias japonicus', type: '両生類', status: 'VU', protected: true },
  { name: 'タゴガエル', latin: 'Rana tagoi', type: '両生類', status: 'LC', protected: false },
  { name: 'ヤマアカガエル', latin: 'Rana ornativentris', type: '両生類', status: 'LC', protected: false },
  { name: 'ニホンアカガエル', latin: 'Rana japonica', type: '両生類', status: 'NT', protected: false },
  { name: 'カジカガエル', latin: 'Buergeria buergeri', type: '両生類', status: 'LC', protected: false },
  { name: 'ツチガエル', latin: 'Glandirana rugosa', type: '両生類', status: 'LC', protected: false },
  { name: 'ヒバカリ', latin: 'Hebius vibakari', type: '爬虫類', status: 'LC', protected: false },
  { name: 'ジムグリ', latin: 'Euprepiophis conspicillatus', type: '爬虫類', status: 'LC', protected: false },
  { name: 'タカチホヘビ', latin: 'Achalinus spinalis', type: '爬虫類', status: 'LC', protected: false },
  { name: 'ニホントカゲ', latin: 'Plestiodon japonicus', type: '爬虫類', status: 'LC', protected: false },
  { name: 'ニホンカナヘビ', latin: 'Takydromus tachydromoides', type: '爬虫類', status: 'LC', protected: false },

  // ── 追加：魚類・水生生物 ──────────────────────────────────────
  { name: 'イトウ', latin: 'Parahucho perryi', type: '魚類', status: 'EN', protected: false },
  { name: 'アカザ', latin: 'Liobagrus reinii', type: '魚類', status: 'NT', protected: false },
  { name: 'ヤリタナゴ', latin: 'Tanakia lanceolata', type: '魚類', status: 'NT', protected: false },
  { name: 'アブラボテ', latin: 'Tanakia limbata', type: '魚類', status: 'NT', protected: false },
  { name: 'ニッポンバラタナゴ', latin: 'Rhodeus ocellatus kurumeus', type: '魚類', status: 'CR', protected: false },
  { name: 'カワバタモロコ', latin: 'Hemigrammocypris rasborella', type: '魚類', status: 'EN', protected: false },
  { name: 'ウシモツゴ', latin: 'Pseudorasbora pumila', type: '魚類', status: 'CR', protected: false },
  { name: 'シナイモツゴ', latin: 'Pseudorasbora pumila pumila', type: '魚類', status: 'CR', protected: false },
  { name: 'ヤマトイワナ', latin: 'Salvelinus leucomaenis japonicus', type: '魚類', status: 'NT', protected: false },
  { name: 'ナガレホトケドジョウ', latin: 'Lefua sp.', type: '魚類', status: 'EN', protected: false },
  { name: 'アリアケシラウオ', latin: 'Salanx ariakensis', type: '魚類', status: 'EN', protected: false },
  { name: 'トビハゼ', latin: 'Periophthalmus modestus', type: '魚類', status: 'NT', protected: false },
  { name: 'ニホンウナギ', latin: 'Anguilla japonica', type: '魚類', status: 'EN', protected: false },

  // ── 追加：昆虫・甲殻類・貝類 ──────────────────────────────────
  { name: 'ヒヌマイトトンボ', latin: 'Mortonagrion hirosei', type: '昆虫類', status: 'EN', protected: false },
  { name: 'グンバイトンボ', latin: 'Platycnemis foliacea', type: '昆虫類', status: 'NT', protected: false },
  { name: 'マダラナニワトンボ', latin: 'Sympetrum maculatum', type: '昆虫類', status: 'EN', protected: false },
  { name: 'キイロヤマトンボ', latin: 'Macromia daimoji', type: '昆虫類', status: 'VU', protected: false },
  { name: 'コオイムシ', latin: 'Appasus japonicus', type: '昆虫類', status: 'NT', protected: false },
  { name: 'ミズスマシ', latin: 'Gyrinus japonicus', type: '昆虫類', status: 'VU', protected: false },
  { name: 'ヒメボタル', latin: 'Luciola parvula', type: '昆虫類', status: 'LC', protected: false },
  { name: 'クロシジミ', latin: 'Niphanda fusca', type: '昆虫類', status: 'EN', protected: false },
  { name: 'ゴマシジミ', latin: 'Phengaris teleius', type: '昆虫類', status: 'VU', protected: false },
  { name: 'オオウラギンヒョウモン', latin: 'Fabriciana nerippe', type: '昆虫類', status: 'CR', protected: false },
  { name: 'ヒョウモンモドキ', latin: 'Melitaea scotosia', type: '昆虫類', status: 'CR', protected: false },
  { name: 'ヤマトサンショウウオ', latin: 'Hynobius vandenburghi', type: '両生類', status: 'VU', protected: false },
  { name: 'モクズガニ', latin: 'Eriocheir japonica', type: '甲殻類', status: 'LC', protected: false },
  { name: 'ヌマエビ', latin: 'Paratya compressa', type: '甲殻類', status: 'LC', protected: false },
  { name: 'マシジミ', latin: 'Corbicula leana', type: '貝類', status: 'VU', protected: false },
  { name: 'カワシンジュガイ', latin: 'Margaritifera laevis', type: '貝類', status: 'EN', protected: false },
  { name: 'マルタニシ', latin: 'Cipangopaludina chinensis laeta', type: '貝類', status: 'NT', protected: false },

  // ── 追加：植物 ────────────────────────────────────────────────
  { name: 'ヒメザゼンソウ', latin: 'Symplocarpus nipponicus', type: '植物', status: 'NT', protected: false },
  { name: 'トキソウ', latin: 'Pogonia japonica', type: '植物', status: 'NT', protected: false },
  { name: 'サワラン', latin: 'Eleorchis japonica', type: '植物', status: 'NT', protected: false },
  { name: 'ノハナショウブ', latin: 'Iris ensata var. spontanea', type: '植物', status: 'LC', protected: false },
  { name: 'カキツバタ', latin: 'Iris laevigata', type: '植物', status: 'NT', protected: false },
  { name: 'ミツガシワ', latin: 'Menyanthes trifoliata', type: '植物', status: 'NT', protected: false },
  { name: 'ハマボウフウ', latin: 'Glehnia littoralis', type: '植物', status: 'LC', protected: false },
  { name: 'ハマウツボ', latin: 'Orobanche coerulescens', type: '植物', status: 'VU', protected: false },
  { name: 'フジバカマ', latin: 'Eupatorium japonicum', type: '植物', status: 'NT', protected: false },
  { name: 'オグラセンノウ', latin: 'Silene kiusiana', type: '植物', status: 'EN', protected: false },
  { name: 'ノジギク', latin: 'Chrysanthemum japonense', type: '植物', status: 'LC', protected: false },
  { name: 'ハナシノブ', latin: 'Polemonium kiushianum', type: '植物', status: 'CR', protected: false },
  { name: 'ヤマシャクヤク', latin: 'Paeonia japonica', type: '植物', status: 'NT', protected: false },
  { name: 'アツモリソウ', latin: 'Cypripedium macranthos', type: '植物', status: 'VU', protected: true },
  { name: 'ホテイアツモリ', latin: 'Cypripedium macranthos var. hotei-atsumorianum', type: '植物', status: 'CR', protected: true },
  { name: 'レンゲツツジ', latin: 'Rhododendron molle subsp. japonicum', type: '植物', status: 'LC', protected: false },
  { name: 'ミズバショウ', latin: 'Lysichiton camtschatcensis', type: '植物', status: 'LC', protected: false },
  { name: 'コウホネ', latin: 'Nuphar japonica', type: '植物', status: 'LC', protected: false },
  { name: 'ガシャモク', latin: 'Potamogeton lucens subsp. japonicus', type: '植物', status: 'CR', protected: false },
  { name: 'アサザ', latin: 'Nymphoides peltata', type: '植物', status: 'NT', protected: false },
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

// 部分一致の候補（サジェスト用）— 入力に近い順に上位N件を正規化して返す
export function suggestSpecies(query, limit = 5) {
  const q = (query || '').trim().toLowerCase()
  if (!q) return []
  const scored = []
  for (const r of RED_LIST) {
    const name = r.name.toLowerCase()
    const latin = r.latin.toLowerCase()
    let score = -1
    if (name === q || latin === q) score = 0
    else if (name.startsWith(q) || latin.startsWith(q)) score = 1
    else if (name.includes(q) || latin.includes(q)) score = 2
    if (score >= 0) scored.push({ r, score })
  }
  scored.sort((a, b) => a.score - b.score || a.r.name.localeCompare(b.r.name, 'ja'))
  return scored.slice(0, limit).map(({ r }) => ({
    name: r.name, latin: r.latin, type: r.type, status: normStatus(r.status), protected: !!r.protected,
  }))
}

export const RED_LIST_NAMES = RED_LIST.map((r) => r.name)
