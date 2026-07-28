from __future__ import annotations

import time

from app.cache import CacheStore


def test_cache_round_trip(tmp_path):
    cache = CacheStore(tmp_path / "cache.sqlite3")
    try:
        cache.set("search", "key", {"answer": 42}, 30)
        assert cache.get("search", "key") == {"answer": 42}
    finally:
        cache.close()


def test_cache_expiry(tmp_path):
    cache = CacheStore(tmp_path / "cache.sqlite3")
    try:
        cache.set("search", "expired", {"stale": True}, 1)
        with cache._lock:  # Force expiry without slowing the test down.
            cache._connection.execute(
                "UPDATE cache_entries SET expires_at = ? WHERE cache_key = ?",
                (time.time() - 1, "expired"),
            )
            cache._connection.commit()
        assert cache.get("search", "expired") is None
    finally:
        cache.close()
