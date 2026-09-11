import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

export function parseCSV(text) {
  const rows = [],
    row = [];
  let cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\r" || c === "\n") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push([...row]);
      row.length = 0;
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("Unterminated quoted CSV field");
  if (cell || row.length) {
    row.push(cell);
    rows.push([...row]);
  }
  return rows;
}
const GROUPS = {
  kinrui: "菌類",
  chiirui: "地衣類",
  sorui: "藻類",
  ikansoku: "維管束植物",
  sentairui: "蘚苔類",
  amphibian: "両生類",
  reptiles: "爬虫類",
  birds: "鳥類",
  honyurui: "哺乳類",
};
export function importCSV(bytes, filename) {
  let text,
    encoding = "utf-8";
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    encoding = "shift_jis";
    text = new TextDecoder("shift_jis", { fatal: true }).decode(bytes);
  }
  const rows = parseCSV(text.replace(/^\uFEFF/, "")),
    h = rows.findIndex((r) => r.includes("和名") && r.includes("学名"));
  if (h < 0) throw new Error(`Missing header: ${filename}`);
  const header = rows[h],
    ni = header.indexOf("和名"),
    li = header.indexOf("学名"),
    ci =
      header.findIndex((x) => x === "カテゴリーENG") >= 0
        ? header.indexOf("カテゴリーENG")
        : header.indexOf("カテゴリー");
  if (ci < 0) throw new Error(`Missing category: ${filename}`);
  const year = filename.match(/\d{4}/)?.[0],
    group = GROUPS[filename.replace(/redlist\d{4}_|\.csv/g, "")];
  if (!year || !group) throw new Error(`Unrecognized source: ${filename}`);
  const entries = [];
  for (let index = h + 1; index < rows.length; index++) {
    const row = rows[index],
      name = row[ni]?.trim(),
      latin = row[li]?.trim(),
      category = row[ci]?.trim();
    if (!row.some((v) => v.trim())) continue;
    const status = category?.normalize('NFKC')
      ?.match(/(?:CR\s*\+\s*EN|EX|EW|CR|EN|VU|NT|DD|LP|LC|NA|NE)/i)?.[0]
      .replace(/\s/g, "")
      .toUpperCase();
    if (!name || !status)
      throw new Error(
        `Invalid record ${filename}:${index + 1} ${name} ${category}`,
      );
    entries.push({
      id: `${filename}:${index + 1}`,
      name,
      latin: latin || "",
      type: group,
      status,
      rawCategory: category,
      year: Number(year),
      source: filename,
      row: index + 1,
    });
  }
  return {
    entries,
    source: {
      filename,
      year: Number(year),
      type: group,
      encoding,
      count: entries.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = path.resolve(fileURLToPath(new URL("..", import.meta.url))),
    sourceDir = process.argv[2] || path.join(root, "data/redlist");
  const files = (await fs.readdir(sourceDir))
    .filter((f) => /^redlist\d{4}_.*\.csv$/.test(f))
    .sort();
  if (!files.length) throw new Error("No red list CSVs found");
  const all = [],
    sources = [];
  await fs.mkdir(path.join(root, "data/redlist"), { recursive: true });
  for (const filename of files) {
    if (!Object.keys(GROUPS).some((g) => filename.endsWith(`_${g}.csv`)))
      continue;
    const bytes = await fs.readFile(path.join(sourceDir, filename)),
      { entries, source } = importCSV(bytes, filename);
    all.push(...entries);
    sources.push(source);
    if (path.resolve(sourceDir) !== path.join(root, "data/redlist"))
      await fs.writeFile(path.join(root, "data/redlist", filename), bytes);
  }
  await fs.writeFile(
    path.join(root, "src/data/species-catalog.json"),
    JSON.stringify({ sources, entries: all }),
  );
  console.log(JSON.stringify({ total: all.length, sources }, null, 2));
}
