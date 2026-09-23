import { useAuth } from "@/_core/hooks/useAuth";
import ThailandRiskMap from "@/components/ThailandRiskMap";
import VerificationPanel from "@/components/VerificationPanel";
import OfficialWarningPanel from "@/components/OfficialWarningPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  Clipboard,
  CloudRain,
  Database,
  FileCheck2,
  Gauge,
  Loader2,
  LogIn,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Waves,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

function formatBangkok(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function riskClass(level: string) {
  if (level === "EXTREME") return "risk-extreme";
  if (level === "VERY_HIGH") return "risk-very-high";
  if (level === "HIGH") return "risk-high";
  if (level === "ELEVATED") return "risk-elevated";
  return "risk-low";
}

export default function Home() {
  const utils = trpc.useUtils();
  const { user, isAuthenticated, logout } = useAuth();
  const latest = trpc.weather.latest.useQuery(undefined, { refetchOnWindowFocus: false });
  const [selectedIso, setSelectedIso] = useState("");
  const data = latest.data as any;

  useEffect(() => {
    if (!selectedIso && data?.summary?.topProvinceIso) setSelectedIso(data.summary.topProvinceIso);
  }, [data?.summary?.topProvinceIso, selectedIso]);

  const refresh = trpc.weather.refresh.useMutation({
    onSuccess: async snapshot => {
      await utils.weather.latest.invalidate();
      setSelectedIso((snapshot as any).summary.topProvinceIso);
      toast.success("Direct ECMWF run completed and persisted");
    },
    onError: error => toast.error(error.message),
  });
  const refine = trpc.weather.refineDraft.useMutation({
    onSuccess: async () => {
      await utils.weather.latest.invalidate();
      toast.success("Thai draft refined with gpt-5-mini");
    },
    onError: error => toast.error(error.message),
  });
  const approve = trpc.weather.approveDraft.useMutation({
    onSuccess: async () => {
      await utils.weather.latest.invalidate();
      toast.success("Draft approved for downstream use — nothing was published");
    },
    onError: error => toast.error(error.message),
  });

  const selected = useMemo(
    () => data?.provinces?.find((province: any) => province.iso === selectedIso) || data?.provinces?.[0],
    [data?.provinces, selectedIso],
  );

  const protectedAction = (action: () => void) => {
    if (!isAuthenticated) {
      toast.info("Sign in to run or approve operational actions");
      startLogin();
      return;
    }
    action();
  };

  if (latest.isLoading) {
    return (
      <div className="loading-screen">
        <div className="radar-loader"><span /><span /><span /></div>
        <p>Loading the latest ECMWF intelligence snapshot…</p>
      </div>
    );
  }

  if (latest.error || !data) {
    return (
      <div className="error-screen">
        <AlertTriangle />
        <h1>Weather snapshot unavailable</h1>
        <p>{latest.error?.message || "No snapshot was returned."}</p>
        <Button onClick={() => latest.refetch()}>Try again</Button>
      </div>
    );
  }

  const busy = refresh.isPending || refine.isPending || approve.isPending;
  const top = data.provinces.slice(0, 8);
  const approved = data.draft.status === "APPROVED";

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark"><CloudRain /></div>
          <div>
            <div className="brand-name">RAIN<span>//TH</span></div>
            <p>Weather intelligence · Thailand</p>
          </div>
        </div>
        <div className="topbar-status">
          <span className="live-pulse" />
          <span>ECMWF DIRECT</span>
          <span className="topbar-separator" />
          <span>V0.3</span>
        </div>
        <div className="topbar-actions">
          {user ? (
            <button className="identity-button" onClick={() => logout()} title="Sign out">
              <span>{user.name?.slice(0, 1).toUpperCase() || "U"}</span>
              <b>{user.name || "Operator"}</b>
            </button>
          ) : (
            <Button variant="outline" onClick={() => startLogin()}><LogIn /> Operator sign in</Button>
          )}
        </div>
      </header>

      <main className="workspace">
        <section className="mission-header">
          <div>
            <div className="mission-kicker"><Waves /> MONSOON WATCH / OPERATIONS CONSOLE</div>
            <h1>Rainfall intelligence,<br /><em>with receipts.</em></h1>
            <p>
              Direct IFS GRIB ingestion, province-level spatial aggregation, explicit risk logic,
              and a human approval gate. No Windy screenshots. No automatic publishing.
            </p>
          </div>
          <div className="run-command">
            <div className="run-command-label">Latest model cycle</div>
            <strong>{formatBangkok(data.source.modelRunUtc)} ICT</strong>
            <small>Generated {formatBangkok(data.generatedAtUtc)} ICT</small>
            <Button
              className="refresh-button"
              disabled={busy}
              onClick={() => protectedAction(() => refresh.mutate())}
            >
              {refresh.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              Pull latest ECMWF run
            </Button>
          </div>
        </section>

        <section className="truth-strip">
          <div><Database /><span><b>Source</b>ECMWF IFS Open Data</span></div>
          <div><Gauge /><span><b>Resolution</b>0.25° / 3–72h</span></div>
          <div><ShieldCheck /><span><b>Classification</b>OUR RISK ANALYSIS</span></div>
          <div className="official-state"><AlertTriangle /><span><b>Official warning</b>LIVE TMD FEED · SEPARATE LAYER</span></div>
        </section>

        <OfficialWarningPanel />

        <section className="dashboard-grid">
          <div className="map-column">
            <ThailandRiskMap
              boundaries={data.boundaries}
              provinces={data.provinces}
              selectedIso={selected?.iso || ""}
              onSelect={setSelectedIso}
            />
          </div>

          <aside className="signal-column">
            <section className="selected-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Province briefing</p>
                  <h2>{selected.nameTh}</h2>
                  <span>{selected.nameEn} · {selected.iso}</span>
                </div>
                <div className={`risk-orb ${riskClass(selected.riskLevel)}`}>
                  <strong>{selected.riskScore}</strong><span>/100</span>
                </div>
              </div>
              <div className="risk-line">
                <Badge className={riskClass(selected.riskLevel)}>{selected.riskLevel.replace("_", " ")}</Badge>
                <span>{selected.confidence} confidence · {selected.sampling.replaceAll("_", " ")}</span>
              </div>
              <div className="metric-grid">
                <article><span>3H MEAN</span><b>{selected.rainMm["3hMean"]}</b><small>mm</small></article>
                <article><span>24H MEAN</span><b>{selected.rainMm["24hMean"]}</b><small>mm</small></article>
                <article><span>24H MAX</span><b>{selected.rainMm["24hMax"]}</b><small>mm</small></article>
                <article><span>72H MEAN</span><b>{selected.rainMm["72hMean"]}</b><small>mm</small></article>
              </div>
              <div className="score-breakdown">
                <div><span>Screening score</span><b>{selected.riskScore}%</b></div>
                <Progress value={selected.riskScore} />
                <small>Rainfall-only indicator, not a flood probability.</small>
              </div>
            </section>

            <section className="ranking-panel">
              <div className="panel-heading compact">
                <div><p className="eyebrow">Signal queue</p><h2>Top provinces</h2></div>
                <span>{data.summary.provinceCount} screened</span>
              </div>
              <div className="ranking-list">
                {top.map((province: any, index: number) => (
                  <button
                    key={province.iso}
                    className={selected.iso === province.iso ? "selected" : ""}
                    onClick={() => setSelectedIso(province.iso)}
                  >
                    <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                    <span className="province-name"><b>{province.nameTh}</b><small>{province.rainMm["24hMean"]} mm / 24h</small></span>
                    <span className={`score ${riskClass(province.riskLevel)}`}>{province.riskScore}</span>
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </section>

        <VerificationPanel />

        <section className="review-grid">
          <article className="draft-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Human review queue</p>
                <h2>Thai social draft</h2>
                <span>Generator: {data.draft.generatedBy}</span>
              </div>
              <Badge className={approved ? "status-approved" : "status-draft"}>
                {approved ? <CheckCircle2 /> : <FileCheck2 />}{data.draft.status}
              </Badge>
            </div>
            <div className="draft-copy" lang="th">{data.draft.textTh}</div>
            <div className="draft-actions">
              <Button
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(data.draft.textTh);
                  toast.success("Draft copied");
                }}
              ><Clipboard /> Copy</Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => protectedAction(() => refine.mutate())}
              >{refine.isPending ? <Loader2 className="animate-spin" /> : <Sparkles />} Refine with gpt-5-mini</Button>
              <Button
                disabled={busy || approved}
                onClick={() => protectedAction(() => approve.mutate({ runKey: data.runKey }))}
              >{approve.isPending ? <Loader2 className="animate-spin" /> : <Check />} {approved ? "Approved" : "Approve draft"}</Button>
            </div>
            <p className="approval-note">Approval only changes internal status. This V0 has no Facebook, LINE, or public publishing connection.</p>
          </article>

          <aside className="audit-panel">
            <div className="panel-heading compact">
              <div><p className="eyebrow">Provenance</p><h2>Audit trail</h2></div>
              <Bot />
            </div>
            <dl>
              <div><dt>Run key</dt><dd>{data.runKey}</dd></div>
              <div><dt>Parameter</dt><dd>tp · total precipitation</dd></div>
              <div><dt>License</dt><dd>{data.source.license}</dd></div>
              <div><dt>Boundary source</dt><dd>geoBoundaries ADM1 · 77 units</dd></div>
              <div><dt>Persistence</dt><dd>{data.persisted ? "Database snapshot" : "Bundled verified snapshot"}</dd></div>
            </dl>
            <div className="limitations">
              <strong>V0 boundaries</strong>
              {data.analysis.limitations.map((item: string) => <p key={item}>— {item}</p>)}
            </div>
          </aside>
        </section>
      </main>

      <footer>
        <span>ECMWF data © ECMWF, licensed CC BY 4.0.</span>
        <span>Administrative boundaries: geoBoundaries / ODbL.</span>
        <span>For operational awareness only.</span>
      </footer>
    </div>
  );
}
