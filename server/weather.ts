import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { invokeLLM, listLLMModels } from "./_core/llm";
import * as db from "./db";

type JsonObject = Record<string, any>;

const projectRoot = process.cwd();
const bundledSnapshotPath = path.join(projectRoot, "server", "data", "latest-snapshot.json");
const boundaryPath = path.join(projectRoot, "pipeline", "data", "thailand-adm1.geojson");
const pipelinePath = path.join(projectRoot, "pipeline", "ecmwf_pipeline.py");
export const WEATHER_PIPELINE_SOURCE = process.env.ECMWF_SOURCE || "google";
export const WEATHER_PIPELINE_TIMEOUT_MS = 23_000;
let activeRefresh: Promise<JsonObject> | null = null;

async function readBundledSnapshot(): Promise<JsonObject> {
  const content = await readFile(bundledSnapshotPath, "utf8");
  return JSON.parse(content) as JsonObject;
}

function withApproval(payload: JsonObject, row?: any): JsonObject {
  const approvedAtUtc = row?.approvedAtUtc ? new Date(row.approvedAtUtc).toISOString() : null;
  return {
    ...payload,
    persisted: Boolean(row),
    draft: {
      ...payload.draft,
      status: row?.draftStatus === "approved" ? "APPROVED" : "DRAFT",
      approvedAtUtc,
      publishedAtUtc: null,
    },
  };
}

export async function getLatestSnapshot(): Promise<JsonObject> {
  const latest = await db.getLatestWeatherRun();
  if (latest) return withApproval(latest.payload as JsonObject, latest);
  return withApproval(await readBundledSnapshot());
}

function executePipeline(): Promise<JsonObject> {
  return new Promise((resolve, reject) => {
    const python = process.env.PYTHON_BIN || "python3";
    const outputPath = path.join("/tmp", `rain-th-${Date.now()}.json`);
    const child = spawn(
      python,
      [
        pipelinePath,
        "--boundaries",
        boundaryPath,
        "--output",
        outputPath,
        "--source",
        WEATHER_PIPELINE_SOURCE,
      ],
      { cwd: projectRoot, env: process.env },
    );
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGKILL"), WEATHER_PIPELINE_TIMEOUT_MS);

    child.stdout.on("data", chunk => {
      stdout += String(chunk);
    });
    child.stderr.on("data", chunk => {
      stderr += String(chunk);
    });
    child.on("error", error => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", async code => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`ECMWF processor exited ${code}: ${stderr.slice(-1200)}`));
        return;
      }
      try {
        const payload = JSON.parse(await readFile(outputPath, "utf8")) as JsonObject;
        resolve(payload);
      } catch (error) {
        reject(new Error(`ECMWF processor output was invalid: ${String(error)}; ${stdout.slice(-500)}`));
      }
    });
  });
}

export function refreshSnapshot(): Promise<JsonObject> {
  if (activeRefresh) return activeRefresh;
  activeRefresh = (async () => {
    const payload = await executePipeline();
    const row = await db.saveWeatherRun(payload);
    return withApproval(payload, row);
  })().finally(() => {
    activeRefresh = null;
  });
  return activeRefresh;
}

export async function refineThaiDraft(): Promise<JsonObject> {
  const current = await getLatestSnapshot();
  const { data: models } = await listLLMModels();
  if (!models.some(model => model.id === "gpt-5-mini")) {
    throw new Error("gpt-5-mini is not currently available");
  }

  const top = current.provinces.slice(0, 8).map((province: JsonObject) => ({
    province: province.nameTh,
    riskScore: province.riskScore,
    riskLevel: province.riskLevel,
    mean24hMm: province.rainMm["24hMean"],
    max24hMm: province.rainMm["24hMax"],
    mean72hMm: province.rainMm["72hMean"],
    confidence: province.confidence,
  }));
  const response = await invokeLLM({
    model: "gpt-5-mini",
    messages: [
      {
        role: "system",
        content:
          "คุณเป็นบรรณาธิการข้อมูลสภาพอากาศภาษาไทย เขียนกระชับ ชัดเจน ไม่สร้างข้อมูลใหม่ ไม่ใช้ถ้อยคำสร้างความตื่นตระหนก ห้ามเรียกผลวิเคราะห์ว่าเป็นประกาศเตือนภัย และต้องแยกข้อเท็จจริงจากข้อจำกัดอย่างชัดเจน",
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "ร่างโพสต์สำหรับตรวจทานโดยมนุษย์จากข้อมูลที่ให้เท่านั้น",
          source: current.source,
          analysisType: current.analysis.type,
          officialWarningStatus: current.analysis.officialWarningStatus,
          limitations: current.analysis.limitations,
          topProvinces: top,
          mandatoryDisclaimer:
            "นี่คือ OUR RISK ANALYSIS จากแบบจำลอง ECMWF เพียงแบบจำลองเดียว ไม่ใช่ประกาศเตือนภัยอย่างเป็นทางการ",
        }),
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "thai_weather_draft",
        strict: true,
        schema: {
          type: "object",
          properties: {
            headline: { type: "string" },
            body: { type: "string" },
            action: { type: "string" },
            disclaimer: { type: "string" },
          },
          required: ["headline", "body", "action", "disclaimer"],
          additionalProperties: false,
        },
      },
    },
  });
  if (!Array.isArray((response as any).choices) || !(response as any).choices[0]) {
    throw new Error(`The language model returned an invalid response: ${JSON.stringify(response).slice(0, 500)}`);
  }
  const content = response.choices[0]?.message?.content;
  if (!content || typeof content !== "string") throw new Error("The language model returned no draft");
  const generated = JSON.parse(content) as {
    headline: string;
    body: string;
    action: string;
    disclaimer: string;
  };
  const requiredDisclaimer =
    "นี่คือ OUR RISK ANALYSIS จากแบบจำลอง ECMWF เพียงแบบจำลองเดียว ไม่ใช่ประกาศเตือนภัยอย่างเป็นทางการ";
  const disclaimer = generated.disclaimer.includes("ไม่ใช่ประกาศเตือนภัยอย่างเป็นทางการ")
    ? generated.disclaimer
    : requiredDisclaimer;
  const textTh = [generated.headline, generated.body, generated.action, disclaimer].join("\n\n");
  const updated: JsonObject = {
    ...current,
    draft: {
      ...current.draft,
      status: "DRAFT",
      generatedBy: "gpt-5-mini",
      textTh,
      approvedAtUtc: null,
      publishedAtUtc: null,
    },
  };
  const existing = await db.getLatestWeatherRun();
  if (existing?.runKey === updated.runKey) {
    await db.replaceWeatherPayload(updated.runKey, updated);
  } else {
    await db.saveWeatherRun(updated);
  }
  return updated;
}

export async function approveDraft(runKey: string, userId: number) {
  const latest = await db.getLatestWeatherRun();
  if (!latest || latest.runKey !== runKey) {
    throw new Error("Only the latest persisted weather run can be approved");
  }
  return db.approveWeatherRun(runKey, userId);
}
