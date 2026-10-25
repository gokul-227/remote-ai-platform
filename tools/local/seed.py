"""Seed the local demo stack with realistic test data through the public API.

Signs in each account against the local mock Supabase Auth (code 123456), so
every record is created exactly as a real user would create it. Safe to re-run:
existing records make individual calls fail softly and the script carries on.
"""

import sys
from datetime import UTC, datetime, timedelta

import httpx

API = "http://localhost:18000/api/v1"
AUTH = "http://localhost:9999/auth/v1"
CODE = "123456"

PEOPLE = {
    "admin": (
        "admin@example.com",
        "Avery Admin",
        {
            "headline": "Platform operations lead",
            "primary_role": "Operations Manager",
            "location": "Dublin, Ireland",
            "timezone": "Europe/Dublin",
            "years_of_experience": 9,
            "skills": ["Operations", "Trust & Safety", "SQL", "Python"],
            "bio": "I keep the platform safe and running smoothly.",
        },
    ),
    "alice": (
        "alice@example.com",
        "Alice Martin",
        {
            "headline": "Head of Engineering at Northwind Labs",
            "primary_role": "Engineering Manager",
            "location": "Berlin, Germany",
            "timezone": "Europe/Berlin",
            "years_of_experience": 12,
            "skills": ["Python", "FastAPI", "PostgreSQL", "Leadership", "AWS"],
            "bio": "I build remote-first engineering teams.",
        },
    ),
    "ben": (
        "ben@example.com",
        "Ben Okafor",
        {
            "headline": "Senior Python & AI Engineer",
            "primary_role": "Backend Engineer",
            "location": "Lagos, Nigeria",
            "timezone": "Africa/Lagos",
            "years_of_experience": 7,
            "availability": "AVAILABLE",
            "skills": ["Python", "FastAPI", "PostgreSQL", "LLMs", "Docker"],
            "bio": "Backend and applied-AI engineer, open to contract work.",
        },
    ),
    "chloe": (
        "chloe@example.com",
        "Chloé Dubois",
        {
            "headline": "Product Designer — design systems & SaaS",
            "primary_role": "Product Designer",
            "location": "Lyon, France",
            "timezone": "Europe/Paris",
            "years_of_experience": 6,
            "skills": ["Figma", "Design Systems", "UX Research", "Prototyping"],
            "bio": "I design calm, accessible enterprise products.",
        },
    ),
    "dev": (
        "dev@example.com",
        "Dev Patel",
        {
            "headline": "Full-stack engineer (React, Node, TypeScript)",
            "primary_role": "Full-stack Engineer",
            "location": "Bengaluru, India",
            "timezone": "Asia/Kolkata",
            "years_of_experience": 4,
            "availability": "AVAILABLE",
            "skills": ["React", "TypeScript", "Node.js", "Next.js", "PostgreSQL"],
            "bio": "Shipping fast, typed, tested web apps.",
        },
    ),
}


def ok(r: httpx.Response, what: str):
    if r.status_code >= 400:
        print(f"  · {what}: {r.status_code} {r.text[:120]}")
        return None
    return r.json() if r.content else {}


def sign_in(email: str, name: str) -> httpx.Client:
    httpx.post(f"{AUTH}/otp", json={"email": email, "create_user": True, "data": {"full_name": name}}).raise_for_status()
    s = httpx.post(f"{AUTH}/verify", json={"email": email, "token": CODE, "type": "email"})
    s.raise_for_status()
    c = httpx.Client(base_url=API, headers={"Authorization": f"Bearer {s.json()['access_token']}"}, timeout=30)
    c.get("/auth/me").raise_for_status()
    c.patch("/auth/me", json={"full_name": name}).raise_for_status()
    return c


