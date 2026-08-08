import json

from app.core.cache import RedisCache


def test_cache_namespaces_keys_without_collisions():
    first = RedisCache("jobs")
    second = RedisCache("notifications")
    assert first._key("search:abc") == "jobs:search:abc"
    assert second._key("search:abc") == "notifications:search:abc"
    assert json.dumps({"limit": 20}, sort_keys=True) == '{"limit": 20}'
