"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { Ic } from "@/components/rap/kit";

type ToastTone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  show: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((message: string, tone: ToastTone = "info") => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  const dismiss = (id: number) => setToasts((prev) => prev.filter((t) => t.id !== id));

  const icons: Record<ToastTone, React.ReactNode> = {
    success: <Ic n="check" s={18} c="text-emerald-400" />,
    error: <Ic n="flag" s={18} c="text-red-400" />,
    info: <Ic n="bell" s={18} c="text-sky-300" />,
  };

  // Figma v2-toast: dark pill, bottom centre.
  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-6 left-1/2 z-[200] flex w-[min(440px,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role={t.tone === "error" ? "alert" : "status"} className="flex items-start gap-3 rounded-lg bg-[#1c1e21] px-5 py-3.5 text-white shadow-[0_8px_24px_#0002]">
            {icons[t.tone]}
            <p className="flex-1 text-sm">{t.message}</p>
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-white/70 hover:text-white"><Ic n="x" s={16} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
