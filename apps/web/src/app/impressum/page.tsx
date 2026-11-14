import type { Metadata } from "next";
import { PublicLegalPage } from "../PublicLegalPage";
import { IMPRESSUM } from "@/figma/legal_content";
export const metadata: Metadata = {
  title: "Legal notice | Remote AI Platform",
  alternates: { canonical: "/impressum" },
};
export default function Page() {
  return <PublicLegalPage title="Legal notice" sections={IMPRESSUM} />;
}
