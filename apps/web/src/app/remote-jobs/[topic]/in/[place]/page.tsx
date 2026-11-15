import type { Metadata } from "next";
import { LandingPage, landingMetadata } from "../../../Landing";
import { topicPlaceSpec } from "../../../specs";

export const dynamic = "force-dynamic";
type Props = {
  params: Promise<{ topic: string; place: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { topic, place } = await params;
  return landingMetadata(topicPlaceSpec(topic, place), searchParams);
}

export default async function TopicPlacePage({ params, searchParams }: Props) {
  const { topic, place } = await params;
  return <LandingPage spec={topicPlaceSpec(topic, place)} searchParams={searchParams} />;
}
