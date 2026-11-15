import type { Metadata } from "next";
import { PublicLegalPage } from "../PublicLegalPage";
import { EMPLOYER_TERMS } from "@/figma/legal_content";

export const metadata: Metadata = {
  title: "Job Posting and Employer Terms | Remote AI Platform",
  description: "Rules for organisations that post jobs and contact candidates on Remote AI Platform.",
  alternates: { canonical: "/employer-terms" },
};

export default function Page() {
  return <PublicLegalPage title="Job Posting and Employer Terms" sections={EMPLOYER_TERMS} />;
}
