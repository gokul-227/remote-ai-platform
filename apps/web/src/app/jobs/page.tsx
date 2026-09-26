"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useSavedJobs } from "@/hooks/useSavedJobs";
import { Btn, ErrorState, Ic, Lg, Loading, Tag, cx, timeAgo, titleCase } from "@/components/rap/kit";
import { JobDetail } from "@/features/jobs/JobDetail";
import type { JobPost } from "@/types";

const PAGE = 20;
const FILTERS = {
  job_type: { label: "Job type", options: [["full-time", "Full-time"], ["contract", "Contract"], ["part-time", "Part-time"], ["freelance", "Freelance"]] },
  experience_level: { label: "Experience level", options: [["junior", "Junior"], ["mid", "Mid-level"], ["senior", "Senior"], ["lead", "Lead"]] },
  min_salary: { label: "Salary", options: [["50000", "$50K+"], ["100000", "$100K+"], ["150000", "$150K+"], ["200000", "$200K+"]] },
  source: { label: "Source", options: [["DIRECT", "Remote AI Platform"], ["REMOTEOK", "RemoteOK"], ["ARBEITNOW", "Arbeitnow"], ["REMOTIVE", "Remotive"], ["THEMUSE", "The Muse"], ["USAJOBS", "USAJobs"]] },
} as const;
type FilterKey = keyof typeof FILTERS;

export default function JobsPage() {
  return <Suspense fallback={<Loading />}><Jobs /></Suspense>;
}

