// CSV built in the browser from user-controlled text (names, skills, job
// titles). A cell starting with = + - @ or a tab/CR is run as a formula by
// spreadsheet apps; prefix it with an apostrophe so it stays text (SEC-04A).
// Plain numbers ("-5", "+3.2") are left as numbers.
const FORMULA_START = /^[=+\-@\t\r]/;
const NUMBER = /^[+-]?\d+(\.\d+)?$/;

export function csvCell(value: unknown): string {
  let text = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (FORMULA_START.test(text) && !NUMBER.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}

export function downloadCsv(name: string, rows: unknown[][]): void {
  const url = URL.createObjectURL(new Blob([toCsv(rows)], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
