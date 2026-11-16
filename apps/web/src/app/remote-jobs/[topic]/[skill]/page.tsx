import type { Metadata } from "next";
import { LandingPage, landingMetadata } from "../../Landing";
import { roleSkillSpec } from "../../specs";

// Dynamic because it reads searchParams. Not force-dynamic: that would turn off
// the fetch cache (every request would hit the API for every aggregate).
type Props = {
  params: Promise<{ topic: string; skill: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { topic, skill } = await params;
  return landingMetadata(roleSkillSpec(topic, skill), searchParams);
}

export default async function RoleSkillPage({ params, searchParams }: Props) {
  const { topic, skill } = await params;
  return <LandingPage spec={roleSkillSpec(topic, skill)} searchParams={searchParams} />;
}
