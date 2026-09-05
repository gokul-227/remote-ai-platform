interface LegalPagePlaceholderProps {
  title: string;
  sections: string[];
  note?: string;
}

/**
 * Deliberately NOT real legal text. These pages are scaffolding -- routes,
 * navigation, and a clear list of what each document will eventually cover
 * -- pending actual review by a qualified lawyer before this app takes on
 * real users at any scale. An AI-drafted privacy policy or terms of service
 * that reads as authoritative but wasn't reviewed is worse than no page at
 * all: it can create liability or user expectations nobody actually vetted.
 */
export function LegalPagePlaceholder({ title, sections, note }: LegalPagePlaceholderProps) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold text-[var(--text-main)] mb-2">{title}</h1>
      <div className="card-enterprise p-4 mb-8 border-l-4 border-[#B54A2C]">
        <p className="text-sm text-[var(--text-muted)]">
          This page is a placeholder. The content below has not been drafted or reviewed by a
          lawyer and must not be relied on as the actual {title.toLowerCase()}. It exists to show
          what this document will eventually cover.
        </p>
      </div>
      <ul className="space-y-3 list-disc list-inside text-[var(--text-main)]">
        {sections.map((section) => (
          <li key={section}>{section}</li>
        ))}
      </ul>
      {note && <p className="mt-8 text-sm text-[var(--text-muted)]">{note}</p>}
      <p className="mt-8 text-sm text-[var(--text-muted)]">
        Questions in the meantime: <a href="mailto:hello@remoteaiplatform.com" className="underline hover:text-[#B54A2C]">hello@remoteaiplatform.com</a>
      </p>
    </div>
  );
}
