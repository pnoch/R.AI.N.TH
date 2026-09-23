import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("weather snapshot contract", () => {
  it("returns a direct, auditable 77-province ECMWF snapshot", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = (await caller.weather.latest()) as any;

    expect(result.schemaVersion).toBe("0.1.0");
    expect(result.source.provider).toBe("ECMWF");
    expect(result.source.directAccess).toBe(true);
    expect(result.source.forecastStepsHours).toEqual([3, 24, 72]);
    expect(result.provinces).toHaveLength(77);
    expect(new Set(result.provinces.map((province: any) => province.iso)).size).toBe(77);
    expect(result.provinces.every((province: any) => province.riskScore >= 0 && province.riskScore <= 100)).toBe(true);
  });

  it("keeps analysis, official warnings, approval, and publishing distinct", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = (await caller.weather.latest()) as any;

    expect(result.analysis.type).toBe("OUR_RISK_ANALYSIS");
    expect(result.analysis.officialWarningStatus).toBe("SEPARATE_TMD_FEED");
    expect(result.draft.status).toBe("DRAFT");
    expect(result.draft.publishedAtUtc).toBeNull();
    expect(result.draft.textTh).toContain("ไม่ใช่ประกาศเตือนภัยอย่างเป็นทางการ");
  });
});
