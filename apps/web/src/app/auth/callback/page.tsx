"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { supabase, fetchBackendUser, applyPendingRegistration } from "@/lib/supabase";
import { AuthLayout, authButton } from "@/components/rap/AuthLayout";
import { homeFor, safeRedirect } from "@/features/auth/destinations";

/** OAuth providers redirect here. The Supabase client parses the redirect and
 * establishes a session; this bridges it into the app's AuthContext. */
function Callback() {
  const { login } = useAuth();
  const router = useRouter();
  const redirect = safeRedirect(useSearchParams().get("redirect"));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let done = false;
    const finish = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (cancelled || done) return;
      if (sessionError || !data.session) return setError("Sign-in was cancelled or didn't complete. Choose another method or try again.");
      done = true;
      try {
        let user = await fetchBackendUser(data.session);
        user = await applyPendingRegistration(data.session, user);
        login(data.session.access_token, user, data.session.refresh_token);
        router.push(redirect || homeFor(user.role));
      } catch {
        setError("Signed in, but we couldn't load your account. Please try again.");
      }
    };
    // detectSessionInUrl parses on client init, which can race this effect —
    // the auth event is the reliable signal, getSession() covers the fast path.
    const { data: listener } = supabase.auth.onAuthStateChange((event) => { if (event === "SIGNED_IN") void finish(); });
    void finish();
    return () => { cancelled = true; listener.subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return error ? (
    <>
      <h1>Sign-in didn&apos;t finish</h1>
      <p role="alert" className="mt-3 text-slate-500">{error}</p>
      <Link href="/auth/login" className={authButton + " mt-6"}>Back to sign in</Link>
    </>
  ) : (
    <div className="flex flex-col items-center py-6 text-center" aria-live="polite">
      <div className="rap-spinner" />
      <h1 className="mt-5">Finishing sign-in…</h1>
      <p className="mt-2 text-slate-500">You&apos;ll be redirected in a moment.</p>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return <AuthLayout><Suspense><Callback /></Suspense></AuthLayout>;
}
