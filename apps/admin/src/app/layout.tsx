import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Inter, self-hosted (SIL OFL 1.1, see fonts/Inter-LICENSE.txt) -- the brand
// typeface from tools/brand/tokens.json, same file as apps/web.
const inter = localFont({
  src: "./fonts/InterVariable-latin.woff2",
  weight: "400 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Remote AI Platform — Operations console",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
