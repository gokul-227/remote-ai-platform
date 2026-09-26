"use client";

import Link from "next/link";
import { useState } from "react";
import api, { extractErrorMessage } from "@/lib/api";
import { Ic, inputCls } from "@/components/rap/kit";
import { AuthError, AuthLayout, Spinner, authButton } from "@/components/rap/AuthLayout";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("Enter a valid email address.");
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ message: string; reset_token?: string }>("/auth/forgot-password", { email: email.trim() });
      // Only non-production backends return the raw token (no mailer there).
      setDevToken(res.data.reset_token ?? null);
      setSent(true);
    } catch (err: unknown) {
      setError(extractErrorMessage(err, "We couldn't process that request. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      {sent ? (
        <>
          <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-[#0866FF]"><Ic n="mail" s={26} /></span>
          <h1 className="text-center">Check your inbox</h1>
          <p className="mt-3 text-center text-slate-500">If an account exists for <b className="text-slate-800">{email}</b>, recovery instructions will be sent.</p>
          <p className="mt-3 text-center text-sm text-slate-500">Most accounts sign in with an email code — you can always <Link href="/auth/login" className="font-semibold text-[#0757d8]">request a new sign-in code</Link>.</p>
          {devToken && (
            <Link href={`/auth/reset-password?token=${encodeURIComponent(devToken)}`} className={authButton + " mt-6"}>Open recovery link (development)</Link>
          )}
          <Link href="/auth/login" className="mt-4 block w-full text-center text-sm text-[#0757d8]">Back to sign in</Link>
        </>
      ) : (
        <>
          <h1>Recover your account</h1>
          <p className="mt-2 text-sm text-slate-500">Enter your email to receive recovery instructions.</p>
          <form className="mt-5 space-y-4" onSubmit={submit} noValidate>
            <div>
              <label htmlFor="email" className="block">Email address</label>
              <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className={inputCls + " mt-2"} />
            </div>
            <button className={authButton} disabled={loading}>{loading && <Spinner />}Send recovery instructions</button>
          </form>
          <Link href="/auth/login" className="mt-4 block w-full text-center text-sm text-slate-500">Back to sign in</Link>
          {error && <AuthError>{error}</AuthError>}
        </>
      )}
    </AuthLayout>
  );
}
