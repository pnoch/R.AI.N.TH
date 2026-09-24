import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import type { LocationResult } from "@shared/locationSearch";
import { Crosshair, ExternalLink, Gauge, Loader2, Radar, RefreshCw, TimerReset } from "lucide-react";
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

function trendLabel(value?: string | null) {
  if (value === "INTENSIFYING") return "INTENSIFYING";
  if (value === "WEAKENING") return "WEAKENING";
  if (value === "DRY") return "DRY";
  if (value === "STEADY") return "STEADY";
  return "NO DATA";
}

function RadarAnimationMap({
  timeline,
  latitude,
  longitude,
  selectedName,
}: {
  timeline: any;
  latitude: number;
  longitude: number;
  selectedName: string;
}) {
  const frames = Array.isArray(timeline?.frames) ? timeline.frames : [];
  const currentFrame = frames.at(-1);
  const hostedMapUrl = timeline?.hostedMapUrl || "https://www.rainviewer.com/map.html";
  const embedUrl = `${hostedMapUrl}?loc=${latitude.toFixed(5)},${longitude.toFixed(5)},6&ts=2&oAP=1&oFa=1&oC=1&oU=0&oCS=1&c=2`;

  return (
    <div className="radar-animation-card">
      <div className="radar-animation-toolbar">
        <div>
          <span>RainViewer hosted visual mosaic</span>
          <b>{formatBangkok(currentFrame?.timeUtc)} ICT</b>
        </div>
        <a href={embedUrl} target="_blank" rel="noreferrer"><ExternalLink /> Open RainViewer</a>
      </div>
      <iframe
        key={embedUrl}
        className="radar-hosted-embed"
        src={embedUrl}
        title={`RainViewer hosted radar animation around ${selectedName}`}
        sandbox="allow-scripts allow-same-origin allow-popups"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
      <div className="radar-animation-note">Hosted RainViewer animation · past two hours · selected centroid {latitude.toFixed(3)}°N, {longitude.toFixed(3)}°E · not used for numeric calculations</div>
    </div>
  );
}

