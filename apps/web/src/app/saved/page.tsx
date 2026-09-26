"use client";

import { RequireAuth } from "@/components/RequireAuth";
import { useSavedJobs } from "@/hooks/useSavedJobs";
import { Btn, Card, Lg, Page, QueryState } from "@/components/rap/kit";
import { formatPay } from "@/lib/format";

function SavedJobs() {
  const saved = useSavedJobs();
  return (
    <Page title="Saved jobs" sub="Keep interesting opportunities together until you’re ready">
      <QueryState q={saved} empty={(d) => !d.length} emptyIcon="bookmark" emptyTitle="Your saved jobs will appear here" emptyAction={<Btn href="/jobs">Discover jobs</Btn>}>
        {(jobs) => (
          <div className="space-y-3">
            {jobs.map((j) => (
              <Card key={j.id}>
                <div className="flex flex-wrap items-center gap-3">
                  <Lg name={j.company_name || j.title} src={j.company_logo} />
                  <div className="min-w-0 flex-1">
                    <h3>{j.title}</h3>
                    <p className="text-sm text-slate-500">{[j.company_name, formatPay(j)].filter(Boolean).join(" · ")}</p>
                  </div>
                  <Btn href={`/jobs/${j.id}`}>View job</Btn>
                  <Btn v="gray" loading={saved.remove.isPending && saved.remove.variables === j.id} onClick={() => saved.remove.mutate(j.id)}>Remove</Btn>
                </div>
              </Card>
            ))}
          </div>
        )}
      </QueryState>
    </Page>
  );
}

export default function SavedPage() {
  return <RequireAuth><SavedJobs /></RequireAuth>;
}
