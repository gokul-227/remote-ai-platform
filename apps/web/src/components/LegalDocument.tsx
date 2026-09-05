import type { ReactNode } from "react";

interface LegalDocumentProps {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}

/**
 * Real drafted legal content, NOT a rubber-stamped final document -- the
 * banner below is load-bearing, not boilerplate. This was written by an AI
 * to a genuinely substantive standard (the kind of privacy policy/terms a
 * real SaaS marketplace needs), but it has not been reviewed by a lawyer.
 * Treating AI-drafted legal text as final without that review is exactly
 * the risk this banner exists to prevent.
 */
export function LegalDocument({ title, lastUpdated, children }: LegalDocumentProps) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-bold text-[var(--text-main)] mb-1">{title}</h1>
      <p className="text-xs text-[var(--text-muted)] mb-6">Draft last updated: {lastUpdated}</p>
      <div className="card-enterprise p-4 mb-8 border-l-4 border-[var(--color-brand)]">
        <p className="text-sm text-[var(--text-muted)]">
          <strong className="text-[var(--text-main)]">This document is an AI-drafted first pass, not a
          finalized legal document.</strong> It has not been reviewed by a lawyer and should not be relied
          on as legally binding until that review is complete.
        </p>
      </div>
      <div className="legal-prose space-y-6 text-[var(--text-main)]">{children}</div>
      <p className="mt-8 text-sm text-[var(--text-muted)]">
        Questions in the meantime: <a href="mailto:hello@remoteaiplatform.com" className="underline hover:text-[var(--color-brand)]">hello@remoteaiplatform.com</a>
      </p>
    </div>
  );
}
