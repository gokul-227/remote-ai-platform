import { PublicFrame } from "./PublicChrome";
import { LAST_UPDATED, OPERATOR, isFact, type Section } from "@/figma/legal_content";

/** Legal content uses the same operator facts as the application screens. */
export function PublicLegalPage({ title, sections }: { title: string; sections: Section[] }) {
  return (
    <PublicFrame>
      <article className="rounded-xl border border-slate-200 bg-white p-6 sm:p-10">
        <h1 className="text-3xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: {LAST_UPDATED}</p>
        <p className="mt-2 text-sm text-slate-600">
          Contact: <a className="text-[#0552CC] underline" href={`mailto:${OPERATOR.contactEmail}`}>{OPERATOR.contactEmail}</a>
        </p>
        {sections.map((section) => (
          <section key={section.h} className="mt-8">
            <h2 className="text-xl font-semibold">{section.h}</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">
              {section.body.map((block, index) =>
                Array.isArray(block) ? (
                  <ul key={index} className="list-disc space-y-2 pl-5">
                    {block.map((text) => (
                      <li key={text}>{text}</li>
                    ))}
                  </ul>
                ) : isFact(block) ? (
                  <p key={index}>
                    <strong>{block.label}: </strong>
                    {block.fact ?? "Details pending"}
                  </p>
                ) : (
                  <p key={index}>{block}</p>
                ),
              )}
            </div>
          </section>
        ))}
      </article>
    </PublicFrame>
  );
}
