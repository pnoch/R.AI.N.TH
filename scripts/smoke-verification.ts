import { refreshVerification } from "../server/verification";

const result = await refreshVerification();
console.log(JSON.stringify({
  ok: true,
  persisted: result.persisted,
  verificationKey: result.verificationKey,
  forecastRunUtc: result.forecast.modelRunUtc,
  validEndUtc: result.forecast.validEndUtc,
  stationCount: result.summary.stationCount,
  pairedProvinceCount: result.summary.pairedProvinceCount,
  meanAbsoluteErrorMm: result.summary.meanAbsoluteErrorMm,
  meanBiasMm: result.summary.meanBiasMm,
  pearsonCorrelation: result.summary.pearsonCorrelation,
}));
process.exit(0);
