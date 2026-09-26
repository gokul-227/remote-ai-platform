"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import { extractErrorMessage } from "@/lib/api";
import { supabase, fetchBackendUser, applyPendingRegistration } from "@/lib/supabase";
import { Ic, cx, inputCls } from "@/components/rap/kit";
import { AuthError, Divider, Spinner, authButton } from "@/components/rap/AuthLayout";
import { homeFor, safeRedirect } from "./destinations";

type Mode = "login" | "register";
type Role = "ENGINEER" | "COMPANY";

const emailSchema = z.string().trim().min(1, "Enter your email address.").email("Enter a valid email address.");
// Supabase's email OTP isn't reliably 6 digits (some link types mint 8), so
// accept 6–12 characters rather than pinning a length that would truncate a
// real code before it reaches verifyOtp().
const codeSchema = z.string().trim().min(6, "Enter the complete code from your email (6–12 characters).").max(12, "Enter the complete code from your email (6–12 characters).");

const PROVIDERS: Array<[label: string, id: "google" | "azure" | "github"]> = [["Google", "google"], ["Microsoft", "azure"], ["GitHub", "github"]];
const RESEND_SECONDS = 30;

export function OtpAuthCard({ mode }: { mode: Mode }) {
  const join = mode === "register";
  const router = useRouter();
  const params = useSearchParams();
  const { login } = useAuth();

  const [step, setStep] = useState<"email" | "code">("email");
  const [role, setRole] = useState<Role>("ENGINEER");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  const notice =
    params.get("reason") === "session_expired" ? "Your session expired. Sign in again to continue." :
    params.get("reset") === "success" ? "Password updated. Sign in to continue." : null;

  const requestCode = async () => {
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: join ? { shouldCreateUser: true, data: { full_name: name.trim() } } : { shouldCreateUser: false },
    });
    if (otpError) throw otpError;
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (join && !name.trim()) return setError("Enter your full name.");
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setError(null);
    setLoading(true);
    try {
      await requestCode();
      if (join) {
        // Role and display name belong to this app's backend, not Supabase —
        // stash them so the first verified sign-in applies them.
        localStorage.setItem("pending_registration", JSON.stringify({ email: email.trim(), fullName: name.trim(), role }));
      }
      setStep("code");
      setSeconds(RESEND_SECONDS);
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message?.toLowerCase() || "";
      if (!join && (msg.includes("signups not allowed") || msg.includes("user not found"))) {
        setError("We couldn't find an account with that email. Check the address, or create an account.");
      } else {
        setError((err as { message?: string })?.message || extractErrorMessage(err, "Something went wrong sending your code. Please try again."));
      }
    } finally {
      setLoading(false);
    }
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = codeSchema.safeParse(code);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setError(null);
    setLoading(true);
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({ email: email.trim(), token: parsed.data, type: "email" });
      if (verifyError || !data.session) throw verifyError || new Error("Verification failed");
      let user = await fetchBackendUser(data.session);
      user = await applyPendingRegistration(data.session, user);
      login(data.session.access_token, user, data.session.refresh_token);
      router.push(join ? "/onboarding" : safeRedirect(params.get("redirect")) || homeFor(user.role));
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || "";
      setError(/expired|invalid/i.test(msg) ? "That code is invalid or has expired. Request a new code." : msg || extractErrorMessage(err, "Something went wrong verifying your code. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setError(null);
    setCode("");
    try {
      await requestCode();
      setSeconds(RESEND_SECONDS);
    } catch (err: unknown) {
      setError(extractErrorMessage(err, "Couldn't resend the code. Please try again."));
    }
  };

  const oauth = async (provider: "google" | "azure" | "github") => {
    setError(null);
    const redirect = safeRedirect(params.get("redirect"));
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}` },
    });
  };

  if (step === "code") {
    return (
      <>
        <button type="button" onClick={() => { setStep("email"); setError(null); setCode(""); }} className="text-sm text-[#0866FF]">← Change email</button>
        <span className="mx-auto my-5 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-[#0866FF]"><Ic n="mail" s={26} /></span>
        <h1 className="text-center">Check your email</h1>
        <p className="mt-2 text-center text-sm text-slate-500">Enter the code sent to <b className="text-slate-800">{email}</b>.</p>
        <form onSubmit={verify} noValidate>
          <label htmlFor="code" className="mt-5 block">Sign-in code</label>
          <input id="code" autoComplete="one-time-code" inputMode="text" maxLength={12} value={code} onChange={(e) => setCode(e.target.value.trim())} className={inputCls + " mt-2 !h-12 !text-xl tracking-widest"} autoFocus />
          <button className={authButton + " mt-5"} disabled={loading}>{loading && <Spinner />}Verify and continue</button>
        </form>
        <button type="button" disabled={seconds > 0} onClick={resend} className="mt-4 w-full text-sm font-semibold text-[#0866FF] disabled:text-slate-500">
          {seconds > 0 ? `Resend code in ${seconds}s` : "Resend code"}
        </button>
        {error && <AuthError>{error}</AuthError>}
      </>
    );
  }

  return (
    <>
      <h1>{join ? "Create your account" : "Welcome back"}</h1>
      <p className="mt-2 text-sm text-slate-500">{join ? "Find your community and your next opportunity." : "Sign in with an email code. No password needed."}</p>
      {notice && <p role="status" className="mt-4 rounded-lg bg-[#e7f0ff] p-3 text-sm text-[#0757d8]">{notice}</p>}
      <form className="mt-5 space-y-4" onSubmit={send} noValidate>
        {join && (
          <>
            <div className="grid grid-cols-2 gap-3" role="group" aria-label="What brings you here?">
              {([["ENGINEER", "Find work", "briefcase"], ["COMPANY", "Hire talent", "building"]] as const).map(([value, label, icon]) => (
                <button type="button" aria-pressed={role === value} key={value} onClick={() => setRole(value)} className={cx("rounded-lg border-2 p-3 text-left", role === value ? "border-[#0866FF] bg-blue-50 text-[#0757d8]" : "border-slate-200")}>
                  <Ic n={icon} /><b className="mt-2 block">{label}</b>
                </button>
              ))}
            </div>
            <div>
              <label htmlFor="fullName" className="block">Full name</label>
              <input id="fullName" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={inputCls + " mt-2"} placeholder="Your full name" />
            </div>
          </>
        )}
        <div>
          <label htmlFor="email" className="block">Email address</label>
          <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputCls + " mt-2"} />
        </div>
        <button className={authButton} disabled={loading}>{loading && <Spinner />}{join ? "Email me a sign-up code" : "Email me a sign-in code"}</button>
        {join && <p className="text-xs text-slate-500">By creating an account you agree to the <Link href="/terms" className="font-semibold text-[#0757d8] underline">Terms</Link> and <Link href="/privacy" className="font-semibold text-[#0757d8] underline">Privacy Policy</Link>.</p>}
      </form>
      <Divider label="or continue with" />
      <div className="grid grid-cols-3 gap-2">
        {PROVIDERS.map(([label, id]) => (
          <button key={id} type="button" onClick={() => oauth(id)} className="rounded-lg border border-slate-300 py-3 text-sm font-semibold hover:bg-slate-50">{label}</button>
        ))}
      </div>
      <div className="mt-6 border-t border-slate-200 pt-5 text-center">
        <Link href={join ? "/auth/login" : "/auth/register"} className="font-semibold text-[#0757d8]">{join ? "Already a member? Sign in" : "New here? Create an account"}</Link>
      </div>
      <Link href="/auth/forgot-password" className="mt-4 block w-full text-center text-sm text-slate-500">Having trouble signing in?</Link>
      {error && <AuthError>{error}</AuthError>}
    </>
  );
}
