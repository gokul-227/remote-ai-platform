"use client";

import Link from "next/link";
import { useFreelancers } from "@/hooks/useFreelancers";

export default function FreelancersPage() {
  const freelancers = useFreelancers();
  const items = freelancers.data ?? [];
  return <main className="mx-auto max-w-6xl px-4 py-8"><div className="mb-6"><p className="text-sm font-semibold text-[#0A66C2]">Talent marketplace</p><h1 className="text-3xl font-bold text-slate-900">Find independent professionals</h1><p className="mt-2 text-slate-600">Search public profiles, experience, and skills before inviting a freelancer.</p></div>{freelancers.isLoading ? <div className="card-enterprise p-8 text-slate-500">Loading freelancer profiles…</div> : freelancers.isError ? <div className="card-enterprise p-8"><p className="text-red-700">Unable to load freelancer profiles.</p><button className="mt-3 text-sm font-semibold text-[#0A66C2]" onClick={() => freelancers.refetch()}>Retry</button></div> : items.length === 0 ? <div className="card-enterprise p-8 text-slate-500">No public freelancer profiles are available yet.</div> : <div className="grid gap-4 md:grid-cols-2">{items.map((person: { id: string; headline?: string; primary_role?: string; location?: string; skills?: string[] }) => <Link key={person.id} href={`/engineer/profile?id=${person.id}`} className="card-enterprise block p-6 hover:border-[#0A66C2]"><h2 className="font-semibold text-slate-900">{person.headline || person.primary_role || "Remote professional"}</h2><p className="mt-1 text-sm text-slate-500">{person.location || "Remote"}</p><div className="mt-4 flex flex-wrap gap-2">{(person.skills || []).slice(0, 6).map((skill) => <span key={skill} className="badge-enterprise">{skill}</span>)}</div></Link>)}</div>}</main>;
}
