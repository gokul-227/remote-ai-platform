"""In-process cache of public job-list pages (PERF-01).

The public list is identical for every visitor, and the API sits an ocean
away from the database, so repeated identical queries are answered from
memory for TTL_SECONDS. Bounded (least recently used entries go first) so
varied queries can't grow memory. Any job change in this process empties
it; other workers catch up within TTL_SECONDS.
"""

import time
from collections import OrderedDict
from typing import Any

from sqlalchemy import event
from sqlalchemy.orm import ORMExecuteState, Session

TTL_SECONDS = 60
MAX_ENTRIES = 256

_entries: OrderedDict[Any, tuple[float, Any]] = OrderedDict()


def get(key: Any) -> Any | None:
    entry = _entries.get(key)
    if entry is None:
        return None
    expires, value = entry
    if expires < time.monotonic():
        _entries.pop(key, None)
        return None
    _entries.move_to_end(key)
    return value


def put(key: Any, value: Any) -> None:
    _entries[key] = (time.monotonic() + TTL_SECONDS, value)
    _entries.move_to_end(key)
    while len(_entries) > MAX_ENTRIES:
        _entries.popitem(last=False)


def clear() -> None:
    _entries.clear()


def _is_job(obj: object) -> bool:
    return type(obj).__name__ == "JobPost"


@event.listens_for(Session, "after_flush")
def _jobs_changed(session: Session, _ctx: object) -> None:
    if any(_is_job(o) for o in (*session.new, *session.dirty, *session.deleted)):
        clear()


@event.listens_for(Session, "do_orm_execute")
def _bulk_job_change(state: ORMExecuteState) -> None:
    # Bulk UPDATE/DELETE statements (e.g. expiring unseen jobs) skip flush events.
    if (state.is_update or state.is_delete) and any(m.class_.__name__ == "JobPost" for m in state.all_mappers):
        clear()
