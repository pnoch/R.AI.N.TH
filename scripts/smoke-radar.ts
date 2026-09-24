import { writeFile } from "node:fs/promises";
import path from "node:path";
import { refreshRadarSnapshot } from "../server/radar";

const snapshot = await refreshRadarSnapshot();
await writeFile(
  path.join(process.cwd(), "server", "data", "latest-radar.json"),
  `${JSON.stringify(snapshot, null, 2)}\n`,
  "utf8",
);
console.log(JSON.stringify({
  ok: true,
  radarKey: snapshot.radarKey,
  observedAtUtc: snapshot.window.endUtc,
  provinces: snapshot.provinces.length,
  rainingPoints: snapshot.summary.rainingPointCount,
  maximumRateMmH: snapshot.summary.representativeMaxRateMmH,
  rainViewerFrames: snapshot.rainViewer?.frames?.length ?? 0,
}));
process.exit(0);
