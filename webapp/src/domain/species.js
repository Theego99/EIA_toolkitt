import catalog from "../data/species-catalog.json" with { type: "json" };
export const CATALOG = catalog;
export const CATEGORY_NAMES = {
  EX: "絶滅",
  EW: "野生絶滅",
  "CR+EN": "絶滅危惧I類",
  CR: "絶滅危惧IA類",
  EN: "絶滅危惧IB類",
  VU: "絶滅危惧II類",
  NT: "準絶滅危惧",
  DD: "情報不足",
  LP: "絶滅のおそれのある地域個体群",
  LC: "低懸念",
  NA: "対象外",
  NE: "未評価",
  UNASSESSED: "収録リストに一致なし",
};
export const normalizeName = (s) =>
  String(s || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u3041-\u3096]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) + 0x60),
    )
    .replace(/[\s・･]/g, "");
const indexed = catalog.entries.map((e) => ({
  ...e,
  searchName: normalizeName(e.name),
  searchLatin: normalizeName(e.latin),
}));
function distance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++)
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    prev = curr;
  }
  return prev[b.length];
}
export function suggestSpecies(query) {
  const q = normalizeName(query);
  if (!q) return [];
  return indexed
    .map((e) => {
      const score = Math.max(
        ...[e.searchName, e.searchLatin].map((n) =>
          n === q
            ? 1000
            : n.startsWith(q)
              ? 800 - q.length / 100
              : n.includes(q)
                ? 600
                : q.length >= 3
                  ? 200 -
                    distance(
                      q,
                      n.slice(
                        0,
                        Math.max(q.length, Math.min(n.length, q.length + 1)),
                      ),
                    ) *
                      45
                  : -100,
        ),
      );
      return { e, score };
    })
    .filter((x) => x.score > 60)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.e.year - a.e.year ||
        a.e.name.localeCompare(b.e.name, "ja"),
    )
    .slice(0, 5)
    .map((x) => x.e);
}
