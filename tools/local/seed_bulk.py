"""Fill the LOCAL demo stack with production-scale test data (local only).

~650 members with professional profiles, 520+ companies, 520+ jobs, 520+
freelance projects, 150 projects with tasks, thousands of connections, posts,
communities and chats. Everything goes through the public API of the local
stack (http://localhost:18000) signed in via the local mock auth, so it can
never reach dev or prod. Run after tools/local/up.sh:

    apps/api/.venv/bin/python tools/local/seed_bulk.py
"""

import asyncio
import random
import sys

import httpx

API = "http://localhost:18000/api/v1"
AUTH = "http://localhost:9999/auth/v1"
CODE = "123456"
USERS = 650
COMPANIES = 525
PROJECTS = 150
CONCURRENCY = 24

if not API.startswith("http://localhost"):
    sys.exit("Refusing to seed anything but the local stack.")

rnd = random.Random(42)
FIRST = "Aarav Abebe Ada Aditi Ahmed Aiko Akira Alejandro Alex Amara Amina Ana Andrei Anika Arjun Astrid Ayesha Beatriz Bilal Bruno Camila Carlos Chen Chidi Chloe Daniel Diego Dmitri Elena Elif Emeka Emma Fatima Felix Freya Gabriel Hana Hassan Ines Ivan Jamal Javier Jin Joao Jonas Kai Kemal Kenji Lara Leila Leon Liam Lina Lucas Luca Maya Mei Mohammed Nadia Nikhil Noah Nora Omar Oskar Priya Rafael Ravi Rosa Sara Sofia Sven Tariq Tomas Valentina Wei Yara Yusuf Zara Zoe".split()
LAST = "Adeyemi Agarwal Ali Andersen Bauer Becker Chen Costa Da Silva Dubois Eriksen Fischer Garcia Gupta Haddad Hansen Ivanova Jensen Kaur Kim Kowalski Kumar Larsen Lee Lopez Martin Meyer Mueller Nakamura Nguyen Novak Okafor Olsen Park Patel Petrov Reddy Rossi Santos Schmidt Silva Singh Smith Tanaka Wang Weber Williams Yamamoto Zhang".split()
CITIES = ["Berlin, Germany", "Lisbon, Portugal", "London, UK", "Amsterdam, Netherlands", "Warsaw, Poland",
          "Bengaluru, India", "Lagos, Nigeria", "Nairobi, Kenya", "São Paulo, Brazil", "Mexico City, Mexico",
          "Toronto, Canada", "Austin, USA", "Singapore", "Tokyo, Japan", "Sydney, Australia", "Madrid, Spain",
          "Stockholm, Sweden", "Paris, France", "Dubai, UAE", "Buenos Aires, Argentina"]
ROLES = {
    "Backend Engineer": ["Python", "FastAPI", "PostgreSQL", "Django", "Go", "Kafka", "Redis", "AWS"],
    "Frontend Engineer": ["React", "TypeScript", "Next.js", "CSS", "GraphQL", "Vue.js", "Testing Library"],
    "Full-stack Engineer": ["React", "Node.js", "TypeScript", "PostgreSQL", "Next.js", "Docker"],
    "Data Engineer": ["Python", "Spark", "Airflow", "dbt", "Snowflake", "SQL", "Kafka"],
    "ML Engineer": ["Python", "PyTorch", "LLMs", "MLOps", "Kubernetes", "TensorFlow"],
    "DevOps Engineer": ["Kubernetes", "Terraform", "AWS", "Docker", "CI/CD", "Prometheus"],
    "Mobile Engineer": ["Swift", "Kotlin", "React Native", "Flutter", "iOS", "Android"],
    "Product Designer": ["Figma", "Design Systems", "UX Research", "Prototyping", "Accessibility"],
    "Product Manager": ["Roadmapping", "Analytics", "Discovery", "Stakeholder Management", "SQL"],
    "QA Engineer": ["Playwright", "Cypress", "Test Automation", "Python", "API Testing"],
    "Security Engineer": ["AppSec", "Penetration Testing", "OWASP", "Cloud Security", "Python"],
    "Data Scientist": ["Python", "Statistics", "SQL", "Machine Learning", "Pandas", "Experimentation"],
}
INDUSTRIES = ["Software", "Fintech", "Healthtech", "E-commerce", "Logistics", "EdTech", "Media", "Climate",
              "Cybersecurity", "Gaming", "HR Tech", "PropTech", "Travel", "Marketing", "AI Infrastructure"]
