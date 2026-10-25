"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { api, publicGet, supabase } from "@/lib/client";
import { CONSOLE_ENV, envLabel, envMatches } from "@/lib/env";
import { errText } from "./kit";
import {
  Audit,
  AiUsage,
  Flags,
  Integrations,
  JobSources,
  Jobs,
  Moderation,
  Organisations,
  Overview,
  People,
  Support,
  Verifications,
} from "./modules";

interface Me {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
}
interface Version {
  environment: string;
  git_sha: string;
  version: string;
}

const MODULES = [
  ["overview", "Overview"],
  ["support", "Support tickets"],
  ["people", "People & access"],
  ["moderation", "Content reports"],
  ["jobs", "Job moderation"],
  ["verifications", "Verifications"],
  ["orgs", "Organisations"],
  ["audit", "Audit log"],
  ["ai", "AI usage & quota"],
  ["flags", "Feature flags"],
  ["sources", "Job sources"],
  ["integrations", "Integrations"],
] as const;
type ModuleKey = (typeof MODULES)[number][0];

export default function Console() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [me, setMe] = useState<Me | null>(null);
  const [meErr, setMeErr] = useState("");
  const [version, setVersion] = useState<Version | null>(null);
  const [mod, setMod] = useState<ModuleKey>("overview");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    publicGet<Version>("/health/version")
      .then(setVersion)
      .catch(() => setVersion(null));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setMe(null);
      return;
    }
    api<Me>("/auth/me")
      .then((r) => setMe(r.data))
      .catch((e) => setMeErr(errText(e)));
  }, [session]);

  const writable = envMatches(version?.environment);
  const envClass = version && !writable ? "mismatch" : envLabel(CONSOLE_ENV)?.toLowerCase();

  if (session === undefined) return <p style={{ padding: 24 }}>Loading…</p>;
  if (!session) return <SignIn />;
  if (meErr) return <Blocked text={meErr} />;
  if (!me) return <p style={{ padding: 24 }}>Checking access…</p>;
  // Display gate only; every admin endpoint enforces the ADMIN role itself.
  if (me.role !== "ADMIN") return <Blocked text="This account does not have staff access." />;

  return (
    <div className="shell">
      <nav className="side" aria-label="Console sections">
        <h1>Staff console</h1>
        {MODULES.map(([k, label]) => (
          <button key={k} aria-current={mod === k ? "page" : undefined} onClick={() => setMod(k)}>
            {label}
          </button>
        ))}
        <button onClick={() => supabase.auth.signOut()}>Sign out</button>
      </nav>
      <main className="main">
        <div className={`envbar ${envClass}`}>
          {version && !writable
            ? `Environment mismatch: this ${envLabel(CONSOLE_ENV)} console is pointed at a ${version.environment} API. Changes are disabled.`
            : `${envLabel(CONSOLE_ENV)} · API ${version?.version ?? "?"} (${version?.git_sha?.slice(0, 7) ?? "unknown"}) · signed in as ${me.email}`}
        </div>
        {mod === "overview" && <Overview version={version} />}
        {mod === "support" && <Support writable={writable} meId={me.id} />}
        {mod === "people" && <People writable={writable} meId={me.id} />}
        {mod === "moderation" && <Moderation writable={writable} />}
        {mod === "jobs" && <Jobs writable={writable} />}
        {mod === "verifications" && <Verifications writable={writable} />}
        {mod === "orgs" && <Organisations />}
        {mod === "audit" && <Audit />}
        {mod === "ai" && <AiUsage />}
        {mod === "flags" && <Flags />}
        {mod === "sources" && <JobSources />}
        {mod === "integrations" && <Integrations />}
      </main>
    </div>
  );
}

function Blocked({ text }: { text: string }) {
  return (
    <div style={{ maxWidth: 420, margin: "80px auto" }} className="card">
      <h2>Access denied</h2>
      <p>{text}</p>
      <button className="btn" onClick={() => supabase.auth.signOut()}>
        Sign out
      </button>
    </div>
  );
}

function SignIn() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const send = async () => {
    setErr("");
    // Existing accounts only: the staff console never creates users.
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) setErr(error.message);
    else setSent(true);
  };
  const verify = async () => {
    setErr("");
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
    if (error) setErr(error.message);
  };
  return (
    <div style={{ maxWidth: 380, margin: "80px auto" }} className="card">
      <h2 style={{ marginTop: 0 }}>Staff sign in</h2>
      <p className="muted">{envLabel(CONSOLE_ENV)} console. Staff accounts only.</p>
      <label>
        Work email
        <input
          className="input"
          style={{ width: "100%" }}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      {sent && (
        <label style={{ display: "block", marginTop: 8 }}>
          Code from the email
          <input
            className="input"
            style={{ width: "100%" }}
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
      )}
      {err && <p className="error">{err}</p>}
      <div style={{ marginTop: 12 }}>
        {sent ? (
          <button className="btn primary" onClick={verify} disabled={!code}>
            Verify
          </button>
        ) : (
          <button className="btn primary" onClick={send} disabled={!email}>
            Send code
          </button>
        )}
      </div>
    </div>
  );
}
