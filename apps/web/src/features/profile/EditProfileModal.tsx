"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api, { extractErrorMessage } from "@/lib/api";
import { Btn, Field, Modal, inputCls, textareaCls } from "@/components/rap/kit";
import type { MyEngineerProfile } from "@/types";

const AVAILABILITY = ["Available now", "In 2 weeks", "In 1 month", "Not available"];
const REMOTE = ["100% Remote", "Remote-first", "Hybrid", "Flexible"];

export function EditProfileModal({ open, onClose, profile }: { open: boolean; onClose: () => void; profile: MyEngineerProfile }) {
  return open ? <EditForm onClose={onClose} profile={profile} /> : null;
}

function EditForm({ onClose, profile }: { onClose: () => void; profile: MyEngineerProfile }) {
  const client = useQueryClient();
  const [f, setF] = useState({
    headline: profile.headline ?? "",
    primary_role: profile.primary_role ?? "",
    bio: profile.bio ?? "",
    location: profile.location ?? "",
    timezone: profile.timezone ?? "",
    availability: profile.availability ?? "Available now",
    remote_preference: profile.remote_preference ?? "100% Remote",
    skills: (profile.skills ?? []).join(", "),
    years_of_experience: String(profile.years_of_experience ?? 0),
    hourly_rate: profile.hourly_rate != null ? String(profile.hourly_rate) : "",
    github_url: profile.github_url ?? "",
    linkedin_url: profile.linkedin_url ?? "",
    portfolio_url: profile.portfolio_url ?? "",
  });
  const set = (k: keyof typeof f, v: string) => setF((c) => ({ ...c, [k]: v }));
  const opt = (v: string) => v.trim() || null;

  const save = useMutation({
    mutationFn: async () => (await api.put("/engineers/me", {
      headline: opt(f.headline), primary_role: opt(f.primary_role), bio: opt(f.bio), location: opt(f.location), timezone: opt(f.timezone),
      availability: f.availability, remote_preference: f.remote_preference, is_open_to_work: f.availability !== "Not available",
      skills: f.skills.split(",").map((s) => s.trim()).filter(Boolean),
      years_of_experience: Math.min(50, Math.max(0, Number(f.years_of_experience) || 0)),
      hourly_rate: f.hourly_rate ? Number(f.hourly_rate) : null,
      github_url: opt(f.github_url), linkedin_url: opt(f.linkedin_url), portfolio_url: opt(f.portfolio_url),
    })).data,
    onSuccess: () => { void client.invalidateQueries({ queryKey: ["engineer-profile"] }); onClose(); },
  });

  return (
    <Modal open onClose={onClose} title="Edit intro" w="max-w-2xl">
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
        <Field label="Headline"><input className={inputCls} value={f.headline} onChange={(e) => set("headline", e.target.value)} placeholder="Senior data engineer building reliable platforms" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Primary role"><input className={inputCls} value={f.primary_role} onChange={(e) => set("primary_role", e.target.value)} /></Field>
          <Field label="Years of experience"><input type="number" min={0} max={50} className={inputCls} value={f.years_of_experience} onChange={(e) => set("years_of_experience", e.target.value)} /></Field>
          <Field label="Location"><input className={inputCls} value={f.location} onChange={(e) => set("location", e.target.value)} /></Field>
          <Field label="Timezone"><input className={inputCls} value={f.timezone} onChange={(e) => set("timezone", e.target.value)} placeholder="Europe/Berlin" /></Field>
          <Field label="Availability"><select className={inputCls} value={f.availability} onChange={(e) => set("availability", e.target.value)}>{AVAILABILITY.map((v) => <option key={v}>{v}</option>)}</select></Field>
          <Field label="Remote preference"><select className={inputCls} value={f.remote_preference} onChange={(e) => set("remote_preference", e.target.value)}>{REMOTE.map((v) => <option key={v}>{v}</option>)}</select></Field>
        </div>
        <Field label="About"><textarea rows={4} className={textareaCls} value={f.bio} onChange={(e) => set("bio", e.target.value)} /></Field>
        <Field label="Skills" hint="Separate with commas"><input className={inputCls} value={f.skills} onChange={(e) => set("skills", e.target.value)} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Hourly rate (USD)"><input type="number" min={0} className={inputCls} value={f.hourly_rate} onChange={(e) => set("hourly_rate", e.target.value)} /></Field>
          <Field label="GitHub"><input className={inputCls} value={f.github_url} onChange={(e) => set("github_url", e.target.value)} placeholder="https://github.com/you" /></Field>
          <Field label="LinkedIn"><input className={inputCls} value={f.linkedin_url} onChange={(e) => set("linkedin_url", e.target.value)} placeholder="https://linkedin.com/in/you" /></Field>
          <Field label="Portfolio"><input className={inputCls} value={f.portfolio_url} onChange={(e) => set("portfolio_url", e.target.value)} placeholder="https://you.dev" /></Field>
        </div>
        {save.isError && <p role="alert" className="text-sm text-red-600">{extractErrorMessage(save.error, "We couldn't save your changes.")}</p>}
        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
          <Btn v="gray" onClick={onClose}>Cancel</Btn>
          <Btn type="submit" loading={save.isPending}>Save</Btn>
        </div>
      </form>
    </Modal>
  );
}