SIZES = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000"]
CO_A = "Blue North Bright Clear Silver Nova Atlas Orbit Pixel Quantum Rapid Summit Terra Vertex Zen Polar Delta Echo Harbor Lumen Maple Nimbus Oak Prism Riverstone Signal Solar Stack Swift Tidal".split()
CO_B = "Labs Systems Works Digital Analytics Cloud Health Pay Logistics AI Studio Robotics Data Networks Commerce Learning Media Security Energy Mobility".split()
LEVELS = ["JUNIOR", "MID", "SENIOR", "LEAD"]
FREELANCE_TITLES = ["Build a {s} MVP", "{s} performance audit", "Migrate our app to {s}", "{s} integration for our CRM",
                    "Design and build a {s} dashboard", "Fix and harden our {s} pipeline", "{s} code review and refactor",
                    "Prototype an AI feature with {s}"]
POSTS = ["Shipped a big release today — proud of this team.", "What's your favourite remote-work ritual?",
         "Hiring! DM me if you know a great {r}.", "Lessons from migrating to {s}: start with observability.",
         "Open to new freelance projects in {s} from next month.", "Async standups changed how we work. Ask me anything.",
         "Tip: write the README before the code.", "Just passed 5 years fully remote. Here's what I learned…",
         "Anyone else at the {s} meetup this week?", "Our {s} migration cut cloud costs by 30%."]

sem = asyncio.Semaphore(CONCURRENCY)
auth_sem = asyncio.Semaphore(4)
stats: dict[str, int] = {}


def count(k: str) -> None:
    stats[k] = stats.get(k, 0) + 1


async def call(c: httpx.AsyncClient, method: str, path: str, **kw):
    async with sem:
        for attempt in range(3):
            try:
                r = await c.request(method, path, **kw)
                if r.status_code == 429:
                    await asyncio.sleep(1 + attempt)
                    continue
                return r.json() if r.status_code < 400 and r.content else None
            except httpx.HTTPError:
                await asyncio.sleep(1)
        return None


async def member(i: int) -> dict | None:
    name = f"{rnd.choice(FIRST)} {rnd.choice(LAST)}"
    email = f"user{i:04d}@example.com"
    s = None
    async with auth_sem:
        async with httpx.AsyncClient(timeout=30) as a:
            for attempt in range(5):
                try:
                    await a.post(f"{AUTH}/otp", json={"email": email, "create_user": True, "data": {"full_name": name}})
                    s = await a.post(f"{AUTH}/verify", json={"email": email, "token": CODE, "type": "email"})
                    break
                except httpx.HTTPError:
                    await asyncio.sleep(1 + attempt)
    if s is None or s.status_code != 200:
        return None
    c = httpx.AsyncClient(base_url=API, timeout=60, headers={"Authorization": f"Bearer {s.json()['access_token']}"})
    me = await call(c, "GET", "/auth/me")
    if not me:
        return None
    await call(c, "PATCH", "/auth/me", json={"full_name": name})
    role = rnd.choice(list(ROLES))
    skills = rnd.sample(ROLES[role], k=min(len(ROLES[role]), rnd.randint(3, 6)))
    years = rnd.randint(1, 18)
    level = "Senior " if years > 7 else ""
    await call(c, "POST", "/engineers/me", json={
        "headline": f"{level}{role}" + rnd.choice(["", " · open to work", " · remote only", f" · {skills[0]} specialist"]),
        "primary_role": role, "skills": skills, "years_of_experience": years,
        "location": rnd.choice(CITIES), "availability": rnd.choice(["AVAILABLE", "AVAILABLE", "BUSY", "NOT_AVAILABLE"]),
        "bio": f"{role} with {years} years of experience in {', '.join(skills[:3])}.",
    })
    count("users")
    return {"c": c, "id": me["id"], "name": name, "role": role, "skills": skills}


