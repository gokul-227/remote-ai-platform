"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { takeReturnTo } from "@/figma/live";
import { supabase, fetchBackendUser, applyPendingRegistration } from "@/lib/supabase";
import * as workos from "@/lib/workos";

const homeFor = (role?: string) => (role === "COMPANY" ? "codash" : role === "ADMIN" ? "admin" : "feed");

/** OAuth providers redirect here (tokens arrive in the URL, which would clash
 * with the Figma app's hash routing). Establish the session, then hand off
 * to the Figma app. */
export default function OAuthCallback() {
  const { login } = useAuth();
  const [error, setError] = useState("");

  useEffect(() => {
    let done = false;
    if (workos.WORKOS_ENABLED) {
      done = true;
      let token: string | null = null;
      void (async () => {
        try {
          const session = await workos.completeOAuth(window.location.search);
          if (!session)
            throw new workos.WorkOSAuthError(
              400,
              "Sign-in was cancelled or didn't complete. Choose another method or try again.",
            );
          token = session.access_token;
          let user = await fetchBackendUser(session);
          user = await applyPendingRegistration(session, user);
          login(session.access_token, user, session.refresh_token);
          window.location.replace(`/#${takeReturnTo(homeFor(user.role))}`);
        } catch (e) {
          // The app refused this sign-in: end the WorkOS session and say why.
          await workos.signOut(token);
          setError(extractErrorMessage(e, "Signed in, but we couldn't load your account. Please try again."));
        }
      })();
      return;
    }
    const finish = async () => {
      const { data } = await supabase.auth.getSession();
      if (done || !data.session) return;
      done = true;
      try {
        let user = await fetchBackendUser(data.session);
        user = await applyPendingRegistration(data.session, user);
        login(data.session.access_token, user, data.session.refresh_token);
        window.location.replace(`/#${takeReturnTo(homeFor(user.role))}`);
      } catch (e) {
        // The app refused this sign-in (e.g. the email belongs to an account
        // that uses another method): end the Supabase session and say why.
        await supabase.auth.signOut({ scope: "local" }).catch(() => {});
        setError(extractErrorMessage(e, "Signed in, but we couldn't load your account. Please try again."));
      }
    };
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") void finish();
    });
    void finish();
    const timeout = setTimeout(() => {
      if (!done) setError("Sign-in was cancelled or didn't complete. Choose another method or try again.");
    }, 10000);
    return () => {
      done = true;
      clearTimeout(timeout);
      listener.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F0F2F5] p-6 text-center text-[#1c1e21]">
      {error ? (
        <div className="max-w-sm rounded-xl border border-slate-200 bg-white p-7">
          <h1 className="text-xl font-bold">Sign-in didn&apos;t finish</h1>
          <p role="alert" className="mt-3 text-slate-500">
            {error}
          </p>
          <Link
            href="/#login"
            className="mt-6 flex min-h-11 items-center justify-center rounded-lg bg-[#175CD3] font-semibold text-white"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <p aria-live="polite" className="text-slate-500">
          Finishing sign-in…
        </p>
      )}
    </div>
  );
}
