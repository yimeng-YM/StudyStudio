from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    host: str
    port: int
    searxng_url: str
    cache_path: Path
    search_cache_ttl_seconds: int
    extract_cache_ttl_seconds: int
    request_timeout_seconds: int
    browser_timeout_seconds: int
    max_download_bytes: int
    enable_browser_fallback: bool
    trust_environment_proxy: bool
    allowed_origins: tuple[str, ...]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    host = os.getenv("STUDYSTUDIO_HOST", "127.0.0.1").strip() or "127.0.0.1"
    port = _env_int("STUDYSTUDIO_PORT", 17890)
    origins = os.getenv(
        "STUDYSTUDIO_ALLOWED_ORIGINS",
        ",".join(
            (
                "http://127.0.0.1:5173",
                "http://localhost:5173",
                f"http://127.0.0.1:{port}",
                f"http://localhost:{port}",
                "https://mengstudystudio.cn",
                "https://www.mengstudystudio.cn",
            )
        ),
    )
    return Settings(
        host=host,
        port=port,
        searxng_url=os.getenv("SEARXNG_URL", "http://127.0.0.1:17891").rstrip("/"),
        cache_path=Path(os.getenv("STUDYSTUDIO_CACHE_PATH", PROJECT_ROOT / "backend" / "data" / "web-cache.sqlite3")),
        search_cache_ttl_seconds=_env_int("STUDYSTUDIO_SEARCH_CACHE_TTL", 300),
        extract_cache_ttl_seconds=_env_int("STUDYSTUDIO_EXTRACT_CACHE_TTL", 86_400),
        request_timeout_seconds=_env_int("STUDYSTUDIO_REQUEST_TIMEOUT", 20),
        browser_timeout_seconds=_env_int("STUDYSTUDIO_BROWSER_TIMEOUT", 30),
        max_download_bytes=_env_int("STUDYSTUDIO_MAX_DOWNLOAD_BYTES", 5 * 1024 * 1024),
        enable_browser_fallback=_env_bool("STUDYSTUDIO_BROWSER_FALLBACK", True),
        trust_environment_proxy=_env_bool("STUDYSTUDIO_TRUST_ENV_PROXY", False),
        allowed_origins=tuple(origin.strip() for origin in origins.split(",") if origin.strip()),
    )
