import sizes from "@/lib/brand-assets.json";

/** Brand symbol traced from the owner's brand sheet (see tools/brand). */
export function Brand({ s = 32, decorative = false }: { s?: number; decorative?: boolean }) {
  // The same SVG is used by public pages and the app shell. Explicit size: no layout shift.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand-mark.svg" width={s} height={s} alt={decorative ? "" : "Remote AI Platform"} className="shrink-0" />
  );
}

/**
 * Brand lockup from the brand sheet: symbol + "Remote AI Platform" ("AI" in brand blue).
 * `primary` adds the tagline beneath; `compact` is symbol + wordmark. Text is outlined in the SVG.
 */
export function Logo({
  variant = "compact",
  h = 32,
  decorative = false,
}: {
  variant?: "primary" | "compact";
  h?: number;
  decorative?: boolean;
}) {
  const [w0, h0] = sizes[variant];
  const alt = variant === "primary" ? "Remote AI Platform. Connect. Find work. Get work done." : "Remote AI Platform";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/brand/rap-logo-${variant}.svg`}
      width={Math.round((w0 * h) / h0)}
      height={h}
      alt={decorative ? "" : alt}
      className="block h-auto max-w-full shrink-0"
    />
  );
}
