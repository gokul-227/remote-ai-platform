"use client";

import { useState, useEffect } from "react";
import {
  Users,
  Building2,
  Briefcase,
  Shield,
  CheckCircle2,
  XCircle,
  ChevronRight,
  Server,
  Activity,
  RefreshCw,
  Cpu,
  AlertTriangle,
  DollarSign,
  Database,
  BarChart3,
  ExternalLink,
  Clock,
} from "lucide-react";
import api from "@/lib/api";
import { RequireRole } from "@/components/RequireRole";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";

interface PlatformStats {
  total_engineers?: number;
  total_companies?: number;
  total_jobs?: number;
  total_users?: number;
  job_sources_breakdown?: Record<string, number>;
}

interface SyncLog {
  id: string;
  source: string;
  jobs_fetched: number;
  jobs_inserted: number;
  jobs_updated: number;
  status: string;
  duration_ms: number;
  created_at: string;
}

interface ActivityLog { id: string; action: string; entity_type?: string; entity_id?: string; created_at: string; }
interface ModerationReport { id: string; target_type: string; target_id: string; reason: string; status: string; decision?: string; created_at: string; }

interface AIUsageStats {
  total_calls: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  model_breakdown: Record<string, number>;
  feature_breakdown: Record<string, number>;
}

interface ServiceHealthStatus {
  service: string;
  status: string;
  latency_ms?: number;
  details?: string;
}

interface SystemHealthDetail {
  overall_status: string;
  services: ServiceHealthStatus[];
  timestamp: string;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function MetricCard({
  label,
  value,
  icon: Icon,
  color,
  bg,
  loading,
  sub,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  bg: string;
  loading: boolean;
  sub?: string;
}) {
  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-5 hover:shadow-[var(--shadow-sm)] transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", bg)}>
          <Icon className={cn("h-4.5 w-4.5", color)} />
        </div>
        <BarChart3 className="h-4 w-4 text-[var(--text-light)]" />
      </div>
      {loading ? (
        <div className="h-8 w-20 bg-[var(--bg-subtle)] rounded animate-pulse" />
      ) : (
        <p className="text-2xl font-bold text-[var(--text-main)]">{value.toLocaleString()}</p>
      )}
      <p className="text-xs text-[var(--text-muted)] mt-1 font-medium">{label}</p>
      {sub && <p className="text-[10px] text-[var(--text-light)] mt-0.5">{sub}</p>}
    </div>
  );
}

function ServiceHealthRow({ service }: { service: ServiceHealthStatus }) {
  const statusUpper = service.status.toUpperCase();
  const isOk = statusUpper === "OPERATIONAL";
  const isUnknown = statusUpper === "UNKNOWN";

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[var(--border-color)] last:border-0">
      <div className="flex items-center gap-3">
        <Server className="h-4 w-4 text-[var(--text-light)]" />
        <div>
          <p className="text-sm text-[var(--text-main)] font-medium">{service.service}</p>
          {service.latency_ms && (
            <p className="text-[10px] text-[var(--text-muted)]">{service.latency_ms}ms</p>
          )}
        </div>
      </div>
      <div className={cn(
        "flex items-center gap-1.5 text-xs font-semibold",
        isOk ? "text-emerald-600" : isUnknown ? "text-[var(--text-muted)]" : "text-[var(--color-error)]"
      )}>
        {isOk ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : isUnknown ? (
          <Clock className="h-3.5 w-3.5" />
        ) : (
          <XCircle className="h-3.5 w-3.5" />
        )}
        {statusUpper}
      </div>
    </div>
  );
}

function AdminDashboardPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLog[] | null>(null);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [aiUsage, setAiUsage] = useState<AIUsageStats | null>(null);
  const [healthDetails, setHealthDetails] = useState<SystemHealthDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    Promise.all([
      api.get("/admin/stats").then((r) => r.data).catch(() => null),
      api.get("/admin/sync-logs", { params: { limit: 50 } }).then((r) => r.data).catch(() => null),
      api.get("/admin/activity-logs", { params: { limit: 20 } }).then((r) => r.data).catch(() => []),
      api.get("/moderation/reports").then((r) => r.data).catch(() => []),
      api.get("/admin/ai-usage").then((r) => r.data).catch(() => null),
      api.get("/admin/health/details", { timeout: 12000 }).then((r) => r.data).catch(() => null),
    ]).then(([statsData, logsData, activityData, reportsData, aiData, healthData]) => {
      if (!isMounted) return;
      setStats(statsData);
      setSyncLogs(logsData);
      setActivityLogs(activityData ?? []);
      setReports(reportsData ?? []);
      setAiUsage(aiData);
      setHealthDetails(healthData);
      setLoading(false);
    });
    return () => { isMounted = false; };
  }, []);

  const resolveReport = async (report: ModerationReport, decision: "HIDE_JOB" | "SUSPEND_USER" | "NO_ACTION") => {
    await api.patch(`/moderation/reports/${report.id}`, { status: "RESOLVED", decision, note: "Reviewed in admin console." });
    setReports((current) => current.map((item) => item.id === report.id ? { ...item, status: "RESOLVED", decision } : item));
  };

  const latestPerSource = (syncLogs ?? []).reduce<Record<string, SyncLog>>((acc, log) => {
    if (!acc[log.source] || new Date(log.created_at) > new Date(acc[log.source].created_at)) {
      acc[log.source] = log;
    }
    return acc;
  }, {});

  const jobSources = Object.keys(stats?.job_sources_breakdown ?? latestPerSource);

  const fallbackHealth: ServiceHealthStatus[] = [
    { service: "Auth Service (Keycloak)", status: "UNKNOWN" },
    { service: "Jobs API", status: "UNKNOWN" },
    { service: "Professionals API", status: "UNKNOWN" },
    { service: "PostgreSQL Database", status: "UNKNOWN" },
    { service: "Redis Cache", status: "UNKNOWN" },
  ];

  const openReports = reports.filter((r) => r.status === "OPEN");
  const healthServices = healthDetails?.services || fallbackHealth;
  const healthOk = healthServices.filter((s) => s.status.toUpperCase() === "OPERATIONAL").length;
  const healthTotal = healthServices.length;

  return (
    <div className="min-h-screen bg-[var(--bg-page)]">
      {/* Admin Header Bar */}
      <div className="bg-[#0B0F17] border-b border-slate-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-[#0A66C2] flex items-center justify-center">
              <Shield className="h-4.5 w-4.5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Remote AI Platform Admin Console</p>
              <p className="text-[10px] text-slate-400">Platform Administration & Control Plane</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {healthDetails && (
              <div className={cn(
                "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg",
                healthOk === healthTotal ? "bg-emerald-950 text-emerald-400 border border-emerald-900" : "bg-amber-950 text-amber-400 border border-amber-900"
              )}>
                <Activity className="h-3.5 w-3.5" />
                {healthOk}/{healthTotal} services operational
              </div>
            )}
            <div className="flex gap-1.5">
              <a href="/admin/users" className="px-3 py-1.5 text-xs font-medium text-slate-300 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors">
                Users
              </a>
              <a href="/admin/jobs" className="px-3 py-1.5 text-xs font-medium text-slate-300 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors">
                Jobs
              </a>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Platform Metrics */}
        <div>
          <h2 className="text-xs uppercase tracking-widest font-semibold text-[var(--text-muted)] mb-3">Platform Overview</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              label="Registered Professionals"
              value={stats?.total_engineers ?? 0}
              icon={Users}
              color="text-[var(--color-brand)]"
              bg="bg-[var(--color-brand-light)]"
              loading={loading}
            />
            <MetricCard
              label="Organizations"
              value={stats?.total_companies ?? 0}
              icon={Building2}
              color="text-indigo-600"
              bg="bg-indigo-50"
              loading={loading}
            />
            <MetricCard
              label="Active Positions"
              value={stats?.total_jobs ?? 0}
              icon={Briefcase}
              color="text-emerald-600"
              bg="bg-emerald-50"
              loading={loading}
            />
            <MetricCard
              label="Total Platform Users"
              value={stats?.total_users ?? 0}
              icon={Shield}
              color="text-amber-600"
              bg="bg-amber-50"
              loading={loading}
            />
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-5">
            {/* AI Usage */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-[var(--shadow-xs)]">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)] bg-[var(--bg-subtle)]">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-[var(--color-ai)]" />
                  <h2 className="text-sm font-semibold text-[var(--text-main)]">AI Token Cost Monitoring</h2>
                </div>
                <Badge tone="ai">LiteLLM Gateway</Badge>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "LLM API Calls", value: (aiUsage?.total_calls ?? 0).toString(), icon: Activity },
                    { label: "Total Tokens", value: (aiUsage?.total_tokens ?? 0).toLocaleString(), icon: Database },
                    { label: "Prompt Tokens", value: (aiUsage?.total_prompt_tokens ?? 0).toLocaleString(), icon: Cpu },
                    { label: "Estimated Cost", value: `$${aiUsage?.estimated_cost_usd ?? 0} USD`, icon: DollarSign, green: true },
                  ].map(({ label, value, icon: Icon, green }) => (
                    <div key={label} className="bg-[var(--bg-subtle)] rounded-lg p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Icon className="h-3.5 w-3.5 text-[var(--text-light)]" />
                        <span className="text-[10px] text-[var(--text-muted)] font-medium">{label}</span>
                      </div>
                      <span className={cn("text-lg font-bold", green ? "text-emerald-600" : "text-[var(--text-main)]")}>
                        {loading ? "—" : value}
                      </span>
                    </div>
                  ))}
                </div>
                {aiUsage && Object.keys(aiUsage.feature_breakdown ?? {}).length > 0 && (
                  <div className="mt-4 pt-4 border-t border-[var(--border-color)]">
                    <p className="text-xs font-semibold text-[var(--text-muted)] mb-2">Usage by feature</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(aiUsage.feature_breakdown).map(([feature, calls]) => (
                        <div key={feature} className="flex items-center gap-1.5 bg-[var(--bg-subtle)] rounded-lg px-2.5 py-1 text-xs">
                          <span className="text-[var(--text-main)] font-medium">{feature}</span>
                          <span className="text-[var(--text-muted)]">{calls} calls</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* System health */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-[var(--shadow-xs)]">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)] bg-[var(--bg-subtle)]">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-emerald-600" />
                  <h2 className="text-sm font-semibold text-[var(--text-main)]">System Health</h2>
                </div>
                {healthDetails && (
                  <div className={cn(
                    "text-xs font-semibold px-2.5 py-1 rounded-full",
                    healthOk === healthTotal ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                  )}>
                    {healthDetails.overall_status}
                  </div>
                )}
              </div>
              <div className="px-5 pb-1 divide-y divide-[var(--border-color)]">
                {healthServices.map((service) => (
                  <ServiceHealthRow key={service.service} service={service} />
                ))}
              </div>
              {healthDetails && (
                <div className="px-5 py-3 border-t border-[var(--border-color)] bg-[var(--bg-subtle)]">
                  <p className="text-[10px] text-[var(--text-muted)]">
                    Last checked: {new Date(healthDetails.timestamp).toLocaleString()}
                  </p>
                </div>
              )}
            </div>

            {/* Moderation Queue */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-[var(--shadow-xs)]">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)] bg-[var(--bg-subtle)]">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-[var(--color-brand)]" />
                  <h2 className="text-sm font-semibold text-[var(--text-main)]">Moderation Queue</h2>
                  {openReports.length > 0 && (
                    <span className="bg-[var(--color-error)] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {openReports.length}
                    </span>
                  )}
                </div>
              </div>
              <div className="p-5">
                {openReports.length === 0 ? (
                  <EmptyState icon={Shield} title="No open reports" description="The queue is clear — all moderation reports have been resolved." />
                ) : (
                  <div className="space-y-3">
                    {openReports.map((report) => (
                      <div key={report.id} className="border border-[var(--border-color)] rounded-xl p-4 bg-[var(--bg-subtle)]">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                          <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide">
                            {report.target_type}
                          </span>
                          <span className="text-xs text-[var(--text-light)]">ID: {report.target_id.slice(0, 8)}…</span>
                        </div>
                        <p className="text-sm text-[var(--text-main)] mb-3">{report.reason}</p>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => void resolveReport(report, report.target_type === "JOB" ? "HIDE_JOB" : "SUSPEND_USER")}>
                            Take action
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => void resolveReport(report, "NO_ACTION")}>
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Job Source Sync */}
            <div id="sync-status" className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-[var(--shadow-xs)]">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)] bg-[var(--bg-subtle)]">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-[var(--text-muted)]" />
                  <h2 className="text-sm font-semibold text-[var(--text-main)]">Job Source Sync Status</h2>
                </div>
              </div>
              <div className="p-5">
                {loading ? (
                  <div className="h-24 bg-[var(--bg-subtle)] rounded-lg animate-pulse" />
                ) : jobSources.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">
                    No sync runs recorded yet. The scheduler runs every 6 hours.
                  </p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-[var(--text-muted)] border-b border-[var(--border-color)]">
                        <th className="pb-2 font-semibold">Source</th>
                        <th className="pb-2 font-semibold">Last Sync</th>
                        <th className="pb-2 font-semibold">Status</th>
                        <th className="pb-2 font-semibold text-right">Jobs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-color)]">
                      {jobSources.map((source) => {
                        const last = latestPerSource[source];
                        return (
                          <tr key={source} className="hover:bg-[var(--bg-subtle)] transition-colors">
                            <td className="py-2.5 font-semibold text-[var(--text-main)]">{source}</td>
                            <td className="py-2.5 text-[var(--text-muted)]">{last ? timeAgo(last.created_at) : "Never"}</td>
                            <td className="py-2.5">
                              {last ? (
                                <span className={cn(
                                  "flex items-center gap-1.5 font-semibold",
                                  last.status === "SUCCESS" ? "text-emerald-600" : "text-[var(--color-error)]"
                                )}>
                                  {last.status === "SUCCESS" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                                  {last.status}
                                </span>
                              ) : <span className="text-[var(--text-light)]">—</span>}
                            </td>
                            <td className="py-2.5 text-right font-bold text-[var(--text-main)]">
                              {stats?.job_sources_breakdown?.[source] ?? 0}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* Right sidebar */}
          <div className="space-y-5">
            {/* Quick links */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-[var(--shadow-xs)]">
              <div className="px-4 py-3.5 border-b border-[var(--border-color)] bg-[var(--bg-subtle)]">
                <h3 className="text-sm font-semibold text-[var(--text-main)]">Admin Navigation</h3>
              </div>
              <div className="divide-y divide-[var(--border-color)]">
                {[
                  { label: "User Management", desc: "Search and moderate accounts", href: "/admin/users", icon: Users },
                  { label: "Job Listings", desc: "Browse jobs by source", href: "/admin/jobs", icon: Briefcase },
                  { label: "Sync Status", desc: "Job aggregator health", href: "#sync-status", icon: RefreshCw },
                  { label: "API Docs", desc: "Backend API reference", href: "/api/docs", icon: ExternalLink, external: true },
                ].map((action) => {
                  const Icon = action.icon;
                  return (
                    <a
                      key={action.label}
                      href={action.href}
                      target={action.external ? "_blank" : undefined}
                      rel={action.external ? "noreferrer" : undefined}
                      className="flex items-center justify-between px-4 py-3 hover:bg-[var(--bg-subtle)] transition-colors group"
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon className="h-4 w-4 text-[var(--text-muted)]" />
                        <div>
                          <p className="text-sm font-medium text-[var(--text-main)]">{action.label}</p>
                          <p className="text-[10px] text-[var(--text-muted)]">{action.desc}</p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-[var(--text-light)] group-hover:text-[var(--color-brand)] transition-colors" />
                    </a>
                  );
                })}
              </div>
            </div>

            {/* Recent sync runs */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-[var(--shadow-xs)]">
              <div className="px-4 py-3.5 border-b border-[var(--border-color)] bg-[var(--bg-subtle)]">
                <h3 className="text-sm font-semibold text-[var(--text-main)]">Recent Sync Runs</h3>
              </div>
              <div className="p-4">
                {!syncLogs || syncLogs.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">No sync runs recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {syncLogs.slice(0, 6).map((log) => (
                      <div key={log.id} className="flex justify-between items-center p-2.5 rounded-lg border border-[var(--border-color)] hover:bg-[var(--bg-subtle)] transition-colors">
                        <div>
                          <p className="text-xs font-semibold text-[var(--text-main)]">{log.source}</p>
                          <p className="text-[10px] text-[var(--text-muted)]">{timeAgo(log.created_at)}</p>
                        </div>
                        <span className={cn(
                          "text-xs font-bold shrink-0",
                          log.status === "SUCCESS" ? "text-emerald-600" : "text-[var(--color-error)]"
                        )}>
                          {log.status === "SUCCESS" ? `+${log.jobs_inserted}` : "failed"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Audit log */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-[var(--shadow-xs)]">
              <div className="px-4 py-3.5 border-b border-[var(--border-color)] bg-[var(--bg-subtle)]">
                <h3 className="text-sm font-semibold text-[var(--text-main)]">Audit Log</h3>
              </div>
              <div className="p-4">
                {activityLogs.length === 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">No administrative activity recorded.</p>
                ) : (
                  <div className="space-y-2">
                    {activityLogs.slice(0, 5).map((entry) => (
                      <div key={entry.id} className="border border-[var(--border-color)] rounded-lg p-2.5">
                        <p className="text-xs font-semibold text-[var(--text-main)]">{entry.action}</p>
                        <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
                          {entry.entity_type || "platform"} · {timeAgo(entry.created_at)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Platform info */}
            <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-4 shadow-[var(--shadow-xs)]">
              <h3 className="text-sm font-semibold text-[var(--text-main)] mb-3">Platform Stack</h3>
              <dl className="space-y-2">
                {[
                  { label: "Version", value: "v0.1.0" },
                  { label: "Auth", value: "Local JWT (HS256)" },
                  { label: "Database", value: "PostgreSQL 16" },
                  { label: "API", value: "FastAPI 0.115" },
                  { label: "Frontend", value: "Next.js 16" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between text-xs">
                    <dt className="text-[var(--text-muted)] font-medium">{label}</dt>
                    <dd className="text-[var(--text-main)] font-semibold font-mono">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <RequireRole roles={["ADMIN"]}>
      <AdminDashboardPage />
    </RequireRole>
  );
}
