import { readFile } from "node:fs/promises";
import path from "node:path";
import { XMLParser } from "fast-xml-parser";
import * as db from "./db";

type JsonObject = Record<string, any>;

export const TMD_WARNING_API = "https://data.tmd.go.th/api/WeatherWarningNews/v2/?uid=demo&ukey=demokey";
export const TMD_WARNING_TIMEOUT_MS = 8_000;
const bundledPath = path.join(process.cwd(), "server", "data", "latest-warning.json");
let activeRefresh: Promise<JsonObject> | null = null;

function localThaiTimestamp(value?: string): number | null {
  if (!value) return null;
  const parsed = Date.parse(`${value.trim().replace(" ", "T")}+07:00`);
  return Number.isFinite(parsed) ? parsed : null;
}

function decodeXmlText(value: unknown): string {
  return String(value ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWarning(raw: JsonObject, checkedAtUtc: number): JsonObject {
  const titleTh = decodeXmlText(raw.TitleThai);
  const bulletin = titleTh.match(/\((\d+\/\d+)\)/)?.[1] ?? null;
  const announcedAtUtc = localThaiTimestamp(raw.AnnounceDate);
  const effectStartUtc = localThaiTimestamp(raw.EffectStartDate);
  const effectEndUtc = localThaiTimestamp(raw.EffectEndDate);
  return {
    source: "TMD",
    externalKey: `TMD-${bulletin ?? raw.IssueNo ?? "unknown"}-${announcedAtUtc ?? checkedAtUtc}`,
    issueNo: bulletin ?? String(raw.IssueNo ?? ""),
    titleTh: titleTh || "ประกาศเตือนภัยจากกรมอุตุนิยมวิทยา",
    headlineTh: decodeXmlText(raw.HeadlineThai) || null,
    descriptionTh: decodeXmlText(raw.DescriptionThai) || null,
    titleEn: decodeXmlText(raw.TitleEnglish) || null,
    effectStartUtc,
    effectEndUtc,
    announcedAtUtc,
    sourceUrl: decodeXmlText(raw.WebUrlThai ?? raw.WebUrlEnglish ?? "https://www.tmd.go.th/warning-and-events/warning-storm"),
    retrievedAtUtc: checkedAtUtc,
    contact: decodeXmlText(raw.ContactThai ?? raw.ContactEnglish ?? "TMD 1182"),
    payload: raw,
  };
}

export async function fetchOfficialWarning(): Promise<JsonObject> {
  const response = await fetch(TMD_WARNING_API, {
    headers: { accept: "application/xml", "user-agent": "RAIN-TH-Intelligence/0.3" },
    signal: AbortSignal.timeout(TMD_WARNING_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`TMD warning API returned HTTP ${response.status}`);
  const xml = await response.text();
  const parsed = new XMLParser({ ignoreAttributes: false, parseTagValue: false, trimValues: true }).parse(xml) as JsonObject;
  const root = parsed.WeatherForecastDaily ?? parsed.WeatherWarningNews ?? parsed;
  let warning = root.Warning ?? root.Warnings?.Warning;
  if (Array.isArray(warning)) warning = warning[0];
  if (!warning || typeof warning !== "object") {
    return {
      schemaVersion: "0.3.0",
      checkedAtUtc: Date.now(),
      tmd: {
        provider: "Thai Meteorological Department",
        status: "NO_CURRENT_WARNING",
        sourceUrl: TMD_WARNING_API,
      },
      ddpm: {
        provider: "Department of Disaster Prevention and Mitigation",
        status: "NO_PUBLIC_MACHINE_FEED",
        note: "No authoritative public machine-readable DDPM warning feed was found; no unofficial source is substituted.",
      },
    };
  }
  const checkedAtUtc = Date.now();
  const normalized = normalizeWarning(warning, checkedAtUtc);
  await db.upsertOfficialWarning(normalized);
  return warningState(normalized, checkedAtUtc, true);
}

function warningState(warning: JsonObject, checkedAtUtc: number, persisted: boolean): JsonObject {
  const active = !warning.effectEndUtc || checkedAtUtc <= warning.effectEndUtc;
  return {
    schemaVersion: "0.3.0",
    checkedAtUtc,
    persisted,
    tmd: {
      provider: "Thai Meteorological Department",
      status: active ? "ACTIVE" : "EXPIRED",
      ...warning,
    },
    ddpm: {
      provider: "Department of Disaster Prevention and Mitigation",
      status: "NO_PUBLIC_MACHINE_FEED",
      note: "No authoritative public machine-readable DDPM warning feed was found; no unofficial source is substituted.",
    },
  };
}

async function readBundled(): Promise<JsonObject> {
  return JSON.parse(await readFile(bundledPath, "utf8")) as JsonObject;
}

export async function getLatestOfficialWarningState(): Promise<JsonObject> {
  const latest = await db.getLatestOfficialWarning();
  if (latest) {
    return warningState(latest.payload as JsonObject, Date.now(), true);
  }
  const bundled = await readBundled();
  if (bundled.tmd?.effectEndUtc) {
    const checkedAtUtc = Date.now();
    return {
      ...bundled,
      checkedAtUtc,
      persisted: false,
      tmd: {
        ...bundled.tmd,
        status: checkedAtUtc <= bundled.tmd.effectEndUtc ? "ACTIVE" : "EXPIRED",
      },
    };
  }
  return { ...bundled, checkedAtUtc: Date.now(), persisted: false };
}

export function refreshOfficialWarnings(): Promise<JsonObject> {
  if (activeRefresh) return activeRefresh;
  activeRefresh = fetchOfficialWarning().finally(() => {
    activeRefresh = null;
  });
  return activeRefresh;
}
