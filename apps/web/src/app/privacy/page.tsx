import { LegalDocument } from "@/components/LegalDocument";

export default function PrivacyPage() {
  return (
    <LegalDocument title="Privacy Policy" lastUpdated="2026-09-05 (AI-drafted, pending legal review)">
      <section>
        <h2 className="text-lg font-semibold mb-2">1. Who we are</h2>
        <p>
          Remote AI Platform (&quot;we&quot;, &quot;us&quot;) operates{" "}
          <a href="https://remoteaiplatform.com" className="underline">remoteaiplatform.com</a>, a
          marketplace connecting remote software engineers (&quot;Professionals&quot;) with hiring
          organizations (&quot;Companies&quot;). This policy explains what personal data we collect, why,
          and what rights you have over it. It applies to visitors, registered Professionals, and
          registered Companies.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">2. What we collect</h2>
        <ul className="list-disc list-inside space-y-1">
          <li><strong>Account data:</strong> name, email address, password (stored as a salted hash, never in plain text), and account role (Professional or Company).</li>
          <li><strong>Profile data:</strong> for Professionals — headline, bio, skills, work history, links (GitHub/LinkedIn/portfolio), and an uploaded resume file. For Companies — organization name, website, industry, and job postings.</li>
          <li><strong>Resume content:</strong> if you upload a resume, we extract its text and use an AI model to parse structured fields (skills, experience level, headline) into your profile. The original file is stored privately and is never shown to other users.</li>
          <li><strong>Communications:</strong> messages sent through the platform&apos;s messaging feature, and social posts/comments you choose to publish.</li>
          <li><strong>Payment data:</strong> for escrow payments between Companies and Professionals, payment card details are collected and processed directly by Stripe, our payment processor — we never see or store full card numbers ourselves.</li>
          <li><strong>Usage data:</strong> a small set of product-analytics events (e.g. account created, job search performed, application submitted) tied to your account if you&apos;re logged in, or anonymously if not. We do not use third-party tracking/advertising cookies.</li>
          <li><strong>Technical data:</strong> standard web server logs (IP address, browser type, request timestamps) retained briefly for security and debugging.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">3. Why we process it (legal basis)</h2>
        <ul className="list-disc list-inside space-y-1">
          <li><strong>Contract performance:</strong> creating your account, matching you with jobs or candidates, processing escrow payments, and enabling messaging are all necessary to provide the service you signed up for.</li>
          <li><strong>Legitimate interest:</strong> basic analytics to understand and improve the product, and security logging to detect abuse.</li>
          <li><strong>Consent:</strong> where we ask for it explicitly (for example, marketing emails, if we ever introduce them — we do not send any today beyond transactional account/notification emails).</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">4. AI processing</h2>
        <p>
          We use third-party AI providers (accessed through a provider-agnostic layer, so the specific
          provider may change) to: extract structured data from uploaded resumes, enrich job postings
          with normalized skill tags, and compute match scores between Professionals and jobs. Resume
          text and job descriptions are sent to these providers solely to generate that output; they
          are not used to train the providers&apos; models under our current agreements, and we do not
          share one user&apos;s data with another user&apos;s AI requests.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">5. Who we share data with</h2>
        <ul className="list-disc list-inside space-y-1">
          <li><strong>Supabase</strong> (database, authentication, and file storage — hosted in the EU)</li>
          <li><strong>Stripe</strong> (payment processing for escrow transactions)</li>
          <li><strong>Resend</strong> (transactional email delivery — account confirmations, notifications)</li>
          <li><strong>Sentry</strong> (error monitoring — technical crash reports, not resume/profile content)</li>
          <li>AI providers as described above, for the specific processing task only</li>
        </ul>
        <p className="mt-2">
          We do not sell personal data, and we do not share it with advertisers.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">6. Where data is stored</h2>
        <p>
          Our database, authentication, and file storage are hosted in the EU (Supabase, eu-west-1). Our
          application servers are currently hosted in the United States (Render); traffic to them is
          encrypted in transit. If your jurisdiction has specific requirements about cross-border data
          transfer, this is a point to raise with your lawyer during review of this document.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">7. How long we keep data</h2>
        <p>
          We retain account and profile data for as long as your account is active. If you delete your
          account, we remove your profile, resume, messages, and posts; some records (e.g. completed
          payment transactions) may be retained longer where we have a legal obligation to do so (for
          example, tax/accounting record-keeping requirements).
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">8. Your rights</h2>
        <p>If you are in the EU/EEA (GDPR) or a jurisdiction with similar protections, you have the right to:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Access the personal data we hold about you</li>
          <li>Correct inaccurate data</li>
          <li>Request deletion of your data (&quot;right to be forgotten&quot;)</li>
          <li>Export your data in a portable format</li>
          <li>Object to or restrict certain processing</li>
          <li>Withdraw consent at any time, where processing is based on consent</li>
        </ul>
        <p className="mt-2">
          To exercise any of these rights, email <a href="mailto:hello@remoteaiplatform.com" className="underline">hello@remoteaiplatform.com</a>. We aim to respond within 30 days.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">9. Cookies</h2>
        <p>
          We use a minimal set of strictly-necessary cookies/local storage for session authentication
          (keeping you logged in) and your theme preference (light/dark mode). We do not use
          advertising or cross-site tracking cookies.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">10. Changes to this policy</h2>
        <p>
          If we make material changes to this policy, we will update the &quot;last updated&quot; date
          above and, where the change is significant, notify registered users by email.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">11. Contact</h2>
        <p>
          Questions about this policy or your data: <a href="mailto:hello@remoteaiplatform.com" className="underline">hello@remoteaiplatform.com</a>.
        </p>
      </section>
    </LegalDocument>
  );
}
