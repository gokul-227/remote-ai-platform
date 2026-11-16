"use client";

import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatPrice } from "@/lib/billing";
import { safeHref, useApi } from "./live";
import { Btn, inputCls } from "./rap_kit";
import { UpgradeLink } from "./rap_billing";

/** Composer note: an employer's first message to a non-connection uses a messaging credit. */
export function MessageCreditNote({
  participants,
  conversationId,
  refresh,
}: {
  participants: [string, string];
  conversationId: string;
  refresh?: number;
}) {
  const { user } = useAuth();
  const recipient = participants[0] === user?.id ? participants[1] : participants[0];
  const q = useApi<{ required: boolean; available: number | null }>(
    user
      ? `/billing/messages/quote?recipient_id=${recipient}&conversation_id=${conversationId}&r=${refresh ?? 0}`
      : null,
  );
  if (!q.data?.required) return null;
  const left = q.data.available ?? 0;
  return (
    <p className="px-5 pt-2 text-xs text-slate-600" data-testid="message-credit-note">
      You&apos;re not connected with this candidate, so your first message uses 1 messaging credit ({left} left). It
      comes back if they don&apos;t reply within 14 days.{" "}
      {left === 0 && <UpgradeLink text="Get messaging credits" plan="messaging_pack_10" />}
    </p>
  );
}

/** Team seats used and included; shown next to the invite form. */
export function SeatsNote({ orgId }: { orgId: string }) {
  const q = useApi<{ enforced: boolean; used: number; included: number; available: number }>(
    `/organisations/${orgId}/seats`,
  );
  if (!q.data?.enforced) return null;
  return (
    <p className="mt-2 text-xs text-slate-600" data-testid="seats-note">
      Team seats: {q.data.used} of {q.data.included} used.{" "}
      {q.data.available === 0 && <UpgradeLink text="Add a seat" plan="extra_seat" />}
    </p>
  );
}

const SHARE_BASE = typeof window !== "undefined" ? window.location.origin : "";

/** Settings > Billing: enter a friend's referral code, and share your own link. */
export function ReferralBox({ code, creditCents }: { code: string; creditCents: number }) {
  const initial =
    typeof window !== "undefined" ? new URLSearchParams(window.location.hash.split("?")[1] || "").get("ref") || "" : "";
  const [entry, setEntry] = useState(initial);
  const [msg, setMsg] = useState("");
  const link = `${SHARE_BASE}/#billing?ref=${encodeURIComponent(code)}`;
  const claim = async () => {
    setMsg("");
    try {
      await api.post("/billing/referral/claim", { code: entry.trim() });
      setMsg("Code saved. You both get the credit after your first payment.");
    } catch (e) {
      setMsg(extractErrorMessage(e, "That code didn't work."));
    }
  };
  return (
    <section>
      <h3 className="font-semibold">Refer a friend</h3>
      <p className="mt-1 text-sm text-slate-600">
        When a friend makes their first payment you both get {formatPrice(creditCents)} of credit towards future
        payments. Your code: <b>{code}</b>
      </p>
      <p className="mt-1 break-all text-sm">
        Share link: <span data-testid="share-link">{link}</span>{" "}
        <button
          type="button"
          className="text-brand underline"
          onClick={() => void navigator.clipboard?.writeText(link).then(() => setMsg("Link copied."))}
        >
          Copy
        </button>
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="text-sm">
          Have a code?
          <input
            aria-label="Referral code"
            className={inputCls + " ml-2 w-40"}
            value={entry}
            maxLength={16}
            onChange={(e) => setEntry(e.target.value)}
          />
        </label>
        <Btn sm v="line" disabled={entry.trim().length < 4} onClick={claim}>
          Apply code
        </Btn>
      </div>
      {msg && (
        <p role="status" className="mt-1 text-sm text-slate-600">
          {msg}
        </p>
      )}
    </section>
  );
}

type Testimonial = { id: string; author_name: string; author_title: string | null; quote: string; sort_order: number };
type Branding = { enabled: boolean; cover_video_url: string | null; testimonials: Testimonial[] };

