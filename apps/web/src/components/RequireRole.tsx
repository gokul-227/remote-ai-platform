"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useSwitchWorkspace } from "@/hooks/useWorkspace";
import { AccessDenied, Btn, Loading } from "@/components/rap/kit";

type Role = "ENGINEER" | "COMPANY" | "ADMIN";
const LABEL: Record<Role, string> = { ENGINEER: "engineer", COMPANY: "company", ADMIN: "admin" };

/** Client-side gate for role-restricted pages. The API is the real
 * authorization boundary — this only avoids flashing a page shell at users
 * who can't act on it, and offers the workspace switch when that's the fix. */
export function RequireRole({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace(`/auth/login?redirect=${encodeURIComponent(pathname || "/")}`);
  }, [loading, user, router, pathname]);

  if (loading || !user) return <Loading label="Loading" />;
  if (!roles.includes(user.role)) return <WrongWorkspace roles={roles} current={user.role} />;
  return <>{children}</>;
}

function WrongWorkspace({ roles, current }: { roles: Role[]; current: Role }) {
  const { switchTo } = useSwitchWorkspace();
  const target = roles.find((r) => r !== "ADMIN");
  const canSwitch = current !== "ADMIN" && !!target;
  return (
    <AccessDenied
      message={`This page is only available in the ${roles.map((r) => LABEL[r]).join(" or ")} workspace.`}
      action={canSwitch ? <Btn loading={switchTo.isPending} onClick={() => switchTo.mutate(target as "ENGINEER" | "COMPANY")}>Switch to the {LABEL[target as Role]} workspace</Btn> : undefined}
    />
  );
}
