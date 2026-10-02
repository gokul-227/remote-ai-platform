import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";

describe("csv (SEC-04A formula injection)", () => {
  it("neutralises formula-leading cells", () => {
    for (const v of ["=HYPERLINK(\"http://x\")", "+cmd", "-2+3", "@SUM(A1)", "\tx", "\rx"]) {
      expect(csvCell(v).startsWith(`"'`)).toBe(true);
    }
  });

  it("keeps plain numbers and ordinary text", () => {
    expect(csvCell(-5)).toBe('"-5"');
    expect(csvCell("+3.2")).toBe('"+3.2"');
    expect(csvCell("Python; Go")).toBe('"Python; Go"');
  });

  it("quotes, escapes and serialises", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('""');
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
    expect(toCsv([["a", "b"], [1, "=x"]])).toBe('"a","b"\n"1","\'=x"');
  });
});
