import type { Metadata } from "next";
import { PublicFrame } from "../PublicChrome";
import { fetchCatalog } from "@/lib/billing";
import { PricingView } from "./PricingView";

export const metadata: Metadata = {
  title: "Pricing | Remote AI Platform",
  description: "Job search and applying are free. Optional paid plans for employers and members, prices in euros.",
  alternates: { canonical: "/pricing" },
};

export default async function Page() {
  const catalog = await fetchCatalog();
  return (
    <PublicFrame>
      <PricingView catalog={catalog} />
    </PublicFrame>
  );
}
