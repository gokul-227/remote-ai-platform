"use client";

import { useFreelancers } from "@/hooks/useFreelancers";
import { RequireRole } from "@/components/RequireRole";

function CompanyCandidatesPageContent() {
  const candidates = useFreelancers();
  const items = candidates.data ?? [];
  return <main className="mx-auto max-w-5xl px-4 py-8"><h1 className="text-3xl font-bold text-slate-900">Talent recommendations</h1><p className="mt-2 text-slate-600">Review public freelancer profiles and invite candidates from a job workspace.</p>{candidates.isLoading ? <div className="card-enterprise mt-6 p-8 text-slate-500">Loading candidates…</div> : candidates.isError ? <div className="card-enterprise mt-6 p-8 text-red-700">Unable to load candidates. <button onClick={() => candidates.refetch()} className="font-semibold text-[#0A66C2]">Retry</button></div> : items.length === 0 ? <div className="card-enterprise mt-6 p-8 text-slate-500">No public freelancer profiles match yet.</div> : <div className="mt-6 grid gap-4 md:grid-cols-2">{items.map((person: { id: string; headline?: string; primary_role?: string; years_of_experience?: number; skills?: string[] }) => <article key={person.id} className="card-enterprise p-5"><h2 className="font-semibold text-slate-900">{person.headline || person.primary_role || "Remote professional"}</h2><p className="mt-1 text-sm text-slate-500">{person.years_of_experience ?? 0} years experience</p><div className="mt-3 flex flex-wrap gap-2">{(person.skills || []).slice(0, 5).map((skill) => <span key={skill} className="badge-enterprise">{skill}</span>)}</div></article>)}</div>}</main>;
}

export default function CompanyCandidatesPage() {
  return (
    <RequireRole roles={["COMPANY", "ADMIN"]}>
      <CompanyCandidatesPageContent />
    </RequireRole>
  );
}
