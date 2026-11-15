import { test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { signUp, unique } from "./support";

// Audit helper (not part of CI): set AUDIT_OUT to record what every screen shows.
const ROUTES = (
  process.env.AUDIT_ROUTES ||
  "home,feed,notifications,assistant,profile,network,invitations,suggestions,engineers,companies,coprofile,messenger,channels,groups,meetings,calls,jobs,recs,saved,applications,onboarding,dash,postjob,cojobs,candidates,codash,ride,work,freelancework,taskmarket,contracts,submissions,worklog,earnings,reviews,workspace,projects,backlog,timeline,docs,sheets,slides,files,repos,quality,browser,settings,security,privacydata,apps,help,support,search"
).split(",");

for (const vp of [
  { n: "desktop", w: 1366, h: 900 },
  { n: "phone", w: 390, h: 844 },
]) {
  test(`audit crawl ${vp.n}`, async ({ page }) => {
    test.skip(!process.env.AUDIT_OUT, "Set AUDIT_OUT to run the audit crawl");
    test.setTimeout(600_000);
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await signUp(page, { as: "professional", name: "Audit Member", email: unique("audit") });
    const out: Record<string, unknown>[] = [];
    let errs: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errs.push(m.text().slice(0, 160));
    });
    page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message.slice(0, 160)));
    page.on("response", (r) => {
      if (r.status() >= 400 && r.url().includes("/api/"))
        errs.push(`${r.status()} ${r.url().replace(/^.*\/api\/v1/, "")}`);
    });
    for (const r of ROUTES) {
      errs = [];
      await page.goto(`/#${r}`);
      await page.waitForTimeout(1800);
      const h1 = await page
        .locator("main h1")
        .first()
        .textContent({ timeout: 1000 })
        .catch(() => null);
      const text = (
        await page
          .locator("main")
          .innerText()
          .catch(() => "")
      )
        .slice(0, 300)
        .replace(/\s+/g, " ");
      out.push({ r, h1, errs: [...new Set(errs)], text });
    }
    writeFileSync(`${process.env.AUDIT_OUT}/audit-${vp.n}.json`, JSON.stringify(out, null, 1));
  });
}
