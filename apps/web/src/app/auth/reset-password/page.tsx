"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, ShieldCheck, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import api, { extractErrorMessage } from "@/lib/api";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token") || "";

  const [token, setToken] = useState(tokenFromUrl);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      setError("Password reset token is required.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await api.post("/auth/reset-password", {
        token: token.trim(),
        new_password: newPassword,
      });
      setSuccess(true);
      setTimeout(() => {
        router.push("/auth/login?reset=success");
      }, 2000);
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, "Failed to reset password. The link may have expired or been used already.");
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-2 text-2xl font-black text-slate-900 tracking-tight">
            <div className="h-8 w-8 rounded-lg bg-[#0A66C2] flex items-center justify-center text-white font-black text-lg">
              W
            </div>
            Remote <span className="text-[#0A66C2]">AI Platform</span>
          </Link>
          <h1 className="text-xl font-bold text-slate-900">Set new password</h1>
          <p className="text-xs text-slate-500">Create a secure password for your account</p>
        </div>

        <div className="card-enterprise p-8 space-y-5">
          {success ? (
            <div className="text-center space-y-4">
              <div className="h-12 w-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-bold text-slate-900">Password Reset Complete!</h2>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Your password has been updated and prior sessions have been revoked. Redirecting to sign in...
                </p>
              </div>
              <div className="pt-2">
                <Link href="/auth/login" className="block">
                  <Button fullWidth icon={<ArrowLeft className="h-4 w-4" />}>
                    Proceed to Sign In
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {!tokenFromUrl && (
                <Input
                  label="Reset Token"
                  type="text"
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste your reset token here"
                />
              )}

              <Input
                label="New Password"
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
              />

              <Input
                label="Confirm New Password"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
              />

              <div className="text-xs text-slate-500 flex items-start gap-2 bg-blue-50/60 p-3 rounded-lg border border-blue-100">
                <ShieldCheck className="h-4 w-4 text-[#0A66C2] shrink-0 mt-0.5" />
                <span>Resetting your password will automatically log out all active sessions across all devices.</span>
              </div>

              <Button
                type="submit"
                fullWidth
                size="lg"
                loading={loading}
                disabled={!newPassword || !confirmPassword || (Boolean(!tokenFromUrl) && !token)}
              >
                Update Password
              </Button>

              <div className="text-center pt-2">
                <Link href="/auth/login" className="text-xs text-[#0A66C2] hover:underline font-semibold inline-flex items-center gap-1">
                  <ArrowLeft className="h-3 w-3" /> Back to Sign In
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center">Loading...</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
