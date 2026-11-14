import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "@/lib/api";
import { useApi } from "./live";
import { Btn } from "./rap_kit";

export function PrivateGroupAccess({ groupId, onApproved }: { groupId: string; onApproved: () => void }) {
  const membership = useApi<{ status: string | null }>(`/groups/${groupId}/membership`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { reload } = membership;
  const status = membership.data?.status;
  useEffect(() => {
    if (status === "active") onApproved();
    if (status !== "pending") return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [status, onApproved, reload]);
  async function act(action: "join" | "leave") {
    setBusy(true);
    try {
      await api.post(`/groups/${groupId}/${action}`);
      setError("");
      reload();
    } catch (e) {
      setError(extractErrorMessage(e, "Unable to update your request."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mt-4 grid justify-items-center gap-3" aria-label="Private group access">
      <h2>Private group</h2>
      {error && <p role="alert">{error}</p>}
      {!!membership.error ? (
        <p role="alert">
          Unable to load your membership. <button onClick={reload}>Retry</button>
        </p>
      ) : membership.loading ? (
        <p>Checking membership…</p>
      ) : status === "pending" ? (
        <>
          <p>Your request is pending administrator approval. Posts and members remain private.</p>
          <Btn disabled={busy} onClick={() => act("leave")}>
            Cancel request
          </Btn>
          <button onClick={reload}>Check approval</button>
        </>
      ) : status === "banned" ? (
        <p>Your access to this group is restricted.</p>
      ) : status === "active" ? (
        <p>Opening group…</p>
      ) : (
        <>
          <p>Request membership to view this group.</p>
          <Btn disabled={busy} onClick={() => act("join")}>
            Request to join
          </Btn>
        </>
      )}
    </section>
  );
}
