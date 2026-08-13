"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

/** Client-side gate for pages whose data only exists behind auth (feed,
 * network, messages, notifications, groups, projects, applications).
 * The API is the real boundary — this just avoids firing calls that will
 * 401 and avoids flashing an empty/broken shell at anonymous visitors. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace(`/auth/login?redirect=${encodeURIComponent(pathname || "/")}`);
  }, [loading, user, router, pathname]);

  if (loading || !user) {
    return (
      <div className="flex min-h-[360px] items-center justify-center text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading
      </div>
    );
  }

  return <>{children}</>;
}
