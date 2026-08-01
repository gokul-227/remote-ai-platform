"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ArrowRight, Lock, Mail, Eye, EyeOff, Briefcase } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import api from "@/lib/api";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login } = useAuth();
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError: setFieldError,
    formState: { errors },
  } = useForm<LoginForm>();

  const onSubmit = async (data: LoginForm) => {
    const parsed = loginSchema.safeParse(data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        setFieldError(issue.path[0] as keyof LoginForm, { message: issue.message });
      }
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await api.post("/auth/login", parsed.data);
      const { access_token, refresh_token, user: userData } = res.data;
      login(access_token, userData, refresh_token);
      router.push("/");
    } catch {
      setError("Invalid email or password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F2EF] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 text-[#0A66C2] font-extrabold text-2xl">
            <Briefcase className="h-7 w-7" />
            Remote AI Platform
          </div>
          <h1 className="text-xl font-bold text-slate-900">Sign in to your account</h1>
          <p className="text-sm text-slate-600">Access your career dashboard and opportunities</p>
        </div>

        {/* Card */}
        <div className="card-enterprise p-8 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg px-4 py-3 flex items-center gap-2">
              <Lock className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  id="email"
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

            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  {...register("password")}
                  className="input-enterprise pl-10 pr-10 py-2.5"
                  placeholder="••••••••"
                  aria-invalid={!!errors.password}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && <p className="mt-1.5 text-xs text-red-600">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary-brand w-full py-2.5 justify-center text-sm mt-1 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  Sign In <ArrowRight className="h-4 w-4" />
                </span>
              )}
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-white px-3 text-slate-500">or</span></div>
          </div>

          <Link
            href="/auth/register"
            className="btn-secondary-brand w-full py-2.5 justify-center text-sm flex items-center gap-2"
          >
            Create an account
          </Link>
        </div>

        <p className="text-center text-xs text-slate-500">
          Sign in with the email and password you registered with.
        </p>
      </div>
    </div>
  );
}
