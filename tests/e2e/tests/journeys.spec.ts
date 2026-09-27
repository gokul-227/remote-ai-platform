import { expect, test, type Browser, type Page } from "@playwright/test";
import { API, apiAs, expectNoHorizontalOverflow, signIn, signUp, tokenOf, unique } from "./support";

/**
 * Core marketplace journeys, driven through the real UI against the real API
 * and database (see support.ts for the isolated stack). Serial: later journeys
 * build on what earlier ones created, as real users would.
 */
test.describe.configure({ mode: "serial" });

const run = Date.now().toString(36);
const org = { name: "Hana Hiring", email: unique("org") };
const pro = { name: "Priya Freelance", email: unique("pro") };
const jobTitle = `Brand illustrator ${run}`;
let jobId = "";
let secondJobId = "";
let proProfileId = "";

async function asUser(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, email);
  return page;
}

test("an organisation signs up, sets up its profile and publishes a job", async ({ page, request }) => {
  await signUp(page, { as: "organisation", ...org });
  await page.getByLabel("Organization name").fill(`Northwind ${run}`);
  await page.getByLabel("Industry").fill("Design");
  await page.getByRole("button", { name: /create company profile/i }).click();
  await expect(page.getByText("Company profile saved.")).toBeVisible();

  await page.goto("/#postjob");
  await page.getByLabel("Job title").fill(jobTitle);
  await page.getByLabel("Description").fill("Illustrate our brand world across web and print.");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Add a required skill").fill("Illustration");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Hourly rate (USD)").fill("60");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: /publish job/i }).click();
  await expect(page.getByRole("heading", { name: "Job published" })).toBeVisible();

  const jobs = await (await request.get(`${API}/api/v1/jobs`, { params: { query: jobTitle, is_remote: "true" } })).json();
  jobId = jobs.find((j: { title: string }) => j.title === jobTitle)?.id;
  expect(jobId, "published job is listed by the API").toBeTruthy();
  const job = jobs.find((j: { id: string }) => j.id === jobId);
  expect(job.salary_period).toBe("hour");
  expect(job.skills).toContain("Illustration");

  const second = await apiAs(request, page, "post", "/jobs", {
    title: `Packaging designer ${run}`, description: "Design packaging for our product line.", job_type: "contract",
    skills: ["Illustration"], is_remote: true, location: "Remote",
  });
  expect(second.status()).toBe(201);
  secondJobId = (await second.json()).id;
});

test("a visitor finds the job by search and opens a shared link in a fresh browser", async ({ browser }) => {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/#jobs");
  await page.getByLabel("Search jobs").fill(jobTitle);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText(jobTitle).first()).toBeVisible();

  const shared = await (await browser.newContext()).newPage();
  await shared.goto(`/#jobdetail/${jobId}`);
  await expect(shared.getByRole("heading", { name: jobTitle })).toBeVisible();
});

test("a professional signs up, builds a profile, saves the job and applies", async ({ page, request }) => {
  await signUp(page, { as: "professional", ...pro });
  await page.getByRole("button", { name: /build it myself/i }).click();
  await page.getByLabel("Professional headline").fill("Freelance illustrator");
  await page.getByLabel("Primary role").fill("Illustrator");
  await page.getByLabel(/skills/i).fill("Illustration, Procreate");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Hourly rate (USD)").fill("55");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("heading", { name: /you’re ready to explore/i })).toBeVisible();

  const me = await apiAs(request, page, "get", "/engineers/me");
  expect(me.status()).toBe(200);
  proProfileId = (await me.json()).id;

  await page.goto("/#jobs");
  await page.getByLabel("Search jobs").fill(jobTitle);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("heading", { name: jobTitle })).toBeVisible();
  // The match panel works now that the profile exists.
  await expect(page.getByText(/complete your professional profile/i)).toHaveCount(0);

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Saved", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Easy Apply" }).nth(1).click();
  const dialog = page.getByRole("dialog", { name: /apply to/i });
  for (let i = 0; i < 2; i++) await dialog.getByRole("button", { name: "Next" }).click();
  await dialog.getByLabel("Cover note (optional)").fill("I'd love to draw for you.");
  await dialog.getByRole("button", { name: "Next" }).click();
  await dialog.getByRole("button", { name: "Submit application" }).click();
  await expect(page.getByText(/application sent to/i)).toBeVisible();

  // Survives a reload and a fresh sign-in.
  await page.reload();
  await page.getByLabel("Search jobs").fill(jobTitle);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("Applied").first()).toBeVisible();
  const apps = await (await apiAs(request, page, "get", "/applications/me")).json();
  expect(apps.some((a: { job: { id: string } }) => a.job.id === jobId)).toBe(true);
  const saved = await (await apiAs(request, page, "get", "/saved-jobs")).json();
  expect(saved.some((j: { id: string }) => j.id === jobId)).toBe(true);
});

