/** Where each role lands after signing in (Figma: engineers → feed, companies → hiring overview). */
export function homeFor(role?: string | null): string {
  if (role === "COMPANY") return "/company/dashboard";
  if (role === "ADMIN") return "/admin/dashboard";
  return "/feed";
}

/** Only allow same-origin, path-only redirects (blocks //evil.com and scheme URLs). */
export function safeRedirect(raw?: string | null): string | null {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\") || raw.startsWith("/auth/")) return null;
  return raw;
}
