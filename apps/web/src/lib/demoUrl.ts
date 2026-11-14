/** Direct browser preview only; never fetched or rewritten by our server. */
export function demoUrl(raw: string): string | undefined {
  try {
    const url = new URL(raw.includes("://") ? raw.trim() : `https://${raw.trim()}`);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (url.protocol !== "https:" || url.username || url.password) return;
    if (!host.includes(".") || host.includes(":") || /^[\d.]+$/.test(host)) return;
    if (/\.(localhost|local|internal|test|invalid|example)$/.test(host)) return;
    return url.href;
  } catch {
    return undefined;
  }
}