def main() -> None:
    try:
        httpx.get("http://localhost:18000/health/ready", timeout=5).raise_for_status()
    except Exception:
        sys.exit("The API isn't up on :18000 — run tools/local/up.sh first.")
    c: dict[str, httpx.Client] = {}
    me: dict[str, dict] = {}
    for key, (email, name, profile) in PEOPLE.items():
        c[key] = sign_in(email, name)
        me[key] = c[key].get("/auth/me").json()
        if profile:
            if c[key].get("/engineers/me").status_code == 404:
                ok(c[key].post("/engineers/me", json=profile), f"{key} profile")
            else:
                ok(c[key].put("/engineers/me", json=profile), f"{key} profile")
    print("Accounts ready.")

    # Alice runs a company and hires.
    ok(
        c["alice"].post(
            "/companies/me",
            json={
                "name": "Northwind Labs",
                "website": "https://example.com",
                "industry": "Software",
                "company_size": "51-200",
                "location": "Berlin, Germany",
                "description": "Remote-first product studio building AI tools for logistics.",
                "tech_stack": ["Python", "React", "PostgreSQL"],
            },
        ),
        "company",
    )
    jobs = []
    for job in (
        {"title": "Senior Backend Engineer (Python)", "job_type": "FULL_TIME", "experience_level": "SENIOR",
         "skills": ["Python", "FastAPI", "PostgreSQL"], "budget_min": 70000, "budget_max": 95000,
         "description": "Own our API platform: FastAPI, PostgreSQL and event-driven services. Fully remote, EU hours."},
        {"title": "Product Designer — Design System", "job_type": "CONTRACT", "experience_level": "MID",
         "skills": ["Figma", "Design Systems"], "budget_min": 40, "budget_max": 70,
         "description": "Three-month contract to rebuild our design system and component library."},
        {"title": "React Dashboard Freelance Project", "job_type": "FREELANCE", "experience_level": "MID",
         "skills": ["React", "TypeScript"], "budget_min": 3000, "budget_max": 6000,
         "description": "Build an analytics dashboard in React + TypeScript from our Figma files. 4–6 weeks."},
    ):
        j = ok(c["alice"].post("/jobs", json={**job, "is_remote": True, "location": "Remote", "company_name": "Northwind Labs"}), job["title"])
        if j:
            jobs.append(j)
    print(f"Jobs: {len(jobs)}")
    if jobs:
        ok(c["ben"].post(f"/applications/jobs/{jobs[0]['id']}", json={"cover_note": "I've run FastAPI services at scale for 5 years."}), "ben applies")
        ok(c["chloe"].post(f"/applications/jobs/{jobs[1]['id']}", json={"cover_note": "Design systems are my favourite work."}), "chloe applies")
        ok(c["dev"].post(f"/applications/jobs/{jobs[2]['id']}", json={"cover_note": "I can start next week."}), "dev applies")
        for k in ("ben", "dev"):
            ok(c[k].post(f"/saved-jobs/{jobs[0]['id']}"), f"{k} saves job")

    # Everyone connects with everyone.
    members = ["alice", "ben", "chloe", "dev", "admin"]
    for i, a in enumerate(members):
        for b in members[i + 1 :]:
            r = ok(c[a].post("/connections", json={"receiver_id": me[b]["id"]}), f"{a}→{b} connect")
            if r and r.get("id"):
                ok(c[b].patch(f"/connections/{r['id']}", json={"status": "ACCEPTED"}), f"{b} accepts {a}")
    print("Connections ready.")

    # Feed.
    posts = []
    for k, text in (
        ("alice", "We're hiring a Senior Backend Engineer at Northwind Labs — fully remote, EU hours. 🚀"),
        ("ben", "Just shipped a retrieval pipeline that cut our LLM costs by 40%. Happy to share notes."),
        ("chloe", "Design tip: write the empty states first. They tell you what the product is for."),
        ("dev", "Next.js 16 + React 19 server actions are a joy. Anyone else migrating?"),
    ):
        p = ok(c[k].post("/social/posts", json={"content": text, "visibility": "PUBLIC"}), f"{k} post")
        if p:
            posts.append(p)
    for p in posts:
        for k in ("alice", "ben", "chloe"):
            ok(c[k].post(f"/social/posts/{p['id']}/like"), "like")
        ok(c["dev"].post(f"/social/posts/{p['id']}/comments", json={"content": "Great point!"}), "comment")

    # Chats.
    for a, b, lines in (
        ("alice", "ben", ["Hi Ben, your profile is a great fit for our backend role.", "Thanks Alice! Happy to talk this week."]),
        ("alice", "chloe", ["Chloé, could you start the design-system contract in November?", "Yes, early November works."]),
        ("dev", "ben", ["Want to pair on the dashboard project?", "Sure — Thursday?"]),
    ):
        conv = ok(c[a].post("/conversations", json={"participant_id": me[b]["id"]}), "conversation")
        if conv:
            ok(c[a].post(f"/conversations/{conv['id']}/messages", json={"content": lines[0]}), "message")
            ok(c[b].post(f"/conversations/{conv['id']}/messages", json={"content": lines[1]}), "reply")

    # Communities.
    g = ok(c["ben"].post("/groups", json={"name": "Remote Python Engineers", "description": "Async, FastAPI, data and AI.",
                                          "category": "Engineering", "tags": ["python", "remote"]}), "group")
    if g:
        for k in ("alice", "dev"):
            ok(c[k].post(f"/groups/{g['id']}/join"), "join group")
        ok(c["ben"].post(f"/groups/{g['id']}/posts", json={"content": "Welcome! Introduce yourself and your stack."}), "group post")

    # Project, board, sprint, channel and documents.
    proj = ok(c["alice"].post("/projects", json={
        "title": "Logistics Analytics Platform",
        "description": "Customer-facing analytics for shipment tracking.",
        "technologies": ["Python", "React", "PostgreSQL"],
        "member_ids": [me["ben"]["id"], me["dev"]["id"], me["chloe"]["id"]],
    }), "project")
    if proj:
        pid = proj["id"]
        sprint = ok(c["alice"].post(f"/projects/{pid}/sprints", json={"name": "Sprint 1", "goal": "Ship the MVP dashboard"}), "sprint")
        tasks = [
            ("Design dashboard layout", "chloe", "HIGH", ["Figma"]),
            ("Build shipments API", "ben", "HIGH", ["Python", "FastAPI"]),
            ("Implement charts in React", "dev", "MEDIUM", ["React"]),
            ("Set up CI pipeline", "ben", "LOW", ["Docker"]),
            ("Accessibility review", "chloe", "MEDIUM", []),
        ]
        for title, who, pri, skills in tasks:
            t = ok(c["alice"].post("/projects/tasks", json={
                "project_id": pid, "title": title, "priority": pri, "required_skills": skills,
                "assigned_user_id": me[who]["id"], "estimated_hours": 8,
            }), title)
            if t and sprint:
                ok(c["alice"].patch(f"/projects/tasks/{t['id']}", json={"sprint_id": sprint["id"]}), "add to sprint")
        if sprint:
            ok(c["alice"].post(f"/projects/sprints/{sprint['id']}/start"), "start sprint")
        ch = ok(c["alice"].post("/channels", json={"kind": "PROJECT", "name": "analytics-team", "topic": "Daily updates",
                                                    "project_id": pid,
                                                    "member_ids": [me["ben"]["id"], me["dev"]["id"], me["chloe"]["id"]]}), "channel")
        if ch:
            for k, msg in (("alice", "Kick-off at 10:00 CET tomorrow."), ("ben", "API skeleton is up on the branch."), ("dev", "Charts PR ready for review.")):
                ok(c[k].post(f"/channels/{ch['id']}/messages", json={"body": msg}), "channel message")
        for kind, title, content in (
            ("DOC", "Product requirements", None),
            ("SHEET", "Sprint budget", {"cells": {"A1": "Item", "B1": "Cost", "A2": "Design", "B2": "4000",
                                                   "A3": "Engineering", "B3": "12000", "A4": "Total", "B4": "=SUM(B2:B3)"}}),
            ("SLIDES", "Kick-off deck", None),
        ):
            body = {"kind": kind, "title": title, "project_id": pid}
            if content:
                body["content"] = content
            ok(c["alice"].post("/documents", json=body), title)

    # Meetings (one tomorrow, one next week).
    now = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    for title, delta in (("Backend role — interview", 1), ("Sprint 1 review", 7)):
        start = now + timedelta(days=delta, hours=1)
        ok(c["alice"].post("/meetings", json={
            "title": title, "starts_at": start.isoformat(), "ends_at": (start + timedelta(minutes=45)).isoformat(),
            "participant_ids": [me["ben"]["id"], me["chloe"]["id"]], "agenda": "Introductions, scope, next steps.",
        }), title)

    # Support and staff content.
    ok(c["dev"].post("/support/tickets", json={"subject": "Can't upload my resume PDF", "category": "BUG",
                                                "body": "The upload spinner never finishes for a 2 MB PDF."}), "ticket")
    ok(c["chloe"].post("/support/tickets", json={"subject": "How do contract milestones work?", "category": "CONTRACT",
                                                  "body": "Can I split a contract into three milestones?"}), "ticket")
    ok(c["admin"].post("/admin/announcements", json={"title": "Welcome to the local demo",
                                                     "body": "This environment is filled with test data. Sign-in code: 123456.",
                                                     "severity": "INFO"}), "announcement")
    print("Test data ready.")


if __name__ == "__main__":
    main()
