"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Upload,
  Building2,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  FileText,
  Loader2,
  Wand2,
  Check,
  AlertCircle,
} from "lucide-react";
import api, { extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/cn";

export default function OnboardingPage() {
  return (
    <RequireAuth>
      <OnboardingContent />
    </RequireAuth>
  );
}

function OnboardingContent() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isCompany = user?.role === "COMPANY";

  // Shared state
  const [step, setStep] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);

  // Engineer state
  const [method, setMethod] = useState<"ai" | "manual" | null>(null);
  const [uploading, setUploading] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [resumeUploaded, setResumeUploaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [engForm, setEngForm] = useState({
    headline: "",
    primary_role: "",
    location: "",
    bio: "",
    years_of_experience: "3",
    skills: "",
    hourly_rate: "",
    remote_preference: "100% Remote",
    availability: "Immediate",
  });

  // Company state
  const [compForm, setCompForm] = useState({
    name: "",
    industry: "",
    company_size: "11-50",
    location: "",
    description: "",
    website: "",
  });

  const updateEng = (key: keyof typeof engForm, val: string) => setEngForm((c) => ({ ...c, [key]: val }));
  const updateComp = (key: keyof typeof compForm, val: string) => setCompForm((c) => ({ ...c, [key]: val }));

  // Mutations
  const createEngineerProfile = useMutation({
    mutationFn: async () => {
      const payload = {
        headline: engForm.headline || undefined,
        primary_role: engForm.primary_role || undefined,
        location: engForm.location || undefined,
        bio: engForm.bio || undefined,
        years_of_experience: Number(engForm.years_of_experience) || 0,
        hourly_rate: engForm.hourly_rate ? Number(engForm.hourly_rate) : undefined,
        remote_preference: engForm.remote_preference,
        availability: engForm.availability,
        skills: engForm.skills.split(",").map((s) => s.trim()).filter(Boolean),
      };
      return (await api.post("/engineers/me", payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["engineer-profile"] });
      queryClient.invalidateQueries({ queryKey: ["engineer-profile-exists"] });
      router.push("/engineer/dashboard");
    },
    onError: (err: unknown) => {
      const msg = extractErrorMessage(err, "Failed to create engineer profile. Please check your entries.");
      setError(msg);
    },
  });

  const createCompanyProfile = useMutation({
    mutationFn: async () => {
      const payload = {
        name: compForm.name,
        industry: compForm.industry || undefined,
        company_size: compForm.company_size || undefined,
        location: compForm.location || undefined,
        description: compForm.description || undefined,
        website: compForm.website || undefined,
      };
      return (await api.post("/companies/me", payload)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["company-profile"] });
      queryClient.invalidateQueries({ queryKey: ["company-profile-exists"] });
      router.push("/company/dashboard");
    },
    onError: (err: unknown) => {
      const msg = extractErrorMessage(err, "Failed to create company profile. Please check your entries.");
      setError(msg);
    },
  });

  // Handle Resume Upload
  const handleResumeUpload = async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await api.post("/engineers/me/resume", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResumeUploaded(true);

      // Trigger AI enhance right away to parse resume data
      setEnhancing(true);
      const enhancedRes = await api.post("/engineers/me/ai-enhance");
      const data = enhancedRes.data;
      if (data) {
        setEngForm((c) => ({
          ...c,
          headline: data.headline || c.headline,
          primary_role: data.primary_role || c.primary_role,
          location: data.location || c.location,
          bio: data.bio || c.bio,
          skills: data.skills?.length ? data.skills.join(", ") : c.skills,
          years_of_experience: data.years_of_experience ? String(data.years_of_experience) : c.years_of_experience,
        }));
      }
      setStep(3); // Advance to review step
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, "Failed to parse resume. You can still set up your profile manually below.");
      setError(msg);
    } finally {
      setUploading(false);
      setEnhancing(false);
    }
  };

  const totalSteps = isCompany ? 3 : 4;

  return (
    <div className="min-h-screen bg-[var(--bg-page)] py-12 px-4 flex items-center justify-center">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 text-[#B54A2C] font-extrabold text-2xl">
            {isCompany ? <Building2 className="h-7 w-7" /> : <Sparkles className="h-7 w-7" />}
            Remote AI Platform Onboarding
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isCompany ? "Set up your organization" : "Build your AI-matched profile"}
          </h1>
          <p className="text-sm text-slate-600">
            {isCompany
              ? "Complete your organization profile to start hiring top engineering talent."
              : "Tell us about your skills to get matched with remote tech organizations."}
          </p>
        </div>

        {/* Wizard Progress Bar */}
        <div className="flex items-center justify-center gap-3">
          {Array.from({ length: totalSteps }).map((_, idx) => {
            const s = idx + 1;
            return (
              <div key={s} className="flex items-center gap-3">
                <div
                  className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all border",
                    step > s
                      ? "bg-[#B54A2C] text-white border-[#B54A2C]"
                      : step === s
                        ? "border-[#B54A2C] text-[#B54A2C] bg-blue-50 dark:bg-blue-950/30"
                        : "border-slate-300 text-slate-400 bg-white"
                  )}
                >
                  {step > s ? <Check className="h-4 w-4" /> : s}
                </div>
                {s < totalSteps && (
                  <div className={cn("h-0.5 w-12 sm:w-16 transition-colors", step > s ? "bg-[#B54A2C]" : "bg-slate-200")} />
                )}
              </div>
            );
          })}
        </div>

        {/* Card Container */}
        <div className="card-enterprise p-8 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl p-4 flex items-center gap-2 animate-fade-in">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* ========================================================================= */}
          {/* ENGINEER ONBOARDING FLOW */}
          {/* ========================================================================= */}
          {!isCompany && (
            <>
              {/* Step 1: Method Choice */}
              {step === 1 && (
                <div className="space-y-6">
                  <div className="text-center space-y-1">
                    <h2 className="text-lg font-bold text-slate-900">How would you like to set up your profile?</h2>
                    <p className="text-xs text-slate-500">Choose your preferred method to get started quickly.</p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMethod("ai");
                        setStep(2);
                      }}
                      className={cn(
                        "p-6 rounded-2xl border-2 text-left space-y-3 transition-all hover:border-[#B54A2C] hover:shadow-md",
                        method === "ai" ? "border-[#B54A2C] bg-blue-50/50" : "border-slate-200 bg-white"
                      )}
                    >
                      <div className="h-10 w-10 rounded-xl bg-blue-100 text-[#B54A2C] flex items-center justify-center">
                        <Wand2 className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                          AI Resume Import <Badge tone="ai">Recommended</Badge>
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                          Upload your PDF/DOCX resume. AI will parse your skills, roles, and experience instantly.
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setMethod("manual");
                        setStep(3);
                      }}
                      className={cn(
                        "p-6 rounded-2xl border-2 text-left space-y-3 transition-all hover:border-[#B54A2C] hover:shadow-md",
                        method === "manual" ? "border-[#B54A2C] bg-blue-50/50" : "border-slate-200 bg-white"
                      )}
                    >
                      <div className="h-10 w-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-slate-900 text-sm">Manual Setup</h3>
                        <p className="text-xs text-slate-500 mt-1">
                          Enter your headline, skills, and bio step-by-step using our interactive form.
                        </p>
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Resume Upload & AI Parsing */}
              {step === 2 && (
                <div className="space-y-6 text-center">
                  <div className="space-y-1">
                    <h2 className="text-lg font-bold text-slate-900">Upload your Resume</h2>
                    <p className="text-xs text-slate-500">PDF or DOCX format (Max 10MB)</p>
                  </div>

                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".pdf,.docx"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleResumeUpload(file);
                    }}
                  />

                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 hover:border-[#B54A2C] hover:bg-slate-50 rounded-2xl p-10 cursor-pointer transition-colors space-y-3 flex flex-col items-center justify-center"
                  >
                    {uploading || enhancing ? (
                      <div className="space-y-3 flex flex-col items-center">
                        <Loader2 className="h-10 w-10 text-[#B54A2C] animate-spin" />
                        <p className="text-sm font-semibold text-slate-800">
                          {enhancing ? "AI is extracting skills & experience..." : "Uploading resume..."}
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="h-12 w-12 rounded-full bg-blue-50 text-[#B54A2C] flex items-center justify-center">
                          <Upload className="h-6 w-6" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Click to select resume document</p>
                          <p className="text-xs text-slate-500 mt-0.5">Supports PDF and DOCX files</p>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <Button variant="secondary" onClick={() => setStep(1)} icon={<ArrowLeft className="h-4 w-4" />}>
                      Back
                    </Button>
                    <button
                      type="button"
                      onClick={() => setStep(3)}
                      className="text-xs text-slate-500 hover:text-slate-800 underline font-medium"
                    >
                      Skip resume upload &rarr;
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Core Profile Fields */}
              {step === 3 && (
                <div className="space-y-4">
                  <div className="space-y-1 border-b border-slate-100 pb-3">
                    <h2 className="text-lg font-bold text-slate-900">Professional Details</h2>
                    <p className="text-xs text-slate-500">
                      {resumeUploaded ? "Review the details extracted by AI." : "Tell us about your current role and skills."}
                    </p>
                  </div>

                  <Input
                    id="onboardingHeadline"
                    label="Professional Headline"
                    placeholder="e.g. Senior Full-Stack Engineer (React, Python)"
                    value={engForm.headline}
                    onChange={(e) => updateEng("headline", e.target.value)}
                  />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      id="onboardingRole"
                      label="Primary Role"
                      placeholder="e.g. Full-Stack Engineer"
                      value={engForm.primary_role}
                      onChange={(e) => updateEng("primary_role", e.target.value)}
                    />
                    <Input
                      id="onboardingLocation"
                      label="Location"
                      placeholder="e.g. San Francisco, CA (Remote)"
                      value={engForm.location}
                      onChange={(e) => updateEng("location", e.target.value)}
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      id="onboardingExp"
                      type="number"
                      label="Years of Experience"
                      value={engForm.years_of_experience}
                      onChange={(e) => updateEng("years_of_experience", e.target.value)}
                    />
                    <Input
                      id="onboardingSkills"
                      label="Key Skills (comma separated)"
                      placeholder="React, Python, TypeScript, PostgreSQL"
                      value={engForm.skills}
                      onChange={(e) => updateEng("skills", e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Bio / Professional Summary</label>
                    <textarea
                      value={engForm.bio}
                      onChange={(e) => updateEng("bio", e.target.value)}
                      rows={3}
                      className="input-enterprise w-full"
                      placeholder="Brief summary of your technical background, accomplishments, and career goals."
                    />
                  </div>

                  <div className="flex items-center justify-between pt-4">
                    <Button variant="secondary" onClick={() => setStep(method === "ai" ? 2 : 1)} icon={<ArrowLeft className="h-4 w-4" />}>
                      Back
                    </Button>
                    <Button onClick={() => setStep(4)} icon={undefined}>
                      Next: Preferences <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 4: Preferences & Completion */}
              {step === 4 && (
                <div className="space-y-5">
                  <div className="space-y-1 border-b border-slate-100 pb-3">
                    <h2 className="text-lg font-bold text-slate-900">Work Preferences & Rates</h2>
                    <p className="text-xs text-slate-500">Configure your availability and expected rate.</p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Remote Preference</label>
                      <select
                        value={engForm.remote_preference}
                        onChange={(e) => updateEng("remote_preference", e.target.value)}
                        className="input-enterprise w-full"
                      >
                        <option value="100% Remote">100% Remote</option>
                        <option value="Hybrid">Hybrid</option>
                        <option value="On-site">On-site</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Availability</label>
                      <select
                        value={engForm.availability}
                        onChange={(e) => updateEng("availability", e.target.value)}
                        className="input-enterprise w-full"
                      >
                        <option value="Immediate">Immediate</option>
                        <option value="2 Weeks">2 Weeks Notice</option>
                        <option value="1 Month">1 Month Notice</option>
                        <option value="Exploring">Exploring Opportunities</option>
                      </select>
                    </div>
                  </div>

                  <Input
                    id="onboardingRate"
                    type="number"
                    label="Desired Hourly Rate ($/hr USD)"
                    placeholder="e.g. 85"
                    value={engForm.hourly_rate}
                    onChange={(e) => updateEng("hourly_rate", e.target.value)}
                  />

                  <div className="flex items-center justify-between pt-4">
                    <Button variant="secondary" onClick={() => setStep(3)} icon={<ArrowLeft className="h-4 w-4" />}>
                      Back
                    </Button>
                    <Button
                      loading={createEngineerProfile.isPending}
                      onClick={() => createEngineerProfile.mutate()}
                      icon={<CheckCircle2 className="h-4 w-4" />}
                    >
                      Complete Setup & View Dashboard
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ========================================================================= */}
          {/* COMPANY ONBOARDING FLOW */}
          {/* ========================================================================= */}
          {isCompany && (
            <>
              {/* Step 1: Basics */}
              {step === 1 && (
                <div className="space-y-4">
                  <div className="space-y-1 border-b border-slate-100 pb-3">
                    <h2 className="text-lg font-bold text-slate-900">Organization Identity</h2>
                    <p className="text-xs text-slate-500">Provide basic information about your organization.</p>
                  </div>

                  <Input
                    id="compName"
                    label="Organization Name *"
                    placeholder="e.g. Acme AI Innovations"
                    value={compForm.name}
                    onChange={(e) => updateComp("name", e.target.value)}
                  />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      id="compIndustry"
                      label="Industry"
                      placeholder="e.g. Software / Artificial Intelligence"
                      value={compForm.industry}
                      onChange={(e) => updateComp("industry", e.target.value)}
                    />
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Organization Size</label>
                      <select
                        value={compForm.company_size}
                        onChange={(e) => updateComp("company_size", e.target.value)}
                        className="input-enterprise w-full"
                      >
                        <option value="1-10">1-10 employees</option>
                        <option value="11-50">11-50 employees</option>
                        <option value="51-200">51-200 employees</option>
                        <option value="201-500">201-500 employees</option>
                        <option value="500+">500+ employees</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button disabled={!compForm.name.trim()} onClick={() => setStep(2)} icon={undefined}>
                      Next: Organization Profile <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 2: Location & Description */}
              {step === 2 && (
                <div className="space-y-4">
                  <div className="space-y-1 border-b border-slate-100 pb-3">
                    <h2 className="text-lg font-bold text-slate-900">Organization Overview</h2>
                    <p className="text-xs text-slate-500">Help remote talent understand your organization&rsquo;s mission.</p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      id="compLocation"
                      label="Location / Headquarters"
                      placeholder="e.g. Remote-first / San Francisco, CA"
                      value={compForm.location}
                      onChange={(e) => updateComp("location", e.target.value)}
                    />
                    <Input
                      id="compWebsite"
                      label="Website URL"
                      placeholder="https://example.com"
                      value={compForm.website}
                      onChange={(e) => updateComp("website", e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Organization Description</label>
                    <textarea
                      value={compForm.description}
                      onChange={(e) => updateComp("description", e.target.value)}
                      rows={4}
                      className="input-enterprise w-full"
                      placeholder="What does your organization build, and what technologies do you specialize in?"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-4">
                    <Button variant="secondary" onClick={() => setStep(1)} icon={<ArrowLeft className="h-4 w-4" />}>
                      Back
                    </Button>
                    <Button onClick={() => setStep(3)} icon={undefined}>
                      Next: Final Review <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 3: Review & Finish */}
              {step === 3 && (
                <div className="space-y-5">
                  <div className="space-y-1 border-b border-slate-100 pb-3">
                    <h2 className="text-lg font-bold text-slate-900">Confirm Organization Setup</h2>
                    <p className="text-xs text-slate-500">Review your information before finishing setup.</p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs">
                    <p>
                      <strong className="text-slate-900">Organization:</strong> {compForm.name}
                    </p>
                    {compForm.industry && (
                      <p>
                        <strong className="text-slate-900">Industry:</strong> {compForm.industry}
                      </p>
                    )}
                    <p>
                      <strong className="text-slate-900">Size:</strong> {compForm.company_size}
                    </p>
                    {compForm.location && (
                      <p>
                        <strong className="text-slate-900">Location:</strong> {compForm.location}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-4">
                    <Button variant="secondary" onClick={() => setStep(2)} icon={<ArrowLeft className="h-4 w-4" />}>
                      Back
                    </Button>
                    <Button
                      loading={createCompanyProfile.isPending}
                      onClick={() => createCompanyProfile.mutate()}
                      icon={<CheckCircle2 className="h-4 w-4" />}
                    >
                      Finish Setup & Go to Hiring Dashboard
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
