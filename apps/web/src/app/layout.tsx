import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { LayoutShell } from "@/components/LayoutShell";

export const metadata: Metadata = {
  title: "WorkMesh AI — AI-Powered Remote Engineering Marketplace",
  description:
    "Discover remote engineering jobs, build AI-enhanced profiles, and connect companies with world-class remote talent.",
  keywords: ["remote jobs", "engineering marketplace", "AI matching", "software developer jobs"],
  openGraph: {
    title: "WorkMesh AI",
    description: "AI-powered remote engineering marketplace",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0b0f19] text-slate-100 antialiased min-h-screen">
        <AuthProvider>
          <LayoutShell>{children}</LayoutShell>
        </AuthProvider>
      </body>
    </html>
  );
}