function Jobs() {
  const params = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const engineer = user?.role === "ENGINEER";
  const initialQuery = params.get("query") || params.get("q") || "";
  const [input, setInput] = useState(initialQuery);
  const [skill, setSkill] = useState(params.get("skill") || "");
  const [query, setQuery] = useState(initialQuery);
  const [skillQuery, setSkillQuery] = useState(params.get("skill") || "");
  const [filters, setFilters] = useState<Partial<Record<FilterKey, string>>>({});
  const [limit, setLimit] = useState(PAGE);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const saved = useSavedJobs(engineer);

  const jobs = useQuery<JobPost[]>({
    queryKey: ["jobs", query, skillQuery, filters, limit],
    queryFn: async () => (await api.get("/jobs", { params: { query: query || undefined, skills: skillQuery ? [skillQuery] : undefined, ...filters, limit } })).data,
    placeholderData: (prev) => prev,
  });

  const list = jobs.data ?? [];
  const selected = list.find((j) => j.id === selectedId) ?? list[0];
  const savedIds = new Set((saved.data ?? []).map((j) => j.id));
  const active = Object.values(filters).filter(Boolean).length;

  const search = (e?: React.FormEvent) => { e?.preventDefault(); setQuery(input.trim()); setSkillQuery(skill.trim()); setLimit(PAGE); setSelectedId(null); };
  const setFilter = (k: FilterKey, v: string) => { setFilters((f) => ({ ...f, [k]: v || undefined })); setLimit(PAGE); setSelectedId(null); };
  const open = (j: JobPost) => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) router.push(`/jobs/${j.id}`);
    else setSelectedId(j.id);
  };
  const toggleSave = (j: JobPost) => (savedIds.has(j.id) ? saved.remove : saved.save).mutate(j.id);

  return (
    <div className="-mx-2 sm:mx-0">
      <div className="rounded-lg border border-slate-200 bg-white">
        <form onSubmit={search} className="flex flex-wrap items-center gap-2 px-4 py-2.5" role="search">
          <label className="flex h-10 min-w-[240px] flex-1 items-center gap-2 rounded-md bg-[#E8F0FC] px-3">
            <Ic n="search" s={18} c="text-slate-500" />
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Search by job title, tech stack, company" aria-label="Search jobs" className="flex-1 bg-transparent text-sm outline-none" />
          </label>
          <label className="flex h-10 w-full items-center gap-2 rounded-md bg-[#E8F0FC] px-3 sm:w-64">
            <Ic n="code" s={18} c="text-slate-500" />
            <input value={skill} onChange={(e) => setSkill(e.target.value)} placeholder="Skill, e.g. Python" aria-label="Filter by skill" className="flex-1 bg-transparent text-sm outline-none" />
          </label>
          <button type="submit" className="h-10 rounded-full bg-[#0866ff] px-6 text-sm font-bold text-white hover:bg-[#0757d8]">Search</button>
        </form>
        <div className="flex flex-wrap items-center gap-2 px-4 pb-2.5">
          {(Object.keys(FILTERS) as FilterKey[]).map((k) => (
            <label key={k} className={cx("relative flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-semibold", filters[k] ? "border-[#0757d8] bg-[#0757d8] text-white" : "border-slate-400 text-slate-600 hover:bg-slate-50")}>
              <span>{filters[k] ? FILTERS[k].options.find(([v]) => v === filters[k])?.[1] : FILTERS[k].label}</span><Ic n="down" s={14} />
              <select aria-label={FILTERS[k].label} value={filters[k] ?? ""} onChange={(e) => setFilter(k, e.target.value)} className="absolute inset-0 cursor-pointer opacity-0">
                <option value="">Any {FILTERS[k].label.toLowerCase()}</option>
                {FILTERS[k].options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          ))}
          {active > 0 && <button onClick={() => { setFilters({}); setLimit(PAGE); }} className="rounded-full px-3 py-1 text-sm font-semibold text-[#0757d8] hover:bg-[#e7f0ff]">Clear filters</button>}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[420px_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <h1 className="!text-lg">{query ? `Jobs matching “${query}”` : engineer ? "Top job picks for you" : "Remote jobs"}</h1>
            <p className="text-sm text-slate-500">Live roles aggregated from the web and posted by companies here{jobs.data ? ` - ${list.length}${list.length === limit ? "+" : ""} results` : ""}</p>
          </div>
          {jobs.isLoading ? <Loading label="Finding roles…" /> : jobs.isError ? <ErrorState onRetry={() => jobs.refetch()} /> : !list.length ? (
            <div className="p-10 text-center text-slate-500"><Ic n="search" s={32} c="mx-auto mb-2" />No jobs match your search.<div className="mt-3"><Btn v="outline" sm onClick={() => { setInput(""); setSkill(""); setQuery(""); setSkillQuery(""); setFilters({}); }}>Reset search</Btn></div></div>
          ) : (
            <>
              {list.map((j) => {
                const isSel = selected?.id === j.id;
                return (
                  <div key={j.id} onClick={() => open(j)} className={cx("flex cursor-pointer gap-3 border-b border-slate-100 p-4 hover:bg-slate-50", isSel && "border-l-4 border-l-[#0866ff] bg-[#F0F6FF]")}>
                    <Lg name={j.company_name || j.title} src={j.company_logo} s={56} r={4} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/jobs/${j.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-bold text-[#0757d8] hover:underline">{j.title}</Link>
                      <p className="text-sm">{j.company_name}</p>
                      <p className="text-sm text-slate-500">{j.location || "Remote"} ({titleCase(j.job_type)})</p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-semibold text-emerald-700">{timeAgo(j.posted_at)}</span>
                        {typeof j.match_score === "number" && <Tag t="indigo">{Math.round(j.match_score)}% match</Tag>}
                        {(!j.source || j.source.toUpperCase() === "DIRECT") && <span className="flex items-center gap-1 font-semibold"><Ic n="bolt" s={12} c="text-[#0866ff]" />Easy Apply</span>}
                      </p>
                    </div>
                    {engineer && (
                      <button aria-label={savedIds.has(j.id) ? "Unsave job" : "Save job"} onClick={(e) => { e.stopPropagation(); toggleSave(j); }} className="self-start p-1 text-slate-500">
                        <Ic n="bookmark" s={20} c={savedIds.has(j.id) ? "fill-current text-[#0866ff]" : ""} />
                      </button>
                    )}
                  </div>
                );
              })}
              {list.length === limit && <div className="p-4 text-center"><Btn v="outline" loading={jobs.isFetching} onClick={() => setLimit((l) => l + PAGE)}>Show more jobs</Btn></div>}
            </>
          )}
        </section>
        <section className="hidden max-h-[calc(100vh-150px)] self-start overflow-y-auto rounded-lg border border-slate-200 bg-white lg:sticky lg:top-24 lg:block">
          {selected ? <JobDetail key={selected.id} job={selected} /> : !jobs.isLoading && <div className="p-10 text-center text-slate-500">Select a job to see the details.</div>}
        </section>
      </div>
    </div>
  );
}
