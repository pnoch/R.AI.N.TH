import { refreshSnapshot } from "../server/weather";

const snapshot = await refreshSnapshot();
const top = snapshot.provinces[0];
console.log(JSON.stringify({
  ok: true,
  persisted: snapshot.persisted,
  runKey: snapshot.runKey,
  modelRunUtc: snapshot.source.modelRunUtc,
  provinceCount: snapshot.provinces.length,
  topProvince: top.iso,
  topRiskScore: top.riskScore,
  officialWarningStatus: snapshot.analysis.officialWarningStatus,
  draftStatus: snapshot.draft.status,
  publishedAtUtc: snapshot.draft.publishedAtUtc,
}));
process.exit(0);
