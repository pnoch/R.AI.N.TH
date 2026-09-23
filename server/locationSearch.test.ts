import { describe, expect, it } from "vitest";
import {
  normalizeLocationQuery,
  searchLocations,
  type DistrictTuple,
  type SubdistrictTuple,
} from "@shared/locationSearch";

const provinces = [
  { iso: "TH-10", nameTh: "กรุงเทพมหานคร", nameEn: "Bangkok" },
  { iso: "TH-50", nameTh: "เชียงใหม่", nameEn: "Chiang Mai" },
];
const districts: DistrictTuple[] = [
  [10, 1030, "จตุจักร", "Chatuchak", 10900, 13.82667, 100.564],
  [50, 5001, "เมืองเชียงใหม่", "Mueang Chiang Mai", 50000, 18.79, 98.99],
];
const subdistricts: SubdistrictTuple[] = [
  [10, 1030, 103001, "ลาดยาว", "Lat Yao", 10900, 13.84331, 100.55999],
  [10, 1030, 103005, "จตุจักร", "Chatuchak", 10900, 13.81339, 100.55189],
];

describe("location search", () => {
  it("normalizes Thai administrative prefixes with optional spaces", () => {
    expect(normalizeLocationQuery(" เขต จตุจักร ")).toBe("เขตจตุจักร");
  });

  it("finds Chatuchak district first and maps it to Bangkok", () => {
    const [result] = searchLocations("เขต จตุจักร", provinces, districts, subdistricts);
    expect(result).toMatchObject({
      kind: "district",
      nameTh: "เขตจตุจักร",
      nameEn: "Chatuchak",
      provinceIso: "TH-10",
      provinceNameTh: "กรุงเทพมหานคร",
      districtCode: 1030,
      postalCode: 10900,
      centerLat: 13.82667,
    });
  });

  it("finds a Bangkok khwaeng with its full parent ancestry", () => {
    const [result] = searchLocations("แขวงลาดยาว", provinces, districts, subdistricts);
    expect(result).toMatchObject({
      kind: "subdistrict",
      nameTh: "แขวงลาดยาว",
      nameEn: "Lat Yao",
      districtNameTh: "เขตจตุจักร",
      provinceNameTh: "กรุงเทพมหานคร",
      subdistrictCode: 103001,
      districtCode: 1030,
      postalCode: 10900,
    });
  });

  it("supports English, postal-code, and province searches", () => {
    expect(searchLocations("Chatuchak", provinces, districts, subdistricts)[0]?.districtCode).toBe(1030);
    expect(searchLocations("10900", provinces, districts, subdistricts).some(result => result.nameTh === "เขตจตุจักร")).toBe(true);
    expect(searchLocations("กรุงเทพมหานคร", provinces, districts, subdistricts)[0]?.kind).toBe("province");
  });

  it("returns no suggestions for an empty query", () => {
    expect(searchLocations("   ", provinces, districts, subdistricts)).toEqual([]);
  });
});