/** Employer branding editor (Settings > Billing, while entitled). */
export function BrandingEditor() {
  const q = useApi<Branding>("/billing/branding/me");
  const [video, setVideo] = useState<string | null>(null);
  const [form, setForm] = useState({ author_name: "", author_title: "", quote: "" });
  const [msg, setMsg] = useState("");
  if (!q.data?.enabled) return null;
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg("");
    try {
      await fn();
      setMsg(ok);
      q.reload();
    } catch (e) {
      setMsg(extractErrorMessage(e, "That didn't work."));
    }
  };
  return (
    <section data-testid="branding-editor">
      <h3 className="font-semibold">Employer branding</h3>
      <label className="mt-2 block text-sm">
        Cover video link (https)
        <input
          aria-label="Cover video link"
          className={inputCls + " mt-1"}
          value={video ?? q.data.cover_video_url ?? ""}
          onChange={(e) => setVideo(e.target.value)}
          placeholder="https://"
        />
      </label>
      <Btn
        sm
        c="mt-2"
        onClick={() =>
          act(
            () => api.put("/billing/branding/me", { cover_video_url: (video ?? "").trim() || null }),
            "Cover video saved.",
          )
        }
      >
        Save video
      </Btn>
      <h4 className="mt-4 text-sm font-semibold">Testimonials</h4>
      <ul className="mt-1 space-y-1 text-sm">
        {q.data.testimonials.map((t) => (
          <li key={t.id} className="flex items-start justify-between gap-2">
            <span>
              “{t.quote}” — {t.author_name}
              {t.author_title ? `, ${t.author_title}` : ""}
            </span>
            <button
              type="button"
              className="text-red-700 underline"
              onClick={() => act(() => api.delete(`/billing/branding/me/testimonials/${t.id}`), "Removed.")}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <input
          aria-label="Name"
          className={inputCls}
          placeholder="Name"
          value={form.author_name}
          onChange={(e) => setForm({ ...form, author_name: e.target.value })}
        />
        <input
          aria-label="Title"
          className={inputCls}
          placeholder="Title (optional)"
          value={form.author_title}
          onChange={(e) => setForm({ ...form, author_title: e.target.value })}
        />
        <textarea
          aria-label="Quote"
          className={inputCls + " sm:col-span-2"}
          placeholder="Quote"
          value={form.quote}
          onChange={(e) => setForm({ ...form, quote: e.target.value })}
        />
      </div>
      <Btn
        sm
        c="mt-2"
        disabled={!form.author_name.trim() || !form.quote.trim()}
        onClick={() =>
          act(async () => {
            await api.post("/billing/branding/me/testimonials", {
              author_name: form.author_name.trim(),
              author_title: form.author_title.trim() || null,
              quote: form.quote.trim(),
            });
            setForm({ author_name: "", author_title: "", quote: "" });
          }, "Testimonial added.")
        }
      >
        Add testimonial
      </Btn>
      {msg && (
        <p role="status" className="mt-1 text-sm text-slate-600">
          {msg}
        </p>
      )}
    </section>
  );
}

/** On the company page: cover video link and testimonials, only while the company is entitled. */
export function CompanyBranding({ companyId }: { companyId: string }) {
  const q = useApi<Branding>(`/billing/branding/${companyId}`);
  if (!q.data?.enabled) return null;
  const video = safeHref(q.data.cover_video_url);
  return (
    <section className="mt-4" data-testid="company-branding">
      {video && (
        <a className="text-brand underline" href={video} target="_blank" rel="noopener noreferrer">
          Watch our company video
        </a>
      )}
      {q.data.testimonials.length > 0 && (
        <ul className="mt-3 space-y-2">
          {q.data.testimonials.map((t) => (
            <li key={t.id} className="rounded-lg border border-slate-200 p-3 text-sm">
              <p>“{t.quote}”</p>
              <p className="mt-1 text-slate-500">
                {t.author_name}
                {t.author_title ? `, ${t.author_title}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const BANNER_KEY = "rap.openToOpportunities.asked";

/** One-time invitation to opt in to being found by employers (the default is now off). */
export function OpenToOpportunitiesBanner({ open, onOptIn }: { open: boolean; onOptIn: () => Promise<void> }) {
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHidden(open || (typeof localStorage !== "undefined" && localStorage.getItem(BANNER_KEY) === "1"));
  }, [open]);
  if (hidden) return null;
  const close = () => {
    localStorage.setItem(BANNER_KEY, "1");
    setHidden(true);
  };
  return (
    <div
      role="region"
      aria-label="Open to opportunities"
      className="mb-4 rounded-xl border border-brand bg-brand-soft p-4"
    >
      <p className="font-semibold">Want employers to find you?</p>
      <p className="mt-1 text-sm text-slate-700">
        Being open to opportunities is now something you choose. Turn it on to appear in employers&apos; candidate
        search and job matches. You can turn it off at any time.
      </p>
      <div className="mt-3 flex gap-2">
        <Btn
          sm
          onClick={async () => {
            await onOptIn();
            close();
          }}
        >
          Turn on
        </Btn>
        <Btn sm v="line" onClick={close}>
          Not now
        </Btn>
      </div>
    </div>
  );
}
