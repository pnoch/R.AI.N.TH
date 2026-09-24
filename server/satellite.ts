import { readFile } from "node:fs/promises";
import path from "node:path";
import * as db from "./db";
import { getLocationIndex } from "./locations";

type JsonObject = Record<string, any>;
type ApiQuery = {
  queryId: string;
  dataProductId: string;
  location: { latitude: number; longitude: number };
  startTime: string;
  endTime: string;
  variables: string[];
};

const projectRoot = process.cwd();
const bundledPath = path.join(projectRoot, "server", "data", "latest-satellite.json");
export const DYNAMICAL_ANALYSES_URL = "https://api.dynamical.org/v1/analyses";
export const SATELLITE_PRODUCT_ID = "nasa-imerg-analysis-late";
export const SATELLITE_API_TIMEOUT_MS = 22_000;
export const SATELLITE_WINDOW_HOURS = 24;
export const SATELLITE_INTERVAL_SECONDS = 1_800;
export const MIN_VALID_INTERVALS = 44;
export const EXPECTED_PROVINCES = 77;
let activeRefresh: Promise<JsonObject> | null = null;

function round(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isoForProvinceCode(code: number) {
  return `TH-${String(code).padStart(2, "0")}`;
}

export function summarizePointResult(result: JsonObject) {
  const times = Array.isArray(result?.analysisTimes) ? result.analysisTimes : [];
  const rates = Array.isArray(result?.data?.precipitation_surface) ? result.data.precipitation_surface : [];
  const qualities = Array.isArray(result?.data?.precipitation_quality_index_surface)
    ? result.data.precipitation_quality_index_surface
    : [];
  const required = SATELLITE_WINDOW_HOURS * 2;
  const startIndex = Math.max(0, times.length - required);
  const windowTimes = times.slice(startIndex);
  const windowRates = rates.slice(startIndex, startIndex + windowTimes.length);
  const windowQualities = qualities.slice(startIndex, startIndex + windowTimes.length);
  const validRates = windowRates.filter(finite);
  const validQualities = windowQualities.filter(finite);
  const rain24hMm = validRates.length >= MIN_VALID_INTERVALS
    ? round(validRates.reduce((sum: number, rate: number) => sum + rate * SATELLITE_INTERVAL_SECONDS, 0), 1)
    : null;
  const lastTime = windowTimes.at(-1) ?? null;
  const firstTime = windowTimes.at(0) ?? null;
  const selected = result?.point?.selected ?? {};
  return {
    rain24hMm,
    qualityIndexMean: validQualities.length ? round(average(validQualities) ?? 0, 3) : null,
    validIntervals: validRates.length,
    expectedIntervals: required,
    windowStartUtc: firstTime,
    windowEndUtc: lastTime ? new Date(Date.parse(lastTime) + SATELLITE_INTERVAL_SECONDS * 1000).toISOString() : null,
    latestAnalysisUtc: lastTime,
    grid: {
      latitude: selected.latitude ?? null,
      longitude: selected.longitude ?? null,
      latitudeIndex: selected.grid?.latitudeIndex ?? null,
      longitudeIndex: selected.grid?.longitudeIndex ?? null,
    },
  };
}

async function fetchApiBatch(queries: ApiQuery[]) {
  const response = await fetch(DYNAMICAL_ANALYSES_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ queries }),
    signal: AbortSignal.timeout(SATELLITE_API_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 800);
    throw new Error(`IMERG point API returned HTTP ${response.status}: ${detail}`);
  }
  const payload = await response.json() as JsonObject;
  if (!Array.isArray(payload.results) || payload.results.length !== queries.length) {
    throw new Error(`IMERG point API returned ${payload.results?.length ?? 0} of ${queries.length} requested points`);
  }
  return payload.results as JsonObject[];
}

function timeWindow(now = new Date()) {
  return {
    startTime: new Date(now.getTime() - 60 * 60 * 60 * 1000).toISOString(),
    endTime: new Date(now.getTime() + 60 * 1000).toISOString(),
  };
}

function apiQuery(queryId: string, latitude: number, longitude: number, now = new Date()): ApiQuery {
  const { startTime, endTime } = timeWindow(now);
  return {
    queryId,
    dataProductId: SATELLITE_PRODUCT_ID,
    location: { latitude, longitude },
    startTime,
    endTime,
    variables: ["precipitation_surface", "precipitation_quality_index_surface"],
  };
}

export async function getProvinceRepresentativePoints() {
  const index = await getLocationIndex();
  const districts = index.districts as any[];
  return (index.provinces as any[]).map(([provinceCode, nameTh, nameEn]) => {
    const matches = districts.filter(row => row[0] === provinceCode);
    const representative = matches.find(row => String(row[3]).startsWith("Mueang ")) ?? matches[0];
    if (!representative) throw new Error(`No representative location for province ${provinceCode}`);
    return {
      iso: isoForProvinceCode(provinceCode),
      nameTh,
      nameEn,
      districtCode: representative[1],
      districtNameTh: representative[2],
      districtNameEn: representative[3],
      latitude: representative[5],
      longitude: representative[6],
    };
  });
}

export function isUsableSatelliteSnapshot(payload: JsonObject) {
  const valid = Array.isArray(payload?.provinces)
    ? payload.provinces.filter((item: JsonObject) => finite(item.rain24hMm) && item.validIntervals >= MIN_VALID_INTERVALS)
    : [];
  return (
    payload?.source?.productId === SATELLITE_PRODUCT_ID &&
    payload?.provinces?.length === EXPECTED_PROVINCES &&
    valid.length >= 70 &&
    Number.isFinite(Date.parse(payload?.window?.endUtc))
  );
}

