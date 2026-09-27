import { useEffect, useState } from "react";
import api, { extractErrorMessage } from "@/lib/api";
import { useApi, toFigmaJob, goRoute } from "./live";
import { useAuth } from "@/lib/auth";
const openJob = (id: string) => {
  localStorage.setItem("rap-selected-job", id);
  goRoute("jobs");
};
import { Ic, Av, Lg, Btn, Card, Tag, Tabs, Modal, Bar, cx, Field, inputCls, TableScroll } from "./rap_kit";

const visit = (page: string) => {
  goRoute(page);
};
function Empty({
  text = "No results yet",
  action = "Explore jobs",
  to = "jobs",
}: {
  text?: string;
  action?: string;
  to?: string;
}) {
  return (
    <Card c="p-10 text-center">
      <Ic n="inbox" s={36} c="mx-auto mb-3 text-slate-400" />
      <h2>{text}</h2>
      <p className="my-3 text-slate-500">Try another filter or explore the opportunities available.</p>
      <Btn onClick={() => visit(to)}>{action}</Btn>
    </Card>
  );
}

function Page({ title, sub, act, children, w }: { title: string; sub?: string; act?: any; children: any; w?: string }) {
  return (
    <div className="bg-[#F0F2F5] py-6">
      <div className={cx("mx-auto px-4", w || "max-w-[1200px]")}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
            {sub && <p className="text-sm text-slate-500">{sub}</p>}
          </div>
          <div className="flex gap-2">{act}</div>
        </div>
        {children}
      </div>
    </div>
  );
}
function Stat({ l, v, d, i }: { l: string; v: string; d?: string; i: string }) {
  return (
    <Card c="rounded-xl">
      <div className="flex items-center justify-between text-slate-500">
        <span className="text-sm">{l}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#E8F0FC] text-[#0552CC]">
          <Ic n={i} s={16} />
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900">{v}</p>
      {d && <p className="text-xs font-semibold text-emerald-600">{d}</p>}
    </Card>
  );
}

export function Dashboard() {
  /* Live */ const matches = useApi<any[]>("/matching/recommendations", { limit: 20 });
  const apps = useApi<any[]>("/applications/me", { limit: 100 });
  const prof = useApi<any>("/engineers/me");
  const active = (apps.data ?? []).filter((a: any) =>
    ["SUBMITTED", "APPLIED", "REVIEWING", "SHORTLISTED", "INVITED"].includes(a.application.status),
  ).length;
  const stat: Record<string, string> = {
    recs: matches.data ? `${matches.data.length} roles matched to you` : "",
    applications: apps.data ? `${active} active` : "",
    workspace: "",
  };
  return (
    <Page
      title="Your next chapter starts here"
      sub="Keep your profile, opportunities and current work in one place"
      act={
        <Btn onClick={() => visit("jobs")} icon="search">
          Find jobs
        </Btn>
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["My matches", "recs", "target", "Explore roles with a clear explanation of why they fit."],
          ["Applications", "applications", "file", "Follow your applications and invitations."],
          ["Current work", "workspace", "board", "Check your tasks, deliverables and milestones."],
        ].map(([title, path, icon, copy]) => (
          <Card key={path}>
            <Ic n={icon} c="text-blue-600" s={28} />
            <h2 className="mt-4">{title}</h2>
            <p className="my-3 text-sm text-slate-500">{copy}</p>
            {stat[path] && <p className="mb-3 text-sm font-semibold">{stat[path]}</p>}
            <Btn v="outline" onClick={() => visit(path)}>
              Open {title.toLowerCase()}
            </Btn>
          </Card>
        ))}
      </div>
      <Card c="mt-5">
        <h2>{prof.data ? "Make your profile work for you" : "Create your professional profile"}</h2>
        <p className="my-3 text-slate-500">
          Add your experience, skills and work preferences so employers can understand what you bring.
        </p>
        {prof.data?.profile_score != null && (
          <div className="mb-4 max-w-xs">
            <p className="mb-1 text-sm font-semibold">Profile {Math.round(prof.data.profile_score)}% complete</p>
            <Bar v={prof.data.profile_score} />
          </div>
        )}
        <Btn onClick={() => visit(prof.data ? "profile" : "onboarding")}>
          {prof.data ? "Review my profile" : "Build my profile"}
        </Btn>
        <Btn v="gray" c="ml-2" onClick={() => visit("onboarding")}>
          Import a resume
        </Btn>
      </Card>
      <Card c="mt-5">
        <h2>Recommended roles</h2>
        {matches.loading ? (
          <p className="mt-3 text-slate-500">Finding your best matches…</p>
        ) : !(matches.data ?? []).length ? (
          <p className="mt-3 text-slate-500">
            No matches yet — complete your skills and preferences and we’ll match you as jobs arrive.
          </p>
        ) : (
          (matches.data ?? [])
            .filter((m: any) => m.job)
            .slice(0, 3)
            .map((m: any) => (
              <button
                key={m.id}
                onClick={() => openJob(m.job.id)}
                className="flex w-full items-center gap-4 border-t border-slate-100 py-4 text-left first:mt-3"
              >
                <Lg name={m.job.company_name || m.job.title} />
                <span className="flex-1">
                  <b>{m.job.title}</b>
                  <span className="block text-sm text-slate-500">
                    {m.job.company_name} · {m.job.location || "Remote"}
                  </span>
                </span>
                <Tag t="blue">{Math.round(m.overall_score)}% match</Tag>
                <Ic n="right" />
              </button>
            ))
        )}
      </Card>
    </Page>
  );
}
export function Recs() {
  /* Live */ const [filter, setFilter] = useState("All");
  const matches = useApi<any[]>("/matching/recommendations", { limit: 50 });
  const savedQ = useApi<any[]>("/saved-jobs", { limit: 100 });
  const saved = new Set((savedQ.data ?? []).map((j: any) => j.id));
  const all = (matches.data ?? []).filter((m: any) => m.job && m.status !== "dismissed");
  const rows = all.filter(
    (m: any) => filter === "All" || (m.job.job_type || "").toLowerCase().includes(filter.toLowerCase()),
  );
  const toggle = async (id: string) => {
    await (saved.has(id) ? api.delete(`/saved-jobs/${id}`) : api.post(`/saved-jobs/${id}`));
    savedQ.reload();
  };
  return (
    <Page
      title="Matches for you"
      sub="Compare your skills, experience, role, timezone, availability, rate and remote preferences."
    >
      <Tabs items={["All", "Contract", "Full-time"]} v={filter} set={setFilter} />
      <div className="mt-5 space-y-4">
        {matches.loading && (
          <Card>
            <p className="text-slate-500">Finding your best matches…</p>
          </Card>
        )}
        {rows.map((m: any) => {
          const j = toFigmaJob(m.job);
          return (
            <Card key={m.id}>
              <div className="flex items-start gap-4">
                <Lg name={j.co} />
                <div className="flex-1">
                  <button onClick={() => openJob(j.id)} className="text-left text-lg font-bold text-blue-700">
                    {j.t}
                  </button>
                  <p className="mt-1 text-sm text-slate-500">{[j.co, j.loc, j.pay].filter(Boolean).join(" · ")}</p>
                </div>
                <Tag t="blue">{Math.round(m.overall_score)}% match</Tag>
              </div>
              <p className="my-4 text-sm text-slate-600">
                {m.reasoning || "Review the complete requirements before applying."}
              </p>
              <div className="flex gap-2">
                <Btn onClick={() => openJob(j.id)}>View match & apply</Btn>
                <Btn v="gray" icon="bookmark" onClick={() => toggle(j.id)}>
                  {saved.has(j.id) ? "Saved" : "Save job"}
                </Btn>
              </div>
            </Card>
          );
        })}
        {!matches.loading && !rows.length && (
          <Empty text={all.length ? "No matches for this filter" : "No matches yet"} />
        )}
      </div>
    </Page>
  );
}
export function Applications() {
  /* Live */ const [tab, setTab] = useState("All");
  const apps = useApi<any[]>("/applications/me", { limit: 100 });
  const rows = (apps.data ?? []).map((a: any) => ({
    id: a.application.id,
    jobId: a.job.id,
    title: a.job.title,
    company: a.job.company_name || "Company",
    status: a.application.status,
    note: a.application.cover_note || "",
  }));
  const [selected, setSelected] = useState<any>(null);
  const [withdraw, setWithdraw] = useState<any>(null);
  const [err, setErr] = useState("");
  const shown = rows.filter(
    (x) =>
      tab === "All" ||
      (tab === "Invitations"
        ? x.status === "INVITED"
        : tab === "Archived"
          ? ["WITHDRAWN", "REJECTED", "ACCEPTED"].includes(x.status)
          : !["WITHDRAWN", "REJECTED", "ACCEPTED", "INVITED"].includes(x.status)),
  );
  const act = async (fn: () => Promise<unknown>) => {
    setErr("");
    try {
      await fn();
      apps.reload();
    } catch (e) {
      setErr(extractErrorMessage(e, "That didn't work. Please try again."));
    }
  };
  return (
    <Page title="Your applications" sub="Every opportunity, with a clear next step">
      <Tabs items={["All", "Active", "Invitations", "Archived"]} v={tab} set={setTab} />
      {err && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {err}
        </p>
      )}
      <div className="mt-4 space-y-3">
        {apps.loading && (
          <Card>
            <p className="text-slate-500">Loading your applications…</p>
          </Card>
        )}
        {shown.map((x) => (
          <Card key={x.id}>
            <div className="flex flex-wrap items-center gap-4">
              <Lg name={x.company} />
              <div className="flex-1">
                <h3>{x.title}</h3>
                <p className="text-sm text-slate-500">{x.company}</p>
              </div>
              <Tag t={x.status === "REJECTED" ? "red" : "blue"}>{x.status.replaceAll("_", " ")}</Tag>
              <Btn v="gray" onClick={() => setSelected(x)}>
                View details
              </Btn>
              {!["WITHDRAWN", "REJECTED", "ACCEPTED", "INVITED"].includes(x.status) && (
                <Btn v="outline" onClick={() => setWithdraw(x)}>
                  Withdraw
                </Btn>
              )}
              {x.status === "INVITED" && (
                <>
                  <Btn onClick={() => act(() => api.patch(`/applications/${x.id}/respond`, { accept: true }))}>
                    Accept invitation
                  </Btn>
                  <Btn
                    v="gray"
                    onClick={() => act(() => api.patch(`/applications/${x.id}/respond`, { accept: false }))}
                  >
                    Decline
                  </Btn>
                </>
              )}
            </div>
          </Card>
        ))}
        {!apps.loading && !shown.length && <Empty text="No applications in this view" />}
      </div>
      <Modal open={!!selected} onClose={() => setSelected(null)} title="Application details">
        {selected && (
          <>
            <h2>{selected.title}</h2>
            <p className="my-2 text-slate-500">{selected.company}</p>
            <Tag t="blue">{selected.status}</Tag>
            <h3 className="mt-5">Your cover note</h3>
            <p className="my-3 text-slate-600">{selected.note || "No cover note attached."}</p>
            <p className="rounded-lg bg-blue-50 p-3 text-sm">
              You will receive a notification when the company updates your application.
            </p>
            <Btn
              c="mt-5"
              onClick={() => {
                setSelected(null);
                openJob(selected.jobId);
              }}
            >
              View job
            </Btn>
          </>
        )}
      </Modal>
      <Modal open={!!withdraw} onClose={() => setWithdraw(null)} title="Withdraw application?">
        <p className="mb-5 text-slate-600">
          This removes your application from the active pipeline. You can review it in Archived.
        </p>
        <div className="flex justify-end gap-2">
          <Btn v="gray" onClick={() => setWithdraw(null)}>
            Keep application
          </Btn>
          <Btn
            v="danger"
            onClick={() => {
              const w = withdraw;
              setWithdraw(null);
              act(() => api.patch(`/applications/${w.id}/withdraw`));
            }}
          >
            Withdraw application
          </Btn>
        </div>
      </Modal>
    </Page>
  );
}
export function Saved() {
  /* Live */ const q = useApi<any[]>("/saved-jobs", { limit: 100 });
  const rows = (q.data ?? []).map(toFigmaJob);
  return (
    <Page title="Saved jobs" sub="Keep interesting opportunities together until you’re ready">
      <div className="space-y-3">
        {q.loading && (
          <Card>
            <p className="text-slate-500">Loading…</p>
          </Card>
        )}
        {rows.map((j) => (
          <Card key={j.id}>
            <div className="flex flex-wrap items-center gap-3">
              <Lg name={j.co} />
              <div className="flex-1">
                <h3>{j.t}</h3>
                <p className="text-sm text-slate-500">{[j.co, j.pay].filter(Boolean).join(" · ")}</p>
              </div>
              <Btn onClick={() => openJob(j.id)}>View job</Btn>
              <Btn
                v="gray"
                onClick={async () => {
                  await api.delete(`/saved-jobs/${j.id}`);
                  q.reload();
                }}
              >
                Remove
              </Btn>
            </div>
          </Card>
        ))}
        {!q.loading && !rows.length && <Empty text="Your saved jobs will appear here" />}
      </div>
    </Page>
  );
}

