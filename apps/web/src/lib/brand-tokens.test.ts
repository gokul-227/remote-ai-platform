import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND } from "./brand";

// tools/brand/tokens.json is the one design-token source; generate.mjs writes the CSS.
const root = join(__dirname, "..", "..", "..", "..");
const tokens = JSON.parse(readFileSync(join(root, "tools/brand/tokens.json"), "utf8"));
const css = (p: string) => readFileSync(join(root, p), "utf8");

describe("design tokens", () => {
  it("BRAND constants match tokens.json", () => {
    expect(BRAND.blue).toBe(tokens.color.blue);
    expect(BRAND.blueHover).toBe(tokens.color["blue-hover"]);
    expect(BRAND.navy).toBe(tokens.color.navy);
    expect(BRAND.charcoal).toBe(tokens.color.charcoal);
    expect(BRAND.mist).toBe(tokens.color.mist);
    expect(BRAND.sky).toBe(tokens.color.sky);
    expect(BRAND.dark).toBe(tokens.color.dark);
  });
  it("generated web and admin CSS carry every colour token", () => {
    for (const file of ["apps/web/src/figma/brand-tokens.css", "apps/admin/src/app/brand-tokens.css"])
      for (const [k, v] of Object.entries(tokens.color))
        expect(css(file).toLowerCase()).toContain(`--rap-${k}: ${String(v).toLowerCase()};`);
  });
});
