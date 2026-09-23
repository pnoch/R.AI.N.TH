# RAIN//TH Intelligence V0

**RAIN//TH Intelligence** is a working review dashboard for Thailand rainfall analysis. It downloads ECMWF Integrated Forecasting System (IFS) open data directly, reads total-precipitation fields from GRIB2 files, aggregates the forecast over all 77 Thai provinces, assigns a transparent screening score, and generates a Thai-language content draft. The product keeps internal analysis separate from official warnings and requires human approval before a draft can move downstream.

The current version is a **validation prototype**, not a public warning service. It uses one deterministic weather model and does not yet include radar, observed rainfall, river levels, soil moisture, watershed response, or population exposure.

## What works now

The direct data path has been validated against a live ECMWF IFS run. The processor retrieves forecast steps for 3, 6, 24, and 72 hours from the ECMWF open-data replica on Amazon Web Services. It converts total precipitation from metres to millimetres, crops the global field to Thailand, and aggregates grid points within open province boundaries. Small provinces without an interior 0.25-degree grid point use their nearest grid point and receive lower confidence.

The web dashboard shows the resulting province map, leading signals, selected-province statistics, model provenance, scoring limitations, and a Thai draft. An authenticated operator can retrieve the latest ECMWF run, refine the copy with `gpt-5-mini`, or approve the draft. Approval is an internal state change only. The application has no Facebook, LINE, or public-publishing connection.

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
```

The production container combines the TypeScript application and a small Python runtime. A refresh runs within the initiating web request, which fits the managed hosting limit because the verified direct retrieval and aggregation usually complete in seconds. The code deduplicates simultaneous refresh requests within one application instance.

## Data sources and attribution

ECMWF makes a subset of real-time IFS and Artificial Intelligence Forecasting System data available as GRIB2 files under Creative Commons Attribution 4.0. The open-data archive retains the most recent forecast runs rather than a full historical archive.[1] This project uses the deterministic IFS `oper` stream, surface-level total precipitation parameter `tp`, and forecast steps 3, 6, 24, and 72 hours.

Province boundaries come from the `gbOpen` Thailand ADM1 release exposed by geoBoundaries. The application stores the downloaded source metadata beside the GeoJSON and includes source attribution in the interface.[2]

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

Every snapshot has an analysis type of `OUR_RISK_ANALYSIS`. The official-warning field is separately marked `NOT_CHECKED_V0` because the current pipeline does not yet ingest Thai Meteorological Department or Department of Disaster Prevention and Mitigation bulletins. The draft must state that it is model-based analysis and not an official warning.

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
pnpm build
```

Run a direct end-to-end ECMWF refresh and persist the result with:

```bash
pnpm weather:refresh
```

The standalone processor can also emit a JSON snapshot without starting the web application:

```bash
python3 pipeline/ecmwf_pipeline.py \
  --boundaries pipeline/data/thailand-adm1.geojson \
  --output server/data/latest-snapshot.json \
  --source aws
```

## Important files

`pipeline/ecmwf_pipeline.py` contains retrieval, GRIB decoding, province aggregation, scoring, confidence assignment, and deterministic draft generation. `server/weather.ts` runs the processor and constrains optional language-model refinement. `server/routers/weather.ts` exposes public snapshot reads and authenticated operational mutations. `client/src/components/ThailandRiskMap.tsx` renders the original interactive SVG map. `server/data/latest-snapshot.json` is a verified fallback that keeps the dashboard usable before the first database-backed refresh.

## Next implementation priorities

The next technical milestone is observed-data verification. Add ThaiWater rainfall and river observations, then persist forecast-versus-actual pairs by model cycle and lead time. That produces the first defensible accuracy dashboard and enables score calibration. The following milestone should add official TMD warning ingestion as a separate source with its own timestamp and provenance. GFS comparison, radar nowcasting, antecedent rainfall, and watershed sensitivity should follow only after those two reliability layers are stable.

## References

[1]: https://www.ecmwf.int/en/forecasts/datasets/open-data "ECMWF Open Data"
[2]: https://www.geoboundaries.org/api.html "geoBoundaries API and Programmatic Access"
