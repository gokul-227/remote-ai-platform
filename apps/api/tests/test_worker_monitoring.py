"""Heartbeat ownership and fail-closed scheduler lock tests."""

import threading
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from app.worker import beat_lock, monitoring


async def test_lock_probe_rejects_invalidated_or_unlocked_session():
    conn = SimpleNamespace(invalidated=True, scalar=AsyncMock(return_value=True))
    with pytest.raises(RuntimeError, match="invalidated"):
        await beat_lock.verify_lock(conn)
    conn.scalar.assert_not_awaited()
    conn.invalidated = False
    conn.scalar.return_value = False
    with pytest.raises(RuntimeError, match="lock lost"):
        await beat_lock.verify_lock(conn)
    conn.scalar.return_value = True
    await beat_lock.verify_lock(conn)
    assert conn.scalar.call_args.args[1] == {
        "high": beat_lock.BEAT_LOCK_KEY >> 32,
        "low": beat_lock.BEAT_LOCK_KEY & 0xFFFFFFFF,
    }


def test_lock_skipped_only_on_non_postgres(monkeypatch):
    monkeypatch.setattr(beat_lock.settings, "DATABASE_URL", "sqlite+aiosqlite://")
    thread = Mock()
    monkeypatch.setattr(beat_lock.threading, "Thread", thread)
    beat_lock.acquire_or_exit()
    thread.assert_not_called()


def test_lock_startup_timeout_exits(monkeypatch):
    monkeypatch.setattr(beat_lock.settings, "DATABASE_URL", "postgresql+asyncpg://unused")
    monkeypatch.setattr(beat_lock.threading, "Thread", Mock())
    with pytest.raises(SystemExit) as exc:
        beat_lock.acquire_or_exit(timeout_seconds=0)
    assert exc.value.code == 2


def test_lock_contention_exits_and_connection_loss_stops_process(monkeypatch):
    monkeypatch.setattr(beat_lock.settings, "DATABASE_URL", "postgresql+asyncpg://unused")
    conn = AsyncMock()
    conn.execute.return_value = SimpleNamespace(scalar_one=lambda: False)
    ctx = AsyncMock()
    ctx.__aenter__.return_value = conn
    engine = SimpleNamespace(connect=Mock(return_value=ctx))
    monkeypatch.setattr(beat_lock, "create_async_engine", Mock(return_value=engine))
    # Run the lock thread inline to make fatal-exit behavior deterministic.
    monkeypatch.setattr(
        beat_lock.threading, "Thread", lambda target, **kw: SimpleNamespace(start=target)
    )
    with pytest.raises(SystemExit) as exc:
        beat_lock.acquire_or_exit()
    assert exc.value.code == 3
    conn.execute.return_value = SimpleNamespace(scalar_one=lambda: True)
    monkeypatch.setattr(beat_lock.asyncio, "sleep", AsyncMock())
    monkeypatch.setattr(beat_lock, "verify_lock", AsyncMock(side_effect=RuntimeError("lost")))
    fatal = Mock(side_effect=SystemExit(4))
    monkeypatch.setattr(beat_lock.os, "_exit", fatal)
    with pytest.raises(SystemExit) as exc:
        beat_lock.acquire_or_exit()
    assert exc.value.code == 4
    fatal.assert_called_once_with(4)


def test_monitor_repeats_even_after_failure_and_stops(monkeypatch):
    write = AsyncMock(side_effect=[RuntimeError("database down"), None])
    monkeypatch.setattr(monitoring, "write_heartbeat", write)
    stop = SimpleNamespace(is_set=lambda: False, wait=Mock(side_effect=[False, True]))
    monitoring.monitor("worker:actual-process", "worker", ["imports"], stop)
    assert write.await_count == 2
    write.assert_awaited_with("worker:actual-process", "worker", ["imports"])
    assert stop.wait.call_args_list[0].args == (30,)
    done = threading.Event()
    done.set()
    monitoring.monitor("scheduler:stopped", "scheduler", [], done)
    assert write.await_count == 2


