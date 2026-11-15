import type { Metadata } from "next";
import { PublicLegalPage } from "../PublicLegalPage";
import { GUIDELINES } from "@/figma/legal_content";

export const metadata: Metadata = {
  title: "Community Guidelines | Remote AI Platform",
  description: "The rules that keep Remote AI Platform professional, safe and trustworthy.",
  alternates: { canonical: "/community-guidelines" },
};

export default function Page() {
  return <PublicLegalPage title="Community Guidelines" sections={GUIDELINES} />;
}
