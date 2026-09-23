import { readFile } from "node:fs/promises";
import path from "node:path";

const dataRoot = path.join(process.cwd(), "server", "data");
const indexPath = path.join(dataRoot, "location-index.json");
const boundaryPath = path.join(dataRoot, "district-boundaries.json");

let locationIndex: Record<string, any> | null = null;
let boundaryCatalog: Record<string, any> | null = null;

export async function getLocationIndex() {
  if (!locationIndex) {
    locationIndex = JSON.parse(await readFile(indexPath, "utf8")) as Record<string, any>;
  }
  return locationIndex;
}

export async function getDistrictBoundaries(provinceIso: string) {
  if (!boundaryCatalog) {
    boundaryCatalog = JSON.parse(await readFile(boundaryPath, "utf8")) as Record<string, any>;
  }
  const payload = boundaryCatalog.provinces?.[provinceIso];
  if (!payload) throw new Error(`District boundaries are unavailable for ${provinceIso}`);
  return { ...payload, source: boundaryCatalog.source };
}
