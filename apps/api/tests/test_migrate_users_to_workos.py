"""Supabase -> WorkOS user migration tool: dry-run by default, read-only against
Supabase, idempotent and resumable, refuses live WorkOS writes without an
explicit flag, and reports counts without email addresses."""

import json

import httpx
import pytest

from app.ops import migrate_users_to_workos as mig


def sb_user(n: int, **kw) -> dict:
    base = {
        "id": f"00000000-0000-4000-8000-{n:012d}",
        "email": f"Person{n}@Example.com",
        "email_confirmed_at": "2026-01-01T00:00:00Z",
        "created_at": "2026-01-01T00:00:00Z",
        "app_metadata": {"providers": ["email"]},
    }
    base.update(kw)
    return base


class Fake:
    def __init__(self, supabase: list[dict], page_size: int = 2) -> None:
        self.supabase = supabase
        self.page_size = page_size
        self.workos: dict[str, dict] = {}
        self.methods: list[tuple[str, str]] = []
        self.fail_create_for: set[str] = set()

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.methods.append((request.method, request.url.host))
        if request.url.host == "sb.test":
            assert request.method == "GET"  # Supabase is read-only
            assert request.headers["apikey"] == "service-key"
            page = int(request.url.params["page"])
            chunk = self.supabase[(page - 1) * self.page_size : page * self.page_size]
            return httpx.Response(200, json={"users": chunk})
        assert request.url.host == "wos.test"
        if request.method == "GET":
            email = request.url.params["email"]
            match = [u for u in self.workos.values() if u["email"] == email]
            return httpx.Response(200, json={"data": match})
        body = json.loads(request.content)
        if body["email"] in self.fail_create_for:
            return httpx.Response(500)
        uid = f"user_{len(self.workos) + 1:04d}"
        self.workos[uid] = {"id": uid, **body}
        return httpx.Response(201, json={"id": uid})


@pytest.fixture
def env(monkeypatch, tmp_path):
    monkeypatch.setattr(mig, "SUPABASE_PAGE_SIZE", 2)
    monkeypatch.setenv("SUPABASE_URL", "https://sb.test")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "service-key")
    monkeypatch.setenv("WORKOS_API_KEY", "sk_test_abc")
    monkeypatch.setenv("WORKOS_API_URL", "https://wos.test")
    return tmp_path / "state.json"


USERS = [
    sb_user(1),
    sb_user(
        2, app_metadata={"providers": ["email", "google"]}, identities=[{"provider": "google"}]
    ),
    sb_user(3, email_confirmed_at=None),
    sb_user(4, deleted_at="2026-02-01T00:00:00Z"),
    sb_user(5, email=None, app_metadata={"providers": ["phone"]}),
]


@pytest.mark.asyncio
async def test_dry_run_reads_supabase_only_and_counts(env):
    fake = Fake(USERS)
    result = await mig.run(["--state", str(env)], transport=httpx.MockTransport(fake.handler))
    assert result["mode"] == "dry-run"
    assert result["counts"] == {
        "supabase_users": 5,
        "with_email": 3,
        "email_confirmed": 2,
        "email_unconfirmed": 1,
        "skipped_deleted": 1,
        "skipped_no_email": 1,
        "would_import": 3,
    }
    assert result["providers"] == {"email": 4, "google": 1, "phone": 1}
    assert {h for _, h in fake.methods} == {"sb.test"}  # all pages, nothing else
    assert not env.exists()
    assert "@" not in json.dumps(result)


@pytest.mark.asyncio
async def test_check_workos_dry_run_never_writes(env):
    fake = Fake(USERS)
    fake.workos["user_x"] = {"id": "user_x", "email": "person1@example.com"}
    result = await mig.run(
        ["--check-workos", "--state", str(env)], transport=httpx.MockTransport(fake.handler)
    )
    assert result["counts"]["exists_in_workos"] == 1
    assert result["counts"]["would_create"] == 2
    assert ("POST", "wos.test") not in fake.methods


