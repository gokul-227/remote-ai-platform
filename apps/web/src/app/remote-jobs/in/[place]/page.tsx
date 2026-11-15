import type { Metadata } from "next";
import { LandingPage, landingMetadata } from "../../Landing";
import { placeSpec } from "../../specs";

export const dynamic = "force-dynamic";
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
