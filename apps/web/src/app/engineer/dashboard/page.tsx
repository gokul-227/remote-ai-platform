"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { RequireRole } from "@/components/RequireRole";
import { useApplications } from "@/hooks/useApplications";
import { useRecommendations } from "@/hooks/useRecommendations";
import { useWorkerWorkspace } from "@/hooks/useWorkerWorkspace";
import { Bar, Btn, Card, Empty, ErrorState, Ic, Lg, Loading, Page, Tag } from "@/components/rap/kit";
import { ACTIVE_APPLICATION, type MyEngineerProfile } from "@/types";

export default function EngineerDashboardPage() {
  return <RequireRole roles={["ENGINEER"]}><Dashboard /></RequireRole>;
}

function useMyProfile() {
  return useQuery<MyEngineerProfile | null>({
    queryKey: ["engineer-profile"],
    retry: false,
    queryFn: async () => {
      try {
        return (await api.get<MyEngineerProfile>("/engineers/me")).data;
      } catch (e) {
        if ((e as { response?: { status?: number } }).response?.status === 404) return null;
        throw e;
      }
    },
  });
}

function Dashboard() {
  const profile = useMyProfile();
  const matches = useRecommendations(20);
  const applications = useApplications();
  const { tasksQuery, offersQuery } = useWorkerWorkspace();

  if (profile.isLoading) return <Loading />;
  if (profile.isError) return <ErrorState onRetry={() => profile.refetch()} />;
  const p = profile.data;

  const activeApps = (applications.data ?? []).filter((a) => ACTIVE_APPLICATION.includes(a.application.status));
  const invitations = activeApps.filter((a) => a.application.status === "INVITED").length;
  const openTasks = (tasksQuery.data ?? []).filter((t) => t.task.status !== "DONE").length;
  const pendingOffers = (offersQuery.data ?? []).filter((o) => o.offer.status === "OFFERED").length;

  const checklist: Array<[string, boolean]> = [
    ["Headline and about you", !!(p?.headline && p?.bio)],
    ["Primary role and skills", !!(p?.primary_role && p?.skills?.length)],
    ["Resume uploaded", !!p?.resume_url],
    ["Rate and availability", !!(p?.hourly_rate || p?.availability)],
    ["Work experience", !!p?.experience?.length],
  ];
  const completion = Math.round((checklist.filter(([, done]) => done).length / checklist.length) * 100);

  const cards: Array<[title: string, href: string, icon: string, copy: string, stat: string]> = [
    ["My matches", "/engineer/recommendations", "target", "Explore roles with a clear explanation of why they fit.", matches.data ? `${matches.data.length} roles matched to you` : ""],
    ["Applications", "/engineer/applications", "file", "Follow your applications and invitations.", applications.data ? `${activeApps.length} active${invitations ? ` · ${invitations} invitation${invitations > 1 ? "s" : ""}` : ""}` : ""],
    ["Current work", "/engineer/workspace", "board", "Check your tasks, deliverables and milestones.", tasksQuery.data ? `${openTasks} open task${openTasks === 1 ? "" : "s"}${pendingOffers ? ` · ${pendingOffers} new offer${pendingOffers > 1 ? "s" : ""}` : ""}` : ""],
  ];

  return (
    <Page title="Your next chapter starts here" sub="Keep your profile, opportunities and current work in one place" actions={<Btn href="/jobs" icon="search">Find jobs</Btn>}>
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map(([title, href, icon, copy, stat]) => (
          <Card key={href}>
            <Ic n={icon} c="text-[#0866ff]" s={28} />
            <h2 className="mt-4">{title}</h2>
            <p className="my-3 text-sm text-slate-500">{copy}</p>
            {stat && <p className="mb-3 text-sm font-semibold">{stat}</p>}
            <Btn v="outline" href={href}>Open {title.toLowerCase()}</Btn>
          </Card>
        ))}
      </div>

      <Card c="mt-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2>{p ? "Make your profile work for you" : "Create your professional profile"}</h2>
            <p className="my-3 text-slate-500">Add your experience, skills and work preferences so employers can understand what you bring.</p>
          </div>
          {p && <div className="w-full max-w-[220px]"><p className="mb-2 text-sm font-semibold">Profile {completion}% complete</p><Bar v={completion} /></div>}
        </div>
        {p && completion < 100 && (
          <ul className="mb-4 grid gap-2 sm:grid-cols-2">
            {checklist.map(([label, done]) => (
              <li key={label} className="flex items-center gap-2 text-sm">
                <span className={done ? "text-green-600" : "text-slate-400"}><Ic n={done ? "check" : "dot"} s={16} /></span>
                <span className={done ? "text-slate-500 line-through" : ""}>{label}</span>
              </li>
            ))}
          </ul>
        )}
        {p?.ai_summary && <p className="mb-4 rounded-lg bg-[#edf3fb] p-3 text-sm"><b>AI summary: </b>{p.ai_summary}</p>}
        <div className="flex flex-wrap gap-2">
          <Btn href={p ? "/engineer/profile" : "/onboarding"}>{p ? "Review my profile" : "Build my profile"}</Btn>
          <Btn v="gray" href="/onboarding">Import a resume</Btn>
        </div>
      </Card>

      <Card c="mt-5">
        <div className="flex items-center justify-between"><h2>Recommended roles</h2>{!!matches.data?.length && <Link href="/engineer/recommendations" className="text-sm font-semibold text-[#0757d8]">See all</Link>}</div>
        {matches.isLoading ? <Loading label="Finding your best matches…" /> : matches.isError ? (
          <ErrorState onRetry={() => matches.refetch()} />
        ) : !matches.data?.length ? (
          <Empty icon="target" title="No matches yet" action={<Btn href="/jobs">Browse all jobs</Btn>}>Complete your skills and preferences — matches are recalculated as jobs arrive.</Empty>
        ) : (
          matches.data.slice(0, 3).map((m) => m.job && (
            <Link key={m.id} href={`/jobs/${m.job.id}`} className="flex w-full items-center gap-4 border-t border-slate-100 py-4 text-left first:mt-3">
              <Lg name={m.job.company_name || m.job.title} />
              <span className="min-w-0 flex-1"><b>{m.job.title}</b><span className="block text-sm text-slate-500">{m.job.company_name}{m.job.location ? ` · ${m.job.location}` : ""}</span></span>
              <Tag t="blue">{Math.round(m.overall_score)}% match</Tag>
              <Ic n="right" />
            </Link>
          ))
        )}
      </Card>
    </Page>
  );
}
