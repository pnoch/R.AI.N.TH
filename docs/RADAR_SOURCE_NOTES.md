# Radar source notes

Verified on 24 September 2026.

## Official quantitative layer: Thai Meteorological Department

The official nationwide viewer is the [TMD Radar Composite](https://weather.tmd.go.th/composite/index_composite.html). Its page identifies the product as a national **PCAPPI Z–R mosaic at 2 km altitude**, produced every **15 minutes**, with rain rate derived using the Marshall–Palmer relation **Z = 200 R^1.6**.

The viewer publishes a lightweight frame manifest at [`images_composite.list`](https://weather.tmd.go.th/composite/images_composite.list). Each line contains an observation timestamp and a transparent PNG overlay below `https://weather.tmd.go.th/composite/images/zr/`. At verification time, the manifest contained 25 quarter-hour frames. The image overlays were 1,800 × 2,644 pixels and approximately 140–170 KB each.

The viewer declares the overlay bounds as **95°E to 108°E and 4°N to 22.5°N**. V0.8 maps administrative centroids linearly to this image grid and samples the official discrete color classes. The official legend provides rain-rate thresholds in millimetres per hour: 0.1, 1, 2, 4, 8, 12, 16, 24, 32, 40, 48, 56, and greater than 80. The PNG palette differs slightly from the displayed CSS swatches, so V0.8 decodes the actual observed RGB values and reports the class lower bound rather than inventing precision.

The viewer also exposes current quantitative files at [`composite.nc`](https://weather.tmd.go.th/composite/data/composite.nc) and [`composite.ascii`](https://weather.tmd.go.th/composite/data/composite.ascii). The ASCII file was approximately 20 MB and too slow for the frequent bounded callback, so V0.8 uses the compact official PNG frames.

The older TMD regional page links a current zipped QPE ASCII file and historical archive: [Radar composite QPE ASCII](https://cmmet.tmd.go.th/radar/Radar_compo.html).

## Visual animation layer: RainViewer

RainViewer publishes timeline metadata through [`https://api.rainviewer.com/public/weather-maps.json`](https://api.rainviewer.com/public/weather-maps.json). The [Weather Maps API documentation](https://www.rainviewer.com/api/weather-maps-api.html) states that the public response provides approximately two hours of past radar frames at ten-minute intervals. The API currently documents historical frames, not a future nowcast feed.

During release validation, direct anonymous raw tile and coordinate-image requests displayed an `API KEY REQUIRED` watermark even though the public documentation still described the URL format. V0.8 therefore does not reconstruct or proxy RainViewer tiles. It embeds RainViewer's supported hosted map at [`https://www.rainviewer.com/map.html`](https://www.rainviewer.com/map.html), centered on the selected administrative centroid with dark theme and animation controls. The hosted endpoint explicitly permits framing through `X-Frame-Options: ALLOWALL` and `Content-Security-Policy: frame-ancestors *`. An external link is shown as a fallback.

The [RainViewer source attribution page](https://www.rainviewer.com/sources.html) lists the Thai Meteorological Department as its Thailand radar source. V0.8 therefore labels the hosted RainViewer map as an independently rendered **visual mosaic**, not the source of numeric calculations. Numeric rain-rate trends and persistence baselines use the official TMD composite only.

## Interpretation and safety boundaries

The dashboard’s 15–60 minute values are a **persistence baseline**: the latest official rain-rate class multiplied by elapsed time. They are not motion-vector extrapolations, convective forecasts, flood probabilities, or official warnings. Radar measurements can be affected by beam blockage, ground clutter, range, attenuation, anomalous propagation, and source gaps. A centroid sample does not represent every street, river, or drainage path in an administrative area.
