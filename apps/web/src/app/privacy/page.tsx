import { LegalPagePlaceholder } from "@/components/LegalPagePlaceholder";

export default function PrivacyPage() {
  return (
    <LegalPagePlaceholder
      title="Privacy Policy"
      sections={[
        "What personal data we collect (account details, resume content, messages, usage data)",
        "How and why we use AI to process resumes and job descriptions",
        "Where data is stored (Supabase, EU region) and how long it's retained",
        "Third parties we share data with (Stripe for payments, Resend for email)",
        "Your rights under GDPR: access, correction, deletion, portability",
        "How to exercise those rights and who to contact",
        "Cookies and similar technologies used on this site",
      ]}
      note="Given users in the EU, this document needs GDPR-compliant legal review before the platform operates at any real scale."
    />
  );
}
