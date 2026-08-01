import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow clearbit image domains
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "logo.clearbit.com",
      },
    ],
  },
};

export default nextConfig;
