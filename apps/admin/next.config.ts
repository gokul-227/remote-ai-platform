import type { NextConfig } from "next";

// The admin console is a static single-page app: no server code, no secrets.
// Every permission check happens in the API, which returns 403 to non-staff.
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  poweredByHeader: false,
};

export default nextConfig;
