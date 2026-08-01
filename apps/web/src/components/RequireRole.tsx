"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";

/** Client-side gate for role-restricted pages (admin/company dashboards).
 * The API is the real authorization boundary — this only avoids flashing
 * a full page shell at users who can't act on it. */
export function RequireRole({
  roles,
  children,
}: {
  roles: Array<"ENGINEER" | "COMPANY" | "ADMIN">;
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/auth/login");
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-[360px] items-center justify-center text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading
      </div>
    );
  }

  if (!roles.includes(user.role)) {
    return (
      <div className="card-enterprise mx-auto max-w-lg p-8 text-center">
        <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-amber-500" />
        <h1 className="text-xl font-bold text-slate-900">Access restricted</h1>
        <p className="mt-2 text-sm text-slate-600">This page is only available to {roles.join(" or ").toLowerCase()} accounts.</p>
      </div>
    );
  }

  return <>{children}</>;
}
