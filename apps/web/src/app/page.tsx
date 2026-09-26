"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Ic } from "@/components/rap/kit";
import { AuthLayout, authButton } from "@/components/rap/AuthLayout";
import { homeFor } from "@/features/auth/destinations";

/** Public entry point — the Figma auth hero doubles as the landing page. */
export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace(homeFor(user.role));
  }, [loading, user, router]);

  return (
    <AuthLayout heroHeading>
      <h2>Join Remote AI Platform</h2>
      <p className="mt-2 text-sm text-slate-500">Explainable AI matching for remote engineering work — for engineers and the companies hiring them.</p>
      <div className="mt-6 space-y-3">
        <Link href="/auth/register" className={authButton}>Create an account</Link>
        <Link href="/auth/login" className="flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-300 px-5 py-3 font-semibold hover:bg-slate-50">Sign in</Link>
      </div>
      <div className="mt-6 border-t border-slate-200 pt-5">
        <p className="text-sm font-semibold">Explore without an account</p>
        <div className="mt-3 space-y-1">
          {([["/jobs", "briefcase", "Browse remote jobs"], ["/engineers", "users", "Discover engineers"], ["/companies", "building", "Explore companies"]] as const).map(([href, icon, label]) => (
            <Link key={href} href={href} className="rap-nav"><span className="rap-nav-icon"><Ic n={icon} s={22} /></span><span className="flex-1">{label}</span><Ic n="right" s={18} c="text-slate-500" /></Link>
          ))}
        </div>
      </div>
    </AuthLayout>
  );
}
