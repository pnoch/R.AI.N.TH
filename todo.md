# RAIN//TH project tracker

## V0.7 — NASA IMERG satellite observations

| Work item | Status | Verification |
| --- | --- | --- |
| Validate credential-free IMERG access and national runtime | Completed | 77 representative points within callback budget |
| Integrate, persist, test, and display satellite observations | Completed | API, UI, fallback, quality gates, and Chatuchak selected-cell flow verified |
| Save checkpoint and push GitHub | Completed | WebDev checkpoint `787a7658` pushed to `pnoch/R.AI.N.TH` |

## V0.8 — official radar trend and visual animation

| Work item | Status | Verification |
| --- | --- | --- |
| Validate official TMD national radar source | Completed | 15-minute manifest, 1,800 × 2,644 PNGs, bounds, and legend audited |
| Implement quantitative centroid sampling | Completed | Five-frame trend, previous-hour indication, and 15–60 minute persistence baseline |
| Persist quality-controlled national radar snapshots | Completed | `radar_runs` migration applied; 77-point fallback generated |
| Add selected district/subdistrict radar trend | Completed | Chatuchak tRPC point smoke check passed |
| Add RainViewer visual layer | Completed | Supported hosted no-key embed used; direct raw images rejected after watermark validation |
| Add independent 15-minute scheduled callback | Completed in code | Authenticated route, ownership config, runtime budget, and failure isolation tested |
| Validate desktop and mobile UI | Completed | Responsive full-page layouts pass; hosted RainViewer map verified directly and frame policy confirmed |
| Run final release gates | Completed | TypeScript, 37 Vitest tests, 7 Python tests, build, isolated production smoke, shell syntax, and diff check passed |
| Save checkpoint and push GitHub | Pending | After final gates |
| Publish and activate radar heartbeat | Pending | Requires deployment of V0.8 checkpoint before creating the production job |

## Next milestone candidates

Official river levels, catchment-aware antecedent rainfall, and retrospectively verified radar motion extrapolation are the highest-value next reliability layers.
