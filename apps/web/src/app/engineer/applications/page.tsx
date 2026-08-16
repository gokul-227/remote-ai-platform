"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Briefcase, FileText, Clock, CheckCircle2, XCircle,
  Building2, CalendarDays, Sparkles, ChevronRight, FolderKanban,
} from "lucide-react";
import { useApplications } from "@/hooks/useApplications";
import { useTaskOffers } from "@/hooks/useProject";
import { Button } from "@/components/ui/Button";
import { StatusBadge, type StatusTone } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { RequireAuth } from "@/components/RequireAuth";
import { cn } from "@/lib/cn";

interface ApplicationItem {
  application: { id: string; status: string; created_at: string };
  job: { id: string; title: string; company_name: string };
}

const STATUS_TONE: Record<string, StatusTone> = {
  SUBMITTED: "info",
  APPLIED: "info",
  REVIEWING: "warning",
  SHORTLISTED: "info",
  INVITED: "info",
  ACCEPTED: "success",
  REJECTED: "danger",
  WITHDRAWN: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "Applied",
  APPLIED: "Applied",
  REVIEWING: "In Review",
  SHORTLISTED: "Shortlisted",
  INVITED: "Interview",
  ACCEPTED: "Offer",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

const PIPELINE_STAGES = ["Applied", "In Review", "Shortlisted", "Interview", "Offer"];

const STAGE_MAP: Record<string, number> = {
  SUBMITTED: 0,
  APPLIED: 0,
  REVIEWING: 1,
  SHORTLISTED: 2,
  INVITED: 3,
  ACCEPTED: 4,
};

const WITHDRAWABLE = new Set(["SUBMITTED", "APPLIED", "REVIEWING", "SHORTLISTED", "INVITED"]);

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

function ApplicationPipelineBar({ status }: { status: string }) {
  const currentStage = STAGE_MAP[status] ?? -1;
  const isRejected = status === "REJECTED" || status === "WITHDRAWN";

  if (isRejected) {
    return (
      <div className="flex items-center gap-1.5 mt-3">
        <XCircle className="h-3.5 w-3.5 text-[var(--color-error)]" />
        <span className="text-xs text-[var(--color-error)] font-medium">{STATUS_LABEL[status]}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0 mt-3">
      {PIPELINE_STAGES.map((stage, i) => {
        const isCompleted = i < currentStage;
        const isCurrent = i === currentStage;
        const isFuture = i > currentStage;

        return (
          <div key={stage} className="flex items-center">
            <div className={cn(
              "flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded",
              isCompleted && "text-emerald-700",
              isCurrent && "text-[var(--color-brand)] bg-[var(--color-brand-light)]",
              isFuture && "text-[var(--text-light)]"
            )}>
              {isCompleted && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
              {isCurrent && <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-brand)] inline-block" />}
              {isFuture && <span className="h-1.5 w-1.5 rounded-full bg-[var(--border-strong)] inline-block" />}
              {stage}
            </div>
            {i < PIPELINE_STAGES.length - 1 && (
              <ChevronRight className={cn(
                "h-3 w-3 mx-0.5",
                i < currentStage ? "text-emerald-400" : "text-[var(--border-strong)]"
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ApplicationCard({ item, onWithdraw, withdrawing }: {
  item: ApplicationItem;
  onWithdraw: (id: string) => void;
  withdrawing: boolean;
}) {
  const canWithdraw = WITHDRAWABLE.has(item.application.status);
  const isActive = canWithdraw;

  return (
    <div className={cn(
      "bg-[var(--bg-surface)] border rounded-xl p-4 hover:shadow-[var(--shadow-sm)] transition-shadow",
      isActive ? "border-[var(--border-color)]" : "border-[var(--border-color)] opacity-80"
    )}>
      <div className="flex items-start justify-between gap-4">
        {/* Company logo placeholder */}
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="h-11 w-11 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-color)] flex items-center justify-center shrink-0">
            <Building2 className="h-5 w-5 text-[var(--text-muted)]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  href={`/jobs/${item.job.id}`}
                  className="font-semibold text-[var(--text-main)] text-sm hover:text-[var(--color-brand)] transition-colors block truncate"
                >
                  {item.job.title}
                </Link>
                <p className="text-xs text-[var(--text-muted)] mt-0.5 flex items-center gap-1.5">
                  <Building2 className="h-3 w-3" />
                  {item.job.company_name}
                  <span className="text-[var(--text-light)]">·</span>
                  <CalendarDays className="h-3 w-3" />
                  {timeAgo(item.application.created_at)}
                </p>
              </div>
              <StatusBadge
                label={STATUS_LABEL[item.application.status] ?? item.application.status}
                tone={STATUS_TONE[item.application.status] ?? "neutral"}
              />
            </div>

            {/* Pipeline tracker */}
            <ApplicationPipelineBar status={item.application.status} />
          </div>
        </div>
      </div>

      {/* Actions */}
      {canWithdraw && (
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border-color)]">
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <Sparkles className="h-3.5 w-3.5 text-[var(--color-ai)]" />
            AI match score tracked
          </div>
          <Button
            size="sm"
            variant="secondary"
            loading={withdrawing}
            onClick={() => onWithdraw(item.application.id)}
          >
            Withdraw
          </Button>
        </div>
      )}
    </div>
  );
}

export default function ApplicationsPage() {
  return (
    <RequireAuth>
      <ApplicationsContent />
    </RequireAuth>
  );
}

function ApplicationsContent() {
  const applications = useApplications(true);
  const offers = useTaskOffers(true);
  const items: ApplicationItem[] = applications.data ?? [];
  const [filter, setFilter] = useState<"all" | "active" | "interviews" | "offers" | "closed">("all");

  const TABS = [
    { key: "all" as const, label: "All", count: items.length },
    { key: "active" as const, label: "Active", count: items.filter((i) => WITHDRAWABLE.has(i.application.status)).length },
    { key: "interviews" as const, label: "Interviews", count: items.filter((i) => i.application.status === "INVITED").length },
    { key: "offers" as const, label: "Offers", count: items.filter((i) => i.application.status === "ACCEPTED").length },
    { key: "closed" as const, label: "Closed", count: items.filter((i) => !WITHDRAWABLE.has(i.application.status)).length },
  ];

  const filtered = items.filter((item) => {
    if (filter === "active") return WITHDRAWABLE.has(item.application.status);
    if (filter === "interviews") return item.application.status === "INVITED";
    if (filter === "offers") return item.application.status === "ACCEPTED";
    if (filter === "closed") return !WITHDRAWABLE.has(item.application.status);
    return true;
  });

  const activeCount = items.filter((i) => WITHDRAWABLE.has(i.application.status)).length;
  const offerCount = items.filter((i) => i.application.status === "ACCEPTED").length;

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-main)]">My Applications</h1>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            {items.length === 0
              ? "Track your job applications across companies"
              : `${activeCount} active · ${offerCount} offer${offerCount !== 1 ? "s" : ""}`}
          </p>
        </div>
        <Link href="/jobs">
          <Button icon={<Briefcase className="h-4 w-4" />}>Browse Jobs</Button>
        </Link>
      </div>

      {/* Summary metrics */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Applied", value: items.length, icon: FileText, color: "text-[var(--color-brand)]", bg: "bg-[var(--color-brand-light)]" },
            { label: "In Progress", value: activeCount, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
            { label: "Interviews", value: items.filter((i) => i.application.status === "INVITED").length, icon: CalendarDays, color: "text-purple-600", bg: "bg-purple-50" },
            { label: "Offers", value: offerCount, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-4 flex items-center gap-3">
              <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", bg)}>
                <Icon className={cn("h-4.5 w-4.5", color)} />
              </div>
              <div>
                <p className="text-xl font-bold text-[var(--text-main)] leading-none">{value}</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Task Offers */}
      {((offers.data ?? []).length > 0 || offers.isLoading) && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl overflow-hidden shadow-[var(--shadow-xs)]">
          <div className="flex items-center gap-2 px-4 py-3.5 border-b border-[var(--border-color)] bg-[var(--bg-subtle)]">
            <FolderKanban className="h-4 w-4 text-[var(--color-ai)]" />
            <h2 className="text-sm font-semibold text-[var(--text-main)]">Project Task Offers</h2>
            <span className="text-xs text-[var(--text-muted)] ml-1">
              — direct offers from project teams
            </span>
          </div>
          <div className="divide-y divide-[var(--border-color)]">
            {offers.isLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
              </div>
            ) : (offers.data ?? []).map((item) => (
              <div key={item.offer.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                <div>
                  <p className="text-sm font-semibold text-[var(--text-main)]">{item.task.title}</p>
                  <p className="text-xs text-[var(--text-muted)] mt-0.5">
                    {item.project.title} · {item.offer.match_score}% skill match
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge label={item.offer.status} tone={item.offer.status === "OFFERED" ? "info" : "neutral"} />
                  {item.offer.status === "OFFERED" && (
                    <>
                      <Button size="sm" onClick={() => offers.respond.mutate({ offerId: item.offer.id, status: "ACCEPTED" })} loading={offers.respond.isPending}>
                        Accept
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => offers.respond.mutate({ offerId: item.offer.id, status: "DECLINED" })} disabled={offers.respond.isPending}>
                        Decline
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Applications section */}
      <div className="space-y-4">
        {/* Tabs */}
        <div className="flex items-center gap-0.5 border-b border-[var(--border-color)]">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px",
                filter === tab.key
                  ? "border-[var(--color-brand)] text-[var(--color-brand)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-main)]"
              )}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={cn(
                  "text-[10px] rounded-full px-1.5 py-0.5 font-semibold",
                  filter === tab.key ? "bg-[var(--color-brand-light)] text-[var(--color-brand)]" : "bg-[var(--bg-subtle)] text-[var(--text-muted)]"
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* List */}
        {applications.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
          </div>
        ) : applications.isError ? (
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-6 text-center space-y-3">
            <p className="text-sm text-[var(--color-error)]">Unable to load applications.</p>
            <Button size="sm" variant="secondary" onClick={() => applications.refetch()}>Retry</Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl">
            <EmptyState
              icon={FileText}
              title="No applications yet"
              description="Apply to jobs from the marketplace to track your progress here."
              actionLabel="Browse Jobs"
              actionHref="/jobs"
            />
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => (
              <ApplicationCard
                key={item.application.id}
                item={item}
                onWithdraw={(id) => applications.withdraw.mutate(id)}
                withdrawing={applications.withdraw.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
