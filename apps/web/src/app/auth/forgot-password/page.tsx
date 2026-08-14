"use client";

import Link from "next/link";
import { Briefcase, Mail, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-2 text-[#0A66C2] font-extrabold text-2xl">
            <Briefcase className="h-7 w-7" />
            Remote AI Platform
          </Link>
        </div>

        <div className="card-enterprise p-8 space-y-5 text-center">
          <div className="h-12 w-12 rounded-full bg-[var(--bg-subtle)] flex items-center justify-center mx-auto">
            <Mail className="h-6 w-6 text-slate-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Password reset isn&rsquo;t available yet</h1>
            <p className="text-sm text-slate-600 mt-2">
              Self-service password reset isn&rsquo;t supported on this platform yet. If you&rsquo;re locked out of your account, contact support and we&rsquo;ll help you regain access.
            </p>
          </div>
          <Link href="/auth/login">
            <Button variant="secondary" fullWidth icon={<ArrowLeft className="h-4 w-4" />}>Back to sign in</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
