import Link from "next/link";
import type { ReactNode } from "react";

/** Shared frame for public pages: header with sign-in, and the sign-up prompt for actions. */
export function PublicFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f0f2f5] text-[#1c1e21]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link href="/" className="text-lg font-bold text-[#0552CC]">
            Remote AI Platform
          </Link>
          <nav className="flex items-center gap-4 text-sm font-semibold">
            <Link href="/remote-jobs" className="hover:underline">
              Jobs
            </Link>
            <Link href="/#login" className="hover:underline">
              Sign in
            </Link>
            <Link href="/#register" className="rounded-full bg-[#0552CC] px-4 py-1.5 text-white">
              Join free
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </div>
  );
}

/** An action that needs an account: opens the app, which asks visitors to sign in. */
export function ActionLink({ href, children, primary }: { href: string; children: ReactNode; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={
        primary
          ? "inline-flex rounded-full bg-[#0552CC] px-5 py-2 font-semibold text-white"
          : "inline-flex rounded-full border border-[#0552CC] px-5 py-2 font-semibold text-[#0552CC]"
      }
    >
      {children}
    </Link>
  );
}
