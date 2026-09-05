import { LegalPagePlaceholder } from "@/components/LegalPagePlaceholder";

export default function ImpressumPage() {
  return (
    <LegalPagePlaceholder
      title="Impressum"
      sections={[
        "Legally responsible operator: name and postal address",
        "Contact: email and (if required) phone number",
        "VAT ID / commercial register number, if applicable",
        "Person responsible for content per § 18 Abs. 2 MStV, if applicable",
      ]}
      note="Important, unresolved tension: under German law (Impressumspflicht), this is required for any commercially-oriented website reachable from Germany, including one run by an individual, not only a registered company -- there is no way to defer this behind a placeholder once the site takes on real commercial traffic. It genuinely requires a real name and address to be published, which conflicts with wanting brand-only anonymity for now. This needs a deliberate decision (publish personal details now, or complete company formation first) -- not something that can be resolved with placeholder text."
    />
  );
}
