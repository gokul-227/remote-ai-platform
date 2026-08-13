"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Drawer } from "@/components/ui/Drawer";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

interface EditableProfile {
  headline?: string;
  primary_role?: string;
  bio?: string;
  location?: string;
  timezone?: string;
  availability?: string;
  remote_preference?: string;
  skills?: string[];
  github_url?: string;
  linkedin_url?: string;
  portfolio_url?: string;
  hourly_rate?: number | null;
  is_open_to_work?: boolean;
}

export function EditProfileDrawer({ open, onClose, profile }: { open: boolean; onClose: () => void; profile: EditableProfile }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    headline: profile.headline || "",
    primary_role: profile.primary_role || "",
    bio: profile.bio || "",
    location: profile.location || "",
    timezone: profile.timezone || "",
    availability: profile.availability || "AVAILABLE",
    remote_preference: profile.remote_preference || "REMOTE_ONLY",
    skills: (profile.skills || []).join(", "),
    github_url: profile.github_url || "",
    linkedin_url: profile.linkedin_url || "",
    portfolio_url: profile.portfolio_url || "",
    hourly_rate: profile.hourly_rate?.toString() || "",
    is_open_to_work: profile.is_open_to_work ?? true,
  });

  const update = (key: keyof typeof form, value: string | boolean) => setForm((c) => ({ ...c, [key]: value }));

  const save = useMutation({
    mutationFn: () =>
      api.put("/engineers/me", {
        headline: form.headline || undefined,
        primary_role: form.primary_role || undefined,
        bio: form.bio || undefined,
        location: form.location || undefined,
        timezone: form.timezone || undefined,
        availability: form.availability || undefined,
        remote_preference: form.remote_preference || undefined,
        skills: form.skills.split(",").map((s) => s.trim()).filter(Boolean),
        github_url: form.github_url || undefined,
        linkedin_url: form.linkedin_url || undefined,
        portfolio_url: form.portfolio_url || undefined,
        hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : undefined,
        is_open_to_work: form.is_open_to_work,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["engineer-profile"] });
      onClose();
    },
  });

  return (
    <Drawer open={open} onClose={onClose} title="Edit profile">
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
        <Input label="Headline" value={form.headline} onChange={(e) => update("headline", e.target.value)} placeholder="Senior Full-Stack Engineer" />
        <Input label="Primary role" value={form.primary_role} onChange={(e) => update("primary_role", e.target.value)} placeholder="Backend Engineer" />
        <Textarea label="Bio" value={form.bio} onChange={(e) => update("bio", e.target.value)} rows={4} placeholder="A short summary of your background." />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Location" value={form.location} onChange={(e) => update("location", e.target.value)} placeholder="Lisbon, Portugal" />
          <Input label="Timezone" value={form.timezone} onChange={(e) => update("timezone", e.target.value)} placeholder="UTC+0" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select label="Availability" value={form.availability} onChange={(e) => update("availability", e.target.value)}>
            <option value="AVAILABLE">Available now</option>
            <option value="OPEN">Open to offers</option>
            <option value="UNAVAILABLE">Not available</option>
          </Select>
          <Select label="Remote preference" value={form.remote_preference} onChange={(e) => update("remote_preference", e.target.value)}>
            <option value="REMOTE_ONLY">Remote only</option>
            <option value="HYBRID">Hybrid</option>
            <option value="ONSITE_OK">Open to on-site</option>
          </Select>
        </div>
        <Input label="Skills" hint="Comma-separated" value={form.skills} onChange={(e) => update("skills", e.target.value)} placeholder="React, Python, PostgreSQL" />
        <Input label="Hourly rate (USD)" type="number" min={0} value={form.hourly_rate} onChange={(e) => update("hourly_rate", e.target.value)} placeholder="85" />
        <Input label="GitHub URL" value={form.github_url} onChange={(e) => update("github_url", e.target.value)} placeholder="https://github.com/you" />
        <Input label="LinkedIn URL" value={form.linkedin_url} onChange={(e) => update("linkedin_url", e.target.value)} placeholder="https://linkedin.com/in/you" />
        <Input label="Portfolio URL" value={form.portfolio_url} onChange={(e) => update("portfolio_url", e.target.value)} placeholder="https://you.dev" />
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={form.is_open_to_work} onChange={(e) => update("is_open_to_work", e.target.checked)} className="rounded border-slate-300" />
          Open to work
        </label>

        {save.isError && <p className="text-xs text-red-600">Unable to save changes. Please try again.</p>}

        <div className="flex items-center gap-2 pt-2 sticky bottom-0 bg-[var(--surface-elevated)] pb-1">
          <Button type="button" variant="secondary" onClick={onClose} fullWidth>Cancel</Button>
          <Button type="submit" fullWidth loading={save.isPending}>Save changes</Button>
        </div>
      </form>
    </Drawer>
  );
}
