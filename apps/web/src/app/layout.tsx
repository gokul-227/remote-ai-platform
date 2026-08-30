import type { Metadata } from "next";
import { Fraunces } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider, THEME_INIT_SCRIPT } from "@/lib/theme";
import { LayoutShell } from "@/components/LayoutShell";
import { QueryProvider } from "@/components/QueryProvider";
import { ToastProvider } from "@/components/ui/Toast";

// Editorial display serif for headlines only — body/UI text stays on the
// existing system-sans stack for density and readability.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-display",
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={`${fraunces.variable} antialiased min-h-screen`}>
        <ThemeProvider>
          <QueryProvider>
            <AuthProvider>
              <ToastProvider>
                <LayoutShell>{children}</LayoutShell>
              </ToastProvider>
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
