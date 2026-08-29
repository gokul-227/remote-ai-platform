"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Mail, Lock, User, Eye, EyeOff, Building2, AlertCircle, ArrowRight, ArrowLeft, Check } from "lucide-react";
import api, { extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

type Role = "ENGINEER" | "COMPANY";

const registerSchema = z.object({
  fullName: z.string().min(1, "This field is required"),
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type RegisterForm = z.infer<typeof registerSchema>;

const ROLE_OPTIONS: Array<{ value: Role; icon: typeof User; title: string; description: string }> = [
  { value: "ENGINEER", icon: User, title: "I am a Professional", description: "Build a profile, get AI-matched to remote roles, and apply." },
  { value: "COMPANY", icon: Building2, title: "I am hiring / represent an organization", description: "Post roles and discover qualified remote professionals." },
];

function passwordStrength(pw: string): { label: string; color: string; width: string } {
  if (pw.length === 0) return { label: "", color: "bg-slate-200", width: "w-0" };
  if (pw.length < 6) return { label: "Weak", color: "bg-red-400", width: "w-1/4" };
  if (pw.length < 10) return { label: "Fair", color: "bg-amber-400", width: "w-1/2" };
  if (pw.length < 14) return { label: "Good", color: "bg-emerald-400", width: "w-3/4" };
  return { label: "Strong", color: "bg-emerald-600", width: "w-full" };
}

export default function RegisterPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [role, setRole] = useState<Role | null>(null);
  const [showPw, setShowPw] = useState(false);
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    getValues,
    trigger,
    setError: setFieldError,
    formState: { errors },
  } = useForm<RegisterForm>();
  const password = useWatch({ control, name: "password" }) ?? "";
  const strength = passwordStrength(password);

  const goToStep2 = async () => {
    const valid = await trigger(["fullName", "email", "password"]);
    const parsed = registerSchema.safeParse(getValues());
    if (!valid || !parsed.success) {
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          setFieldError(issue.path[0] as keyof RegisterForm, { message: issue.message });
        }
      }
      return;
    }
    setStep(2);
  };

  const onSubmit = async (data: RegisterForm) => {
    if (!role) return;
    const parsed = registerSchema.safeParse(data);
    if (!parsed.success) return;
    setError(null);
    setLoading(true);
    try {
      await api.post("/auth/register", {
        full_name: parsed.data.fullName,
        email: parsed.data.email,
        password: parsed.data.password,
        role,
      });
      const loginRes = await api.post("/auth/login", { email: parsed.data.email, password: parsed.data.password });
      const { access_token, refresh_token, user: userData } = loginRes.data;
      login(access_token, userData, refresh_token);
      router.push("/onboarding");
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, "Registration failed. Please try again.");
      setError(msg);
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
            <div className="h-8 w-8 rounded-lg bg-[#0A66C2] flex items-center justify-center text-white font-black text-lg">
              R
            </div>
            Remote <span className="text-[#0A66C2]">AI Platform</span>
          </Link>
          <h1 className="text-xl font-bold text-slate-900">Create your account</h1>
          <p className="text-sm text-slate-600">Join the professional remote engineering network</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2">
          {[1, 2].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={cn(
                  "h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold border",
                  step > s
                    ? "bg-[#0A66C2] text-white border-[#0A66C2]"
                    : step === s
                      ? "border-[#0A66C2] text-[#0A66C2]"
                      : "border-slate-300 text-slate-400"
                )}
              >
                {step > s ? <Check className="h-3.5 w-3.5" /> : s}
              </div>
              {s < 2 && <div className={cn("h-px w-10", step > s ? "bg-[#0A66C2]" : "bg-slate-300")} />}
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
            <div className="space-y-4">
              <div className="relative">
                <User className="absolute left-3 top-[38px] h-4 w-4 text-slate-400 pointer-events-none" />
                <Input
                  id="fullName"
                  label="Full name"
                  placeholder="Jordan Smith"
                  className="pl-10"
                  error={errors.fullName?.message}
                  {...register("fullName")}
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
                  error={errors.email?.message}
                  {...register("email")}
                />
              </div>

              <div className="relative">
                <Lock className="absolute left-3 top-[38px] h-4 w-4 text-slate-400 pointer-events-none" />
                <Input
                  id="regPassword"
                  type={showPw ? "text" : "password"}
                  label="Password"
                  placeholder="Minimum 8 characters"
                  className="pl-10 pr-10"
                  error={errors.password?.message}
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-[38px] text-slate-400 hover:text-slate-600"
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                {password.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all duration-300", strength.color, strength.width)} />
                    </div>
                    <div className="text-[10px] text-slate-500">{strength.label} password</div>
                  </div>
                )}
              </div>

              <label className="flex items-start gap-2 text-xs text-slate-500">
                <input type="checkbox" checked={agreedTerms} onChange={(e) => setAgreedTerms(e.target.checked)} className="mt-0.5 rounded border-slate-300" />
                I agree to the Terms of Service and Privacy Policy.
              </label>

              <Button fullWidth size="lg" disabled={!agreedTerms} onClick={goToStep2} icon={undefined}>
                Continue <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {step === 2 && (
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
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
                        selected ? "border-[#0A66C2] bg-[var(--color-brand-light)]" : "border-[var(--border-color)] hover:border-slate-300"
                      )}
                    >
                      <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", selected ? "bg-[#0A66C2] text-white" : "bg-slate-100 text-slate-500")}>
                        <Icon className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0">
                        <p className={cn("text-sm font-semibold", selected ? "text-[#0A66C2]" : "text-slate-900")}>{opt.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{opt.description}</p>
                      </div>
                      {selected && <Check className="h-4 w-4 text-[#0A66C2] shrink-0 ml-auto mt-1" />}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button type="button" variant="secondary" onClick={() => setStep(1)} icon={<ArrowLeft className="h-4 w-4" />}>
                  Back
                </Button>
                <Button type="submit" fullWidth size="lg" disabled={!role} loading={loading}>
                  Create Account
                </Button>
              </div>
            </form>
          )}

          <p className="text-center text-xs text-slate-500">
            Already have an account?{" "}
            <Link href="/auth/login" className="text-[#0A66C2] hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
