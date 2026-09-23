import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const ctx = {
  user: null,
  req: { protocol: "https", headers: {} },
  res: {},
} as TrpcContext;

describe("verification snapshot contract", () => {
  it("returns matched ECMWF and ThaiWater evidence for every province", async () => {
    const result = (await appRouter.createCaller(ctx).verification.latest()) as any;
    expect(result.schemaVersion).toBe("0.2.0");
    expect(result.forecast.provider).toBe("ECMWF");
    expect(result.observations.provider).toContain("ThaiWater");
    expect(result.provinces).toHaveLength(77);
    expect(result.summary.pairedProvinceCount).toBe(77);
    expect(result.summary.stationCount).toBeGreaterThan(1000);
  });

  it("labels the comparison as directional and reports bounded metrics", async () => {
    const result = (await appRouter.createCaller(ctx).verification.latest()) as any;
    expect(result.method.caveat).toContain("not identical estimands");
    expect(result.summary.meanAbsoluteErrorMm).toBeGreaterThanOrEqual(0);
    expect(result.summary.within10mmRate).toBeGreaterThanOrEqual(0);
    expect(result.summary.within10mmRate).toBeLessThanOrEqual(1);
    expect(Math.abs(result.summary.pearsonCorrelation)).toBeLessThanOrEqual(1);
  });

  it("returns persisted verification history for rolling skill views", async () => {
    const history = (await appRouter.createCaller(ctx).verification.history({ limit: 30 })) as any[];
    expect(history.length).toBeGreaterThan(0);
    expect(history.length).toBeLessThanOrEqual(30);
    expect(history[0].summary.meanAbsoluteErrorMm).toBeGreaterThanOrEqual(0);
    expect(history[0].provinces).toHaveLength(77);
  });
});
