# NASA IMERG satellite source notes

Verified on 24 September 2026.

## Selected product and access path

RAIN//TH V0.7 uses **NASA GPM IMERG Late Run V07**, a half-hourly global precipitation analysis at **0.1° (approximately 10 km)**. NASA describes the Late Run as a near-real-time product with a minimum latency of about 12–14 hours. It improves on the Early Run by incorporating lagging observations and both forward and backward propagation.

The operational integration reads the product from the credential-free [dynamical.org analysis point API](https://dynamical.org/api/). Its STAC collection identifies the dataset as `nasa-imerg-analysis-late`, declares **CC BY 4.0**, and provides the attribution: “NASA GPM IMERG data processed by dynamical.org from NASA GES DISC and PPS archives.” The upstream NASA product remains the scientific source; dynamical.org is explicitly shown as a secondary cloud-optimized distributor.

The direct NASA PPS GeoTIFF archive requires a NASA PPS account, and the AWS GES DISC bucket is controlled access. The older PMM Publisher `opensearch` route currently serves the replacement viewer rather than the documented JSON response. The public Dynamical API therefore provides the least-privilege production path without storing user or NASA credentials.

## Computation

Each API result provides half-hourly mean precipitation flux in `kg m-2 s-1`, numerically equivalent to millimetres per second of liquid water. RAIN//TH integrates the most recent 48 half-hour values by multiplying each rate by 1,800 seconds and summing the result. At least 44 of 48 intervals must be finite before a 24-hour value is published.

The national layer requests one representative administrative district centroid per province. It does **not** claim to calculate an area-weighted province mean. When a user selects a district or subdistrict, the app requests the nearest IMERG cell to that selected administrative centroid. Every response records the selected grid coordinates, quality-index mean, valid interval count, snapshot ID, time window, source, and method.

## Operational limits

IMERG is an observation-derived satellite estimate, not a rain gauge and not a flood-depth product. The grid cannot resolve streets, drains, canals, small catchments, or building-level conditions. Skill can be lower over complex terrain and coastal zones. The Late Run is not real time: its nominal latency is about 14 hours, so the interface always displays the observation window end.

The public JSON API supports at most 10 queries per request. The national refresh is split into eight concurrent batches for 77 provinces. A live benchmark completed in approximately 17 seconds, below the 30-second callback budget. Satellite refresh is non-blocking within the ECMWF/TMD scheduled job: a temporary satellite failure is recorded and shown as stale data but does not invalidate a successful forecast refresh.

## References

1. [NASA IMERG Late Run](https://gpm.nasa.gov/taxonomy/term/1415)
2. [NASA GPM data policy](https://gpm.nasa.gov/data/policy)
3. [Dynamical IMERG Late catalog](https://dynamical.org/catalog/nasa-imerg-analysis-late/)
4. [Dynamical STAC collection](https://stac.dynamical.org/nasa-imerg-analysis-late/collection.json)
5. [Dynamical point API](https://dynamical.org/api/)
