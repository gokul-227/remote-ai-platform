import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/figma/index.css";

// Inter is self-hosted via next/font (the Figma export loads it from Google
// Fonts, which the site's CSP blocks) — same typeface, same weights.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], display: "swap" });

export const metadata: Metadata = {
  title: "Remote AI Platform",
  description: "Connect with engineers, find remote work, and bring great projects to life together.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
