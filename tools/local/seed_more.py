"""Fill every remaining corner of the LOCAL demo with realistic activity (local only).

Run after tools/local/seed.py and seed_bulk.py. Uses the local database only to
look up who owns what (projects, companies, applications); every record is
created through the local API as the user who would really create it:
contracts and milestones (signed by both sides), deliverables and reviews,
task offers, submissions, time logs and comments, project channels, meetings,
documents, endorsements, trust reviews, verifications, moderation reports,
support tickets with staff replies, application decisions, feed comments and
likes, and announcements.

    apps/api/.venv/bin/python tools/local/seed_more.py
"""

import asyncio
import json
import random
import subprocess
import sys
from datetime import UTC, datetime, timedelta

import httpx

API = "http://localhost:18000/api/v1"
AUTH = "http://localhost:9999/auth/v1"
CODE = "123456"
rnd = random.Random(7)
sem = asyncio.Semaphore(12)
auth_sem = asyncio.Semaphore(4)
stats: dict[str, int] = {}
clients: dict[str, httpx.AsyncClient] = {}
emails: dict[str, str] = {}

if not API.startswith("http://localhost"):
    sys.exit("Refusing to seed anything but the local stack.")


def sql(query: str) -> list[dict]:
    """Read-only lookups against the local database."""
    out = subprocess.run(
        ["docker", "exec", "remote-ai-platform-postgres", "psql", "-U", "remote_ai_platform", "-d", "remote_ai_platform",
         "-tAc", f"select coalesce(json_agg(t), '[]') from ({query}) t"],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    return json.loads(out or "[]")


def count(k: str) -> None:
    stats[k] = stats.get(k, 0) + 1


async def client(user_id: str) -> httpx.AsyncClient | None:
    if user_id in clients:
        return clients[user_id]
    email = emails[user_id]
    async with auth_sem, httpx.AsyncClient(timeout=30) as a:
        for attempt in range(5):
            try:
                await a.post(f"{AUTH}/otp", json={"email": email, "create_user": False})
                r = await a.post(f"{AUTH}/verify", json={"email": email, "token": CODE, "type": "email"})
                break
            except httpx.HTTPError:
                await asyncio.sleep(1 + attempt)
        else:
            return None
    if r.status_code != 200:
        return None
    clients[user_id] = httpx.AsyncClient(base_url=API, timeout=120, headers={"Authorization": f"Bearer {r.json()['access_token']}"})
    return clients[user_id]


async def call(user_id: str, method: str, path: str, what: str | None = None, **kw):
    c = await client(user_id)
    if not c:
        return None
    async with sem:
        for attempt in range(3):
            try:
                r = await c.request(method, path, **kw)
            except httpx.HTTPError:
                await asyncio.sleep(1 + attempt)
                continue
            if r.status_code < 400:
                if what:
                    count(what)
                return r.json() if r.content else {}
            return None
    return None


LOREM = [
    "Kick-off went well; scope and milestones are agreed.", "Pushed the first iteration — feedback welcome.",
    "Blocked on API credentials, chasing the client.", "Design review moved to Thursday.",
    "All tests green on main.", "Shipped to staging, please take a look.", "Can we split this into two tasks?",
    "Great progress this week, team.", "I'll pair with you on the tricky part tomorrow.",
]
DEMOS = ["https://example.com/demo", "https://example.org/preview", "https://example.net/staging"]


async def main() -> None:
    try:
        httpx.get("http://localhost:18000/health/ready", timeout=5).raise_for_status()
    except Exception:
        sys.exit("The local API isn't up — run tools/local/up.sh first.")
    users = sql("select id::text, email, full_name, role from users where email like '%@example.com'")
    for u in users:
        emails[u["id"]] = u["email"]
    admin = next(u["id"] for u in users if u["email"] == "admin@example.com")
    members = [u["id"] for u in users if u["id"] != admin]
    owners = sql("select c.user_id::text owner, c.id::text company from company_profiles c join users u on u.id=c.user_id where u.email like '%@example.com'")
    projects = sql(
        "select p.id::text id, c.user_id::text owner, coalesce(json_agg(m.user_id::text) filter (where m.user_id is not null), '[]') members "
        "from projects p join company_profiles c on c.id=p.company_id left join project_members m on m.project_id=p.id "
        "group by p.id, c.user_id"
    )
    tasks = sql("select t.id::text id, t.project_id::text project, t.assigned_user_id::text assignee from project_tasks t where t.assigned_user_id is not null")
    print(f"{len(users)} accounts, {len(owners)} companies, {len(projects)} projects, {len(tasks)} tasks")

    # 1. Contracts with milestones, signed by both sides, some delivered and reviewed.
    async def contract(o: dict) -> None:
        worker = rnd.choice(members)
        if worker == o["owner"]:
            return
        start = datetime.now(UTC).date() - timedelta(days=rnd.randint(5, 60))
        c = await call(o["owner"], "POST", "/contracts", "contracts", json={
            "worker_id": worker,
            "title": rnd.choice(["Mobile app MVP", "Data pipeline rebuild", "Design system", "API integration",
                                 "Marketing site", "Analytics dashboard", "Security audit", "Performance tuning"]),
            "scope_description": "Deliver the agreed scope in milestones with weekly demos and written handover notes.",
            "rate_type": rnd.choice(["FIXED", "HOURLY"]), "rate_amount": rnd.choice([45, 60, 80, 2500, 5000, 9000]),
            "currency": "USD", "start_date": start.isoformat(), "end_date": (start + timedelta(days=60)).isoformat(),
            "milestones": [{"title": t, "amount": a} for t, a in
                           (("Discovery & plan", 800), ("First release", 2400), ("Hardening & handover", 1600))],
        })
        if not c:
            return
        if rnd.random() < 0.85:
            await call(worker, "POST", f"/contracts/{c['id']}/sign")
            await call(o["owner"], "POST", f"/contracts/{c['id']}/sign", "signed contracts")
        full = await call(o["owner"], "GET", f"/contracts/{c['id']}")
        ms = (full or {}).get("milestones") or []
        if ms and rnd.random() < 0.7:
            m = ms[0]
            await call(o["owner"], "PATCH", f"/contracts/{c['id']}/milestones/{m['id']}/status", json={"status": "IN_PROGRESS"})
            d = await call(worker, "POST", f"/contracts/{c['id']}/deliverables/demo", "deliverables", json={
                "milestone_id": m["id"], "title": "Milestone 1 demo", "demo_url": rnd.choice(DEMOS),
                "environment": "staging", "notes": "Walkthrough recorded; credentials in the handover doc.",
            })
            if d and rnd.random() < 0.6:
                await call(o["owner"], "POST", f"/contracts/{c['id']}/deliverables/{d['id']}/review", "deliverable reviews",
                           json={"decision": rnd.choice(["ACCEPTED", "CHANGES_REQUESTED"]), "note": "Looks great — thanks!"})

    await asyncio.gather(*(contract(o) for o in rnd.sample(owners, k=min(160, len(owners)))))

    # 2. Project work: offers, submissions, time logs, comments, sprint progress, channels, reviews.
    byproj = {p["id"]: p for p in projects}
    status_pool = ["TODO", "IN_PROGRESS", "IN_PROGRESS", "REVIEW", "COMPLETED", "COMPLETED"]

    async def task_work(t: dict) -> None:
        p = byproj.get(t["project"])
        if not p:
            return
        await call(p["owner"], "PATCH", f"/projects/tasks/{t['id']}", json={"status": rnd.choice(status_pool)})
        if rnd.random() < 0.5:
            await call(t["assignee"], "POST", f"/projects/tasks/{t['id']}/ledger", "time entries",
                       json={"duration_minutes": rnd.choice([30, 45, 60, 90, 120, 180]), "description": rnd.choice(LOREM)})
        if rnd.random() < 0.4:
            await call(rnd.choice([p["owner"], t["assignee"]]), "POST", f"/projects/tasks/{t['id']}/comments", "task comments",
                       json={"content": rnd.choice(LOREM)})
        if rnd.random() < 0.25:
            s = await call(t["assignee"], "POST", f"/projects/tasks/{t['id']}/submissions", "work submissions",
                           json={"summary": "Implemented and tested; see the linked demo.", "artifact_urls": [rnd.choice(DEMOS)]})
            if s and rnd.random() < 0.6:
                await call(p["owner"], "PATCH", f"/projects/submissions/{s['id']}/review", "submission reviews",
                           json={"status": rnd.choice(["APPROVED", "CHANGES_REQUESTED"]), "review_note": "Thanks — reviewed."})
        if rnd.random() < 0.1:
            cand = rnd.choice(members)
            await call(p["owner"], "POST", f"/projects/tasks/{t['id']}/offers", "task offers", json={"candidate_id": cand})

    await asyncio.gather(*(task_work(t) for t in tasks))

    async def project_social(p: dict) -> None:
        team = [m for m in p["members"] if m != p["owner"]][:8]
        ch = await call(p["owner"], "POST", "/channels", "channels", json={
            "kind": "PROJECT", "name": f"team-{p['id'][:6]}", "topic": "Daily updates and decisions",
            "project_id": p["id"], "member_ids": team,
        })
        if ch:
            for who in rnd.sample([p["owner"], *team], k=min(5, len(team) + 1)):
                await call(who, "POST", f"/channels/{ch['id']}/messages", "channel messages", json={"body": rnd.choice(LOREM)})
        for kind, title in (("DOC", "Project brief"), ("SHEET", "Budget tracker"), ("SLIDES", "Sprint review deck")):
            if rnd.random() < 0.6:
                body = {"kind": kind, "title": title, "project_id": p["id"]}
                if kind == "SHEET":
                    body["content"] = {"cells": {"A1": "Item", "B1": "Cost", "A2": "Design", "B2": str(rnd.randint(1, 9) * 1000),
                                                 "A3": "Build", "B3": str(rnd.randint(5, 30) * 1000), "A4": "Total", "B4": "=SUM(B2:B3)"}}
                await call(p["owner"], "POST", "/documents", "documents", json=body)
        if team and rnd.random() < 0.6:
            start = datetime.now(UTC).replace(minute=0, second=0, microsecond=0) + timedelta(days=rnd.randint(-10, 14), hours=rnd.randint(1, 8))
            await call(p["owner"], "POST", "/meetings", "meetings", json={
                "title": rnd.choice(["Sprint planning", "Design review", "Weekly sync", "Client demo", "Retro"]),
                "starts_at": start.isoformat(), "ends_at": (start + timedelta(minutes=45)).isoformat(),
                "participant_ids": team[:4], "agenda": "Progress, blockers, next steps.",
            })
        for m in team[:2]:
            if rnd.random() < 0.5:
                await call(p["owner"], "POST", "/trust/reviews", "reviews", json={
                    "project_id": p["id"], "reviewee_id": m, "rating": rnd.choice([4, 5, 5, 5, 3]),
                    "comment": rnd.choice(["Excellent communication and quality.", "Delivered on time, great collaborator.",
                                           "Strong technical skills, would hire again.", "Good work, minor delays."]),
                })

    await asyncio.gather(*(project_social(p) for p in projects))

    # 3. Hiring: companies move applications through the pipeline.
    apps = sql("select a.id::text id, c.user_id::text owner from job_applications a join job_posts j on j.id=a.job_id "
               "join company_profiles c on c.id=j.company_id where a.status='SUBMITTED' order by random() limit 700")

    async def decide(a: dict) -> None:
        if not await call(a["owner"], "PATCH", f"/applications/{a['id']}/status", "applications reviewed", json={"status": "REVIEWING"}):
            return
        roll = rnd.random()
        if roll < 0.35:
            await call(a["owner"], "PATCH", f"/applications/{a['id']}/status", json={"status": "SHORTLISTED"})
            if rnd.random() < 0.4:
                await call(a["owner"], "PATCH", f"/applications/{a['id']}/status", "hires", json={"status": "ACCEPTED"})
        elif roll < 0.6:
            await call(a["owner"], "PATCH", f"/applications/{a['id']}/status", json={"status": "REJECTED"})

    await asyncio.gather(*(decide(a) for a in apps))

    # 4. Community: endorsements, comments, likes, group posts.
    profiles = sql("select user_id::text id, skills from engineer_profiles where skills is not null")
    skills_of = {p["id"]: p["skills"] or [] for p in profiles}

    async def endorse(a: str) -> None:
        for b in rnd.sample(members, k=3):
            sk = skills_of.get(b) or []
            if b != a and sk:
                await call(a, "POST", "/endorsements", "endorsements", json={"user_id": b, "skill": rnd.choice(sk)})

    await asyncio.gather(*(endorse(a) for a in rnd.sample(members, k=min(400, len(members)))))
    posts = sql("select id::text id from posts order by random() limit 400")

    async def engage(p: dict) -> None:
        for u in rnd.sample(members, k=rnd.randint(2, 12)):
            await call(u, "POST", f"/social/posts/{p['id']}/like", "likes")
        for u in rnd.sample(members, k=rnd.randint(0, 3)):
            await call(u, "POST", f"/social/posts/{p['id']}/comments", "comments", json={
                "content": rnd.choice(["Great point!", "Congrats 🎉", "Thanks for sharing.", "This resonates.",
                                       "Would love to hear more.", "Totally agree.", "Bookmarking this."])})

    await asyncio.gather(*(engage(p) for p in posts))

    # 5. Trust & safety and support (what the staff console works on).
    async def verification(u: str) -> None:
        v = await call(u, "POST", "/trust/verifications", "verification requests",
                       json={"verification_type": rnd.choice(["IDENTITY", "GITHUB", "LINKEDIN", "SKILL_ASSESSMENT"])})
        if v and rnd.random() < 0.5:
            await call(admin, "PATCH", f"/trust/verifications/{v['id']}/review", "verifications decided",
                       json={"status": rnd.choice(["VERIFIED", "VERIFIED", "REJECTED"]), "verifier_notes": "Checked."})

    await asyncio.gather(*(verification(u) for u in rnd.sample(members, k=90)))
    jobs = sql("select id::text id from job_posts order by random() limit 20")
    targets = [("POST", p["id"]) for p in posts[:25]] + [("JOB", j["id"]) for j in jobs] + [("USER", u) for u in rnd.sample(members, k=10)]

    async def report(t: tuple[str, str]) -> None:
        r = await call(rnd.choice(members), "POST", "/moderation/reports", "reports", json={
            "target_type": t[0], "target_id": t[1],
            "reason": rnd.choice(["Spam or misleading content", "Harassment", "Scam or fraud", "Inappropriate content", "Fake profile"]),
        })
        if r and rnd.random() < 0.45:
            await call(admin, "PATCH", f"/moderation/reports/{r['id']}", "reports decided", json={
                "status": "RESOLVED", "decision": rnd.choice(["NO_ACTION", "CONTENT_REMOVED", "WARNING"]), "note": "Reviewed per policy."})

    await asyncio.gather(*(report(t) for t in targets))
    subjects = [("Can't upload my resume PDF", "BUG"), ("How do milestones work?", "CONTRACT"), ("Change my sign-in email", "ACCOUNT"),
                ("Report a suspicious job", "SAFETY"), ("Invoice question", "OTHER"), ("Profile not showing in search", "BUG"),
                ("Dispute with a client", "CONTRACT"), ("Delete my account", "ACCOUNT")]

    async def ticket(u: str) -> None:
        subj, cat = rnd.choice(subjects)
        t = await call(u, "POST", "/support/tickets", "support tickets",
                       json={"subject": subj, "category": cat, "body": "Hi team, could you help with this? Details below. Thanks!"})
        tid = (t or {}).get("ticket", {}).get("id")
        if tid and rnd.random() < 0.6:
            await call(admin, "POST", f"/admin/support/tickets/{tid}/messages", "staff replies",
                       json={"body": "Thanks for reaching out — we're looking into it and will update you here.", "internal": False})
            if rnd.random() < 0.5:
                await call(admin, "PATCH", f"/admin/support/tickets/{tid}", json={"status": "RESOLVED"})

    await asyncio.gather(*(ticket(u) for u in rnd.sample(members, k=70)))
    for title, body, sev in (("Scheduled maintenance", "The platform will be read-only on Sunday 02:00–02:30 UTC.", "WARNING"),
                             ("New: Talent matching", "Rank professionals against your job postings with explainable scores.", "INFO")):
        await call(admin, "POST", "/admin/announcements", "announcements", json={"title": title, "body": body, "severity": sev})

    for c in clients.values():
        await c.aclose()
    print("Done:", ", ".join(f"{v} {k}" for k, v in sorted(stats.items())))


async def finish() -> None:
    """Second pass: activity that needs connections or completed projects, plus support."""
    users = sql("select id::text, email from users where email like '%@example.com'")
    for u in users:
        emails[u["id"]] = u["email"]
    admin = next(u["id"] for u in users if u["email"] == "admin@example.com")
    pairs = sql("select sender_id::text a, receiver_id::text b from connections where status='ACCEPTED' order by random() limit 900")
    skills_of = {p["id"]: p["skills"] or [] for p in sql("select user_id::text id, skills from engineer_profiles where skills is not null")}

    async def endorse(pr: dict) -> None:
        sk = skills_of.get(pr["b"]) or []
        if sk:
            await call(pr["a"], "POST", "/endorsements", "endorsements", json={"user_id": pr["b"], "skill": rnd.choice(sk)})

    await asyncio.gather(*(endorse(pr) for pr in pairs))
    friends: dict[str, list[str]] = {}
    for pr in pairs:
        friends.setdefault(pr["a"], []).append(pr["b"])
        friends.setdefault(pr["b"], []).append(pr["a"])

    async def meeting(u: str) -> None:
        start = datetime.now(UTC).replace(minute=0, second=0, microsecond=0) + timedelta(days=rnd.randint(-7, 21), hours=rnd.randint(1, 9))
        await call(u, "POST", "/meetings", "meetings", json={
            "title": rnd.choice(["Intro call", "Sprint planning", "Design review", "Weekly sync", "Client demo", "Interview", "Retro"]),
            "starts_at": start.isoformat(), "ends_at": (start + timedelta(minutes=rnd.choice([30, 45, 60]))).isoformat(),
            "participant_ids": rnd.sample(friends[u], k=min(3, len(friends[u]))), "agenda": "Progress, blockers, next steps.",
        })

    await asyncio.gather(*(meeting(u) for u in rnd.sample(sorted(friends), k=min(220, len(friends)))))
    done = sql(
        "select p.id::text id, c.user_id::text owner, json_agg(m.user_id::text) members from projects p "
        "join company_profiles c on c.id=p.company_id join project_members m on m.project_id=p.id "
        "group by p.id, c.user_id order by random() limit 35"
    )

    async def complete(p: dict) -> None:
        if not await call(p["owner"], "PATCH", f"/projects/{p['id']}/status", "completed projects", json={"status": "COMPLETED"}):
            return
        for m in [x for x in p["members"] if x != p["owner"]][:3]:
            await call(p["owner"], "POST", "/trust/reviews", "reviews", json={
                "project_id": p["id"], "reviewee_id": m, "rating": rnd.choice([5, 5, 4, 4, 3]),
                "comment": rnd.choice(["Excellent communication and quality.", "Delivered on time, great collaborator.",
                                       "Strong technical skills, would hire again.", "Good work, minor delays."])})
            await call(m, "POST", "/trust/reviews", "reviews", json={
                "project_id": p["id"], "reviewee_id": p["owner"], "rating": rnd.choice([5, 4, 4, 5]),
                "comment": rnd.choice(["Clear requirements and fast feedback.", "Great client to work with.", "Paid attention to detail."])})

    await asyncio.gather(*(complete(p) for p in done))
    members = [u["id"] for u in users if u["id"] != admin]
    subjects = [("Can't upload my resume PDF", "BUG"), ("How do milestones work?", "CONTRACT"), ("Change my sign-in email", "ACCOUNT"),
                ("Report a suspicious job", "SAFETY"), ("Invoice question", "OTHER"), ("Profile not showing in search", "BUG"),
                ("Dispute with a client", "CONTRACT"), ("Delete my account", "ACCOUNT")]

    async def ticket(u: str) -> None:
        subj, cat = rnd.choice(subjects)
        t = await call(u, "POST", "/support/tickets", "support tickets",
                       json={"subject": subj, "category": cat, "body": "Hi team, could you help with this? Details below. Thanks!"})
        tid = (t or {}).get("ticket", {}).get("id")
        if tid and rnd.random() < 0.6:
            await call(admin, "POST", f"/admin/support/tickets/{tid}/messages", "staff replies",
                       json={"body": "Thanks for reaching out — we're looking into it and will update you here.", "internal": False})
            if rnd.random() < 0.5:
                await call(admin, "PATCH", f"/admin/support/tickets/{tid}", json={"status": "RESOLVED"})

    await asyncio.gather(*(ticket(u) for u in rnd.sample(members, k=60)))
    # Staff actions: restricted accounts and security events in the console.
    for u in rnd.sample(members, k=6):
        await call(admin, "PATCH", f"/admin/users/{u}/status", "suspended accounts",
                   json={"is_active": False, "reason": rnd.choice(["Spam", "Fraud report confirmed", "Fake profile"])})
    for u in rnd.sample(members, k=3):
        await call(admin, "POST", f"/admin/users/{u}/revoke-sessions", "sessions revoked", json={"reason": "Suspicious sign-in"})
    # Real public job boards into the LOCAL database (fills Job sources in the console).
    await call(admin, "POST", "/jobs/sync", "job board syncs")
    for title, body, sev in (("Scheduled maintenance", "The platform will be read-only on Sunday 02:00–02:30 UTC.", "WARNING"),
                             ("New: Talent matching", "Rank professionals against your job postings with explainable scores.", "INFO")):
        await call(admin, "POST", "/admin/announcements", "announcements", json={"title": title, "body": body, "severity": sev})
    for c in clients.values():
        await c.aclose()
    print("Done:", ", ".join(f"{v} {k}" for k, v in sorted(stats.items())))


async def showcase(email: str) -> None:
    """Make one account look like a heavy real user, so every screen has something on it."""
    users = sql("select id::text, email, full_name from users where email like '%@example.com'")
    for u in users:
        emails[u["id"]] = u["email"]
    me = next(u["id"] for u in users if u["email"] == email)
    others = [u["id"] for u in users if u["id"] != me]
    peers = rnd.sample(others, k=40)
    for p in peers:  # connections (they accept)
        r = await call(me, "POST", "/connections", json={"receiver_id": p})
        if r and r.get("id"):
            await call(p, "PATCH", f"/connections/{r['id']}", "connections", json={"status": "ACCEPTED"})
    for p in rnd.sample(others, k=6):  # pending invitations to accept
        await call(p, "POST", "/connections", "invitations", json={"receiver_id": me})
    lines = [("Hi! Loved your post about remote teams.", "Thanks! Happy to share more."),
             ("Are you free for a quick call this week?", "Sure — Thursday 15:00 works."),
             ("I sent over the contract draft.", "Got it, reviewing today."),
             ("Can you review my PR when you get a chance?", "On it 👍")]
    for p in peers[:15]:
        conv = await call(me, "POST", "/conversations", json={"participant_id": p})
        if conv:
            a, b = rnd.choice(lines)
            await call(p, "POST", f"/conversations/{conv['id']}/messages", json={"content": a})
            await call(me, "POST", f"/conversations/{conv['id']}/messages", "chats", json={"content": b})
    now = datetime.now(UTC).replace(minute=0, second=0, microsecond=0)
    for i, title in enumerate(["Weekly sync", "Design review", "Client demo", "1:1", "Sprint planning", "Interview"]):
        start = now + timedelta(days=i - 1, hours=2 + i)
        await call(me, "POST", "/meetings", "meetings", json={"title": title, "starts_at": start.isoformat(),
                   "ends_at": (start + timedelta(minutes=45)).isoformat(), "participant_ids": rnd.sample(peers, k=3),
                   "agenda": "Progress, blockers, next steps."})
    for kind, title in (("DOC", "Q4 roadmap"), ("DOC", "Hiring plan"), ("SHEET", "Team budget"), ("SHEET", "Pipeline tracker"),
                        ("SLIDES", "All-hands deck"), ("SLIDES", "Client pitch")):
        body = {"kind": kind, "title": title}
        if kind == "SHEET":
            body["content"] = {"cells": {"A1": "Item", "B1": "Q3", "C1": "Q4", "A2": "Salaries", "B2": "120000", "C2": "135000",
                                         "A3": "Tools", "B3": "8000", "C3": "9500", "A4": "Total", "B4": "=SUM(B2:B3)", "C4": "=SUM(C2:C3)"}}
        await call(me, "POST", "/documents", "documents", json=body)
    co = await call(me, "GET", "/companies/me") or await call(me, "POST", "/companies/me", json={
        "name": "Avery Ops Consulting", "industry": "Software", "company_size": "11-50", "location": "Dublin, Ireland",
        "description": "Operations and trust & safety consulting for marketplaces."})
    proj = await call(me, "POST", "/projects", "projects", json={"title": "Marketplace Trust Revamp",
                      "description": "Rebuild moderation tooling and SLAs.", "technologies": ["Python", "React"],
                      "member_ids": peers[:5]})
    if proj:
        sprint = await call(me, "POST", f"/projects/{proj['id']}/sprints", json={"name": "Sprint 4", "goal": "Ship the review queue"})
        for k, (title, st) in enumerate([("Review queue UI", "IN_PROGRESS"), ("SLA timers", "TODO"), ("Appeals flow", "TODO"),
                                         ("Audit export", "REVIEW"), ("Reporter feedback emails", "COMPLETED"), ("Load test", "IN_PROGRESS")]):
            t = await call(me, "POST", "/projects/tasks", "tasks", json={"project_id": proj["id"], "title": title,
                           "priority": rnd.choice(["HIGH", "MEDIUM", "URGENT"]), "assigned_user_id": rnd.choice([me, *peers[:5]]),
                           "estimated_hours": 8})
            if t:
                await call(me, "PATCH", f"/projects/tasks/{t['id']}", json={"status": st, **({"sprint_id": sprint["id"]} if sprint else {})})
                await call(me, "POST", f"/projects/tasks/{t['id']}/ledger", "time entries",
                           json={"duration_minutes": rnd.choice([60, 90, 120]), "description": "Implementation and review"})
        ch = await call(me, "POST", "/channels", json={"kind": "PROJECT", "name": "trust-revamp", "topic": "Daily updates",
                        "project_id": proj["id"], "member_ids": peers[:5]})
        if ch:
            for who in [me, *peers[:4]]:
                await call(who, "POST", f"/channels/{ch['id']}/messages", "channel messages", json={"body": rnd.choice(LOREM)})
    for worker in peers[5:8]:  # contracts as client
        await call(me, "POST", "/contracts", "contracts", json={"worker_id": worker, "title": rnd.choice(["Moderation dashboard",
                   "Data export tool", "Help center redesign"]), "scope_description": "Deliver in three milestones.",
                   "rate_type": "FIXED", "rate_amount": 6000, "currency": "USD",
                   "milestones": [{"title": "Plan", "amount": 1000}, {"title": "Build", "amount": 3500}, {"title": "Handover", "amount": 1500}]})
    owners = sql("select user_id::text id from company_profiles order by random() limit 3")
    for o in owners:  # contracts as freelancer
        c = await call(o["id"], "POST", "/contracts", "contracts", json={"worker_id": me, "title": "Trust & safety audit",
                       "scope_description": "Audit moderation workflows and propose fixes.", "rate_type": "HOURLY",
                       "rate_amount": 95, "currency": "USD", "milestones": [{"title": "Audit", "amount": 2000}]})
        if c:
            await call(me, "POST", f"/contracts/{c['id']}/sign")
            await call(o["id"], "POST", f"/contracts/{c['id']}/sign")
    for title, jt, lo, hi in (("Senior Trust & Safety Analyst", "FULL_TIME", 60000, 85000),
                              ("Moderation tooling (freelance)", "FREELANCE", 3000, 8000),
                              ("Support Operations Lead", "FULL_TIME", 70000, 95000)):
        await call(me, "POST", "/jobs", "job postings", json={
            "title": title, "job_type": jt, "is_remote": True, "location": "Remote", "experience_level": "SENIOR",
            "skills": ["Trust & Safety", "Operations", "SQL"], "budget_min": lo, "budget_max": hi,
            "company_name": (co or {}).get("name") or "Avery Ops Consulting",
            "description": "Help us keep a fast-growing marketplace safe. Fully remote, async-first team."})
    my_tasks = sql(f"select id::text id from project_tasks where assigned_user_id='{me}'")
    for t in my_tasks:
        for _ in range(2):
            await call(me, "POST", f"/projects/tasks/{t['id']}/ledger", "time entries",
                       json={"duration_minutes": rnd.choice([45, 60, 90, 120]), "description": rnd.choice(LOREM)})
    my_skills = ["Operations", "Trust & Safety", "SQL", "Python"]
    for p in peers[:20]:
        await call(p, "POST", "/endorsements", "endorsements", json={"user_id": me, "skill": rnd.choice(my_skills)})
    jobs = sql("select id::text id from job_posts order by random() limit 12")
    for j in jobs[:6]:
        await call(me, "POST", f"/saved-jobs/{j['id']}", "saved jobs")
    for j in jobs[6:]:
        await call(me, "POST", f"/applications/jobs/{j['id']}", "applications", json={"cover_note": "I'd love to help."})
    await call(me, "POST", "/social/posts", "posts", json={"content": "Our new review queue cut moderation time in half. 🚀", "visibility": "PUBLIC"})
    for c in clients.values():
        await c.aclose()
    print(f"Showcase for {email}:", ", ".join(f"{v} {k}" for k, v in sorted(stats.items())))


if __name__ == "__main__":
    if "--showcase" in sys.argv:
        asyncio.run(showcase(sys.argv[sys.argv.index("--showcase") + 1]))
    else:
        asyncio.run(finish() if "--finish" in sys.argv else main())
