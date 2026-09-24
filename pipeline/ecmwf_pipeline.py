#!/usr/bin/env python3
"""Direct ECMWF Open Data rainfall pipeline for Thailand.

Downloads deterministic IFS total-precipitation GRIB2 fields, aggregates grid cells
inside geoBoundaries ADM1 polygons, computes a transparent rainfall-only screening
score, and emits a self-describing JSON snapshot for the review dashboard.
"""
from __future__ import annotations

import argparse
import json
import math
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from eccodes import (
    codes_get,
    codes_get_array,
    codes_grib_new_from_file,
    codes_release,
)
from ecmwf.opendata import Client
from shapely import contains_xy
from shapely.geometry import mapping, shape

STEPS = (3, 24, 72)
THAILAND_BOUNDS = (96.0, 4.0, 107.0, 22.0)

THAI_PROVINCES = {
    "TH-10": "กรุงเทพมหานคร", "TH-11": "สมุทรปราการ", "TH-12": "นนทบุรี",
    "TH-13": "ปทุมธานี", "TH-14": "พระนครศรีอยุธยา", "TH-15": "อ่างทอง",
    "TH-16": "ลพบุรี", "TH-17": "สิงห์บุรี", "TH-18": "ชัยนาท",
    "TH-19": "สระบุรี", "TH-20": "ชลบุรี", "TH-21": "ระยอง",
    "TH-22": "จันทบุรี", "TH-23": "ตราด", "TH-24": "ฉะเชิงเทรา",
    "TH-25": "ปราจีนบุรี", "TH-26": "นครนายก", "TH-27": "สระแก้ว",
    "TH-30": "นครราชสีมา", "TH-31": "บุรีรัมย์", "TH-32": "สุรินทร์",
    "TH-33": "ศรีสะเกษ", "TH-34": "อุบลราชธานี", "TH-35": "ยโสธร",
    "TH-36": "ชัยภูมิ", "TH-37": "อำนาจเจริญ", "TH-38": "บึงกาฬ",
    "TH-39": "หนองบัวลำภู", "TH-40": "ขอนแก่น", "TH-41": "อุดรธานี",
    "TH-42": "เลย", "TH-43": "หนองคาย", "TH-44": "มหาสารคาม",
    "TH-45": "ร้อยเอ็ด", "TH-46": "กาฬสินธุ์", "TH-47": "สกลนคร",
    "TH-48": "นครพนม", "TH-49": "มุกดาหาร", "TH-50": "เชียงใหม่",
    "TH-51": "ลำพูน", "TH-52": "ลำปาง", "TH-53": "อุตรดิตถ์",
    "TH-54": "แพร่", "TH-55": "น่าน", "TH-56": "พะเยา",
    "TH-57": "เชียงราย", "TH-58": "แม่ฮ่องสอน", "TH-60": "นครสวรรค์",
    "TH-61": "อุทัยธานี", "TH-62": "กำแพงเพชร", "TH-63": "ตาก",
    "TH-64": "สุโขทัย", "TH-65": "พิษณุโลก", "TH-66": "พิจิตร",
    "TH-67": "เพชรบูรณ์", "TH-70": "ราชบุรี", "TH-71": "กาญจนบุรี",
    "TH-72": "สุพรรณบุรี", "TH-73": "นครปฐม", "TH-74": "สมุทรสาคร",
    "TH-75": "สมุทรสงคราม", "TH-76": "เพชรบุรี", "TH-77": "ประจวบคีรีขันธ์",
    "TH-80": "นครศรีธรรมราช", "TH-81": "กระบี่", "TH-82": "พังงา",
    "TH-83": "ภูเก็ต", "TH-84": "สุราษฎร์ธานี", "TH-85": "ระนอง",
    "TH-86": "ชุมพร", "TH-90": "สงขลา", "TH-91": "สตูล",
    "TH-92": "ตรัง", "TH-93": "พัทลุง", "TH-94": "ปัตตานี",
    "TH-95": "ยะลา", "TH-96": "นราธิวาส",
}


