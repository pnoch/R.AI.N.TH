import { bigint, int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const weatherRuns = mysqlTable("weather_runs", {
  id: int("id").autoincrement().primaryKey(),
  runKey: varchar("runKey", { length: 128 }).notNull().unique(),
  modelRunUtc: bigint("modelRunUtc", { mode: "number" }).notNull(),
  generatedAtUtc: bigint("generatedAtUtc", { mode: "number" }).notNull(),
  payload: json("payload").notNull(),
  draftStatus: mysqlEnum("draftStatus", ["draft", "approved"]).default("draft").notNull(),
  approvedAtUtc: bigint("approvedAtUtc", { mode: "number" }),
  approvedByUserId: int("approvedByUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type WeatherRun = typeof weatherRuns.$inferSelect;
export type InsertWeatherRun = typeof weatherRuns.$inferInsert;

export const verificationRuns = mysqlTable("verification_runs", {
  id: int("id").autoincrement().primaryKey(),
  verificationKey: varchar("verificationKey", { length: 128 }).notNull().unique(),
  forecastRunUtc: bigint("forecastRunUtc", { mode: "number" }).notNull(),
  validEndUtc: bigint("validEndUtc", { mode: "number" }).notNull(),
  generatedAtUtc: bigint("generatedAtUtc", { mode: "number" }).notNull(),
  payload: json("payload").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type VerificationRun = typeof verificationRuns.$inferSelect;
export type InsertVerificationRun = typeof verificationRuns.$inferInsert;

export const officialWarnings = mysqlTable("official_warnings", {
  id: int("id").autoincrement().primaryKey(),
  source: varchar("source", { length: 32 }).notNull(),
  externalKey: varchar("externalKey", { length: 128 }).notNull().unique(),
  issueNo: varchar("issueNo", { length: 32 }),
  titleTh: text("titleTh").notNull(),
  headlineTh: text("headlineTh"),
  descriptionTh: text("descriptionTh"),
  titleEn: text("titleEn"),
  effectStartUtc: bigint("effectStartUtc", { mode: "number" }),
  effectEndUtc: bigint("effectEndUtc", { mode: "number" }),
  announcedAtUtc: bigint("announcedAtUtc", { mode: "number" }),
  sourceUrl: text("sourceUrl"),
  payload: json("payload").notNull(),
  retrievedAtUtc: bigint("retrievedAtUtc", { mode: "number" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const automationJobs = mysqlTable("automation_jobs", {
  id: int("id").autoincrement().primaryKey(),
  jobKey: varchar("jobKey", { length: 64 }).notNull().unique(),
  scheduleCronTaskUid: varchar("schedule_cron_task_uid", { length: 65 }).unique(),
  cronExpression: varchar("cronExpression", { length: 64 }),
  lastStartedAtUtc: bigint("lastStartedAtUtc", { mode: "number" }),
  lastCompletedAtUtc: bigint("lastCompletedAtUtc", { mode: "number" }),
  lastStatus: mysqlEnum("lastStatus", ["idle", "running", "success", "failed"]).default("idle").notNull(),
  lastError: text("lastError"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
