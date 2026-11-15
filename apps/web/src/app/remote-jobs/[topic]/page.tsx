import type { Metadata } from "next";
import { LandingPage, landingMetadata } from "../Landing";
import { topicSpec } from "../specs";

export const dynamic = "force-dynamic";
type Props = {
  params: Promise<{ topic: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  return landingMetadata(topicSpec((await params).topic), searchParams);
}

export default async function TopicPage({ params, searchParams }: Props) {
  return <LandingPage spec={topicSpec((await params).topic)} searchParams={searchParams} />;
}
