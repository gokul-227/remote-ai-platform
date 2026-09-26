"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useSearch } from "@/hooks/useSearch";
import { Av, Card, Empty, ErrorState, Lg, Loading, Tabs, Tag } from "@/components/rap/kit";

const TABS = ["All", "Jobs", "People", "Companies"] as const;
type Tab = (typeof TABS)[number];

function SearchResults() {
  const q = (useSearchParams().get("q") || "").trim();
  const [tab, setTab] = useState<Tab>("All");
  const search = useSearch(q, q.length > 1);

  if (q.length < 2) return <Empty icon="search" title="Search Remote AI">Type at least two characters in the search bar to find jobs, people and companies.</Empty>;
  if (search.isLoading) return <Loading label="Searching…" />;
  if (search.isError || !search.data) return <ErrorState onRetry={() => search.refetch()} />;

  const { jobs, engineers, companies = [] } = search.data;
  const show = (t: Tab) => tab === "All" || tab === t;
  const counts = { All: jobs.length + engineers.length + companies.length, Jobs: jobs.length, People: engineers.length, Companies: companies.length };
  const visible = (show("Jobs") ? jobs.length : 0) + (show("People") ? engineers.length : 0) + (show("Companies") ? companies.length : 0);

  return (
    <>
      <Tabs items={TABS} v={tab} set={setTab} counts={counts} />
      <div className="mt-4 space-y-3">
        {show("Jobs") && jobs.map((j) => (
          <Card key={j.id} c="rounded-xl"><Link href={`/jobs/${j.id}`} className="flex items-center gap-3">
            <Lg name={j.company_name || j.title} src={j.company_logo} s={44} r={8} />
            <div className="min-w-0 flex-1"><p className="font-semibold text-[#0866ff]">{j.title}</p><p className="text-sm text-slate-500">{[j.company_name, j.location || (j.is_remote ? "Remote" : null)].filter(Boolean).join(" - ")}</p></div>
            <Tag>Job</Tag>
          </Link></Card>
        ))}
        {show("People") && engineers.map((p) => (
          <Card key={p.id} c="rounded-xl"><Link href={`/engineers/${p.id}`} className="flex items-center gap-3">
            <Av name={p.full_name} src={p.avatar_url} s={44} />
            <div className="min-w-0 flex-1"><p className="font-semibold text-[#0866ff]">{p.full_name}</p><p className="text-sm text-slate-500">{p.headline || p.primary_role || p.location}</p></div>
            <Tag>Person</Tag>
          </Link></Card>
        ))}
        {show("Companies") && companies.map((c) => (
          <Card key={c.id} c="rounded-xl"><Link href={`/companies/${c.id}`} className="flex items-center gap-3">
            <Lg name={c.name} src={c.logo_url} s={44} r={8} />
            <div className="min-w-0 flex-1"><p className="font-semibold text-[#0866ff]">{c.name}</p>{(c.industry || c.location) && <p className="text-sm text-slate-500">{[c.industry, c.location].filter(Boolean).join(" - ")}</p>}</div>
            <Tag>Company</Tag>
          </Link></Card>
        ))}
        {!visible && <Empty icon="search" title={`No ${tab === "All" ? "results" : tab.toLowerCase()} for “${q}”`}>Try a broader keyword, a skill, or a company name.</Empty>}
      </div>
    </>
  );
}

function SearchTitle() {
  const q = (useSearchParams().get("q") || "").trim();
  return <h1 className="mb-3">{q.length > 1 ? `Results for “${q}”` : "Search"}</h1>;
}

export default function SearchPage() {
  return (
    <div className="mx-auto max-w-[900px]">
      <Suspense fallback={<Loading label="Searching…" />}>
        <SearchTitle />
        <SearchResults />
      </Suspense>
    </div>
  );
}
