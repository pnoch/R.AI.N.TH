import { writeFile } from "node:fs/promises";
import path from "node:path";
import { refreshOfficialWarnings } from "../server/officialWarnings";

const result = await refreshOfficialWarnings();
const output = path.join(process.cwd(), "server", "data", "latest-warning.json");
await writeFile(output, JSON.stringify(result), "utf8");
console.log(JSON.stringify({
  ok: true,
  persisted: result.persisted,
  status: result.tmd.status,
  issueNo: result.tmd.issueNo ?? null,
  titleTh: result.tmd.titleTh ?? null,
  announcedAtUtc: result.tmd.announcedAtUtc ?? null,
  effectEndUtc: result.tmd.effectEndUtc ?? null,
  ddpmStatus: result.ddpm.status,
  output,
}));
process.exit(0);
