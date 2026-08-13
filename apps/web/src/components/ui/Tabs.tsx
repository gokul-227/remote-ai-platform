"use client";

import { cn } from "@/lib/cn";

export interface TabItem {
  key: string;
  label: string;
  count?: number;
}

export function Tabs({
  items,
  active,
  onChange,
  className,
}: {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("flex items-center gap-1 border-b border-[var(--border-color)] overflow-x-auto", className)}>
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(item.key)}
            className={cn(
              "relative px-3.5 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
              isActive ? "text-[var(--color-brand)]" : "text-[var(--text-light)] hover:text-[var(--text-main)]"
            )}
          >
            {item.label}
            {typeof item.count === "number" && (
              <span
                className={cn(
                  "ml-1.5 badge-ent",
                  isActive ? "badge-ent-brand" : "badge-ent-neutral"
                )}
              >
                {item.count}
              </span>
            )}
            {isActive && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-[var(--color-brand)] rounded-full" />}
          </button>
        );
      })}
    </div>
  );
}