async def company_and_jobs(u: dict, i: int) -> list[dict]:
    name = f"{rnd.choice(CO_A)} {rnd.choice(CO_B)}" + ("" if i % 3 else f" {i}")
    industry = rnd.choice(INDUSTRIES)
    co = await call(u["c"], "POST", "/companies/me", json={
        "name": name, "industry": industry, "company_size": rnd.choice(SIZES), "location": rnd.choice(CITIES),
        "website": f"https://example.com/{name.lower().replace(' ', '-')}",
        "description": f"{name} is a remote-first {industry.lower()} company building products used worldwide.",
        "tech_stack": rnd.sample(sum(ROLES.values(), []), k=5), "hiring_status": "HIRING",
    })
    if not co:
        return []
    count("companies")
    jobs = []
    role = rnd.choice(list(ROLES))
    skills = rnd.sample(ROLES[role], k=min(4, len(ROLES[role])))
    lvl = rnd.choice(LEVELS)
    j = await call(u["c"], "POST", "/jobs", json={
        "title": f"{lvl.title()} {role}", "company_name": name, "is_remote": True, "location": "Remote",
        "job_type": rnd.choice(["FULL_TIME", "FULL_TIME", "PART_TIME", "CONTRACT"]), "experience_level": lvl,
        "skills": skills, "budget_min": rnd.choice([40, 55, 70, 90]) * 1000, "budget_max": rnd.choice([100, 120, 150]) * 1000,
        "description": f"{name} is hiring a {lvl.lower()} {role.lower()} to work with {', '.join(skills)}. "
                       "Fully remote, flexible hours, async-first culture, learning budget and equipment provided.",
    })
    if j:
        jobs.append(j)
        count("jobs")
    s = rnd.choice(sum(ROLES.values(), []))
    f = await call(u["c"], "POST", "/jobs", json={
        "title": rnd.choice(FREELANCE_TITLES).format(s=s), "company_name": name, "is_remote": True, "location": "Remote",
        "job_type": "FREELANCE", "experience_level": rnd.choice(LEVELS), "skills": [s] + rnd.sample(ROLES[rnd.choice(list(ROLES))], k=2),
        "budget_min": rnd.choice([1, 2, 3, 5]) * 1000, "budget_max": rnd.choice([6, 8, 12, 20]) * 1000,
        "timeline": rnd.choice(["2 weeks", "1 month", "6 weeks", "3 months"]),
        "description": f"Freelance project for {name}: {s} expertise needed. Clear scope, milestones and fast feedback.",
    })
    if f:
        jobs.append(f)
        count("freelance projects")
    return jobs


