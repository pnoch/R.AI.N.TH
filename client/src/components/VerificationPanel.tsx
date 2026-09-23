import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { BarChart3, CheckCircle2, DatabaseZap, Loader2, RefreshCw, Scale } from "lucide-react";
import { toast } from "sonner";

function formatBangkok(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
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
          return (
            <g key={ratio}>
              <line x1={x} x2={x} y1={pad} y2={height - pad} className="chart-grid" />
              <line x1={pad} x2={width - pad} y1={y} y2={y} className="chart-grid" />
            </g>
          );
        })}
        <line x1={pad} y1={height - pad} x2={width - pad} y2={pad} className="perfect-line" />
        {eligible.map(item => (
          <circle
            key={item.iso}
            cx={scaleX(item.forecast24hMeanMm)}
            cy={scaleY(item.observed24hMeanMm)}
            r={Math.max(3, Math.min(7, 2 + Math.log10(item.stationCount + 1) * 2))}
            className={item.errorMm > 10 ? "point-over" : item.errorMm < -10 ? "point-under" : "point-close"}
          >
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

export default function VerificationPanel() {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const query = trpc.verification.latest.useQuery(undefined, { refetchOnWindowFocus: false });
  const refresh = trpc.verification.refresh.useMutation({
    onSuccess: async () => {
      await utils.verification.latest.invalidate();
      toast.success("ThaiWater verification refreshed and persisted");
    },
    onError: error => toast.error(error.message),
  });

  if (query.isLoading) return <section className="verification-panel verification-loading"><Loader2 className="animate-spin" /> Loading verification evidence…</section>;
  if (query.error || !query.data) return <section className="verification-panel verification-error">Verification evidence unavailable: {query.error?.message}</section>;

  const data = query.data as any;
  const summary = data.summary;
  const outliers = data.provinces.filter((item: any) => item.stationCount >= 3).slice(0, 8);

  return (
    <section className="verification-panel">
      <div className="verification-heading">
        <div>
          <p className="eyebrow">Forecast receipts / 24-hour hindcast</p>
          <h2>ECMWF vs ThaiWater observations</h2>
          <p>Forecast issued {formatBangkok(data.forecast.modelRunUtc)} ICT · verified through {formatBangkok(data.forecast.validEndUtc)} ICT</p>
        </div>
        <Button
          variant="outline"
          disabled={refresh.isPending}
          onClick={() => {
            if (!isAuthenticated) return startLogin();
            refresh.mutate();
          }}
        >
          {refresh.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Refresh evidence
        </Button>
      </div>

      <div className="verification-metrics">
        <article><Scale /><span>Mean absolute error</span><strong>{summary.meanAbsoluteErrorMm}<small> mm</small></strong></article>
        <article><BarChart3 /><span>Province correlation</span><strong>{summary.pearsonCorrelation?.toFixed(3) ?? "—"}</strong></article>
        <article><CheckCircle2 /><span>Within ±10 mm</span><strong>{Math.round(summary.within10mmRate * 100)}<small>%</small></strong></article>
        <article><DatabaseZap /><span>Reporting stations</span><strong>{summary.stationCount.toLocaleString("en-US")}</strong></article>
      </div>

      <div className="verification-body">
        <div className="scatter-panel">
          <div className="subpanel-title">
            <div><span>PROVINCE COMPARISON</span><b>Forecast / observed mean</b></div>
            <Badge variant="outline">{summary.pairedProvinceCount} paired provinces</Badge>
          </div>
          <ScatterPlot provinces={data.provinces} />
        </div>

        <div className="error-table">
          <div className="subpanel-title">
            <div><span>LARGEST DIFFERENCES</span><b>Where the model missed</b></div>
            <small>F − O</small>
          </div>
          <div className="error-table-head"><span>Province</span><span>Forecast</span><span>Observed</span><span>Error</span></div>
          {outliers.map((item: any) => (
            <div className="error-row" key={item.iso}>
              <span><b>{item.nameTh}</b><small>{item.stationCount} stations</small></span>
              <span>{item.forecast24hMeanMm}</span>
              <span>{item.observed24hMeanMm}</span>
              <span className={item.errorMm > 0 ? "positive-error" : "negative-error"}>{item.errorMm > 0 ? "+" : ""}{item.errorMm}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="verification-footnote">
        <strong>Method note</strong>
        <span>{data.method.caveat}. ThaiWater values are station 24-hour totals ending near 07:00 ICT; timestamps can differ by about one hour.</span>
        <span>Source: ThaiWater public rainfall endpoint · {data.persisted ? "database snapshot" : "bundled verified snapshot"}</span>
      </div>
    </section>
  );
}
