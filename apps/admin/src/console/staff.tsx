"use client";

import { useState } from "react";
import { api } from "@/lib/client";
import { ReasonDialog, Section, State, errText, useLoad, when } from "./kit";

/* Staff roles and feature flags. The API decides every permission; this page
   only shows what the caller may do and sends changes with a reason. */

const ROLE_INFO: Record<string, string> = {
  super_admin: "Everything, including staff roles",
  ops_admin: "Everything except staff roles",
  support: "Support desk; read users",
  moderator: "Moderation and verification",
  eng_operator: "Health, jobs, incidents, imports, usage",
  auditor: "Read-only everywhere",
};

type StaffRow = {
  user_id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  roles: string[];
  implicit: boolean;
};
type Perms = { roles: string[]; implicit_super_admin: boolean };

export function StaffRoles({ writable, meId }: { writable: boolean; meId: string }) {
  const perms = useLoad<Perms>("/admin/me/permissions");
  const isSuper = !!perms.data?.roles.includes("super_admin");
  const list = useLoad<StaffRow[]>(isSuper ? "/admin/staff-roles" : null);
  const [editing, setEditing] = useState<StaffRow | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState("");

  return (
    <Section title="Staff & roles">
      <State loading={perms.loading && !perms.data} error={perms.error} retry={perms.reload} />
      {perms.data && (
        <p className="muted">
          Your roles: <b>{perms.data.roles.join(", ")}</b>
          {perms.data.implicit_super_admin && " (no roles assigned yet, so full access)"}.
        </p>
      )}
      {perms.data && !isSuper && <p className="card">Only a super administrator can view and change staff roles.</p>}
      {isSuper && (
        <>
          <State
            loading={list.loading && !list.data}
            error={list.error}
            empty={list.data?.length === 0}
            retry={list.reload}
          />
          {!!list.data?.length && (
            <div className="card">
              <table>
                <thead>
                  <tr>
                    <th>Staff member</th>
                    <th>Roles</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.map((s) => (
                    <tr key={s.user_id}>
                      <td>
                        {s.full_name}
                        <div className="muted">
                          {s.email}
                          {!s.is_active && " · suspended"}
                        </div>
                      </td>
                      <td>
                        {s.roles.map((r) => (
                          <span key={r} className="pill" title={ROLE_INFO[r]} style={{ marginRight: 4 }}>
                            {r.replace("_", " ")}
                          </span>
                        ))}
                        {s.implicit && <div className="muted">default: full access</div>}
                      </td>
                      <td>
                        <button
                          className="btn"
                          disabled={!writable}
                          onClick={() => {
                            setEditing(s);
                            setDraft(s.implicit ? [] : s.roles);
                            setErr("");
                          }}
                        >
                          Change roles
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="muted">
                Staff roles can only be given to accounts that already have staff access. New staff are made staff by
                the owner, never by sign-up.
              </p>
            </div>
          )}
        </>
      )}
      {editing && !confirm && (
        <div className="dialog" role="dialog" aria-modal="true" aria-label={`Roles for ${editing.email}`}>
          <div className="card">
            <h3>Roles for {editing.full_name}</h3>
            {Object.entries(ROLE_INFO).map(([role, info]) => (
              <label key={role} className="row" style={{ marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={draft.includes(role)}
                  disabled={editing.user_id === meId && role === "super_admin"}
                  onChange={(e) => setDraft((d) => (e.target.checked ? [...d, role] : d.filter((x) => x !== role)))}
                />
                <b>{role.replace("_", " ")}</b> <span className="muted">— {info}</span>
              </label>
            ))}
            {err && <p role="alert">{err}</p>}
            <div className="row">
              <button className="btn" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="btn primary" disabled={!draft.length} onClick={() => setConfirm(true)}>
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
      {editing && confirm && (
        <ReasonDialog
          title={`Set roles for ${editing.email} to ${draft.join(", ")}`}
          onCancel={() => setConfirm(false)}
          onConfirm={async (reason) => {
            try {
              await api(`/admin/staff-roles/${editing.user_id}`, { method: "PUT", json: { roles: draft, reason } });
              setEditing(null);
              setConfirm(false);
              list.reload();
            } catch (e) {
              setErr(errText(e));
              setConfirm(false);
              throw e;
            }
          }}
        />
      )}
    </Section>
  );
}

type Flag = {
  name: string;
  env_default: boolean;
  override: boolean | null;
  effective: boolean;
  reason: string | null;
  updated_at: string | null;
};

export function FeatureFlags({ writable }: { writable: boolean }) {
  const q = useLoad<Flag[]>("/admin/feature-flags/state");
  const perms = useLoad<Perms>("/admin/me/permissions");
  const canChange = writable && !!perms.data?.roles.some((r) => r === "super_admin" || r === "ops_admin");
  const [pending, setPending] = useState<{ flag: Flag; value: boolean | null } | null>(null);
  const [err, setErr] = useState("");
  return (
    <Section title="Feature flags">
      <p className="muted">
        The deployment&apos;s environment sets each default. An override here applies to every API instance within a
        minute and is recorded in the audit log with its reason.
      </p>
      {err && <p role="alert">{err}</p>}
      <State loading={q.loading && !q.data} error={q.error} retry={q.reload} />
      {!!q.data?.length && (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Flag</th>
                <th>Effective</th>
                <th>Default</th>
                <th>Override</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((f) => (
                <tr key={f.name}>
                  <td>
                    <code>{f.name}</code>
                  </td>
                  <td>
                    <span className={`pill ${f.effective ? "green" : ""}`}>{f.effective ? "on" : "off"}</span>
                  </td>
                  <td className="muted">{f.env_default ? "on" : "off"}</td>
                  <td className="muted">
                    {f.override === null ? "—" : f.override ? "on" : "off"}
                    {f.reason && (
                      <div>
                        “{f.reason}” · {when(f.updated_at)}
                      </div>
                    )}
                  </td>
                  <td className="row">
                    <button
                      className="btn"
                      disabled={!canChange}
                      onClick={() => setPending({ flag: f, value: !f.effective })}
                    >
                      Turn {f.effective ? "off" : "on"}
                    </button>
                    {f.override !== null && (
                      <button
                        className="btn"
                        disabled={!canChange}
                        onClick={() => setPending({ flag: f, value: null })}
                      >
                        Use default
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!canChange && <p className="muted">Only operations or super administrators can change flags.</p>}
        </div>
      )}
      {pending && (
        <ReasonDialog
          title={
            pending.value === null
              ? `Return ${pending.flag.name} to its default`
              : `Turn ${pending.flag.name} ${pending.value ? "on" : "off"}`
          }
          onCancel={() => setPending(null)}
          onConfirm={async (reason) => {
            setErr("");
            try {
              await api(`/admin/feature-flags/${pending.flag.name}`, {
                method: "PUT",
                json: { enabled: pending.value, reason },
              });
              setPending(null);
              q.reload();
            } catch (e) {
              setErr(errText(e));
              setPending(null);
              throw e;
            }
          }}
        />
      )}
    </Section>
  );
}
