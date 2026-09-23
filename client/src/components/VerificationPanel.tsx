import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { BarChart3, CheckCircle2, DatabaseZap, Loader2, RefreshCw, Scale } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function formatBangkok(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function seasonOf(value: string) {
  const month = new Date(value).getUTCMonth() + 1;
  if (month >= 6 && month <= 10) return "MONSOON";
  if (month >= 3 && month <= 5) return "HOT";
  return "COOL";
}

function ScatterPlot({ provinces }: { provinces: any[] }) {
  const eligible = provinces.filter(item => item.stationCount >= 3 && item.observed24hMeanMm != null);
  const maxValue = Math.max(20, ...eligible.flatMap(item => [item.forecast24hMeanMm, item.observed24hMeanMm]));
  const width = 470;
  const height = 260;
  const pad = 35;
  const scaleX = (value: number) => pad + (value / maxValue) * (width - pad * 2);
  const scaleY = (value: number) => height - pad - (value / maxValue) * (height - pad * 2);

  return (
    <div className="scatter-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="ECMWF forecast versus ThaiWater observed rainfall by province">
        {[0, .25, .5, .75, 1].map(ratio => {
          const x = pad + ratio * (width - pad * 2);
          const y = height - pad - ratio * (height - pad * 2);
          return <g key={ratio}><line x1={x} x2={x} y1={pad} y2={height - pad} className="chart-grid" /><line x1={pad} x2={width - pad} y1={y} y2={y} className="chart-grid" /></g>;
        })}
        <line x1={pad} y1={height - pad} x2={width - pad} y2={pad} className="perfect-line" />
        {eligible.map(item => (
          <circle key={item.iso} cx={scaleX(item.forecast24hMeanMm)} cy={scaleY(item.observed24hMeanMm)} r={Math.max(3, Math.min(7, 2 + Math.log10(item.stationCount + 1) * 2))} className={item.errorMm > 10 ? "point-over" : item.errorMm < -10 ? "point-under" : "point-close"}>
            <title>{`${item.nameTh}: forecast ${item.forecast24hMeanMm} mm, observed ${item.observed24hMeanMm} mm, ${item.stationCount} stations`}</title>
          </circle>
        ))}
        <text x={width / 2} y={height - 5} className="axis-label" textAnchor="middle">ECMWF province mean (mm)</text>
        <text x={12} y={height / 2} className="axis-label" textAnchor="middle" transform={`rotate(-90 12 ${height / 2})`}>ThaiWater station mean (mm)</text>
        <text x={width - pad - 3} y={pad + 13} className="line-label" textAnchor="end">perfect agreement</text>
      </svg>
      <div className="scatter-legend"><span><i className="close" /> within 10 mm</span><span><i className="over" /> over forecast</span><span><i className="under" /> under forecast</span></div>
    </div>
  );
}

function SkillHistory({ history, provinces }: { history: any[]; provinces: any[] }) {
  const [selectedIso, setSelectedIso] = useState("NATIONAL");
  const points = [...history].reverse().map(run => {
    const province = selectedIso === "NATIONAL" ? null : run.provinces.find((item: any) => item.iso === selectedIso);
    return {
      date: run.forecast.validEndUtc,
      value: selectedIso === "NATIONAL" ? run.summary.meanAbsoluteErrorMm : province?.absoluteErrorMm ?? null,
      season: seasonOf(run.forecast.validEndUtc),
    };
  }).filter(point => point.value != null);
  const width = 680;
  const height = 190;
  const pad = 30;
  const maxValue = Math.max(10, ...points.map(point => point.value));
  const coords = points.map((point, index) => ({
    ...point,
    x: pad + (points.length === 1 ? .5 : index / (points.length - 1)) * (width - pad * 2),
    y: height - pad - (point.value / maxValue) * (height - pad * 2),
  }));
  const seasons = ["MONSOON", "COOL", "HOT"].map(season => {
    const values = points.filter(point => point.season === season).map(point => point.value);
    return { season, runs: values.length, mae: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null };
  });

  return (
    <div className="history-panel">
      <div className="subpanel-title history-title">
        <div><span>ROLLING SKILL</span><b>Absolute error by run and Thai season</b></div>
        <select value={selectedIso} onChange={event => setSelectedIso(event.target.value)} aria-label="Historical skill geography">
          <option value="NATIONAL">National MAE</option>
          {provinces.map(item => <option key={item.iso} value={item.iso}>{item.nameTh} · {item.iso}</option>)}
        </select>
      </div>
      <div className="history-grid">
        <div className="history-chart">
          {coords.length ? (
            <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Rolling forecast absolute error">
              {[0, .5, 1].map(ratio => <line key={ratio} x1={pad} x2={width - pad} y1={pad + ratio * (height - pad * 2)} y2={pad + ratio * (height - pad * 2)} className="chart-grid" />)}
              {coords.length > 1 && <polyline points={coords.map(point => `${point.x},${point.y}`).join(" ")} className="history-line" />}
              {coords.map(point => <circle key={point.date} cx={point.x} cy={point.y} r="5" className="history-point"><title>{`${formatBangkok(point.date)}: ${point.value.toFixed(1)} mm absolute error`}</title></circle>)}
              <text x={pad} y={height - 5} className="axis-label">{coords.length} persisted run{coords.length === 1 ? "" : "s"}</text>
              <text x={width - pad} y={height - 5} className="axis-label" textAnchor="end">lower is better</text>
            </svg>
          ) : <p className="history-empty">No persisted run is available for this province yet.</p>}
        </div>
        <div className="season-cards">
          {seasons.map(item => <article key={item.season}><span>{item.season}</span><b>{item.mae == null ? "—" : item.mae.toFixed(1)}<small>{item.mae == null ? "" : " mm"}</small></b><em>{item.runs} runs</em></article>)}
        </div>
      </div>
      {history.length < 2 && <p className="history-note">The rolling chart begins with today's verified run and will populate as scheduled daily verification snapshots accumulate.</p>}
    </div>
  );
}

export default function VerificationPanel() {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const [historyInput] = useState(() => ({ limit: 30 }));
  const query = trpc.verification.latest.useQuery(undefined, { refetchOnWindowFocus: false });
  const historyQuery = trpc.verification.history.useQuery(historyInput, { refetchOnWindowFocus: false });
  const refresh = trpc.verification.refresh.useMutation({
    onSuccess: async () => {
      await Promise.all([utils.verification.latest.invalidate(), utils.verification.history.invalidate()]);
      toast.success("ThaiWater verification refreshed and persisted");
    },
    onError: error => toast.error(error.message),
  });

  if (query.isLoading) return <section className="verification-panel verification-loading"><Loader2 className="animate-spin" /> Loading verification evidence…</section>;
  if (query.error || !query.data) return <section className="verification-panel verification-error">Verification evidence unavailable: {query.error?.message}</section>;

  const data = query.data as any;
  const summary = data.summary;
  const outliers = data.provinces.filter((item: any) => item.stationCount >= 3).slice(0, 8);
  const history = (historyQuery.data as any[] | undefined) ?? [data];

  return (
    <section className="verification-panel">
      <div className="verification-heading">
        <div><p className="eyebrow">Forecast receipts / 24-hour hindcast</p><h2>ECMWF vs ThaiWater observations</h2><p>Forecast issued {formatBangkok(data.forecast.modelRunUtc)} ICT · verified through {formatBangkok(data.forecast.validEndUtc)} ICT</p></div>
        <Button variant="outline" disabled={refresh.isPending} onClick={() => { if (!isAuthenticated) return startLogin(); refresh.mutate(); }}>{refresh.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh evidence</Button>
      </div>

      <div className="verification-metrics">
        <article><Scale /><span>Mean absolute error</span><strong>{summary.meanAbsoluteErrorMm}<small> mm</small></strong></article>
        <article><BarChart3 /><span>Province correlation</span><strong>{summary.pearsonCorrelation?.toFixed(3) ?? "—"}</strong></article>
        <article><CheckCircle2 /><span>Within ±10 mm</span><strong>{Math.round(summary.within10mmRate * 100)}<small>%</small></strong></article>
        <article><DatabaseZap /><span>Reporting stations</span><strong>{summary.stationCount.toLocaleString("en-US")}</strong></article>
      </div>

      <SkillHistory history={history} provinces={data.provinces} />

      <div className="verification-body">
        <div className="scatter-panel">
          <div className="subpanel-title"><div><span>PROVINCE COMPARISON</span><b>Forecast / observed mean</b></div><Badge variant="outline">{summary.pairedProvinceCount} paired provinces</Badge></div>
          <ScatterPlot provinces={data.provinces} />
        </div>
        <div className="error-table">
          <div className="subpanel-title"><div><span>LARGEST DIFFERENCES</span><b>Where the model missed</b></div><small>F − O</small></div>
          <div className="error-table-head"><span>Province</span><span>Forecast</span><span>Observed</span><span>Error</span></div>
          {outliers.map((item: any) => <div className="error-row" key={item.iso}><span><b>{item.nameTh}</b><small>{item.stationCount} stations</small></span><span>{item.forecast24hMeanMm}</span><span>{item.observed24hMeanMm}</span><span className={item.errorMm > 0 ? "positive-error" : "negative-error"}>{item.errorMm > 0 ? "+" : ""}{item.errorMm}</span></div>)}
        </div>
      </div>

      <div className="verification-footnote"><strong>Method note</strong><span>{data.method.caveat}. ThaiWater values are station 24-hour totals ending near 07:00 ICT; timestamps can differ by about one hour.</span><span>Source: ThaiWater public rainfall endpoint · {data.persisted ? "database snapshot" : "bundled verified snapshot"}</span></div>
    </section>
  );
}
