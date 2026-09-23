import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateAutomationRun: vi.fn(),
  refreshSnapshot: vi.fn(),
  refreshOfficialWarnings: vi.fn(),
  refreshVerification: vi.fn(),
}));

vi.mock("./db", () => ({
  updateAutomationRun: mocks.updateAutomationRun,
  getAutomationJobByTaskUid: vi.fn(),
}));
vi.mock("./weather", () => ({ refreshSnapshot: mocks.refreshSnapshot }));
vi.mock("./officialWarnings", () => ({ refreshOfficialWarnings: mocks.refreshOfficialWarnings }));
vi.mock("./verification", () => ({ refreshVerification: mocks.refreshVerification }));
vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: vi.fn() } }));

import { runForecastWarningRefresh } from "./scheduled";

describe("scheduled refresh resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateAutomationRun.mockResolvedValue(undefined);
  });

  it("persists forecast success while explicitly marking a temporary warning-source failure", async () => {
    mocks.refreshSnapshot.mockResolvedValue({ runKey: "ifs-test" });
    mocks.refreshOfficialWarnings.mockRejectedValue(new Error("TMD unavailable"));

    const result = await runForecastWarningRefresh();

    expect(result).toMatchObject({
      ok: true,
      weatherRunKey: "ifs-test",
      warningStatus: "STALE_LAST_KNOWN",
      warningError: "TMD unavailable",
    });
    expect(mocks.updateAutomationRun).toHaveBeenLastCalledWith(
      "forecast-warning-refresh",
      expect.objectContaining({ lastStatus: "success", lastError: null }),
    );
  });

  it("still fails the tracked run when the ECMWF forecast itself fails", async () => {
    mocks.refreshSnapshot.mockRejectedValue(new Error("ECMWF unavailable"));
    mocks.refreshOfficialWarnings.mockResolvedValue({ tmd: { status: "ACTIVE" } });

    await expect(runForecastWarningRefresh()).rejects.toThrow("ECMWF unavailable");
    expect(mocks.updateAutomationRun).toHaveBeenLastCalledWith(
      "forecast-warning-refresh",
      expect.objectContaining({ lastStatus: "failed", lastError: "ECMWF unavailable" }),
    );
  });
});
