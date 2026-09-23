# RAIN//TH Intelligence V0.3

**RAIN//TH Intelligence** is a working review dashboard for Thailand rainfall analysis. It downloads ECMWF Integrated Forecasting System (IFS) open data directly, reads total-precipitation fields from GRIB2 files, aggregates the forecast over all 77 Thai provinces, assigns a transparent screening score, and generates a Thai-language content draft. The product keeps internal analysis separate from official warnings and requires human approval before a draft can move downstream.

The current version is a **validation prototype**, not a public warning service. It uses one deterministic weather model plus observed ThaiWater rainfall verification. It does not yet include radar, river levels, soil moisture, watershed response, or population exposure.

## What works now

The direct data path has been validated against live ECMWF IFS runs. The processor retrieves the 3-, 24-, and 72-hour fields used by the dashboard and risk score from ECMWF's Google Cloud open-data mirror, selected after bounded benchmarks against the scheduler's 30-second callback window. It converts total precipitation from metres to millimetres, crops the global field to Thailand, and aggregates grid points within open province boundaries. Small provinces without an interior 0.25-degree grid point use their nearest grid point and receive lower confidence.

The web dashboard shows the resulting province map, leading signals, selected-province statistics, model provenance, scoring limitations, and a Thai draft. A searchable coded location index covers all 77 provinces, 928 districts, and 7,425 subdistricts in Thai and English, including postal-code lookup. District selections zoom to their true administrative boundary; subdistrict selections add the official centroid inside that parent district. Both deliberately inherit their parent province's ECMWF screening values because the 0.25-degree model does not support reliable district-level claims. The dashboard also performs a live 24-hour hindcast check against the public ThaiWater station feed, persists rolling verification runs, and charts absolute error nationally or for a selected province with Thai seasonal groupings. A separate official layer ingests TMD `WeatherWarningNews` bulletins with issue, announcement, effect timestamps, source PDF, and provenance. An authenticated operator can retrieve the latest ECMWF run, refresh official warnings or evidence, refine the copy with `gpt-5-mini`, or approve the draft. Approval is an internal state change only. The application has no Facebook, LINE, or public-publishing connection.

## Architecture

```text
ECMWF IFS Open Data (GRIB2, 0.25°)
                │
                ▼
Python retrieval via ecmwf-opendata
                │
                ▼
ecCodes decode + Thailand crop
                │
                ▼
geoBoundaries ADM1 polygon aggregation
                │
                ▼
Transparent rainfall screening score
                │
                ├──────────────► Thai draft template / optional gpt-5-mini refinement
                │
                ▼
MySQL weather_runs snapshot
                │
                ▼
Express + tRPC API
                │
                ▼
React review dashboard + SVG province map

ThaiWater public 24-hour station observations
                │
                ▼
Current 04:00–08:00 ICT reporting-window filter
                │
                ▼
Matched previous-day ECMWF +24 h forecast
                │
                ▼
77-province directional verification + MySQL snapshot

TMD WeatherWarningNews XML API
                │
                ▼
Decoded, timestamped official bulletin + MySQL history

Managed HTTP callbacks after deployment
                ├──────────────► ECMWF + TMD four times daily
                └──────────────► ThaiWater verification daily
```

The production container combines the TypeScript application and a small Python runtime. Scheduled subprocesses are capped at 23 seconds, the TMD request is capped at 8 seconds and cannot block a successful forecast, and simultaneous refresh requests are deduplicated within one application instance.

## Data sources and attribution

ECMWF makes a subset of real-time IFS and Artificial Intelligence Forecasting System data available as GRIB2 files under Creative Commons Attribution 4.0. The open-data archive retains the most recent forecast runs rather than a full historical archive.[1] This project uses the deterministic IFS `oper` stream, surface-level total precipitation parameter `tp`, and forecast steps 3, 24, and 72 hours.

Province boundaries come from the `gbOpen` Thailand ADM1 release exposed by geoBoundaries. The application stores the downloaded source metadata beside the GeoJSON and includes source attribution in the interface.[2]

