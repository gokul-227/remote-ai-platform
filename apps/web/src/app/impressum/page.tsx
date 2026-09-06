import { LegalDocument } from "@/components/LegalDocument";

export default function ImpressumPage() {
  return (
    <LegalDocument title="Impressum" lastUpdated="2026-09-05 (AI-drafted, pending legal review)">
      <section>
        <h2 className="text-lg font-semibold mb-2">Information pursuant to § 5 TMG / Digital Services Act</h2>
        <p className="mb-1"><em>[Your full legal name — as it appears on your passport/ID]</em></p>
        <p className="mb-1"><em>[Your street address and house number]</em></p>
        <p className="mb-1"><em>[Postal code and city]</em></p>
        <p className="mb-1"><em>[Country]</em></p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Contact</h2>
        <p>Email: hello@remoteaiplatform.com</p>
        <p><em>[Phone number — only required if you also list one elsewhere as a means of contacting you; not always mandatory for a purely online service, confirm with your lawyer]</em></p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Responsible for content per § 18 Abs. 2 MStV</h2>
        <p><em>[Same name and address as above, unless a different person is designated]</em></p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">VAT / commercial register</h2>
        <p>
          <em>[If operating as a registered business: VAT ID (Umsatzsteuer-ID) and commercial register
          number/court, if applicable. If operating as an individual/sole proprietor without VAT
          registration, this section may state that no VAT ID applies — confirm the correct wording
          with your lawyer for your specific situation.]</em>
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">EU dispute resolution</h2>
        <p>
          The European Commission provides a platform for online dispute resolution (ODR):{" "}
          <a href="https://ec.europa.eu/consumers/odr/" className="underline" target="_blank" rel="noreferrer">
            https://ec.europa.eu/consumers/odr/
          </a>
          . We are <em>[not currently / currently — confirm your position with your lawyer]</em> willing
          to participate in dispute resolution proceedings before a consumer arbitration board.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Liability for content and links</h2>
        <p>
          As a service provider, we are responsible for our own content on these pages under general
          law. We are not obligated to monitor third-party information (e.g. user-submitted job
          postings or profile content) we merely transmit or store, per §§ 8-10 TMG. This page may link
          to third-party websites (e.g. a Professional&apos;s portfolio); we have no influence over and
          accept no liability for the content of those external sites.
        </p>
      </section>
    </LegalDocument>
  );
}