def clip(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def scale(value: float, start: float, full: float, points: float) -> float:
    if value <= start:
        return 0.0
    return clip((value - start) / (full - start), 0.0, 1.0) * points


def risk_score(mean24: float, p90_24: float, max24: float, mean72: float, frac50: float) -> int:
    """Rainfall-only screening score; weights are intentionally explicit and testable."""
    score = (
        scale(mean24, 5, 80, 40)
        + scale(p90_24, 10, 120, 20)
        + scale(max24, 20, 150, 10)
        + scale(mean72, 20, 140, 25)
        + clip(frac50, 0, 1) * 5
    )
    return int(round(clip(score)))


def risk_level(score: int) -> str:
    if score >= 85:
        return "EXTREME"
    if score >= 70:
        return "VERY_HIGH"
    if score >= 50:
        return "HIGH"
    if score >= 25:
        return "ELEVATED"
    return "LOW"


def confidence(point_count: int, sampling: str) -> str:
    if sampling == "nearest" or point_count < 3:
        return "LOW"
    if point_count < 8:
        return "MEDIUM"
    return "MEDIUM"


def load_fields(grib_path: Path) -> tuple[dict[int, dict[str, np.ndarray]], dict[str, Any]]:
    fields: dict[int, dict[str, np.ndarray]] = {}
    run_meta: dict[str, Any] | None = None
    with grib_path.open("rb") as stream:
        while True:
            gid = codes_grib_new_from_file(stream)
            if gid is None:
                break
            try:
                step = int(codes_get(gid, "endStep"))
                if step not in STEPS:
                    continue
                lats = codes_get_array(gid, "latitudes")
                lons = codes_get_array(gid, "longitudes")
                values_mm = codes_get_array(gid, "values") * 1000.0
                west, south, east, north = THAILAND_BOUNDS
                mask = (lats >= south) & (lats <= north) & (lons >= west) & (lons <= east)
                fields[step] = {
                    "lats": lats[mask],
                    "lons": lons[mask],
                    "values": values_mm[mask],
                }
                if run_meta is None:
                    date = str(codes_get(gid, "dataDate"))
                    time = int(codes_get(gid, "dataTime"))
                    run_dt = datetime.strptime(f"{date}{time:04d}", "%Y%m%d%H%M").replace(tzinfo=timezone.utc)
                    run_meta = {
                        "model": "ECMWF IFS",
                        "resolution": "0.25°",
                        "modelRunUtc": run_dt.isoformat().replace("+00:00", "Z"),
                        "parameter": "tp",
                        "parameterName": "Total precipitation",
                        "units": "mm",
                        "forecastStepsHours": list(STEPS),
                    }
            finally:
                codes_release(gid)
    missing = sorted(set(STEPS) - set(fields))
    if missing or run_meta is None:
        raise RuntimeError(f"Missing ECMWF GRIB fields for forecast steps: {missing}")
    return fields, run_meta


def choose_values(geometry: Any, field: dict[str, np.ndarray]) -> tuple[np.ndarray, str]:
    lats, lons, values = field["lats"], field["lons"], field["values"]
    selected = contains_xy(geometry, lons, lats)
    if selected.any():
        return values[selected], "polygon_grid_cells"
    representative = geometry.representative_point()
    distances = (lons - representative.x) ** 2 + (lats - representative.y) ** 2
    index = int(np.argmin(distances))
    return values[index:index + 1], "nearest_grid_cell"


def province_metrics(boundaries: dict[str, Any], fields: dict[int, dict[str, np.ndarray]]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for feature in boundaries["features"]:
        props = feature["properties"]
        iso = props["shapeISO"]
        geometry = shape(feature["geometry"])
        step_values: dict[int, np.ndarray] = {}
        sampling = "polygon_grid_cells"
        for step, field in fields.items():
            values, method = choose_values(geometry, field)
            step_values[step] = values
            if method == "nearest_grid_cell":
                sampling = method
        values24 = step_values[24]
        values72 = step_values[72]
        mean24 = float(np.mean(values24))
        p90_24 = float(np.percentile(values24, 90))
        max24 = float(np.max(values24))
        mean72 = float(np.mean(values72))
        frac50 = float(np.mean(values24 >= 50.0))
        score = risk_score(mean24, p90_24, max24, mean72, frac50)
        point = geometry.representative_point()
        records.append({
            "iso": iso,
            "nameEn": props["shapeName"].removesuffix(" Province"),
            "nameTh": THAI_PROVINCES.get(iso, props["shapeName"]),
            "centroid": [round(point.x, 5), round(point.y, 5)],
            "rainMm": {
                "3hMean": round(float(np.mean(step_values[3])), 1),
                "24hMean": round(mean24, 1),
                "24hP90": round(p90_24, 1),
                "24hMax": round(max24, 1),
                "72hMean": round(mean72, 1),
                "72hMax": round(float(np.max(values72)), 1),
            },
            "riskScore": score,
            "riskLevel": risk_level(score),
            "confidence": confidence(int(values24.size), sampling),
            "sampling": sampling,
            "gridPointCount": int(values24.size),
        })
    return sorted(records, key=lambda item: (-item["riskScore"], -item["rainMm"]["24hMean"]))


def make_draft(provinces: list[dict[str, Any]], run_meta: dict[str, Any], generated_at: str) -> str:
    top = provinces[:5]
    top_list = " · ".join(f"{p['nameTh']} {p['rainMm']['24hMean']:.0f} มม." for p in top)
    highest = top[0]
    return (
        f"จับตาฝนสะสม 24 ชั่วโมงจากแบบจำลอง ECMWF รอบ {run_meta['modelRunUtc']}\n\n"
        f"พื้นที่ที่ระบบประเมินความเสี่ยงจากฝนสูงสุด: {top_list}\n\n"
        f"{highest['nameTh']} มีค่าฝนเฉลี่ยเชิงพื้นที่ 24 ชม. ประมาณ "
        f"{highest['rainMm']['24hMean']:.0f} มม. และค่าสูงสุดในกริดประมาณ "
        f"{highest['rainMm']['24hMax']:.0f} มม.\n\n"
        "สถานะ: OUR RISK ANALYSIS — เป็นการคัดกรองจากปริมาณฝนของแบบจำลองเดียว "
        "ไม่ใช่ประกาศเตือนภัยอย่างเป็นทางการ คะแนนนี้ยังไม่รวมระดับน้ำ สภาพดิน หรือเรดาร์ "
        "ซึ่งแสดงเป็นชั้นข้อมูลหลักฐานแยกต่างหาก\n\n"
        f"ข้อมูล: ECMWF IFS Open Data 0.25° | สร้างเมื่อ {generated_at} | "
        "ควรตรวจสอบประกาศล่าสุดจากกรมอุตุนิยมวิทยาและหน่วยงานป้องกันภัย"
    )


def display_boundaries(boundaries: dict[str, Any]) -> dict[str, Any]:
    """Return lighter geometry for the browser without changing aggregation inputs."""
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "shapeName": feature["properties"]["shapeName"],
                    "shapeISO": feature["properties"]["shapeISO"],
                },
                "geometry": mapping(shape(feature["geometry"]).simplify(0.015, preserve_topology=True)),
            }
            for feature in boundaries["features"]
        ],
    }


