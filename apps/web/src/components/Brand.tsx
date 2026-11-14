/** Compact symbol independently redrawn from the owner's supplied brand PNG. */
export function Brand({ s = 32 }: { s?: number }) {
  // The same SVG is used by the browser icon and public pages.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand-mark.svg" width={s} height={s} alt="Remote AI Platform" className="shrink-0 rounded-lg" />;
}
