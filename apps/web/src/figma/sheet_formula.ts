/**
 * Spreadsheet formula engine for the built-in Sheets app.
 *
 * Supports numbers, text, cell references (A1, $B$2), ranges (A1:C3), + - * / ^ & (concat),
 * comparisons (= <> < <= > >=), parentheses and the functions in FUNCTIONS. A pure
 * evaluator: no code is ever executed from cell contents, and cycles return #CYCLE!.
 */

export type Cells = Record<string, string>;
type Val = number | string | boolean;
type Arg = Val | Val[];

export const colName = (i: number): string => {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

export const colIndex = (name: string): number =>
  name.split("").reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0) - 1;

export function parseRef(ref: string): { c: number; r: number } | null {
  const m = /^\$?([A-Z]{1,3})\$?(\d{1,6})$/.exec(ref.toUpperCase());
  return m ? { c: colIndex(m[1]), r: Number(m[2]) - 1 } : null;
}

class FormulaError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

const num = (v: Val): number => {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v.trim() === "") return 0;
  const n = Number(v);
  if (Number.isNaN(n)) throw new FormulaError("#VALUE!");
  return n;
};

const flat = (args: Arg[]): Val[] => args.flatMap((a) => (Array.isArray(a) ? a : [a]));
const nums = (args: Arg[]): number[] =>
  flat(args)
    .filter((v) => typeof v === "number" || (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))))
    .map(num);

const FUNCTIONS: Record<string, (args: Arg[]) => Val> = {
  SUM: (a) => nums(a).reduce((x, y) => x + y, 0),
  AVERAGE: (a) => {
    const n = nums(a);
    if (!n.length) throw new FormulaError("#DIV/0!");
    return n.reduce((x, y) => x + y, 0) / n.length;
  },
  MIN: (a) => (nums(a).length ? Math.min(...nums(a)) : 0),
  MAX: (a) => (nums(a).length ? Math.max(...nums(a)) : 0),
  COUNT: (a) => nums(a).length,
  COUNTA: (a) => flat(a).filter((v) => v !== "").length,
  ROUND: (a) => {
    const f = 10 ** num(flat([a[1] ?? 0])[0]);
    return Math.round(num(flat([a[0]])[0]) * f) / f;
  },
  ABS: (a) => Math.abs(num(flat([a[0]])[0])),
  IF: (a) => {
    const [cond, yes, no] = a.map((x) => (Array.isArray(x) ? x[0] : x));
    return truthy(cond) ? (yes ?? true) : (no ?? false);
  },
  AND: (a) => flat(a).every(truthy),
  OR: (a) => flat(a).some(truthy),
  NOT: (a) => !truthy(flat([a[0]])[0]),
  CONCAT: (a) => flat(a).map(String).join(""),
  LEN: (a) => String(flat([a[0]])[0] ?? "").length,
  UPPER: (a) => String(flat([a[0]])[0] ?? "").toUpperCase(),
  LOWER: (a) => String(flat([a[0]])[0] ?? "").toLowerCase(),
};

export const FUNCTION_NAMES = Object.keys(FUNCTIONS);

function truthy(v: Val | undefined): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return v !== undefined && v !== "" && v.toUpperCase() !== "FALSE";
}

