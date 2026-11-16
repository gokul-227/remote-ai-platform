"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { State, errText, useLoad, when } from "./kit";

interface SlackIdentity {
  id: string;
  slack_user_id: string;
  slack_team_id: string;
  slack_username: string | null;
  created_at: string;
  last_used_at: string | null;
}

interface LinkCode {
  code: string;
  expires_at: string;
  command: string;
}

/** Link your Slack account to this staff account, for the /rap command. */
export function SlackLink() {
  const linked = useLoad<SlackIdentity[]>("/admin/slack/identities");
  const [code, setCode] = useState<LinkCode | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      setCode((await api<LinkCode>("/admin/slack/link-code", { method: "POST" })).data);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (id: string) => {
    setError("");
    try {
      await api(`/admin/slack/identities/${id}`, { method: "DELETE" });
      linked.reload();
    } catch (e) {
      setError(errText(e));
    }
  };

  return (
    <div className="card" aria-label="Slack">
      <h3 style={{ marginTop: 0 }}>Slack (/rap)</h3>
      <p className="muted">
        Run console actions from Slack with <code>/rap</code>. Generate a one-time code, then type the command it shows
        in any Slack channel. The code works once and expires in a few minutes.
      </p>
      <button className="btn" onClick={generate} disabled={busy}>
        {busy ? "Generating…" : "Generate link code"}
      </button>
      {code && (
        <p role="status">
          In Slack, run <code>{code.command}</code> (expires {when(code.expires_at)}).
        </p>
      )}
      {error && <div className="card error">{error}</div>}
      <State loading={linked.loading} error={linked.error} retry={linked.reload} />
      {linked.data && linked.data.length > 0 && (
        <table aria-label="Linked Slack accounts">
          <thead>
            <tr>
              <th>Slack user</th>
              <th>Linked</th>
              <th>Last used</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {linked.data.map((i) => (
              <tr key={i.id}>
                <td>{i.slack_username || i.slack_user_id}</td>
                <td>{when(i.created_at)}</td>
                <td>{when(i.last_used_at)}</td>
                <td>
                  <button className="btn" onClick={() => unlink(i.id)}>
                    Unlink
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {linked.data && linked.data.length === 0 && <p className="muted">No Slack account linked yet.</p>}
    </div>
  );
}
