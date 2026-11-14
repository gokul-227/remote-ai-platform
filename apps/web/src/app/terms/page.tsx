import type { Metadata } from "next";
import { PublicLegalPage } from "../PublicLegalPage";
import { TERMS } from "@/figma/legal_content";
export const metadata: Metadata = { title: "Terms of use | Remote AI Platform", alternates: { canonical: "/terms" } };
export default function Page() {
  return <PublicLegalPage title="Terms of use" sections={TERMS} />;
}
