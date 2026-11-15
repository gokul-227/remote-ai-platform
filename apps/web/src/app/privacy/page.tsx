import type { Metadata } from "next";
import { PublicLegalPage } from "../PublicLegalPage";
import { PRIVACY } from "@/figma/legal_content";

export const metadata: Metadata = {
  title: "Privacy Policy | Remote AI Platform",
  description: "How Remote AI Platform collects, uses, shares and protects your personal data, and your rights.",
  alternates: { canonical: "/privacy" },
};

export default function Page() {
  return <PublicLegalPage title="Privacy Policy" sections={PRIVACY} />;
}
