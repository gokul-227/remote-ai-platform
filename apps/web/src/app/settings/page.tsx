"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  User, Lock, Bell, Eye, LogOut, Mail, Settings, Briefcase,
  Building2, CreditCard, Smartphone, Globe,
  CheckCircle2, AlertCircle, Key, Fingerprint, Sliders,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import { useEngineerProfile } from "@/hooks/useEngineerProfile";

import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { RequireAuth } from "@/components/RequireAuth";
import { cn } from "@/lib/cn";

type SettingsSection = "account" | "profile" | "security" | "privacy" | "notifications" | "preferences" | "workspace" | "billing";

const NAV_ITEMS: Array<{
  key: SettingsSection;
  label: string;
  icon: React.ElementType;
  description: string;
  group: string;
}> = [
  { key: "account", label: "Account", icon: User, description: "Name, email, contact info", group: "Personal" },
  { key: "profile", label: "Profile & Visibility", icon: Globe, description: "Public profile and work preferences", group: "Personal" },
  { key: "security", label: "Security", icon: Lock, description: "Password, sessions, 2FA", group: "Personal" },
  { key: "privacy", label: "Privacy", icon: Eye, description: "Data usage and contact controls", group: "Personal" },
  { key: "notifications", label: "Notifications", icon: Bell, description: "Email and in-app alerts", group: "Preferences" },
  { key: "preferences", label: "Preferences", icon: Sliders, description: "Language, timezone, display", group: "Preferences" },
  { key: "workspace", label: "Workspace", icon: Building2, description: "Role, team, workspace settings", group: "Preferences" },
  { key: "billing", label: "Billing", icon: CreditCard, description: "Plan, invoices, payment methods", group: "Billing" },
];

