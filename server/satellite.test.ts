import { describe, expect, it } from "vitest";
import {
  isUsableSatelliteSnapshot,
  MIN_VALID_INTERVALS,
  SATELLITE_PRODUCT_ID,
  summarizePointResult,
} from "./satellite";

function result(value = 0.001, intervals = 48) {
  const start = Date.parse("2026-09-22T00:00:00Z");
  return {
    analysisTimes: Array.from({ length: intervals }, (_, index) => new Date(start + index * 1_800_000).toISOString()),
    point: { selected: { latitude: 13.85, longitude: 100.55, grid: { latitudeIndex: 761, longitudeIndex: 2805 } } },
    data: {
      precipitation_surface: Array.from({ length: intervals }, () => value),
      precipitation_quality_index_surface: Array.from({ length: intervals }, () => 0.75),
    },
  };
}

describe("satellite observation contract", () => {
  it("integrates 48 half-hour mean rates into a 24-hour millimetre accumulation", () => {
    const summary = summarizePointResult(result());
    expect(summary.rain24hMm).toBe(86.4);
    expect(summary.validIntervals).toBe(48);
    expect(summary.qualityIndexMean).toBe(0.75);
    expect(summary.windowEndUtc).toBe("2026-09-23T00:00:00.000Z");
    expect(summary.grid).toMatchObject({ latitude: 13.85, longitude: 100.55 });
  });

  it("does not publish a 24-hour value when too many half-hours are missing", () => {
    const payload = result(0.001, MIN_VALID_INTERVALS - 1);
    expect(summarizePointResult(payload).rain24hMm).toBeNull();
  });

  it("requires 77 provinces and broad representative-point completeness", () => {
    const province = { rain24hMm: 12.3, validIntervals: 48 };
    expect(isUsableSatelliteSnapshot({
      source: { productId: SATELLITE_PRODUCT_ID },
      window: { endUtc: "2026-09-23T00:00:00Z" },
      provinces: Array.from({ length: 77 }, () => province),
    })).toBe(true);
    expect(isUsableSatelliteSnapshot({
      source: { productId: SATELLITE_PRODUCT_ID },
      window: { endUtc: "2026-09-23T00:00:00Z" },
      provinces: Array.from({ length: 69 }, () => province),
    })).toBe(false);
  });
});
