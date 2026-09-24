import { readFile } from "node:fs/promises";
import path from "node:path";
import { PNG } from "pngjs";
import * as db from "./db";
import { getProvinceRepresentativePoints } from "./satellite";

type JsonObject = Record<string, any>;

type RadarFrame = {
  timestampUtc: string;
  relativePath: string;
  sourceUrl: string;
  png: PNG;
};

export const TMD_RADAR_LIST_URL = "https://weather.tmd.go.th/composite/images_composite.list";
export const TMD_RADAR_FRAME_BASE_URL = "https://weather.tmd.go.th/composite/images/";
export const TMD_RADAR_VIEWER_URL = "https://weather.tmd.go.th/composite/index_composite.html";
export const RAINVIEWER_TIMELINE_URL = "https://api.rainviewer.com/public/weather-maps.json";
export const RADAR_FETCH_TIMEOUT_MS = 20_000;
export const RADAR_FRAME_COUNT = 5;
export const RADAR_INTERVAL_MINUTES = 15;
export const EXPECTED_PROVINCES = 77;
export const RADAR_BOUNDS = { west: 95, east: 108, north: 22.5, south: 4 } as const;

const projectRoot = process.cwd();
const bundledPath = path.join(projectRoot, "server", "data", "latest-radar.json");
let activeRefresh: Promise<JsonObject> | null = null;
let frameCache: { key: string; loadedAt: number; frames: RadarFrame[] } | null = null;

const OFFICIAL_TMD_PALETTE: Array<{ rgb: [number, number, number]; rateMmH: number }> = [
  { rgb: [47, 141, 203], rateMmH: 0.1 },
  { rgb: [47, 95, 133], rateMmH: 1 },
  { rgb: [47, 53, 236], rateMmH: 2 },
  { rgb: [47, 163, 140], rateMmH: 4 },
  { rgb: [47, 188, 104], rateMmH: 8 },
  { rgb: [47, 223, 58], rateMmH: 12 },
  { rgb: [101, 247, 55], rateMmH: 16 },
  { rgb: [143, 209, 50], rateMmH: 24 },
  { rgb: [246, 247, 48], rateMmH: 32 },
  { rgb: [246, 148, 48], rateMmH: 40 },
  { rgb: [246, 152, 247], rateMmH: 48 },
  { rgb: [245, 102, 175], rateMmH: 56 },
  { rgb: [227, 55, 55], rateMmH: 80 },
];

function round(value: number, digits = 1) {
  return Number(value.toFixed(digits));
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function isoTimestamp(raw: string) {
  const normalized = raw.trim().replace(" ", "T");
  return new Date(`${normalized}${normalized.endsWith("Z") ? "" : "Z"}`).toISOString();
}

export function parseRadarFrameList(text: string) {
  return text
    .split("\n")
    .map(line => {
      const match = line.trim().match(/^(\S+)\s+"([^"]+)"\s+overlay=(.+)$/);
      if (!match) return null;
      const overlays = match[3].split(",").map(value => value.trim());
      let radarFile = overlays.find(value => /(?:^|\/)(?:zr\/)?\d+\.png$/i.test(value));
      if (!radarFile) return null;
      if (!radarFile.includes("/")) radarFile = `zr/${radarFile}`;
      return {
        timestampUtc: isoTimestamp(match[2]),
        relativePath: radarFile,
        sourceUrl: new URL(radarFile, TMD_RADAR_FRAME_BASE_URL).toString(),
      };
    })
    .filter((frame): frame is { timestampUtc: string; relativePath: string; sourceUrl: string } => Boolean(frame));
}

export function pixelForCoordinate(latitude: number, longitude: number, width: number, height: number) {
  if (
    !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    latitude > RADAR_BOUNDS.north || latitude < RADAR_BOUNDS.south ||
    longitude < RADAR_BOUNDS.west || longitude > RADAR_BOUNDS.east
  ) return null;
  const x = Math.round(((longitude - RADAR_BOUNDS.west) / (RADAR_BOUNDS.east - RADAR_BOUNDS.west)) * (width - 1));
  const y = Math.round(((RADAR_BOUNDS.north - latitude) / (RADAR_BOUNDS.north - RADAR_BOUNDS.south)) * (height - 1));
  return { x, y };
}

export function rainRateForRgba(red: number, green: number, blue: number, alpha: number) {
  if (alpha < 16) return 0;
  let nearest = OFFICIAL_TMD_PALETTE[0];
  let distance = Number.POSITIVE_INFINITY;
  for (const item of OFFICIAL_TMD_PALETTE) {
    const candidate = (red - item.rgb[0]) ** 2 + (green - item.rgb[1]) ** 2 + (blue - item.rgb[2]) ** 2;
    if (candidate < distance) {
      distance = candidate;
      nearest = item;
    }
  }
  return distance <= 1_600 ? nearest.rateMmH : 0;
}

