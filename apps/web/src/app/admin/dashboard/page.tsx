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
} from "lucide-react";
import api from "@/lib/api";
import { RequireRole } from "@/components/RequireRole";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";

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

interface AdminUser { id: string; full_name: string; email: string; role: string; is_active: boolean; }
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

function AdminDashboardPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLog[] | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
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
      api.get("/admin/users", { params: { limit: 20 } }).then((r) => r.data).catch(() => []),
      api.get("/admin/activity-logs", { params: { limit: 20 } }).then((r) => r.data).catch(() => []),
      api.get("/moderation/reports").then((r) => r.data).catch(() => []),
      api.get("/admin/ai-usage").then((r) => r.data).catch(() => null),
      // Longer timeout than the default client — this call does real,
      // network-bound checks (Postgres, Redis, S3, Keycloak) rather than a
      // single fast query, and Render's network path to Supabase Storage in
      // particular can genuinely take a couple of seconds; the default 5s
      // client timeout was cutting this off before it could finish.
      api.get("/admin/health/details", { timeout: 12000 }).then((r) => r.data).catch(() => null),
    ]).then(([statsData, logsData, usersData, activityData, reportsData, aiData, healthData]) => {
      if (!isMounted) return;
      setStats(statsData);
      setSyncLogs(logsData);
      setUsers(usersData ?? []);
      setActivityLogs(activityData ?? []);
      setReports(reportsData ?? []);
      setAiUsage(aiData);
      setHealthDetails(healthData);
      setLoading(false);
    });
    return () => { isMounted = false; };
  }, []);

  const toggleUser = async (target: AdminUser) => {
    const response = await api.patch(`/admin/users/${target.id}/status`, { is_active: !target.is_active });
    setUsers((current) => current.map((user) => user.id === target.id ? response.data : user));
  };

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

  const metricCards = [
    { label: "Registered Engineers", value: stats?.total_engineers ?? "—", icon: Users, color: "text-[#0A66C2]" },
    { label: "Companies", value: stats?.total_companies ?? "—", icon: Building2, color: "text-indigo-600" },
    { label: "Active Positions", value: stats?.total_jobs ?? "—", icon: Briefcase, color: "text-emerald-600" },
    { label: "Total Users", value: stats?.total_users ?? "—", icon: Shield, color: "text-amber-600" },
  ];

  // Only used if the /admin/health/details request itself fails — genuinely
  // unknown, not a claim that these services are healthy.
  const systemHealth: ServiceHealthStatus[] = [
    { service: "Auth Service (Keycloak)", status: "UNKNOWN" },
    { service: "Jobs API", status: "UNKNOWN" },
    { service: "Engineers API", status: "UNKNOWN" },
    { service: "PostgreSQL Database", status: "UNKNOWN" },
    { service: "Redis Cache", status: "UNKNOWN" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="h-6 w-6 text-[#0A66C2]" /> Admin Console
          </h1>
          <p className="text-sm text-slate-500 mt-1">Platform administration and system health</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="card-enterprise p-5 space-y-2">
              <div className={card.color}><Icon className="h-5 w-5" /></div>
              {loading ? (
                <div className="skeleton-box h-8 w-16" />
              ) : (
                <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
              )}
              <div className="text-xs text-slate-500 font-medium">{card.label}</div>
            </div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* System Health */}
        <div className="lg:col-span-2 space-y-5">
          {/* AI Usage & Cost Monitoring */}
          <div className="card-enterprise p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                <Server className="h-4 w-4 text-slate-400" /> AI Provider & Token Cost Monitoring
              </h2>
              <Badge tone="ai">LiteLLM Gateway</Badge>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="bg-[var(--bg-subtle)] p-3 rounded-lg">
                <span className="text-slate-500 text-[11px] block">LLM API Calls</span>
                <span className="text-lg font-bold text-slate-900">{aiUsage?.total_calls ?? 0}</span>
              </div>
              <div className="bg-[var(--bg-subtle)] p-3 rounded-lg">
                <span className="text-slate-500 text-[11px] block">Total Tokens</span>
                <span className="text-lg font-bold text-slate-900">{(aiUsage?.total_tokens ?? 0).toLocaleString()}</span>
              </div>
              <div className="bg-[var(--bg-subtle)] p-3 rounded-lg">
                <span className="text-slate-500 text-[11px] block">Prompt Tokens</span>
                <span className="text-lg font-bold text-slate-900">{(aiUsage?.total_prompt_tokens ?? 0).toLocaleString()}</span>
              </div>
              <div className="bg-[var(--bg-subtle)] p-3 rounded-lg">
                <span className="text-slate-500 text-[11px] block">Estimated Cost</span>
                <span className="text-lg font-bold text-emerald-700">${aiUsage?.estimated_cost_usd ?? 0} USD</span>
              </div>
            </div>
          </div>

          <div className="card-enterprise p-6 space-y-4">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <Activity className="h-4 w-4 text-slate-400" /> System Subsystem Health
            </h2>
            <div className="space-y-2.5">
              {(healthDetails?.services || systemHealth).map((service) => {
                const statusUpper = service.status.toUpperCase();
                const isOperational = statusUpper === "OPERATIONAL";
                const isUnknown = statusUpper === "UNKNOWN";
                const toneClass = isOperational ? "text-emerald-700" : isUnknown ? "text-slate-500" : "text-red-700";
                const iconClass = isOperational ? "text-emerald-600" : isUnknown ? "text-slate-400" : "text-red-600";
                return (
                  <div key={service.service} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <Server className="h-4 w-4 text-slate-400" />
                      <div>
                        <span className="text-sm text-slate-700 font-medium block">{service.service}</span>
                        {service.latency_ms ? <span className="text-[10px] text-slate-400">{service.latency_ms}ms latency</span> : null}
                      </div>
                    </div>
                    <span className={`flex items-center gap-1.5 text-xs font-semibold ${toneClass}`}>
                      {isOperational ? <CheckCircle2 className={`h-4 w-4 ${iconClass}`} /> : <XCircle className={`h-4 w-4 ${iconClass}`} />}
                      {service.status}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card-enterprise p-6 space-y-4">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2"><Shield className="h-4 w-4 text-slate-400" /> Moderation Queue</h2>
            {reports.filter((report) => report.status === "OPEN").length === 0 ? (
              <EmptyState icon={Shield} title="No open moderation reports" />
            ) : (
              <div className="space-y-3">
                {reports.filter((report) => report.status === "OPEN").map((report) => (
                  <div key={report.id} className="rounded-lg border border-[var(--border-color)] p-3.5">
                    <p className="text-xs font-semibold text-slate-500">{report.target_type} · {report.target_id}</p>
                    <p className="mt-1 text-sm text-slate-700">{report.reason}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => void resolveReport(report, report.target_type === "JOB" ? "HIDE_JOB" : "SUSPEND_USER")}>Take action</Button>
                      <Button size="sm" variant="secondary" onClick={() => void resolveReport(report, "NO_ACTION")}>Dismiss</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Job Source Sync Status */}
          <div id="sync-status" className="card-enterprise p-6 space-y-4">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-slate-400" /> Job Source Sync Status
            </h2>
            {loading ? (
              <div className="skeleton-box h-24 w-full" />
            ) : jobSources.length === 0 ? (
              <p className="text-sm text-slate-500">No sync runs recorded yet — the scheduler runs every 6 hours, or trigger one via <code className="text-xs">POST /api/v1/jobs/sync</code>.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-100">
                      <th className="pb-2 font-medium">Job Source</th>
                      <th className="pb-2 font-medium">Last Sync</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium text-right">Jobs Imported</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobSources.map((source) => {
                      const last = latestPerSource[source];
                      return (
                        <tr key={source} className="border-b border-slate-50 last:border-0">
                          <td className="py-2.5 font-semibold text-slate-800">{source}</td>
                          <td className="py-2.5 text-slate-500">{last ? new Date(last.created_at).toLocaleString() : "Never"}</td>
                          <td className="py-2.5">
                            {last ? (
                              <span className={`flex items-center gap-1.5 font-semibold ${last.status === "SUCCESS" ? "text-emerald-700" : "text-red-700"}`}>
                                {last.status === "SUCCESS" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                                {last.status}
                              </span>
                            ) : <span className="text-slate-400">—</span>}
                          </td>
                          <td className="py-2.5 text-right font-semibold text-slate-800">{stats?.job_sources_breakdown?.[source] ?? 0}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="card-enterprise p-6 space-y-3">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <Shield className="h-4 w-4 text-slate-400" /> Admin Actions
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                { label: "User Management", desc: "Search, filter, and suspend platform accounts", href: "/admin/users" },
                { label: "Job Listings", desc: "Browse and moderate active job positions by source", href: "/admin/jobs" },
                { label: "Sync Status", desc: "Job aggregator source health, jump to table above", href: "#sync-status" },
              ].map((action) => (
                <a
                  key={action.label}
                  href={action.href}
                  className="flex items-start justify-between p-4 rounded-xl border border-slate-200 hover:border-[#0A66C2]/30 hover:bg-[#0A66C2]/5 transition-colors group cursor-pointer"
                >
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{action.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{action.desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-[#0A66C2] transition-colors flex-shrink-0 mt-0.5" />
                </a>
              ))}
            </div>
          </div>

          <div className="card-enterprise p-6 space-y-4">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2"><Users className="h-4 w-4 text-slate-400" /> User Controls</h2>
            {users.length === 0 ? (
              <EmptyState icon={Users} title="No users available" />
            ) : (
              <div className="space-y-2">
                {users.slice(0, 8).map((target) => (
                  <div key={target.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border-color)] p-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{target.full_name}</p>
                      <p className="text-xs text-slate-500">{target.email} · {target.role}</p>
                    </div>
                    <Button size="sm" variant={target.is_active ? "secondary" : "primary"} onClick={() => void toggleUser(target)}>
                      {target.is_active ? "Suspend" : "Activate"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Alerts & Info */}
        <div className="space-y-5">
          <div className="card-enterprise p-5 space-y-3">
            <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-slate-400" /> Recent Sync Runs
            </h3>
            <div className="space-y-2 text-xs">
              {!syncLogs || syncLogs.length === 0 ? (
                <p className="text-slate-500">No sync runs recorded yet.</p>
              ) : (
                syncLogs.slice(0, 5).map((log) => (
                  <div key={log.id} className="flex justify-between items-center p-2.5 rounded-lg border border-slate-100 bg-slate-50">
                    <span className="text-slate-600 leading-snug">{log.source} · {new Date(log.created_at).toLocaleTimeString()}</span>
                    <span className={`font-bold ml-3 flex-shrink-0 ${log.status === "SUCCESS" ? "text-emerald-700" : "text-red-700"}`}>
                      {log.status === "SUCCESS" ? `+${log.jobs_inserted}` : "failed"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="card-enterprise p-5 space-y-3">
            <h3 className="font-semibold text-slate-900 text-sm">Recent Audit Activity</h3>
            <div className="space-y-2 text-xs">
              {activityLogs.length === 0 ? (
                <p className="text-slate-500">No administrative activity recorded.</p>
              ) : (
                activityLogs.slice(0, 6).map((entry) => (
                  <div key={entry.id} className="rounded-lg border border-slate-100 bg-slate-50 p-2.5">
                    <p className="font-semibold text-slate-700">{entry.action}</p>
                    <p className="mt-0.5 text-slate-500">{entry.entity_type || "platform"} · {new Date(entry.created_at).toLocaleString()}</p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="card-enterprise p-5 space-y-3">
            <h3 className="font-semibold text-slate-900 text-sm">Platform Info</h3>
            <dl className="space-y-2 text-xs">
              {[
                { label: "Version", value: "v0.1.0" },
                { label: "Environment", value: "Development" },
                { label: "Auth", value: "Keycloak OIDC" },
                { label: "Database", value: "PostgreSQL 16" },
                { label: "API", value: "FastAPI 0.115" },
                { label: "Frontend", value: "Next.js 16" },
              ].map((item) => (
                <div key={item.label} className="flex justify-between">
                  <dt className="text-slate-500 font-medium">{item.label}</dt>
                  <dd className="text-slate-800 font-semibold font-mono">{item.value}</dd>
                </div>
              ))}
            </dl>
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
