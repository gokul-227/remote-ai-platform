import type { Metadata } from "next";
import { LandingPage, landingMetadata } from "../../Landing";
import { placeSpec } from "../../specs";

// Dynamic because it reads searchParams. Not force-dynamic: that would turn off
// the fetch cache (every request would hit the API for every aggregate).
type Props = {
  params: Promise<{ place: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  return landingMetadata(placeSpec((await params).place), searchParams);
}

export default async function PlacePage({ params, searchParams }: Props) {
  return <LandingPage spec={placeSpec((await params).place)} searchParams={searchParams} />;
}
