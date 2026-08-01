import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { LayoutShell } from "@/components/LayoutShell";
import { QueryProvider } from "@/components/QueryProvider";

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
    <html lang="en">
      <body className="antialiased min-h-screen">
        <QueryProvider><AuthProvider><LayoutShell>{children}</LayoutShell></AuthProvider></QueryProvider>
      </body>
    </html>
  );
}
