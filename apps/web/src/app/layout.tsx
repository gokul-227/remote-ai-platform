import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { AppShell } from "@/components/rap/AppShell";
import { QueryProvider } from "@/components/QueryProvider";
import { ToastProvider } from "@/components/ui/Toast";

// Inter is the Figma design's single typeface for every surface.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Remote AI Platform — Remote Work Marketplace",
  description:
    "Discover remote engineering positions, manage developer profiles, and connect companies with global software talent.",
  keywords: ["remote jobs", "engineering marketplace", "software developers", "hiring"],
  openGraph: {
    title: "Remote AI Platform",
    description: "Remote work marketplace",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The Figma design is light-only, so the theme is pinned rather than
    // initialised from storage / prefers-color-scheme.
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <body className={`${inter.variable} antialiased min-h-screen`}>
        <ThemeProvider>
          <QueryProvider>
            <AuthProvider>
              <ToastProvider>
                <AppShell>{children}</AppShell>
              </ToastProvider>
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
