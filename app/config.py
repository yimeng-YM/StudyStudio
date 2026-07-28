from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path


SERVICE_ROOT = Path(__file__).resolve().parents[1]


def _env_value(name: str, legacy_name: str | None = None) -> str | None:
    raw = os.getenv(name)
    if raw is None and legacy_name:
        raw = os.getenv(legacy_name)
    return raw


def _env_text(name: str, legacy_name: str | None, default: str) -> str:
    raw = _env_value(name, legacy_name)
    return default if raw is None else raw


def _env_int(name: str, legacy_name: str | None, default: int) -> int:
    raw = _env_value(name, legacy_name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_bool(name: str, legacy_name: str | None, default: bool) -> bool:
    raw = _env_value(name, legacy_name)
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
    allowed_hosts: tuple[str, ...]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    host = _env_text("LOCAL_SEARCH_HOST", "STUDYSTUDIO_HOST", "127.0.0.1").strip() or "127.0.0.1"
    port = _env_int("LOCAL_SEARCH_PORT", "STUDYSTUDIO_PORT", 17890)
    origins = _env_text(
        "LOCAL_SEARCH_ALLOWED_ORIGINS",
        "STUDYSTUDIO_ALLOWED_ORIGINS",
        ",".join(
            (
                "http://127.0.0.1:5173",
                "http://localhost:5173",
                f"http://127.0.0.1:{port}",
                f"http://localhost:{port}",
            )
        ),
    )
    additional_origins = _env_text("LOCAL_SEARCH_ADDITIONAL_ORIGINS", None, "")
    origin_values = f"{origins},{additional_origins}"
    allowed_hosts = _env_text(
        "LOCAL_SEARCH_ALLOWED_HOSTS",
        None,
        "127.0.0.1,localhost,[::1],testserver",
    )
    searxng_port = _env_int("SEARXNG_PORT", None, 17891)
    return Settings(
        host=host,
        port=port,
        searxng_url=_env_text("SEARXNG_URL", None, f"http://127.0.0.1:{searxng_port}").rstrip("/"),
        cache_path=Path(
            _env_text(
                "LOCAL_SEARCH_CACHE_PATH",
                "STUDYSTUDIO_CACHE_PATH",
                str(SERVICE_ROOT / "data" / "web-cache.sqlite3"),
            )
        ).expanduser(),
        search_cache_ttl_seconds=_env_int(
            "LOCAL_SEARCH_CACHE_TTL",
            "STUDYSTUDIO_SEARCH_CACHE_TTL",
            300,
        ),
        extract_cache_ttl_seconds=_env_int(
            "LOCAL_EXTRACT_CACHE_TTL",
            "STUDYSTUDIO_EXTRACT_CACHE_TTL",
            86_400,
        ),
        request_timeout_seconds=_env_int(
            "LOCAL_SEARCH_REQUEST_TIMEOUT",
            "STUDYSTUDIO_REQUEST_TIMEOUT",
            20,
        ),
        browser_timeout_seconds=_env_int(
            "LOCAL_SEARCH_BROWSER_TIMEOUT",
            "STUDYSTUDIO_BROWSER_TIMEOUT",
            30,
        ),
        max_download_bytes=_env_int(
            "LOCAL_SEARCH_MAX_DOWNLOAD_BYTES",
            "STUDYSTUDIO_MAX_DOWNLOAD_BYTES",
            5 * 1024 * 1024,
        ),
        enable_browser_fallback=_env_bool(
            "LOCAL_SEARCH_BROWSER_FALLBACK",
            "STUDYSTUDIO_BROWSER_FALLBACK",
            True,
        ),
        trust_environment_proxy=_env_bool(
            "LOCAL_SEARCH_TRUST_ENV_PROXY",
            "STUDYSTUDIO_TRUST_ENV_PROXY",
            False,
        ),
        allowed_origins=tuple(
            dict.fromkeys(origin.strip() for origin in origin_values.split(",") if origin.strip())
        ),
        allowed_hosts=tuple(item.strip() for item in allowed_hosts.split(",") if item.strip()),
    )