async def main() -> None:
    try:
        httpx.get("http://localhost:18000/health/ready", timeout=5).raise_for_status()
    except Exception:
        sys.exit("The local API isn't up — run tools/local/up.sh first.")
    print(f"Creating {USERS} members…")
    users = [u for u in await asyncio.gather(*(member(i) for i in range(USERS))) if u]
    print(f"  {len(users)} members")
    owners = users[:COMPANIES]
    print("Creating companies, jobs and freelance projects…")
    alljobs = sum(await asyncio.gather(*(company_and_jobs(u, i) for i, u in enumerate(owners))), [])
    print(f"  {stats.get('companies', 0)} companies, {stats.get('jobs', 0)} jobs, {stats.get('freelance projects', 0)} freelance projects")

    print("Applications, saved jobs, connections, posts…")
    tasks = []
    for u in users:
        for j in rnd.sample(alljobs, k=min(len(alljobs), rnd.randint(0, 4))):
            tasks.append(call(u["c"], "POST", f"/applications/jobs/{j['id']}", json={"cover_note": "I'd love to help — my experience is a strong fit."}))
        for j in rnd.sample(alljobs, k=min(len(alljobs), rnd.randint(0, 3))):
            tasks.append(call(u["c"], "POST", f"/saved-jobs/{j['id']}"))
        tasks.append(call(u["c"], "POST", "/social/posts", json={"content": rnd.choice(POSTS).format(r=u["role"].lower(), s=rnd.choice(u["skills"])), "visibility": "PUBLIC"}))
    await asyncio.gather(*tasks)
    pairs = set()
    for u in users:
        for v in rnd.sample(users, k=8):
            if v is not u and (v["id"], u["id"]) not in pairs:
                pairs.add((u["id"], v["id"]))
    byid = {u["id"]: u for u in users}

    async def connect(a: str, b: str) -> None:
        r = await call(byid[a]["c"], "POST", "/connections", json={"receiver_id": b})
        if r and r.get("id") and rnd.random() < 0.8:
            await call(byid[b]["c"], "PATCH", f"/connections/{r['id']}", json={"status": "ACCEPTED"})
            count("connections")

    await asyncio.gather(*(connect(a, b) for a, b in pairs))
    print(f"  {stats.get('connections', 0)} connections")

    print("Communities, projects and chats…")
    groups = []
    for name, cat in [("Remote Python Engineers", "Engineering"), ("Design Systems Guild", "Design"), ("Data & ML Practitioners", "Data"),
                      ("Freelancers' Lounge", "Careers"), ("DevOps & Platform", "Engineering"), ("Product Leaders", "Product"),
                      ("Women in Tech Remote", "Community"), ("Startup Founders", "Business"), ("Frontend Craft", "Engineering"),
                      ("Security Champions", "Engineering"), ("Remote Managers", "Leadership"), ("Mobile Makers", "Engineering")]:
        owner = rnd.choice(users)
        g = await call(owner["c"], "POST", "/groups", json={"name": name, "description": f"A community for {name.lower()}.", "category": cat})
        if g:
            groups.append(g)
            members = rnd.sample(users, k=40)
            await asyncio.gather(*(call(m["c"], "POST", f"/groups/{g['id']}/join") for m in members))
            await asyncio.gather(*(call(m["c"], "POST", f"/groups/{g['id']}/posts", json={"content": rnd.choice(POSTS).format(r=m["role"].lower(), s=rnd.choice(m["skills"]))}) for m in members[:8]))

    async def project(u: dict, n: int) -> None:
        team = rnd.sample(users, k=4)
        p = await call(u["c"], "POST", "/projects", json={
            "title": rnd.choice(["Customer Portal", "Analytics Platform", "Mobile App", "Payments Revamp", "Data Lake",
                                 "Design System", "AI Assistant", "Onboarding Flow", "Partner API", "Marketing Site"]) + f" {n + 1}",
            "description": "Cross-functional remote project with a clear roadmap.",
            "technologies": rnd.sample(sum(ROLES.values(), []), k=4), "member_ids": [t["id"] for t in team if t is not u],
        })
        if not p:
            return
        count("projects")
        sprint = await call(u["c"], "POST", f"/projects/{p['id']}/sprints", json={"name": "Sprint 1", "goal": "Ship the first milestone"})
        for k in range(rnd.randint(5, 12)):
            t = await call(u["c"], "POST", "/projects/tasks", json={
                "project_id": p["id"], "title": rnd.choice(["Set up CI", "Design API schema", "Build login", "Write tests",
                                                            "Dashboard charts", "Fix flaky test", "Accessibility pass",
                                                            "Performance budget", "Docs page", "Release checklist"]) + f" #{k + 1}",
                "priority": rnd.choice(["LOW", "MEDIUM", "HIGH", "URGENT"]), "assigned_user_id": rnd.choice(team)["id"],
                "estimated_hours": rnd.choice([2, 4, 8, 16]),
            })
            if t and sprint and rnd.random() < 0.6:
                await call(u["c"], "PATCH", f"/projects/tasks/{t['id']}", json={"sprint_id": sprint["id"],
                                                                                "status": rnd.choice(["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"])})

    await asyncio.gather(*(project(u, n) for n, u in enumerate(rnd.sample(users, k=PROJECTS))))

    async def chat(a: dict, b: dict) -> None:
        conv = await call(a["c"], "POST", "/conversations", json={"participant_id": b["id"]})
        if conv:
            await call(a["c"], "POST", f"/conversations/{conv['id']}/messages", json={"content": f"Hi {b['name'].split()[0]}, great to connect!"})
            await call(b["c"], "POST", f"/conversations/{conv['id']}/messages", json={"content": "Likewise — let's talk soon."})
            count("chats")

    await asyncio.gather(*(chat(byid[a], byid[b]) for a, b in rnd.sample(sorted(pairs), k=min(600, len(pairs)))))
    for u in users:
        await u["c"].aclose()
    print("Done:", ", ".join(f"{v} {k}" for k, v in stats.items()))


