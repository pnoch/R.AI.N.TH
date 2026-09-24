import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateAutomationRun: vi.fn(),
  refreshSnapshot: vi.fn(),
  refreshOfficialWarnings: vi.fn(),
  refreshRadarSnapshot: vi.fn(),
  refreshSatelliteSnapshot: vi.fn(),
  refreshVerification: vi.fn(),
}));

vi.mock("./db", () => ({
  updateAutomationRun: mocks.updateAutomationRun,
  getAutomationJobByTaskUid: vi.fn(),
}));
vi.mock("./weather", () => ({ refreshSnapshot: mocks.refreshSnapshot }));
vi.mock("./officialWarnings", () => ({ refreshOfficialWarnings: mocks.refreshOfficialWarnings }));
vi.mock("./radar", () => ({ refreshRadarSnapshot: mocks.refreshRadarSnapshot }));
vi.mock("./satellite", () => ({ refreshSatelliteSnapshot: mocks.refreshSatelliteSnapshot }));
vi.mock("./verification", () => ({ refreshVerification: mocks.refreshVerification }));
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: vi.fn() } }));

import { runForecastWarningRefresh, runRadarRefresh } from "./scheduled";

describe("scheduled refresh resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateAutomationRun.mockResolvedValue(undefined);
  });

  it("persists forecast success while explicitly marking a temporary warning-source failure", async () => {
    mocks.refreshSnapshot.mockResolvedValue({ runKey: "ifs-test" });
    mocks.refreshOfficialWarnings.mockRejectedValue(new Error("TMD unavailable"));
    mocks.refreshSatelliteSnapshot.mockResolvedValue({ satelliteKey: "imerg-test" });

    const result = await runForecastWarningRefresh();

    expect(result).toMatchObject({
      ok: true,
      weatherRunKey: "ifs-test",
      warningStatus: "STALE_LAST_KNOWN",
      warningError: "TMD unavailable",
      satelliteKey: "imerg-test",
      satelliteStatus: "FRESH",
    });
    expect(mocks.updateAutomationRun).toHaveBeenLastCalledWith(
      "forecast-warning-refresh",
      expect.objectContaining({ lastStatus: "success", lastError: null }),
    );
  });

  it("still fails the tracked run when the ECMWF forecast itself fails", async () => {
    mocks.refreshSnapshot.mockRejectedValue(new Error("ECMWF unavailable"));
    mocks.refreshOfficialWarnings.mockResolvedValue({ tmd: { status: "ACTIVE" } });
    mocks.refreshSatelliteSnapshot.mockResolvedValue({ satelliteKey: "imerg-test" });

    await expect(runForecastWarningRefresh()).rejects.toThrow("ECMWF unavailable");
    expect(mocks.updateAutomationRun).toHaveBeenLastCalledWith(
      "forecast-warning-refresh",
      expect.objectContaining({ lastStatus: "failed", lastError: "ECMWF unavailable" }),
    );
  });

  it("persists forecast success while retaining the last satellite snapshot after an API failure", async () => {
    mocks.refreshSnapshot.mockResolvedValue({ runKey: "ifs-test" });
    mocks.refreshOfficialWarnings.mockResolvedValue({ tmd: { status: "NO_ACTIVE_WARNING" } });
    mocks.refreshSatelliteSnapshot.mockRejectedValue(new Error("IMERG API unavailable"));

    const result = await runForecastWarningRefresh();

    expect(result).toMatchObject({
      ok: true,
      weatherRunKey: "ifs-test",
      satelliteStatus: "STALE_LAST_KNOWN",
      satelliteError: "IMERG API unavailable",
    });
  });

  it("tracks the independent radar job without affecting forecast or verification state", async () => {
    mocks.refreshRadarSnapshot.mockResolvedValue({
      radarKey: "tmd-radar-test",
      window: { endUtc: "2026-09-24T06:30:00.000Z" },
      summary: { rainingPointCount: 11 },
    });

    const result = await runRadarRefresh();

    expect(result).toMatchObject({
      ok: true,
      jobKey: "radar-refresh",
      radarKey: "tmd-radar-test",
      rainingPointCount: 11,
    });
    expect(mocks.updateAutomationRun).toHaveBeenLastCalledWith(
      "radar-refresh",
      expect.objectContaining({ lastStatus: "success", lastError: null }),
    );
  });

  it("records a radar-source failure on the radar job only", async () => {
    mocks.refreshRadarSnapshot.mockRejectedValue(new Error("TMD radar unavailable"));

    await expect(runRadarRefresh()).rejects.toThrow("TMD radar unavailable");
    expect(mocks.updateAutomationRun).toHaveBeenLastCalledWith(
      "radar-refresh",
      expect.objectContaining({ lastStatus: "failed", lastError: "TMD radar unavailable" }),
    );
  });
});