export function sampleRainRate(png: Pick<PNG, "width" | "height" | "data">, latitude: number, longitude: number) {
  const pixel = pixelForCoordinate(latitude, longitude, png.width, png.height);
  if (!pixel) return null;
  const offset = (pixel.y * png.width + pixel.x) * 4;
  return rainRateForRgba(png.data[offset], png.data[offset + 1], png.data[offset + 2], png.data[offset + 3]);
}

export function summarizeRates(rates: Array<number | null>) {
  const valid = rates.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const latestRateMmH = valid.at(-1) ?? null;
  const accumulationRates = valid.slice(-4);
  const oneHourAccumMm = accumulationRates.length === 4
    ? round(accumulationRates.reduce((sum, value) => sum + value * 0.25, 0), 1)
    : null;
  const previous = valid.at(-2) ?? latestRateMmH;
  const delta = latestRateMmH == null || previous == null ? null : latestRateMmH - previous;
  const trend = latestRateMmH == null
    ? "NO_DATA"
    : latestRateMmH < 0.1 && (previous ?? 0) < 0.1
      ? "DRY"
      : (delta ?? 0) >= 2
        ? "INTENSIFYING"
        : (delta ?? 0) <= -2
          ? "WEAKENING"
          : "STEADY";
  return {
    latestRateMmH,
    oneHourAccumMm,
    previousRateMmH: previous ?? null,
    trend,
    persistenceAdditionalMm: [15, 30, 45, 60].map(minutes => ({
      minutes,
      millimeters: latestRateMmH == null ? null : round(latestRateMmH * minutes / 60, 1),
    })),
  };
}

async function fetchText(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(RADAR_FETCH_TIMEOUT_MS), headers: { accept: "text/plain" } });
  if (!response.ok) throw new Error(`TMD radar manifest returned HTTP ${response.status}`);
  return response.text();
}