test("the organisation invites the professional to its second role and they accept", async ({ browser, request }) => {
  const orgPage = await asUser(browser, org.email);
  await orgPage.goto(`/#engineer/${proProfileId}`);
  await expect(orgPage.getByRole("heading", { name: pro.name })).toBeVisible();
  await orgPage.getByRole("button", { name: "Invite to job" }).click();
  await orgPage.getByRole("dialog").getByRole("button", { name: new RegExp(`Packaging designer ${run}`) }).click();
  await expect(orgPage.getByText(/was invited to apply/i)).toBeVisible();

  const proPage = await asUser(browser, pro.email);
  await proPage.goto("/#applications");
  await proPage.getByRole("button", { name: "Accept invitation" }).click();
  await expect.poll(async () => {
    const apps = await (await apiAs(request, proPage, "get", "/applications/me")).json();
    return apps.find((a: { job: { id: string } }) => a.job.id === secondJobId)?.application.status;
  }).not.toBe("INVITED");
});

test("the organisation and the professional exchange messages", async ({ browser, request }) => {
  const orgPage = await asUser(browser, org.email);
  await orgPage.goto(`/#engineer/${proProfileId}`);
  await orgPage.getByRole("button", { name: "Message", exact: true }).click();
  await expect(orgPage).toHaveURL(/#messenger/);
  const text = `Hello from Northwind ${run}`;
  await orgPage.getByLabel("Message", { exact: true }).fill(text);
  await orgPage.getByRole("button", { name: "Send message" }).click();
  await expect(orgPage.getByText(text).first()).toBeVisible();

  const proPage = await asUser(browser, pro.email);
  await proPage.goto("/#messenger");
  await proPage.getByText(org.name).first().click();
  await expect(proPage.getByText(text).first()).toBeVisible({ timeout: 20_000 });

  // Stored exactly once, and only the two participants can read it.
  const conversations = await (await apiAs(request, proPage, "get", "/conversations")).json();
  const convo = conversations.find((c: { last_message?: { content?: string } }) => c.last_message?.content === text) ?? conversations[0];
  const messages = await (await apiAs(request, proPage, "get", `/conversations/${convo.id}/messages`)).json();
  expect(messages.filter((m: { content: string }) => m.content === text)).toHaveLength(1);
  const outsider = await (await browser.newContext()).newPage();
  await signUp(outsider, { as: "professional", name: "Outsider", email: unique("outsider") });
  expect((await apiAs(request, outsider, "get", `/conversations/${convo.id}/messages`)).status()).toBeGreaterThanOrEqual(403);
});

test("the API refuses what the UI doesn't offer", async ({ browser, request }) => {
  const proPage = await asUser(browser, pro.email);
  expect((await apiAs(request, proPage, "get", "/applications/company")).status()).toBe(403);
  expect((await apiAs(request, proPage, "get", "/admin/stats")).status()).toBe(403);
  expect((await apiAs(request, proPage, "delete", `/jobs/${jobId}`)).status()).toBeGreaterThanOrEqual(403);
  expect((await request.get(`${API}/api/v1/auth/me`)).status()).toBe(401);
  expect((await request.get(`${API}/api/v1/admin/stats`)).status()).toBe(401);
});

test("hiding a profile removes it from shared links, but not from organisations applied to", async ({ browser, request }) => {
  const proPage = await asUser(browser, pro.email);
  await proPage.goto("/#settings");
  await proPage.getByRole("main").getByRole("button", { name: "Privacy", exact: true }).click();
  await expect(proPage.getByLabel(/show my profile publicly/i)).toBeEnabled();
  await proPage.getByLabel(/show my profile publicly/i).uncheck();
  await proPage.getByRole("button", { name: "Save preferences" }).click();
  await expect(proPage.getByText("Privacy preferences saved.")).toBeVisible();

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`/#engineer/${proProfileId}`);
  await expect(visitor.getByText(/this profile isn’t available/i)).toBeVisible();
  const listed = await (await request.get(`${API}/api/v1/engineers`, { params: { limit: 100 } })).json();
  expect(listed.some((e: { id: string }) => e.id === proProfileId)).toBe(false);

  const orgPage = await asUser(browser, org.email);
  await orgPage.goto(`/#engineer/${proProfileId}`);
  await expect(orgPage.getByRole("heading", { name: pro.name })).toBeVisible();

  // Restore for the following journeys.
  await proPage.getByLabel(/show my profile publicly/i).check();
  await proPage.getByRole("button", { name: "Save preferences" }).click();
  await expect(proPage.getByText("Privacy preferences saved.")).toBeVisible();
});

