import { describe, expect, it } from "vitest";
import {
  isUsableRadarSnapshot,
  parseRadarFrameList,
  pixelForCoordinate,
  rainRateForRgba,
  summarizeRates,
} from "./radar";

describe("official TMD radar processing", () => {
  it("parses timestamped official frame manifests", () => {
    const frames = parseRadarFrameList([
      'background_THA.png "2026-09-24 06:15" overlay=zr/23.png',
      'background_THA.png "2026-09-24 06:30" overlay=zr/24.png',
    ].join("\n"));
    expect(frames).toEqual([
      {
        timestampUtc: "2026-09-24T06:15:00.000Z",
        relativePath: "zr/23.png",
        sourceUrl: "https://weather.tmd.go.th/composite/images/zr/23.png",
      },
      {
        timestampUtc: "2026-09-24T06:30:00.000Z",
        relativePath: "zr/24.png",
        sourceUrl: "https://weather.tmd.go.th/composite/images/zr/24.png",
      },
    ]);
  });

  it("maps declared radar bounds to image pixels and rejects outside points", () => {
    expect(pixelForCoordinate(22.5, 95, 1800, 2644)).toEqual({ x: 0, y: 0 });
    expect(pixelForCoordinate(4, 108, 1800, 2644)).toEqual({ x: 1799, y: 2643 });
    expect(pixelForCoordinate(13.25, 101.5, 1800, 2644)).toEqual({ x: 900, y: 1322 });
    expect(pixelForCoordinate(40, 101.5, 1800, 2644)).toBeNull();
  });

  it("decodes actual TMD PNG colors and builds an explicitly labeled persistence baseline", () => {
    expect(rainRateForRgba(246, 148, 48, 255)).toBe(40);
    expect(rainRateForRgba(255, 255, 255, 0)).toBe(0);
    expect(summarizeRates([4, 8, 8, 12, 16])).toEqual({
      latestRateMmH: 16,
      oneHourAccumMm: 11,
      previousRateMmH: 12,
      trend: "INTENSIFYING",
      persistenceAdditionalMm: [
        { minutes: 15, millimeters: 4 },
        { minutes: 30, millimeters: 8 },
        { minutes: 45, millimeters: 12 },
        { minutes: 60, millimeters: 16 },
      ],
    });
  });

  it("accepts only complete official 77-point snapshots", () => {
    const valid = {
      source: { provider: "Thai Meteorological Department", product: "National PCAPPI Z-R composite" },
      window: { endUtc: "2026-09-24T06:30:00.000Z" },
      frames: Array.from({ length: 5 }),
      provinces: Array.from({ length: 77 }, (_, index) => ({ latitude: 10 + index / 100, longitude: 100 })),
    };
    expect(isUsableRadarSnapshot(valid)).toBe(true);
    expect(isUsableRadarSnapshot({ ...valid, provinces: valid.provinces.slice(0, 76) })).toBe(false);
  });
});
