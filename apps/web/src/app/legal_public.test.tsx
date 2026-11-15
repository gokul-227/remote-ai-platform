import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ComponentType } from "react";
import About from "./about/page";
import CommunityGuidelines from "./community-guidelines/page";
import Contact from "./contact/page";
import Cookies from "./cookies/page";
import Help from "./help/page";
import Impressum from "./impressum/page";
import Privacy from "./privacy/page";
import Terms from "./terms/page";
import Trust from "./trust/page";
import Accessibility from "./accessibility/page";
import Copyright from "./copyright/page";
import EmployerTerms from "./employer-terms/page";
import Legal from "./legal/page";
import Security from "./security/page";
import { staticSitemap } from "@/lib/sitemaps";
import { CONTACT_EMAIL, LEGAL_PAGES } from "@/figma/legal_content";
import { PublicFooter } from "./PublicChrome";

// Public pages must read like an established job portal's: no owner personal
// data, no hosting/infrastructure vendors or internal tooling, one contact address.
const BANNED: RegExp[] = [
  /oracle/i,
  /\bOCI\b/,
  /\bVM\b/,
  /\brender\.com|\bRender\b/,
  /supabase/i,
  /cloudflare/i,
  /infisical/i,
  /glitchtip/i,
  /uptime kuma/i,
  /\bslack\b/i,
  /brevo/i,
  /\bresend\b/i,
  /sentry/i,
  /workos/i,
  /celery/i,
  /postgres/i,
  /\bredis\b/i,
  /litellm/i,
  /\bgroq\b/i,
  /caddy/i,
  /docker/i,
  /gokul/i,
  /schoneweide/i,
  /berlin/i,
  /@gmail\.com/i,
  /remote-ai-platform/i,
  /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
  /\+?\d[\d\s()-]{8,}\d/, // phone numbers
];

const PAGES: [string, ComponentType][] = [
  ["privacy", Privacy],
  ["terms", Terms],
  ["cookies", Cookies],
  ["community-guidelines", CommunityGuidelines],
  ["trust", Trust],
  ["about", About],
  ["contact", Contact],
  ["help", Help],
  ["impressum", Impressum],
  ["accessibility", Accessibility],
  ["copyright", Copyright],
  ["employer-terms", EmployerTerms],
  ["legal", Legal],
  ["security", Security],
];

describe("public pages", () => {
  it.each(PAGES)("/%s contains no banned personal or infrastructure terms", (_path, Page) => {
    const html = renderToStaticMarkup(<Page />);
    for (const term of BANNED) expect(html, String(term)).not.toMatch(term);
    expect(html).toMatch(/Last updated/);
    const emails = new Set(html.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi));
    expect([...emails]).toEqual([CONTACT_EMAIL]);
  });

  it("legal content source contains no banned terms", () => {
    const src = readFileSync(join(__dirname, "../figma/legal_content.ts"), "utf8").replace(/^\/\/.*$/gm, "");
    for (const term of BANNED) expect(src, String(term)).not.toMatch(term);
  });

  it("privacy policy covers the sections users expect", () => {
    const html = renderToStaticMarkup(<Privacy />);
    for (const h of [
      "Who we are",
      "Data we collect",
      "How we use your data",
      "How your information is shared",
      "Data retention",
      "Your rights and choices",
      "International data transfers",
      "Children",
      "Changes to this policy",
      "Contact us",
    ])
      expect(html).toContain(h);
    expect(html).toMatch(/GDPR/);
    expect(html).toMatch(/CCPA/);
  });

  it("every legal page is in the /legal index, the footer and the sitemap", () => {
    const index = renderToStaticMarkup(<Legal />);
    const footer = renderToStaticMarkup(<PublicFooter />);
    const sitemap = staticSitemap();
    for (const { href } of LEGAL_PAGES) {
      expect(index).toContain(`href="${href}"`);
      expect(footer, href).toContain(`href="${href}"`);
      expect(sitemap, href).toMatch(new RegExp(`${href}</loc>`));
    }
    expect(footer).toContain('href="/legal"');
  });

  it("terms cover the sections a job portal needs", () => {
    const html = renderToStaticMarkup(<Terms />);
    for (const h of [
      "Your content and licence to us",
      "Acceptable use",
      "Job listings from other sites",
      "Third-party links and services",
      "AI-assisted features",
      "Suspension and termination",
      "Disclaimers",
      "Limitation of liability",
      "Governing law and disputes",
      "Changes to these Terms",
    ])
      expect(html).toContain(h);
  });

  it("privacy policy states job retention and in-app export and deletion", () => {
    const html = renderToStaticMarkup(<Privacy />);
    expect(html).toMatch(/90 days/);
    expect(html).toMatch(/Settings &gt; Privacy/);
  });

  it("security.txt points to the contact address and the policy", () => {
    const txt = readFileSync(join(__dirname, "../../public/.well-known/security.txt"), "utf8");
    expect(txt).toMatch(`Contact: mailto:${CONTACT_EMAIL}`);
    expect(txt).toMatch(/Policy: .*\/security/);
    const expires = new Date(/Expires: (\S+)/.exec(txt)![1]);
    expect(expires.getTime()).toBeGreaterThan(Date.now());
  });
});
