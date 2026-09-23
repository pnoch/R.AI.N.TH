import { readFile, writeFile } from "node:fs/promises";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error("Usage: node scripts/build-location-index.mjs <districts.json> <output.json>");
}

const source = JSON.parse(await readFile(inputPath, "utf8"));
if (!Array.isArray(source) || source.length !== 928) {
  throw new Error(`Expected 928 districts, received ${Array.isArray(source) ? source.length : "invalid data"}`);
}

const compact = source.map(row => [
  Number(row.provinceCode),
  Number(row.districtCode),
  String(row.districtNameTh),
  String(row.districtNameEn),
  Number(row.postalCode),
]);

await writeFile(outputPath, `${JSON.stringify(compact)}\n`, "utf8");
console.log(JSON.stringify({ ok: true, districts: compact.length, outputPath }));
