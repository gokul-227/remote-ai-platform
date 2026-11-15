import type { Metadata } from "next";
import { fetchEmployer, fetchEmployers } from "@/lib/landing";
import { LandingPage, landingMetadata } from "../../Landing";
import { employerSpec } from "../../specs";

export const dynamic = "force-dynamic";
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
