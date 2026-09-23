import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const ctx = {
  user: null,
  req: { protocol: "https", headers: {} },
  res: {},
} as TrpcContext;

describe("location data contract", () => {
  it("returns complete coded province, district, and subdistrict indexes", async () => {
    const index = (await appRouter.createCaller(ctx).locations.index()) as any;
    expect(index.schemaVersion).toBe("1.0.0");
    expect(index.provinces).toHaveLength(77);
    expect(index.districts).toHaveLength(928);
    expect(index.subdistricts).toHaveLength(7425);
    expect(index.source.license).toContain("CC BY");
    expect(index.subdistricts.some((row: any[]) => row[2] === 103001 && row[3] === "ลาดยาว")).toBe(true);
  });

  it("maps every Bangkok district to coded geometry including Chatuchak", async () => {
    const boundaries = (await appRouter.createCaller(ctx).locations.districtBoundaries({ provinceIso: "TH-10" })) as any;
    expect(boundaries.features).toHaveLength(50);
    expect(boundaries.features.some((feature: any) => feature.properties.districtCode === 1030)).toBe(true);
    expect(boundaries.source.license).toContain("CC BY");
  });

  it("contains one unique overlay for every district across 77 indexed provinces", async () => {
    const file = path.join(process.cwd(), "server", "data", "district-boundaries.json");
    const payload = JSON.parse(await readFile(file, "utf8"));
    const provinces = Object.values(payload.provinces) as any[];
    const codes = provinces.flatMap(province =>
      province.features.map((feature: any) => feature.properties.districtCode),
    );
    expect(provinces).toHaveLength(77);
    expect(codes).toHaveLength(928);
    expect(new Set(codes).size).toBe(928);
  });
});
