"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Mail, Lock, User, Eye, EyeOff, Building2, AlertCircle, CheckCircle2, Briefcase, ArrowRight } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";

type Role = "ENGINEER" | "COMPANY";

const registerSchema = z.object({
  fullName: z.string().min(1, "This field is required"),
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [role, setRole] = useState<Role>("ENGINEER");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setError: setFieldError,
    formState: { errors },
  } = useForm<RegisterForm>();
  const password = watch("password") ?? "";

  const onSubmit = async (data: RegisterForm) => {
    const parsed = registerSchema.safeParse(data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        setFieldError(issue.path[0] as keyof RegisterForm, { message: issue.message });
      }
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await api.post("/auth/register", {
        full_name: parsed.data.fullName,
        email: parsed.data.email,
        password: parsed.data.password,
        role,
      });
      // Auto-login after registration
      const loginRes = await api.post("/auth/login", { email: parsed.data.email, password: parsed.data.password });
      const { access_token, refresh_token, user: userData } = loginRes.data;
      login(access_token, userData, refresh_token);
      router.push(role === "ENGINEER" ? "/engineer/profile" : "/company/profile");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const passwordStrength = (pw: string): { label: string; color: string; width: string } => {
    if (pw.length === 0) return { label: "", color: "bg-slate-200", width: "w-0" };
    if (pw.length < 6) return { label: "Weak", color: "bg-red-400", width: "w-1/4" };
    if (pw.length < 10) return { label: "Fair", color: "bg-amber-400", width: "w-1/2" };
    if (pw.length < 14) return { label: "Good", color: "bg-emerald-400", width: "w-3/4" };
    return { label: "Strong", color: "bg-emerald-600", width: "w-full" };
  };

  const strength = passwordStrength(password);

  return (
    <div className="min-h-screen bg-[#F3F2EF] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 text-[#0A66C2] font-extrabold text-2xl">
            <Briefcase className="h-7 w-7" />
            Remote AI Platform
          </div>
          <h1 className="text-xl font-bold text-slate-900">Create your account</h1>
          <p className="text-sm text-slate-600">Join the remote engineering marketplace</p>
        </div>

        {/* Card */}
        <div className="card-enterprise p-8 space-y-5">
          {/* Role Toggle */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">I am a...</label>
            <div className="grid grid-cols-2 gap-2 bg-slate-100 rounded-lg p-1">
              {(["ENGINEER", "COMPANY"] as Role[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex items-center justify-center gap-2 py-2 rounded-md text-xs font-semibold transition-all ${
                    role === r
                      ? "bg-white shadow-sm text-[#0A66C2]"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {r === "ENGINEER" ? <User className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
                  {r === "ENGINEER" ? "Software Engineer" : "Company / Recruiter"}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg px-4 py-3 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            {/* Full Name */}
            <div>
              <label htmlFor="fullName" className="block text-xs font-semibold text-slate-700 mb-1.5">
                {role === "COMPANY" ? "Company / Full Name" : "Full Name"}
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  id="fullName"
                  type="text"
                  {...register("fullName")}
                  className="input-enterprise pl-10 py-2.5"
                  placeholder={role === "COMPANY" ? "Acme Corp" : "Jordan Smith"}
                  aria-invalid={!!errors.fullName}
                />
              </div>
              {errors.fullName && <p className="mt-1.5 text-xs text-red-600">{errors.fullName.message}</p>}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="regEmail" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  id="regEmail"
                  type="email"
                  autoComplete="email"
                  {...register("email")}
                  className="input-enterprise pl-10 py-2.5"
                  placeholder="you@company.com"
                  aria-invalid={!!errors.email}
                />
              </div>
              {errors.email && <p className="mt-1.5 text-xs text-red-600">{errors.email.message}</p>}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="regPassword" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  id="regPassword"
                  type={showPw ? "text" : "password"}
                  {...register("password")}
                  className="input-enterprise pl-10 pr-10 py-2.5"
                  placeholder="Minimum 8 characters"
                  aria-invalid={!!errors.password}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="mt-1.5 text-xs text-red-600">{errors.password.message}</p>}

              {/* Password strength */}
              {password.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${strength.color} ${strength.width} rounded-full transition-all duration-300`} />
                  </div>
                  <div className="text-[10px] text-slate-500">{strength.label} password</div>
                </div>
              )}
            </div>

            <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 flex-shrink-0" />
              <span>Choose Freelancer to build a profile and apply to jobs, or Company to post jobs and find candidates.</span>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary-brand w-full py-2.5 justify-center text-sm disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating account...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  Create Account <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </button>
          </form>

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
