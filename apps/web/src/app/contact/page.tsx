import type { Metadata } from "next";
import { PublicLegalPage } from "../PublicLegalPage";
import { CONTACT } from "@/figma/legal_content";

export const metadata: Metadata = {
  title: "Contact us | Remote AI Platform",
  description: "How to reach Remote AI Platform for help, privacy requests and security reports.",
  alternates: { canonical: "/contact" },
};

export default function Page() {
  return <PublicLegalPage title="Contact us" sections={CONTACT} />;
}
