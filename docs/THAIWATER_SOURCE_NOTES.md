# ThaiWater source notes

Verified on 23 September 2026.

## Official standard

The Water Resource Data Standards site defines rainfall API `A001.1` as an HTTP `GET` request to `/Rainfall`. Required parameters are `interval` and `latest`; `startDatetime` and `endDatetime` are required when `latest=false`. Optional location filters include `provinceCode`, `amphoeCode`, `tambonCode`, `basinCode`, `subBasinCode`, `agencyCode`, and `stationCode`.

Source: https://standard.thaiwater.net/docs/%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B8%88%E0%B8%B1%E0%B8%94%E0%B8%97%E0%B8%B3%E0%B8%A1%E0%B8%B2%E0%B8%95%E0%B8%A3%E0%B8%90%E0%B8%B2%E0%B8%99%E0%B8%99%E0%B9%89%E0%B8%B3-%E0%B8%A3%E0%B8%B0%E0%B8%A2%E0%B8%B0/%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B9%80%E0%B8%8A%E0%B8%B7%E0%B9%88%E0%B8%AD%E0%B8%A1%E0%B9%82%E0%B8%A2%E0%B8%87%E0%B8%82%E0%B9%89%E0%B8%AD%E0%B8%A1%E0%B8%B9%E0%B8%A5-%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B9%81/%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B9%81%E0%B8%A5%E0%B8%81%E0%B9%80%E0%B8%9B%E0%B8%A5%E0%B8%B5%E0%B9%88%E0%B8%A2%E0%B8%99%E0%B8%82%E0%B9%89%E0%B8%AD%E0%B8%A1%E0%B8%B9%E0%B8%A5%E0%B8%94%E0%B9%89%E0%B8%B2/%E0%B8%81%E0%B8%B2%E0%B8%A3%E0%B9%81%E0%B8%A5%E0%B8%81%E0%B9%80%E0%B8%9B%E0%B8%A5%E0%B8%B5%E0%B9%88%E0%B8%A2%E0%B8%99%E0%B8%82%E0%B9%89%E0%B8%AD%E0%B8%A1%E0%B8%B9%E0%B8%A5-online-%E0%B8%9C%E0%B9%88/api-%E0%B8%AA%E0%B8%B3%E0%B8%AB%E0%B8%A3%E0%B8%B1%E0%B8%9A%E0%B8%AD%E0%B9%88%E0%B8%B2%E0%B8%99%E0%B8%82%E0%B9%89%E0%B8%AD%E0%B8%A1%E0%B8%B9%E0%B8%A5%E0%B8%99%E0%B9%89%E0%B8%B3%E0%B8%9D%E0%B8%99/

## Live public endpoint

The ThaiWater rainfall page uses this public endpoint for the 24-hour station table:

`https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h`

The response has `result: "OK"` and a `data` array. Each row includes `rain_24h`, `rain_1h`, `rainfall_datetime`, agency metadata, province code and names, station identity and coordinates, and basin metadata. On 23 September 2026 the endpoint returned 4,462 unique station IDs. Most timestamps were 06:00, 06:50, or 07:00 ICT; 1,941 stations reported positive 24-hour rainfall. The verification pipeline keeps valid stations in the current 04:00–08:00 ICT reporting window and retains zero-rainfall observations.

Live page: https://www.thaiwater.net/weather/rainfall

## Verification alignment

ThaiWater's 24-hour reporting day ends near 07:00 ICT, equal to 00:00 UTC. The V0.2 verification pipeline compares those station totals with the ECMWF IFS run from the previous 00:00 UTC at forecast step +24 hours. Station reporting times can differ by about one hour. Province forecast values are area-grid means; observed values are means across point stations, so the comparison is directional rather than a like-for-like areal validation.
