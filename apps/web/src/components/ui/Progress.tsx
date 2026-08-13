import { cn } from "@/lib/cn";

export function Progress({ value, className, tone = "brand" }: { value: number; className?: string; tone?: "brand" | "success" | "warning" }) {
  const clamped = Math.max(0, Math.min(100, value));
  const color = tone === "success" ? "var(--color-success)" : tone === "warning" ? "var(--color-warning)" : "var(--color-brand)";
  return (
    <div className={cn("h-1.5 w-full rounded-full bg-slate-100 overflow-hidden", className)}>
      <div className="h-full rounded-full transition-all duration-300" style={{ width: `${clamped}%`, backgroundColor: color }} />
    </div>
  );
}

export function ProgressRing({
  value,
  size = 56,
  strokeWidth = 5,
  label,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const color = clamped >= 75 ? "var(--color-success)" : clamped >= 50 ? "var(--color-warning)" : "var(--color-brand)";

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="#E5E7EB" strokeWidth={strokeWidth} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <span className="absolute text-sm font-semibold text-[var(--text-main)]">{label ?? `${Math.round(clamped)}%`}</span>
    </div>
  );
}
