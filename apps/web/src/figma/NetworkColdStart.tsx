import { BRAND } from "@/lib/brand";
import { useState } from "react";
import { Av, Btn, Card, Tag } from "./rap_kit";
import api, { extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi, goRoute } from "./live";

const INVITE_KEY = "rap-invite-token";

type Suggestion = {
  id: string;
  full_name: string;
  headline?: string | null;
  engineer_profile_id?: string | null;
  reasons: string[];
};

/** Suggestions from on-platform signals only (shared organisation, public
 * groups, shared skills on public profiles). No contact uploads. */
export function PeopleYouMayKnow({ onNotice }: { onNotice: (m: string) => void }) {
  const { user } = useAuth();
  const list = useApi<Suggestion[]>(user ? "/connections/suggestions" : null, { limit: 8 });
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const connect = async (id: string) => {
    try {
      await api.post("/connections", { receiver_id: id });
      setSent((s) => ({ ...s, [id]: true }));
      onNotice("Connection request sent");
    } catch (e) {
      onNotice(extractErrorMessage(e, "Couldn't send that request."));
    }
  };
  const people = list.data ?? [];
  return (
    <Card c="rounded-lg" p={false}>
      <p className="p-4 font-bold">People you may know</p>
      {list.loading && !list.data && <p className="border-t border-slate-100 p-4 text-sm text-slate-500">Loading…</p>}
      {people.map((p) => (
        <div key={p.id} className="flex items-center gap-3 border-t border-slate-100 p-4">
          <Av name={p.full_name} s={48} />
          <div className="min-w-0 flex-1">
            <button
              className="font-bold hover:underline"
              onClick={() => p.engineer_profile_id && goRoute(`engineer/${encodeURIComponent(p.engineer_profile_id)}`)}
            >
              {p.full_name}
            </button>
            {p.headline && <p className="truncate text-sm text-slate-500">{p.headline}</p>}
            <div className="mt-1 flex flex-wrap gap-1">
              {p.reasons.map((r) => (
                <Tag key={r} v="gray">
                  {r}
                </Tag>
              ))}
            </div>
          </div>
          <Btn v={sent[p.id] ? "gray" : "outline"} sm onClick={() => !sent[p.id] && connect(p.id)}>
            {sent[p.id] ? "Requested" : "Connect"}
          </Btn>
        </div>
      ))}
      {!list.loading && !people.length && (
        <div className="border-t border-slate-100 p-4 text-sm text-slate-500">
          <p>
            Suggestions come from what you share here: your organisation, the public groups you join and the skills on
            your profile. Add skills or join a community to see people with the same interests.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn v="outline" sm onClick={() => goRoute("groups")}>
              Find a community
            </Btn>
            <Btn v="outline" sm onClick={() => goRoute("companies")}>
              Browse companies
            </Btn>
            <Btn v="outline" sm onClick={() => goRoute("profile")}>
              Add skills
            </Btn>
          </div>
        </div>
      )}
    </Card>
  );
}

/** A personal invite link the member shares themselves (copy, or their own
 * email app). Emailing invitations is a separate, opt-in flow (GoogleContacts). */
export function InviteLink({ onNotice }: { onNotice: (m: string) => void }) {
  const [link, setLink] = useState("");
  const create = async () => {
    try {
      const r = await api.post("/invites");
      const url = `${window.location.origin}/#network?invite=${encodeURIComponent(r.data.token)}`;
      setLink(url);
      try {
        await navigator.clipboard.writeText(url);
        onNotice("Invite link copied. It works for 30 days.");
      } catch {
        onNotice("Invite link ready. It works for 30 days.");
      }
    } catch (e) {
      onNotice(extractErrorMessage(e, "Couldn't create an invite link."));
    }
  };
  const mail = link
    ? `mailto:?subject=${encodeURIComponent("Join me on Remote AI Platform")}&body=${encodeURIComponent(
        `I'm using Remote AI Platform for remote work. Join and connect with me: ${link}`,
      )}`
    : undefined;
  return (
    <div style={{ background: BRAND.blue }} className="rounded-lg p-4">
      <p className="font-black text-white">Invite people you work with</p>
      <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.85)" }}>
        Create a personal link. Anyone who joins with it sends you a connection request.
      </p>
      <Btn v="gray" sm c="mt-3" onClick={create}>
        Create invite link
      </Btn>
      {link && (
        <div className="mt-3 space-y-2">
          <input
            readOnly
            aria-label="Your invite link"
            value={link}
            className="w-full rounded bg-white px-2 py-1 text-xs"
            onFocus={(e) => e.currentTarget.select()}
          />
          <a href={mail} className="text-sm font-semibold text-white underline">
            Send it from your email app
          </a>
        </div>
      )}
    </div>
  );
}

function readInviteToken(): string | null {
  const q = (window.location.hash.split("?")[1] || "").trim();
  const fromHash = new URLSearchParams(q).get("invite");
  try {
    if (fromHash) localStorage.setItem(INVITE_KEY, fromHash);
    return fromHash || localStorage.getItem(INVITE_KEY);
  } catch {
    return fromHash;
  }
}

/** Shown when someone opens an invite link: who invited them, and a button to
 * send that person a connection request (sign-in first if needed). */
export function InviteBanner({ onNotice }: { onNotice: (m: string) => void }) {
  const { user } = useAuth();
  const [token, setToken] = useState<string | null>(readInviteToken);
  const info = useApi<{ inviter: { full_name?: string; headline?: string } }>(
    token ? `/invites/resolve/${encodeURIComponent(token)}` : null,
  );
  const clear = () => {
    try {
      localStorage.removeItem(INVITE_KEY);
    } catch {}
    setToken(null);
  };
  if (!token || (!info.data && !info.error)) return null;
  if (info.error) {
    return (
      <Card c="rounded-lg">
        <p className="text-sm text-slate-500">This invite link is no longer valid.</p>
        <Btn v="ghost" sm onClick={clear}>
          Dismiss
        </Btn>
      </Card>
    );
  }
  const name = info.data?.inviter.full_name || "A member";
  const accept = async () => {
    if (!user) {
      goRoute("login");
      return;
    }
    try {
      await api.post(`/invites/accept/${encodeURIComponent(token)}`);
      onNotice(`Connection request sent to ${name}`);
      clear();
    } catch (e) {
      onNotice(extractErrorMessage(e, "Couldn't use that invite."));
    }
  };
  return (
    <Card c="rounded-lg">
      <p className="font-bold">{name} invited you to connect</p>
      {info.data?.inviter.headline && <p className="text-sm text-slate-500">{info.data.inviter.headline}</p>}
      <div className="mt-3 flex gap-2">
        <Btn v="primary" sm onClick={accept}>
          {user ? "Send connection request" : "Sign in to connect"}
        </Btn>
        <Btn v="ghost" sm onClick={clear}>
          Not now
        </Btn>
      </div>
    </Card>
  );
}
