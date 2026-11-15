"use client";

import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "@/lib/api";

/**
 * Opt-in "Find people you know from Google" (feature flag contacts_import).
 * Google asks the member for read-only contacts access; the API reads email
 * addresses and names once, matches them and discards the token. Nothing here
 * is saved: the list lives only in this page's memory.
 */

export type ContactMatch = {
  id: string;
  full_name: string;
  headline?: string | null;
  engineer_profile_id?: string | null;
  connection_status?: string | null;
};
export type Invitable = { email: string; name?: string | null; token: string; invited: boolean };
export type ImportResult = { matches: ContactMatch[]; invitable: Invitable[]; remaining_today: number };

export const CONTACTS_CALLBACK = "/contacts/callback";

/** The button on the network page. Hidden unless the feature is switched on. */
export function FindGoogleContacts({ onNotice }: { onNotice: (m: string) => void }) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let live = true;
    api
      .get("/contacts/google/status")
      .then((r) => live && setEnabled(Boolean(r.data?.enabled)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (!enabled) return null;
  const start = async () => {
    try {
      const r = await api.post("/contacts/google/authorize", {
        redirect_uri: `${window.location.origin}${CONTACTS_CALLBACK}`,
      });
      window.location.assign(r.data.url);
    } catch (e) {
      onNotice(extractErrorMessage(e, "Google contacts aren't available right now."));
    }
  };
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="font-bold">Find people you know from Google</p>
      <p className="mt-1 text-sm text-slate-600">
        Optional. We read only names and email addresses once, show who is already here, and keep nothing. You choose
        who gets an invitation.
      </p>
      <button
        type="button"
        onClick={start}
        className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover"
      >
        Find people you know from Google
      </button>
    </div>
  );
}

/** Results after Google sends the member back: matches to connect with, contacts to invite. */
export function ContactResults({ result }: { result: ImportResult }) {
  const [requested, setRequested] = useState<Record<string, boolean>>({});
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [remaining, setRemaining] = useState(result.remaining_today);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [invitedNow, setInvitedNow] = useState<Record<string, boolean>>({});
  const chosen = result.invitable.filter((c) => picked[c.email]);
  const connect = async (id: string) => {
    try {
      await api.post("/connections", { receiver_id: id });
      setRequested((s) => ({ ...s, [id]: true }));
    } catch (e) {
      setMessage(extractErrorMessage(e, "Couldn't send that request."));
    }
  };
  const invite = async () => {
    setBusy(true);
    setMessage("");
    try {
      const r = await api.post("/contacts/invites", {
        contacts: chosen.map((c) => ({ email: c.email, name: c.name ?? null, token: c.token })),
      });
      setRemaining(r.data.remaining_today);
      setPicked({});
      setInvitedNow((s) => ({ ...s, ...Object.fromEntries(chosen.map((c) => [c.email, true])) }));
      setMessage(`Invitations sent: ${r.data.invited}.`);
    } catch (e) {
      setMessage(extractErrorMessage(e, "Couldn't send those invitations."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-6 text-left">
      <section aria-labelledby="matches-h">
        <h2 id="matches-h" className="text-lg font-bold">
          Already on Remote AI Platform
        </h2>
        {result.matches.length === 0 && <p className="text-sm text-slate-500">None of your contacts are here yet.</p>}
        <ul className="mt-2 divide-y divide-slate-100">
          {result.matches.map((m) => {
            const state = requested[m.id] ? "PENDING" : m.connection_status;
            return (
              <li key={m.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{m.full_name}</p>
                  {m.headline && <p className="truncate text-sm text-slate-500">{m.headline}</p>}
                </div>
                <button
                  type="button"
                  disabled={Boolean(state)}
                  onClick={() => connect(m.id)}
                  className="rounded-full border border-brand px-4 py-1 text-sm font-semibold text-brand disabled:border-slate-300 disabled:text-slate-500"
                >
                  {state === "ACCEPTED" ? "Connected" : state ? "Requested" : "Connect"}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      <section aria-labelledby="invite-h">
        <h2 id="invite-h" className="text-lg font-bold">
          Invite contacts
        </h2>
        <p className="text-sm text-slate-500">
          Only the people you tick get one email from us, with a link to stop further invitations. You can send{" "}
          {remaining} more today.
        </p>
        <ul className="mt-2 max-h-96 divide-y divide-slate-100 overflow-auto">
          {result.invitable.map((c) => (
            <li key={c.email} className="py-2">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  disabled={c.invited || invitedNow[c.email]}
                  checked={Boolean(picked[c.email])}
                  onChange={(e) => setPicked((s) => ({ ...s, [c.email]: e.target.checked }))}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{c.name || c.email}</span>
                  {c.name && <span className="block truncate text-sm text-slate-500">{c.email}</span>}
                </span>
                {(c.invited || invitedNow[c.email]) && <span className="text-xs text-slate-500">Invited</span>}
              </label>
            </li>
          ))}
        </ul>
        <button
          type="button"
          disabled={busy || chosen.length === 0 || chosen.length > remaining}
          onClick={invite}
          className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Invite {chosen.length || ""} selected
        </button>
        <p role="status" className="mt-2 text-sm">
          {message}
        </p>
      </section>
    </div>
  );
}
