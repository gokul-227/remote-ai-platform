import type { Metadata } from "next";
import { PublicLegalPage } from "../PublicLegalPage";
import { SECURITY_POLICY } from "@/figma/legal_content";

export const metadata: Metadata = {
  title: "Security Policy | Remote AI Platform",
  description: "How to report a security vulnerability in Remote AI Platform responsibly.",
  alternates: { canonical: "/security" },
};

export default function Page() {
  return <PublicLegalPage title="Security Policy" sections={SECURITY_POLICY} />;
}
