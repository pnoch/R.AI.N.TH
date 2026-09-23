import { describe, expect, it } from "vitest";
import { TMD_WARNING_TIMEOUT_MS } from "./officialWarnings";
import { VERIFICATION_PIPELINE_SOURCE, VERIFICATION_PIPELINE_TIMEOUT_MS } from "./verification";
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
  });
});
