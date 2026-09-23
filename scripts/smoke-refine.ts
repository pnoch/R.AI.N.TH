import { refineThaiDraft } from "../server/weather";

const snapshot = await refineThaiDraft();
console.log(JSON.stringify({
  ok: true,
  runKey: snapshot.runKey,
  generatedBy: snapshot.draft.generatedBy,
  status: snapshot.draft.status,
  hasOfficialWarningDisclaimer: snapshot.draft.textTh.includes("ไม่ใช่ประกาศเตือนภัยอย่างเป็นทางการ"),
  publishedAtUtc: snapshot.draft.publishedAtUtc,
  characters: snapshot.draft.textTh.length,
}));
process.exit(0);
