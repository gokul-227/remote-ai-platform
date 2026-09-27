import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Product copy must not promise what the platform doesn't do (launch contract,
// Phase 02): money is not held or moved, the public job feed is not
// personalised, and there are no audited usage statistics or certifications.
const dir = join(__dirname);
const sources = readdirSync(dir)
  .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
  .map((f) => ({ f, text: readFileSync(join(dir, f), "utf8") }));

const banned: [RegExp, string][] = [
  [/escrow-backed|funds are held until/i, "claims payments are held in escrow"],
  [/top job picks for you/i, "calls the unpersonalised feed personal picks"],
  [/\b\d+(\.\d+)?\s?[KM]\+/, "unverified usage statistic"],
  [/SOC ?2|ISO ?27001/i, "unaudited certification claim"],
  [/guaranteed? (job|hire|placement|income)/i, "guaranteed outcome"],
];

describe("product copy", () => {
  it.each(banned)("never %s", (pattern, why) => {
    const hits = sources.filter(({ text }) => pattern.test(text)).map(({ f }) => f);
    expect(hits, why).toEqual([]);
  });
});