def build_snapshot(boundary_path: Path, grib_path: Path) -> dict[str, Any]:
    boundaries = json.loads(boundary_path.read_text(encoding="utf-8"))
    fields, run_meta = load_fields(grib_path)
    provinces = province_metrics(boundaries, fields)
    generated_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    run_key = f"ifs-{run_meta['modelRunUtc']}-tp-3-24-72"
    return {
        "schemaVersion": "0.1.0",
        "runKey": run_key,
        "generatedAtUtc": generated_at,
        "source": {
            **run_meta,
            "provider": "ECMWF",
            "dataset": "IFS Open Data",
            "license": "CC BY 4.0",
            "attribution": "Contains modified Copernicus Climate Change Service information / ECMWF data",
            "directAccess": True,
        },
        "analysis": {
            "type": "OUR_RISK_ANALYSIS",
            "title": "Rainfall-only impact screening",
            "officialWarningStatus": "SEPARATE_TMD_FEED",
            "officialWarningLabel": "ตรวจประกาศทางการจาก TMD ในชั้นข้อมูลแยก",
            "limitations": [
                "Single deterministic ECMWF model only",
                "ECMWF score excludes river levels, soil moisture, radar, observations, and population exposure; observed layers are shown separately",
                "0.25° grid can require nearest-cell sampling for small provinces",
                "Scores are relative screening indicators, not probabilities or official warnings",
            ],
            "scoreFormula": {
                "24hMean": "40 points: linear from 5 to 80 mm",
                "24hP90": "20 points: linear from 10 to 120 mm",
                "24hMax": "10 points: linear from 20 to 150 mm",
                "72hMean": "25 points: linear from 20 to 140 mm",
                "fractionAbove50mm24h": "5 points",
            },
        },
        "summary": {
            "provinceCount": len(provinces),
            "highOrAboveCount": sum(p["riskScore"] >= 50 for p in provinces),
            "veryHighOrAboveCount": sum(p["riskScore"] >= 70 for p in provinces),
            "topProvinceIso": provinces[0]["iso"],
            "nationalMean24hMm": round(float(np.mean([p["rainMm"]["24hMean"] for p in provinces])), 1),
        },
        "provinces": provinces,
        "boundaries": display_boundaries(boundaries),
        "draft": {
            "status": "DRAFT",
            "generatedBy": "deterministic-template-v0.1",
            "textTh": make_draft(provinces, run_meta, generated_at),
            "approvedAtUtc": None,
            "publishedAtUtc": None,
        },
    }


def retrieve_grib(target: Path, source: str) -> None:
    client = Client(source=source, model="ifs", resol="0p25")
    client.retrieve(
        stream="oper",
        type="fc",
        levtype="sfc",
        param="tp",
        step=list(STEPS),
        target=str(target),
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--boundaries", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--source", choices=("aws", "ecmwf", "azure", "google"), default="aws")
    parser.add_argument("--grib", type=Path, help="Use an existing GRIB2 file instead of downloading")
    args = parser.parse_args()

    if args.grib:
        snapshot = build_snapshot(args.boundaries, args.grib)
    else:
        with tempfile.TemporaryDirectory(prefix="ecmwf-th-") as tmp:
            grib_path = Path(tmp) / "tp.grib2"
            retrieve_grib(grib_path, args.source)
            snapshot = build_snapshot(args.boundaries, grib_path)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "runKey": snapshot["runKey"],
        "modelRunUtc": snapshot["source"]["modelRunUtc"],
        "generatedAtUtc": snapshot["generatedAtUtc"],
        "provinces": snapshot["summary"]["provinceCount"],
        "topProvince": snapshot["summary"]["topProvinceIso"],
        "output": str(args.output),
    }))


if __name__ == "__main__":
    main()