Thai and English province, district, and subdistrict names, administrative P-codes, and centroids come from the Thailand COD-AB published by OCHA FISS on HDX and sourced from the Royal Thai Survey Department.[6] District overlays come from the matching geoBoundaries ADM2 release. The build validates a one-to-one centroid-to-polygon mapping for all 928 districts. Postal codes are enrichment data from the MIT-licensed Thailand Geography JSON project.[7]

Observed 24-hour rainfall comes from the public endpoint used by the ThaiWater rainfall page. The endpoint provides station rainfall totals, timestamps, coordinates, agency metadata, and province codes.[3] ThaiWater's published interchange standard defines the underlying rainfall request parameters and response structure.[4]

Official weather warnings come from the TMD `WeatherWarningNews` version 2 XML endpoint documented in the agency's open-data catalog.[5] The system preserves the official bulletin URL and timestamps. No equivalent authoritative public machine-readable DDPM feed was found, so the interface states that limitation instead of substituting social media or an unofficial scraper.

## Forecast verification

The verification pipeline aligns the ThaiWater reporting day ending near 07:00 Indochina Time with the deterministic ECMWF forecast from 00:00 UTC on the previous day to forecast step +24 hours. It keeps valid stations reporting from 04:00 through 08:00 local time. Each province's observed value is the mean across reporting point stations; each forecast value is the mean across the model grid cells assigned to that province.

These quantities are not identical estimands. A point-station network does not equal an area-grid mean, and the station timestamps can differ by about one hour. The dashboard therefore calls this a **directional verification screen**, not a calibrated skill score. The first live matched run included all 77 provinces and more than 4,400 current station reports. Each daily verification key is retained so rolling national and province error histories accumulate instead of being overwritten.

## Screening score

The risk score is an auditable **rainfall-only screening index**, not a probability of flooding. Each component is scaled linearly between a start threshold and the value that receives its full weight.

| Component | Weight | Linear range |
| --- | ---: | ---: |
| Province mean rainfall over 24 hours | 40 | 5–80 mm |
| Province 90th-percentile rainfall over 24 hours | 20 | 10–120 mm |
| Province maximum grid-cell rainfall over 24 hours | 10 | 20–150 mm |
| Province mean rainfall over 72 hours | 25 | 20–140 mm |
| Fraction of province grid cells above 50 mm over 24 hours | 5 | 0–100% |

Scores below 25 are `LOW`; 25–49 are `ELEVATED`; 50–69 are `HIGH`; 70–84 are `VERY_HIGH`; and 85–100 are `EXTREME`. These bands are product hypotheses for audience and workflow testing. They require retrospective calibration against observed rainfall and real impacts before operational use.

## Safety model

Every model snapshot has an analysis type of `OUR_RISK_ANALYSIS`. Its official-warning field is marked `SEPARATE_TMD_FEED`; the TMD bulletin is never folded into or relabelled as the model-derived score. The draft must state that it is model-based analysis and not an official warning.

A refreshed forecast or regenerated draft resets prior approval. No operation in this repository publishes content externally. This prevents a changed model run or edited post from inheriting an earlier approval.

## Local development

Install the JavaScript dependencies with `pnpm install`. Install the Python packages from `pipeline/requirements.txt` in a virtual environment or system Python. The processor also requires a working ecCodes binary library; the pinned Python package installs the supporting runtime on common Linux platforms.

Run the application with:

```bash
pnpm dev
```

Run the full quality gate with:

```bash
pnpm check
pnpm test
pnpm test:python
pnpm build
pnpm smoke:production
```

The production build uses a dedicated bundled server entrypoint and a two-stage image. The final image carries the compiled frontend/server, the Python GRIB runtime, pipeline code, and fallback data without retaining the JavaScript build toolchain or `node_modules`.

Run a direct end-to-end ECMWF refresh and persist the result with:

```bash
pnpm weather:refresh
```

Run the live ThaiWater fetch, matched ECMWF hindcast, province verification, and database persistence with:

```bash
pnpm verification:refresh
```

Refresh and persist the official TMD bulletin with:

```bash
pnpm warnings:refresh
```

Two bounded scheduled handlers are prepared for managed deployment: ECMWF plus TMD at `00:45`, `06:45`, `12:45`, and `18:45` UTC, and ThaiWater verification daily at `01:30` UTC. The callback is cron-authenticated, looks up the job by platform-issued task UID, and rejects normal requests. The schedules must be activated only after the checkpoint is deployed so the production callback URL exists.

