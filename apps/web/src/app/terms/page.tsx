import type { Metadata } from "next";
import { PublicLegalPage } from "../PublicLegalPage";
import { TERMS } from "@/figma/legal_content";

export const metadata: Metadata = {
  title: "Terms of Service | Remote AI Platform",
  description: "The terms that apply when you use Remote AI Platform.",
  alternates: { canonical: "/terms" },
};

export default function Page() {
  return <PublicLegalPage title="Terms of Service" sections={TERMS} />;
}