function ToggleSwitch({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className={cn(
        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-brand)]/30",
        enabled ? "bg-[var(--color-brand)]" : "bg-[var(--border-strong)]"
      )}
    >
      <span
        className={cn(
          "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform",
          enabled ? "translate-x-4.5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

function SettingRow({
  icon: Icon,
  label,
  description,
  action,
  status,
}: {
  icon?: React.ElementType;
  label: string;
  description?: string;
  action?: React.ReactNode;
  status?: "ok" | "warn" | "error";
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b border-[var(--border-color)] last:border-0">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="h-8 w-8 rounded-lg bg-[var(--bg-subtle)] flex items-center justify-center shrink-0 mt-0.5">
            <Icon className="h-4 w-4 text-[var(--text-muted)]" />
          </div>
        )}
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-[var(--text-main)]">{label}</p>
            {status === "ok" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
            {status === "warn" && <AlertCircle className="h-3.5 w-3.5 text-amber-500" />}
            {status === "error" && <AlertCircle className="h-3.5 w-3.5 text-[var(--color-error)]" />}
          </div>
          {description && <p className="text-xs text-[var(--text-muted)] mt-0.5">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function AccountPanel() {
  const { user } = useAuth();
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-[var(--text-main)]">Account</h2>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Manage your personal account information.</p>
      </div>
      {/* Profile header */}
      <div className="flex items-center gap-4 p-4 bg-[var(--bg-subtle)] rounded-xl border border-[var(--border-color)]">
        <Avatar name={user?.full_name || "You"} size="xl" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text-main)]">{user?.full_name}</p>
          <p className="text-xs text-[var(--text-muted)] flex items-center gap-1.5 mt-0.5">
            <Mail className="h-3 w-3" /> {user?.email}
          </p>
          <p className="text-xs text-[var(--text-muted)] capitalize mt-0.5">{user?.role?.toLowerCase()} · Remote AI Platform</p>
        </div>
        <Button variant="secondary" size="sm">Edit photo</Button>
      </div>
      <div className="divide-y divide-[var(--border-color)]">
        <SettingRow
          icon={User}
          label="Full name"
          description={user?.full_name}
          action={<Button variant="secondary" size="sm">Edit</Button>}
        />
        <SettingRow
          icon={Mail}
          label="Email address"
          description={user?.email}
          status="ok"
          action={<Button variant="secondary" size="sm">Change</Button>}
        />
        <SettingRow
          icon={Smartphone}
          label="Phone number"
          description="Not set"
          action={<Button variant="secondary" size="sm">Add</Button>}
        />
      </div>
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800 flex items-start gap-3">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
        <p>Name and email changes are processed within 24 hours. Contact support if you need immediate assistance.</p>
      </div>
    </div>
  );
}

function PrivacyPanel() {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isEngineer = user?.role === "ENGINEER";
  const isCompany = user?.role === "COMPANY";
  const engineerProfile = useEngineerProfile<{ is_public?: boolean; is_open_to_work?: boolean }>(isEngineer);

  const isPublic = isEngineer ? (engineerProfile.data?.is_public ?? true) : true;
  const isOpenToWork = isEngineer ? (engineerProfile.data?.is_open_to_work ?? false) : false;

  const updateVisibility = useMutation({
    mutationFn: (nextValue: boolean) => api.put("/engineers/me", { is_public: nextValue }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["engineer-profile"] });
      toast.show("Visibility updated", "success");
    },
    onError: () => toast.show("Failed to update visibility", "error"),
  });

  const updateOpenToWork = useMutation({
    mutationFn: (nextValue: boolean) => api.put("/engineers/me", { is_open_to_work: nextValue }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["engineer-profile"] });
      toast.show("Open-to-work status updated", "success");
    },
    onError: () => toast.show("Failed to update status", "error"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-[var(--text-main)]">Privacy</h2>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Control who can see your profile and how data is used.</p>
      </div>
      {isEngineer && (
        <div className="divide-y divide-[var(--border-color)]">
          <SettingRow
            icon={Globe}
            label="Public profile"
            description="When enabled, organizations and other members can find and view your professional profile."
            status={isPublic ? "ok" : undefined}
            action={<ToggleSwitch enabled={isPublic} onChange={(v) => updateVisibility.mutate(v)} />}
          />
          <SettingRow
            icon={Building2}
            label="Open to work"
            description="Let organizations know you're actively looking for new opportunities."
            status={isOpenToWork ? "ok" : undefined}
            action={<ToggleSwitch enabled={isOpenToWork} onChange={(v) => updateOpenToWork.mutate(v)} />}
          />
        </div>
      )}
      {isCompany && (
        <SettingRow
          icon={Globe}
          label="Organization visibility"
          description="Your organization profile is visible in the public directory."
          status="ok"
        />
      )}
      <div className="divide-y divide-[var(--border-color)]">
        <SettingRow icon={User} label="Who can message you" description="Anyone on Remote AI Platform" action={<span className="text-xs text-[var(--text-muted)] italic">Coming soon</span>} />
        <SettingRow icon={Eye} label="Activity visibility" description="Who can see your profile views and activity" action={<span className="text-xs text-[var(--text-muted)] italic">Coming soon</span>} />
      </div>
    </div>
  );
}

function NotificationsPanel() {
  const router = useRouter();
  const [emailDigest, setEmailDigest] = useState(true);
  const [jobAlerts, setJobAlerts] = useState(true);
  const [connectionAlerts, setConnectionAlerts] = useState(true);
  const [messageAlerts, setMessageAlerts] = useState(true);
  const [projectAlerts, setProjectAlerts] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-[var(--text-main)]">Notifications</h2>
          <p className="text-sm text-[var(--text-muted)] mt-0.5">Manage your alert preferences.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => router.push("/notifications")}>
          View all
        </Button>
      </div>
      <div className="divide-y divide-[var(--border-color)]">
        <SettingRow icon={Mail} label="Weekly email digest" description="A summary of your network activity delivered every Monday." action={<ToggleSwitch enabled={emailDigest} onChange={setEmailDigest} />} />
        <SettingRow icon={Briefcase} label="Job match alerts" description="Notified when new jobs match your skills and preferences." action={<ToggleSwitch enabled={jobAlerts} onChange={setJobAlerts} />} />
        <SettingRow icon={User} label="Connection requests" description="When someone sends you a connection request." action={<ToggleSwitch enabled={connectionAlerts} onChange={setConnectionAlerts} />} />
        <SettingRow icon={Bell} label="Message notifications" description="When you receive a new message." action={<ToggleSwitch enabled={messageAlerts} onChange={setMessageAlerts} />} />
        <SettingRow icon={Settings} label="Project & milestone alerts" description="When a project milestone is due or completed." action={<ToggleSwitch enabled={projectAlerts} onChange={setProjectAlerts} />} />
      </div>
      <p className="text-xs text-[var(--text-light)]">Per-channel controls (SMS, push notifications) coming soon.</p>
    </div>
  );
}



