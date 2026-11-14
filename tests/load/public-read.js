// k6 load test for the public read paths (no sign-in, no writes, safe on any environment).
//   k6 run -e API=http://localhost:18000 tests/load/public-read.js
//   k6 run -e API=https://dev.api.remoteaiplatform.com -e VUS=10 -e DURATION=1m tests/load/public-read.js
// Never point this at production without the owner's go-ahead: it is real traffic
// and counts against free-tier quotas. Thresholds are the launch budget.
import http from "k6/http";
import { check, sleep } from "k6";

const API = __ENV.API || "http://localhost:18000";

export const options = {
  vus: Number(__ENV.VUS || 20),
  duration: __ENV.DURATION || "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{route:jobs}": ["p(95)<500"],
    "http_req_duration{route:search}": ["p(95)<800"],
    "http_req_duration{route:ready}": ["p(95)<300"],
  },
};

const TERMS = ["engineer", "python", "react", "designer", "data", "remote"];

export default function () {
  const q = TERMS[Math.floor(Math.random() * TERMS.length)];
  const r = [
    http.get(`${API}/api/v1/jobs?limit=20`, { tags: { route: "jobs" } }),
    http.get(`${API}/api/v1/search?q=${q}`, { tags: { route: "search" } }),
    http.get(`${API}/health/ready`, { tags: { route: "ready" } }),
  ];
  r.forEach((res) => check(res, { "status 200": (x) => x.status === 200 }));
  sleep(1);
}
