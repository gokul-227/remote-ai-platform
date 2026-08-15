"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";

type WorkspaceRole = "ENGINEER" | "COMPANY";

// Real workspace switching using the backend's existing PATCH /auth/role —
// no new backend work needed. EngineerProfile/CompanyProfile rows are each
// keyed by user_id independently (confirmed in the backend models), so
// switching the active role never deletes or overwrites the other profile:
// a user who has completed both an engineer profile and a company profile
// keeps both, and this just changes which one is "active." A user who
// hasn't created the other profile yet lands on that workspace's existing
// "create your profile" empty state — no new UI needed there either.
export function useSwitchWorkspace() {
  const { user, updateUser } = useAuth();
  const router = useRouter();

  const switchTo = useMutation({
    mutationFn: (role: WorkspaceRole) => api.patch(`/auth/role`, null, { params: { role } }),
    onSuccess: (_response, role) => {
      updateUser({ role });
      router.push(role === "COMPANY" ? "/company/dashboard" : "/engineer/dashboard");
    },
  });

  const currentWorkspace: WorkspaceRole | null =
    user?.role === "COMPANY" ? "COMPANY" : user?.role === "ENGINEER" ? "ENGINEER" : null;

  return { currentWorkspace, switchTo };
}
