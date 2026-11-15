import type { Metadata } from "next";
import { PublicLegalPage } from "../PublicLegalPage";
import { ACCESSIBILITY } from "@/figma/legal_content";

export const metadata: Metadata = {
  title: "Accessibility Statement | Remote AI Platform",
  description: "Remote AI Platform's accessibility goals, known limitations and how to get help.",
  alternates: { canonical: "/accessibility" },
};

export default function Page() {
  return <PublicLegalPage title="Accessibility Statement" sections={ACCESSIBILITY} />;
}
