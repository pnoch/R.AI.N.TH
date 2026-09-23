import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const ctx = {
  user: null,
  req: { protocol: "https", headers: {} },
  res: {},
} as TrpcContext;

describe("official warning contract", () => {
  it("returns a persisted TMD warning with decoded Thai text and provenance", async () => {
    const result = (await appRouter.createCaller(ctx).warnings.latest()) as any;
    expect(result.schemaVersion).toBe("0.3.0");
    expect(result.tmd.provider).toBe("Thai Meteorological Department");
    expect(["ACTIVE", "EXPIRED", "NO_CURRENT_WARNING"]).toContain(result.tmd.status);
    expect(result.tmd.titleTh).toContain("ฝน");
    expect(result.tmd.titleTh).not.toContain("&#x");
    expect(result.tmd.sourceUrl).toMatch(/^https:\/\//);
  });

  it("does not substitute an unofficial DDPM warning source", async () => {
    const result = (await appRouter.createCaller(ctx).warnings.latest()) as any;
    expect(result.ddpm.status).toBe("NO_PUBLIC_MACHINE_FEED");
    expect(result.ddpm.note).toContain("No authoritative public machine-readable");
  });
});
