"""LIVE Task Dispatch E2E — uber-like flow against running stack."""
import asyncio, os, uuid
import httpx

API = os.getenv("API_URL", "http://localhost:8000")
V1 = f"{API}/api/v1"


async def main():
    suffix = uuid.uuid4().hex[:8]
    eng_email = f"dispatch-eng-{suffix}@example.com"
    comp_email = f"dispatch-comp-{suffix}@example.com"

    async with httpx.AsyncClient(timeout=30) as c:
        # 1. Register engineer + company
        eng = (await c.post(f"{V1}/auth/register", json={
            "email": eng_email, "password": "dispatch-pass-123",
            "full_name": "Dispatch Engineer", "role": "ENGINEER"})).json()
        comp = (await c.post(f"{V1}/auth/register", json={
            "email": comp_email, "password": "dispatch-pass-123",
            "full_name": "Dispatch Co", "role": "COMPANY"})).json()
        eh = {"Authorization": f"Bearer {eng['access_token']}"}
        ch = {"Authorization": f"Bearer {comp['access_token']}"}

        # 2. Engineer profile — public + open to work
        r = await c.post(f"{V1}/engineers/me", headers=eh, json={
            "headline": "Full-stack Engineer", "skills": ["Python", "FastAPI"],
            "is_public": True, "is_open_to_work": True})
        assert r.status_code == 201, f"engineer profile: {r.status_code} {r.text}"
        print("  [ok] Engineer profile created")
        eng_profile_id = r.json()["id"]

        # 3. Company profile
        r = await c.post(f"{V1}/companies/me", headers=ch, json={"name": "Dispatch Labs"})
        assert r.status_code == 201, f"company profile: {r.status_code} {r.text}"
        print("  [ok] Company profile created")

        # 4. Create project
        r = await c.post(f"{V1}/projects", headers=ch, json={
            "title": f"Dispatch Project {suffix}",
            "description": "E2E dispatch lifecycle test.",
            "technologies": ["Python", "FastAPI"]})
        assert r.status_code == 201, f"project: {r.status_code} {r.text}"
        project_id = r.json()["id"]
        print(f"  [ok] Project created {project_id}")

        # 5. Create task
        r = await c.post(f"{V1}/projects/tasks", headers=ch, json={
            "project_id": project_id, "title": "Build dispatch API",
            "description": "Implement the endpoint.",
            "required_skills": ["Python", "FastAPI"]})
        assert r.status_code == 201, f"task: {r.status_code} {r.text}"
        task_id = r.json()["id"]
        print(f"  [ok] Task created {task_id}")

        # 6. Offer to engineer (candidate_id = engineer profile id)
        r = await c.post(f"{V1}/projects/tasks/{task_id}/offers", headers=ch, json={
            "candidate_id": eng_profile_id})
        assert r.status_code == 201, f"offer: {r.status_code} {r.text}"
        offer_id = r.json()["id"]
        assert r.json()["status"] == "OFFERED"
        print(f"  [ok] Offer created {offer_id} (OFFERED)")

        # 7. Engineer accepts
        r = await c.patch(f"{V1}/projects/task-offers/{offer_id}", headers=eh, json={"status": "ACCEPTED"})
        assert r.status_code == 200, f"accept: {r.status_code} {r.text}"
        assert r.json()["status"] == "ACCEPTED"
        print("  [ok] Offer ACCEPTED")

        # 8. Duplicate acceptance must fail (invalid transition guard)
        r = await c.patch(f"{V1}/projects/task-offers/{offer_id}", headers=eh, json={"status": "ACCEPTED"})
        assert r.status_code == 409, f"dup accept: {r.status_code} {r.text}"
        print("  [ok] Duplicate acceptance blocked (409)")

        # 9. Unauthorized submission (company trying to submit) must be blocked
        r = await c.post(f"{V1}/projects/tasks/{task_id}/submissions", headers=ch, json={
            "summary": "evil", "artifact_urls": []})
        assert r.status_code == 403, f"unauth submit: {r.status_code} {r.text}"
        print("  [ok] Unauthorized submission blocked (403)")

        # 10. Engineer submits work v1
        r = await c.post(f"{V1}/projects/tasks/{task_id}/submissions", headers=eh, json={
            "summary": "Initial implementation complete.", "artifact_urls": ["https://example.com/pr"]})
        assert r.status_code == 201, f"submit: {r.status_code} {r.text}"
        sub_id = r.json()["id"]
        assert r.json()["status"] == "SUBMITTED"
        print(f"  [ok] Work submitted v1 {sub_id}")

        # 11. Company requests changes
        r = await c.patch(f"{V1}/projects/submissions/{sub_id}/review", headers=ch, json={
            "status": "CHANGES_REQUESTED", "review_note": "Add tests"})
        assert r.status_code == 200, f"changes: {r.status_code} {r.text}"
        assert r.json()["status"] == "CHANGES_REQUESTED"
        print("  [ok] Changes requested")

        # 12. Engineer resubmits v2
        r = await c.post(f"{V1}/projects/tasks/{task_id}/submissions", headers=eh, json={
            "summary": "Added comprehensive tests.", "artifact_urls": []})
        assert r.status_code == 201, f"resubmit: {r.status_code} {r.text}"
        assert r.json()["version"] == 2
        print(f"  [ok] Work resubmitted v2")

        # 13. Company approves
        r = await c.patch(f"{V1}/projects/submissions/{r.json()['id']}/review", headers=ch, json={
            "status": "APPROVED", "review_note": "Looks good"})
        assert r.status_code == 200, f"approve: {r.status_code} {r.text}"
        assert r.json()["status"] == "APPROVED"
        print("  [ok] Work APPROVED")

        # 14. Task should be COMPLETED
        r = await c.get(f"{V1}/projects/{project_id}/tasks", headers=ch)
        assert r.status_code == 200
        task = next(t for t in r.json() if t["id"] == task_id)
        assert task["status"] == "COMPLETED", f"task status: {task['status']}"
        print("  [ok] Task COMPLETED")

        # 15. Escrow abstraction
        r = await c.post(f"{V1}/projects/{project_id}/payments/escrow", headers=ch, json={
            "amount": 1000, "currency": "USD", "task_id": task_id, "payee_id": eng["user"]["id"]})
        assert r.status_code == 201, f"escrow: {r.status_code} {r.text}"
        payment_id = r.json()["id"]
        print(f"  [ok] Escrow created {payment_id}")

        # 16. Release payment
        r = await c.patch(f"{V1}/projects/payments/{payment_id}/release", headers=ch)
        assert r.status_code == 200, f"release: {r.status_code} {r.text}"
        assert r.json()["status"] in ("RELEASED", "COMPLETED")
        print("  [ok] Escrow released (sandbox ledger)")

        # 17. Verify transaction record
        r = await c.get(f"{V1}/projects/{project_id}/payments", headers=ch)
        assert r.status_code == 200
        assert any(p["id"] == payment_id for p in r.json()), "payment not in history"
        print("  [ok] Payment transaction recorded")

        print("\nTASK DISPATCH E2E PASSED")
        return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))