async function fetchPng(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(RADAR_FETCH_TIMEOUT_MS), headers: { accept: "image/png" } });
  if (!response.ok) throw new Error(`TMD radar frame returned HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 3_000_000) throw new Error("TMD radar frame exceeded the 3 MB safety limit");
  return PNG.sync.read(bytes);
}

async function getRadarFrames() {
  const manifest = await fetchText(TMD_RADAR_LIST_URL);
  const metadata = parseRadarFrameList(manifest).slice(-RADAR_FRAME_COUNT);
  if (metadata.length < RADAR_FRAME_COUNT) throw new Error(`TMD radar manifest exposed only ${metadata.length} usable frames`);
  const key = metadata.map(frame => `${frame.timestampUtc}:${frame.relativePath}`).join("|");
  if (frameCache && frameCache.key === key && Date.now() - frameCache.loadedAt < 5 * 60_000) return frameCache.frames;
  const pngs = await Promise.all(metadata.map(frame => fetchPng(frame.sourceUrl)));
  const frames = metadata.map((frame, index) => ({ ...frame, png: pngs[index] }));
  frameCache = { key, loadedAt: Date.now(), frames };
  return frames;
}

export async function fetchRainViewerTimeline() {
  const response = await fetch(RAINVIEWER_TIMELINE_URL, {
    signal: AbortSignal.timeout(10_000),
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error(`RainViewer timeline returned HTTP ${response.status}`);
  const payload = await response.json() as JsonObject;
  const frames = Array.isArray(payload?.radar?.past)
    ? payload.radar.past.slice(-13).map((frame: JsonObject) => ({ timeUtc: new Date(frame.time * 1000).toISOString(), path: frame.path }))
    : [];
  if (!payload.host || !frames.length) throw new Error("RainViewer timeline did not contain radar frames");
  return {
    generatedAtUtc: new Date(payload.generated * 1000).toISOString(),
    frames,
    hostedMapUrl: "https://www.rainviewer.com/map.html",
    visualMode: "HOSTED_EMBED",
    attribution: "Hosted radar animation: RainViewer; Thailand source attribution includes the Thai Meteorological Department.",
    caveat: "Hosted visual mosaic only. Numeric rain-rate calculations use the separate official TMD composite frames.",
  };
}

function sampleFrames(frames: RadarFrame[], latitude: number, longitude: number) {
  const observations = frames.map(frame => ({
    timeUtc: frame.timestampUtc,
    rateMmH: sampleRainRate(frame.png, latitude, longitude),
  }));
  return { observations, ...summarizeRates(observations.map(item => item.rateMmH)) };
}

export function isUsableRadarSnapshot(payload: JsonObject) {
  return (
    payload?.source?.provider === "Thai Meteorological Department" &&
    payload?.source?.product === "National PCAPPI Z-R composite" &&
    payload?.frames?.length >= RADAR_FRAME_COUNT &&
    payload?.provinces?.length === EXPECTED_PROVINCES &&
    payload.provinces.every((item: JsonObject) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)) &&
    Number.isFinite(Date.parse(payload?.window?.endUtc))
  );
}

export async function fetchRadarSnapshot(): Promise<JsonObject> {
  const [frames, points, rainViewerResult] = await Promise.all([
    getRadarFrames(),
    getProvinceRepresentativePoints(),
    fetchRainViewerTimeline().then(value => ({ status: "fulfilled" as const, value })).catch(error => ({ status: "rejected" as const, reason: error })),
  ]);
  const provinces = points.map(point => ({ ...point, ...sampleFrames(frames, point.latitude, point.longitude) }));
  const valid = provinces.filter(item => item.latestRateMmH != null);
  const maximum = [...valid].sort((a, b) => (b.latestRateMmH ?? -1) - (a.latestRateMmH ?? -1))[0];
  const observedAtUtc = frames.at(-1)!.timestampUtc;
  const generatedAtUtc = new Date().toISOString();
  const payload = {
    schemaVersion: "1.0.0",
    radarKey: `tmd-radar-${observedAtUtc}`,
    generatedAtUtc,
    source: {
      provider: "Thai Meteorological Department",
      product: "National PCAPPI Z-R composite",
      viewerUrl: TMD_RADAR_VIEWER_URL,
      frameListUrl: TMD_RADAR_LIST_URL,
      spatialBounds: RADAR_BOUNDS,
      imageSize: { width: frames[0].png.width, height: frames[0].png.height },
      temporalResolutionMinutes: RADAR_INTERVAL_MINUTES,
      measurementAltitudeKm: 2,
      conversion: "Marshall-Palmer Z = 200 R^1.6",
      palette: "Official discrete TMD mm/h classes; values report class lower bounds.",
    },
    window: {
      startUtc: frames[0].timestampUtc,
      endUtc: observedAtUtc,
      minutes: (frames.length - 1) * RADAR_INTERVAL_MINUTES,
    },
    frames: frames.map(frame => ({ timestampUtc: frame.timestampUtc, relativePath: frame.relativePath })),
    summary: {
      provincePointCount: provinces.length,
      rainingPointCount: valid.filter(item => (item.latestRateMmH ?? 0) >= 0.1).length,
      intensifyingPointCount: valid.filter(item => item.trend === "INTENSIFYING").length,
      representativeMeanRateMmH: round(average(valid.map(item => item.latestRateMmH as number)), 1),
      representativeMaxRateMmH: maximum?.latestRateMmH ?? null,
      maxProvinceIso: maximum?.iso ?? null,
      maxProvinceNameTh: maximum?.nameTh ?? null,
    },
    method: {
      description: "Five official 15-minute TMD composite PNG frames are sampled at one administrative centroid per province. The latest official rain-rate class and an indicative one-hour accumulation are reported.",
      nowcast: "The 15–60 minute values are a persistence baseline: current class rain rate multiplied by elapsed time. They are not motion-vector or numerical forecasts.",
      caveat: "Radar classes can be affected by beam blockage, ground clutter, range, attenuation, and gaps. Centroid samples do not resolve every street or drainage path.",
    },
    rainViewer: rainViewerResult.status === "fulfilled"
      ? rainViewerResult.value
      : { available: false, error: String(rainViewerResult.reason instanceof Error ? rainViewerResult.reason.message : rainViewerResult.reason).slice(0, 500) },
    provinces,
  };
  if (!isUsableRadarSnapshot(payload)) throw new Error("TMD radar snapshot failed coverage or completeness checks");
  return payload;
}

async function readBundled() {
  return JSON.parse(await readFile(bundledPath, "utf8")) as JsonObject;
}

export async function getLatestRadarSnapshot() {
  const row = await db.getLatestRadarRun();
  if (row && isUsableRadarSnapshot(row.payload as JsonObject)) return { ...(row.payload as JsonObject), persisted: true };
  return { ...(await readBundled()), persisted: false };
}

export function refreshRadarSnapshot(): Promise<JsonObject> {
  if (activeRefresh) return activeRefresh;
  activeRefresh = (async () => {
    const payload = await fetchRadarSnapshot();
    await db.saveRadarRun(payload);
    return { ...payload, persisted: true };
  })().finally(() => {
    activeRefresh = null;
  });
  return activeRefresh;
}

export async function getRadarPointObservation(input: {
  key: string;
  latitude: number;
  longitude: number;
  nameTh?: string;
  nameEn?: string;
  provinceIso?: string;
}) {
  const frames = await getRadarFrames();
  return {
    key: input.key,
    nameTh: input.nameTh ?? null,
    nameEn: input.nameEn ?? null,
    provinceIso: input.provinceIso ?? null,
    latitude: input.latitude,
    longitude: input.longitude,
    window: { startUtc: frames[0].timestampUtc, endUtc: frames.at(-1)!.timestampUtc },
    ...sampleFrames(frames, input.latitude, input.longitude),
    source: {
      provider: "Thai Meteorological Department",
      product: "National PCAPPI Z-R composite",
      temporalResolutionMinutes: RADAR_INTERVAL_MINUTES,
    },
  };
}
