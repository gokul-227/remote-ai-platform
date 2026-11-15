import type { Metadata } from "next";
import { PublicLegalPage } from "../PublicLegalPage";
import { SECURITY } from "@/figma/legal_content";

export const metadata: Metadata = {
  title: "Trust and Security | Remote AI Platform",
  description: "How Remote AI Platform protects accounts and data, and how to report a vulnerability.",
  alternates: { canonical: "/trust" },
};

export default function Page() {
  return <PublicLegalPage title="Trust and Security" sections={SECURITY} />;
}
