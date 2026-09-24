import { writeFile } from "node:fs/promises";
import path from "node:path";
import { refreshSatelliteSnapshot } from "../server/satellite";

const snapshot = await refreshSatelliteSnapshot();
const bundled = { ...snapshot };
delete bundled.persisted;
await writeFile(
  path.join(process.cwd(), "server", "data", "latest-satellite.json"),
  `${JSON.stringify(bundled)}\n`,
  "utf8",
);
console.log(JSON.stringify({
  satelliteKey: snapshot.satelliteKey,
  windowEndUtc: snapshot.window.endUtc,
  representativePoints: snapshot.summary.representativePointCount,
  representativeMax24hMm: snapshot.summary.representativeMax24hMm,
  maxProvinceNameTh: snapshot.summary.maxProvinceNameTh,
  persisted: snapshot.persisted,
}, null, 2));
process.exit(0);
