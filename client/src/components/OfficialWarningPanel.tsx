import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, CalendarClock, ExternalLink, Loader2, RadioTower, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

function formatBangkok(value?: number | string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

export default function OfficialWarningPanel() {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const warning = trpc.warnings.latest.useQuery(undefined, { refetchOnWindowFocus: false });
  const automation = trpc.automation.status.useQuery(undefined, { refetchOnWindowFocus: false });
  const refresh = trpc.warnings.refresh.useMutation({
    onSuccess: async () => {
      await utils.warnings.latest.invalidate();
      toast.success("Official TMD warning refreshed");
    },
    onError: error => toast.error(error.message),
  });

  if (warning.isLoading) {
    return <section className="official-warning-panel warning-loading"><Loader2 className="animate-spin" /> Checking the official warning feed…</section>;
  }
  if (!warning.data || warning.error) {
    return <section className="official-warning-panel warning-error">Official TMD feed unavailable: {warning.error?.message}</section>;
  }

  const data = warning.data as any;
  const tmd = data.tmd;
  const active = tmd.status === "ACTIVE";

  return (
    <section className={`official-warning-panel ${active ? "has-active-warning" : "no-active-warning"}`}>
      <div className="warning-icon"><ShieldAlert /></div>
      <div className="warning-main">
        <div className="warning-heading-row">
          <div>
            <p className="eyebrow">Official source / TMD</p>
            <h2>{active ? "Official weather warning active" : "No active TMD warning"}</h2>
          </div>
          <Badge className={active ? "warning-active-badge" : "warning-clear-badge"}>{tmd.status.replaceAll("_", " ")}</Badge>
        </div>
        {tmd.titleTh && <h3 lang="th">{tmd.titleTh}</h3>}
        {tmd.headlineTh && <p className="warning-headline" lang="th">{tmd.headlineTh}</p>}
        <div className="warning-meta">
          <span><RadioTower /> Issue {tmd.issueNo || "—"}</span>
          <span><CalendarClock /> Announced {formatBangkok(tmd.announcedAtUtc)} ICT</span>
          <span>Effect field ends {formatBangkok(tmd.effectEndUtc)} ICT</span>
        </div>
        <div className="warning-actions">
          {tmd.sourceUrl && <Button variant="outline" asChild><a href={tmd.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink /> Official bulletin</a></Button>}
          <Button
            variant="outline"
            disabled={refresh.isPending}
            onClick={() => {
              if (!isAuthenticated) return startLogin();
              refresh.mutate();
            }}
          >{refresh.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh TMD</Button>
        </div>
      </div>
      <aside className="warning-side">
        <div><span>TMD feed</span><b>{data.persisted ? "Persisted" : "Bundled fallback"}</b></div>
        <div><span>DDPM feed</span><b>Not publicly available</b></div>
        <p>{data.ddpm.note}</p>
        <div className="schedule-readiness">
          <AlertTriangle />
          <span><b>{automation.data?.configured ? "Automatic refresh configured" : "Automatic refresh ready after deployment"}</b>{automation.data?.jobs?.map(job => job.cronExpression).join(" · ") || "radar every 15 min · forecast + satellite 4× daily · verification daily"} UTC</span>
        </div>
      </aside>
    </section>
  );
}
