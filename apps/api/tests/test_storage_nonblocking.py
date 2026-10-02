"""PERF-01: StorageService runs boto3 calls in worker threads, so a slow object
store cannot stall every other request on the event loop."""

import asyncio
import threading
import time
from unittest.mock import MagicMock

import pytest

from app.core import storage


@pytest.mark.asyncio
async def test_upload_and_delete_run_off_the_event_loop(monkeypatch):
    loop_thread = threading.get_ident()
    seen: list[int] = []

    def slow(**kwargs):
        seen.append(threading.get_ident())
        time.sleep(0.2)

    client = MagicMock()
    client.put_object.side_effect = slow
    client.delete_object.side_effect = slow
    monkeypatch.setattr(storage, "ensure_bucket_exists", lambda bucket: None)
    service = storage.StorageService.__new__(storage.StorageService)
    service.client = client

    ticks = 0

    async def ticker():
        nonlocal ticks
        while True:
            await asyncio.sleep(0.01)
            ticks += 1

    t = asyncio.create_task(ticker())
    await service.upload_file("b", "k", b"x")
    assert await service.delete_file("b", "k") is True
    t.cancel()

    assert seen and all(tid != loop_thread for tid in seen)
    assert ticks >= 10  # the loop kept running during the 0.4 s of blocking IO


def test_client_has_bounded_timeouts():
    storage.get_s3_client.cache_clear()
    cfg = storage.get_s3_client().meta.config
    assert cfg.connect_timeout <= 10 and cfg.read_timeout <= 30
    assert cfg.retries["total_max_attempts"] <= 3
