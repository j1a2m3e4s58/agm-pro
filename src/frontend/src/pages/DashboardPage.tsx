import { Layout } from "@/components/Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAllCheckIns,
  useDashboardMetrics,
  useSettings,
} from "@/hooks/use-backend";
import type { AGMSettings, CheckIn, DashboardMetrics } from "@/types";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  FileBarChart2,
  MapPin,
  QrCode,
  TrendingUp,
  Upload,
  UserCheck,
  UserPlus,
  UserX,
  Users,
} from "lucide-react";
import { useCallback, useMemo } from "react";

// ─── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(nanoTs: bigint): string {
  const ms = Number(nanoTs / BigInt(1_000_000));
  const diff = Date.now() - ms;
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ms).toLocaleDateString();
}

function exportSnapshotCSV(
  metrics: DashboardMetrics,
  settings: AGMSettings | undefined,
) {
  const rows = [
    ["Metric", "Value"],
    ["AGM Name", settings?.agmName ?? ""],
    ["AGM Date", settings?.agmDate ?? ""],
    ["Venue", settings?.venue ?? ""],
    ["Total Shareholders", metrics.totalShareholders.toString()],
    ["Registered", metrics.registered.toString()],
    ["Registered In-Person", metrics.registeredInPerson.toString()],
    ["Registered Proxy", metrics.registeredProxy.toString()],
    ["Checked In", metrics.checkedIn.toString()],
    ["Not Registered", metrics.notRegistered.toString()],
    ["Attendance Rate (%)", (metrics.attendanceRate * 100).toFixed(1)],
    ["Quorum Reached", metrics.quorumStatus ? "Yes" : "No"],
    [
      "Required Quorum (%)",
      settings ? settings.quorumThreshold.toString() : "",
    ],
    ["Snapshot Taken", new Date().toISOString()],
  ];
  const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `agm-snapshot-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Donut Chart ─────────────────────────────────────────────────────────────

interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

function DonutChart({
  segments,
  total,
}: { segments: DonutSegment[]; total: number }) {
  const R = 56;
  const stroke = 14;
  const cx = 68;
  const cy = 68;
  const circumference = 2 * Math.PI * R;

  let offset = 0;
  const slices = segments.map((seg) => {
    const frac = total > 0 ? seg.value / total : 0;
    const dash = frac * circumference;
    const gap = circumference - dash;
    const startOffset = offset;
    offset += dash;
    return { ...seg, dash, gap, startOffset };
  });

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <svg
        width="136"
        height="136"
        className="flex-shrink-0"
        aria-hidden="true"
      >
        <circle
          cx={cx}
          cy={cy}
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-muted/40"
        />
        {slices.map((s) => (
          <circle
            key={s.label}
            cx={cx}
            cy={cy}
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth={stroke}
            strokeDasharray={`${s.dash} ${s.gap}`}
            strokeDashoffset={-s.startOffset + circumference / 4}
            className="transition-smooth"
          />
        ))}
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          className="fill-foreground"
          style={{
            fontSize: 22,
            fontWeight: 700,
            fontFamily: "var(--font-display)",
          }}
        >
          {total.toLocaleString()}
        </text>
        <text
          x={cx}
          y={cy + 12}
          textAnchor="middle"
          className="fill-muted-foreground"
          style={{ fontSize: 11 }}
        >
          Total
        </text>
      </svg>
      <div className="flex flex-col gap-2">
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-sm">
            <span
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ background: s.color }}
            />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="ml-auto font-semibold text-foreground tabular-nums pl-3">
              {s.value.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Metric Card ─────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  icon: Icon,
  valueColor = "text-foreground",
  loading,
  ocid,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  valueColor?: string;
  loading?: boolean;
  ocid: string;
}) {
  return (
    <Card className="border-border/60" data-ocid={ocid}>
      <CardContent className="p-4 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            {label}
          </p>
          {loading ? (
            <Skeleton className="h-7 w-16 mt-1" />
          ) : (
            <p
              className={`text-2xl font-display font-bold tabular-nums ${valueColor}`}
            >
              {value}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Quick Action Button ──────────────────────────────────────────────────────

function QuickAction({
  to,
  icon: Icon,
  label,
  ocid,
}: {
  to: string;
  icon: React.ElementType;
  label: string;
  ocid: string;
}) {
  return (
    <Link
      to={to}
      data-ocid={ocid}
      className="flex flex-col items-center gap-2 p-4 rounded-xl bg-card border border-border/60 hover:border-primary/40 hover:bg-primary/5 transition-smooth group min-h-[80px] justify-center"
    >
      <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/20 transition-smooth">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <span className="text-xs font-medium text-foreground/80 group-hover:text-foreground text-center leading-tight">
        {label}
      </span>
    </Link>
  );
}

// ─── Activity Item ────────────────────────────────────────────────────────────

function ActivityItem({ checkIn, index }: { checkIn: CheckIn; index: number }) {
  return (
    <div
      data-ocid={`dashboard.activity.item.${index}`}
      className="flex items-center gap-3 py-2.5 border-b border-border/30 last:border-0"
    >
      <div className="w-8 h-8 rounded-full bg-primary/15 border border-primary/25 flex items-center justify-center flex-shrink-0">
        <UserCheck className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          Shareholder checked in
        </p>
        <p className="text-xs text-muted-foreground">
          ID: {checkIn.shareholderId.slice(0, 8)}… via{" "}
          {checkIn.method
            .replace("ManualQuick", "Quick")
            .replace("QRScan", "QR Scan")}
        </p>
      </div>
      <span className="text-xs text-muted-foreground flex-shrink-0 flex items-center gap-1">
        <Clock className="w-3 h-3" />
        {timeAgo(checkIn.checkedInAt)}
      </span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: settings, isLoading: settingsLoading } = useSettings();
  const quorumThreshold = settings?.quorumThreshold ?? BigInt(0);

  const { data: metrics, isLoading: metricsLoading } =
    useDashboardMetrics(quorumThreshold);

  // Override refetchInterval for checkins to 5s
  const { data: checkIns } = useAllCheckIns();

  const recentActivity = useMemo(() => {
    if (!checkIns) return [];
    return [...checkIns]
      .sort((a, b) => Number(b.checkedInAt - a.checkedInAt))
      .slice(0, 10);
  }, [checkIns]);

  const attendanceRate = useMemo(() => {
    if (!metrics) return 0;
    return metrics.attendanceRate * 100;
  }, [metrics]);

  const quorumPct = useMemo(() => {
    return settings ? Number(settings.quorumThreshold) : 50;
  }, [settings]);

  const donutSegments: DonutSegment[] = useMemo(
    () => [
      {
        label: "Not Registered",
        value: metrics ? Number(metrics.notRegistered) : 0,
        color: "oklch(0.58 0.01 155)",
      },
      {
        label: "In Person",
        value: metrics ? Number(metrics.registeredInPerson) : 0,
        color: "oklch(0.68 0.22 155)",
      },
      {
        label: "Proxy",
        value: metrics ? Number(metrics.registeredProxy) : 0,
        color: "oklch(0.72 0.14 85)",
      },
      {
        label: "Checked In",
        value: metrics ? Number(metrics.checkedIn) : 0,
        color: "oklch(0.72 0.15 25)",
      },
    ],
    [metrics],
  );

  const handleExport = useCallback(() => {
    if (metrics) exportSnapshotCSV(metrics, settings);
  }, [metrics, settings]);

  const loading = metricsLoading || settingsLoading;

  return (
    <Layout>
      <div className="space-y-6 max-w-7xl mx-auto" data-ocid="dashboard.page">
        {/* Page header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">
              Dashboard
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Live attendance metrics & analytics
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={!metrics}
            data-ocid="dashboard.export_button"
            className="gap-2 min-h-[44px]"
          >
            <Download className="w-4 h-4" />
            Export Snapshot
          </Button>
        </div>

        {/* Quorum Banner */}
        <QuorumBanner
          metrics={metrics}
          quorumPct={quorumPct}
          attendanceRate={attendanceRate}
          loading={loading}
        />

        {/* Metric Cards */}
        <div
          className="grid grid-cols-2 lg:grid-cols-4 gap-3"
          data-ocid="dashboard.metrics.section"
        >
          <MetricCard
            label="Total Shareholders"
            value={
              metrics ? Number(metrics.totalShareholders).toLocaleString() : "—"
            }
            icon={Users}
            loading={loading}
            ocid="dashboard.metric.total"
          />
          <MetricCard
            label="Registered"
            value={metrics ? Number(metrics.registered).toLocaleString() : "—"}
            icon={ClipboardList}
            valueColor="text-primary"
            loading={loading}
            ocid="dashboard.metric.registered"
          />
          <MetricCard
            label="Checked In"
            value={metrics ? Number(metrics.checkedIn).toLocaleString() : "—"}
            icon={CheckCircle2}
            valueColor="text-primary"
            loading={loading}
            ocid="dashboard.metric.checkedin"
          />
          <MetricCard
            label="Pending"
            value={
              metrics ? Number(metrics.notRegistered).toLocaleString() : "—"
            }
            icon={UserX}
            valueColor="text-accent"
            loading={loading}
            ocid="dashboard.metric.pending"
          />
        </div>

        {/* Charts + AGM Info */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Donut chart */}
          <Card className="border-border/60 lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-display flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Attendance Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              {loading ? (
                <div className="flex items-center gap-6">
                  <Skeleton className="w-[136px] h-[136px] rounded-full flex-shrink-0" />
                  <div className="flex flex-col gap-2 flex-1">
                    {[1, 2, 3, 4].map((i) => (
                      <Skeleton key={i} className="h-4 w-full" />
                    ))}
                  </div>
                </div>
              ) : (
                <DonutChart
                  segments={donutSegments}
                  total={metrics ? Number(metrics.totalShareholders) : 0}
                />
              )}

              {/* Attendance rate bar */}
              {!loading && metrics && (
                <div className="mt-6 space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Attendance Rate</span>
                    <span className="font-semibold text-foreground">
                      {attendanceRate.toFixed(1)}%
                    </span>
                  </div>
                  <div
                    className="h-2.5 rounded-full bg-muted overflow-hidden"
                    data-ocid="dashboard.attendance_bar"
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-smooth"
                      style={{ width: `${Math.min(attendanceRate, 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* AGM Info Card */}
          <AGMInfoCard settings={settings} loading={settingsLoading} />
        </div>

        {/* Recent Activity + Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Recent Activity Feed */}
          <Card className="border-border/60 lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-display flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                Recent Activity
                <Badge variant="secondary" className="ml-auto text-xs">
                  Auto-refreshes
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent data-ocid="dashboard.activity.list">
              {!checkIns || checkIns.length === 0 ? (
                <div
                  data-ocid="dashboard.activity.empty_state"
                  className="flex flex-col items-center justify-center py-8 text-center gap-2"
                >
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <UserCheck className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    No check-ins yet
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Activity will appear here once shareholders check in
                  </p>
                </div>
              ) : (
                <div>
                  {recentActivity.map((ci, i) => (
                    <ActivityItem key={ci.id} checkIn={ci} index={i + 1} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-display flex items-center gap-2">
                <ArrowRight className="w-4 h-4 text-primary" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className="grid grid-cols-2 gap-2"
                data-ocid="dashboard.quick_actions.section"
              >
                <QuickAction
                  to="/registration"
                  icon={UserPlus}
                  label="Register Shareholder"
                  ocid="dashboard.register.button"
                />
                <QuickAction
                  to="/checkin"
                  icon={QrCode}
                  label="Quick Check-In"
                  ocid="dashboard.checkin.button"
                />
                <QuickAction
                  to="/import"
                  icon={Upload}
                  label="Import Shareholders"
                  ocid="dashboard.import.button"
                />
                <QuickAction
                  to="/reports"
                  icon={FileBarChart2}
                  label="View Reports"
                  ocid="dashboard.reports.button"
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}

// ─── Quorum Banner ────────────────────────────────────────────────────────────

function QuorumBanner({
  metrics,
  quorumPct,
  attendanceRate,
  loading,
}: {
  metrics: DashboardMetrics | undefined;
  quorumPct: number;
  attendanceRate: number;
  loading: boolean;
}) {
  if (loading) {
    return <Skeleton className="h-16 w-full rounded-xl" />;
  }

  const reached = metrics?.quorumStatus ?? false;

  return (
    <div
      data-ocid="dashboard.quorum.banner"
      className={`rounded-xl border px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 transition-smooth ${
        reached
          ? "bg-primary/10 border-primary/30"
          : "bg-accent/10 border-accent/30"
      }`}
    >
      <div
        className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
          reached ? "bg-primary/20" : "bg-accent/20"
        }`}
      >
        {reached ? (
          <CheckCircle2 className="w-5 h-5 text-primary" />
        ) : (
          <AlertTriangle className="w-5 h-5 text-accent" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p
          className={`font-display font-bold text-base ${
            reached ? "text-primary" : "text-accent"
          }`}
        >
          Quorum Status: {reached ? "✓ REACHED" : "NOT YET REACHED"}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Attendance:{" "}
          <span className="font-semibold text-foreground">
            {attendanceRate.toFixed(1)}%
          </span>{" "}
          &nbsp;·&nbsp; Required:{" "}
          <span className="font-semibold text-foreground">{quorumPct}%</span>
        </p>
      </div>
      <div className="flex flex-col items-end gap-1 flex-shrink-0">
        <div className="h-2 w-36 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-smooth ${
              reached ? "bg-primary" : "bg-accent"
            }`}
            style={{ width: `${Math.min(attendanceRate, 100)}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Threshold at {quorumPct}%
        </p>
      </div>
    </div>
  );
}

// ─── AGM Info Card ────────────────────────────────────────────────────────────

function AGMInfoCard({
  settings,
  loading,
}: {
  settings: AGMSettings | undefined;
  loading: boolean;
}) {
  return (
    <Card className="border-border/60" data-ocid="dashboard.agm_info.card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-display flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-primary" />
          AGM Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        ) : !settings || !settings.agmName ? (
          <div
            data-ocid="dashboard.agm_info.empty_state"
            className="flex flex-col items-center text-center py-6 gap-2"
          >
            <AlertTriangle className="w-8 h-8 text-accent" />
            <p className="text-sm font-medium text-foreground">
              AGM not configured
            </p>
            <p className="text-xs text-muted-foreground">
              Go to Admin settings to configure AGM details
            </p>
            <Link
              to="/admin"
              data-ocid="dashboard.agm_info.configure_link"
              className="mt-2 text-xs text-primary hover:underline font-medium"
            >
              Configure now →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                AGM Name
              </p>
              <p className="text-sm font-semibold text-foreground mt-0.5 leading-tight">
                {settings.agmName}
              </p>
            </div>
            <div className="flex items-start gap-2">
              <CalendarDays className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Date</p>
                <p className="text-sm text-foreground font-medium">
                  {settings.agmDate || "Not set"}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-muted-foreground">Venue</p>
                <p className="text-sm text-foreground font-medium">
                  {settings.venue || "Not set"}
                </p>
              </div>
            </div>
            <div className="pt-2 border-t border-border/40">
              <div className="flex justify-between items-center">
                <p className="text-xs text-muted-foreground">
                  Quorum Threshold
                </p>
                <Badge variant="outline" className="text-xs">
                  {settings.quorumThreshold.toString()}%
                </Badge>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
