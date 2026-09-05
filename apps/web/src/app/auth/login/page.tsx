"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Mail, KeyRound, Sparkles, Network, ShieldCheck, ArrowLeft } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { extractErrorMessage } from "@/lib/api";
import { supabase, fetchBackendUser, applyPendingRegistration } from "@/lib/supabase";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const emailSchema = z.object({
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
});

const codeSchema = z.object({
  code: z.string().min(6, "Enter the 6-digit code").max(6, "Enter the 6-digit code"),
});

type EmailForm = z.infer<typeof emailSchema>;
type CodeForm = z.infer<typeof codeSchema>;

const VALUE_POINTS = [
  { icon: Sparkles, text: "Explainable AI matching — see exactly why a role fits you." },
  { icon: Network, text: "A professional network built for remote professionals." },
  { icon: ShieldCheck, text: "Verified profiles and trust signals on both sides of the hire." },
];

export default function LoginPage() {
  const [stage, setStage] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { login } = useAuth();
  const router = useRouter();

  const emailForm = useForm<EmailForm>();
  const codeForm = useForm<CodeForm>();

  const sendCode = async (data: EmailForm) => {
    const parsed = emailSchema.safeParse(data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        emailForm.setError(issue.path[0] as keyof EmailForm, { message: issue.message });
      }
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: parsed.data.email,
        options: { shouldCreateUser: false },
      });
      if (otpError) throw otpError;
      setEmail(parsed.data.email);
      setStage("code");
    } catch (err: unknown) {
      const supabaseMessage = (err as { message?: string })?.message;
      if (supabaseMessage?.toLowerCase().includes("signups not allowed") || supabaseMessage?.toLowerCase().includes("user not found")) {
        setError("We couldn't find an account with that email. Check the address, or create an account.");
      } else if (supabaseMessage) {
        setError(supabaseMessage);
      } else {
        setError(extractErrorMessage(err, "Something went wrong sending your code. Please try again."));
      }
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
      const dest = userData.role === "COMPANY" ? "/company/dashboard" : userData.role === "ADMIN" ? "/admin/dashboard" : "/engineer/dashboard";
      router.push(dest);
    } catch (err: unknown) {
      const supabaseMessage = (err as { message?: string })?.message;
      if (supabaseMessage?.toLowerCase().includes("expired") || supabaseMessage?.toLowerCase().includes("invalid")) {
        setError("That code is invalid or has expired. Request a new one and try again.");
      } else if (supabaseMessage) {
        setError(supabaseMessage);
      } else {
        setError(extractErrorMessage(err, "Something went wrong verifying your code. Please try again."));
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
        options: { shouldCreateUser: false },
      });
      if (otpError) throw otpError;
    } catch (err: unknown) {
      setError(extractErrorMessage(err, "Couldn't resend the code. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const signInWithProvider = async (provider: "google" | "azure" | "github") => {
    setError(null);
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-4xl grid lg:grid-cols-2 rounded-2xl overflow-hidden shadow-[var(--shadow-md)] border border-[var(--border-color)] bg-white">
        {/* Left: brand / value */}
        <div className="hidden lg:flex flex-col justify-between bg-[#0B1E3D] text-white p-10">
          <div>
            <Link href="/" className="inline-flex items-center gap-2 font-black text-2xl tracking-tight text-white">
              <div className="h-9 w-9 rounded-xl bg-[#0552CC] flex items-center justify-center text-white font-black text-xl shadow-xs">
                R
              </div>
              Remote <span className="text-[#4C9AFF]">AI Platform</span>
            </Link>
            <h2 className="text-2xl font-bold mt-10 leading-snug text-white">
              The professional network for remote engineering work.
            </h2>
          </div>
          <ul className="space-y-4">
            {VALUE_POINTS.map((p, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-white/80">
                <p.icon className="h-4 w-4 mt-0.5 text-[#4C9AFF] shrink-0" />
                {p.text}
              </li>
            ))}
          </ul>
          <p className="text-xs text-white/70">© 2026 Remote AI Platform. All rights reserved.</p>
        </div>

        {/* Right: form */}
        <div className="p-8 sm:p-10 space-y-6">
          <div className="lg:hidden text-center">
            <Link href="/" className="inline-flex items-center gap-2 text-2xl font-black text-slate-900 tracking-tight">
              <div className="h-8 w-8 rounded-lg bg-[#0552CC] flex items-center justify-center text-white font-black text-lg">
                R
              </div>
              Remote <span className="text-[#0552CC]">AI Platform</span>
            </Link>
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Sign in to your account</h1>
            <p className="text-sm text-slate-600 mt-1">
              {stage === "email"
                ? "We'll email you a one-time sign-in code — no password needed."
                : `Enter the 6-digit code we sent to ${email}.`}
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-lg px-4 py-3 flex items-center gap-2">
              <KeyRound className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {stage === "email" ? (
            <form onSubmit={emailForm.handleSubmit(sendCode)} noValidate className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-3 top-[38px] h-4 w-4 text-slate-400 pointer-events-none" />
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  label="Email address"
                  placeholder="you@company.com"
                  className="pl-10"
                  error={emailForm.formState.errors.email?.message}
                  {...emailForm.register("email")}
                />
              </div>

              <Button type="submit" fullWidth size="lg" loading={loading}>
                Send code
              </Button>
            </form>
          ) : (
            <form onSubmit={codeForm.handleSubmit(verifyCode)} noValidate className="space-y-4">
              <div className="relative">
                <KeyRound className="absolute left-3 top-[38px] h-4 w-4 text-slate-400 pointer-events-none" />
                <Input
                  id="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  label="6-digit code"
                  placeholder="123456"
                  className="pl-10 tracking-widest"
                  error={codeForm.formState.errors.code?.message}
                  {...codeForm.register("code")}
                />
              </div>

              <Button type="submit" fullWidth size="lg" loading={loading}>
                Verify &amp; sign in
              </Button>

              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setStage("email");
                    setError(null);
                  }}
                  className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-700"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Use a different email
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

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-white px-3 text-slate-500">or continue with</span></div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Button variant="secondary" fullWidth onClick={() => signInWithProvider("google")} type="button">
              Google
            </Button>
            <Button variant="secondary" fullWidth onClick={() => signInWithProvider("azure")} type="button">
              Microsoft
            </Button>
            <Button variant="secondary" fullWidth onClick={() => signInWithProvider("github")} type="button">
              GitHub
            </Button>
          </div>

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
