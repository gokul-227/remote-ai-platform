"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Lock, Mail, Eye, EyeOff, Sparkles, Network, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import api, { extractErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

const VALUE_POINTS = [
  { icon: Sparkles, text: "Explainable AI matching — see exactly why a role fits you." },
  { icon: Network, text: "A professional network built for remote professionals." },
  { icon: ShieldCheck, text: "Verified profiles and trust signals on both sides of the hire." },
];

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remember, setRemember] = useState(true);
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
      login(access_token, userData, remember ? refresh_token : undefined);
      const dest = userData.role === "COMPANY" ? "/company/dashboard" : userData.role === "ADMIN" ? "/admin/dashboard" : "/engineer/dashboard";
      router.push(dest);
    } catch (err: unknown) {
      const response = (err as { response?: { status?: number } }).response;
      if (!response) {
        setError("Can't reach the server right now. Check your connection and try again.");
      } else if (response.status === 429) {
        setError("Too many attempts. Please wait a moment and try again.");
      } else if (response.status === 401 || response.status === 422) {
        setError(extractErrorMessage(err, "Invalid email or password. Please try again."));
      } else {
        setError(extractErrorMessage(err, "Something went wrong signing you in. Please try again."));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-4xl grid lg:grid-cols-2 rounded-2xl overflow-hidden shadow-[var(--shadow-md)] border border-[var(--border-color)] bg-white">
        {/* Left: brand / value */}
        <div className="hidden lg:flex flex-col justify-between bg-[#0A1F3D] text-white p-10">
          <div>
            <Link href="/" className="inline-flex items-center gap-2 font-black text-2xl tracking-tight text-white">
              <div className="h-9 w-9 rounded-xl bg-[#0A66C2] flex items-center justify-center text-white font-black text-xl shadow-xs">
                R
              </div>
              Remote <span className="text-blue-400">AI Platform</span>
            </Link>
            <h2 className="text-2xl font-bold mt-10 leading-snug text-white">
              The professional network for remote engineering work.
            </h2>
          </div>
          <ul className="space-y-4">
            {VALUE_POINTS.map((p, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-white/80">
                <p.icon className="h-4 w-4 mt-0.5 text-blue-400 shrink-0" />
                {p.text}
              </li>
            ))}
          </ul>
          <p className="text-xs text-white/40">© 2026 Remote AI Platform. All rights reserved.</p>
        </div>

        {/* Right: form */}
        <div className="p-8 sm:p-10 space-y-6">
          <div className="lg:hidden text-center">
            <Link href="/" className="inline-flex items-center gap-2 text-2xl font-black text-slate-900 tracking-tight">
              <div className="h-8 w-8 rounded-lg bg-[#0A66C2] flex items-center justify-center text-white font-black text-lg">
                R
              </div>
              Remote <span className="text-[#0A66C2]">AI Platform</span>
            </Link>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Sign in to your account</h1>
            <p className="text-sm text-slate-600 mt-1">Access your career dashboard and opportunities.</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg px-4 py-3 flex items-center gap-2">
              <Lock className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-3 top-[38px] h-4 w-4 text-slate-400 pointer-events-none" />
              <Input
                id="email"
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
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                label="Password"
                placeholder="••••••••"
                className="pl-10 pr-10"
                error={errors.password?.message}
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-[38px] text-slate-400 hover:text-slate-600"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 text-slate-600">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="rounded border-slate-300" />
                Remember me
              </label>
              <Link href="/auth/forgot-password" className="text-[#0A66C2] hover:underline font-medium">
                Forgot password?
              </Link>
            </div>

            <Button type="submit" fullWidth size="lg" loading={loading}>
              Sign In
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-white px-3 text-slate-500">or</span></div>
          </div>

          <Link href="/auth/register" className="block">
            <Button variant="secondary" fullWidth size="lg">Create an account</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
