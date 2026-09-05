"""
Minimal feature-flag system.

Deliberately small: flags are plain booleans sourced from environment
variables through the existing `Settings` object (see `app.core.config`),
following the same `FEATURE_*` naming convention already used there for
`FEATURE_AI_RESUME_PARSING` etc. This module does not add a second way to
parse env vars -- it just gives every flag a short, stable name that code
elsewhere can check without importing `settings` and knowing the exact
attribute, and lets the admin API enumerate all flags generically.

Adding a new flag: add a `FEATURE_<NAME>: bool = False` field to `Settings`
in `app/core/config.py`, then add an entry to `_FLAG_SETTINGS_ATTR` below
mapping a short flag name to that attribute name. New flags should default
to `False` unless the feature they gate is already fully implemented and
safe to run -- see the `FEATURE_TRENDING_SKILLS` / `FEATURE_STALE_MATCH_RECOMPUTE`
comment in config.py for why.

There is no runtime toggle endpoint (flags are read-only at request time,
sourced from process env vars / `.env` only) -- that is an explicit,
separate scope decision, not an oversight.
"""

from app.core.config import settings

# Maps a short flag name (used in code and in the admin API response) to the
# `Settings` attribute that actually holds the value. Looked up fresh on
# every call (not cached) so tests can `monkeypatch.setattr(settings, ...)`
# the same way the rest of the test suite already does for other settings.
_FLAG_SETTINGS_ATTR: dict[str, str] = {
    "trending_skills": "FEATURE_TRENDING_SKILLS",
    "stale_match_recompute": "FEATURE_STALE_MATCH_RECOMPUTE",
    "ai_resume_parsing": "FEATURE_AI_RESUME_PARSING",
    "ai_matching": "FEATURE_AI_MATCHING",
    "job_aggregator": "FEATURE_JOB_AGGREGATOR",
    "keycloak_auth": "FEATURE_KEYCLOAK_AUTH",
}


def is_feature_enabled(flag_name: str) -> bool:
    """Return whether the named feature flag is currently enabled.

    An unknown flag name is treated as disabled (fail closed) rather than
    raising -- a caller checking a flag that isn't registered should behave
    as though the feature doesn't exist, not crash the request.
    """
    attr = _FLAG_SETTINGS_ATTR.get(flag_name)
    if attr is None:
        return False
    return bool(getattr(settings, attr, False))


def get_all_flags() -> dict[str, bool]:
    """Current on/off state of every registered feature flag.

    Computed fresh on each call (not a frozen snapshot) so it always
    reflects the live `settings` values -- used by the admin
    `GET /admin/feature-flags` endpoint.
    """
    return {name: is_feature_enabled(name) for name in _FLAG_SETTINGS_ATTR}


def __getattr__(name: str):
    # Allows `from app.core.feature_flags import FEATURE_FLAGS` for callers
    # that want the dict shape directly. Prefer `get_all_flags()` /
    # `is_feature_enabled()` when the read needs to reflect a value changed
    # after import time (e.g. in tests) -- a `from ... import FEATURE_FLAGS`
    # binds the dict at import time like any other name.
    if name == "FEATURE_FLAGS":
        return get_all_flags()
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
