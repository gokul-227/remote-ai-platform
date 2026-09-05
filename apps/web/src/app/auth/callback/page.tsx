"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase, fetchBackendUser, applyPendingRegistration } from "@/lib/supabase";

/** Google/Microsoft redirect here after consent. The Supabase client (configured
 * with detectSessionInUrl) parses the redirect and establishes a session on its
 * own -- this page just waits for that, then bridges it into this app's own
 * AuthContext exactly like a password login does. */
export default function OAuthCallbackPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const finish = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (cancelled) return;
      if (sessionError || !data.session) {
        setError("Sign-in didn't complete. Please try again.");
        return;
      }
      try {
        let userData = await fetchBackendUser(data.session);
        userData = await applyPendingRegistration(data.session, userData);
        login(data.session.access_token, userData, data.session.refresh_token);
        const dest =
          userData.role === "COMPANY"
            ? "/company/dashboard"
            : userData.role === "ADMIN"
              ? "/admin/dashboard"
              : "/engineer/dashboard";
        router.push(dest);
      } catch {
        setError("Signed in, but couldn't load your account. Please try again.");
      }
    };

    // detectSessionInUrl's parsing happens on client init, which can race
    // this effect -- listening for the auth event is more reliable than a
    // single getSession() call right on mount.
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") finish();
    });
    finish();

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg-page)] flex items-center justify-center px-4">
      <div className="text-center space-y-3">
        {error ? (
          <>
            <AlertCircle className="h-8 w-8 text-red-500 mx-auto" />
            <p className="text-sm text-slate-700">{error}</p>
            <a href="/auth/login" className="text-sm text-[#0552CC] hover:underline font-medium">
              Back to sign in
            </a>
          </>
        ) : (
          <>
            <Loader2 className="h-8 w-8 text-[#0552CC] mx-auto animate-spin" />
            <p className="text-sm text-slate-600">Finishing sign-in…</p>
          </>
        )}
      </div>
    </div>
  );
}
