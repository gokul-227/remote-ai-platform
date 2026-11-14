import { useState } from "react";
import api, { extractErrorMessage } from "@/lib/api";
import { useApi } from "./live";
import { Btn } from "./rap_kit";

type Member = { id: string; user_id: string; role: string; member?: { full_name?: string } };

export function GroupModeration({
  groupId,
  ownerId,
  onChange,
}: {
  groupId: string;
  ownerId: string;
  onChange: () => void;
}) {
  const [tab, setTab] = useState("Requests");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requests = tab === "Requests";
  const list = useApi<Member[]>(requests ? `/groups/${groupId}/membership-requests` : `/groups/${groupId}/members`, {
    page,
    page_size: 20,
    ...(requests ? {} : { member_status: tab === "Banned" ? "banned" : "active" }),
  });
  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      setError("");
      list.reload();
      onChange();
    } catch (e) {
      setError(extractErrorMessage(e, "Unable to update membership."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section aria-label="Group moderation" className="grid gap-3">
      <h2>Membership moderation</h2>
      <div className="flex gap-2">
        {["Requests", "Members", "Banned"].map((t) => (
          <button
            key={t}
            aria-pressed={tab === t}
            onClick={() => {
              setTab(t);
              setPage(1);
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {!!(error || list.error) && (
        <p role="alert">
          {error || "Unable to load memberships."} <button onClick={list.reload}>Retry</button>
        </p>
      )}
      {list.loading && <p>Loading memberships…</p>}
      {!list.loading && !list.error && !list.data?.length && <p>No {tab.toLowerCase()}.</p>}
      {!list.error &&
        list.data?.map((m) => (
          <div className="flex flex-wrap items-center gap-3 rounded border p-3" key={m.id}>
            <span>
              {m.member?.full_name || "Member"} · {m.role}
            </span>
            {m.user_id !== ownerId && (
              <>
                {requests ? (
                  <>
                    <Btn
                      sm
                      disabled={busy}
                      onClick={() =>
                        act(() => api.patch(`/groups/${groupId}/members/${m.user_id}/status`, { status: "active" }))
                      }
                    >
                      Approve
                    </Btn>
                    <Btn
                      sm
                      disabled={busy}
                      onClick={() => act(() => api.delete(`/groups/${groupId}/membership-requests/${m.user_id}`))}
                    >
                      Decline
                    </Btn>
                  </>
                ) : (
                  <>
                    {tab === "Members" && (
                      <select
                        aria-label={`Role for ${m.member?.full_name || "member"}`}
                        value={m.role}
                        disabled={busy}
                        onChange={(e) =>
                          act(() => api.patch(`/groups/${groupId}/members/${m.user_id}/role`, { role: e.target.value }))
                        }
                      >
                        {["member", "moderator", "admin"].map((role) => (
                          <option key={role}>{role}</option>
                        ))}
                      </select>
                    )}
                    <Btn
                      sm
                      disabled={busy}
                      onClick={() =>
                        act(() =>
                          api.patch(`/groups/${groupId}/members/${m.user_id}/status`, {
                            status: tab === "Banned" ? "active" : "banned",
                          }),
                        )
                      }
                    >
                      {tab === "Banned" ? "Restore as member" : "Ban"}
                    </Btn>
                  </>
                )}
              </>
            )}
          </div>
        ))}
      <div className="flex gap-2">
        <Btn sm disabled={page === 1 || busy} onClick={() => setPage(page - 1)}>
          Previous
        </Btn>
        <span>Page {page}</span>
        <Btn sm disabled={busy || (list.data?.length ?? 0) < 20} onClick={() => setPage(page + 1)}>
          Next
        </Btn>
      </div>
    </section>
  );
}
