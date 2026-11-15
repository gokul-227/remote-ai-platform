// k6 capacity test: the production traffic mix against a LOCAL production-like stack
// seeded with tests/load/scale (10M jobs, 1M members). Never point it at production.
//
//   python3 tests/e2e/mock-supabase/server.py   # PORT=9998, issuer as the API expects
//   k6 run -e API=http://localhost:28039 -e AUTH=http://localhost:9998 tests/load/capacity.js
//   k6 run -e STAGES=ramp ... (default) | -e VUS=200 -e DURATION=3m (constant)
//
// Scenarios (weights follow expected traffic: crawlers + anonymous visitors dominate):
//   browse  70%  public list newest-first, deep pages, job detail, landing stats, employers
//   search  20%  keyword + filter combinations with facets
//   member  10%  sign in (OTP against the mock), /auth/me, feed, notifications, messages
// Each VU sleeps 1-3 s between pages like a person; requests/second is reported by k6.
import http from "k6/http";
import { check, group, sleep } from "k6";
import { Trend } from "k6/metrics";

const API = __ENV.API || "http://localhost:28039";
const AUTH = __ENV.AUTH || "http://localhost:9998";
const MEMBERS = Number(__ENV.MEMBERS || 1000000);
const signIn = new Trend("sign_in_ms", true);

const ramp = [
  { duration: "1m", target: 100 },
  { duration: "2m", target: 300 },
  { duration: "2m", target: 600 },
  { duration: "2m", target: 1000 },
  { duration: "1m", target: 0 },
];

export const options = {
  scenarios: {
    browse: { executor: "ramping-vus", exec: "browse", stages: scale(ramp, 0.7), gracefulRampDown: "10s" },
    search: { executor: "ramping-vus", exec: "search", stages: scale(ramp, 0.2), gracefulRampDown: "10s" },
    member: { executor: "ramping-vus", exec: "member", stages: scale(ramp, 0.1), gracefulRampDown: "10s" },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{kind:public}": ["p(95)<500"],
    "http_req_duration{kind:search}": ["p(95)<500"],
    "http_req_duration{kind:member}": ["p(95)<500"],
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

function scale(stages, f) {
  const vus = Number(__ENV.VUS || 0);
  if (vus) return [{ duration: "30s", target: Math.ceil(vus * f) }, { duration: __ENV.DURATION || "3m", target: Math.ceil(vus * f) }];
  return stages.map((s) => ({ duration: s.duration, target: Math.ceil(s.target * f) }));
}

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const TERMS = ["python", "react engineer", "data", "designer", "kubernetes", "\"product manager\"", "sales", "golang"];
const FILTERS = [
  "workplace=remote", "country=US", "country=DE", "seniority=senior", "job_type=full-time",
  "region=europe", "industry=fintech", "job_function=engineering", "has_salary=true",
  "posted_within=7d", "skills=Python", "workplace=hybrid&country=GB", "seniority=lead&job_function=data",
];
const pub = (route) => ({ tags: { kind: "public", route } });
let ids = [];

export function browse() {
  const page = Math.random() < 0.9 ? Math.floor(Math.random() * 5) : Math.floor(Math.random() * 400);
  const list = http.get(`${API}/api/v1/jobs?limit=20&skip=${page * 20}`, pub(page > 4 ? "list_deep" : "list"));
  check(list, { "list 200": (r) => r.status === 200 });
  if (list.status === 200) {
    const got = list.json().map((j) => j.id);
    if (got.length) ids = got;
  }
  sleep(1 + Math.random() * 2);
  if (ids.length) {
    const r = http.get(`${API}/api/v1/jobs/${pick(ids)}`, pub("detail"));
    check(r, { "detail 200": (x) => x.status === 200 });
  }
  const roll = Math.random();
  if (roll < 0.15) http.get(`${API}/api/v1/jobs/landing-stats?query=${pick(TERMS)}`, pub("landing"));
  else if (roll < 0.2) http.get(`${API}/api/v1/jobs/employers?limit=200`, pub("employers"));
  else if (roll < 0.25) http.get(`${API}/api/v1/jobs/sitemap-entries?skip=${Math.floor(Math.random() * 1000) * 5000}&limit=5000`, pub("sitemap"));
  sleep(1 + Math.random() * 2);
}

export function search() {
  const q = Math.random() < 0.6 ? `query=${encodeURIComponent(pick(TERMS))}&` : "";
  const f = Math.random() < 0.7 ? pick(FILTERS) : "";
  const tags = { tags: { kind: "search", route: q ? "keyword" : "filter" } };
  const r = http.get(`${API}/api/v1/jobs?${q}${f}&limit=20`, tags);
  check(r, { "search 200": (x) => x.status === 200 });
  const fr = http.get(`${API}/api/v1/jobs/facets?${q}${f}`, { tags: { kind: "search", route: "facets" } });
  check(fr, { "facets 200": (x) => x.status === 200 });
  sleep(1 + Math.random() * 2);
}

function token(email) {
  const t0 = Date.now();
  http.post(`${AUTH}/auth/v1/otp`, JSON.stringify({ email, create_user: true }), { headers: { "Content-Type": "application/json" }, tags: { kind: "auth" } });
  const v = http.post(`${AUTH}/auth/v1/verify`, JSON.stringify({ email, token: "123456", type: "email" }), { headers: { "Content-Type": "application/json" }, tags: { kind: "auth" } });
  const access = v.status === 200 ? v.json().access_token : null;
  signIn.add(Date.now() - t0);
  return access;
}

let session = null;
export function member() {
  if (!session || Math.random() < 0.05) {
    // Half sign in as a seeded member (linked by verified email), half sign up new.
    const email = Math.random() < 0.5
      ? `member${1 + Math.floor(Math.random() * MEMBERS)}@example.com`
      : `load-${__VU}-${Date.now()}@example.com`;
    session = token(email);
  }
  if (!session) return;
  const h = { headers: { Authorization: `Bearer ${session}` } };
  const get = (path, route) => {
    const r = http.get(`${API}/api/v1${path}`, Object.assign({ tags: { kind: "member", route } }, h));
    check(r, { [`${route} ok`]: (x) => x.status === 200 });
    return r;
  };
  group("member", () => {
    get("/auth/me", "me");
    get("/social/feed?page=1&page_size=20", "feed");
    get("/notifications?limit=20", "notifications");
    get("/notifications/unread-count", "unread");
    get("/network/conversations?limit=20", "conversations");
    get("/network/conversations/unread-count", "messages_unread");
  });
  sleep(2 + Math.random() * 3);
}
