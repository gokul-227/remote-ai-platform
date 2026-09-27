import { useRef, useState } from "react";
import api, { extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApi, toFigmaJob, goRoute, safeHref } from "./live";
import {
  Ic,
  Av,
  Lg,
  Btn,
  Card,
  Tag,
  Tabs,
  Modal,
  Bar,
  Bars,
  cx,
  Field,
  inputCls,
  TableScroll,
  RichText,
  useDialogFocus,
  Notice,
} from "./rap_kit";

const GR = "#0552CC";
export function Work() {
  // Live: contract / freelance roles from /jobs, real saved jobs, proposals submitted as applications.
  const { user } = useAuth();
  const eng = user?.role === "ENGINEER";
  const [tab, setTab] = useState("Best Matches");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [sel, setSel] = useState<any>(null);
  const drawer = useRef<HTMLDivElement>(null);
  useDialogFocus(drawer, !!sel, () => setSel(null));
  const [prop, setProp] = useState(false);
  const [bid, setBid] = useState(0);
  const [cover, setCover] = useState("");
  const [notice, setNotice] = useState("");
  const contract = useApi<any[]>("/jobs", { query: term || undefined, job_type: "contract", limit: 50 });
  const freelance = useApi<any[]>("/jobs", { query: term || undefined, job_type: "freelance", limit: 50 });
  const savedQ = useApi<any[]>(eng ? "/saved-jobs" : null, { limit: 100 });
  const recs = useApi<any[]>(eng ? "/matching/recommendations" : null, { limit: 50 });
  const prof = useApi<any>(eng ? "/engineers/me" : null);
  const saved = new Set((savedQ.data ?? []).map((j: any) => j.id));
  const score: Record<string, number> = Object.fromEntries(
    (recs.data ?? []).map((m: any) => [m.job_id, m.overall_score]),
  );
  const all = [...(contract.data ?? []), ...(freelance.data ?? [])];
  const WORK = all.map((j: any) => {
    const f = toFigmaJob(j);
    return {
      ...f,
      id: j.id,
      tm: `Posted ${f.post}`,
      kind: [f.type, f.pay].filter(Boolean).join(" - "),
      est: j.timeline ? `Est. time: ${j.timeline}` : "",
      d: j.description || "",
      sk: f.tags,
      co: f.co,
      raw: j,
    };
  });
  const list = tab.startsWith("Saved")
    ? WORK.filter((w) => saved.has(w.id))
    : tab === "Most Recent"
      ? [...WORK].sort((a, b) => +new Date(b.raw.posted_at) - +new Date(a.raw.posted_at))
      : [...WORK].sort((a, b) => (score[b.id] ?? -1) - (score[a.id] ?? -1));
  const toggle = async (id: string) => {
    if (!eng) {
      goRoute("login");
      return;
    }
    await (saved.has(id) ? api.delete(`/saved-jobs/${id}`) : api.post(`/saved-jobs/${id}`));
    savedQ.reload();
  };
  const startApply = () => {
    if (!user) {
      goRoute("login");
      return;
    }
    if (!sel.easy && sel.raw.external_url) {
      const link = safeHref(sel.raw.external_url);
      if (link) window.open(link, "_blank", "noopener");
      return;
    }
    setBid(prof.data?.hourly_rate || 0);
    setCover("");
    setProp(true);
  };
  const send = async () => {
    try {
      await api.post(`/applications/jobs/${sel.id}`, {
        cover_note: [bid ? `Proposed rate: $${bid}/hr` : "", cover.trim()].filter(Boolean).join("\n\n") || undefined,
      });
      setProp(false);
      setSel(null);
      setNotice("Proposal sent");
    } catch (e) {
      setNotice(extractErrorMessage(e, "We couldn't send your proposal."));
    }
  };
  const loading = contract.loading || freelance.loading;
  return (
    <div className="bg-white">
      <div className="mx-auto max-w-[1300px] px-4 py-6">
        <h1 className="text-3xl font-light">Jobs you might like</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setTerm(q.trim());
          }}
          className="mt-4 flex gap-2"
        >
          <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full border border-slate-300 px-4">
            <Ic n="search" c="text-slate-500" />
            <input
              aria-label="Search for jobs"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search for jobs"
              className="min-w-0 flex-1 outline-none"
            />
          </div>
          <button className="rounded-full px-6 font-semibold text-white" style={{ background: GR }}>
            Search
          </button>
        </form>
        <div className="mt-5 grid gap-8 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0">
            <Tabs
              items={["Best Matches", "Most Recent", "Saved Jobs " + WORK.filter((w) => saved.has(w.id)).length]}
              v={tab}
              set={setTab}
            />
            <p className="py-3 text-sm text-slate-500">
              Contract and freelance roles{eng ? ", ordered by how well they match your profile" : ""}.
            </p>
            {loading && <p className="border-t border-slate-200 p-4 text-sm text-slate-500">Loading…</p>}
            {list.map((w) => (
              <div
                key={w.id}
                onClick={() => setSel(w)}
                className="cursor-pointer border-t border-slate-200 p-4 hover:bg-slate-50"
              >
                <div className="flex justify-between">
                  <p className="text-xs text-slate-500">{w.tm}</p>
                  {eng && (
                    <button
                      aria-label={saved.has(w.id) ? "Unsave job" : "Save job"}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(w.id);
                      }}
                      className={cx(
                        "rounded-full border p-1.5",
                        saved.has(w.id) ? "border-[#0552CC] text-[#0552CC]" : "border-slate-300 text-slate-500",
                      )}
                    >
                      <Ic n="heart" s={16} c={saved.has(w.id) ? "fill-current" : ""} />
                    </button>
                  )}
                </div>
                <h3 className="mt-1 text-lg font-semibold hover:underline" style={{ color: GR }}>
                  {w.t}
                </h3>
                <p className="mt-1 text-xs text-slate-500">{[w.kind, w.lvl, w.est].filter(Boolean).join(" - ")}</p>
                <p className="mt-2 line-clamp-2 text-[15px] leading-6 text-slate-700">{w.d}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {w.sk.map((s: string) => (
                    <span key={s} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      {s}
                    </span>
                  ))}
                </div>
                <p className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span>{w.co}</span>
                  <span className="flex items-center gap-1">
                    <Ic n="pin" s={12} />
                    {w.loc}
                  </span>
                  {score[w.id] != null && (
                    <span className="font-semibold text-[#0552CC]">{Math.round(score[w.id])}% match</span>
                  )}
                </p>
              </div>
            ))}
            {!loading && !list.length && (
              <p className="border-t border-slate-200 p-6 text-sm text-slate-500">
                {tab.startsWith("Saved")
                  ? "No saved roles yet."
                  : "No contract or freelance roles right now — check back soon or browse all jobs."}
              </p>
            )}
          </div>
          <aside className="hidden space-y-4 lg:block">
            {eng && prof.data && (
              <Card c="rounded-lg">
                <div className="flex items-center gap-3">
                  <Av name={user?.full_name || "You"} s={64} />
                  <div>
                    <p className="font-semibold">{user?.full_name}</p>
                    <p className="text-sm text-slate-600">{prof.data.headline || prof.data.primary_role}</p>
                  </div>
                </div>
                <Btn
                  v="outline"
                  full
                  sm
                  c="mt-3"
                  onClick={() => {
                    goRoute("profile");
                  }}
                >
                  Complete your profile
                </Btn>
                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-xs">
                    <span>Profile completeness</span>
                    <b>{Math.round(prof.data.profile_score || 0)}%</b>
                  </div>
                  <Bar v={prof.data.profile_score || 0} c="bg-[#0552CC]" />
                </div>
              </Card>
            )}
            {eng && prof.data && (
              <Card c="rounded-lg">
                <p className="font-semibold">Availability</p>
                <p className="text-sm text-slate-600">{prof.data.availability || "Not set"}</p>
                <p className="mt-3 font-semibold">Rate</p>
                <p className="text-sm text-slate-600">
                  {prof.data.hourly_rate != null ? `$${prof.data.hourly_rate}/hr` : "Not set"}
                </p>
              </Card>
            )}
            {eng && (prof.data?.skills ?? []).length > 0 && (
              <Card c="rounded-lg">
                <p className="mb-2 font-semibold">Your skills</p>
                {prof.data.skills.slice(0, 6).map((c: string) => (
                  <button
                    key={c}
                    onClick={() => {
                      setQ(c);
                      setTerm(c);
                    }}
                    className="block w-full border-b border-slate-100 py-2 text-left text-sm"
                    style={{ color: GR }}
                  >
                    {c}
                  </button>
                ))}
              </Card>
            )}
          </aside>
        </div>
      </div>
      {sel && (
        <div className="fixed inset-0 z-[90] flex justify-end bg-black/40" onClick={() => setSel(null)}>
          <div
            ref={drawer}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={sel.t}
            className="h-full w-full max-w-3xl overflow-y-auto bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white p-4">
              <button aria-label="Close" onClick={() => setSel(null)} className="rounded-full p-1.5 hover:bg-slate-100">
                <Ic n="x" />
              </button>
              <div className="flex gap-2">
                {eng && (
                  <Btn v="outline" icon="heart" onClick={() => toggle(sel.id)}>
                    {saved.has(sel.id) ? "Saved" : "Save job"}
                  </Btn>
                )}
                {(!user || eng) && (
                  <Btn v="primary" onClick={startApply}>
                    {!user ? "Sign in to apply" : sel.easy ? "Apply now" : "Apply on company site"}
                  </Btn>
                )}
              </div>
            </div>
            <div className="grid gap-6 p-6 grid-cols-1 md:grid-cols-[1fr_240px]">
              <div>
                <h2 className="text-2xl font-semibold">{sel.t}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {sel.tm} - {sel.loc}
                </p>
                <RichText c="mt-4" text={sel.d || ""} />
                <div className="mt-5 grid grid-cols-3 gap-4 border-y border-slate-200 py-4 text-sm">
                  <div>
                    <p className="font-semibold">{sel.lvl || "—"}</p>
                    <p className="text-slate-500">Experience level</p>
                  </div>
                  <div>
                    <p className="font-semibold">{sel.pay || "—"}</p>
                    <p className="text-slate-500">Budget</p>
                  </div>
                  <div>
                    <p className="font-semibold">{sel.raw.is_remote === false ? "On-site" : "Remote"}</p>
                    <p className="text-slate-500">Location</p>
                  </div>
                </div>
                {sel.sk.length > 0 && (
                  <>
                    <p className="mt-4 font-semibold">Skills and expertise</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {sel.sk.map((s: string) => (
                        <span key={s} className="rounded-full bg-slate-100 px-3 py-1 text-sm">
                          {s}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className="space-y-4">
                <Card c="rounded-lg">
                  <p className="font-semibold">About the client</p>
                  <p className="mt-2 text-sm font-semibold">{sel.co}</p>
                  <p className="text-sm text-slate-500">
                    {sel.easy ? "Hiring on Remote AI Platform" : `Listed on ${sel.raw.source}`}
                  </p>
                  {sel.raw.company_id && (
                    <button
                      className="mt-2 text-sm font-semibold"
                      style={{ color: GR }}
                      onClick={() => {
                        goRoute(`company/${encodeURIComponent(String(sel.raw.company_id))}`);
                      }}
                    >
                      View company
                    </button>
                  )}
                </Card>
              </div>
            </div>
          </div>
        </div>
      )}
      <Modal open={prop} onClose={() => setProp(false)} title="Submit a proposal" w="max-w-2xl">
        <p className="mb-1 font-semibold">Terms</p>
        <p className="mb-3 text-sm text-slate-500">What rate would you like to propose for this job?</p>
        <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4 text-sm">
          <span className="font-bold">Hourly rate (USD)</span>
          <input
            aria-label="Hourly rate"
            type="number"
            min={0}
            value={bid || ""}
            onChange={(e) => setBid(Number(e.target.value))}
            className="h-10 w-32 rounded-lg border border-slate-300 px-3 text-right"
          />
        </div>
        <Field label="Cover letter">
          <textarea
            rows={5}
            maxLength={1900}
            value={cover}
            onChange={(e) => setCover(e.target.value)}
            className={cx(inputCls, "mt-2 h-auto py-2")}
            placeholder="Introduce yourself and explain why you are a strong fit"
          />
        </Field>
        <div className="mt-5 flex justify-end gap-2">
          <Btn v="outline" onClick={() => setProp(false)}>
            Cancel
          </Btn>
          <Btn v="primary" onClick={send}>
            Send proposal
          </Btn>
        </div>
      </Modal>
      <Notice text={notice} onDismiss={() => setNotice("")} />
    </div>
  );
}

export function Talent() {
  // Live: engineers from /engineers (or /engineers/search) with rate and experience filters; Invite to a job; Message.
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [rate, setRate] = useState("Any");
  const [lvl, setLvl] = useState<string[]>([]);
  const [inviting, setInviting] = useState<any>(null);
  const [notice, setNotice] = useState("");
  const q1 = useApi<any[]>(
    term ? "/engineers/search" : "/engineers",
    term ? { query: term, is_open_to_work: false, limit: 100 } : { limit: 100 },
  );
  const myJobs = useApi<any[]>(user?.role === "COMPANY" ? "/jobs/company" : null, { limit: 100 });
  const band = (y: number) => (y >= 8 ? "Expert" : y >= 3 ? "Intermediate" : "Entry");
  const inRate = (r: number) =>
    rate === "Any" ||
    (rate === "$30 - $60" ? r >= 30 && r < 60 : rate === "$60 - $100" ? r >= 60 && r < 100 : r >= 100);
  const tal = (q1.data ?? []).filter(
    (e: any) =>
      e.user_id !== user?.id &&
      e.hourly_rate > 0 &&
      inRate(e.hourly_rate) &&
      (!lvl.length || lvl.includes(band(e.years_of_experience || 0))),
  );
  const invite = async (jobId: string) => {
    try {
      await api.post(`/applications/jobs/${jobId}/invite/${inviting.id}`);
      setNotice(`${inviting.full_name || "Professional"} was invited`);
    } catch (e) {
      setNotice(extractErrorMessage(e, "Couldn't send that invitation."));
    }
    setInviting(null);
  };
  return (
    <div className="bg-white">
      <div className="mx-auto max-w-[1300px] px-4 py-6">
        <h1 className="text-3xl font-light">Find talent</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setTerm(q.trim());
          }}
          className="mt-4 flex gap-2"
        >
          <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full border border-slate-300 px-4">
            <Ic n="search" c="text-slate-500" />
            <input
              aria-label="Search talent"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Skill, role or name"
              className="min-w-0 flex-1 outline-none"
            />
          </div>
          <button className="rounded-full px-6 font-semibold text-white" style={{ background: GR }}>
            Search
          </button>
        </form>
        <div className="mt-6 grid gap-8 grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="space-y-5 text-sm">
            <div>
              <p className="mb-2 font-semibold">Hourly rate</p>
              {["Any", "$30 - $60", "$60 - $100", "$100+"].map((x) => (
                <label key={x} className="flex items-center gap-2 py-1">
                  <input type="radio" name="rate" checked={rate === x} onChange={() => setRate(x)} />
                  {x}
                </label>
              ))}
            </div>
            <div>
              <p className="mb-2 font-semibold">Experience level</p>
              {["Entry", "Intermediate", "Expert"].map((x) => (
                <label key={x} className="flex items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    checked={lvl.includes(x)}
                    onChange={(e) => setLvl(e.target.checked ? [...lvl, x] : lvl.filter((y) => y !== x))}
                  />
                  {x}
                </label>
              ))}
            </div>
          </aside>
          <div>
            <p className="mb-3 text-sm text-slate-500">
              {q1.loading ? "Loading…" : `${tal.length} freelancers match your search`}
            </p>
            {tal.map((p: any) => (
              <div key={p.id} className="flex gap-4 border-t border-slate-200 p-5 hover:bg-slate-50">
                <Av name={p.full_name || "Professional"} s={72} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Navigation is a link: it opens in a new tab and says where it goes. */}
                    <a
                      href={`#engineer/${encodeURIComponent(p.id)}`}
                      className="inline-flex min-h-6 items-center text-lg font-semibold hover:underline"
                      style={{ color: GR }}
                    >
                      {p.full_name || "Professional"}
                    </a>
                    {p.is_verified && <Tag v="blue">Verified</Tag>}
                  </div>
                  <p className="font-semibold">{p.headline || p.primary_role}</p>
                  <p className="mt-1 text-sm text-slate-600">
                    <b>${p.hourly_rate}/hr</b> - {p.years_of_experience || 0} yrs experience - {p.location || "Remote"}
                  </p>
                  {p.bio && <p className="mt-2 line-clamp-2 text-sm text-slate-600">{p.bio}</p>}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(p.skills || []).slice(0, 8).map((s: string) => (
                      <span
                        key={s}
                        className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  {user?.role === "COMPANY" && (
                    <Btn v="primary" onClick={() => setInviting(p)}>
                      Invite to job
                    </Btn>
                  )}
                  <Btn
                    v="outline"
                    sm
                    onClick={() => {
                      if (!user) {
                        goRoute("login");
                        return;
                      }
                      sessionStorage.setItem("rap-contact-id", p.user_id);
                      goRoute("messenger");
                    }}
                  >
                    Message
                  </Btn>
                </div>
              </div>
            ))}
            {!q1.loading && !tal.length && (
              <p className="border-t border-slate-200 p-6 text-sm text-slate-500">
                No freelancers with a set rate match these filters.
              </p>
            )}
          </div>
        </div>
      </div>
      <Modal open={!!inviting} onClose={() => setInviting(null)} title={`Invite ${inviting?.full_name ?? ""} to apply`}>
        {(myJobs.data ?? []).filter((j: any) => j.is_active).length ? (
          <div className="space-y-2">
            {(myJobs.data ?? [])
              .filter((j: any) => j.is_active)
              .map((j: any) => (
                <button
                  key={j.id}
                  onClick={() => invite(j.id)}
                  className="flex w-full items-center justify-between rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50"
                >
                  <b>{j.title}</b>
                  <Ic n="send" s={16} />
                </button>
              ))}
          </div>
        ) : (
          <p className="text-slate-500">Post a job first, then invite professionals to apply.</p>
        )}
      </Modal>
      <Notice text={notice} onDismiss={() => setNotice("")} />
    </div>
  );
}

const money = (n: number, cur = "USD") => {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: n % 1 ? 2 : 0,
    }).format(n);
  } catch {
    return `${cur} ${n}`;
  }
};
const CTABS: Record<string, string[]> = {
  Active: ["ACTIVE"],
  "Pending signature": ["DRAFT", "OFFERED", "SIGNED"],
  Ended: ["COMPLETED", "TERMINATED"],
};
const MS_LABEL: Record<string, string> = {
  PENDING: "Not started",
  IN_PROGRESS: "In progress",
  DELIVERED: "In review",
  APPROVED: "Approved",
  PAID: "Marked paid",
};
export function Contracts() {
  // Live: /contracts/me with milestone workflow (worker delivers, client approves); companies send offers.
  // No payment is attached to a milestone: PAID is only ever set from a settled payment server-side.
  const { user } = useAuth();
  const q = useApi<any[]>(user ? "/contracts/me" : null);
  const accepted = useApi<any[]>(user?.role === "COMPANY" ? "/applications/company" : null, { limit: 100 });
  const [tab, setTab] = useState("Active");
  const [openId, setOpenId] = useState<string | null>(null);
  const [dt, setDt] = useState("Milestones");
  const [offer, setOffer] = useState(false);
  const [f, setF] = useState<any>({ worker: "", title: "", scope: "", rate_type: "FIXED", amount: "", ms: "" });
  const [notice, setNotice] = useState("");
  const all = q.data ?? [];
  const rows = all.filter((c: any) => CTABS[tab].includes(c.status));
  const cur = all.find((c: any) => c.id === openId) || rows[0];
  const isClient = cur && cur.client_id === user?.id;
  const total = (c: any) =>
    c.milestones?.length ? c.milestones.reduce((a: number, m: any) => a + m.amount, 0) : c.rate_amount;
  const progress = (c: any) =>
    c.milestones?.length
      ? Math.round(
          (c.milestones.filter((m: any) => ["APPROVED", "PAID"].includes(m.status)).length / c.milestones.length) * 100,
        )
      : c.status === "COMPLETED"
        ? 100
        : 0;
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      q.reload();
      setNotice(ok);
    } catch (e) {
      setNotice(extractErrorMessage(e, "That didn't work. Please try again."));
    }
  };
  const setMs = (m: any, status: string, ok: string) =>
    act(() => api.patch(`/contracts/${cur.id}/milestones/${m.id}/status`, { status }), ok);
  const candidates = Array.from(
    new Map(
      (accepted.data ?? [])
        .filter((a: any) => ["ACCEPTED", "SHORTLISTED"].includes(a.application.status))
        .map((a: any) => [a.candidate.id, a.candidate]),
    ).values(),
  );
  const sendOffer = () =>
    act(async () => {
      const milestones = f.ms
        .split("\n")
        .map((l: string) => l.trim())
        .filter(Boolean)
        .map((l: string) => {
          const [t, a] = l.split("|").map((x) => x.trim());
          return { title: t, amount: Number(a) || 0 };
        })
        .filter((m: any) => m.title && m.amount > 0);
      await api.post("/contracts", {
        worker_id: f.worker,
        title: f.title.trim(),
        scope_description: f.scope.trim(),
        rate_type: f.rate_type,
        rate_amount: Number(f.amount),
        milestones,
      });
      setOffer(false);
      setTab("Pending signature");
    }, "Offer sent — it will appear in the professional’s contracts to sign.");
  return (
    <div className="bg-[#F1F2F4] py-6">
      <div className="mx-auto max-w-[1300px] px-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-3xl font-light">Contracts</h1>
          {user?.role === "COMPANY" && (
            <Btn v="primary" icon="plus" onClick={() => setOffer(true)}>
              Send offer
            </Btn>
          )}
        </div>
        <Card p={false} c="rounded-lg">
          <Tabs
            items={Object.keys(CTABS)}
            v={tab}
            set={(t: string) => {
              setTab(t);
              setOpenId(null);
            }}
            c="px-3"
          />
          {q.loading && <p className="p-4 text-sm text-slate-500">Loading contracts…</p>}
          {rows.map((c: any) => {
            const other = c.client_id === user?.id ? c.worker : c.client;
            return (
              <div
                key={c.id}
                onClick={() => setOpenId(c.id)}
                className={cx(
                  "flex cursor-pointer items-center gap-4 border-b border-slate-100 p-4 hover:bg-slate-50",
                  cur?.id === c.id && "bg-slate-50",
                )}
              >
                <Lg name={other?.full_name || c.title} s={44} r={8} />
                <div className="flex-1">
                  <p className="font-semibold" style={{ color: GR }}>
                    {c.title}
                  </p>
                  <p className="text-sm text-slate-500">
                    {other?.full_name || "—"} - {c.status.charAt(0) + c.status.slice(1).toLowerCase()}
                  </p>
                </div>
                <div className="hidden w-48 md:block">
                  <Bar v={progress(c)} c="bg-[#0552CC]" />
                  <p className="mt-1 text-xs text-slate-500">{progress(c)}% complete</p>
                </div>
                <p className="w-24 text-right font-semibold">{money(total(c), c.currency)}</p>
              </div>
            );
          })}
          {!q.loading && !rows.length && (
            <p className="p-6 text-sm text-slate-500">
              No {tab.toLowerCase()} contracts.
              {user?.role === "COMPANY" && tab !== "Ended" ? " Send an offer to a candidate you’ve accepted." : ""}
            </p>
          )}
        </Card>
        {cur && CTABS[tab].includes(cur.status) && (
          <Card c="mt-5 rounded-lg" p={false}>
            <div className="flex flex-wrap items-start justify-between gap-4 p-6">
              <div>
                <Tag v="blue">
                  {cur.status.charAt(0) + cur.status.slice(1).toLowerCase()} -{" "}
                  {cur.rate_type === "FIXED" ? "Fixed price" : cur.rate_type === "HOURLY" ? "Hourly" : "Monthly"}
                </Tag>
                <h2 className="mt-2 text-2xl font-semibold">{cur.title}</h2>
                <p className="text-sm text-slate-500">
                  {isClient ? `Professional ${cur.worker?.full_name || ""}` : `Client ${cur.client?.full_name || ""}`}
                  {cur.start_date ? ` - Started ${new Date(cur.start_date).toLocaleDateString()}` : ""}
                </p>
              </div>
              <div className="flex gap-6 text-right">
                {[
                  ["Budget", money(total(cur), cur.currency)],
                  [
                    "Approved",
                    money(
                      (cur.milestones || [])
                        .filter((m: any) => m.status === "APPROVED")
                        .reduce((a: number, m: any) => a + m.amount, 0),
                      cur.currency,
                    ),
                  ],
                  [
                    "Released",
                    money(
                      (cur.milestones || [])
                        .filter((m: any) => m.status === "PAID")
                        .reduce((a: number, m: any) => a + m.amount, 0),
                      cur.currency,
                    ),
                  ],
                ].map((s) => (
                  <div key={s[0]}>
                    <p className="text-xs text-slate-500">{s[0]}</p>
                    <p className="text-xl font-semibold">{s[1]}</p>
                  </div>
                ))}
              </div>
            </div>
            <Tabs items={["Milestones", "Scope and terms"]} v={dt} set={setDt} c="px-4" />
            <div className="p-6">
              {dt === "Scope and terms" ? (
                <>
                  <p className="whitespace-pre-line text-slate-700">{cur.scope_description}</p>
                  {cur.terms && (
                    <>
                      <h3 className="mt-4">Terms</h3>
                      <p className="mt-1 whitespace-pre-line text-slate-700">{cur.terms}</p>
                    </>
                  )}
                </>
              ) : (
                <>
                  {["DRAFT", "OFFERED", "SIGNED"].includes(cur.status) && (
                    <div className="mb-4 flex items-center justify-between rounded-lg bg-amber-50 p-4 text-sm">
                      <span>
                        {(isClient ? cur.client_signed_at : cur.worker_signed_at)
                          ? "You’ve signed — waiting for the other party."
                          : "This contract needs your signature before work starts."}
                      </span>
                      {!(isClient ? cur.client_signed_at : cur.worker_signed_at) && (
                        <Btn
                          sm
                          onClick={() => {
                            goRoute(`contractsign/${encodeURIComponent(String(cur.id))}`);
                          }}
                        >
                          Review and sign
                        </Btn>
                      )}
                    </div>
                  )}
                  {(cur.milestones || []).map((m: any, i: number) => {
                    const label = MS_LABEL[m.status] || m.status;
                    const pct =
                      { PENDING: 0, IN_PROGRESS: 40, DELIVERED: 70, APPROVED: 90, PAID: 100 }[m.status as string] ?? 0;
                    const live = cur.status === "ACTIVE";
                    return (
                      <div
                        key={m.id}
                        className="mb-3 flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 p-4"
                      >
                        <span
                          className={cx(
                            "flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold",
                            m.status === "PAID"
                              ? "bg-emerald-100 text-emerald-700"
                              : m.status === "DELIVERED"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-slate-100 text-slate-500",
                          )}
                        >
                          {m.status === "PAID" ? <Ic n="check" s={16} /> : i + 1}
                        </span>
                        <div className="min-w-[200px] flex-1">
                          <p className="font-semibold">{m.title}</p>
                          <div className="mt-1 max-w-xs">
                            <Bar v={pct} c={m.status === "PAID" ? "bg-emerald-500" : "bg-amber-500"} />
                          </div>
                          {m.due_date && (
                            <p className="mt-1 text-xs text-slate-500">
                              Due {new Date(m.due_date).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <Tag t={m.status === "PAID" ? "primary" : m.status === "DELIVERED" ? "amber" : "gray"}>
                          {label}
                        </Tag>
                        <p className="w-20 text-right font-semibold">{money(m.amount, cur.currency)}</p>
                        {live && !isClient && m.status === "PENDING" && (
                          <Btn v="outline" sm onClick={() => setMs(m, "IN_PROGRESS", "Milestone started")}>
                            Start
                          </Btn>
                        )}
                        {live && !isClient && m.status === "IN_PROGRESS" && (
                          <Btn v="primary" sm onClick={() => setMs(m, "DELIVERED", "Delivered for review")}>
                            Submit for review
                          </Btn>
                        )}
                        {live && isClient && m.status === "DELIVERED" && (
                          <>
                            <Btn v="line" sm onClick={() => setMs(m, "IN_PROGRESS", "Changes requested")}>
                              Request changes
                            </Btn>
                            <Btn v="primary" sm onClick={() => setMs(m, "APPROVED", "Milestone approved")}>
                              Approve
                            </Btn>
                          </>
                        )}
                      </div>
                    );
                  })}
                  {!(cur.milestones || []).length && (
                    <p className="text-sm text-slate-500">This contract has no milestones.</p>
                  )}
                  {cur.status === "ACTIVE" && (
                    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-slate-50 p-4 text-sm">
                      <Ic n="shieldcheck" c="text-[#0552CC]" s={22} />
                      <span className="flex-1">
                        The professional delivers each milestone and the client approves it. Payments are not processed
                        through Remote AI Platform yet, so approving a milestone does not move any money.
                      </span>
                      <button
                        className="font-semibold text-red-600"
                        onClick={() => {
                          if (window.confirm("End this contract? This can't be undone."))
                            act(() => api.post(`/contracts/${cur.id}/terminate`), "Contract ended");
                        }}
                      >
                        End contract
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>
        )}
      </div>
      <Modal open={offer} onClose={() => setOffer(false)} title="Send a contract offer" w="max-w-xl">
        <div className="space-y-3">
          <Field label="Professional">
            <select className={inputCls} value={f.worker} onChange={(e) => setF({ ...f, worker: e.target.value })}>
              <option value="">Choose a shortlisted or accepted candidate</option>
              {candidates.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                  {c.headline ? ` — ${c.headline}` : ""}
                </option>
              ))}
            </select>
          </Field>
          {!candidates.length && (
            <p className="text-xs text-slate-500">Shortlist or accept a candidate on the Candidates board first.</p>
          )}
          <Field label="Contract title">
            <input className={inputCls} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </Field>
          <Field label="Scope of work">
            <textarea
              rows={3}
              className={cx(inputCls, "h-auto py-2")}
              value={f.scope}
              onChange={(e) => setF({ ...f, scope: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rate type">
              <select
                className={inputCls}
                value={f.rate_type}
                onChange={(e) => setF({ ...f, rate_type: e.target.value })}
              >
                <option value="FIXED">Fixed price</option>
                <option value="HOURLY">Hourly</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </Field>
            <Field label="Rate (USD)">
              <input
                type="number"
                min={1}
                className={inputCls}
                value={f.amount}
                onChange={(e) => setF({ ...f, amount: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Milestones (one per line: title | amount)">
            <textarea
              rows={3}
              className={cx(inputCls, "h-auto py-2 font-mono text-xs")}
              placeholder={"Discovery | 2000\nDelivery | 5000"}
              value={f.ms}
              onChange={(e) => setF({ ...f, ms: e.target.value })}
            />
          </Field>
          <Btn
            full
            onClick={() => {
              if (!f.worker || !f.title.trim() || !f.scope.trim() || !(Number(f.amount) > 0)) {
                setNotice("Choose a professional and add a title, scope and rate.");
                return;
              }
              sendOffer();
            }}
          >
            Send offer
          </Btn>
        </div>
      </Modal>
      <Notice text={notice} onDismiss={() => setNotice("")} />
    </div>
  );
}

function PaymentsView({ company }: { company: boolean }) {
  // Live: /payments/wallet + /payments/transactions. Withdrawals are not available yet (no payout rail), so none are offered.
  const { user } = useAuth();
  const w = useApi<any>(user ? "/payments/wallet" : null);
  const tq = useApi<any[]>(user ? "/payments/transactions" : null);
  const [release, setRelease] = useState<string>("");
  const [notice, setNotice] = useState("");
  const tx = tq.data ?? [];
  // Amounts in different currencies are never added together (PAY-02).
  const balances: { currency: string; [k: string]: number | string }[] = w.data?.by_currency ?? [];
  const mixed = balances.length > 1;
  const cur = w.data?.currency || balances[0]?.currency || "USD";
  // Money movement is gated server-side until the payout side exists; never offer or describe a release otherwise.
  const live = w.data?.payments_enabled === true;
  const byMonth = Array.from({ length: 9 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - 8 + i);
    return d;
  });
  const monthly = byMonth.map((d) =>
    tx
      .filter(
        (t: any) =>
          t.status === "RELEASED" &&
          (t.currency || "USD") === cur &&
          (company ? t.payer_id : t.payee_id) === user?.id &&
          new Date(t.released_at || t.created_at).getMonth() === d.getMonth() &&
          new Date(t.released_at || t.created_at).getFullYear() === d.getFullYear(),
      )
      .reduce((a: number, t: any) => a + t.amount, 0),
  );
  const act = async (path: string, ok: string) => {
    try {
      await api.post(path);
      tq.reload();
      w.reload();
      setNotice(ok);
    } catch (e) {
      setNotice(extractErrorMessage(e, "That didn't work. Please try again."));
    }
    setRelease("");
  };
  const stats = company
    ? [
        ["Held in escrow", "escrow_held", "lock"],
        ["Released to professionals", "total_released", "check"],
        ["Total spent", "total_spent", "wallet"],
        ["Transactions", null, "history"],
      ]
    : [
        ["Earned (released)", "total_earned", "wallet"],
        ["In escrow for you", "escrow_held", "lock"],
        ["Released", "total_released", "check"],
        ["Transactions", null, "history"],
      ];
  return (
    <div className="bg-[#F1F2F4] py-6">
      <div className="mx-auto max-w-[1300px] px-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-3xl font-light">{company ? "Payments and escrow" : "Earnings and payments"}</h1>
        </div>
        <div className="grid gap-4 grid-cols-1 md:grid-cols-4">
          {stats.map((s: any) => (
            <Card key={s[0]} c="rounded-lg">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-sm">{s[0]}</span>
                <Ic n={s[2]} s={18} />
              </div>
              <p className="mt-2 text-2xl font-semibold">
                {s[1] == null
                  ? tx.length
                  : mixed
                    ? balances.map((b) => money(Number(b[s[1]]), b.currency)).join(" · ")
                    : money(Number(w.data?.[s[1]] ?? 0), cur)}
              </p>
            </Card>
          ))}
        </div>
        <div className="mt-4 grid gap-4 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card c="rounded-lg">
            <p className="font-semibold">
              {company ? "Released by month" : "Earnings by month"}
              {mixed ? ` (${cur} only)` : ""}
            </p>
            <div className="mt-4">
              <Bars d={monthly} c="#0552CC" h={180} />
            </div>
            <div className="mt-2 flex justify-between text-xs text-slate-500">
              {byMonth.map((d) => (
                <span key={d.toISOString()}>{d.toLocaleString("en-US", { month: "short" })}</span>
              ))}
            </div>
          </Card>
          <Card c="rounded-lg">
            <p className="font-semibold">
              {live ? (company ? "How escrow works" : "Payouts") : "Payments aren’t live yet"}
            </p>
            <p className="mt-3 text-sm text-slate-600">
              {!live
                ? "Payments are not processed through Remote AI Platform yet: no card is charged, no funds are held and nothing is paid out through the platform. The figures on this page are platform records, not a statement of money received."
                : company
                  ? "Funds are held on your payment method until you approve the delivered work. Releasing captures the held funds; it is not a payout to the professional’s bank account."
                  : "Withdrawals to a bank or PayPal account aren’t available yet, so no money is paid out to you through the platform."}
            </p>
          </Card>
        </div>
        <Card c="mt-4 rounded-lg" p={false}>
          <p className="p-4 font-semibold">Transaction history</p>
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Transactions">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  {["Date", company ? "Professional" : "Client", "Reference", "Amount", "Status", ""].map((h) => (
                    <th key={h} className="px-4 py-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tx.map((t: any) => {
                  const mine = t.payee_id === user?.id;
                  return (
                    <tr key={t.id} className="border-t border-slate-100">
                      <td className="px-4 py-3">{new Date(t.created_at).toLocaleDateString()}</td>
                      <td className="px-4 py-3">{(mine ? t.payer : t.payee)?.full_name || "—"}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">
                        {t.provider_reference?.slice(0, 18) || t.id.slice(0, 8)}
                      </td>
                      <td className={cx("px-4 py-3 font-semibold", mine && "text-emerald-700")}>
                        {mine ? "+" : "-"}
                        {money(t.amount, t.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <Tag t={t.status === "RELEASED" ? "primary" : "gray"}>
                          {t.status.charAt(0) + t.status.slice(1).toLowerCase()}
                        </Tag>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {company && t.payer_id === user?.id && t.status === "ESCROWED" && (
                          <>
                            <Btn v="line" sm onClick={() => act(`/payments/${t.id}/refund`, "Escrow refunded")}>
                              Refund
                            </Btn>{" "}
                            {live && (
                              <Btn sm onClick={() => setRelease(t.id)}>
                                Release
                              </Btn>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!tq.loading && !tx.length && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      No transactions yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <Modal open={!!release} onClose={() => setRelease("")} title="Capture held funds?">
        <p className="text-sm text-slate-500">
          This captures the funds held on your payment method. It does not pay the professional’s bank account: payouts
          aren’t available yet. This can’t be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Btn v="gray" onClick={() => setRelease("")}>
            Cancel
          </Btn>
          <Btn onClick={() => act(`/payments/${release}/release`, "Held funds captured")}>Capture funds</Btn>
        </div>
      </Modal>
      <Notice text={notice} onDismiss={() => setNotice("")} />
    </div>
  );
}
export function Earnings() {
  return <PaymentsView company={false} />;
}
export function CoPayments() {
  return <PaymentsView company />;
}

export function TaskMarketplace({ initial }: { initial?: string } = {}) {
  // Live: engineers — /projects/my-offers, /my-tasks (+ submit work), submissions with AI review, /reputation;
  // companies — offers they sent (/projects/task-offers) with cancel.
  const { user } = useAuth();
  const company = user?.role === "COMPANY";
  const offersQ = useApi<any[]>(user && !company ? "/projects/my-offers" : null);
  const tasksQ = useApi<any[]>(user && !company ? "/projects/my-tasks" : null);
  const repQ = useApi<any>(user && !company ? `/projects/reputation/${user.id}` : null);
  const sentQ = useApi<any[]>(company ? "/projects/task-offers" : null);
  const [tab, setTab] = useState(company ? "sent" : initial || "offers");
  const [submit, setSubmit] = useState<any>(null);
  const [summary, setSummary] = useState("");
  const [links, setLinks] = useState("");
  const [notice, setNotice] = useState("");
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn();
      offersQ.reload();
      tasksQ.reload();
      sentQ.reload();
      setNotice(ok);
    } catch (e) {
      setNotice(extractErrorMessage(e, "That didn't work. Please try again."));
    }
  };
  const pending = (offersQ.data ?? []).filter((o: any) => o.offer.status === "OFFERED");
  const tasks = tasksQ.data ?? [];
  const subs = tasks.filter((t: any) => t.latest_submission);
  const subLabel: Record<string, string> = {
    SUBMITTED: "In review",
    CHANGES_REQUESTED: "Changes requested",
    APPROVED: "Approved",
  };
  const TABS: [string, string][] = company
    ? [["sent", "Offers sent"]]
    : [
        ["offers", `Offers for you${pending.length ? ` (${pending.length})` : ""}`],
        ["tasks", "My tasks"],
        ["submissions", "Submissions"],
        ["reviews", "Reputation"],
      ];
  return (
    <div className="bg-[#F1F2F4] py-6">
      <div className="mx-auto max-w-[1300px] px-4">
        <div className="mb-4">
          <h1 className="text-3xl font-light">Task marketplace</h1>
          <p className="text-sm text-slate-500">
            {company
              ? "Track the tasks you’ve offered to professionals from your project boards."
              : "Accept task offers from active projects, submit your work for review and build your reputation."}
          </p>
        </div>
        <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
          {TABS.map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              aria-pressed={tab === k}
              className={cx(
                "whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold",
                tab === k
                  ? "border-[#0552CC] text-[#0552CC]"
                  : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {l}
            </button>
          ))}
        </div>

        {tab === "offers" && (
          <div className="space-y-3">
            {pending.map((o: any) => (
              <Card key={o.offer.id} c="rounded-lg">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex-1">
                    <p className="font-semibold">{o.task.title}</p>
                    <p className="text-sm text-slate-500">
                      {o.project_title}
                      {o.task.deadline ? ` - due ${new Date(o.task.deadline).toLocaleDateString()}` : ""}
                      {o.task.estimated_hours ? ` - ~${o.task.estimated_hours}h` : ""}
                    </p>
                    {o.offer.matched_skills?.length > 0 && (
                      <p className="mt-1 text-xs text-slate-500">Matched skills: {o.offer.matched_skills.join(", ")}</p>
                    )}
                  </div>
                  <Tag t="blue">{Math.round(o.offer.match_score)}% match</Tag>
                  <Btn
                    v="gray"
                    sm
                    onClick={() =>
                      act(
                        () => api.patch(`/projects/task-offers/${o.offer.id}`, { status: "DECLINED" }),
                        "Offer declined",
                      )
                    }
                  >
                    Decline
                  </Btn>
                  <Btn
                    v="primary"
                    sm
                    onClick={() =>
                      act(
                        () => api.patch(`/projects/task-offers/${o.offer.id}`, { status: "ACCEPTED" }),
                        "Offer accepted — the task is now in My tasks",
                      )
                    }
                  >
                    Accept
                  </Btn>
                </div>
              </Card>
            ))}
            {!offersQ.loading && !pending.length && (
              <Card c="rounded-lg">
                <p className="text-sm text-slate-500">
                  No open task offers right now. Companies offer tasks to professionals whose skills match.
                </p>
              </Card>
            )}
          </div>
        )}

        {tab === "tasks" && (
          <Card c="rounded-lg" p={false}>
            <TableScroll label="My tasks">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    {["Task", "Project", "Status", ""].map((h) => (
                      <th key={h} className="px-4 py-2">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t: any) => (
                    <tr key={t.task.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-semibold">{t.task.title}</td>
                      <td className="px-4 py-3">{t.project_title}</td>
                      <td className="px-4 py-3">
                        <Tag t={t.task.status === "COMPLETED" ? "green" : "amber"}>
                          {t.task.status.replace(/_/g, " ").toLowerCase()}
                        </Tag>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {t.task.status !== "COMPLETED" && t.latest_submission?.status !== "SUBMITTED" && (
                          <Btn
                            v="primary"
                            sm
                            onClick={() => {
                              setSubmit(t);
                              setSummary("");
                              setLinks("");
                            }}
                          >
                            Submit work
                          </Btn>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!tasksQ.loading && !tasks.length && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                        No assigned tasks yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </TableScroll>
          </Card>
        )}

        {tab === "submissions" && (
          <div className="space-y-3">
            {subs.map((t: any) => {
              const s = t.latest_submission;
              const label = subLabel[s.status] || s.status;
              return (
                <Card key={s.id} c="rounded-lg">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#E8F0FC] text-[#0552CC]">
                      <Ic n="code" s={20} />
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">
                        {t.task.title} <span className="text-xs font-normal text-slate-500">v{s.version}</span>
                      </p>
                      <p className="mt-1 text-sm text-slate-500">{s.review_note || s.ai_feedback || s.summary}</p>
                    </div>
                    <div className="text-right">
                      <Tag t={s.status === "APPROVED" ? "green" : s.status === "CHANGES_REQUESTED" ? "red" : "amber"}>
                        {label}
                      </Tag>
                      {s.quality_score != null && (
                        <p className="mt-1 text-xs text-slate-500">
                          AI quality score: <b className="text-slate-800">{Math.round(s.quality_score)}/100</b>
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
            {!subs.length && (
              <Card c="rounded-lg">
                <p className="text-sm text-slate-500">Your work submissions and their AI review results appear here.</p>
              </Card>
            )}
          </div>
        )}

        {tab === "reviews" && (
          <>
            <div className="mb-4 grid gap-4 grid-cols-1 md:grid-cols-3">
              {[
                [
                  "Average rating",
                  repQ.data?.average_rating != null ? repQ.data.average_rating.toFixed(1) : "—",
                  "star",
                ],
                [
                  "Completion rate",
                  repQ.data?.completion_rate != null ? `${repQ.data.completion_rate}%` : "—",
                  "check",
                ],
                ["Reviews", String(repQ.data?.rating_count ?? 0), "users"],
              ].map((k) => (
                <Card key={k[0]} c="rounded-lg">
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="text-sm">{k[0]}</span>
                    <Ic n={k[2]} s={18} />
                  </div>
                  <p className="mt-2 text-2xl font-semibold">{k[1]}</p>
                </Card>
              ))}
            </div>
            <div className="space-y-3">
              {(repQ.data?.reviews ?? []).map((r: any) => (
                <Card key={r.id} c="rounded-lg">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="font-semibold">Project review</p>
                    <span className="text-amber-500">
                      {"★".repeat(r.rating)}
                      {"☆".repeat(5 - r.rating)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">{r.comment}</p>
                  <p className="mt-1 text-xs text-slate-400">{new Date(r.created_at).toLocaleDateString()}</p>
                </Card>
              ))}
              {!(repQ.data?.reviews ?? []).length && (
                <Card c="rounded-lg">
                  <p className="text-sm text-slate-500">Reviews from completed projects will appear here.</p>
                </Card>
              )}
            </div>
          </>
        )}

        {tab === "sent" && (
          <Card c="rounded-lg" p={false}>
            <TableScroll label="Offers sent">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    {["Task", "Project", "Match", "Status", ""].map((h) => (
                      <th key={h} className="px-4 py-2">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(sentQ.data ?? []).map((o: any) => (
                    <tr key={o.offer.id} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-semibold">{o.task.title}</td>
                      <td className="px-4 py-3">{o.project_title}</td>
                      <td className="px-4 py-3">{Math.round(o.offer.match_score)}%</td>
                      <td className="px-4 py-3">
                        <Tag
                          t={o.offer.status === "ACCEPTED" ? "green" : o.offer.status === "DECLINED" ? "red" : "amber"}
                        >
                          {o.offer.status.toLowerCase()}
                        </Tag>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {o.offer.status === "OFFERED" && (
                          <Btn
                            v="gray"
                            sm
                            onClick={() =>
                              act(() => api.patch(`/projects/task-offers/${o.offer.id}/cancel`), "Offer cancelled")
                            }
                          >
                            Cancel
                          </Btn>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!sentQ.loading && !(sentQ.data ?? []).length && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                        No task offers sent yet. Offer tasks from a project board.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </TableScroll>
          </Card>
        )}
      </div>
      <Modal open={!!submit} onClose={() => setSubmit(null)} title="Submit work for review">
        <p className="text-sm text-slate-600">{submit?.task.title}</p>
        <div className="mt-3 space-y-3">
          <Field label="Summary of what you delivered">
            <textarea
              rows={4}
              className={cx(inputCls, "h-auto py-2")}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </Field>
          <Field label="Links (PRs, docs), one per line">
            <textarea
              rows={2}
              className={cx(inputCls, "h-auto py-2")}
              value={links}
              onChange={(e) => setLinks(e.target.value)}
            />
          </Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Btn v="gray" onClick={() => setSubmit(null)}>
            Cancel
          </Btn>
          <Btn
            v="primary"
            onClick={() => {
              if (!summary.trim()) {
                setNotice("Describe what you delivered.");
                return;
              }
              const t = submit;
              setSubmit(null);
              act(
                () =>
                  api.post(`/projects/tasks/${t.task.id}/submissions`, {
                    summary: summary.trim(),
                    artifact_urls: links
                      .split("\n")
                      .map((l) => l.trim())
                      .filter(Boolean),
                  }),
                "Work submitted for review",
              );
            }}
          >
            Submit
          </Btn>
        </div>
      </Modal>
      <Notice text={notice} onDismiss={() => setNotice("")} />
    </div>
  );
}
