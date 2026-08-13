"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { User, Lock, Bell, Eye, LogOut, Mail, Shield } from "lucide-react";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { useEngineerProfile } from "@/hooks/useEngineerProfile";
import { useCompanyProfile } from "@/hooks/useCompanyProfile";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";

type SettingsTab = "account" | "privacy" | "notifications" | "security";

function AccountSection() {
  const { user } = useAuth();
  return (
    <SectionCard title="Account">
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <Avatar name={user?.full_name || "User"} size="lg" />
          <div>
            <p className="text-sm font-semibold text-slate-900">{user?.full_name}</p>
            <p className="text-xs text-slate-500">{user?.role}</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Full name</label>
            <p className="text-sm text-slate-900">{user?.full_name}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1">Email address</label>
            <p className="text-sm text-slate-900 flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-slate-400" />{user?.email}</p>
          </div>
        </div>
        <p className="text-xs text-slate-400">
          Name and email are managed at the account level and aren&rsquo;t editable from this page yet. To make changes, contact support.
        </p>
      </div>
    </SectionCard>
  );
}

function PrivacySection() {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isEngineer = user?.role === "ENGINEER";
  const isCompany = user?.role === "COMPANY";

  const engineerProfile = useEngineerProfile<{ is_public?: boolean; is_open_to_work?: boolean }>(isEngineer);
  const companyProfile = useCompanyProfile();

  const isPublic = isEngineer ? engineerProfile.data?.is_public ?? true : true;

  const updateVisibility = useMutation({
    mutationFn: (nextValue: boolean) => api.put("/engineers/me", { is_public: nextValue }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["engineer-profile"] });
      toast.show("Privacy setting updated", "success");
    },
    onError: () => toast.show("Unable to update privacy setting", "error"),
  });

  return (
    <SectionCard title="Privacy">
      <div className="space-y-5">
        {isEngineer ? (
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-900">Public profile</p>
              <p className="text-xs text-slate-500 mt-0.5">When on, companies and other members can find and view your engineer profile.</p>
            </div>
            <Button
              size="sm"
              variant={isPublic ? "secondary" : "primary"}
              loading={updateVisibility.isPending}
              onClick={() => updateVisibility.mutate(!isPublic)}
            >
              {isPublic ? "Make private" : "Make public"}
            </Button>
          </div>
        ) : isCompany ? (
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-900">Company visibility</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {companyProfile.data ? "Your company profile is visible in the public directory." : "Create a company profile to control visibility."}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Privacy controls for admin accounts aren&rsquo;t applicable.</p>
        )}
        <p className="text-xs text-slate-400">
          Fine-grained controls (who can message you, activity visibility) aren&rsquo;t available yet — this is the one privacy signal the platform currently supports.
        </p>
      </div>
    </SectionCard>
  );
}

function NotificationsSection() {
  const router = useRouter();
  return (
    <SectionCard title="Notifications" action={<Button size="sm" variant="secondary" onClick={() => router.push("/notifications")}>View notifications</Button>}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          You&rsquo;ll receive in-app notifications for connections, applications, job matches, messages, and platform activity.
        </p>
        <p className="text-xs text-slate-400">
          Per-channel controls (email vs. push, muting individual categories) aren&rsquo;t available yet — all notification types are currently on by default.
        </p>
      </div>
    </SectionCard>
  );
}

function SecuritySection() {
  const { logout } = useAuth();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await api.post("/auth/logout");
    } finally {
      logout();
      router.push("/");
    }
  };

  return (
    <SectionCard title="Security">
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-900">Sign out</p>
            <p className="text-xs text-slate-500 mt-0.5">End your session on this device.</p>
          </div>
          <Button size="sm" variant="danger" loading={loggingOut} icon={<LogOut className="h-3.5 w-3.5" />} onClick={handleLogout}>
            Sign out
          </Button>
        </div>
        <p className="text-xs text-slate-400">
          Password changes and active-session management aren&rsquo;t available yet.
        </p>
      </div>
    </SectionCard>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>("account");

  const tabs: Array<{ key: SettingsTab; label: string; icon: React.ElementType }> = [
    { key: "account", label: "Account", icon: User },
    { key: "privacy", label: "Privacy", icon: Eye },
    { key: "notifications", label: "Notifications", icon: Bell },
    { key: "security", label: "Security", icon: Lock },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2"><Shield className="h-5 w-5 text-[#0A66C2]" />Settings</h1>
        <p className="text-xs text-slate-500 mt-1">Manage your account, privacy, and notification preferences.</p>
      </div>

      <Tabs items={tabs.map((t) => ({ key: t.key, label: t.label }))} active={tab} onChange={(k) => setTab(k as SettingsTab)} />

      {tab === "account" && <AccountSection />}
      {tab === "privacy" && <PrivacySection />}
      {tab === "notifications" && <NotificationsSection />}
      {tab === "security" && <SecuritySection />}
    </div>
  );
}
