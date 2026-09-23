import type { Request, Response } from "express";
import { HttpError } from "@shared/_core/errors";
import * as db from "./db";
import { refreshOfficialWarnings } from "./officialWarnings";
import { refreshVerification } from "./verification";
import { refreshSnapshot } from "./weather";
import { sdk } from "./_core/sdk";

export const FORECAST_REFRESH_JOB_KEY = "forecast-warning-refresh";
export const VERIFICATION_REFRESH_JOB_KEY = "verification-refresh";

async function runTracked(jobKey: string, work: () => Promise<Record<string, any>>) {
  const startedAtUtc = Date.now();
  await db.updateAutomationRun(jobKey, { lastStartedAtUtc: startedAtUtc, lastStatus: "running", lastError: null });
  try {
    const result = await work();
    const completedAtUtc = Date.now();
    await db.updateAutomationRun(jobKey, { lastCompletedAtUtc: completedAtUtc, lastStatus: "success", lastError: null });
    return { ok: true, jobKey, startedAtUtc, completedAtUtc, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.updateAutomationRun(jobKey, {
      lastCompletedAtUtc: Date.now(),
      lastStatus: "failed",
      lastError: message.slice(0, 4000),
    });
    throw error;
  }
}

export function runForecastWarningRefresh() {
  return runTracked(FORECAST_REFRESH_JOB_KEY, async () => {
    const [weather, warnings] = await Promise.all([refreshSnapshot(), refreshOfficialWarnings()]);
    return {
      weatherRunKey: weather.runKey,
      warningIssueNo: warnings.tmd.issueNo ?? null,
      warningStatus: warnings.tmd.status,
    };
  });
}

export function runVerificationRefresh() {
  return runTracked(VERIFICATION_REFRESH_JOB_KEY, async () => {
    const verification = await refreshVerification();
    return { verificationKey: verification.verificationKey };
  });
}

export async function scheduledDataRefreshHandler(req: Request, res: Response) {
  let taskUid: string | null = null;
  try {
    const user = await sdk.authenticateRequest(req);
    taskUid = user.taskUid ?? null;
    if (!user.isCron || !taskUid) return res.status(403).json({ error: "cron-only" });
    const job = await db.getAutomationJobByTaskUid(taskUid);
    if (!job) return res.json({ ok: true, skipped: "orphan" });
    if (job.jobKey === FORECAST_REFRESH_JOB_KEY) return res.json(await runForecastWarningRefresh());
    if (job.jobKey === VERIFICATION_REFRESH_JOB_KEY) return res.json(await runVerificationRefresh());
    return res.json({ ok: true, skipped: "unknown-job" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof HttpError && error.statusCode < 500) {
      return res.status(error.statusCode).json({ error: message });
    }
    return res.status(500).json({
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
      context: { url: req.originalUrl, taskUid },
      timestamp: new Date().toISOString(),
    });
  }
}
