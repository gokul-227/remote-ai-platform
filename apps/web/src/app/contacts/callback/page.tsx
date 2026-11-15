"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "@/lib/api";
import { CONTACTS_CALLBACK, ContactResults, type ImportResult } from "@/figma/GoogleContacts";

/** Google returns here after the contacts consent. The code goes straight to
 * the API, which reads the contacts once and discards Google's token; the
 * results stay in this page's memory only. */
export default function ContactsCallback() {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Drop the code from the address bar and history.
    window.history.replaceState(null, "", CONTACTS_CALLBACK);
    const code = params.get("code");
    const state = params.get("state");
    if (params.get("error") || !code || !state) {
      void Promise.resolve().then(() => setError("Google access wasn't granted. Nothing was read."));
      return;
    }
    api
      .post("/contacts/google/import", {
        code,
        state,
        redirect_uri: `${window.location.origin}${CONTACTS_CALLBACK}`,
      })
      .then((r) => setResult(r.data))
      .catch((e) => setError(extractErrorMessage(e, "We couldn't read your Google contacts. Please try again.")));
  }, []);
  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-[#F5F8FC] px-4 py-10 text-[#1F2937]">
      <h1 className="text-2xl font-bold">People you know from Google</h1>
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        {error ? (
          <p role="alert">{error}</p>
        ) : result ? (
          <ContactResults result={result} />
        ) : (
          <p>Reading your contacts…</p>
        )}
      </div>
      <Link href="/#network" className="mt-6 inline-block font-semibold text-[#175CD3] underline">
        Back to My network
      </Link>
    </main>
  );
}