async def top_up_jobs(target: int = 540) -> None:
    """Add jobs and freelance projects for existing company owners until each passes `target`."""
    global sem
    sem = asyncio.Semaphore(6)  # job creation runs an AI step; keep the local API responsive

    async def owner(i: int) -> dict | None:
        email = f"user{i:04d}@example.com"
        async with httpx.AsyncClient(timeout=30) as a:
            await a.post(f"{AUTH}/otp", json={"email": email, "create_user": False})
            r = await a.post(f"{AUTH}/verify", json={"email": email, "token": CODE, "type": "email"})
        if r.status_code != 200:
            return None
        c = httpx.AsyncClient(base_url=API, timeout=240, headers={"Authorization": f"Bearer {r.json()['access_token']}"})
        return {"c": c, "id": "", "name": email, "role": rnd.choice(list(ROLES)), "skills": []}

    owners = [o for o in await asyncio.gather(*(owner(i) for i in range(COMPANIES))) if o]
    rounds = 0
    while rounds < 3:
        rounds += 1
        await asyncio.gather(*(company_and_jobs_existing(o) for o in owners))
        if await counts_reached(target):
            break
    for o in owners:
        await o["c"].aclose()
    print("Added:", ", ".join(f"{v} {k}" for k, v in stats.items()))


async def counts_reached(target: int) -> bool:
    """True once the local database holds `target` jobs and `target` freelance projects."""
    import subprocess

    def n(where: str) -> int:
        out = subprocess.run(
            ["docker", "exec", "remote-ai-platform-postgres", "psql", "-U", "remote_ai_platform", "-d",
             "remote_ai_platform", "-tAc", f"select count(*) from job_posts where {where}"],
            capture_output=True, text=True,
        ).stdout.strip()
        return int(out or 0)

    return n("job_type <> 'FREELANCE'") >= target and n("job_type = 'FREELANCE'") >= target


async def company_and_jobs_existing(u: dict) -> None:
    co = await call(u["c"], "GET", "/companies/me")
    if not co:
        return
    name = co.get("name") or "Company"
    role = rnd.choice(list(ROLES))
    skills = rnd.sample(ROLES[role], k=min(4, len(ROLES[role])))
    lvl = rnd.choice(LEVELS)
    if await call(u["c"], "POST", "/jobs", json={
        "title": f"{lvl.title()} {role}", "company_name": name, "is_remote": True, "location": "Remote",
        "job_type": rnd.choice(["FULL_TIME", "FULL_TIME", "PART_TIME", "CONTRACT"]), "experience_level": lvl,
        "skills": skills, "budget_min": rnd.choice([40, 55, 70, 90]) * 1000, "budget_max": rnd.choice([100, 120, 150]) * 1000,
        "description": f"{name} is hiring a {lvl.lower()} {role.lower()} to work with {', '.join(skills)}. "
                       "Fully remote, flexible hours, async-first culture, learning budget and equipment provided.",
    }):
        count("jobs")
    sk = rnd.choice(sum(ROLES.values(), []))
    if await call(u["c"], "POST", "/jobs", json={
        "title": rnd.choice(FREELANCE_TITLES).format(s=sk), "company_name": name, "is_remote": True, "location": "Remote",
        "job_type": "FREELANCE", "experience_level": rnd.choice(LEVELS), "skills": [sk],
        "budget_min": rnd.choice([1, 2, 3, 5]) * 1000, "budget_max": rnd.choice([6, 8, 12, 20]) * 1000,
        "timeline": rnd.choice(["2 weeks", "1 month", "6 weeks", "3 months"]),
        "description": f"Freelance project for {name}: {sk} expertise needed. Clear scope, milestones and fast feedback.",
    }):
        count("freelance projects")


if __name__ == "__main__":
    asyncio.run(top_up_jobs() if "--more-jobs" in sys.argv else main())
