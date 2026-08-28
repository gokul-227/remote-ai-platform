import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ShieldCheck, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import api from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ message: string; reset_token?: string }>("/auth/forgot-password", {
        email: email.trim(),
      });
      if (res.data.reset_token) {
        setDevToken(res.data.reset_token);
      }
      setSubmitted(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Failed to process password reset request. Please try again.");
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
          <h1 className="text-xl font-bold text-slate-900">Reset your password</h1>
          <p className="text-xs text-slate-500">Enter your email and we&apos;ll send recovery instructions</p>
        </div>

        <div className="card-enterprise p-8 space-y-5">
          {submitted ? (
            <div className="text-center space-y-4">
              <div className="h-12 w-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-bold text-slate-900">Recovery Instructions Sent</h2>
                <p className="text-xs text-slate-500 leading-relaxed">
                  If an account exists for <span className="font-semibold text-slate-800">{email}</span>, you will receive password reset instructions shortly.
                </p>
                {devToken && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-left text-xs space-y-1">
                    <p className="font-semibold text-amber-800">Development Mode Reset Token:</p>
                    <Link
                      href={`/auth/reset-password?token=${devToken}`}
                      className="text-[#0A66C2] underline font-mono text-[11px] break-all block"
                    >
                      Click here to reset password directly →
                    </Link>
                  </div>
                )}
              </div>
              <div className="pt-2">
                <Link href="/auth/login" className="block">
                  <Button variant="secondary" fullWidth icon={<ArrowLeft className="h-4 w-4" />}>
                    Back to Sign In
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
              <Input
                label="Account Email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
              />

              <div className="text-xs text-slate-500 flex items-start gap-2 bg-blue-50/60 p-3 rounded-lg border border-blue-100">
                <ShieldCheck className="h-4 w-4 text-[#0A66C2] shrink-0 mt-0.5" />
                <span>For enterprise security, password resets expire 15 minutes after issuance.</span>
              </div>

              <Button type="submit" fullWidth size="lg" loading={loading} disabled={!email.trim()}>
                Send Reset Link
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
