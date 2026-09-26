"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Loading } from "@/components/rap/kit";

/** Client-side gate for pages whose data only exists behind auth. The API
 * is the real boundary — this avoids firing calls that will 401 and avoids
 * flashing an empty shell at anonymous visitors. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace(`/auth/login?redirect=${encodeURIComponent(pathname || "/")}`);
  }, [loading, user, router, pathname]);

  if (loading || !user) return <Loading label="Loading" />;
  return <>{children}</>;
}
