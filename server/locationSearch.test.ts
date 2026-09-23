import { describe, expect, it } from "vitest";
import { normalizeLocationQuery, searchLocations, type DistrictTuple } from "@shared/locationSearch";

const provinces = [
  { iso: "TH-10", nameTh: "กรุงเทพมหานคร", nameEn: "Bangkok" },
  { iso: "TH-50", nameTh: "เชียงใหม่", nameEn: "Chiang Mai" },
];
const districts: DistrictTuple[] = [
  [10, 1030, "จตุจักร", "Chatuchak", 10900],
  [50, 5001, "เมืองเชียงใหม่", "Mueang Chiang Mai", 50000],
];

describe("location search", () => {
  it("normalizes Thai administrative prefixes with optional spaces", () => {
    expect(normalizeLocationQuery(" เขต จตุจักร ")).toBe("เขตจตุจักร");
  });

  it("finds Chatuchak by Thai khet name and maps it to Bangkok province", () => {
    const [result] = searchLocations("เขต จตุจักร", provinces, districts);
    expect(result).toMatchObject({
      kind: "district",
      nameTh: "เขตจตุจักร",
      nameEn: "Chatuchak",
      provinceIso: "TH-10",
      provinceNameTh: "กรุงเทพมหานคร",
      postalCode: 10900,
    });
  });

  it("supports English, postal-code, and province searches", () => {
    expect(searchLocations("Chatuchak", provinces, districts)[0]?.districtCode).toBe(1030);
    expect(searchLocations("10900", provinces, districts)[0]?.nameTh).toBe("เขตจตุจักร");
    expect(searchLocations("กรุงเทพมหานคร", provinces, districts)[0]?.kind).toBe("province");
  });

  it("returns no suggestions for an empty query", () => {
    expect(searchLocations("   ", provinces, districts)).toEqual([]);
  });
});
