# Official warning source notes

Verified on 23 September 2026.

## Thai Meteorological Department

The Thai Meteorological Department open-data catalog states that its meteorological API supports weather warnings and severe-weather tracking. It documents `WeatherWarningNews` version 2 as the warning-news feed. The published demonstration endpoint is:

`https://data.tmd.go.th/api/WeatherWarningNews/v2/?uid=demo&ukey=demokey`

The endpoint returned HTTP 200 and XML with `IssueNo`, `EffectStartDate`, `EffectEndDate`, `AnnounceDate`, Thai and English titles, headlines and descriptions, bulletin PDF URLs, and contact details. The live result on verification was bulletin `220/2569`, issue 4, for heavy to very heavy rain in Thailand.

Documentation: https://data.tmd.go.th/api/index1.php

Open-data catalog: https://data.tmd.go.th/dataset/index.php

Human-readable warning list: https://www.tmd.go.th/warning-and-events/warning-storm

The older `www.tmd.go.th` host presented an incomplete TLS certificate chain to the command-line client during verification. The integration therefore uses the valid-TLS `data.tmd.go.th` API rather than bypassing certificate verification.

## Department of Disaster Prevention and Mitigation

No authoritative public machine-readable warning feed was found on the Department of Disaster Prevention and Mitigation website or in public search results. The website is protected by Cloudflare and did not expose a documented alert API in its loaded public resources. The application reports `NO_PUBLIC_MACHINE_FEED` and does not substitute social-media posts, news articles, or an unofficial scraper.

Official website checked: https://www.disaster.go.th/
