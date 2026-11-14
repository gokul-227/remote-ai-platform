import type { Metadata } from "next";
import { PublicLegalPage } from "../PublicLegalPage";
import { PRIVACY } from "@/figma/legal_content";
export const metadata: Metadata = {
  title: "Privacy notice | Remote AI Platform",
  alternates: { canonical: "/privacy" },
};
export default function Page() {
  return <PublicLegalPage title="Privacy notice" sections={PRIVACY} />;
}
