import type { Metadata } from "next";
import { fetchEmployer, fetchEmployers } from "@/lib/landing";
import { LandingPage, landingMetadata } from "../../Landing";
import { employerSpec } from "../../specs";

// Dynamic because it reads searchParams. Not force-dynamic: that would turn off
// the fetch cache (every request would hit the API for every aggregate).
type Props = {
  params: Promise<{ employer: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  return landingMetadata(employerSpec(await fetchEmployer((await params).employer)), searchParams);
}

export default async function EmployerPage({ params, searchParams }: Props) {
  const slug = (await params).employer;
  const [employer, others] = await Promise.all([fetchEmployer(slug), fetchEmployers(3, 40)]);
  return <LandingPage spec={employerSpec(employer, others)} searchParams={searchParams} />;
}
