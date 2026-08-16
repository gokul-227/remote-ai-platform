"use client";

import { useState } from "react";
import { User, Building2, ChevronsUpDown, Check, Loader2 } from "lucide-react";
import { useSwitchWorkspace } from "@/hooks/useWorkspace";

const WORKSPACES = [
  { role: "ENGINEER" as const, label: "Personal Workspace", description: "Jobs, applications, your professional profile", icon: User },
  { role: "COMPANY" as const, label: "Organization Workspace", description: "Hiring, candidates, company projects", icon: Building2 },
];

// Slack/Notion-style workspace switcher — same account, same session, no
// second login. Only rendered for ENGINEER/COMPANY users; ADMIN has its own
// separate console (not a "workspace" in this sense) and logged-out visitors
// have nothing to switch between.
export function WorkspaceSwitcher() {
  const { currentWorkspace, switchTo, hasEngineerProfile, hasCompanyProfile } = useSwitchWorkspace();
  const [open, setOpen] = useState(false);

  if (!currentWorkspace) return null;

  const current = WORKSPACES.find((w) => w.role === currentWorkspace) ?? WORKSPACES[0];
  const CurrentIcon = current.icon;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-semibold text-[var(--text-main)] hover:bg-[var(--bg-subtle)] transition-colors"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <CurrentIcon className="h-4 w-4 text-[var(--color-brand)]" />
        <span className="hidden md:inline">{current.label}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-[var(--text-light)]" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div role="listbox" className="absolute left-0 mt-1.5 w-72 surface-elevated overflow-hidden z-50 animate-fade-in">
            <div className="px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-light)] border-b border-[var(--border-color)]">
              Switch workspace
            </div>
            {WORKSPACES.map((ws) => {
              const Icon = ws.icon;
              const isActive = ws.role === currentWorkspace;
              const isPending = switchTo.isPending && switchTo.variables === ws.role;
              const hasProfile = ws.role === "ENGINEER" ? hasEngineerProfile : hasCompanyProfile;

              return (
                <button
                  key={ws.role}
                  role="option"
                  aria-selected={isActive}
                  disabled={isActive || switchTo.isPending}
                  onClick={() => {
                    setOpen(false);
                    if (!isActive) switchTo.mutate(ws.role);
                  }}
                  className="w-full flex items-start gap-3 px-3.5 py-2.5 text-left hover:bg-[var(--bg-subtle)] disabled:cursor-default transition-colors"
                >
                  <div className="h-8 w-8 rounded-lg bg-[var(--color-brand-light)] flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="h-4 w-4 text-[var(--color-brand)]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-[var(--text-main)]">{ws.label}</p>
                      {!hasProfile && !isActive && (
                        <span className="text-[10px] font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-1.5 py-0.5 rounded">
                          Set up &rarr;
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[var(--text-light)]">{ws.description}</p>
                  </div>
                  {isPending ? (
                    <Loader2 className="h-4 w-4 text-[var(--text-light)] animate-spin shrink-0 mt-1" />
                  ) : isActive ? (
                    <Check className="h-4 w-4 text-[var(--color-brand)] shrink-0 mt-1" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
