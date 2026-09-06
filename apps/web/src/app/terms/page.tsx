import { LegalDocument } from "@/components/LegalDocument";

export default function TermsPage() {
  return (
    <LegalDocument title="Terms of Service" lastUpdated="2026-09-05 (AI-drafted, pending legal review)">
      <section>
        <h2 className="text-lg font-semibold mb-2">1. Acceptance of these terms</h2>
        <p>
          By creating an account or using Remote AI Platform (&quot;the Platform&quot;), you agree to
          these Terms of Service. If you don&apos;t agree, please don&apos;t use the Platform.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">2. Who can use the Platform</h2>
        <p>
          You must be at least 18 years old and able to form a binding contract to create an account.
          You&apos;re responsible for the accuracy of the information you provide and for keeping your
          account credentials secure. One account per person or organization.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">3. The two account types</h2>
        <p>
          <strong>Professionals</strong> create a profile, apply to job postings, and may be matched to
          opportunities via the Platform&apos;s AI matching. <strong>Companies</strong> create an
          organization profile and post jobs to reach Professionals. A single person cannot hold both an
          active Professional and Company role signed in as the same identity for the same
          transaction (i.e. you can&apos;t hire yourself).
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">4. Job postings, applications, and matching</h2>
        <p>
          Companies are responsible for the accuracy and legality of their job postings (including
          compliance with employment/anti-discrimination law in their hiring jurisdiction). The
          Platform&apos;s AI match scores are a decision-support tool, not a guarantee of fit or
          performance — hiring decisions remain the Company&apos;s responsibility.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">5. Payments and escrow</h2>
        <ul className="list-disc list-inside space-y-1">
          <li>Payments between Companies and Professionals for project work are processed through Stripe.</li>
          <li>Where escrow is used: a Company&apos;s payment is authorized and held before work begins, and released to the Professional upon the Company&apos;s confirmation that agreed milestones are complete (or per whatever milestone terms the two parties agreed within the Platform).</li>
          <li>The Platform is not a party to the underlying work agreement between a Company and a Professional — we facilitate the payment mechanism, we do not guarantee work quality or completion.</li>
          <li>Refunds, disputes, and cancellations: <em>[placeholder — specific refund/dispute-resolution policy needs to be defined and reviewed with your lawyer before this is relied upon; a real marketplace needs clear rules here, e.g. dispute window, who arbitrates, chargeback handling]</em>.</li>
          <li>Platform fees, if any, will be disclosed clearly before a transaction is confirmed. No fees are currently charged.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">6. Acceptable use</h2>
        <p>You agree not to:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Post false, misleading, or discriminatory job listings or profile content</li>
          <li>Circumvent the Platform to avoid agreed fees, once fees exist</li>
          <li>Scrape, reverse-engineer, or attempt to access other users&apos; private data (resumes, messages) without authorization</li>
          <li>Use the Platform to send spam, malware, or harass other users</li>
          <li>Impersonate another person or organization</li>
        </ul>
        <p className="mt-2">Violating these rules may result in account suspension or termination.</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">7. Content ownership</h2>
        <p>
          You retain ownership of the content you post (resumes, job descriptions, messages, social
          posts). By posting it, you grant the Platform a limited license to store, display, and process
          it (including via AI, as described in the Privacy Policy) solely to provide the service to
          you and, where relevant, to the counterparties you interact with (e.g. showing your public
          profile to Companies).
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">8. Disclaimers and limitation of liability</h2>
        <p>
          The Platform is provided &quot;as is&quot;. We do not guarantee that matches, job postings, or
          Professionals&apos; qualifications are accurate or that the Platform will be uninterrupted or
          error-free. To the maximum extent permitted by law, our liability for any claim arising from
          your use of the Platform is limited to the fees you paid us (if any) in the 12 months before
          the claim. <em>[placeholder — the exact liability cap and any jurisdiction-specific carve-outs
          need lawyer review; consumer-protection law in some jurisdictions may not allow liability
          limitations like this]</em>.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">9. Termination</h2>
        <p>
          You may close your account at any time. We may suspend or terminate an account that violates
          these terms, with notice where reasonably possible. Provisions that by their nature should
          survive termination (payment obligations already incurred, content licenses already granted)
          will continue to apply.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">10. Changes to these terms</h2>
        <p>
          We may update these terms as the Platform evolves. Material changes will be flagged with an
          updated &quot;last updated&quot; date, and registered users will be notified by email.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">11. Governing law and disputes</h2>
        <p>
          <em>[placeholder — governing law and dispute-resolution venue (e.g. courts of a specific
          country, or arbitration) need to be decided with your lawyer, likely based on where the
          operating entity is legally established]</em>.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">12. Contact</h2>
        <p>
          Questions about these terms: <a href="mailto:hello@remoteaiplatform.com" className="underline">hello@remoteaiplatform.com</a>.
        </p>
      </section>
    </LegalDocument>
  );
}
