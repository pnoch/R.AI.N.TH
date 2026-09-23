import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  automationJobs,
  InsertUser,
  officialWarnings,
  users,
  verificationRuns,
  weatherRuns,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getLatestWeatherRun() {
  const db = await getDb();
  if (!db) return undefined;

  const rows = await db
    .select()
    .from(weatherRuns)
    .orderBy(desc(weatherRuns.modelRunUtc), desc(weatherRuns.generatedAtUtc))
    .limit(1);
  return rows[0];
}

export async function saveWeatherRun(payload: Record<string, any>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const modelRunUtc = Date.parse(payload.source.modelRunUtc);
  const generatedAtUtc = Date.parse(payload.generatedAtUtc);
  await db
    .insert(weatherRuns)
    .values({
      runKey: payload.runKey,
      modelRunUtc,
      generatedAtUtc,
      payload,
      draftStatus: "draft",
    })
    .onDuplicateKeyUpdate({
      set: {
        generatedAtUtc,
        payload,
        draftStatus: "draft",
        approvedAtUtc: null,
        approvedByUserId: null,
      },
    });

  const rows = await db.select().from(weatherRuns).where(eq(weatherRuns.runKey, payload.runKey)).limit(1);
  return rows[0];
}

export async function replaceWeatherPayload(runKey: string, payload: Record<string, any>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db
    .update(weatherRuns)
    .set({
      payload,
      generatedAtUtc: Date.parse(payload.generatedAtUtc),
      draftStatus: "draft",
      approvedAtUtc: null,
      approvedByUserId: null,
    })
    .where(eq(weatherRuns.runKey, runKey));
}

export async function approveWeatherRun(runKey: string, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const approvedAtUtc = Date.now();
  await db
    .update(weatherRuns)
    .set({ draftStatus: "approved", approvedAtUtc, approvedByUserId: userId })
    .where(eq(weatherRuns.runKey, runKey));
  return { runKey, draftStatus: "approved" as const, approvedAtUtc };
}

export async function getLatestVerificationRun() {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(verificationRuns)
    .orderBy(desc(verificationRuns.validEndUtc), desc(verificationRuns.generatedAtUtc))
    .limit(1);
  return rows[0];
}

export async function saveVerificationRun(payload: Record<string, any>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const values = {
    verificationKey: payload.verificationKey,
    forecastRunUtc: Date.parse(payload.forecast.modelRunUtc),
    validEndUtc: Date.parse(payload.forecast.validEndUtc),
    generatedAtUtc: Date.parse(payload.generatedAtUtc),
    payload,
  };
  await db.insert(verificationRuns).values(values).onDuplicateKeyUpdate({ set: values });
  const rows = await db
    .select()
    .from(verificationRuns)
    .where(eq(verificationRuns.verificationKey, payload.verificationKey))
    .limit(1);
  return rows[0];
}

export async function getVerificationHistory(limit = 30) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(verificationRuns)
    .orderBy(desc(verificationRuns.validEndUtc))
    .limit(Math.min(Math.max(limit, 1), 90));
}

export async function upsertOfficialWarning(payload: Record<string, any>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const values = {
    source: payload.source,
    externalKey: payload.externalKey,
    issueNo: payload.issueNo ?? null,
    titleTh: payload.titleTh,
    headlineTh: payload.headlineTh ?? null,
    descriptionTh: payload.descriptionTh ?? null,
    titleEn: payload.titleEn ?? null,
    effectStartUtc: payload.effectStartUtc ?? null,
    effectEndUtc: payload.effectEndUtc ?? null,
    announcedAtUtc: payload.announcedAtUtc ?? null,
    sourceUrl: payload.sourceUrl ?? null,
    payload,
    retrievedAtUtc: payload.retrievedAtUtc,
  };
  await db.insert(officialWarnings).values(values).onDuplicateKeyUpdate({ set: values });
  return payload;
}

export async function getLatestOfficialWarning() {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(officialWarnings)
    .orderBy(desc(officialWarnings.announcedAtUtc), desc(officialWarnings.retrievedAtUtc))
    .limit(1);
  return rows[0];
}

export async function ensureAutomationJob(jobKey: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db
    .insert(automationJobs)
    .values({ jobKey })
    .onDuplicateKeyUpdate({ set: { jobKey } });
  const rows = await db.select().from(automationJobs).where(eq(automationJobs.jobKey, jobKey)).limit(1);
  return rows[0];
}

export async function getAutomationJob(jobKey: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(automationJobs).where(eq(automationJobs.jobKey, jobKey)).limit(1);
  return rows[0];
}

export async function getAutomationJobByTaskUid(taskUid: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(automationJobs)
    .where(eq(automationJobs.scheduleCronTaskUid, taskUid))
    .limit(1);
  return rows[0];
}

export async function configureAutomationJob(jobKey: string, taskUid: string, cronExpression: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await ensureAutomationJob(jobKey);
  await db
    .update(automationJobs)
    .set({ scheduleCronTaskUid: taskUid, cronExpression })
    .where(eq(automationJobs.jobKey, jobKey));
}

export async function updateAutomationRun(
  jobKey: string,
  patch: {
    lastStartedAtUtc?: number;
    lastCompletedAtUtc?: number;
    lastStatus?: "idle" | "running" | "success" | "failed";
    lastError?: string | null;
  },
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await ensureAutomationJob(jobKey);
  await db.update(automationJobs).set(patch).where(eq(automationJobs.jobKey, jobKey));
}
