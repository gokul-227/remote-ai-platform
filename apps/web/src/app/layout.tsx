import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import { Inter } from "next/font/google";
import "@/figma/index.css";
import { Providers } from "./providers";

// Inter is self-hosted via next/font (the Figma export loads it from Google
// Fonts, which the site's CSP blocks) — same typeface, same weights.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], display: "swap" });

export const metadata: Metadata = {
  ...(SITE_URL ? { metadataBase: new URL(SITE_URL) } : {}),
  title: "Remote AI Platform",
  description: "Connect with professionals, find remote work, and bring great projects to life together.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