@pytest.mark.asyncio
async def test_apply_imports_idempotently_and_resumes(env):
    fake = Fake(USERS)
    transport = httpx.MockTransport(fake.handler)
    first = await mig.run(["--apply", "--limit", "1", "--state", str(env)], transport=transport)
    assert first["workos_environment"] == "test"
    assert first["counts"]["created"] == 1
    assert first["counts"]["not_reached_limit"] == 2
    second = await mig.run(["--apply", "--state", str(env)], transport=transport)
    assert second["counts"]["already_done_in_state"] == 1
    assert second["counts"]["created"] == 2
    third = await mig.run(["--apply", "--state", str(env)], transport=transport)
    assert third["counts"]["already_done_in_state"] == 3
    assert "created" not in third["counts"]
    # Same result without the state file: existing WorkOS users are skipped.
    env.unlink()
    fourth = await mig.run(["--apply", "--state", str(env)], transport=transport)
    assert fourth["counts"]["exists_in_workos"] == 3
    assert len(fake.workos) == 3
    imported = sorted(fake.workos.values(), key=lambda u: u["external_id"])
    assert [u["email_verified"] for u in imported] == [True, True, False]
    assert imported[0]["email"] == "person1@example.com"
    assert "@" not in env.read_text()


@pytest.mark.asyncio
async def test_failures_are_counted_and_retried_next_run(env):
    fake = Fake(USERS[:1])
    fake.fail_create_for = {"person1@example.com"}
    transport = httpx.MockTransport(fake.handler)
    res = await mig.run(["--apply", "--state", str(env)], transport=transport)
    assert res["counts"]["failed"] == 1
    assert res["counts"]["failed_500"] == 1
    fake.fail_create_for = set()
    res = await mig.run(["--apply", "--state", str(env)], transport=transport)
    assert res["counts"]["created"] == 1


@pytest.mark.asyncio
async def test_live_key_refused_without_flag(env, monkeypatch):
    monkeypatch.setenv("WORKOS_API_KEY", "sk_live_abc")
    fake = Fake(USERS)
    with pytest.raises(mig.MigrationRefusedError, match="allow-production"):
        await mig.run(["--apply", "--state", str(env)], transport=httpx.MockTransport(fake.handler))
    assert fake.methods == []
    res = await mig.run(
        ["--apply", "--allow-production", "--state", str(env)],
        transport=httpx.MockTransport(fake.handler),
    )
    assert res["workos_environment"] == "live"


@pytest.mark.asyncio
async def test_missing_keys_are_refused(env, monkeypatch):
    monkeypatch.delenv("WORKOS_API_KEY")
    with pytest.raises(mig.MigrationRefusedError, match="WORKOS_API_KEY"):
        await mig.run(["--apply"])
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY")
    with pytest.raises(mig.MigrationRefusedError, match="SUPABASE"):
        await mig.run(["--state", str(env)])


@pytest.mark.asyncio
async def test_source_file_and_main(env, tmp_path, monkeypatch, capsys):
    src = tmp_path / "users.json"
    src.write_text(json.dumps({"users": USERS}))
    res = await mig.run(["--source-file", str(src), "--state", str(env)])
    assert res["source"] == "file"
    assert res["counts"]["would_import"] == 3


def test_main_prints_report_and_exit_codes(env, tmp_path, monkeypatch, capsys):
    src = tmp_path / "users.json"
    src.write_text(json.dumps(USERS))
    monkeypatch.setattr("sys.argv", ["x", "--source-file", str(src), "--state", str(env)])
    assert mig.main() == 0
    assert '"would_import": 3' in capsys.readouterr().out
    monkeypatch.setattr("sys.argv", ["x", "--apply", "--source-file", str(src)])
    monkeypatch.setenv("WORKOS_API_KEY", "sk_live_x")
    assert mig.main() == 2


@pytest.mark.asyncio
async def test_conflict_on_create_is_treated_as_existing(env):
    class Racy(Fake):
        def handler(self, request):
            if request.method == "POST":
                self.workos["user_r"] = {"id": "user_r", "email": "person1@example.com"}
                return httpx.Response(409, json={"code": "user_already_exists"})
            return super().handler(request)

    fake = Racy(USERS[:1])
    res = await mig.run(
        ["--apply", "--state", str(env)], transport=httpx.MockTransport(fake.handler)
    )
    assert res["counts"]["exists_in_workos"] == 1


def test_iterables_are_accepted():
    report = asyncio_run(mig.migrate([sb_user(9)], workos=None, apply=False, state_path=None))
    assert report.counts["would_import"] == 1


def asyncio_run(coro):
    import asyncio

    return asyncio.new_event_loop().run_until_complete(coro)
