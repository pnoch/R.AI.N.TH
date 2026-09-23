import { useMemo, useState } from "react";

type Metric = "risk" | "24h" | "72h";

type Props = {
  boundaries: any;
  provinces: any[];
  selectedIso: string;
  onSelect: (iso: string) => void;
};

const VIEWBOX = { width: 520, height: 740, west: 96, east: 107, south: 4, north: 22 };

function project(point: number[]) {
  const [lon, lat] = point;
  return [
    ((lon - VIEWBOX.west) / (VIEWBOX.east - VIEWBOX.west)) * VIEWBOX.width,
    ((VIEWBOX.north - lat) / (VIEWBOX.north - VIEWBOX.south)) * VIEWBOX.height,
  ];
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
  if (geometry.type === "Polygon") {
    return geometry.coordinates.map(ringPath).join(" ");
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flatMap((polygon: number[][][]) => polygon.map(ringPath)).join(" ");
  }
  return "";
}

function palette(value: number, metric: Metric) {
  const max = metric === "risk" ? 100 : metric === "24h" ? 100 : 220;
  const t = Math.max(0, Math.min(1, value / max));
  if (t < 0.08) return "#162838";
  if (t < 0.2) return "#164e63";
  if (t < 0.38) return "#0f8c8c";
  if (t < 0.56) return "#8daa43";
  if (t < 0.72) return "#efb33c";
  if (t < 0.86) return "#ef7139";
  return "#dc3d5a";
}

function metricValue(province: any, metric: Metric) {
  if (!province) return 0;
  if (metric === "risk") return province.riskScore;
  if (metric === "24h") return province.rainMm["24hMean"];
  return province.rainMm["72hMean"];
}

function metricLabel(province: any, metric: Metric) {
  if (!province) return "—";
  if (metric === "risk") return `${province.riskScore}/100 · ${province.riskLevel}`;
  if (metric === "24h") return `${province.rainMm["24hMean"].toFixed(1)} mm / 24h`;
  return `${province.rainMm["72hMean"].toFixed(1)} mm / 72h`;
}

export default function ThailandRiskMap({ boundaries, provinces, selectedIso, onSelect }: Props) {
  const [metric, setMetric] = useState<Metric>("risk");
  const [hoveredIso, setHoveredIso] = useState<string | null>(null);
  const provinceByIso = useMemo(
    () => new Map(provinces.map(province => [province.iso, province])),
    [provinces],
  );
  const active = provinceByIso.get(hoveredIso || selectedIso);

  return (
    <section className="map-shell">
      <div className="map-toolbar">
        <div>
          <p className="eyebrow">Spatial signal</p>
          <h2>Thailand rainfall screen</h2>
        </div>
        <div className="metric-toggle" aria-label="Map metric">
          {([
            ["risk", "Risk score"],
            ["24h", "24h rain"],
            ["72h", "72h rain"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              className={metric === value ? "active" : ""}
              onClick={() => setMetric(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="map-stage">
        <div className="map-readout" aria-live="polite">
          <span>{active?.nameTh || "เลือกจังหวัด"}</span>
          <strong>{metricLabel(active, metric)}</strong>
          {active ? <small>{active.gridPointCount} grid cells · {active.confidence} confidence</small> : null}
        </div>
        <svg
          className="thailand-map"
          viewBox={`0 0 ${VIEWBOX.width} ${VIEWBOX.height}`}
          role="img"
          aria-label="Interactive map of Thailand province rainfall risk"
        >
          <defs>
            <filter id="map-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <g transform="translate(12 2) scale(.93)">
            {boundaries.features.map((feature: any) => {
              const iso = feature.properties.shapeISO;
              const province = provinceByIso.get(iso);
              const selected = iso === selectedIso;
              return (
                <path
                  key={iso}
                  d={geometryPath(feature.geometry)}
                  fill={palette(metricValue(province, metric), metric)}
                  stroke={selected ? "#f7d774" : "#8db6bd"}
                  strokeOpacity={selected ? 1 : 0.48}
                  strokeWidth={selected ? 2.4 : 0.7}
                  vectorEffect="non-scaling-stroke"
                  filter={selected ? "url(#map-glow)" : undefined}
                  className="province-path"
                  onMouseEnter={() => setHoveredIso(iso)}
                  onMouseLeave={() => setHoveredIso(null)}
                  onClick={() => onSelect(iso)}
                  tabIndex={0}
                  aria-label={`${province?.nameTh || feature.properties.shapeName}: ${metricLabel(province, metric)}`}
                  onKeyDown={event => {
                    if (event.key === "Enter" || event.key === " ") onSelect(iso);
                  }}
                />
              );
            })}
          </g>
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
