"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export function Drawer({
  open,
  onClose,
  title,
  children,
  side = "right",
  widthClassName = "w-full sm:w-[420px]",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  side?: "left" | "right" | "bottom";
  widthClassName?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  const isBottom = side === "bottom";
  const panelPosition = isBottom
    ? "inset-x-0 bottom-0 w-full max-h-[85vh] rounded-t-2xl"
    : side === "left"
      ? cn("inset-y-0 left-0 h-full", widthClassName)
      : cn("inset-y-0 right-0 h-full", widthClassName);

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 animate-fade-in" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn("absolute bg-[var(--surface-elevated)] shadow-2xl overflow-y-auto flex flex-col", panelPosition)}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)] sticky top-0 bg-[var(--surface-elevated)] z-10">
            <h2 className="text-sm font-semibold text-[var(--text-main)]">{title}</h2>
            <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex-1 px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