def test_signals_start_owner_monitors_not_broker_tasks(monkeypatch):
    from app.worker import celery_app

    start = Mock()
    monkeypatch.setattr(monitoring, "start_monitor", start)
    lock = Mock()
    monkeypatch.setattr(beat_lock, "acquire_or_exit", lock)
    celery_app._acquire_beat_lock()
    lock.assert_called_once()
    start.assert_called_once_with("scheduler")
    sender = SimpleNamespace(task_consumer=SimpleNamespace(queues={"imports": object()}))
    celery_app._worker_ready(sender)
    start.assert_called_with("worker", ["imports"])
    assert not any(
        v["task"] == "tasks.scheduler_heartbeat"
        for v in celery_app.celery_app.conf.beat_schedule.values()
    )


async def test_write_heartbeat_uses_private_engine_real_queues_and_active_count(monkeypatch):
    from celery.worker import state

    engine = SimpleNamespace(dispose=AsyncMock())
    create = Mock(return_value=engine)
    monkeypatch.setattr(monitoring, "create_async_engine", create)
    ctx = AsyncMock()
    db = ctx.__aenter__.return_value
    monkeypatch.setattr(monitoring, "AsyncSession", Mock(return_value=ctx))
    heartbeat = AsyncMock()
    monkeypatch.setattr(
        monitoring, "TaskService", lambda session: SimpleNamespace(heartbeat=heartbeat)
    )
    monkeypatch.setattr(state, "active_requests", {"a", "b"})
    await monitoring.write_heartbeat("worker:pid", "worker", ["imports"])
    heartbeat.assert_awaited_once_with("worker:pid", "worker", ["imports"], active_runs=2)
    engine.dispose.assert_awaited_once()
    assert db is not None
    heartbeat.side_effect = RuntimeError("write failed")
    with pytest.raises(RuntimeError):
        await monitoring.write_heartbeat("scheduler:pid", "scheduler", [])
    assert engine.dispose.await_count == 2


def test_monitor_start_is_idempotent_and_stop_joins(monkeypatch):
    thread = Mock()
    thread.is_alive.return_value = True
    construct = Mock(return_value=thread)
    monkeypatch.setattr(monitoring, "_thread", None)
    monkeypatch.setattr(monitoring.threading, "Thread", construct)
    monitoring.start_monitor("worker", ["default"])
    monitoring.start_monitor("worker", ["default"])
    assert construct.call_count == 1
    assert construct.call_args.kwargs["args"][0].startswith("worker:")
    monitoring.stop_monitor()
    thread.join.assert_called_once_with(timeout=15)


async def test_postgres_lock_contention_release_and_invalidation(monkeypatch):
    """Real session-level ownership; no application rows are read or changed."""
    import os
    import secrets

    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy.pool import NullPool

    url = os.environ.get("TEST_POSTGRES_URL")
    if not url:
        pytest.skip("TEST_POSTGRES_URL not set")
    monkeypatch.setattr(beat_lock, "BEAT_LOCK_KEY", secrets.randbits(60))
    engine = create_async_engine(url, poolclass=NullPool, isolation_level="AUTOCOMMIT")
    try:
        async with engine.connect() as owner, engine.connect() as contender:
            query = text("SELECT pg_try_advisory_lock(:key)")
            params = {"key": beat_lock.BEAT_LOCK_KEY}
            assert await owner.scalar(query, params)
            await beat_lock.verify_lock(owner)
            assert not await contender.scalar(query, params)
            assert await owner.scalar(text("SELECT pg_advisory_unlock(:key)"), params)
            with pytest.raises(RuntimeError, match="lock lost"):
                await beat_lock.verify_lock(owner)
            assert await contender.scalar(query, params)
            await beat_lock.verify_lock(contender)
            await contender.invalidate()
            with pytest.raises(RuntimeError, match="invalidated"):
                await beat_lock.verify_lock(contender)
    finally:
        await engine.dispose()
