"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api, { extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApplications } from "@/hooks/useApplications";
import { useToast } from "@/components/ui/Toast";
import { Av, Bar, Btn, Field, Ic, Modal, textareaCls } from "@/components/rap/kit";
import type { JobPost, MyEngineerProfile } from "@/types";

const STEPS = ["Contact info", "Resume", "Cover note", "Review"] as const;

/** Figma Easy Apply flow, submitting to POST /applications/jobs/{id}. */
export function ApplyModal({ job, open, onClose }: { job: JobPost; open: boolean; onClose: () => void }) {
  return open ? <ApplyFlow job={job} onClose={onClose} /> : null;
}

function ApplyFlow({ job, onClose }: { job: JobPost; onClose: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const { apply } = useApplications();
  const profile = useQuery<MyEngineerProfile>({ queryKey: ["engineer-profile"], queryFn: async () => (await api.get("/engineers/me")).data, retry: false });
  const [step, setStep] = useState(0);
  const [note, setNote] = useState("");
  const company = job.company_name || "this company";

  const submit = () => apply.mutate({ jobId: job.id, cover_note: note.trim() || undefined }, {
    onSuccess: () => { toast.show(`Application sent to ${company}`, "success"); onClose(); },
  });

  return (
    <Modal open onClose={onClose} title={`Apply to ${company}`}>
      <div className="mb-4"><Bar v={((step + 1) / STEPS.length) * 100} /><p className="mt-1 text-xs font-semibold text-slate-500">Step {step + 1} of {STEPS.length} - {STEPS[step]}</p></div>
      {step === 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3"><Av name={user?.full_name || "You"} src={user?.avatar_url} s={56} /><div><p className="font-bold">{user?.full_name}</p><p className="text-sm text-slate-500">{profile.data?.headline || "Engineer"}</p></div></div>
          <Field label="Email"><p className="rounded-lg bg-slate-100 px-3 py-2 text-sm">{user?.email}</p></Field>
          <p className="text-xs text-slate-500">The company sees your profile and contact email. <Link href="/settings" className="font-semibold text-[#0757d8]">Manage in settings</Link></p>
        </div>
      )}
      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Be sure to include an updated resume.</p>
          {profile.data?.resume_url ? (
            <div className="flex items-center gap-3 rounded-lg border-2 border-[#0866ff] p-3">
              <Ic n="file" c="text-[#0866ff]" s={28} />
              <div className="flex-1"><p className="font-bold">Your resume</p><p className="text-xs text-slate-500">{profile.data.skills.length} skills on your profile</p></div>
              <Ic n="check" c="text-emerald-600" />
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">No resume on your profile yet — your application will use your profile details.</div>
          )}
          <Btn v="outline" full icon="plus" href="/engineer/profile">{profile.data?.resume_url ? "Upload a different resume" : "Upload a resume"}</Btn>
        </div>
      )}
      {step === 2 && (
        <Field label="Cover note (optional)" hint="Why you are a strong fit — 2,000 characters max">
          <textarea rows={6} maxLength={2000} className={textareaCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder={`What makes you a great fit for ${job.title}?`} />
        </Field>
      )}
      {step === 3 && (
        <div className="space-y-2 text-sm">
          <p className="font-bold">Review your application</p>
          {([["Role", job.title], ["Contact", user?.email ?? ""], ["Resume", profile.data?.resume_url ? "Attached from profile" : "Profile details only"], ["Cover note", note.trim() ? `${note.trim().slice(0, 60)}${note.trim().length > 60 ? "…" : ""}` : "None"]] as const).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b border-slate-100 py-2"><span className="text-slate-500">{k}</span><span className="text-right font-semibold">{v}</span></div>
          ))}
          {apply.isError && <p role="alert" className="pt-2 text-red-600">{extractErrorMessage(apply.error, "We couldn't submit your application.")}</p>}
        </div>
      )}
      <div className="mt-6 flex justify-between">
        {step > 0 ? <Btn v="outline" onClick={() => setStep(step - 1)}>Back</Btn> : <span />}
        {step < 3 ? <Btn onClick={() => setStep(step + 1)}>Next</Btn> : <Btn loading={apply.isPending} onClick={submit}>Submit application</Btn>}
      </div>
    </Modal>
  );
}
