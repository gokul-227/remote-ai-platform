/** Compact brand symbol traced from the owner's approved app icon (see tools/brand). */
export function Brand({ s = 32, decorative = false }: { s?: number; decorative?: boolean }) {
  // The same SVG is used by the browser icon and public pages. Explicit size: no layout shift.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand-mark.svg"
      width={s}
      height={s}
      alt={decorative ? "" : "Remote AI Platform"}
      className="shrink-0 rounded-lg"
    />
  );
}
