import { COOKIE_NAME } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { parse as parseCookie } from "cookie";
import { z } from "zod";
import { createHeartbeatJob, updateHeartbeatJob } from "../_core/heartbeat";
import { adminProcedure, publicProcedure, router } from "../_core/trpc";
import * as db from "../db";
import {
  FORECAST_REFRESH_JOB_KEY,
  RADAR_REFRESH_JOB_KEY,
  VERIFICATION_REFRESH_JOB_KEY,
} from "../scheduled";

const JOBS = {
  [FORECAST_REFRESH_JOB_KEY]: {
    cron: "0 45 0,6,12,18 * * *",
    name: "rain-th-forecast-warning-refresh",
    description: "Refresh ECMWF forecast, NASA IMERG observations, and TMD warning at 07:45, 13:45, 19:45, and 01:45 ICT.",
  },
  [RADAR_REFRESH_JOB_KEY]: {
    cron: "0 */15 * * * *",
    name: "rain-th-radar-refresh",
    description: "Refresh official TMD national radar trends every 15 minutes.",
  },
  [VERIFICATION_REFRESH_JOB_KEY]: {
    cron: "0 30 1 * * *",
    name: "rain-th-verification-refresh",
    description: "Refresh daily ThaiWater versus ECMWF verification at 08:30 ICT after station reporting.",
  },
} as const;

type JobKey = keyof typeof JOBS;

function sessionToken(cookieHeader?: string) {
  return parseCookie(cookieHeader ?? "")[COOKIE_NAME] ?? "";
}

export const automationRouter = router({
  status: publicProcedure.query(async () => {
    const rows = await Promise.all(Object.keys(JOBS).map(jobKey => db.getAutomationJob(jobKey)));
    return {
      configured: rows.every(row => Boolean(row?.scheduleCronTaskUid)),
      deploymentRequiredBeforeActivation: true,
      jobs: (Object.keys(JOBS) as JobKey[]).map((jobKey, index) => ({
        jobKey,
        configured: Boolean(rows[index]?.scheduleCronTaskUid),
        cronExpression: rows[index]?.cronExpression ?? JOBS[jobKey].cron,
        lastStartedAtUtc: rows[index]?.lastStartedAtUtc ?? null,
        lastCompletedAtUtc: rows[index]?.lastCompletedAtUtc ?? null,
        lastStatus: rows[index]?.lastStatus ?? "idle",
        lastError: rows[index]?.lastError ?? null,
      })),
    };
  }),
  activate: adminProcedure.mutation(async ({ ctx }) => {
    const token = sessionToken(ctx.req.headers.cookie);
    const activated = [];
    for (const jobKey of Object.keys(JOBS) as JobKey[]) {
      const config = JOBS[jobKey];
      const existing = await db.ensureAutomationJob(jobKey);
      if (existing.scheduleCronTaskUid) {
        activated.push({ jobKey, taskUid: existing.scheduleCronTaskUid, cronExpression: existing.cronExpression });
        continue;
      }
      const job = await createHeartbeatJob(
        { name: config.name, cron: config.cron, path: "/api/scheduled/refresh-data", payload: {}, description: config.description },
        token,
      );
      await db.configureAutomationJob(jobKey, job.taskUid, config.cron);
      activated.push({ jobKey, taskUid: job.taskUid, cronExpression: config.cron, nextExecutionAt: job.nextExecutionAt ?? null });
    }
    return { configured: true, jobs: activated };
  }),
  setEnabled: adminProcedure
    .input(z.object({ jobKey: z.enum([FORECAST_REFRESH_JOB_KEY, RADAR_REFRESH_JOB_KEY, VERIFICATION_REFRESH_JOB_KEY]), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const job = await db.getAutomationJob(input.jobKey);
      if (!job?.scheduleCronTaskUid) throw new TRPCError({ code: "NOT_FOUND", message: "The refresh schedule has not been activated" });
      const result = await updateHeartbeatJob(job.scheduleCronTaskUid, { enable: input.enabled }, sessionToken(ctx.req.headers.cookie));
      return { configured: true, jobKey: input.jobKey, enabled: input.enabled, nextExecutionAt: result.nextExecutionAt ?? null };
    }),
});
