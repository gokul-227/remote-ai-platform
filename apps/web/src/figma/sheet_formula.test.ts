import { describe, expect, it } from "vitest";
import { colIndex, colName, evaluateAll } from "./sheet_formula";

describe("sheet formulas", () => {
  it("evaluates arithmetic, precedence, references and ranges", () => {
    const out = evaluateAll({
      A1: "2",
      A2: "3",
      A3: "=A1+A2*4",
      A4: "=(A1+A2)*4",
      A5: "=2^3^2",
      B1: "=SUM(A1:A2)",
      B2: "=AVERAGE(A1:A2)",
      B3: "=MAX(A1:A4, 100)",
      B4: '=IF(A1>1, "big", "small")',
      B5: '="Total: "&B1',
      B6: "=-A1+ROUND(2.345, 2)",
      B7: "=COUNT(A1:A2, C9)",
      B8: "=$A$1*10",
    });
    expect(out.A3).toBe("14");
    expect(out.A4).toBe("20");
    expect(out.A5).toBe("512");
    expect(out.B1).toBe("5");
    expect(out.B2).toBe("2.5");
    expect(out.B3).toBe("100");
    expect(out.B4).toBe("big");
    expect(out.B5).toBe("Total: 5");
    expect(out.B6).toBe("0.35");
    expect(out.B7).toBe("2");
    expect(out.B8).toBe("20");
  });

  it("reports errors instead of throwing, including cycles", () => {
    const out = evaluateAll({ A1: "=A2", A2: "=A1", B1: "=1/0", B2: "=NOPE(1)", B3: "=1+", B4: '="a"*2' });
    expect(out.A1).toBe("#CYCLE!");
    expect(out.A2).toBe("#CYCLE!");
    expect(out.B1).toBe("#DIV/0!");
    expect(out.B2).toBe("#NAME?");
    expect(out.B3).toBe("#ERROR!");
    expect(out.B4).toBe("#VALUE!");
  });

  it("never treats cell text as code", () => {
    expect(evaluateAll({ A1: "=constructor" }).A1).toBe("#NAME?");
    expect(evaluateAll({ A1: "alert(1)" }).A1).toBe("alert(1)");
  });

  it("names columns", () => {
    expect([colName(0), colName(25), colName(26), colName(701)]).toEqual(["A", "Z", "AA", "ZZ"]);
    expect(colIndex("AA")).toBe(26);
  });
});
