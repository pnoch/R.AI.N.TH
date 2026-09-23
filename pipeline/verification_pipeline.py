#!/usr/bin/env python3
"""Verify a 24-hour ECMWF forecast against current ThaiWater station observations.

The script aligns the ThaiWater reporting day ending near 07:00 ICT with the ECMWF
00Z-to-00Z 24-hour accumulation. Station values are aggregated by province and
compared with ECMWF province-area grid means. The result is an operational
verification snapshot, not a claim of hydrological impact or flood probability.
"""
from __future__ import annotations

import argparse
import json
import math
import tempfile
from collections import defaultdict
from datetime import datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import numpy as np
import requests
from eccodes import codes_get, codes_get_array, codes_grib_new_from_file, codes_release
from ecmwf.opendata import Client
from shapely.geometry import shape

try:
    from pipeline.ecmwf_pipeline import THAILAND_BOUNDS, THAI_PROVINCES, choose_values
except ModuleNotFoundError:
    from ecmwf_pipeline import THAILAND_BOUNDS, THAI_PROVINCES, choose_values

THAIWATER_RAIN24_URL = "https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h"
ICT = ZoneInfo("Asia/Bangkok")


def fetch_observations(url: str) -> list[dict[str, Any]]:
    response = requests.get(url, timeout=60, headers={"User-Agent": "RAIN-TH-Intelligence/0.2"})
    response.raise_for_status()
    payload = response.json()
    if payload.get("result") != "OK" or not isinstance(payload.get("data"), list):
        raise RuntimeError("ThaiWater returned an unexpected response")
    return payload["data"]


