import Link from "next/link";
import { Logo } from "@/components/Brand";
import { OPERATOR } from "@/figma/legal_content";
import type { ReactNode } from "react";

const LEGAL_EXTRA: [string, string][] = [
  ["/employer-terms", "Employer terms"],
  ["/copyright", "Copyright"],
  ["/security", "Report a vulnerability"],
  ["/accessibility", "Accessibility"],
  ["/legal", "All legal"],
];

const focus = "focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-sky";

/** Brand lockup linking home (symbol + wordmark, "AI" in brand blue). */
export function BrandLockup({ size = 36, variant = "compact" }: { size?: number; variant?: "primary" | "compact" }) {
  return (
    <Link href="/" aria-label="Remote AI Platform home" className={`flex items-center ${focus}`}>
      <Logo variant={variant} h={size} decorative />
    </Link>
  );
}

/** The site's main sections: one consistent list in the header of every public page (sitelinks). */
export const MAIN_SECTIONS: [string, string][] = [
  ["Remote jobs", "/remote-jobs"],
  ["Work from home", "/work-from-home-jobs"],
  ["By country", "/remote-jobs/in"],
  ["Companies", "/remote-jobs/at"],
  ["Guides", "/guides"],
];

/** Header for public, crawlable pages: brand, the main sections, sign-in. */
export function SiteNav({ home = false }: { home?: boolean }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <nav
        aria-label="Main navigation"
        className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3"
      >
        <BrandLockup size={home ? 40 : 36} />
        <ul className="order-3 flex w-full flex-wrap gap-x-5 gap-y-1 text-sm font-semibold sm:order-none sm:w-auto">
          {(home ? [MAIN_SECTIONS[0], MAIN_SECTIONS[3]] : MAIN_SECTIONS).map(([label, href]) => (
            <li key={href}>
              <Link href={href} className={`text-navy hover:text-brand hover:underline ${focus}`}>
                {label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-4 text-sm font-semibold">
          {/* Native hash navigation notifies AppEntry; Next Link pushState does not emit hashchange. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/#login" className={`text-navy hover:underline ${focus}`}>
            Sign in
          </a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/#register" className={`rounded-lg bg-brand px-4 py-2 text-white hover:bg-brand-hover ${focus}`}>
            Join free
          </a>
        </div>
      </nav>
    </header>
  );
}

export const PublicHeader = () => <SiteNav />;

/** Trust footer: legal, security, status and contact on every public page. */
export function PublicFooter() {
  const year = new Date().getUTCFullYear();
  const linkClass = `hover:text-brand hover:underline ${focus}`;
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <BrandLockup size={48} variant="primary" />
          <p className="sr-only">Connect. Find work. Get work done.</p>
        </div>
        <nav aria-label="Find work">
          <h2 className="mb-3 text-sm font-semibold text-navy">Find work</h2>
          <ul className="space-y-2">
            <li>
              <Link className={linkClass} href="/remote-jobs">
                All remote jobs
              </Link>
            </li>
            <li>
              <Link className={linkClass} href="/work-from-home-jobs">
                Work from home jobs
              </Link>
            </li>
            <li>
              <Link className={linkClass} href="/remote-work">
                Remote work
              </Link>
            </li>
            <li>
              <Link className={linkClass} href="/remote-jobs/in">
                Remote jobs by country
              </Link>
            </li>
            <li>
              <Link className={linkClass} href="/remote-jobs/in/usa">
                Remote jobs in the US
              </Link>
            </li>
            <li>
              <Link className={linkClass} href="/remote-jobs/in/uk">
                Remote jobs in the UK
              </Link>
            </li>
            <li>
              <Link className={linkClass} href="/remote-jobs/freelance">
                Freelance work
              </Link>
            </li>
            <li>
              <Link className={linkClass} href="/remote-jobs/in/worldwide">
                Work from anywhere
              </Link>
            </li>
            <li>
              <Link className={linkClass} href="/remote-jobs/at">
                Companies hiring
              </Link>
            </li>
            <li>
              <Link className={linkClass} href="/guides">
                Remote work guides
              </Link>
            </li>
            <li>
              <Link className={linkClass} href="/sitemap">
                Site map
              </Link>
            </li>
          </ul>
        </nav>
        <nav aria-label="Trust and legal">
          <h2 className="mb-3 text-sm font-semibold text-navy">Trust</h2>
          <ul className="space-y-2">
            <li>
              <Link className={linkClass} href="/privacy">
                Privacy
              </Link>
            </li>
            <li>
              <Link className={linkClass} href="/terms">
                Terms
              </Link>
            </li>
            <li>
              <Link className={linkClass} href="/trust">
                Security
              </Link>
            </li>
            <li>
              <Link className={linkClass} href="/cookies">
                Cookies
              </Link>
            </li>
            <li>
              <Link className={linkClass} href="/community-guidelines">
                Community guidelines
              </Link>
            </li>
            <li>
              <Link className={linkClass} href="/impressum">
                Legal notice
              </Link>
            </li>
            {LEGAL_EXTRA.map(([href, label]) => (
              <li key={href}>
                <Link className={linkClass} href={href}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label="Support">
          <h2 className="mb-3 text-sm font-semibold text-navy">Support</h2>
          <ul className="space-y-2">
            <li>
              <Link className={linkClass} href="/about">
                About
              </Link>
            </li>
            <li>
              <Link className={linkClass} href="/help">
                Help centre
              </Link>
            </li>
            <li>
              <Link className={linkClass} href="/contact">
                Contact
              </Link>
            </li>
            <li>
              <Link className={linkClass} href="/status">
                Service status
              </Link>
            </li>
            <li>
              <a className={linkClass} href={`mailto:${OPERATOR.contactEmail}`}>
                {OPERATOR.contactEmail}
              </a>
            </li>
          </ul>
        </nav>
      </div>
      <p className="border-t border-slate-100 px-4 py-4 text-center text-xs text-slate-500">
        © {year} Remote AI Platform
      </p>
    </footer>
  );
}

/** Shared frame for public pages: skip link, header, main landmark, trust footer. */
export function PublicFrame({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-screen bg-mist text-charcoal">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:text-brand"
      >
        Skip to content
      </a>
      <PublicHeader />
      <main id="main" className={`mx-auto ${wide ? "max-w-6xl" : "max-w-4xl"} px-4 py-8`}>
        {children}
      </main>
      <PublicFooter />
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
          ? `inline-flex rounded-full bg-brand px-5 py-2 font-semibold text-white hover:bg-brand-hover ${focus}`
          : `inline-flex rounded-full border border-brand px-5 py-2 font-semibold text-brand ${focus}`
      }
    >
      {children}
    </Link>
  );
}

/** Visible breadcrumb trail (the JSON-LD BreadcrumbList mirrors it). */
export function Breadcrumbs({ trail }: { trail: [string, string][] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-slate-600">
      <ol className="flex flex-wrap items-center gap-1">
        {trail.map(([name, href], i) => (
          <li key={href} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden="true">›</span>}
            {i === trail.length - 1 ? (
              <span aria-current="page">{name}</span>
            ) : (
              <Link href={href} className={`hover:underline ${focus}`}>
                {name}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** JSON for a <script type="application/ld+json">, escaped so content can't close the tag. */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