function SecurityPanel() {
  const { logout } = useAuth();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try { await api.post("/auth/logout"); } finally {
      logout(); router.push("/");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-[var(--text-main)]">Security</h2>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">Manage your password, sessions, and account security.</p>
      </div>
      <div className="divide-y divide-[var(--border-color)]">
        <SettingRow icon={Key} label="Password" description="Last changed: not available" status="warn" action={<Button variant="secondary" size="sm">Change password</Button>} />
        <SettingRow icon={Fingerprint} label="Two-factor authentication" description="Add extra security to your account" action={<span className="text-xs text-[var(--text-muted)] italic">Coming soon</span>} />
        <SettingRow icon={Smartphone} label="Active sessions" description="Manage devices with access to your account" action={<span className="text-xs text-[var(--text-muted)] italic">Coming soon</span>} />
        <SettingRow
          icon={LogOut}
          label="Sign out"
          description="End your current session on this device."
          action={
            <Button variant="danger" size="sm" loading={loggingOut} icon={<LogOut className="h-3.5 w-3.5" />} onClick={handleLogout}>
              Sign out
            </Button>
          }
        />
      </div>
    </div>
  );
}

function ComingSoonPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-[var(--text-main)]">{title}</h2>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">{description}</p>
      </div>
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="h-12 w-12 rounded-xl bg-[var(--bg-subtle)] flex items-center justify-center mb-4">
          <Settings className="h-6 w-6 text-[var(--text-light)]" />
        </div>
        <p className="text-sm font-medium text-[var(--text-main)]">Coming soon</p>
        <p className="text-xs text-[var(--text-muted)] mt-1 max-w-xs">
          This section is being built. Check back for updates.
        </p>
      </div>
    </div>
  );
}

function SettingsContent() {
  const [activeSection, setActiveSection] = useState<SettingsSection>("account");
  const { user } = useAuth();

  const groups = Array.from(new Set(NAV_ITEMS.map((i) => i.group)));

  const renderPanel = () => {
    switch (activeSection) {
      case "account": return <AccountPanel />;
      case "privacy": return <PrivacyPanel />;
      case "notifications": return <NotificationsPanel />;
      case "security": return <SecurityPanel />;
      case "profile": return <ComingSoonPanel title="Profile & Visibility" description="Manage your public profile, headline, and work preferences." />;
      case "preferences": return <ComingSoonPanel title="Preferences" description="Language, timezone, display, and accessibility settings." />;
      case "workspace": return <ComingSoonPanel title="Workspace" description="Team settings, workspace configuration, and role management." />;
      case "billing": return <ComingSoonPanel title="Billing" description="Manage your plan, payment methods, and invoices." />;
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--text-main)]">Settings</h1>
        <p className="text-sm text-[var(--text-muted)] mt-0.5">
          Manage your account, preferences, and workspace.
        </p>
      </div>
      <div className="flex gap-6 items-start">
        {/* Sidebar */}
        <div className="w-60 shrink-0 space-y-6">
          {/* User card */}
          <div className="flex items-center gap-3 px-3 py-2">
            <Avatar name={user?.full_name || "You"} size="md" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[var(--text-main)] truncate">{user?.full_name}</p>
              <p className="text-xs text-[var(--text-muted)] capitalize">{user?.role?.toLowerCase()}</p>
            </div>
          </div>

          {/* Nav groups */}
          {groups.map((group) => (
            <div key={group}>
              <p className="text-[10px] uppercase tracking-widest font-semibold text-[var(--text-light)] px-3 mb-1">{group}</p>
              <nav className="space-y-0.5">
                {NAV_ITEMS.filter((i) => i.group === group).map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      onClick={() => setActiveSection(item.key)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                        activeSection === item.key
                          ? "bg-[var(--color-brand-light)] text-[var(--color-brand)] font-semibold"
                          : "text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-main)]"
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {item.label}
                    </button>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 bg-[var(--bg-surface)] border border-[var(--border-color)] rounded-xl p-6 shadow-[var(--shadow-xs)]">
          {renderPanel()}
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <RequireAuth>
      <SettingsContent />
    </RequireAuth>
  );
}