export default function RadarNowcastPanel({
  selectedIso,
  selectedLocation,
}: {
  selectedIso: string;
  selectedLocation: LocationResult | null;
}) {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const latest = trpc.radar.latest.useQuery(undefined, { refetchOnWindowFocus: false });
  const pointInput = useMemo(() => selectedLocation?.centerLat != null && selectedLocation?.centerLon != null ? {
    key: selectedLocation.key,
    latitude: selectedLocation.centerLat,
    longitude: selectedLocation.centerLon,
    nameTh: selectedLocation.nameTh,
    nameEn: selectedLocation.nameEn,
    provinceIso: selectedLocation.provinceIso,
  } : null, [selectedLocation]);
  const point = trpc.radar.point.useQuery(pointInput ?? {
    key: "inactive",
    latitude: 13.75,
    longitude: 100.55,
  }, {
    enabled: Boolean(pointInput),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const refresh = trpc.radar.refresh.useMutation({
    onSuccess: async () => {
      await utils.radar.latest.invalidate();
      if (pointInput) await utils.radar.point.invalidate(pointInput);
      toast.success("Official TMD radar frames refreshed");
    },
    onError: error => toast.error(error.message),
  });

  if (latest.isLoading) {
    return <section className="radar-nowcast-panel radar-loading"><Loader2 className="animate-spin" /> Loading official TMD radar frames…</section>;
  }
  if (latest.error || !latest.data) {
    return <section className="radar-nowcast-panel radar-error">Official radar data unavailable: {latest.error?.message}</section>;
  }

  const data = latest.data as any;
  const province = data.provinces.find((item: any) => item.iso === selectedIso) ?? data.provinces[0];
  const selected = pointInput && point.data ? point.data as any : province;
  const selectedName = pointInput ? selectedLocation?.nameTh || province.nameTh : province.nameTh;
  const latitude = pointInput ? pointInput.latitude : province.latitude;
  const longitude = pointInput ? pointInput.longitude : province.longitude;
  const freshnessMinutes = data.window.endUtc ? Math.max(0, (Date.now() - Date.parse(data.window.endUtc)) / 60_000) : null;

  return (
    <section id="radar-nowcast" className="radar-nowcast-panel">
      <div className="radar-heading">
        <div className="radar-title-icon"><Radar /></div>
        <div>
          <p className="eyebrow">Near-real-time observation / official TMD + RainViewer</p>
          <h2>Radar trend &amp; visual mosaic</h2>
          <p>Official 15-minute PCAPPI composite · five-frame quantitative trend · independent visual animation</p>
        </div>
        <Button
          variant="outline"
          disabled={refresh.isPending}
          onClick={() => {
            if (!isAuthenticated) return startLogin();
            refresh.mutate();
          }}
        >{refresh.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh radar</Button>
      </div>

      <div className="radar-dual-grid">
        <div className="radar-quant-card">
          <div className="radar-source-badge"><Badge variant="outline">OFFICIAL NUMERIC LAYER</Badge><span>TMD</span></div>
          <div className="radar-selected-label"><Crosshair /><span>{pointInput ? "Selected administrative centroid" : "Representative provincial point"}</span></div>
          <h3 lang="th">{selectedName}</h3>
          {point.isLoading && pointInput ? (
            <div className="radar-point-loading"><Loader2 className="animate-spin" /> Sampling five official radar frames…</div>
          ) : point.error && pointInput ? (
            <p className="radar-point-error">Selected-point trend unavailable; showing the last representative province snapshot.</p>
          ) : (
            <>
              <div className="radar-current">
                <strong>{selected?.latestRateMmH ?? "—"}<small> mm/h</small></strong>
                <Badge className={`radar-trend radar-trend-${String(selected?.trend || "no_data").toLowerCase()}`}>{trendLabel(selected?.trend)}</Badge>
              </div>
              <div className="radar-selected-meta">
                <span>{selected?.oneHourAccumMm ?? "—"} mm indicative last hour</span>
                <span>{latitude.toFixed(3)}°N, {longitude.toFixed(3)}°E</span>
                <span>{freshnessMinutes == null ? "—" : freshnessMinutes.toFixed(0)} min old</span>
              </div>
              <div className="radar-persistence-grid">
                {(selected?.persistenceAdditionalMm ?? []).map((item: any) => (
                  <article key={item.minutes}>
                    <span>+{item.minutes} MIN</span>
                    <b>{item.millimeters ?? "—"}<small> mm</small></b>
                  </article>
                ))}
              </div>
            </>
          )}
          <div className="radar-national-summary">
            <article><Gauge /><span>Representative max</span><b>{data.summary.representativeMaxRateMmH}<small> mm/h</small></b><em>{data.summary.maxProvinceNameTh}</em></article>
            <article><TimerReset /><span>Raining points</span><b>{data.summary.rainingPointCount}<small> / 77</small></b><em>{data.summary.intensifyingPointCount} intensifying</em></article>
          </div>
        </div>

        {data.rainViewer?.frames?.length ? (
          <RadarAnimationMap
            timeline={data.rainViewer}
            latitude={latitude}
            longitude={longitude}
            selectedName={selectedName}
          />
        ) : (
          <div className="radar-animation-card radar-animation-error">RainViewer visual mosaic unavailable. Official TMD numeric readings remain available.</div>
        )}
      </div>

      <div className="radar-footnote">
        <strong>Interpretation boundary</strong>
        <span>{data.method.nowcast}</span>
        <span>{data.method.caveat}</span>
        <span>Official numeric source: <a href={data.source.viewerUrl} target="_blank" rel="noreferrer">Thai Meteorological Department</a>. {data.rainViewer?.attribution}</span>
        <span>{data.persisted ? "Database snapshot" : "Bundled verified snapshot"} · observed {formatBangkok(data.window.endUtc)} ICT</span>
      </div>
    </section>
  );
}
