"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/client";

/** Load an admin endpoint; keeps the last good data while reloading. */
export function useLoad<T>(path: string | null) {
  const [state, setState] = useState<{ data?: T; total?: number | null; error?: string; loading: boolean }>({
    loading: !!path,
  });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    api<T>(path)
      .then((r) => live && setState({ data: r.data, total: r.total, loading: false }))
      .catch((e: unknown) => live && setState((s) => ({ ...s, loading: false, error: errText(e) })));
    return () => {
      live = false;
    };
  }, [path, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

export const errText = (e: unknown) =>
  e instanceof ApiError
    ? e.status === 403
      ? "Staff access required."
      : e.message
    : "Network error — is the API reachable?";

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function State({
  loading,
  error,
  empty,
  retry,
}: {
  loading?: boolean;
  error?: string;
  empty?: boolean;
  retry?: () => void;
}) {
  if (error)
    return (
      <div className="card error">
        {error}{" "}
        {retry && (
          <button className="btn" onClick={retry}>
            Retry
          </button>
        )}
      </div>
    );
  if (loading) return <p className="muted">Loading…</p>;
  if (empty) return <p className="muted">Nothing here.</p>;
  return null;
}

export const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

/**
 * Sensitive actions: a reason is required (it goes into the audit trail), and
 * destructive ones also need the target typed back.
 */
export function ReasonDialog({
  title,
  confirmWord,
  danger,
  onCancel,
  onConfirm,
}: {
  title: string;
  confirmWord?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const ok = reason.trim().length >= 3 && (!confirmWord || typed === confirmWord) && !busy;
  return (
    <div
      className="dialog"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
    >
      <div>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        <label>
          Reason (recorded in the audit log)
          <textarea
            className="input"
            style={{ width: "100%", height: 70 }}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            autoFocus
          />
        </label>
        {confirmWord && (
          <label style={{ display: "block", marginTop: 8 }}>
            Type <code>{confirmWord}</code> to confirm
            <input
              className="input"
              style={{ width: "100%" }}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </label>
        )}
        {err && <p className="error">{err}</p>}
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button
            className={`btn ${danger ? "danger" : "primary"}`}
            disabled={!ok}
            onClick={async () => {
              setBusy(true);
              setErr("");
              try {
                await onConfirm(reason.trim());
              } catch (e) {
                setErr(errText(e));
                setBusy(false);
              }
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
