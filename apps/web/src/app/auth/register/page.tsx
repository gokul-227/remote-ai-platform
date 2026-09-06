"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Mail, KeyRound, User, Building2, AlertCircle, ArrowRight, ArrowLeft, Check } from "lucide-react";
import { extractErrorMessage } from "@/lib/api";
import { supabase, fetchBackendUser, applyPendingRegistration } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

type Role = "ENGINEER" | "COMPANY";

const detailsSchema = z.object({
  fullName: z.string().min(1, "This field is required"),
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
});

// See apps/web/src/app/auth/login/page.tsx's codeSchema for why this isn't
// pinned to exactly 6 characters -- Supabase's own email_otp isn't reliably
// 6 digits, and a hardcoded max() here silently truncates a longer, valid
// code before it reaches verifyOtp().
const codeSchema = z.object({
  code: z.string().min(6, "Enter the code we emailed you").max(12, "That code looks too long"),
});

type DetailsForm = z.infer<typeof detailsSchema>;
type CodeForm = z.infer<typeof codeSchema>;

const ROLE_OPTIONS: Array<{ value: Role; icon: typeof User; title: string; description: string }> = [
  { value: "ENGINEER", icon: User, title: "I am a Professional", description: "Build a profile, get AI-matched to remote roles, and apply." },
  { value: "COMPANY", icon: Building2, title: "I am hiring / represent an organization", description: "Post roles and discover qualified remote professionals." },
];

