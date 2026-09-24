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

describe("radar snapshot contract", () => {
  it("returns an official five-frame TMD snapshot for all provinces", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = (await caller.radar.latest()) as any;

    expect(result.schemaVersion).toBe("1.0.0");
    expect(result.source.provider).toBe("Thai Meteorological Department");
    expect(result.source.temporalResolutionMinutes).toBe(15);
    expect(result.frames).toHaveLength(5);
    expect(result.provinces).toHaveLength(77);
    expect(new Set(result.provinces.map((province: any) => province.iso)).size).toBe(77);
  });

  it("keeps the persistence baseline and RainViewer visual layer explicitly separate", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = (await caller.radar.latest()) as any;

    expect(result.method.nowcast).toContain("persistence baseline");
    expect(result.method.nowcast).toContain("not motion-vector");
    expect(result.rainViewer.visualMode).toBe("HOSTED_EMBED");
    expect(result.rainViewer.hostedMapUrl).toBe("https://www.rainviewer.com/map.html");
    expect(result.rainViewer.caveat).toContain("Hosted visual mosaic only");
    expect(result.rainViewer.frames.length).toBeGreaterThan(0);
  });
});
