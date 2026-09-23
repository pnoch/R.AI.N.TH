import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import * as db from "./db";

type JsonObject = Record<string, any>;

const projectRoot = process.cwd();
const bundledPath = path.join(projectRoot, "server", "data", "latest-verification.json");
const boundaryPath = path.join(projectRoot, "pipeline", "data", "thailand-adm1.geojson");
const pipelinePath = path.join(projectRoot, "pipeline", "verification_pipeline.py");
export const VERIFICATION_PIPELINE_SOURCE = process.env.ECMWF_SOURCE || "google";
export const VERIFICATION_PIPELINE_TIMEOUT_MS = 23_000;
export const MIN_VERIFICATION_STATIONS = 1_000;
export const MIN_PAIRED_PROVINCES = 50;
let activeVerification: Promise<JsonObject> | null = null;

async function readBundled(): Promise<JsonObject> {
  return JSON.parse(await readFile(bundledPath, "utf8")) as JsonObject;
}

export function isUsableVerification(payload: JsonObject) {
  return (
    payload?.provinces?.length === 77 &&
    Number(payload?.summary?.stationCount) >= MIN_VERIFICATION_STATIONS &&
    Number(payload?.summary?.pairedProvinceCount) >= MIN_PAIRED_PROVINCES &&
    Number.isFinite(Number(payload?.summary?.meanAbsoluteErrorMm)) &&
    Number.isFinite(Number(payload?.summary?.within10mmRate))
  );
}

export async function getLatestVerification(): Promise<JsonObject> {
  const history = await db.getVerificationHistory(90);
  const latest = history.find(row => isUsableVerification(row.payload as JsonObject));
  if (latest) return { ...(latest.payload as JsonObject), persisted: true };
  return { ...(await readBundled()), persisted: false };
}

export async function getUsableVerificationHistory(limit = 30): Promise<JsonObject[]> {
  const rows = await db.getVerificationHistory(90);
  const usable = rows
    .map(row => row.payload as JsonObject)
    .filter(isUsableVerification)
    .slice(0, Math.min(Math.max(limit, 1), 90));
  if (usable.length) return usable;
  const fallback = await readBundled();
  return isUsableVerification(fallback) ? [fallback] : [];
}

function executeVerification(): Promise<JsonObject> {
  return new Promise((resolve, reject) => {
    const python = process.env.PYTHON_BIN || "python3";
    const outputPath = path.join("/tmp", `verification-th-${Date.now()}.json`);
    const child = spawn(
      python,
      [
        pipelinePath,
        "--boundaries",
        boundaryPath,
        "--output",
        outputPath,
        "--source",
        VERIFICATION_PIPELINE_SOURCE,
      ],
      { cwd: projectRoot, env: process.env },
    );
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGKILL"), VERIFICATION_PIPELINE_TIMEOUT_MS);
    child.stdout.on("data", chunk => (stdout += String(chunk)));
    child.stderr.on("data", chunk => (stderr += String(chunk)));
    child.on("error", error => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", async code => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Verification processor exited ${code}: ${stderr.slice(-1200)}`));
        return;
      }
      try {
        resolve(JSON.parse(await readFile(outputPath, "utf8")) as JsonObject);
      } catch (error) {
        reject(new Error(`Verification output was invalid: ${String(error)}; ${stdout.slice(-500)}`));
      }
    });
  });
}

export function refreshVerification(): Promise<JsonObject> {
  if (activeVerification) return activeVerification;
  activeVerification = (async () => {
    const payload = await executeVerification();
    if (!isUsableVerification(payload)) {
      throw new Error(
        `Verification coverage incomplete: ${payload?.summary?.stationCount ?? 0} stations across ${payload?.summary?.pairedProvinceCount ?? 0} paired provinces`,
      );
    }
    await db.saveVerificationRun(payload);
    return { ...payload, persisted: true };
  })().finally(() => {
    activeVerification = null;
  });
  return activeVerification;
}
