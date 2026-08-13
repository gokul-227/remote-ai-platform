"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Drawer } from "@/components/ui/Drawer";
import { Input, Textarea, Select } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

interface EditableCompany {
  name?: string;
  website?: string;
  description?: string;
  industry?: string;
  company_size?: string;
  location?: string;
  country?: string;
  hiring_status?: string;
  tech_stack?: string[];
}

export function EditCompanyProfileDrawer({ open, onClose, profile }: { open: boolean; onClose: () => void; profile: EditableCompany }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: profile.name || "",
    website: profile.website || "",
    description: profile.description || "",
    industry: profile.industry || "",
    company_size: profile.company_size || "",
    location: profile.location || "",
    country: profile.country || "",
    hiring_status: profile.hiring_status || "ACTIVELY_HIRING",
    tech_stack: (profile.tech_stack || []).join(", "),
  });
  const update = (key: keyof typeof form, value: string) => setForm((c) => ({ ...c, [key]: value }));

  const save = useMutation({
    mutationFn: () =>
      api.put("/companies/me", {
        name: form.name || undefined,
        website: form.website || undefined,
        description: form.description || undefined,
        industry: form.industry || undefined,
        company_size: form.company_size || undefined,
        location: form.location || undefined,
        country: form.country || undefined,
        hiring_status: form.hiring_status || undefined,
        tech_stack: form.tech_stack.split(",").map((s) => s.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-profile"] });
      onClose();
    },
  });

  return (
    <Drawer open={open} onClose={onClose} title="Edit company profile">
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
        <Input label="Company name" value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Acme Corp" />
        <Textarea label="Description" value={form.description} onChange={(e) => update("description", e.target.value)} rows={4} placeholder="What does your company do?" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Industry" value={form.industry} onChange={(e) => update("industry", e.target.value)} placeholder="Software" />
          <Input label="Company size" value={form.company_size} onChange={(e) => update("company_size", e.target.value)} placeholder="11-50" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Location" value={form.location} onChange={(e) => update("location", e.target.value)} placeholder="Remote-first" />
          <Input label="Country" value={form.country} onChange={(e) => update("country", e.target.value)} placeholder="United States" />
        </div>
        <Select label="Hiring status" value={form.hiring_status} onChange={(e) => update("hiring_status", e.target.value)}>
          <option value="ACTIVELY_HIRING">Actively hiring</option>
          <option value="SELECTIVELY_HIRING">Selectively hiring</option>
          <option value="NOT_HIRING">Not currently hiring</option>
        </Select>
        <Input label="Website" value={form.website} onChange={(e) => update("website", e.target.value)} placeholder="https://acme.com" />
        <Input label="Tech stack" hint="Comma-separated" value={form.tech_stack} onChange={(e) => update("tech_stack", e.target.value)} placeholder="React, Python, AWS" />

        {save.isError && <p className="text-xs text-red-600">Unable to save changes. Please try again.</p>}

        <div className="flex items-center gap-2 pt-2 sticky bottom-0 bg-[var(--surface-elevated)] pb-1">
          <Button type="button" variant="secondary" onClick={onClose} fullWidth>Cancel</Button>
          <Button type="submit" fullWidth loading={save.isPending}>Save changes</Button>
        </div>
      </form>
    </Drawer>
  );
}