export function Engineers() {
  // Live: /engineers (or /engineers/search when searching); Connect and (for companies) Invite to a job are real.
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [avail, setAvail] = useState(false);
  const [tz, setTz] = useState("Any");
  const [maxRate, setMaxRate] = useState(0);
  const [sort, setSort] = useState("match");
  const [notice, setNotice] = useState("");
  const [inviting, setInviting] = useState<any>(null);
  const q1 = useApi<any[]>(
    term ? "/engineers/search" : "/engineers",
    term ? { query: term, is_open_to_work: false, limit: 100 } : { limit: 100 },
  );
  const conns = useApi<any[]>(user ? "/connections" : null, { limit: 200 });
  const myJobs = useApi<any[]>(user?.role === "COMPANY" ? "/jobs/company" : null, { limit: 100 });
  const known = new Set((conns.data ?? []).flatMap((c: any) => [c.sender_id, c.receiver_id]));
  const region = (t?: string | null) => (t || "").split("/")[0].replace("America", "Americas");
  const ENGS = (q1.data ?? [])
    .filter((e: any) => e.user_id !== user?.id)
    .map((e: any) => ({
      id: e.id,
      uid: e.user_id,
      n: e.full_name || "Professional",
      r: e.headline || e.primary_role || "Professional",
      loc: e.location || "Remote",
      rate: e.hourly_rate ?? 0,
      sk: e.skills || [],
      av: e.availability || (e.is_open_to_work ? "Open to work" : "Not available"),
      exp: e.years_of_experience || 0,
      sc: e.profile_score != null ? Math.round(e.profile_score) : null,
      tz: region(e.timezone),
      verified: e.is_verified,
    }));
  const topRate = Math.max(0, ...ENGS.map((e: any) => e.rate));
  const cap = maxRate || topRate;
  const regions = ["Any", ...Array.from(new Set(ENGS.map((e: any) => e.tz).filter(Boolean)))].slice(0, 6) as string[];
  const list = ENGS.filter(
    (e: any) =>
      (!cap || e.rate <= cap) &&
      (!avail || /now|open/i.test(e.av)) &&
      (tz === "Any" || e.tz === tz) &&
      (e.n + e.r + e.sk.join(" ")).toLowerCase().includes(q.toLowerCase()),
  ).sort((x: any, y: any) =>
    sort === "match" ? (y.sc ?? 0) - (x.sc ?? 0) : sort === "rate" ? x.rate - y.rate : y.exp - x.exp,
  );
  const connect = async (uid: string) => {
    if (!user) {
      goRoute("login");
      return;
    }
    try {
      await api.post("/connections", { receiver_id: uid });
      conns.reload();
      setNotice("Connection request sent");
    } catch (e) {
      setNotice(extractErrorMessage(e, "Couldn't send that request."));
    }
  };
  const invite = async (jobId: string) => {
    try {
      await api.post(`/applications/jobs/${jobId}/invite/${inviting.id}`);
      setNotice(`${inviting.n} was invited to apply`);
    } catch (e) {
      setNotice(extractErrorMessage(e, "Couldn't send that invitation."));
    }
    setInviting(null);
  };
  const open = (id: string) => {
    sessionStorage.setItem("rap-person-id", id);
    goRoute("engineer");
  };
  return (
    <Page
      title="Professional directory"
      sub="Discover professionals by skills, availability and experience"
      w="max-w-none"
    >
      <div className="grid gap-4 grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)]">
        <Card c="h-fit rounded-xl" p="p-4">
          <p className="mb-3 text-[17px] font-bold">Filters</p>
          <label className="mb-1 block text-sm font-semibold">Keyword</label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setTerm(q.trim());
            }}
            className="mb-4 flex h-10 items-center gap-2 rounded-full bg-slate-100 px-3"
          >
            <Ic n="search" s={16} c="text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, role or skill"
              aria-label="Search professionals"
              className="w-full bg-transparent text-sm outline-none"
            />
          </form>
          <label className="mb-1 block text-sm font-semibold">Timezone</label>
          <div className="mb-4 flex flex-wrap gap-2">
            {regions.map((x) => (
              <button
                key={x}
                onClick={() => setTz(x)}
                className={cx(
                  "rounded-full px-3 py-1 text-sm font-semibold",
                  tz === x ? "bg-[#0552CC] text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                )}
              >
                {x}
              </button>
            ))}
          </div>
          {topRate > 0 && (
            <>
              <label className="mb-1 block text-sm font-semibold">Max hourly rate: USD {cap}</label>
              <input
                type="range"
                aria-label="Maximum hourly rate (USD)"
                min={0}
                max={topRate}
                value={cap}
                onChange={(e) => setMaxRate(Number(e.target.value))}
                className="mb-4 w-full"
              />
            </>
          )}
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={avail} onChange={(e) => setAvail(e.target.checked)} />
            Available now only
          </label>
          <div className="mt-4 rounded-lg bg-[#F3F0FF] p-3 text-sm">
            <p className="mb-1 flex items-center gap-1 font-bold text-[#5B4BDB]">
              <Ic n="spark" s={14} />
              AI tip
            </p>
            <p className="text-slate-700">
              {user?.role === "COMPANY"
                ? "Open a job’s Candidates view to see professionals ranked by match against that role."
                : "Keep your own profile complete so companies find you here."}
            </p>
          </div>
        </Card>
        <div>
          <Card c="mb-3 rounded-xl" p="p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">{q1.loading ? "Loading…" : `${list.length} professionals`}</p>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-slate-500">Sort by</span>
                {[
                  ["match", "Profile strength"],
                  ["rate", "Lowest rate"],
                  ["exp", "Experience"],
                ].map((x) => (
                  <button
                    key={x[0]}
                    onClick={() => setSort(x[0])}
                    className={cx(
                      "rounded-full px-3 py-1.5 font-semibold",
                      sort === x[0] ? "bg-[#E8F0FC] text-[#0552CC]" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
                    )}
                  >
                    {x[1]}
                  </button>
                ))}
              </div>
            </div>
          </Card>
          <div className="space-y-3">
            {list.map((e: any) => (
              <Card key={e.id} c="rounded-xl" p="p-4">
                <div className="flex flex-wrap items-start gap-4">
                  <Av name={e.n} s={64} />
                  <div className="min-w-[220px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => open(e.id)}
                        className="text-[17px] font-bold text-[#0552CC] hover:underline"
                      >
                        {e.n}
                      </button>
                      {e.sc != null && <Tag v="blue">{e.sc}% profile</Tag>}
                      {e.verified && <Tag v="gray">Verified</Tag>}
                    </div>
                    <p className="text-sm text-slate-700">{e.r}</p>
                    <p className="text-sm text-slate-500">
                      {e.loc} - {e.exp} yrs -{" "}
                      <span className={/now|open/i.test(e.av) ? "font-semibold text-emerald-700" : ""}>{e.av}</span>
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {e.sk.slice(0, 8).map((k: string) => (
                        <Tag key={k} v="gray">
                          {k}
                        </Tag>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    {e.rate > 0 && (
                      <p className="text-xl font-bold">
                        USD {e.rate}
                        <span className="text-sm font-medium text-slate-500">/hr</span>
                      </p>
                    )}
                    <div className="mt-2 flex justify-end gap-2">
                      <Btn
                        v={known.has(e.uid) ? "gray" : "outline"}
                        sm
                        onClick={() => !known.has(e.uid) && connect(e.uid)}
                      >
                        {known.has(e.uid) ? "Connected / pending" : "Connect"}
                      </Btn>
                      {user?.role === "COMPANY" && (
                        <Btn v="primary" sm onClick={() => setInviting(e)}>
                          Invite
                        </Btn>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
            {!q1.loading && list.length === 0 && (
              <Card c="rounded-xl" p="p-10">
                <p className="text-center text-slate-500">
                  No professionals match these filters. Try a broader search.
                </p>
              </Card>
            )}
          </div>
        </div>
      </div>
      <Modal open={!!inviting} onClose={() => setInviting(null)} title={`Invite ${inviting?.n ?? ""} to apply`}>
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
          <p className="text-slate-500">
            Post a job first, then invite professionals to apply.{" "}
            <button
              className="font-semibold text-[#0552CC]"
              onClick={() => {
                setInviting(null);
                goRoute("postjob");
              }}
            >
              Post a job
            </button>
          </p>
        )}
      </Modal>
      {notice && (
        <button onClick={() => setNotice("")} className="v2-toast">
          {notice} · Dismiss
        </button>
      )}
    </Page>
  );
}

export function Companies() {
  // Live: /companies/public with open-role counts from real postings.
  const [q, setQ] = useState("");
  const [hiring, setHiring] = useState(false);
  const cos = useApi<any[]>("/companies/public", { limit: 100 });
  const jobs = useApi<any[]>("/jobs", { source: "DIRECT", limit: 100 });
  const roles = (id: string) => (jobs.data ?? []).filter((j: any) => j.company_id === id).length;
  const COS = (cos.data ?? []).map((c: any) => ({
    id: c.id,
    n: c.name,
    ind: c.industry || "Technology",
    size: c.company_size || "—",
    loc: c.location || "Remote",
    jobs: roles(c.id),
    hiring: c.hiring_status === "actively_hiring" || roles(c.id) > 0,
    tag: (c.tech_stack || []).join(", "),
    verified: c.is_verified,
  }));
  const list = COS.filter(
    (c: any) => (!hiring || c.hiring) && (c.n + c.ind + c.tag).toLowerCase().includes(q.toLowerCase()),
  );
  const open = (id: string) => {
    sessionStorage.setItem("rap-company-id", id);
    goRoute("company");
  };
  return (
    <Page title="Companies" sub="Discover teams hiring remote professionals" w="max-w-none">
      <Card c="mb-4 rounded-xl" p="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-10 flex-1 items-center gap-2 rounded-full bg-slate-100 px-3" style={{ minWidth: 220 }}>
            <Ic n="search" s={16} c="text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search companies, industries or focus"
              aria-label="Search companies"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          <button
            onClick={() => setHiring(!hiring)}
            className={cx(
              "h-10 rounded-full px-4 text-sm font-semibold",
              hiring ? "bg-[#0552CC] text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
            )}
          >
            Hiring now
          </button>
          <span className="text-sm text-slate-500">{cos.loading ? "Loading…" : `${list.length} companies`}</span>
        </div>
      </Card>
      <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
        {list.map((c: any) => (
          <Card key={c.id} c="rounded-xl" p="p-4">
            <div className="flex items-start gap-4">
              <Lg name={c.n} s={64} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[17px] font-bold text-[#0552CC]">{c.n}</p>
                  {c.hiring && <Tag v="blue">Hiring</Tag>}
                  {c.verified && <Tag v="gray">Verified</Tag>}
                </div>
                <p className="text-sm text-slate-700">
                  {c.ind} - {c.size} employees
                </p>
                <p className="text-sm text-slate-500">{c.loc}</p>
                {c.tag && <p className="mt-1 text-sm text-slate-500">Focus: {c.tag}</p>}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="text-sm text-slate-600">
                {c.jobs} open role{c.jobs === 1 ? "" : "s"}
              </span>
              <div className="flex gap-2">
                <Btn v="primary" sm onClick={() => open(c.id)}>
                  View page
                </Btn>
              </div>
            </div>
          </Card>
        ))}
        {!cos.loading && list.length === 0 && (
          <Card c="rounded-xl" p="p-10">
            <p className="text-center text-slate-500">No companies match your search.</p>
          </Card>
        )}
      </div>
    </Page>
  );
}

export function Settings() {
  /* Live: /auth/me, /engineers/me (open to work), /auth/logout-all */ const { user, updateUser, logout } = useAuth();
  const [tab, setTab] = useState("Account");
  const [name, setName] = useState(user?.full_name || "");
  const [open, setOpen] = useState<boolean | null>(null);
  const [pub, setPub] = useState<boolean | null>(null);
  const [delOpen, setDelOpen] = useState(false);
  const [delText, setDelText] = useState("");
  const [notice, setNotice] = useState("");
  const eng = user?.role === "ENGINEER";
  useEffect(() => {
    if (eng)
      api
        .get("/engineers/me")
        .then((r) => {
          setOpen(r.data.is_open_to_work !== false);
          setPub(r.data.is_public !== false);
        })
        .catch(() => {});
  }, [eng]);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setNotice("");
    try {
      await fn();
      setNotice(ok);
    } catch (e) {
      setNotice(extractErrorMessage(e, "That didn't work. Please try again."));
    }
  };
  return (
    <Page title="Settings" sub="Manage your account and how your profile appears">
      <div className="grid gap-5 md:grid-cols-[180px_1fr]">
        <div>
          {["Account", "Privacy", "Security"].map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setNotice("");
              }}
              className={cx(
                "mb-1 block w-full rounded-lg p-3 text-left",
                tab === t ? "bg-blue-100 font-semibold text-blue-700" : "hover:bg-slate-200",
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <Card>
          {tab === "Account" ? (
            <>
              <h2>Account details</h2>
              <Field label="Full name">
                <input className={inputCls + " mt-3"} value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <p className="my-4 text-sm text-slate-500">
                Signed in as <b>{user?.email}</b>. Your email is managed by your sign-in provider.
              </p>
              <Btn
                onClick={() => {
                  if (!name.trim()) {
                    setNotice("Enter your full name.");
                    return;
                  }
                  run(async () => {
                    await api.patch("/auth/me", { full_name: name.trim() });
                    updateUser({ full_name: name.trim() });
                  }, "Account changes saved.");
                }}
              >
                Save changes
              </Btn>
            </>
          ) : tab === "Privacy" ? (
            <>
              <h2>Profile visibility</h2>
              {eng ? (
                <label className="mt-5 flex items-start gap-3 border-t border-slate-100 pt-4">
                  <input
                    type="checkbox"
                    checked={!!open}
                    disabled={open === null}
                    onChange={(e) => setOpen(e.target.checked)}
                  />
                  <span>
                    <b>Open to work</b>
                    <p className="mt-1 text-sm font-normal text-slate-500">
                      Let hiring companies know you are exploring opportunities.
                    </p>
                  </span>
                </label>
              ) : (
                <p className="mt-4 text-sm text-slate-500">
                  Your company profile is public so professionals can learn about your team.
                </p>
              )}
              {eng && (
                <label className="mt-4 flex items-start gap-3 border-t border-slate-100 pt-4">
                  <input
                    type="checkbox"
                    checked={!!pub}
                    disabled={pub === null}
                    onChange={(e) => setPub(e.target.checked)}
                  />
                  <span>
                    <b>Show my profile publicly</b>
                    <p className="mt-1 text-sm font-normal text-slate-500">
                      When off, your profile is hidden from the directory, search, candidate matching and shared links.
                      Organisations you apply to can still see it.
                    </p>
                  </span>
                </label>
              )}
              {eng && (
                <Btn
                  c="mt-5"
                  onClick={() => {
                    /* Never save before the current values load: that would hide the profile. */ if (
                      open === null ||
                      pub === null
                    )
                      return;
                    run(
                      () => api.put("/engineers/me", { is_open_to_work: open, is_public: pub }),
                      "Privacy preferences saved.",
                    );
                  }}
                >
                  {open === null || pub === null ? "Loading…" : "Save preferences"}
                </Btn>
              )}
              <div className="mt-8 border-t border-slate-100 pt-5">
                <h2>Your data</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Download a copy of everything stored about you, or delete your account.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Btn
                    v="outline"
                    onClick={() =>
                      run(async () => {
                        const r = await api.get("/auth/me/export");
                        const url = URL.createObjectURL(
                          new Blob([JSON.stringify(r.data, null, 2)], { type: "application/json" }),
                        );
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "remote-ai-platform-data.json";
                        a.click();
                        URL.revokeObjectURL(url);
                      }, "Your data was downloaded.")
                    }
                  >
                    Download my data
                  </Btn>
                  {user?.role !== "ADMIN" && (
                    <Btn
                      v="gray"
                      onClick={() => {
                        setDelText("");
                        setDelOpen(true);
                      }}
                    >
                      Delete my account
                    </Btn>
                  )}
                </div>
              </div>
              <Modal open={delOpen} onClose={() => setDelOpen(false)} title="Delete your account?">
                <p className="text-sm text-slate-600">
                  This permanently deletes your account, profile, resume, applications, posts and messages you sent. It
                  can’t be undone.
                </p>
                <label className="mt-4 block text-sm font-semibold">
                  Type DELETE to confirm
                  <input className={inputCls + " mt-2"} value={delText} onChange={(e) => setDelText(e.target.value)} />
                </label>
                <div className="mt-5 flex justify-end gap-2">
                  <Btn v="gray" onClick={() => setDelOpen(false)}>
                    Cancel
                  </Btn>
                  <Btn
                    onClick={() => {
                      if (delText !== "DELETE") return;
                      run(async () => {
                        await api.delete("/auth/me", { data: { confirm: "DELETE" } });
                        setDelOpen(false);
                        // End the sign-in on every device, not just this one.
                        await logout({ everywhere: true });
                        visit("login");
                      }, "Your account was deleted.");
                    }}
                  >
                    {delText === "DELETE" ? "Delete my account" : "Type DELETE to continue"}
                  </Btn>
                </div>
              </Modal>
            </>
          ) : (
            <>
              <h2>Sign-in & security</h2>
              <p className="my-4 text-slate-500">Sign in with an email code or your connected identity provider.</p>
              <Btn v="outline" onClick={() => visit("forgot")}>
                Account recovery
              </Btn>
              <Btn
                v="gray"
                c="ml-2"
                onClick={() =>
                  run(async () => {
                    await api.post("/auth/logout-all");
                    await logout({ everywhere: true });
                    visit("login");
                  }, "Signed out of all sessions.")
                }
              >
                Sign out all sessions
              </Btn>
            </>
          )}
          {notice && (
            <p role="status" className="mt-5 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
              {notice}
            </p>
          )}
        </Card>
      </div>
    </Page>
  );
}
export function Onboarding() {
  /* Live: loads/saves the real engineer profile; resume import uses the real upload + AI parse. */ const [
    step,
    setStep,
  ] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<any>({
    headline: "",
    role: "",
    location: "",
    skills: "",
    rate: "",
    availability: "Available now",
    timezone: (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch {
        return "";
      }
    })(),
    bio: "",
  });
  const [error, setError] = useState("");
  const [imported, setImported] = useState("");
  const [exists, setExists] = useState(false);
  const steps = ["Start", "Resume", "Profile", "Preferences", "Ready"];
  const update = (k: string, v: string) => setData({ ...data, [k]: v });
  const fill = (p: any) =>
    setData((d: any) => ({
      ...d,
      headline: p.headline || d.headline,
      role: p.primary_role || d.role,
      location: p.location || d.location,
      skills: (p.skills || []).length ? p.skills.join(", ") : d.skills,
      bio: p.bio || d.bio,
      rate: p.hourly_rate != null ? String(p.hourly_rate) : d.rate,
      availability: p.availability || d.availability,
      timezone: p.timezone || d.timezone,
    }));
  useEffect(() => {
    api
      .get("/engineers/me")
      .then((r) => {
        setExists(true);
        fill(r.data);
      })
      .catch(() => {});
  }, []);
  const importResume = async () => {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      if (!exists) {
        await api.post("/engineers/me", {});
        setExists(true);
      }
      const form = new FormData();
      form.append("file", file);
      /* Upload, text extraction and AI parsing all happen in this request; the server caps parsing at 45 s, so wait longer than the 15 s default. */ const up =
        await api.post("/engineers/me/resume", form, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 90_000,
        });
      const r = await api.get("/engineers/me");
      fill(r.data);
      setImported(up.data?.message || "Resume uploaded.");
    } catch (e) {
      setError(extractErrorMessage(e, "We couldn't read that file. You can still build your profile by hand."));
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await api.post("/engineers/me", {
        headline: data.headline.trim() || undefined,
        primary_role: data.role.trim() || undefined,
        location: data.location.trim() || undefined,
        bio: data.bio.trim() || undefined,
        skills: data.skills
          .split(",")
          .map((s: string) => s.trim())
          .filter(Boolean),
        hourly_rate: data.rate ? Number(data.rate) : undefined,
        timezone: data.timezone.trim() || undefined,
        availability: data.availability,
        is_open_to_work: data.availability !== "Not available",
      });
      setStep(4);
    } catch (e) {
      setError(extractErrorMessage(e, "We couldn't save your profile. Check your entries and try again."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Page
      title="Build your professional profile"
      sub="A few details help the right opportunities find you"
      w="max-w-[900px]"
    >
      <Card>
        <div className="mb-7 flex gap-2">
          {steps.map((label, i) => (
            <div key={label} className="flex-1">
              <div className={cx("mb-2 h-1 rounded-full", i <= step ? "bg-blue-600" : "bg-slate-200")} />
              <span className="text-xs text-slate-500">
                {i + 1}. {label}
              </span>
            </div>
          ))}
        </div>
        {step === 0 ? (
          <>
            <h2>Let’s get to know your work</h2>
            <p className="my-4 text-slate-500">
              Import a resume or build your profile by hand. You can review and edit every detail before sharing it.
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <button onClick={() => setStep(1)} className="rounded-xl border border-blue-200 bg-blue-50 p-6 text-left">
                <Ic n="file" c="text-blue-600" />
                <h3 className="mt-3">Start with your resume</h3>
                <p className="mt-2 text-sm text-slate-500">PDF or DOCX, with a review step.</p>
              </button>
              <button onClick={() => setStep(2)} className="rounded-xl border border-slate-200 p-6 text-left">
                <Ic n="edit" />
                <h3 className="mt-3">Build it myself</h3>
                <p className="mt-2 text-sm text-slate-500">Add your skills and experience.</p>
              </button>
            </div>
          </>
        ) : step === 1 ? (
          <>
            <h2>Import your resume</h2>
            <p className="my-3 text-sm text-slate-500">
              We read your resume with AI and fill in any empty profile fields. You can review and edit everything on
              the next step.
            </p>
            <label className="mt-4 block rounded-xl border-2 border-dashed border-slate-300 p-8 text-center">
              <Ic n="file" s={32} c="mx-auto mb-3 text-blue-600" />
              <span className="block">Choose a PDF or DOCX</span>
              <input
                aria-label="Resume file"
                type="file"
                accept=".pdf,.docx"
                className="mt-4 max-w-full text-sm"
                onChange={(e) => {
                  setFile(e.target.files?.[0] || null);
                  setImported("");
                }}
              />
            </label>
            {file && <p className="mt-3 text-sm">Selected: {file.name}</p>}
            {imported && (
              <p role="status" className="mt-3 text-sm text-green-700">
                {imported}
              </p>
            )}
            <Btn v="outline" c="mt-4" onClick={importResume}>
              {busy ? "Reading your resume…" : "Import with AI"}
            </Btn>
          </>
        ) : step === 2 ? (
          <>
            <h2>Review your profile</h2>
            <p className="my-3 text-sm text-slate-500">Describe the work you want to be known for.</p>
            <div className="space-y-4">
              {[
                ["headline", "Professional headline"],
                ["role", "Primary role"],
                ["location", "Location"],
                ["skills", "Skills, separated by commas"],
              ].map(([key, label]) => (
                <Field key={key} label={label}>
                  <input className={inputCls} value={data[key]} onChange={(e) => update(key, e.target.value)} />
                </Field>
              ))}
              <Field label="About you">
                <textarea
                  className={inputCls + " !h-24 py-2"}
                  value={data.bio}
                  onChange={(e) => update("bio", e.target.value)}
                />
              </Field>
            </div>
          </>
        ) : step === 3 ? (
          <>
            <h2>Your work preferences</h2>
            <div className="mt-4 space-y-4">
              <Field label="Hourly rate (USD)">
                <input
                  type="number"
                  min="0"
                  className={inputCls}
                  value={data.rate}
                  onChange={(e) => update("rate", e.target.value)}
                />
              </Field>
              <Field label="Timezone">
                <input
                  className={inputCls}
                  value={data.timezone}
                  onChange={(e) => update("timezone", e.target.value)}
                />
              </Field>
              <Field label="Availability">
                <select
                  className={inputCls}
                  value={data.availability}
                  onChange={(e) => update("availability", e.target.value)}
                >
                  {["Available now", "In 2 weeks", "In 1 month", "Not available"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
            </div>
          </>
        ) : (
          <div className="py-8 text-center">
            <Ic n="check" s={40} c="mx-auto text-green-600" />
            <h2 className="mt-4">You’re ready to explore</h2>
            <p className="my-3 text-slate-500">
              Your profile is saved. Discover roles and refine your profile at any time.
            </p>
            <Btn onClick={() => visit("dash")}>Go to my dashboard</Btn>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-red-600">
            {error}
          </p>
        )}
        {step > 0 && step < 4 && (
          <div className="mt-6 flex justify-between border-t border-slate-200 pt-4">
            <Btn
              v="gray"
              onClick={() => {
                setError("");
                setStep(step - 1);
              }}
            >
              Back
            </Btn>
            <Btn
              onClick={() => {
                if (step === 2 && (!data.headline.trim() || !data.skills.trim())) {
                  setError("Add a headline and at least one skill to continue.");
                  return;
                }
                setError("");
                if (step === 3) {
                  save();
                  return;
                }
                setStep(step + 1);
              }}
            >
              {step === 1 ? "Review profile" : step === 3 ? (busy ? "Saving…" : "Save profile") : "Continue"}
            </Btn>
          </div>
        )}
      </Card>
    </Page>
  );
}
export function CoDash() {
  return (
    <Page
      title="Your hiring workspace"
      sub="Find the right people and keep hiring moving"
      act={
        <Btn icon="plus" onClick={() => visit("postjob")}>
          Post a job
        </Btn>
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["Job postings", "cojobs", "briefcase", "Manage active and paused roles."],
          ["Candidates", "candidates", "users", "Review applications and explainable matches."],
          ["Contracts & delivery", "contracts", "file", "Turn an accepted application into a clear agreement."],
        ].map(([title, path, icon, copy]) => (
          <Card key={path}>
            <Ic n={icon} s={28} c="text-blue-600" />
            <h2 className="mt-4">{title}</h2>
            <p className="my-3 text-sm text-slate-500">{copy}</p>
            <Btn v="outline" onClick={() => visit(path)}>
              Open {title.toLowerCase()}
            </Btn>
          </Card>
        ))}
      </div>
      <Card c="mt-5">
        <h2>A clear path from hiring to delivery</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {[
            ["1", "Post a role", "postjob"],
            ["2", "Review candidates", "candidates"],
            ["3", "Agree on a contract", "contracts"],
            ["4", "Start the project", "workspace"],
          ].map(([n, title, path]) => (
            <button key={n} onClick={() => visit(path)} className="rounded-lg bg-slate-50 p-4 text-left">
              <span className="text-blue-600">{n}</span>
              <b className="mt-2 block">{title} →</b>
            </button>
          ))}
        </div>
      </Card>
      <Card c="mt-5">
        <h2>Your company profile</h2>
        <p className="my-3 text-slate-500">
          Give professionals a clear picture of your team, mission and working style.
        </p>
        <Btn onClick={() => visit("coprofile")}>Edit company profile</Btn>
      </Card>
    </Page>
  );
}

const STAGES = ["Applied", "Screening", "Interview", "Offer", "Hired"];
export function PostJob() {
  const steps = ["Basics", "Requirements", "Budget and contract", "Review"];
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("Contract");
  const [level, setLevel] = useState("Senior");
  const [desc, setDesc] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [skill, setSkill] = useState("");
  const [rate, setRate] = useState("");
  const [hours, setHours] = useState("40");
  const [tz, setTz] = useState("Europe (CET +/- 3h)");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const company = useApi<any>("/companies/me");
  const coName = company.data?.name || "Your company";
  const publish = async () => {
    if (title.trim().length < 2 || !desc.trim()) {
      setErr("Add a job title and description before publishing.");
      setStep(0);
      return;
    }
    setBusy(true);
    setErr("");
    const r = rate ? Number(rate) : undefined;
    try {
      await api.post("/jobs", {
        title: title.trim(),
        description: desc.trim(),
        job_type: ({ Contract: "contract", "Full-time": "full-time", "Fixed price project": "freelance" } as any)[kind],
        experience_level: ({ Mid: "mid", Senior: "senior", Staff: "lead", Principal: "lead" } as any)[level],
        skills,
        remote_preference: tz,
        salary_min: r,
        salary_max: r,
        salary_period: r ? "hour" : undefined,
        currency: "USD",
        timeline: hours ? `${hours} hrs/week` : undefined,
        is_remote: true,
        location: "Remote",
      });
      setDone(true);
    } catch (e) {
      setErr(
        extractErrorMessage(
          e,
          company.data ? "We couldn't publish this job." : "Create your company profile before posting a job.",
        ),
      );
    } finally {
      setBusy(false);
    }
  };
  const lbl = "mb-1 block text-sm font-semibold";
  return (
    <Page title="Post a job" sub="Publish a role — AI ranks applicants by explainable match" w="max-w-none">
      <div className="grid gap-4 grid-cols-1 2xl:grid-cols-[220px_minmax(0,1fr)_300px]">
        <Card c="rounded-xl h-fit flex flex-wrap gap-1 2xl:block" p="p-2">
          {steps.map((x, i) => (
            <button
              key={x}
              onClick={() => setStep(i)}
              className={cx(
                "flex items-center gap-2 2xl:w-full rounded-lg px-3 py-2 text-left text-sm font-semibold",
                i === step ? "bg-[#E8F0FC] text-[#0552CC]" : "text-slate-700 hover:bg-slate-100",
              )}
            >
              <span
                className={cx(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold",
                  i < step
                    ? "bg-[#0552CC] text-white"
                    : i === step
                      ? "border-2 border-[#0552CC] text-[#0552CC]"
                      : "bg-slate-200 text-slate-600",
                )}
              >
                {i < step ? <Ic n="check" s={14} /> : i + 1}
              </span>
              {x}
            </button>
          ))}
        </Card>
        <Card c="rounded-xl" p="p-6">
          {done ? (
            <div className="py-10 text-center">
              <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#E8F0FC] text-[#0552CC]">
                <Ic n="check" s={28} />
              </span>
              <h2 className="text-xl font-bold">Job published</h2>
              <p className="mt-1 text-sm text-slate-500">
                Your role is live. Candidates are ranked by explainable match as they apply.
              </p>
              <div className="mt-4 flex justify-center gap-2">
                <Btn v="primary" icon="users" onClick={() => visit("candidates")}>
                  View candidates
                </Btn>
                <Btn
                  v="outline"
                  onClick={() => {
                    setDone(false);
                    setStep(0);
                    setTitle("");
                    setDesc("");
                    setSkills([]);
                  }}
                >
                  Post another
                </Btn>
              </div>
            </div>
          ) : (
            <>
              <h2 className="mb-4 text-xl font-bold">{steps[step]}</h2>
              {step === 0 && (
                <div className="space-y-4">
                  <div>
                    <label className={lbl} htmlFor="pj-job-title">
                      Job title
                    </label>
                    <input
                      id="pj-job-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
                    <label className="block">
                      <span className={lbl}>Engagement</span>
                      <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls}>
                        <option>Contract</option>
                        <option>Full-time</option>
                        <option>Fixed price project</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className={lbl}>Seniority</span>
                      <select value={level} onChange={(e) => setLevel(e.target.value)} className={inputCls}>
                        <option>Mid</option>
                        <option>Senior</option>
                        <option>Staff</option>
                        <option>Principal</option>
                      </select>
                    </label>
                  </div>
                  <div>
                    <label className={lbl} htmlFor="pj-description">
                      Description
                    </label>
                    <textarea
                      id="pj-description"
                      value={desc}
                      onChange={(e) => setDesc(e.target.value)}
                      rows={5}
                      className={inputCls}
                    />
                  </div>
                </div>
              )}
              {step === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className={lbl}>Required skills</label>
                    <div className="flex flex-wrap gap-2">
                      {skills.map((k) => (
                        <button
                          key={k}
                          onClick={() => setSkills(skills.filter((x) => x !== k))}
                          className="flex items-center gap-1 rounded-full bg-[#E8F0FC] px-3 py-1 text-sm font-semibold text-[#0552CC]"
                        >
                          {k}
                          <Ic n="x" s={12} />
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <input
                        value={skill}
                        onChange={(e) => setSkill(e.target.value)}
                        placeholder="Add a skill"
                        aria-label="Add a required skill"
                        className={inputCls}
                      />
                      <Btn
                        v="outline"
                        onClick={() => {
                          if (skill.trim()) {
                            setSkills([...skills, skill.trim()]);
                            setSkill("");
                          }
                        }}
                      >
                        Add
                      </Btn>
                    </div>
                  </div>
                  <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
                    <label className="block">
                      <span className={lbl}>Timezone overlap</span>
                      <select value={tz} onChange={(e) => setTz(e.target.value)} className={inputCls}>
                        <option>Europe (CET +/- 3h)</option>
                        <option>US East (+/- 3h)</option>
                        <option>Asia Pacific</option>
                        <option>Any</option>
                      </select>
                    </label>
                  </div>
                </div>
              )}
              {step === 2 && (
                <div className="space-y-4">
                  <div className="grid gap-4 grid-cols-1 xl:grid-cols-2">
                    <div>
                      <label className={lbl} htmlFor="pj-hourly-rate-usd">
                        Hourly rate (USD)
                      </label>
                      <input
                        id="pj-hourly-rate-usd"
                        value={rate}
                        onChange={(e) => setRate(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={lbl} htmlFor="pj-hours-per-week">
                        Hours per week
                      </label>
                      <input
                        id="pj-hours-per-week"
                        value={hours}
                        onChange={(e) => setHours(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                  </div>
                  <div className="rounded-lg bg-[#E8F0FC] p-4 text-sm">
                    <p className="font-semibold text-[#0552CC]">Estimated monthly spend</p>
                    <p className="mt-1 text-2xl font-bold">USD {(Number(rate) * Number(hours) * 4).toLocaleString()}</p>
                    <p className="text-slate-600">
                      {hours} hrs x 4 weeks at USD {rate}/hr + 5% platform fee on release
                    </p>
                  </div>
                </div>
              )}
              {step === 3 && (
                <div className="space-y-3 text-sm">
                  {[
                    ["Title", title],
                    ["Engagement", kind + " - " + level],
                    ["Skills", skills.join(", ")],
                    ["Timezone", tz],
                    ["Budget", "USD " + rate + "/hr x " + hours + " hrs/week"],
                  ].map((x) => (
                    <div key={x[0]} className="flex justify-between border-b border-slate-100 pb-2">
                      <span className="text-slate-500">{x[0]}</span>
                      <span className="font-semibold">{x[1]}</span>
                    </div>
                  ))}
                </div>
              )}
              {err && (
                <p role="alert" className="mt-4 text-sm text-red-600">
                  {err}
                </p>
              )}
              <div className="mt-6 flex justify-between border-t border-slate-200 pt-4">
                <Btn v="gray" onClick={() => setStep(Math.max(0, step - 1))}>
                  Back
                </Btn>
                {step < 3 ? (
                  <Btn v="primary" onClick={() => setStep(step + 1)}>
                    Continue
                  </Btn>
                ) : (
                  <Btn v="primary" icon="send" onClick={publish}>
                    {busy ? "Publishing…" : "Publish job"}
                  </Btn>
                )}
              </div>
            </>
          )}
        </Card>
        <div className="space-y-4">
          <Card c="rounded-xl" p="p-4">
            <p className="mb-2 text-xs font-semibold text-slate-500">Live preview</p>
            <div className="flex gap-3">
              <Lg name={coName} s={48} />
              <div>
                <p className="font-bold text-[#0552CC]">{title || "Job title"}</p>
                <p className="text-sm text-slate-600">{coName} - Remote</p>
                <p className="text-sm text-slate-500">
                  {kind} - {level}
                  {rate ? ` - USD ${rate}/hr` : ""}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {skills.map((k) => (
                <Tag key={k} v="gray">
                  {k}
                </Tag>
              ))}
            </div>
          </Card>
          <Card c="rounded-xl bg-[#F3F0FF]" p="p-4">
            <p className="mb-1 flex items-center gap-2 font-bold text-[#5B4BDB]">
              <Ic n="spark" s={16} />
              How matching works
            </p>
            <p className="text-sm text-slate-700">
              Applicants are scored on skills, experience, role fit, timezone, availability and rate against this brief
              — with the reasoning shown for every candidate.
            </p>
          </Card>
        </div>
      </div>
    </Page>
  );
}

export function Candidates() {
  const [q, setQ] = useState("");
  const [min, setMin] = useState(0);
  // Live: real applications for this company's jobs; pipeline moves are real status changes.
  const appsQ = useApi<any[]>("/applications/company", { limit: 100 });
  const [err, setErr] = useState("");
  const stageOf = (st: string) => (st === "REVIEWING" ? 1 : st === "SHORTLISTED" ? 2 : st === "ACCEPTED" ? 4 : 0);
  const NEXT: Record<string, string> = {
    SUBMITTED: "REVIEWING",
    APPLIED: "REVIEWING",
    INVITED: "REVIEWING",
    REVIEWING: "SHORTLISTED",
    SHORTLISTED: "ACCEPTED",
  };
  const list = (appsQ.data ?? [])
    .filter((a: any) => !["REJECTED", "WITHDRAWN"].includes(a.application.status))
    .map((a: any) => ({
      id: a.application.id,
      userId: a.candidate.id,
      status: a.application.status,
      job: a.job.title,
      n: a.candidate.full_name || "Candidate",
      r: a.candidate.headline || a.candidate.primary_role || "Professional",
      sc: a.match ? Math.round(a.match.overall_score) : null,
      m: a.match,
      sk: a.candidate.skills || [],
      st: stageOf(a.application.status),
      ex: a.candidate.years_of_experience ? `${a.candidate.years_of_experience} yrs` : "—",
      loc: a.candidate.location || "Remote",
      rate: a.candidate.hourly_rate != null ? `USD ${a.candidate.hourly_rate}/hr` : "—",
      why:
        a.match?.reasoning ||
        a.application.cover_note ||
        "Match details appear once the candidate's match for this role has been calculated.",
    }));
  const setStatus = async (id: string, status: string) => {
    setErr("");
    try {
      await api.patch(`/applications/${id}/status`, { status });
      appsQ.reload();
    } catch (e) {
      setErr(extractErrorMessage(e, "That move isn't allowed for this application."));
    }
  };
  const message = async (userId: string) => {
    try {
      await api.post("/conversations", { participant_id: userId });
    } catch {}
    visit("messenger");
  };
  const exportCsv = () => {
    const rows = [
      ["Name", "Role", "Job", "Status", "Match", "Skills", "Location"],
      ...shown.map((c: any) => [c.n, c.r, c.job, c.status, c.sc ?? "", c.sk.join("; "), c.loc]),
    ];
    const blob = new Blob(
      [rows.map((r) => r.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n")],
      { type: "text/csv" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "candidates.csv";
    a.click();
  };
  const [sel, setSel] = useState<any>(null);
  const [saved, setSaved] = useState<number[]>([]);
  const toggleSaved = (id: number) => setSaved((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const [savedOnly, setSavedOnly] = useState(false);
  const move = (id: string, d: number) => {
    const c = list.find((x: any) => x.id === id);
    if (!c) return;
    if (d < 0) {
      setErr("Applications can't be moved back to an earlier stage.");
      return;
    }
    const next = NEXT[c.status];
    if (next) setStatus(id, next);
  };
  const shown = list.filter(
    (c: any) =>
      (c.sc ?? 0) >= min &&
      (!savedOnly || saved.includes(c.id)) &&
      (c.n + c.r + c.sk.join(" ")).toLowerCase().includes(q.toLowerCase()),
  );
  const cur = sel ? list.find((c) => c.id === sel) : null;
  return (
    <Page
      title="Candidates"
      sub="Applicants across your job postings - ranked by explainable match"
      w="max-w-none"
      act={
        <>
          <Btn v="outline" icon="download" onClick={exportCsv}>
            Export
          </Btn>
          <Btn v="primary" icon="users" onClick={() => visit("engineers")}>
            Invite candidates
          </Btn>
        </>
      }
    >
      <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
        <Stat l="Total applicants" v={String(list.length)} i="users" />
        <Stat
          l="Avg match score"
          v={(() => {
            const s2 = list.filter((c: any) => c.sc != null);
            return s2.length ? Math.round(s2.reduce((a: number, c: any) => a + c.sc, 0) / s2.length) + "%" : "—";
          })()}
          i="target"
        />
        <Stat l="Interviews" v={String(list.filter((c: any) => c.st === 2).length)} i="calendar" />
        <Stat l="Hired" v={String(list.filter((c: any) => c.st === 4).length)} i="check" />
      </div>
      <Card c="mt-4 rounded-xl" p="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex h-10 flex-1 items-center gap-2 rounded-full bg-slate-100 px-3" style={{ minWidth: 220 }}>
            <Ic n="search" s={16} c="text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, role or skill"
              className="w-full bg-transparent text-sm outline-none"
            />
          </div>
          {[
            ["All", 0],
            ["90+", 90],
            ["95+", 95],
          ].map((x: any) => (
            <button
              key={x[0]}
              onClick={() => setMin(x[1])}
              className={cx(
                "h-10 rounded-full px-4 text-sm font-semibold",
                min === x[1] ? "bg-[#E8F0FC] text-[#0552CC]" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
              )}
            >
              Match {x[0]}
            </button>
          ))}
          <button
            onClick={() => setSavedOnly(!savedOnly)}
            className={cx(
              "flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold",
              savedOnly ? "bg-[#E8F0FC] text-[#0552CC]" : "bg-slate-100 text-slate-700 hover:bg-slate-200",
            )}
          >
            <Ic n="bookmark" s={14} />
            {saved.length > 0 ? `Saved (${saved.length})` : "Saved"}
          </button>
          <span className="ml-auto text-sm text-slate-500">{shown.length} candidates</span>
        </div>
      </Card>
      {err && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {err}
        </p>
      )}
      {appsQ.loading && <p className="mt-3 text-sm text-slate-500">Loading candidates…</p>}
      <div className={cx("mt-4 grid gap-4", cur ? "grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px]" : "")}>
        <div
          className="grid auto-cols-[240px] grid-flow-col gap-3 overflow-x-auto pb-2"
          tabIndex={0}
          role="region"
          aria-label="Candidate pipeline"
        >
          {STAGES.map((sg, si) => {
            const col = shown.filter((c) => c.st === si);
            return (
              <div key={sg} className="rounded-xl bg-slate-200/70 p-2">
                <div className="mb-2 flex items-center justify-between px-2 pt-1">
                  <p className="text-sm font-bold">{sg}</p>
                  <span className="rounded-full bg-white px-2 text-xs font-bold text-slate-600">{col.length}</span>
                </div>
                <div className="space-y-2">
                  {col.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => setSel(c.id)}
                      className={cx(
                        "cursor-pointer rounded-lg bg-white p-3 shadow-sm hover:shadow-md",
                        sel === c.id && "ring-2 ring-[#0552CC]",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Av name={c.n} s={36} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold">{c.n}</p>
                          <p className="truncate text-xs text-slate-500">{c.r}</p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSaved(c.id);
                          }}
                          className={cx(
                            "rounded-full p-1",
                            saved.includes(c.id) ? "text-[#0552CC]" : "text-slate-400 hover:text-slate-600",
                          )}
                        >
                          <Ic n="bookmark" s={15} />
                        </button>
                        {c.sc != null && (
                          <span className="rounded-full bg-[#E8F0FC] px-2 py-0.5 text-xs font-bold text-[#0552CC]">
                            {c.sc}%
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {c.sk.slice(0, 3).map((k: string) => (
                          <span key={k} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                            {k}
                          </span>
                        ))}
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                        <span>
                          {c.loc} - {c.ex}
                        </span>
                        <span className="flex gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              move(c.id, -1);
                            }}
                            className="rounded bg-slate-100 px-1.5 hover:bg-slate-200"
                          >
                            Back
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              move(c.id, 1);
                            }}
                            className="rounded bg-[#0552CC] px-1.5 text-white hover:bg-[#0443A8]"
                          >
                            Move
                          </button>
                        </span>
                      </div>
                    </div>
                  ))}
                  {col.length === 0 && (
                    <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
                      No candidates
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {cur && (
          <Card c="h-fit rounded-xl" p="p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Av name={cur.n} s={56} />
                <div>
                  <p className="text-lg font-bold">{cur.n}</p>
                  <p className="text-sm text-slate-500">{cur.r}</p>
                </div>
              </div>
              <button onClick={() => setSel(null)} className="rounded-full p-1 hover:bg-slate-100">
                <Ic n="x" s={16} />
              </button>
            </div>
            <div className="mt-3 rounded-lg bg-[#E8F0FC] p-3">
              <p className="text-sm font-bold text-[#0552CC]">
                {cur.m ? `Match ${cur.sc}%` : "Match not calculated yet"}
              </p>
              {(cur.m
                ? [
                    ["Skills", Math.round(cur.m.skill_score)],
                    ["Experience", Math.round(cur.m.experience_score)],
                    ["Timezone", Math.round(cur.m.timezone_score)],
                    ["Availability", Math.round(cur.m.availability_score)],
                  ]
                : []
              ).map((x: any) => (
                <div key={x[0]} className="mt-2">
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>{x[0]}</span>
                    <span>{x[1]}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white">
                    <div className="h-1.5 rounded-full bg-[#0552CC]" style={{ width: x[1] + "%" }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-lg bg-[#F3F0FF] p-3 text-sm">
              <p className="mb-1 flex items-center gap-1 font-bold text-[#5B4BDB]">
                <Ic n="spark" s={14} />
                Why this match
              </p>
              <p className="text-slate-700">{cur.why}</p>
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {cur.sk.map((k: string) => (
                <Tag key={k} v="gray">
                  {k}
                </Tag>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-slate-500">Rate</p>
                <p className="font-semibold">{cur.rate}</p>
              </div>
              <div>
                <p className="text-slate-500">Location</p>
                <p className="font-semibold">{cur.loc}</p>
              </div>
              <div>
                <p className="text-slate-500">Experience</p>
                <p className="font-semibold">{cur.ex}</p>
              </div>
              <div>
                <p className="text-slate-500">Stage</p>
                <p className="font-semibold">{STAGES[cur.st]}</p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Btn v="primary" icon="chat" full onClick={() => message(cur.userId)}>
                Message
              </Btn>
              <Btn
                v="outline"
                icon="calendar"
                full
                onClick={() =>
                  cur.status === "REVIEWING"
                    ? setStatus(cur.id, "SHORTLISTED")
                    : setErr("Move the candidate to screening first.")
                }
              >
                Interview
              </Btn>
              <Btn v="gray" full onClick={() => move(cur.id, 1)}>
                Advance
              </Btn>
              <Btn v="danger" full onClick={() => setStatus(cur.id, "REJECTED")}>
                Reject
              </Btn>
            </div>
          </Card>
        )}
      </div>
    </Page>
  );
}

export function CoJobs() {
  // Live: the company's real postings with applicant counts; pause / reactivate.
  const jobs = useApi<any[]>("/jobs/company", { limit: 100 });
  const apps = useApi<any[]>("/applications/company", { limit: 100 });
  const [err, setErr] = useState("");
  const count = (id: string, st?: string[]) =>
    (apps.data ?? []).filter((a: any) => a.job.id === id && (!st || st.includes(a.application.status))).length;
  const toggle = async (j: any) => {
    setErr("");
    try {
      await api.patch(`/jobs/${j.id}`, { is_active: !j.is_active });
      jobs.reload();
    } catch (e) {
      setErr(extractErrorMessage(e, "We couldn't update that job."));
    }
  };
  const rows = jobs.data ?? [];
  return (
    <Page
      title="Job postings"
      act={
        <Btn v="primary" icon="plus" onClick={() => visit("postjob")}>
          Post a job
        </Btn>
      }
    >
      {err && (
        <p role="alert" className="mb-3 text-sm text-red-600">
          {err}
        </p>
      )}
      <Card p={false} c="rounded-xl">
        <TableScroll label="Job postings">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                {["Job", "Status", "Applicants", "Shortlisted", ""].map((h) => (
                  <th key={h} className="px-4 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold">{r.title}</td>
                  <td className="px-4 py-3">
                    <Tag t={r.is_active ? "green" : "amber"}>{r.is_active ? "Active" : "Paused"}</Tag>
                  </td>
                  <td className="px-4 py-3">{count(r.id)}</td>
                  <td className="px-4 py-3">{count(r.id, ["SHORTLISTED", "ACCEPTED"])}</td>
                  <td className="px-4 py-3 text-right">
                    <Btn v="gray" sm onClick={() => openJob(r.id)}>
                      View
                    </Btn>{" "}
                    <Btn v="outline" sm onClick={() => toggle(r)}>
                      {r.is_active ? "Pause" : "Reactivate"}
                    </Btn>
                  </td>
                </tr>
              ))}
              {!jobs.loading && !rows.length && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    No job postings yet.{" "}
                    <button className="font-semibold text-[#0552CC]" onClick={() => visit("postjob")}>
                      Post your first job
                    </button>
                  </td>
                </tr>
              )}
              {jobs.loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    Loading…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </TableScroll>
      </Card>
    </Page>
  );
}
