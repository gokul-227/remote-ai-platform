import type { Metadata } from "next";
import { PublicLegalPage } from "../PublicLegalPage";
import { COOKIES } from "@/figma/legal_content";

export const metadata: Metadata = {
  title: "Cookie Policy | Remote AI Platform",
  description: "What Remote AI Platform stores on your device and why.",
  alternates: { canonical: "/cookies" },
};

export default function Page() {
  return <PublicLegalPage title="Cookie Policy" sections={COOKIES} />;
}