export async function fetchSatelliteSnapshot(now = new Date()): Promise<JsonObject> {
  const points = await getProvinceRepresentativePoints();
  const queries = points.map(point => apiQuery(point.iso, point.latitude, point.longitude, now));
  const batches = Array.from({ length: Math.ceil(queries.length / 10) }, (_, index) => queries.slice(index * 10, index * 10 + 10));
  const batchResults = await Promise.all(batches.map(fetchApiBatch));
  const results = batchResults.flat();
  const resultByIso = new Map(results.map(result => [result.queryId, result]));
  const provinces = points.map(point => {
    const result = resultByIso.get(point.iso);
    if (!result) throw new Error(`IMERG result missing for ${point.iso}`);
    return { ...point, ...summarizePointResult(result) };
  });
  const valid = provinces.filter(item => finite(item.rain24hMm));
  const endTimes = valid.map(item => item.windowEndUtc).filter(Boolean).sort();
  const startTimes = valid.map(item => item.windowStartUtc).filter(Boolean).sort();
  const latestAnalyses = valid.map(item => item.latestAnalysisUtc).filter(Boolean).sort();
  const max = [...valid].sort((a, b) => (b.rain24hMm ?? -1) - (a.rain24hMm ?? -1))[0];
  const windowEndUtc = endTimes[0] ?? null;
  const snapshotId = results[0]?.snapshotId ?? null;
  const generatedAtUtc = new Date().toISOString();
  const payload = {
    schemaVersion: "1.0.0",
    satelliteKey: `imerg-late-${snapshotId ?? Date.now()}-${windowEndUtc ?? "unknown"}`.slice(0, 180),
    generatedAtUtc,
    source: {
      productId: SATELLITE_PRODUCT_ID,
      productName: "NASA GPM IMERG Late Run V07",
      distribution: "dynamical.org JSON point API",
      distributionType: "secondary cloud-optimized archive",
      originalArchives: "NASA GES DISC and PPS",
      attribution: "NASA GPM IMERG data processed by dynamical.org from NASA GES DISC and PPS archives.",
      license: "CC BY 4.0",
      resolution: "0.1° (~10 km)",
      temporalResolutionMinutes: 30,
      nominalLatencyHours: 14,
      snapshotId,
      apiUrl: DYNAMICAL_ANALYSES_URL,
      catalogUrl: "https://stac.dynamical.org/nasa-imerg-analysis-late/collection.json",
    },
    window: {
      startUtc: startTimes.at(-1) ?? null,
      endUtc: windowEndUtc,
      latestAnalysisUtc: latestAnalyses[0] ?? null,
      hours: SATELLITE_WINDOW_HOURS,
    },
    summary: {
      representativePointCount: valid.length,
      provinceCount: provinces.length,
      representativeMean24hMm: round(average(valid.map(item => item.rain24hMm as number)) ?? 0, 1),
      representativeMax24hMm: max?.rain24hMm ?? null,
      maxProvinceIso: max?.iso ?? null,
      maxProvinceNameTh: max?.nameTh ?? null,
      meanQualityIndex: round(average(valid.map(item => item.qualityIndexMean).filter(finite)) ?? 0, 3),
    },
    method: {
      description: "One official administrative district centroid per province is sampled from the nearest IMERG 0.1° cell; 48 half-hour mean rates are integrated into a 24-hour accumulation.",
      caveat: "Representative-cell values are not province averages and do not resolve streets, drainage, rivers, or flood depth.",
    },
    provinces,
  };
  if (!isUsableSatelliteSnapshot(payload)) throw new Error("IMERG snapshot failed coverage or completeness checks");
  return payload;
}

async function readBundled() {
  return JSON.parse(await readFile(bundledPath, "utf8")) as JsonObject;
}

export async function getLatestSatelliteSnapshot(): Promise<JsonObject> {
  const row = await db.getLatestSatelliteRun();
  if (row && isUsableSatelliteSnapshot(row.payload as JsonObject)) return { ...(row.payload as JsonObject), persisted: true };
  return { ...(await readBundled()), persisted: false };
}

export function refreshSatelliteSnapshot(): Promise<JsonObject> {
  if (activeRefresh) return activeRefresh;
  activeRefresh = (async () => {
    const payload = await fetchSatelliteSnapshot();
    await db.saveSatelliteRun(payload);
    return { ...payload, persisted: true };
  })().finally(() => {
    activeRefresh = null;
  });
  return activeRefresh;
}

export async function getSatellitePointObservation(input: {
  key: string;
  latitude: number;
  longitude: number;
  nameTh?: string;
  nameEn?: string;
  provinceIso?: string;
}) {
  const [result] = await fetchApiBatch([apiQuery(input.key, input.latitude, input.longitude)]);
  return {
    key: input.key,
    nameTh: input.nameTh ?? null,
    nameEn: input.nameEn ?? null,
    provinceIso: input.provinceIso ?? null,
    ...summarizePointResult(result),
    snapshotId: result.snapshotId ?? null,
    source: {
      productId: SATELLITE_PRODUCT_ID,
      attribution: "NASA GPM IMERG data processed by dynamical.org from NASA GES DISC and PPS archives.",
      resolution: "0.1° (~10 km)",
    },
  };
}
