# RAIN//TH project tracker

## V0.7 — NASA IMERG satellite observations

| Work item | Status | Verification |
| --- | --- | --- |
| Validate a credential-free NASA IMERG Late access path | Completed | Public point API returned current 0.1° half-hour data, quality index, and snapshot ID |
| Benchmark national refresh within the callback budget | Completed | 77 representative points completed in approximately 17 seconds across eight concurrent batches |
| Integrate 24-hour accumulation and completeness checks | Completed | 48 half-hour intervals, minimum 44 valid, deterministic unit tests |
| Persist and bundle satellite snapshots | Completed | `satellite_runs` migration applied; bundled fallback generated |
| Add selected district/subdistrict cell observations | Completed | Public tRPC point query validated for Chatuchak |
| Add satellite map metric and evidence panel | Completed | TypeScript and component integration complete |
| Isolate satellite failures from ECMWF refresh success | Completed | Scheduled resilience test covers stale-last-known behavior |
| Validate desktop and mobile UI | Completed | Full-page desktop/mobile screenshots; Chatuchak selection and satellite map interaction verified |
| Run final release gates | Completed | TypeScript, 29 Vitest tests, 7 Python tests, build, production smoke, and diff check passed |
| Save WebDev checkpoint and push GitHub | Pending | Pending final validation |

## Next milestone candidates

Radar nowcasting and official river-level observations remain the highest-value missing operational layers. After enough scheduled satellite history accumulates, add IMERG-versus-ThaiWater bias tracking by season and region before using satellite rainfall in the screening score.
