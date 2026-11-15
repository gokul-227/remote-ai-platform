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
import { CONTACT_EMAIL } from "@/figma/legal_content";

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
});
