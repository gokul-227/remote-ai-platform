"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api, { extractErrorMessage } from "@/lib/api";
import { inputCls } from "@/components/rap/kit";
import { AuthError, AuthLayout, Spinner, authButton } from "@/components/rap/AuthLayout";

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return setError("This recovery link is incomplete. Request a new one.");
    if (password.length < 8 || password !== confirm) return setError("Use at least 8 characters and make sure both passwords match.");
    setLoading(true);
    setError(null);
    try {
      await api.post("/auth/reset-password", { token, new_password: password });
      setDone(true);
      setTimeout(() => router.push("/auth/login?reset=success"), 1500);
    } catch (err: unknown) {
      setError(extractErrorMessage(err, "This link may have expired or already been used. Request a new one."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <h1>Reset your password</h1>
      <p className="mt-2 text-sm text-slate-500">For existing password accounts. Email-code sign-in remains available.</p>
      {done ? (
        <>
          <p role="status" className="mt-5 rounded-lg bg-green-50 p-4 text-green-800">Password updated. Taking you to sign in…</p>
          <Link href="/auth/login" className={authButton + " mt-4"}>Back to sign in</Link>
        </>
      ) : (
        <form className="mt-5 space-y-4" onSubmit={submit} noValidate>
          <div>
            <label htmlFor="newPassword" className="block">New password</label>
            <input id="newPassword" type="password" autoComplete="new-password" className={inputCls + " mt-2"} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <label htmlFor="confirmPassword" className="block">Confirm password</label>
            <input id="confirmPassword" type="password" autoComplete="new-password" className={inputCls + " mt-2"} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <button className={authButton} disabled={loading}>{loading && <Spinner />}Update password</button>
        </form>
      )}
      {!token && !done && <p className="mt-4 text-sm text-slate-500"><Link href="/auth/forgot-password" className="font-semibold text-[#0757d8]">Request a new recovery link</Link></p>}
      {error && <AuthError>{error}</AuthError>}
    </>
  );
}

export default function ResetPasswordPage() {
  return <AuthLayout><Suspense><ResetForm /></Suspense></AuthLayout>;
}
