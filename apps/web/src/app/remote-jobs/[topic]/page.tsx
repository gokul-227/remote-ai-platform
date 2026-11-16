import type { Metadata } from "next";
import { LandingPage, landingMetadata } from "../Landing";
import { topicSpec } from "../specs";

// Dynamic because it reads searchParams. Not force-dynamic: that would turn off
// the fetch cache (every request would hit the API for every aggregate).
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
