import type { Metadata } from "next";
import { PublicLegalPage } from "../PublicLegalPage";
import { COPYRIGHT } from "@/figma/legal_content";

export const metadata: Metadata = {
  title: "Copyright and Takedown Policy | Remote AI Platform",
  description:
    "How to report content that infringes your copyright on Remote AI Platform, and how counter-notices work.",
  alternates: { canonical: "/copyright" },
};

export default function Page() {
  return <PublicLegalPage title="Copyright and Takedown Policy" sections={COPYRIGHT} />;
}