test("a resume upload succeeds and says so honestly when AI is unavailable", async ({ browser }) => {
  const proPage = await asUser(browser, pro.email);
  await proPage.goto("/#onboarding");
  await proPage.getByRole("button", { name: /start with your resume/i }).click();
  await proPage.getByLabel("Resume file").setInputFiles({ name: "resume.pdf", mimeType: "application/pdf", buffer: Buffer.from(minimalPdf("Priya Freelance - Illustrator")) });
  await proPage.getByRole("button", { name: /import with ai/i }).click();
  // No AI keys in this stack: the file is stored, and the message says parsing didn't happen.
  const status = proPage.getByRole("status");
  await expect(status).toContainText(/resume uploaded/i, { timeout: 60_000 });
  await expect(status).toContainText(/fill in your profile by hand/i);
});

test("signing out ends the session; signing out everywhere revokes other devices", async ({ browser, request }) => {
  const laptop = await asUser(browser, pro.email);
  const phone = await asUser(browser, pro.email);
  const phoneToken = await tokenOf(phone);

  await laptop.getByRole("button", { name: "Your account" }).click();
  await laptop.getByRole("button", { name: /sign out/i }).click();
  await expect(laptop).toHaveURL(/#login/);
  expect(await laptop.evaluate(() => localStorage.getItem("remote_ai_platform_token"))).toBeNull();

  const again = await asUser(browser, pro.email);
  await again.goto("/#settings");
  await again.getByRole("main").getByRole("button", { name: "Security", exact: true }).click();
  await again.getByRole("button", { name: "Sign out all sessions" }).click();
  await expect(again).toHaveURL(/#login/);
  const stale = await request.get(`${API}/api/v1/auth/me`, { headers: { Authorization: `Bearer ${phoneToken}` } });
  expect(stale.status()).toBe(401);
});

test("core screens fit a phone screen", async ({ browser }) => {
  const phone = await (await browser.newContext({ viewport: { width: 375, height: 800 } })).newPage();
  for (const route of ["#login", "#register", "#jobs", `#jobdetail/${jobId}`, "#privacy"]) {
    await phone.goto(`/${route}`);
    await phone.waitForLoadState("networkidle");
    await expectNoHorizontalOverflow(phone);
  }
});

test("an API failure shows an error with a working retry, not an empty result", async ({ page }) => {
  let fail = true;
  await page.route("**/api/v1/jobs?**", (route) => (fail ? route.fulfill({ status: 500, body: "{}" }) : route.continue()));
  await page.goto("/#jobs");
  await expect(page.getByText(/couldn’t load jobs/i)).toBeVisible();
  await expect(page.getByText(/no jobs match/i)).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText(/results/i).first()).toBeVisible();
  await expect(page.getByText(/couldn’t load jobs/i)).toHaveCount(0);
});

/** A one-page PDF with a line of text, enough for the upload path. */
function minimalPdf(text: string): string {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}
