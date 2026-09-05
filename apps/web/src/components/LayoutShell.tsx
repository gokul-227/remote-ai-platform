"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { TopNavbar } from "@/components/TopNavbar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { CommandPalette } from "@/components/CommandPalette";
import { X } from "lucide-react";

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const pathname = usePathname();
  const isAuthRoute = pathname?.startsWith("/auth/");

  useEffect(() => {
    const handler = () => { if (window.innerWidth >= 768) setMobileOpen(false); };
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (isAuthRoute) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-[var(--bg-page)] text-[var(--text-main)] flex flex-col">
      <TopNavbar onMenuClick={() => setMobileOpen(!mobileOpen)} onSearchClick={() => setPaletteOpen(true)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* Mobile Sidebar Drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="w-72 h-full bg-[var(--bg-surface)] p-4 shadow-xl overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-[var(--border-color)]">
              <span className="font-bold text-[var(--text-main)] text-sm">Navigation</span>
              <button onClick={() => setMobileOpen(false)} className="p-1 rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>
            <Sidebar />
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 pb-20 md:pb-6">
        {children}
      </div>

      <MobileBottomNav />

      {/* Footer */}
      <footer className="hidden md:block bg-[var(--bg-surface)] border-t border-[var(--border-color)] py-6 px-4 text-xs text-[var(--text-muted)] mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[var(--text-main)]">Remote AI Platform</span>
            <span>© 2026 Remote AI Platform. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-4 text-[var(--text-muted)]">
            <a href="/privacy" className="hover:text-[#0552CC]">Privacy</a>
            <a href="/terms" className="hover:text-[#0552CC]">Terms</a>
            <a href="/impressum" className="hover:text-[#0552CC]">Impressum</a>
            <a href="/security" className="hover:text-[#0552CC]">Security</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
