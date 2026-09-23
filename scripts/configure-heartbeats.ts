import { configureAutomationJob } from "../server/db";
import { FORECAST_REFRESH_JOB_KEY, VERIFICATION_REFRESH_JOB_KEY } from "../server/scheduled";

const [forecastTaskUid, verificationTaskUid] = process.argv.slice(2);
if (!forecastTaskUid || !verificationTaskUid) {
  throw new Error("Usage: tsx scripts/configure-heartbeats.ts <forecast-task-uid> <verification-task-uid>");
}

await configureAutomationJob(
  FORECAST_REFRESH_JOB_KEY,
  forecastTaskUid,
  "0 45 0,6,12,18 * * *",
);
await configureAutomationJob(
  VERIFICATION_REFRESH_JOB_KEY,
  verificationTaskUid,
  "0 30 1 * * *",
);

console.log(JSON.stringify({
  ok: true,
  forecast: { jobKey: FORECAST_REFRESH_JOB_KEY, taskUid: forecastTaskUid },
  verification: { jobKey: VERIFICATION_REFRESH_JOB_KEY, taskUid: verificationTaskUid },
}));
process.exit(0);
