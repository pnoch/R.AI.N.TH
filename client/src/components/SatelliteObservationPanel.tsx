import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import type { LocationResult } from "@shared/locationSearch";
import { Crosshair, DatabaseZap, Loader2, RefreshCw, Satellite, ScanLine } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

function formatBangkok(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function qualityLabel(value?: number | null) {
  if (value == null) return "UNKNOWN";
  if (value >= 0.75) return "HIGH";
  if (value >= 0.5) return "MEDIUM";
  return "LOW";
}

export default function SatelliteObservationPanel({
  selectedIso,
  selectedLocation,
}: {
  selectedIso: string;
  selectedLocation: LocationResult | null;
}) {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const latest = trpc.satellite.latest.useQuery(undefined, { refetchOnWindowFocus: false });
  const pointInput = useMemo(() => selectedLocation?.centerLat != null && selectedLocation?.centerLon != null ? {
    key: selectedLocation.key,
    latitude: selectedLocation.centerLat,
    longitude: selectedLocation.centerLon,
    nameTh: selectedLocation.nameTh,
    nameEn: selectedLocation.nameEn,
    provinceIso: selectedLocation.provinceIso,
  } : null, [selectedLocation]);
  const point = trpc.satellite.point.useQuery(pointInput ?? {
    key: "inactive",
    latitude: 13.75,
    longitude: 100.55,
  }, {
    enabled: Boolean(pointInput),
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const refresh = trpc.satellite.refresh.useMutation({
    onSuccess: async () => {
      await utils.satellite.latest.invalidate();
      toast.success("NASA IMERG representative points refreshed");
    },
    onError: error => toast.error(error.message),
  });

  if (latest.isLoading) {
    return <section className="satellite-panel satellite-loading"><Loader2 className="animate-spin" /> Loading NASA IMERG observations…</section>;
  }
  if (latest.error || !latest.data) {
    return <section className="satellite-panel satellite-error">Satellite observations unavailable: {latest.error?.message}</section>;
  }

  const data = latest.data as any;
  const province = data.provinces.find((item: any) => item.iso === selectedIso) ?? data.provinces[0];
  const selected = pointInput && point.data ? point.data as any : province;
  const selectedName = pointInput ? selectedLocation?.nameTh : province?.nameTh;
  const locationMode = pointInput ? "Selected administrative centroid" : "Representative provincial point";
  const freshnessHours = data.window.endUtc ? Math.max(0, (Date.now() - Date.parse(data.window.endUtc)) / 3_600_000) : null;

  return (
    <section className="satellite-panel">
      <div className="satellite-heading">
        <div className="satellite-title-icon"><Satellite /></div>
        <div>
          <p className="eyebrow">Independent observation / NASA GPM</p>
          <h2>IMERG Late satellite rainfall</h2>
          <p>Half-hourly precipitation · 0.1° (~10 km) · nominal ~14-hour latency</p>
        </div>
        <Button
          variant="outline"
          disabled={refresh.isPending}
          onClick={() => {
            if (!isAuthenticated) return startLogin();
            refresh.mutate();
          }}
        >{refresh.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh satellite</Button>
      </div>

      <div className="satellite-body">
        <article className="satellite-selected">
          <div className="satellite-selected-label"><Crosshair /><span>{locationMode}</span></div>
          <h3 lang="th">{selectedName || province?.nameTh}</h3>
          {point.isLoading && pointInput ? (
            <div className="satellite-point-loading"><Loader2 className="animate-spin" /> Sampling the nearest IMERG cell…</div>
          ) : point.error && pointInput ? (
            <p className="satellite-point-error">Selected-cell reading unavailable; the map still shows the last national representative-point snapshot.</p>
          ) : (
            <>
              <strong>{selected?.rain24hMm == null ? "—" : selected.rain24hMm}<small> mm / 24h</small></strong>
              <div className="satellite-selected-meta">
                <span>Grid {selected?.grid?.latitude?.toFixed?.(2) ?? "—"}°N, {selected?.grid?.longitude?.toFixed?.(2) ?? "—"}°E</span>
                <span>{selected?.validIntervals ?? 0}/{selected?.expectedIntervals ?? 48} half-hours</span>
                <Badge variant="outline">{qualityLabel(selected?.qualityIndexMean)} QUALITY</Badge>
              </div>
            </>
          )}
        </article>

        <div className="satellite-metrics">
          <article><ScanLine /><span>Representative max</span><b>{data.summary.representativeMax24hMm}<small> mm</small></b><em>{data.summary.maxProvinceNameTh}</em></article>
          <article><DatabaseZap /><span>Representative mean</span><b>{data.summary.representativeMean24hMm}<small> mm</small></b><em>{data.summary.representativePointCount} / {data.summary.provinceCount} points</em></article>
          <article><Satellite /><span>Data freshness</span><b>{freshnessHours == null ? "—" : freshnessHours.toFixed(1)}<small> h</small></b><em>through {formatBangkok(data.window.endUtc)} ICT</em></article>
        </div>
      </div>

      <div className="satellite-footnote">
        <strong>Interpretation</strong>
        <span>{data.method.caveat}</span>
        <span>{data.source.attribution}</span>
        <span>{data.persisted ? "Database snapshot" : "Bundled verified snapshot"} · snapshot {String(data.source.snapshotId || "—").slice(0, 12)}</span>
      </div>
    </section>
  );
}