type Tok = { t: "num" | "str" | "ref" | "range" | "id" | "op" | "(" | ")" | ","; v: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '"') {
      const end = src.indexOf('"', i + 1);
      if (end < 0) throw new FormulaError("#ERROR!");
      out.push({ t: "str", v: src.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    const n = /^\d+(\.\d+)?/.exec(src.slice(i));
    if (n) {
      out.push({ t: "num", v: n[0] });
      i += n[0].length;
      continue;
    }
    const r = /^\$?[A-Za-z]{1,3}\$?\d{1,6}(:\$?[A-Za-z]{1,3}\$?\d{1,6})?/.exec(src.slice(i));
    if (r && !/^[A-Za-z]+\(/.test(src.slice(i))) {
      out.push({ t: r[1] ? "range" : "ref", v: r[0].toUpperCase() });
      i += r[0].length;
      continue;
    }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (id) {
      out.push({ t: "id", v: id[0].toUpperCase() });
      i += id[0].length;
      continue;
    }
    const op = /^(<>|<=|>=|[-+*/^&=<>])/.exec(src.slice(i));
    if (op) {
      out.push({ t: "op", v: op[0] });
      i += op[0].length;
      continue;
    }
    if ("(),".includes(ch)) {
      out.push({ t: ch as "(" | ")" | ",", v: ch });
      i++;
      continue;
    }
    throw new FormulaError("#ERROR!");
  }
  return out;
}

const PREC: Record<string, number> = {
  "=": 1,
  "<>": 1,
  "<": 1,
  "<=": 1,
  ">": 1,
  ">=": 1,
  "&": 2,
  "+": 3,
  "-": 3,
  "*": 4,
  "/": 4,
  "^": 5,
};

export function evaluateAll(cells: Cells): Record<string, string> {
  const cache = new Map<string, Val>();
  const visiting = new Set<string>();

  const cellValue = (ref: string): Val => {
    if (cache.has(ref)) return cache.get(ref)!;
    if (visiting.has(ref)) throw new FormulaError("#CYCLE!");
    const raw = cells[ref] ?? "";
    let v: Val;
    if (raw.startsWith("=")) {
      visiting.add(ref);
      try {
        v = evalFormula(raw.slice(1));
      } finally {
        visiting.delete(ref);
      }
    } else if (raw.trim() !== "" && !Number.isNaN(Number(raw))) v = Number(raw);
    else v = raw;
    cache.set(ref, v);
    return v;
  };

  const rangeValues = (range: string): Val[] => {
    const [a, b] = range.split(":").map(parseRef);
    if (!a || !b) throw new FormulaError("#REF!");
    const vals: Val[] = [];
    for (let r = Math.min(a.r, b.r); r <= Math.max(a.r, b.r); r++)
      for (let c = Math.min(a.c, b.c); c <= Math.max(a.c, b.c); c++) vals.push(cellValue(`${colName(c)}${r + 1}`));
    if (vals.length > 100_000) throw new FormulaError("#RANGE!");
    return vals;
  };

  const evalFormula = (src: string): Val => {
    const toks = tokenize(src);
    let pos = 0;
    const peek = () => toks[pos];
    const parseArg = (): Arg => (peek()?.t === "range" ? rangeValues(toks[pos++].v) : parseExpr(0));
    const parsePrimary = (): Val => {
      const tok = toks[pos++];
      if (!tok) throw new FormulaError("#ERROR!");
      if (tok.t === "num") return Number(tok.v);
      if (tok.t === "str") return tok.v;
      if (tok.t === "ref") return cellValue(tok.v.replace(/\$/g, ""));
      if (tok.t === "op" && tok.v === "-") return -num(parsePrimary());
      if (tok.t === "op" && tok.v === "+") return num(parsePrimary());
      if (tok.t === "(") {
        const v = parseExpr(0);
        if (toks[pos++]?.t !== ")") throw new FormulaError("#ERROR!");
        return v;
      }
      if (tok.t === "id") {
        if (tok.v === "TRUE" || tok.v === "FALSE") return tok.v === "TRUE";
        const fn = FUNCTIONS[tok.v];
        if (!fn || toks[pos++]?.t !== "(") throw new FormulaError("#NAME?");
        const args: Arg[] = [];
        if (peek()?.t !== ")") {
          args.push(parseArg());
          while (peek()?.t === ",") {
            pos++;
            args.push(parseArg());
          }
        }
        if (toks[pos++]?.t !== ")") throw new FormulaError("#ERROR!");
        return fn(args);
      }
      throw new FormulaError("#ERROR!");
    };
    const parseExpr = (minPrec: number): Val => {
      let left = parsePrimary();
      while (peek()?.t === "op" && PREC[peek().v] >= minPrec) {
        const op = toks[pos].v;
        const prec = PREC[op];
        pos++;
        const right = parseExpr(op === "^" ? prec : prec + 1);
        left = apply(op, left, right);
      }
      return left;
    };
    const v = parseExpr(0);
    if (pos !== toks.length) throw new FormulaError("#ERROR!");
    return v;
  };

  const out: Record<string, string> = {};
  for (const ref of Object.keys(cells)) {
    try {
      const v = cellValue(ref);
      out[ref] =
        typeof v === "number"
          ? String(Number.isInteger(v) ? v : Math.round(v * 1e10) / 1e10)
          : typeof v === "boolean"
            ? v
              ? "TRUE"
              : "FALSE"
            : v;
    } catch (e) {
      out[ref] = e instanceof FormulaError ? e.code : "#ERROR!";
      cache.delete(ref);
    }
  }
  return out;
}

function apply(op: string, a: Val, b: Val): Val {
  switch (op) {
    case "+":
      return num(a) + num(b);
    case "-":
      return num(a) - num(b);
    case "*":
      return num(a) * num(b);
    case "/":
      if (num(b) === 0) throw new FormulaError("#DIV/0!");
      return num(a) / num(b);
    case "^":
      return num(a) ** num(b);
    case "&":
      return String(a) + String(b);
    case "=":
      return a === b || String(a) === String(b);
    case "<>":
      return !(a === b || String(a) === String(b));
    case "<":
      return num(a) < num(b);
    case "<=":
      return num(a) <= num(b);
    case ">":
      return num(a) > num(b);
    case ">=":
      return num(a) >= num(b);
  }
  throw new FormulaError("#ERROR!");
}
