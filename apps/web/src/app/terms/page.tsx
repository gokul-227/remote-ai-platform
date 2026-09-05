import { LegalPagePlaceholder } from "@/components/LegalPagePlaceholder";

export default function TermsPage() {
  return (
    <LegalPagePlaceholder
      title="Terms of Service"
      sections={[
        "Who can use the platform, and account eligibility",
        "Rules for professionals and companies using the marketplace",
        "How job postings, applications, and matching work",
        "Payment terms: escrow, fees, refunds, and cancellations",
        "Acceptable use and prohibited conduct",
        "Intellectual property (resumes, job posts, content ownership)",
        "Limitation of liability and dispute resolution",
        "How these terms can change, and how users are notified",
      ]}
      note="Given the platform processes real payments, this document needs contract-law review before any user relies on it."
    />
  );
}