export default function RegisterPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [role, setRole] = useState<Role | null>(null);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");

  const detailsForm = useForm<DetailsForm>();
  const codeForm = useForm<CodeForm>();

  const signUpWithProvider = async (provider: "google" | "azure" | "github") => {
    setError(null);
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  const goToStep2 = async (data: DetailsForm) => {
    const parsed = detailsSchema.safeParse(data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        detailsForm.setError(issue.path[0] as keyof DetailsForm, { message: issue.message });
      }
      return;
    }
    setEmail(parsed.data.email);
    setFullName(parsed.data.fullName);
    setStep(2);
  };

  const sendCode = async () => {
    if (!role) return;
    setError(null);
    setLoading(true);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true, data: { full_name: fullName } },
      });
      if (otpError) throw otpError;

      // Role/name aren't concepts Supabase Auth knows about -- this app's
      // own backend owns them (see PATCH /auth/role, /auth/me). Stash the
      // choice so the code-verification step can apply it right after the
      // first successful sign-in.
      localStorage.setItem(
        "pending_registration",
        JSON.stringify({ email, fullName, role }),
      );
      setStep(3);
    } catch (err: unknown) {
      const supabaseMessage = (err as { message?: string })?.message;
      setError(supabaseMessage || extractErrorMessage(err, "Couldn't send a code. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (data: CodeForm) => {
    const parsed = codeSchema.safeParse(data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        codeForm.setError(issue.path[0] as keyof CodeForm, { message: issue.message });
      }
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: parsed.data.code,
        type: "email",
      });
      if (verifyError || !verifyData.session) {
        throw verifyError || new Error("Verification failed");
      }
      let userData = await fetchBackendUser(verifyData.session);
      userData = await applyPendingRegistration(verifyData.session, userData);
      login(verifyData.session.access_token, userData, verifyData.session.refresh_token);
      router.push("/onboarding");
    } catch (err: unknown) {
      const supabaseMessage = (err as { message?: string })?.message;
      if (supabaseMessage?.toLowerCase().includes("expired") || supabaseMessage?.toLowerCase().includes("invalid")) {
        setError("That code is invalid or has expired. Request a new one and try again.");
      } else {
        setError(supabaseMessage || extractErrorMessage(err, "Registration failed. Please try again."));
      }
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    setError(null);
    setLoading(true);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true, data: { full_name: fullName } },
      });
      if (otpError) throw otpError;
    } catch (err: unknown) {
      setError(extractErrorMessage(err, "Couldn't resend the code. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-2 text-2xl font-black text-slate-900 tracking-tight">
            <div className="h-8 w-8 rounded-lg bg-[#0552CC] flex items-center justify-center text-white font-black text-lg">
              R
            </div>
            Remote <span className="text-[#0552CC]">AI Platform</span>
          </Link>
          <h1 className="text-xl font-bold text-slate-900">Create your account</h1>
          <p className="text-sm text-slate-600">Join the professional remote engineering network</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={cn(
                  "h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold border",
                  step > s
                    ? "bg-[#0552CC] text-white border-[#0552CC]"
                    : step === s
                      ? "border-[#0552CC] text-[#0552CC]"
                      : "border-slate-300 text-slate-400"
                )}
              >
                {step > s ? <Check className="h-3.5 w-3.5" /> : s}
              </div>
              {s < 3 && <div className={cn("h-px w-10", step > s ? "bg-[#0552CC]" : "bg-slate-300")} />}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="card-enterprise p-8 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg px-4 py-3 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {step === 1 && (
            <form onSubmit={detailsForm.handleSubmit(goToStep2)} noValidate className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Button variant="secondary" fullWidth onClick={() => signUpWithProvider("google")} type="button">
                  Google
                </Button>
                <Button variant="secondary" fullWidth onClick={() => signUpWithProvider("azure")} type="button">
                  Microsoft
                </Button>
                <Button variant="secondary" fullWidth onClick={() => signUpWithProvider("github")} type="button">
                  GitHub
                </Button>
              </div>
              <div className="relative">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
                <div className="relative flex justify-center text-xs"><span className="bg-white px-3 text-slate-500">or</span></div>
              </div>
              <div className="relative">
                <User className="absolute left-3 top-[38px] h-4 w-4 text-slate-400 pointer-events-none" />
                <Input
                  id="fullName"
                  label="Full name"
                  placeholder="Jordan Smith"
                  className="pl-10"
                  error={detailsForm.formState.errors.fullName?.message}
                  {...detailsForm.register("fullName")}
                />
              </div>

              <div className="relative">
                <Mail className="absolute left-3 top-[38px] h-4 w-4 text-slate-400 pointer-events-none" />
                <Input
                  id="regEmail"
                  type="email"
                  autoComplete="email"
                  label="Email address"
                  placeholder="you@company.com"
                  className="pl-10"
                  error={detailsForm.formState.errors.email?.message}
                  {...detailsForm.register("email")}
                />
              </div>

              <label className="flex items-start gap-2 text-xs text-slate-500">
                <input type="checkbox" checked={agreedTerms} onChange={(e) => setAgreedTerms(e.target.checked)} className="mt-0.5 rounded border-slate-300" />
                I agree to the Terms of Service and Privacy Policy.
              </label>

              <Button type="submit" fullWidth size="lg" disabled={!agreedTerms}>
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-slate-900">What are you here to do?</p>
              <div className="space-y-2.5">
                {ROLE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const selected = role === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setRole(opt.value)}
                      className={cn(
                        "w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-colors",
                        selected ? "border-[#0552CC] bg-[var(--color-brand-light)]" : "border-[var(--border-color)] hover:border-slate-300"
                      )}
                    >
                      <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", selected ? "bg-[#0552CC] text-white" : "bg-slate-100 text-slate-500")}>
                        <Icon className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0">
                        <p className={cn("text-sm font-semibold", selected ? "text-[#0552CC]" : "text-slate-900")}>{opt.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{opt.description}</p>
                      </div>
                      {selected && <Check className="h-4 w-4 text-[#0552CC] shrink-0 ml-auto mt-1" />}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button type="button" variant="secondary" onClick={() => setStep(1)} icon={<ArrowLeft className="h-4 w-4" />}>
                  Back
                </Button>
                <Button type="button" fullWidth size="lg" disabled={!role} loading={loading} onClick={sendCode}>
                  Send code
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <form onSubmit={codeForm.handleSubmit(verifyCode)} noValidate className="space-y-4">
              <p className="text-sm text-slate-600">We emailed a sign-in code to <span className="font-medium text-slate-900">{email}</span>.</p>
              <div className="relative">
                <KeyRound className="absolute left-3 top-[38px] h-4 w-4 text-slate-400 pointer-events-none" />
                <Input
                  id="code"
                  type="text"
                  autoComplete="one-time-code"
                  maxLength={12}
                  label="Sign-in code"
                  placeholder="123456"
                  className="pl-10 tracking-widest"
                  error={codeForm.formState.errors.code?.message}
                  {...codeForm.register("code")}
                />
              </div>

              <Button type="submit" fullWidth size="lg" loading={loading}>
                Verify &amp; create account
              </Button>

              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </button>
                <button
                  type="button"
                  onClick={resendCode}
                  disabled={loading}
                  className="text-[#0552CC] hover:underline font-medium disabled:opacity-50"
                >
                  Resend code
                </button>
              </div>
            </form>
          )}

          <p className="text-center text-xs text-slate-500">
            Already have an account?{" "}
            <Link href="/auth/login" className="text-[#0552CC] hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
