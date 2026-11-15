import type { Metadata } from "next";
import { PublicLegalPage } from "../PublicLegalPage";
import { ABOUT } from "@/figma/legal_content";

export const metadata: Metadata = {
  title: "About Remote AI Platform | Remote AI Platform",
  description: "Remote AI Platform connects professionals with remote jobs and freelance work.",
  alternates: { canonical: "/about" },
};

export default function Page() {
  return <PublicLegalPage title="About Remote AI Platform" sections={ABOUT} />;
}
