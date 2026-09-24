import type { LocationResult } from "@shared/locationSearch";
import { useMemo, useState } from "react";

type Metric = "risk" | "24h" | "72h" | "satellite";

type Props = {
  boundaries: any;
  districtBoundaries?: any;
  provinces: any[];
  satelliteProvinces?: any[];
  selectedIso: string;
  selectedLocation: LocationResult | null;
  onSelect: (iso: string) => void;
};

const VIEWBOX = { width: 520, height: 740, west: 96, east: 107, south: 4, north: 22 };
const MAP_TRANSFORM = { x: 12, y: 2, scale: 0.93 };

function project(point: number[]) {
  const [lon, lat] = point;
  return [
    ((lon - VIEWBOX.west) / (VIEWBOX.east - VIEWBOX.west)) * VIEWBOX.width,
    ((VIEWBOX.north - lat) / (VIEWBOX.north - VIEWBOX.south)) * VIEWBOX.height,
  ];
}

function transformed(point: number[]) {
  const [x, y] = project(point);
  return [MAP_TRANSFORM.x + x * MAP_TRANSFORM.scale, MAP_TRANSFORM.y + y * MAP_TRANSFORM.scale];
}

function ringPath(ring: number[][]) {
  return ring
    .map((point, index) => {
      const [x, y] = project(point);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ") + " Z";
}

function geometryPath(geometry: any) {
  if (geometry.type === "Polygon") return geometry.coordinates.map(ringPath).join(" ");
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flatMap((polygon: number[][][]) => polygon.map(ringPath)).join(" ");
  }
  return "";
}

function geometryPoints(geometry: any): number[][] {
  if (geometry.type === "Polygon") return geometry.coordinates.flat();
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat(2);
  return [];
}

function focusedViewBox(feature?: any) {
  if (!feature) return `0 0 ${VIEWBOX.width} ${VIEWBOX.height}`;
  const points = geometryPoints(feature.geometry).map(transformed);
  if (!points.length) return `0 0 ${VIEWBOX.width} ${VIEWBOX.height}`;
  const xs = points.map(point => point[0]);
  const ys = points.map(point => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(maxX - minX, 34);
  const height = Math.max(maxY - minY, 34);
  const padding = Math.max(width, height) * 0.5;
  return `${(minX - padding).toFixed(2)} ${(minY - padding).toFixed(2)} ${(width + padding * 2).toFixed(2)} ${(height + padding * 2).toFixed(2)}`;
}

function palette(value: number, metric: Metric) {
  const max = metric === "risk" ? 100 : metric === "72h" ? 220 : 100;
  const t = Math.max(0, Math.min(1, value / max));
  if (t < 0.08) return "#162838";
  if (t < 0.2) return "#164e63";
  if (t < 0.38) return "#0f8c8c";
  if (t < 0.56) return "#8daa43";
  if (t < 0.72) return "#efb33c";
  if (t < 0.86) return "#ef7139";
  return "#dc3d5a";
}

function metricValue(province: any, metric: Metric, satelliteProvince?: any) {
  if (!province) return 0;
  if (metric === "risk") return province.riskScore;
  if (metric === "24h") return province.rainMm["24hMean"];
  if (metric === "satellite") return satelliteProvince?.rain24hMm ?? 0;
  return province.rainMm["72hMean"];
}

function metricLabel(province: any, metric: Metric, satelliteProvince?: any) {
  if (!province) return "—";
  if (metric === "risk") return `${province.riskScore}/100 · ${province.riskLevel}`;
  if (metric === "24h") return `${province.rainMm["24hMean"].toFixed(1)} mm / 24h`;
  if (metric === "satellite") return satelliteProvince?.rain24hMm == null ? "No complete IMERG window" : `${satelliteProvince.rain24hMm.toFixed(1)} mm / 24h`;
  return `${province.rainMm["72hMean"].toFixed(1)} mm / 72h`;
}

export default function ThailandRiskMap({
  boundaries,
  districtBoundaries,
  provinces,
  satelliteProvinces = [],
  selectedIso,
  selectedLocation,
  onSelect,
}: Props) {
  const [metric, setMetric] = useState<Metric>("risk");
  const [hoveredIso, setHoveredIso] = useState<string | null>(null);
  const provinceByIso = useMemo(
    () => new Map(provinces.map(province => [province.iso, province])),
    [provinces],
  );
  const satelliteByIso = useMemo(
    () => new Map(satelliteProvinces.map(province => [province.iso, province])),
    [satelliteProvinces],
  );
  const active = provinceByIso.get(hoveredIso || selectedIso);
  const activeSatellite = satelliteByIso.get(hoveredIso || selectedIso);
  const selectedDistrict = districtBoundaries?.features?.find(
    (feature: any) => feature.properties.districtCode === selectedLocation?.districtCode,
  );
  const mapViewBox = focusedViewBox(selectedDistrict);
  const locationPoint = selectedLocation?.centerLon && selectedLocation?.centerLat
    ? transformed([selectedLocation.centerLon, selectedLocation.centerLat])
    : null;

  return (
    <section className="map-shell">
      <div className="map-toolbar">
        <div>
          <p className="eyebrow">Spatial signal</p>
          <h2>{selectedDistrict ? "District boundary focus" : "Thailand rainfall screen"}</h2>
        </div>
        <div className="metric-toggle" aria-label="Map metric">
          {([
            ["risk", "Risk score"],
            ["24h", "24h rain"],
            ["72h", "72h rain"],
            ["satellite", "Sat 24h"],
          ] as const).map(([value, label]) => (
            <button key={value} className={metric === value ? "active" : ""} onClick={() => setMetric(value)} type="button">
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="map-stage">
        <div className="map-readout" aria-live="polite">
          <span>{selectedLocation?.nameTh || active?.nameTh || "เลือกจังหวัด"}</span>
          <strong>{metricLabel(active, metric, activeSatellite)}</strong>
          {active ? (
            <small>
              {metric === "satellite"
                ? "IMERG 0.1° · representative cell, not province mean"
                : selectedDistrict
                  ? "ขอบเขตอำเภอ/เขต · ค่าคาดการณ์ระดับจังหวัด"
                  : `${active.gridPointCount} grid cells · ${active.confidence} confidence`}
            </small>
          ) : null}
        </div>
        <svg
          className={selectedDistrict ? "thailand-map district-focus" : "thailand-map"}
          viewBox={mapViewBox}
          role="img"
          aria-label="Interactive map of Thailand province rainfall risk with selected district overlay"
        >
          <defs>
            <filter id="map-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <g transform={`translate(${MAP_TRANSFORM.x} ${MAP_TRANSFORM.y}) scale(${MAP_TRANSFORM.scale})`}>
            {boundaries.features.map((feature: any) => {
              const iso = feature.properties.shapeISO;
              const province = provinceByIso.get(iso);
              const selected = iso === selectedIso;
              return (
                <path
                  key={iso}
                  d={geometryPath(feature.geometry)}
                  fill={palette(metricValue(province, metric, satelliteByIso.get(iso)), metric)}
                  stroke={selected ? "#f7d774" : "#8db6bd"}
                  strokeOpacity={selected ? 1 : 0.48}
                  strokeWidth={selected ? 2.4 : 0.7}
                  vectorEffect="non-scaling-stroke"
                  filter={selected && !selectedDistrict ? "url(#map-glow)" : undefined}
                  className="province-path"
                  onMouseEnter={() => setHoveredIso(iso)}
                  onMouseLeave={() => setHoveredIso(null)}
                  onClick={() => onSelect(iso)}
                  tabIndex={0}
                  aria-label={`${province?.nameTh || feature.properties.shapeName}: ${metricLabel(province, metric, satelliteByIso.get(iso))}`}
                  onKeyDown={event => {
                    if (event.key === "Enter" || event.key === " ") onSelect(iso);
                  }}
                />
              );
            })}
            {districtBoundaries?.features?.map((feature: any) => {
              const selected = feature.properties.districtCode === selectedLocation?.districtCode;
              return (
                <path
                  key={`district-${feature.properties.districtCode}`}
                  d={geometryPath(feature.geometry)}
                  className={selected ? "district-path selected" : "district-path"}
                  vectorEffect="non-scaling-stroke"
                  aria-hidden="true"
                />
              );
            })}
          </g>
          {locationPoint ? (
            <g className="location-pin" transform={`translate(${locationPoint[0]} ${locationPoint[1]})`} aria-hidden="true">
              <circle r="9" />
              <circle r="3" />
            </g>
          ) : null}
        </svg>
        <div className="map-legend">
          <span>Lower</span>
          <i className="legend-gradient" />
          <span>Higher</span>
        </div>
      </div>
    </section>
  );
}
