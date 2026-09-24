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

describe("satellite snapshot contract", () => {
  it("returns a complete, auditable 77-point IMERG Late snapshot", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = (await caller.satellite.latest()) as any;

    expect(result.schemaVersion).toBe("1.0.0");
    expect(result.source.productId).toBe("nasa-imerg-analysis-late");
    expect(result.source.originalArchives).toContain("NASA");
    expect(result.source.resolution).toContain("0.1°");
    expect(result.provinces).toHaveLength(77);
    expect(new Set(result.provinces.map((province: any) => province.iso)).size).toBe(77);
    expect(result.provinces.every((province: any) => province.validIntervals >= 44)).toBe(true);
  });

  it("labels national values as representative cells rather than province means", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = (await caller.satellite.latest()) as any;

    expect(result.method.description).toContain("centroid");
    expect(result.method.caveat).toContain("not province averages");
    expect(result.summary.representativePointCount).toBe(77);
    expect(result.source.attribution).toContain("dynamical.org");
  });
});