The standalone processor can also emit a JSON snapshot without starting the web application:

```bash
python3 pipeline/ecmwf_pipeline.py \
  --boundaries pipeline/data/thailand-adm1.geojson \
  --output server/data/latest-snapshot.json \
  --source google
```

## Important files

`pipeline/ecmwf_pipeline.py` contains retrieval, GRIB decoding, province aggregation, scoring, confidence assignment, and deterministic draft generation. `pipeline/verification_pipeline.py` retrieves ThaiWater observations and builds the time-matched 24-hour verification snapshot. `pipeline/build_location_assets.py` builds the coded search index and validates all district overlays. `server/officialWarnings.ts` parses and persists the official TMD XML feed. `server/scheduled.ts` contains the bounded authenticated callbacks. The tRPC routers expose public reads and authenticated operational mutations. `client/src/components/LocationExplorer.tsx`, `ThailandRiskMap.tsx`, `OfficialWarningPanel.tsx`, and `VerificationPanel.tsx` render location search, geographic focus, the warning layer, live evidence, and rolling skill views.

## Next implementation priorities

After deployment and schedule activation, the next technical milestone should add radar nowcasting and official river-level observations. Antecedent rainfall and watershed sensitivity can then improve the rainfall-only screening score. A GFS comparison and per-lead-time calibration should follow after enough scheduled verification history has accumulated.

## References

[1]: https://www.ecmwf.int/en/forecasts/datasets/open-data "ECMWF Open Data"
[2]: https://www.geoboundaries.org/api.html "geoBoundaries API and Programmatic Access"
[3]: https://www.thaiwater.net/weather/rainfall "ThaiWater 24-Hour Rainfall Monitoring"
[4]: https://standard.thaiwater.net/docs/%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%88%E0%B8%B1%E0%B8%94%E0%B8%97%E0%B8%B3%E0%B8%A1%E0%B8%B2%E0%B8%95%E0%B8%A3%E0%B8%90%E0%B8%B2%E0%B8%99%E0%B8%99%E0%B9%89%E0%B8%B3-%E0%B8%A3%E0%B8%B0%E0%B8%A2%E0%B8%B0/%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B9%80%E0%B8%8A%E0%B8%B7%E0%B9%88%E0%B8%AD%E0%B8%A1%E0%B9%82%E0%B8%A2%E0%B8%87%E0%B8%82%E0%B9%89%E0%B8%AD%E0%B8%A1%E0%B8%B9%E0%B8%A5-%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B9%81/%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B9%81%E0%B8%A5%E0%B8%81%E0%B9%80%E0%B8%9B%E0%B8%A5%E0%B8%B5%E0%B8%A2%E0%B8%99%E0%B8%82%E0%B9%89%E0%B8%AD%E0%B8%A1%E0%B8%B9%E0%B8%A5%E0%B8%94%E0%B9%89%E0%B8%B2/%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B9%81%E0%B8%A5%E0%B8%81%E0%B9%80%E0%B8%9B%E0%B8%A5%E0%B8%B5%E0%B8%A2%E0%B8%99%E0%B8%82%E0%B9%89%E0%B8%AD%E0%B8%A1%E0%B8%B9%E0%B8%A5-online-%E0%B8%9C%E0%B9%88/api-%E0%B8%AA%E0%B8%B3%E0%B8%AB%E0%B8%A3%E0%B8%B1%E0%B8%9A%E0%B8%AD%E0%B9%88%E0%B8%B2%E0%B8%99%E0%B8%82%E0%B9%89%E0%B8%AD%E0%B8%A1%E0%B8%B9%E0%B8%A5%E0%B8%99%E0%B9%89%E0%B8%B3%E0%B8%9D%E0%B8%99/ "ThaiWater Rainfall API Standard"
[5]: https://data.tmd.go.th/api/index1.php "TMD WeatherWarningNews API"
[6]: https://data.humdata.org/dataset/cod-ab-tha "Thailand Common Operational Dataset for Administrative Boundaries"
[7]: https://github.com/thailand-geography-data/thailand-geography-json "Thailand Geography JSON"
