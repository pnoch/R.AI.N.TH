import { describe, expect, it } from "vitest";
import { TMD_WARNING_TIMEOUT_MS } from "./officialWarnings";
import { RADAR_FETCH_TIMEOUT_MS, RAINVIEWER_TIMELINE_URL, TMD_RADAR_LIST_URL } from "./radar";
import { DYNAMICAL_ANALYSES_URL, SATELLITE_API_TIMEOUT_MS } from "./satellite";
import {
  isUsableVerification,
  VERIFICATION_PIPELINE_SOURCE,
  VERIFICATION_PIPELINE_TIMEOUT_MS,
} from "./verification";
import { WEATHER_PIPELINE_SOURCE, WEATHER_PIPELINE_TIMEOUT_MS } from "./weather";

describe("scheduled pipeline runtime contract", () => {
  it("uses the benchmarked low-latency ECMWF mirror by default", () => {
    expect(WEATHER_PIPELINE_SOURCE).toBe("google");
    expect(VERIFICATION_PIPELINE_SOURCE).toBe("google");
  });

  it("caps all request-bound work below the 30-second scheduler deadline", () => {
    expect(WEATHER_PIPELINE_TIMEOUT_MS).toBeLessThan(25_000);
    expect(VERIFICATION_PIPELINE_TIMEOUT_MS).toBeLessThan(25_000);
    expect(TMD_WARNING_TIMEOUT_MS).toBeLessThan(10_000);
    expect(SATELLITE_API_TIMEOUT_MS).toBeLessThan(25_000);
    expect(RADAR_FETCH_TIMEOUT_MS).toBeLessThan(25_000);
    expect(DYNAMICAL_ANALYSES_URL).toBe("https://api.dynamical.org/v1/analyses");
    expect(TMD_RADAR_LIST_URL).toBe("https://weather.tmd.go.th/composite/images_composite.list");
    expect(RAINVIEWER_TIMELINE_URL).toBe("https://api.rainviewer.com/public/weather-maps.json");
  });

  it("rejects partial off-window observations before they can replace valid evidence", () => {
    expect(
      isUsableVerification({
        provinces: Array.from({ length: 77 }),
        summary: { stationCount: 7, pairedProvinceCount: 0, meanAbsoluteErrorMm: null, within10mmRate: null },
      }),
    ).toBe(false);
    expect(
      isUsableVerification({
        provinces: Array.from({ length: 77 }),
        summary: { stationCount: 4_413, pairedProvinceCount: 77, meanAbsoluteErrorMm: 4.5, within10mmRate: 0.922 },
      }),
    ).toBe(true);
  });
});
