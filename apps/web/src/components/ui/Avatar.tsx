import { cn } from "@/lib/cn";

// Each color must hit >= 4.5:1 contrast against the white initials text (WCAG 2.2 AA).
// #B54A2C is the brand rust, kept as-is; the rest are shifted one Tailwind shade
// darker than the original 500/600 picks (which measured 3.19-4.47:1) to clear that bar.
const PALETTE = ["#B54A2C", "#4F46E5", "#0369A1", "#047857", "#B45309", "#DC2626", "#7C3AED"];

function colorFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

function initials(name: string | null | undefined) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const sizeClasses = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
  xl: "h-24 w-24 text-2xl",
};

export function Avatar({
  name,
  src,
  size = "md",
  className,
}: {
  name: string | null | undefined;
  src?: string | null;
  size?: keyof typeof sizeClasses;
  className?: string;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name || "Avatar"}
        className={cn("rounded-full object-cover shrink-0 border border-[var(--border-color)]", sizeClasses[size], className)}
      />
    );
  }
  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-semibold text-white shrink-0 select-none",
        sizeClasses[size],
        className
      )}
      style={{ backgroundColor: colorFor(name || "?") }}
      aria-hidden="true"
    >
      {initials(name)}
    </div>
  );
}
