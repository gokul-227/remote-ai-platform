import type { Metadata } from "next";
import { PublicLegalPage } from "../PublicLegalPage";
import { HELP_FAQ, type Section } from "@/figma/legal_content";

export const metadata: Metadata = {
  title: "Help Centre | Remote AI Platform",
  description: "Answers to common questions about accounts, jobs, contracts and privacy on Remote AI Platform.",
  alternates: { canonical: "/help" },
};

const sections: Section[] = HELP_FAQ.map(([h, a]) => ({ h, body: [a] }));

export default function Page() {
  return <PublicLegalPage title="Help Centre" sections={sections} />;
}
