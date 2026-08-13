type ClassValue = string | number | null | undefined | false | Record<string, boolean | undefined> | ClassValue[];

function flatten(input: ClassValue, out: string[]) {
  if (!input) return;
  if (typeof input === "string" || typeof input === "number") {
    out.push(String(input));
    return;
  }
  if (Array.isArray(input)) {
    input.forEach((v) => flatten(v, out));
    return;
  }
  for (const key in input) {
    if (input[key]) out.push(key);
  }
}

export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  inputs.forEach((i) => flatten(i, out));
  return out.join(" ");
}
