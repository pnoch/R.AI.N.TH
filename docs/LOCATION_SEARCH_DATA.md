# Location search and district overlay data

The V0.5 location finder uses the **Thailand Common Operational Dataset for Administrative Boundaries (COD-AB)** published by OCHA FISS on HDX and sourced from the Royal Thai Survey Department. The gazetteer contains **77 provinces, 928 districts, and 7,425 subdistricts** with Thai and English names, P-codes, area, and centroid coordinates. The dataset is licensed under CC BY 3.0 IGO.

District geometries come from the geoBoundaries Thailand ADM2 simplified release, which is derived from the same Royal Thai Survey Department/OCHA source. Because geoBoundaries normalizes away the original P-codes, `pipeline/build_location_assets.py` maps each official coded district centroid to the polygon that contains it. The builder requires a one-to-one result across all 928 districts and fails if a polygon is missing, duplicated, or ambiguous.

Postal codes are enrichment data from the MIT-licensed [Thailand Geography JSON](https://github.com/thailand-geography-data/thailand-geography-json) project. They do not affect geometry or forecast calculations.

## Generated assets

`server/data/location-index.json` contains compact province, district, and subdistrict tuples. `server/data/district-boundaries.json` is one indexed catalog containing 77 simplified province collections; the server returns only the requested province when a district or subdistrict is selected.

The index tuple schemas are:

```text
province:    [provinceCode, provinceNameTh, provinceNameEn]
district:    [provinceCode, districtCode, districtNameTh, districtNameEn, postalCode, centerLat, centerLon]
subdistrict: [provinceCode, districtCode, subdistrictCode, subdistrictNameTh, subdistrictNameEn, postalCode, centerLat, centerLon]
```

The source catalog records the known HDX caveat for district `TH1008`; the builder applies the documented correct Thai name, `ป้อมปราบศัตรูพ่าย`.

## Rebuilding

Install `openpyxl` and `shapely`, download the current HDX XLSX gazetteer, geoBoundaries ADM2 simplified GeoJSON, and Thailand Geography JSON subdistrict file, then run:

```bash
python3 pipeline/build_location_assets.py \
  --gazetteer /path/to/tha_admin_boundaries.xlsx \
  --adm2 /path/to/geoBoundaries-THA-ADM2_simplified.geojson \
  --postal-source /path/to/subdistricts.json \
  --output-index server/data/location-index.json \
  --output-boundaries server/data/district-boundaries.json
```

## Precision statement

District search and overlays improve **navigation and geographic context**, not model resolution. A selected district receives its real administrative boundary, and a selected subdistrict receives its official centroid marker inside the parent district. Rainfall values remain the parent province's aggregate from the ECMWF 0.25-degree grid. The interface states this limitation next to the search result, in the map readout, and in the briefing panel.