def clean_observations(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cleaned: dict[str, dict[str, Any]] = {}
    for row in rows:
        geocode = row.get("geocode") or {}
        station = row.get("station") or {}
        code = str(geocode.get("province_code") or "").strip().zfill(2)
        value = row.get("rain_24h")
        station_id = str(station.get("id") or row.get("id") or "")
        measured = row.get("rainfall_datetime")
        if code not in {iso.split("-")[1] for iso in THAI_PROVINCES}:
            continue
        if not station_id or not measured or not isinstance(value, (int, float)):
            continue
        if not math.isfinite(float(value)) or float(value) < 0 or float(value) > 2000:
            continue
        cleaned[station_id] = {
            "stationId": station_id,
            "provinceCode": code,
            "provinceIso": f"TH-{code}",
            "provinceNameTh": (geocode.get("province_name") or {}).get("th") or THAI_PROVINCES[f"TH-{code}"],
            "stationNameTh": (station.get("tele_station_name") or {}).get("th") or station_id,
            "latitude": station.get("tele_station_lat"),
            "longitude": station.get("tele_station_long"),
            "rain24hMm": float(value),
            "measuredAtLocal": measured,
            "agencyTh": ((row.get("agency") or {}).get("agency_shortname") or {}).get("th"),
        }
    return list(cleaned.values())


def reporting_window(stations: list[dict[str, Any]]) -> tuple[datetime, datetime]:
    observed_dates = [datetime.strptime(row["measuredAtLocal"], "%Y-%m-%d %H:%M").date() for row in stations]
    report_date = max(observed_dates)
    valid_end_local = datetime.combine(report_date, time(7, 0), tzinfo=ICT)
    valid_end_utc = valid_end_local.astimezone(timezone.utc)
    forecast_run_utc = valid_end_utc - timedelta(hours=24)
    return forecast_run_utc, valid_end_utc


def filter_current_reporting_window(
    stations: list[dict[str, Any]], valid_end_utc: datetime
) -> list[dict[str, Any]]:
    valid_end_local = valid_end_utc.astimezone(ICT)
    window_start = valid_end_local - timedelta(hours=3)
    window_end = valid_end_local + timedelta(hours=1)
    return [
        station
        for station in stations
        if window_start
        <= datetime.strptime(station["measuredAtLocal"], "%Y-%m-%d %H:%M").replace(tzinfo=ICT)
        <= window_end
    ]


def retrieve_forecast(target: Path, run_utc: datetime, source: str) -> None:
    client = Client(source=source, model="ifs", resol="0p25")
    client.retrieve(
        date=int(run_utc.strftime("%Y%m%d")),
        time=run_utc.hour,
        stream="oper",
        type="fc",
        levtype="sfc",
        param="tp",
        step=24,
        target=str(target),
    )


def load_forecast_field(grib_path: Path) -> tuple[dict[str, np.ndarray], dict[str, Any]]:
    with grib_path.open("rb") as stream:
        gid = codes_grib_new_from_file(stream)
        if gid is None:
            raise RuntimeError("No ECMWF field found in GRIB2 file")
        try:
            lats = codes_get_array(gid, "latitudes")
            lons = codes_get_array(gid, "longitudes")
            values_mm = codes_get_array(gid, "values") * 1000.0
            west, south, east, north = THAILAND_BOUNDS
            mask = (lats >= south) & (lats <= north) & (lons >= west) & (lons <= east)
            run_date = str(codes_get(gid, "dataDate"))
            run_time = int(codes_get(gid, "dataTime"))
            run_utc = datetime.strptime(f"{run_date}{run_time:04d}", "%Y%m%d%H%M").replace(tzinfo=timezone.utc)
            end_step = int(codes_get(gid, "endStep"))
            return (
                {"lats": lats[mask], "lons": lons[mask], "values": values_mm[mask]},
                {
                    "modelRunUtc": run_utc.isoformat().replace("+00:00", "Z"),
                    "validEndUtc": (run_utc + timedelta(hours=end_step)).isoformat().replace("+00:00", "Z"),
                    "forecastStepHours": end_step,
                },
            )
        finally:
            codes_release(gid)


def aggregate_observations(stations: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for station in stations:
        grouped[station["provinceIso"]].append(station)

    result: dict[str, dict[str, Any]] = {}
    for iso, rows in grouped.items():
        values = np.array([row["rain24hMm"] for row in rows], dtype=float)
        timestamps = [row["measuredAtLocal"] for row in rows]
        result[iso] = {
            "stationCount": len(rows),
            "observed24hMeanMm": round(float(np.mean(values)), 1),
            "observed24hMedianMm": round(float(np.median(values)), 1),
            "observed24hP90Mm": round(float(np.percentile(values, 90)), 1),
            "observed24hMaxMm": round(float(np.max(values)), 1),
            "latestMeasuredAtLocal": max(timestamps),
            "topStations": sorted(rows, key=lambda row: row["rain24hMm"], reverse=True)[:3],
        }
    return result


def pearson(xs: list[float], ys: list[float]) -> float | None:
    if len(xs) < 3:
        return None
    x = np.array(xs, dtype=float)
    y = np.array(ys, dtype=float)
    if float(np.std(x)) == 0 or float(np.std(y)) == 0:
        return None
    return round(float(np.corrcoef(x, y)[0, 1]), 3)


def build_verification(boundary_path: Path, grib_path: Path, stations: list[dict[str, Any]]) -> dict[str, Any]:
    boundaries = json.loads(boundary_path.read_text(encoding="utf-8"))
    field, forecast_meta = load_forecast_field(grib_path)
    observed = aggregate_observations(stations)
    provinces: list[dict[str, Any]] = []

    for feature in boundaries["features"]:
        iso = feature["properties"]["shapeISO"]
        geometry = shape(feature["geometry"])
        forecast_values, sampling = choose_values(geometry, field)
        forecast_mean = round(float(np.mean(forecast_values)), 1)
        forecast_p90 = round(float(np.percentile(forecast_values, 90)), 1)
        forecast_max = round(float(np.max(forecast_values)), 1)
        observation = observed.get(iso)
        observed_mean = observation["observed24hMeanMm"] if observation else None
        error = round(forecast_mean - observed_mean, 1) if observed_mean is not None else None
        provinces.append({
            "iso": iso,
            "nameTh": THAI_PROVINCES.get(iso, feature["properties"]["shapeName"]),
            "nameEn": feature["properties"]["shapeName"].removesuffix(" Province"),
            "forecast24hMeanMm": forecast_mean,
            "forecast24hP90Mm": forecast_p90,
            "forecast24hMaxMm": forecast_max,
            "forecastSampling": sampling,
            "forecastGridPointCount": int(forecast_values.size),
            **(observation or {
                "stationCount": 0,
                "observed24hMeanMm": None,
                "observed24hMedianMm": None,
                "observed24hP90Mm": None,
                "observed24hMaxMm": None,
                "latestMeasuredAtLocal": None,
                "topStations": [],
            }),
            "errorMm": error,
            "absoluteErrorMm": abs(error) if error is not None else None,
            "verificationBand": (
                "INSUFFICIENT_STATIONS" if not observation or observation["stationCount"] < 3
                else "WITHIN_10_MM" if abs(error) <= 10
                else "OVER_FORECAST" if error > 0
                else "UNDER_FORECAST"
            ),
        })

    eligible = [p for p in provinces if p["stationCount"] >= 3 and p["errorMm"] is not None]
    errors = [float(p["errorMm"]) for p in eligible]
    forecast_values = [float(p["forecast24hMeanMm"]) for p in eligible]
    observed_values = [float(p["observed24hMeanMm"]) for p in eligible]
    generated = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    valid_end = forecast_meta["validEndUtc"]

    return {
        "schemaVersion": "0.2.0",
        "verificationKey": f"ecmwf-thaiwater-{valid_end}",
        "generatedAtUtc": generated,
        "forecast": {
            "provider": "ECMWF",
            "model": "IFS",
            "resolution": "0.25°",
            "license": "CC BY 4.0",
            **forecast_meta,
        },
        "observations": {
            "provider": "ThaiWater / National Hydroinformatics Data Center",
            "endpoint": THAIWATER_RAIN24_URL,
            "retrievedStationCount": len(stations),
            "reportingWindow": "Station 24-hour totals ending near 07:00 ICT; station timestamps may differ by about one hour",
            "validEndUtc": valid_end,
        },
        "method": {
            "forecastMetric": "ECMWF province-area grid mean total precipitation",
            "observedMetric": "Mean of valid ThaiWater 24-hour station totals in each province",
            "eligibility": "At least 3 reporting stations in the province",
            "caveat": "Area-grid means and point-station means are not identical estimands; this is a directional verification screen",
        },
        "summary": {
            "provinceCount": len(provinces),
            "pairedProvinceCount": len(eligible),
            "stationCount": len(stations),
            "meanAbsoluteErrorMm": round(float(np.mean([abs(value) for value in errors])), 1) if errors else None,
            "meanBiasMm": round(float(np.mean(errors)), 1) if errors else None,
            "pearsonCorrelation": pearson(forecast_values, observed_values),
            "within10mmCount": sum(abs(value) <= 10 for value in errors),
            "within10mmRate": round(sum(abs(value) <= 10 for value in errors) / len(errors), 3) if errors else None,
        },
        "provinces": sorted(
            provinces,
            key=lambda row: (
                row["stationCount"] < 3,
                -(row["absoluteErrorMm"] if row["absoluteErrorMm"] is not None else -1),
            ),
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--boundaries", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--source", choices=("aws", "ecmwf", "azure", "google"), default="aws")
    parser.add_argument("--observations-url", default=THAIWATER_RAIN24_URL)
    parser.add_argument("--grib", type=Path)
    args = parser.parse_args()

    stations = clean_observations(fetch_observations(args.observations_url))
    forecast_run_utc, expected_valid_end = reporting_window(stations)
    stations = filter_current_reporting_window(stations, expected_valid_end)
    if args.grib:
        result = build_verification(args.boundaries, args.grib, stations)
    else:
        with tempfile.TemporaryDirectory(prefix="verification-th-") as tmp:
            grib_path = Path(tmp) / "tp-24h.grib2"
            retrieve_forecast(grib_path, forecast_run_utc, args.source)
            result = build_verification(args.boundaries, grib_path, stations)
    if result["forecast"]["validEndUtc"] != expected_valid_end.isoformat().replace("+00:00", "Z"):
        raise RuntimeError("Forecast valid time did not match the ThaiWater reporting window")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "verificationKey": result["verificationKey"],
        "forecastRunUtc": result["forecast"]["modelRunUtc"],
        "validEndUtc": result["forecast"]["validEndUtc"],
        "stations": result["summary"]["stationCount"],
        "pairedProvinces": result["summary"]["pairedProvinceCount"],
        "maeMm": result["summary"]["meanAbsoluteErrorMm"],
        "biasMm": result["summary"]["meanBiasMm"],
        "correlation": result["summary"]["pearsonCorrelation"],
        "output": str(args.output),
    }))


if __name__ == "__main__":
    main()
