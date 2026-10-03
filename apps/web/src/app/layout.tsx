import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import localFont from "next/font/local";
import "@/figma/index.css";
import { Providers } from "./providers";

// Inter, self-hosted from the repository (variable font, Latin subset, SIL OFL
// 1.1 -- see fonts/Inter-LICENSE.txt). next/font/google downloaded it from
// Google at every build, and a flaky Google Fonts response failed CI builds;
// the site's CSP also blocks Google Fonts at runtime. Same typeface and weights.
const inter = localFont({
  src: "./fonts/InterVariable-latin.woff2",
  weight: "400 800",
  display: "swap",
});

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
