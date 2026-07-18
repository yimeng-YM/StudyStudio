from __future__ import annotations

import json
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any


class CacheStore:
    """Small persistent JSON cache shared by search and extraction routes."""

    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self._connection = sqlite3.connect(path, check_same_thread=False)
        self._connection.row_factory = sqlite3.Row
        self._lock = threading.RLock()
        with self._lock:
            self._connection.execute("PRAGMA journal_mode=WAL")
            self._connection.execute("PRAGMA synchronous=NORMAL")
            self._connection.execute(
                """
                CREATE TABLE IF NOT EXISTS cache_entries (
                    namespace TEXT NOT NULL,
                    cache_key TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    expires_at REAL NOT NULL,
                    created_at REAL NOT NULL,
                    PRIMARY KEY (namespace, cache_key)
                )
                """
            )
            self._connection.commit()

    def get(self, namespace: str, cache_key: str) -> Any | None:
        now = time.time()
        with self._lock:
            row = self._connection.execute(
                "SELECT payload, expires_at FROM cache_entries WHERE namespace = ? AND cache_key = ?",
                (namespace, cache_key),
            ).fetchone()
            if row is None:
                return None
            if row["expires_at"] <= now:
                self._connection.execute(
                    "DELETE FROM cache_entries WHERE namespace = ? AND cache_key = ?",
                    (namespace, cache_key),
                )
                self._connection.commit()
                return None
            try:
                return json.loads(row["payload"])
            except json.JSONDecodeError:
                self._connection.execute(
                    "DELETE FROM cache_entries WHERE namespace = ? AND cache_key = ?",
                    (namespace, cache_key),
                )
                self._connection.commit()
                return None

    def set(self, namespace: str, cache_key: str, payload: Any, ttl_seconds: int) -> None:
        now = time.time()
        serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        with self._lock:
            self._connection.execute(
                """
                INSERT INTO cache_entries(namespace, cache_key, payload, expires_at, created_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(namespace, cache_key) DO UPDATE SET
                    payload = excluded.payload,
                    expires_at = excluded.expires_at,
                    created_at = excluded.created_at
                """,
                (namespace, cache_key, serialized, now + max(ttl_seconds, 1), now),
            )
            self._connection.commit()

    def purge_expired(self) -> int:
        with self._lock:
            cursor = self._connection.execute("DELETE FROM cache_entries WHERE expires_at <= ?", (time.time(),))
            self._connection.commit()
            return cursor.rowcount

    def close(self) -> None:
        with self._lock:
            self._connection.close()
