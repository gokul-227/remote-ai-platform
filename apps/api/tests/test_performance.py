import json

from app.core.cache import RedisCache


def test_cache_namespaces_keys_without_collisions():
    first = RedisCache("jobs")
    second = RedisCache("notifications")
    assert first._key("search:abc").endswith(":jobs:search:abc")
    assert second._key("search:abc").endswith(":notifications:search:abc")
    assert first._key("search:abc") != second._key("search:abc")
    assert json.dumps({"limit": 20}, sort_keys=True) == '{"limit": 20}'
