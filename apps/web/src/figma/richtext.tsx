// No hooks or browser APIs: usable from server components (public job pages).
const isHeadingLine = (l: string) =>
  l.length <= 60 && !/[.!?,;]$/.test(l) && (l.endsWith(":") || l === l.toUpperCase() || l.split(" ").length <= 5);

/**
 * Plain text with paragraphs (blank lines), "- " bullet lists and short
 * heading lines, rendered as elements -- never as HTML. Used for job
 * descriptions, which the API keeps structured as plain text.
 */
export function RichText({ text, c = "" }: { text: string; c?: string }) {
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.split("\n").filter((l) => l.trim()))
    .filter((b) => b.length);
  return (
    <div className={["max-w-prose space-y-3 text-[15px] leading-7 text-slate-700", c].filter(Boolean).join(" ")}>
      {blocks.map((lines, i) => {
        if (lines.length === 1 && !lines[0].startsWith("- ") && isHeadingLine(lines[0]))
          return (
            <h4 key={i} className="pt-1 font-semibold text-slate-900">
              {lines[0]}
            </h4>
          );
        // Split a block into runs of bullets and runs of text.
        const runs: { list: boolean; lines: string[] }[] = [];
        for (const l of lines) {
          const list = l.startsWith("- ");
          if (runs.length && runs[runs.length - 1].list === list) runs[runs.length - 1].lines.push(l);
          else runs.push({ list, lines: [l] });
        }
        return (
          <div key={i} className="space-y-2">
            {runs.map((r, k) =>
              r.list ? (
                <ul key={k} className="list-disc space-y-1 pl-5">
                  {r.lines.map((l, n) => (
                    <li key={n}>{l.slice(2)}</li>
                  ))}
                </ul>
              ) : (
                <p key={k} className="whitespace-pre-line">
                  {r.lines.join("\n")}
                </p>
              ),
            )}
          </div>
        );
      })}
    </div>
  );
}
