"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";

type WorkspaceRole = "ENGINEER" | "COMPANY";

// ---------------------------------------------------------------------------
// useWorkspaceProfiles
// ---------------------------------------------------------------------------
// Probes both profile endpoints simultaneously so the WorkspaceSwitcher knows
// which workspaces have a completed profile vs still need one.
// Both calls are silent on 404 (retry: 0, no throw), so this is safe for any
// authenticated user regardless of which profiles they have created.
export function useWorkspaceProfiles() {
  const { user } = useAuth();
  const enabled = !!user && (user.role === "ENGINEER" || user.role === "COMPANY");

  const engineerQuery = useQuery({
    queryKey: ["engineer-profile-exists"],
    queryFn: async () => (await api.get("/engineers/me")).data,
    enabled,
    retry: 0,
    staleTime: 30_000,
  });

  const companyQuery = useQuery({
    queryKey: ["company-profile-exists"],
    queryFn: async () => (await api.get("/companies/me")).data,
    enabled,
    retry: 0,
    staleTime: 30_000,
  });

  return {
    hasEngineerProfile: engineerQuery.isSuccess,
    hasCompanyProfile: companyQuery.isSuccess,
    loadingProfiles: engineerQuery.isLoading || companyQuery.isLoading,
  };
}

// ---------------------------------------------------------------------------
// useSwitchWorkspace
// ---------------------------------------------------------------------------
// Real workspace switching using the backend's existing PATCH /auth/role —
// no new backend work needed. EngineerProfile/CompanyProfile rows are each
// keyed by user_id independently (confirmed in the backend models), so
// switching the active role never deletes or overwrites the other profile.
//
// Smart redirect: if the user has no profile for the target workspace,
// redirect to the profile creation page instead of the dashboard, so the
// required first step is immediately obvious instead of landing on an
// empty-state card that requires a second click.
export function useSwitchWorkspace() {
  const { user, updateUser } = useAuth();
  const { hasEngineerProfile, hasCompanyProfile } = useWorkspaceProfiles();
  const router = useRouter();

  const switchTo = useMutation({
    mutationFn: (role: WorkspaceRole) => api.patch(`/auth/role`, null, { params: { role } }),
    onSuccess: (_response, role) => {
      updateUser({ role });
      if (role === "COMPANY") {
        // If the user hasn't created a company profile yet, take them
        // straight to profile creation — not the empty-state dashboard.
        router.push(hasCompanyProfile ? "/company/dashboard" : "/company/profile");
      } else {
        router.push(hasEngineerProfile ? "/engineer/dashboard" : "/engineer/profile");
      }
    },
  });

  const currentWorkspace: WorkspaceRole | null =
    user?.role === "COMPANY" ? "COMPANY" : user?.role === "ENGINEER" ? "ENGINEER" : null;

  return { currentWorkspace, switchTo, hasEngineerProfile, hasCompanyProfile };
}
