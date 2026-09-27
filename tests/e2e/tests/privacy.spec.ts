import { expect, test } from "@playwright/test";
import { API, signUp, tokenOf, unique } from "./support";

test("a user downloads their data and deletes their account", async ({ page, request }) => {
  const email = unique("leaver");
  await signUp(page, { as: "professional", name: "Lea Ver", email });
  await page.getByRole("button", { name: /build it myself/i }).click();
  await page.getByLabel("Professional headline").fill("Copywriter");
  await page.getByLabel(/skills/i).fill("Copywriting");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Save profile" }).click();
  const token = await tokenOf(page);

  await page.goto("/#settings");
  await page.getByRole("main").getByRole("button", { name: "Privacy", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download my data" }).click();
  const file = await download;
  const exported = JSON.parse(await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString()));
  expect(exported.account.email).toBe(email);
  expect(exported.engineer_profiles[0].headline).toBe("Copywriter");

  await page.getByRole("button", { name: "Delete my account" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete your account?" });
  await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
  await dialog.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/#login/);

  // The old session no longer resolves to the deleted account's data.
  const me = await request.get(`${API}/api/v1/engineers/me`, { headers: { Authorization: `Bearer ${token}` } });
  expect(me.status()).toBe(404);
});
